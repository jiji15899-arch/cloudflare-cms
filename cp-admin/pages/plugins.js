/**
 * CloudPress Admin – Plugins
 * Replaces WordPress wp-admin/plugins.php
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

export async function handlePlugins(request, cp) {
  const method = request.method.toUpperCase();
  let notice   = null;

  if (method === 'POST') {
    const fd      = await request.formData().catch(() => new FormData());
    const action  = fd.get('action') || '';
    const slug    = (fd.get('plugin') || '').trim();
    const active  = await getActivePlugins(cp);

    if (action === 'activate' && slug && !active.includes(slug)) {
      active.push(slug);
      await cp.kv.put('cp:plugins:active', JSON.stringify(active)).catch(() => {});
      notice = { type: 'success', message: `Plugin "${esc(slug)}" activated.` };
    }
    if (action === 'deactivate' && slug) {
      const updated = active.filter(p => p !== slug);
      await cp.kv.put('cp:plugins:active', JSON.stringify(updated)).catch(() => {});
      notice = { type: 'success', message: `Plugin "${esc(slug)}" deactivated.` };
    }
    if (action === 'delete' && slug) {
      const plugins = await getPlugins(cp);
      const updated = plugins.filter(p => p.slug !== slug);
      await cp.kv.put('cp:plugins:list', JSON.stringify(updated)).catch(() => {});
      const active2 = (await getActivePlugins(cp)).filter(p => p !== slug);
      await cp.kv.put('cp:plugins:active', JSON.stringify(active2)).catch(() => {});
      notice = { type: 'success', message: `Plugin "${esc(slug)}" deleted.` };
    }
    if (action === 'install_github') {
      const repo = (fd.get('github_repo') || '').trim();
      const plugSlug = repo.split('/').pop() || repo;
      if (repo) {
        const plugins = await getPlugins(cp);
        if (!plugins.find(p => p.slug === plugSlug)) {
          plugins.push({ slug: plugSlug, name: plugSlug, github_repo: repo, version: '1.0.0', description: `GitHub: ${repo}` });
          await cp.kv.put('cp:plugins:list', JSON.stringify(plugins)).catch(() => {});
          notice = { type: 'success', message: `Plugin "${esc(plugSlug)}" added from GitHub.` };
        } else {
          notice = { type: 'error', message: 'Plugin already exists.' };
        }
      }
    }
  }

  const plugins = await getPlugins(cp);
  const active  = await getActivePlugins(cp);

  const rows = plugins.map(p => {
    const isActive = active.includes(p.slug);
    return `
  <tr>
    <td>
      <strong>${esc(p.name || p.slug)}</strong>
      <div style="color:#666;font-size:12px;margin-top:2px">${esc(p.description || '')}</div>
      <div class="row-actions" style="margin-top:4px">
        ${isActive
          ? `<form method="post" style="display:inline"><input type="hidden" name="action" value="deactivate"><input type="hidden" name="plugin" value="${esc(p.slug)}"><button type="submit" class="cp-btn-link" style="color:#a00">Deactivate</button></form>`
          : `<form method="post" style="display:inline"><input type="hidden" name="action" value="activate"><input type="hidden" name="plugin" value="${esc(p.slug)}"><button type="submit" class="cp-btn-link">Activate</button></form>`}
        &nbsp;|&nbsp;
        <form method="post" style="display:inline" onsubmit="return confirm('Delete plugin?')">
          <input type="hidden" name="action" value="delete">
          <input type="hidden" name="plugin" value="${esc(p.slug)}">
          <button type="submit" class="cp-btn-link" style="color:#a00">Delete</button>
        </form>
      </div>
    </td>
    <td>v${esc(p.version || '?')}</td>
    <td><span class="cp-status ${isActive ? 'cp-status-publish' : 'cp-status-draft'}">${isActive ? 'Active' : 'Inactive'}</span></td>
    ${p.github_repo ? `<td><a href="https://github.com/${esc(p.github_repo)}" target="_blank" style="font-size:12px">${esc(p.github_repo)}</a></td>` : '<td>—</td>'}
  </tr>`;
  }).join('');

  const content = `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
  <h1>Plugins</h1>
</div>

<details class="cp-card" style="margin-bottom:20px">
  <summary style="cursor:pointer;font-weight:600">&#43; Add Plugin from GitHub</summary>
  <form method="post" style="margin-top:14px;display:flex;gap:10px;align-items:flex-end">
    <div style="flex:1">
      <label style="display:block;margin-bottom:4px;font-weight:500">GitHub Repository (owner/repo)</label>
      <input type="text" name="github_repo" placeholder="e.g. username/my-cloudpress-plugin"
             style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
    </div>
    <input type="hidden" name="action" value="install_github">
    <button type="submit" class="cp-btn">Add Plugin</button>
  </form>
</details>

<div class="cp-card">
  <table class="cp-table">
    <thead><tr><th>Plugin</th><th>Version</th><th>Status</th><th>Source</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:#999;padding:20px">No plugins installed.</td></tr>'}</tbody>
  </table>
</div>`;

  return new Response(
    await renderAdminShell(cp, content, { title: 'Plugins', notices: notice ? [notice] : [] }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
