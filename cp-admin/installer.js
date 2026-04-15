/**
 * CloudPress Installer
 * Replaces WordPress wp-admin/install.php + wp-admin/setup-config.php
 *
 * Handles first-run setup:
 *  1. /cp-admin/setup-config  -> DB/KV config (already done via Cloudflare dashboard)
 *  2. /cp-admin/install       -> Create tables (D1), create admin user, save config
 *
 * No MySQL. Uses D1 (SQLite) + KV.
 * No VIP/pricing. All features free. Admin assigns roles.
 *
 * @package CloudPress
 */

import { saveConfig } from '../cp-config.js';
import { hashPassword } from '../cp-includes/crypto.js';

const SCHEMA_VERSION = 1;

/**
 * Handle installer requests.
 *
 * @param {Request} request
 * @param {object}  env
 * @param {object}  ctx
 * @returns {Promise<Response>}
 */
export async function handleInstaller(request, env, ctx) {
  // Validate required bindings
  if (!env.CP_DB) return bindingError('CP_DB', 'D1 database');
  if (!env.CP_KV) return bindingError('CP_KV', 'KV namespace');

  const url    = new URL(request.url);
  const path   = url.pathname.replace(/\/+$/, '');
  const method = request.method.toUpperCase();

  // Check if already installed
  let isInstalled = false;
  try {
    const cfg = await env.CP_KV.get('cp:config', { type: 'json' });
    isInstalled = !!(cfg && cfg.installed);
  } catch (_) {}

  if (path === '/cp-admin/setup-config') {
    return handleSetupConfig(request, env, method, isInstalled);
  }

  if (path === '/cp-admin/install') {
    return handleInstall(request, env, method, isInstalled, url);
  }

  return new Response('Not found', { status: 404 });
}

// -- Step 1: Setup Config -------------------------------------------------

async function handleSetupConfig(request, env, method, isInstalled) {
  if (isInstalled) {
    return htmlResponse(renderAlreadyInstalled(), 200);
  }

  let errors = {};
  let values = {};

  if (method === 'POST') {
    const fd = await request.formData().catch(() => new FormData());
    values = {
      site_url:     (fd.get('site_url') || '').trim(),
      site_name:    (fd.get('site_name') || '').trim(),
      admin_email:  (fd.get('admin_email') || '').trim(),
      db_prefix:    (fd.get('db_prefix') || 'cp_').trim(),
      github_repo:  (fd.get('github_repo') || '').trim(),
    };

    // Validate
    if (!values.site_name) errors.site_name = 'Site name is required.';
    if (!values.admin_email || !values.admin_email.includes('@')) errors.admin_email = 'Valid email required.';
    if (!/^[a-zA-Z][a-zA-Z0-9_]*_$/.test(values.db_prefix)) {
      errors.db_prefix = 'Prefix must start with a letter, contain only letters/numbers/underscores, and end with _.';
    }

    if (Object.keys(errors).length === 0) {
      // Save partial config to KV (step 1)
      await env.CP_KV.put('cp:install_step1', JSON.stringify(values), { expirationTtl: 3600 });
      return redirect('/cp-admin/install');
    }
  }

  return htmlResponse(renderSetupForm(errors, values), 200);
}

// -- Step 2: Install ------------------------------------------------------

