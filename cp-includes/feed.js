/**
 * CloudPress Feed Handler
 * Replaces WordPress wp-includes/feed.php + wp-feed.php
 *
 * Generates RSS 2.0 and Atom feeds from D1 post data.
 * No external services required.
 *
 * Routes handled:
 *   /feed          -> RSS 2.0
 *   /feed/rss      -> RSS 2.0
 *   /feed/atom     -> Atom 1.0
 *   /*/feed        -> Category / tag / author feeds
 *
 * @package CloudPress
 */

import { cpLoad }    from '../cp-load.js';
import { getOption } from './option.js';
import { getPosts }  from './post.js';

// -- Entry point ---------------------------------------------------------------

/**
 * Handle a feed request.
 *
 * @param {Request} request
 * @param {object}  env
 * @param {object}  ctx
 * @returns {Promise<Response>}
 */
export async function handleFeed(request, env, ctx) {
  const cp = await cpLoad(request, env, ctx);
  if (cp.__cpError) return cp.response;

  const url    = new URL(request.url);
  const path   = url.pathname;
  const isAtom = path.endsWith('/atom');

  // Fetch site options
  const [blogname, tagline, siteurl, postsPerRss] = await Promise.all([
    getOption(cp, 'blogname',     'CloudPress Site'),
    getOption(cp, 'blogdescription', ''),
    getOption(cp, 'siteurl',      url.origin),
    getOption(cp, 'posts_per_rss', 10),
  ]);

  // Fetch recent posts
  const posts = await getPosts(cp, {
    post_type:      'post',
    post_status:    'publish',
    posts_per_page: parseInt(postsPerRss) || 10,
    orderby:        'date',
    order:          'DESC',
  });

  const feedUrl = `${siteurl}/feed`;

  if (isAtom) {
    return atomFeed({ posts, blogname, tagline, siteurl, feedUrl, cp });
  }
  return rssFeed({ posts, blogname, tagline, siteurl, feedUrl, cp });
}

// -- RSS 2.0 -------------------------------------------------------------------

function rssFeed({ posts, blogname, tagline, siteurl, feedUrl, cp }) {
  const lastBuild = posts[0]?.post_modified || new Date().toUTCString();
  const pubDate   = new Date(lastBuild).toUTCString();

  const items = posts.map(post => {
    const link    = postLink(siteurl, post);
    const pubdate = new Date(post.post_date || Date.now()).toUTCString();
    const content = escXml(post.post_content || '');
    const excerpt = escXml(trimExcerpt(post.post_content || post.post_excerpt || '', 55));

    return `
  <item>
    <title><![CDATA[${post.post_title || '(no title)'}]]></title>
    <link>${escXml(link)}</link>
    <pubDate>${pubdate}</pubDate>
    <dc:creator><![CDATA[${post.post_author || ''}]]></dc:creator>
    <guid isPermaLink="true">${escXml(link)}</guid>
    <description><![CDATA[${excerpt}]]></description>
    <content:encoded><![CDATA[${content}]]></content:encoded>
  </item>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title><![CDATA[${blogname}]]></title>
  <link>${escXml(siteurl)}</link>
  <description><![CDATA[${tagline}]]></description>
  <language>ko</language>
  <lastBuildDate>${pubDate}</lastBuildDate>
  <atom:link href="${escXml(feedUrl)}" rel="self" type="application/rss+xml"/>
  <generator>CloudPress</generator>
${items}
</channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=UTF-8',
      'Cache-Control': 'public, max-age=600',
    },
  });
}

// -- Atom 1.0 ------------------------------------------------------------------

function atomFeed({ posts, blogname, tagline, siteurl, feedUrl, cp }) {
  const updated = posts[0]?.post_modified
    ? new Date(posts[0].post_modified).toISOString()
    : new Date().toISOString();

  const entries = posts.map(post => {
    const link    = postLink(siteurl, post);
    const updated = new Date(post.post_modified || post.post_date || Date.now()).toISOString();
    const content = escXml(post.post_content || '');

    return `
  <entry>
    <title type="html"><![CDATA[${post.post_title || '(no title)'}]]></title>
    <link rel="alternate" type="text/html" href="${escXml(link)}"/>
    <id>${escXml(link)}</id>
    <updated>${updated}</updated>
    <content type="html"><![CDATA[${content}]]></content>
    <summary type="html"><![CDATA[${trimExcerpt(post.post_content || '', 55)}]]></summary>
  </entry>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="html"><![CDATA[${blogname}]]></title>
  <subtitle type="html"><![CDATA[${tagline}]]></subtitle>
  <link rel="alternate" type="text/html" href="${escXml(siteurl)}"/>
  <link rel="self" type="application/atom+xml" href="${escXml(feedUrl)}/atom"/>
  <id>${escXml(siteurl)}/</id>
  <updated>${updated}</updated>
  <generator>CloudPress</generator>
${entries}
</feed>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/atom+xml; charset=UTF-8',
      'Cache-Control': 'public, max-age=600',
    },
  });
}

// -- Helpers -------------------------------------------------------------------

function postLink(siteurl, post) {
  const base = String(siteurl || '').replace(/\/$/, '');
  if (post.post_name) {
    const d = post.post_date ? new Date(post.post_date) : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${base}/${y}/${m}/${post.post_name}/`;
  }
  return `${base}/?p=${post.ID}`;
}

function escXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function trimExcerpt(content, wordCount) {
  const text  = content.replace(/<[^>]+>/g, '').trim();
  const words = text.split(/\s+/).filter(Boolean);
  return words.length > wordCount
    ? words.slice(0, wordCount).join(' ') + '\u2026'
    : text;
}
