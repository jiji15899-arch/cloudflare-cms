/**
 * Bootstrap for CloudPress.
 * Replaces WordPress wp-load.php
 *
 * [v3.0 수정]
 * - HookSystem을 plugin-loader의 완전한 구현으로 교체
 * - removeFilter, hasFilter, didAction, shortcode 지원
 *
 * @package CloudPress
 */

import { loadConfig }        from './cp-config.js';
import { cpSettings }        from './cp-settings.js';

export async function cpLoad(request, env, ctx, options = {}) {
  if (!env.CP_DB) {
    return errorResponse(
      'CloudPress 오류: D1 데이터베이스 바인딩 <code>CP_DB</code>가 설정되지 않았습니다. ' +
      'Cloudflare Workers 설정에서 <strong>CP_DB</strong>라는 D1 데이터베이스 바인딩을 추가하세요.'
    );
  }
  if (!env.CP_KV) {
    return errorResponse(
      'CloudPress 오류: KV 네임스페이스 바인딩 <code>CP_KV</code>가 설정되지 않았습니다. ' +
      'Cloudflare Workers 설정에서 <strong>CP_KV</strong>라는 KV 네임스페이스 바인딩을 추가하세요.'
    );
  }

  let config;
  try {
    config = await loadConfig(env);
  } catch (e) {
    return errorResponse(
      `CloudPress 오류: 설정을 로드할 수 없습니다. ${e.message}<br>` +
      '<code>cp-config.js</code>가 올바르게 설정되어 있는지 확인하거나 <a href="/cp-admin/setup-config">설치 마법사</a>를 실행하세요.'
    );
  }

  const cp = {
    db:     env.CP_DB,
    kv:     env.CP_KV,
    github: env.GITHUB_TOKEN || null,
    config,
    request,
    env,
    ctx,
    url:      new URL(request.url),
    options,
    query:    {},
    currentUser: null,
    hooks:    createHookSystem(),
    db_prefix: config.DB_PREFIX || 'cp_',
    version:  '3.0.0',
  };

  await cpSettings(cp);
  return cp;
}

// ─── 완전한 WordPress 호환 훅 시스템 ──────────────────────────────────────

function createHookSystem() {
  const registry  = { actions: {}, filters: {} };
  const _done     = new Set();
  const _current  = [];
  const _shortcodes = {};

  function sortHooks(list) {
    list.sort((a, b) => a.priority - b.priority);
  }

  return {
    // Filters
    addFilter(hook, callback, priority = 10, acceptedArgs = 1) {
      if (!registry.filters[hook]) registry.filters[hook] = [];
      registry.filters[hook].push({ callback, priority, acceptedArgs });
      sortHooks(registry.filters[hook]);
    },
    removeFilter(hook, callback, priority = 10) {
      if (!registry.filters[hook]) return false;
      registry.filters[hook] = registry.filters[hook].filter(
        h => !(h.callback === callback && h.priority === priority)
      );
      return true;
    },
    applyFilters(hook, value, ...args) {
      if (!registry.filters[hook]) return value;
      let result = value;
      for (const h of registry.filters[hook]) {
        try {
          const pass = [result, ...args].slice(0, h.acceptedArgs);
          const r = h.callback(...pass);
          if (r !== undefined) result = r;
        } catch(e) {
          console.error(`[hooks] applyFilters "${hook}":`, e?.message);
        }
      }
      return result;
    },
    hasFilter(hook, callback) {
      if (!registry.filters[hook]) return false;
      if (!callback) return registry.filters[hook].length > 0;
      return registry.filters[hook].some(h => h.callback === callback);
    },

    // Actions
    addAction(hook, callback, priority = 10, acceptedArgs = 1) {
      if (!registry.actions[hook]) registry.actions[hook] = [];
      registry.actions[hook].push({ callback, priority, acceptedArgs });
      sortHooks(registry.actions[hook]);
    },
    removeAction(hook, callback, priority = 10) {
      if (!registry.actions[hook]) return false;
      registry.actions[hook] = registry.actions[hook].filter(
        h => !(h.callback === callback && h.priority === priority)
      );
      return true;
    },
    doAction(hook, ...args) {
      _current.push(hook);
      if (registry.actions[hook]) {
        for (const h of registry.actions[hook]) {
          try {
            const pass = args.slice(0, h.acceptedArgs);
            h.callback(...pass);
          } catch(e) {
            console.error(`[hooks] doAction "${hook}":`, e?.message);
          }
        }
      }
      _done.add(hook);
      _current.pop();
    },
    didAction:     (hook) => _done.has(hook),
    currentFilter: ()     => _current[_current.length - 1] || '',
    hasAction:     (hook, cb) => {
      if (!registry.actions[hook]) return false;
      if (!cb) return registry.actions[hook].length > 0;
      return registry.actions[hook].some(h => h.callback === cb);
    },

    // Shortcodes
    addShortcode(tag, callback) { _shortcodes[tag] = callback; },
    removeShortcode(tag)        { delete _shortcodes[tag]; },
    doShortcode(content) {
      if (!content) return content;
      return content.replace(
        /\[(\w+)((?:\s+\w+="[^"]*")*)\s*(?:\]([\s\S]*?)\[\/\1\]|\s*\/\])/g,
        (match, tag, attrsStr, inner) => {
          const cb = _shortcodes[tag];
          if (!cb) return match;
          const attrs = {};
          const re = /(\w+)="([^"]*)"/g; let m;
          while ((m = re.exec(attrsStr || ''))) attrs[m[1]] = m[2];
          try { return String(cb(attrs, inner || '', tag) || ''); }
          catch(_) { return match; }
        }
      );
    },
  };
}

function errorResponse(message) {
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CloudPress › 오류</title>
  <link rel="stylesheet" href="/cp-includes/css/error.css">
</head>
<body>
  <div class="error-box">
    <h1>CloudPress › 설정 오류</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;

  return {
    __cpError: true,
    response: new Response(html, {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  };
}
