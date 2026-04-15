/**
 * CloudPress Template Loader
 * Replaces WordPress wp-includes/template-loader.php + get_template_part() etc.
 *
 * Templates are stored in GitHub (active theme repo) and cached in KV.
 * Since Workers cannot read a local filesystem at runtime, templates are
 * fetched from GitHub via the GitHub Contents API and rendered as HTML strings.
 *
 * Template hierarchy (simplified, mirrors WordPress):
 *   single.html -> index.html
 *   page.html   -> index.html
 *   archive.html -> index.html
 *   404.html    -> index.html
 *
 * Templates receive a `context` object instead of PHP globals.
 *
 * @package CloudPress
 */

import { getOption } from './option.js';

const KV_PREFIX     = 'cp:template:';
const KV_TTL        = 3600; // 1 hour cache

// -- Public API ----------------------------------------------------------------

/**
 * Load and return a rendered template.
 * Equivalent to get_template_part() + locate_template().
 *
 * @param {object} cp
 * @param {string} templateName   - e.g. 'single', 'page', 'archive', '404'
 * @param {object} [context]      - variables passed to template
 * @returns {Promise<string>}     - rendered HTML
 */
export async function loadTemplate(cp, templateName, context = {}) {
  const hierarchy = buildHierarchy(templateName, context);

  for (const tmpl of hierarchy) {
    const content = await fetchTemplate(cp, tmpl);
    if (content !== null) {
      return renderTemplate(content, { cp, ...context });
    }
  }

  // Ultimate fallback: minimal HTML
  return defaultTemplate(templateName, context);
}

/**
 * Render a template string with a context.
 * Very simple {{variable}} interpolation -- themes can use full JS template literals.
 *
 * @param {object} cp
 * @param {string} templateName
 * @param {object} [context]
 * @returns {Promise<string>}
 */
export async function renderTemplate(cp, templateName, context = {}) {
  // Allow calling as renderTemplate(templateString, context) from internal code
  if (typeof cp === 'string') {
    return interpolate(cp, templateName || {});
  }
  return loadTemplate(cp, templateName, context);
}

/**
 * Get the raw template string without rendering.
 *
 * @param {object} cp
 * @param {string} templateName
 * @returns {Promise<string|null>}
 */
export async function getTemplatePart(cp, templateName) {
  const hierarchy = buildHierarchy(templateName, {});
  for (const tmpl of hierarchy) {
    const content = await fetchTemplate(cp, tmpl);
    if (content !== null) return content;
  }
  return null;
}

// -- Theme / template fetching -------------------------------------------------

/**
 * Fetch a template file from KV cache or GitHub.
 *
 * @param {object} cp
 * @param {string} filename   - e.g. 'single.html'
 * @returns {Promise<string|null>}
 */
async function fetchTemplate(cp, filename) {
  const kvKey = KV_PREFIX + filename;

  // 1. Try KV cache
  try {
    const cached = await cp.kv.get(kvKey);
    if (cached !== null) return cached;
  } catch (_) {}

  // 2. Try GitHub
  const githubRepo  = cp.config?.GITHUB_REPO || await getOption(cp, 'cp_github_repo', '');
  const githubToken = cp.config?.GITHUB_TOKEN || cp.env?.CP_GITHUB_TOKEN || '';
  const activeTheme = await getOption(cp, 'template', '');

  if (!githubRepo) return null;

  const themePath = activeTheme ? `themes/${activeTheme}/${filename}` : `templates/${filename}`;
  const apiUrl    = `https://api.github.com/repos/${githubRepo}/contents/${themePath}`;

  try {
    const headers = { 'User-Agent': 'CloudPress/1.0', 'Accept': 'application/vnd.github.v3.raw' };
    if (githubToken) headers['Authorization'] = `Bearer ${githubToken}`;

    const res = await fetch(apiUrl, { headers });
    if (!res.ok) return null;

    const content = await res.text();

    // Cache in KV
    try { await cp.kv.put(kvKey, content, { expirationTtl: KV_TTL }); } catch (_) {}

    return content;
  } catch (_) {
    return null;
  }
}

// -- Template hierarchy --------------------------------------------------------

function buildHierarchy(templateName, context) {
  const base = templateName.replace(/\.html$/, '');
  const list = [];

  // Specific template
  list.push(`${base}.html`);

  // Type fallbacks
  if (base === 'single') list.push('singular.html');
  if (base === 'page')   list.push('singular.html');
  if (base.startsWith('archive')) list.push('archive.html');

  // Taxonomy
  if (context.taxonomy) list.push(`taxonomy-${context.taxonomy}.html`);
  if (context.term)     list.push(`taxonomy.html`);

  // Always fall back to index
  if (base !== 'index') list.push('index.html');

  return [...new Set(list)];
}

// -- Rendering -----------------------------------------------------------------

function interpolate(template, context) {
  return template.replace(/\{\{(\s*[\w.]+\s*)\}\}/g, (_, key) => {
    const parts = key.trim().split('.');
    let val = context;
    for (const p of parts) {
      if (val == null) return '';
      val = val[p];
    }
    return val != null ? String(val) : '';
  });
}

function defaultTemplate(templateName, context) {
  const title   = context.post?.post_title || context.title || templateName;
  const content = context.post?.post_content || context.content || '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)}</title>
  <link rel="stylesheet" href="/cp-includes/css/template-fallback.css">
</head>
<body>
  <h1>${escHtml(title)}</h1>
  <div class="entry-content">${content}</div>
</body>
</html>`;
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
