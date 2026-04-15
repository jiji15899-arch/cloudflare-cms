/**
 * CloudPress Authentication Handler
 * Replaces WordPress wp-login.php
 *
 * JWT-based login -- no PHP sessions.
 * Issues a signed HttpOnly cookie (cp_token) on success.
 *
 * @package CloudPress
 */

import { cpLoad }           from '../cp-load.js';
import { authenticateUser } from './user.js';
import { signJwt, buildAuthCookie, clearAuthCookie } from './jwt.js';

// -- Login ------------------------------------------------------------------

export async function handleLogin(request, env, ctx) {
  const cp  = await cpLoad(request, env, ctx);
  if (cp.__cpError) return cp.response;

  const url    = cp.url;
  const method = request.method.toUpperCase();

  // Redirect if already logged in
  if (cp.currentUser) {
    return Response.redirect(url.origin + '/cp-admin', 302);
  }

  const redirectTo = url.searchParams.get('redirect_to') || '/cp-admin';
  let error = '';

  if (method === 'POST') {
    const fd       = await request.formData().catch(() => new FormData());
    const login    = (fd.get('log') || '').trim();
    const password = fd.get('pwd') || '';
    const remember = fd.get('rememberme') === '1';

    const user = await authenticateUser(cp, login, password);

    if (user) {
      const ttl   = remember ? 30 * 86400 : 86400;
      const token = await signJwt(
        { sub: String(user.ID), login: user.user_login, roles: user.roles },
        cp.config.AUTH_KEY,
        ttl
      );

      const secure = url.protocol === 'https:';
      const cookie = buildAuthCookie(token, ttl, secure);

      // Sanitise redirect target
      const safeRedirect = redirectTo.startsWith('/') ? redirectTo : '/cp-admin';

      return new Response(null, {
        status: 302,
        headers: {
          Location: url.origin + safeRedirect,
          'Set-Cookie': cookie,
        },
      });
    } else {
      error = 'Invalid username or password. Please try again.';
    }
  }

  const html = renderLoginPage(error, redirectTo, cp.config.SITE_NAME || 'CloudPress');
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// -- Logout -----------------------------------------------------------------

export async function handleLogout(request, env, ctx) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/cp-login',
      'Set-Cookie': clearAuthCookie(),
    },
  });
}

// -- Login page HTML --------------------------------------------------------

function renderLoginPage(error, redirectTo, siteName) {
  const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Log In &lsaquo; ${esc(siteName)}</title>
  <link rel="stylesheet" href="/cp-includes/css/login.css">
</head>
<body>
<div class="login-wrap">
  <div class="login-logo">
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="16" fill="#F6821F"/>
      <path d="M16 32C16 23.163 23.163 16 32 16C40.837 16 48 23.163 48 32C48 40.837 40.837 48 32 48C23.163 48 16 40.837 16 32Z" fill="white" fill-opacity="0.2"/>
      <path d="M26 24L38 32L26 40V24Z" fill="white"/>
    </svg>
    <h1>${esc(siteName)}</h1>
  </div>

  <div class="login-box">
    ${error ? `<div class="login-error">${esc(error)}</div>` : ''}
    <form method="post" action="/cp-login">
      <input type="hidden" name="redirect_to" value="${esc(redirectTo)}">

      <label for="user_login">Username or Email</label>
      <input type="text" id="user_login" name="log" autocomplete="username" autofocus required>

      <label for="user_pass">Password</label>
      <input type="password" id="user_pass" name="pwd" autocomplete="current-password" required>

      <div class="login-remember">
        <input type="checkbox" id="rememberme" name="rememberme" value="1">
        <label for="rememberme" style="font-weight:400;margin:0">Remember me</label>
      </div>

      <button type="submit" class="login-btn">Log In</button>
    </form>
  </div>

  <div class="login-footer">
    <a href="/">&larr; Back to ${esc(siteName)}</a>
  </div>
</div>
</body>
</html>`;
}
