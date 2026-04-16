/**
 * CloudPress Comment API
 * Replaces WordPress wp-includes/comment.php
 *
 * CRUD for comments stored in D1 cp_comments + cp_commentmeta.
 * No external services required.
 *
 * @package CloudPress
 */

import { getOption }   from './option.js';
import { escHtml }     from './formatting.js';

// -- Fetch ---------------------------------------------------------------------

/**
 * Get a single comment by ID.
 * Equivalent to get_comment().
 *
 * @param {object} cp
 * @param {number} commentId
 * @returns {Promise<object|null>}
 */
export async function getComment(cp, commentId) {
  const prefix = cp.db_prefix || 'cp_';
  return cp.db
    .prepare(`SELECT * FROM ${prefix}comments WHERE comment_ID=? LIMIT 1`)
    .bind(commentId)
    .first();
}

/**
 * Get comments for a post.
 * Equivalent to get_comments().
 *
 * @param {object} cp
 * @param {object} args
 * @returns {Promise<object[]>}
 */
export async function getComments(cp, args = {}) {
  const prefix   = cp.db_prefix || 'cp_';
  const postId   = args.post_id || args.post_ID || 0;
  const status   = args.status  || 'approve';  // approve | hold | spam | trash
  const limit    = Math.min(parseInt(args.number || 50), 200);
  const offset   = parseInt(args.offset || 0);
  const order    = args.order === 'ASC' ? 'ASC' : 'DESC';
  const parentId = args.parent !== undefined ? args.parent : null;

  const where  = [];
  const params = [];

  if (postId) { where.push('comment_post_ID=?'); params.push(postId); }
  if (status === 'approve') {
    where.push("comment_approved='1'");
  } else if (status !== 'all') {
    where.push('comment_approved=?');
    params.push(status === 'hold' ? '0' : status === 'spam' ? 'spam' : 'trash');
  }
  if (parentId !== null) { where.push('comment_parent=?'); params.push(parentId); }

  const whereStr = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await cp.db
    .prepare(`SELECT * FROM ${prefix}comments ${whereStr} ORDER BY comment_date ${order} LIMIT ? OFFSET ?`)
    .bind(...params, limit, offset)
    .all();

  return rows.results || [];
}

/**
 * Count comments for a post or overall.
 *
 * @param {object} cp
 * @param {number} [postId]
 * @returns {Promise<{ approved: number, pending: number, spam: number, total: number }>}
 */
export async function countComments(cp, postId = 0) {
  const prefix = cp.db_prefix || 'cp_';
  const bind   = postId ? [postId] : [];
  const where  = postId ? 'WHERE comment_post_ID=?' : '';

  const rows = await cp.db
    .prepare(
      `SELECT comment_approved, COUNT(*) as n FROM ${prefix}comments ${where} GROUP BY comment_approved`
    )
    .bind(...bind)
    .all();

  const map = {};
  for (const r of (rows.results || [])) { map[r.comment_approved] = r.n; }

  return {
    approved: map['1']     || 0,
    pending:  map['0']     || 0,
    spam:     map['spam']  || 0,
    trash:    map['trash'] || 0,
    total:    Object.values(map).reduce((a, b) => a + b, 0),
  };
}

// -- Write ---------------------------------------------------------------------

/**
 * Insert a new comment.
 * Equivalent to wp_insert_comment().
 *
 * @param {object} cp
 * @param {object} data
 * @returns {Promise<number>}  New comment ID
 */