async function handleInstall(request, env, method, isInstalled, url) {
  if (isInstalled && !url.searchParams.has('force')) {
    return htmlResponse(renderAlreadyInstalled(), 200);
  }

  // Load step 1 config
  let step1 = {};
  try {
    step1 = await env.CP_KV.get('cp:install_step1', { type: 'json' }) || {};
  } catch (_) {}

  let errors = {};
  let values = {};

  if (method === 'POST') {
    const fd = await request.formData().catch(() => new FormData());
    values = {
      admin_user:      (fd.get('admin_user') || '').trim(),
      admin_password:  (fd.get('admin_password') || '').trim(),
      admin_password2: (fd.get('admin_password2') || '').trim(),
    };

    if (!values.admin_user || !/^[a-zA-Z0-9_.-]+$/.test(values.admin_user)) {
      errors.admin_user = 'Username must contain only letters, numbers, underscores, hyphens, or dots.';
    }
    if (!values.admin_password || values.admin_password.length < 8) {
      errors.admin_password = 'Password must be at least 8 characters.';
    }
    if (values.admin_password !== values.admin_password2) {
      errors.admin_password2 = 'Passwords do not match.';
    }

    if (Object.keys(errors).length === 0) {
      // Run install
      const result = await runInstall(env, step1, values);
      if (result.success) {
        await env.CP_KV.delete('cp:install_step1');
        return htmlResponse(renderInstallSuccess(result), 200);
      } else {
        errors.install = result.message;
      }
    }
  }

  return htmlResponse(renderInstallForm(errors, values, step1), 200);
}

// -- Core Install Logic ----------------------------------------------------

async function runInstall(env, step1, adminInfo) {
  const prefix   = step1.db_prefix || 'cp_';
  const siteUrl  = step1.site_url || '';
  const siteName = step1.site_name || 'CloudPress Site';

  try {
    // Create D1 schema
    await createSchema(env.CP_DB, prefix);

    // Hash admin password
    const passwordHash = await hashPassword(adminInfo.admin_password);

    // Insert admin user
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    await env.CP_DB.prepare(`
      INSERT INTO ${prefix}users
        (user_login, user_pass, user_email, user_registered, display_name, user_status)
      VALUES (?, ?, ?, ?, ?, 0)
    `).bind(
      adminInfo.admin_user,
      passwordHash,
      step1.admin_email || '',
      now,
      adminInfo.admin_user,
    ).run();

    // Get new user ID
    const userRow = await env.CP_DB.prepare(
      `SELECT ID FROM ${prefix}users WHERE user_login = ? LIMIT 1`
    ).bind(adminInfo.admin_user).first();
    const userId = userRow?.ID || 1;

    // Set user role (administrator)
    await env.CP_DB.prepare(`
      INSERT INTO ${prefix}usermeta (user_id, meta_key, meta_value)
      VALUES (?, ?, ?)
    `).bind(userId, `${prefix}capabilities`, JSON.stringify({ administrator: true })).run();

    // Insert default options
    const defaultOptions = [
      ['siteurl',              siteUrl || 'http://localhost'],
      ['blogname',             siteName],
      ['blogdescription',      'Just another CloudPress site'],
      ['admin_email',          step1.admin_email || ''],
      ['blogcharset',          'UTF-8'],
      ['date_format',          'F j, Y'],
      ['time_format',          'g:i a'],
      ['posts_per_page',       '10'],
      ['default_comment_status', 'open'],
      ['default_ping_status',    'open'],
      ['permalink_structure',  '/%year%/%monthnum%/%postname%/'],
      ['cp_schema_version',    String(SCHEMA_VERSION)],
      ['cp_user_roles',        JSON.stringify({
        administrator: { name: 'Administrator', capabilities: { administrator: true } },
        editor:        { name: 'Editor',        capabilities: { edit_posts: true, publish_posts: true } },
        author:        { name: 'Author',        capabilities: { edit_posts: true, upload_files: true } },
        contributor:   { name: 'Contributor',   capabilities: { edit_posts: true } },
        subscriber:    { name: 'Subscriber',    capabilities: { read: true } },
      })],
      ['active_plugins',       '[]'],
      ['template',             'default'],
      ['stylesheet',           'default'],
      ['cp_github_repo',       step1.github_repo || ''],
    ];

    for (const [key, value] of defaultOptions) {
      await env.CP_DB.prepare(`
        INSERT OR IGNORE INTO ${prefix}options (option_name, option_value, autoload)
        VALUES (?, ?, 'yes')
      `).bind(key, value).run();
    }

    // Insert default categories
    await env.CP_DB.prepare(`
      INSERT INTO ${prefix}terms (name, slug, term_group)
      VALUES ('Uncategorized', 'uncategorized', 0)
    `).run();
    const termRow = await env.CP_DB.prepare(
      `SELECT term_id FROM ${prefix}terms WHERE slug = 'uncategorized' LIMIT 1`
    ).first();
    const termId = termRow?.term_id || 1;
    await env.CP_DB.prepare(`
      INSERT INTO ${prefix}term_taxonomy (term_id, taxonomy, description, parent, count)
      VALUES (?, 'category', '', 0, 1)
    `).bind(termId).run();

    // Insert hello world post
    await env.CP_DB.prepare(`
      INSERT INTO ${prefix}posts
        (post_author, post_date, post_content, post_title, post_status, post_type,
         post_name, comment_status, ping_status, post_modified)
      VALUES (?, ?, ?, 'Hello world!', 'publish', 'post',
              'hello-world', 'open', 'open', ?)
    `).bind(userId, now,
      '<p>Welcome to CloudPress. This is your first post. Edit or delete it, then start writing!</p>',
      now
    ).run();

    // Save full config to KV
    await saveConfig(env, {
      SITE_URL:    siteUrl,
      SITE_NAME:   siteName,
      ADMIN_EMAIL: step1.admin_email || '',
      DB_PREFIX:   prefix,
      GITHUB_REPO: step1.github_repo || '',
      installed:   true,
    });

    return { success: true, admin_user: adminInfo.admin_user };
  } catch (err) {
    console.error('[CloudPress Install]', err);
    return { success: false, message: `Install failed: ${err.message}` };
  }
}

