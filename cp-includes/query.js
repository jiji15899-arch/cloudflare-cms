/**
 * CloudPress Query
 * Replaces WordPress WP_Query and the rewrite rule resolution in wp-includes/query.php.
 *
 * Parses the request URL and loads the appropriate post/page/archive into cp.query.
 *
 * @package CloudPress
 */

import { getPosts, getPost } from './post.js';
import { getOption }         from './option.js';

/**
 * Resolve the current URL into a cp.query object.
 * Equivalent to $wp->main() + new WP_Query($wp->query_vars).
 *
 * After this runs, cp.query contains:
 *  - queried_object   Post | Term | null
 *  - posts            Post[]
 *  - is_single, is_page, is_home, is_archive, is_404, etc.
 *  - paged, posts_per_page, found_posts, max_num_pages
 *
 * @param {Request} request
 * @param {object}  cp
 */
export async function cpQuery(request, cp) {
  const url    = new URL(request.url);
  const path   = url.pathname.replace(/\/+$/, '') || '/';
  const parts  = path.split('/').filter(Boolean);
  const prefix = cp.db_prefix || 'cp_';

  const paged       = parseInt(url.searchParams.get('paged') || '1');
  const postsPerPage = parseInt(await getOption(cp, 'posts_per_page', 10));

  cp.query = {
    is_home:        false,
    is_single:      false,
    is_page:        false,
    is_archive:     false,
    is_category:    false,
    is_tag:         false,
    is_author:      false,
    is_search:      false,
    is_404:         false,
    is_feed:        false,
    paged,
    posts_per_page: postsPerPage,
    found_posts:    0,
    max_num_pages:  1,
    posts:          [],
    queried_object: null,
    request_path:   path,
  };

  const q = cp.query;

  // -- Home / blog index --------------------------------------------------
  if (path === '/' || (parts.length === 1 && parts[0] === 'page')) {
    q.is_home = true;
    const showOnFront = await getOption(cp, 'show_on_front', 'posts');
    if (showOnFront === 'page') {
      const pageOnFront = await getOption(cp, 'page_on_front', 0);
      if (pageOnFront) {
        const p = await getPost(cp, pageOnFront);
        if (p) { q.is_page = true; q.is_home = false; q.queried_object = p; q.posts = [p]; return; }
      }
    }
    await loadArchivePosts(cp, q, { post_type: 'post', post_status: 'publish' }, postsPerPage, paged, prefix);
    return;
  }

  // -- Search ------------------------------------------------------------
  if (url.searchParams.has('s') || parts[0] === 'search') {
    const s = url.searchParams.get('s') || parts[1] || '';
    q.is_search = true;
    q.search_query = s;
    await loadArchivePosts(cp, q, { post_type: 'post', post_status: 'publish', s }, postsPerPage, paged, prefix);
    return;
  }

  // -- Category archive: /category/<slug> --------------------------------
  if (parts[0] === 'category' && parts[1]) {
    q.is_archive  = true;
    q.is_category = true;
    const slug    = parts[1];
    const term    = await cp.db.prepare(`SELECT * FROM ${prefix}terms t JOIN ${prefix}term_taxonomy tt ON t.term_id=tt.term_id WHERE tt.taxonomy='category' AND t.slug=? LIMIT 1`).bind(slug).first().catch(() => null);
    if (!term) { q.is_404 = true; return; }
    q.queried_object = term;
    // Get post IDs in this category
    const ids = await cp.db.prepare(`SELECT object_id FROM ${prefix}term_relationships WHERE term_taxonomy_id=?`).bind(term.term_taxonomy_id).all().catch(() => ({ results: [] }));
    const postIds = (ids.results || []).map(r => r.object_id);
    if (postIds.length) {
      await loadArchivePosts(cp, q, { post_type: 'post', post_status: 'publish', post__in: postIds }, postsPerPage, paged, prefix);
    }
    return;
  }

  // -- Tag archive: /tag/<slug> ------------------------------------------
  if (parts[0] === 'tag' && parts[1]) {
    q.is_archive = true;
    q.is_tag     = true;
    const slug   = parts[1];
    const term   = await cp.db.prepare(`SELECT * FROM ${prefix}terms t JOIN ${prefix}term_taxonomy tt ON t.term_id=tt.term_id WHERE tt.taxonomy='post_tag' AND t.slug=? LIMIT 1`).bind(slug).first().catch(() => null);
    if (!term) { q.is_404 = true; return; }
    q.queried_object = term;
    const ids = await cp.db.prepare(`SELECT object_id FROM ${prefix}term_relationships WHERE term_taxonomy_id=?`).bind(term.term_taxonomy_id).all().catch(() => ({ results: [] }));
    const postIds = (ids.results || []).map(r => r.object_id);
    if (postIds.length) {
      await loadArchivePosts(cp, q, { post_type: 'post', post_status: 'publish', post__in: postIds }, postsPerPage, paged, prefix);
    }
    return;
  }

  // -- Author archive: /author/<login> ----------------------------------
  if (parts[0] === 'author' && parts[1]) {
    q.is_archive = true;
    q.is_author  = true;
    const author = await cp.db.prepare(`SELECT * FROM ${prefix}users WHERE user_login=? OR user_nicename=? LIMIT 1`).bind(parts[1], parts[1]).first().catch(() => null);
    if (!author) { q.is_404 = true; return; }
    q.queried_object = author;
    await loadArchivePosts(cp, q, { post_type: 'post', post_status: 'publish', author: author.ID }, postsPerPage, paged, prefix);
    return;
  }

  // -- Date archive: /YYYY or /YYYY/MM ----------------------------------
  if (/^\d{4}$/.test(parts[0]) && parts.length <= 2) {
    q.is_archive = true;
    const year   = parts[0];
    const month  = parts[1];
    let wherePart = `post_type='post' AND post_status='publish' AND strftime('%Y', post_date)=?`;
    const params = [year];
    if (month) { wherePart += ` AND strftime('%m', post_date)=?`; params.push(month.padStart(2,'0')); }
    const offset = (paged - 1) * postsPerPage;
    const [countRow, rows] = await Promise.all([
      cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}posts WHERE ${wherePart}`).bind(...params).first(),
      cp.db.prepare(`SELECT * FROM ${prefix}posts WHERE ${wherePart} ORDER BY post_date DESC LIMIT ? OFFSET ?`).bind(...params, postsPerPage, offset).all(),
    ]);
    q.found_posts    = countRow?.n ?? 0;
    q.max_num_pages  = Math.ceil(q.found_posts / postsPerPage) || 1;
    q.posts          = rows.results || [];
    return;
  }

  // -- Single post: /YYYY/MM/slug ----------------------------------------
  if (parts.length === 3 && /^\d{4}$/.test(parts[0]) && /^\d{2}$/.test(parts[1])) {
    const slug = parts[2];
    const post = await cp.db.prepare(`SELECT * FROM ${prefix}posts WHERE post_name=? AND post_type='post' AND post_status='publish' LIMIT 1`).bind(slug).first().catch(() => null);
    if (!post) { q.is_404 = true; return; }
    q.is_single      = true;
    q.queried_object = post;
    q.posts          = [post];
    return;
  }

  // -- ?p=<id> link ------------------------------------------------------
  if (url.searchParams.has('p')) {
    const id   = parseInt(url.searchParams.get('p'));
    const post = await getPost(cp, id).catch(() => null);
    if (!post || post.post_status !== 'publish') { q.is_404 = true; return; }
    q.is_single      = true;
    q.queried_object = post;
    q.posts          = [post];
    return;
  }

  // -- ?page_id=<id> -----------------------------------------------------
  if (url.searchParams.has('page_id')) {
    const id   = parseInt(url.searchParams.get('page_id'));
    const page = await getPost(cp, id).catch(() => null);
    if (!page || page.post_status !== 'publish') { q.is_404 = true; return; }
    q.is_page        = true;
    q.queried_object = page;
    q.posts          = [page];
    return;
  }

  // -- Page / single slug: /<slug> ---------------------------------------
  if (parts.length >= 1) {
    const slug = parts[parts.length - 1];
    // Try page first
    const page = await cp.db.prepare(`SELECT * FROM ${prefix}posts WHERE post_name=? AND post_type='page' AND post_status='publish' LIMIT 1`).bind(slug).first().catch(() => null);
    if (page) {
      q.is_page        = true;
      q.queried_object = page;
      q.posts          = [page];
      return;
    }
    // Try any custom post type
    const post = await cp.db.prepare(`SELECT * FROM ${prefix}posts WHERE post_name=? AND post_status='publish' LIMIT 1`).bind(slug).first().catch(() => null);
    if (post) {
      q.is_single      = true;
      q.queried_object = post;
      q.posts          = [post];
      return;
    }
  }

  // -- 404 ---------------------------------------------------------------
  q.is_404 = true;
}

// -- Internal ---------------------------------------------------------------

async function loadArchivePosts(cp, q, args, postsPerPage, paged, prefix) {
  const offset    = (paged - 1) * postsPerPage;
  const postType  = args.post_type  || 'post';
  const status    = args.post_status || 'publish';

  let where  = `post_type=? AND post_status=?`;
  const params = [postType, status];

  if (args.author) { where += ' AND post_author=?'; params.push(args.author); }
  if (args.s)      { where += ' AND post_title LIKE ?'; params.push(`%${args.s}%`); }
  if (args.post__in?.length) {
    where += ` AND ID IN (${args.post__in.map(() => '?').join(',')})`;
    params.push(...args.post__in);
  }

  const [countRow, rows] = await Promise.all([
    cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}posts WHERE ${where}`).bind(...params).first(),
    cp.db.prepare(`SELECT * FROM ${prefix}posts WHERE ${where} ORDER BY post_date DESC LIMIT ? OFFSET ?`)
      .bind(...params, postsPerPage, offset).all(),
  ]);

  q.found_posts   = countRow?.n ?? 0;
  q.max_num_pages = Math.ceil(q.found_posts / postsPerPage) || 1;
  q.posts         = rows.results || [];
}
