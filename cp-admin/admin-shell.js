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
import { escHtml }   from '../cp-includes/formatting.js';

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
  <link rel="stylesheet" href="/cp-admin/css/admin.css">
</head>
<body class="cp-admin-body ${escHtml(bodyClass)}">

<!-- -- Top Bar ------------------------------------------------------------- -->
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

<!-- -- Layout -------------------------------------------------------------- -->
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

<!-- -- Admin Footer ---------------------------------------------------------- -->
<footer id="cp-footer">
  <span>CloudPress ${escHtml(adminVersion)} &mdash; Powered by <a href="https://cloudflare.com" target="_blank">Cloudflare</a></span>
</footer>

<script>${getAdminJS()}</script>
</body>
</html>`;
}

// -- Navigation Builder -----------------------------------------------------

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

// -- Styles -----------------------------------------------------------------


// -- Inline Admin JS --------------------------------------------------------

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
