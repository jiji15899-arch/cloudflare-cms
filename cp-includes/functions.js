/**
 * CloudPress General Functions
 * Replaces WordPress wp-includes/functions.php core utilities.
 *
 * Miscellaneous helper functions used across the CMS.
 *
 * @package CloudPress
 */

import { getOption } from './option.js';
import { escHtml }   from './formatting.js';

// -- URL helpers ---------------------------------------------------------------

/**
 * Get the site URL with an optional path appended.
 * Equivalent to get_site_url() / site_url().
 *
 * @param {object} cp
 * @param {string} [path]
 * @param {string} [scheme]
 * @returns {Promise<string>}
 */
export async function getSiteUrl(cp, path = '', scheme = null) {
  let base = await getOption(cp, 'siteurl', cp.config.SITE_URL || cp.url.origin);
  if (scheme) {
    base = base.replace(/^https?/, scheme);
  }
  return path ? `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}` : base;
}

/**
 * Get the home URL.
 * Equivalent to get_home_url() / home_url().
 *
 * @param {object} cp
 * @param {string} [path]
 * @returns {Promise<string>}
 */
export async function getHomeUrl(cp, path = '') {
  const base = await getOption(cp, 'home', await getSiteUrl(cp));
  return path ? `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}` : base;
}

/**
 * Get the admin URL.
 * Equivalent to admin_url().
 *
 * @param {object} cp
 * @param {string} [path]
 * @returns {Promise<string>}
 */
export async function adminUrl(cp, path = '') {
  const base = await getSiteUrl(cp, 'cp-admin');
  return path ? `${base}/${path.replace(/^\//, '')}` : base;
}

/**
 * Get the URL for a content file (replaces content_url()).
 * Since we don't use R2, this points to /cp-content/.
 *
 * @param {object} cp
 * @param {string} [path]
 * @returns {Promise<string>}
 */
export async function contentUrl(cp, path = '') {
  const base = await getSiteUrl(cp, 'cp-content');
  return path ? `${base}/${path.replace(/^\//, '')}` : base;
}

// -- Nonce ---------------------------------------------------------------------

/**
 * Generate a nonce token for a given action.
 * Equivalent to wp_create_nonce().
 *
 * @param {object} cp
 * @param {string} action
 * @returns {Promise<string>}
 */
export async function createNonce(cp, action = 'cp_nonce') {
  const userId = cp.currentUser?.ID || 0;
  const tick   = Math.floor(Date.now() / (12 * 3600 * 1000)); // 12-hour ticks
  const raw    = `${userId}|${action}|${tick}|${cp.config.NONCE_KEY || 'default'}`;
  const data   = new TextEncoder().encode(raw);
  const hash   = await crypto.subtle.digest('SHA-256', data);
  const hex    = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 10);
}

/**
 * Verify a nonce token.
 * Equivalent to wp_verify_nonce() -- returns 1 (current tick) or 2 (previous tick).
 *
 * @param {object} cp
 * @param {string} nonce
 * @param {string} action
 * @returns {Promise<0|1|2>}  0 = invalid
 */
export async function verifyNonce(cp, nonce, action = 'cp_nonce') {
  const userId = cp.currentUser?.ID || 0;

  for (let offset = 0; offset <= 1; offset++) {
    const tick   = Math.floor(Date.now() / (12 * 3600 * 1000)) - offset;
    const raw    = `${userId}|${action}|${tick}|${cp.config.NONCE_KEY || 'default'}`;
    const data   = new TextEncoder().encode(raw);
    const hash   = await crypto.subtle.digest('SHA-256', data);
    const hex    = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    if (hex.slice(0, 10) === String(nonce)) return (offset + 1);
  }

  return 0;
}

/**
 * Render a hidden nonce input field.
 * Equivalent to wp_nonce_field().
 *
 * @param {object} cp
 * @param {string} action
 * @param {string} [name]
 * @returns {Promise<string>}
 */
export async function nonceField(cp, action, name = '_cpnonce') {
  const nonce = await createNonce(cp, action);
  return `<input type="hidden" name="${escHtml(name)}" value="${escHtml(nonce)}">`;
}

// -- Pagination ----------------------------------------------------------------

/**
 * Generate pagination links.
 * Equivalent to paginate_links().
 *
 * @param {object} opts
 * @param {number} opts.total        Total number of pages
 * @param {number} opts.current      Current page
 * @param {string} opts.base         URL base with %_%  placeholder
 * @param {number} [opts.endSize]    Pages at start/end
 * @param {number} [opts.midSize]    Pages around current
 * @returns {string}   HTML string of page links
 */
