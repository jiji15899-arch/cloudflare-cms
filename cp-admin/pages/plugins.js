/**
 * CloudPress Admin - 플러그인
 * Replaces WordPress wp-admin/plugins.php
 *
 * [v3.0 수정]
 * - 이슈 2: WordPress.org 플러그인 API 크롤링 → 검색/설치/활성화 UI
 * - WP.org API: https://api.wordpress.org/plugins/info/1.2/
 * - 설치: KV에 플러그인 메타 저장 + JS 번들 훅 실행
 *
 * @package CloudPress
 */

import { renderAdminShell } from '../admin-shell.js';
import { getOption, updateOption } from '../../cp-includes/option.js';

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function getPlugins(cp) {
  try {
    const raw = await cp.kv.get('cp:plugins:list', { type: 'json' });
    return Array.isArray(raw) ? raw : [];
  } catch (_) { return []; }
}

async function getActivePlugins(cp) {
  try {
    const raw = await cp.kv.get('cp:plugins:active', { type: 'json' });
    return Array.isArray(raw) ? raw : [];
  } catch (_) { return []; }
}

// WordPress.org 플러그인 API 검색
async function searchWpOrgPlugins(query, page = 1) {
  try {
    const url = `https://api.wordpress.org/plugins/info/1.2/?action=query_plugins&request[search]=${encodeURIComponent(query)}&request[page]=${page}&request[per_page]=12&request[fields][short_description]=true&request[fields][icons]=true&request[fields][active_installs]=true&request[fields][downloaded]=true`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CloudPress/3.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) { return null; }
}

// WordPress.org 인기 플러그인
async function getFeaturedPlugins() {
  try {
    const url = `https://api.wordpress.org/plugins/info/1.2/?action=query_plugins&request[browse]=popular&request[per_page]=12&request[fields][short_description]=true&request[fields][icons]=true&request[fields][active_installs]=true`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CloudPress/3.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) { return null; }
}

export async function handlePlugins(request, cp) {
  const url    = new URL(request.url);
  const method = request.method.toUpperCase();
  const tab    = url.searchParams.get('tab') || 'installed'; // installed | add
  let notice   = null;

  if (method === 'POST') {
    const fd      = await request.formData().catch(() => new FormData());
    const action  = fd.get('action') || '';
    const slug    = (fd.get('plugin') || '').trim();
    const active  = await getActivePlugins(cp);

    if (action === 'activate' && slug && !active.includes(slug)) {
      active.push(slug);
      await cp.kv.put('cp:plugins:active', JSON.stringify(active)).catch(() => {});
      // D1 옵션에도 동기화
      await cp.db.prepare(
        `INSERT INTO ${cp.db_prefix || 'cp_'}options (option_name, option_value, autoload)
         VALUES ('active_plugins', ?, 'yes')
         ON CONFLICT(option_name) DO UPDATE SET option_value=excluded.option_value`
      ).bind(JSON.stringify(active)).run().catch(() => {});
      notice = { type: 'success', message: `플러그인 "${esc(slug)}"이 활성화되었습니다.` };
    }
    if (action === 'deactivate' && slug) {
      const updated = active.filter(p => p !== slug);
      await cp.kv.put('cp:plugins:active', JSON.stringify(updated)).catch(() => {});
      await cp.db.prepare(
        `INSERT INTO ${cp.db_prefix || 'cp_'}options (option_name, option_value, autoload)
         VALUES ('active_plugins', ?, 'yes')
         ON CONFLICT(option_name) DO UPDATE SET option_value=excluded.option_value`
      ).bind(JSON.stringify(updated)).run().catch(() => {});
      notice = { type: 'success', message: `플러그인 "${esc(slug)}"이 비활성화되었습니다.` };
    }
    if (action === 'delete' && slug) {
      const plugins = await getPlugins(cp);
      const updated = plugins.filter(p => p.slug !== slug);
      await cp.kv.put('cp:plugins:list', JSON.stringify(updated)).catch(() => {});
      const active2 = (await getActivePlugins(cp)).filter(p => p !== slug);
      await cp.kv.put('cp:plugins:active', JSON.stringify(active2)).catch(() => {});
      notice = { type: 'success', message: `플러그인 "${esc(slug)}"이 삭제되었습니다.` };
    }
    // WP.org에서 설치
    if (action === 'install_wporg') {
      const plugSlug = (fd.get('plugin_slug') || '').trim();
      const plugName = (fd.get('plugin_name') || plugSlug).trim();
      const plugDesc = (fd.get('plugin_desc') || '').trim();
      const plugVer  = (fd.get('plugin_version') || '').trim();
      const plugUrl  = (fd.get('plugin_url') || '').trim();
      if (plugSlug) {
        const plugins = await getPlugins(cp);
        if (!plugins.find(p => p.slug === plugSlug)) {
          plugins.push({
            slug: plugSlug,
            name: plugName,
            description: plugDesc,
            version: plugVer || '1.0.0',
            source: 'wporg',
            plugin_uri: plugUrl,
          });
          await cp.kv.put('cp:plugins:list', JSON.stringify(plugins)).catch(() => {});
          notice = { type: 'success', message: `"${esc(plugName)}" 플러그인이 설치되었습니다. 활성화하려면 아래에서 활성화 버튼을 클릭하세요.` };
        } else {
          notice = { type: 'info', message: '이미 설치된 플러그인입니다.' };
        }
      }
    }
    // GitHub에서 설치
    if (action === 'install_github') {
      const repo = (fd.get('github_repo') || '').trim();
      const plugSlug = repo.split('/').pop() || repo;
      if (repo) {
        const plugins = await getPlugins(cp);
        if (!plugins.find(p => p.slug === plugSlug)) {
          plugins.push({ slug: plugSlug, name: plugSlug, github_repo: repo, version: '1.0.0', description: `GitHub: ${repo}`, source: 'github' });
          await cp.kv.put('cp:plugins:list', JSON.stringify(plugins)).catch(() => {});
          notice = { type: 'success', message: `GitHub 플러그인 "${esc(plugSlug)}"이 추가되었습니다.` };
        } else {
          notice = { type: 'error', message: '이미 존재하는 플러그인입니다.' };
        }
      }
    }
  }

  // 탭 분기
  if (tab === 'add') {
    return renderAddPluginPage(request, cp, notice);
  }
  return renderInstalledPage(request, cp, notice);
}

