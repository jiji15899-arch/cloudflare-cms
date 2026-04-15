/**
 * CloudPress Admin - Permalink Settings
 * Replaces WordPress wp-admin/options-permalink.php
 * @package CloudPress
 */

import { renderAdminShell } from '../admin-shell.js';
import { getOption, updateOption } from '../../cp-includes/option.js';

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export async function handleOptionsPermalink(request, cp) {
  const method = request.method.toUpperCase();
  let notice   = null;

  if (method === 'POST') {
    const fd = await request.formData().catch(() => new FormData());
    let structure = (fd.get('permalink_structure') || '').trim();
    if (fd.get('selection') === 'custom') {
      structure = (fd.get('custom_structure') || '').trim();
    }
    await updateOption(cp, 'permalink_structure', structure);
    await updateOption(cp, 'category_base', (fd.get('category_base') || '').trim());
    await updateOption(cp, 'tag_base', (fd.get('tag_base') || '').trim());
    notice = { type: 'success', message: 'Permalink structure saved.' };
  }

  const current = await getOption(cp, 'permalink_structure', '/%year%/%monthnum%/%postname%/').catch(() => '/%year%/%monthnum%/%postname%/');
  const catBase = await getOption(cp, 'category_base', '').catch(() => '');
  const tagBase = await getOption(cp, 'tag_base', '').catch(() => '');

  const structures = [
    { label: 'Plain',          value: '',                              example: '/?p=123' },
    { label: 'Day and name',   value: '/%year%/%monthnum%/%day%/%postname%/', example: '/2024/01/01/sample-post/' },
    { label: 'Month and name', value: '/%year%/%monthnum%/%postname%/',       example: '/2024/01/sample-post/' },
    { label: 'Numeric',        value: '/archives/%post_id%',                  example: '/archives/123' },
    { label: 'Post name',      value: '/%postname%/',                         example: '/sample-post/' },
  ];

  const isCustom = !structures.find(s => s.value === current);

  const rows = structures.map(s => `
  <tr style="border-bottom:1px solid #f0f0f0">
    <td style="padding:10px 0">
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
        <input type="radio" name="selection" value="${esc(s.value)}"
               ${current===s.value&&!isCustom?'checked':''} style="margin:0"
               onchange="document.getElementById('permalink_structure').value='${esc(s.value)}'">
        <span style="font-weight:500;min-width:160px">${esc(s.label)}</span>
        <code style="background:#f5f5f5;padding:2px 8px;border-radius:3px;font-size:13px">${esc(s.example)}</code>
      </label>
    </td>
  </tr>`).join('');

  const content = `
<div class="cp-card" style="max-width:720px">
  <h1>Permalink Settings</h1>
  <p style="color:#666;margin-bottom:8px">CloudPress uses the URL structure to route requests via the Worker. Choose a structure that works for your site.</p>

  <form method="post" style="margin-top:16px">
    <input type="hidden" name="permalink_structure" id="permalink_structure" value="${esc(current)}">

    <h2 style="font-size:16px;border-bottom:1px solid #eee;padding-bottom:8px">Common settings</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      ${rows}
      <tr>
        <td style="padding:10px 0">
          <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer">
            <input type="radio" name="selection" value="custom" ${isCustom?'checked':''} style="margin:3px 0 0"
                   onchange="document.getElementById('permalink_structure').value=document.getElementById('custom_structure').value">
            <span>
              <span style="font-weight:500;display:block;margin-bottom:6px">Custom Structure</span>
              <input type="text" id="custom_structure" name="custom_structure"
                     value="${esc(isCustom ? current : '')}"
                     placeholder="/%year%/%monthnum%/%postname%/"
                     style="width:360px;padding:8px 10px;border:1px solid #ccc;border-radius:4px"
                     oninput="document.querySelector('[name=selection][value=custom]').checked=true;document.getElementById('permalink_structure').value=this.value">
              <p style="color:#888;font-size:12px;margin:4px 0 0">Tags: %year% %monthnum% %day% %hour% %minute% %second% %post_id% %postname% %category% %author%</p>
            </span>
          </label>
        </td>
      </tr>
    </table>

    <h2 style="font-size:16px;border-bottom:1px solid #eee;padding-bottom:8px">Optional</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr style="border-bottom:1px solid #f0f0f0">
        <th style="text-align:left;padding:12px 0;font-weight:500;width:180px">Category base</th>
        <td style="padding:12px 0 12px 20px">
          <span style="color:#888;margin-right:4px">${esc(cp.config?.SITE_URL || cp.url?.origin || '')}/</span>
          <input type="text" name="category_base" value="${esc(catBase)}" placeholder="category"
                 style="padding:6px 10px;border:1px solid #ccc;border-radius:4px;width:200px">
        </td>
      </tr>
      <tr>
        <th style="text-align:left;padding:12px 0;font-weight:500">Tag base</th>
        <td style="padding:12px 0 12px 20px">
          <span style="color:#888;margin-right:4px">${esc(cp.config?.SITE_URL || cp.url?.origin || '')}/</span>
          <input type="text" name="tag_base" value="${esc(tagBase)}" placeholder="tag"
                 style="padding:6px 10px;border:1px solid #ccc;border-radius:4px;width:200px">
        </td>
      </tr>
    </table>

    <div><button type="submit" class="cp-btn">Save Changes</button></div>
  </form>
</div>`;

  return new Response(
    await renderAdminShell(cp, content, { title: 'Permalink Settings', notices: notice ? [notice] : [] }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
