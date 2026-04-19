/**
 * CloudPress Admin - 업데이트 페이지
 * /cp-admin/update-core 또는 /cp-admin/upgrade
 *
 * @package CloudPress
 */

import { renderAdminShell } from '../admin-shell.js';
import { CP_VERSION }       from '../../cp-config.js';
import { checkForUpdates, applyUpdate } from '../../cp-includes/updater.js';

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export async function handleUpgrade(request, cp) {
  const method = request.method.toUpperCase();
  let notices  = [];

  if (method === 'POST') {
    const fd     = await request.formData().catch(() => new FormData());
    const action = fd.get('action') || '';

    if (action === 'do_update') {
      let updateInfo = null;
      try { updateInfo = await cp.kv.get('cp:update:available', { type: 'json' }); } catch (_) {}
      if (!updateInfo) updateInfo = await checkForUpdates(cp, true);

      if (!updateInfo) {
        notices.push({ type: 'error', message: '업데이트 정보를 찾을 수 없습니다. 이미 최신 버전입니다.' });
      } else {
        const result = await applyUpdate(cp, updateInfo);
        notices.push({ type: result.success ? 'success' : 'error', message: result.message });
      }
    }

    if (action === 'flush_update_cache') {
      try {
        await cp.kv.delete('cp:update:available');
        await cp.kv.delete('cp:update:check_time');
      } catch (_) {}
      notices.push({ type: 'success', message: '업데이트 캐시가 삭제되었습니다.' });
    }
  }

  const updateInfo     = await checkForUpdates(cp).catch(() => null);
  const currentVersion = CP_VERSION;
  const isUpToDate     = !updateInfo;

  let appliedRecord = null;
  try { appliedRecord = await cp.kv.get('cp:update:applied', { type: 'json' }); } catch (_) {}

  let lastCheckTime = null;
  try {
    const ts = await cp.kv.get('cp:update:check_time');
    if (ts) lastCheckTime = new Date(parseInt(ts) * 1000).toLocaleString('ko-KR');
  } catch (_) {}

  const githubRepo = cp.config?.GITHUB_REPO || '';

  function mdToHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/^### (.+)$/gm, '<h4 style="margin:12px 0 4px;color:#1d2327">$1</h4>')
      .replace(/^## (.+)$/gm,  '<h3 style="margin:14px 0 6px;color:#1d2327">$1</h3>')
      .replace(/^# (.+)$/gm,   '<h2 style="margin:16px 0 8px;color:#1d2327">$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code style="background:#f5f5f5;padding:1px 5px;border-radius:3px;font-size:12px">$1</code>')
      .replace(/^[-*] (.+)$/gm, '<li style="margin:3px 0">$1</li>')
      .replace(/(<li[\s\S]+?<\/li>)/g, '<ul style="margin:8px 0;padding-left:20px">$1</ul>')
      .replace(/\n/g, '<br>');
  }

  const content = `
<div style="max-width:760px">

  <div class="cp-card" style="margin-bottom:20px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px">
      <div>
        <div style="font-size:12px;color:#888;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">현재 설치 버전</div>
        <div style="font-size:28px;font-weight:800;color:#1d2327">CloudPress <span style="color:#f6821f">${esc(currentVersion)}</span></div>
        ${lastCheckTime ? `<div style="font-size:12px;color:#999;margin-top:6px">마지막 확인: ${esc(lastCheckTime)}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
        ${isUpToDate
          ? `<div style="background:#d4edda;color:#155724;padding:10px 20px;border-radius:6px;font-weight:600;font-size:14px">&#10003; 최신 버전입니다</div>`
          : `<div style="background:#fff3cd;color:#856404;padding:10px 20px;border-radius:6px;font-weight:600;font-size:14px">&#128276; 업데이트 가능</div>`
        }
        <form method="post" style="margin:0">
          <input type="hidden" name="action" value="flush_update_cache">
          <button type="submit" class="cp-btn cp-btn-secondary" style="font-size:12px;padding:4px 12px">다시 확인</button>
        </form>
      </div>
    </div>
  </div>

  ${!githubRepo ? `
  <div class="cp-card" style="background:#fff8e1;border-left:4px solid #f6821f;margin-bottom:20px">
    <h3 style="margin:0 0 8px;color:#e65100">GitHub 저장소가 설정되지 않았습니다</h3>
    <p style="color:#666;margin:0 0 12px;font-size:13px">자동 업데이트를 사용하려면 GitHub CMS 저장소를 설정하세요.</p>
    <a href="/cp-admin/options-general" class="cp-btn" style="font-size:13px">설정으로 이동</a>
  </div>
  ` : ''}

  ${updateInfo ? `
  <div class="cp-card" style="border:2px solid #f6821f;margin-bottom:20px">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:16px;margin-bottom:16px">
      <div>
        <div style="font-size:12px;color:#888;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">새 버전</div>
        <div style="font-size:24px;font-weight:800;color:#f6821f">CloudPress ${esc(updateInfo.version)}</div>
        ${updateInfo.published_at
          ? `<div style="font-size:12px;color:#999;margin-top:4px">출시일: ${esc(new Date(updateInfo.published_at).toLocaleDateString('ko-KR'))}</div>`
          : ''}
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${updateInfo.html_url ? `<a href="${esc(updateInfo.html_url)}" target="_blank" rel="noopener" class="cp-btn cp-btn-secondary">릴리즈 노트 &#8599;</a>` : ''}
        <button
          id="cp-update-btn"
          onclick="cpStartUpdate('${esc(updateInfo.version)}')"
          class="cp-btn"
          style="background:#f6821f;border-color:#f6821f;font-size:15px;padding:10px 24px;font-weight:700"
        >업데이트하기 (v${esc(updateInfo.version)})</button>
      </div>
    </div>

    <div id="cp-update-progress" style="display:none;margin-bottom:16px">
      <div style="background:#f5f5f5;border-radius:6px;padding:14px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <div id="cp-update-spinner" style="width:18px;height:18px;border:3px solid #f6821f;border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0"></div>
          <span id="cp-update-status" style="font-weight:600;color:#333">업데이트 준비 중...</span>
        </div>
        <div id="cp-update-log" style="font-size:12px;color:#666;font-family:monospace;white-space:pre-wrap;max-height:120px;overflow-y:auto"></div>
      </div>
    </div>

    <noscript>
      <form method="post" style="margin:0">
        <input type="hidden" name="action" value="do_update">
        <button type="submit" class="cp-btn" style="background:#f6821f;border-color:#f6821f">업데이트하기 (페이지 방식)</button>
      </form>
    </noscript>

    ${updateInfo.body ? `
    <details style="margin-top:12px">
      <summary style="cursor:pointer;font-weight:600;color:#1d2327;user-select:none">릴리즈 노트 펼치기</summary>
      <div style="margin-top:12px;padding:14px;background:#fafafa;border-radius:6px;font-size:13px;line-height:1.7;max-height:300px;overflow-y:auto">
        ${mdToHtml(updateInfo.body)}
      </div>
    </details>` : ''}
  </div>
  ` : `
  <div class="cp-card" style="margin-bottom:20px">
    <div style="color:#155724;font-size:15px">&#10003; CloudPress ${esc(currentVersion)}은(는) 최신 버전입니다.</div>
    ${githubRepo ? `<p style="color:#666;font-size:13px;margin:8px 0 0">GitHub 저장소: <code>${esc(githubRepo)}</code></p>` : ''}
  </div>
  `}

  ${appliedRecord ? `
  <div class="cp-card" style="margin-bottom:20px">
    <h3 style="margin:0 0 12px">마지막 업데이트 이력</h3>
    <table style="width:100%;font-size:13px;border-collapse:collapse">
      <tr><td style="padding:5px 0;color:#646970;width:140px">적용 버전</td><td><strong>v${esc(appliedRecord.version)}</strong></td></tr>
      <tr><td style="padding:5px 0;color:#646970">적용 시각</td><td>${esc(new Date(appliedRecord.applied_at).toLocaleString('ko-KR'))}</td></tr>
      <tr><td style="padding:5px 0;color:#646970">방법</td><td>${esc(appliedRecord.method === 'asset' ? '자동 (Worker 번들 교체)' : appliedRecord.method === 'manual' ? '수동 배포 안내' : appliedRecord.method)}</td></tr>
    </table>
  </div>
  ` : ''}

  <div class="cp-card">
    <h3 style="margin:0 0 12px">수동 업데이트 방법</h3>
    <ol style="color:#555;font-size:13px;line-height:2;margin:0 0 12px;padding-left:20px">
      <li>GitHub 저장소에서 최신 코드를 가져옵니다</li>
      <li><code style="background:#f5f5f5;padding:1px 6px;border-radius:3px">npx wrangler deploy</code>로 Cloudflare Workers에 배포합니다</li>
      <li>배포 완료 후 이 페이지에서 버전이 업데이트된 것을 확인합니다</li>
    </ol>
    <pre style="background:#1d2327;color:#a7aaad;padding:14px;border-radius:6px;font-size:13px;overflow-x:auto">git pull origin main
npx wrangler deploy</pre>
  </div>

</div>

<style>@keyframes spin { to { transform: rotate(360deg); } }</style>

<script>
async function cpStartUpdate(version) {
  const btn      = document.getElementById('cp-update-btn');
  const progress = document.getElementById('cp-update-progress');
  const statusEl = document.getElementById('cp-update-status');
  const logEl    = document.getElementById('cp-update-log');
  const spinner  = document.getElementById('cp-update-spinner');
  if (!btn) return;

  if (!confirm('CloudPress ' + version + '(으)로 업데이트하시겠습니까?')) return;

  btn.disabled = true;
  btn.style.opacity = '0.6';
  btn.textContent = '업데이트 중...';
  if (progress) progress.style.display = 'block';

  function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }
  function addLog(msg)    { if (logEl) { logEl.textContent += msg + '\n'; logEl.scrollTop = logEl.scrollHeight; } }

  try {
    setStatus('서버에 업데이트 요청 중...');
    addLog('[' + new Date().toLocaleTimeString('ko-KR') + '] 업데이트 시작: v' + version);

    const fd = new FormData();
    fd.append('action', 'cp_do_update');
    fd.append('version', version);

    const res  = await fetch('/cp-admin/admin-ajax', { method: 'POST', body: fd });
    const json = await res.json();

    if (json.success) {
      const data = json.data || {};
      addLog('[' + new Date().toLocaleTimeString('ko-KR') + '] 완료: ' + (data.message || '업데이트 완료'));
      setStatus('완료!');
      if (spinner) { spinner.style.border = '3px solid #46b450'; }

      const card = btn.closest('.cp-card');
      if (card) { card.style.borderColor = '#46b450'; card.style.background = '#f0fff4'; }

      if (data.requires_deploy) {
        addLog('');
        addLog('변경사항 반영을 위해 Worker 재배포가 필요합니다:');
        addLog('  git pull origin main && npx wrangler deploy');
      }
      setTimeout(() => location.reload(), 3000);
    } else {
      addLog('[' + new Date().toLocaleTimeString('ko-KR') + '] 실패: ' + (json.data || '알 수 없는 오류'));
      setStatus('업데이트 실패');
      if (spinner) spinner.style.borderTopColor = '#d63638';
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.textContent = '다시 시도';
    }
  } catch (e) {
    addLog('네트워크 오류: ' + e.message);
    setStatus('네트워크 오류');
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.textContent = '다시 시도';
  }
}
</script>`;

  return new Response(
    await renderAdminShell(cp, content, {
      title: '업데이트',
      notices,
      skipUpdateCheck: true,
    }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