// ── 설치된 플러그인 페이지 ─────────────────────────────────────────────────

async function renderInstalledPage(request, cp, notice) {
  const plugins = await getPlugins(cp);
  const active  = await getActivePlugins(cp);

  const rows = plugins.map(p => {
    const isActive = active.includes(p.slug);
    const srcBadge = p.source === 'wporg'
      ? `<span style="background:#f0f0f1;color:#646970;border-radius:3px;padding:1px 6px;font-size:11px;margin-left:6px">WP.org</span>`
      : p.source === 'github'
      ? `<span style="background:#24292e;color:#fff;border-radius:3px;padding:1px 6px;font-size:11px;margin-left:6px">GitHub</span>`
      : '';
    return `
<tr>
  <td>
    <strong>${esc(p.name || p.slug)}</strong>${srcBadge}
    <div style="color:#646970;font-size:12px;margin-top:2px;line-height:1.5">${esc((p.description || '').slice(0,120))}${(p.description||'').length>120?'…':''}</div>
    <div style="margin-top:5px;display:flex;gap:8px;align-items:center">
      <form method="post" style="display:inline">
        <input type="hidden" name="action" value="${isActive ? 'deactivate' : 'activate'}">
        <input type="hidden" name="plugin" value="${esc(p.slug)}">
        <button type="submit" class="cp-btn-link" ${isActive?'style="color:#d63638"':''}>${isActive ? '비활성화' : '활성화'}</button>
      </form>
      <span style="color:#dcdcde">|</span>
      <form method="post" style="display:inline" onsubmit="return confirm('플러그인을 삭제하시겠습니까?')">
        <input type="hidden" name="action" value="delete">
        <input type="hidden" name="plugin" value="${esc(p.slug)}">
        <button type="submit" class="cp-btn-link" style="color:#d63638">삭제</button>
      </form>
      ${p.plugin_uri ? `<span style="color:#dcdcde">|</span><a href="${esc(p.plugin_uri)}" target="_blank" class="cp-btn-link" style="font-size:12px">플러그인 페이지</a>` : ''}
    </div>
  </td>
  <td style="white-space:nowrap">v${esc(p.version || '?')}</td>
  <td><span class="cp-status ${isActive ? 'cp-status-publish' : 'cp-status-draft'}">${isActive ? '활성' : '비활성'}</span></td>
</tr>`;
  }).join('');

  const content = `
<div class="cp-page-header" style="margin-bottom:16px">
  <div style="display:flex;align-items:center;gap:16px">
    <div style="display:flex;gap:0;border:1px solid var(--cp-border);border-radius:4px;overflow:hidden">
      <a href="/cp-admin/plugins" style="padding:6px 14px;font-size:13px;background:#fff;color:#1d2327;text-decoration:none;border-right:1px solid var(--cp-border);font-weight:600">설치된 플러그인</a>
      <a href="/cp-admin/plugins?tab=add" style="padding:6px 14px;font-size:13px;background:#f0f0f1;color:#646970;text-decoration:none">새 플러그인 추가</a>
    </div>
  </div>
  <a href="/cp-admin/plugins?tab=add" class="cp-btn">&#43; 새 플러그인 추가</a>
</div>

<div class="cp-table-wrap">
  <table class="cp-table">
    <thead>
      <tr>
        <th>플러그인</th>
        <th>버전</th>
        <th>상태</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="3" style="text-align:center;color:#999;padding:30px">설치된 플러그인이 없습니다. <a href="/cp-admin/plugins?tab=add">새 플러그인 추가</a></td></tr>'}
    </tbody>
  </table>
</div>`;

  return new Response(
    await renderAdminShell(cp, content, { title: '플러그인', notices: notice ? [notice] : [] }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

// ── 새 플러그인 추가 페이지 (WP.org 크롤링) ──────────────────────────────

async function renderAddPluginPage(request, cp, notice) {
  const url         = new URL(request.url);
  const searchQuery = url.searchParams.get('s') || '';

  let wporgData = null;
  let isSearching = false;

  if (searchQuery) {
    isSearching = true;
    wporgData   = await searchWpOrgPlugins(searchQuery);
  } else {
    wporgData   = await getFeaturedPlugins();
  }

  const plugins = wporgData?.plugins || [];

  const pluginCards = plugins.map(p => {
    const icon       = p.icons?.['1x'] || p.icons?.['2x'] || p.icons?.svg || '';
    const installs   = p.active_installs ? formatInstalls(p.active_installs) : '';
    const rating     = p.rating ? Math.round(p.rating / 20) : 0;
    const stars      = '★'.repeat(rating) + '☆'.repeat(5 - rating);
    const desc       = p.short_description || (p.sections?.description || '').replace(/<[^>]+>/g,'').slice(0, 120);

    return `
<div class="cp-plugin-card">
  <div class="cp-plugin-card-header">
    ${icon ? `<img src="${esc(icon)}" alt="${esc(p.name)}" class="cp-plugin-icon" onerror="this.style.display='none'">` : '<div class="cp-plugin-icon-placeholder">🧩</div>'}
    <div class="cp-plugin-card-meta">
      <h3>${esc(p.name || p.slug)}</h3>
      <div class="cp-plugin-card-rating" title="${p.rating || 0}/100">
        <span style="color:#f0b429">${stars}</span>
        <span style="color:#646970;font-size:12px">(${(p.num_ratings||0).toLocaleString()})</span>
      </div>
    </div>
  </div>
  <p class="cp-plugin-card-desc">${esc(desc)}${desc.length >= 120 ? '…' : ''}</p>
  <div class="cp-plugin-card-footer">
    <div class="cp-plugin-card-info">
      <span>v${esc(p.version || '?')}</span>
      ${installs ? `<span>&#128100; ${esc(installs)}+</span>` : ''}
    </div>
    <form method="post">
      <input type="hidden" name="action" value="install_wporg">
      <input type="hidden" name="plugin_slug" value="${esc(p.slug)}">
      <input type="hidden" name="plugin_name" value="${esc(p.name || p.slug)}">
      <input type="hidden" name="plugin_desc" value="${esc((desc||'').slice(0,200))}">
      <input type="hidden" name="plugin_version" value="${esc(p.version || '')}">
      <input type="hidden" name="plugin_url" value="${esc(p.homepage || `https://wordpress.org/plugins/${p.slug}/`)}">
      <button type="submit" class="cp-btn" style="font-size:12px;padding:5px 12px">지금 설치</button>
    </form>
  </div>
</div>`;
  }).join('');

  const content = `
<div class="cp-page-header" style="margin-bottom:16px">
  <div style="display:flex;align-items:center;gap:16px">
    <div style="display:flex;gap:0;border:1px solid var(--cp-border);border-radius:4px;overflow:hidden">
      <a href="/cp-admin/plugins" style="padding:6px 14px;font-size:13px;background:#f0f0f1;color:#646970;text-decoration:none;border-right:1px solid var(--cp-border)">설치된 플러그인</a>
      <a href="/cp-admin/plugins?tab=add" style="padding:6px 14px;font-size:13px;background:#fff;color:#1d2327;text-decoration:none;font-weight:600">새 플러그인 추가</a>
    </div>
  </div>
</div>

<style>
.cp-plugin-search-bar{display:flex;gap:10px;margin-bottom:24px;align-items:center}
.cp-plugin-search-bar input{flex:1;max-width:420px;padding:9px 14px;border:1px solid var(--cp-border);border-radius:4px;font-size:14px}
.cp-plugin-search-bar input:focus{outline:none;border-color:var(--cp-accent);box-shadow:0 0 0 2px rgba(34,113,177,.15)}
.cp-plugin-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:18px;margin-bottom:28px}
.cp-plugin-card{background:#fff;border:1px solid var(--cp-border);border-radius:6px;padding:16px;display:flex;flex-direction:column;gap:10px;box-shadow:var(--cp-shadow);transition:.15s}
.cp-plugin-card:hover{box-shadow:0 4px 12px rgba(0,0,0,.12)}
.cp-plugin-card-header{display:flex;gap:12px;align-items:flex-start}
.cp-plugin-icon{width:52px;height:52px;border-radius:6px;object-fit:cover;flex-shrink:0}
.cp-plugin-icon-placeholder{width:52px;height:52px;border-radius:6px;background:#f0f0f1;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0}
.cp-plugin-card-meta h3{margin:0 0 4px;font-size:14px;font-weight:700;color:#1d2327;line-height:1.3}
.cp-plugin-card-desc{margin:0;font-size:13px;color:#646970;line-height:1.6;flex:1}
.cp-plugin-card-footer{display:flex;justify-content:space-between;align-items:center;margin-top:auto;padding-top:10px;border-top:1px solid #f0f0f1}
.cp-plugin-card-info{display:flex;gap:10px;font-size:12px;color:#646970}
.cp-github-add{background:#fff;border:1px solid var(--cp-border);border-radius:6px;padding:18px;margin-bottom:20px}
.cp-github-add h3{margin:0 0 12px;font-size:14px;font-weight:600}
.cp-github-add-form{display:flex;gap:10px;align-items:flex-end}
.cp-github-add-form input{flex:1;padding:8px 12px;border:1px solid var(--cp-border);border-radius:4px;font-size:13.5px}
</style>

<!-- 검색바 -->
<form method="get" action="/cp-admin/plugins" class="cp-plugin-search-bar">
  <input type="hidden" name="tab" value="add">
  <input type="text" name="s" placeholder="플러그인 검색… (예: SEO, cache, woocommerce)" value="${esc(searchQuery)}" autofocus>
  <button type="submit" class="cp-btn">검색</button>
  ${searchQuery ? `<a href="/cp-admin/plugins?tab=add" class="cp-btn cp-btn-secondary">초기화</a>` : ''}
</form>

<!-- WP.org 결과 -->
<h2 style="font-size:16px;margin:0 0 16px;font-weight:600;color:#1d2327">
  ${isSearching ? `"${esc(searchQuery)}" 검색 결과 (${(wporgData?.info?.results || plugins.length).toLocaleString()}개)` : '추천 플러그인'}
  <span style="font-size:12px;font-weight:400;color:#646970;margin-left:8px">WordPress.org</span>
</h2>

${plugins.length > 0
  ? `<div class="cp-plugin-grid">${pluginCards}</div>`
  : `<div style="text-align:center;padding:3rem 0;color:#646970">
      <div style="font-size:2.5rem;margin-bottom:1rem">🔍</div>
      <p>${isSearching ? `"${esc(searchQuery)}"에 해당하는 플러그인이 없습니다.` : 'WordPress.org 플러그인 목록을 불러올 수 없습니다.'}</p>
    </div>`
}

<!-- GitHub 플러그인 추가 -->
<div class="cp-github-add">
  <h3>&#128279; GitHub에서 플러그인 추가</h3>
  <p style="color:#646970;font-size:13px;margin:0 0 12px">GitHub 저장소 경로(owner/repo)를 입력하여 CloudPress 플러그인을 추가합니다.</p>
  <form method="post" class="cp-github-add-form">
    <input type="text" name="github_repo" placeholder="예: username/my-cloudpress-plugin">
    <input type="hidden" name="action" value="install_github">
    <button type="submit" class="cp-btn cp-btn-secondary">추가</button>
  </form>
</div>`;

  return new Response(
    await renderAdminShell(cp, content, { title: '새 플러그인 추가', notices: notice ? [notice] : [] }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

function formatInstalls(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(0) + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(0) + 'K';
  return String(n);
}
