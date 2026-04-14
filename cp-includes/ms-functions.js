/**
 * CloudPress Multisite Functions
 * Replaces WordPress wp-includes/ms-functions.php
 *
 * Multisite user/blog signup flow stored in D1:
 *   cp_signups  (user_login, user_email, registered, activated, activation_key, meta)
 *   cp_blogs    (blog_id, site_id, domain, path, registered, last_updated, public, ...)
 *   cp_users    (shared with single-site)
 *
 * @package CloudPress
 */

import { hashPassword } from './crypto.js';
import { sanitizeEmail } from './sanitize.js';
import { getOption } from './option.js';

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate a user signup.
 * Equivalent to wpmu_validate_user_signup().
 *
 * @param {object} cp
 * @param {string} userLogin
 * @param {string} userEmail
 * @returns {Promise<{user_name:string, user_email:string, errors:string[]}>}
 */
export async function cpmuValidateUserSignup(cp, userLogin, userEmail) {
  const errors = [];

  // Login
  if (!userLogin || userLogin.length < 4) {
    errors.push('Username must be at least 4 characters.');
  } else if (!/^[a-z0-9_\-\.]+$/.test(userLogin)) {
    errors.push('Username may only contain lowercase letters, numbers, hyphens, underscores, and periods.');
  } else {
    const existing = await userExistsByLogin(cp, userLogin);
    if (existing) errors.push('That username is already registered.');
    const signup  = await signupExistsByLogin(cp, userLogin);
    if (signup)   errors.push('That username is already pending activation.');
  }

  // Email
  const cleanEmail = sanitizeEmail(userEmail);
  if (!cleanEmail) {
    errors.push('Invalid email address.');
  } else {
    const existing = await userExistsByEmail(cp, cleanEmail);
    if (existing) errors.push('That email address is already registered.');
  }

  return { user_name: userLogin, user_email: cleanEmail || userEmail, errors };
}

/**
 * Validate a blog signup.
 * Equivalent to wpmu_validate_blog_signup().
 *
 * @param {object} cp
 * @param {string} blogname
 * @param {string} blogTitle
 * @param {object} [user]
 * @returns {Promise<{blogname:string, blog_title:string, errors:string[]}>}
 */
export async function cpmuValidateBlogSignup(cp, blogname, blogTitle, user = null) {
  const errors   = [];
  const reserved = ['www', 'web', 'root', 'admin', 'main', 'invite', 'blogs', 'cp-admin', 'cp-login'];

  if (!blogname || blogname.length < 4) {
    errors.push('Site name must be at least 4 characters.');
  } else if (!/^[a-z0-9\-]+$/.test(blogname)) {
    errors.push('Site name may only contain lowercase letters, numbers, and hyphens.');
  } else if (reserved.includes(blogname)) {
    errors.push('That site name is not allowed.');
  } else {
    const existing = await blogExistsBySlug(cp, blogname);
    if (existing) errors.push('That site name is already taken.');
  }

  if (!blogTitle || blogTitle.trim().length < 1) {
    errors.push('Please provide a site title.');
  }

  return { blogname, blog_title: blogTitle, errors };
}

// ── Registration ──────────────────────────────────────────────────────────────

/**
 * Register a new user (creates signup record; not activated yet).
 * Equivalent to wpmu_register_user().
 *
 * @param {object} cp
 * @param {string} userLogin
 * @param {string} userEmail
 * @param {object} [meta]
 * @returns {Promise<{activation_key:string}|{error:string}>}
 */
export async function cpmuRegisterUser(cp, userLogin, userEmail, meta = {}) {
  const prefix = cp.db_prefix || 'cp_';
  const key    = await generateActivationKey(userLogin);
  const now    = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const metaJson = JSON.stringify(meta);

  await cp.db.prepare(`
    INSERT INTO ${prefix}signups
      (domain, path, title, user_login, user_email, registered, activation_key, meta)
    VALUES ('', '', '', ?, ?, ?, ?, ?)
  `).bind(userLogin, userEmail, now, key, metaJson).run();

  return { activation_key: key };
}

/**
 * Register a new blog for a user (creates signup record).
 * Equivalent to wpmu_register_blog().
 *
 * @param {object} cp
 * @param {string} domain
 * @param {string} path
 * @param {string} title
 * @param {number} userId
 * @param {object} [meta]
 * @returns {Promise<{activation_key:string}|{error:string}>}
 */
