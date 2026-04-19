/**
 * CloudPress Admin Panel - Main Entry
 *
 * [v3.1 수정]
 * - 테마 에디터 / 플러그인 에디터 404 수정 → 실제 핸들러 추가
 * - 관리자 URL 슬러그 라우팅 지원 (cp-router에서 /cp-admin으로 재작성 후 진입)
 * - 한국어 404 메시지
 *
 * @package CloudPress
 */

import { cpLoad }           from '../cp-load.js';
import { requireAdmin }     from './auth-check.js';
import { renderAdminShell } from './admin-shell.js';
import { handleInstaller }  from './installer.js';

import { handleDashboard }         from './pages/dashboard.js';
import { handlePosts }             from './pages/posts.js';
import { handlePostEdit }          from './pages/post-edit.js';
import { handlePages }             from './pages/pages.js';
import { handleMediaPage }         from './pages/media.js';
import { handleComments }          from './pages/comments.js';
import { handleThemes }            from './pages/themes.js';
import { handlePlugins }           from './pages/plugins.js';
import { handleUsers }             from './pages/users.js';
import { handleUserEdit }          from './pages/user-edit.js';
import { handleProfile }           from './pages/profile.js';
import { handleOptions }           from './pages/options.js';
import { handleOptionsGeneral }    from './pages/options-general.js';
import { handleOptionsWriting }    from './pages/options-writing.js';
import { handleOptionsReading }    from './pages/options-reading.js';
import { handleOptionsDiscussion } from './pages/options-discussion.js';
import { handleOptionsMedia }      from './pages/options-media.js';
import { handleOptionsPermalink }  from './pages/options-permalink.js';
import { handleImport }            from './pages/import.js';
import { handleExport }            from './pages/export.js';
import { handleTools }             from './pages/tools.js';
import { handleUpgrade }           from './pages/upgrade.js';
import { handleAjax }              from './ajax.js';
import { handleGithubSync }        from './github-sync.js';
import { handleThemeEditor }       from './theme-editor.js';
import { handlePluginEditor }      from './plugin-editor.js';

export async function handleAdmin(request, env, ctx) {
  const url    = new URL(request.url);
  const path   = url.pathname.replace(/\/+$/, '') || '/cp-admin';
  const method = request.method.toUpperCase();

  if (path === '/cp-admin/setup-config' || path === '/cp-admin/install') {
    return handleInstaller(request, env, ctx);
  }
  if (path === '/cp-admin/admin-ajax' || path === '/cp-admin/admin-ajax.js') {
    return handleAjax(request, env, ctx);
  }
  if (path === '/cp-admin/github-sync' || path.startsWith('/cp-admin/github-sync/')) {
    return handleGithubSync(request, env, ctx);
  }

  const cp = await cpLoad(request, env, ctx);
  if (cp.__cpError) return cp.response;

  const authResult = await requireAdmin(cp);
  if (authResult) return authResult;

  return dispatchAdmin(request, env, ctx, cp, path, method, url);
}

async function dispatchAdmin(request, env, ctx, cp, path, method, url) {
  // Dashboard
  if (path === '/cp-admin' || path === '/cp-admin/index') {
    return handleDashboard(request, cp);
  }

  // Posts
  if (path === '/cp-admin/edit' && url.searchParams.get('post_type') !== 'page') {
    return handlePosts(request, cp);
  }
  if (path === '/cp-admin/post-new' || path === '/cp-admin/post') {
    return handlePostEdit(request, cp);
  }

  // Pages
  if (path === '/cp-admin/edit' && url.searchParams.get('post_type') === 'page') {
    return handlePages(request, cp);
  }
  if (path === '/cp-admin/page-new' || path === '/cp-admin/page') {
    return handlePostEdit(request, cp, { post_type: 'page' });
  }

  // Media
  if (path === '/cp-admin/upload' || path === '/cp-admin/media-new') {
    return handleMediaPage(request, cp);
  }

  // Comments
  if (path === '/cp-admin/edit-comments') {
    return handleComments(request, cp);
  }

  // Themes + Theme Editor
  if (path === '/cp-admin/themes' || path === '/cp-admin/theme-install') {
    return handleThemes(request, cp);
  }
  if (path === '/cp-admin/theme-editor') {
    return handleThemeEditor(request, cp);
  }

  // Plugins + Plugin Editor
  if (path === '/cp-admin/plugins' || path === '/cp-admin/plugin-install') {
    return handlePlugins(request, cp);
  }
  if (path === '/cp-admin/plugin-editor') {
    return handlePluginEditor(request, cp);
  }

  // Users
  if (path === '/cp-admin/users') {
    return handleUsers(request, cp);
  }
  if (path === '/cp-admin/user-new' || path === '/cp-admin/user-edit') {
    return handleUserEdit(request, cp);
  }
  if (path === '/cp-admin/profile') {
    return handleProfile(request, cp);
  }

  // Settings
  if (path === '/cp-admin/options-general')    return handleOptionsGeneral(request, cp);
  if (path === '/cp-admin/options-writing')    return handleOptionsWriting(request, cp);
  if (path === '/cp-admin/options-reading')    return handleOptionsReading(request, cp);
  if (path === '/cp-admin/options-discussion') return handleOptionsDiscussion(request, cp);
  if (path === '/cp-admin/options-media')      return handleOptionsMedia(request, cp);
  if (path === '/cp-admin/options-permalink')  return handleOptionsPermalink(request, cp);
  if (path === '/cp-admin/options')            return handleOptions(request, cp);

  // Tools
  if (path === '/cp-admin/tools')   return handleTools(request, cp);
  if (path === '/cp-admin/import')  return handleImport(request, cp);
  if (path === '/cp-admin/export')  return handleExport(request, cp);

  // Upgrade
  if (path === '/cp-admin/update-core' || path === '/cp-admin/upgrade') {
    return handleUpgrade(request, cp);
  }

  // 404
  return new Response(
    await renderAdminShell(cp,
      `<div style="text-align:center;padding:4rem 0">
        <div style="font-size:3rem;margin-bottom:1rem">🔍</div>
        <h2 style="font-size:1.5rem;margin:0 0 .5rem">페이지를 찾을 수 없습니다</h2>
        <p style="color:#646970">요청한 관리자 페이지가 존재하지 않습니다.</p>
        <a href="/cp-admin" class="cp-btn" style="margin-top:1rem">대시보드로 돌아가기</a>
      </div>`,
      { title: '404 페이지 없음' }
    ),
    { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
