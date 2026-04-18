/**
 * CloudPress Template Loader
 * Replaces WordPress wp-includes/template-loader.php + get_template_part() etc.
 *
 * [v2.0 수정 — Error 1101 / 사이트 미표시 해결]
 *
 * 1) loadTemplate 시그니처 불일치 수정:
 *    - cp-blog-header.js가 loadTemplate(request, cp)으로 호출
 *    - 기존 코드는 loadTemplate(cp, templateName, context)를 기대
 *    → 두 호출 형식 모두 처리하도록 수정
 *
 * 2) 반환값 타입 통일:
 *    - 기존: string 반환
 *    - 수정: Response 객체 반환 (cp-blog-header.js와 일관성)
 *    - 문자열 반환도 내부적으로 Response로 래핑
 *
 * 3) 완전한 HTML 문서 보장:
 *    - 테마/GitHub 템플릿 없을 때 defaultTemplate이 완전한 DOCTYPE HTML 반환
 *    - CSS/헤더/푸터 포함한 완전한 페이지 렌더링
 *
 * 4) /api/render 엔드포인트 지원:
 *    - worker.js CMS Shell이 호출하는 /api/render?path= 처리
 *
 * @package CloudPress
 */

import { getOption } from './option.js';
import { escHtml }   from './formatting.js';

const KV_PREFIX       = 'cp:template:';
const TEMPLATE_KV_TTL = 3600; // 1 hour cache

/* ── Public API ──────────────────────────────────────────────────────────── */

/**
 * 요청(request)과 cp 컨텍스트로 적절한 템플릿을 찾아 Response 반환.
 * cp-blog-header.js: loadTemplate(request, cp) 형식으로 호출
 * 내부 코드:         loadTemplate(cp, templateName, context) 형식으로 호출
 *
 * @param {Request|object} requestOrCp
 * @param {object}         cpOrTemplateName
 * @param {object}         [context]
 * @returns {Promise<Response|string>}
 */
