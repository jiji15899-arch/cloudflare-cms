/**
 * CloudPress Admin - 플러그인 v4.0
 * - 기본 설치 플러그인: rank-math-seo, easy-table-of-contents, gp-premium
 * - WordPress.org API 크롤링으로 플러그인 목록 표시/설치/활성화
 */

import { renderAdminShell } from '../admin-shell.js';
import { getOption, updateOption } from '../../cp-includes/option.js';

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// 기본 설치 플러그인
const DEFAULT_PLUGINS = [
  {
    slug: 'seo-by-rank-math',
    name: 'Rank Math SEO',
    description: 'The most powerful way to get BETTER Rankings. Rank Math is a revolutionary SEO plugin that combines the features of many SEO tools.',
    version: '1.0.220',
    author: 'Rank Math',
    active_installs: 2000000,
    source: 'wporg',
    icon: '📈',
  },
  {
    slug: 'easy-table-of-contents',
    name: '간편한 목차 (Easy Table of Contents)',
    description: 'A user-friendly plugin that allows you to insert a table of contents into your posts, pages and custom post types.',
    version: '2.0.66',
    author: 'Steven A. Zahm',
    active_installs: 400000,
    source: 'wporg',
    icon: '📋',
  },
  {
    slug: 'gp-premium',
    name: 'GP Premium',
    description: 'GP Premium is a premium plugin for GeneratePress that adds a collection of modules to enhance the GeneratePress theme.',
    version: '2.4.0',
    author: 'Tom Usborne',
    active_installs: 300000,
    source: 'wporg',
    icon: '⚡',
  },
];

