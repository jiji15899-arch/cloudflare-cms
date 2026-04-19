/**
 * CloudPress Admin - 테마 편집기
 * Replaces WordPress wp-admin/theme-editor.php
 *
 * KV에 저장된 테마 파일 또는 GitHub 테마 파일을 편집합니다.
 *
 * @package CloudPress
 */

import { renderAdminShell } from '../admin-shell.js';
import { getOption }        from '../../cp-includes/option.js';

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const THEME_FILE_TEMPLATES = {
  'index.html':    '<!DOCTYPE html>\n<html lang="ko">\n<head>\n  <meta charset="UTF-8">\n  <title>{{cp.config.SITE_NAME}}</title>\n</head>\n<body>\n  <h1>{{cp.config.SITE_NAME}}</h1>\n  {{content}}\n</body>\n</html>',
  'single.html':   '<!DOCTYPE html>\n<html lang="ko">\n<head>\n  <meta charset="UTF-8">\n  <title>{{post.post_title}}</title>\n</head>\n<body>\n  <article>\n    <h1>{{post.post_title}}</h1>\n    <div>{{post.post_content}}</div>\n  </article>\n</body>\n</html>',
  'page.html':     '<!DOCTYPE html>\n<html lang="ko">\n<head>\n  <meta charset="UTF-8">\n  <title>{{post.post_title}}</title>\n</head>\n<body>\n  <article>\n    <h1>{{post.post_title}}</h1>\n    <div>{{post.post_content}}</div>\n  </article>\n</body>\n</html>',
  'archive.html':  '<!DOCTYPE html>\n<html lang="ko">\n<head>\n  <meta charset="UTF-8">\n  <title>아카이브</title>\n</head>\n<body>\n  <h1>아카이브</h1>\n</body>\n</html>',
  'style.css':     '/* 테마 스타일시트 */\n:root {\n  --color-primary: #2271b1;\n  --color-text: #1d2327;\n}\n\nbody {\n  font-family: system-ui, sans-serif;\n  color: var(--color-text);\n  max-width: 1200px;\n  margin: 0 auto;\n  padding: 0 1rem;\n}\n',
  'functions.js':  '// 테마 함수 파일\n// add_action, add_filter 등 사용 가능\n\nadd_action(\'cp_head\', function() {\n  // head에 추가할 내용\n});\n',
};

const THEME_FILES = Object.keys(THEME_FILE_TEMPLATES);