export async function loadTemplate(requestOrCp, cpOrTemplateName, context = {}) {
  // [수정] 두 가지 호출 형식 모두 처리
  let request, cp, templateName;

  if (requestOrCp instanceof Request) {
    // 형식 1: loadTemplate(request, cp)  — cp-blog-header.js 호출
    request      = requestOrCp;
    cp           = cpOrTemplateName;
    templateName = resolveTemplateName(request, cp);
  } else if (requestOrCp && typeof requestOrCp === 'object' && requestOrCp.db) {
    // 형식 2: loadTemplate(cp, templateName, context)  — 내부 호출
    cp           = requestOrCp;
    templateName = cpOrTemplateName || 'index';
    request      = cp.request;
  } else {
    // 알 수 없는 형식 — 기본 처리
    cp           = cpOrTemplateName;
    templateName = 'index';
    request      = cp?.request;
  }

  // /api/render 전용 처리
  if (request && new URL(request.url).pathname === '/api/render') {
    return renderApiResponse(request, cp);
  }

  const hierarchy = buildHierarchy(templateName, { ...context, cp });

  for (const tmpl of hierarchy) {
    const content = await fetchTemplate(cp, tmpl);
    if (content !== null) {
      const html = await renderTemplateContent(content, { cp, request, ...context });
      // 완전한 HTML 문서인지 확인
      if (html.trim().toLowerCase().startsWith('<!doctype')) {
        return new Response(html, {
          status:  200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      // 부분 HTML이면 전체 페이지로 래핑
      return new Response(
        wrapInFullPage(html, cp, templateName),
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }
  }

  // 궁극적 폴백: 완전한 기본 HTML 페이지
  return new Response(
    defaultTemplate(templateName, { ...context, cp }),
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

/**
 * 렌더링된 템플릿 문자열 반환 (내부 전용).
 */
export async function renderTemplate(cpOrStr, templateNameOrCtx, context = {}) {
  if (typeof cpOrStr === 'string') {
    return interpolate(cpOrStr, templateNameOrCtx || {});
  }
  const result = await loadTemplate(cpOrStr, templateNameOrCtx, context);
  if (result instanceof Response) return result.text();
  return String(result);
}

/**
 * 템플릿 파일 원본 문자열 반환 (렌더링 없이).
 */
export async function getTemplatePart(cp, templateName) {
  const hierarchy = buildHierarchy(templateName, {});
  for (const tmpl of hierarchy) {
    const content = await fetchTemplate(cp, tmpl);
    if (content !== null) return content;
  }
  return null;
}

/* ── /api/render 처리 ────────────────────────────────────────────────────── */

async function renderApiResponse(request, cp) {
  const url      = new URL(request.url);
  const reqPath  = url.searchParams.get('path') || '/';

  // 경로에 맞는 콘텐츠 조회
  let post = null;
  try {
    if (cp?.db) {
      const prefix = cp.db_prefix || 'cp_';
      const slug   = reqPath.replace(/^\/+/, '').split('/').pop() || '';
      if (slug) {
        post = await cp.db.prepare(
          `SELECT ID, post_title, post_content, post_status, post_type
             FROM ${prefix}posts
            WHERE post_name=? AND post_status='publish'
            LIMIT 1`
        ).bind(slug).first();
      }
    }
  } catch (_) {}

  const templateName = resolveTemplateFromPath(reqPath);
  const result = await loadTemplate(cp, templateName, { post, path: reqPath });
  if (result instanceof Response) return result;
  return new Response(String(result), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/* ── 템플릿 이름 결정 ────────────────────────────────────────────────────── */

function resolveTemplateName(request, cp) {
  if (!request) return 'index';
  const url  = new URL(request.url);
  const path = url.pathname;
  return resolveTemplateFromPath(path, cp);
}

function resolveTemplateFromPath(path, cp) {
  if (path === '/' || path === '') return 'index';
  if (path.startsWith('/cp-admin')) return 'index';

  // 연도/월/슬러그 패턴 → single
  if (/^\/\d{4}\/\d{2}\//.test(path)) return 'single';

  // 카테고리/태그/작성자 → archive
  if (path.startsWith('/category/') || path.startsWith('/tag/') || path.startsWith('/author/')) {
    return 'archive';
  }

  // 검색
  if (path.startsWith('/search') || path.includes('?s=')) return 'search';

  // 피드
  if (path.endsWith('/feed') || path.endsWith('/feed/rss')) return 'feed';

  // 슬러그 1단계 → page 또는 single
  if (/^\/[a-z0-9\-_]+\/?$/.test(path)) {
    // cp 쿼리 컨텍스트가 있으면 더 정확하게 결정 (없으면 page로 가정)
    return cp?.query?.is_page ? 'page' : 'page';
  }

  return 'index';
}

/* ── 템플릿 계층 ──────────────────────────────────────────────────────────── */

function buildHierarchy(templateName, context) {
  const base = (templateName || 'index').replace(/\.html$/, '');
  const list = [];

  list.push(`${base}.html`);

  if (base === 'single') list.push('singular.html');
  if (base === 'page')   list.push('singular.html');
  if (base.startsWith('archive')) list.push('archive.html');

  if (context.taxonomy) list.push(`taxonomy-${context.taxonomy}.html`);
  if (context.term)     list.push('taxonomy.html');

  if (base !== 'index') list.push('index.html');

  return [...new Set(list)];
}

/* ── 템플릿 페치 (KV → GitHub) ───────────────────────────────────────────── */

async function fetchTemplate(cp, filename) {
  const kvKey = KV_PREFIX + filename;

  // KV 캐시 시도
  try {
    const cached = await cp?.kv?.get(kvKey);
    if (cached !== null && cached !== undefined) return cached;
  } catch (_) {}

  // GitHub 시도
  const githubRepo  = cp?.config?.GITHUB_REPO || await getOption(cp, 'cp_github_repo', '');
  const githubToken = cp?.config?.GITHUB_TOKEN || cp?.env?.CP_GITHUB_TOKEN || '';
  const activeTheme = await getOption(cp, 'template', '');

  if (!githubRepo) return null;

  const themePath = activeTheme
    ? `themes/${activeTheme}/${filename}`
    : `templates/${filename}`;

  const apiUrl = `https://api.github.com/repos/${githubRepo}/contents/${themePath}`;

  try {
    const headers = {
      'User-Agent': 'CloudPress/2.0',
      'Accept':     'application/vnd.github.v3.raw',
    };
    if (githubToken) headers['Authorization'] = `Bearer ${githubToken}`;

    const res = await fetch(apiUrl, { headers });
    if (!res.ok) return null;

    const content = await res.text();

    // KV 캐시 저장
    if (cp?.kv) {
      cp.kv.put(kvKey, content, { expirationTtl: TEMPLATE_KV_TTL }).catch(() => {});
    }

    return content;
  } catch (_) {
    return null;
  }
}

/* ── 렌더링 ──────────────────────────────────────────────────────────────── */

async function renderTemplateContent(template, context) {
  return interpolate(template, context);
}

function interpolate(template, context) {
  return template.replace(/\{\{(\s*[\w.]+\s*)\}\}/g, (_, key) => {
    const parts = key.trim().split('.');
    let val = context;
    for (const p of parts) {
      if (val == null) return '';
      val = val[p];
    }
    return val != null ? String(val) : '';
  });
}

/**
 * 부분 HTML을 완전한 페이지로 래핑
 */
function wrapInFullPage(content, cp, templateName) {
  const siteName = cp?.config?.SITE_NAME || 'CloudPress';
  const siteUrl  = cp?.config?.SITE_URL  || '';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="CloudPress">
  <title>${escHtml(siteName)}</title>
  <link rel="stylesheet" href="/cp-includes/css/template-fallback.css">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
                   'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1d2327;
      background: #fff;
    }
    .cp-container { max-width: 1200px; margin: 0 auto; padding: 0 1.5rem; }
    .cp-header {
      background: #1d2327;
      color: #fff;
      padding: 1rem 0;
      margin-bottom: 2rem;
    }
    .cp-header a { color: #fff; text-decoration: none; font-size: 1.4rem; font-weight: 700; }
    .cp-main { min-height: 60vh; padding-bottom: 3rem; }
    .cp-footer {
      background: #f6f7f7;
      border-top: 1px solid #dcdcde;
      padding: 1.5rem 0;
      text-align: center;
      color: #646970;
      font-size: .875rem;
    }
  </style>
</head>
<body>
  <header class="cp-header">
    <div class="cp-container">
      <a href="/">${escHtml(siteName)}</a>
    </div>
  </header>
  <main class="cp-main">
    <div class="cp-container">
      ${content}
    </div>
  </main>
  <footer class="cp-footer">
    <div class="cp-container">
      <p>&copy; ${new Date().getFullYear()} ${escHtml(siteName)} — Powered by <a href="https://cloudpress.pages.dev" style="color:inherit">CloudPress</a></p>
    </div>
  </footer>
</body>
</html>`;
}

/**
 * 궁극적 폴백 템플릿 (GitHub/KV에서 템플릿 없을 때)
 * 완전한 HTML5 문서 반환
 */
function defaultTemplate(templateName, context) {
  const cp      = context.cp;
  const post    = context.post;
  const title   = post?.post_title   || cp?.config?.SITE_NAME || 'CloudPress Site';
  const content = post?.post_content || '';
  const siteName = cp?.config?.SITE_NAME || title;

  return wrapInFullPage(
    content
      ? `<article class="entry">
           <h1 class="entry-title">${escHtml(title)}</h1>
           <div class="entry-content">${content}</div>
         </article>`
      : `<div style="text-align:center;padding:4rem 0">
           <h1>${escHtml(siteName)}</h1>
           <p style="color:#646970">이 사이트는 CloudPress로 운영 중입니다.</p>
           <p><a href="/cp-admin" style="color:#2271b1">관리자 패널 →</a></p>
         </div>`,
    cp,
    templateName
  );
}
