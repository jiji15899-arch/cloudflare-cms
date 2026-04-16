/**
 * CloudPress Formatting Functions
 * Replaces WordPress wp-includes/formatting.php
 *
 * Text transformation helpers: autop, texturize, excerpts,
 * date/time formatting, and string utilities.
 *
 * @package CloudPress
 */

// -- Paragraph / line-break handling -----------------------------------------

/**
 * Convert double line-breaks to HTML paragraph tags.
 * Equivalent to wpautop().
 *
 * @param {string} text
 * @param {boolean} br   Also convert single line-breaks to <br>
 * @returns {string}
 */
export function wpautop(text, br = true) {
  if (!text) return '';

  const BLOCK_RE = /^<\s*(address|article|aside|blockquote|canvas|dd|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|noscript|ol|p|pre|section|table|tfoot|thead|tbody|tr|td|th|ul|video)\b/i;

  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Preserve <pre> / <code> blocks
  const preserved = {};
  let pi = 0;
  text = text.replace(/(<pre[^>]*>[\s\S]*?<\/pre>|<code[^>]*>[\s\S]*?<\/code>)/gi, (m) => {
    const k = `\x00P${pi++}\x00`;
    preserved[k] = m;
    return k;
  });

  const parts = text.split(/\n\n+/);
  const result = parts.map(part => {
    const t = part.trim();
    if (!t) return '';
    if (BLOCK_RE.test(t) || t.startsWith('\x00P')) return t;
    const inner = br ? t.replace(/\n/g, '<br />\n') : t;
    return `<p>${inner}</p>`;
  });

  let out = result.filter(Boolean).join('\n\n');

  // Restore preserved blocks
  for (const [k, v] of Object.entries(preserved)) {
    out = out.replace(k, v);
  }

  return out;
}

/**
 * Replaces plain text punctuation with HTML typographic equivalents.
 * Equivalent to wptexturize().
 *
 * @param {string} text
 * @returns {string}
 */