export function paginateLinks({ total, current, base, endSize = 1, midSize = 2 }) {
  if (total <= 1) return '';

  const pages = [];
  for (let i = 1; i <= total; i++) {
    if (
      i <= endSize ||
      i > total - endSize ||
      (i >= current - midSize && i <= current + midSize)
    ) {
      pages.push(i);
    }
  }

  const links = [];
  let prev = 0;

  if (current > 1) {
    links.push(pageLink(base, current - 1, '&lsaquo; Prev', 'cp-prev'));
  }

  for (const p of pages) {
    if (prev && p - prev > 1) {
      links.push('<span class="cp-page-dots">&hellip;</span>');
    }
    if (p === current) {
      links.push(`<span class="cp-page-current" aria-current="page">${p}</span>`);
    } else {
      links.push(pageLink(base, p, p));
    }
    prev = p;
  }

  if (current < total) {
    links.push(pageLink(base, current + 1, 'Next &rsaquo;', 'cp-next'));
  }

  return `<nav class="cp-pagination" aria-label="Page navigation">${links.join('\n')}</nav>`;
}

function pageLink(base, num, label, cls = '') {
  const url = base.replace('%_%', num === 1 ? '' : `page/${num}/`);
  return `<a href="${escHtml(url)}" class="cp-page-link ${cls}">${label}</a>`;
}

// -- Misc utilities ------------------------------------------------------------

/**
 * Recursively merge two plain objects (shallow).
 * Equivalent to wp_parse_args().
 *
 * @param {object} args
 * @param {object} defaults
 * @returns {object}
 */
export function parseArgs(args, defaults) {
  return Object.assign({}, defaults, args);
}

/**
 * Check if a value is a plain object.
 *
 * @param {*} val
 * @returns {boolean}
 */
export function isPlainObject(val) {
  return val !== null && typeof val === 'object' && Object.getPrototypeOf(val) === Object.prototype;
}

/**
 * Generate a random token (hex).
 * Equivalent to wp_generate_password() for token use.
 *
 * @param {number} bytes
 * @returns {string}
 */
export function generateToken(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate an email address.
 * Equivalent to is_email().
 *
 * @param {string} email
 * @returns {string|false}
 */
export function isEmail(email) {
  const s = String(email || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : false;
}

/**
 * Get the user IP from a Cloudflare Workers request.
 *
 * @param {Request} request
 * @returns {string}
 */
export function getUserIp(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Real-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    '0.0.0.0'
  );
}

/**
 * Check if the current request is an AJAX request.
 *
 * @param {Request} request
 * @returns {boolean}
 */
export function isAjax(request) {
  return (
    request.headers.get('X-Requested-With') === 'XMLHttpRequest' ||
    request.headers.get('Accept')?.includes('application/json')
  );
}

/**
 * Send a JSON response.
 *
 * @param {*}      data
 * @param {number} status
 * @returns {Response}
 */
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/**
 * Send a JSON success response.
 * Equivalent to wp_send_json_success().
 *
 * @param {*} data
 * @returns {Response}
 */
export function jsonSuccess(data = null) {
  return jsonResponse({ success: true, data });
}

/**
 * Send a JSON error response.
 * Equivalent to wp_send_json_error().
 *
 * @param {string|object} message
 * @param {number}        [status]
 * @returns {Response}
 */
export function jsonError(message = 'An error occurred.', status = 400) {
  return jsonResponse({ success: false, data: { message } }, status);
}

/**
 * Redirect to a URL.
 *
 * @param {string} url
 * @param {number} status
 * @returns {Response}
 */
export function redirect(url, status = 302) {
  return new Response(null, { status, headers: { Location: url } });
}

/**
 * Check if a user has a specific capability.
 * Simplified equivalent of current_user_can().
 *
 * @param {object} cp
 * @param {string} capability
 * @returns {boolean}
 */
export function currentUserCan(cp, capability) {
  const user = cp.currentUser;
  if (!user) return false;

  const roles = Array.isArray(user.roles) ? user.roles : ['subscriber'];

  const roleCaps = {
    administrator: ['manage_options', 'edit_posts', 'publish_posts', 'delete_posts',
                    'edit_pages', 'publish_pages', 'delete_pages', 'manage_categories',
                    'edit_users', 'upload_files', 'install_plugins', 'install_themes',
                    'activate_plugins', 'switch_themes', 'export', 'import',
                    'edit_comments', 'moderate_comments'],
    editor:        ['edit_posts', 'publish_posts', 'delete_posts', 'edit_pages',
                    'publish_pages', 'delete_pages', 'manage_categories',
                    'upload_files', 'edit_comments', 'moderate_comments'],
    author:        ['edit_posts', 'publish_posts', 'delete_posts', 'upload_files'],
    contributor:   ['edit_posts', 'delete_posts'],
    subscriber:    ['read'],
  };

  for (const role of roles) {
    const caps = roleCaps[role] || [];
    if (caps.includes(capability)) return true;
  }
  return false;
}

export function isMultisite() { return false; }

export function cpSafeRedirect(url, status = 302) { return redirect(url, status); }

export function cpRedirect(url, status = 302) { return redirect(url, status); }
