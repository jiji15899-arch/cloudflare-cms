/**
 * CloudPress Plugin Loader
 * Replaces WordPress's active plugin loading in wp-settings.php
 *
 * Plugins are stored as entries in D1 cp_options (active_plugins key).
 * Each plugin is a GitHub repository path: "owner/repo" or a local path.
 * Plugin files are fetched from GitHub and cached in KV.
 *
 * Since Cloudflare Workers cannot do dynamic require/import at runtime,
 * plugins are loaded by running their exported `activate(cp)` hook.
 * Plugin code must be bundled at deploy time via wrangler build.
 *
 * @package CloudPress
 */

import { getOption } from './option.js';

/**
 * Load and initialize all active plugins.
 * Called by cp-settings.js after DB is ready.
 *
 * @param {object} cp
 * @returns {Promise<void>}
 */
export async function loadActivePlugins(cp) {
  let activePlugins = [];
  try {
    const raw = await getOption(cp, 'active_plugins', '[]');
    activePlugins = JSON.parse(raw);
  } catch (_) {
    activePlugins = [];
  }

  if (!Array.isArray(activePlugins) || activePlugins.length === 0) return;

  for (const pluginSlug of activePlugins) {
    try {
      await loadPlugin(cp, pluginSlug);
    } catch (err) {
      if (cp.config?.CP_DEBUG) {
        console.error(`[plugin-loader] Failed to load plugin "${pluginSlug}":`, err);
      }
    }
  }
}

/**
 * Load a single plugin by slug.
 * Plugins are expected to be bundled. This function fires the
 * 'cp_load_plugin' action so bundled plugins can register themselves.
 *
 * @param {object} cp
 * @param {string} pluginSlug   e.g. "my-plugin/my-plugin.js"
 * @returns {Promise<void>}
 */
async function loadPlugin(cp, pluginSlug) {
  // Fire hook — bundled plugins listen to 'cp_load_plugin' and check slug
  cp.hooks.doAction('cp_load_plugin', pluginSlug, cp);
}

/**
 * Activate a plugin (adds to active_plugins option).
 * Equivalent to activate_plugin().
 *
 * @param {object} cp
 * @param {string} pluginSlug
 * @returns {Promise<boolean>}
 */
export async function activatePlugin(cp, pluginSlug) {
  let activePlugins = [];
  try {
    const raw = await getOption(cp, 'active_plugins', '[]');
    activePlugins = JSON.parse(raw);
  } catch (_) {}

  if (!Array.isArray(activePlugins)) activePlugins = [];
  if (activePlugins.includes(pluginSlug)) return false;

  activePlugins.push(pluginSlug);
  await updateActivePlugins(cp, activePlugins);
  cp.hooks.doAction('cp_activate_plugin', pluginSlug, cp);
  return true;
}

/**
 * Deactivate a plugin.
 * Equivalent to deactivate_plugins().
 *
 * @param {object} cp
 * @param {string} pluginSlug
 * @returns {Promise<boolean>}
 */
export async function deactivatePlugin(cp, pluginSlug) {
  let activePlugins = [];
  try {
    const raw = await getOption(cp, 'active_plugins', '[]');
    activePlugins = JSON.parse(raw);
  } catch (_) {}

  if (!Array.isArray(activePlugins)) return false;
  const idx = activePlugins.indexOf(pluginSlug);
  if (idx === -1) return false;

  activePlugins.splice(idx, 1);
  await updateActivePlugins(cp, activePlugins);
  cp.hooks.doAction('cp_deactivate_plugin', pluginSlug, cp);
  return true;
}

/**
 * Check if a plugin is active.
 * Equivalent to is_plugin_active().
 *
 * @param {object} cp
 * @param {string} pluginSlug
 * @returns {Promise<boolean>}
 */
export async function isPluginActive(cp, pluginSlug) {
  try {
    const raw = await getOption(cp, 'active_plugins', '[]');
    const active = JSON.parse(raw);
    return Array.isArray(active) && active.includes(pluginSlug);
  } catch (_) {
    return false;
  }
}

/**
 * Get list of all available plugins (stored as KV metadata).
 * Equivalent to get_plugins().
 *
 * @param {object} cp
 * @returns {Promise<object[]>}
 */
export async function getAvailablePlugins(cp) {
  try {
    const raw = await cp.kv.get('cp:plugins:available', { type: 'json' });
    return raw || [];
  } catch (_) {
    return [];
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function updateActivePlugins(cp, list) {
  const prefix = cp.db_prefix || 'cp_';
  const json   = JSON.stringify(list);
  await cp.db.prepare(`
    INSERT INTO ${prefix}options (option_name, option_value, autoload)
    VALUES ('active_plugins', ?, 'yes')
    ON CONFLICT(option_name) DO UPDATE SET option_value=excluded.option_value
  `).bind(json).run();
}
