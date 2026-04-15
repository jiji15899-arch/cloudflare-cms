/**
 * CloudPress Admin - Reading Settings
 * Replaces WordPress wp-admin/options-reading.php
 * @package CloudPress
 */

import { renderAdminShell } from '../admin-shell.js';
import { getOption, updateOption } from '../../cp-includes/option.js';

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export async function handleOptionsReading(request, cp) {
  const method = request.method.toUpperCase();
  let notice   = null;
  const prefix = cp.db_prefix || 'cp_';

  const keys = ['show_on_front','page_on_front','page_for_posts','posts_per_page','posts_per_rss','rss_use_excerpt','blog_public'];

  if (method === 'POST') {
    const fd = await request.formData().catch(() => new FormData());
    for (const key of keys) {
      const val = fd.get(key);
      if (val !== null) await updateOption(cp, key, val.trim());
    }
    // checkboxes
    await updateOption(cp, 'blog_public', fd.get('blog_public') ? '1' : '0');
    await updateOption(cp, 'rss_use_excerpt', fd.get('rss_use_excerpt') ? '1' : '0');
    notice = { type: 'success', message: 'Settings saved.' };
  }

  const vals = {};
  for (const key of keys) {
    vals[key] = await getOption(cp, key, '').catch(() => '');
  }

  // Pages for dropdown
  let pages = [];
  try {
    const res = await cp.db.prepare(
      `SELECT ID, post_title FROM ${prefix}posts WHERE post_type='page' AND post_status='publish' ORDER BY post_title ASC`
    ).all();
    pages = res.results || [];
  } catch (_) {}

  const pageOpts = (selected) => pages.map(p =>
    `<option value="${esc(p.ID)}"${String(selected)===String(p.ID)?' selected':''}>${esc(p.post_title)}</option>`
  ).join('');

  const showOnFront = vals.show_on_front || 'posts';

  const content = `
<div class="cp-card" style="max-width:700px">
  <h1>Reading Settings</h1>
  <form method="post" style="margin-top:16px">
    <table style="width:100%;border-collapse:collapse">
      <tbody>

        <tr style="border-bottom:1px solid #eee">
          <th style="width:200px;text-align:left;padding:14px 0;font-weight:500;vertical-align:top">Your homepage displays</th>
          <td style="padding:14px 0 14px 20px">
            <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
              <input type="radio" name="show_on_front" value="posts" ${showOnFront==='posts'?'checked':''}>
              Your latest posts
            </label>
            <label style="display:flex;align-items:center;gap:8px">
              <input type="radio" name="show_on_front" value="page" ${showOnFront==='page'?'checked':''}>
              A static page
            </label>
            <div style="margin-top:10px;padding-left:24px;display:grid;gap:8px">
              <div>
                <label style="font-size:13px;color:#555">Homepage: </label>
                <select name="page_on_front" style="padding:6px 8px;border:1px solid #ccc;border-radius:4px;background:#fff">
                  <option value="">-- Select --</option>
                  ${pageOpts(vals.page_on_front)}
                </select>
              </div>
              <div>
                <label style="font-size:13px;color:#555">Posts page: </label>
                <select name="page_for_posts" style="padding:6px 8px;border:1px solid #ccc;border-radius:4px;background:#fff">
                  <option value="">-- Select --</option>
                  ${pageOpts(vals.page_for_posts)}
                </select>
              </div>
            </div>
          </td>
        </tr>

        <tr style="border-bottom:1px solid #eee">
          <th style="text-align:left;padding:14px 0;font-weight:500">Blog pages show at most</th>
          <td style="padding:14px 0 14px 20px">
            <input type="number" name="posts_per_page" value="${esc(vals.posts_per_page||'10')}" min="1" max="100"
                   style="padding:8px 10px;border:1px solid #ccc;border-radius:4px;width:70px"> posts
          </td>
        </tr>

        <tr style="border-bottom:1px solid #eee">
          <th style="text-align:left;padding:14px 0;font-weight:500">Syndication feeds show the most recent</th>
          <td style="padding:14px 0 14px 20px">
            <input type="number" name="posts_per_rss" value="${esc(vals.posts_per_rss||'10')}" min="1" max="100"
                   style="padding:8px 10px;border:1px solid #ccc;border-radius:4px;width:70px"> items
          </td>
        </tr>

        <tr style="border-bottom:1px solid #eee">
          <th style="text-align:left;padding:14px 0;font-weight:500;vertical-align:top">For each post in a feed, include</th>
          <td style="padding:14px 0 14px 20px">
            <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <input type="radio" name="rss_use_excerpt" value="0" ${vals.rss_use_excerpt==='0'||!vals.rss_use_excerpt?'checked':''}>
              Full text
            </label>
            <label style="display:flex;align-items:center;gap:8px">
              <input type="radio" name="rss_use_excerpt" value="1" ${vals.rss_use_excerpt==='1'?'checked':''}>
              Excerpt
            </label>
          </td>
        </tr>

        <tr>
          <th style="text-align:left;padding:14px 0;font-weight:500;vertical-align:top">Search engine visibility</th>
          <td style="padding:14px 0 14px 20px">
            <label style="display:flex;align-items:flex-start;gap:8px">
              <input type="checkbox" name="blog_public" value="0" ${vals.blog_public==='0'?'checked':''} style="margin-top:3px">
              <span>Discourage search engines from indexing this site
                <span style="display:block;color:#888;font-size:12px;margin-top:2px">It is up to search engines to honor this request.</span>
              </span>
            </label>
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
    await renderAdminShell(cp, content, { title: 'Reading Settings', notices: notice ? [notice] : [] }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
