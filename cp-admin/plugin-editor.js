/**
 * CloudPress Admin - 플러그인 편집기
 * Replaces WordPress wp-admin/plugin-editor.php
 *
 * KV에 저장된 플러그인 코드를 편집합니다.
 * PHP 및 JS 플러그인 모두 지원.
 *
 * @package CloudPress
 */

import { renderAdminShell } from '../admin-shell.js';

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const PLUGIN_STUB_JS = `/**
 * 플러그인 이름: My Plugin
 * 버전: 1.0.0
 * 설명: CloudPress 플러그인 예제
 */

// 액션 등록
add_action('cp_init', function(cp) {
  // 플러그인 초기화
  console.log('My Plugin 활성화됨');
});

// 필터 등록
add_filter('the_content', function(content) {
  // 콘텐츠 필터
  return content;
});

// 숏코드 등록
add_shortcode('my_shortcode', function(attrs, content, tag) {
  return '<div class="my-shortcode">' + (content || '') + '</div>';
});
`;

const PLUGIN_STUB_PHP = `<?php
/**
 * Plugin Name: My Plugin
 * Version: 1.0.0
 * Description: CloudPress PHP 플러그인 예제
 */

add_action('cp_init', function($cp) {
    // 플러그인 초기화
});

add_filter('the_content', function($content) {
    return $content;
});
`;

async function getPluginList(cp) {
  try {
    const raw = await cp.kv.get('cp:plugins:list', { type: 'json' });
    return Array.isArray(raw) ? raw : [];
  } catch(_) { return []; }
}

