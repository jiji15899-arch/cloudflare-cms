/**
 * CloudPress OPML Link Export
 * Replaces WordPress wp-links-opml.php
 *
 * Outputs links in OPML XML format for import into feed readers.
 * Links are stored in D1.
 *
 * @package CloudPress
 */

import { cpLoad } from './cp-load.js';
import { getCategories } from './cp-includes/category.js';
import { getBookmarks } from './cp-includes/bookmark.js';
import { getOption } from './cp-includes/option.js';

/**
 * Handle OPML export request.
 *
 * @param {Request} request
 * @param {object}  env
 * @param {object}  ctx
 * @returns {Promise<Response>}
 */
export async function handleLinksOpml(request, env, ctx) {
  const cp = await cpLoad(request, env, ctx);
  if (cp.__cpError) return cp.response;

  const url = new URL(request.url);
  let linkCat = url.searchParams.get('link_cat') || '';

  // Validate and sanitize link_cat
  if (linkCat && !['all', '0'].includes(linkCat)) {
    linkCat = parseInt(linkCat, 10);
    if (isNaN(linkCat) || linkCat <= 0) linkCat = '';
  }

  const blogCharset = await getOption(cp, 'blogcharset') || 'UTF-8';
  const blogName    = await getOption(cp, 'blogname') || (cp.config.SITE_NAME || 'CloudPress');

  // Fetch categories
  let cats;
  if (!linkCat) {
    cats = await getCategories(cp, { taxonomy: 'link_category', hierarchical: false });
  } else {
    cats = await getCategories(cp, { taxonomy: 'link_category', hierarchical: false, include: [linkCat] });
  }

  // Fire opml_head hook
  cp.hooks.doAction('opml_head');

  // Build OPML XML
  const now = new Date().toUTCString();
  let xml = `<?xml version="1.0"?>\n`;
  xml += `<opml version="1.0">\n`;
  xml += `\t<head>\n`;
  xml += `\t\t<title>Links for ${escXml(blogName)}</title>\n`;
  xml += `\t\t<dateCreated>${escXml(now)}</dateCreated>\n`;
  xml += `\t</head>\n`;
  xml += `\t<body>\n`;

  for (const cat of (cats || [])) {
    const catName = cp.hooks.applyFilters('link_category', cat.name || '');

    xml += `<outline type="category" title="${escXml(catName)}">\n`;

    const bookmarks = await getBookmarks(cp, { category: cat.term_id });
    for (const bookmark of (bookmarks || [])) {
      const title   = cp.hooks.applyFilters('link_title', bookmark.link_name || '');
      const updated = (bookmark.link_updated && bookmark.link_updated !== '0000-00-00 00:00:00')
        ? bookmark.link_updated
        : '';

      xml += `\t<outline text="${escXml(title)}" type="link" `;
      xml += `xmlUrl="${escXml(bookmark.link_rss || '')}" `;
      xml += `htmlUrl="${escXml(bookmark.link_url || '')}" `;
      if (updated) xml += `updated="${escXml(updated)}" `;
      xml += `/>\n`;
    }

    xml += `</outline>\n`;
  }

  xml += `\t</body>\n</opml>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': `text/xml; charset=${blogCharset}`,
      'Cache-Control': 'no-cache',
    },
  });
}

function escXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
