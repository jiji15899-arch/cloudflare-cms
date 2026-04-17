/**
 * CloudPress Category / Taxonomy API
 * Replaces WordPress wp-includes/category.php + wp-includes/taxonomy.php
 *
 * Categories, tags, and custom taxonomies stored in D1:
 *   cp_terms, cp_term_taxonomy, cp_term_relationships
 *
 * @package CloudPress
 */

import { escHtml } from './formatting.js';

// -- Term fetch ----------------------------------------------------------------

/**
 * Get a single term by ID.
 * Equivalent to get_term().
 *
 * @param {object} cp
 * @param {number} termId
 * @param {string} [taxonomy]
 * @returns {Promise<object|null>}
 */
export async function getTerm(cp, termId, taxonomy = '') {
  const prefix = cp.db_prefix || 'cp_';
  let sql = `
    SELECT t.*, tt.taxonomy, tt.description, tt.parent, tt.count
    FROM ${prefix}terms t
    JOIN ${prefix}term_taxonomy tt ON t.term_id = tt.term_id
    WHERE t.term_id=?`;
  const params = [termId];
  if (taxonomy) { sql += ' AND tt.taxonomy=?'; params.push(taxonomy); }
  return cp.db.prepare(sql + ' LIMIT 1').bind(...params).first();
}

/**
 * Get a term by slug.
 * Equivalent to get_term_by('slug', ...).
 *
 * @param {object} cp
 * @param {string} slug
 * @param {string} taxonomy
 * @returns {Promise<object|null>}
 */
export async function getTermBySlug(cp, slug, taxonomy) {
  const prefix = cp.db_prefix || 'cp_';
  return cp.db.prepare(`
    SELECT t.*, tt.taxonomy, tt.description, tt.parent, tt.count
    FROM ${prefix}terms t
    JOIN ${prefix}term_taxonomy tt ON t.term_id = tt.term_id
    WHERE t.slug=? AND tt.taxonomy=? LIMIT 1
  `).bind(slug, taxonomy).first();
}

/**
 * Get all terms for a taxonomy.
 * Equivalent to get_terms().
 *
 * @param {object} cp
 * @param {object} args
 * @returns {Promise<object[]>}
 */
export async function getTerms(cp, args = {}) {
  const prefix   = cp.db_prefix || 'cp_';
  const taxonomy = args.taxonomy || 'category';
  const hideEmpty = args.hide_empty !== false;
  const limit    = Math.min(parseInt(args.number || 0) || 200, 500);
  const orderby  = args.orderby === 'count' ? 'tt.count' :
                   args.orderby === 'name'  ? 't.name'   : 't.name';
  const order    = args.order   === 'DESC'  ? 'DESC' : 'ASC';
  const parent   = args.parent !== undefined ? args.parent : null;

  const where  = ['tt.taxonomy=?'];
  const params = [taxonomy];

  if (hideEmpty) { where.push('tt.count > 0'); }
  if (parent !== null) { where.push('tt.parent=?'); params.push(parent); }
  if (args.search) { where.push('t.name LIKE ?'); params.push(`%${args.search}%`); }

  const rows = await cp.db.prepare(`
    SELECT t.*, tt.taxonomy, tt.description, tt.parent, tt.count, tt.term_taxonomy_id
    FROM ${prefix}terms t
    JOIN ${prefix}term_taxonomy tt ON t.term_id = tt.term_id
    WHERE ${where.join(' AND ')}
    ORDER BY ${orderby} ${order}
    LIMIT ?
  `).bind(...params, limit).all();

  return rows.results || [];
}

/**
 * Get terms attached to a specific post.
 * Equivalent to wp_get_post_terms().
 *
 * @param {object} cp
 * @param {number} postId
 * @param {string} taxonomy
 * @returns {Promise<object[]>}
 */
export async function getPostTerms(cp, postId, taxonomy) {
  const prefix = cp.db_prefix || 'cp_';
  const rows   = await cp.db.prepare(`
    SELECT t.*, tt.taxonomy, tt.description, tt.parent, tt.count
    FROM ${prefix}terms t
    JOIN ${prefix}term_taxonomy tt ON t.term_id = tt.term_id
    JOIN ${prefix}term_relationships tr ON tt.term_taxonomy_id = tr.term_taxonomy_id
    WHERE tr.object_id=? AND tt.taxonomy=?
    ORDER BY t.name ASC
  `).bind(postId, taxonomy).all();
  return rows.results || [];
}

