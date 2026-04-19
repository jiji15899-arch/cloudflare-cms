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
 *  /cp-admin/css/*             -> Inline CSS assets (admin, installer)
 *  /cp-includes/css/*          -> Inline CSS assets (login, signup, etc.)
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
    (path.startsWith('/cp-includes/') && !path.startsWith('/cp-includes/css/')) ||
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

  // -- Resolve admin slug (randomized: cp-admin-XXXXXX stored in KV) ---------
  let adminSlug = 'cp-admin';
  try {
    const stored = await env.CP_KV?.get('cp:admin_slug');
    if (stored) adminSlug = stored;
  } catch (_) {}

  // -- Admin CSS/image assets ------------------------------------------------
  if (path.startsWith('/cp-admin/css/') || path.startsWith(\`/\${adminSlug}/css/\`)) {
    return serveAdminCss(path.replace(\`/\${adminSlug}/css/\`, '/cp-admin/css/'));
  }

  // -- Shared includes CSS assets (login, signup, etc.) ----------------------
  if (path.startsWith('/cp-includes/css/')) {
    return serveIncludesCss(path);
  }

  // -- Admin static assets (images, icons) -----------------------------------
  if (path.startsWith('/cp-admin/images/') || path.startsWith(\`/\${adminSlug}/images/\`)) {
    return serveAdminAsset(path.replace(\`/\${adminSlug}/images/\`, '/cp-admin/images/'));
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

  // -- Language Switch (cookie-based i18n) ------------------------------------
  if (path === '/cp-set-lang') {
    const qs   = url.searchParams;
    const lang = qs.get('lang') || 'en';
    const redir = qs.get('redirect') || '/';
    const valid = ['en','ko','zh','ja','fr'].includes(lang) ? lang : 'en';
    return new Response(null, {
      status: 302,
      headers: {
        'Location': redir,
        'Set-Cookie': `cp_lang=${valid}; Path=/; Max-Age=31536000; SameSite=Lax`,
      },
    });
  }

  // -- Authentication (JWT-based -- no PHP sessions) ---------------------------
  if (path === '/cp-login') {
    return handleLogin(request, env, ctx);
  }
  if (path === '/cp-logout') {
    return handleLogout(request, env, ctx);
  }

  // -- Admin Panel (support both legacy /cp-admin/ and randomized slug) -------
  if (path === '/cp-admin' || path.startsWith('/cp-admin/') ||
      path === `/${adminSlug}` || path.startsWith(`/${adminSlug}/`)) {
    // Rewrite randomized slug to canonical for internal handlers
    const rewritten = new Request(
      request.url.replace(`/${adminSlug}`, '/cp-admin'),
      request
    );
    return handleAdmin(rewritten, env, ctx);
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
    return serveAdminAsset('/cp-admin/images/favicon.ico');
  }

  // -- Everything else -> Front-end (themes, posts, pages, archives) -----------
  return handleFront(request, env, ctx, { CP_USE_THEMES: true });
}

// ---------------------------------------------------------------------------
// CSS Asset Handlers (inline — Cloudflare Workers have no filesystem)
// ---------------------------------------------------------------------------

function cssResponse(css) {
  return new Response(css, {
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

function serveAdminCss(path) {
  const file = path.replace('/cp-admin/css/', '');
  switch (file) {
    case 'admin.css': return cssResponse(ADMIN_CSS);
    case 'installer.css': return cssResponse(INSTALLER_CSS);
    default: return new Response('Not found', { status: 404 });
  }
}

function serveIncludesCss(path) {
  const file = path.replace('/cp-includes/css/', '');
  switch (file) {
    case 'login.css':            return cssResponse(LOGIN_CSS);
    case 'activate.css':         return cssResponse(ACTIVATE_CSS);
    case 'signup.css':           return cssResponse(SIGNUP_CSS);
    case 'error.css':            return cssResponse(ERROR_CSS);
    case 'comments.css':         return cssResponse(COMMENTS_CSS);
    case 'template-fallback.css': return cssResponse(TEMPLATE_FALLBACK_CSS);
    default: return new Response('Not found', { status: 404 });
  }
}

// ---------------------------------------------------------------------------
// Inline CSS Strings
// ---------------------------------------------------------------------------

const ADMIN_CSS = `:root{--cp-sidebar-w:240px;--cp-topbar-h:48px;--cp-bg:#f0f0f1;--cp-sidebar-bg:#1d2327;--cp-sidebar-text:#a7aaad;--cp-sidebar-hover:#2c3338;--cp-sidebar-active:#2271b1;--cp-topbar-bg:#1d2327;--cp-topbar-text:#a7aaad;--cp-accent:#2271b1;--cp-accent-hover:#135e96;--cp-white:#fff;--cp-border:#dcdcde;--cp-text:#1d2327;--cp-muted:#646970;--cp-radius:4px;--cp-shadow:0 1px 3px rgba(0,0,0,.12)}
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;background:var(--cp-bg);color:var(--cp-text)}
#cp-topbar{position:fixed;top:0;left:0;right:0;height:var(--cp-topbar-h);background:var(--cp-topbar-bg);display:flex;align-items:center;justify-content:space-between;padding:0 16px;z-index:1000;color:var(--cp-topbar-text)}
.cp-topbar-left,.cp-topbar-right{display:flex;align-items:center;gap:12px}
#cp-menu-toggle{background:none;border:none;cursor:pointer;padding:6px;color:var(--cp-topbar-text);display:none;flex-direction:column;gap:4px}
#cp-menu-toggle span{display:block;width:20px;height:2px;background:currentColor;transition:.2s}
.cp-site-link{color:var(--cp-topbar-text);text-decoration:none;font-size:13px;opacity:.8;transition:.15s}
.cp-site-link:hover{opacity:1;color:var(--cp-white)}
.cp-version{font-size:11px;opacity:.5}
.cp-user-menu{position:relative}
.cp-user-btn{background:none;border:none;color:var(--cp-topbar-text);cursor:pointer;font-size:13px;padding:6px 10px;border-radius:var(--cp-radius);transition:.15s}
.cp-user-btn:hover{background:var(--cp-sidebar-hover);color:var(--cp-white)}
.cp-user-dropdown{display:none;position:absolute;right:0;top:calc(100% + 4px);background:var(--cp-white);border:1px solid var(--cp-border);border-radius:var(--cp-radius);min-width:150px;box-shadow:var(--cp-shadow);z-index:100}
.cp-user-menu.open .cp-user-dropdown{display:block}
.cp-user-dropdown a{display:block;padding:8px 14px;color:var(--cp-text);text-decoration:none;font-size:13px;transition:.1s}
.cp-user-dropdown a:hover{background:var(--cp-bg)}
.cp-user-dropdown hr{border:none;border-top:1px solid var(--cp-border);margin:4px 0}
.cp-logout{color:#d63638!important}
#cp-layout{display:flex;min-height:100vh;padding-top:var(--cp-topbar-h)}
#cp-sidebar{width:var(--cp-sidebar-w);background:var(--cp-sidebar-bg);flex-shrink:0;overflow-y:auto;position:fixed;top:var(--cp-topbar-h);left:0;bottom:0;z-index:500;transition:transform .2s}
.cp-sidebar-header{padding:16px 14px 8px;border-bottom:1px solid rgba(255,255,255,.07)}
.cp-logo{display:flex;align-items:center;gap:8px;color:var(--cp-white);text-decoration:none;font-weight:700;font-size:16px}
.cp-logo span{letter-spacing:-.3px}
.cp-nav-list{list-style:none;margin:8px 0;padding:0}
.cp-nav-item{margin:1px 0}
.cp-nav-link{display:flex;align-items:center;gap:10px;padding:9px 14px;color:var(--cp-sidebar-text);text-decoration:none;border-radius:var(--cp-radius);margin:0 6px;transition:.15s;font-size:13px}
.cp-nav-link:hover,.cp-nav-item.active>.cp-nav-link{color:var(--cp-white);background:var(--cp-sidebar-hover)}
.cp-nav-item.active>.cp-nav-link{background:var(--cp-sidebar-active)}
.cp-nav-icon{font-size:16px;flex-shrink:0;width:20px;text-align:center}
.cp-nav-label{flex:1}
.cp-nav-arrow{font-size:9px;opacity:.5;transition:transform .2s}
.cp-nav-item.has-children.active .cp-nav-arrow,.cp-nav-item.has-children:hover .cp-nav-arrow{transform:rotate(180deg)}
.cp-subnav{list-style:none;margin:0;padding:0 0 4px 44px;display:none}
.cp-nav-item.has-children.active .cp-subnav,.cp-nav-item.has-children:hover .cp-subnav{display:block}
.cp-subnav li a{display:block;padding:6px 10px;color:var(--cp-sidebar-text);text-decoration:none;font-size:12.5px;border-radius:var(--cp-radius);transition:.1s}
.cp-subnav li a:hover,.cp-subnav li.active a{color:var(--cp-white);background:rgba(255,255,255,.07)}
#cp-main{flex:1;margin-left:var(--cp-sidebar-w);padding:24px;min-height:calc(100vh - var(--cp-topbar-h))}
.cp-page-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
.cp-page-title{font-size:23px;font-weight:400;margin:0;color:var(--cp-text)}
.cp-notice{border-left:4px solid var(--cp-accent);background:var(--cp-white);padding:10px 14px;border-radius:0 var(--cp-radius) var(--cp-radius) 0;margin-bottom:16px;box-shadow:var(--cp-shadow)}
.cp-notice-success{border-color:#00a32a}
.cp-notice-error{border-color:#d63638}
.cp-notice-warning{border-color:#dba617}
.cp-notice p{margin:0;font-size:13.5px}
.cp-card{background:var(--cp-white);border:1px solid var(--cp-border);border-radius:var(--cp-radius);padding:20px;margin-bottom:20px;box-shadow:var(--cp-shadow)}
.cp-card h2,.cp-card h3{margin:0 0 14px;font-size:15px;color:var(--cp-text)}
.cp-table-wrap{background:var(--cp-white);border:1px solid var(--cp-border);border-radius:var(--cp-radius);overflow:hidden;margin-bottom:20px;box-shadow:var(--cp-shadow)}
.cp-table{width:100%;border-collapse:collapse;font-size:13px}
.cp-table th{background:var(--cp-bg);padding:10px 14px;text-align:left;font-weight:600;border-bottom:1px solid var(--cp-border);color:var(--cp-muted);font-size:12px;text-transform:uppercase;letter-spacing:.4px}
.cp-table td{padding:10px 14px;border-bottom:1px solid var(--cp-border);vertical-align:middle}
.cp-table tr:last-child td{border-bottom:none}
.cp-table tr:hover td{background:#f9f9f9}
.cp-table a{color:var(--cp-accent);text-decoration:none}
.cp-table a:hover{text-decoration:underline}
.cp-btn,.cp-btn-secondary{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:var(--cp-radius);font-size:13px;font-weight:500;cursor:pointer;text-decoration:none;border:1px solid transparent;transition:.15s;line-height:1.4}
.cp-btn{background:var(--cp-accent);color:var(--cp-white);border-color:var(--cp-accent)}
.cp-btn:hover{background:var(--cp-accent-hover);border-color:var(--cp-accent-hover)}
.cp-btn-secondary{background:var(--cp-white);color:var(--cp-text);border-color:var(--cp-border)}
.cp-btn-secondary:hover{background:var(--cp-bg);border-color:#8c8f94}
.cp-btn-danger{background:#d63638;color:var(--cp-white);border-color:#d63638}
.cp-btn-danger:hover{background:#b32d2e}
.cp-form-table{width:100%;border-collapse:collapse}
.cp-form-table tr{border-bottom:1px solid var(--cp-border)}
.cp-form-table tr:last-child{border-bottom:none}
.cp-form-table th{padding:14px 20px 14px 0;text-align:right;font-weight:600;width:200px;vertical-align:top;padding-top:18px;font-size:13px}
.cp-form-table td{padding:14px 0}
.cp-form-input,.cp-form-select,.cp-form-textarea{border:1px solid var(--cp-border);border-radius:var(--cp-radius);padding:7px 10px;font-size:14px;color:var(--cp-text);transition:.15s;width:100%;max-width:400px}
.cp-form-input:focus,.cp-form-select:focus,.cp-form-textarea:focus{border-color:var(--cp-accent);outline:2px solid rgba(34,113,177,.2)}
.cp-form-textarea{resize:vertical;min-height:80px}
.cp-description{color:var(--cp-muted);font-size:12.5px;margin:.4rem 0 0}
.cp-dash-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;margin-bottom:20px}
.cp-dash-stat{background:var(--cp-white);border:1px solid var(--cp-border);border-radius:var(--cp-radius);padding:20px;display:flex;align-items:center;gap:16px;box-shadow:var(--cp-shadow)}
.cp-dash-stat-icon{font-size:32px;flex-shrink:0}
.cp-dash-stat-num{font-size:28px;font-weight:700;color:var(--cp-text);line-height:1}
.cp-dash-stat-label{font-size:12px;color:var(--cp-muted);margin-top:4px}
.cp-badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px}
.cp-badge-publish{background:#edfaef;color:#00a32a}
.cp-badge-draft{background:#f0f0f1;color:var(--cp-muted)}
.cp-badge-pending{background:#fff8e5;color:#996800}
.cp-badge-private{background:#f0f4f8;color:var(--cp-accent)}
.cp-badge-trash{background:#fcf0f1;color:#d63638}
#cp-footer{text-align:center;padding:16px;color:var(--cp-muted);font-size:12px;border-top:1px solid var(--cp-border);margin-left:var(--cp-sidebar-w)}
#cp-footer a{color:var(--cp-accent);text-decoration:none}
@media(max-width:782px){
  #cp-menu-toggle{display:flex}
  #cp-sidebar{transform:translateX(-100%)}
  body.cp-sidebar-open #cp-sidebar{transform:none}
  #cp-main,#cp-footer{margin-left:0}
  .cp-form-table th{display:none}
  .cp-form-table td{display:block;padding:10px 0}
  .cp-form-input,.cp-form-select,.cp-form-textarea{max-width:100%}
  .cp-dash-grid{grid-template-columns:1fr}
}`;

const INSTALLER_CSS = `*,*::before,*::after{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f0f1;margin:0;padding:2rem 1rem;color:#1d2327}
.install-wrap{max-width:700px;margin:0 auto}
.install-header{text-align:center;margin-bottom:2rem}
.install-logo{font-size:2rem;font-weight:800;color:#1d2327;text-decoration:none}
.install-logo span{color:#F6821F}
.install-card{background:#fff;border-radius:8px;padding:2rem 2.5rem;box-shadow:0 2px 10px rgba(0,0,0,.08);margin-bottom:1.5rem}
h2{font-size:1.4rem;margin:0 0 .5rem;color:#1d2327}
.lead{color:#646970;margin:0 0 1.5rem}
.form-table{width:100%;border-collapse:collapse;margin-bottom:1.5rem}
.form-table tr{border-bottom:1px solid #dcdcde}
.form-table tr:last-child{border-bottom:none}
.form-table th{padding:14px 20px 14px 0;text-align:right;width:180px;font-size:13px;font-weight:600;vertical-align:top;padding-top:18px}
.form-table td{padding:12px 0}
.regular-text{width:100%;max-width:380px;padding:7px 10px;border:1px solid #8c8f94;border-radius:4px;font-size:14px;transition:.15s}
.regular-text:focus{border-color:#2271b1;outline:2px solid rgba(34,113,177,.2)}
.description{color:#646970;font-size:12.5px;margin:.4rem 0 0}
code{background:#f0f0f1;padding:2px 6px;border-radius:3px;font-size:12px}
.btn{display:inline-flex;align-items:center;padding:8px 18px;border-radius:4px;font-size:14px;font-weight:500;cursor:pointer;text-decoration:none;border:1px solid transparent;margin-right:8px;transition:.15s}
.btn-primary{background:#2271b1;color:#fff;border-color:#2271b1}
.btn-primary:hover{background:#135e96}
.btn-secondary{background:#fff;color:#1d2327;border-color:#dcdcde}
.btn-secondary:hover{background:#f0f0f1}
.submit{margin-top:1rem}
.notice-error{background:#fcf0f1;border-left:4px solid #d63638;padding:.8rem 1rem;border-radius:0 4px 4px 0;margin-bottom:1.2rem}
.notice-error ul{margin:0;padding:0 0 0 1rem;color:#d63638;font-size:13.5px}
.success-card{border-left:4px solid #00a32a}
.success-icon{font-size:3rem;color:#00a32a;text-align:center;margin-bottom:1rem}
/* Language selector */
.lang-select-wrap{text-align:center;margin-bottom:1.5rem}
.lang-select{padding:6px 12px;border:1px solid #8c8f94;border-radius:4px;font-size:14px;background:#fff}`;

const LOGIN_CSS = `*,*::before,*::after{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f0f0f1;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}
.login-wrap{width:100%;max-width:360px}
.login-logo{text-align:center;margin-bottom:24px}
.login-logo svg{width:64px;height:64px}
.login-logo h1{margin:8px 0 0;font-size:22px;font-weight:600;color:#1d2327}
.login-box{background:#fff;border-radius:8px;padding:28px 32px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
.login-box label{display:block;font-size:13px;font-weight:600;color:#1d2327;margin-bottom:6px}
.login-box input[type=text],.login-box input[type=password]{width:100%;padding:10px 14px;font-size:15px;border:1px solid #8c8f94;border-radius:4px;margin-bottom:16px;outline:none;transition:border-color .2s}
.login-box input:focus{border-color:#2271b1;box-shadow:0 0 0 1px #2271b1}
.login-remember{display:flex;align-items:center;gap:8px;font-size:13px;color:#3c434a;margin-bottom:18px}
.login-btn{width:100%;padding:10px;font-size:15px;font-weight:600;background:#2271b1;color:#fff;border:none;border-radius:4px;cursor:pointer;transition:background .2s}
.login-btn:hover{background:#135e96}
.login-error{background:#fff0f0;border-left:4px solid #d63638;padding:10px 14px;color:#d63638;font-size:13px;border-radius:4px;margin-bottom:16px}
.login-footer{text-align:center;margin-top:16px;font-size:12px;color:#646970}
.login-footer a{color:#2271b1;text-decoration:none}`;

const ACTIVATE_CSS = `*,*::before,*::after{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f1f1;margin:0;padding:2rem 1rem;color:#333}
#signup-content{max-width:600px;margin:2rem auto}
.cp-activate-container{background:#fff;border-radius:6px;padding:2rem 2.5rem;box-shadow:0 2px 8px rgba(0,0,0,.1)}
h2{font-size:1.4rem;margin:0 0 1.2rem;color:#1d2327}
label{font-weight:600;display:block;margin-bottom:.4rem}
input[type="text"]{width:100%;padding:.6rem .8rem;font-size:1rem;border:1px solid #8c8f94;border-radius:4px}
.cp-btn{background:#2271b1;color:#fff;border:none;padding:.6rem 1.4rem;font-size:1rem;border-radius:4px;cursor:pointer}
.cp-btn:hover{background:#135e96}
#signup-welcome{background:#f0f6fc;border-left:4px solid #2271b1;padding:1rem 1.4rem;border-radius:0 4px 4px 0;margin:1rem 0}
#signup-welcome p{margin:.4rem 0}
.h3{font-weight:700}
a{color:#2271b1}
.lead-in{line-height:1.7}`;

const SIGNUP_CSS = `*,*::before,*::after{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f1f1;margin:0;padding:2rem 1rem;color:#333}
.signup-wrapper{max-width:560px;margin:0 auto}
.signup-box{background:#fff;border-radius:8px;padding:2.5rem;box-shadow:0 2px 10px rgba(0,0,0,.08)}
h1{font-size:1.6rem;color:#1d2327;margin:0 0 .4rem}
.site-name{text-align:center;margin-bottom:1.5rem}
.site-name a{color:#1d2327;text-decoration:none;font-size:1.3rem;font-weight:700}
h2{font-size:1.2rem;margin:0 0 1.5rem;color:#1d2327}
label{display:block;font-weight:600;margin-bottom:.3rem;font-size:.9rem}
input[type="text"],input[type="email"]{width:100%;padding:.55rem .75rem;font-size:1rem;border:1px solid #8c8f94;border-radius:4px;margin-bottom:1rem}
input:focus{outline:2px solid #2271b1;border-color:#2271b1}
.cp-btn{background:#2271b1;color:#fff;border:none;padding:.65rem 1.5rem;font-size:1rem;border-radius:4px;cursor:pointer;width:100%;margin-top:.5rem}
.cp-btn:hover{background:#135e96}
.error-list{background:#fcf0f1;border-left:4px solid #d63638;border-radius:0 4px 4px 0;padding:.8rem 1rem;margin-bottom:1.2rem;list-style:none;padding-left:1rem}
.error-list li{color:#d63638;margin:.2rem 0;font-size:.9rem}
.hint{font-size:.8rem;color:#666;margin-top:-.7rem;margin-bottom:1rem}
.success{background:#edfaef;border-left:4px solid #00a32a;border-radius:0 4px 4px 0;padding:1rem 1.2rem}
.success h2{color:#00a32a}`;

const ERROR_CSS = `*,*::before,*::after{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f1f1;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.error-box{background:#fff;border-left:4px solid #e74c3c;border-radius:4px;padding:2rem 2.5rem;max-width:560px;box-shadow:0 2px 8px rgba(0,0,0,.1)}
h1{color:#e74c3c;font-size:1.3rem;margin:0 0 1rem}
p{color:#444;line-height:1.6}
code{background:#f8f8f8;padding:2px 6px;border-radius:3px;font-family:monospace;color:#c0392b}
a{color:#0073aa}`;

const COMMENTS_CSS = `*,*::before,*::after{box-sizing:border-box}
body{font-family:-apple-system,sans-serif;background:#f1f1f1;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{background:#fff;padding:2rem 2.5rem;border-radius:6px;border-left:4px solid #d63638;max-width:480px;box-shadow:0 2px 8px rgba(0,0,0,.1)}
h1{color:#d63638;font-size:1.2rem;margin:0 0 1rem}
a{color:#2271b1}`;

const TEMPLATE_FALLBACK_CSS = `body{font-family:system-ui,sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem}`;

// ---------------------------------------------------------------------------
// Image / Icon Asset Handler
// ---------------------------------------------------------------------------

function serveAdminAsset(path) {
  const file = path.replace('/cp-admin/images/', '');

  switch (file) {
    case 'favicon.ico':
    case 'favicon.svg': {
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
