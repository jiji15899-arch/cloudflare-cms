/**
 * CloudPress Admin - Edit User
 * Replaces WordPress wp-admin/user-edit.php
 * @package CloudPress
 */

import { renderAdminShell } from '../admin-shell.js';
import { hashPassword } from '../../cp-includes/crypto.js';

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export async function handleUserEdit(request, cp) {
  const prefix = cp.db_prefix || 'cp_';
  const url    = new URL(request.url);
  const method = request.method.toUpperCase();
  const userId = parseInt(url.searchParams.get('user_id') || cp.currentUser?.ID || 0);
  let notice   = null;

  if (!userId) {
    return new Response('User not found', { status: 404 });
  }

  if (method === 'POST') {
    const fd          = await request.formData().catch(() => new FormData());
    const displayName = (fd.get('display_name') || '').trim();
    const email       = (fd.get('user_email') || '').trim();
    const newPass     = (fd.get('new_pass') || '').trim();
    const role        = fd.get('role') || '';

    if (!email || !email.includes('@')) {
      notice = { type: 'error', message: 'Valid email required.' };
    } else {
      const updates = ['display_name=?', 'user_email=?'];
      const params  = [displayName, email];

      if (newPass) {
        const hash = await hashPassword(newPass);
        updates.push('user_pass=?');
        params.push(hash);
      }

      params.push(userId);
      await cp.db.prepare(
        `UPDATE ${prefix}users SET ${updates.join(',')} WHERE ID=?`
      ).bind(...params).run();

      if (role) {
        const existing = await cp.db.prepare(
          `SELECT umeta_id FROM ${prefix}usermeta WHERE user_id=? AND meta_key=?`
        ).bind(userId, `${prefix}capabilities`).first();

        const caps = JSON.stringify({ [role]: true });
        if (existing) {
          await cp.db.prepare(
            `UPDATE ${prefix}usermeta SET meta_value=? WHERE user_id=? AND meta_key=?`
          ).bind(caps, userId, `${prefix}capabilities`).run();
        } else {
          await cp.db.prepare(
            `INSERT INTO ${prefix}usermeta (user_id,meta_key,meta_value) VALUES (?,?,?)`
          ).bind(userId, `${prefix}capabilities`, caps).run();
        }
      }

      notice = { type: 'success', message: 'User updated.' };
    }
  }

  const user = await cp.db.prepare(
    `SELECT u.ID, u.user_login, u.user_email, u.display_name, u.user_registered,
            m.meta_value as caps
     FROM ${prefix}users u
     LEFT JOIN ${prefix}usermeta m ON m.user_id=u.ID AND m.meta_key='${prefix}capabilities'
     WHERE u.ID=? LIMIT 1`
  ).bind(userId).first();

  if (!user) return new Response('User not found', { status: 404 });

  function getRole(caps) {
    try {
      const obj = typeof caps === 'string' ? JSON.parse(caps) : (caps || {});
      return Object.keys(obj).find(k => obj[k]) || 'subscriber';
    } catch (_) { return 'subscriber'; }
  }

  const currentRole = getRole(user.caps);
  const roles = ['subscriber','contributor','author','editor','administrator'];

  const content = `
<div class="cp-card" style="max-width:600px">
  <h1>Edit User: ${esc(user.user_login)}</h1>
  <form method="post">
    <div style="display:grid;gap:16px;margin-top:16px">

      <div>
        <label style="display:block;margin-bottom:4px;font-weight:500">Username</label>
        <input type="text" value="${esc(user.user_login)}" disabled
               style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;background:#f5f5f5;box-sizing:border-box;color:#666">
        <p style="color:#888;font-size:12px;margin:4px 0 0">Username cannot be changed.</p>
      </div>

      <div>
        <label style="display:block;margin-bottom:4px;font-weight:500">Display Name</label>
        <input type="text" name="display_name" value="${esc(user.display_name || user.user_login)}"
               style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
      </div>

      <div>
        <label style="display:block;margin-bottom:4px;font-weight:500">Email *</label>
        <input type="email" name="user_email" value="${esc(user.user_email)}" required
               style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
      </div>

      <div>
        <label style="display:block;margin-bottom:4px;font-weight:500">Role</label>
        <select name="role" style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;background:#fff;box-sizing:border-box">
          ${roles.map(r => `<option value="${r}"${r===currentRole?' selected':''}>${r.charAt(0).toUpperCase()+r.slice(1)}</option>`).join('')}
        </select>
      </div>

      <div>
        <label style="display:block;margin-bottom:4px;font-weight:500">New Password</label>
        <input type="password" name="new_pass" placeholder="Leave blank to keep current password"
               style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
      </div>

      <div style="display:flex;gap:10px;margin-top:8px">
        <button type="submit" class="cp-btn">Save Changes</button>
        <a href="/cp-admin/users" class="cp-btn cp-btn-secondary">Cancel</a>
      </div>
    </div>
  </form>
</div>`;

  return new Response(
    await renderAdminShell(cp, content, { title: `Edit User: ${user.user_login}`, notices: notice ? [notice] : [] }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
