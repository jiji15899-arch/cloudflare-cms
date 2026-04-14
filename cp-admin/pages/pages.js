/**
 * CloudPress Admin – Pages
 * Replaces WordPress wp-admin/edit.php?post_type=page
 *
 * @package CloudPress
 */

import { renderAdminShell } from '../admin-shell.js';

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export async function handlePages(request, cp) {
  const prefix = cp.db_prefix || 'cp_';
  const url    = new URL(request.url);
  const method = request.method.toUpperCase();
  let notice   = null;

  // Delete action
  if (method === 'POST') {
    const fd     = await request.formData().catch(() => new FormData());
    const action = fd.get('action') || '';
    const id     = parseInt(fd.get('post_id') || 0);

    if (action === 'trash' && id) {
      await cp.db.prepare(
        `UPDATE ${prefix}posts SET post_status='trash' WHERE ID=? AND post_type='page'`
      ).bind(id).run();
      notice = { type: 'success', message: 'Page moved to Trash.' };
    }
    if (action === 'restore' && id) {
      await cp.db.prepare(
        `UPDATE ${prefix}posts SET post_status='draft' WHERE ID=? AND post_type='page'`
      ).bind(id).run();
      notice = { type: 'success', message: 'Page restored.' };
    }
    if (action === 'delete' && id) {
      await cp.db.prepare(`DELETE FROM ${prefix}posts WHERE ID=? AND post_type='page'`).bind(id).run();
      notice = { type: 'success', message: 'Page permanently deleted.' };
    }
  }

  const status = url.searchParams.get('status') || 'any';
  const search = (url.searchParams.get('s') || '').trim();
  const page   = Math.max(1, parseInt(url.searchParams.get('paged') || 1));
  const limit  = 20;
  const offset = (page - 1) * limit;

  const conditions = [`post_type='page'`];
  const params     = [];

  if (status !== 'any') { conditions.push(`post_status=?`); params.push(status); }
  else { conditions.push(`post_status != 'trash'`); }
  if (search) { conditions.push(`post_title LIKE ?`); params.push(`%${search}%`); }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const total = await cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}posts ${where}`)
    .bind(...params).first();
  const rows = await cp.db.prepare(
    `SELECT ID, post_title, post_status, post_date, post_modified, post_author
     FROM ${prefix}posts ${where} ORDER BY post_date DESC LIMIT ? OFFSET ?`
  ).bind(...params, limit, offset).all();

  const pages = rows.results || [];
  const totalPages = Math.ceil((total?.n || 0) / limit);

  const statusTabs = ['any','publish','draft','pending','trash'].map(s => {
    const active = status === s ? ' style="font-weight:bold;border-bottom:2px solid #0073aa"' : '';
    const label  = s === 'any' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1);
    const q      = new URLSearchParams(url.searchParams);
    q.set('status', s); q.delete('paged');
    return `<a href="?${q}"${active}>${esc(label)}</a>`;
  }).join(' | ');

  const rows_html = pages.map(p => `
  <tr>
    <td><strong><a href="/cp-admin/post?post_id=${p.ID}&post_type=page">${esc(p.post_title || '(no title)')}</a></strong>
      <div class="row-actions">
        <a href="/cp-admin/post?post_id=${p.ID}&post_type=page">Edit</a> |
        <form method="post" style="display:inline" onsubmit="return confirm('Move to trash?')">
          <input type="hidden" name="post_id" value="${p.ID}">
          <input type="hidden" name="action" value="trash">
          <button type="submit" class="cp-btn-link">Trash</button>
        </form>
        ${p.post_status === 'publish' ? `| <a href="/${esc(p.ID)}" target="_blank">View</a>` : ''}
      </div>
    </td>
    <td><span class="cp-status cp-status-${esc(p.post_status)}">${esc(p.post_status)}</span></td>
    <td>${esc(new Date(p.post_date).toLocaleDateString('ko-KR'))}</td>
  </tr>`).join('');

  const content = `
<div class="cp-card">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <h1>Pages</h1>
    <a href="/cp-admin/page-new" class="cp-btn">&#43; Add New Page</a>
  </div>
  <div style="margin-bottom:12px">${statusTabs}</div>
  <form method="get" style="margin-bottom:12px;display:flex;gap:8px">
    <input type="hidden" name="status" value="${esc(status)}">
    <input type="text" name="s" value="${esc(search)}" placeholder="Search pages..." style="padding:6px 10px;border:1px solid #ccc;border-radius:4px;flex:1">
    <button type="submit" class="cp-btn cp-btn-secondary">Search</button>
  </form>
  <table class="cp-table">
    <thead><tr><th>Title</th><th>Status</th><th>Date</th></tr></thead>
    <tbody>${rows_html || '<tr><td colspan="3" style="text-align:center;color:#999">No pages found.</td></tr>'}</tbody>
  </table>
  <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
    ${page > 1 ? `<a href="?paged=${page-1}&status=${esc(status)}" class="cp-btn cp-btn-secondary">&laquo; Prev</a>` : ''}
    <span style="line-height:36px;color:#666">Page ${page} of ${totalPages || 1}</span>
    ${page < totalPages ? `<a href="?paged=${page+1}&status=${esc(status)}" class="cp-btn cp-btn-secondary">Next &raquo;</a>` : ''}
  </div>
</div>`;

  return new Response(
    await renderAdminShell(cp, content, { title: 'Pages', notices: notice ? [notice] : [] }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
