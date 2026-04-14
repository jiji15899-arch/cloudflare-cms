/**
 * CloudPress Trackbacks & Pingbacks
 * Replaces WordPress wp-trackback.php
 *
 * Handles trackback/pingback submissions and stores them as comments in D1.
 *
 * @package CloudPress
 */

import { cpLoad } from './cp-load.js';
import { sanitizeTextField, sanitizeUrl } from './cp-includes/sanitize.js';
import { newComment } from './cp-includes/comment.js';
import { pingsOpen } from './cp-includes/post.js';
import { htmlExcerpt } from './cp-includes/formatting.js';

/**
 * Handle trackback/pingback request.
 *
 * @param {Request} request
 * @param {object}  env
 * @param {object}  ctx
 * @param {object}  routeParams  - e.g. { post_id: '123' }
 * @returns {Promise<Response>}
 */
export async function handleTrackback(request, env, ctx, routeParams = {}) {
  const cp = await cpLoad(request, env, ctx);
  if (cp.__cpError) return cp.response;

  // Run as unauthenticated
  cp.currentUser = null;

  const url    = new URL(request.url);
  const method = request.method.toUpperCase();

  // Parse post ID from route or URL
  let postId = parseInt(routeParams.post_id || url.searchParams.get('tb_id') || '0', 10);
  if (!postId) {
    // Try to extract from URL path (e.g. /2024/01/my-post/trackback/)
    const parts = url.pathname.split('/').filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      const n = parseInt(parts[i], 10);
      if (n > 0) { postId = n; break; }
    }
  }

  // Parse POST body
  let postData = {};
  if (method === 'POST') {
    try {
      const formData = await request.formData();
      for (const [k, v] of formData.entries()) {
        postData[k] = typeof v === 'string' ? v : '';
      }
    } catch (_) {}
  }

  const trackbackUrl = postData.url ? sanitizeUrl(postData.url) : '';
  let charset        = postData.charset ? sanitizeTextField(postData.charset) : '';
  let title          = postData.title || '';
  let excerpt        = postData.excerpt || '';
  let blogName       = postData.blog_name || '';

  // Sanitize charset
  if (charset) {
    charset = charset.replace(/[, ]/g, '').toUpperCase().trim();
    // Strip any charset not in basic safe list
    const allowedCharsets = ['UTF-8', 'ASCII', 'ISO-8859-1', 'EUC-JP', 'SJIS'];
    if (!allowedCharsets.includes(charset)) charset = '';
  }

  // Block UTF-7 (security)
  if (charset.includes('UTF-7')) {
    return new Response('', { status: 400 });
  }

  // Sanitize text fields
  title    = sanitizeTextField(title);
  excerpt  = sanitizeTextField(excerpt);
  blogName = sanitizeTextField(blogName);

  if (!postId) {
    return trackbackResponse(true, 'I really need an ID for this to work.');
  }

  // If no trackback data looks like a trackback, redirect to post
  if (!trackbackUrl && !title && !blogName) {
    const permalink = `/?p=${postId}`;
    return Response.redirect(cp.hooks.applyFilters('cp_redirect_no_trackback', permalink, postId), 302);
  }

  if (trackbackUrl && title) {
    // Fire pre_trackback_post hook
    cp.hooks.doAction('pre_trackback_post', postId, trackbackUrl, charset, title, excerpt, blogName);

    // Check pings open
    const isPingsOpen = await pingsOpen(cp, postId);
    if (!isPingsOpen) {
      return trackbackResponse(true, 'Sorry, trackbacks are closed for this item.');
    }

    // Truncate
    title   = htmlExcerpt(title, 250);
    excerpt = htmlExcerpt(excerpt, 252);

    // Check for duplicate
    const prefix  = cp.config.DB_PREFIX || 'cp_';
    const existing = await cp.db.prepare(`
      SELECT comment_ID FROM ${prefix}comments
      WHERE comment_post_ID = ? AND comment_author_url = ?
      LIMIT 1
    `).bind(postId, trackbackUrl).first();

    if (existing) {
      return trackbackResponse(true, 'There is already a ping from that URL for this post.');
    }

    // Insert trackback comment
    const commentData = {
      comment_post_ID:      postId,
      comment_author:       blogName,
      comment_author_email: '',
      comment_author_url:   trackbackUrl,
      comment_content:      `<strong>${title}</strong>\n\n${excerpt}`,
      comment_type:         'trackback',
    };

    const result = await newComment(cp, commentData);
    if (result.error) {
      return trackbackResponse(true, result.message);
    }

    const trackbackId = result.comment_ID;
    cp.hooks.doAction('trackback_post', trackbackId);

    return trackbackResponse(false);
  }

  return trackbackResponse(true, 'Missing trackback URL or title.');
}

/**
 * Return XML trackback response.
 *
 * @param {boolean} error
 * @param {string}  errorMessage
 * @returns {Response}
 */
function trackbackResponse(error, errorMessage = '') {
  let xml = '<?xml version="1.0" encoding="utf-8"?>\n<response>\n';

  if (error) {
    xml += `<error>1</error>\n<message>${escXml(errorMessage)}</message>\n`;
  } else {
    xml += '<error>0</error>\n';
  }

  xml += '</response>';

  return new Response(xml, {
    status: error ? 400 : 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

function escXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
