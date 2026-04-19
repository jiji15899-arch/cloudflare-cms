/**
 * CloudPress Admin Shell / Layout
 *
 * [v3.0 수정]
 * - 이슈 1: 모든 네비게이션 레이블 한국어화
 * - 이슈 3: CSS 균형 수정 (사이드바/메인 간격, 카드 패딩, 폼 레이아웃)
 *
 * @package CloudPress
 */

import { getOption } from '../cp-includes/option.js';
import { escHtml }   from '../cp-includes/formatting.js';

export async function renderAdminShell(cp, content, opts = {}) {
  const { title = '대시보드', bodyClass = '', notices = [] } = opts;

  const siteName    = await getOption(cp, 'blogname').catch(() => cp.config.SITE_NAME || 'CloudPress');
  const siteUrl     = cp.config.SITE_URL || cp.url.origin;
  const user        = cp.currentUser;
  const userLogin   = user?.user_login || '관리자';
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
  <title>${escHtml(title)} &lsaquo; CloudPress 관리자</title>
  <meta name="robots" content="noindex,nofollow">
  <link rel="icon" href="/cp-admin/images/favicon.svg" type="image/svg+xml">
  <style>${ADMIN_CSS}</style>
</head>
<body class="cp-admin-body ${escHtml(bodyClass)}">

<!-- Top Bar -->
<div id="cp-topbar">
  <div class="cp-topbar-left">
    <button id="cp-menu-toggle" aria-label="메뉴 토글" onclick="document.body.classList.toggle('cp-sidebar-open')">
      <span></span><span></span><span></span>
    </button>
    <a href="${escHtml(siteUrl)}" class="cp-site-link" target="_blank" title="사이트 방문">
      &#127758; ${escHtml(siteName)}
    </a>
  </div>
  <div class="cp-topbar-right">
    <span class="cp-version">v${escHtml(adminVersion)}</span>
    <div class="cp-user-menu">
      <button class="cp-user-btn" onclick="this.parentElement.classList.toggle('open')">
        ${escHtml(userLogin)} &#9660;
      </button>
      <div class="cp-user-dropdown">
        <a href="/cp-admin/profile">프로필 편집</a>
        <a href="${escHtml(siteUrl)}" target="_blank">사이트 보기</a>
        <hr>
        <a href="/cp-logout" class="cp-logout">로그아웃</a>
      </div>
    </div>
  </div>
</div>

<!-- Layout -->
<div id="cp-layout">

  <!-- Sidebar -->
  <nav id="cp-sidebar" aria-label="관리자 메뉴">
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

<!-- Admin Footer -->
<footer id="cp-footer">
  <span>CloudPress ${escHtml(adminVersion)} &mdash; <a href="https://cloudflare.com" target="_blank">Cloudflare</a> 기반</span>
</footer>

<script>${getAdminJS()}</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Navigation Builder - 한국어
// ---------------------------------------------------------------------------

function buildNavItems(cp, currentPath) {
  return [
    {
      id: 'dashboard', label: '대시보드', icon: '&#9635;', href: '/cp-admin',
      exact: true,
    },
    {
      id: 'posts', label: '글', icon: '&#128221;', href: '/cp-admin/edit',
      children: [
        { label: '모든 글',   href: '/cp-admin/edit' },
        { label: '새 글 쓰기', href: '/cp-admin/post-new' },
        { label: '카테고리',  href: '/cp-admin/edit-tags?taxonomy=category' },
        { label: '태그',      href: '/cp-admin/edit-tags?taxonomy=post_tag' },
      ],
    },
    {
      id: 'media', label: '미디어', icon: '&#128247;', href: '/cp-admin/upload',
      children: [
        { label: '라이브러리', href: '/cp-admin/upload' },
        { label: '새 파일 추가', href: '/cp-admin/media-new' },
      ],
    },
    {
      id: 'pages', label: '페이지', icon: '&#128196;', href: '/cp-admin/edit?post_type=page',
      children: [
        { label: '모든 페이지', href: '/cp-admin/edit?post_type=page' },
        { label: '새 페이지',   href: '/cp-admin/page-new' },
      ],
    },
    {
      id: 'comments', label: '댓글', icon: '&#128172;', href: '/cp-admin/edit-comments',
    },
    {
      id: 'appearance', label: '외모', icon: '&#127912;', href: '/cp-admin/themes',
      children: [
        { label: '테마',        href: '/cp-admin/themes' },
        { label: '테마 편집기', href: '/cp-admin/theme-editor' },
      ],
    },
    {
      id: 'plugins', label: '플러그인', icon: '&#129529;', href: '/cp-admin/plugins',
      children: [
        { label: '설치된 플러그인', href: '/cp-admin/plugins' },
        { label: '새 플러그인 추가', href: '/cp-admin/plugin-install' },
        { label: '플러그인 편집기',  href: '/cp-admin/plugin-editor' },
      ],
    },
    {
      id: 'users', label: '사용자', icon: '&#128101;', href: '/cp-admin/users',
      children: [
        { label: '모든 사용자', href: '/cp-admin/users' },
        { label: '새 사용자',   href: '/cp-admin/user-new' },
        { label: '내 프로필',   href: '/cp-admin/profile' },
      ],
    },
    {
      id: 'tools', label: '도구', icon: '&#128295;', href: '/cp-admin/tools',
      children: [
        { label: '사용 가능한 도구', href: '/cp-admin/tools' },
        { label: '가져오기',         href: '/cp-admin/import' },
        { label: '내보내기',         href: '/cp-admin/export' },
      ],
    },
    {
      id: 'settings', label: '설정', icon: '&#9881;', href: '/cp-admin/options-general',
      children: [
        { label: '일반',       href: '/cp-admin/options-general' },
        { label: '쓰기',       href: '/cp-admin/options-writing' },
        { label: '읽기',       href: '/cp-admin/options-reading' },
        { label: '토론',       href: '/cp-admin/options-discussion' },
        { label: '미디어',     href: '/cp-admin/options-media' },
        { label: '고유주소',   href: '/cp-admin/options-permalink' },
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

// ---------------------------------------------------------------------------
// Inline Admin JS
// ---------------------------------------------------------------------------

function getAdminJS() {
  return `
document.addEventListener('click', function(e) {
  if (!e.target.closest('.cp-user-menu')) {
    document.querySelectorAll('.cp-user-menu.open').forEach(m => m.classList.remove('open'));
  }
});

document.querySelectorAll('.cp-nav-item.has-children > .cp-nav-link').forEach(link => {
  link.addEventListener('click', function(e) {
    if (window.innerWidth < 1200) {
      e.preventDefault();
      this.parentElement.classList.toggle('active');
    }
  });
});

window.cpAjax = async function(action, data) {
  const fd = new FormData();
  fd.append('action', action);
  Object.entries(data || {}).forEach(([k,v]) => fd.append(k, v));
  const r = await fetch('/cp-admin/admin-ajax', { method: 'POST', body: fd });
  return r.json();
};

document.querySelectorAll('[data-confirm]').forEach(el => {
  el.addEventListener('click', function(e) {
    if (!confirm(this.dataset.confirm || '정말 삭제하시겠습니까?')) e.preventDefault();
  });
});
`;
}

// ---------------------------------------------------------------------------
// Inline CSS - 이슈 3: 화면 균형 수정
// ---------------------------------------------------------------------------

const ADMIN_CSS = `
:root{
  --cp-sidebar-w:240px;
  --cp-topbar-h:46px;
  --cp-bg:#f0f0f1;
  --cp-sidebar-bg:#1d2327;
  --cp-sidebar-text:#a7aaad;
  --cp-sidebar-hover:#2c3338;
  --cp-sidebar-active:#2271b1;
  --cp-topbar-bg:#1d2327;
  --cp-topbar-text:#a7aaad;
  --cp-accent:#2271b1;
  --cp-accent-hover:#135e96;
  --cp-white:#fff;
  --cp-border:#dcdcde;
  --cp-text:#1d2327;
  --cp-muted:#646970;
  --cp-radius:4px;
  --cp-shadow:0 1px 3px rgba(0,0,0,.12);
}
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Noto Sans KR','Malgun Gothic','Segoe UI',Roboto,sans-serif;font-size:14px;background:var(--cp-bg);color:var(--cp-text)}

/* ── 상단바 ── */
#cp-topbar{position:fixed;top:0;left:0;right:0;height:var(--cp-topbar-h);background:var(--cp-topbar-bg);display:flex;align-items:center;justify-content:space-between;padding:0 16px;z-index:1000;color:var(--cp-topbar-text)}
.cp-topbar-left,.cp-topbar-right{display:flex;align-items:center;gap:12px}
#cp-menu-toggle{background:none;border:none;cursor:pointer;padding:6px;color:var(--cp-topbar-text);display:none;flex-direction:column;gap:4px}
#cp-menu-toggle span{display:block;width:20px;height:2px;background:currentColor;transition:.2s}
.cp-site-link{color:var(--cp-topbar-text);text-decoration:none;font-size:13px;opacity:.8;transition:.15s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px}
.cp-site-link:hover{opacity:1;color:var(--cp-white)}
.cp-version{font-size:11px;opacity:.45;white-space:nowrap}
.cp-user-menu{position:relative}
.cp-user-btn{background:none;border:none;color:var(--cp-topbar-text);cursor:pointer;font-size:13px;padding:6px 10px;border-radius:var(--cp-radius);transition:.15s;white-space:nowrap}
.cp-user-btn:hover{background:var(--cp-sidebar-hover);color:var(--cp-white)}
.cp-user-dropdown{display:none;position:absolute;right:0;top:calc(100% + 4px);background:var(--cp-white);border:1px solid var(--cp-border);border-radius:var(--cp-radius);min-width:150px;box-shadow:var(--cp-shadow);z-index:100}
.cp-user-menu.open .cp-user-dropdown{display:block}
.cp-user-dropdown a{display:block;padding:8px 14px;color:var(--cp-text);text-decoration:none;font-size:13px;transition:.1s}
.cp-user-dropdown a:hover{background:var(--cp-bg)}
.cp-user-dropdown hr{border:none;border-top:1px solid var(--cp-border);margin:4px 0}
.cp-logout{color:#d63638!important}

/* ── 레이아웃 ── */
#cp-layout{display:flex;min-height:100vh;padding-top:var(--cp-topbar-h)}

/* ── 사이드바 ── */
#cp-sidebar{width:var(--cp-sidebar-w);background:var(--cp-sidebar-bg);flex-shrink:0;overflow-y:auto;position:fixed;top:var(--cp-topbar-h);left:0;bottom:0;z-index:500;transition:transform .2s;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.1) transparent}
.cp-sidebar-header{padding:14px 14px 8px;border-bottom:1px solid rgba(255,255,255,.07)}
.cp-logo{display:flex;align-items:center;gap:8px;color:var(--cp-white);text-decoration:none;font-weight:700;font-size:15px}
.cp-logo span{letter-spacing:-.3px}

/* ── 내비게이션 ── */
.cp-nav-list{list-style:none;margin:6px 0;padding:0}
.cp-nav-item{margin:1px 0}
.cp-nav-link{display:flex;align-items:center;gap:10px;padding:8px 14px;color:var(--cp-sidebar-text);text-decoration:none;border-radius:var(--cp-radius);margin:0 6px;transition:.15s;font-size:13px;line-height:1.4}
.cp-nav-link:hover,.cp-nav-item.active>.cp-nav-link{color:var(--cp-white);background:var(--cp-sidebar-hover)}
.cp-nav-item.active>.cp-nav-link{background:var(--cp-sidebar-active)}
.cp-nav-icon{font-size:15px;flex-shrink:0;width:20px;text-align:center;opacity:.85}
.cp-nav-label{flex:1}
.cp-nav-arrow{font-size:9px;opacity:.45;transition:transform .2s}
.cp-nav-item.has-children.active .cp-nav-arrow{transform:rotate(180deg)}
.cp-subnav{list-style:none;margin:0;padding:0 0 4px 44px;display:none}
.cp-nav-item.has-children.active .cp-subnav{display:block}
.cp-subnav li a{display:block;padding:5px 10px;color:var(--cp-sidebar-text);text-decoration:none;font-size:12.5px;border-radius:var(--cp-radius);transition:.1s}
.cp-subnav li a:hover,.cp-subnav li.active a{color:var(--cp-white);background:rgba(255,255,255,.07)}

/* ── 메인 콘텐츠 ── */
#cp-main{flex:1;margin-left:var(--cp-sidebar-w);padding:20px 24px 24px;min-height:calc(100vh - var(--cp-topbar-h))}
.cp-page-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;gap:12px;flex-wrap:wrap}
.cp-page-title{font-size:22px;font-weight:400;margin:0;color:var(--cp-text);line-height:1.3}

/* ── 알림 ── */
.cp-notice{border-left:4px solid var(--cp-accent);background:var(--cp-white);padding:10px 14px;border-radius:0 var(--cp-radius) var(--cp-radius) 0;margin-bottom:14px;box-shadow:var(--cp-shadow)}
.cp-notice-success{border-color:#00a32a}
.cp-notice-error{border-color:#d63638}
.cp-notice-warning{border-color:#dba617}
.cp-notice p{margin:0;font-size:13.5px}

/* ── 카드 ── */
.cp-card{background:var(--cp-white);border:1px solid var(--cp-border);border-radius:var(--cp-radius);padding:20px;margin-bottom:18px;box-shadow:var(--cp-shadow)}
.cp-card h2,.cp-card h3{margin:0 0 14px;font-size:14px;color:var(--cp-text);font-weight:600}

/* ── 테이블 ── */
.cp-table-wrap{background:var(--cp-white);border:1px solid var(--cp-border);border-radius:var(--cp-radius);overflow:hidden;margin-bottom:18px;box-shadow:var(--cp-shadow)}
.cp-table{width:100%;border-collapse:collapse;font-size:13px}
.cp-table th{background:var(--cp-bg);padding:9px 14px;text-align:left;font-weight:600;border-bottom:1px solid var(--cp-border);color:var(--cp-muted);font-size:11.5px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap}
.cp-table td{padding:9px 14px;border-bottom:1px solid var(--cp-border);vertical-align:middle}
.cp-table tr:last-child td{border-bottom:none}
.cp-table tr:hover td{background:#f9f9f9}
.cp-table a{color:var(--cp-accent);text-decoration:none}
.cp-table a:hover{text-decoration:underline}

/* ── 버튼 ── */
.cp-btn,.cp-btn-secondary{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:var(--cp-radius);font-size:13px;font-weight:500;cursor:pointer;text-decoration:none;border:1px solid transparent;transition:.15s;line-height:1.4;white-space:nowrap}
.cp-btn{background:var(--cp-accent);color:var(--cp-white);border-color:var(--cp-accent)}
.cp-btn:hover{background:var(--cp-accent-hover);border-color:var(--cp-accent-hover);color:var(--cp-white);text-decoration:none}
.cp-btn-secondary{background:var(--cp-white);color:var(--cp-text);border-color:var(--cp-border)}
.cp-btn-secondary:hover{background:var(--cp-bg);border-color:#8c8f94;text-decoration:none}
.cp-btn-danger{background:#d63638;color:var(--cp-white);border-color:#d63638}
.cp-btn-danger:hover{background:#b32d2e}
.cp-btn-link{background:none;border:none;padding:0;cursor:pointer;color:var(--cp-accent);font-size:13px;text-decoration:none}
.cp-btn-link:hover{text-decoration:underline}

/* ── 폼 ── */
.cp-form-table{width:100%;border-collapse:collapse}
.cp-form-table tr{border-bottom:1px solid var(--cp-border)}
.cp-form-table tr:last-child{border-bottom:none}
.cp-form-table th{padding:14px 20px 14px 0;text-align:right;font-weight:600;width:180px;vertical-align:top;padding-top:16px;font-size:13px;color:var(--cp-text)}
.cp-form-table td{padding:12px 0}
.cp-form-input,.cp-form-select,.cp-form-textarea{border:1px solid var(--cp-border);border-radius:var(--cp-radius);padding:7px 10px;font-size:13.5px;color:var(--cp-text);transition:.15s;width:100%;max-width:400px;font-family:inherit}
.cp-form-input:focus,.cp-form-select:focus,.cp-form-textarea:focus{border-color:var(--cp-accent);outline:2px solid rgba(34,113,177,.2)}
.cp-form-textarea{resize:vertical;min-height:80px}
.cp-description{color:var(--cp-muted);font-size:12.5px;margin:.4rem 0 0;line-height:1.5}

/* ── 대시보드 그리드 ── */
.cp-dash-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin-bottom:20px}
.cp-dash-stat{background:var(--cp-white);border:1px solid var(--cp-border);border-radius:var(--cp-radius);padding:18px 20px;display:flex;align-items:center;gap:16px;box-shadow:var(--cp-shadow)}
.cp-dash-stat-icon{font-size:28px;flex-shrink:0}
.cp-dash-stat-num{font-size:26px;font-weight:700;color:var(--cp-text);line-height:1}
.cp-dash-stat-label{font-size:12px;color:var(--cp-muted);margin-top:3px}

/* ── 배지 / 상태 ── */
.cp-badge,.cp-status{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.3px}
.cp-badge-publish,.cp-status-publish{background:#edfaef;color:#00a32a}
.cp-badge-draft,.cp-status-draft{background:#f0f0f1;color:var(--cp-muted)}
.cp-badge-pending{background:#fff8e5;color:#996800}
.cp-badge-private{background:#f0f4f8;color:var(--cp-accent)}
.cp-badge-trash{background:#fcf0f1;color:#d63638}

/* ── 푸터 ── */
#cp-footer{text-align:center;padding:14px;color:var(--cp-muted);font-size:12px;border-top:1px solid var(--cp-border);margin-left:var(--cp-sidebar-w)}
#cp-footer a{color:var(--cp-muted);text-decoration:none}
#cp-footer a:hover{color:var(--cp-accent)}

/* ── 반응형 ── */
@media(max-width:782px){
  #cp-menu-toggle{display:flex}
  #cp-sidebar{transform:translateX(-100%)}
  body.cp-sidebar-open #cp-sidebar{transform:none}
  #cp-main,#cp-footer{margin-left:0}
  .cp-form-table th{display:none}
  .cp-form-table td{display:block;padding:10px 0}
  .cp-form-input,.cp-form-select,.cp-form-textarea{max-width:100%}
  .cp-dash-grid{grid-template-columns:1fr 1fr}
  .cp-page-header{flex-direction:column;align-items:flex-start}
}
@media(max-width:480px){
  .cp-dash-grid{grid-template-columns:1fr}
  #cp-main{padding:14px 16px 20px}
}
`;
