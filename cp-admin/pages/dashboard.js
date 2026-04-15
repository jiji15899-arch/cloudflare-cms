/**
 * CloudPress Admin Dashboard
 * Replaces WordPress wp-admin/index.php
 *
 * @package CloudPress
 */

import { renderAdminShell } from '../admin-shell.js';
import { getOption }        from '../../cp-includes/option.js';

export async function handleDashboard(request, cp) {
  const prefix = cp.config.DB_PREFIX || 'cp_';

  // Fetch stats from D1
  const [postCount, pageCount, commentCount, userCount] = await Promise.all([
    cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}posts WHERE post_type='post' AND post_status='publish'`).first(),
    cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}posts WHERE post_type='page' AND post_status='publish'`).first(),
    cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}comments WHERE comment_approved='1'`).first(),
    cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}users`).first(),
  ]);

  // Recent posts
  const recentPosts = await cp.db.prepare(
    `SELECT ID, post_title, post_status, post_date FROM ${prefix}posts
     WHERE post_type='post' ORDER BY post_date DESC LIMIT 5`
  ).all();

  // Recent comments
  const recentComments = await cp.db.prepare(
    `SELECT c.comment_ID, c.comment_author, c.comment_content, c.comment_approved, c.comment_date,
            p.post_title
     FROM ${prefix}comments c
     LEFT JOIN ${prefix}posts p ON c.comment_post_ID = p.ID
     ORDER BY c.comment_date DESC LIMIT 5`
  ).all();

  const siteName = await getOption(cp, 'blogname').catch(() => 'CloudPress');
  const siteUrl  = await getOption(cp, 'siteurl').catch(() => '/');
  const user     = cp.currentUser;

  const content = `
<div class="cp-dash-grid">
  <div class="cp-dash-stat">
    <div class="cp-dash-stat-icon">&#128221;</div>
    <div>
      <div class="cp-dash-stat-num">${postCount?.n ?? 0}</div>
      <div class="cp-dash-stat-label">Published Posts</div>
    </div>
  </div>
  <div class="cp-dash-stat">
    <div class="cp-dash-stat-icon">&#128196;</div>
    <div>
      <div class="cp-dash-stat-num">${pageCount?.n ?? 0}</div>
      <div class="cp-dash-stat-label">Pages</div>
    </div>
  </div>
  <div class="cp-dash-stat">
    <div class="cp-dash-stat-icon">&#128172;</div>
    <div>
      <div class="cp-dash-stat-num">${commentCount?.n ?? 0}</div>
      <div class="cp-dash-stat-label">Comments</div>
    </div>
  </div>
  <div class="cp-dash-stat">
    <div class="cp-dash-stat-icon">&#128101;</div>
    <div>
      <div class="cp-dash-stat-num">${userCount?.n ?? 0}</div>
      <div class="cp-dash-stat-label">Users</div>
    </div>
  </div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">

  <!-- Quick Actions -->
  <div class="cp-card">
    <h2>Quick Actions</h2>
    <div style="display:flex;flex-direction:column;gap:8px">
      <a href="/cp-admin/post-new" class="cp-btn" style="justify-content:center">&#43; New Post</a>
      <a href="/cp-admin/page-new" class="cp-btn cp-btn-secondary" style="justify-content:center">&#43; New Page</a>
      <a href="/cp-admin/upload" class="cp-btn cp-btn-secondary" style="justify-content:center">&#43; Upload Media</a>
      <a href="/cp-admin/github-sync" class="cp-btn cp-btn-secondary" style="justify-content:center">&#127758; GitHub Sync</a>
    </div>
  </div>

  <!-- At a Glance -->
  <div class="cp-card">
    <h2>Site Info</h2>
    <table style="width:100%;font-size:13px;border-collapse:collapse">
      <tr><td style="padding:5px 0;color:#646970">Site</td><td><a href="${esc(siteUrl)}" target="_blank">${esc(siteName)}</a></td></tr>
      <tr><td style="padding:5px 0;color:#646970">CloudPress Version</td><td>${esc(cp.version || '1.0.0')}</td></tr>
      <tr><td style="padding:5px 0;color:#646970">Logged in as</td><td>${esc(user?.display_name || user?.user_login || '')}</td></tr>
      <tr><td style="padding:5px 0;color:#646970">Role</td><td><span class="cp-badge cp-badge-publish">${esc((user?.roles || ['administrator'])[0])}</span></td></tr>
      <tr><td style="padding:5px 0;color:#646970">Platform</td><td>Cloudflare Workers + D1 + KV</td></tr>
    </table>
  </div>

</div>

<!-- Recent Posts -->
<div class="cp-card">
  <h2>Recent Posts</h2>
  ${(recentPosts?.results || []).length ? `
  <div class="cp-table-wrap">
    <table class="cp-table">
      <thead><tr><th>Title</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
      <tbody>
        ${(recentPosts.results || []).map(p => `
          <tr>
            <td><a href="/cp-admin/post?post=${p.ID}">${esc(p.post_title || '(no title)')}</a></td>
            <td><span class="cp-badge cp-badge-${p.post_status}">${esc(p.post_status)}</span></td>
            <td>${esc(formatDate(p.post_date))}</td>
            <td>
              <a href="/cp-admin/post?post=${p.ID}" class="cp-btn cp-btn-secondary" style="padding:3px 10px;font-size:12px">Edit</a>
              <a href="/?p=${p.ID}" target="_blank" class="cp-btn cp-btn-secondary" style="padding:3px 10px;font-size:12px">View</a>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : '<p style="color:#646970">No posts yet. <a href="/cp-admin/post-new">Write your first post</a>.</p>'}
</div>

<!-- Recent Comments -->
<div class="cp-card">
  <h2>Recent Comments</h2>
  ${(recentComments?.results || []).length ? `
  <div class="cp-table-wrap">
    <table class="cp-table">
      <thead><tr><th>Author</th><th>Comment</th><th>Post</th><th>Status</th></tr></thead>
      <tbody>
        ${(recentComments.results || []).map(c => `
          <tr>
            <td>${esc(c.comment_author)}</td>
            <td>${esc(truncate(c.comment_content, 60))}</td>
            <td>${esc(c.post_title || '')}</td>
            <td><span class="cp-badge ${c.comment_approved === '1' ? 'cp-badge-publish' : 'cp-badge-pending'}">${c.comment_approved === '1' ? 'Approved' : 'Pending'}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : '<p style="color:#646970">No comments yet.</p>'}
</div>
`;

  const html = await renderAdminShell(cp, content, { title: 'Dashboard' });
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try { return new Date(dateStr).toLocaleDateString(); } catch (_) { return dateStr; }
}

function truncate(str, n) {
  if (!str) return '';
  return str.length > n ? str.slice(0, n) + '...' : str;
}
