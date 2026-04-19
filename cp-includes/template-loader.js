/**
 * CloudPress Template Loader v4.0
 * - 다국어(i18n): 영어(기본), 한국어, 중국어, 일본어, 프랑스어
 * - 관리자 링크 프론트엔드 완전 제거
 * - "이 사이트는 CloudPress로 운영 중입니다." 문구 제거
 * - 게시글 미표시 버그 수정
 * - 404 언어별 메시지
 * - CDN 캐시 헤더 최적화
 */

import { getOption } from './option.js';
import { escHtml }   from './formatting.js';

const KV_PREFIX       = 'cp:template:';
const TEMPLATE_KV_TTL = 3600;

/* i18n */
const I18N = {
  en: {
    home:'Home', noPostsTitle:'No posts yet', noPostsDesc:'Write your first post.',
    readMore:'Read more →', backToList:'← Back to list', archive:'Archive',
    noPosts:'No posts.', noSearchResult:'No results found.',
    notFound:'Page not found.', backHome:'Go to Home',
    searchResult:(q,n)=>`Search results for "${q}": ${n} found`,
  },
  ko: {
    home:'홈', noPostsTitle:'아직 게시물이 없습니다', noPostsDesc:'첫 번째 게시물을 작성해 보세요.',
    readMore:'계속 읽기 →', backToList:'← 목록으로', archive:'아카이브',
    noPosts:'게시물이 없습니다.', noSearchResult:'검색 결과가 없습니다.',
    notFound:'페이지를 찾을 수 없습니다.', backHome:'홈으로 돌아가기',
    searchResult:(q,n)=>`"${q}" 검색 결과: ${n}개`,
  },
  zh: {
    home:'首页', noPostsTitle:'暂无文章', noPostsDesc:'写下您的第一篇文章吧。',
    readMore:'继续阅读 →', backToList:'← 返回列表', archive:'归档',
    noPosts:'没有文章。', noSearchResult:'未找到相关结果。',
    notFound:'页面未找到。', backHome:'返回首页',
    searchResult:(q,n)=>`"${q}" 的搜索结果：共 ${n} 条`,
  },
  ja: {
    home:'ホーム', noPostsTitle:'投稿がありません', noPostsDesc:'最初の投稿を書いてみましょう。',
    readMore:'続きを読む →', backToList:'← 一覧に戻る', archive:'アーカイブ',
    noPosts:'投稿がありません。', noSearchResult:'検索結果が見つかりませんでした。',
    notFound:'ページが見つかりません。', backHome:'ホームへ戻る',
    searchResult:(q,n)=>`「${q}」の検索結果：${n}件`,
  },
  fr: {
    home:'Accueil', noPostsTitle:"Aucun article pour l'instant", noPostsDesc:'Écrivez votre premier article.',
    readMore:'Lire la suite →', backToList:'← Retour à la liste', archive:'Archives',
    noPosts:'Aucun article.', noSearchResult:'Aucun résultat trouvé.',
    notFound:'Page introuvable.', backHome:"Retour à l'accueil",
    searchResult:(q,n)=>`Résultats pour "${q}" : ${n} trouvé(s)`,
  },
};
const LANG_NAMES = { en:'English', ko:'한국어', zh:'中文', ja:'日本語', fr:'Français' };

async function getLang(cp, request) {
  const cookie = request?.headers?.get('Cookie') || '';
  const m = cookie.match(/cp_lang=([a-z]{2})/);
  if (m && I18N[m[1]]) return m[1];
  try { const s = await cp?.kv?.get('cp:site_lang'); if (s && I18N[s]) return s; } catch(_) {}
  return 'en';
}

/* Public API */
export async function loadTemplate(requestOrCp, cpOrTemplateName, context = {}) {
  let request, cp, templateName;
  if (requestOrCp instanceof Request) {
    request = requestOrCp; cp = cpOrTemplateName;
    templateName = resolveTemplateName(request, cp);
  } else if (requestOrCp && typeof requestOrCp === 'object' && requestOrCp.db) {
    cp = requestOrCp; templateName = cpOrTemplateName || 'index'; request = cp.request;
  } else {
    cp = cpOrTemplateName; templateName = 'index'; request = cp?.request;
  }

  if (request && new URL(request.url).pathname === '/cp-set-lang') return handleLangSwitch(request);
  if (request && new URL(request.url).pathname === '/api/render') return renderApiResponse(request, cp);

  const hierarchy = buildHierarchy(templateName, { ...context, cp });
  for (const tmpl of hierarchy) {
    const content = await fetchTemplate(cp, tmpl);
    if (content !== null) {
      const html = await renderTemplateContent(content, { cp, request, ...context });
      const isFullPage = html.trim().toLowerCase().startsWith('<!doctype');
      return new Response(isFullPage ? html : await wrapInFullPage(html, cp, templateName, { request }),
        { status: 200, headers: buildCacheHeaders(templateName) });
    }
  }

  const lang = await getLang(cp, request);
  const html = await buildDefaultPage(templateName, cp, context, lang, request);
  const status = cp?.query?.is_404 ? 404 : 200;
  return new Response(html, { status, headers: buildCacheHeaders(templateName, status === 404) });
}

