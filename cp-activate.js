/**
 * CloudPress Account/Site Activation
 * Replaces WordPress wp-activate.php
 *
 * Confirms activation keys sent by email after user sign-up.
 * Uses D1 for signup records, KV for temporary activation keys.
 *
 * @package CloudPress
 */

import { cpLoad } from './cp-load.js';
import { renderTemplate } from './cp-includes/template-loader.js';
import { sanitizeTextField } from './cp-includes/sanitize.js';
import { cpmuActivateSignup } from './cp-includes/ms-functions.js';
import { isMultisite } from './cp-includes/functions.js';
import { cpRedirect } from './cp-includes/functions.js';
import { getRegistrationUrl } from './cp-includes/link-template.js';
import { escHtml } from './cp-includes/formatting.js';

/**
 * Handle activation request.
 *
 * @param {Request} request
 * @param {object}  env
 * @param {object}  ctx
 * @returns {Promise<Response>}
 */
export async function handleActivate(request, env, ctx) {
  const cp = await cpLoad(request, env, ctx, { CP_INSTALLING: true });
  if (cp.__cpError) return cp.response;

  // Non-multisite -> redirect to registration URL
  if (!isMultisite(cp)) {
    return cpRedirect(await getRegistrationUrl(cp));
  }

  const url     = new URL(request.url);
  const method  = request.method.toUpperCase();

  // Parse key from GET or POST
  let key = '';
  const getKey = url.searchParams.get('key') || '';

  if (method === 'POST') {
    const formData = await request.formData().catch(() => new FormData());
    const postKey  = formData.get('key') || '';

    if (getKey && postKey && getKey !== postKey) {
      return cpDie(
        cp,
        'A key value mismatch has been detected. Please follow the link provided in your activation email.',
        'An error occurred during the activation',
        400
      );
    }
    key = postKey ? sanitizeTextField(postKey) : (getKey ? sanitizeTextField(getKey) : '');
  } else {
    key = getKey ? sanitizeTextField(getKey) : '';
  }

  // If key supplied, try to activate; redirect to clean URL (remove key param)
  let result = null;
  let activateCookieKey = null;

  if (key) {
    // Check if URL still has key param -- if so, store in KV and redirect
    if (url.searchParams.has('key')) {
      const cleanUrl = new URL(url.toString());
      cleanUrl.searchParams.delete('key');
      // Store key temporarily in KV (30 minutes)
      const cookieId = crypto.randomUUID();
      await env.CP_KV.put(`cp:activate_cookie:${cookieId}`, key, { expirationTtl: 1800 });

      const response = cpRedirect(cleanUrl.toString());
      response.headers.append('Set-Cookie', `cp_activate=${cookieId}; Path=/; HttpOnly; SameSite=Lax`);
      return response;
    } else {
      result = await cpmuActivateSignup(cp, key);
    }
  }

  // If no key in request, check KV cookie
  if (result === null) {
    const cookieHeader = request.headers.get('Cookie') || '';
    const cookieMatch  = cookieHeader.match(/cp_activate=([^;]+)/);
    if (cookieMatch) {
      const cookieId = cookieMatch[1];
      const storedKey = await env.CP_KV.get(`cp:activate_cookie:${cookieId}`);
      if (storedKey) {
        key    = storedKey;
        result = await cpmuActivateSignup(cp, storedKey);
        // Delete cookie from KV
        await env.CP_KV.delete(`cp:activate_cookie:${cookieId}`);
        activateCookieKey = cookieId;
      }
    }
  }

  // Determine status code
  let statusCode = 200;
  if (result === null || (result?.error === 'invalid_key')) {
    statusCode = 404;
  } else if (result?.error && !['already_active', 'blog_taken'].includes(result.error)) {
    statusCode = 400;
  }

  // Render activation page
  const html = await renderActivatePage(cp, key, result, url);
  const response = new Response(html, {
    status: statusCode,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    },
  });

  // Clear activation cookie if used
  if (activateCookieKey) {
    response.headers.append(
      'Set-Cookie',
      `cp_activate=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`
    );
  }

  return response;
}

async function renderActivatePage(cp, key, result, url) {
  const siteName = cp.config.SITE_NAME || 'CloudPress';

  let bodyContent = '';

  if (!key) {
    // Show activation form
    const actionUrl = url.pathname;
    bodyContent = `
      <h2>Activation Key Required</h2>
      <form id="activateform" method="post" action="${actionUrl}">
        <p>
          <label for="key">Activation Key:</label><br>
          <input type="text" name="key" id="key" value="" size="50" autofocus>
        </p>
        <p class="submit">
          <button type="submit" id="submit" class="cp-btn">Activate</button>
        </p>
      </form>`;
  } else if (result?.error && ['already_active', 'blog_taken'].includes(result.error)) {
    const signup = result.data || {};
    bodyContent = `
      <h2>Your account is now active!</h2>
      <p class="lead-in">
        Your account has been activated. You may now
        <a href="/cp-login">log in</a> using your chosen username
        &#8220;${escHtml(signup.user_login || '')}&#8221;.
        Please check your email inbox at ${escHtml(signup.user_email || '')} for your login instructions.
      </p>`;
  } else if (result === null || result?.error) {
    bodyContent = `
      <h2>An error occurred during the activation</h2>
      ${result?.message ? `<p>${escHtml(result.message)}</p>` : ''}`;
  } else {
    // Success
    const loginUrl = result.blog_id ? `/cp-login` : `/cp-login`;
    bodyContent = `
      <h2>Your account is now active!</h2>
      <div id="signup-welcome">
        <p><span class="h3">Username:</span> ${escHtml(result.user_login || '')}</p>
        <p><span class="h3">Password:</span> ${escHtml(result.password || '')}</p>
      </div>
      <p class="view">
        Your account is now activated.
        <a href="${loginUrl}">Log in</a> or go back to the
        <a href="/">homepage</a>.
      </p>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(siteName)} &rsaquo; Activate</title>
  <link rel="stylesheet" href="/cp-includes/css/activate.css">
</head>
<body>
<div id="signup-content">
  <div class="cp-activate-container">
    ${bodyContent}
  </div>
</div>
</body>
</html>`;
}

function cpDie(cp, message, title = 'Error', status = 500) {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>${escHtml(title)}</title></head>
<body><h1>${escHtml(title)}</h1><p>${escHtml(message)}</p></body></html>`;
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
