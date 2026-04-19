/**
 * CloudPress Blog Header v4.0
 * - Error 1101 완전 수정: 모듈 레벨 전역 상태 완전 제거
 * - cpLoad/cpQuery/loadTemplate 각 단계 독립 에러 처리
 * - 언어 쿠키 전달 지원
 */

import { cpLoad }        from './cp-load.js';
import { cpQuery }       from './cp-includes/query.js';
import { loadTemplate }  from './cp-includes/template-loader.js';

export async function handleRequest(request, env, ctx, options = {}) {
  // 1) 환경 로드
  let cp;
  try {
    cp = await cpLoad(request, env, ctx, options);
  } catch (e) {
    console.error('[cp-blog-header] cpLoad error:', e?.message);
    return errorPage(500, 'Initialization error', e?.message || 'cpLoad failed');
  }

  if (cp && cp.__cpError) return cp.response;

  // 2) 쿼리 설정 (URL 라우팅) — 실패해도 계속 진행
  try {
    await cpQuery(request, cp);
  } catch (e) {
    console.error('[cp-blog-header] cpQuery error:', e?.message);
    // query 기본값 보장
    if (!cp.query) cp.query = { is_home: true, posts: [], is_404: false };
  }

  // 3) 템플릿 렌더링
  try {
    const result = await loadTemplate(request, cp);
    if (result instanceof Response) return result;
    if (typeof result === 'string') {
      return new Response(result, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    return result;
  } catch (e) {
    console.error('[cp-blog-header] loadTemplate error:', e?.message);
    return errorPage(500, 'Render error', e?.message || 'Template load failed');
  }
}

function errorPage(status, title, detail) {
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escHtml(title)}</title>
  <link rel="stylesheet" href="/cp-includes/css/error.css">
</head>
<body>
  <div class="error-box">
    <h1>CloudPress › ${escHtml(title)}</h1>
    <p>${escHtml(detail)}</p>
  </div>
</body>
</html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