// -- D1 Schema --------------------------------------------------------------

async function createSchema(db, prefix) {
  const tables = [
    `CREATE TABLE IF NOT EXISTS ${prefix}posts (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      post_author INTEGER NOT NULL DEFAULT 0,
      post_date TEXT NOT NULL DEFAULT '',
      post_date_gmt TEXT NOT NULL DEFAULT '',
      post_content TEXT NOT NULL DEFAULT '',
      post_title TEXT NOT NULL DEFAULT '',
      post_excerpt TEXT NOT NULL DEFAULT '',
      post_status TEXT NOT NULL DEFAULT 'publish',
      comment_status TEXT NOT NULL DEFAULT 'open',
      ping_status TEXT NOT NULL DEFAULT 'open',
      post_password TEXT NOT NULL DEFAULT '',
      post_name TEXT NOT NULL DEFAULT '',
      to_ping TEXT NOT NULL DEFAULT '',
      pinged TEXT NOT NULL DEFAULT '',
      post_modified TEXT NOT NULL DEFAULT '',
      post_modified_gmt TEXT NOT NULL DEFAULT '',
      post_content_filtered TEXT NOT NULL DEFAULT '',
      post_parent INTEGER NOT NULL DEFAULT 0,
      guid TEXT NOT NULL DEFAULT '',
      menu_order INTEGER NOT NULL DEFAULT 0,
      post_type TEXT NOT NULL DEFAULT 'post',
      post_mime_type TEXT NOT NULL DEFAULT '',
      comment_count INTEGER NOT NULL DEFAULT 0
    )`,

    `CREATE TABLE IF NOT EXISTS ${prefix}postmeta (
      meta_id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL DEFAULT 0,
      meta_key TEXT DEFAULT NULL,
      meta_value TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS ${prefix}users (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      user_login TEXT NOT NULL DEFAULT '',
      user_pass TEXT NOT NULL DEFAULT '',
      user_nicename TEXT NOT NULL DEFAULT '',
      user_email TEXT NOT NULL DEFAULT '',
      user_url TEXT NOT NULL DEFAULT '',
      user_registered TEXT NOT NULL DEFAULT '',
      user_activation_key TEXT NOT NULL DEFAULT '',
      user_status INTEGER NOT NULL DEFAULT 0,
      display_name TEXT NOT NULL DEFAULT ''
    )`,

    `CREATE TABLE IF NOT EXISTS ${prefix}usermeta (
      umeta_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 0,
      meta_key TEXT DEFAULT NULL,
      meta_value TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS ${prefix}options (
      option_id INTEGER PRIMARY KEY AUTOINCREMENT,
      option_name TEXT NOT NULL DEFAULT '',
      option_value TEXT NOT NULL DEFAULT '',
      autoload TEXT NOT NULL DEFAULT 'yes',
      UNIQUE(option_name)
    )`,

    `CREATE TABLE IF NOT EXISTS ${prefix}terms (
      term_id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      slug TEXT NOT NULL DEFAULT '',
      term_group INTEGER NOT NULL DEFAULT 0
    )`,

    `CREATE TABLE IF NOT EXISTS ${prefix}term_taxonomy (
      term_taxonomy_id INTEGER PRIMARY KEY AUTOINCREMENT,
      term_id INTEGER NOT NULL DEFAULT 0,
      taxonomy TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      parent INTEGER NOT NULL DEFAULT 0,
      count INTEGER NOT NULL DEFAULT 0
    )`,

    `CREATE TABLE IF NOT EXISTS ${prefix}term_relationships (
      object_id INTEGER NOT NULL DEFAULT 0,
      term_taxonomy_id INTEGER NOT NULL DEFAULT 0,
      term_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (object_id, term_taxonomy_id)
    )`,

    `CREATE TABLE IF NOT EXISTS ${prefix}comments (
      comment_ID INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_post_ID INTEGER NOT NULL DEFAULT 0,
      comment_author TEXT NOT NULL DEFAULT '',
      comment_author_email TEXT NOT NULL DEFAULT '',
      comment_author_url TEXT NOT NULL DEFAULT '',
      comment_author_IP TEXT NOT NULL DEFAULT '',
      comment_date TEXT NOT NULL DEFAULT '',
      comment_date_gmt TEXT NOT NULL DEFAULT '',
      comment_content TEXT NOT NULL DEFAULT '',
      comment_karma INTEGER NOT NULL DEFAULT 0,
      comment_approved TEXT NOT NULL DEFAULT '1',
      comment_agent TEXT NOT NULL DEFAULT '',
      comment_type TEXT NOT NULL DEFAULT 'comment',
      comment_parent INTEGER NOT NULL DEFAULT 0,
      user_id INTEGER NOT NULL DEFAULT 0
    )`,

    `CREATE TABLE IF NOT EXISTS ${prefix}commentmeta (
      meta_id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id INTEGER NOT NULL DEFAULT 0,
      meta_key TEXT DEFAULT NULL,
      meta_value TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS ${prefix}links (
      link_id INTEGER PRIMARY KEY AUTOINCREMENT,
      link_url TEXT NOT NULL DEFAULT '',
      link_name TEXT NOT NULL DEFAULT '',
      link_image TEXT NOT NULL DEFAULT '',
      link_target TEXT NOT NULL DEFAULT '',
      link_description TEXT NOT NULL DEFAULT '',
      link_visible TEXT NOT NULL DEFAULT 'Y',
      link_owner INTEGER NOT NULL DEFAULT 1,
      link_rating INTEGER NOT NULL DEFAULT 0,
      link_updated TEXT NOT NULL DEFAULT '',
      link_rel TEXT NOT NULL DEFAULT '',
      link_notes TEXT NOT NULL DEFAULT '',
      link_rss TEXT NOT NULL DEFAULT ''
    )`,

    `CREATE TABLE IF NOT EXISTS ${prefix}cron_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      schedule TEXT,
      hook TEXT NOT NULL,
      args TEXT NOT NULL DEFAULT '[]'
    )`,
  ];

  // D1 doesn't support multi-statement; execute one by one
  for (const sql of tables) {
    await db.prepare(sql).run();
  }

  // Indexes
  const indexes = [
    `CREATE INDEX IF NOT EXISTS ${prefix}posts_post_name ON ${prefix}posts(post_name)`,
    `CREATE INDEX IF NOT EXISTS ${prefix}posts_post_type_status ON ${prefix}posts(post_type, post_status)`,
    `CREATE INDEX IF NOT EXISTS ${prefix}postmeta_post_id ON ${prefix}postmeta(post_id)`,
    `CREATE INDEX IF NOT EXISTS ${prefix}postmeta_meta_key ON ${prefix}postmeta(meta_key)`,
    `CREATE INDEX IF NOT EXISTS ${prefix}users_user_login ON ${prefix}users(user_login)`,
    `CREATE INDEX IF NOT EXISTS ${prefix}users_user_email ON ${prefix}users(user_email)`,
    `CREATE INDEX IF NOT EXISTS ${prefix}usermeta_user_id ON ${prefix}usermeta(user_id)`,
    `CREATE INDEX IF NOT EXISTS ${prefix}comments_post_id ON ${prefix}comments(comment_post_ID)`,
    `CREATE INDEX IF NOT EXISTS ${prefix}term_relationships_tid ON ${prefix}term_relationships(term_taxonomy_id)`,
    `CREATE INDEX IF NOT EXISTS ${prefix}cron_events_ts ON ${prefix}cron_events(timestamp)`,
  ];

  for (const idx of indexes) {
    await db.prepare(idx).run().catch(() => {}); // ignore if already exists
  }
}

