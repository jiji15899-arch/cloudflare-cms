/**
 * CloudPress Admin AJAX
 * Replaces WordPress wp-admin/admin-ajax.php
 *
 * Handles all admin-ajax requests. Actions are dispatched to registered
 * handlers. Uses D1 + KV. JWT auth for privileged actions.
 *
 * @package CloudPress
 */

import { cpLoad }         from '../cp-load.js';
import { getAdminUser }   from './auth-check.js';

/** Registered AJAX action handlers (action -> { handler, nopriv }) */
const AJAX_ACTIONS = new Map();

/**
 * Register an AJAX action.
 *
 * @param {string}   action   - Action name (cp_action format)
 * @param {Function} handler  - async handler(cp, formData) -> object
 * @param {boolean}  nopriv   - Allow unauthenticated requests
 */
export function registerAjaxAction(action, handler, nopriv = false) {
  AJAX_ACTIONS.set(action, { handler, nopriv });
}

/**
 * Main AJAX entry point.
 *
 * @param {Request} request
 * @param {object}  env
 * @param {object}  ctx
 * @returns {Promise<Response>}
 */
export async function handleAjax(request, env, ctx) {
  // Only POST
  if (request.method.toUpperCase() !== 'POST') {
    return jsonResponse({ success: false, data: 'Method not allowed' }, 405);
  }

  // Parse form data
  let formData;
  try {
    formData = await request.formData();
  } catch (_) {
    return jsonResponse({ success: false, data: 'Invalid request body' }, 400);
  }

  const action = formData.get('action') || '';
  if (!action) {
    return jsonResponse({ success: false, data: 'No action specified' }, 400);
  }

  // Bootstrap
  const cp = await cpLoad(request, env, ctx);
  if (cp.__cpError) return jsonResponse({ success: false, data: 'Server error' }, 500);

  // Get user
  const user = await getAdminUser(cp);
  cp.currentUser = user;

  // Find handler
  const entry = AJAX_ACTIONS.get(action);

  if (!entry) {
    // Built-in actions fallback
    const builtinResult = await handleBuiltinAction(action, cp, formData, user);
    if (builtinResult !== null) return builtinResult;
    return jsonResponse({ success: false, data: `Unknown action: ${action}` }, 400);
  }

  // Auth check
  if (!entry.nopriv && !user) {
    return jsonResponse({ success: false, data: '-1' }, 401);
  }

  try {
    const result = await entry.handler(cp, formData);
    return jsonResponse({ success: true, data: result });
  } catch (err) {
    console.error('[CloudPress AJAX]', action, err);
    return jsonResponse({ success: false, data: err.message }, 500);
  }
}

// -- Built-in AJAX Actions -------------------------------------------------

