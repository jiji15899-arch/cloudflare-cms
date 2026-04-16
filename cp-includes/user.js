/**
 * CloudPress User API
 * Replaces WordPress WP_User, get_user_by, wp_insert_user, etc.
 *
 * Users are stored in D1 cp_users + cp_usermeta tables.
 *
 * @package CloudPress
 */

import { hashPassword, checkPassword } from './crypto.js';

// -- Fetch ------------------------------------------------------------------

/**
 * Get a user by ID.
 * Equivalent to get_user_by('id', ...) / get_userdata().
 *
 * @param {object} cp
 * @param {number} id
 * @returns {Promise<object|null>}
 */
export async function getUserById(cp, id) {
  const prefix = cp.db_prefix || 'cp_';
  const row = await cp.db
    .prepare(`SELECT * FROM ${prefix}users WHERE ID=? LIMIT 1`)
    .bind(id)
    .first();
  if (!row) return null;
  return hydrateUser(cp, row);
}

/**
 * Get a user by login name.
 *
 * @param {object} cp
 * @param {string} login
 * @returns {Promise<object|null>}
 */
export async function getUserByLogin(cp, login) {
  const prefix = cp.db_prefix || 'cp_';
  const row = await cp.db
    .prepare(`SELECT * FROM ${prefix}users WHERE user_login=? LIMIT 1`)
    .bind(login)
    .first();
  if (!row) return null;
  return hydrateUser(cp, row);
}

/**
 * Get a user by email.
 *
 * @param {object} cp
 * @param {string} email
 * @returns {Promise<object|null>}
 */
export async function getUserByEmail(cp, email) {
  const prefix = cp.db_prefix || 'cp_';
  const row = await cp.db
    .prepare(`SELECT * FROM ${prefix}users WHERE user_email=? LIMIT 1`)
    .bind(email)
    .first();
  if (!row) return null;
  return hydrateUser(cp, row);
}

/**
 * List users with optional filters.
 *
 * @param {object} cp
 * @param {object} args  { role, number, offset, search, orderby, order }
 * @returns {Promise<object[]>}
 */
export async function getUsers(cp, args = {}) {
  const prefix   = cp.db_prefix || 'cp_';
  const number   = args.number  || 20;
  const offset   = args.offset  || 0;
  const orderby  = ['user_login','user_email','user_registered','display_name'].includes(args.orderby)
    ? args.orderby : 'user_registered';
  const order    = args.order === 'ASC' ? 'ASC' : 'DESC';

  let where  = '1=1';
  const params = [];

  if (args.search) {
    where += ' AND (user_login LIKE ? OR display_name LIKE ? OR user_email LIKE ?)';
    const s = `%${args.search}%`;
    params.push(s, s, s);
  }

  const rows = await cp.db
    .prepare(`SELECT * FROM ${prefix}users WHERE ${where} ORDER BY ${orderby} ${order} LIMIT ? OFFSET ?`)
    .bind(...params, number, offset)
    .all();

  const users = await Promise.all((rows.results || []).map(r => hydrateUser(cp, r)));

  if (args.role) {
    return users.filter(u => (u.roles || []).includes(args.role));
  }
  return users;
}

// -- Authenticate -----------------------------------------------------------

/**
 * Authenticate a user by login + password.
 * Equivalent to wp_authenticate().
 *
 * @param {object} cp
 * @param {string} login    login name or email
 * @param {string} password plaintext
 * @returns {Promise<object|null>} user object or null
 */
export async function authenticateUser(cp, login, password) {
  const user = login.includes('@')
    ? await getUserByEmail(cp, login)
    : await getUserByLogin(cp, login);

  if (!user) return null;
  const ok = await checkPassword(password, user.user_pass);
  return ok ? user : null;
}

// -- Insert / Update --------------------------------------------------------

/**
 * Insert a new user.
 * Equivalent to wp_insert_user().
 *
 * @param {object} cp
 * @param {object} data  { user_login, user_email, user_pass, display_name, role, ... }
 * @returns {Promise<number>} new user ID
 */
export async function insertUser(cp, data) {
  const prefix  = cp.db_prefix || 'cp_';
  const now     = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const hashedPass = await hashPassword(data.user_pass || '');

  const result = await cp.db.prepare(`
    INSERT INTO ${prefix}users
      (user_login, user_pass, user_email, display_name, user_registered, user_status)
    VALUES (?, ?, ?, ?, ?, 0)
  `).bind(
    data.user_login,
    hashedPass,
    data.user_email,
    data.display_name || data.user_login,
    now,
  ).run();

  const userId = result.meta?.last_row_id;

  // Save role as usermeta
  await setUserMeta(cp, userId, `${prefix}capabilities`,
    JSON.stringify({ [data.role || 'subscriber']: true }));

  return userId;
}

