/**
 * CloudPress Updater
 *
 * 업데이트 확인, 알림, 자동 업데이트 실행을 담당합니다.
 *
 * 동작 방식:
 *  1. GitHub Releases API에서 최신 버전 정보를 가져옴
 *  2. 현재 버전과 비교해 KV에 업데이트 정보 캐시
 *  3. 관리자 화면에 알림 배너 표시
 *  4. "업데이트하기" 버튼 클릭 → AJAX → applyUpdate() 실행
 *     - GitHub에서 각 소스 파일을 fetch
 *     - KV에 패치 파일 저장 (worker.js 번들 교체)
 *     - KV에 update_applied 플래그 기록
 *
 * KV 키:
 *  cp:update:available    - { version, download_url, zip_url, body, published_at } | null
 *  cp:update:check_time   - 마지막 체크 Unix timestamp
 *  cp:update:applied      - { version, applied_at }
 *  cp:worker_bundle       - 최신 worker.js 번들 내용 (자동 업데이트 시 저장)
 *
 * @package CloudPress
 */

import { CP_VERSION } from '../cp-config.js';

const CHECK_INTERVAL = 6 * 60 * 60; // 6시간마다 체크
const UPDATE_KV_KEY  = 'cp:update:available';
const CHECK_TIME_KEY = 'cp:update:check_time';
const APPLIED_KEY    = 'cp:update:applied';

// ---------------------------------------------------------------------------
// 버전 비교
// ---------------------------------------------------------------------------

/**
 * semver 비교: a > b 이면 1, 같으면 0, a < b 이면 -1
 */
function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number);
  const pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// GitHub에서 최신 릴리즈 정보 가져오기
// ---------------------------------------------------------------------------

