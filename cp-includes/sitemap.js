/**
 * CloudPress XML Sitemap
 * Replaces WordPress sitemap functionality (built-in since 5.5)
 *
 * Generates /sitemap.xml from D1 posts, pages, and taxonomy terms.
 * No external services required.
 *
 * @package CloudPress
 */

import { cpLoad }    from '../cp-load.js';
import { getOption } from './option.js';

/**
 * Handle a sitemap request.
 *
 * @param {Request} request
 * @param {object}  env
 * @param {object}  ctx
 * @returns {Promise<Response>}
 */
export async function handleSitemap(request, env, ctx) {
  const cp = await cpLoad(request, env, ctx);
  if (cp.__cpError) return cp.response;

  const url     = new URL(request.url);
  const path    = url.pathname;
  const prefix  = cp.db_prefix || 'cp_';
  const siteUrl = (await getOption(cp, 'siteurl', url.origin)).replace(/\/$/, '');

  // Index sitemap
  if (path === '/sitemap.xml' || path === '/cp-sitemap.xml') {
    return sitemapIndex(cp, siteUrl, url);
  }

  // Sub-sitemaps
  if (path === '/sitemap-posts.xml') {
    return postsSitemap(cp, prefix, siteUrl, 'post');
  }
  if (path === '/sitemap-pages.xml') {
    return postsSitemap(cp, prefix, siteUrl, 'page');
  }
  if (path === '/sitemap-terms.xml') {
    return termsSitemap(cp, prefix, siteUrl);
  }

  return new Response('Not Found', { status: 404 });
}

// -- Index sitemap -------------------------------------------------------------

async function sitemapIndex(cp, siteUrl, url) {
  const entries = [
    `${siteUrl}/sitemap-posts.xml`,
    `${siteUrl}/sitemap-pages.xml`,
    `${siteUrl}/sitemap-terms.xml`,
  ].map(loc => `
  <sitemap>
    <loc>${esc(loc)}</loc>
    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>
  </sitemap>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>`;

  return xmlResponse(xml);
}

// -- Posts / pages sitemap -----------------------------------------------------

async function postsSitemap(cp, prefix, siteUrl, postType) {
  const rows = await cp.db.prepare(`
    SELECT ID, post_name, post_date, post_modified, post_type
    FROM ${prefix}posts
    WHERE post_type=? AND post_status='publish'
    ORDER BY post_modified DESC
    LIMIT 1000
  `).bind(postType).all();

  const urls = (rows.results || []).map(post => {
    const loc      = postPermalink(siteUrl, post);
    const lastmod  = (post.post_modified || post.post_date || '').slice(0, 10);
    const freq     = postType === 'post' ? 'weekly' : 'monthly';
    const priority = postType === 'post' ? '0.8' : '0.6';

    return `
  <url>
    <loc>${esc(loc)}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>${freq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return xmlResponse(xml);
}

// -- Terms sitemap -------------------------------------------------------------

async function termsSitemap(cp, prefix, siteUrl) {
  const rows = await cp.db.prepare(`
    SELECT t.term_id, t.slug, tt.taxonomy, tt.count
    FROM ${prefix}terms t
    JOIN ${prefix}term_taxonomy tt ON t.term_id = tt.term_id
    WHERE tt.taxonomy IN ('category', 'post_tag') AND tt.count > 0
    ORDER BY tt.count DESC
    LIMIT 1000
  `).all();

  const urls = (rows.results || []).map(term => {
    const loc = termPermalink(siteUrl, term);
    return `
  <url>
    <loc>${esc(loc)}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.4</priority>
  </url>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return xmlResponse(xml);
}

// -- Helpers -------------------------------------------------------------------

function postPermalink(siteUrl, post) {
  if (post.post_name) {
    const d = post.post_date ? new Date(post.post_date) : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    if (post.post_type === 'page') return `${siteUrl}/${post.post_name}/`;
    return `${siteUrl}/${y}/${m}/${post.post_name}/`;
  }
  return `${siteUrl}/?p=${post.ID}`;
}

function termPermalink(siteUrl, term) {
  if (term.taxonomy === 'category') return `${siteUrl}/category/${term.slug}/`;
  if (term.taxonomy === 'post_tag') return `${siteUrl}/tag/${term.slug}/`;
  return `${siteUrl}/${term.taxonomy}/${term.slug}/`;
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function xmlResponse(xml) {
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=UTF-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
