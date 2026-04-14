/**
 * CloudPress Admin - Comments
 * Replaces WordPress wp-admin/edit-comments.php
 *
 * @package CloudPress
 */

import { renderAdminShell } from '../admin-shell.js';

export async function handleComments(request, cp) {
  const prefix = cp.db_prefix || 'cp_';
  const url    = new URL(request.url);
  const method = request.method.toUpperCase();
  const action = url.searchParams.get('action') || '';
  const cid    = parseInt(url.searchParams.get('c') || '0');
  const status = url.searchParams.get('comment_status') || 'all';
  const page   = Math.max(1, parseInt(url.searchParams.get('paged') || '1'));
  const perPage = 20;
  const notices = [];

  // ── Bulk / single actions ─────────────────────────────────────────────────
  if (method === 'POST') {
    const fd = await request.formData().catch(() => new FormData());
    const bulkAction = fd.get('action') || action;
    const ids = fd.getAll('delete_comments[]').map(Number).filter(Boolean);
    if (cid && !ids.length) ids.push(cid);

    if (ids.length) {
      if (bulkAction === 'approve') {
        for (const id of ids)
          await cp.db.prepare(`UPDATE ${prefix}comments SET comment_approved='1' WHERE comment_ID=?`).bind(id).run();
        notices.push({ type: 'success', message: `${ids.length} comment(s) approved.` });
      } else if (bulkAction === 'unapprove') {
        for (const id of ids)
          await cp.db.prepare(`UPDATE ${prefix}comments SET comment_approved='0' WHERE comment_ID=?`).bind(id).run();
        notices.push({ type: 'success', message: `${ids.length} comment(s) unapproved.` });
      } else if (bulkAction === 'spam') {
        for (const id of ids)
          await cp.db.prepare(`UPDATE ${prefix}comments SET comment_approved='spam' WHERE comment_ID=?`).bind(id).run();
        notices.push({ type: 'success', message: `${ids.length} comment(s) marked as spam.` });
      } else if (bulkAction === 'trash' || bulkAction === 'delete') {
        for (const id of ids)
          await cp.db.prepare(`DELETE FROM ${prefix}comments WHERE comment_ID=?`).bind(id).run();
        notices.push({ type: 'success', message: `${ids.length} comment(s) deleted.` });
      }
    }
  }

  // ── Count comments by status ──────────────────────────────────────────────
  const counts = await Promise.all([
    cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}comments`).first(),
    cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}comments WHERE comment_approved='1'`).first(),
    cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}comments WHERE comment_approved='0'`).first(),
    cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}comments WHERE comment_approved='spam'`).first(),
  ]);
  const [total, approved, pending, spam] = counts.map(r => r?.n ?? 0);

  // ── Fetch comments ────────────────────────────────────────────────────────
  let whereSql = '';
  if (status === 'approved')  whereSql = `WHERE c.comment_approved='1'`;
  else if (status === 'pending') whereSql = `WHERE c.comment_approved='0'`;
  else if (status === 'spam')    whereSql = `WHERE c.comment_approved='spam'`;

  const offset = (page - 1) * perPage;
  const { results: comments } = await cp.db.prepare(`
    SELECT c.*, p.post_title
    FROM ${prefix}comments c
    LEFT JOIN ${prefix}posts p ON c.comment_post_ID = p.ID
    ${whereSql}
    ORDER BY c.comment_date DESC
    LIMIT ? OFFSET ?
  `).bind(perPage, offset).all();

  const totalFiltered = status === 'all' ? total : (status === 'approved' ? approved : status === 'pending' ? pending : spam);
  const totalPages = Math.ceil(totalFiltered / perPage);

  const noticeHtml = notices.map(n =>
    `<div class="cp-notice cp-notice-${n.type}">${esc(n.message)}</div>`
  ).join('');

  const statusTabs = [
    { key: 'all',      label: `All (${total})` },
    { key: 'approved', label: `Approved (${approved})` },
    { key: 'pending',  label: `Pending (${pending})` },
    { key: 'spam',     label: `Spam (${spam})` },
  ].map(t => `<a href="?comment_status=${t.key}" class="cp-tab${status === t.key ? ' active' : ''}">${t.label}</a>`).join(' | ');

  const rows = (comments || []).map(c => `
    <tr>
      <td><input type="checkbox" name="delete_comments[]" value="${c.comment_ID}"></td>
      <td>
        <strong>${esc(c.comment_author)}</strong><br>
        <a href="mailto:${esc(c.comment_author_email)}">${esc(c.comment_author_email)}</a><br>
        <span style="color:#646970;font-size:12px">${esc(c.comment_author_IP || '')}</span>
      </td>
      <td>
        <div style="max-width:380px">${esc(truncate(c.comment_content, 120))}</div>
        <div class="cp-row-actions" style="margin-top:4px">
          <a href="?action=approve&c=${c.comment_ID}" style="color:#46b450">Approve</a> |
          <a href="?action=unapprove&c=${c.comment_ID}" style="color:#f56e28">Unapprove</a> |
          <a href="?action=spam&c=${c.comment_ID}" style="color:#dc3232">Spam</a> |
          <a href="?action=delete&c=${c.comment_ID}" style="color:#dc3232" onclick="return confirm('Delete this comment?')">Delete</a>
        </div>
      </td>
      <td>
        <a href="/cp-admin/post?post=${c.comment_post_ID}">${esc(c.post_title || '(no title)')}</a>
      </td>
      <td>
        <span class="cp-badge ${c.comment_approved === '1' ? 'cp-badge-publish' : 'cp-badge-pending'}">
          ${c.comment_approved === '1' ? 'Approved' : c.comment_approved === 'spam' ? 'Spam' : 'Pending'}
        </span>
      </td>
      <td style="font-size:12px;color:#646970">${esc(formatDate(c.comment_date))}</td>
    </tr>
  `).join('');

  const pagination = totalPages > 1 ? `
    <div style="margin-top:12px;text-align:right">
      ${page > 1 ? `<a href="?comment_status=${status}&paged=${page-1}" class="cp-btn cp-btn-secondary">&#8592; Prev</a>` : ''}
      <span style="margin:0 8px;color:#646970">Page ${page} / ${totalPages}</span>
      ${page < totalPages ? `<a href="?comment_status=${status}&paged=${page+1}" class="cp-btn cp-btn-secondary">Next &#8594;</a>` : ''}
    </div>` : '';

  const content = `
