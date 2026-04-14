/**
 * CloudPress Post API
 * Replaces WordPress WP_Post, get_post, get_posts, wp_insert_post, wp_update_post, etc.
 *
 * Posts are stored in the D1 cp_posts + cp_postmeta tables.
 *
 * @package CloudPress
 */

// ── Fetch ──────────────────────────────────────────────────────────────────

/**
 * Get a single post by ID.
 * Equivalent to get_post().
 *
 * @param {object} cp
 * @param {number} id
 * @returns {Promise<object|null>}
 */
export async function getPost(cp, id) {
  const prefix = cp.db_prefix || 'cp_';
  return cp.db
    .prepare(`SELECT * FROM ${prefix}posts WHERE ID=? LIMIT 1`)
    .bind(id)
    .first();
}

/**
 * Get posts matching args.
 * Equivalent to get_posts() / WP_Query basics.
 *
 * @param {object} cp
 * @param {object} args
 *   post_type, post_status, posts_per_page, offset, orderby, order,
 *   author, search (s), category_id, tag, meta_key, meta_value
 * @returns {Promise<object[]>}
 */
export async function getPosts(cp, args = {}) {
  const prefix = cp.db_prefix || 'cp_';

  const postType   = args.post_type   || 'post';
  const postStatus = args.post_status || 'publish';
  const limit      = Math.min(parseInt(args.posts_per_page || args.numberposts || 10), 100);
  const offset     = parseInt(args.offset || 0);
  const safeOrder  = args.order === 'ASC' ? 'ASC' : 'DESC';
  const validOrderby = {
    date: 'post_date', modified: 'post_modified', title: 'post_title',
    ID: 'ID', rand: 'RANDOM()', comment_count: 'comment_count', menu_order: 'menu_order',
  };
  const orderby = validOrderby[args.orderby] || 'post_date';

  let where  = `post_type=? AND post_status!=?`;
  const params = [postType, 'auto-draft'];

  if (postStatus !== 'any') {
    where += ` AND post_status=?`;
    params.push(postStatus);
  }
  if (args.author) { where += ' AND post_author=?'; params.push(args.author); }
  if (args.s)      { where += ' AND post_title LIKE ?'; params.push(`%${args.s}%`); }
  if (args.post__in?.length) {
    where += ` AND ID IN (${args.post__in.map(() => '?').join(',')})`;
    params.push(...args.post__in);
  }
  if (args.post__not_in?.length) {
    where += ` AND ID NOT IN (${args.post__not_in.map(() => '?').join(',')})`;
    params.push(...args.post__not_in);
  }

  const sql = `SELECT * FROM ${prefix}posts WHERE ${where} ORDER BY ${orderby} ${safeOrder} LIMIT ? OFFSET ?`;
  const rows = await cp.db.prepare(sql).bind(...params, limit, offset).all();
  return rows.results || [];
}

/**
 * Count posts matching args (same filters as getPosts, without limit/offset).
 *
 * @param {object} cp
 * @param {object} args
 * @returns {Promise<number>}
 */
export async function countPosts(cp, args = {}) {
  const prefix = cp.db_prefix || 'cp_';
  const postType   = args.post_type   || 'post';
  const postStatus = args.post_status || 'publish';

  let where  = `post_type=? AND post_status!=?`;
  const params = [postType, 'auto-draft'];

  if (postStatus !== 'any') { where += ` AND post_status=?`; params.push(postStatus); }
  if (args.author) { where += ' AND post_author=?'; params.push(args.author); }
  if (args.s)      { where += ' AND post_title LIKE ?'; params.push(`%${args.s}%`); }

  const row = await cp.db
    .prepare(`SELECT COUNT(*) as n FROM ${prefix}posts WHERE ${where}`)
    .bind(...params)
    .first();
  return row?.n ?? 0;
}

// ── Write ──────────────────────────────────────────────────────────────────

/**
 * Insert a new post.
 * Equivalent to wp_insert_post().
 *
 * @param {object} cp
 * @param {object} data
 * @returns {Promise<number>} new post ID
 */
