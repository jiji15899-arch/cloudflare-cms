/**
 * CloudPress Admin - Upgrade / Update Core
 * Replaces WordPress wp-admin/update-core.php
 * @package CloudPress
 */

import { renderAdminShell } from '../admin-shell.js';
import { CP_VERSION } from '../../cp-config.js';

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export async function handleUpgrade(request, cp) {
  const method = request.method.toUpperCase();
  let notice   = null;
  let latestInfo = null;

  // Check for latest version via GitHub
  try {
    const githubRepo = cp.config?.GITHUB_REPO || await cp.db.prepare(
      `SELECT option_value FROM ${cp.db_prefix||'cp_'}options WHERE option_name='cp_github_repo' LIMIT 1`
    ).first().then(r => r?.option_value || '').catch(() => '');

    if (githubRepo) {
      const headers = { 'User-Agent': 'CloudPress/1.0' };
      if (cp.config?.GITHUB_TOKEN) headers['Authorization'] = `Bearer ${cp.config.GITHUB_TOKEN}`;
      const res = await fetch(`https://api.github.com/repos/${githubRepo}/releases/latest`, { headers });
      if (res.ok) {
        const data = await res.json();
        latestInfo = { version: data.tag_name?.replace(/^v/,'') || 'unknown', url: data.html_url, body: data.body || '' };
      }
    }
  } catch (_) {}

  if (method === 'POST') {
    const fd     = await request.formData().catch(() => new FormData());
    const action = fd.get('action') || '';

    if (action === 'flush_update_cache') {
      await cp.kv.delete('cp:update:check').catch(() => {});
      notice = { type: 'success', message: 'Update cache cleared.' };
    }
  }

  const currentVersion = CP_VERSION || cp.version || '1.0.0';
  const isUpToDate = !latestInfo || latestInfo.version === currentVersion;

  const content = `
<div class="cp-card" style="max-width:720px">
  <h1>CloudPress Updates</h1>

  <!-- Current version -->
  <div style="background:#f9f9f9;border:1px solid #e0e0e0;border-radius:8px;padding:20px;margin-bottom:24px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div>
        <div style="font-size:13px;color:#888;margin-bottom:4px">Current Version</div>
        <div style="font-size:22px;font-weight:700;color:#0073aa">CloudPress ${esc(currentVersion)}</div>
      </div>
      ${isUpToDate
        ? `<div style="background:#46b450;color:#fff;padding:8px 16px;border-radius:6px;font-weight:600">&#10003; Up to Date</div>`
        : `<div style="background:#d63638;color:#fff;padding:8px 16px;border-radius:6px;font-weight:600">&#9888; Update Available</div>`}
    </div>
  </div>

  ${latestInfo && !isUpToDate ? `
  <div style="border:2px solid #d63638;border-radius:8px;padding:20px;margin-bottom:24px">
    <h2 style="margin:0 0 8px;color:#d63638">New Version Available: ${esc(latestInfo.version)}</h2>
    <p style="color:#555;font-size:14px;margin:0 0 16px">CloudPress is deployed via Cloudflare Workers. To update, pull the latest code and re-deploy:</p>
    <pre style="background:#f5f5f5;padding:14px;border-radius:6px;overflow-x:auto;font-size:13px">git pull origin main
npx wrangler deploy</pre>
    ${latestInfo.url ? `<a href="${esc(latestInfo.url)}" target="_blank" class="cp-btn" style="margin-top:12px;display:inline-block">View Release Notes &#8599;</a>` : ''}
  </div>` : ''}

  ${isUpToDate ? `
  <div style="color:#46b450;font-size:15px;margin-bottom:20px">&#10003; You are running the latest version of CloudPress.</div>` : ''}

  <!-- How to update -->
  <div style="border:1px solid #ddd;border-radius:8px;padding:20px;margin-bottom:20px">
    <h3 style="margin:0 0 12px">How to Update CloudPress</h3>
    <ol style="color:#555;font-size:14px;line-height:1.8;margin:0;padding-left:20px">
      <li>Pull the latest code from your GitHub repository</li>
      <li>Run <code style="background:#f5f5f5;padding:1px 6px;border-radius:3px">npx wrangler deploy</code> to deploy to Cloudflare Workers</li>
      <li>Your site will update instantly with zero downtime</li>
    </ol>
    <pre style="background:#f5f5f5;padding:14px;border-radius:6px;overflow-x:auto;font-size:13px;margin-top:12px">cd your-cloudpress-folder
git pull origin main
npx wrangler deploy</pre>
  </div>

  <!-- Database migrations -->
  <div style="border:1px solid #ddd;border-radius:8px;padding:20px;margin-bottom:20px">
    <h3 style="margin:0 0 8px">Database Migrations</h3>
    <p style="color:#666;font-size:13px;margin:0 0 12px">If an update requires database schema changes, run:</p>
    <pre style="background:#f5f5f5;padding:14px;border-radius:6px;overflow-x:auto;font-size:13px">npx wrangler d1 migrations apply cloudpress-db</pre>
  </div>

  <!-- Actions -->
  <div style="display:flex;gap:10px;flex-wrap:wrap">
    <form method="post">
      <input type="hidden" name="action" value="flush_update_cache">
      <button type="submit" class="cp-btn cp-btn-secondary">Clear Update Cache</button>
    </form>
    <a href="/cp-admin" class="cp-btn cp-btn-secondary">Back to Dashboard</a>
  </div>
</div>`;

  return new Response(
    await renderAdminShell(cp, content, { title: 'Updates', notices: notice ? [notice] : [] }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
