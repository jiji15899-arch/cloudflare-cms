/**
 * CloudPress Crypto Utilities
 * Replaces WordPress's phpass (PasswordHash) and wp_hash / wp_salt functions.
 *
 * Uses the Web Crypto API (available natively in Cloudflare Workers).
 * Passwords are stored as:  $cp$<iterations>$<base64-salt>$<base64-hash>
 *
 * @package CloudPress
 */

// ── Helpers ────────────────────────────────────────────────────────────────

function b64encode(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64decode(str) {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

function strToBytes(str) {
  return new TextEncoder().encode(str);
}

// ── Password Hashing ───────────────────────────────────────────────────────

const HASH_ALGORITHM = 'SHA-256';
const HASH_ITERATIONS = 100_000;

/**
 * Hash a plaintext password using PBKDF2.
 * Equivalent to wp_hash_password().
 *
 * @param {string} password
 * @returns {Promise<string>} stored hash string
 */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    'raw', strToBytes(password), 'PBKDF2', false, ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: HASH_ITERATIONS, hash: HASH_ALGORITHM },
    keyMaterial,
    256
  );

  return `$cp$${HASH_ITERATIONS}$${b64encode(salt)}$${b64encode(derived)}`;
}

/**
 * Verify a plaintext password against a stored hash.
 * Equivalent to wp_check_password().
 *
 * @param {string} password
 * @param {string} storedHash
 * @returns {Promise<boolean>}
 */
export async function checkPassword(password, storedHash) {
  if (!storedHash) return false;

  // Legacy MD5 check (WordPress phpass prefixed hashes) — always fail, prompt reset
  if (storedHash.startsWith('$P$') || storedHash.startsWith('$H$')) {
    return false;
  }

  const parts = storedHash.split('$');
  // Expected: ['', 'cp', iterations, saltB64, hashB64]
  if (parts.length < 5 || parts[1] !== 'cp') return false;

  const iterations = parseInt(parts[2], 10);
  const salt       = b64decode(parts[3]);
  const expected   = b64decode(parts[4]);

  const keyMaterial = await crypto.subtle.importKey(
    'raw', strToBytes(password), 'PBKDF2', false, ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: HASH_ALGORITHM },
    keyMaterial,
    256
  );

  // Constant-time comparison
  const a = new Uint8Array(derived);
  const b = expected;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ── General Hashing ────────────────────────────────────────────────────────

/**
 * HMAC-SHA256 of data using key.
 * Equivalent to wp_hash().
 *
 * @param {string} data
 * @param {string} key
 * @returns {Promise<string>} hex string
 */
export async function hmacHash(data, key) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', strToBytes(key), { name: 'HMAC', hash: HASH_ALGORITHM }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, strToBytes(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * SHA-256 of a string.
 *
 * @param {string} data
 * @returns {Promise<string>} hex string
 */
export async function sha256(data) {
  const buf = await crypto.subtle.digest('SHA-256', strToBytes(data));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Nonce ──────────────────────────────────────────────────────────────────

/**
 * Generate a nonce for a given action + user ID.
 * Equivalent to wp_create_nonce().
 *
 * @param {string} action
 * @param {string|number} userId
 * @param {string} secret
 * @returns {Promise<string>}
 */
export async function createNonce(action, userId, secret) {
  const tick = Math.floor(Date.now() / 1000 / 86400); // daily tick
  const raw  = `${tick}|${action}|${userId}`;
  const hash = await hmacHash(raw, secret);
  return hash.slice(0, 10);
}

/**
 * Verify a nonce.
 * Accepts nonces from the current and previous daily tick.
 *
 * @param {string} nonce
 * @param {string} action
 * @param {string|number} userId
 * @param {string} secret
 * @returns {Promise<boolean>}
 */
export async function verifyNonce(nonce, action, userId, secret) {
  const tick = Math.floor(Date.now() / 1000 / 86400);
  for (const t of [tick, tick - 1]) {
    const raw      = `${t}|${action}|${userId}`;
    const expected = (await hmacHash(raw, secret)).slice(0, 10);
    if (nonce === expected) return true;
  }
  return false;
}

// ── Random token ───────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random URL-safe token.
 *
 * @param {number} bytes  Number of random bytes (default 32)
 * @returns {string}
 */
export function randomToken(bytes = 32) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}