// -- HTML Renderers --------------------------------------------------------

function renderSetupForm(errors, values) {
  return layout('CloudPress Setup -- Step 1: Configuration', `
    <div class="install-card">
      <h2>Welcome to CloudPress</h2>
      <p class="lead">Let's configure your site before installing. This information is stored securely in Cloudflare KV.</p>
      ${renderErrors(errors)}
      <form method="post">
        <table class="form-table">
          <tr>
            <th><label for="site_url">Site URL</label></th>
            <td>
              <input type="url" id="site_url" name="site_url" class="regular-text"
                     value="${esc(values.site_url || '')}" placeholder="https://example.com">
              <p class="description">The full URL where CloudPress will live. Must match your Cloudflare Worker route.</p>
            </td>
          </tr>
          <tr>
            <th><label for="site_name">Site Title</label></th>
            <td>
              <input type="text" id="site_name" name="site_name" class="regular-text"
                     value="${esc(values.site_name || '')}" required>
            </td>
          </tr>
          <tr>
            <th><label for="admin_email">Admin Email</label></th>
            <td>
              <input type="email" id="admin_email" name="admin_email" class="regular-text"
                     value="${esc(values.admin_email || '')}" required>
            </td>
          </tr>
          <tr>
            <th><label for="db_prefix">Table Prefix</label></th>
            <td>
              <input type="text" id="db_prefix" name="db_prefix" class="regular-text"
                     value="${esc(values.db_prefix || 'cp_')}" pattern="[a-zA-Z][a-zA-Z0-9_]*_">
              <p class="description">D1 table prefix. Must end with underscore. Default: <code>cp_</code></p>
            </td>
          </tr>
          <tr>
            <th><label for="github_repo">GitHub CMS Repo</label></th>
            <td>
              <input type="text" id="github_repo" name="github_repo" class="regular-text"
                     value="${esc(values.github_repo || '')}" placeholder="owner/repo">
              <p class="description">Optional: GitHub repository for themes/plugins (e.g. <code>myorg/cloudpress-themes</code>). Set GitHub Token as a Cloudflare Worker secret (<code>CP_GITHUB_TOKEN</code>).</p>
            </td>
          </tr>
        </table>
        <p class="submit">
          <button type="submit" class="btn btn-primary">Continue to Installation &rarr;</button>
        </p>
      </form>
    </div>
  `);
}

