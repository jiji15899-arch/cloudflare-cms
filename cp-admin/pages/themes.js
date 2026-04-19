/**
 * CloudPress Admin - 테마
 * Replaces WordPress wp-admin/themes.php
 *
 * [v3.0 수정]
 * - 이슈 2: WordPress.org 테마 API 크롤링 → 검색/설치/활성화 UI
 *
 * @package CloudPress
 */

import { renderAdminShell } from '../admin-shell.js';
import { getThemes, switchTheme } from '../../cp-includes/theme-loader.js';
import { getOption, updateOption } from '../../cp-includes/option.js';

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// WordPress.org 테마 API 검색
async function searchWpOrgThemes(query, page = 1) {
  try {
    const url = `https://api.wordpress.org/themes/info/1.2/?action=query_themes&request[search]=${encodeURIComponent(query)}&request[page]=${page}&request[per_page]=12&request[fields][screenshot_url]=true&request[fields][description]=true&request[fields][active_installs]=true`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CloudPress/3.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) { return null; }
}

async function getFeaturedThemes() {
  try {
    const url = `https://api.wordpress.org/themes/info/1.2/?action=query_themes&request[browse]=popular&request[per_page]=12&request[fields][screenshot_url]=true&request[fields][description]=true&request[fields][active_installs]=true`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CloudPress/3.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) { return null; }
}

async function getInstalledThemes(cp) {
  try {
    const raw = await cp.kv.get('cp:themes:list', { type: 'json' });
    return Array.isArray(raw) ? raw : [];
  } catch (_) { return []; }
}

export async function handleThemes(request, cp) {
  const url    = new URL(request.url);
  const method = request.method.toUpperCase();
  const tab    = url.searchParams.get('tab') || 'installed';
  let notice   = null;

  if (method === 'POST') {
    const fd     = await request.formData().catch(() => new FormData());
    const action = fd.get('action') || '';
    const slug   = (fd.get('theme') || '').trim();

    if (action === 'activate' && slug) {
      await switchTheme(cp, slug);
      notice = { type: 'success', message: `테마 "${esc(slug)}"이 활성화되었습니다.` };
    }

    if (action === 'delete' && slug) {
      const themes  = await getInstalledThemes(cp);
      const updated = themes.filter(t => t.slug !== slug);
      await cp.kv.put('cp:themes:list', JSON.stringify(updated)).catch(() => {});
      // 활성 테마를 삭제하면 기본으로 초기화
      const activeSlug = await getOption(cp, 'template', '').catch(() => '');
      if (activeSlug === slug) {
        await updateOption(cp, 'template', '');
        await updateOption(cp, 'stylesheet', '');
      }
      notice = { type: 'success', message: `테마 "${esc(slug)}"이 삭제되었습니다.` };
    }

    if (action === 'install_wporg') {
      const themeSlug  = (fd.get('theme_slug') || '').trim();
      const themeName  = (fd.get('theme_name') || themeSlug).trim();
      const themeDesc  = (fd.get('theme_desc') || '').trim();
      const themeVer   = (fd.get('theme_version') || '').trim();
      const themeShot  = (fd.get('theme_screenshot') || '').trim();
      if (themeSlug) {
        const themes = await getInstalledThemes(cp);
        if (!themes.find(t => t.slug === themeSlug)) {
          themes.push({
            slug: themeSlug,
            name: themeName,
            description: themeDesc,
            version: themeVer || '1.0.0',
            screenshot_url: themeShot,
            source: 'wporg',
          });
          await cp.kv.put('cp:themes:list', JSON.stringify(themes)).catch(() => {});
          notice = { type: 'success', message: `"${esc(themeName)}" 테마가 설치되었습니다. 활성화 버튼으로 적용하세요.` };
        } else {
          notice = { type: 'info', message: '이미 설치된 테마입니다.' };
        }
      }
    }

    if (action === 'install_builtin') {
      const builtinSlug = 'cloudpress-default';
      await updateOption(cp, 'template', builtinSlug);
      await updateOption(cp, 'stylesheet', builtinSlug);
      const meta = { name: 'CloudPress Default', version: '1.0.0', description: 'CloudPress 기본 테마.', author: 'CloudPress', source: 'builtin' };
      const themes = await getInstalledThemes(cp);
      if (!themes.find(t => t.slug === builtinSlug)) {
        themes.push({ slug: builtinSlug, ...meta });
        await cp.kv.put('cp:themes:list', JSON.stringify(themes)).catch(() => {});
      }
      await cp.kv.put(`cp:theme:meta:${builtinSlug}`, JSON.stringify(meta)).catch(() => {});
      notice = { type: 'success', message: '기본 테마가 설치 및 활성화되었습니다.' };
    }
  }

  if (tab === 'add') {
    return renderAddThemePage(request, cp, notice);
  }
  return renderInstalledThemesPage(request, cp, notice);
}

// ── 설치된 테마 페이지 ────────────────────────────────────────────────────

