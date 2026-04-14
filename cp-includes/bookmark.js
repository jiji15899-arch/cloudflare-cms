/**
 * CloudPress Bookmark / Link API
 * Replaces WordPress wp-includes/bookmark.php
 *
 * Bookmarks (links) stored in D1: cp_links, cp_term_relationships
 *
 * @package CloudPress
 */

/**
 * Get a single bookmark by ID.
 * Equivalent to get_bookmark().
 *
 * @param {object} cp
 * @param {number} linkId
 * @returns {Promise<object|null>}
 */
export async function getBookmark(cp, linkId) {
  const prefix = cp.db_prefix || 'cp_';
  return cp.db
    .prepare(`SELECT * FROM ${prefix}links WHERE link_id=? LIMIT 1`)
    .bind(linkId)
    .first();
}

/**
 * Get bookmarks (equivalent to get_bookmarks()).
 *
 * @param {object} cp
 * @param {object} [args]
 * @param {string} [args.orderby]      - 'name'|'rating'|'updated'|'id' (default 'name')
 * @param {string} [args.order]        - 'ASC'|'DESC' (default 'ASC')
 * @param {number} [args.limit]        - max results (-1 = all)
 * @param {number} [args.category]     - filter by link_category term_id
 * @param {string} [args.category_name]
 * @param {string} [args.hide_invisible] - '1'|'0'
 * @param {string} [args.show_updated]
 * @param {string} [args.include]      - comma-separated IDs
 * @param {string} [args.exclude]      - comma-separated IDs
 * @param {string} [args.search]       - search link_name/url/description
 * @returns {Promise<object[]>}
 */
export async function getBookmarks(cp, args = {}) {
  const prefix = cp.db_prefix || 'cp_';
  const {
    orderby       = 'name',
    order         = 'ASC',
    limit         = -1,
    category      = 0,
    category_name = '',
    hide_invisible = '1',
    include       = '',
    exclude       = '',
    search        = '',
  } = args;

  const safeOrder   = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  const colMap      = { name: 'link_name', rating: 'link_rating', updated: 'link_updated', id: 'link_id' };
  const safeOrderby = colMap[orderby] || 'link_name';

  let sql    = `SELECT l.* FROM ${prefix}links l`;
  const params = [];

  // Category join
  if (category || category_name) {
    sql += `
      JOIN ${prefix}term_relationships tr ON tr.object_id = l.link_id
      JOIN ${prefix}term_taxonomy tt ON tt.term_taxonomy_id = tr.term_taxonomy_id AND tt.taxonomy='link_category'
      JOIN ${prefix}terms t ON t.term_id = tt.term_id`;
  }

  const where = [];
  if (hide_invisible === '1') {
    where.push(`l.link_visible='Y'`);
  }
  if (include) {
    const ids = include.split(',').map(s => parseInt(s.trim())).filter(Boolean);
    if (ids.length) where.push(`l.link_id IN (${ids.join(',')})`);
  }
  if (exclude) {
    const ids = exclude.split(',').map(s => parseInt(s.trim())).filter(Boolean);
    if (ids.length) where.push(`l.link_id NOT IN (${ids.join(',')})`);
  }
  if (category) {
    where.push(`t.term_id=?`);
    params.push(category);
  }
  if (category_name) {
    where.push(`t.slug=?`);
    params.push(category_name);
  }
  if (search) {
    where.push(`(l.link_name LIKE ? OR l.link_url LIKE ? OR l.link_description LIKE ?)`);
    const q = `%${search}%`;
    params.push(q, q, q);
  }

  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ` ORDER BY ${safeOrderby} ${safeOrder}`;
  if (limit > 0) { sql += ' LIMIT ?'; params.push(limit); }

  const stmt = params.length ? cp.db.prepare(sql).bind(...params) : cp.db.prepare(sql);
  const { results } = await stmt.all();
  return results || [];
}

/**
 * Insert a new bookmark.
 * Equivalent to wp_insert_link().
 *
 * @param {object} cp
 * @param {object} data
 * @returns {Promise<number>} inserted link_id
 */
export async function insertBookmark(cp, data) {
  const prefix = cp.db_prefix || 'cp_';
  const now    = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const {
    link_url         = '',
    link_name        = '',
    link_image       = '',
    link_target      = '',
    link_description = '',
    link_visible     = 'Y',
    link_owner       = 1,
    link_rating      = 0,
    link_rel         = '',
    link_notes       = '',
    link_rss         = '',
  } = data;

  await cp.db.prepare(`
    INSERT INTO ${prefix}links
      (link_url, link_name, link_image, link_target, link_description,
       link_visible, link_owner, link_rating, link_updated, link_rel, link_notes, link_rss)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    link_url, link_name, link_image, link_target, link_description,
    link_visible, link_owner, link_rating, now, link_rel, link_notes, link_rss
  ).run();

  const row = await cp.db.prepare(`SELECT last_insert_rowid() AS id`).first();
  return row?.id || 0;
}

/**
 * Update an existing bookmark.
 * Equivalent to wp_update_link().
 *
 * @param {object} cp
 * @param {object} data  - must include link_id
 * @returns {Promise<void>}
 */
export async function updateBookmark(cp, data) {
  const prefix = cp.db_prefix || 'cp_';
  const { link_id, ...fields } = data;
  if (!link_id) return;

  const allowed = [
    'link_url','link_name','link_image','link_target','link_description',
    'link_visible','link_owner','link_rating','link_rel','link_notes','link_rss',
  ];
  const sets   = [];
  const params = [];
  for (const key of allowed) {
    if (key in fields) { sets.push(`${key}=?`); params.push(fields[key]); }
  }
  if (!sets.length) return;
  params.push(link_id);
  await cp.db.prepare(`UPDATE ${prefix}links SET ${sets.join(',')} WHERE link_id=?`).bind(...params).run();
}

/**
 * Delete a bookmark.
 * Equivalent to wp_delete_link().
 *
 * @param {object} cp
 * @param {number} linkId
 * @returns {Promise<void>}
 */
export async function deleteBookmark(cp, linkId) {
  const prefix = cp.db_prefix || 'cp_';
  await cp.db.prepare(`DELETE FROM ${prefix}links WHERE link_id=?`).bind(linkId).run();
  await cp.db.prepare(`DELETE FROM ${prefix}term_relationships WHERE object_id=?`).bind(linkId).run();
}