export async function renderTemplate(cpOrStr, templateNameOrCtx, context = {}) {
  if (typeof cpOrStr === 'string') return interpolate(cpOrStr, templateNameOrCtx || {});
  const result = await loadTemplate(cpOrStr, templateNameOrCtx, context);
  if (result instanceof Response) return result.text();
  return String(result);
}

export async function getTemplatePart(cp, templateName) {
  for (const tmpl of buildHierarchy(templateName, {})) {
    const content = await fetchTemplate(cp, tmpl);
    if (content !== null) return content;
  }
  return null;
}

async function handleLangSwitch(request) {
  const url = new URL(request.url);
  const lang = url.searchParams.get('lang') || 'en';
  const redirect = url.searchParams.get('redirect') || '/';
  const validLang = I18N[lang] ? lang : 'en';
  return new Response(null, {
    status: 302,
    headers: {
      'Location': redirect,
      'Set-Cookie': `cp_lang=${validLang}; Path=/; Max-Age=31536000; SameSite=Lax`,
    },
  });
}

function buildCacheHeaders(templateName, is404 = false) {
  const h = { 'Content-Type': 'text/html; charset=utf-8', 'Vary': 'Cookie' };
  if (is404) h['Cache-Control'] = 'public, max-age=60, s-maxage=60';
  else if (templateName === 'index' || templateName === 'home')
    h['Cache-Control'] = 'public, max-age=60, s-maxage=300, stale-while-revalidate=60';
  else if (templateName === 'single' || templateName === 'page')
    h['Cache-Control'] = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=300';
  else h['Cache-Control'] = 'public, max-age=120, s-maxage=600, stale-while-revalidate=120';
  return h;
}

async function renderApiResponse(request, cp) {
  const url = new URL(request.url);
  const reqPath = url.searchParams.get('path') || '/';
  let post = null;
  try {
    if (cp?.db) {
      const prefix = cp.db_prefix || 'cp_';
      const slug = reqPath.replace(/^\/+/, '').split('/').pop() || '';
      if (slug) post = await cp.db.prepare(`SELECT ID,post_title,post_content,post_status,post_type FROM ${prefix}posts WHERE post_name=? AND post_status='publish' LIMIT 1`).bind(slug).first();
    }
  } catch (_) {}
  return new Response(JSON.stringify({ post: post || null }), { headers: { 'Content-Type': 'application/json' } });
}

function resolveTemplateName(request, cp) {
  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return 'index';
  if (path.startsWith('/cp-admin')) return 'index';
  const q = cp?.query;
  if (!q) return 'index';
  if (q.is_404) return '404';
  if (q.is_single) return 'single';
  if (q.is_page) return 'page';
  if (q.is_search) return 'search';
  if (q.is_category) return 'category';
  if (q.is_tag) return 'tag';
  if (q.is_author) return 'author';
  if (q.is_archive) return 'archive';
  return 'index';
}

function buildHierarchy(templateName) {
  const map = {
    single:['single','singular','index'], page:['page','singular','index'],
    category:['category','archive','index'], tag:['tag','archive','index'],
    author:['author','archive','index'], archive:['archive','index'],
    search:['search','index'], '404':['404','index'], index:['index'],
  };
  return map[templateName] || ['index'];
}

async function fetchTemplate(cp, name) {
  if (!cp?.kv) return null;
  try { const v = await cp.kv.get(`${KV_PREFIX}${name}`); if (v) return v; } catch (_) {}
  return null;
}

async function renderTemplateContent(content, context) { return interpolate(content, context); }
function interpolate(template, context) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const v = context[key]; return v !== undefined ? escHtml(String(v)) : '';
  });
}

async function buildDefaultPage(templateName, cp, context, lang, request) {
  const L = I18N[lang] || I18N.en;
  const siteName = await getSiteName(cp);
  const siteDesc = await getSiteDesc(cp);
  const siteUrl  = cp?.config?.SITE_URL || '';
  const prefix   = cp?.db_prefix || 'cp_';
  const query    = cp?.query;
  let bodyHtml = '';

  if (query?.is_single || query?.is_page) {
    const post = query.queried_object || (query.posts && query.posts[0]);
    bodyHtml = post ? renderSinglePost(post, L) : render404(L);
  } else if (query?.is_search) {
    bodyHtml = renderSearchResults(query.posts || [], query.search_query || '', L);
  } else if (query?.is_archive || query?.is_category || query?.is_tag) {
    bodyHtml = renderArchive(query.posts || [], query.queried_object, L);
  } else if (query?.is_404) {
    bodyHtml = render404(L);
  } else {
    const posts = (query?.posts && query.posts.length > 0) ? query.posts : await loadRecentPosts(cp, prefix);
    bodyHtml = renderHomePage(posts, siteName, siteDesc, L);
  }

  return wrapInFullPage(bodyHtml, cp, templateName, { siteName, siteUrl, lang, L, request });
}

