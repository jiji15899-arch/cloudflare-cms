/**
 * CloudPress Mail API
 * Replaces WordPress's pluggable wp_mail() / PHPMailer
 *
 * Uses Cloudflare Workers Email (MailChannels) or a configured SMTP
 * relay via fetch(). No PHPMailer dependency -- pure fetch-based.
 *
 * Bindings expected in env (set in Cloudflare dashboard or wrangler.toml):
 *   CP_MAIL_FROM        - sender address  (default: noreply@<site-domain>)
 *   CP_MAIL_FROM_NAME   - sender name     (default: site name from options)
 *   CP_MAILCHANNELS     - '1' to use MailChannels API (default)
 *   CP_SMTP_HOST        - SMTP host for relay (optional)
 *   CP_SMTP_PORT        - SMTP port
 *   CP_SMTP_USER        - SMTP username (secret)
 *   CP_SMTP_PASS        - SMTP password (secret)
 *
 * @package CloudPress
 */

import { getOption } from './option.js';

// -- Public API ----------------------------------------------------------------

/**
 * Send an email.
 * Equivalent to wp_mail().
 *
 * @param {object} cp
 * @param {string|string[]} to          - recipient(s)
 * @param {string}          subject
 * @param {string}          message     - HTML or plain text
 * @param {object}          [headers]   - { 'Content-Type': '...', 'Cc': '...' }
 * @param {object[]}        [attachments] - not supported in Workers (ignored)
 * @returns {Promise<boolean>}
 */
export async function cpMail(cp, to, subject, message, headers = {}, attachments = []) {
  const siteName = await getOption(cp, 'blogname', cp.config?.SITE_NAME || 'CloudPress');
  const siteUrl  = await getOption(cp, 'siteurl',  cp.config?.SITE_URL  || cp.url?.origin || '');
  const domain   = siteUrl ? new URL(siteUrl).hostname : 'example.com';

  const fromAddress = cp.env?.CP_MAIL_FROM      || `noreply@${domain}`;
  const fromName    = cp.env?.CP_MAIL_FROM_NAME  || siteName;

  const toList = Array.isArray(to) ? to : [to];

  // Determine content type
  const contentType = headers['Content-Type'] || 'text/html; charset=UTF-8';
  const isHtml      = contentType.includes('text/html');

  // Apply cp_mail filter (hooks)
  const mailData = cp.hooks?.applyFilters?.('cp_mail', { to: toList, subject, message, headers }) || {
    to: toList, subject, message, headers,
  };

  try {
    return await sendViaMailChannels(cp, {
      from:        { email: fromAddress, name: fromName },
      to:          mailData.to.map(addr => ({ email: addr.trim() })),
      subject:     mailData.subject,
      content:     isHtml
        ? [{ type: 'text/html', value: mailData.message }]
        : [{ type: 'text/plain', value: mailData.message }],
      headers:     mailData.headers,
    });
  } catch (err) {
    if (cp.config?.CP_DEBUG) {
      console.error('[cpMail] send failed:', err);
    }
    return false;
  }
}

/**
 * Send a new-user notification email.
 * Equivalent to wp_new_user_notification().
 *
 * @param {object} cp
 * @param {number} userId
 * @param {string} [plainpassword]  - include to send password to user
 * @returns {Promise<void>}
 */
