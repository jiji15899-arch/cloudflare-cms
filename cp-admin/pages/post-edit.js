/**
 * CloudPress Admin - Post Editor
 * Replaces WordPress wp-admin/post.php + wp-admin/post-new.php
 *
 * Block-editor-inspired JS editor. Saves to D1.
 * Supports WordPress theme/plugin compatibility via standard post data structure.
 *
 * @package CloudPress
 */

import { renderAdminShell } from '../admin-shell.js';

export async function handlePostEdit(request, cp, opts = {}) {
  const url      = cp.url;
  const prefix   = cp.config.DB_PREFIX || 'cp_';
  const method   = request.method.toUpperCase();
  const postType = opts.post_type || url.searchParams.get('post_type') || 'post';
  const postId   = parseInt(url.searchParams.get('post') || url.searchParams.get('page') || '0');

  let post = null;
  let notices = [];

  // Load existing post
  if (postId) {
    post = await cp.db.prepare(
      `SELECT * FROM ${prefix}posts WHERE ID=? AND post_type=? LIMIT 1`
    ).bind(postId, postType).first();
    if (!post) {
      notices.push({ type: 'error', message: 'Post not found.' });
    }
  }

  // Handle save
  if (method === 'POST') {
    const fd = await request.formData().catch(() => new FormData());
    const title    = (fd.get('post_title') || '').trim();
    const content  = fd.get('post_content') || '';
    const excerpt  = fd.get('post_excerpt') || '';
    const status   = fd.get('post_status') || 'draft';
    const slug     = (fd.get('post_name') || slugify(title)).trim();
    const now      = new Date().toISOString().replace('T',' ').slice(0,19);
    const authorId = cp.currentUser?.ID || 1;

    if (!postId || !post) {
      // Insert new post
      const result = await cp.db.prepare(`
        INSERT INTO ${prefix}posts
          (post_author, post_date, post_content, post_title, post_excerpt, post_status,
           post_type, post_name, comment_status, ping_status, post_modified, post_date_gmt, post_modified_gmt)
        VALUES (?,?,?,?,?,?,?,?,'open','open',?,?,?)
      `).bind(authorId, now, content, title, excerpt, status, postType, slug, now, now, now).run();

      const newId = result.meta?.last_row_id;
      const redirectType = postType === 'page' ? 'page' : 'post';
      return Response.redirect(
        `${cp.url.origin}/cp-admin/${redirectType}?post=${newId}&message=1`, 302
      );
    } else {
      // Update existing post
      await cp.db.prepare(`
        UPDATE ${prefix}posts SET
          post_title=?, post_content=?, post_excerpt=?, post_status=?,
          post_name=?, post_modified=?, post_modified_gmt=?
        WHERE ID=?
      `).bind(title, content, excerpt, status, slug, now, now, postId).run();

      // Reload
      post = await cp.db.prepare(`SELECT * FROM ${prefix}posts WHERE ID=? LIMIT 1`).bind(postId).first();
      notices.push({ type: 'success', message: 'Post updated.' });
    }
  }

  // GET message notices
  const msg = url.searchParams.get('message');
  if (msg === '1') notices.push({ type: 'success', message: 'Post published.' });

  // Load categories for posts
  let categories = [];
  if (postType === 'post') {
    const cats = await cp.db.prepare(
      `SELECT t.term_id, t.name FROM ${prefix}terms t
       JOIN ${prefix}term_taxonomy tt ON t.term_id = tt.term_id
       WHERE tt.taxonomy = 'category'`
    ).all();
    categories = cats?.results || [];
  }

  const isNew     = !postId || !post;
  const typeLabel = postType === 'page' ? 'Page' : 'Post';
  const listHref  = postType === 'page' ? '/cp-admin/edit?post_type=page' : '/cp-admin/edit';

  const content = `
<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
  <a href="${listHref}" style="color:#2271b1;text-decoration:none;font-size:13px">&larr; All ${typeLabel}s</a>
  ${post && post.post_status === 'publish' ? `<a href="/?p=${post.ID}" target="_blank" class="cp-btn cp-btn-secondary" style="font-size:12px;padding:4px 10px">View ${typeLabel}</a>` : ''}
</div>

<form method="post" id="post-form">
<div style="display:grid;grid-template-columns:1fr 260px;gap:20px;align-items:start">

  <!-- Main Editor -->
  <div>
    <div class="cp-card" style="padding:0;overflow:hidden">
      <input type="text" name="post_title" id="post_title"
             value="${esc(post?.post_title || '')}"
             placeholder="Add title"
             style="width:100%;border:none;padding:20px;font-size:22px;font-weight:600;outline:none;color:#1d2327;border-bottom:1px solid #dcdcde">

      <!-- Simple editor toolbar -->
      <div id="editor-toolbar" style="padding:8px 16px;border-bottom:1px solid #dcdcde;display:flex;gap:4px;flex-wrap:wrap">
        ${['bold','italic','underline','strikeThrough'].map(cmd =>
          `<button type="button" onclick="document.execCommand('${cmd}')" title="${cmd}"
                   style="padding:4px 8px;border:1px solid #dcdcde;border-radius:3px;background:#fff;cursor:pointer;font-size:13px">
            ${{ bold:'<b>B</b>', italic:'<i>I</i>', underline:'<u>U</u>', strikeThrough:'<s>S</s>' }[cmd]}
           </button>`
        ).join('')}
        <span style="border-left:1px solid #dcdcde;margin:0 4px"></span>
        ${['h2','h3'].map(tag =>
          `<button type="button" onclick="wrapSelection('${tag}')" title="${tag.toUpperCase()}"
                   style="padding:4px 8px;border:1px solid #dcdcde;border-radius:3px;background:#fff;cursor:pointer;font-size:13px">
            ${tag.toUpperCase()}
           </button>`
        ).join('')}
        <button type="button" onclick="insertLink()" title="Link"
                style="padding:4px 8px;border:1px solid #dcdcde;border-radius:3px;background:#fff;cursor:pointer;font-size:13px">
          &#128279;
        </button>
        <button type="button" onclick="insertImage()" title="Image"
                style="padding:4px 8px;border:1px solid #dcdcde;border-radius:3px;background:#fff;cursor:pointer;font-size:13px">
          &#128247;
        </button>
        <span style="flex:1"></span>
        <button type="button" id="toggle-html"
                onclick="toggleHtmlMode()"
                style="padding:4px 10px;border:1px solid #dcdcde;border-radius:3px;background:#fff;cursor:pointer;font-size:12px;color:#646970">
          &lt;/&gt; HTML
        </button>
      </div>

      <!-- Visual editor (contenteditable) -->
      <div id="editor-visual" contenteditable="true"
           style="min-height:400px;padding:20px;outline:none;font-size:15px;line-height:1.7;color:#1d2327"
           oninput="syncEditors()">${post?.post_content || ''}</div>

      <!-- HTML editor (hidden by default) -->
      <textarea id="editor-html" name="post_content"
                style="display:none;width:100%;min-height:400px;padding:20px;border:none;
                       font-family:monospace;font-size:13px;resize:vertical;outline:none;color:#1d2327"
                oninput="syncFromHtml()">${esc(post?.post_content || '')}</textarea>
    </div>

    <!-- Excerpt -->
    <div class="cp-card">
      <h3 style="margin:0 0 10px;font-size:14px">Excerpt</h3>
      <textarea name="post_excerpt" rows="3" class="cp-form-textarea" style="max-width:100%"
                placeholder="Write an excerpt (optional)">${esc(post?.post_excerpt || '')}</textarea>
    </div>

    <!-- Slug -->
    <div class="cp-card">
      <h3 style="margin:0 0 10px;font-size:14px">Permalink / Slug</h3>
      <input type="text" name="post_name" class="cp-form-input" style="max-width:100%"
             value="${esc(post?.post_name || '')}"
             placeholder="auto-generated-from-title">
    </div>
  </div>

  <!-- Sidebar -->
  <div>
    <!-- Publish -->
    <div class="cp-card">
      <h3 style="margin:0 0 12px;font-size:14px">Publish</h3>
      <div style="margin-bottom:12px">
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px">Status</label>
        <select name="post_status" class="cp-form-select" style="max-width:100%;width:100%">
          <option value="draft"   ${(post?.post_status||'draft') === 'draft'   ? 'selected' : ''}>Draft</option>
          <option value="publish" ${(post?.post_status) === 'publish' ? 'selected' : ''}>Published</option>
          <option value="private" ${(post?.post_status) === 'private' ? 'selected' : ''}>Private</option>
          <option value="pending" ${(post?.post_status) === 'pending' ? 'selected' : ''}>Pending Review</option>
        </select>
      </div>
      <div style="display:flex;gap:8px">
        <button type="submit" name="post_status" value="draft" class="cp-btn cp-btn-secondary" style="flex:1">Save Draft</button>
        <button type="submit" name="_publish" value="1" class="cp-btn" style="flex:1"
                onclick="document.querySelector('[name=post_status]').value='publish'">
          ${isNew ? 'Publish' : 'Update'}
        </button>
      </div>
      ${post ? `
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid #dcdcde;font-size:12px;color:#646970">
          <div>Created: ${esc(formatDate(post.post_date))}</div>
          <div>Modified: ${esc(formatDate(post.post_modified))}</div>
          <div>Post ID: ${post.ID}</div>
        </div>
      ` : ''}
    </div>

    <!-- Categories (posts only) -->
    ${postType === 'post' && categories.length ? `
    <div class="cp-card">
      <h3 style="margin:0 0 12px;font-size:14px">Categories</h3>
      <div style="max-height:200px;overflow-y:auto">
        ${categories.map(cat => `
          <label style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px;cursor:pointer">
            <input type="checkbox" name="post_category[]" value="${cat.term_id}">
            ${esc(cat.name)}
          </label>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <!-- Featured Image placeholder -->
    <div class="cp-card">
      <h3 style="margin:0 0 12px;font-size:14px">Featured Image</h3>
      <div style="background:#f0f0f1;border:2px dashed #dcdcde;border-radius:4px;padding:20px;text-align:center;color:#646970;font-size:13px">
        <div style="font-size:24px;margin-bottom:8px">&#128247;</div>
        <a href="/cp-admin/upload" style="color:#2271b1">Set featured image</a>
      </div>
    </div>
  </div>
</div>
</form>

<script>
let isHtmlMode = false;

function syncEditors() {
  document.getElementById('editor-html').value = document.getElementById('editor-visual').innerHTML;
}
function syncFromHtml() {
  document.getElementById('editor-visual').innerHTML = document.getElementById('editor-html').value;
}
function toggleHtmlMode() {
  isHtmlMode = !isHtmlMode;
  document.getElementById('editor-visual').style.display = isHtmlMode ? 'none' : 'block';
  document.getElementById('editor-html').style.display   = isHtmlMode ? 'block' : 'none';
  document.getElementById('toggle-html').style.background = isHtmlMode ? '#e0e0e0' : '#fff';
  if (!isHtmlMode) syncFromHtml();
}
function wrapSelection(tag) {
  const sel = window.getSelection();
  if (sel.rangeCount) {
    const range = sel.getRangeAt(0);
    const el = document.createElement(tag);
    range.surroundContents(el);
    syncEditors();
  }
}
function insertLink() {
  const url = prompt('Enter URL:');
  if (url) document.execCommand('createLink', false, url);
  syncEditors();
}
function insertImage() {
  const src = prompt('Enter image URL:');
  if (src) document.execCommand('insertHTML', false, '<img src="'+src+'" style="max-width:100%">');
  syncEditors();
}

// Sync before submit
document.getElementById('post-form').addEventListener('submit', function() {
  if (!isHtmlMode) syncEditors();
});

// Auto-generate slug from title
document.getElementById('post_title').addEventListener('blur', function() {
  const slugField = document.querySelector('[name=post_name]');
  if (!slugField.value && this.value) {
    slugField.value = this.value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  }
});
</script>
`;

  const html = await renderAdminShell(cp, content, { title: isNew ? `New ${typeLabel}` : `Edit ${typeLabel}`, notices });
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleString(); } catch (_) { return d; }
}
function slugify(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