export async function cpmuRegisterBlog(cp, domain, path, title, userId, meta = {}) {
  const prefix = cp.db_prefix || 'cp_';
  const key    = await generateActivationKey(`${domain}${path}`);
  const now    = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const metaJson = JSON.stringify({ ...meta, user_id: userId });

  await cp.db.prepare(`
    INSERT INTO ${prefix}signups
      (domain, path, title, user_login, user_email, registered, activation_key, meta)
    VALUES (?, ?, ?, '', '', ?, ?, ?)
  `).bind(domain, path, title, now, key, metaJson).run();

  return { activation_key: key };
}

// ── Activation ────────────────────────────────────────────────────────────────

/**
 * Activate a signup by activation key.
 * Equivalent to wpmu_activate_signup().
 *
 * @param {object} cp
 * @param {string} key
 * @returns {Promise<{user_id:number, blog_id:number, password:string}|{error:string}>}
 */
export async function cpmuActivateSignup(cp, key) {
  const prefix = cp.db_prefix || 'cp_';

  const signup = await cp.db.prepare(`
    SELECT * FROM ${prefix}signups WHERE activation_key=? AND active=0 LIMIT 1
  `).bind(key).first();

  if (!signup) return { error: 'Invalid or already used activation key.' };

  const now    = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const meta   = JSON.parse(signup.meta || '{}');
  let password = meta.password || generateRandomPassword();
  const hashed = await hashPassword(password);

  let userId  = 0;
  let blogId  = 0;

  if (signup.user_login) {
    // Activate user
    await cp.db.prepare(`
      INSERT OR IGNORE INTO ${prefix}users
        (user_login, user_pass, user_email, user_registered, user_status, display_name)
      VALUES (?, ?, ?, ?, 0, ?)
    `).bind(signup.user_login, hashed, signup.user_email, now, signup.user_login).run();

    const row = await cp.db.prepare(
      `SELECT ID FROM ${prefix}users WHERE user_login=? LIMIT 1`
    ).bind(signup.user_login).first();
    userId = row?.ID || 0;
  }

  if (signup.domain && signup.path) {
    // Activate blog
    await cp.db.prepare(`
      INSERT OR IGNORE INTO ${prefix}blogs
        (site_id, domain, path, registered, last_updated, public)
      VALUES (1, ?, ?, ?, ?, 1)
    `).bind(signup.domain, signup.path, now, now).run();

    const row = await cp.db.prepare(
      `SELECT blog_id FROM ${prefix}blogs WHERE domain=? AND path=? LIMIT 1`
    ).bind(signup.domain, signup.path).first();
    blogId = row?.blog_id || 0;
  }

  // Mark signup as activated
  await cp.db.prepare(`
    UPDATE ${prefix}signups SET active=1, activated=? WHERE activation_key=?
  `).bind(now, key).run();

  return { user_id: userId, blog_id: blogId, password };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function userExistsByLogin(cp, login) {
  const prefix = cp.db_prefix || 'cp_';
  return cp.db.prepare(`SELECT ID FROM ${prefix}users WHERE user_login=? LIMIT 1`).bind(login).first();
}

async function userExistsByEmail(cp, email) {
  const prefix = cp.db_prefix || 'cp_';
  return cp.db.prepare(`SELECT ID FROM ${prefix}users WHERE user_email=? LIMIT 1`).bind(email).first();
}

async function signupExistsByLogin(cp, login) {
  const prefix = cp.db_prefix || 'cp_';
  return cp.db.prepare(`SELECT signup_id FROM ${prefix}signups WHERE user_login=? AND active=0 LIMIT 1`).bind(login).first();
}

async function blogExistsBySlug(cp, slug) {
  const prefix = cp.db_prefix || 'cp_';
  return cp.db.prepare(`SELECT blog_id FROM ${prefix}blogs WHERE domain LIKE ? OR path=? LIMIT 1`).bind(`${slug}.%`, `/${slug}/`).first();
}

async function generateActivationKey(seed) {
  const data   = new TextEncoder().encode(seed + Date.now() + Math.random());
  const hash   = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function generateRandomPassword(length = 12) {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
