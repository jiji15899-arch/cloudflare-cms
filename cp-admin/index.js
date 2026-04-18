/**
 * CloudPress Admin Panel - Main Entry
 * Replaces WordPress wp-admin/index.php + wp-admin/admin.php
 *
 * Routes all /cp-admin/* requests to the appropriate admin handler.
 * Uses JWT-based auth (no PHP sessions / wp-login.php).
 * D1 for data, KV for cache/sessions.
 *
 * @package CloudPress
 */

import { cpLoad }           from '../cp-load.js';
import { requireAdmin }     from './auth-check.js';
import { renderAdminShell } from './admin-shell.js';
import { handleInstaller }  from './installer.js';

// -- Sub-page handlers ------------------------------------------------------
import { handleDashboard }         from './pages/dashboard.js';
import { handlePosts }             from './pages/posts.js';
import { handlePostEdit }          from './pages/post-edit.js';
import { handlePages }             from './pages/pages.js';
import { handleMediaPage }             from './pages/media.js';
import { handleComments }          from './pages/comments.js';
import { handleThemes }            from './pages/themes.js';
import { handlePlugins }           from './pages/plugins.js';
import { handleUsers }             from './pages/users.js';
import { handleUserEdit }          from './pages/user-edit.js';
import { handleProfile }           from './pages/profile.js';
import { handleOptions }           from './pages/options.js';
import { handleOptionsGeneral }    from './pages/options-general.js';
import { handleOptionsWriting }    from './pages/options-writing.js';
import { handleOptionsReading }    from './pages/options-reading.js';
import { handleOptionsDiscussion } from './pages/options-discussion.js';
import { handleOptionsMedia }      from './pages/options-media.js';
import { handleOptionsPermalink }  from './pages/options-permalink.js';
import { handleImport }            from './pages/import.js';
import { handleExport }            from './pages/export.js';
import { handleTools }             from './pages/tools.js';
import { handleUpgrade }           from './pages/upgrade.js';
import { handleAjax }              from './ajax.js';
import { handleGithubSync }        from './github-sync.js';

/**
 * Main admin request handler.
 *
 * @param {Request} request
 * @param {object}  env
 * @param {object}  ctx
 * @returns {Promise<Response>}
 */
export async function handleAdmin(request, env, ctx) {
  const url    = new URL(request.url);
  const path   = url.pathname.replace(/\/+$/, '') || '/cp-admin';
  const method = request.method.toUpperCase();

  // -- Installer routes (no auth required) ----------------------------------
  if (path === '/cp-admin/setup-config' || path === '/cp-admin/install') {
    return handleInstaller(request, env, ctx);
  }

  // -- AJAX (may handle its own auth internally) -----------------------------
  if (path === '/cp-admin/admin-ajax' || path === '/cp-admin/admin-ajax.js') {
    return handleAjax(request, env, ctx);
  }

  // -- GitHub Sync (REST-style endpoint, requires admin) ---------------------
  if (path === '/cp-admin/github-sync' || path.startsWith('/cp-admin/github-sync/')) {
    return handleGithubSync(request, env, ctx);
  }

  // -- Bootstrap -------------------------------------------------------------
  const cp = await cpLoad(request, env, ctx);
  if (cp.__cpError) return cp.response;

  // -- Auth check (redirect to /cp-login if not admin) ----------------------
  const authResult = await requireAdmin(cp);
  if (authResult) return authResult; // redirect response

  // -- Dispatch to sub-page handler -----------------------------------------
  return dispatchAdmin(request, env, ctx, cp, path, method, url);
}

/**
 * Route /cp-admin/* to the correct page handler.
 */
async function dispatchAdmin(request, env, ctx, cp, path, method, url) {
  // Dashboard (default)
  if (path === '/cp-admin' || path === '/cp-admin/index') {
    return handleDashboard(request, cp);
  }

  // Posts
  if (path === '/cp-admin/edit') {
    return handlePosts(request, cp);
  }
  if (path === '/cp-admin/post-new' || path === '/cp-admin/post') {
    return handlePostEdit(request, cp);
  }

  // Pages
  if (path === '/cp-admin/edit' && url.searchParams.get('post_type') === 'page') {
    return handlePages(request, cp);
  }
  if (path === '/cp-admin/page-new' || path === '/cp-admin/page') {
    return handlePostEdit(request, cp, { post_type: 'page' });
  }

  // Media
  if (path === '/cp-admin/upload' || path === '/cp-admin/media-new') {
    return handleMediaPage(request, cp);
  }

  // Comments
  if (path === '/cp-admin/edit-comments') {
    return handleComments(request, cp);
  }

  // Themes
  if (path === '/cp-admin/themes' || path === '/cp-admin/theme-install') {
    return handleThemes(request, cp);
  }

  // Plugins
  if (path === '/cp-admin/plugins' || path === '/cp-admin/plugin-install') {
    return handlePlugins(request, cp);
  }

  // Users
  if (path === '/cp-admin/users') {
    return handleUsers(request, cp);
  }
  if (path === '/cp-admin/user-new' || path === '/cp-admin/user-edit') {
    return handleUserEdit(request, cp);
  }
  if (path === '/cp-admin/profile') {
    return handleProfile(request, cp);
  }

  // Options / Settings
  if (path === '/cp-admin/options-general') {
    return handleOptionsGeneral(request, cp);
  }
  if (path === '/cp-admin/options-writing') {
    return handleOptionsWriting(request, cp);
  }
  if (path === '/cp-admin/options-reading') {
    return handleOptionsReading(request, cp);
  }
  if (path === '/cp-admin/options-discussion') {
    return handleOptionsDiscussion(request, cp);
  }
  if (path === '/cp-admin/options-media') {
    return handleOptionsMedia(request, cp);
  }
  if (path === '/cp-admin/options-permalink') {
    return handleOptionsPermalink(request, cp);
  }
  if (path === '/cp-admin/options') {
    return handleOptions(request, cp);
  }

  // Tools
  if (path === '/cp-admin/tools') {
    return handleTools(request, cp);
  }
  if (path === '/cp-admin/import') {
    return handleImport(request, cp);
  }
  if (path === '/cp-admin/export') {
    return handleExport(request, cp);
  }

  // Core upgrade
  if (path === '/cp-admin/update-core' || path === '/cp-admin/upgrade') {
    return handleUpgrade(request, cp);
  }

  // 404 within admin
  return new Response(
    await renderAdminShell(cp, '<h2>Page Not Found</h2><p>The requested admin page does not exist.</p>', { title: '404 Not Found' }),
    { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
