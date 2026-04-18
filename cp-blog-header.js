/**
 * CloudPress Blog Header
 * Replaces WordPress wp-blog-header.php
 *
 * [v2.0 수정 — Error 1101 방지]
 * - 모듈 레벨 변수 `_cp_did_header` 제거
 *   → 번들 후 단일 파일에서 모듈 상태가 전역으로 공유되어
 *     두 번째 요청부터 "Already loaded" 500 에러 발생하던 문제 수정
 * - cpLoad / cpQuery / loadTemplate 실패 시 fallback HTML 반환
 *   (throw 대신 Response 반환으로 Worker 크래시 방지)
 *
 * @package CloudPress
 */

import { cpLoad }        from './cp-load.js';
import { cpQuery }       from './cp-includes/query.js';
import { loadTemplate }  from './cp-includes/template-loader.js';

export async function handleRequest(request, env, ctx, options = {}) {
  // [수정] 모듈 레벨 중복 체크 제거 — Worker는 요청마다 독립 실행됨
  // 번들 모드에서 전역 변수가 요청 간 공유되어 Error 1101 발생하던 원인

  // 1) CloudPress 환경 로드
  let cp;
  try {
    cp = await cpLoad(request, env, ctx, options);
  } catch (e) {
    console.error('[cp-blog-header] cpLoad error:', e?.message);
    return errorPage('초기화 오류', e?.message || 'cpLoad 실패');
  }

  // cpLoad가 에러 객체를 반환하는 경우 처리
  if (cp && cp.__cpError) {
    return cp.response;
  }

  // 2) 쿼리 설정 (URL 라우팅)
  try {
    await cpQuery(request, cp);
  } catch (e) {
    console.error('[cp-blog-header] cpQuery error:', e?.message);
    // 쿼리 실패는 치명적이지 않으므로 계속 진행
  }

  // 3) 템플릿 렌더링
  try {
    const result = await loadTemplate(request, cp);
    // loadTemplate이 Response를 반환하는 경우와 HTML 문자열을 반환하는 경우 모두 처리
    if (result instanceof Response) {
      return result;
    }
    if (typeof result === 'string') {
      return new Response(result, {
        status:  200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    return result;
  } catch (e) {
    console.error('[cp-blog-header] loadTemplate error:', e?.message);
    return errorPage('렌더링 오류', e?.message || '템플릿 로드 실패');
  }
}

function errorPage(title, detail) {
  return new Response(
    `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CloudPress — ${escHtml(title)}</title>
  <link rel="stylesheet" href="/cp-includes/css/error.css">
</head>
<body>
  <div class="error-box">
    <h1>CloudPress › ${escHtml(title)}</h1>
    <p>${escHtml(detail)}</p>
  </div>
</body>
</html>`,
    { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