async function getSiteName(cp) {
  try { return await getOption(cp, 'blogname') || cp?.config?.SITE_NAME || 'CloudPress'; } catch(_) { return cp?.config?.SITE_NAME || 'CloudPress'; }
}
async function getSiteDesc(cp) {
  try { return await getOption(cp, 'blogdescription') || ''; } catch(_) { return ''; }
}
async function loadRecentPosts(cp, prefix) {
  try {
    const res = await cp?.db?.prepare(`SELECT ID,post_title,post_name,post_excerpt,post_content,post_date,post_author FROM ${prefix}posts WHERE post_status='publish' AND post_type='post' ORDER BY post_date DESC LIMIT 10`).all();
    return res?.results || [];
  } catch (_) { return []; }
}

function renderHomePage(posts, siteName, siteDesc, L) {
  if (!posts || posts.length === 0) {
    return `<div class="cp-home-hero"><h1 class="cp-site-title">${escHtml(siteName)}</h1>${siteDesc?`<p class="cp-site-desc">${escHtml(siteDesc)}</p>`:''}</div>
<div class="cp-empty-state"><div class="cp-empty-icon">📝</div><h2>${escHtml(L.noPostsTitle)}</h2><p>${escHtml(L.noPostsDesc)}</p></div>`;
  }
  const postCards = posts.map(p => {
    const excerpt = p.post_excerpt || stripTags(p.post_content || '').slice(0, 160);
    const date = formatDate(p.post_date);
    const href = p.post_name ? `/${p.post_name}` : `/?p=${p.ID}`;
    return `<article class="cp-post-card"><header class="cp-post-card-header"><h2 class="cp-post-card-title"><a href="${href}">${escHtml(p.post_title||'(Untitled)')}</a></h2><time class="cp-post-card-date" datetime="${escHtml(p.post_date||'')}">${escHtml(date)}</time></header>${excerpt?`<div class="cp-post-card-excerpt"><p>${escHtml(excerpt)}${(p.post_content||'').length>160?'…':''}</p></div>`:''}<footer class="cp-post-card-footer"><a href="${href}" class="cp-read-more">${escHtml(L.readMore)}</a></footer></article>`;
  }).join('');
  return `<div class="cp-home-hero"><h1 class="cp-site-title">${escHtml(siteName)}</h1>${siteDesc?`<p class="cp-site-desc">${escHtml(siteDesc)}</p>`:''}</div><main class="cp-posts-list">${postCards}</main>`;
}

function renderSinglePost(post, L) {
  const date = formatDate(post.post_date);
  return `<article class="cp-single-post"><header class="cp-single-header"><h1 class="cp-single-title">${escHtml(post.post_title||'')}</h1><div class="cp-single-meta"><time datetime="${escHtml(post.post_date||'')}">${escHtml(date)}</time></div></header><div class="cp-single-content">${post.post_content||''}</div><footer class="cp-single-footer"><a href="/" class="cp-back-link">${escHtml(L.backToList)}</a></footer></article>`;
}

function renderArchive(posts, queriedObject, L) {
  const title = queriedObject?.name || queriedObject?.post_title || L.archive;
  const cards = posts.map(p => {
    const href = p.post_name ? `/${p.post_name}` : `/?p=${p.ID}`;
    return `<article class="cp-post-card"><h2 class="cp-post-card-title"><a href="${href}">${escHtml(p.post_title||'')}</a></h2><time class="cp-post-card-date">${escHtml(formatDate(p.post_date))}</time></article>`;
  }).join('');
  return `<h1 class="cp-archive-title">${escHtml(title)}</h1><div class="cp-posts-list">${cards||`<p>${escHtml(L.noPosts)}</p>`}</div>`;
}

function renderSearchResults(posts, query, L) {
  const cards = posts.map(p => {
    const href = p.post_name ? `/${p.post_name}` : `/?p=${p.ID}`;
    return `<article class="cp-post-card"><h2 class="cp-post-card-title"><a href="${href}">${escHtml(p.post_title||'')}</a></h2></article>`;
  }).join('');
  return `<h1>${escHtml(L.searchResult(query,posts.length))}</h1><div class="cp-posts-list">${cards||`<p>${escHtml(L.noSearchResult)}</p>`}</div>`;
}

