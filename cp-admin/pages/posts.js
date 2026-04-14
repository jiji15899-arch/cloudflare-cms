/**
 * CloudPress Admin - Posts List
 * Replaces WordPress wp-admin/edit.php
 *
 * @package CloudPress
 */

import { renderAdminShell } from '../admin-shell.js';

export async function handlePosts(request, cp, opts = {}) {
  const url       = cp.url;
  const prefix    = cp.config.DB_PREFIX || 'cp_';
  const postType  = opts.post_type || url.searchParams.get('post_type') || 'post';
  const status    = url.searchParams.get('post_status') || 'all';
  const page      = Math.max(1, parseInt(url.searchParams.get('paged') || '1'));
  const perPage   = 20;
  const offset    = (page - 1) * perPage;
  const search    = url.searchParams.get('s') || '';

  const method = request.method.toUpperCase();

  // Handle bulk actions
  if (method === 'POST') {
    const fd = await request.formData().catch(() => new FormData());
    const action  = fd.get('action') || '';
    const postIds = fd.getAll('post[]').map(Number).filter(Boolean);

    if (postIds.length) {
      if (action === 'trash') {
        for (const id of postIds) {
          await cp.db.prepare(`UPDATE ${prefix}posts SET post_status='trash' WHERE ID=?`).bind(id).run();
        }
      } else if (action === 'delete') {
        for (const id of postIds) {
          await cp.db.prepare(`DELETE FROM ${prefix}posts WHERE ID=?`).bind(id).run();
        }
      } else if (action === 'publish') {
        for (const id of postIds) {
          await cp.db.prepare(`UPDATE ${prefix}posts SET post_status='publish' WHERE ID=?`).bind(id).run();
        }
      }
    }
  }

  // Build query
  let whereClauses = [`post_type=?`];
  let params = [postType];

  if (status !== 'all') {
    whereClauses.push(`post_status=?`);
    params.push(status);
  } else {
    whereClauses.push(`post_status != 'auto-draft'`);
  }

  if (search) {
    whereClauses.push(`post_title LIKE ?`);
    params.push(`%${search}%`);
  }

  const whereStr = whereClauses.join(' AND ');

  const [countRow, posts] = await Promise.all([
    cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}posts WHERE ${whereStr}`)
      .bind(...params).first(),
    cp.db.prepare(
      `SELECT p.ID, p.post_title, p.post_status, p.post_date, p.post_author,
              u.display_name as author_name
       FROM ${prefix}posts p
       LEFT JOIN ${prefix}users u ON p.post_author = u.ID
       WHERE ${whereStr}
       ORDER BY p.post_date DESC
       LIMIT ? OFFSET ?`
    ).bind(...params, perPage, offset).all(),
  ]);

  const total     = countRow?.n ?? 0;
  const totalPages = Math.ceil(total / perPage);
  const typeLabel = postType === 'post' ? 'Posts' : 'Pages';
  const newHref   = postType === 'post' ? '/cp-admin/post-new' : '/cp-admin/page-new';

  // Status counts
  const statusCounts = await cp.db.prepare(
    `SELECT post_status, COUNT(*) as n FROM ${prefix}posts WHERE post_type=? GROUP BY post_status`
  ).bind(postType).all();
  const countMap = {};
  (statusCounts.results || []).forEach(r => { countMap[r.post_status] = r.n; });

  const content = `
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
  <div style="display:flex;gap:12px;font-size:13px">
    ${['all','publish','draft','pending','trash'].map(s => {
      const n = s === 'all' ? total : (countMap[s] || 0);
      return `<a href="/cp-admin/edit?post_type=${postType}&post_status=${s}"
                 style="color:${status === s ? '#1d2327' : '#2271b1'};font-weight:${status === s ? '600' : '400'};text-decoration:none">
                ${capitalize(s)} <span style="color:#646970">(${n})</span>
              </a>`;
    }).join(' | ')}
  </div>
  <a href="${newHref}" class="cp-btn">&#43; Add New ${typeLabel.slice(0,-1)}</a>
</div>

<!-- Search -->
<form method="get" style="margin-bottom:14px;display:flex;gap:8px">
  <input type="hidden" name="post_type" value="${esc(postType)}">
  <input type="text" name="s" value="${esc(search)}" placeholder="Search ${typeLabel.toLowerCase()}…"
         class="cp-form-input" style="max-width:280px">
  <button type="submit" class="cp-btn cp-btn-secondary">Search</button>
</form>

<!-- Bulk Actions -->
<form method="post" id="posts-form">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
    <select name="action" class="cp-form-select" style="max-width:160px">
      <option value="">Bulk Actions</option>
      <option value="publish">Publish</option>
      <option value="trash">Move to Trash</option>
      <option value="delete">Delete Permanently</option>
    </select>
    <button type="submit" class="cp-btn cp-btn-secondary">Apply</button>
  </div>

  <div class="cp-table-wrap">
    <table class="cp-table">
      <thead>
        <tr>
          <th style="width:32px"><input type="checkbox" id="check-all" onchange="document.querySelectorAll('.post-check').forEach(c => c.checked = this.checked)"></th>
          <th>Title</th>
          <th>Author</th>
          <th>Status</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        ${(posts?.results || []).length ? (posts.results || []).map(p => `
          <tr>
            <td><input type="checkbox" name="post[]" value="${p.ID}" class="post-check"></td>
            <td>
              <strong><a href="/cp-admin/post?post=${p.ID}">${esc(p.post_title || '(no title)')}</a></strong>
              <div class="row-actions" style="font-size:12px;margin-top:4px">
                <a href="/cp-admin/post?post=${p.ID}" style="color:#2271b1">Edit</a> |
                <a href="/?p=${p.ID}" target="_blank" style="color:#2271b1">View</a> |
                <a href="?post_type=${postType}&action=trash&post=${p.ID}"
                   onclick="return confirm('Move to trash?')"
                   style="color:#d63638">Trash</a>
              </div>
            </td>
            <td>${esc(p.author_name || '')}</td>
            <td><span class="cp-badge cp-badge-${p.post_status}">${esc(p.post_status)}</span></td>
            <td style="font-size:12px;color:#646970">${esc(formatDate(p.post_date))}</td>
          </tr>
        `).join('') : `
          <tr><td colspan="5" style="text-align:center;padding:40px;color:#646970">
            No ${typeLabel.toLowerCase()} found. <a href="${newHref}">Create one</a>.
          </td></tr>
        `}
      </tbody>
    </table>
  </div>
</form>

<!-- Pagination -->
${totalPages > 1 ? `
<div style="display:flex;gap:6px;align-items:center;margin-top:16px;justify-content:center">
  ${page > 1 ? `<a href="?post_type=${postType}&paged=${page-1}" class="cp-btn cp-btn-secondary">&lsaquo; Prev</a>` : ''}
  <span style="color:#646970;font-size:13px">Page ${page} of ${totalPages}</span>
  ${page < totalPages ? `<a href="?post_type=${postType}&paged=${page+1}" class="cp-btn cp-btn-secondary">Next &rsaquo;</a>` : ''}
</div>
` : ''}
`;

  const html = await renderAdminShell(cp, content, { title: typeLabel });
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString(); } catch (_) { return d; }
}
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
