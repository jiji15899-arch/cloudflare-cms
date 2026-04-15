/**
 * CloudPress Admin - Media Settings
 * Replaces WordPress wp-admin/options-media.php
 * @package CloudPress
 */

import { renderAdminShell } from '../admin-shell.js';
import { getOption, updateOption } from '../../cp-includes/option.js';

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const KEYS = [
  'thumbnail_size_w','thumbnail_size_h','thumbnail_crop',
  'medium_size_w','medium_size_h',
  'large_size_w','large_size_h',
  'uploads_use_yearmonth_folders',
];

export async function handleOptionsMedia(request, cp) {
  const method = request.method.toUpperCase();
  let notice   = null;

  if (method === 'POST') {
    const fd = await request.formData().catch(() => new FormData());
    for (const key of KEYS) {
      if (key === 'thumbnail_crop' || key === 'uploads_use_yearmonth_folders') {
        await updateOption(cp, key, fd.get(key) ? '1' : '0');
      } else {
        const val = fd.get(key);
        if (val !== null) await updateOption(cp, key, val.trim());
      }
    }
    notice = { type: 'success', message: 'Settings saved.' };
  }

  const v = {};
  for (const key of KEYS) {
    v[key] = await getOption(cp, key, '').catch(() => '');
  }

  const content = `
<div class="cp-card" style="max-width:680px">
  <h1>Media Settings</h1>
  <form method="post" style="margin-top:16px">

    <h2 style="font-size:16px;border-bottom:1px solid #eee;padding-bottom:8px">Image sizes</h2>
    <p style="color:#888;font-size:13px;margin:-4px 0 16px">Note: CloudPress stores files in KV. Resize operations are performed at upload time.</p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">

      <tr style="border-bottom:1px solid #eee">
        <th style="text-align:left;padding:14px 0;font-weight:500;width:180px;vertical-align:top">Thumbnail size</th>
        <td style="padding:14px 0 14px 20px">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            Width <input type="number" name="thumbnail_size_w" value="${esc(v.thumbnail_size_w||'150')}" min="0"
                         style="width:70px;padding:6px 8px;border:1px solid #ccc;border-radius:4px">
            Height <input type="number" name="thumbnail_size_h" value="${esc(v.thumbnail_size_h||'150')}" min="0"
                          style="width:70px;padding:6px 8px;border:1px solid #ccc;border-radius:4px">
          </div>
          <label style="display:flex;align-items:center;gap:8px;margin-top:8px">
            <input type="checkbox" name="thumbnail_crop" value="1" ${v.thumbnail_crop==='1'?'checked':''}>
            Crop thumbnail to exact dimensions
          </label>
        </td>
      </tr>

      <tr style="border-bottom:1px solid #eee">
        <th style="text-align:left;padding:14px 0;font-weight:500;vertical-align:top">Medium size</th>
        <td style="padding:14px 0 14px 20px">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            Max Width <input type="number" name="medium_size_w" value="${esc(v.medium_size_w||'300')}" min="0"
                             style="width:70px;padding:6px 8px;border:1px solid #ccc;border-radius:4px">
            Max Height <input type="number" name="medium_size_h" value="${esc(v.medium_size_h||'300')}" min="0"
                              style="width:70px;padding:6px 8px;border:1px solid #ccc;border-radius:4px">
          </div>
        </td>
      </tr>

      <tr>
        <th style="text-align:left;padding:14px 0;font-weight:500;vertical-align:top">Large size</th>
        <td style="padding:14px 0 14px 20px">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            Max Width <input type="number" name="large_size_w" value="${esc(v.large_size_w||'1024')}" min="0"
                             style="width:70px;padding:6px 8px;border:1px solid #ccc;border-radius:4px">
            Max Height <input type="number" name="large_size_h" value="${esc(v.large_size_h||'1024')}" min="0"
                              style="width:70px;padding:6px 8px;border:1px solid #ccc;border-radius:4px">
          </div>
        </td>
      </tr>

    </table>

    <h2 style="font-size:16px;border-bottom:1px solid #eee;padding-bottom:8px">Uploading Files</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr><td style="padding:12px 0">
        <label style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" name="uploads_use_yearmonth_folders" value="1" ${v.uploads_use_yearmonth_folders!=='0'?'checked':''}>
          Organize my uploads into month- and year-based folders
        </label>
        <p style="color:#888;font-size:12px;margin:6px 0 0">Files stored in KV with keys like <code>cp:media:2024/01/filename.jpg</code></p>
      </td></tr>
    </table>

    <div><button type="submit" class="cp-btn">Save Changes</button></div>
  </form>
</div>`;

  return new Response(
    await renderAdminShell(cp, content, { title: 'Media Settings', notices: notice ? [notice] : [] }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