${noticeHtml}
<div class="cp-card">
  <div style="margin-bottom:12px">${statusTabs}</div>
  <form method="post">
    <div style="margin-bottom:8px;display:flex;gap:8px;align-items:center">
      <select name="action" class="cp-form-select" style="width:auto">
        <option value="">Bulk Actions</option>
        <option value="approve">Approve</option>
        <option value="unapprove">Unapprove</option>
        <option value="spam">Mark as Spam</option>
        <option value="delete">Delete</option>
      </select>
      <button type="submit" class="cp-btn cp-btn-secondary">Apply</button>
    </div>
    <div class="cp-table-wrap">
      <table class="cp-table">
        <thead>
          <tr>
            <th><input type="checkbox" id="cb-all"></th>
            <th>Author</th>
            <th>Comment</th>
            <th>In Response To</th>
            <th>Status</th>
            <th>Submitted</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:#646970;padding:24px">No comments found.</td></tr>'}</tbody>
      </table>
    </div>
    ${pagination}
  </form>
</div>
<script>
  document.getElementById('cb-all')?.addEventListener('change', function() {
    document.querySelectorAll('input[name="delete_comments[]"]').forEach(cb => cb.checked = this.checked);
  });
</script>`;

  const html = await renderAdminShell(cp, content, { title: 'Comments' });
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function truncate(str, n) {
  return str && str.length > n ? str.slice(0, n) + '…' : (str || '');
}
function formatDate(d) {
  try { return new Date(d).toLocaleString(); } catch (_) { return d || ''; }
}
