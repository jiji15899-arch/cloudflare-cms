/**
 * CloudPress Admin - Profile
 * Replaces WordPress wp-admin/profile.php
 * @package CloudPress
 */

import { renderAdminShell } from '../admin-shell.js';
import { hashPassword } from '../../cp-includes/crypto.js';

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export async function handleProfile(request, cp) {
  const prefix = cp.db_prefix || 'cp_';
  const method = request.method.toUpperCase();
  const me     = cp.currentUser;
  let notice   = null;

  if (!me) {
    return new Response('', { status: 302, headers: { Location: '/cp-login' } });
  }

  if (method === 'POST') {
    const fd          = await request.formData().catch(() => new FormData());
    const displayName = (fd.get('display_name') || '').trim();
    const email       = (fd.get('user_email') || '').trim();
    const firstName   = (fd.get('first_name') || '').trim();
    const lastName    = (fd.get('last_name') || '').trim();
    const bio         = (fd.get('description') || '').trim();
    const newPass     = (fd.get('new_pass') || '').trim();
    const confirmPass = (fd.get('confirm_pass') || '').trim();

    if (!email || !email.includes('@')) {
      notice = { type: 'error', message: 'Valid email required.' };
    } else if (newPass && newPass !== confirmPass) {
      notice = { type: 'error', message: 'Passwords do not match.' };
    } else {
      const updates = ['display_name=?', 'user_email=?'];
      const params  = [displayName || me.user_login, email];

      if (newPass) {
        const hash = await hashPassword(newPass);
        updates.push('user_pass=?');
        params.push(hash);
      }

      params.push(me.ID);
      await cp.db.prepare(`UPDATE ${prefix}users SET ${updates.join(',')} WHERE ID=?`).bind(...params).run();

      // Save meta fields
      const metaFields = { first_name: firstName, last_name: lastName, description: bio };
      for (const [key, val] of Object.entries(metaFields)) {
        const existing = await cp.db.prepare(
          `SELECT umeta_id FROM ${prefix}usermeta WHERE user_id=? AND meta_key=? LIMIT 1`
        ).bind(me.ID, key).first();
        if (existing) {
          await cp.db.prepare(`UPDATE ${prefix}usermeta SET meta_value=? WHERE user_id=? AND meta_key=?`)
            .bind(val, me.ID, key).run();
        } else {
          await cp.db.prepare(`INSERT INTO ${prefix}usermeta (user_id,meta_key,meta_value) VALUES (?,?,?)`)
            .bind(me.ID, key, val).run();
        }
      }

      notice = { type: 'success', message: 'Profile updated.' };
    }
  }

  // Load user + meta
  const user = await cp.db.prepare(
    `SELECT ID, user_login, user_email, display_name FROM ${prefix}users WHERE ID=? LIMIT 1`
  ).bind(me.ID).first();

  const metaRows = await cp.db.prepare(
    `SELECT meta_key, meta_value FROM ${prefix}usermeta WHERE user_id=? AND meta_key IN ('first_name','last_name','description')`
  ).bind(me.ID).all();

  const meta = {};
  (metaRows.results || []).forEach(r => { meta[r.meta_key] = r.meta_value; });

  const content = `
<div class="cp-card" style="max-width:640px">
  <h1>Your Profile</h1>
  <form method="post" style="margin-top:16px">
    <div style="display:grid;gap:16px">

      <div>
        <label style="display:block;margin-bottom:4px;font-weight:500">Username</label>
        <input type="text" value="${esc(user?.user_login)}" disabled
               style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;background:#f5f5f5;box-sizing:border-box;color:#666">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <label style="display:block;margin-bottom:4px;font-weight:500">First Name</label>
          <input type="text" name="first_name" value="${esc(meta.first_name || '')}"
                 style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
        </div>
        <div>
          <label style="display:block;margin-bottom:4px;font-weight:500">Last Name</label>
          <input type="text" name="last_name" value="${esc(meta.last_name || '')}"
                 style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
        </div>
      </div>

      <div>
        <label style="display:block;margin-bottom:4px;font-weight:500">Display Name</label>
        <input type="text" name="display_name" value="${esc(user?.display_name || user?.user_login || '')}"
               style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
      </div>

      <div>
        <label style="display:block;margin-bottom:4px;font-weight:500">Email *</label>
        <input type="email" name="user_email" value="${esc(user?.user_email || '')}" required
               style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
      </div>

      <div>
        <label style="display:block;margin-bottom:4px;font-weight:500">Bio</label>
        <textarea name="description" rows="4" style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;resize:vertical">${esc(meta.description || '')}</textarea>
      </div>

      <hr style="border:none;border-top:1px solid #eee;margin:4px 0">
      <h3 style="margin:0">Change Password</h3>

      <div>
        <label style="display:block;margin-bottom:4px;font-weight:500">New Password</label>
        <input type="password" name="new_pass" placeholder="Leave blank to keep current"
               style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
      </div>
      <div>
        <label style="display:block;margin-bottom:4px;font-weight:500">Confirm Password</label>
        <input type="password" name="confirm_pass" placeholder="Repeat new password"
               style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
      </div>

      <div>
        <button type="submit" class="cp-btn">Save Changes</button>
      </div>
    </div>
  </form>
</div>`;

  return new Response(
    await renderAdminShell(cp, content, { title: 'Your Profile', notices: notice ? [notice] : [] }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