// -- Term write ----------------------------------------------------------------

/**
 * Insert a term (and its taxonomy record).
 * Equivalent to wp_insert_term().
 *
 * @param {object} cp
 * @param {string} name
 * @param {string} taxonomy
 * @param {object} [args]    { slug, description, parent }
 * @returns {Promise<{ term_id: number, term_taxonomy_id: number }>}
 */
export async function insertTerm(cp, name, taxonomy, args = {}) {
  const prefix      = cp.db_prefix || 'cp_';
  const slug        = args.slug        || slugifyTerm(name);
  const description = args.description || '';
  const parent      = args.parent      || 0;

  // Upsert into cp_terms
  const termResult = await cp.db.prepare(`
    INSERT INTO ${prefix}terms (name, slug, term_group)
    VALUES (?, ?, 0)
    ON CONFLICT(slug) DO UPDATE SET name=excluded.name
    RETURNING term_id
  `).bind(name, slug).first();

  const termId = termResult?.term_id;
  if (!termId) throw new Error(`Failed to insert term "${name}"`);

  // Upsert into cp_term_taxonomy
  const ttResult = await cp.db.prepare(`
    INSERT INTO ${prefix}term_taxonomy (term_id, taxonomy, description, parent, count)
    VALUES (?, ?, ?, ?, 0)
    ON CONFLICT(term_id, taxonomy) DO UPDATE SET description=excluded.description, parent=excluded.parent
    RETURNING term_taxonomy_id
  `).bind(termId, taxonomy, description, parent).first();

  return { term_id: termId, term_taxonomy_id: ttResult?.term_taxonomy_id || 0 };
}

/**
 * Update a term.
 * Equivalent to wp_update_term().
 *
 * @param {object} cp
 * @param {number} termId
 * @param {string} taxonomy
 * @param {object} args
 * @returns {Promise<boolean>}
 */
export async function updateTerm(cp, termId, taxonomy, args = {}) {
  const prefix = cp.db_prefix || 'cp_';

  if (args.name !== undefined || args.slug !== undefined) {
    const fields = [];
    const vals   = [];
    if (args.name !== undefined) { fields.push('name=?'); vals.push(args.name); }
    if (args.slug !== undefined) { fields.push('slug=?'); vals.push(args.slug); }
    vals.push(termId);
    await cp.db.prepare(`UPDATE ${prefix}terms SET ${fields.join(',')} WHERE term_id=?`)
      .bind(...vals).run();
  }

  if (args.description !== undefined || args.parent !== undefined) {
    const fields = [];
    const vals   = [];
    if (args.description !== undefined) { fields.push('description=?'); vals.push(args.description); }
    if (args.parent      !== undefined) { fields.push('parent=?');      vals.push(args.parent); }
    vals.push(termId, taxonomy);
    await cp.db.prepare(`UPDATE ${prefix}term_taxonomy SET ${fields.join(',')} WHERE term_id=? AND taxonomy=?`)
      .bind(...vals).run();
  }

  return true;
}

/**
 * Delete a term.
 * Equivalent to wp_delete_term().
 *
 * @param {object} cp
 * @param {number} termId
 * @param {string} taxonomy
 * @returns {Promise<boolean>}
 */
export async function deleteTerm(cp, termId, taxonomy) {
  const prefix = cp.db_prefix || 'cp_';

  // Remove relationships
  const tt = await cp.db.prepare(
    `SELECT term_taxonomy_id FROM ${prefix}term_taxonomy WHERE term_id=? AND taxonomy=? LIMIT 1`
  ).bind(termId, taxonomy).first();

  if (tt) {
    await cp.db.prepare(`DELETE FROM ${prefix}term_relationships WHERE term_taxonomy_id=?`)
      .bind(tt.term_taxonomy_id).run();
    await cp.db.prepare(`DELETE FROM ${prefix}term_taxonomy WHERE term_taxonomy_id=?`)
      .bind(tt.term_taxonomy_id).run();
  }

  // Only delete the term if no other taxonomies use it
  const remaining = await cp.db.prepare(
    `SELECT COUNT(*) as n FROM ${prefix}term_taxonomy WHERE term_id=?`
  ).bind(termId).first();

  if (!remaining?.n) {
    await cp.db.prepare(`DELETE FROM ${prefix}terms WHERE term_id=?`).bind(termId).run();
  }

  return true;
}