function renderInstallForm(errors, values, step1) {
  return layout('CloudPress Setup -- Step 2: Create Admin User', `
    <div class="install-card">
      <h2>Create Your Administrator Account</h2>
      <p class="lead">Almost there! Set up your admin login credentials.</p>
      ${step1.site_name ? `<p>Site: <strong>${esc(step1.site_name)}</strong></p>` : ''}
      ${renderErrors(errors)}
      <form method="post">
        <table class="form-table">
          <tr>
            <th><label for="admin_user">Admin Username</label></th>
            <td>
              <input type="text" id="admin_user" name="admin_user" class="regular-text"
                     value="${esc(values.admin_user || 'admin')}" required autocomplete="username">
              <p class="description">Lowercase letters, numbers, hyphens, underscores, and dots only.</p>
            </td>
          </tr>
          <tr>
            <th><label for="admin_password">Password</label></th>
            <td>
              <input type="password" id="admin_password" name="admin_password" class="regular-text"
                     value="" required minlength="8" autocomplete="new-password">
              <p class="description">Minimum 8 characters. Use a strong password.</p>
            </td>
          </tr>
          <tr>
            <th><label for="admin_password2">Confirm Password</label></th>
            <td>
              <input type="password" id="admin_password2" name="admin_password2" class="regular-text"
                     value="" required minlength="8" autocomplete="new-password">
            </td>
          </tr>
        </table>
        <p class="submit">
          <button type="submit" class="btn btn-primary">Install CloudPress</button>
        </p>
      </form>
    </div>
  `);
}

