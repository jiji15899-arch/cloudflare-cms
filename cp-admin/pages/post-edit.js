/**
 * CloudPress Admin - Post / Page Editor
 * Replaces WordPress wp-admin/post.php + wp-admin/post-new.php
 *
 * 변경사항:
 *  - 워드프레스식 메타박스 시스템 구현
 *    · 상단: 제목 입력 + 퍼마링크
 *    · 에디터 아래: 사용자 정의 필드(Custom Fields) 메타박스
 *    · 우측 사이드바: Publish / 카테고리 / 태그 / 특성 이미지 / 페이지 속성 메타박스
 *    · 메타박스 접기/펼치기 가능 (WP 동일 UX)
 *    · 메타박스 순서 drag 없이 CSS order로 관리
 *  - postmeta (커스텀 필드) CRUD 지원
 *  - 언어에 따른 레이블 (WPLANG 옵션 반영)
 *
 * @package CloudPress
 */

import { renderAdminShell } from '../admin-shell.js';
import { getOption }        from '../../cp-includes/option.js';

export async function handlePostEdit(request, cp, opts = {}) {
  const url      = cp.url;
  const prefix   = cp.config.DB_PREFIX || 'cp_';
  const method   = request.method.toUpperCase();
  const postType = opts.post_type || url.searchParams.get('post_type') || 'post';
  const postId   = parseInt(url.searchParams.get('post') || url.searchParams.get('page') || '0');
  const lang     = await getOption(cp, 'WPLANG').catch(() => 'ko_KR') || 'ko_KR';
  const L        = getLabels(lang);

  let post    = null;
  let notices = [];

  // 기존 포스트 로드
  if (postId) {
    post = await cp.db.prepare(
      `SELECT * FROM ${prefix}posts WHERE ID=? AND post_type=? LIMIT 1`
    ).bind(postId, postType).first();
    if (!post) notices.push({ type: 'error', message: L.postNotFound });
  }

  // ── POST 저장 처리 ──────────────────────────────────────
  if (method === 'POST') {
    const fd       = await request.formData().catch(() => new FormData());
    const title    = (fd.get('post_title') || '').trim();
    const content  = fd.get('post_content') || '';
    const excerpt  = fd.get('post_excerpt') || '';
    const status   = fd.get('post_status') || 'draft';
    const slug     = (fd.get('post_name') || slugify(title)).trim();
    const now      = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const authorId = cp.currentUser?.ID || 1;

    // postmeta 저장 (커스텀 필드)
    const metaKeys   = fd.getAll('meta_key[]');
    const metaValues = fd.getAll('meta_value[]');
    const metaIds    = fd.getAll('meta_id[]');

    let savedPostId = postId;

    if (!postId || !post) {
      const result = await cp.db.prepare(`
        INSERT INTO ${prefix}posts
          (post_author, post_date, post_content, post_title, post_excerpt, post_status,
           post_type, post_name, comment_status, ping_status, post_modified, post_date_gmt, post_modified_gmt)
        VALUES (?,?,?,?,?,?,?,?,'open','open',?,?,?)
      `).bind(authorId, now, content, title, excerpt, status, postType, slug, now, now, now).run();

      savedPostId = result.meta?.last_row_id;
      const redirectType = postType === 'page' ? 'page' : 'post';
      // 메타 저장 후 리다이렉트
      await savePostMeta(cp, prefix, savedPostId, metaIds, metaKeys, metaValues);
      return Response.redirect(
        `${cp.url.origin}/cp-admin/${redirectType}?post=${savedPostId}&message=1`, 302
      );
    } else {
      await cp.db.prepare(`
        UPDATE ${prefix}posts SET
          post_title=?, post_content=?, post_excerpt=?, post_status=?,
          post_name=?, post_modified=?, post_modified_gmt=?
        WHERE ID=?
      `).bind(title, content, excerpt, status, slug, now, now, postId).run();

      post = await cp.db.prepare(`SELECT * FROM ${prefix}posts WHERE ID=? LIMIT 1`).bind(postId).first();
      await savePostMeta(cp, prefix, postId, metaIds, metaKeys, metaValues);
      notices.push({ type: 'success', message: L.postUpdated });
    }
  }

  const msg = url.searchParams.get('message');
  if (msg === '1') notices.push({ type: 'success', message: L.postPublished });

  // ── 데이터 로드 ──────────────────────────────────────────
  let categories = [];
  if (postType === 'post') {
    const cats = await cp.db.prepare(
      `SELECT t.term_id, t.name FROM ${prefix}terms t
       JOIN ${prefix}term_taxonomy tt ON t.term_id = tt.term_id
       WHERE tt.taxonomy = 'category'`
    ).all();
    categories = cats?.results || [];
  }

  let postMetas = [];
  if (postId) {
    const metaRows = await cp.db.prepare(
      `SELECT meta_id, meta_key, meta_value FROM ${prefix}postmeta WHERE post_id=? ORDER BY meta_id`
    ).bind(postId).all();
    postMetas = metaRows?.results || [];
    // 내부 메타(_로 시작) 숨김
    postMetas = postMetas.filter(m => !String(m.meta_key).startsWith('_'));
  }

  const isNew     = !postId || !post;
  const typeLabel = postType === 'page' ? L.page : L.post;
  const listHref  = postType === 'page' ? '/cp-admin/edit?post_type=page' : '/cp-admin/edit';

  // ── HTML 렌더링 ──────────────────────────────────────────
  const pageContent = `
<style>
/* ── 메타박스 시스템 ── */
.metabox-holder{display:grid;grid-template-columns:1fr 282px;gap:20px;align-items:start}
.metabox{background:#fff;border:1px solid #dcdcde;border-radius:4px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.07)}
.metabox-title{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;cursor:pointer;user-select:none;border-bottom:1px solid #dcdcde;background:#f9f9f9;border-radius:4px 4px 0 0}
.metabox-title h3{margin:0;font-size:13px;font-weight:600;color:#1d2327}
.metabox-toggle{font-size:10px;color:#646970;transition:transform .2s}
.metabox.closed .metabox-toggle{transform:rotate(-90deg)}
.metabox.closed .metabox-body{display:none}
.metabox-body{padding:14px}
/* 제목 영역 */
#titlediv{background:#fff;border:1px solid #dcdcde;border-radius:4px;margin-bottom:20px;padding:0;box-shadow:0 1px 3px rgba(0,0,0,.07)}
#title{width:100%;border:none;padding:16px 20px;font-size:22px;font-weight:600;outline:none;color:#1d2327;border-radius:4px;font-family:inherit}
#titlediv .permalink-row{padding:6px 20px 10px;font-size:13px;color:#646970;border-top:1px solid #f0f0f1}
#titlediv .permalink-row a{color:#2271b1;text-decoration:none}
#titlediv .permalink-row a:hover{text-decoration:underline}
/* 에디터 */
#wp-content-editor-tools{padding:8px 12px;border-bottom:1px solid #dcdcde;display:flex;gap:4px;flex-wrap:wrap;background:#f9f9f9}
.toolbar-btn{padding:4px 8px;border:1px solid #dcdcde;border-radius:3px;background:#fff;cursor:pointer;font-size:13px;line-height:1.4;transition:.1s}
.toolbar-btn:hover{background:#f0f0f1;border-color:#8c8f94}
.toolbar-btn.active{background:#e0e0e0}
.toolbar-sep{width:1px;background:#dcdcde;margin:2px 4px}
#editor-visual{min-height:380px;padding:20px;outline:none;font-size:15px;line-height:1.7;color:#1d2327}
#editor-html{display:none;width:100%;min-height:380px;padding:20px;border:none;font-family:monospace;font-size:13px;resize:vertical;outline:none;color:#1d2327}
/* 커스텀 필드 */
#custom-fields-table{width:100%;border-collapse:collapse;font-size:13px}
#custom-fields-table th{text-align:left;padding:6px 8px;background:#f0f0f1;font-weight:600;border:1px solid #dcdcde}
#custom-fields-table td{padding:6px 8px;border:1px solid #dcdcde;vertical-align:top}
#custom-fields-table input{width:100%;border:1px solid #dcdcde;border-radius:3px;padding:4px 6px;font-size:13px}
#custom-fields-table textarea{width:100%;border:1px solid #dcdcde;border-radius:3px;padding:4px 6px;font-size:13px;resize:vertical;min-height:48px}
/* Publish 박스 */
.publish-actions{display:flex;gap:8px;margin-top:12px}
.publish-actions .cp-btn{flex:1;justify-content:center}
.post-meta-info{margin-top:10px;padding-top:10px;border-top:1px solid #dcdcde;font-size:12px;color:#646970;line-height:1.8}
</style>

<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
  <a href="${listHref}" style="color:#2271b1;text-decoration:none;font-size:13px">&larr; ${L.allItems(typeLabel)}</a>
  ${post && post.post_status === 'publish' ? `<a href="/${post.post_name || '?p='+post.ID}" target="_blank" class="cp-btn cp-btn-secondary" style="font-size:12px;padding:4px 10px">${L.viewItem(typeLabel)}</a>` : ''}
</div>

<form method="post" id="post-form">

<!-- 제목 -->
<div id="titlediv">
  <input type="text" name="post_title" id="title"
         value="${esc(post?.post_title || '')}"
         placeholder="${L.addTitle}">
  ${post?.post_name ? `
  <div class="permalink-row">
    ${L.permalink}: <a href="/${esc(post.post_name)}" target="_blank">${esc(post.post_name)}</a>
    &nbsp;<a href="#" onclick="document.getElementById('slug-edit').style.display='inline';return false">${L.editSlug}</a>
  </div>` : ''}
</div>

<div class="metabox-holder">

  <!-- ── 좌측 컬럼 ── -->
  <div id="postbox-container-2">

    <!-- 에디터 메타박스 -->
    <div class="metabox" id="postdivrich">
      <div class="metabox-title" onclick="toggleMetabox(this)">
        <h3>${L.content}</h3>
        <span class="metabox-toggle">&#9660;</span>
      </div>
      <div class="metabox-body" style="padding:0">
        <div id="wp-content-editor-tools">
          <button type="button" class="toolbar-btn" onclick="execCmd('bold')" title="${L.bold}"><b>B</b></button>
          <button type="button" class="toolbar-btn" onclick="execCmd('italic')" title="${L.italic}"><i>I</i></button>
          <button type="button" class="toolbar-btn" onclick="execCmd('underline')" title="${L.underline}"><u>U</u></button>
          <button type="button" class="toolbar-btn" onclick="execCmd('strikeThrough')" title="${L.strikethrough}"><s>S</s></button>
          <div class="toolbar-sep"></div>
          ${['h1','h2','h3','h4','h5','h6'].map(h =>
            `<button type="button" class="toolbar-btn" onclick="formatHeading('${h}')">${h.toUpperCase()}</button>`
          ).join('')}
          <div class="toolbar-sep"></div>
          <button type="button" class="toolbar-btn" onclick="execCmd('insertUnorderedList')" title="${L.bulletList}">&#8226;&#8226;</button>
          <button type="button" class="toolbar-btn" onclick="execCmd('insertOrderedList')" title="${L.numberedList}">1.</button>
          <button type="button" class="toolbar-btn" onclick="execCmd('indent')" title="${L.indent}">&rarr;</button>
          <button type="button" class="toolbar-btn" onclick="execCmd('outdent')" title="${L.outdent}">&larr;</button>
          <div class="toolbar-sep"></div>
          <button type="button" class="toolbar-btn" onclick="insertBlockquote()" title="${L.blockquote}">&ldquo;&rdquo;</button>
          <button type="button" class="toolbar-btn" onclick="insertHr()" title="${L.separator}">&#9135;</button>
          <button type="button" class="toolbar-btn" onclick="insertLink2()" title="${L.link}">&#128279;</button>
          <button type="button" class="toolbar-btn" onclick="insertImage2()" title="${L.image}">&#128247;</button>
          <button type="button" class="toolbar-btn" onclick="execCmd('removeFormat')" title="${L.removeFormat}">Tx</button>
          <div style="flex:1"></div>
          <button type="button" class="toolbar-btn" id="btn-visual" onclick="switchEditorTab('visual')" style="background:#e0e0e0">Visual</button>
          <button type="button" class="toolbar-btn" id="btn-html" onclick="switchEditorTab('html')">HTML</button>
        </div>
        <div id="editor-visual" contenteditable="true" oninput="syncEditors()">${post?.post_content || ''}</div>
        <textarea id="editor-html" name="post_content" oninput="syncFromHtml()">${esc(post?.post_content || '')}</textarea>
      </div>
    </div>

    <!-- 발췌문 메타박스 -->
    <div class="metabox" id="postexcerpt">
      <div class="metabox-title" onclick="toggleMetabox(this)">
        <h3>${L.excerpt}</h3>
        <span class="metabox-toggle">&#9660;</span>
      </div>
      <div class="metabox-body">
        <textarea name="post_excerpt" rows="3" class="cp-form-textarea" style="max-width:100%;width:100%"
                  placeholder="${L.excerptPlaceholder}">${esc(post?.post_excerpt || '')}</textarea>
        <p class="cp-description">${L.excerptDesc}</p>
      </div>
    </div>

    <!-- 슬러그 메타박스 -->
    <div class="metabox" id="slugdiv">
      <div class="metabox-title" onclick="toggleMetabox(this)">
        <h3>${L.slug}</h3>
        <span class="metabox-toggle">&#9660;</span>
      </div>
      <div class="metabox-body">
        <input type="text" name="post_name" class="cp-form-input" style="max-width:100%;width:100%"
               id="post_name" value="${esc(post?.post_name || '')}"
               placeholder="${L.slugPlaceholder}">
        <p class="cp-description">${L.slugDesc}</p>
      </div>
    </div>

    <!-- 커스텀 필드 메타박스 -->
    <div class="metabox closed" id="postcustom">
      <div class="metabox-title" onclick="toggleMetabox(this)">
        <h3>${L.customFields}</h3>
        <span class="metabox-toggle">&#9660;</span>
      </div>
      <div class="metabox-body">
        <table id="custom-fields-table">
          <thead>
            <tr>
              <th style="width:35%">${L.name}</th>
              <th>${L.value}</th>
              <th style="width:60px">${L.delete}</th>
            </tr>
          </thead>
          <tbody id="custom-fields-body">
            ${postMetas.map((m, idx) => `
            <tr id="meta-row-${m.meta_id}">
              <td>
                <input type="hidden" name="meta_id[]" value="${esc(String(m.meta_id))}">
                <input type="text" name="meta_key[]" value="${esc(m.meta_key)}" placeholder="${L.key}">
              </td>
              <td>
                <textarea name="meta_value[]" rows="2">${esc(m.meta_value || '')}</textarea>
              </td>
              <td style="text-align:center">
                <button type="button" class="cp-btn cp-btn-danger" style="padding:3px 8px;font-size:12px"
                        onclick="removeMetaRow(this)">&times;</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid #dcdcde">
          <strong style="font-size:13px">${L.addNewField}</strong>
          <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;margin-top:8px;align-items:start">
            <input type="text" id="new-meta-key" placeholder="${L.key}" class="cp-form-input" style="max-width:100%">
            <textarea id="new-meta-value" rows="2" class="cp-form-textarea" placeholder="${L.value}" style="max-width:100%;width:100%"></textarea>
            <button type="button" class="cp-btn" style="align-self:start" onclick="addMetaRow()">${L.add}</button>
          </div>
        </div>
      </div>
    </div>

  </div><!-- /postbox-container-2 -->

  <!-- ── 우측 사이드바 ── -->
  <div id="postbox-container-1">

    <!-- Publish 메타박스 -->
    <div class="metabox" id="submitdiv">
      <div class="metabox-title" onclick="toggleMetabox(this)">
        <h3>${L.publish}</h3>
        <span class="metabox-toggle">&#9660;</span>
      </div>
      <div class="metabox-body">
        <div style="margin-bottom:10px">
          <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px">${L.status}</label>
          <select name="post_status" class="cp-form-select" style="max-width:100%;width:100%">
            <option value="draft"   ${(post?.post_status || 'draft') === 'draft'   ? 'selected' : ''}>${L.draft}</option>
            <option value="publish" ${post?.post_status === 'publish' ? 'selected' : ''}>${L.published}</option>
            <option value="private" ${post?.post_status === 'private' ? 'selected' : ''}>${L.private}</option>
            <option value="pending" ${post?.post_status === 'pending' ? 'selected' : ''}>${L.pendingReview}</option>
          </select>
        </div>
        <div class="publish-actions">
          <button type="button" class="cp-btn cp-btn-secondary"
                  onclick="document.querySelector('[name=post_status]').value='draft';document.getElementById('post-form').submit()">
            ${L.saveDraft}
          </button>
          <button type="button" class="cp-btn"
                  onclick="document.querySelector('[name=post_status]').value='publish';document.getElementById('post-form').submit()">
            ${isNew ? L.publish : L.update}
          </button>
        </div>
        ${post ? `
        <div class="post-meta-info">
          <div>${L.created}: ${esc(formatDate(post.post_date))}</div>
          <div>${L.modified}: ${esc(formatDate(post.post_modified))}</div>
          <div>ID: ${post.ID}</div>
        </div>` : ''}
      </div>
    </div>

    <!-- 카테고리 메타박스 (post only) -->
    ${postType === 'post' ? `
    <div class="metabox" id="categorydiv">
      <div class="metabox-title" onclick="toggleMetabox(this)">
        <h3>${L.categories}</h3>
        <span class="metabox-toggle">&#9660;</span>
      </div>
      <div class="metabox-body">
        ${categories.length ? `
        <div style="max-height:180px;overflow-y:auto;margin-bottom:8px">
          ${categories.map(cat => `
            <label style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px;cursor:pointer">
              <input type="checkbox" name="post_category[]" value="${cat.term_id}">
              ${esc(cat.name)}
            </label>
          `).join('')}
        </div>` : `<p style="color:#646970;font-size:13px">${L.noCategories}</p>`}
        <div style="border-top:1px solid #dcdcde;padding-top:10px;font-size:12px">
          <a href="/cp-admin/edit-tags?taxonomy=category" style="color:#2271b1">${L.manageCategories}</a>
        </div>
      </div>
    </div>` : ''}

    <!-- 태그 메타박스 (post only) -->
    ${postType === 'post' ? `
    <div class="metabox" id="tagsdiv-post_tag">
      <div class="metabox-title" onclick="toggleMetabox(this)">
        <h3>${L.tags}</h3>
        <span class="metabox-toggle">&#9660;</span>
      </div>
      <div class="metabox-body">
        <div style="display:flex;gap:6px;margin-bottom:8px">
          <input type="text" id="tag-input" class="cp-form-input" style="flex:1;max-width:none"
                 placeholder="${L.tagsPlaceholder}" onkeydown="if(event.key==='Enter'){event.preventDefault();addTag()}">
          <button type="button" class="cp-btn cp-btn-secondary" onclick="addTag()">${L.add}</button>
        </div>
        <div id="tag-cloud" style="min-height:32px;display:flex;flex-wrap:wrap;gap:4px"></div>
        <input type="hidden" name="post_tags" id="post_tags_input" value="">
        <p class="cp-description" style="margin-top:8px">${L.tagsDesc}</p>
      </div>
    </div>` : ''}

    <!-- 특성 이미지 메타박스 -->
    <div class="metabox" id="postimagediv">
      <div class="metabox-title" onclick="toggleMetabox(this)">
        <h3>${L.featuredImage}</h3>
        <span class="metabox-toggle">&#9660;</span>
      </div>
      <div class="metabox-body">
        <div id="featured-image-wrap">
          <div style="background:#f0f0f1;border:2px dashed #dcdcde;border-radius:4px;padding:20px;text-align:center;color:#646970;font-size:13px;cursor:pointer"
               onclick="setFeaturedImage()">
            <div style="font-size:28px;margin-bottom:6px">&#128247;</div>
            <a style="color:#2271b1">${L.setFeaturedImage}</a>
          </div>
        </div>
        <input type="hidden" name="meta_featured_image" id="featured-image-url" value="">
      </div>
    </div>

    <!-- 페이지 속성 메타박스 (page only) -->
    ${postType === 'page' ? `
    <div class="metabox" id="pageparentdiv">
      <div class="metabox-title" onclick="toggleMetabox(this)">
        <h3>${L.pageAttributes}</h3>
        <span class="metabox-toggle">&#9660;</span>
      </div>
      <div class="metabox-body">
        <div style="margin-bottom:10px">
          <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">${L.template}</label>
          <select name="page_template" class="cp-form-select" style="width:100%;max-width:100%">
            <option value="default">${L.defaultTemplate}</option>
            <option value="full-width">${L.fullWidth}</option>
            <option value="sidebar-left">${L.sidebarLeft}</option>
            <option value="blank">${L.blankTemplate}</option>
          </select>
        </div>
        <div>
          <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">${L.order}</label>
          <input type="number" name="menu_order" class="cp-form-input" style="max-width:80px"
                 value="${esc(String(post?.menu_order || 0))}">
          <p class="cp-description">${L.orderDesc}</p>
        </div>
      </div>
    </div>` : ''}

  </div><!-- /postbox-container-1 -->
</div><!-- /metabox-holder -->
</form>

<script>
// ── 에디터 ────────────────────────────────────────────────
let editorMode = 'visual';

function execCmd(cmd) {
  document.getElementById('editor-visual').focus();
  document.execCommand(cmd, false, null);
  syncEditors();
}
function formatHeading(tag) {
  document.getElementById('editor-visual').focus();
  document.execCommand('formatBlock', false, tag);
  syncEditors();
}
function insertBlockquote() {
  document.getElementById('editor-visual').focus();
  document.execCommand('formatBlock', false, 'blockquote');
  syncEditors();
}
function insertHr() {
  document.getElementById('editor-visual').focus();
  document.execCommand('insertHTML', false, '<hr>');
  syncEditors();
}
function insertLink2() {
  const url = prompt('${L.enterUrl}');
  if (url) { document.getElementById('editor-visual').focus(); document.execCommand('createLink', false, url); syncEditors(); }
}
function insertImage2() {
  const src = prompt('${L.enterImageUrl}');
  if (src) { document.getElementById('editor-visual').focus(); document.execCommand('insertHTML', false, '<img src="'+src+'" style="max-width:100%">'); syncEditors(); }
}
function syncEditors() {
  document.getElementById('editor-html').value = document.getElementById('editor-visual').innerHTML;
}
function syncFromHtml() {
  document.getElementById('editor-visual').innerHTML = document.getElementById('editor-html').value;
}
function switchEditorTab(mode) {
  editorMode = mode;
  const vis  = document.getElementById('editor-visual');
  const html = document.getElementById('editor-html');
  const bVis = document.getElementById('btn-visual');
  const bHtml= document.getElementById('btn-html');
  if (mode === 'html') {
    syncEditors();
    vis.style.display  = 'none';
    html.style.display = 'block';
    bVis.classList.remove('active'); bHtml.classList.add('active');
  } else {
    syncFromHtml();
    html.style.display = 'none';
    vis.style.display  = 'block';
    bVis.classList.add('active'); bHtml.classList.remove('active');
  }
}

// ── 메타박스 접기/펼치기 ────────────────────────────────────
function toggleMetabox(titleEl) {
  const box = titleEl.closest('.metabox');
  box.classList.toggle('closed');
  const id  = box.id;
  const closed = box.classList.contains('closed');
  try {
    const state = JSON.parse(localStorage.getItem('cp_metabox_state') || '{}');
    state[id] = closed;
    localStorage.setItem('cp_metabox_state', JSON.stringify(state));
  } catch(_){}
}
// 저장된 상태 복원
(function(){
  try {
    const state = JSON.parse(localStorage.getItem('cp_metabox_state') || '{}');
    Object.entries(state).forEach(([id, closed]) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('closed', closed);
    });
  } catch(_){}
})();