/**
 * Set the terms for a post (replaces existing terms for that taxonomy).
 * Equivalent to wp_set_post_terms().
 *
 * @param {object}   cp
 * @param {number}   postId
 * @param {number[]} termIds
 * @param {string}   taxonomy
 * @param {boolean}  [append]  If true, add without removing existing
 * @returns {Promise<void>}
 */
export async function setPostTerms(cp, postId, termIds, taxonomy, append = false) {
  const prefix = cp.db_prefix || 'cp_';

  if (!append) {
    // Remove existing relationships for this taxonomy
    const existing = await cp.db.prepare(`
      SELECT tr.term_taxonomy_id FROM ${prefix}term_relationships tr
      JOIN ${prefix}term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
      WHERE tr.object_id=? AND tt.taxonomy=?
    `).bind(postId, taxonomy).all();

    for (const row of (existing.results || [])) {
      await cp.db.prepare(`DELETE FROM ${prefix}term_relationships WHERE object_id=? AND term_taxonomy_id=?`)
        .bind(postId, row.term_taxonomy_id).run();
    }
  }

  // Insert new relationships
  for (const termId of termIds) {
    const tt = await cp.db.prepare(
      `SELECT term_taxonomy_id FROM ${prefix}term_taxonomy WHERE term_id=? AND taxonomy=? LIMIT 1`
    ).bind(termId, taxonomy).first();

    if (tt) {
      await cp.db.prepare(`
        INSERT OR IGNORE INTO ${prefix}term_relationships (object_id, term_taxonomy_id, term_order)
        VALUES (?, ?, 0)
      `).bind(postId, tt.term_taxonomy_id).run();
    }
  }

  // Recount
  await recountTerms(cp, taxonomy);
}

/**
 * Recount all terms in a taxonomy.
 *
 * @param {object} cp
 * @param {string} taxonomy
 */
async function recountTerms(cp, taxonomy) {
  const prefix = cp.db_prefix || 'cp_';
  const terms  = await cp.db.prepare(
    `SELECT term_taxonomy_id FROM ${prefix}term_taxonomy WHERE taxonomy=?`
  ).bind(taxonomy).all();

  for (const row of (terms.results || [])) {
    const cnt = await cp.db.prepare(
      `SELECT COUNT(*) as n FROM ${prefix}term_relationships WHERE term_taxonomy_id=?`
    ).bind(row.term_taxonomy_id).first();

    await cp.db.prepare(
      `UPDATE ${prefix}term_taxonomy SET count=? WHERE term_taxonomy_id=?`
    ).bind(cnt?.n ?? 0, row.term_taxonomy_id).run();
  }
}

// -- Helpers -------------------------------------------------------------------

function slugifyTerm(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Build a category tree structure.
 * Equivalent to get_category_tree().
 *
 * @param {object[]} terms
 * @param {number}   [parentId]
 * @returns {object[]}
 */
export function buildTermTree(terms, parentId = 0) {
  return terms
    .filter(t => (t.parent || 0) == parentId)
    .map(t => ({ ...t, children: buildTermTree(terms, t.term_id) }));
}

/**
 * Render a flat select options list for a term tree.
 *
 * @param {object[]} tree
 * @param {number}   [selected]
 * @param {number}   [depth]
 * @returns {string}
 */
export function renderTermOptions(tree, selected = 0, depth = 0) {
  return tree.map(t => {
    const indent = '\u00a0\u00a0'.repeat(depth);
    const sel    = t.term_id == selected ? ' selected' : '';
    return `<option value="${t.term_id}"${sel}>${indent}${escHtml(t.name)}</option>` +
           (t.children?.length ? renderTermOptions(t.children, selected, depth + 1) : '');
  }).join('');
}


