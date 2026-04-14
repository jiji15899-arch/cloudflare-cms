/**
 * CloudPress Admin Shell / Layout
 * Replaces WordPress wp-admin/admin-header.php + wp-admin/admin-footer.php
 *
 * Renders the full admin page HTML wrapper with sidebar nav,
 * top bar, and content area.
 *
 * @package CloudPress
 */

import { getOption } from '../cp-includes/option.js';

/**
 * Render a full admin page.
 *
 * @param {object} cp      - CloudPress context
 * @param {string} content - Inner HTML for the main content area
 * @param {object} opts    - { title, bodyClass, notices }
 * @returns {Promise<string>}
 */
export async function renderAdminShell(cp, content, opts = {}) {
  const { title = 'Dashboard', bodyClass = '', notices = [] } = opts;

  const siteName   = await getOption(cp, 'blogname').catch(() => cp.config.SITE_NAME || 'CloudPress');
  const siteUrl    = cp.config.SITE_URL || cp.url.origin;
  const user       = cp.currentUser;
  const userLogin  = user?.user_login || 'Admin';
  const currentPath = cp.url.pathname;

  const adminVersion = cp.version || '1.0.0';

  const navItems = buildNavItems(cp, currentPath);
  const navHtml  = renderNav(navItems, currentPath);

  const noticeHtml = notices.map(n =>
    `<div class="cp-notice cp-notice-${n.type || 'info'}" role="alert"><p>${escHtml(n.message)}</p></div>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="ko" class="cp-admin">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)} &lsaquo; CloudPress Admin</title>
  <meta name="robots" content="noindex,nofollow">
  <link rel="icon" href="/cp-admin/images/favicon.ico" type="image/x-icon">
  <style>${getAdminCSS()}</style>
</head>
<body class="cp-admin-body ${escHtml(bodyClass)}">

<!-- ── Top Bar ───────────────────────────────────────────────────────────── -->
<div id="cp-topbar">
  <div class="cp-topbar-left">
    <button id="cp-menu-toggle" aria-label="Toggle menu" onclick="document.body.classList.toggle('cp-sidebar-open')">
      <span></span><span></span><span></span>
    </button>
    <a href="${escHtml(siteUrl)}" class="cp-site-link" target="_blank" title="Visit site">
      &#127758; ${escHtml(siteName)}
    </a>
  </div>
  <div class="cp-topbar-right">
    <span class="cp-version">CloudPress ${escHtml(adminVersion)}</span>
    <div class="cp-user-menu">
      <button class="cp-user-btn" onclick="this.parentElement.classList.toggle('open')">
        ${escHtml(userLogin)} &#9660;
      </button>
      <div class="cp-user-dropdown">
        <a href="/cp-admin/profile">Profile</a>
        <a href="${escHtml(siteUrl)}" target="_blank">View Site</a>
        <hr>
        <a href="/cp-logout" class="cp-logout">Log Out</a>
      </div>
    </div>
  </div>
</div>

<!-- ── Layout ────────────────────────────────────────────────────────────── -->
<div id="cp-layout">

  <!-- Sidebar -->
  <nav id="cp-sidebar" aria-label="Admin navigation">
    <div class="cp-sidebar-header">
      <a href="/cp-admin" class="cp-logo">
        <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="32" height="32" rx="8" fill="#F6821F"/>
          <path d="M8 16C8 11.582 11.582 8 16 8C20.418 8 24 11.582 24 16C24 20.418 20.418 24 16 24C11.582 24 8 20.418 8 16Z" fill="white" fill-opacity="0.2"/>
          <path d="M13 12L19 16L13 20V12Z" fill="white"/>
        </svg>
        <span>CloudPress</span>
      </a>
    </div>
    ${navHtml}
  </nav>

  <!-- Main Content -->
  <main id="cp-main">
    <div class="cp-page-header">
      <h1 class="cp-page-title">${escHtml(title)}</h1>
    </div>
    ${noticeHtml}
    <div class="cp-content-wrap">
      ${content}
    </div>
  </main>

</div>

<!-- ── Admin Footer ────────────────────────────────────────────────────────── -->
<footer id="cp-footer">
  <span>CloudPress ${escHtml(adminVersion)} &mdash; Powered by <a href="https://cloudflare.com" target="_blank">Cloudflare</a></span>
</footer>

<script>${getAdminJS()}</script>
</body>
</html>`;
}

// ── Navigation Builder ─────────────────────────────────────────────────────

function buildNavItems(cp, currentPath) {
  return [
    {
      id: 'dashboard', label: 'Dashboard', icon: '&#9635;', href: '/cp-admin',
      exact: true,
    },
    {
      id: 'posts', label: 'Posts', icon: '&#128221;', href: '/cp-admin/edit',
      children: [
        { label: 'All Posts',   href: '/cp-admin/edit' },
        { label: 'Add New',     href: '/cp-admin/post-new' },
        { label: 'Categories',  href: '/cp-admin/edit-tags?taxonomy=category' },
        { label: 'Tags',        href: '/cp-admin/edit-tags?taxonomy=post_tag' },
      ],
    },
    {
      id: 'media', label: 'Media', icon: '&#128247;', href: '/cp-admin/upload',
      children: [
        { label: 'Library',   href: '/cp-admin/upload' },
        { label: 'Add New',   href: '/cp-admin/media-new' },
      ],
    },
    {
      id: 'pages', label: 'Pages', icon: '&#128196;', href: '/cp-admin/edit?post_type=page',
      children: [
        { label: 'All Pages', href: '/cp-admin/edit?post_type=page' },
        { label: 'Add New',   href: '/cp-admin/page-new' },
      ],
    },
    {
      id: 'comments', label: 'Comments', icon: '&#128172;', href: '/cp-admin/edit-comments',
    },
    {
      id: 'appearance', label: 'Appearance', icon: '&#127912;', href: '/cp-admin/themes',
      children: [
        { label: 'Themes',      href: '/cp-admin/themes' },
        { label: 'Theme Editor', href: '/cp-admin/theme-editor' },
      ],
    },
    {
      id: 'plugins', label: 'Plugins', icon: '&#129529;', href: '/cp-admin/plugins',
      children: [
        { label: 'Installed Plugins', href: '/cp-admin/plugins' },
        { label: 'Add New',           href: '/cp-admin/plugin-install' },
        { label: 'Plugin Editor',     href: '/cp-admin/plugin-editor' },
      ],
    },
    {
      id: 'users', label: 'Users', icon: '&#128101;', href: '/cp-admin/users',
      children: [
        { label: 'All Users', href: '/cp-admin/users' },
        { label: 'Add New',   href: '/cp-admin/user-new' },
        { label: 'Profile',   href: '/cp-admin/profile' },
      ],
    },
    {
      id: 'tools', label: 'Tools', icon: '&#128295;', href: '/cp-admin/tools',
      children: [
        { label: 'Available Tools', href: '/cp-admin/tools' },
        { label: 'Import',          href: '/cp-admin/import' },
        { label: 'Export',          href: '/cp-admin/export' },
        { label: 'GitHub Sync',     href: '/cp-admin/github-sync' },
      ],
    },
    {
      id: 'settings', label: 'Settings', icon: '&#9881;', href: '/cp-admin/options-general',
      children: [
        { label: 'General',    href: '/cp-admin/options-general' },
        { label: 'Writing',    href: '/cp-admin/options-writing' },
        { label: 'Reading',    href: '/cp-admin/options-reading' },
        { label: 'Discussion', href: '/cp-admin/options-discussion' },
        { label: 'Media',      href: '/cp-admin/options-media' },
        { label: 'Permalinks', href: '/cp-admin/options-permalink' },
        { label: 'GitHub',     href: '/cp-admin/options-general#github' },
      ],
    },
  ];
}

function renderNav(items, currentPath) {
  return `<ul class="cp-nav-list">
    ${items.map(item => {
      const isActive = item.exact
        ? currentPath === item.href
        : currentPath.startsWith(item.href.split('?')[0]);

      const hasChildren = item.children && item.children.length;

      return `<li class="cp-nav-item ${isActive ? 'active' : ''} ${hasChildren ? 'has-children' : ''}">
        <a href="${escHtml(item.href)}" class="cp-nav-link">
          <span class="cp-nav-icon">${item.icon}</span>
          <span class="cp-nav-label">${escHtml(item.label)}</span>
          ${hasChildren ? '<span class="cp-nav-arrow">&#9660;</span>' : ''}
        </a>
        ${hasChildren ? `
        <ul class="cp-subnav">
          ${item.children.map(child => `
            <li class="${currentPath === child.href.split('?')[0] ? 'active' : ''}">
              <a href="${escHtml(child.href)}">${escHtml(child.label)}</a>
            </li>
          `).join('')}
        </ul>` : ''}
      </li>`;
    }).join('')}
  </ul>`;
}

// ── Styles ─────────────────────────────────────────────────────────────────

function getAdminCSS() {
  return `
:root {
  --cp-sidebar-w: 240px;
  --cp-topbar-h: 48px;
  --cp-bg: #f0f0f1;
  --cp-sidebar-bg: #1d2327;
  --cp-sidebar-text: #a7aaad;
  --cp-sidebar-hover: #2c3338;
  --cp-sidebar-active: #2271b1;
  --cp-topbar-bg: #1d2327;
  --cp-topbar-text: #a7aaad;
  --cp-accent: #2271b1;
  --cp-accent-hover: #135e96;
  --cp-white: #fff;
  --cp-border: #dcdcde;
  --cp-text: #1d2327;
  --cp-muted: #646970;
  --cp-radius: 4px;
  --cp-shadow: 0 1px 3px rgba(0,0,0,.12);
}
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;background:var(--cp-bg);color:var(--cp-text)}

/* Top Bar */
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
.cp-logout{color:#d63638 !important}

/* Layout */
#cp-layout{display:flex;min-height:100vh;padding-top:var(--cp-topbar-h)}

/* Sidebar */
#cp-sidebar{width:var(--cp-sidebar-w);background:var(--cp-sidebar-bg);flex-shrink:0;overflow-y:auto;position:fixed;top:var(--cp-topbar-h);left:0;bottom:0;z-index:500;transition:transform .2s}
.cp-sidebar-header{padding:16px 14px 8px;border-bottom:1px solid rgba(255,255,255,.07)}
.cp-logo{display:flex;align-items:center;gap:8px;color:var(--cp-white);text-decoration:none;font-weight:700;font-size:16px}
.cp-logo span{letter-spacing:-.3px}

/* Nav */
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

/* Main */
#cp-main{flex:1;margin-left:var(--cp-sidebar-w);padding:24px;min-height:calc(100vh - var(--cp-topbar-h))}
.cp-page-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
.cp-page-title{font-size:23px;font-weight:400;margin:0;color:var(--cp-text)}

/* Notices */
.cp-notice{border-left:4px solid var(--cp-accent);background:var(--cp-white);padding:10px 14px;border-radius:0 var(--cp-radius) var(--cp-radius) 0;margin-bottom:16px;box-shadow:var(--cp-shadow)}
.cp-notice-success{border-color:#00a32a}
.cp-notice-error{border-color:#d63638}
.cp-notice-warning{border-color:#dba617}
.cp-notice p{margin:0;font-size:13.5px}

/* Cards */
.cp-card{background:var(--cp-white);border:1px solid var(--cp-border);border-radius:var(--cp-radius);padding:20px;margin-bottom:20px;box-shadow:var(--cp-shadow)}
.cp-card h2,.cp-card h3{margin:0 0 14px;font-size:15px;color:var(--cp-text)}

/* Tables */
.cp-table-wrap{background:var(--cp-white);border:1px solid var(--cp-border);border-radius:var(--cp-radius);overflow:hidden;margin-bottom:20px;box-shadow:var(--cp-shadow)}
.cp-table{width:100%;border-collapse:collapse;font-size:13px}
.cp-table th{background:var(--cp-bg);padding:10px 14px;text-align:left;font-weight:600;border-bottom:1px solid var(--cp-border);color:var(--cp-muted);font-size:12px;text-transform:uppercase;letter-spacing:.4px}
.cp-table td{padding:10px 14px;border-bottom:1px solid var(--cp-border);vertical-align:middle}
.cp-table tr:last-child td{border-bottom:none}
.cp-table tr:hover td{background:#f9f9f9}
.cp-table a{color:var(--cp-accent);text-decoration:none}
.cp-table a:hover{text-decoration:underline}

/* Buttons */
.cp-btn,.cp-btn-secondary{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:var(--cp-radius);font-size:13px;font-weight:500;cursor:pointer;text-decoration:none;border:1px solid transparent;transition:.15s;line-height:1.4}
.cp-btn{background:var(--cp-accent);color:var(--cp-white);border-color:var(--cp-accent)}
.cp-btn:hover{background:var(--cp-accent-hover);border-color:var(--cp-accent-hover)}
.cp-btn-secondary{background:var(--cp-white);color:var(--cp-text);border-color:var(--cp-border)}
.cp-btn-secondary:hover{background:var(--cp-bg);border-color:#8c8f94}
.cp-btn-danger{background:#d63638;color:var(--cp-white);border-color:#d63638}
.cp-btn-danger:hover{background:#b32d2e}

/* Forms */
.cp-form-table{width:100%;border-collapse:collapse}
.cp-form-table tr{border-bottom:1px solid var(--cp-border)}
.cp-form-table tr:last-child{border-bottom:none}
.cp-form-table th{padding:14px 20px 14px 0;text-align:right;font-weight:600;width:200px;vertical-align:top;padding-top:18px;font-size:13px}
.cp-form-table td{padding:14px 0}
.cp-form-input,.cp-form-select,.cp-form-textarea{border:1px solid var(--cp-border);border-radius:var(--cp-radius);padding:7px 10px;font-size:14px;color:var(--cp-text);transition:.15s;width:100%;max-width:400px}
.cp-form-input:focus,.cp-form-select:focus,.cp-form-textarea:focus{border-color:var(--cp-accent);outline:2px solid rgba(34,113,177,.2)}
.cp-form-textarea{resize:vertical;min-height:80px}
.cp-description{color:var(--cp-muted);font-size:12.5px;margin:.4rem 0 0}

/* Dashboard widgets */
.cp-dash-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;margin-bottom:20px}
.cp-dash-stat{background:var(--cp-white);border:1px solid var(--cp-border);border-radius:var(--cp-radius);padding:20px;display:flex;align-items:center;gap:16px;box-shadow:var(--cp-shadow)}
.cp-dash-stat-icon{font-size:32px;flex-shrink:0}
.cp-dash-stat-num{font-size:28px;font-weight:700;color:var(--cp-text);line-height:1}
.cp-dash-stat-label{font-size:12px;color:var(--cp-muted);margin-top:4px}

/* Status badges */
.cp-badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px}
.cp-badge-publish{background:#edfaef;color:#00a32a}
.cp-badge-draft{background:#f0f0f1;color:var(--cp-muted)}
.cp-badge-pending{background:#fff8e5;color:#996800}
.cp-badge-private{background:#f0f4f8;color:var(--cp-accent)}
.cp-badge-trash{background:#fcf0f1;color:#d63638}

/* Footer */
#cp-footer{text-align:center;padding:16px;color:var(--cp-muted);font-size:12px;border-top:1px solid var(--cp-border);margin-left:var(--cp-sidebar-w)}
#cp-footer a{color:var(--cp-accent);text-decoration:none}

/* Responsive */
@media(max-width:782px){
  #cp-menu-toggle{display:flex}
  #cp-sidebar{transform:translateX(-100%)}
  body.cp-sidebar-open #cp-sidebar{transform:none}
  #cp-main,#cp-footer{margin-left:0}
  .cp-form-table th{display:none}
  .cp-form-table td{display:block;padding:10px 0}
  .cp-form-input,.cp-form-select,.cp-form-textarea{max-width:100%}
  .cp-dash-grid{grid-template-columns:1fr}
}
`;
}

// ── Inline Admin JS ────────────────────────────────────────────────────────

function getAdminJS() {
  return `
// Close dropdowns on outside click
document.addEventListener('click', function(e) {
  if (!e.target.closest('.cp-user-menu')) {
    document.querySelectorAll('.cp-user-menu.open').forEach(m => m.classList.remove('open'));
  }
});

// Nav submenu toggle (click-based for accessibility)
document.querySelectorAll('.cp-nav-item.has-children > .cp-nav-link').forEach(link => {
  link.addEventListener('click', function(e) {
    if (window.innerWidth < 1200) {
      e.preventDefault();
      this.parentElement.classList.toggle('active');
    }
  });
});

// AJAX form submit helper (used by sub-pages)
window.cpAjax = async function(action, data) {
  const fd = new FormData();
  fd.append('action', action);
  Object.entries(data || {}).forEach(([k,v]) => fd.append(k, v));
  const r = await fetch('/cp-admin/admin-ajax', { method: 'POST', body: fd });
  return r.json();
};

// Confirm delete
document.querySelectorAll('[data-confirm]').forEach(el => {
  el.addEventListener('click', function(e) {
    if (!confirm(this.dataset.confirm || 'Are you sure?')) e.preventDefault();
  });
});
`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