/**
 * Update an existing user.
 * Equivalent to wp_update_user().
 *
 * @param {object} cp
 * @param {number} userId
 * @param {object} data
 * @returns {Promise<boolean>}
 */
export async function updateUser(cp, userId, data) {
  const prefix = cp.db_prefix || 'cp_';
  const fields = [];
  const params = [];

  const allowed = ['user_email','display_name','user_url','user_nicename','user_status'];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key}=?`);
      params.push(data[key]);
    }
  }

  if (data.user_pass) {
    fields.push('user_pass=?');
    params.push(await hashPassword(data.user_pass));
  }

  if (!fields.length) return false;

  params.push(userId);
  await cp.db.prepare(`UPDATE ${prefix}users SET ${fields.join(',')} WHERE ID=?`)
    .bind(...params).run();

  if (data.role) {
    await setUserMeta(cp, userId, `${prefix}capabilities`,
      JSON.stringify({ [data.role]: true }));
  }

  return true;
}

/**
 * Delete a user.
 *
 * @param {object} cp
 * @param {number} userId
 * @returns {Promise<boolean>}
 */
export async function deleteUser(cp, userId) {
  const prefix = cp.db_prefix || 'cp_';
  await cp.db.prepare(`DELETE FROM ${prefix}users WHERE ID=?`).bind(userId).run();
  await cp.db.prepare(`DELETE FROM ${prefix}usermeta WHERE user_id=?`).bind(userId).run();
  return true;
}

// -- Usermeta ---------------------------------------------------------------

/**
 * Get user meta value.
 * Equivalent to get_user_meta().
 *
 * @param {object} cp
 * @param {number} userId
 * @param {string} metaKey
 * @param {boolean} single
 * @returns {Promise<*>}
 */
export async function getUserMeta(cp, userId, metaKey, single = true) {
  const prefix = cp.db_prefix || 'cp_';
  const rows = await cp.db
    .prepare(`SELECT meta_value FROM ${prefix}usermeta WHERE user_id=? AND meta_key=?`)
    .bind(userId, metaKey)
    .all();

  const values = (rows.results || []).map(r => {
    try { return JSON.parse(r.meta_value); } catch (_) { return r.meta_value; }
  });

  if (single) return values[0] ?? null;
  return values;
}

/**
 * Set user meta.
 * Equivalent to update_user_meta().
 *
 * @param {object} cp
 * @param {number} userId
 * @param {string} metaKey
 * @param {*}      metaValue
 * @returns {Promise<void>}
 */
export async function setUserMeta(cp, userId, metaKey, metaValue) {
  const prefix     = cp.db_prefix || 'cp_';
  const serialized = typeof metaValue === 'string' ? metaValue : JSON.stringify(metaValue);

  await cp.db.prepare(`
    INSERT INTO ${prefix}usermeta (user_id, meta_key, meta_value)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, meta_key) DO UPDATE SET meta_value=excluded.meta_value
  `).bind(userId, metaKey, serialized).run();
}

// -- Internal ---------------------------------------------------------------

async function hydrateUser(cp, row) {
  if (!row) return null;
  const prefix = cp.db_prefix || 'cp_';

  // Load capabilities from usermeta
  let roles = ['subscriber'];
  try {
    const capRow = await cp.db
      .prepare(`SELECT meta_value FROM ${prefix}usermeta WHERE user_id=? AND meta_key=?`)
      .bind(row.ID, `${prefix}capabilities`)
      .first();
    if (capRow?.meta_value) {
      const caps = JSON.parse(capRow.meta_value);
      roles = Object.keys(caps).filter(k => caps[k]);
    }
  } catch (_) {}

  return {
    ID:                row.ID,
    user_login:        row.user_login,
    user_pass:         row.user_pass,
    user_email:        row.user_email,
    user_registered:   row.user_registered,
    user_status:       row.user_status,
    display_name:      row.display_name || row.user_login,
    user_url:          row.user_url || '',
    user_nicename:     row.user_nicename || row.user_login,
    roles,
    // Never expose password hash in serialisation helpers
    toJSON() {
      const { user_pass: _, ...safe } = this; // eslint-disable-line no-unused-vars
      return safe;
    },
  };
}