function renderInstallSuccess(result) {
  return layout('CloudPress Installed!', `
    <div class="install-card success-card">
      <div class="success-icon">&#10003;</div>
      <h2>CloudPress has been installed successfully!</h2>
      <p>Your site is ready. Here are your login details -- <strong>save them now</strong>.</p>
      <table class="form-table">
        <tr>
          <th>Username</th>
          <td><code>${esc(result.admin_user)}</code></td>
        </tr>
        <tr>
          <th>Password</th>
          <td><em>The password you chose during installation.</em></td>
        </tr>
      </table>
      <p class="submit">
        <a href="/cp-login" class="btn btn-primary">Log In to CloudPress Admin</a>
        <a href="/" class="btn btn-secondary">Visit Site</a>
      </p>
    </div>
  `);
}

function renderAlreadyInstalled() {
  return layout('Already Installed', `
    <div class="install-card">
      <h2>CloudPress is already installed.</h2>
      <p>If you need to reinstall, add <code>?force=1</code> to the URL (this will reset your database).</p>
      <p>
        <a href="/cp-login" class="btn btn-primary">Log In</a>
        <a href="/" class="btn btn-secondary">Visit Site</a>
      </p>
    </div>
  `);
}

function renderErrors(errors) {
  const msgs = Object.values(errors);
  if (!msgs.length) return '';
  return `<div class="notice-error"><ul>${msgs.map(m => `<li>${esc(m)}</li>`).join('')}</ul></div>`;
}

function layout(title, content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)}</title>
  <link rel="stylesheet" href="/cp-admin/css/installer.css">
</head>
<body>
<div class="install-wrap">
  <div class="install-header">
    <a href="/" class="install-logo">Cloud<span>Press</span></a>
  </div>
  ${content}
</div>
</body>
</html>`;
}

// -- Helpers ----------------------------------------------------------------

function htmlResponse(html, status = 200) {
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function redirect(location) {
  return Response.redirect(location, 302);
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function bindingError(binding, name) {
  return new Response(
    `<!DOCTYPE html><html><body><h1>CloudPress Install Error</h1>` +
    `<p>Cloudflare binding <strong>${binding}</strong> (${name}) is not configured. ` +
    `Please add it in the Cloudflare Workers dashboard before installing.</p></body></html>`,
    { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
