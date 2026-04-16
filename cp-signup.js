/**
 * CloudPress Signup / Registration
 * Replaces WordPress wp-signup.php
 *
 * Handles new user and new site registration for multisite installs.
 * Single-site registration is handled by cp-admin/register.js.
 * Uses D1 for user records, KV for activation keys.
 *
 * @package CloudPress
 */

import { cpLoad } from './cp-load.js';
import { isMultisite, cpRedirect } from './cp-includes/functions.js';
import { sanitizeTextField, sanitizeEmail, sanitizeUrl } from './cp-includes/sanitize.js';
import { isValidEmail } from './cp-includes/formatting.js';
import { cpmuValidateUserSignup, cpmuValidateBlogSignup, cpmuRegisterUser, cpmuRegisterBlog } from './cp-includes/ms-functions.js';
import { sendActivationEmail } from './cp-includes/mail.js';

/**
 * Main signup handler.
 *
 * @param {Request} request
 * @param {object}  env
 * @param {object}  ctx
 * @returns {Promise<Response>}
 */
export async function handleSignup(request, env, ctx) {
  const cp = await cpLoad(request, env, ctx);
  if (cp.__cpError) return cp.response;

  // Non-multisite -> redirect to home
  if (!isMultisite(cp)) {
    return cpRedirect('/');
  }

  const url    = new URL(request.url);
  const method = request.method.toUpperCase();

  let stage  = 'user';     // 'user' | 'blog' | 'validate_user' | 'validate_blog'
  let errors = {};
  let formData = {};

  if (method === 'POST') {
    const fd = await request.formData().catch(() => new FormData());
    for (const [k, v] of fd.entries()) {
      formData[k] = typeof v === 'string' ? v : '';
    }
    stage = formData.stage || 'validate_user';
  } else {
    stage = url.searchParams.get('stage') || 'user';
  }

  // Apply filter: signup is allowed?
  const registrationMode = cp.hooks.applyFilters('cp_registration_open', cp.config.REGISTRATION || 'none');
  // 'none' | 'user' | 'blog' | 'all'

  let html = '';

  switch (stage) {
    case 'validate_user': {
      const userLogin = sanitizeTextField(formData.user_name || '');
      const userEmail = sanitizeEmail(formData.user_email || '');

      const validation = await cpmuValidateUserSignup(cp, userLogin, userEmail);
      errors = validation.errors;

      if (Object.keys(errors).length === 0) {
        // Send activation email
        const key = await cpmuRegisterUser(cp, userLogin, userEmail);
        await sendActivationEmail(cp, userEmail, key);
        html = renderSignupComplete(cp, userEmail);
      } else {
        html = renderUserForm(cp, errors, { user_name: userLogin, user_email: userEmail });
      }
      break;
    }

    case 'validate_blog': {
      const userLogin  = sanitizeTextField(formData.user_name || '');
      const userEmail  = sanitizeEmail(formData.user_email || '');
      const blogDomain = sanitizeTextField(formData.blogname || '');
      const blogTitle  = sanitizeTextField(formData.blog_title || '');
      const blogPublic = formData.blog_public !== '0';

      const validation = await cpmuValidateBlogSignup(cp, blogDomain, blogTitle, { user_name: userLogin, user_email: userEmail });
      errors = validation.errors;

      if (Object.keys(errors).length === 0) {
        const key = await cpmuRegisterBlog(cp, userLogin, userEmail, blogDomain, blogTitle, blogPublic);
        await sendActivationEmail(cp, userEmail, key);
        html = renderSignupComplete(cp, userEmail);
      } else {
        html = renderBlogForm(cp, errors, formData);
      }
      break;
    }

    case 'blog':
      html = renderBlogForm(cp, {}, {});
      break;

    case 'user':
    default:
      html = renderUserForm(cp, {}, {});
      break;
  }

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

// -- Renderers ------------------------------------------------------------------

function renderLayout(cp, title, content) {
  const siteName = cp.config.SITE_NAME || 'CloudPress';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(siteName)} &rsaquo; ${escHtml(title)}</title>
  <link rel="stylesheet" href="/cp-includes/css/signup.css">
</head>
<body>
<div class="signup-wrapper">
  <div class="site-name"><a href="/">${escHtml(siteName)}</a></div>
  <div class="signup-box">
    ${content}
  </div>
</div>
</body>
</html>`;
}

function renderUserForm(cp, errors, values) {
  const errorHtml = Object.values(errors).length
    ? `<ul class="error-list">${Object.values(errors).map(e => `<li>${escHtml(e)}</li>`).join('')}</ul>`
    : '';

  const content = `
    <h2>Create an Account</h2>
    ${errorHtml}
    <form method="post" action="/cp-signup">
      <input type="hidden" name="stage" value="validate_user">
      <label for="user_name">Username</label>
      <input type="text" name="user_name" id="user_name" value="${escHtml(values.user_name || '')}" autocomplete="username" autofocus>
      <p class="hint">Lowercase letters, numbers, and underscores only.</p>
      <label for="user_email">Email Address</label>
      <input type="email" name="user_email" id="user_email" value="${escHtml(values.user_email || '')}" autocomplete="email">
      <button type="submit" class="cp-btn">Create Account</button>
    </form>`;
  return renderLayout(cp, 'Sign Up', content);
}

function renderBlogForm(cp, errors, values) {
  const errorHtml = Object.values(errors).length
    ? `<ul class="error-list">${Object.values(errors).map(e => `<li>${escHtml(e)}</li>`).join('')}</ul>`
    : '';

  const content = `
    <h2>Create Your Site</h2>
    ${errorHtml}
    <form method="post" action="/cp-signup">
      <input type="hidden" name="stage" value="validate_blog">
      <input type="hidden" name="user_name" value="${escHtml(values.user_name || '')}">
      <input type="hidden" name="user_email" value="${escHtml(values.user_email || '')}">
      <label for="blogname">Site Address</label>
      <input type="text" name="blogname" id="blogname" value="${escHtml(values.blogname || '')}" autofocus>
      <p class="hint">Only lowercase letters and numbers. Cannot be changed.</p>
      <label for="blog_title">Site Title</label>
      <input type="text" name="blog_title" id="blog_title" value="${escHtml(values.blog_title || '')}">
      <button type="submit" class="cp-btn">Create Site</button>
    </form>`;
  return renderLayout(cp, 'Create Site', content);
}

function renderSignupComplete(cp, email) {
  const content = `
    <div class="success">
      <h2>Check Your Email</h2>
      <p>We have sent an activation link to <strong>${escHtml(email)}</strong>.</p>
      <p>Please click the link in the email to activate your account. If you do not receive it, check your spam folder.</p>
    </div>`;
  return renderLayout(cp, 'Registration Complete', content);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
