/**
 * CloudPress URL Router
 *
 * Replaces WordPress .htaccess rewrite rules and handles all URL dispatch.
 * Called from index.js to route requests to the appropriate handler.
 *
 * Routes:
 *  /                           -> Front page / blog
 *  /cp-admin/*                 -> Admin panel
 *  /cp-admin/images/*          -> Inline static assets (SVG icons, favicon)
 *  /cp-login                   -> Login (JWT-based, no wp-login.php)
 *  /cp-activate                -> Account activation
 *  /cp-signup                  -> Registration
 *  /cp-comments-post           -> Comment submission
 *  /cp-cron                    -> Cron trigger endpoint
 *  /cp-trackback/[id]          -> Trackbacks
 *  /cp-links-opml              -> OPML export
 *  /cp-mail                    -> Post by email
 *  /cp-sitemap.xml             -> XML Sitemap
 *  /feed                       -> RSS feed
 *  /cp-includes/*              -> Blocked (403)
 *  /uploads/*                  -> Media (KV)
 *  /[year]/[month]/[slug]      -> Single post
 *  /[slug]                     -> Page / archive
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

  // -- Security: block direct access to internal directories -----------------
  if (
    path.startsWith('/cp-includes/') ||
    path.startsWith('/cp-config') ||
    path.startsWith('/cp-settings') ||
    path.startsWith('/cp-load') ||
    path.startsWith('/node_modules/')
  ) {
    return forbidden();
  }

  // -- Installer (runs before config check) ----------------------------------
  if (path === '/cp-admin/setup-config' || path === '/cp-admin/install') {
    return handleInstaller(request, env, ctx);
  }

  // -- Admin static assets (images, icons) -----------------------------------
  // Workers have no filesystem -- static assets are served inline.
  if (path.startsWith('/cp-admin/images/')) {
    return serveAdminAsset(path);
  }

  // -- Static Media (KV store) -----------------------------------------------
  if (path.startsWith('/uploads/') || path.startsWith('/cp-content/uploads/')) {
    return handleMedia(request, env, ctx);
  }

  // -- Feeds ------------------------------------------------------------------
  if (path === '/feed' || path === '/feed/rss' || path === '/feed/atom' ||
      path.endsWith('/feed') || path.endsWith('/feed/rss')) {
    return handleFeed(request, env, ctx);
  }

  // -- Sitemap ----------------------------------------------------------------
  if (path === '/cp-sitemap.xml' || path === '/sitemap.xml') {
    return handleSitemap(request, env, ctx);
  }

  // -- Authentication (JWT-based -- no PHP sessions) ---------------------------
  if (path === '/cp-login') {
    return handleLogin(request, env, ctx);
  }
  if (path === '/cp-logout') {
    return handleLogout(request, env, ctx);
  }

  // -- Admin Panel ------------------------------------------------------------
  if (path === '/cp-admin' || path.startsWith('/cp-admin/')) {
    return handleAdmin(request, env, ctx);
  }

  // -- Account Activation -----------------------------------------------------
  if (path === '/cp-activate') {
    return handleActivate(request, env, ctx);
  }

  // -- Registration / Signup --------------------------------------------------
  if (path === '/cp-signup') {
    return handleSignup(request, env, ctx);
  }

  // -- Comment Submission -----------------------------------------------------
  if (path === '/cp-comments-post' || path === '/cp-comments-post.js') {
    return handleCommentsPost(request, env, ctx);
  }

  // -- Cron -------------------------------------------------------------------
  if (path === '/cp-cron') {
    return handleCronRequest(request, env, ctx);
  }

  // -- Trackbacks -------------------------------------------------------------
  if (path === '/cp-trackback' || path.includes('/trackback')) {
    const parts   = path.split('/').filter(Boolean);
    const postIdx = parts.findIndex(p => /^\d+$/.test(p));
    const postId  = postIdx >= 0 ? parts[postIdx] : '';
    return handleTrackback(request, env, ctx, { post_id: postId });
  }

  // -- OPML Link Export -------------------------------------------------------
  if (path === '/cp-links-opml') {
    return handleLinksOpml(request, env, ctx);
  }

  // -- Post by Email ----------------------------------------------------------
  if (path === '/cp-mail') {
    return handleMail(request, env, ctx);
  }

  // -- Robots.txt ------------------------------------------------------------
  if (path === '/robots.txt') {
    return new Response(
      `User-agent: *\nDisallow: /cp-admin/\nSitemap: ${url.origin}/sitemap.xml\n`,
      { headers: { 'Content-Type': 'text/plain' } }
    );
  }

  // -- Favicon ----------------------------------------------------------------
  if (path === '/favicon.ico') {
    // Try KV first, then fall back to inline SVG favicon
    if (env.CP_KV) {
      try {
        const stored = await env.CP_KV.get('cp:favicon', { type: 'arrayBuffer' });
        if (stored) {
          return new Response(stored, {
            headers: { 'Content-Type': 'image/x-icon', 'Cache-Control': 'public, max-age=86400' },
          });
        }
      } catch (_) {}
    }
    // Inline SVG as fallback favicon
    return serveAdminAsset('/cp-admin/images/favicon.ico');
  }

  // -- Everything else -> Front-end (themes, posts, pages, archives) -----------
  return handleFront(request, env, ctx, { CP_USE_THEMES: true });
}

// -- Static asset handler (inline, no filesystem required) ---------------------
// Cloudflare Workers have no filesystem access at runtime.
// All static assets must be embedded as strings or served from KV/R2.

function serveAdminAsset(path) {
  const file = path.replace('/cp-admin/images/', '');

  switch (file) {
    case 'favicon.ico':
    case 'favicon.svg': {
      // CloudPress logo as inline SVG favicon
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#1d2327"/>
  <text x="4" y="24" font-family="system-ui,sans-serif" font-size="22" font-weight="800" fill="#F6821F">C</text>
  <text x="14" y="24" font-family="system-ui,sans-serif" font-size="22" font-weight="800" fill="#ffffff">P</text>
</svg>`;
      return new Response(svg, {
        headers: {
          'Content-Type':  'image/svg+xml',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    case 'logo.svg': {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 32">
  <rect width="32" height="32" rx="6" fill="#1d2327"/>
  <text x="4" y="24" font-family="system-ui,sans-serif" font-size="22" font-weight="800" fill="#F6821F">C</text>
  <text x="14" y="24" font-family="system-ui,sans-serif" font-size="22" font-weight="800" fill="#ffffff">P</text>
  <text x="40" y="22" font-family="system-ui,sans-serif" font-size="16" font-weight="700" fill="#1d2327">Cloud<tspan fill="#F6821F">Press</tspan></text>
</svg>`;
      return new Response(svg, {
        headers: {
          'Content-Type':  'image/svg+xml',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    case 'spinner.svg': {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="10" fill="none" stroke="#dcdcde" stroke-width="3"/>
  <path d="M12 2a10 10 0 0 1 10 10" fill="none" stroke="#2271b1" stroke-width="3" stroke-linecap="round">
    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/>
  </path>
</svg>`;
      return new Response(svg, {
        headers: {
          'Content-Type':  'image/svg+xml',
          'Cache-Control': 'no-cache',
        },
      });
    }

    default:
      return new Response('Not found', { status: 404 });
  }
}

function forbidden() {
  return new Response('Forbidden', {
    status: 403,
    headers: { 'Content-Type': 'text/plain' },
  });
}
