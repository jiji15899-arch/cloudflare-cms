/**
 * CloudPress Session Initializer
 * Called by cp-settings.js to attach the current user to the cp context.
 *
 * Reads the JWT from the cookie / Authorization header and populates cp.currentUser.
 *
 * @package CloudPress
 */

import { verifyJwt } from './jwt.js';
import { getUserById } from './user.js';

/**
 * Initialize the session -- attach cp.currentUser if authenticated.
 *
 * @param {object} cp  CloudPress context
 */
export async function initSession(cp) {
  const token = extractToken(cp.request);
  if (!token) return;

  try {
    const payload = await verifyJwt(token, cp.config.AUTH_KEY);
    if (!payload || !payload.sub) return;

    // Check token revocation in KV
    const jti = payload.jti || payload.sub;
    const revoked = await cp.kv.get(`cp:token_revoked:${jti}`).catch(() => null);
    if (revoked) return;

    const user = await getUserById(cp, Number(payload.sub));
    if (user) {
      cp.currentUser = user;
    }
  } catch (_) {
    // Invalid token -- silently ignore
  }
}

export function extractToken(request) {
  // 1. HttpOnly cookie
  const cookie = request.headers.get('Cookie') || '';
  const match  = cookie.match(/cp_token=([^;]+)/);
  if (match) return match[1];

  // 2. Authorization header (REST / API clients)
  const auth  = request.headers.get('Authorization') || '';
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  if (bearer) return bearer[1];

  return null;
}