export function wptexturize(text) {
  if (!text) return '';
  return text
    .replace(/---/g, '\u2014')
    .replace(/--/g,  '\u2013')
    .replace(/(^|[\s(])"(\S)/g,  '$1\u201c$2')
    .replace(/(\S)"([\s,.]|$)/g, '$1\u201d$2')
    .replace(/(^|[\s(])'(\S)/g,  '$1\u2018$2')
    .replace(/(\S)'([\s,.]|$)/g, '$1\u2019$2')
    .replace(/\.\.\./g, '\u2026');
}

/**
 * Convert plain-text newlines to <br /> tags.
 * Equivalent to nl2br().
 *
 * @param {string} str
 * @returns {string}
 */
export function nl2br(str) {
  return String(str || '').replace(/\n/g, '<br />\n');
}

// -- Excerpt ------------------------------------------------------------------

/**
 * Generate a post excerpt from content.
 * Equivalent to wp_trim_excerpt().
 *
 * @param {string} content   Raw post content
 * @param {number} wordCount Number of words to include
 * @param {string} more      Appended string (default "...")
 * @returns {string}
 */
export function wpTrimExcerpt(content, wordCount = 55, more = '\u2026') {
  if (!content) return '';
  // Remove <!--more--> and shortcodes, strip tags
  const text = stripTags(
    content
      .replace(/<!--more.*?-->/gi, '')
      .replace(/\[([^\]]+)\][^\[]*\[\/\1\]/gi, '')
      .replace(/\[[^\]]+\]/g, '')
  );
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= wordCount) return text;
  return words.slice(0, wordCount).join(' ') + more;
}

/**
 * Get the <!--more--> teaser text (content before the more tag).
 *
 * @param {string} content
 * @returns {{ hasMor: boolean, teaser: string, rest: string }}
 */
export function getMoreSplit(content) {
  const idx = content.indexOf('<!--more');
  if (idx === -1) return { hasMore: false, teaser: content, rest: '' };
  return {
    hasMore: true,
    teaser:  content.slice(0, idx),
    rest:    content.slice(content.indexOf('-->', idx) + 3),
  };
}

// -- HTML / string utilities --------------------------------------------------

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
 * Escape HTML special characters.
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
 * Decode HTML entities to plain text.
 *
 * @param {string} str
 * @returns {string}
 */
export function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, '\u00a0');
}

/**
 * Truncate a string to N characters.
 *
 * @param {string} str
 * @param {number} length
 * @param {string} suffix
 * @returns {string}
 */
export function truncate(str, length = 100, suffix = '...') {
  const s = String(str || '');
  return s.length > length ? s.slice(0, length) + suffix : s;
}

/**
 * Trim a string to N words.
 * Equivalent to wp_trim_words().
 *
 * @param {string} str
 * @param {number} count
 * @param {string} more
 * @returns {string}
 */
export function trimWords(str, count = 55, more = '...') {
  const words = String(str || '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= count) return str;
  return words.slice(0, count).join(' ') + more;
}

/**
 * Convert a post title into a URL slug.
 * Equivalent to sanitize_title().
 *
 * @param {string} str
 * @returns {string}
 */
export function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\w\s가-힣ㄱ-ㅎㅏ-ㅣ-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Generate a unique slug by appending a counter.
 * Equivalent to wp_unique_post_slug().
 *
 * @param {object} cp
 * @param {string} slug
 * @param {number} [excludeId]  Post ID to exclude (for updates)
 * @param {string} [postType]
 * @returns {Promise<string>}
 */
export async function uniqueSlug(cp, slug, excludeId = 0, postType = 'post') {
  const prefix = cp.db_prefix || 'cp_';
  let candidate = slug;
  let counter   = 1;

  while (true) {
    const row = await cp.db
      .prepare(
        `SELECT ID FROM ${prefix}posts WHERE post_name=? AND post_type=? AND ID!=? LIMIT 1`
      )
      .bind(candidate, postType, excludeId)
      .first();

    if (!row) return candidate;
    candidate = `${slug}-${counter++}`;
  }
}

// -- Date / time --------------------------------------------------------------

/**
 * Format a date string using a PHP-style format string.
 * Equivalent to date_i18n() / mysql2date().
 *
 * Supported tokens: Y, m, d, H, i, s, D, l, M, F, j, n, G, g, A, a, N, w, z
 *
 * @param {string} format
 * @param {string|Date} dateStr
 * @returns {string}
 */
export function formatDate(format, dateStr) {
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr || Date.now());
  if (isNaN(d)) return String(dateStr || '');

  const pad = (n) => String(n).padStart(2, '0');
  const days  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const daysS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const monthsS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return format.replace(/[YymdHhisDlLNwzFMjngGAaWt]/g, token => {
    switch (token) {
      case 'Y': return d.getFullYear();
      case 'y': return String(d.getFullYear()).slice(-2);
      case 'm': return pad(d.getMonth() + 1);
      case 'n': return d.getMonth() + 1;
      case 'd': return pad(d.getDate());
      case 'j': return d.getDate();
      case 'H': return pad(d.getHours());
      case 'G': return d.getHours();
      case 'h': return pad(d.getHours() % 12 || 12);
      case 'g': return d.getHours() % 12 || 12;
      case 'i': return pad(d.getMinutes());
      case 's': return pad(d.getSeconds());
      case 'D': return daysS[d.getDay()];
      case 'l': return days[d.getDay()];
      case 'N': return d.getDay() || 7;     // ISO weekday
      case 'w': return d.getDay();
      case 'M': return monthsS[d.getMonth()];
      case 'F': return months[d.getMonth()];
      case 'A': return d.getHours() < 12 ? 'AM' : 'PM';
      case 'a': return d.getHours() < 12 ? 'am' : 'pm';
      case 'z': return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000) - 1;
      case 't': return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      default:  return token;
    }
  });
}

/**
 * Convert a MySQL datetime string to a JS Date.
 *
 * @param {string} mysql
 * @returns {Date}
 */
export function mysqlToDate(mysql) {
  if (!mysql) return new Date();
  return new Date(mysql.replace(' ', 'T') + 'Z');
}

/**
 * Get the current UTC datetime as a MySQL-formatted string.
 *
 * @returns {string}  e.g. "2025-04-15 12:34:56"
 */
export function currentTime() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Human-readable time diff ("2 hours ago", "3 days ago").
 * Equivalent to human_time_diff().
 *
 * @param {string|Date} from
 * @param {string|Date} [to]
 * @returns {string}
 */
export function humanTimeDiff(from, to = new Date()) {
  const f  = from instanceof Date ? from : new Date(from);
  const t  = to   instanceof Date ? to   : new Date(to);
  const s  = Math.abs(t - f) / 1000;

  if (s < 60)        return `${Math.round(s)} seconds`;
  if (s < 3600)      return `${Math.round(s / 60)} minutes`;
  if (s < 86400)     return `${Math.round(s / 3600)} hours`;
  if (s < 2592000)   return `${Math.round(s / 86400)} days`;
  if (s < 31536000)  return `${Math.round(s / 2592000)} months`;
  return `${Math.round(s / 31536000)} years`;
}

// -- Number helpers ------------------------------------------------------------

/**
 * Format a number with commas and optional decimal places.
 * Equivalent to number_format_i18n().
 *
 * @param {number} num
 * @param {number} decimals
 * @returns {string}
 */
export function numberFormat(num, decimals = 0) {
  return Number(num).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// -- Shortcode -----------------------------------------------------------------

/**
 * Strip all [shortcode] tags from content.
 * Equivalent to strip_shortcodes().
 *
 * @param {string} content
 * @returns {string}
 */
export function stripShortcodes(content) {
  return String(content || '').replace(/\[[^\]]+\]/g, '');
}

export function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '')); }

export function htmlExcerpt(text, maxLength = 255) { return truncate(stripTags(text), maxLength); }
