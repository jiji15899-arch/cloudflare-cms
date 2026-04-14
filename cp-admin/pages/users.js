/**
 * CloudPress Admin – Users
 * Replaces WordPress wp-admin/users.php
 * @package CloudPress
 */

import { renderAdminShell } from '../admin-shell.js';
import { hashPassword } from '../../cp-includes/crypto.js';

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export async function handleUsers(request, cp) {
  const prefix = cp.db_prefix || 'cp_';
  const method = request.method.toUpperCase();
  const url    = new URL(request.url);
  let notice   = null;

  if (method === 'POST') {
    const fd     = await request.formData().catch(() => new FormData());
    const action = fd.get('action') || '';
    const uid    = parseInt(fd.get('user_id') || 0);
    const me     = cp.currentUser?.ID;

    if (action === 'delete' && uid && uid !== me) {
      await cp.db.prepare(`DELETE FROM ${prefix}users WHERE ID=?`).bind(uid).run();
      await cp.db.prepare(`DELETE FROM ${prefix}usermeta WHERE user_id=?`).bind(uid).run();
      notice = { type: 'success', message: 'User deleted.' };
    }

    if (action === 'add_user') {
      const login    = (fd.get('user_login') || '').trim();
      const email    = (fd.get('user_email') || '').trim();
      const pass     = (fd.get('user_pass') || '').trim();
      const role     = fd.get('role') || 'subscriber';
      const now      = new Date().toISOString().replace('T',' ').slice(0,19);

      if (!login || !email || !pass) {
        notice = { type: 'error', message: 'Login, email, and password are required.' };
      } else {
        const exists = await cp.db.prepare(`SELECT ID FROM ${prefix}users WHERE user_login=? OR user_email=?`).bind(login, email).first();
        if (exists) {
          notice = { type: 'error', message: 'Username or email already in use.' };
        } else {
          const hash = await hashPassword(pass);
          const res  = await cp.db.prepare(
            `INSERT INTO ${prefix}users (user_login,user_pass,user_email,user_registered,user_status,display_name)
             VALUES (?,?,?,?,0,?)`
          ).bind(login, hash, email, now, login).run();
          const newId = res.meta?.last_row_id;
          if (newId) {
            await cp.db.prepare(`INSERT INTO ${prefix}usermeta (user_id,meta_key,meta_value) VALUES (?,?,?)`)
              .bind(newId, `${prefix}capabilities`, JSON.stringify({ [role]: true })).run();
          }
          notice = { type: 'success', message: `User "${esc(login)}" created.` };
        }
      }
    }
  }

  const search = (url.searchParams.get('s') || '').trim();
  const role   = url.searchParams.get('role') || '';
  const page   = Math.max(1, parseInt(url.searchParams.get('paged') || 1));
  const limit  = 20;

  const conds  = [];
  const params = [];
  if (search) { conds.push('(user_login LIKE ? OR user_email LIKE ? OR display_name LIKE ?)'); params.push(`%${search}%`,`%${search}%`,`%${search}%`); }
  const where  = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const total  = await cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}users ${where}`).bind(...params).first();
  const rows   = await cp.db.prepare(
    `SELECT u.ID, u.user_login, u.user_email, u.display_name, u.user_registered,
            m.meta_value as caps
     FROM ${prefix}users u
     LEFT JOIN ${prefix}usermeta m ON m.user_id=u.ID AND m.meta_key='${prefix}capabilities'
     ${where} ORDER BY u.ID ASC LIMIT ? OFFSET ?`
  ).bind(...params, limit, (page-1)*limit).all();

  const users = rows.results || [];
  const me    = cp.currentUser?.ID;

  function parseRole(caps) {
    try {
      const obj = typeof caps === 'string' ? JSON.parse(caps) : (caps || {});
      return Object.keys(obj).find(k => obj[k]) || 'subscriber';
    } catch (_) { return 'subscriber'; }
  }

  const tableRows = users.map(u => {
    const userRole = parseRole(u.caps);
    const isSelf   = u.ID === me;
    return `
  <tr>
    <td><strong>${esc(u.user_login)}</strong>${isSelf ? ' <span style="color:#0073aa">(You)</span>' : ''}</td>
    <td>${esc(u.display_name || u.user_login)}</td>
    <td><a href="mailto:${esc(u.user_email)}">${esc(u.user_email)}</a></td>
    <td>${esc(userRole)}</td>
    <td style="white-space:nowrap">
      <a href="/cp-admin/user-edit?user_id=${u.ID}" class="cp-btn cp-btn-secondary" style="padding:4px 10px;font-size:12px">Edit</a>
      ${!isSelf ? `
      <form method="post" style="display:inline" onsubmit="return confirm('Delete user?')">
        <input type="hidden" name="action" value="delete">
        <input type="hidden" name="user_id" value="${u.ID}">
        <button type="submit" class="cp-btn" style="background:#a00;padding:4px 10px;font-size:12px">Delete</button>
      </form>` : ''}
    </td>
  </tr>`;
  }).join('');

  const totalPages = Math.ceil((total?.n || 0) / limit);

  const content = `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
  <h1>Users</h1>
</div>

<!-- Add user -->
<details class="cp-card" style="margin-bottom:20px">
  <summary style="cursor:pointer;font-weight:600">&#43; Add New User</summary>
  <form method="post" style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
    <input type="hidden" name="action" value="add_user">
    <div>
      <label style="display:block;margin-bottom:4px;font-weight:500">Username *</label>
      <input type="text" name="user_login" required style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
    </div>
    <div>
      <label style="display:block;margin-bottom:4px;font-weight:500">Email *</label>
      <input type="email" name="user_email" required style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
    </div>
    <div>
      <label style="display:block;margin-bottom:4px;font-weight:500">Password *</label>
      <input type="password" name="user_pass" required style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
    </div>
    <div>
      <label style="display:block;margin-bottom:4px;font-weight:500">Role</label>
      <select name="role" style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;background:#fff;box-sizing:border-box">
        <option value="subscriber">Subscriber</option>
        <option value="contributor">Contributor</option>
        <option value="author">Author</option>
        <option value="editor">Editor</option>
        <option value="administrator">Administrator</option>
      </select>
    </div>
    <div style="grid-column:1/-1">
      <button type="submit" class="cp-btn">Add User</button>
    </div>
  </form>
</details>

<!-- Table -->
<div class="cp-card">
  <form method="get" style="margin-bottom:12px;display:flex;gap:8px">
    <input type="text" name="s" value="${esc(search)}" placeholder="Search users…" style="padding:6px 10px;border:1px solid #ccc;border-radius:4px;flex:1">
    <button type="submit" class="cp-btn cp-btn-secondary">Search</button>
  </form>
  <table class="cp-table">
    <thead><tr><th>Username</th><th>Name</th><th>Email</th><th>Role</th><th>Actions</th></tr></thead>
    <tbody>${tableRows || '<tr><td colspan="5" style="text-align:center;color:#999;padding:20px">No users found.</td></tr>'}</tbody>
  </table>
  <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
    ${page > 1 ? `<a href="?paged=${page-1}&s=${esc(search)}" class="cp-btn cp-btn-secondary">&laquo; Prev</a>` : ''}
    <span style="line-height:36px;color:#666">Page ${page} of ${totalPages||1}</span>
    ${page < totalPages ? `<a href="?paged=${page+1}&s=${esc(search)}" class="cp-btn cp-btn-secondary">Next &raquo;</a>` : ''}
  </div>
</div>`;

  return new Response(
    await renderAdminShell(cp, content, { title: 'Users', notices: notice ? [notice] : [] }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
