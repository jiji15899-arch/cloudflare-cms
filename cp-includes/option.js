/**
 * CloudPress Options API
 * Replaces WordPress get_option / update_option / add_option / delete_option.
 *
 * Options are stored in the D1 `cp_options` table.
 * Frequently-accessed options are cached in KV (transient-style).
 *
 * @package CloudPress
 */

const KV_TTL = 3600; // 1 hour KV cache for options

// ── Read ───────────────────────────────────────────────────────────────────

/**
 * Get an option value.
 * Equivalent to WordPress get_option().
 *
 * @param {object} cp
 * @param {string} name
 * @param {*}      defaultValue
 * @returns {Promise<*>}
 */
export async function getOption(cp, name, defaultValue = false) {
  const prefix = cp.db_prefix || 'cp_';
  const kvKey  = `cp:option:${name}`;

  // Try KV cache first
  try {
    const cached = await cp.kv.get(kvKey, { type: 'json' });
    if (cached !== null) return cached.value;
  } catch (_) {}

  // Fall back to D1
  const row = await cp.db
    .prepare(`SELECT option_value FROM ${prefix}options WHERE option_name=? LIMIT 1`)
    .bind(name)
    .first();

  if (!row) return defaultValue;

  let value;
  try {
    value = JSON.parse(row.option_value);
  } catch (_) {
    value = row.option_value;
  }

  // Populate KV cache
  try {
    await cp.kv.put(kvKey, JSON.stringify({ value }), { expirationTtl: KV_TTL });
  } catch (_) {}

  return value;
}

/**
 * Get multiple options at once (batched D1 query).
 *
 * @param {object}   cp
 * @param {string[]} names
 * @returns {Promise<object>}  { name: value, … }
 */
export async function getOptions(cp, names) {
  const prefix = cp.db_prefix || 'cp_';
  if (!names.length) return {};

  const placeholders = names.map(() => '?').join(',');
  const rows = await cp.db
    .prepare(`SELECT option_name, option_value FROM ${prefix}options WHERE option_name IN (${placeholders})`)
    .bind(...names)
    .all();

  const result = {};
  for (const n of names) result[n] = false; // defaults

  for (const row of (rows.results || [])) {
    try { result[row.option_name] = JSON.parse(row.option_value); }
    catch (_) { result[row.option_name] = row.option_value; }
  }
  return result;
}

// ── Write ──────────────────────────────────────────────────────────────────

/**
 * Update (or insert) an option.
 * Equivalent to WordPress update_option().
 *
 * @param {object} cp
 * @param {string} name
 * @param {*}      value
 * @param {string} autoload  'yes' | 'no'
 * @returns {Promise<boolean>}
 */
export async function updateOption(cp, name, value, autoload = 'yes') {
  const prefix   = cp.db_prefix || 'cp_';
  const serialized = JSON.stringify(value);

  await cp.db.prepare(`
    INSERT INTO ${prefix}options (option_name, option_value, autoload)
    VALUES (?, ?, ?)
    ON CONFLICT(option_name) DO UPDATE SET option_value=excluded.option_value, autoload=excluded.autoload
  `).bind(name, serialized, autoload).run();

  // Invalidate KV cache
  try { await cp.kv.delete(`cp:option:${name}`); } catch (_) {}

  return true;
}

/**
 * Add an option only if it does not already exist.
 * Equivalent to WordPress add_option().
 *
 * @param {object} cp
 * @param {string} name
 * @param {*}      value
 * @param {string} autoload
 * @returns {Promise<boolean>} true if inserted, false if already exists
 */
export async function addOption(cp, name, value, autoload = 'yes') {
  const prefix     = cp.db_prefix || 'cp_';
  const serialized = JSON.stringify(value);

  try {
    await cp.db.prepare(`
      INSERT INTO ${prefix}options (option_name, option_value, autoload)
      VALUES (?, ?, ?)
    `).bind(name, serialized, autoload).run();
    return true;
  } catch (_) {
    return false; // already exists (UNIQUE constraint)
  }
}

/**
 * Delete an option.
 * Equivalent to WordPress delete_option().
 *
 * @param {object} cp
 * @param {string} name
 * @returns {Promise<boolean>}
 */
export async function deleteOption(cp, name) {
  const prefix = cp.db_prefix || 'cp_';
  await cp.db.prepare(`DELETE FROM ${prefix}options WHERE option_name=?`).bind(name).run();
  try { await cp.kv.delete(`cp:option:${name}`); } catch (_) {}
  return true;
}

// ── Autoloaded options ─────────────────────────────────────────────────────

/**
 * Load all autoloaded options into a flat object.
 * Equivalent to wp_load_alloptions().
 *
 * @param {object} cp
 * @returns {Promise<object>}
 */
export async function loadAllOptions(cp) {
  const prefix = cp.db_prefix || 'cp_';
  const rows = await cp.db
    .prepare(`SELECT option_name, option_value FROM ${prefix}options WHERE autoload='yes'`)
    .all();

  const result = {};
  for (const row of (rows.results || [])) {
    try { result[row.option_name] = JSON.parse(row.option_value); }
    catch (_) { result[row.option_name] = row.option_value; }
  }
  return result;
}