// ── 커스텀 필드 ──────────────────────────────────────────────
let metaRowIdx = ${postMetas.length};
function addMetaRow() {
  const key = document.getElementById('new-meta-key').value.trim();
  const val = document.getElementById('new-meta-value').value;
  if (!key) { alert('${L.keyRequired}'); return; }
  const tbody = document.getElementById('custom-fields-body');
  const tr = document.createElement('tr');
  tr.innerHTML = \`
    <td>
      <input type="hidden" name="meta_id[]" value="new_\${metaRowIdx}">
      <input type="text" name="meta_key[]" value="\${key.replace(/"/g,'&quot;')}">
    </td>
    <td><textarea name="meta_value[]" rows="2">\${val.replace(/</g,'&lt;')}</textarea></td>
    <td style="text-align:center">
      <button type="button" class="cp-btn cp-btn-danger" style="padding:3px 8px;font-size:12px"
              onclick="removeMetaRow(this)">&times;</button>
    </td>\`;
  tbody.appendChild(tr);
  document.getElementById('new-meta-key').value   = '';
  document.getElementById('new-meta-value').value = '';
  metaRowIdx++;
}
function removeMetaRow(btn) {
  btn.closest('tr').remove();
}

// ── 태그 ──────────────────────────────────────────────────────
let tags = [];
function addTag() {
  const input = document.getElementById('tag-input');
  const raw   = input.value.trim();
  if (!raw) return;
  raw.split(',').map(t => t.trim()).filter(Boolean).forEach(t => {
    if (!tags.includes(t)) { tags.push(t); renderTags(); }
  });
  input.value = '';
}
function removeTag(t) { tags = tags.filter(x => x !== t); renderTags(); }
function renderTags() {
  const cloud = document.getElementById('tag-cloud');
  cloud.innerHTML = tags.map(t =>
    \`<span style="background:#f0f0f1;border:1px solid #dcdcde;border-radius:12px;padding:2px 10px;font-size:12px;display:flex;align-items:center;gap:4px">
       \${t}
       <button type="button" onclick="removeTag('\${t}')" style="background:none;border:none;cursor:pointer;color:#646970;font-size:14px;padding:0;line-height:1">&times;</button>
     </span>\`
  ).join('');
  document.getElementById('post_tags_input').value = tags.join(',');
}

// ── 특성 이미지 ──────────────────────────────────────────────
function setFeaturedImage() {
  const url = prompt('${L.enterImageUrl}');
  if (url) {
    document.getElementById('featured-image-url').value = url;
    document.getElementById('featured-image-wrap').innerHTML =
      \`<img src="\${url}" style="max-width:100%;border-radius:4px;margin-bottom:8px">
       <br><a href="#" onclick="clearFeaturedImage();return false" style="font-size:12px;color:#d63638">${L.removeFeaturedImage}</a>\`;
  }
}
function clearFeaturedImage() {
  document.getElementById('featured-image-url').value = '';
  document.getElementById('featured-image-wrap').innerHTML =
    \`<div style="background:#f0f0f1;border:2px dashed #dcdcde;border-radius:4px;padding:20px;text-align:center;color:#646970;font-size:13px;cursor:pointer" onclick="setFeaturedImage()">
       <div style="font-size:28px;margin-bottom:6px">&#128247;</div>
       <a style="color:#2271b1">${L.setFeaturedImage}</a>
     </div>\`;
}

// ── 제출 전 동기화 ───────────────────────────────────────────
document.getElementById('post-form').addEventListener('submit', function() {
  if (editorMode === 'visual') syncEditors();
});

// ── 슬러그 자동 생성 ─────────────────────────────────────────
document.getElementById('title').addEventListener('blur', function() {
  const slugField = document.getElementById('post_name');
  if (!slugField.value && this.value) {
    slugField.value = this.value.toLowerCase()
      .replace(/[\\s]+/g,'-')
      .replace(/[^a-z0-9\\-가-힣]/g,'')
      .replace(/^-|-$/g,'');
  }
});
</script>
`;

  const html = await renderAdminShell(cp, pageContent, {
    title: isNew ? `${L.new} ${typeLabel}` : `${L.edit} ${typeLabel}`,
    notices,
  });
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ---------------------------------------------------------------------------
// postmeta 저장 헬퍼
// ---------------------------------------------------------------------------

async function savePostMeta(cp, prefix, postId, metaIds, metaKeys, metaValues) {
  if (!postId || !metaKeys?.length) return;

  // 기존 사용자 정의 메타(내부 _ 제외) 삭제 후 재삽입
  await cp.db.prepare(
    `DELETE FROM ${prefix}postmeta WHERE post_id=? AND meta_key NOT LIKE '\\_%' ESCAPE '\\'`
  ).bind(postId).run().catch(() => {});

  for (let i = 0; i < metaKeys.length; i++) {
    const key = (metaKeys[i] || '').trim();
    const val = metaValues[i] || '';
    if (!key || key.startsWith('_')) continue;
    await cp.db.prepare(
      `INSERT INTO ${prefix}postmeta (post_id, meta_key, meta_value) VALUES (?,?,?)`
    ).bind(postId, key, val).run().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// 언어 레이블
// ---------------------------------------------------------------------------

function getLabels(lang) {
  const KO = {
    postNotFound: '포스트를 찾을 수 없습니다.',
    postUpdated: '포스트가 업데이트되었습니다.',
    postPublished: '포스트가 게시되었습니다.',
    allItems: t => `모든 ${t}`,
    viewItem: t => `${t} 보기`,
    addTitle: '제목 추가',
    permalink: '퍼마링크',
    editSlug: '편집',
    content: '본문',
    excerpt: '발췌문',
    excerptPlaceholder: '발췌문을 입력하세요 (선택사항)',
    excerptDesc: '자동 생성된 발췌문 대신 직접 입력할 수 있습니다.',
    slug: '슬러그',
    slugPlaceholder: '제목에서 자동 생성',
    slugDesc: 'URL에 사용될 슬러그를 입력하세요.',
    customFields: '사용자 정의 필드',
    name: '이름',
    value: '값',
    delete: '삭제',
    key: '키',
    addNewField: '새 필드 추가',
    add: '추가',
    keyRequired: '키를 입력하세요.',
    publish: '게시',
    status: '상태',
    draft: '초안',
    published: '게시됨',
    private: '비공개',
    pendingReview: '검토 대기',
    saveDraft: '초안 저장',
    update: '업데이트',
    new: '새',
    edit: '편집',
    post: '포스트',
    page: '페이지',
    created: '생성',
    modified: '수정',
    categories: '카테고리',
    noCategories: '카테고리가 없습니다.',
    manageCategories: '카테고리 관리',
    tags: '태그',
    tagsPlaceholder: '태그 입력 후 Enter 또는 쉼표',
    tagsDesc: '쉼표로 구분하여 여러 태그를 추가하세요.',
    featuredImage: '특성 이미지',
    setFeaturedImage: '특성 이미지 설정',
    removeFeaturedImage: '특성 이미지 제거',
    pageAttributes: '페이지 속성',
    template: '템플릿',
    defaultTemplate: '기본 템플릿',
    fullWidth: '전체 너비',
    sidebarLeft: '왼쪽 사이드바',
    blankTemplate: '빈 템플릿',
    order: '순서',
    orderDesc: '숫자가 낮을수록 먼저 표시됩니다.',
    enterUrl: 'URL을 입력하세요:',
    enterImageUrl: '이미지 URL을 입력하세요:',
    bold: '굵게', italic: '기울임', underline: '밑줄', strikethrough: '취소선',
    bulletList: '글머리 기호', numberedList: '번호 목록',
    indent: '들여쓰기', outdent: '내어쓰기',
    blockquote: '인용구', separator: '구분선', link: '링크', image: '이미지', removeFormat: '서식 제거',
  };
  const EN = {
    postNotFound: 'Post not found.',
    postUpdated: 'Post updated.',
    postPublished: 'Post published.',
    allItems: t => `All ${t}s`,
    viewItem: t => `View ${t}`,
    addTitle: 'Add title',
    permalink: 'Permalink',
    editSlug: 'Edit',
    content: 'Content',
    excerpt: 'Excerpt',
    excerptPlaceholder: 'Write an excerpt (optional)',
    excerptDesc: 'Excerpts are optional hand-crafted summaries.',
    slug: 'Slug',
    slugPlaceholder: 'auto-generated-from-title',
    slugDesc: 'The URL-friendly slug for this post.',
    customFields: 'Custom Fields',
    name: 'Name',
    value: 'Value',
    delete: 'Delete',
    key: 'Key',
    addNewField: 'Add New Custom Field',
    add: 'Add',
    keyRequired: 'Please enter a key.',
    publish: 'Publish',
    status: 'Status',
    draft: 'Draft',
    published: 'Published',
    private: 'Private',
    pendingReview: 'Pending Review',
    saveDraft: 'Save Draft',
    update: 'Update',
    new: 'New',
    edit: 'Edit',
    post: 'Post',
    page: 'Page',
    created: 'Created',
    modified: 'Modified',
    categories: 'Categories',
    noCategories: 'No categories found.',
    manageCategories: 'Manage Categories',
    tags: 'Tags',
    tagsPlaceholder: 'Add tag then Enter or comma',
    tagsDesc: 'Separate tags with commas.',
    featuredImage: 'Featured Image',
    setFeaturedImage: 'Set featured image',
    removeFeaturedImage: 'Remove featured image',
    pageAttributes: 'Page Attributes',
    template: 'Template',
    defaultTemplate: 'Default Template',
    fullWidth: 'Full Width',
    sidebarLeft: 'Sidebar Left',
    blankTemplate: 'Blank',
    order: 'Order',
    orderDesc: 'Pages are usually sorted by this field.',
    enterUrl: 'Enter URL:',
    enterImageUrl: 'Enter image URL:',
    bold: 'Bold', italic: 'Italic', underline: 'Underline', strikethrough: 'Strikethrough',
    bulletList: 'Bullet List', numberedList: 'Numbered List',
    indent: 'Indent', outdent: 'Outdent',
    blockquote: 'Blockquote', separator: 'Horizontal Rule', link: 'Insert Link', image: 'Insert Image', removeFormat: 'Remove Formatting',
  };
  return lang === 'ko_KR' ? KO : EN;
}

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleString('ko-KR'); } catch (_) { return d; }
}
function slugify(str) {
  return (str || '').toLowerCase().replace(/[\s]+/g,'-').replace(/[^a-z0-9\-가-힣]/g,'').replace(/^-|-$/g,'');
}
