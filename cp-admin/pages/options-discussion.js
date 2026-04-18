/**
 * CloudPress Admin - Discussion Settings
 * Replaces WordPress wp-admin/options-discussion.php
 * @package CloudPress
 */

import { renderAdminShell } from '../admin-shell.js';
import { getOption, updateOption } from '../../cp-includes/option.js';

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const KEYS_DISCUSSION = [
  'default_pingback_flag','default_ping_status','default_comment_status',
  'require_name_email','comment_registration','close_comments_for_old_posts',
  'close_comments_days_old','thread_comments','thread_comments_depth',
  'page_comments','comments_per_page','default_comments_page',
  'comment_order','comments_notify','moderation_notify',
  'comment_moderation','comment_previously_approved',
  'comment_max_links','moderation_keys','disallowed_keys',
  'show_avatars','avatar_rating','avatar_default',
];

const CHECKBOX_KEYS = [
  'default_pingback_flag','default_ping_status','default_comment_status',
  'require_name_email','comment_registration','close_comments_for_old_posts',
  'thread_comments','page_comments','comments_notify','moderation_notify',
  'comment_moderation','comment_previously_approved','show_avatars',
];

export async function handleOptionsDiscussion(request, cp) {
  const method = request.method.toUpperCase();
  let notice   = null;

  if (method === 'POST') {
    const fd = await request.formData().catch(() => new FormData());
    for (const key of KEYS_DISCUSSION) {
      if (CHECKBOX_KEYS.includes(key)) {
        await updateOption(cp, key, fd.get(key) ? '1' : '0');
      } else {
        const val = fd.get(key);
        if (val !== null) await updateOption(cp, key, val.trim());
      }
    }
    notice = { type: 'success', message: 'Settings saved.' };
  }

  const v = {};
  for (const key of KEYS_DISCUSSION) {
    v[key] = await getOption(cp, key, '').catch(() => '');
  }

  function chk(key) { return v[key]==='1'?'checked':''; }

  const content = `
<div class="cp-card" style="max-width:720px">
  <h1>Discussion Settings</h1>
  <form method="post" style="margin-top:16px">

    <h2 style="font-size:16px;border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:0">Default post settings</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr style="border-bottom:1px solid #eee"><td style="padding:12px 0">
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="default_pingback_flag" value="1" ${chk('default_pingback_flag')}> Attempt to notify any blogs linked to from the article</label>
      </td></tr>
      <tr style="border-bottom:1px solid #eee"><td style="padding:12px 0">
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="default_ping_status" value="1" ${chk('default_ping_status')}> Allow link notifications from other blogs (pingbacks and trackbacks) on new posts</label>
      </td></tr>
      <tr><td style="padding:12px 0">
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="default_comment_status" value="1" ${chk('default_comment_status')}> Allow people to submit comments on new posts</label>
      </td></tr>
    </table>

    <h2 style="font-size:16px;border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:0">Other comment settings</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr style="border-bottom:1px solid #eee"><td style="padding:12px 0">
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="require_name_email" value="1" ${chk('require_name_email')}> Comment author must fill out name and email</label>
      </td></tr>
      <tr style="border-bottom:1px solid #eee"><td style="padding:12px 0">
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="comment_registration" value="1" ${chk('comment_registration')}> Users must be registered and logged in to comment</label>
      </td></tr>
      <tr style="border-bottom:1px solid #eee"><td style="padding:12px 0">
        <label style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" name="close_comments_for_old_posts" value="1" ${chk('close_comments_for_old_posts')}>
          Automatically close comments on posts older than
          <input type="number" name="close_comments_days_old" value="${esc(v.close_comments_days_old||'14')}" min="1" style="width:60px;padding:4px 6px;border:1px solid #ccc;border-radius:4px;margin:0 4px"> days
        </label>
      </td></tr>
      <tr style="border-bottom:1px solid #eee"><td style="padding:12px 0">
        <label style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" name="thread_comments" value="1" ${chk('thread_comments')}>
          Enable threaded (nested) comments
          <input type="number" name="thread_comments_depth" value="${esc(v.thread_comments_depth||'5')}" min="2" max="10" style="width:50px;padding:4px 6px;border:1px solid #ccc;border-radius:4px;margin:0 4px"> levels deep
        </label>
      </td></tr>
      <tr><td style="padding:12px 0">
        <label style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" name="page_comments" value="1" ${chk('page_comments')}>
          Break comments into pages with
          <input type="number" name="comments_per_page" value="${esc(v.comments_per_page||'50')}" min="1" style="width:60px;padding:4px 6px;border:1px solid #ccc;border-radius:4px;margin:0 4px"> comments per page
        </label>
      </td></tr>
    </table>

    <h2 style="font-size:16px;border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:0">Email me whenever</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr style="border-bottom:1px solid #eee"><td style="padding:12px 0">
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="comments_notify" value="1" ${chk('comments_notify')}> Anyone posts a comment</label>
      </td></tr>
      <tr><td style="padding:12px 0">
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="moderation_notify" value="1" ${chk('moderation_notify')}> A comment is held for moderation</label>
      </td></tr>
    </table>

    <h2 style="font-size:16px;border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:0">Before a comment appears</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr style="border-bottom:1px solid #eee"><td style="padding:12px 0">
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="comment_moderation" value="1" ${chk('comment_moderation')}> Comment must be manually approved</label>
      </td></tr>
      <tr><td style="padding:12px 0">
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="comment_previously_approved" value="1" ${chk('comment_previously_approved')}> Comment author must have a previously approved comment</label>
      </td></tr>
    </table>

    <h2 style="font-size:16px;border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:0">Comment Moderation</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr><td style="padding:12px 0">
        <label style="display:block;margin-bottom:6px">Hold a comment if it contains
          <input type="number" name="comment_max_links" value="${esc(v.comment_max_links||'2')}" min="0" style="width:55px;padding:4px 6px;border:1px solid #ccc;border-radius:4px;margin:0 4px"> or more links
        </label>
        <label style="display:block;margin-bottom:4px;font-weight:500;margin-top:10px">Comment blocklist</label>
        <textarea name="disallowed_keys" rows="5" style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;resize:vertical;font-size:12px">${esc(v.disallowed_keys)}</textarea>
        <p style="color:#888;font-size:12px;margin:4px 0 0">One word or IP per line. Comments containing these will be blocked.</p>
      </td></tr>
    </table>

    <h2 style="font-size:16px;border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:0">Avatars</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr style="border-bottom:1px solid #eee"><td style="padding:12px 0">
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="show_avatars" value="1" ${chk('show_avatars')}> Show Avatars</label>
      </td></tr>
    </table>

    <div><button type="submit" class="cp-btn">Save Changes</button></div>
  </form>
</div>`;

  return new Response(
    await renderAdminShell(cp, content, { title: 'Discussion Settings', notices: notice ? [notice] : [] }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
