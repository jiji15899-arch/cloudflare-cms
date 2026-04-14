/**
 * CloudPress JWT Utilities
 * Replaces WordPress auth cookies with stateless JWT tokens.
 *
 * Uses HMAC-SHA256 (HS256) JWTs stored in HttpOnly cookies.
 * No external libraries — uses the Web Crypto API.
 *
 * @package CloudPress
 */

function base64urlEncode(buf) {
  const b64 = typeof buf === 'string'
    ? btoa(buf)
    : btoa(String.fromCharCode(...new Uint8Array(buf)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

// ── Sign ───────────────────────────────────────────────────────────────────

/**
 * Create a signed JWT.
 *
 * @param {object} payload   - Claims to embed (sub, iat, exp, etc.)
 * @param {string} secret    - Signing secret (CP_AUTH_KEY)
 * @param {number} expiresIn - TTL in seconds (default 86400 = 24h)
 * @returns {Promise<string>} JWT string
 */
export async function signJwt(payload, secret, expiresIn = 86400) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now    = Math.floor(Date.now() / 1000);

  const claims = {
    iat: now,
    exp: now + expiresIn,
    jti: crypto.randomUUID(),
    ...payload,
  };

  const headerB64  = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(claims));
  const data       = `${headerB64}.${payloadB64}`;

  const key       = await importHmacKey(secret);
  const sigBuf    = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigB64    = base64urlEncode(sigBuf);

  return `${data}.${sigB64}`;
}

// ── Verify ─────────────────────────────────────────────────────────────────

/**
 * Verify and decode a JWT.
 * Returns the payload object on success, or null on failure.
 *
 * @param {string} token
 * @param {string} secret
 * @returns {Promise<object|null>}
 */
export async function verifyJwt(token, secret) {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;

  // Verify signature
  try {
    const key      = await importHmacKey(secret);
    const data     = `${headerB64}.${payloadB64}`;
    const sigBytes = base64urlDecode(sigB64);

    const valid = await crypto.subtle.verify(
      'HMAC', key, sigBytes, new TextEncoder().encode(data)
    );
    if (!valid) return null;
  } catch (_) {
    return null;
  }

  // Decode payload
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)));
  } catch (_) {
    return null;
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) return null;

  return payload;
}

// ── Cookie helpers ─────────────────────────────────────────────────────────

/**
 * Build a Set-Cookie header value for the auth token.
 *
 * @param {string} token
 * @param {number} maxAge  Seconds (default 86400)
 * @param {boolean} secure Use Secure flag (true in production)
 * @returns {string}
 */
export function buildAuthCookie(token, maxAge = 86400, secure = true) {
  const flags = [
    `cp_token=${token}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Strict`,
    `Max-Age=${maxAge}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
  return flags;
}

/**
 * Build a Set-Cookie header that clears the auth token.
 *
 * @returns {string}
 */
export function clearAuthCookie() {
  return 'cp_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
}
