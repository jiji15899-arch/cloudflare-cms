/**
 * CloudPress Transient API
 * Replaces WordPress get_transient / set_transient / delete_transient.
 *
 * Uses Cloudflare KV with TTL-based expiry (no database polling needed).
 *
 * @package CloudPress
 */

const KEY_PREFIX = 'cp:transient:';

/**
 * Set a transient value.
 * Equivalent to set_transient().
 *
 * @param {object} cp
 * @param {string} key
 * @param {*}      value
 * @param {number} expiration  TTL in seconds (0 = no expiry)
 * @returns {Promise<boolean>}
 */
export async function setTransient(cp, key, value, expiration = 3600) {
  const kvKey  = KEY_PREFIX + key;
  const stored = JSON.stringify(value);
  const opts   = expiration > 0 ? { expirationTtl: expiration } : {};

  try {
    await cp.kv.put(kvKey, stored, opts);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Get a transient value.
 * Equivalent to get_transient().
 *
 * @param {object} cp
 * @param {string} key
 * @returns {Promise<*>} value or false if not found / expired
 */
export async function getTransient(cp, key) {
  const kvKey = KEY_PREFIX + key;
  try {
    const raw = await cp.kv.get(kvKey);
    if (raw === null) return false;
    try { return JSON.parse(raw); } catch (_) { return raw; }
  } catch (_) {
    return false;
  }
}

/**
 * Delete a transient.
 * Equivalent to delete_transient().
 *
 * @param {object} cp
 * @param {string} key
 * @returns {Promise<boolean>}
 */
export async function deleteTransient(cp, key) {
  try {
    await cp.kv.delete(KEY_PREFIX + key);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Get a site transient (same as transient for single-site).
 * Equivalent to get_site_transient().
 *
 * @param {object} cp
 * @param {string} key
 * @returns {Promise<*>}
 */
export async function getSiteTransient(cp, key) {
  return getTransient(cp, `site_${key}`);
}

/**
 * Set a site transient.
 * Equivalent to set_site_transient().
 *
 * @param {object} cp
 * @param {string} key
 * @param {*}      value
 * @param {number} expiration
 * @returns {Promise<boolean>}
 */
export async function setSiteTransient(cp, key, value, expiration = 3600) {
  return setTransient(cp, `site_${key}`, value, expiration);
}

/**
 * Delete a site transient.
 *
 * @param {object} cp
 * @param {string} key
 * @returns {Promise<boolean>}
 */
export async function deleteSiteTransient(cp, key) {
  return deleteTransient(cp, `site_${key}`);
}
