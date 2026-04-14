/**
 * CloudPress Link / Permalink Template API
 * Replaces WordPress wp-includes/link-template.php
 *
 * Generates URLs for posts, pages, archives, feeds, admin, etc.
 * No .htaccess — all routing handled by Cloudflare Worker (cp-router.js).
 *
 * @package CloudPress
 */

import { getOption } from './option.js';

// ── Post / Page permalinks ────────────────────────────────────────────────────

/**
 * Get the permalink for a post.
 * Equivalent to get_permalink().
 *
 * @param {object} cp
 * @param {object|number} post  post object or ID
 * @returns {Promise<string>}
 */
export async function getPermalink(cp, post) {
  const siteUrl     = await getOption(cp, 'siteurl', cp.config?.SITE_URL || cp.url.origin);
  const permalinks  = await getOption(cp, 'permalink_structure', '/%year%/%monthnum%/%postname%/');
  const postObj     = typeof post === 'object' ? post : await fetchPost(cp, post);
  if (!postObj) return siteUrl;

  if (postObj.post_type === 'page') {
    return `${siteUrl.replace(/\/$/, '')}/${postObj.post_name}/`;
  }

  const date = new Date(postObj.post_date || Date.now());
  const year  = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day   = String(date.getDate()).padStart(2, '0');

  const slug = (permalinks || '/%postname%/')
    .replace('%year%',      year)
    .replace('%monthnum%',  month)
    .replace('%day%',       day)
    .replace('%postname%',  postObj.post_name || String(postObj.ID))
    .replace('%post_id%',   String(postObj.ID))
    .replace('%author%',    postObj.post_author || '1');

  return `${siteUrl.replace(/\/$/, '')}${slug}`;
}

/**
 * Echo (return) the permalink for a post.
 * Equivalent to the_permalink().
 */
export async function thePermalink(cp, post) {
  return getPermalink(cp, post);
}

// ── Category / Tag / Author / Date archive URLs ───────────────────────────────

/**
 * Get a category link.
 * Equivalent to get_category_link().
 *
 * @param {object} cp
 * @param {object|number} category  term object or term_id
 * @returns {Promise<string>}
 */
export async function getCategoryLink(cp, category) {
  const siteUrl = await getOption(cp, 'siteurl', cp.config?.SITE_URL || cp.url.origin);
  const slug    = typeof category === 'object' ? category.slug : String(category);
  return `${siteUrl.replace(/\/$/, '')}/category/${slug}/`;
}

/**
 * Get a tag link.
 * Equivalent to get_tag_link().
 */
export async function getTagLink(cp, tag) {
  const siteUrl = await getOption(cp, 'siteurl', cp.config?.SITE_URL || cp.url.origin);
  const slug    = typeof tag === 'object' ? tag.slug : String(tag);
  return `${siteUrl.replace(/\/$/, '')}/tag/${slug}/`;
}

/**
 * Get an author link.
 * Equivalent to get_author_posts_url().
 */
export async function getAuthorPostsUrl(cp, authorId, authorNicename = '') {
  const siteUrl = await getOption(cp, 'siteurl', cp.config?.SITE_URL || cp.url.origin);
  const nicename = authorNicename || String(authorId);
  return `${siteUrl.replace(/\/$/, '')}/author/${nicename}/`;
}

/**
 * Get a date archive link.
 * Equivalent to get_month_link() / get_year_link() / get_day_link().
 */
export async function getMonthLink(cp, year, month) {
  const siteUrl = await getOption(cp, 'siteurl', cp.config?.SITE_URL || cp.url.origin);
  const m = String(month).padStart(2, '0');
  return `${siteUrl.replace(/\/$/, '')}/${year}/${m}/`;
}

export async function getYearLink(cp, year) {
  const siteUrl = await getOption(cp, 'siteurl', cp.config?.SITE_URL || cp.url.origin);
  return `${siteUrl.replace(/\/$/, '')}/${year}/`;
}

