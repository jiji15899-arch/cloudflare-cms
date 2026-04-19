/**
 * CloudPress Configuration
 * Replaces WordPress wp-config.php / wp-config-sample.php
 *
 * On Cloudflare Workers/Pages:
 *  - NO MySQL/MariaDB. Uses D1 (SQLite-based) for structured data.
 *  - Uses KV for caching, sessions, transients.
 *  - Secrets go in Cloudflare Worker secrets (env vars), NOT here.
 *
 * Binding names (set in wrangler.toml or Cloudflare dashboard):
 *  - CP_DB  -> D1 database
 *  - CP_KV  -> KV namespace
 *
 * @package CloudPress
 */

/**
 * Load config -- reads from KV (set by installer) or falls back to env vars.
 *
 * @param {object} env - Cloudflare Worker env bindings
 * @returns {Promise<object>} config
 */
export async function loadConfig(env) {
  // Try reading installer-saved config from KV first
  let storedConfig = null;
  try {
    const raw = await env.CP_KV.get('cp:config', { type: 'json' });
    if (raw && raw.installed) {
      storedConfig = raw;
    }
  } catch (_) {
    // KV not available yet or not set -- fall through to env vars
  }

  if (storedConfig) {
    return mergeWithDefaults(storedConfig, env);
  }

  // Fall back to env vars (set in Cloudflare dashboard / wrangler.toml [vars])
  return mergeWithDefaults({}, env);
}

/**
 * Save config to KV (called by installer).
 *
 * @param {object} env
 * @param {object} config
 */
export async function saveConfig(env, config) {
  await env.CP_KV.put('cp:config', JSON.stringify({ ...config, installed: true }));
}

/**
 * Merge user/stored config with defaults and env var overrides.
 */
function mergeWithDefaults(stored, env) {
  return {
    // -- Site Identity ----------------------------------------------------------
    SITE_URL:        stored.SITE_URL        || env.CP_SITE_URL        || '',
    SITE_NAME:       stored.SITE_NAME       || env.CP_SITE_NAME       || 'CloudPress Site',
    SITE_TAGLINE:    stored.SITE_TAGLINE    || env.CP_SITE_TAGLINE    || 'Just another CloudPress site',
    ADMIN_EMAIL:     stored.ADMIN_EMAIL     || env.CP_ADMIN_EMAIL     || '',

    // -- Database prefix (D1 table prefix) -------------------------------------
    DB_PREFIX:       stored.DB_PREFIX       || env.CP_DB_PREFIX       || 'cp_',

    // -- Authentication Keys & Salts --------------------------------------------
    // Generate unique values via: https://cloudpress.dev/api/secret-key/
    // Or set as Cloudflare Worker secrets.
    AUTH_KEY:         env.CP_AUTH_KEY         || stored.AUTH_KEY         || 'change-me-auth-key',
    SECURE_AUTH_KEY:  env.CP_SECURE_AUTH_KEY  || stored.SECURE_AUTH_KEY  || 'change-me-secure-auth-key',
    LOGGED_IN_KEY:    env.CP_LOGGED_IN_KEY    || stored.LOGGED_IN_KEY    || 'change-me-logged-in-key',
    NONCE_KEY:        env.CP_NONCE_KEY        || stored.NONCE_KEY        || 'change-me-nonce-key',
    AUTH_SALT:        env.CP_AUTH_SALT        || stored.AUTH_SALT        || 'change-me-auth-salt',
    SECURE_AUTH_SALT: env.CP_SECURE_AUTH_SALT || stored.SECURE_AUTH_SALT || 'change-me-secure-auth-salt',
    LOGGED_IN_SALT:   env.CP_LOGGED_IN_SALT   || stored.LOGGED_IN_SALT   || 'change-me-logged-in-salt',
    NONCE_SALT:       env.CP_NONCE_SALT       || stored.NONCE_SALT       || 'change-me-nonce-salt',

    // -- GitHub Integration (for theme/plugin install from GitHub) --------------
    // Set CP_GITHUB_TOKEN as a Cloudflare Worker secret for private repos.
    GITHUB_TOKEN:    env.CP_GITHUB_TOKEN    || stored.GITHUB_TOKEN    || '',
    // Default GitHub source repo for CloudPress core (used by updater)
    GITHUB_REPO:     stored.GITHUB_REPO     || env.CP_GITHUB_REPO     || '',

    // -- Debug ------------------------------------------------------------------
    CP_DEBUG:        stored.CP_DEBUG        || env.CP_DEBUG === 'true' || false,
    CP_DEBUG_LOG:    stored.CP_DEBUG_LOG    || false,

    // -- Multisite --------------------------------------------------------------
    MULTISITE:       stored.MULTISITE       || false,
    SUBDOMAIN_INSTALL: stored.SUBDOMAIN_INSTALL || false,

    // -- KV TTLs (seconds) ------------------------------------------------------
    TRANSIENT_TTL:   stored.TRANSIENT_TTL   || 3600,    // 1 hour default
    SESSION_TTL:     stored.SESSION_TTL     || 86400,   // 24 hours

    // -- Installer state --------------------------------------------------------
    installed:       stored.installed       || false,
  };
}

/**
 * Exported config constants (equivalent to WP_DEBUG, ABSPATH, etc.)
 * These are set at runtime by cp-settings.js on the `cp` context object.
 */
export const CP_VERSION = '1.2.0';
export const CPINC      = 'cp-includes';
export const CPADMIN    = 'cp-admin';