async function searchWpOrgPlugins(query, page = 1) {
  try {
    const url = `https://api.wordpress.org/plugins/info/1.2/?action=query_plugins&request[search]=${encodeURIComponent(query)}&request[page]=${page}&request[per_page]=24&request[fields][short_description]=true&request[fields][icons]=true&request[fields][active_installs]=true&request[fields][downloaded]=true&request[fields][version]=true&request[fields][rating]=true`;
    const res = await fetch(url, { headers: { 'User-Agent': 'CloudPress/4.0' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) { return null; }
}

async function getFeaturedPlugins() {
  try {
    const url = `https://api.wordpress.org/plugins/info/1.2/?action=query_plugins&request[browse]=popular&request[per_page]=24&request[fields][short_description]=true&request[fields][icons]=true&request[fields][active_installs]=true&request[fields][version]=true&request[fields][rating]=true`;
    const res = await fetch(url, { headers: { 'User-Agent': 'CloudPress/4.0' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) { return null; }
}

async function getPlugins(cp) {
  try {
    const raw = await cp.kv.get('cp:plugins:list', { type: 'json' });
    const stored = Array.isArray(raw) ? raw : [];
    const merged = [...stored];
    for (const dp of DEFAULT_PLUGINS) {
      if (!merged.find(p => p.slug === dp.slug)) merged.unshift(dp);
    }
    return merged;
  } catch (_) { return [...DEFAULT_PLUGINS]; }
}

async function getActivePlugins(cp) {
  try {
    const raw = await cp.kv.get('cp:plugins:active', { type: 'json' });
    return Array.isArray(raw) ? raw : [];
  } catch (_) { return []; }
}

async function ensureDefaultPlugins(cp) {
  try {
    const existing = await cp.kv.get('cp:plugins:list', { type: 'json' }).catch(() => []);
    const list = Array.isArray(existing) ? existing : [];
    let changed = false;
    for (const dp of DEFAULT_PLUGINS) {
      if (!list.find(p => p.slug === dp.slug)) { list.unshift(dp); changed = true; }
    }
    if (changed) await cp.kv.put('cp:plugins:list', JSON.stringify(list)).catch(() => {});

    // 기본 플러그인은 기본 활성화
    const active = await getActivePlugins(cp);
    let activeChanged = false;
    for (const dp of DEFAULT_PLUGINS) {
      if (!active.includes(dp.slug)) { active.push(dp.slug); activeChanged = true; }
    }
    if (activeChanged) {
      await cp.kv.put('cp:plugins:active', JSON.stringify(active)).catch(() => {});
    }
  } catch (_) {}
}

export async function handlePlugins(request, cp) {
  await ensureDefaultPlugins(cp);

  const url    = new URL(request.url);
  const method = request.method.toUpperCase();
  const tab    = url.searchParams.get('tab') || 'installed';
  let notice   = null;

  if (method === 'POST') {
    const fd      = await request.formData().catch(() => new FormData());
    const action  = fd.get('action') || '';
    const slug    = (fd.get('plugin') || '').trim();
    const active  = await getActivePlugins(cp);

    if (action === 'activate' && slug && !active.includes(slug)) {
      active.push(slug);
      await cp.kv.put('cp:plugins:active', JSON.stringify(active)).catch(() => {});
      await syncActivePluginsToDB(cp, active);
      notice = { type: 'success', message: `플러그인 "${esc(slug)}"이 활성화되었습니다.` };
    }
    if (action === 'deactivate' && slug && !DEFAULT_PLUGINS.find(p => p.slug === slug)) {
      const updated = active.filter(p => p !== slug);
      await cp.kv.put('cp:plugins:active', JSON.stringify(updated)).catch(() => {});
      await syncActivePluginsToDB(cp, updated);
      notice = { type: 'success', message: `플러그인 "${esc(slug)}"이 비활성화되었습니다.` };
    }
    if (action === 'delete' && !DEFAULT_PLUGINS.find(p => p.slug === slug)) {
      const plugins = await getPlugins(cp);
      const updated = plugins.filter(p => p.slug !== slug);
      await cp.kv.put('cp:plugins:list', JSON.stringify(updated)).catch(() => {});
      const active2 = (await getActivePlugins(cp)).filter(p => p !== slug);
      await cp.kv.put('cp:plugins:active', JSON.stringify(active2)).catch(() => {});
      notice = { type: 'success', message: `플러그인 "${esc(slug)}"이 삭제되었습니다.` };
    }
    if (action === 'install_wporg') {
      const pluginSlug  = (fd.get('plugin_slug') || '').trim();
      const pluginName  = (fd.get('plugin_name') || pluginSlug).trim();
      const pluginDesc  = (fd.get('plugin_desc') || '').trim();
      const pluginVer   = (fd.get('plugin_version') || '').trim();
      if (pluginSlug) {
        const plugins = await getPlugins(cp);
        if (!plugins.find(p => p.slug === pluginSlug)) {
          plugins.push({ slug: pluginSlug, name: pluginName, description: pluginDesc, version: pluginVer || '1.0.0', source: 'wporg' });
          await cp.kv.put('cp:plugins:list', JSON.stringify(plugins)).catch(() => {});
          notice = { type: 'success', message: `"${esc(pluginName)}" 플러그인이 설치되었습니다. 활성화 버튼으로 적용하세요.` };
        } else {
          notice = { type: 'info', message: '이미 설치된 플러그인입니다.' };
        }
      }
    }
  }

  if (tab === 'add') return renderAddPluginPage(request, cp, notice);
  return renderInstalledPluginsPage(request, cp, notice);
}

async function syncActivePluginsToDB(cp, activeList) {
  try {
    const prefix = cp.db_prefix || 'cp_';
    await cp.db.prepare(
      `INSERT INTO ${prefix}options (option_name, option_value, autoload) VALUES ('active_plugins', ?, 'yes')
       ON CONFLICT(option_name) DO UPDATE SET option_value=excluded.option_value`
    ).bind(JSON.stringify(activeList)).run();
  } catch (_) {}
}

async function renderInstalledPluginsPage(request, cp, notice) {
  const plugins  = await getPlugins(cp);
  const active   = await getActivePlugins(cp);

  const rows = plugins.map(p => {
    const isActive  = active.includes(p.slug);
    const isDefault = DEFAULT_PLUGINS.find(d => d.slug === p.slug);
    const installs  = p.active_installs ? formatInstalls(p.active_installs) : '';
    return `
<tr>
  <td>
    <strong>${esc(p.name || p.slug)}</strong>
    <p style="margin:3px 0 0;font-size:12px;color:#646970">${esc((p.description || '').slice(0, 120))}${(p.description||'').length > 120 ? '…' : ''}</p>
    <div style="display:flex;gap:8px;margin-top:5px;align-items:center">
      ${p.source === 'wporg' ? '<span style="background:#f0f0f1;color:#646970;border-radius:3px;padding:1px 5px;font-size:11px">WP.org</span>' : ''}
      ${isDefault ? '<span style="background:#e8f4fd;color:#2271b1;border-radius:3px;padding:1px 5px;font-size:11px">기본</span>' : ''}
      ${installs ? `<span style="font-size:11px;color:#646970">👤 ${esc(installs)}+ 활성화</span>` : ''}
      <span style="font-size:11px;color:#646970">v${esc(p.version||'?')}</span>
    </div>
  </td>
  <td style="text-align:center">
    <span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;${isActive ? 'background:#edfaef;color:#00a32a' : 'background:#f0f0f1;color:#646970'}">
      ${isActive ? '활성화됨' : '비활성화'}
    </span>
  </td>
  <td style="text-align:right;white-space:nowrap">
    ${!isActive ? `<form method="post" style="display:inline">
      <input type="hidden" name="action" value="activate">
      <input type="hidden" name="plugin" value="${esc(p.slug)}">
      <button type="submit" class="cp-btn" style="font-size:12px;padding:4px 10px">활성화</button>
    </form>` : (!isDefault ? `<form method="post" style="display:inline">
      <input type="hidden" name="action" value="deactivate">
      <input type="hidden" name="plugin" value="${esc(p.slug)}">
      <button type="submit" class="cp-btn cp-btn-secondary" style="font-size:12px;padding:4px 10px">비활성화</button>
    </form>` : '')}
    ${!isDefault ? `<form method="post" style="display:inline;margin-left:4px" onsubmit="return confirm('플러그인을 삭제하시겠습니까?')">
      <input type="hidden" name="action" value="delete">
      <input type="hidden" name="plugin" value="${esc(p.slug)}">
      <button type="submit" class="cp-btn cp-btn-danger" style="font-size:12px;padding:4px 10px">삭제</button>
    </form>` : ''}
  </td>
</tr>`;
  }).join('');

  const content = `
<div class="cp-page-header" style="margin-bottom:16px">
  <div style="display:flex;gap:0;border:1px solid var(--cp-border);border-radius:4px;overflow:hidden">
    <a href="/cp-admin/plugins" style="padding:6px 14px;font-size:13px;background:#fff;color:#1d2327;text-decoration:none;border-right:1px solid var(--cp-border);font-weight:600">설치된 플러그인</a>
    <a href="/cp-admin/plugins?tab=add" style="padding:6px 14px;font-size:13px;background:#f0f0f1;color:#646970;text-decoration:none">새 플러그인 추가</a>
  </div>
  <a href="/cp-admin/plugins?tab=add" class="cp-btn">&#43; 새 플러그인 추가</a>
</div>
<div class="cp-card" style="overflow:hidden">
  <table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="border-bottom:2px solid var(--cp-border)">
        <th style="text-align:left;padding:10px 12px;font-size:13px;color:#1d2327">플러그인</th>
        <th style="text-align:center;padding:10px 12px;font-size:13px;color:#1d2327;width:110px">상태</th>
        <th style="padding:10px 12px;width:180px"></th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="3" style="text-align:center;padding:2rem;color:#646970">설치된 플러그인이 없습니다.</td></tr>`}
    </tbody>
  </table>
</div>`;

  return new Response(
    await renderAdminShell(cp, content, { title: '플러그인', notices: notice ? [notice] : [] }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

async function renderAddPluginPage(request, cp, notice) {
  const url         = new URL(request.url);
  const searchQuery = url.searchParams.get('s') || '';
  let wporgData = null;
  let isSearching = !!searchQuery;
  if (searchQuery) wporgData = await searchWpOrgPlugins(searchQuery);
  else wporgData = await getFeaturedPlugins();

  const plugins = wporgData?.plugins || [];

  const pluginCards = plugins.map(p => {
    const icon     = p.icons?.['1x'] || p.icons?.['2x'] || '';
    const installs = p.active_installs ? formatInstalls(p.active_installs) : '';
    const rating   = p.rating ? Math.round(p.rating / 20) : 0;
    const stars    = '★'.repeat(rating) + '☆'.repeat(5 - rating);
    const desc     = (p.short_description || '').replace(/<[^>]+>/g, '').slice(0, 120);
    return `
<div class="cp-plugin-card">
  <div class="cp-plugin-icon">
    ${icon ? `<img src="${esc(icon)}" alt="${esc(p.name)}" loading="lazy" onerror="this.style.display='none'">` : `<div class="cp-plugin-icon-placeholder">🔌</div>`}
  </div>
  <div class="cp-plugin-card-body">
    <h3>${esc(p.name || p.slug)}</h3>
    <p>${esc(desc)}${desc.length >= 120 ? '…' : ''}</p>
    <div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap">
      <span style="font-size:11px;color:#f0b429">${stars}</span>
      <span style="font-size:11px;color:#646970">v${esc(p.version||'?')}</span>
      ${installs ? `<span style="font-size:11px;color:#646970">👤 ${esc(installs)}+</span>` : ''}
      <form method="post" style="margin-left:auto">
        <input type="hidden" name="action" value="install_wporg">
        <input type="hidden" name="plugin_slug" value="${esc(p.slug)}">
        <input type="hidden" name="plugin_name" value="${esc(p.name||p.slug)}">
        <input type="hidden" name="plugin_desc" value="${esc(desc)}">
        <input type="hidden" name="plugin_version" value="${esc(p.version||'')}">
        <button type="submit" class="cp-btn" style="font-size:12px;padding:5px 10px">설치</button>
      </form>
    </div>
  </div>
</div>`;
  }).join('');

  const content = `
<style>
.cp-plugins-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin-bottom:24px}
.cp-plugin-card{background:#fff;border:1px solid var(--cp-border);border-radius:6px;padding:16px;box-shadow:var(--cp-shadow);display:flex;gap:14px;transition:.15s}
.cp-plugin-card:hover{box-shadow:0 4px 12px rgba(0,0,0,.12)}
.cp-plugin-icon{width:64px;height:64px;flex-shrink:0;background:#f0f0f1;border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.cp-plugin-icon img{width:64px;height:64px;object-fit:cover}
.cp-plugin-icon-placeholder{font-size:2rem}
.cp-plugin-card-body{flex:1;min-width:0}
.cp-plugin-card-body h3{margin:0 0 4px;font-size:14px;font-weight:700;color:#1d2327;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cp-plugin-card-body p{margin:0;font-size:12px;color:#646970;line-height:1.5}
</style>
<div class="cp-page-header" style="margin-bottom:16px">
  <div style="display:flex;gap:0;border:1px solid var(--cp-border);border-radius:4px;overflow:hidden">
    <a href="/cp-admin/plugins" style="padding:6px 14px;font-size:13px;background:#f0f0f1;color:#646970;text-decoration:none;border-right:1px solid var(--cp-border)">설치된 플러그인</a>
    <a href="/cp-admin/plugins?tab=add" style="padding:6px 14px;font-size:13px;background:#fff;color:#1d2327;text-decoration:none;font-weight:600">새 플러그인 추가</a>
  </div>
</div>
<form method="get" action="/cp-admin/plugins" style="display:flex;gap:10px;margin-bottom:24px;align-items:center">
  <input type="hidden" name="tab" value="add">
  <input type="text" name="s" placeholder="플러그인 검색… (예: seo, cache, woocommerce)" value="${esc(searchQuery)}"
         style="flex:1;max-width:420px;padding:9px 14px;border:1px solid var(--cp-border);border-radius:4px;font-size:14px" autofocus>
  <button type="submit" class="cp-btn">검색</button>
  ${searchQuery ? `<a href="/cp-admin/plugins?tab=add" class="cp-btn cp-btn-secondary">초기화</a>` : ''}
</form>
<h2 style="font-size:16px;margin:0 0 16px;font-weight:600;color:#1d2327">
  ${isSearching ? `"${esc(searchQuery)}" 검색 결과 (${(wporgData?.info?.results || plugins.length).toLocaleString()}개)` : '인기 플러그인'}
  <span style="font-size:12px;font-weight:400;color:#646970;margin-left:8px">WordPress.org</span>
</h2>
${plugins.length > 0
  ? `<div class="cp-plugins-grid">${pluginCards}</div>`
  : `<div style="text-align:center;padding:3rem 0;color:#646970">
      <div style="font-size:2.5rem;margin-bottom:1rem">🔌</div>
      <p>${isSearching ? `"${esc(searchQuery)}"에 해당하는 플러그인이 없습니다.` : 'WordPress.org 플러그인 목록을 불러올 수 없습니다.'}</p>
    </div>`}`;

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
