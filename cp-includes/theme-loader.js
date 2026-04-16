/**
 * CloudPress Theme Loader
 * Replaces WordPress wp-includes/theme.php (active theme loading portion)
 *
 * The active theme is identified by its slug stored in D1 options ('template').
 * Theme files (CSS, templates) are fetched from GitHub and cached in KV.
 * No PHP theme functions -- themes expose a `render(cp, query)` export.
 *
 * @package CloudPress
 */

import { getOption, updateOption } from './option.js';

const KV_THEME_META_PREFIX = 'cp:theme:meta:';
const KV_TTL               = 3600;

// -- Bootstrap -----------------------------------------------------------------

/**
 * Load the active theme metadata and set it on the cp context.
 * Called by cp-settings.js.
 *
 * @param {object} cp
 * @returns {Promise<void>}
 */
export async function loadActiveTheme(cp) {
  const slug = await getOption(cp, 'template', '');
  if (!slug) {
    cp.theme = null;
    return;
  }

  const meta = await getThemeMeta(cp, slug);
  cp.theme = { slug, ...meta };

  cp.hooks.doAction('cp_after_setup_theme', cp);
}

// -- Theme meta ----------------------------------------------------------------

/**
 * Get theme metadata (name, version, description, author, etc.).
 * Reads from KV cache or fetches theme.json / style.css from GitHub.
 *
 * @param {object} cp
 * @param {string} slug
 * @returns {Promise<object>}
 */
export async function getThemeMeta(cp, slug) {
  const kvKey = KV_THEME_META_PREFIX + slug;
  try {
    const cached = await cp.kv.get(kvKey, { type: 'json' });
    if (cached) return cached;
  } catch (_) {}

  // Fetch theme.json from GitHub
  const meta = await fetchThemeJson(cp, slug) || { name: slug, version: '1.0.0' };

  try {
    await cp.kv.put(kvKey, JSON.stringify(meta), { expirationTtl: KV_TTL });
  } catch (_) {}

  return meta;
}

/**
 * Get all available themes (from KV index or GitHub).
 * Equivalent to wp_get_themes().
 *
 * @param {object} cp
 * @returns {Promise<object[]>}
 */
export async function getThemes(cp) {
  try {
    const cached = await cp.kv.get('cp:themes:list', { type: 'json' });
    if (cached) return cached;
  } catch (_) {}
  return [];
}

/**
 * Switch the active theme.
 * Equivalent to switch_theme().
 *
 * @param {object} cp
 * @param {string} slug
 * @returns {Promise<void>}
 */
export async function switchTheme(cp, slug) {
  await updateOption(cp, 'template',   slug);
  await updateOption(cp, 'stylesheet', slug);

  // Invalidate theme meta cache
  try { await cp.kv.delete(KV_THEME_META_PREFIX + slug); } catch (_) {}

  cp.theme = { slug, ...(await getThemeMeta(cp, slug)) };
  cp.hooks.doAction('cp_switch_theme', slug, cp);
}

/**
 * Get the active theme's stylesheet URL (served from GitHub or KV).
 * Equivalent to get_stylesheet_uri().
 *
 * @param {object} cp
 * @returns {Promise<string>}
 */
export async function getStylesheetUri(cp) {
  const siteUrl = await getOption(cp, 'siteurl', cp.config?.SITE_URL || cp.url?.origin || '');
  const slug    = cp.theme?.slug || '';
  return slug
    ? `${siteUrl.replace(/\/$/, '')}/cp-content/themes/${slug}/style.css`
    : '';
}

/**
 * Get the active theme directory URL.
 * Equivalent to get_template_directory_uri().
 *
 * @param {object} cp
 * @returns {Promise<string>}
 */
export async function getTemplateDirectoryUri(cp) {
  const siteUrl = await getOption(cp, 'siteurl', cp.config?.SITE_URL || cp.url?.origin || '');
  const slug    = cp.theme?.slug || '';
  return `${siteUrl.replace(/\/$/, '')}/cp-content/themes/${slug}`;
}

// -- Internal ------------------------------------------------------------------

async function fetchThemeJson(cp, slug) {
  const githubRepo  = cp.config?.GITHUB_REPO || await getOption(cp, 'cp_github_repo', '');
  const githubToken = cp.config?.GITHUB_TOKEN || cp.env?.CP_GITHUB_TOKEN || '';

  if (!githubRepo) return null;

  const url = `https://api.github.com/repos/${githubRepo}/contents/themes/${slug}/theme.json`;
  try {
    const headers = { 'User-Agent': 'CloudPress/1.0', 'Accept': 'application/vnd.github.v3.raw' };
    if (githubToken) headers['Authorization'] = `Bearer ${githubToken}`;
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}
