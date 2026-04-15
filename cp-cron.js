/**
 * CloudPress Cron / Scheduled Tasks
 * Replaces WordPress wp-cron.php
 *
 * On Cloudflare Workers, cron is handled via:
 *  1. Cloudflare Cron Triggers (scheduled() handler in index.js)
 *  2. This module also supports being triggered via a GET request
 *     (equivalent to visiting wp-cron.php directly).
 *
 * Cron event records are stored in D1.
 * A cron lock is stored in KV to prevent concurrent runs.
 *
 * @package CloudPress
 */

import { cpLoad } from './cp-load.js';

const CRON_LOCK_KEY = 'cp:doing_cron';
const CRON_LOCK_TTL = 60; // seconds

/**
 * Handle a cron HTTP request (equivalent to visiting wp-cron.php).
 * Called by the router when a request hits /cp-cron.
 *
 * @param {Request} request
 * @param {object}  env
 * @param {object}  ctx
 * @returns {Promise<Response>}
 */
export async function handleCronRequest(request, env, ctx) {
  // Reject POST or bodies
  if (request.method.toUpperCase() !== 'GET') {
    return new Response('', { status: 405 });
  }

  const cp = await cpLoad(request, env, ctx, { DOING_CRON: true });
  if (cp.__cpError) return cp.response;

  // Run cron in the background (non-blocking for the visitor)
  ctx.waitUntil(runCronJobs(cp));

  // Immediately respond -- cron runs in background
  return new Response('', {
    status: 200,
    headers: {
      'Expires': 'Wed, 11 Jan 1984 05:00:00 GMT',
      'Cache-Control': 'no-cache, must-revalidate, max-age=0',
    },
  });
}

/**
 * Cloudflare Cron Trigger handler.
 * Add this to your index.js `scheduled` export.
 *
 * Example wrangler.toml:
 *   [[triggers.crons]]
 *   cron = "* * * * *"   # every minute
 *
 * @param {ScheduledController} event
 * @param {object}              env
 * @param {object}              ctx
 */
export async function handleScheduled(event, env, ctx) {
  // Create a synthetic request so cpLoad works
  const request = new Request('https://internal/cp-cron', { method: 'GET' });
  const cp = await cpLoad(request, env, ctx, { DOING_CRON: true });
  if (cp.__cpError) {
    console.error('[CloudPress Cron] Bootstrap failed:', cp.response.status);
    return;
  }

  await runCronJobs(cp);
}

/**
 * Core cron execution logic.
 * Reads due events from D1, runs them, reschedules recurring ones.
 *
 * @param {object} cp - CloudPress context
 */
export async function runCronJobs(cp) {
  const { db, kv } = cp;
  const prefix     = cp.config.DB_PREFIX || 'cp_';
  const gmtNow     = Math.floor(Date.now() / 1000);

  // -- Acquire cron lock (KV-based) --------------------------------------------
  const existingLock = await kv.get(CRON_LOCK_KEY);
  if (existingLock) {
    // Another cron process is running
    return;
  }

  const lockToken = `${gmtNow}.${Math.random()}`;
  await kv.put(CRON_LOCK_KEY, lockToken, { expirationTtl: CRON_LOCK_TTL });

  // Verify we got the lock (simple optimistic check)
  const acquiredLock = await kv.get(CRON_LOCK_KEY);
  if (acquiredLock !== lockToken) return;

  try {
    // -- Fetch due cron events from D1 -----------------------------------------
    const { results: dueEvents } = await db.prepare(`
      SELECT * FROM ${prefix}cron_events
      WHERE timestamp <= ?
      ORDER BY timestamp ASC
    `).bind(gmtNow).all();

    if (!dueEvents || dueEvents.length === 0) {
      return;
    }

    for (const event of dueEvents) {
      // Check lock is still ours before each job
      const currentLock = await kv.get(CRON_LOCK_KEY);
      if (currentLock !== lockToken) {
        console.log('[CloudPress Cron] Lock stolen, stopping.');
        return;
      }

      let args = [];
      try {
        args = JSON.parse(event.args || '[]');
      } catch (_) {}

      // Reschedule recurring events BEFORE running (matches WordPress behavior)
      if (event.schedule) {
        const interval = getCronInterval(event.schedule);
        if (interval) {
          const nextTimestamp = Math.floor(Date.now() / 1000) + interval;
          await db.prepare(`
            UPDATE ${prefix}cron_events
            SET timestamp = ?
            WHERE id = ?
          `).bind(nextTimestamp, event.id).run();
        } else {
          // Unknown schedule -> delete
          await db.prepare(`DELETE FROM ${prefix}cron_events WHERE id = ?`)
            .bind(event.id).run();
        }
      } else {
        // Single event -> delete
        await db.prepare(`DELETE FROM ${prefix}cron_events WHERE id = ?`)
          .bind(event.id).run();
      }

      // Fire the hook
      try {
        cp.hooks.doAction(event.hook, ...args);
        cp.hooks.doAction('cp_cron_event_ran', event.hook, args);
      } catch (err) {
        console.error(`[CloudPress Cron] Hook '${event.hook}' failed:`, err);
        cp.hooks.doAction('cp_cron_event_error', event.hook, args, err);
      }
    }
  } finally {
    // Release lock
    const finalLock = await kv.get(CRON_LOCK_KEY);
    if (finalLock === lockToken) {
      await kv.delete(CRON_LOCK_KEY);
    }
  }
}

/**
 * Get interval in seconds for a named schedule.
 * Equivalent to wp_get_schedules().
 */
function getCronInterval(schedule) {
  const schedules = {
    'minutely':   60,
    'hourly':     3600,
    'twicedaily': 43200,
    'daily':      86400,
    'weekly':     604800,
  };
  return schedules[schedule] || null;
}

/**
 * Schedule a new cron event (equivalent to wp_schedule_event).
 *
 * @param {object} cp
 * @param {number} timestamp  - Unix timestamp for first run
 * @param {string} schedule   - 'hourly' | 'daily' | 'weekly' | null (single)
 * @param {string} hook       - Action hook name
 * @param {Array}  args       - Arguments to pass to the hook
 */
export async function cpScheduleEvent(cp, timestamp, schedule, hook, args = []) {
  const prefix = cp.config.DB_PREFIX || 'cp_';
  await cp.db.prepare(`
    INSERT INTO ${prefix}cron_events (timestamp, schedule, hook, args)
    VALUES (?, ?, ?, ?)
  `).bind(timestamp, schedule || null, hook, JSON.stringify(args)).run();
}

/**
 * Unschedule a cron event (equivalent to wp_unschedule_event).
 */
export async function cpUnscheduleEvent(cp, timestamp, hook, args = []) {
  const prefix = cp.config.DB_PREFIX || 'cp_';
  await cp.db.prepare(`
    DELETE FROM ${prefix}cron_events
    WHERE timestamp = ? AND hook = ? AND args = ?
  `).bind(timestamp, hook, JSON.stringify(args)).run();
}

/**
 * Clear all scheduled hooks for a given hook name.
 */
export async function cpClearScheduledHook(cp, hook) {
  const prefix = cp.config.DB_PREFIX || 'cp_';
  await cp.db.prepare(`DELETE FROM ${prefix}cron_events WHERE hook = ?`)
    .bind(hook).run();
}