function render404(L) {
  const l = L || I18N.en;
  return `<div class="cp-404"><h1>404</h1><p>${escHtml(l.notFound)}</p><a href="/">${escHtml(l.backHome)}</a></div>`;
}

async function wrapInFullPage(content, cp, templateName, extra = {}) {
  const siteName = extra.siteName || cp?.config?.SITE_NAME || 'CloudPress';
  const lang = extra.lang || 'en';
  const L = extra.L || I18N.en;
  const request = extra.request;
  const currentPath = request ? new URL(request.url).pathname : '/';
  const langSwitcher = Object.entries(LANG_NAMES).map(([code, name]) => {
    const active = code === lang ? ' class="cp-lang-active"' : '';
    return `<a href="/cp-set-lang?lang=${code}&redirect=${encodeURIComponent(currentPath)}"${active}>${escHtml(name)}</a>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="${escHtml(lang)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="CloudPress">
  <title>${escHtml(siteName)}</title>
  <link rel="stylesheet" href="/cp-includes/css/template-fallback.css">
  <style>
    *,*::before,*::after{box-sizing:border-box}
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Noto Sans KR','Noto Sans SC','Noto Sans JP','Malgun Gothic','Segoe UI',sans-serif;line-height:1.7;color:#1d2327;background:#fff;display:flex;flex-direction:column;min-height:100vh}
    a{color:#2271b1;text-decoration:none}a:hover{text-decoration:underline}
    img{max-width:100%;height:auto}
    .cp-container{max-width:860px;margin:0 auto;padding:0 1.5rem}
    .cp-site-wrap{flex:1}
    .cp-header{background:#1d2327;color:#fff;padding:1.1rem 0;box-shadow:0 2px 4px rgba(0,0,0,.15)}
    .cp-header-inner{display:flex;align-items:center;justify-content:space-between;max-width:860px;margin:0 auto;padding:0 1.5rem}
    .cp-header a.cp-site-name{color:#fff;text-decoration:none;font-size:1.35rem;font-weight:700;letter-spacing:-.3px}
    .cp-lang-switcher{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap}
    .cp-lang-switcher a{color:rgba(255,255,255,.6);font-size:.78rem;padding:.2rem .4rem;border-radius:3px;text-decoration:none;transition:.15s}
    .cp-lang-switcher a:hover,.cp-lang-switcher a.cp-lang-active{color:#fff;background:rgba(255,255,255,.18);text-decoration:none}
    .cp-home-hero{padding:1.5rem 0 1rem;border-bottom:1px solid #f0f0f1;margin-bottom:1.75rem}
    .cp-site-title{font-size:2.2rem;font-weight:800;margin:0 0 .5rem;color:#1d2327}
    .cp-site-desc{color:#646970;font-size:1.05rem;margin:0}
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
    .cp-empty-state{text-align:center;padding:2rem 0;color:#646970}
    .cp-empty-icon{font-size:3rem;margin-bottom:1rem}
    .cp-empty-state h2{font-size:1.4rem;color:#1d2327;margin:0 0 .5rem}
    .cp-empty-state p{margin:0 0 1.5rem}
    .cp-404{text-align:center;padding:5rem 0}
    .cp-404 h1{font-size:5rem;font-weight:900;color:#dcdcde;margin:0}
    .cp-404 p{color:#646970;font-size:1.1rem}
    .cp-archive-title{font-size:1.75rem;font-weight:700;margin:0 0 2rem;padding-bottom:1rem;border-bottom:1px solid #f0f0f1}
    .cp-footer{background:#f6f7f7;border-top:1px solid #dcdcde;padding:1.5rem 0;text-align:center;color:#646970;font-size:.85rem}
    .cp-footer a{color:#646970}
    @media(max-width:600px){
      .cp-site-title{font-size:1.6rem}.cp-single-title{font-size:1.5rem}.cp-post-card-title{font-size:1.2rem}
      .cp-lang-switcher{gap:.25rem}.cp-lang-switcher a{font-size:.72rem;padding:.18rem .32rem}
    }
  </style>
</head>
<body>
  <header class="cp-header">
    <div class="cp-header-inner">
      <a href="/" class="cp-site-name">${escHtml(siteName)}</a>
      <div class="cp-lang-switcher">${langSwitcher}</div>
    </div>
  </header>
  <div class="cp-site-wrap">
    <div class="cp-container">${content}</div>
  </div>
  <footer class="cp-footer">
    <div class="cp-container">&copy; ${new Date().getFullYear()} ${escHtml(siteName)}</div>
  </footer>
</body>
</html>`;
}

function stripTags(html) { return String(html||'').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim(); }
function formatDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}); }
  catch(_) { return d; }
}
