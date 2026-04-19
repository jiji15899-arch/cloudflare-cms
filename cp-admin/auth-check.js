/**
 * CloudPress Admin Auth Check
 *
 * [v3.1 수정]
 * - 로그인 리다이렉트를 무작위 슬러그 URL로 변경
 * - KV에서 login_slug 조회
 *
 * @package CloudPress
 */

import { verifyJwt }    from '../cp-includes/jwt.js';
import { getUserById }  from '../cp-includes/user.js';
import { extractToken } from '../cp-includes/session.js';

export async function requireAdmin(cp) {
  const user = await getAdminUser(cp);
  if (!user) {
    const loginUrl = await buildLoginUrl(cp);
    return Response.redirect(loginUrl, 302);
  }

  if (!userHasRole(user, ['administrator'])) {
    return new Response(
      `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>접근 거부</title></head>
<body style="font-family:system-ui;text-align:center;padding:4rem">
<h1>접근 권한이 없습니다</h1>
<p>관리자 권한이 필요합니다.</p>
<a href="/">사이트로 돌아가기</a>
</body></html>`,
      { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  cp.currentUser = user;
  return null;
}

async function buildLoginUrl(cp) {
  let loginSlug = '';
  try {
    loginSlug = await cp.kv.get('cp:security:login_slug') || '';
  } catch(_) {}
  const redirectTo = encodeURIComponent(cp.url.pathname + cp.url.search);
  const loginPath  = loginSlug ? `/cp-login-${loginSlug}` : '/cp-login';
  return `${cp.url.origin}${loginPath}?redirect_to=${redirectTo}`;
}

export async function getAdminUser(cp) {
  const token = extractToken(cp.request);
  if (!token) return null;

  try {
    const payload = await verifyJwt(token, cp.config.AUTH_KEY);
    if (!payload?.sub) return null;

    const revoked = await cp.kv.get(`cp:token_revoked:${payload.jti || payload.sub}`);
    if (revoked) return null;

    return await getUserById(cp, payload.sub) || null;
  } catch (_) {
    return null;
  }
}

export function userHasRole(user, roles) {
  if (!user) return false;
  const userRoles = user.roles || [];
  return roles.some(r => userRoles.includes(r));
}

export function userCan(user, capability) {
  if (!user) return false;
  const roleCaps = {
    administrator: ['manage_options','edit_posts','publish_posts','delete_posts',
                    'edit_pages','publish_pages','delete_pages','manage_categories',
                    'upload_files','moderate_comments','manage_links',
                    'install_plugins','activate_plugins','install_themes',
                    'switch_themes','edit_users','create_users','delete_users',
                    'list_users','import','export','update_core','edit_themes',
                    'edit_plugins','read'],
    editor:        ['edit_posts','publish_posts','delete_posts','edit_pages',
                    'publish_pages','delete_pages','manage_categories',
                    'moderate_comments','upload_files','manage_links','read'],
    author:        ['edit_posts','publish_posts','delete_posts','upload_files','read'],
    contributor:   ['edit_posts','delete_posts','read'],
    subscriber:    ['read'],
  };
  const userRoles = user.roles || [];
  return userRoles.some(role => (roleCaps[role] || []).includes(capability));
}
