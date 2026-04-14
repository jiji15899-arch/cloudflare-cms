/**
 * CloudPress Admin – Themes
 * Replaces WordPress wp-admin/themes.php
 * @package CloudPress
 */

import { renderAdminShell } from '../admin-shell.js';
import { getThemes, switchTheme, getThemeMeta } from '../../cp-includes/theme-loader.js';
import { getOption, updateOption } from '../../cp-includes/option.js';

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export async function handleThemes(request, cp) {
  const method = request.method.toUpperCase();
  let notice   = null;

  if (method === 'POST') {
    const fd     = await request.formData().catch(() => new FormData());
    const action = fd.get('action') || '';
    const slug   = (fd.get('theme') || '').trim();

    if (action === 'activate' && slug) {
      await switchTheme(cp, slug);
      notice = { type: 'success', message: `Theme "${esc(slug)}" activated.` };
    }
    if (action === 'install_builtin') {
      // Install the default built-in theme into KV
      const builtinSlug = 'cloudpress-default';
      await updateOption(cp, 'template', builtinSlug);
      await updateOption(cp, 'stylesheet', builtinSlug);
      const meta = { name: 'CloudPress Default', version: '1.0.0', description: 'The default CloudPress theme.', author: 'CloudPress' };
      await cp.kv.put(`cp:theme:meta:${builtinSlug}`, JSON.stringify(meta)).catch(() => {});
      await cp.kv.put('cp:themes:list', JSON.stringify([{ slug: builtinSlug, ...meta }])).catch(() => {});
      notice = { type: 'success', message: 'Default theme installed and activated.' };
      cp.theme = { slug: builtinSlug, ...meta };
    }
  }

  const themes      = await getThemes(cp);
  const activeSlug  = await getOption(cp, 'template', '').catch(() => '');

  const themeCards = themes.length
    ? themes.map(t => {
        const isActive = t.slug === activeSlug;
        return `
  <div class="cp-card" style="position:relative${isActive ? ';border:2px solid #0073aa' : ''}">
    ${isActive ? '<div style="position:absolute;top:10px;right:10px;background:#0073aa;color:#fff;padding:2px 8px;border-radius:3px;font-size:12px">Active</div>' : ''}
    <h3 style="margin:0 0 6px">${esc(t.name || t.slug)}</h3>
    <p style="color:#666;font-size:13px;margin:0 0 4px">${esc(t.description || '')}</p>
    <p style="color:#999;font-size:12px;margin:0 0 12px">v${esc(t.version || '1.0.0')} by ${esc(t.author || '')}</p>
    ${!isActive ? `
    <form method="post">
      <input type="hidden" name="action" value="activate">
      <input type="hidden" name="theme" value="${esc(t.slug)}">
      <button type="submit" class="cp-btn">Activate</button>
    </form>` : '<span style="color:#0073aa;font-weight:600">Currently Active</span>'}
  </div>`;
      }).join('')
    : `<div class="cp-card" style="grid-column:1/-1;text-align:center;color:#888">
        <p>No themes installed.</p>
        <form method="post">
          <input type="hidden" name="action" value="install_builtin">
          <button type="submit" class="cp-btn">Install Default Theme</button>
        </form>
       </div>`;

  const content = `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
  <h1>Themes</h1>
</div>
<p style="color:#666;margin-bottom:20px">Themes are loaded from GitHub. Set your GitHub repo in <a href="/cp-admin/options-general">General Settings</a>.</p>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px">
  ${themeCards}
</div>`;

  return new Response(
    await renderAdminShell(cp, content, { title: 'Themes', notices: notice ? [notice] : [] }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
