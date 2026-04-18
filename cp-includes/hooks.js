import { wptexturize, stripTags, trimWords, escHtml } from './formatting.js';

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
  hooks.addFilter('comment_text', text => wpAutoP(escHtml(text || '')), 10);

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


