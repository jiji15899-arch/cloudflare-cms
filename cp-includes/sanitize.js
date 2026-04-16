/**
 * CloudPress Sanitize Functions
 * Replaces WordPress's sanitize_* and kses functions.
 *
 * Provides input sanitization helpers used throughout the CMS.
 * No external dependencies -- runs entirely in the Workers runtime.
 *
 * @package CloudPress
 */

// -- Text / HTML -------------------------------------------------------------

/**
 * Sanitize a plain-text field (strip all tags).
 * Equivalent to sanitize_text_field().
 *
 * @param {string} str
 * @returns {string}
 */
export function sanitizeTextField(str) {
  return String(str || '')
    .replace(/<[^>]+>/g, '')   // strip tags
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
}

/**
 * Sanitize a textarea (strip tags, keep newlines).
 * Equivalent to sanitize_textarea_field().
 *
 * @param {string} str
 * @returns {string}
 */
export function sanitizeTextareaField(str) {
  return String(str || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

/**
 * Sanitize a post title (strip tags, decode HTML entities).
 * Equivalent to sanitize_post_field() for titles.
 *
 * @param {string} str
 * @returns {string}
 */
export function sanitizeTitle(str) {
  return sanitizeTextField(str).replace(/&amp;/g, '&');
}

/**
 * Sanitize a URL-friendly slug.
 * Equivalent to sanitize_title_with_dashes().
 *
 * @param {string} str
 * @returns {string}
 */
export function sanitizeSlug(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Sanitize an email address.
 * Equivalent to sanitize_email().
 *
 * @param {string} str
 * @returns {string}
 */
export function sanitizeEmail(str) {
  const s = String(str || '').trim().toLowerCase();
  // Basic email pattern check
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : '';
}

/**
 * Sanitize a URL.
 * Equivalent to esc_url_raw() for storage.
 *
 * @param {string} str
 * @param {string[]} allowedSchemes
 * @returns {string}
 */
export function sanitizeUrl(str, allowedSchemes = ['http', 'https', 'mailto']) {
  const s = String(str || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    const scheme = u.protocol.replace(':', '');
    if (!allowedSchemes.includes(scheme)) return '';
    return u.href;
  } catch (_) {
    // Relative URL
    if (s.startsWith('/')) return s;
    return '';
  }
}

/**
 * Sanitize a positive integer.
 * Equivalent to absint().
 *
 * @param {*} val
 * @returns {number}
 */
export function absint(val) {
  return Math.abs(parseInt(val || 0, 10)) || 0;
}

/**
 * Sanitize a key (lowercase alphanumeric + underscore + dash).
 * Equivalent to sanitize_key().
 *
 * @param {string} str
 * @returns {string}
 */
export function sanitizeKey(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

/**
 * Sanitize a CSS class name.
 * Equivalent to sanitize_html_class().
 *
 * @param {string} str
 * @returns {string}
 */
export function sanitizeHtmlClass(str) {
  return String(str || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .replace(/^[^a-zA-Z_-]+/, '');
}

/**
 * Sanitize a MIME type string.
 *
 * @param {string} str
 * @returns {string}
 */
export function sanitizeMimeType(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\/+.-]/g, '')
    .slice(0, 100);
}

// -- HTML (kses equivalent) -------------------------------------------------

/**
 * Allowed HTML tags and attributes for post content.
 * Equivalent to wp_kses_post() allowed tags.
 */
const ALLOWED_TAGS_POST = {
  a:          ['href', 'title', 'target', 'rel'],
  abbr:       ['title'],
  acronym:    ['title'],
  b:          [],
  blockquote: ['cite'],
  br:         [],
  caption:    [],
  cite:       [],
  code:       [],
  col:        ['span', 'style'],
  colgroup:   ['span'],
  del:        ['datetime'],
  details:    [],
  dfn:        [],
  em:         [],
  figure:     ['class'],
  figcaption: ['class'],
  h1: [], h2: [], h3: [], h4: [], h5: [], h6: [],
  hr:         [],
  i:          [],
  img:        ['src', 'alt', 'title', 'width', 'height', 'class', 'loading'],
  ins:        ['datetime'],
  kbd:        [],
  li:         [],
  ol:         ['start', 'type'],
  p:          ['class', 'style'],
  pre:        ['class'],
  q:          ['cite'],
  s:          [],
  samp:       [],
  small:      [],
  span:       ['class', 'style'],
  strong:     [],
  sub:        [],
  summary:    [],
  sup:        [],
  table:      ['class', 'style'],
  tbody:      [],
  td:         ['colspan', 'rowspan', 'style'],
  tfoot:      [],
  th:         ['colspan', 'rowspan', 'scope', 'style'],
  thead:      [],
  tr:         [],
  u:          [],
  ul:         [],
  var:        [],
  video:      ['src', 'controls', 'width', 'height', 'poster', 'class'],
  source:     ['src', 'type'],
  div:        ['class', 'style', 'id'],
};

/**
 * Filter HTML to only allowed tags/attributes.
 * Simplified equivalent of wp_kses_post().
 *
 * Note: For production, consider a full parser. This covers common cases.
 *
 * @param {string}  html
 * @param {object}  [allowedTags]
 * @returns {string}
 */
export function wpKsesPost(html, allowedTags = ALLOWED_TAGS_POST) {
  if (!html) return '';

  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, tag, attrs) => {
    const lTag = tag.toLowerCase();

    // Closing tags
    if (match.startsWith('</')) {
      return (lTag in allowedTags) ? `</${lTag}>` : '';
    }

    // Opening tags
    if (!(lTag in allowedTags)) return '';

    const allowedAttrs = allowedTags[lTag];
    const sanitizedAttrs = parseAttrs(attrs)
      .filter(({ name }) => allowedAttrs.includes(name.toLowerCase()))
      .map(({ name, value }) => {
        const n = name.toLowerCase();
        if (n === 'href' || n === 'src') {
          value = sanitizeUrl(value);
          if (!value) return null;
        }
        if (n === 'style') {
          value = sanitizeInlineStyle(value);
        }
        return `${n}="${escAttr(value)}"`;
      })
      .filter(Boolean);

    const selfClose = /\/$/.test(match.trim()) ? ' /' : '';
    return `<${lTag}${sanitizedAttrs.length ? ' ' + sanitizedAttrs.join(' ') : ''}${selfClose}>`;
  });
}

/**
 * Escape HTML attribute value.
 *
 * @param {string} str
 * @returns {string}
 */
export function escAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Escape HTML for output.
 *
 * @param {string} str
 * @returns {string}
 */
export function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Escape for use in a JavaScript string.
 *
 * @param {string} str
 * @returns {string}
 */
export function escJs(str) {
  return JSON.stringify(String(str || '')).slice(1, -1);
}

// -- Internals ----------------------------------------------------------------

function parseAttrs(attrString) {
  const result = [];
  const re = /([a-zA-Z_:][a-zA-Z0-9_:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g;
  let m;
  while ((m = re.exec(attrString)) !== null) {
    result.push({
      name:  m[1],
      value: m[2] ?? m[3] ?? m[4] ?? '',
    });
  }
  return result;
}

/** Allow a safe subset of CSS properties */
const SAFE_CSS_PROPS = new Set([
  'color', 'background-color', 'font-size', 'font-weight', 'font-style',
  'text-align', 'text-decoration', 'margin', 'margin-top', 'margin-right',
  'margin-bottom', 'margin-left', 'padding', 'padding-top', 'padding-right',
  'padding-bottom', 'padding-left', 'border', 'border-radius', 'width',
  'height', 'max-width', 'max-height', 'display', 'float', 'clear',
  'list-style', 'line-height', 'vertical-align', 'white-space',
]);

function sanitizeInlineStyle(style) {
  return (style || '')
    .split(';')
    .map(rule => {
      const [prop, ...vals] = rule.split(':');
      if (!prop) return null;
      const p = prop.trim().toLowerCase();
      if (!SAFE_CSS_PROPS.has(p)) return null;
      const v = vals.join(':').trim();
      // Block expression() and url() with javascript:
      if (/expression\s*\(|javascript:/i.test(v)) return null;
      return `${p}: ${v}`;
    })
    .filter(Boolean)
    .join('; ');
}