export async function handlePluginEditor(request, cp) {
  const url    = new URL(request.url);
  const method = request.method.toUpperCase();

  const plugins       = await getPluginList(cp);
  const selectedSlug  = url.searchParams.get('plugin') || plugins[0]?.slug || '';
  const selectedLang  = url.searchParams.get('lang') || 'js'; // js | php
  let notice = null;
  let fileContent = '';

  const kvKey = `cp:plugin:code:${selectedSlug}`;

  // 저장 처리
  if (method === 'POST') {
    const fd      = await request.formData().catch(() => new FormData());
    const content = fd.get('content') || '';
    const slug    = (fd.get('plugin_slug') || selectedSlug).trim();
    const lang    = fd.get('lang') || 'js';
    const key     = `cp:plugin:code:${slug}`;
    try {
      await cp.kv.put(key, content);
      notice = { type: 'success', message: `"${esc(slug)}" 플러그인 코드가 저장되었습니다.` };
      fileContent = content;
    } catch(e) {
      notice = { type: 'error', message: `저장 실패: ${esc(e?.message || '')}` };
    }
  }

  // 파일 내용 로드
  if (!fileContent && selectedSlug) {
    try {
      const cached = await cp.kv.get(kvKey);
      fileContent = cached !== null ? cached
        : (selectedLang === 'php' ? PLUGIN_STUB_PHP : PLUGIN_STUB_JS);
    } catch(_) {
      fileContent = selectedLang === 'php' ? PLUGIN_STUB_PHP : PLUGIN_STUB_JS;
    }
  }

  const pluginOptions = plugins.map(p =>
    `<option value="${esc(p.slug)}" ${p.slug === selectedSlug ? 'selected' : ''}>${esc(p.name || p.slug)}</option>`
  ).join('');

  const content = `
<style>
.plugin-editor-wrap{display:grid;grid-template-columns:220px 1fr;gap:20px;align-items:start}
.plugin-select-panel{background:#fff;border:1px solid #dcdcde;border-radius:4px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,.07)}
.plugin-select-panel h3{margin:0 0 12px;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:#646970;font-weight:600}
.editor-panel{background:#fff;border:1px solid #dcdcde;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,.07)}
.editor-toolbar{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #dcdcde;background:#f9f9f9;border-radius:4px 4px 0 0;gap:10px;flex-wrap:wrap}
.editor-textarea{width:100%;min-height:520px;border:none;padding:16px;font-family:'JetBrains Mono','Fira Code',monospace;font-size:13px;line-height:1.7;resize:vertical;outline:none;color:#1d2327;background:#fafafa;tab-size:2}
.editor-textarea:focus{background:#fff}
.editor-info{padding:8px 14px;border-top:1px solid #f0f0f1;font-size:12px;color:#646970;display:flex;gap:16px;align-items:center}
@media(max-width:782px){.plugin-editor-wrap{grid-template-columns:1fr}}
</style>

<div class="plugin-editor-wrap">
  <div class="plugin-select-panel">
    <h3>플러그인 선택</h3>
    ${plugins.length > 0 ? `
    <form method="get" action="/cp-admin/plugin-editor" style="margin-bottom:12px">
      <select name="plugin" onchange="this.form.submit()"
              style="width:100%;padding:6px 8px;border:1px solid #dcdcde;border-radius:4px;font-size:13px;margin-bottom:8px">
        ${pluginOptions}
      </select>
      <div style="display:flex;gap:6px">
        <label style="display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer">
          <input type="radio" name="lang" value="js" ${selectedLang !== 'php' ? 'checked' : ''} onchange="this.form.submit()"> JS
        </label>
        <label style="display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer">
          <input type="radio" name="lang" value="php" ${selectedLang === 'php' ? 'checked' : ''} onchange="this.form.submit()"> PHP
        </label>
      </div>
    </form>` : `<p style="color:#646970;font-size:13px">설치된 플러그인이 없습니다.<br><a href="/cp-admin/plugins?tab=add">플러그인 추가</a></p>`}

    <div style="margin-top:16px;padding-top:14px;border-top:1px solid #f0f0f1">
      <h3 style="margin-bottom:10px">새 플러그인 생성</h3>
      <form method="post">
        <input type="text" name="plugin_slug" placeholder="plugin-slug"
               style="width:100%;padding:6px 8px;border:1px solid #dcdcde;border-radius:4px;font-size:12px;margin-bottom:6px">
        <select name="lang" style="width:100%;padding:6px 8px;border:1px solid #dcdcde;border-radius:4px;font-size:12px;margin-bottom:6px">
          <option value="js">JavaScript</option>
          <option value="php">PHP (자동 변환)</option>
        </select>
        <input type="hidden" name="content" value="${esc(PLUGIN_STUB_JS)}">
        <button type="submit" class="cp-btn" style="width:100%;justify-content:center;font-size:12px">생성</button>
      </form>
    </div>

    <div style="margin-top:14px;padding-top:14px;border-top:1px solid #f0f0f1;font-size:12px;color:#646970">
      <strong>API 참고</strong>
      <ul style="margin:6px 0 0;padding-left:14px;line-height:1.8">
        <li>add_action(hook, fn)</li>
        <li>add_filter(hook, fn)</li>
        <li>add_shortcode(tag, fn)</li>
        <li>get_option(key)</li>
        <li>get_posts(args)</li>
        <li>wp_remote_get(url)</li>
      </ul>
    </div>
  </div>

  <div class="editor-panel">
    <div class="editor-toolbar">
      <h3 style="margin:0;font-size:13px;font-weight:600">
        🧩 ${selectedSlug ? esc(selectedSlug) : '플러그인을 선택하세요'}
      </h3>
      <div style="display:flex;gap:8px;align-items:center">
        <span style="font-size:11px;color:#646970;background:#f0f0f1;padding:2px 8px;border-radius:3px">
          ${selectedLang === 'php' ? 'PHP → JS 자동 변환' : 'JavaScript'}
        </span>
      </div>
    </div>
    ${selectedSlug ? `
    <form method="post">
      <input type="hidden" name="plugin_slug" value="${esc(selectedSlug)}">
      <input type="hidden" name="lang" value="${esc(selectedLang)}">
      <textarea name="content" class="editor-textarea" id="code-editor" spellcheck="false"
                onkeydown="handleTab(event)">${esc(fileContent)}</textarea>
      <div class="editor-info">
        <span id="line-count">줄: —</span>
        <span id="char-count">글자: —</span>
        ${selectedLang === 'php' ? '<span style="color:#e67e22;font-weight:600">⚡ PHP 코드는 저장 시 자동으로 JS로 변환됩니다</span>' : ''}
        <span style="margin-left:auto">
          <button type="submit" class="cp-btn" style="font-size:12px;padding:5px 14px">파일 업데이트</button>
        </span>
      </div>
    </form>` : `
    <div style="text-align:center;padding:4rem 0;color:#646970">
      <div style="font-size:2.5rem;margin-bottom:1rem">🧩</div>
      <p>왼쪽에서 편집할 플러그인을 선택하거나 새로 생성하세요.</p>
    </div>`}
  </div>
</div>

<script>
const ta = document.getElementById('code-editor');
if (ta) {
  function updateStats() {
    const lines = ta.value.split('\\n').length;
    document.getElementById('line-count').textContent = '줄: ' + lines.toLocaleString();
    document.getElementById('char-count').textContent = '글자: ' + ta.value.length.toLocaleString();
  }
  function handleTab(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = ta.selectionStart, end = ta.selectionEnd;
      ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(end);
      ta.selectionStart = ta.selectionEnd = s + 2;
      updateStats();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      ta.closest('form').submit();
    }
  }
  ta.addEventListener('input', updateStats);
  updateStats();
}
</script>`;

  return new Response(
    await renderAdminShell(cp, content, { title: '플러그인 편집기', notices: notice ? [notice] : [] }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
