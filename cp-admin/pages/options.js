/**
 * CloudPress Admin – Options (Settings overview)
 * Replaces WordPress wp-admin/options.php
 * @package CloudPress
 */

import { renderAdminShell } from '../admin-shell.js';

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export async function handleOptions(request, cp) {
  const content = `
<div class="cp-card">
  <h1>Settings</h1>
  <p style="color:#666;margin-bottom:24px">Manage your CloudPress site settings.</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px">

    <a href="/cp-admin/options-general" style="display:block;padding:20px;background:#f9f9f9;border:1px solid #ddd;border-radius:8px;text-decoration:none;color:inherit;transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,.1)'" onmouseout="this.style.boxShadow=''">
      <div style="font-size:2rem;margin-bottom:8px">&#9881;&#65039;</div>
      <strong>General</strong>
      <p style="color:#888;font-size:13px;margin:4px 0 0">Site title, tagline, URL, email, timezone.</p>
    </a>

    <a href="/cp-admin/options-writing" style="display:block;padding:20px;background:#f9f9f9;border:1px solid #ddd;border-radius:8px;text-decoration:none;color:inherit;transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,.1)'" onmouseout="this.style.boxShadow=''">
      <div style="font-size:2rem;margin-bottom:8px">&#128221;</div>
      <strong>Writing</strong>
      <p style="color:#888;font-size:13px;margin:4px 0 0">Default post category, post format, editor settings.</p>
    </a>

    <a href="/cp-admin/options-reading" style="display:block;padding:20px;background:#f9f9f9;border:1px solid #ddd;border-radius:8px;text-decoration:none;color:inherit;transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,.1)'" onmouseout="this.style.boxShadow=''">
      <div style="font-size:2rem;margin-bottom:8px">&#128214;</div>
      <strong>Reading</strong>
      <p style="color:#888;font-size:13px;margin:4px 0 0">Front page, blog page, posts per page, feed.</p>
    </a>

    <a href="/cp-admin/options-discussion" style="display:block;padding:20px;background:#f9f9f9;border:1px solid #ddd;border-radius:8px;text-decoration:none;color:inherit;transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,.1)'" onmouseout="this.style.boxShadow=''">
      <div style="font-size:2rem;margin-bottom:8px">&#128172;</div>
      <strong>Discussion</strong>
      <p style="color:#888;font-size:13px;margin:4px 0 0">Comment moderation, notifications, avatars.</p>
    </a>

    <a href="/cp-admin/options-media" style="display:block;padding:20px;background:#f9f9f9;border:1px solid #ddd;border-radius:8px;text-decoration:none;color:inherit;transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,.1)'" onmouseout="this.style.boxShadow=''">
      <div style="font-size:2rem;margin-bottom:8px">&#128247;</div>
      <strong>Media</strong>
      <p style="color:#888;font-size:13px;margin:4px 0 0">Image sizes, upload settings.</p>
    </a>

    <a href="/cp-admin/options-permalink" style="display:block;padding:20px;background:#f9f9f9;border:1px solid #ddd;border-radius:8px;text-decoration:none;color:inherit;transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,.1)'" onmouseout="this.style.boxShadow=''">
      <div style="font-size:2rem;margin-bottom:8px">&#128279;</div>
      <strong>Permalinks</strong>
      <p style="color:#888;font-size:13px;margin:4px 0 0">URL structure for posts and pages.</p>
    </a>

  </div>
</div>`;

  return new Response(
    await renderAdminShell(cp, content, { title: 'Settings' }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
