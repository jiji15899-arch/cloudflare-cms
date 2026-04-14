/**
 * CloudPress URL Router
 *
 * Replaces WordPress .htaccess rewrite rules and handles all URL dispatch.
 * Called from index.js to route requests to the appropriate handler.
 *
 * Routes:
 *  /                           → Front page / blog
 *  /cp-admin/*                 → Admin panel
 *  /cp-login                   → Login (JWT-based, no wp-login.php)
 *  /cp-activate                → Account activation
 *  /cp-signup                  → Registration
 *  /cp-comments-post           → Comment submission
 *  /cp-cron                    → Cron trigger endpoint
 *  /cp-trackback/[id]          → Trackbacks
 *  /cp-links-opml              → OPML export
 *  /cp-mail                    → Post by email
 *  /cp-sitemap.xml             → XML Sitemap
 *  /feed                       → RSS feed
 *  /cp-includes/*              → Blocked (403)
 *  /uploads/*                  → Media (R2)
 *  /[year]/[month]/[slug]      → Single post
 *  /[slug]                     → Page / archive
 *
 * @package CloudPress
 */

import { handleRequest as handleFront }     from './cp-blog-header.js';
import { handleActivate }                    from './cp-activate.js';
import { handleSignup }                      from './cp-signup.js';
import { handleCommentsPost }                from './cp-comments-post.js';
import { handleCronRequest }                 from './cp-cron.js';
import { handleTrackback }                   from './cp-trackback.js';
import { handleLinksOpml }                   from './cp-links-opml.js';
import { handleMail }                        from './cp-mail.js';
import { handleAdmin }                       from './cp-admin/index.js';
import { handleLogin, handleLogout }         from './cp-includes/auth.js';
import { handleMedia }                       from './cp-includes/media-handler.js';
import { handleFeed }                        from './cp-includes/feed.js';
import { handleSitemap }                     from './cp-includes/sitemap.js';
import { handleInstaller }                   from './cp-admin/installer.js';

/**
 * Route an incoming request to the correct handler.
 *
 * @param {Request} request
 * @param {object}  env
 * @param {object}  ctx
 * @returns {Promise<Response>}
 */
export async function route(request, env, ctx) {
  const url      = new URL(request.url);
  const path     = url.pathname.replace(/\/+$/, '') || '/';
  const method   = request.method.toUpperCase();

  // ── Security: block direct access to internal directories ─────────────────
  if (
    path.startsWith('/cp-includes/') ||
    path.startsWith('/cp-config') ||
    path.startsWith('/cp-settings') ||
    path.startsWith('/cp-load') ||
    path.startsWith('/node_modules/')
  ) {
    return forbidden();
  }

  // ── Installer (runs before config check) ──────────────────────────────────
  if (path === '/cp-admin/setup-config' || path === '/cp-admin/install') {
    return handleInstaller(request, env, ctx);
  }

  // ── Static Media (R2 bucket) ───────────────────────────────────────────────
  if (path.startsWith('/uploads/') || path.startsWith('/cp-content/uploads/')) {
    return handleMedia(request, env, ctx);
  }

  // ── Feeds ──────────────────────────────────────────────────────────────────
  if (path === '/feed' || path === '/feed/rss' || path === '/feed/atom' ||
      path.endsWith('/feed') || path.endsWith('/feed/rss')) {
    return handleFeed(request, env, ctx);
  }

  // ── Sitemap ────────────────────────────────────────────────────────────────
  if (path === '/cp-sitemap.xml' || path === '/sitemap.xml') {
    return handleSitemap(request, env, ctx);
  }

  // ── Authentication (JWT-based — no PHP sessions) ───────────────────────────
  if (path === '/cp-login') {
    return handleLogin(request, env, ctx);
  }
  if (path === '/cp-logout') {
    return handleLogout(request, env, ctx);
  }

  // ── Admin Panel ────────────────────────────────────────────────────────────
  if (path === '/cp-admin' || path.startsWith('/cp-admin/')) {
    return handleAdmin(request, env, ctx);
  }

  // ── Account Activation ─────────────────────────────────────────────────────
  if (path === '/cp-activate') {
    return handleActivate(request, env, ctx);
  }

  // ── Registration / Signup ──────────────────────────────────────────────────
  if (path === '/cp-signup') {
    return handleSignup(request, env, ctx);
  }

  // ── Comment Submission ─────────────────────────────────────────────────────
  if (path === '/cp-comments-post' || path === '/cp-comments-post.js') {
    return handleCommentsPost(request, env, ctx);
  }

  // ── Cron ───────────────────────────────────────────────────────────────────
  if (path === '/cp-cron') {
    return handleCronRequest(request, env, ctx);
  }

  // ── Trackbacks ─────────────────────────────────────────────────────────────
  if (path === '/cp-trackback' || path.includes('/trackback')) {
    const parts   = path.split('/').filter(Boolean);
    const postIdx = parts.findIndex(p => /^\d+$/.test(p));
    const postId  = postIdx >= 0 ? parts[postIdx] : '';
    return handleTrackback(request, env, ctx, { post_id: postId });
  }

  // ── OPML Link Export ───────────────────────────────────────────────────────
  if (path === '/cp-links-opml') {
    return handleLinksOpml(request, env, ctx);
  }

  // ── Post by Email ──────────────────────────────────────────────────────────
  if (path === '/cp-mail') {
    return handleMail(request, env, ctx);
  }

  // ── Robots.txt ────────────────────────────────────────────────────────────
  if (path === '/robots.txt') {
    return new Response(
      `User-agent: *\nDisallow: /cp-admin/\nSitemap: ${url.origin}/sitemap.xml\n`,
      { headers: { 'Content-Type': 'text/plain' } }
    );
  }

  // ── Favicon ────────────────────────────────────────────────────────────────
  if (path === '/favicon.ico') {
    // Try R2 first, otherwise 204
    if (env.CP_MEDIA) {
      try {
        const obj = await env.CP_MEDIA.get('favicon.ico');
        if (obj) {
          return new Response(obj.body, {
            headers: { 'Content-Type': 'image/x-icon', 'Cache-Control': 'public, max-age=86400' },
          });
        }
      } catch (_) {}
    }
    return new Response('', { status: 204 });
  }

  // ── Everything else → Front-end (themes, posts, pages, archives) ───────────
  return handleFront(request, env, ctx, { CP_USE_THEMES: true });
}

function forbidden() {
  return new Response('Forbidden', {
    status: 403,
    headers: { 'Content-Type': 'text/plain' },
  });
}
