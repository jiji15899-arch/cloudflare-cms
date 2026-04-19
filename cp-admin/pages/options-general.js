/**
 * CloudPress Admin - General Options
 * Replaces WordPress wp-admin/options-general.php
 *
 * 변경사항:
 *  - 언어(WPLANG) 선택 추가, 기본값 ko_KR (한국어)
 *  - GitHub Integration 섹션 유지
 *
 * @package CloudPress
 */

import { renderAdminShell } from '../admin-shell.js';
import { getOption, updateOption } from '../../cp-includes/option.js';

export async function handleOptionsGeneral(request, cp) {
  const method  = request.method.toUpperCase();
  let notices   = [];

  const optionKeys = [
    'blogname', 'blogdescription', 'siteurl', 'admin_email',
    'blogcharset', 'date_format', 'time_format', 'timezone_string',
    'gmt_offset', 'start_of_week', 'default_role',
    'users_can_register', 'cp_github_repo', 'WPLANG',
  ];

  if (method === 'POST') {
    const fd = await request.formData().catch(() => new FormData());

    for (const key of optionKeys) {
      const val = fd.get(key);
      if (val !== null) {
        await updateOption(cp, key, val);
      }
    }

    // KV config 동기화
    const newRepo = fd.get('cp_github_repo') || '';
    const newLang = fd.get('WPLANG') || 'ko_KR';
    try {
      const cfg = await cp.kv.get('cp:config', { type: 'json' }) || {};
      cfg.GITHUB_REPO = newRepo;
      cfg.WPLANG = newLang;
      await cp.kv.put('cp:config', JSON.stringify(cfg));
    } catch (_) {}

    notices.push({ type: 'success', message: getLangString(fd.get('WPLANG') || 'ko_KR', 'saved') });
  }

  const opts = {};
  for (const key of optionKeys) {
    opts[key] = await getOption(cp, key).catch(() => '');
  }

  // 언어 기본값 한국어
  const currentLang = opts.WPLANG || cp.config?.WPLANG || 'ko_KR';
  const githubToken = cp.config.GITHUB_TOKEN || cp.env?.CP_GITHUB_TOKEN || '';
  // Load admin slug
  let adminSlug = cp.config?.ADMIN_SLUG || 'cp-admin';
  try {
    const stored = await cp.kv.get('cp:admin_slug');
    if (stored) adminSlug = stored;
  } catch (_) {}

  // UI 언어에 따른 레이블
  const L = getLabels(currentLang);

  const content = `
<form method="post">
  <!-- ── 사이트 기본 설정 ─────────────────────────────── -->
  <div class="cp-card">
    <h2>${L.siteSettings}</h2>
    <table class="cp-form-table">
      <tr>
        <th><label for="blogname">${L.siteTitle}</label></th>
        <td><input type="text" id="blogname" name="blogname" class="cp-form-input"
                   value="${esc(opts.blogname)}"></td>
      </tr>
      <tr>
        <th><label for="blogdescription">${L.tagline}</label></th>
        <td>
          <input type="text" id="blogdescription" name="blogdescription" class="cp-form-input"
                 value="${esc(opts.blogdescription)}">
          <p class="cp-description">${L.taglineDesc}</p>
        </td>
      </tr>
      <tr>
        <th><label for="siteurl">${L.siteUrl}</label></th>
        <td>
          <input type="url" id="siteurl" name="siteurl" class="cp-form-input"
                 value="${esc(opts.siteurl)}">
          <p class="cp-description">${L.siteUrlDesc}</p>
        </td>
      </tr>
      <tr>
        <th><label for="admin_email">${L.adminEmail}</label></th>
        <td>
          <input type="email" id="admin_email" name="admin_email" class="cp-form-input"
                 value="${esc(opts.admin_email)}">
        </td>
      </tr>
      <tr>
        <th><label for="users_can_register">${L.membership}</label></th>
        <td>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" id="users_can_register" name="users_can_register" value="1"
                   ${opts.users_can_register === '1' ? 'checked' : ''}>
            ${L.anyoneCanRegister}
          </label>
        </td>
      </tr>
      <tr>
        <th><label for="default_role">${L.defaultRole}</label></th>
        <td>
          <select id="default_role" name="default_role" class="cp-form-select">
            ${['subscriber','contributor','author','editor','administrator'].map(role =>
              `<option value="${role}" ${opts.default_role === role ? 'selected' : ''}>${capitalize(role)}</option>`
            ).join('')}
          </select>
          <p class="cp-description">${L.defaultRoleDesc}</p>
        </td>
      </tr>
    </table>
  </div>

  <!-- ── 언어 설정 ────────────────────────────────────── -->
  <div class="cp-card">
    <h2>${L.language}</h2>
    <table class="cp-form-table">
      <tr>
        <th><label for="WPLANG">${L.siteLanguage}</label></th>
        <td>
          <select id="WPLANG" name="WPLANG" class="cp-form-select" onchange="updateLangPreview(this.value)">
            ${LANGUAGES.map(lang =>
              `<option value="${lang.code}" ${currentLang === lang.code ? 'selected' : ''}>${lang.native} — ${lang.label}</option>`
            ).join('')}
          </select>
          <p class="cp-description" id="lang-preview">${L.langDesc}</p>
        </td>
      </tr>
    </table>
  </div>

  <!-- ── 날짜 & 시간 ──────────────────────────────────── -->
  <div class="cp-card">
    <h2>${L.dateTime}</h2>
    <table class="cp-form-table">
      <tr>
        <th><label for="date_format">${L.dateFormat}</label></th>
        <td>
          <input type="text" id="date_format" name="date_format" class="cp-form-input"
                 value="${esc(opts.date_format || 'Y년 m월 d일')}">
          <p class="cp-description">${L.dateFormatDesc}</p>
        </td>
      </tr>
      <tr>
        <th><label for="time_format">${L.timeFormat}</label></th>
        <td>
          <input type="text" id="time_format" name="time_format" class="cp-form-input"
                 value="${esc(opts.time_format || 'g:i a')}">
        </td>
      </tr>
      <tr>
        <th><label for="timezone_string">${L.timezone}</label></th>
        <td>
          <select id="timezone_string" name="timezone_string" class="cp-form-select">
            ${getTimezones().map(tz =>
              `<option value="${esc(tz)}" ${opts.timezone_string === tz ? 'selected' : (tz === 'Asia/Seoul' && !opts.timezone_string ? 'selected' : '')}>${esc(tz)}</option>`
            ).join('')}
          </select>
        </td>
      </tr>
      <tr>
        <th><label for="start_of_week">${L.weekStartsOn}</label></th>
        <td>
          <select id="start_of_week" name="start_of_week" class="cp-form-select">
            ${['일요일','월요일','화요일','수요일','목요일','금요일','토요일'].map((d,i) =>
              `<option value="${i}" ${(opts.start_of_week ?? '0') == i ? 'selected' : ''}>${d}</option>`
            ).join('')}
          </select>
        </td>
      </tr>
    </table>
  </div>

  <!-- ── Admin Security ───────────────────────────── -->
  <div class="cp-card" id="admin-security">
    <h2>&#128274; 관리자 보안</h2>
    <table class="cp-form-table">
      <tr>
        <th>관리자 URL</th>
        <td>
          <code style="font-size:14px">/${esc(adminSlug)}/</code>
          <p class="cp-description">설치 시 자동 생성된 보안 관리자 URL입니다. 이 URL을 안전하게 보관하세요.</p>
        </td>
      </tr>
    </table>
  </div>

  <!-- ── GitHub Integration ───────────────────────────── -->
  <div class="cp-card" id="github">
    <h2>&#127758; GitHub Integration</h2>
    <p style="color:#646970;font-size:13.5px;margin-bottom:16px">
      Connect a GitHub repository to install themes and plugins.
      Set your token as a Cloudflare Worker secret: <code>npx wrangler secret put CP_GITHUB_TOKEN</code>
    </p>
    <table class="cp-form-table">
      <tr>
        <th><label for="cp_github_repo">GitHub Repository</label></th>
        <td>
          <input type="text" id="cp_github_repo" name="cp_github_repo" class="cp-form-input"
                 value="${esc(opts.cp_github_repo || cp.config.GITHUB_REPO || '')}"
                 placeholder="owner/repo-name">
          <p class="cp-description">
            GitHub repo containing <code>themes/</code> and <code>plugins/</code> folders.
            Example: <code>myorg/cloudpress-themes</code>
          </p>
        </td>
      </tr>
      <tr>
        <th>GitHub Token</th>
        <td>
          <span class="cp-badge ${githubToken ? 'cp-badge-publish' : 'cp-badge-draft'}">
            ${githubToken ? '&#10003; Token configured' : '&#8855; Not configured'}
          </span>
          ${!githubToken ? `
          <p class="cp-description" style="margin-top:8px">
            <code>npx wrangler secret put CP_GITHUB_TOKEN</code><br>
            <a href="https://github.com/settings/tokens" target="_blank">github.com/settings/tokens</a>
          </p>` : ''}
        </td>
      </tr>
    </table>
  </div>

  <p>
    <button type="submit" class="cp-btn">${L.saveChanges}</button>
  </p>
</form>

<script>
const LANG_DESCS = ${JSON.stringify(Object.fromEntries(LANGUAGES.map(l => [l.code, l.desc])))};
function updateLangPreview(code) {
  document.getElementById('lang-preview').textContent = LANG_DESCS[code] || '';
}
</script>
`;

  const html = await renderAdminShell(cp, content, { title: L.generalSettings, notices });
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ---------------------------------------------------------------------------
// 지원 언어 목록
// ---------------------------------------------------------------------------

const LANGUAGES = [
  { code: 'ko_KR', native: '한국어',     label: 'Korean',              desc: '한국어로 관리자 화면이 표시됩니다.' },
  { code: 'en_US', native: 'English',    label: 'English (US)',        desc: 'Admin interface will be displayed in English.' },
  { code: 'ja',    native: '日本語',     label: 'Japanese',            desc: '管理画面が日本語で表示されます。' },
  { code: 'zh_CN', native: '简体中文',   label: 'Chinese (Simplified)',desc: '管理界面将以简体中文显示。' },
  { code: 'zh_TW', native: '繁體中文',   label: 'Chinese (Traditional)',desc: '管理介面將以繁體中文顯示。' },
  { code: 'de_DE', native: 'Deutsch',    label: 'German',              desc: 'Die Verwaltungsoberfläche wird auf Deutsch angezeigt.' },
  { code: 'fr_FR', native: 'Français',   label: 'French',              desc: "L'interface d'administration sera affichée en français." },
  { code: 'es_ES', native: 'Español',    label: 'Spanish',             desc: 'La interfaz de administración se mostrará en español.' },
  { code: 'pt_BR', native: 'Português',  label: 'Portuguese (Brazil)', desc: 'A interface de administração será exibida em português.' },
  { code: 'ru_RU', native: 'Русский',    label: 'Russian',             desc: 'Интерфейс администратора будет отображаться на русском языке.' },
  { code: 'ar',    native: 'العربية',    label: 'Arabic',              desc: 'ستظهر واجهة الإدارة باللغة العربية.' },
  { code: 'hi_IN', native: 'हिन्दी',     label: 'Hindi',               desc: 'प्रशासन इंटरफ़ेस हिंदी में प्रदर्शित होगा।' },
];

// ---------------------------------------------------------------------------
// 언어별 UI 레이블 (기본 ko_KR, 나머지 en_US 폴백)
// ---------------------------------------------------------------------------

function getLabels(lang) {
  const KO = {
    generalSettings: '일반 설정',
    siteSettings: '사이트 설정',
    siteTitle: '사이트 제목',
    tagline: '태그라인',
    taglineDesc: '이 사이트를 한 문장으로 설명하세요.',
    siteUrl: '사이트 주소 (URL)',
    siteUrlDesc: 'Cloudflare Worker 라우트 URL.',
    adminEmail: '관리자 이메일',
    membership: '회원가입',
    anyoneCanRegister: '누구나 가입 가능',
    defaultRole: '신규 사용자 기본 역할',
    defaultRoleDesc: '관리자가 역할을 직접 배정합니다.',
    language: '언어',
    siteLanguage: '사이트 언어',
    langDesc: '선택한 언어로 관리자 화면이 표시됩니다.',
    dateTime: '날짜 및 시간',
    dateFormat: '날짜 형식',
    dateFormatDesc: '예: Y년 m월 d일',
    timeFormat: '시간 형식',
    timezone: '시간대',
    weekStartsOn: '주 시작 요일',
    saveChanges: '변경사항 저장',
    saved: '설정이 저장되었습니다.',
  };
  const EN = {
    generalSettings: 'General Settings',
    siteSettings: 'Site Settings',
    siteTitle: 'Site Title',
    tagline: 'Tagline',
    taglineDesc: 'In a few words, explain what this site is about.',
    siteUrl: 'Site Address (URL)',
    siteUrlDesc: 'Your Cloudflare Worker route URL.',
    adminEmail: 'Admin Email',
    membership: 'Membership',
    anyoneCanRegister: 'Anyone can register',
    defaultRole: 'New User Default Role',
    defaultRoleDesc: 'Admin manually assigns roles.',
    language: 'Language',
    siteLanguage: 'Site Language',
    langDesc: 'The language the admin interface is displayed in.',
    dateTime: 'Date & Time',
    dateFormat: 'Date Format',
    dateFormatDesc: 'Example: F j, Y',
    timeFormat: 'Time Format',
    timezone: 'Timezone',
    weekStartsOn: 'Week Starts On',
    saveChanges: 'Save Changes',
    saved: 'Settings saved.',
  };
  return lang === 'ko_KR' ? KO : EN;
}

function getLangString(lang, key) {
  return getLabels(lang)[key] || 'Settings saved.';
}

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

function getTimezones() {
  return [
    'Asia/Seoul', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Dubai',
    'UTC',
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Anchorage', 'Pacific/Honolulu',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
    'Asia/Kolkata', 'Australia/Sydney', 'Pacific/Auckland',
  ];
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
