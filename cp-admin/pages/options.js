/**
 * CloudPress Options API
 *
 * [v3.1 성능 개선]
 * - 요청별 인메모리 캐시 (_optionCache) → 같은 요청 내 중복 DB/KV 호출 제거
 * - preloadOptions(): 부트 시 autoload 옵션 전체를 1회 배치 쿼리로 로드
 * - KV 캐시 유지 (요청 간 캐싱)
 * - updateOption 시 인메모리 캐시도 즉시 무효화
 *
 * @package CloudPress
 */

const OPTION_KV_TTL = 3600;

// ── 요청별 인메모리 캐시 ─────────────────────────────────────────────────
// cp._optionCache = Map<name, value>  (cpLoad 시 초기화)

function getCache(cp) {
  if (!cp._optionCache) cp._optionCache = new Map();
  return cp._optionCache;
}

// ── Read ──────────────────────────────────────────────────────────────────

export async function getOption(cp, name, defaultValue = false) {
  const cache = getCache(cp);

  // 1) 인메모리 캐시
  if (cache.has(name)) {
    const v = cache.get(name);
    return v !== undefined ? v : defaultValue;
  }

  const prefix = cp.db_prefix || 'cp_';
  const kvKey  = `cp:option:${name}`;

  // 2) KV 캐시
  try {
    const cached = await cp.kv.get(kvKey, { type: 'json' });
    if (cached !== null && cached !== undefined) {
      cache.set(name, cached.value);
      return cached.value !== undefined ? cached.value : defaultValue;
    }
  } catch (_) {}

  // 3) D1
  try {
    const row = await cp.db
      .prepare(`SELECT option_value FROM ${prefix}options WHERE option_name=? LIMIT 1`)
      .bind(name)
      .first();

    if (!row) {
      cache.set(name, defaultValue);
      return defaultValue;
    }

    let value;
    try { value = JSON.parse(row.option_value); }
    catch (_) { value = row.option_value; }

    cache.set(name, value);
    // KV 비동기 저장 (요청 완료 차단 안 함)
    cp.kv?.put(kvKey, JSON.stringify({ value }), { expirationTtl: OPTION_KV_TTL }).catch(() => {});

    return value;
  } catch(_) {
    return defaultValue;
  }
}

/**
 * 여러 옵션 한 번에 로드 (배치 D1 쿼리)
 * 인메모리 캐시도 채워줌
 */
export async function getOptions(cp, names) {
  const prefix = cp.db_prefix || 'cp_';
  const cache  = getCache(cp);
  if (!names.length) return {};

  const result = {};
  const missing = [];

  for (const n of names) {
    if (cache.has(n)) {
      result[n] = cache.get(n);
    } else {
      result[n] = false;
      missing.push(n);
    }
  }

  if (missing.length > 0) {
    try {
      const placeholders = missing.map(() => '?').join(',');
      const rows = await cp.db
        .prepare(`SELECT option_name, option_value FROM ${prefix}options WHERE option_name IN (${placeholders})`)
        .bind(...missing)
        .all();

      for (const row of (rows?.results || [])) {
        let v;
        try { v = JSON.parse(row.option_value); }
        catch (_) { v = row.option_value; }
        result[row.option_name] = v;
        cache.set(row.option_name, v);
      }
      // 쿼리에 없던 항목 → false 캐시 (재쿼리 방지)
      for (const n of missing) {
        if (!cache.has(n)) cache.set(n, false);
      }
    } catch(_) {}
  }

  return result;
}

/**
 * 부트 시 autoload 옵션 전체를 1회 배치 로드.
 * cp-settings.js에서 호출하여 이후 getOption이 DB를 치지 않도록 함.
 */
export async function preloadOptions(cp) {
  try {
    const prefix = cp.db_prefix || 'cp_';
    const cache  = getCache(cp);

    // KV에 전체 옵션 스냅샷이 있으면 우선 사용
    try {
      const snapshot = await cp.kv.get('cp:options:snapshot', { type: 'json' });
      if (snapshot && typeof snapshot === 'object') {
        for (const [k, v] of Object.entries(snapshot)) {
          cache.set(k, v);
        }
        return; // KV 스냅샷으로 충분
      }
    } catch(_) {}

    // D1에서 autoload 옵션 배치 로드
    const rows = await cp.db
      .prepare(`SELECT option_name, option_value FROM ${prefix}options WHERE autoload='yes' LIMIT 200`)
      .all();

    const snapshot = {};
    for (const row of (rows?.results || [])) {
      let v;
      try { v = JSON.parse(row.option_value); }
      catch(_) { v = row.option_value; }
      cache.set(row.option_name, v);
      snapshot[row.option_name] = v;
    }

    // KV 스냅샷 비동기 저장
    cp.kv?.put('cp:options:snapshot', JSON.stringify(snapshot), { expirationTtl: 300 }).catch(() => {});
  } catch(_) {}
}

// ── Write ──────────────────────────────────────────────────────────────────

export async function updateOption(cp, name, value, autoload = 'yes') {
  const prefix     = cp.db_prefix || 'cp_';
  const serialized = JSON.stringify(value);

  await cp.db.prepare(`
    INSERT INTO ${prefix}options (option_name, option_value, autoload)
    VALUES (?, ?, ?)
    ON CONFLICT(option_name) DO UPDATE SET option_value=excluded.option_value, autoload=excluded.autoload
  `).bind(name, serialized, autoload).run();

  // 캐시 무효화
  getCache(cp).set(name, value);  // 인메모리 갱신
  cp.kv?.delete(`cp:option:${name}`).catch(() => {});    // KV 무효화
  cp.kv?.delete('cp:options:snapshot').catch(() => {});  // 스냅샷 무효화

  return true;
}

export async function addOption(cp, name, value, autoload = 'yes') {
  const prefix     = cp.db_prefix || 'cp_';
  const serialized = JSON.stringify(value);
  try {
    await cp.db.prepare(`
      INSERT INTO ${prefix}options (option_name, option_value, autoload) VALUES (?, ?, ?)
    `).bind(name, serialized, autoload).run();
    getCache(cp).set(name, value);
    return true;
  } catch (_) {
    return false;
  }
}

export async function deleteOption(cp, name) {
  const prefix = cp.db_prefix || 'cp_';
  await cp.db.prepare(`DELETE FROM ${prefix}options WHERE option_name=?`).bind(name).run();
  getCache(cp).delete(name);
  cp.kv?.delete(`cp:option:${name}`).catch(() => {});
  cp.kv?.delete('cp:options:snapshot').catch(() => {});
  return true;
}

export async function loadAllOptions(cp) {
  const prefix = cp.db_prefix || 'cp_';
  const rows = await cp.db
    .prepare(`SELECT option_name, option_value FROM ${prefix}options WHERE autoload='yes'`)
    .all();

  const result = {};
  for (const row of (rows?.results || [])) {
    try { result[row.option_name] = JSON.parse(row.option_value); }
    catch (_) { result[row.option_name] = row.option_value; }
  }
  return result;
}