export async function getDayLink(cp, year, month, day) {
  const siteUrl = await getOption(cp, 'siteurl', cp.config?.SITE_URL || cp.url.origin);
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${siteUrl.replace(/\/$/, '')}/${year}/${m}/${d}/`;
}

// ── Feed URLs ─────────────────────────────────────────────────────────────────

/**
 * Get the feed URL.
 * Equivalent to get_feed_link().
 */
export async function getFeedLink(cp, feedType = 'rss2') {
  const siteUrl = await getOption(cp, 'siteurl', cp.config?.SITE_URL || cp.url.origin);
  return `${siteUrl.replace(/\/$/, '')}/feed/${feedType}/`;
}

/**
 * Get the post comments feed URL.
 * Equivalent to get_post_comments_feed_link().
 */
export async function getPostCommentsFeedLink(cp, postId, feedType = 'rss2') {
  const postUrl = await getPermalink(cp, postId);
  return `${postUrl.replace(/\/$/, '')}/feed/${feedType}/`;
}

// ── Comment links ─────────────────────────────────────────────────────────────

/**
 * Get the link to a specific comment.
 * Equivalent to get_comment_link().
 *
 * @param {object} cp
 * @param {object|number} comment  comment object or comment_ID
 * @returns {Promise<string>}
 */
export async function getCommentLink(cp, comment) {
  const prefix = cp.db_prefix || 'cp_';
  let commentObj = comment;
  if (typeof comment !== 'object') {
    commentObj = await cp.db.prepare(
      `SELECT * FROM ${prefix}comments WHERE comment_ID=? LIMIT 1`
    ).bind(comment).first();
  }
  if (!commentObj) return '';
  const postUrl = await getPermalink(cp, commentObj.comment_post_ID);
  return `${postUrl}#comment-${commentObj.comment_ID}`;
}

// ── Admin links ───────────────────────────────────────────────────────────────

/**
 * Get the admin URL.
 * Equivalent to admin_url().
 */
export async function adminUrl(cp, path = '') {
  const siteUrl = await getOption(cp, 'siteurl', cp.config?.SITE_URL || cp.url.origin);
  const base    = `${siteUrl.replace(/\/$/, '')}/cp-admin`;
  return path ? `${base}/${path.replace(/^\//, '')}` : base + '/';
}

/**
 * Get the login URL.
 * Equivalent to wp_login_url().
 */
export async function loginUrl(cp, redirect = '') {
  const siteUrl = await getOption(cp, 'siteurl', cp.config?.SITE_URL || cp.url.origin);
  let url = `${siteUrl.replace(/\/$/, '')}/cp-login`;
  if (redirect) url += `?redirect_to=${encodeURIComponent(redirect)}`;
  return url;
}

/**
 * Get the logout URL.
 * Equivalent to wp_logout_url().
 */
export async function logoutUrl(cp, redirect = '') {
  const siteUrl = await getOption(cp, 'siteurl', cp.config?.SITE_URL || cp.url.origin);
  let url = `${siteUrl.replace(/\/$/, '')}/cp-login?action=logout`;
  if (redirect) url += `&redirect_to=${encodeURIComponent(redirect)}`;
  return url;
}

/**
 * Get the registration URL.
 * Equivalent to wp_registration_url().
 */
export async function getRegistrationUrl(cp) {
  const siteUrl = await getOption(cp, 'siteurl', cp.config?.SITE_URL || cp.url.origin);
  return `${siteUrl.replace(/\/$/, '')}/cp-signup`;
}

/**
 * Get the lostpassword URL.
 * Equivalent to wp_lostpassword_url().
 */
export async function lostpasswordUrl(cp, redirect = '') {
  const siteUrl = await getOption(cp, 'siteurl', cp.config?.SITE_URL || cp.url.origin);
  let url = `${siteUrl.replace(/\/$/, '')}/cp-login?action=lostpassword`;
  if (redirect) url += `&redirect_to=${encodeURIComponent(redirect)}`;
  return url;
}

// ── Search link ───────────────────────────────────────────────────────────────

/**
 * Get a search link.
 * Equivalent to get_search_link().
 */
export async function getSearchLink(cp, query = '') {
  const siteUrl = await getOption(cp, 'siteurl', cp.config?.SITE_URL || cp.url.origin);
  return query
    ? `${siteUrl.replace(/\/$/, '')}/?s=${encodeURIComponent(query)}`
    : `${siteUrl.replace(/\/$/, '')}/`;
}

// ── Internal helper ───────────────────────────────────────────────────────────

async function fetchPost(cp, postId) {
  const prefix = cp.db_prefix || 'cp_';
  return cp.db.prepare(`SELECT * FROM ${prefix}posts WHERE ID=? LIMIT 1`).bind(postId).first();
}