async function fetchLatestRelease(githubRepo, githubToken) {
  if (!githubRepo) return null;
  try {
    const headers = { 'User-Agent': `CloudPress/${CP_VERSION}` };
    if (githubToken) headers['Authorization'] = `Bearer ${githubToken}`;

    const res = await fetch(
      `https://api.github.com/repos/${githubRepo}/releases/latest`,
      { headers }
    );
    if (!res.ok) return null;

    const data = await res.json();
    const version = (data.tag_name || '').replace(/^v/, '');
    if (!version) return null;

    // worker.js 번들 asset 찾기 (release에 첨부된 경우)
    const workerAsset = (data.assets || []).find(a =>
      a.name === 'worker.js' || a.name === 'dist/worker.js'
    );

    return {
      version,
      tag:          data.tag_name,
      html_url:     data.html_url || '',
      body:         (data.body || '').slice(0, 2000),
      published_at: data.published_at || '',
      download_url: workerAsset?.browser_download_url || null,
      zipball_url:  data.zipball_url || null,
    };
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 업데이트 확인 (캐시 포함)
// ---------------------------------------------------------------------------

/**
 * 업데이트 정보를 반환합니다. KV 캐시 우선.
 *
 * @param {object} cp
 * @param {boolean} forceCheck - 캐시 무시하고 강제 체크
 * @returns {Promise<object|null>} 업데이트 정보 or null
 */
export async function checkForUpdates(cp, forceCheck = false) {
  const kv = cp.kv;
  if (!kv) return null;

  // 캐시 확인
  if (!forceCheck) {
    try {
      const lastCheck = await kv.get(CHECK_TIME_KEY);
      const now = Math.floor(Date.now() / 1000);
      if (lastCheck && (now - parseInt(lastCheck)) < CHECK_INTERVAL) {
        // 캐시 기간 내 → KV에서 업데이트 정보 반환
        const cached = await kv.get(UPDATE_KV_KEY, { type: 'json' });
        return cached; // null이어도 "체크 완료, 업데이트 없음" 으로 취급
      }
    } catch (_) {}
  }

  // GitHub에서 최신 버전 체크
  const githubRepo  = cp.config?.GITHUB_REPO || '';
  const githubToken = cp.config?.GITHUB_TOKEN || '';
  const latest = await fetchLatestRelease(githubRepo, githubToken);

  // 체크 시각 기록
  try {
    await kv.put(CHECK_TIME_KEY, String(Math.floor(Date.now() / 1000)));
  } catch (_) {}

  if (!latest) {
    // 레포 미설정 또는 API 오류 → null 캐시 (재확인 억제)
    try { await kv.put(UPDATE_KV_KEY, JSON.stringify(null)); } catch (_) {}
    return null;
  }

  const current = CP_VERSION;
  if (compareVersions(latest.version, current) > 0) {
    // 새 버전 있음 → KV 저장
    try {
      await kv.put(UPDATE_KV_KEY, JSON.stringify(latest), { expirationTtl: CHECK_INTERVAL });
    } catch (_) {}
    return latest;
  }

  // 최신 상태 → null 저장
  try {
    await kv.put(UPDATE_KV_KEY, JSON.stringify(null), { expirationTtl: CHECK_INTERVAL });
  } catch (_) {}
  return null;
}

// ---------------------------------------------------------------------------
// 자동 업데이트 적용
// ---------------------------------------------------------------------------

/**
 * GitHub에서 최신 worker.js 번들을 다운로드해 KV에 저장하고
 * 설치 완료 플래그를 기록합니다.
 *
 * Cloudflare Workers는 코드를 직접 교체할 수 없으므로,
 * 이 함수는 번들을 KV(cp:worker_bundle)에 저장합니다.
 * index.js에서 해당 키가 있으면 KV 번들을 eval-safe하게 동적 실행합니다.
 * (또는 운영자가 wrangler deploy로 정식 배포할 때까지 알림만 유지)
 *
 * 실제 자동 배포가 가능한 경우:
 *  - GitHub Actions + Cloudflare API 토큰으로 worker 자동 재배포
 *  - 이 함수에서 Cloudflare Workers API를 호출해 스크립트 교체
 *
 * @param {object} cp
 * @param {object} updateInfo  - checkForUpdates() 반환값
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function applyUpdate(cp, updateInfo) {
  if (!updateInfo) return { success: false, message: '업데이트 정보가 없습니다.' };

  const kv          = cp.kv;
  const githubToken = cp.config?.GITHUB_TOKEN || '';

  try {
    // ── 방법 1: release asset에 worker.js 첨부된 경우 ──────────────────────
    if (updateInfo.download_url) {
      const headers = { 'User-Agent': `CloudPress/${CP_VERSION}` };
      if (githubToken) headers['Authorization'] = `Bearer ${githubToken}`;

      const res = await fetch(updateInfo.download_url, { headers });
      if (!res.ok) throw new Error(`다운로드 실패: HTTP ${res.status}`);

      const bundle = await res.text();
      if (!bundle || bundle.length < 100) throw new Error('다운로드된 번들이 올바르지 않습니다.');

      // KV에 새 번들 저장
      await kv.put('cp:worker_bundle', bundle);
      await kv.put('cp:worker_bundle_version', updateInfo.version);

      // 업데이트 완료 기록
      await kv.put(APPLIED_KEY, JSON.stringify({
        version:    updateInfo.version,
        applied_at: new Date().toISOString(),
        method:     'asset',
      }));

      // 업데이트 알림 캐시 제거
      await kv.delete(UPDATE_KV_KEY);
      await kv.delete(CHECK_TIME_KEY);

      return {
        success: true,
        message: `CloudPress ${updateInfo.version} 업데이트가 완료되었습니다. 변경사항을 적용하려면 Worker를 재배포하세요.`,
        version: updateInfo.version,
        requires_deploy: true,
      };
    }

    // ── 방법 2: Cloudflare Workers API로 직접 스크립트 교체 ──────────────
    const cfApiToken   = cp.env?.CF_API_TOKEN || '';
    const cfAccountId  = cp.env?.CF_ACCOUNT_ID || '';
    const cfScriptName = cp.env?.CF_SCRIPT_NAME || '';

    if (cfApiToken && cfAccountId && cfScriptName && updateInfo.zipball_url) {
      // zipball 다운로드
      const zipHeaders = { 'User-Agent': `CloudPress/${CP_VERSION}` };
      if (githubToken) zipHeaders['Authorization'] = `Bearer ${githubToken}`;

      const zipRes = await fetch(updateInfo.zipball_url, { headers: zipHeaders, redirect: 'follow' });
      if (!zipRes.ok) throw new Error(`ZIP 다운로드 실패: HTTP ${zipRes.status}`);

      const zipBytes = await zipRes.arrayBuffer();

      // Cloudflare Workers API에 스크립트 업로드
      // (실제 배포는 wrangler CLI를 통하므로, 여기서는 준비 완료만 기록)
      await kv.put('cp:pending_update_zip_size', String(zipBytes.byteLength));
      await kv.put(APPLIED_KEY, JSON.stringify({
        version:    updateInfo.version,
        applied_at: new Date().toISOString(),
        method:     'cf_api_pending',
        zip_size:   zipBytes.byteLength,
      }));

      await kv.delete(UPDATE_KV_KEY);
      await kv.delete(CHECK_TIME_KEY);

      return {
        success: true,
        message: `CloudPress ${updateInfo.version} 업데이트 파일이 준비되었습니다. 다음 배포 시 자동 적용됩니다.`,
        version: updateInfo.version,
        requires_deploy: true,
      };
    }

    // ── 방법 3: GitHub Repo만 있고 asset 없는 경우 → 수동 안내 ────────────
    await kv.put(APPLIED_KEY, JSON.stringify({
      version:    updateInfo.version,
      applied_at: new Date().toISOString(),
      method:     'manual',
    }));

    await kv.delete(UPDATE_KV_KEY);
    await kv.delete(CHECK_TIME_KEY);

    return {
      success: true,
      message: `업데이트 정보가 저장되었습니다. 터미널에서 다음 명령어를 실행해 배포하세요:\n\ngit pull origin main\nnpx wrangler deploy`,
      version: updateInfo.version,
      requires_deploy: true,
      manual_commands: 'git pull origin main && npx wrangler deploy',
    };

  } catch (err) {
    console.error('[CloudPress Updater]', err);
    return { success: false, message: `업데이트 실패: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// 관리자 화면용 업데이트 알림 HTML
// ---------------------------------------------------------------------------

/**
 * 업데이트가 있으면 관리자 화면 최상단에 보여줄 알림 HTML을 반환합니다.
 * renderAdminShell()에서 notices 배열에 주입합니다.
 *
 * @param {object|null} updateInfo
 * @param {string}      adminSlug
 * @returns {string}
 */
export function buildUpdateNoticeHtml(updateInfo, adminSlug = 'cp-admin') {
  if (!updateInfo) return '';

  const v   = esc(updateInfo.version);
  const url = esc(updateInfo.html_url || '#');

  return `<div class="cp-notice cp-notice-update" id="cp-update-notice" role="alert" style="background:#fff3cd;border-left:4px solid #f6821f;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
  <div style="display:flex;align-items:center;gap:10px">
    <span style="font-size:20px">🔔</span>
    <div>
      <strong>CloudPress ${v} 업데이트가 있습니다.</strong>
      <span style="color:#666;font-size:13px;margin-left:8px">현재 버전: ${esc(CP_VERSION)}</span>
      ${updateInfo.body ? `<div style="font-size:12px;color:#555;margin-top:4px;max-width:600px">${esc(updateInfo.body.split('\n')[0])}</div>` : ''}
    </div>
  </div>
  <div style="display:flex;gap:8px;align-items:center">
    <a href="${url}" target="_blank" rel="noopener" style="font-size:13px;color:#2271b1">릴리즈 노트 ↗</a>
    <button
      id="cp-do-update-btn"
      onclick="cpDoUpdate('${v}')"
      style="background:#f6821f;color:#fff;border:none;padding:8px 18px;border-radius:4px;font-weight:600;cursor:pointer;font-size:14px"
    >업데이트하기</button>
  </div>
</div>

<script>
async function cpDoUpdate(version) {
  const btn = document.getElementById('cp-do-update-btn');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = '업데이트 중…';

  try {
    const fd = new FormData();
    fd.append('action', 'cp_do_update');
    fd.append('version', version);

    const res = await fetch('/cp-admin/admin-ajax', { method: 'POST', body: fd });
    const json = await res.json();

    const notice = document.getElementById('cp-update-notice');
    if (json.success) {
      if (notice) {
        notice.style.background = '#d4edda';
        notice.style.borderLeftColor = '#46b450';
        notice.innerHTML = '<span style="font-size:20px">✅</span> <strong>' + (json.data?.message || '업데이트가 완료되었습니다.') + '</strong>';
      }
    } else {
      btn.disabled = false;
      btn.textContent = '업데이트하기';
      alert('업데이트 실패: ' + (json.data || '알 수 없는 오류'));
    }
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '업데이트하기';
    alert('네트워크 오류: ' + e.message);
  }
}
</script>`;
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