async function handleBuiltinAction(action, cp, formData, user) {
  switch (action) {
    // Heartbeat (keep session alive)
    case 'heartbeat': {
      if (!user) return jsonResponse({ success: false, data: '-1' }, 401);
      return jsonResponse({ success: true, data: { nonce: await generateNonce(cp), time: Date.now() } });
    }

    // Save post (autosave)
    case 'autosave':
    case 'cp_autosave': {
      if (!user) return jsonResponse({ success: false, data: '-1' }, 401);
      const postId = parseInt(formData.get('post_id') || '0');
      const content = formData.get('post_content') || '';
      const title   = formData.get('post_title') || '';
      if (postId) {
        const prefix = cp.config.DB_PREFIX || 'cp_';
        await cp.db.prepare(
          `UPDATE ${prefix}posts SET post_title=?, post_content=?, post_modified=? WHERE ID=?`
        ).bind(title, content, new Date().toISOString().slice(0,19), postId).run();
      }
      return jsonResponse({ success: true, data: { saved: true, postId } });
    }

    // Delete post
    case 'delete_post':
    case 'cp_delete_post': {
      if (!user) return jsonResponse({ success: false, data: '-1' }, 401);
      const id = parseInt(formData.get('id') || '0');
      if (!id) return jsonResponse({ success: false, data: 'Invalid ID' }, 400);
      const prefix = cp.config.DB_PREFIX || 'cp_';
      await cp.db.prepare(`UPDATE ${prefix}posts SET post_status='trash' WHERE ID=?`).bind(id).run();
      return jsonResponse({ success: true, data: { deleted: true } });
    }

    // Quick save option
    case 'cp_save_option': {
      if (!user) return jsonResponse({ success: false, data: '-1' }, 401);
      const key = formData.get('key') || '';
      const val = formData.get('value') || '';
      if (!key) return jsonResponse({ success: false, data: 'No key' }, 400);
      const prefix = cp.config.DB_PREFIX || 'cp_';
      await cp.db.prepare(
        `INSERT INTO ${prefix}options (option_name, option_value, autoload)
         VALUES (?, ?, 'yes')
         ON CONFLICT(option_name) DO UPDATE SET option_value=excluded.option_value`
      ).bind(key, val).run();
      return jsonResponse({ success: true, data: { saved: true } });
    }

    // GitHub sync status
    case 'cp_github_status': {
      if (!user) return jsonResponse({ success: false, data: '-1' }, 401);
      const prefix = cp.config.DB_PREFIX || 'cp_';
      const repoRow = await cp.db.prepare(
        `SELECT option_value FROM ${prefix}options WHERE option_name='cp_github_repo' LIMIT 1`
      ).first();
      return jsonResponse({ success: true, data: { repo: repoRow?.option_value || '' } });
    }

    // Approve comment
    case 'approve-comment': {
      if (!user) return jsonResponse({ success: false, data: '-1' }, 401);
      const id = parseInt(formData.get('id') || '0');
      const prefix = cp.config.DB_PREFIX || 'cp_';
      await cp.db.prepare(
        `UPDATE ${prefix}comments SET comment_approved='1' WHERE comment_ID=?`
      ).bind(id).run();
      return jsonResponse({ success: true, data: { approved: true } });
    }

    // Trash comment
    case 'trash-comment': {
      if (!user) return jsonResponse({ success: false, data: '-1' }, 401);
      const id = parseInt(formData.get('id') || '0');
      const prefix = cp.config.DB_PREFIX || 'cp_';
      await cp.db.prepare(
        `UPDATE ${prefix}comments SET comment_approved='trash' WHERE comment_ID=?`
      ).bind(id).run();
      return jsonResponse({ success: true, data: { trashed: true } });
    }

    // Plugin toggle
    case 'cp_toggle_plugin': {
      if (!user) return jsonResponse({ success: false, data: '-1' }, 401);
      const plugin = formData.get('plugin') || '';
      const enable = formData.get('enable') === '1';
      if (!plugin) return jsonResponse({ success: false, data: 'No plugin specified' }, 400);
      const prefix = cp.config.DB_PREFIX || 'cp_';
      const row = await cp.db.prepare(
        `SELECT option_value FROM ${prefix}options WHERE option_name='active_plugins' LIMIT 1`
      ).first();
      let plugins = [];
      try { plugins = JSON.parse(row?.option_value || '[]'); } catch (_) {}
      if (enable && !plugins.includes(plugin)) plugins.push(plugin);
      if (!enable) plugins = plugins.filter(p => p !== plugin);
      await cp.db.prepare(
        `UPDATE ${prefix}options SET option_value=? WHERE option_name='active_plugins'`
      ).bind(JSON.stringify(plugins)).run();
      return jsonResponse({ success: true, data: { plugins } });
    }

    default:
      return null; // Not a built-in action
  }
}

async function generateNonce(cp) {
  const key = `${cp.currentUser?.ID || 'anon'}:${Math.floor(Date.now() / 86400000)}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(key + (cp.config.NONCE_KEY || 'nonce'));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 10);
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function handleGithubSync(request, env, ctx) {
  return handleAjax(request, env, ctx);
}
