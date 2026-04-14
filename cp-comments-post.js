/**
 * CloudPress Comment Submission Handler
 * Replaces WordPress wp-comments-post.php
 *
 * Handles POST requests for new comments.
 * Stores comments in D1.
 *
 * @package CloudPress
 */

import { cpLoad } from './cp-load.js';
import { handleCommentSubmission } from './cp-includes/comment.js';
import { getCurrentUser } from './cp-includes/user.js';
import { cpSafeRedirect } from './cp-includes/functions.js';
import { getCommentLink } from './cp-includes/link-template.js';
import { cpHash } from './cp-includes/crypto.js';

/**
 * Handle comment POST request.
 *
 * @param {Request} request
 * @param {object}  env
 * @param {object}  ctx
 * @returns {Promise<Response>}
 */
export async function handleCommentsPost(request, env, ctx) {
  // Only accept POST
  if (request.method.toUpperCase() !== 'POST') {
    return new Response('Method not allowed. Use POST to submit comments.', {
      status: 405,
      headers: {
        'Allow': 'POST',
        'Content-Type': 'text/plain',
      },
    });
  }

  const cp = await cpLoad(request, env, ctx);
  if (cp.__cpError) return cp.response;

  // Parse POST body
  let postData = {};
  try {
    const formData = await request.formData();
    for (const [key, value] of formData.entries()) {
      postData[key] = value;
    }
  } catch (_) {
    return cpDie(cp, 'Invalid form data.', 'Comment Submission Failure', 400);
  }

  // No-cache headers
  const responseHeaders = new Headers({
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
  });

  // Process the comment
  const commentResult = await handleCommentSubmission(cp, postData);

  if (commentResult.error) {
    const { status = 400, message } = commentResult;
    return cpDie(cp, `<p>${escHtml(message)}</p>`, 'Comment Submission Failure', status, true);
  }

  const comment = commentResult.comment;
  const user    = await getCurrentUser(cp);

  // Handle cookie consent
  const cookiesConsent = !!postData['cp-comment-cookies-consent'];

  // Fire set_comment_cookies hook
  cp.hooks.doAction('set_comment_cookies', comment, user, cookiesConsent);

  // Determine redirect URL
  let location = postData.redirect_to
    ? `${postData.redirect_to}#comment-${comment.comment_ID}`
    : await getCommentLink(cp, comment);

  // If no cookie consent and comment is unapproved, add moderation query args
  if (!cookiesConsent && comment.comment_approved === '0' && comment.comment_author_email) {
    const moderationHash = await cpHash(comment.comment_date_gmt, cp.config.AUTH_KEY);
    const locUrl = new URL(location, cp.config.SITE_URL || 'https://example.com');
    locUrl.searchParams.set('unapproved', comment.comment_ID);
    locUrl.searchParams.set('moderation-hash', moderationHash);
    location = locUrl.toString();
  }

  // Apply filter
  location = cp.hooks.applyFilters('comment_post_redirect', location, comment);

  return cpSafeRedirect(location, responseHeaders);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function cpDie(cp, message, title = 'Error', status = 500, backLink = false) {
  const back = backLink ? '<p><a href="javascript:history.back()">&larr; Go back</a></p>' : '';
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)}</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #f1f1f1;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; }
    .box { background: #fff; padding: 2rem 2.5rem; border-radius: 6px;
           border-left: 4px solid #d63638; max-width: 480px;
           box-shadow: 0 2px 8px rgba(0,0,0,.1); }
    h1 { color: #d63638; font-size: 1.2rem; margin: 0 0 1rem; }
    a { color: #2271b1; }
  </style>
</head>
<body>
  <div class="box">
    <h1>${escHtml(title)}</h1>
    ${message}
    ${back}
  </div>
</body>
</html>`;

  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
