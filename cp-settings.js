/**
 * CloudPress Settings & Runtime Initialization
 * Replaces WordPress wp-settings.php
 *
 * Loads:
 *  - Core includes (functions, hooks, query, users, etc.)
 *  - Active plugins (from D1)
 *  - Active theme (from D1/KV)
 *  - Fires init hooks
 *
 * @package CloudPress
 */

import { CP_VERSION, CPINC, CPADMIN } from './cp-config.js';
import { loadActivePlugins } from './cp-includes/plugin-loader.js';
import { loadActiveTheme } from './cp-includes/theme-loader.js';
import { registerCoreHooks } from './cp-includes/hooks.js';
import { initSession } from './cp-includes/session.js';

/**
 * Initialize the CloudPress runtime on the `cp` context object.
 *
 * @param {object} cp - The CloudPress context (from cp-load.js)
 */
export async function cpSettings(cp) {
  // Expose version & paths on cp context
  cp.version   = CP_VERSION;
  cp.cpinc     = CPINC;
  cp.cpadmin   = CPADMIN;

  // Register core action/filter hooks
  registerCoreHooks(cp);

  // Initialize session (JWT-based, stored in KV)
  await initSession(cp);

  // Fire 'plugins_loaded' equivalent: load active plugins from D1
  if (cp.config.installed) {
    await loadActivePlugins(cp);
    cp.hooks.doAction('cp_plugins_loaded', cp);
  }

  // Load the active theme
  await loadActiveTheme(cp);

  // Fire init
  cp.hooks.doAction('cp_init', cp);

  // Fire wp_loaded equivalent
  cp.hooks.doAction('cp_loaded', cp);
}
