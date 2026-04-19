/**
 * CloudPress Query v4.0
 * - 카테고리/태그/작성자 404 버그 수정: term이 없어도 빈 아카이브로 표시
 * - /category, /tag, /author 등 누락 slug 처리 안전하게 강화
 * - 날짜 아카이브, 단일 포스트/페이지, 검색 전반 에러 처리 강화
 */

import { getPosts, getPost } from './post.js';
import { getOption }         from './option.js';

export async function cpQuery(request, cp) {
  const url    = new URL(request.url);
  const path   = url.pathname.replace(/\/+$/, '') || '/';
  const parts  = path.split('/').filter(Boolean);
  const prefix = cp.db_prefix || 'cp_';

  const paged        = Math.max(1, parseInt(url.searchParams.get('paged') || '1'));
  const postsPerPage = Math.max(1, parseInt(await getOption(cp, 'posts_per_page', 10).catch(() => 10)));

  cp.query = {
    is_home: false, is_single: false, is_page: false, is_archive: false,
    is_category: false, is_tag: false, is_author: false, is_search: false,
    is_404: false, is_feed: false,
    paged, posts_per_page: postsPerPage,
    found_posts: 0, max_num_pages: 1,
    posts: [], queried_object: null, request_path: path,
  };

  const q = cp.query;

  // -- Home / blog index --------------------------------------------------
  if (path === '/' || (parts.length === 1 && parts[0] === 'page')) {
    q.is_home = true;
    try {
      const showOnFront = await getOption(cp, 'show_on_front', 'posts');
      if (showOnFront === 'page') {
        const pageOnFront = await getOption(cp, 'page_on_front', 0);
        if (pageOnFront) {
          const p = await getPost(cp, pageOnFront).catch(() => null);
          if (p) { q.is_page = true; q.is_home = false; q.queried_object = p; q.posts = [p]; return; }
        }
      }
    } catch (_) {}
    await loadArchivePosts(cp, q, { post_type: 'post', post_status: 'publish' }, postsPerPage, paged, prefix);
    return;
  }

  // -- Search ------------------------------------------------------------
  if (url.searchParams.has('s') || parts[0] === 'search') {
    const s = url.searchParams.get('s') || parts[1] || '';
    q.is_search    = true;
    q.search_query = s;
    await loadArchivePosts(cp, q, { post_type: 'post', post_status: 'publish', s }, postsPerPage, paged, prefix);
    return;
  }

  // -- Category archive: /category/<slug> --------------------------------
  if (parts[0] === 'category') {
    q.is_archive  = true;
    q.is_category = true;
    const slug = parts[1];
    if (slug) {
      try {
        const term = await cp.db.prepare(
          `SELECT t.*, tt.term_taxonomy_id, tt.taxonomy, tt.count
             FROM ${prefix}terms t
             JOIN ${prefix}term_taxonomy tt ON t.term_id = tt.term_id
            WHERE tt.taxonomy = 'category' AND t.slug = ?
            LIMIT 1`
        ).bind(slug).first().catch(() => null);

        if (term) {
          q.queried_object = term;
          const ids = await cp.db.prepare(
            `SELECT object_id FROM ${prefix}term_relationships WHERE term_taxonomy_id = ?`
          ).bind(term.term_taxonomy_id).all().catch(() => ({ results: [] }));
          const postIds = (ids.results || []).map(r => r.object_id);
          if (postIds.length) {
            await loadArchivePosts(cp, q, { post_type: 'post', post_status: 'publish', post__in: postIds }, postsPerPage, paged, prefix);
          }
        }
        // term 없어도 404 대신 빈 아카이브 반환 (카테고리 페이지가 존재는 함)
      } catch (_) {}
    }
    return;
  }

  // -- Tag archive: /tag/<slug> ------------------------------------------
  if (parts[0] === 'tag') {
    q.is_archive = true;
    q.is_tag     = true;
    const slug = parts[1];
    if (slug) {
      try {
        const term = await cp.db.prepare(
          `SELECT t.*, tt.term_taxonomy_id, tt.taxonomy, tt.count
             FROM ${prefix}terms t
             JOIN ${prefix}term_taxonomy tt ON t.term_id = tt.term_id
            WHERE tt.taxonomy = 'post_tag' AND t.slug = ?
            LIMIT 1`
        ).bind(slug).first().catch(() => null);

        if (term) {
          q.queried_object = term;
          const ids = await cp.db.prepare(
            `SELECT object_id FROM ${prefix}term_relationships WHERE term_taxonomy_id = ?`
          ).bind(term.term_taxonomy_id).all().catch(() => ({ results: [] }));
          const postIds = (ids.results || []).map(r => r.object_id);
          if (postIds.length) {
            await loadArchivePosts(cp, q, { post_type: 'post', post_status: 'publish', post__in: postIds }, postsPerPage, paged, prefix);
          }
        }
      } catch (_) {}
    }
    return;
  }

  // -- Author archive: /author/<login> -----------------------------------
  if (parts[0] === 'author') {
    q.is_archive = true;
    q.is_author  = true;
    const login = parts[1];
    if (login) {
      try {
        const author = await cp.db.prepare(
          `SELECT * FROM ${prefix}users WHERE user_login = ? OR user_nicename = ? LIMIT 1`
        ).bind(login, login).first().catch(() => null);
        if (author) {
          q.queried_object = author;
          await loadArchivePosts(cp, q, { post_type: 'post', post_status: 'publish', author: author.ID }, postsPerPage, paged, prefix);
        }
      } catch (_) {}
    }
    return;
  }

  // -- Date archive: /YYYY or /YYYY/MM -----------------------------------
  if (/^\d{4}$/.test(parts[0]) && parts.length <= 2) {
    q.is_archive = true;
    const year   = parts[0];
    const month  = parts[1];
    try {
      let wherePart = `post_type='post' AND post_status='publish' AND strftime('%Y', post_date)=?`;
      const params = [year];
      if (month) { wherePart += ` AND strftime('%m', post_date)=?`; params.push(month.padStart(2, '0')); }
      const offset = (paged - 1) * postsPerPage;
      const [countRow, rows] = await Promise.all([
        cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}posts WHERE ${wherePart}`).bind(...params).first(),
        cp.db.prepare(`SELECT * FROM ${prefix}posts WHERE ${wherePart} ORDER BY post_date DESC LIMIT ? OFFSET ?`).bind(...params, postsPerPage, offset).all(),
      ]);
      q.found_posts   = countRow?.n ?? 0;
      q.max_num_pages = Math.ceil(q.found_posts / postsPerPage) || 1;
      q.posts         = rows.results || [];
    } catch (_) {}
    return;
  }

  // -- Single post: /YYYY/MM/slug ----------------------------------------
  if (parts.length === 3 && /^\d{4}$/.test(parts[0]) && /^\d{2}$/.test(parts[1])) {
    const slug = parts[2];
    try {
      const post = await cp.db.prepare(
        `SELECT * FROM ${prefix}posts WHERE post_name=? AND post_type='post' AND post_status='publish' LIMIT 1`
      ).bind(slug).first().catch(() => null);
      if (post) { q.is_single = true; q.queried_object = post; q.posts = [post]; return; }
    } catch (_) {}
    q.is_404 = true;
    return;
  }

  // -- ?p=<id> link -------------------------------------------------------
  if (url.searchParams.has('p')) {
    const id = parseInt(url.searchParams.get('p'));
    try {
      const post = await getPost(cp, id).catch(() => null);
      if (post && post.post_status === 'publish') {
        q.is_single = true; q.queried_object = post; q.posts = [post]; return;
      }
    } catch (_) {}
    q.is_404 = true;
    return;
  }

  // -- ?page_id=<id> ------------------------------------------------------
  if (url.searchParams.has('page_id')) {
    const id = parseInt(url.searchParams.get('page_id'));
    try {
      const page = await getPost(cp, id).catch(() => null);
      if (page && page.post_status === 'publish') {
        q.is_page = true; q.queried_object = page; q.posts = [page]; return;
      }
    } catch (_) {}
    q.is_404 = true;
    return;
  }

  // -- Page / single slug: /<slug> ----------------------------------------
  if (parts.length >= 1) {
    const slug = parts[parts.length - 1];
    try {
      const page = await cp.db.prepare(
        `SELECT * FROM ${prefix}posts WHERE post_name=? AND post_type='page' AND post_status='publish' LIMIT 1`
      ).bind(slug).first().catch(() => null);
      if (page) { q.is_page = true; q.queried_object = page; q.posts = [page]; return; }

      const post = await cp.db.prepare(
        `SELECT * FROM ${prefix}posts WHERE post_name=? AND post_status='publish' LIMIT 1`
      ).bind(slug).first().catch(() => null);
      if (post) { q.is_single = true; q.queried_object = post; q.posts = [post]; return; }
    } catch (_) {}
  }

  // -- 404 ----------------------------------------------------------------
  q.is_404 = true;
}

// -- loadArchivePosts -------------------------------------------------------

async function loadArchivePosts(cp, q, args, postsPerPage, paged, prefix) {
  const offset   = (paged - 1) * postsPerPage;
  const postType = args.post_type   || 'post';
  const status   = args.post_status || 'publish';

  let where    = `post_type=? AND post_status=?`;
  const params = [postType, status];

  if (args.author) { where += ' AND post_author=?'; params.push(args.author); }
  if (args.s)      { where += ' AND (post_title LIKE ? OR post_content LIKE ?)'; params.push(`%${args.s}%`, `%${args.s}%`); }
  if (args.post__in?.length) {
    where += ` AND ID IN (${args.post__in.map(() => '?').join(',')})`;
    params.push(...args.post__in);
  }

  try {
    const [countRow, rows] = await Promise.all([
      cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}posts WHERE ${where}`).bind(...params).first(),
      cp.db.prepare(`SELECT * FROM ${prefix}posts WHERE ${where} ORDER BY post_date DESC LIMIT ? OFFSET ?`)
        .bind(...params, postsPerPage, offset).all(),
    ]);
    q.found_posts   = countRow?.n ?? 0;
    q.max_num_pages = Math.ceil(q.found_posts / postsPerPage) || 1;
    q.posts         = rows.results || [];
  } catch (_) {
    q.found_posts = 0; q.max_num_pages = 1; q.posts = [];
  }
}
