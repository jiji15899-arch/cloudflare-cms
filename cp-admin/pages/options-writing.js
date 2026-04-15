/**
 * CloudPress Admin - Writing Settings
 * Replaces WordPress wp-admin/options-writing.php
 * @package CloudPress
 */

import { renderAdminShell } from '../admin-shell.js';
import { getOption, updateOption } from '../../cp-includes/option.js';

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export async function handleOptionsWriting(request, cp) {
  const method = request.method.toUpperCase();
  let notice   = null;

  const keys = [
    'default_category',
    'default_post_format',
    'default_link_category',
    'mailserver_url',
    'mailserver_login',
    'mailserver_pass',
    'mailserver_port',
  ];

  if (method === 'POST') {
    const fd = await request.formData().catch(() => new FormData());
    for (const key of keys) {
      const val = fd.get(key);
      if (val !== null) await updateOption(cp, key, val.trim());
    }
    notice = { type: 'success', message: 'Settings saved.' };
  }

  const vals = {};
  for (const key of keys) {
    vals[key] = await getOption(cp, key, '').catch(() => '');
  }

  // Get categories
  let categories = [];
  try {
    const prefix = cp.db_prefix || 'cp_';
    const cats = await cp.db.prepare(
      `SELECT t.term_id, t.name FROM ${prefix}terms t
       JOIN ${prefix}term_taxonomy tt ON tt.term_id=t.term_id
       WHERE tt.taxonomy='category' ORDER BY t.name ASC`
    ).all();
    categories = cats.results || [];
  } catch (_) {}

  const catOptions = categories.map(c =>
    `<option value="${esc(c.term_id)}"${vals.default_category==c.term_id?' selected':''}>${esc(c.name)}</option>`
  ).join('');

  const formats = ['','aside','chat','gallery','link','image','quote','status','video','audio'];
  const fmtOptions = formats.map(f =>
    `<option value="${esc(f)}"${vals.default_post_format===f?' selected':''}>${f||'Standard'}</option>`
  ).join('');

  const content = `
<div class="cp-card" style="max-width:700px">
  <h1>Writing Settings</h1>
  <form method="post" style="margin-top:16px">
    <table style="width:100%;border-collapse:collapse">
      <tbody>

        <tr style="border-bottom:1px solid #eee">
          <th style="width:200px;text-align:left;padding:14px 0;font-weight:500;vertical-align:top">Default Post Category</th>
          <td style="padding:14px 0 14px 20px">
            <select name="default_category" style="padding:8px 10px;border:1px solid #ccc;border-radius:4px;background:#fff;min-width:200px">
              ${catOptions || '<option value="1">Uncategorized</option>'}
            </select>
          </td>
        </tr>

        <tr style="border-bottom:1px solid #eee">
          <th style="text-align:left;padding:14px 0;font-weight:500;vertical-align:top">Default Post Format</th>
          <td style="padding:14px 0 14px 20px">
            <select name="default_post_format" style="padding:8px 10px;border:1px solid #ccc;border-radius:4px;background:#fff;min-width:200px">
              ${fmtOptions}
            </select>
          </td>
        </tr>

        <tr>
          <td colspan="2" style="padding:20px 0 8px"><h3 style="margin:0">Post via Email</h3>
          <p style="color:#888;font-size:13px;margin:4px 0 0">CloudPress uses Cloudflare Email Workers for post-by-email. Configure your mail server below.</p></td>
        </tr>

        <tr style="border-bottom:1px solid #eee">
          <th style="text-align:left;padding:14px 0;font-weight:500">Mail Server</th>
          <td style="padding:14px 0 14px 20px">
            <input type="text" name="mailserver_url" value="${esc(vals.mailserver_url)}" placeholder="mail.example.com"
                   style="padding:8px 10px;border:1px solid #ccc;border-radius:4px;width:220px">
            Port: <input type="number" name="mailserver_port" value="${esc(vals.mailserver_port||'110')}"
                         style="padding:8px 10px;border:1px solid #ccc;border-radius:4px;width:70px">
          </td>
        </tr>

        <tr style="border-bottom:1px solid #eee">
          <th style="text-align:left;padding:14px 0;font-weight:500">Login Name</th>
          <td style="padding:14px 0 14px 20px">
            <input type="text" name="mailserver_login" value="${esc(vals.mailserver_login)}"
                   style="padding:8px 10px;border:1px solid #ccc;border-radius:4px;width:220px">
          </td>
        </tr>

        <tr style="border-bottom:1px solid #eee">
          <th style="text-align:left;padding:14px 0;font-weight:500">Password</th>
          <td style="padding:14px 0 14px 20px">
            <input type="password" name="mailserver_pass" value="${esc(vals.mailserver_pass)}"
                   style="padding:8px 10px;border:1px solid #ccc;border-radius:4px;width:220px">
          </td>
        </tr>

      </tbody>
    </table>
    <div style="margin-top:20px">
      <button type="submit" class="cp-btn">Save Changes</button>
    </div>
  </form>
</div>`;

  return new Response(
    await renderAdminShell(cp, content, { title: 'Writing Settings', notices: notice ? [notice] : [] }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
