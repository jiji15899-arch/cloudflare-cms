/**
 * CloudPress Admin - General Options
 * Replaces WordPress wp-admin/options-general.php
 *
 * Includes GitHub repository input field for CMS file sync.
 * All options stored in D1 cp_options table.
 * No pricing/plan restrictions - 100% free, admin assigns roles.
 *
 * @package CloudPress
 */

import { renderAdminShell } from '../admin-shell.js';
import { getOption, updateOption } from '../../cp-includes/option.js';

export async function handleOptionsGeneral(request, cp) {
  const prefix  = cp.config.DB_PREFIX || 'cp_';
  const method  = request.method.toUpperCase();
  let notices   = [];

  // Option keys to load/save
  const optionKeys = [
    'blogname', 'blogdescription', 'siteurl', 'admin_email',
    'blogcharset', 'date_format', 'time_format', 'timezone_string',
    'gmt_offset', 'start_of_week', 'default_role',
    'users_can_register', 'cp_github_repo',
  ];

  if (method === 'POST') {
    const fd = await request.formData().catch(() => new FormData());

    for (const key of optionKeys) {
      const val = fd.get(key);
      if (val !== null) {
        await updateOption(cp, key, val);
      }
    }

    // Also update KV config for GitHub repo
    const newRepo = fd.get('cp_github_repo') || '';
    try {
      const cfg = await cp.kv.get('cp:config', { type: 'json' }) || {};
      cfg.GITHUB_REPO = newRepo;
      await cp.kv.put('cp:config', JSON.stringify(cfg));
    } catch (_) {}

    notices.push({ type: 'success', message: 'Settings saved.' });
  }

  // Load all options
  const opts = {};
  for (const key of optionKeys) {
    opts[key] = await getOption(cp, key).catch(() => '');
  }

  const githubToken = cp.config.GITHUB_TOKEN || cp.env?.CP_GITHUB_TOKEN || '';

  const content = `
<form method="post">
  <div class="cp-card">
    <h2>Site Settings</h2>
    <table class="cp-form-table">
      <tr>
        <th><label for="blogname">Site Title</label></th>
        <td><input type="text" id="blogname" name="blogname" class="cp-form-input"
                   value="${esc(opts.blogname)}"></td>
      </tr>
      <tr>
        <th><label for="blogdescription">Tagline</label></th>
        <td>
          <input type="text" id="blogdescription" name="blogdescription" class="cp-form-input"
                 value="${esc(opts.blogdescription)}">
          <p class="cp-description">In a few words, explain what this site is about.</p>
        </td>
      </tr>
      <tr>
        <th><label for="siteurl">Site Address (URL)</label></th>
        <td>
          <input type="url" id="siteurl" name="siteurl" class="cp-form-input"
                 value="${esc(opts.siteurl)}">
          <p class="cp-description">Your Cloudflare Worker route URL.</p>
        </td>
      </tr>
      <tr>
        <th><label for="admin_email">Admin Email</label></th>
        <td>
          <input type="email" id="admin_email" name="admin_email" class="cp-form-input"
                 value="${esc(opts.admin_email)}">
        </td>
      </tr>
      <tr>
        <th><label for="users_can_register">Membership</label></th>
        <td>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" id="users_can_register" name="users_can_register" value="1"
                   ${opts.users_can_register === '1' ? 'checked' : ''}>
            Anyone can register
          </label>
        </td>
      </tr>
      <tr>
        <th><label for="default_role">New User Default Role</label></th>
        <td>
          <select id="default_role" name="default_role" class="cp-form-select">
            ${['subscriber','contributor','author','editor','administrator'].map(role =>
              `<option value="${role}" ${opts.default_role === role ? 'selected' : ''}>${capitalize(role)}</option>`
            ).join('')}
          </select>
          <p class="cp-description">Admin manually assigns roles. All accounts start with this default role.</p>
        </td>
      </tr>
    </table>
  </div>

  <div class="cp-card">
    <h2>Date &amp; Time</h2>
    <table class="cp-form-table">
      <tr>
        <th><label for="date_format">Date Format</label></th>
        <td>
          <input type="text" id="date_format" name="date_format" class="cp-form-input"
                 value="${esc(opts.date_format || 'F j, Y')}">
          <p class="cp-description">Example: <code>F j, Y</code> -> ${new Date().toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'})}</p>
        </td>
      </tr>
      <tr>
        <th><label for="time_format">Time Format</label></th>
        <td>
          <input type="text" id="time_format" name="time_format" class="cp-form-input"
                 value="${esc(opts.time_format || 'g:i a')}">
        </td>
      </tr>
      <tr>
        <th><label for="timezone_string">Timezone</label></th>
        <td>
          <select id="timezone_string" name="timezone_string" class="cp-form-select">
            ${getTimezones().map(tz =>
              `<option value="${esc(tz)}" ${opts.timezone_string === tz ? 'selected' : ''}>${esc(tz)}</option>`
            ).join('')}
          </select>
        </td>
      </tr>
      <tr>
        <th><label for="start_of_week">Week Starts On</label></th>
        <td>
          <select id="start_of_week" name="start_of_week" class="cp-form-select">
            ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d,i) =>
              `<option value="${i}" ${opts.start_of_week == i ? 'selected' : ''}>${d}</option>`
            ).join('')}
          </select>
        </td>
      </tr>
    </table>
  </div>

  <!-- GitHub Integration -->
  <div class="cp-card" id="github">
    <h2>&#127758; GitHub Integration</h2>
    <p style="color:#646970;font-size:13.5px;margin-bottom:16px">
      Connect a GitHub repository to install themes and plugins.
      Set your token as a Cloudflare Worker secret: <code>npx wrangler secret put CP_GITHUB_TOKEN</code>
    </p>
    <table class="cp-form-table">
      <tr>
        <th><label for="cp_github_repo">GitHub Repository</label></th>
        <td>
          <input type="text" id="cp_github_repo" name="cp_github_repo" class="cp-form-input"
                 value="${esc(opts.cp_github_repo || cp.config.GITHUB_REPO || '')}"
                 placeholder="owner/repo-name">
          <p class="cp-description">
            GitHub repo containing <code>themes/</code> and <code>plugins/</code> folders.
            Example: <code>myorg/cloudpress-themes</code><br>
            Full URL also works: <code>https://github.com/owner/repo</code>
          </p>
        </td>
      </tr>
      <tr>
        <th>GitHub Token</th>
        <td>
          <span class="cp-badge ${githubToken ? 'cp-badge-publish' : 'cp-badge-draft'}">
            ${githubToken ? '&#10003; Token configured as Worker secret' : '&#8855; Not configured'}
          </span>
          ${!githubToken ? `
          <p class="cp-description" style="margin-top:8px">
            <strong>To set token:</strong><br>
            <code>npx wrangler secret put CP_GITHUB_TOKEN</code><br>
            Generate at: <a href="https://github.com/settings/tokens" target="_blank">github.com/settings/tokens</a>
            (requires <code>repo</code> scope for private repos, or no scope for public)
          </p>
          ` : ''}
        </td>
      </tr>
      <tr>
        <th></th>
        <td>
          <a href="/cp-admin/github-sync" class="cp-btn cp-btn-secondary">Open GitHub Sync Manager &rarr;</a>
        </td>
      </tr>
    </table>
  </div>

  <p>
    <button type="submit" class="cp-btn">Save Changes</button>
  </p>
</form>
`;

  const html = await renderAdminShell(cp, content, { title: 'General Settings', notices });
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function getTimezones() {
  return [
    'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
    'Europe/Moscow', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Seoul',
    'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland',
  ];
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
