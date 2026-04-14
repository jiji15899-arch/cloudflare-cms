/**
 * CloudPress Admin Auth Check
 * Replaces WordPress's wp-admin capability checks / is_user_logged_in()
 *
 * JWT-based authentication — no PHP sessions, no wp-login.php.
 * Token is stored in a secure HttpOnly cookie (cp_token).
 *
 * @package CloudPress
 */

import { verifyJwt } from '../cp-includes/jwt.js';
import { getUserById } from '../cp-includes/user.js';

/**
 * Verify the request has a valid admin JWT.
 * Returns a redirect Response if not authenticated, or null if OK.
 *
 * @param {object} cp  - CloudPress context
 * @returns {Response|null}
 */
export async function requireAdmin(cp) {
  const user = await getAdminUser(cp);
  if (!user) {
    const loginUrl = `/cp-login?redirect_to=${encodeURIComponent(cp.url.pathname + cp.url.search)}`;
    return Response.redirect(new URL(loginUrl, cp.url.origin).toString(), 302);
  }

  if (!userHasRole(user, ['administrator'])) {
    return new Response(
      '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Access Denied</title></head>' +
      '<body><h1>Access Denied</h1><p>You do not have permission to access the admin area.</p>' +
      '<a href="/">Return to site</a></body></html>',
      { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  // Attach to context
  cp.currentUser = user;
  return null;
}

/**
 * Get authenticated user from JWT cookie or Authorization header.
 *
 * @param {object} cp
 * @returns {object|null}
 */
export async function getAdminUser(cp) {
  const token = extractToken(cp.request);
  if (!token) return null;

  try {
    const payload = await verifyJwt(token, cp.config.AUTH_KEY);
    if (!payload || !payload.sub) return null;

    // Check token not revoked (KV blacklist)
    const revoked = await cp.kv.get(`cp:token_revoked:${payload.jti || payload.sub}`);
    if (revoked) return null;

    const user = await getUserById(cp, payload.sub);
    return user || null;
  } catch (_) {
    return null;
  }
}

/**
 * Extract JWT from cookie or Authorization header.
 */
function extractToken(request) {
  // 1. Try cookie
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookieMatch  = cookieHeader.match(/cp_token=([^;]+)/);
  if (cookieMatch) return cookieMatch[1];

  // 2. Try Authorization header
  const authHeader = request.headers.get('Authorization') || '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) return bearerMatch[1];

  return null;
}

/**
 * Check if a user has one of the given roles.
 */
export function userHasRole(user, roles) {
  if (!user) return false;
  const userRoles = user.roles || [];
  return roles.some(r => userRoles.includes(r));
}

/**
 * Check capability (simplified capability map).
 */
export function userCan(user, capability) {
  if (!user) return false;
  const roleCaps = {
    administrator: ['manage_options', 'edit_posts', 'publish_posts', 'delete_posts',
                    'edit_pages', 'publish_pages', 'delete_pages', 'manage_categories',
                    'upload_files', 'moderate_comments', 'manage_links',
                    'install_plugins', 'activate_plugins', 'install_themes',
                    'switch_themes', 'edit_users', 'create_users', 'delete_users',
                    'list_users', 'import', 'export', 'update_core', 'edit_themes',
                    'edit_plugins', 'read'],
    editor:        ['edit_posts', 'publish_posts', 'delete_posts', 'edit_pages',
                    'publish_pages', 'delete_pages', 'manage_categories',
                    'moderate_comments', 'upload_files', 'manage_links', 'read'],
    author:        ['edit_posts', 'publish_posts', 'delete_posts', 'upload_files', 'read'],
    contributor:   ['edit_posts', 'delete_posts', 'read'],
    subscriber:    ['read'],
  };

  const userRoles = user.roles || [];
  return userRoles.some(role => (roleCaps[role] || []).includes(capability));
}
