/**
 * CloudPress Admin - Export
 * Replaces WordPress wp-admin/export.php
 * Exports as CloudPress JSON or WordPress WXR XML.
 * @package CloudPress
 */

import { renderAdminShell } from '../admin-shell.js';

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escXml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
function cdata(str) { return `<![CDATA[${String(str ?? '')}]]>`; }

export async function handleExport(request, cp) {
  const url    = new URL(request.url);
  const format = url.searchParams.get('format') || '';
  const prefix = cp.db_prefix || 'cp_';

  // -- Perform export ----------------------------------------------------------
  if (format === 'json' || format === 'wxr') {
    const postType = url.searchParams.get('post_type') || 'all';
    const status   = url.searchParams.get('status') || 'all';

    const conditions = [];
    const params     = [];

    if (postType !== 'all') { conditions.push(`post_type=?`); params.push(postType); }
    else { conditions.push(`post_type IN ('post','page')`); }
    if (status !== 'all') { conditions.push(`post_status=?`); params.push(status); }
    else { conditions.push(`post_status != 'trash'`); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const posts = await cp.db.prepare(
      `SELECT p.*, u.user_login as author_login, u.user_email as author_email, u.display_name as author_display
       FROM ${prefix}posts p
       LEFT JOIN ${prefix}users u ON u.ID = p.post_author
       ${where} ORDER BY p.post_date ASC`
    ).bind(...params).all();

    const allPosts  = posts.results || [];
    const postIds   = allPosts.map(p => p.ID);

    // Comments for exported posts
    let allComments = [];
    if (postIds.length) {
      const placeholders = postIds.map(() => '?').join(',');
      const cRes = await cp.db.prepare(
        `SELECT * FROM ${prefix}comments WHERE comment_post_ID IN (${placeholders}) ORDER BY comment_date ASC`
      ).bind(...postIds).all();
      allComments = cRes.results || [];
    }

    // Users
    const userRes = await cp.db.prepare(`SELECT ID, user_login, user_email, display_name, user_registered FROM ${prefix}users`).all();
    const users   = userRes.results || [];

    // Terms
    const termRes = await cp.db.prepare(
      `SELECT t.term_id, t.name, t.slug, tt.taxonomy
       FROM ${prefix}terms t JOIN ${prefix}term_taxonomy tt ON tt.term_id=t.term_id`
    ).all();
    const terms = termRes.results || [];

    const siteUrl  = cp.config?.SITE_URL || cp.url?.origin || '';
    const siteName = cp.config?.SITE_NAME || 'CloudPress Site';
    const now      = new Date().toISOString();

    if (format === 'json') {
      const data = { exported_at: now, site_url: siteUrl, site_name: siteName, posts: allPosts, users, terms, comments: allComments };
      return new Response(JSON.stringify(data, null, 2), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="cloudpress-export-${now.slice(0,10)}.json"`,
        },
      });
    }

    // WXR XML
    const commentsById = {};
    for (const c of allComments) {
      const pid = c.comment_post_ID;
      if (!commentsById[pid]) commentsById[pid] = [];
      commentsById[pid].push(c);
    }

    const userXml = users.map(u => `
    <wp:author>
      <wp:author_id>${u.ID}</wp:author_id>
      <wp:author_login>${cdata(u.user_login)}</wp:author_login>
      <wp:author_email>${cdata(u.user_email)}</wp:author_email>
      <wp:author_display_name>${cdata(u.display_name)}</wp:author_display_name>
    </wp:author>`).join('');

    const catXml = terms.filter(t=>t.taxonomy==='category').map(t => `
    <wp:category>
      <wp:term_id>${t.term_id}</wp:term_id>
      <wp:category_nicename>${cdata(t.slug)}</wp:category_nicename>
      <wp:cat_name>${cdata(t.name)}</wp:cat_name>
    </wp:category>`).join('');

    const tagXml = terms.filter(t=>t.taxonomy==='post_tag').map(t => `
    <wp:tag>
      <wp:term_id>${t.term_id}</wp:term_id>
      <wp:tag_slug>${cdata(t.slug)}</wp:tag_slug>
      <wp:tag_name>${cdata(t.name)}</wp:tag_name>
    </wp:tag>`).join('');

    const itemsXml = allPosts.map(p => {
      const comments = (commentsById[p.ID] || []).map(c => `
        <wp:comment>
          <wp:comment_id>${c.comment_ID}</wp:comment_id>
          <wp:comment_author>${cdata(c.comment_author)}</wp:comment_author>
          <wp:comment_author_email>${cdata(c.comment_author_email)}</wp:comment_author_email>
          <wp:comment_author_url>${cdata(c.comment_author_url)}</wp:comment_author_url>
          <wp:comment_date>${cdata(c.comment_date)}</wp:comment_date>
          <wp:comment_content>${cdata(c.comment_content)}</wp:comment_content>
          <wp:comment_approved>${cdata(c.comment_approved)}</wp:comment_approved>
        </wp:comment>`).join('');
      return `
    <item>
      <title>${cdata(p.post_title)}</title>
      <link>${escXml(siteUrl)}/?p=${p.ID}</link>
      <pubDate>${new Date(p.post_date).toUTCString()}</pubDate>
      <dc:creator>${cdata(p.author_login)}</dc:creator>
      <content:encoded>${cdata(p.post_content)}</content:encoded>
      <excerpt:encoded>${cdata(p.post_excerpt)}</excerpt:encoded>
      <wp:post_id>${p.ID}</wp:post_id>
      <wp:post_date>${cdata(p.post_date)}</wp:post_date>
      <wp:post_modified>${cdata(p.post_modified)}</wp:post_modified>
      <wp:comment_status>${cdata(p.comment_status)}</wp:comment_status>
      <wp:ping_status>${cdata(p.ping_status)}</wp:ping_status>
      <wp:post_name>${cdata(p.post_name)}</wp:post_name>
      <wp:status>${cdata(p.post_status)}</wp:status>
      <wp:post_type>${cdata(p.post_type)}</wp:post_type>
      ${comments}
    </item>`;
    }).join('');

    const wxr = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:wfw="http://wellformedweb.org/CommentAPI/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:wp="http://wordpress.org/export/1.2/">
  <channel>
    <title>${cdata(siteName)}</title>
    <link>${escXml(siteUrl)}</link>
    <description></description>
    <pubDate>${new Date().toUTCString()}</pubDate>
    <language>ko-KR</language>
    <wp:wxr_version>1.2</wp:wxr_version>
    <wp:base_site_url>${escXml(siteUrl)}</wp:base_site_url>
    <wp:base_blog_url>${escXml(siteUrl)}</wp:base_blog_url>
    ${userXml}${catXml}${tagXml}${itemsXml}
  </channel>
</rss>`;

    return new Response(wxr, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="cloudpress-export-${now.slice(0,10)}.xml"`,
      },
    });
  }

  // -- Export UI ---------------------------------------------------------------
  const content = `
<div class="cp-card" style="max-width:640px">
  <h1>Export</h1>
  <p style="color:#666;margin-bottom:20px">Export your content in CloudPress JSON or WordPress WXR (XML) format.</p>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">

    <!-- JSON Export -->
    <div style="border:1px solid #ddd;border-radius:8px;padding:20px">
      <h2 style="margin:0 0 8px;font-size:17px">&#128196; CloudPress JSON</h2>
      <p style="color:#666;font-size:13px;margin:0 0 16px">Export all content as a JSON file. Use this to import into another CloudPress site.</p>
      <form method="get">
        <input type="hidden" name="format" value="json">
        <div style="display:grid;gap:10px">
          <div>
            <label style="display:block;margin-bottom:4px;font-size:13px;font-weight:500">Content Type</label>
            <select name="post_type" style="width:100%;padding:7px 10px;border:1px solid #ccc;border-radius:4px;background:#fff">
              <option value="all">All content</option>
              <option value="post">Posts only</option>
              <option value="page">Pages only</option>
            </select>
          </div>
          <div>
            <label style="display:block;margin-bottom:4px;font-size:13px;font-weight:500">Status</label>
            <select name="status" style="width:100%;padding:7px 10px;border:1px solid #ccc;border-radius:4px;background:#fff">
              <option value="all">All statuses</option>
              <option value="publish">Published</option>
              <option value="draft">Draft</option>
            </select>
          </div>
          <button type="submit" class="cp-btn">&#8595; Download JSON</button>
        </div>
      </form>
    </div>

    <!-- WXR Export -->
    <div style="border:1px solid #ddd;border-radius:8px;padding:20px">
      <h2 style="margin:0 0 8px;font-size:17px">&#128196; WordPress WXR</h2>
      <p style="color:#666;font-size:13px;margin:0 0 16px">Export as WordPress XML format. Import this into a WordPress site.</p>
      <form method="get">
        <input type="hidden" name="format" value="wxr">
        <div style="display:grid;gap:10px">
          <div>
            <label style="display:block;margin-bottom:4px;font-size:13px;font-weight:500">Content Type</label>
            <select name="post_type" style="width:100%;padding:7px 10px;border:1px solid #ccc;border-radius:4px;background:#fff">
              <option value="all">All content</option>
              <option value="post">Posts only</option>
              <option value="page">Pages only</option>
            </select>
          </div>
          <div>
            <label style="display:block;margin-bottom:4px;font-size:13px;font-weight:500">Status</label>
            <select name="status" style="width:100%;padding:7px 10px;border:1px solid #ccc;border-radius:4px;background:#fff">
              <option value="all">All statuses</option>
              <option value="publish">Published</option>
              <option value="draft">Draft</option>
            </select>
          </div>
          <button type="submit" class="cp-btn">&#8595; Download XML</button>
        </div>
      </form>
    </div>

  </div>
</div>`;

  return new Response(
    await renderAdminShell(cp, content, { title: 'Export' }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
