/**
 * CloudPress Post by Email
 * Replaces WordPress wp-mail.php
 *
 * Fetches emails from a POP3/IMAP mailbox and creates posts.
 * On Cloudflare Workers, this is triggered via a Cron Trigger
 * (not a direct HTTP request) for best reliability.
 *
 * Settings stored in D1 (site options).
 * Rate limiting via KV.
 *
 * @package CloudPress
 */

import { cpLoad } from './cp-load.js';
import { getOption } from './cp-includes/option.js';
import { insertPost } from './cp-includes/post.js';
import { getUserBy } from './cp-includes/user.js';
import { sanitizeEmail } from './cp-includes/sanitize.js';
import { setTransient, getTransient } from './cp-includes/transient.js';

const MAIL_INTERVAL = 5 * 60; // 5 minutes in seconds

/**
 * Handle post-by-email via HTTP request.
 * Should be secured -- only accessible from trusted IPs or via cron.
 *
 * @param {Request} request
 * @param {object}  env
 * @param {object}  ctx
 * @returns {Promise<Response>}
 */
export async function handleMail(request, env, ctx) {
  const cp = await cpLoad(request, env, ctx);
  if (cp.__cpError) return cp.response;

  // Check if post-by-email is enabled
  const enablePostByEmail = cp.hooks.applyFilters('enable_post_by_email_configuration', true);
  if (!enablePostByEmail) {
    return cpDie(cp, 'This action has been disabled by the administrator.', 403);
  }

  const mailserverUrl = await getOption(cp, 'mailserver_url');
  if (!mailserverUrl || mailserverUrl === 'mail.example.com') {
    return cpDie(cp, 'This action has been disabled by the administrator.', 403);
  }

  // Fire hook -- allow plugins to completely take over post-by-email
  // (equivalent to do_action('wp-mail.php'))
  cp.hooks.doAction('cp_mail');

  // Rate limit check via KV transient
  const lastChecked = await getTransient(cp, 'mailserver_last_checked');
  if (lastChecked) {
    const elapsed = Math.floor(Date.now() / 1000) - parseInt(lastChecked, 10);
    const remaining = MAIL_INTERVAL - elapsed;
    return cpDie(
      cp,
      `Email checks are rate limited to once every ${formatDuration(MAIL_INTERVAL)}. ` +
      `Next check available in ${formatDuration(Math.max(0, remaining))}.`,
      429
    );
  }

  await setTransient(cp, 'mailserver_last_checked', String(Math.floor(Date.now() / 1000)), MAIL_INTERVAL);

  // Fetch and process emails
  const output = [];
  try {
    const result = await processMailbox(cp, output);
    if (!result.success) {
      return cpDie(cp, result.message, 500);
    }
  } catch (err) {
    return cpDie(cp, `Mail processing error: ${escHtml(err.message)}`, 500);
  }

  return new Response(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>CloudPress Mail</title></head>` +
    `<body><h1>Mail Processing Results</h1>${output.join('\n')}</body></html>`,
    {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }
  );
}

/**
 * Process the mailbox and create posts.
 * On Cloudflare Workers, POP3/IMAP connections aren't directly possible
 * (no raw TCP sockets in standard Workers). This uses an Email Routing
 * webhook approach instead -- emails are forwarded to a Worker endpoint.
 *
 * For direct POP3, use a relay service or Cloudflare Email Workers.
 */
async function processMailbox(cp, output) {
  // Check for Cloudflare Email Workers approach
  // (emails arrive via the `email` handler in index.js)
  const pendingEmails = await cp.kv.list({ prefix: 'cp:pending_email:' });

  if (!pendingEmails.keys || pendingEmails.keys.length === 0) {
    output.push('<p>There does not seem to be any new mail.</p>');
    return { success: true };
  }

  const defaultCategory = await getOption(cp, 'default_email_category') || 1;
  const gmtOffset = parseFloat(await getOption(cp, 'gmt_offset') || '0');
  const phonDelim = '::';

  for (const { name: kvKey } of pendingEmails.keys) {
    let emailData;
    try {
      emailData = await cp.kv.get(kvKey, { type: 'json' });
      if (!emailData) continue;
    } catch (_) {
      continue;
    }

    // Extract post data from email
    const { from, subject: rawSubject, body, date } = emailData;

    // Parse author from email
    let postAuthor = 1;
    const authorEmail = sanitizeEmail(from || '');
    if (authorEmail) {
      const userdata = await getUserBy(cp, 'email', authorEmail);
      if (userdata) {
        postAuthor = userdata.ID;
      }
    }

    // Parse subject
    let subject = (rawSubject || '').split(phonDelim)[0].trim();

    // Parse content
    let content = (body || '').split(phonDelim)[1] || body || '';
    content = content.trim();

    // Apply filters
    content = cp.hooks.applyFilters('cp_mail_original_content', content);
    const postContent = cp.hooks.applyFilters('phone_content', content);

    const postTitle = subject || 'Untitled';
    const postStatus = postAuthor === 1 ? 'pending' : 'publish';

    const postDate = date ? new Date(date).toISOString().replace('T', ' ').slice(0, 19) : null;

    const postData = {
      post_content:   postContent,
      post_title:     postTitle,
      post_date:      postDate,
      post_author:    postAuthor,
      post_category:  [defaultCategory],
      post_status:    postStatus,
    };

    const postID = await insertPost(cp, postData);
    if (!postID) {
      output.push(`<p>Failed to insert post for email: ${escHtml(rawSubject)}</p>`);
      continue;
    }

    cp.hooks.doAction('publish_phone', postID);
    output.push(`<p><strong>Author:</strong> ${escHtml(String(postAuthor))}</p>`);
    output.push(`<p><strong>Posted title:</strong> ${escHtml(postTitle)}</p>`);

    // Delete processed email from KV
    await cp.kv.delete(kvKey);
  }

  return { success: true };
}

/**
 * Cloudflare Email Workers handler.
 * Add this to your index.js `email` export to receive forwarded emails.
 *
 * @param {EmailMessage} message - Cloudflare Email message
 * @param {object}       env
 * @param {object}       ctx
 */
export async function handleEmailWorker(message, env, ctx) {
  // Read email body
  const body = await new Response(message.raw).text();
  const emailKey = `cp:pending_email:${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await env.CP_KV.put(emailKey, JSON.stringify({
    from:    message.from,
    to:      message.to,
    subject: message.headers.get('subject') || '',
    body,
    date:    message.headers.get('date') || new Date().toISOString(),
  }), { expirationTtl: 86400 }); // Keep for 24h

  // Forward to admin if needed
  // await message.forward('admin@example.com');
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds} seconds`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
  return `${Math.floor(seconds / 3600)} hours`;
}

function cpDie(cp, message, status = 500) {
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>CloudPress Mail</title></head>
<body><p>${escHtml(message)}</p></body></html>`;
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