export async function newUserNotification(cp, userId, plainpassword = null) {
  const prefix   = cp.db_prefix || 'cp_';
  const user     = await cp.db.prepare(`SELECT * FROM ${prefix}users WHERE ID=? LIMIT 1`).bind(userId).first();
  if (!user) return;

  const siteName = await getOption(cp, 'blogname', cp.config?.SITE_NAME || 'CloudPress');
  const adminEmail = await getOption(cp, 'admin_email', cp.config?.ADMIN_EMAIL || '');
  const siteUrl  = await getOption(cp, 'siteurl', cp.config?.SITE_URL || '');

  // Notify admin
  if (adminEmail) {
    await cpMail(
      cp,
      adminEmail,
      `[${siteName}] New User Registration`,
      `New user registered:\n\nUsername: ${user.user_login}\nEmail: ${user.user_email}\n\n` +
      `Manage users: ${siteUrl}/cp-admin/users`
    );
  }

  // Notify new user
  if (user.user_email && plainpassword !== null) {
    await cpMail(
      cp,
      user.user_email,
      `Your account at ${siteName}`,
      `<p>Welcome to <strong>${siteName}</strong>!</p>` +
      `<p>Username: <strong>${user.user_login}</strong><br>` +
      `Password: <strong>${plainpassword}</strong></p>` +
      `<p><a href="${siteUrl}/cp-admin">Log in to your dashboard</a></p>`
    );
  }
}

/**
 * Send an activation email for multisite signups.
 * Called by cp-signup.js.
 *
 * @param {object} cp
 * @param {string} email
 * @param {string} activationKey
 * @returns {Promise<boolean>}
 */
export async function sendActivationEmail(cp, email, activationKey) {
  const siteName = await getOption(cp, 'blogname', cp.config?.SITE_NAME || 'CloudPress');
  const siteUrl  = await getOption(cp, 'siteurl', cp.config?.SITE_URL || cp.url?.origin || '');
  const activateUrl = `${siteUrl.replace(/\/$/, '')}/cp-activate?key=${encodeURIComponent(activationKey)}&email=${encodeURIComponent(email)}`;

  return cpMail(
    cp,
    email,
    `Activate your account at ${siteName}`,
    `<p>Thank you for registering at <strong>${siteName}</strong>.</p>` +
    `<p>Please click the link below to activate your account:</p>` +
    `<p><a href="${activateUrl}">${activateUrl}</a></p>` +
    `<p>If you did not register, you can ignore this email.</p>`
  );
}

/**
 * Send a password reset email.
 * Equivalent to wp_retrieve_password() mail step.
 *
 * @param {object} cp
 * @param {object} user
 * @param {string} resetKey
 * @returns {Promise<boolean>}
 */
export async function sendPasswordResetEmail(cp, user, resetKey) {
  const siteName = await getOption(cp, 'blogname', cp.config?.SITE_NAME || 'CloudPress');
  const siteUrl  = await getOption(cp, 'siteurl', cp.config?.SITE_URL || cp.url?.origin || '');
  const resetUrl = `${siteUrl.replace(/\/$/, '')}/cp-login?action=rp&key=${encodeURIComponent(resetKey)}&login=${encodeURIComponent(user.user_login)}`;

  return cpMail(
    cp,
    user.user_email,
    `Password Reset for ${siteName}`,
    `<p>Someone requested a password reset for the account: <strong>${user.user_login}</strong></p>` +
    `<p>If this was a mistake, just ignore this email and nothing will happen.</p>` +
    `<p>To reset your password, visit the following address:<br>` +
    `<a href="${resetUrl}">${resetUrl}</a></p>`
  );
}

// -- Transports ----------------------------------------------------------------

/**
 * Send via Cloudflare MailChannels Send API.
 * https://api.mailchannels.net/tx/v1/send
 *
 * @param {object} cp
 * @param {object} payload
 * @returns {Promise<boolean>}
 */
async function sendViaMailChannels(cp, payload) {
  const body = {
    personalizations: [
      {
        to: payload.to,
        ...(payload.cc?.length   ? { cc: payload.cc }   : {}),
        ...(payload.bcc?.length  ? { bcc: payload.bcc } : {}),
      },
    ],
    from:    payload.from,
    subject: payload.subject,
    content: payload.content,
  };

  const res = await fetch('https://api.mailchannels.net/tx/v1/send', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  // MailChannels returns 202 on success
  return res.status === 202 || res.status === 200;
}
