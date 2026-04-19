/**
 * CloudPress Template Loader
 * Replaces WordPress wp-includes/template-loader.php + get_template_part() etc.
 *
 * [v3.0 수정]
 * - 이슈 4: defaultTemplate이 DB에서 실제 포스트/페이지를 불러와 렌더링
 * - 홈페이지: 최신 포스트 목록 표시 (cp.query.posts 활용)
 * - 단일 포스트/페이지: cp.query.queried_object 활용
 * - GitHub 템플릿 없어도 완전한 프론트엔드 렌더링
 *
 * @package CloudPress
 */

import { getOption } from './option.js';
import { escHtml }   from './formatting.js';

const KV_PREFIX       = 'cp:template:';
const TEMPLATE_KV_TTL = 3600;

/* ── Public API ──────────────────────────────────────────────────────────── */

export async function loadTemplate(requestOrCp, cpOrTemplateName, context = {}) {
  let request, cp, templateName;

  if (requestOrCp instanceof Request) {
    request      = requestOrCp;
    cp           = cpOrTemplateName;
    templateName = resolveTemplateName(request, cp);
  } else if (requestOrCp && typeof requestOrCp === 'object' && requestOrCp.db) {
    cp           = requestOrCp;
    templateName = cpOrTemplateName || 'index';
    request      = cp.request;
  } else {
    cp           = cpOrTemplateName;
    templateName = 'index';
    request      = cp?.request;
  }

  if (request && new URL(request.url).pathname === '/api/render') {
    return renderApiResponse(request, cp);
  }

  const hierarchy = buildHierarchy(templateName, { ...context, cp });

  for (const tmpl of hierarchy) {
    const content = await fetchTemplate(cp, tmpl);
    if (content !== null) {
      const html = await renderTemplateContent(content, { cp, request, ...context });
      if (html.trim().toLowerCase().startsWith('<!doctype')) {
        return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
      return new Response(
        wrapInFullPage(html, cp, templateName),
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }
  }

  // 폴백: DB에서 실제 콘텐츠 렌더링
  const html = await buildDefaultPage(templateName, cp, context);
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function renderTemplate(cpOrStr, templateNameOrCtx, context = {}) {
  if (typeof cpOrStr === 'string') {
    return interpolate(cpOrStr, templateNameOrCtx || {});
  }
  const result = await loadTemplate(cpOrStr, templateNameOrCtx, context);
  if (result instanceof Response) return result.text();
  return String(result);
}

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
  return new Response(String(result), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
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
  if (/^\/\d{4}\/\d{2}\//.test(path)) return 'single';
  if (path.startsWith('/category/') || path.startsWith('/tag/') || path.startsWith('/author/')) return 'archive';
  if (path.startsWith('/search') || path.includes('?s=')) return 'search';
  if (path.endsWith('/feed') || path.endsWith('/feed/rss')) return 'feed';
  if (/^\/[a-z0-9\-_가-힣]+\/?$/.test(path)) return 'page';
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
  try {
    const cached = await cp?.kv?.get(kvKey);
    if (cached !== null && cached !== undefined) return cached;
  } catch (_) {}

  const githubRepo  = cp?.config?.GITHUB_REPO || await getOption(cp, 'cp_github_repo', '');
  const githubToken = cp?.config?.GITHUB_TOKEN || cp?.env?.CP_GITHUB_TOKEN || '';
  const activeTheme = await getOption(cp, 'template', '');

  if (!githubRepo) return null;

  const themePath = activeTheme
    ? `themes/${activeTheme}/${filename}`
    : `templates/${filename}`;

  const apiUrl = `https://api.github.com/repos/${githubRepo}/contents/${themePath}`;
  try {
    const headers = { 'User-Agent': 'CloudPress/2.0', 'Accept': 'application/vnd.github.v3.raw' };
    if (githubToken) headers['Authorization'] = `Bearer ${githubToken}`;
    const res = await fetch(apiUrl, { headers });
    if (!res.ok) return null;
    const content = await res.text();
    if (cp?.kv) cp.kv.put(kvKey, content, { expirationTtl: TEMPLATE_KV_TTL }).catch(() => {});
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

/* ── DB 기반 기본 페이지 빌더 (이슈 4 핵심 수정) ─────────────────────────── */

async function buildDefaultPage(templateName, cp, context) {
  const siteName    = await getSiteName(cp);
  const siteDesc    = await getSiteDesc(cp);
  const siteUrl     = cp?.config?.SITE_URL || '';
  const prefix      = cp?.db_prefix || 'cp_';
  const query       = cp?.query;

  let bodyHtml = '';

  // 단일 포스트/페이지
  if (query?.is_single || query?.is_page) {
    const post = query.queried_object || (query.posts && query.posts[0]);
    if (post) {
      bodyHtml = renderSinglePost(post);
    } else {
      bodyHtml = render404();
    }
  }
  // 검색 결과
  else if (query?.is_search) {
    const posts = query.posts || [];
    bodyHtml = renderSearchResults(posts, query.search_query || '', siteName);
  }
  // 아카이브
  else if (query?.is_archive || query?.is_category || query?.is_tag) {
    const posts = query.posts || [];
    const obj   = query.queried_object;
    bodyHtml = renderArchive(posts, obj);
  }
  // 홈 (포스트 목록)
  else {
    const posts = (query?.posts && query.posts.length > 0)
      ? query.posts
      : await loadRecentPosts(cp, prefix);
    bodyHtml = renderHomePage(posts, siteName, siteDesc);
  }

  return await wrapInFullPage(bodyHtml, cp, templateName, { siteName, siteUrl });
}

async function getSiteName(cp) {
  try { return await getOption(cp, 'blogname') || cp?.config?.SITE_NAME || 'CloudPress'; } catch(_) { return cp?.config?.SITE_NAME || 'CloudPress'; }
}
async function getSiteDesc(cp) {
  try { return await getOption(cp, 'blogdescription') || ''; } catch(_) { return ''; }
}

async function loadRecentPosts(cp, prefix) {
  try {
    const res = await cp?.db?.prepare(
      `SELECT ID, post_title, post_name, post_excerpt, post_content, post_date, post_author
         FROM ${prefix}posts
        WHERE post_status='publish' AND post_type='post'
        ORDER BY post_date DESC LIMIT 10`
    ).all();
    return res?.results || [];
  } catch (_) { return []; }
}

function renderHomePage(posts, siteName, siteDesc) {
  if (!posts || posts.length === 0) {
    return `
<div class="cp-home-hero">
  <h1 class="cp-site-title">${escHtml(siteName)}</h1>
  ${siteDesc ? `<p class="cp-site-desc">${escHtml(siteDesc)}</p>` : ''}
</div>
<div class="cp-empty-state">
  <div class="cp-empty-icon">📝</div>
  <h2>아직 게시물이 없습니다</h2>
  <p>첫 번째 게시물을 작성해 보세요.</p>
  <a href="/cp-admin/post-new" class="cp-btn-primary">새 글 쓰기</a>
</div>`;
  }

  const postCards = posts.map(p => {
    const excerpt = p.post_excerpt || stripTags(p.post_content || '').slice(0, 160);
    const date    = formatDate(p.post_date);
    const href    = p.post_name ? `/${p.post_name}` : `/?p=${p.ID}`;
    return `
<article class="cp-post-card">
  <header class="cp-post-card-header">
    <h2 class="cp-post-card-title"><a href="${href}">${escHtml(p.post_title || '(제목 없음)')}</a></h2>
    <time class="cp-post-card-date" datetime="${escHtml(p.post_date || '')}">${escHtml(date)}</time>
  </header>
  ${excerpt ? `<div class="cp-post-card-excerpt"><p>${escHtml(excerpt)}${(p.post_content || '').length > 160 ? '…' : ''}</p></div>` : ''}
  <footer class="cp-post-card-footer">
    <a href="${href}" class="cp-read-more">계속 읽기 →</a>
  </footer>
</article>`;
  }).join('');

  return `
<div class="cp-home-hero">
  <h1 class="cp-site-title">${escHtml(siteName)}</h1>
  ${siteDesc ? `<p class="cp-site-desc">${escHtml(siteDesc)}</p>` : ''}
</div>
<main class="cp-posts-list">
  ${postCards}
</main>`;
}

function renderSinglePost(post) {
  const date = formatDate(post.post_date);
  return `
<article class="cp-single-post">
  <header class="cp-single-header">
    <h1 class="cp-single-title">${escHtml(post.post_title || '')}</h1>
    <div class="cp-single-meta">
      <time datetime="${escHtml(post.post_date || '')}">${escHtml(date)}</time>
    </div>
  </header>
  <div class="cp-single-content">
    ${post.post_content || ''}
  </div>
  <footer class="cp-single-footer">
    <a href="/" class="cp-back-link">← 목록으로</a>
  </footer>
</article>`;
}

function renderArchive(posts, queriedObject) {
  const title = queriedObject?.name || queriedObject?.post_title || '아카이브';
  const cards = posts.map(p => {
    const href = p.post_name ? `/${p.post_name}` : `/?p=${p.ID}`;
    return `<article class="cp-post-card">
      <h2 class="cp-post-card-title"><a href="${href}">${escHtml(p.post_title || '')}</a></h2>
      <time class="cp-post-card-date">${escHtml(formatDate(p.post_date))}</time>
    </article>`;
  }).join('');
  return `<h1 class="cp-archive-title">${escHtml(title)}</h1>
<div class="cp-posts-list">${cards || '<p>게시물이 없습니다.</p>'}</div>`;
}

function renderSearchResults(posts, query, siteName) {
  const cards = posts.map(p => {
    const href = p.post_name ? `/${p.post_name}` : `/?p=${p.ID}`;
    return `<article class="cp-post-card">
      <h2 class="cp-post-card-title"><a href="${href}">${escHtml(p.post_title || '')}</a></h2>
    </article>`;
  }).join('');
  return `<h1>"${escHtml(query)}" 검색 결과: ${posts.length}개</h1>
<div class="cp-posts-list">${cards || '<p>검색 결과가 없습니다.</p>'}</div>`;
}

function render404() {
  return `<div class="cp-404">
  <h1>404</h1>
  <p>페이지를 찾을 수 없습니다.</p>
  <a href="/">홈으로 돌아가기</a>
</div>`;
}

/* ── 전체 페이지 래핑 ─────────────────────────────────────────────────────── */

async function wrapInFullPage(content, cp, templateName, extra = {}) {
  const siteName = extra.siteName || cp?.config?.SITE_NAME || 'CloudPress';
  const siteUrl  = extra.siteUrl  || cp?.config?.SITE_URL  || '';
  let adminSlug = cp?.config?.ADMIN_SLUG || 'cp-admin';
  try { const s = await cp?.kv?.get('cp:admin_slug'); if (s) adminSlug = s; } catch (_) {}

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="CloudPress">
  <title>${escHtml(siteName)}</title>
  <link rel="stylesheet" href="/cp-includes/css/template-fallback.css">
  <style>
    *,*::before,*::after{box-sizing:border-box}
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Noto Sans KR','Malgun Gothic','Segoe UI',sans-serif;line-height:1.7;color:#1d2327;background:#fff}
    a{color:#2271b1;text-decoration:none}
    a:hover{text-decoration:underline}
    img{max-width:100%;height:auto}
    .cp-container{max-width:860px;margin:0 auto;padding:0 1.5rem}
    /* 헤더 */
    .cp-header{background:#1d2327;color:#fff;padding:1.1rem 0;box-shadow:0 2px 4px rgba(0,0,0,.15)}
    .cp-header-inner{display:flex;align-items:center;justify-content:space-between;max-width:860px;margin:0 auto;padding:0 1.5rem}
    .cp-header a.cp-site-name{color:#fff;text-decoration:none;font-size:1.35rem;font-weight:700;letter-spacing:-.3px}
    .cp-header nav a{color:rgba(255,255,255,.75);text-decoration:none;margin-left:1.5rem;font-size:.9rem;transition:.15s}
    .cp-header nav a:hover{color:#fff}
    /* 히어로 */
    .cp-home-hero{padding:3rem 0 1.5rem;border-bottom:1px solid #f0f0f1;margin-bottom:2.5rem}
    .cp-site-title{font-size:2.2rem;font-weight:800;margin:0 0 .5rem;color:#1d2327}
    .cp-site-desc{color:#646970;font-size:1.05rem;margin:0}
    /* 포스트 카드 */
    .cp-posts-list{display:flex;flex-direction:column;gap:2rem;margin-bottom:3rem}
    .cp-post-card{border-bottom:1px solid #f0f0f1;padding-bottom:2rem}
    .cp-post-card:last-child{border-bottom:none}
    .cp-post-card-title{margin:0 0 .4rem;font-size:1.4rem;font-weight:700;line-height:1.3}
    .cp-post-card-title a{color:#1d2327;text-decoration:none}
    .cp-post-card-title a:hover{color:#2271b1}
    .cp-post-card-date{color:#646970;font-size:.85rem;display:block;margin-bottom:.75rem}
    .cp-post-card-excerpt p{margin:.5rem 0;color:#3c434a;line-height:1.7}
    .cp-post-card-footer{margin-top:.75rem}
    .cp-read-more{font-size:.9rem;font-weight:600;color:#2271b1}
    /* 단일 포스트 */
    .cp-single-post{padding:2rem 0}
    .cp-single-title{font-size:2rem;font-weight:800;margin:0 0 .75rem;line-height:1.25;color:#1d2327}
    .cp-single-meta{color:#646970;font-size:.875rem;margin-bottom:2rem;padding-bottom:1rem;border-bottom:1px solid #f0f0f1}
    .cp-single-content{font-size:1.05rem;line-height:1.85;color:#3c434a}
    .cp-single-content h1,.cp-single-content h2,.cp-single-content h3{color:#1d2327;margin:2rem 0 .75rem}
    .cp-single-content p{margin:0 0 1.2rem}
    .cp-single-content img{border-radius:4px}
    .cp-single-content blockquote{border-left:4px solid #2271b1;padding:.75rem 1rem;margin:1.5rem 0;background:#f8f9fa;color:#3c434a}
    .cp-single-footer{margin-top:2.5rem;padding-top:1.5rem;border-top:1px solid #f0f0f1}
    .cp-back-link{font-size:.9rem;color:#646970}
    /* 빈 상태 */
    .cp-empty-state{text-align:center;padding:4rem 0;color:#646970}
    .cp-empty-icon{font-size:3rem;margin-bottom:1rem}
    .cp-empty-state h2{font-size:1.4rem;color:#1d2327;margin:0 0 .5rem}
    .cp-empty-state p{margin:0 0 1.5rem}
    .cp-btn-primary{display:inline-block;background:#2271b1;color:#fff;padding:.6rem 1.4rem;border-radius:4px;font-weight:600;text-decoration:none;transition:.15s}
    .cp-btn-primary:hover{background:#135e96;text-decoration:none;color:#fff}
    /* 404 */
    .cp-404{text-align:center;padding:5rem 0}
    .cp-404 h1{font-size:5rem;font-weight:900;color:#dcdcde;margin:0}
    /* 아카이브 */
    .cp-archive-title{font-size:1.75rem;font-weight:700;margin:0 0 2rem;padding-bottom:1rem;border-bottom:1px solid #f0f0f1}
    /* 푸터 */
    .cp-footer{background:#f6f7f7;border-top:1px solid #dcdcde;padding:1.5rem 0;text-align:center;color:#646970;font-size:.85rem;margin-top:3rem}
    .cp-footer a{color:#646970}
    @media(max-width:600px){
      .cp-site-title{font-size:1.6rem}
      .cp-single-title{font-size:1.5rem}
      .cp-post-card-title{font-size:1.2rem}
    }
  </style>
</head>
<body>
  <header class="cp-header">
    <div class="cp-header-inner">
      <a href="/" class="cp-site-name">${escHtml(siteName)}</a>
      <nav>
        <a href="/">홈</a>
        <a href="/${adminSlug}/">관리자</a>
      </nav>
    </div>
  </header>
  <div class="cp-container">
    ${content}
  </div>
  <footer class="cp-footer">
    <div class="cp-container">
      &copy; ${new Date().getFullYear()} ${escHtml(siteName)} &mdash; <a href="https://cloudpress.pages.dev">CloudPress</a>
    </div>
  </footer>
</body>
</html>`;
}

/* ── 헬퍼 ────────────────────────────────────────────────────────────────── */

function stripTags(html) {
  return String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function formatDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch (_) { return d; }
}
