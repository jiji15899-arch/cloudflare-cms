/**
 * CloudPress Hook System
 * Replaces WordPress's plugin API (add_action, do_action, add_filter, apply_filters).
 *
 * The hook registry is created per-request in cp-load.js (createHookSystem).
 * This module registers the core CloudPress hooks that run on every request.
 *
 * @package CloudPress
 */

/**
 * Register core CloudPress lifecycle hooks.
 * Called by cp-settings.js during bootstrap.
 *
 * @param {object} cp  CloudPress context
 */
export function registerCoreHooks(cp) {
  const { hooks } = cp;

  // ── Content Filters ──────────────────────────────────────────────────────

  // Autop: convert double line-breaks to <p> tags (like wpautop)
  hooks.addFilter('the_content', content => wpAutoP(content), 10);

  // Wptexturize: smart quotes / dashes
  hooks.addFilter('the_content', content => wptexturize(content), 20);

  // the_title: strip tags from titles
  hooks.addFilter('the_title', title => title ? String(title).replace(/<[^>]+>/g, '') : '', 10);

  // ── Excerpt ──────────────────────────────────────────────────────────────
  hooks.addFilter('get_the_excerpt', (excerpt, post) => {
    if (excerpt) return excerpt;
    if (!post?.post_content) return '';
    return trimWords(stripTags(post.post_content), 55) + '…';
  }, 10);

  // ── Comment text ─────────────────────────────────────────────────────────
  hooks.addFilter('comment_text', text => wpAutoP(escapeHtml(text || '')), 10);

  // ── Head actions ─────────────────────────────────────────────────────────
  hooks.addAction('cp_head', cp => {
    cp._headTags = cp._headTags || [];
  }, 1);
}

// ── wpautop ────────────────────────────────────────────────────────────────

/**
 * Convert double line-breaks into HTML paragraphs.
 * Simplified port of WordPress wpautop().
 *
 * @param {string} text
 * @returns {string}
 */
export function wpAutoP(text) {
  if (!text) return '';

  const blocks = /^(address|article|aside|blockquote|canvas|dd|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|noscript|ol|p|pre|section|table|tfoot|thead|tbody|tr|td|th|ul|video)/i;

  text = text.replace(/\r\n|\r/g, '\n');

  const parts = text.split(/\n\n+/);
  const result = parts.map(part => {
    const trimmed = part.trim();
    if (!trimmed) return '';
    if (blocks.test(trimmed)) return trimmed;
    // Wrap in <p>
    const inner = trimmed.replace(/\n/g, '<br />\n');
    return `<p>${inner}</p>`;
  });

  return result.filter(Boolean).join('\n\n');
}

// ── wptexturize ────────────────────────────────────────────────────────────

/**
 * Replace plain quotes and dashes with typographic equivalents.
 * Simplified port of WordPress wptexturize().
 *
 * @param {string} text
 * @returns {string}
 */
export function wptexturize(text) {
  if (!text) return '';
  return text
    .replace(/---/g, '\u2014')           // em dash
    .replace(/--/g,  '\u2013')           // en dash
    .replace(/(^|[\s(])"(\S)/g,  '$1\u201c$2')  // opening double quote
    .replace(/(\S)"([\s,.]|$)/g, '$1\u201d$2')  // closing double quote
    .replace(/(^|[\s(])'(\S)/g,  '$1\u2018$2')  // opening single quote
    .replace(/(\S)'([\s,.]|$)/g, '$1\u2019$2')  // closing single quote
    .replace(/\.\.\./g, '\u2026');       // ellipsis
}

// ── Utilities ──────────────────────────────────────────────────────────────

/**
 * Strip HTML tags from a string.
 *
 * @param {string} str
 * @returns {string}
 */
export function stripTags(str) {
  return String(str || '').replace(/<[^>]+>/g, '');
}

/**
 * Trim a string to N words.
 *
 * @param {string} str
 * @param {number} count
 * @returns {string}
 */
export function trimWords(str, count = 55) {
  const words = str.trim().split(/\s+/);
  if (words.length <= count) return str;
  return words.slice(0, count).join(' ');
}

/**
 * Escape HTML entities.
 *
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