export async function insertComment(cp, data) {
  const prefix = cp.db_prefix || 'cp_';
  const now    = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const approved = data.comment_approved ?? '0';
  const parent   = data.comment_parent   || 0;

  const result = await cp.db.prepare(`
    INSERT INTO ${prefix}comments
      (comment_post_ID, comment_author, comment_author_email, comment_author_url,
       comment_author_IP, comment_date, comment_date_gmt, comment_content,
       comment_approved, comment_agent, comment_type, comment_parent, user_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    data.comment_post_ID || 0,
    data.comment_author       || '',
    data.comment_author_email || '',
    data.comment_author_url   || '',
    data.comment_author_IP    || '',
    data.comment_date         || now,
    data.comment_date_gmt     || now,
    data.comment_content      || '',
    approved,
    data.comment_agent || '',
    data.comment_type  || 'comment',
    parent,
    data.user_id || 0
  ).run();

  // Update comment count on post
  if (approved === '1' && data.comment_post_ID) {
    await updateCommentCount(cp, data.comment_post_ID);
  }

  return result.meta?.last_row_id || 0;
}

/**
 * Update an existing comment.
 * Equivalent to wp_update_comment().
 *
 * @param {object} cp
 * @param {object} data  Must include comment_ID
 * @returns {Promise<boolean>}
 */
export async function updateComment(cp, data) {
  if (!data.comment_ID) return false;
  const prefix  = cp.db_prefix || 'cp_';
  const fields  = [];
  const values  = [];

  const updatable = [
    'comment_author', 'comment_author_email', 'comment_author_url',
    'comment_content', 'comment_approved', 'comment_parent', 'user_id',
  ];

  for (const key of updatable) {
    if (data[key] !== undefined) {
      fields.push(`${key}=?`);
      values.push(data[key]);
    }
  }

  if (!fields.length) return false;

  values.push(data.comment_ID);
  await cp.db
    .prepare(`UPDATE ${prefix}comments SET ${fields.join(',')} WHERE comment_ID=?`)
    .bind(...values)
    .run();

  // Recalculate post's comment count
  const comment = await getComment(cp, data.comment_ID);
  if (comment?.comment_post_ID) {
    await updateCommentCount(cp, comment.comment_post_ID);
  }

  return true;
}

/**
 * Delete a comment permanently.
 * Equivalent to wp_delete_comment(force).
 *
 * @param {object} cp
 * @param {number} commentId
 * @returns {Promise<boolean>}
 */
export async function deleteComment(cp, commentId) {
  const prefix  = cp.db_prefix || 'cp_';
  const comment = await getComment(cp, commentId);
  if (!comment) return false;

  await cp.db.prepare(`DELETE FROM ${prefix}comments WHERE comment_ID=?`).bind(commentId).run();
  await cp.db.prepare(`DELETE FROM ${prefix}commentmeta WHERE comment_id=?`).bind(commentId).run();

  if (comment.comment_post_ID) {
    await updateCommentCount(cp, comment.comment_post_ID);
  }
  return true;
}

/**
 * Move a comment to trash or change approved status.
 * Equivalent to wp_trash_comment() / wp_spam_comment() / wp_approve_comment().
 *
 * @param {object} cp
 * @param {number} commentId
 * @param {'trash'|'spam'|'0'|'1'} status
 * @returns {Promise<boolean>}
 */
export async function setCommentStatus(cp, commentId, status) {
  return updateComment(cp, { comment_ID: commentId, comment_approved: status });
}

// -- Spam check (basic) --------------------------------------------------------

/**
 * Very lightweight spam heuristics (no external API).
 * Returns true if the comment looks spammy.
 *
 * @param {object} data  Comment data
 * @returns {boolean}
 */
export function isCommentSpam(data) {
  const content = String(data.comment_content || '').toLowerCase();
  const author  = String(data.comment_author  || '').toLowerCase();
  const url     = String(data.comment_author_url || '').toLowerCase();

  // Link density: many links = spam
  const linkCount = (content.match(/https?:\/\//g) || []).length;
  if (linkCount > 3) return true;

  // Common spam keywords
  const spamWords = ['casino', 'poker', 'viagra', 'cialis', 'buy cheap', 'click here'];
  if (spamWords.some(w => content.includes(w))) return true;

  // Suspicious URLs
  if (url && /\.(ru|cn|tk|ml|ga|cf)\/?$/.test(url)) return true;

  return false;
}

// -- Comment form rendering ----------------------------------------------------

/**
 * Render the comment reply form HTML.
 * Equivalent to comment_form().
 *
 * @param {object} cp
 * @param {number} postId
 * @returns {Promise<string>}
 */
export async function commentForm(cp, postId) {
  const user = cp.currentUser;
  const commentsOpen = await getOption(cp, 'default_comment_status', 'open');

  if (commentsOpen !== 'open') {
    return '<p class="comments-closed">Comments are closed.</p>';
  }

  const nameField  = user ? '' : `
    <div class="cp-form-row">
      <label for="author">Name <span>*</span></label>
      <input type="text" id="author" name="author" required maxlength="245">
    </div>
    <div class="cp-form-row">
      <label for="email">Email <span>*</span></label>
      <input type="email" id="email" name="email" required maxlength="100">
    </div>
    <div class="cp-form-row">
      <label for="url">Website</label>
      <input type="url" id="url" name="url" maxlength="200">
    </div>`;

  return `
<div id="respond" class="comment-respond">
  <h3 id="reply-title">Leave a Comment</h3>
  <form action="/cp-comments-post" method="post" id="commentform">
    <input type="hidden" name="comment_post_ID" value="${postId}">
    <input type="hidden" name="comment_parent"  value="0">
    ${nameField}
    <div class="cp-form-row">
      <label for="comment">Comment <span>*</span></label>
      <textarea id="comment" name="comment" rows="6" maxlength="65525" required></textarea>
    </div>
    <div class="cp-form-row">
      <button type="submit" class="cp-submit-btn">Post Comment</button>
    </div>
  </form>
</div>`;
}

/**
 * Render a threaded comment list.
 * Equivalent to wp_list_comments().
 *
 * @param {object[]} comments
 * @param {number}   [parentId]
 * @returns {string}
 */
export function listComments(comments, parentId = 0) {
  const children = comments.filter(c => (c.comment_parent || 0) == parentId);
  if (!children.length) return '';

  const items = children.map(c => {
    const nested = listComments(comments, c.comment_ID);
    return `
<li id="comment-${c.comment_ID}" class="comment">
  <article class="comment-body">
    <footer class="comment-meta">
      <div class="comment-author">
        <strong>${escHtml(c.comment_author)}</strong>
        <span class="comment-date">${escHtml(formatCommentDate(c.comment_date))}</span>
      </div>
    </footer>
    <div class="comment-content">${escHtml(c.comment_content)}</div>
    <div class="reply">
      <a class="comment-reply-link" href="#respond"
         onclick="setCommentParent(${c.comment_ID}); return false;">Reply</a>
    </div>
  </article>
  ${nested ? `<ol class="children">${nested}</ol>` : ''}
</li>`;
  });

  return items.join('\n');
}

// -- Internals -----------------------------------------------------------------

async function updateCommentCount(cp, postId) {
  const prefix = cp.db_prefix || 'cp_';
  const row    = await cp.db
    .prepare(`SELECT COUNT(*) as n FROM ${prefix}comments WHERE comment_post_ID=? AND comment_approved='1'`)
    .bind(postId)
    .first();
  await cp.db
    .prepare(`UPDATE ${prefix}posts SET comment_count=? WHERE ID=?`)
    .bind(row?.n ?? 0, postId)
    .run();
}

function formatCommentDate(dateStr) {
  if (!dateStr) return '';
  try { return new Date(dateStr).toLocaleDateString(); } catch (_) { return dateStr; }
}

export async function handleCommentSubmission(request, cp) {
  const data = await request.formData().catch(() => new FormData());
  const commentPostId = parseInt(data.get('comment_post_ID') || '0');
  const author  = String(data.get('author')  || '').trim();
  const email   = String(data.get('email')   || '').trim();
  const url     = String(data.get('url')     || '').trim();
  const comment = String(data.get('comment') || '').trim();

  if (!comment) return { error: 'Comment is empty.' };

  const id = await insertComment(cp, {
    comment_post_ID:    commentPostId,
    comment_author:     author,
    comment_author_email: email,
    comment_author_url: url,
    comment_content:    comment,
    comment_approved:   1,
  });
  return { id };
}

export async function newComment(cp, data) { return insertComment(cp, data); }