export async function insertPost(cp, data) {
  const prefix = cp.db_prefix || 'cp_';
  const now    = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const title   = data.post_title   || '';
  const content = data.post_content || '';
  const excerpt = data.post_excerpt || '';
  const status  = data.post_status  || 'draft';
  const type    = data.post_type    || 'post';
  const slug    = data.post_name    || slugify(title) || `post-${Date.now()}`;
  const author  = data.post_author  || 1;
  const date    = data.post_date    || now;
  const parent  = data.post_parent  || 0;
  const order   = data.menu_order   || 0;

  const result = await cp.db.prepare(`
    INSERT INTO ${prefix}posts
      (post_author, post_date, post_date_gmt, post_content, post_title, post_excerpt,
       post_status, post_type, post_name, post_parent, menu_order,
       comment_status, ping_status, post_modified, post_modified_gmt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'open','open',?,?)
  `).bind(author, date, date, content, title, excerpt, status, type, slug, parent, order, now, now).run();

  return result.meta?.last_row_id;
}

/**
 * Update an existing post.
 * Equivalent to wp_update_post().
 *
 * @param {object} cp
 * @param {number} postId
 * @param {object} data
 * @returns {Promise<boolean>}
 */
export async function updatePost(cp, postId, data) {
  const prefix = cp.db_prefix || 'cp_';
  const now    = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const allowed = {
    post_title:   data.post_title,
    post_content: data.post_content,
    post_excerpt: data.post_excerpt,
    post_status:  data.post_status,
    post_name:    data.post_name,
    post_author:  data.post_author,
    post_parent:  data.post_parent,
    menu_order:   data.menu_order,
    post_date:    data.post_date,
  };

  const fields = [];
  const params = [];
  for (const [k, v] of Object.entries(allowed)) {
    if (v !== undefined) { fields.push(`${k}=?`); params.push(v); }
  }
  fields.push('post_modified=?', 'post_modified_gmt=?');
  params.push(now, now, postId);

  await cp.db.prepare(`UPDATE ${prefix}posts SET ${fields.join(',')} WHERE ID=?`).bind(...params).run();
  return true;
}

/**
 * Trash a post (set status to 'trash').
 *
 * @param {object} cp
 * @param {number} postId
 * @returns {Promise<boolean>}
 */
export async function trashPost(cp, postId) {
  return updatePost(cp, postId, { post_status: 'trash' });
}

/**
 * Permanently delete a post and its meta.
 *
 * @param {object} cp
 * @param {number} postId
 * @returns {Promise<boolean>}
 */
export async function deletePost(cp, postId) {
  const prefix = cp.db_prefix || 'cp_';
  await cp.db.prepare(`DELETE FROM ${prefix}posts WHERE ID=?`).bind(postId).run();
  await cp.db.prepare(`DELETE FROM ${prefix}postmeta WHERE post_id=?`).bind(postId).run();
  return true;
}

// ── Post Meta ──────────────────────────────────────────────────────────────

/**
 * Get post meta.
 * Equivalent to get_post_meta().
 *
 * @param {object} cp
 * @param {number} postId
 * @param {string} key
 * @param {boolean} single
 * @returns {Promise<*>}
 */
export async function getPostMeta(cp, postId, key, single = true) {
  const prefix = cp.db_prefix || 'cp_';
  const rows = await cp.db
    .prepare(`SELECT meta_value FROM ${prefix}postmeta WHERE post_id=? AND meta_key=?`)
    .bind(postId, key)
    .all();

  const values = (rows.results || []).map(r => {
    try { return JSON.parse(r.meta_value); } catch (_) { return r.meta_value; }
  });

  return single ? (values[0] ?? null) : values;
}

/**
 * Update (or insert) post meta.
 * Equivalent to update_post_meta().
 *
 * @param {object} cp
 * @param {number} postId
 * @param {string} key
 * @param {*}      value
 * @returns {Promise<void>}
 */
export async function updatePostMeta(cp, postId, key, value) {
  const prefix = cp.db_prefix || 'cp_';
  const stored = typeof value === 'string' ? value : JSON.stringify(value);

  await cp.db.prepare(`
    INSERT INTO ${prefix}postmeta (post_id, meta_key, meta_value)
    VALUES (?, ?, ?)
    ON CONFLICT(post_id, meta_key) DO UPDATE SET meta_value=excluded.meta_value
  `).bind(postId, key, stored).run();
}

/**
 * Delete post meta.
 * Equivalent to delete_post_meta().
 *
 * @param {object} cp
 * @param {number} postId
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function deletePostMeta(cp, postId, key) {
  const prefix = cp.db_prefix || 'cp_';
  await cp.db.prepare(`DELETE FROM ${prefix}postmeta WHERE post_id=? AND meta_key=?`)
    .bind(postId, key).run();
}

// ── Utilities ──────────────────────────────────────────────────────────────

/**
 * Convert a string to a URL-safe slug.
 * Equivalent to sanitize_title().
 *
 * @param {string} str
 * @returns {string}
 */
export function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 200);
}
