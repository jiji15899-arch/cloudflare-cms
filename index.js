/**
 * CloudPress - Cloudflare Workers Entry Point
 * Replaces WordPress index.php + .htaccess
 *
 * Exports:
 *   fetch()     -> HTTP request handler (all web traffic)
 *   scheduled() -> Cloudflare Cron Trigger handler
 *   email()     -> Cloudflare Email Workers handler (optional)
 *
 * @package CloudPress
 */

import { route }              from './cp-router.js';
import { handleScheduled }    from './cp-cron.js';
import { handleEmailWorker }  from './cp-mail.js';

export default {
  /**
   * Handle all HTTP requests.
   * Equivalent to WordPress's front controller (index.php + mod_rewrite).
   */
  async fetch(request, env, ctx) {
    try {
      return await route(request, env, ctx);
    } catch (err) {
      // Top-level error handler
      const isDev = env.CP_DEBUG === 'true';
      const body  = isDev
        ? `<pre>${err.stack || err.message}</pre>`
        : '<p>An unexpected error occurred. Please try again later.</p>';

      return new Response(
        `<!DOCTYPE html><html><head><meta charset="UTF-8">` +
        `<title>CloudPress Error</title></head><body>` +
        `<h1>CloudPress Error</h1>${body}</body></html>`,
        { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }
  },

  /**
   * Handle Cloudflare Cron Triggers.
   * Replaces WordPress wp-cron.php (triggered by visits).
   *
   * Configure in wrangler.toml:
   *   [triggers]
   *   crons = ["*\/5 * * * *"]
   */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(event, env, ctx));
  },

  /**
   * Handle Cloudflare Email Workers.
   * Receives emails forwarded by Cloudflare Email Routing.
   * Replaces WordPress post-by-email (wp-mail.php + POP3).
   */
  async email(message, env, ctx) {
    ctx.waitUntil(handleEmailWorker(message, env, ctx));
  },
};