export async function handleThemeEditor(request, cp) {
  const url    = new URL(request.url);
  const method = request.method.toUpperCase();

  const activeTheme = await getOption(cp, 'template', '').catch(() => '');
  const selectedFile = url.searchParams.get('file') || 'index.html';
  let notice = null;
  let fileContent = '';

  // KV 키
  const kvKey = `cp:template:${selectedFile}`;

  // 저장 처리
  if (method === 'POST') {
    const fd      = await request.formData().catch(() => new FormData());
    const content = fd.get('content') || '';
    const file    = (fd.get('file') || selectedFile).trim();
    const key     = `cp:template:${file}`;
    try {
      await cp.kv.put(key, content);
      notice = { type: 'success', message: `"${esc(file)}" 파일이 저장되었습니다.` };
      fileContent = content;
    } catch(e) {
      notice = { type: 'error', message: `저장 실패: ${esc(e?.message || '알 수 없는 오류')}` };
    }
  }

  // 파일 내용 로드 (KV → 기본 템플릿)
  if (!fileContent) {
    try {
      const cached = await cp.kv.get(kvKey);
      fileContent = cached !== null ? cached : (THEME_FILE_TEMPLATES[selectedFile] || '');
    } catch(_) {
      fileContent = THEME_FILE_TEMPLATES[selectedFile] || '';
    }
  }

  // 언어 감지
  const lang = selectedFile.endsWith('.css') ? 'css'
    : selectedFile.endsWith('.js') ? 'javascript'
    : selectedFile.endsWith('.html') ? 'html'
    : 'text';

  const fileLinks = THEME_FILES.map(f => {
    const isActive = f === selectedFile;
    return `<a href="/cp-admin/theme-editor?file=${encodeURIComponent(f)}"
       style="display:block;padding:6px 12px;font-size:13px;border-radius:4px;text-decoration:none;
              background:${isActive ? '#2271b1' : 'transparent'};
              color:${isActive ? '#fff' : '#1d2327'};
              font-weight:${isActive ? '600' : '400'};
              margin-bottom:2px"
    >${esc(f)}</a>`;
  }).join('');

  const content = `
<style>
.theme-editor-wrap{display:grid;grid-template-columns:180px 1fr;gap:20px;align-items:start}
.theme-file-list{background:#fff;border:1px solid #dcdcde;border-radius:4px;padding:10px;box-shadow:0 1px 3px rgba(0,0,0,.07)}
.theme-file-list h3{margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:#646970;font-weight:600;padding-bottom:8px;border-bottom:1px solid #f0f0f1}
.editor-panel{background:#fff;border:1px solid #dcdcde;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,.07)}
.editor-toolbar{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #dcdcde;background:#f9f9f9;border-radius:4px 4px 0 0}
.editor-toolbar h3{margin:0;font-size:13px;font-weight:600}
.editor-textarea{width:100%;min-height:520px;border:none;padding:16px;font-family:'JetBrains Mono','Fira Code','Cascadia Code',monospace;font-size:13px;line-height:1.7;resize:vertical;outline:none;color:#1d2327;background:#fafafa;border-radius:0 0 4px 4px;tab-size:2}
.editor-textarea:focus{background:#fff}
.editor-info{padding:8px 14px;border-top:1px solid #f0f0f1;font-size:12px;color:#646970;display:flex;gap:16px}
@media(max-width:782px){.theme-editor-wrap{grid-template-columns:1fr}.theme-file-list{display:flex;gap:6px;flex-wrap:wrap}.theme-file-list a{padding:4px 10px!important}}
</style>

${!activeTheme ? `
<div class="cp-notice cp-notice-warning">
  <p>활성화된 테마가 없습니다. <a href="/cp-admin/themes">테마 페이지</a>에서 테마를 설치하고 활성화하세요. 아래에서 파일을 편집하면 KV에 저장되어 즉시 적용됩니다.</p>
</div>` : `
<p style="color:#646970;margin:0 0 16px;font-size:13px">현재 테마: <strong>${esc(activeTheme)}</strong> — 파일을 편집하면 KV 캐시에 저장되어 즉시 적용됩니다.</p>`}

<div class="theme-editor-wrap">
  <div class="theme-file-list">
    <h3>테마 파일</h3>
    ${fileLinks}
    <div style="margin-top:12px;padding-top:10px;border-top:1px solid #f0f0f1">
      <p style="font-size:11px;color:#646970;margin:0 0 6px">새 파일 추가</p>
      <form method="post" style="display:flex;flex-direction:column;gap:6px">
        <input type="text" name="file" placeholder="파일명.html"
               style="padding:5px 8px;border:1px solid #dcdcde;border-radius:3px;font-size:12px;width:100%">
        <input type="hidden" name="content" value="">
        <button type="submit" class="cp-btn" style="font-size:12px;padding:4px 10px">생성</button>
      </form>
    </div>
  </div>

  <div class="editor-panel">
    <div class="editor-toolbar">
      <h3>📄 ${esc(selectedFile)}</h3>
      <div style="display:flex;gap:8px;align-items:center">
        <span style="font-size:11px;color:#646970;background:#f0f0f1;padding:2px 8px;border-radius:3px">${esc(lang.toUpperCase())}</span>
        <button type="button" class="cp-btn cp-btn-secondary" style="font-size:12px;padding:4px 10px" onclick="formatCode()">서식 정렬</button>
      </div>
    </div>
    <form method="post">
      <input type="hidden" name="file" value="${esc(selectedFile)}">
      <textarea name="content" class="editor-textarea" id="code-editor" spellcheck="false"
                onkeydown="handleTab(event)">${esc(fileContent)}</textarea>
      <div class="editor-info">
        <span id="line-count">줄: 계산 중…</span>
        <span id="char-count">글자: 계산 중…</span>
        <span style="margin-left:auto">
          <button type="submit" class="cp-btn" style="font-size:12px;padding:5px 14px">파일 업데이트</button>
        </span>
      </div>
    </form>
  </div>
</div>

<script>
const ta = document.getElementById('code-editor');

function updateStats() {
  const lines = ta.value.split('\\n').length;
  const chars = ta.value.length;
  document.getElementById('line-count').textContent = '줄: ' + lines.toLocaleString();
  document.getElementById('char-count').textContent = '글자: ' + chars.toLocaleString();
}

function handleTab(e) {
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    ta.value = ta.value.slice(0, start) + '  ' + ta.value.slice(end);
    ta.selectionStart = ta.selectionEnd = start + 2;
    updateStats();
  }
  // Ctrl+S / Cmd+S → 저장
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    ta.closest('form').submit();
  }
}

function formatCode() {
  // 간단한 들여쓰기 정규화
  try {
    const lang = '${esc(lang)}';
    if (lang === 'javascript') {
      alert('JS 자동 포맷은 Prettier 등 외부 도구를 사용하세요.');
    } else {
      alert('현재 자동 포맷은 JavaScript만 지원합니다.');
    }
  } catch(_) {}
}

ta.addEventListener('input', updateStats);
updateStats();

// 단축키 안내
document.querySelector('.editor-info').insertAdjacentHTML('beforeend',
  '<span style="color:#c3c4c7;font-size:11px">Ctrl+S: 저장 · Tab: 들여쓰기</span>'
);
</script>`;

  return new Response(
    await renderAdminShell(cp, content, { title: '테마 편집기', notices: notice ? [notice] : [] }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