async function renderInstalledThemesPage(request, cp, notice) {
  const themes     = await getInstalledThemes(cp);
  const activeSlug = await getOption(cp, 'template', '').catch(() => '');

  const themeCards = themes.length
    ? themes.map(t => {
        const isActive = t.slug === activeSlug;
        const shot = t.screenshot_url || '';
        return `
<div class="cp-theme-card ${isActive ? 'cp-theme-active' : ''}">
  ${isActive ? '<div class="cp-theme-active-badge">현재 테마</div>' : ''}
  <div class="cp-theme-screenshot">
    ${shot
      ? `<img src="${esc(shot)}" alt="${esc(t.name)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=cp-theme-no-shot>🎨</div>'">`
      : '<div class="cp-theme-no-shot">🎨</div>'}
  </div>
  <div class="cp-theme-card-body">
    <h3>${esc(t.name || t.slug)}</h3>
    <p>${esc((t.description || '').slice(0, 100))}${(t.description||'').length > 100 ? '…' : ''}</p>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px">
      <span style="font-size:12px;color:#646970">v${esc(t.version || '1.0.0')}</span>
      ${t.source === 'wporg' ? '<span style="background:#f0f0f1;color:#646970;border-radius:3px;padding:1px 6px;font-size:11px">WP.org</span>' : ''}
      ${!isActive ? `
      <form method="post" style="margin-left:auto">
        <input type="hidden" name="action" value="activate">
        <input type="hidden" name="theme" value="${esc(t.slug)}">
        <button type="submit" class="cp-btn" style="font-size:12px;padding:5px 10px">활성화</button>
      </form>
      <form method="post" onsubmit="return confirm('테마를 삭제하시겠습니까?')">
        <input type="hidden" name="action" value="delete">
        <input type="hidden" name="theme" value="${esc(t.slug)}">
        <button type="submit" class="cp-btn cp-btn-danger" style="font-size:12px;padding:5px 10px">삭제</button>
      </form>` : '<span style="color:#00a32a;font-weight:600;font-size:13px;margin-left:auto">✓ 활성화됨</span>'}
    </div>
  </div>
</div>`;
      }).join('')
    : `<div class="cp-theme-card" style="grid-column:1/-1;text-align:center;padding:2rem">
        <p style="color:#646970;margin:0 0 12px">설치된 테마가 없습니다.</p>
        <div style="display:flex;gap:10px;justify-content:center">
          <a href="/cp-admin/themes?tab=add" class="cp-btn">새 테마 추가</a>
          <form method="post">
            <input type="hidden" name="action" value="install_builtin">
            <button type="submit" class="cp-btn cp-btn-secondary">기본 테마 설치</button>
          </form>
        </div>
       </div>`;

  const content = `
<style>
.cp-themes-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px;margin-bottom:24px}
.cp-theme-card{background:#fff;border:1px solid var(--cp-border);border-radius:6px;overflow:hidden;box-shadow:var(--cp-shadow);position:relative;transition:.15s}
.cp-theme-card:hover{box-shadow:0 4px 12px rgba(0,0,0,.12)}
.cp-theme-active{border-color:#2271b1;border-width:2px}
.cp-theme-active-badge{position:absolute;top:10px;right:10px;background:#2271b1;color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;z-index:2}
.cp-theme-screenshot{height:160px;overflow:hidden;background:#f0f0f1;display:flex;align-items:center;justify-content:center}
.cp-theme-screenshot img{width:100%;height:100%;object-fit:cover}
.cp-theme-no-shot{font-size:3rem;color:#c3c4c7}
.cp-theme-card-body{padding:14px}
.cp-theme-card-body h3{margin:0 0 6px;font-size:14px;font-weight:700;color:#1d2327}
.cp-theme-card-body p{margin:0;font-size:12.5px;color:#646970;line-height:1.5}
</style>

<div class="cp-page-header" style="margin-bottom:16px">
  <div style="display:flex;gap:0;border:1px solid var(--cp-border);border-radius:4px;overflow:hidden">
    <a href="/cp-admin/themes" style="padding:6px 14px;font-size:13px;background:#fff;color:#1d2327;text-decoration:none;border-right:1px solid var(--cp-border);font-weight:600">설치된 테마</a>
    <a href="/cp-admin/themes?tab=add" style="padding:6px 14px;font-size:13px;background:#f0f0f1;color:#646970;text-decoration:none">새 테마 추가</a>
  </div>
  <a href="/cp-admin/themes?tab=add" class="cp-btn">&#43; 새 테마 추가</a>
</div>

<div class="cp-themes-grid">${themeCards}</div>`;

  return new Response(
    await renderAdminShell(cp, content, { title: '테마', notices: notice ? [notice] : [] }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

// ── 새 테마 추가 페이지 ────────────────────────────────────────────────────

async function renderAddThemePage(request, cp, notice) {
  const url         = new URL(request.url);
  const searchQuery = url.searchParams.get('s') || '';

  let wporgData   = null;
  let isSearching = false;

  if (searchQuery) {
    isSearching = true;
    wporgData   = await searchWpOrgThemes(searchQuery);
  } else {
    wporgData   = await getFeaturedThemes();
  }

  const themes = wporgData?.themes || [];

  const themeCards = themes.map(t => {
    const shot     = t.screenshot_url || '';
    const installs = t.active_installs ? formatInstalls(t.active_installs) : '';
    const rating   = t.rating ? Math.round(t.rating / 20) : 0;
    const stars    = '★'.repeat(rating) + '☆'.repeat(5 - rating);
    const desc     = (t.description || '').replace(/<[^>]+>/g, '').slice(0, 100);

    return `
<div class="cp-theme-card">
  <div class="cp-theme-screenshot">
    ${shot ? `<img src="${esc(shot)}" alt="${esc(t.name)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=cp-theme-no-shot>🎨</div>'">` : '<div class="cp-theme-no-shot">🎨</div>'}
  </div>
  <div class="cp-theme-card-body">
    <h3>${esc(t.name || t.slug)}</h3>
    <p>${esc(desc)}${desc.length >= 100 ? '…' : ''}</p>
    <div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap">
      <span style="font-size:11px;color:#f0b429">${stars}</span>
      <span style="font-size:11px;color:#646970">v${esc(t.version || '?')}</span>
      ${installs ? `<span style="font-size:11px;color:#646970">&#128100; ${esc(installs)}+</span>` : ''}
      <form method="post" style="margin-left:auto">
        <input type="hidden" name="action" value="install_wporg">
        <input type="hidden" name="theme_slug" value="${esc(t.slug)}">
        <input type="hidden" name="theme_name" value="${esc(t.name||t.slug)}">
        <input type="hidden" name="theme_desc" value="${esc(desc)}">
        <input type="hidden" name="theme_version" value="${esc(t.version||'')}">
        <input type="hidden" name="theme_screenshot" value="${esc(shot)}">
        <button type="submit" class="cp-btn" style="font-size:12px;padding:5px 10px">설치</button>
      </form>
    </div>
  </div>
</div>`;
  }).join('');

  const content = `
<style>
.cp-themes-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:18px;margin-bottom:24px}
.cp-theme-card{background:#fff;border:1px solid var(--cp-border);border-radius:6px;overflow:hidden;box-shadow:var(--cp-shadow);transition:.15s}
.cp-theme-card:hover{box-shadow:0 4px 12px rgba(0,0,0,.12)}
.cp-theme-screenshot{height:150px;overflow:hidden;background:#f0f0f1;display:flex;align-items:center;justify-content:center}
.cp-theme-screenshot img{width:100%;height:100%;object-fit:cover}
.cp-theme-no-shot{font-size:3rem;color:#c3c4c7}
.cp-theme-card-body{padding:14px}
.cp-theme-card-body h3{margin:0 0 5px;font-size:14px;font-weight:700;color:#1d2327}
.cp-theme-card-body p{margin:0;font-size:12px;color:#646970;line-height:1.5}
</style>

<div class="cp-page-header" style="margin-bottom:16px">
  <div style="display:flex;gap:0;border:1px solid var(--cp-border);border-radius:4px;overflow:hidden">
    <a href="/cp-admin/themes" style="padding:6px 14px;font-size:13px;background:#f0f0f1;color:#646970;text-decoration:none;border-right:1px solid var(--cp-border)">설치된 테마</a>
    <a href="/cp-admin/themes?tab=add" style="padding:6px 14px;font-size:13px;background:#fff;color:#1d2327;text-decoration:none;font-weight:600">새 테마 추가</a>
  </div>
</div>

<form method="get" action="/cp-admin/themes" style="display:flex;gap:10px;margin-bottom:24px;align-items:center">
  <input type="hidden" name="tab" value="add">
  <input type="text" name="s" placeholder="테마 검색… (예: portfolio, blog, magazine)" value="${esc(searchQuery)}"
         style="flex:1;max-width:420px;padding:9px 14px;border:1px solid var(--cp-border);border-radius:4px;font-size:14px" autofocus>
  <button type="submit" class="cp-btn">검색</button>
  ${searchQuery ? `<a href="/cp-admin/themes?tab=add" class="cp-btn cp-btn-secondary">초기화</a>` : ''}
</form>

<h2 style="font-size:16px;margin:0 0 16px;font-weight:600;color:#1d2327">
  ${isSearching ? `"${esc(searchQuery)}" 검색 결과 (${(wporgData?.info?.results || themes.length).toLocaleString()}개)` : '추천 테마'}
  <span style="font-size:12px;font-weight:400;color:#646970;margin-left:8px">WordPress.org</span>
</h2>

${themes.length > 0
  ? `<div class="cp-themes-grid">${themeCards}</div>`
  : `<div style="text-align:center;padding:3rem 0;color:#646970">
      <div style="font-size:2.5rem;margin-bottom:1rem">🎨</div>
      <p>${isSearching ? `"${esc(searchQuery)}"에 해당하는 테마가 없습니다.` : 'WordPress.org 테마 목록을 불러올 수 없습니다.'}</p>
    </div>`
}`;

  return new Response(
    await renderAdminShell(cp, content, { title: '새 테마 추가', notices: notice ? [notice] : [] }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

function formatInstalls(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(0) + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(0) + 'K';
  return String(n);
}
