/**
 * Bootstrap for CloudPress.
 * Replaces WordPress wp-load.php
 *
 * Sets up:
 *  - ABSPATH equivalent (CP_PATH)
 *  - Config loading (cp-config.js)
 *  - D1 database binding
 *  - KV namespace binding
 *  - Global cp context object
 *
 * @package CloudPress
 */

import { loadConfig } from './cp-config.js';
import { cpSettings } from './cp-settings.js';

/**
 * Main bootstrap function.
 * Returns a fully initialized `cp` context object used throughout the system.
 *
 * @param {Request} request
 * @param {object}  env      - Cloudflare Worker env bindings (D1, KV, etc.)
 * @param {object}  ctx      - Cloudflare Worker execution context
 * @param {object}  options  - e.g. { CP_USE_THEMES: true }
 * @returns {Promise<object>} cp context
 */
export async function cpLoad(request, env, ctx, options = {}) {
  // Validate required Cloudflare bindings
  if (!env.CP_DB) {
    return errorResponse(
      'CloudPress Error: D1 database binding <code>CP_DB</code> is not configured. ' +
      'Please add a D1 database binding named <strong>CP_DB</strong> in your Cloudflare Workers settings.'
    );
  }
  if (!env.CP_KV) {
    return errorResponse(
      'CloudPress Error: KV namespace binding <code>CP_KV</code> is not configured. ' +
      'Please add a KV namespace binding named <strong>CP_KV</strong> in your Cloudflare Workers settings.'
    );
  }

  // Load user config (cp-config.js)
  let config;
  try {
    config = await loadConfig(env);
  } catch (e) {
    return errorResponse(
      `CloudPress Error: Could not load configuration. ${e.message}<br>` +
      'Make sure <code>cp-config.js</code> is correctly set up or run the installer at <a href="/cp-admin/setup-config">/cp-admin/setup-config</a>.'
    );
  }

  // Build the cp context object (equivalent to WordPress globals)
  const cp = {
    // Cloudflare bindings
    db: env.CP_DB,       // D1 database
    kv: env.CP_KV,       // KV namespace

    // GitHub source (optional, for theme/plugin sync)
    github: env.GITHUB_TOKEN ? env.GITHUB_TOKEN : null,

    // Config values
    config,

    // Request context
    request,
    env,
    ctx,
    url: new URL(request.url),

    // Options
    options,

    // Runtime state
    query: {},
    currentUser: null,
    hooks: createHookSystem(),

    // Helpers
    db_prefix: config.DB_PREFIX || 'cp_',
  };

  // Run cp-settings (register hooks, load active plugins/theme meta, etc.)
  await cpSettings(cp);

  return cp;
}

/**
 * Creates a minimal WordPress-compatible hook system (do_action / apply_filters).
 */
function createHookSystem() {
  const actions = {};
  const filters = {};

  return {
    addAction(hook, callback, priority = 10) {
      if (!actions[hook]) actions[hook] = [];
      actions[hook].push({ callback, priority });
      actions[hook].sort((a, b) => a.priority - b.priority);
    },
    doAction(hook, ...args) {
      (actions[hook] || []).forEach(({ callback }) => callback(...args));
    },
    addFilter(hook, callback, priority = 10) {
      if (!filters[hook]) filters[hook] = [];
      filters[hook].push({ callback, priority });
      filters[hook].sort((a, b) => a.priority - b.priority);
    },
    applyFilters(hook, value, ...args) {
      return (filters[hook] || []).reduce(
        (val, { callback }) => callback(val, ...args),
        value
      );
    },
  };
}

/**
 * Returns an error HTML response for bootstrap failures.
 */
function errorResponse(message) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CloudPress &rsaquo; Error</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f1f1f1; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; margin: 0; }
    .error-box { background: #fff; border-left: 4px solid #e74c3c;
                 border-radius: 4px; padding: 2rem 2.5rem; max-width: 560px;
                 box-shadow: 0 2px 8px rgba(0,0,0,.1); }
    h1 { color: #e74c3c; font-size: 1.3rem; margin: 0 0 1rem; }
    p { color: #444; line-height: 1.6; }
    code { background: #f8f8f8; padding: 2px 6px; border-radius: 3px;
           font-family: monospace; color: #c0392b; }
    a { color: #0073aa; }
  </style>
</head>
<body>
  <div class="error-box">
    <h1>CloudPress &rsaquo; Configuration Error</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;

  // Return a Response-like object that the caller can detect
  return {
    __cpError: true,
    response: new Response(html, {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  };
}
