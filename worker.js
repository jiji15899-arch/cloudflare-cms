var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// cp-config.js
async function loadConfig(env) {
  let storedConfig = null;
  try {
    const raw = await env.CP_KV.get("cp:config", { type: "json" });
    if (raw && raw.installed) {
      storedConfig = raw;
    }
  } catch (_) {
  }
  if (storedConfig) {
    return mergeWithDefaults(storedConfig, env);
  }
  return mergeWithDefaults({}, env);
}
async function saveConfig(env, config) {
  await env.CP_KV.put("cp:config", JSON.stringify({ ...config, installed: true }));
}
function mergeWithDefaults(stored, env) {
  return {
    // -- Site Identity ----------------------------------------------------------
    SITE_URL: stored.SITE_URL || env.CP_SITE_URL || "",
    SITE_NAME: stored.SITE_NAME || env.CP_SITE_NAME || "CloudPress Site",
    SITE_TAGLINE: stored.SITE_TAGLINE || env.CP_SITE_TAGLINE || "Just another CloudPress site",
    ADMIN_EMAIL: stored.ADMIN_EMAIL || env.CP_ADMIN_EMAIL || "",
    // -- Database prefix (D1 table prefix) -------------------------------------
    DB_PREFIX: stored.DB_PREFIX || env.CP_DB_PREFIX || "cp_",
    // -- Authentication Keys & Salts --------------------------------------------
    // Generate unique values via: https://cloudpress.dev/api/secret-key/
    // Or set as Cloudflare Worker secrets.
    AUTH_KEY: env.CP_AUTH_KEY || stored.AUTH_KEY || "change-me-auth-key",
    SECURE_AUTH_KEY: env.CP_SECURE_AUTH_KEY || stored.SECURE_AUTH_KEY || "change-me-secure-auth-key",
    LOGGED_IN_KEY: env.CP_LOGGED_IN_KEY || stored.LOGGED_IN_KEY || "change-me-logged-in-key",
    NONCE_KEY: env.CP_NONCE_KEY || stored.NONCE_KEY || "change-me-nonce-key",
    AUTH_SALT: env.CP_AUTH_SALT || stored.AUTH_SALT || "change-me-auth-salt",
    SECURE_AUTH_SALT: env.CP_SECURE_AUTH_SALT || stored.SECURE_AUTH_SALT || "change-me-secure-auth-salt",
    LOGGED_IN_SALT: env.CP_LOGGED_IN_SALT || stored.LOGGED_IN_SALT || "change-me-logged-in-salt",
    NONCE_SALT: env.CP_NONCE_SALT || stored.NONCE_SALT || "change-me-nonce-salt",
    // -- GitHub Integration (for theme/plugin install from GitHub) --------------
    // Set CP_GITHUB_TOKEN as a Cloudflare Worker secret for private repos.
    GITHUB_TOKEN: env.CP_GITHUB_TOKEN || stored.GITHUB_TOKEN || "",
    // Default GitHub source repo for CloudPress core (used by updater)
    GITHUB_REPO: stored.GITHUB_REPO || env.CP_GITHUB_REPO || "",
    // -- Debug ------------------------------------------------------------------
    CP_DEBUG: stored.CP_DEBUG || env.CP_DEBUG === "true" || false,
    CP_DEBUG_LOG: stored.CP_DEBUG_LOG || false,
    // -- Multisite --------------------------------------------------------------
    MULTISITE: stored.MULTISITE || false,
    SUBDOMAIN_INSTALL: stored.SUBDOMAIN_INSTALL || false,
    // -- KV TTLs (seconds) ------------------------------------------------------
    TRANSIENT_TTL: stored.TRANSIENT_TTL || 3600,
    // 1 hour default
    SESSION_TTL: stored.SESSION_TTL || 86400,
    // 24 hours
    // -- Installer state --------------------------------------------------------
    installed: stored.installed || false
  };
}
var CP_VERSION, CPINC, CPADMIN;
var init_cp_config = __esm({
  "cp-config.js"() {
    __name(loadConfig, "loadConfig");
    __name(saveConfig, "saveConfig");
    __name(mergeWithDefaults, "mergeWithDefaults");
    CP_VERSION = "1.2.0";
    CPINC = "cp-includes";
    CPADMIN = "cp-admin";
  }
});

// cp-includes/option.js
async function getOption(cp, name, defaultValue = false) {
  const prefix = cp.db_prefix || "cp_";
  const kvKey = `cp:option:${name}`;
  try {
    const cached = await cp.kv.get(kvKey, { type: "json" });
    if (cached !== null)
      return cached.value;
  } catch (_) {
  }
  const row = await cp.db.prepare(`SELECT option_value FROM ${prefix}options WHERE option_name=? LIMIT 1`).bind(name).first();
  if (!row)
    return defaultValue;
  let value;
  try {
    value = JSON.parse(row.option_value);
  } catch (_) {
    value = row.option_value;
  }
  try {
    await cp.kv.put(kvKey, JSON.stringify({ value }), { expirationTtl: OPTION_KV_TTL });
  } catch (_) {
  }
  return value;
}
async function updateOption(cp, name, value, autoload = "yes") {
  const prefix = cp.db_prefix || "cp_";
  const serialized = JSON.stringify(value);
  await cp.db.prepare(`
    INSERT INTO ${prefix}options (option_name, option_value, autoload)
    VALUES (?, ?, ?)
    ON CONFLICT(option_name) DO UPDATE SET option_value=excluded.option_value, autoload=excluded.autoload
  `).bind(name, serialized, autoload).run();
  try {
    await cp.kv.delete(`cp:option:${name}`);
  } catch (_) {
  }
  return true;
}
var OPTION_KV_TTL;
var init_option = __esm({
  "cp-includes/option.js"() {
    OPTION_KV_TTL = 3600;
    __name(getOption, "getOption");
    __name(updateOption, "updateOption");
  }
});

// cp-includes/plugin-loader.js
async function loadActivePlugins(cp) {
  let activePlugins = [];
  try {
    const raw = await getOption(cp, "active_plugins", "[]");
    activePlugins = JSON.parse(raw);
  } catch (_) {
    activePlugins = [];
  }
  if (!Array.isArray(activePlugins) || activePlugins.length === 0)
    return;
  for (const pluginSlug of activePlugins) {
    try {
      await loadPlugin(cp, pluginSlug);
    } catch (err) {
      if (cp.config?.CP_DEBUG) {
        console.error(`[plugin-loader] Failed to load plugin "${pluginSlug}":`, err);
      }
    }
  }
}
async function loadPlugin(cp, pluginSlug) {
  cp.hooks.doAction("cp_load_plugin", pluginSlug, cp);
}
var init_plugin_loader = __esm({
  "cp-includes/plugin-loader.js"() {
    init_option();
    __name(loadActivePlugins, "loadActivePlugins");
    __name(loadPlugin, "loadPlugin");
  }
});

// cp-includes/theme-loader.js
async function loadActiveTheme(cp) {
  const slug = await getOption(cp, "template", "");
  if (!slug) {
    cp.theme = null;
    return;
  }
  const meta = await getThemeMeta(cp, slug);
  cp.theme = { slug, ...meta };
  cp.hooks.doAction("cp_after_setup_theme", cp);
}
async function getThemeMeta(cp, slug) {
  const kvKey = KV_THEME_META_PREFIX + slug;
  try {
    const cached = await cp.kv.get(kvKey, { type: "json" });
    if (cached)
      return cached;
  } catch (_) {
  }
  const meta = await fetchThemeJson(cp, slug) || { name: slug, version: "1.2.0" };
  try {
    await cp.kv.put(kvKey, JSON.stringify(meta), { expirationTtl: THEME_KV_TTL });
  } catch (_) {
  }
  return meta;
}
async function getThemes(cp) {
  try {
    const cached = await cp.kv.get("cp:themes:list", { type: "json" });
    if (cached)
      return cached;
  } catch (_) {
  }
  return [];
}
async function switchTheme(cp, slug) {
  await updateOption(cp, "template", slug);
  await updateOption(cp, "stylesheet", slug);
  try {
    await cp.kv.delete(KV_THEME_META_PREFIX + slug);
  } catch (_) {
  }
  cp.theme = { slug, ...await getThemeMeta(cp, slug) };
  cp.hooks.doAction("cp_switch_theme", slug, cp);
}
async function fetchThemeJson(cp, slug) {
  const githubRepo = cp.config?.GITHUB_REPO || await getOption(cp, "cp_github_repo", "");
  const githubToken = cp.config?.GITHUB_TOKEN || cp.env?.CP_GITHUB_TOKEN || "";
  if (!githubRepo)
    return null;
  const url = `https://api.github.com/repos/${githubRepo}/contents/themes/${slug}/theme.json`;
  try {
    const headers = { "User-Agent": "CloudPress/1.0", "Accept": "application/vnd.github.v3.raw" };
    if (githubToken)
      headers["Authorization"] = `Bearer ${githubToken}`;
    const res = await fetch(url, { headers });
    if (!res.ok)
      return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}
var KV_THEME_META_PREFIX, THEME_KV_TTL;
var init_theme_loader = __esm({
  "cp-includes/theme-loader.js"() {
    init_option();
    KV_THEME_META_PREFIX = "cp:theme:meta:";
    THEME_KV_TTL = 3600;
    __name(loadActiveTheme, "loadActiveTheme");
    __name(getThemeMeta, "getThemeMeta");
    __name(getThemes, "getThemes");
    __name(switchTheme, "switchTheme");
    __name(fetchThemeJson, "fetchThemeJson");
  }
});

// cp-includes/formatting.js
function wptexturize(text) {
  if (!text)
    return "";
  return text.replace(/---/g, "\u2014").replace(/--/g, "\u2013").replace(/(^|[\s(])"(\S)/g, "$1\u201C$2").replace(/(\S)"([\s,.]|$)/g, "$1\u201D$2").replace(/(^|[\s(])'(\S)/g, "$1\u2018$2").replace(/(\S)'([\s,.]|$)/g, "$1\u2019$2").replace(/\.\.\./g, "\u2026");
}
function stripTags(str) {
  return String(str || "").replace(/<[^>]+>/g, "");
}
function escHtml(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function truncate(str, length = 100, suffix = "...") {
  const s = String(str || "");
  return s.length > length ? s.slice(0, length) + suffix : s;
}
function trimWords(str, count = 55, more = "...") {
  const words = String(str || "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= count)
    return str;
  return words.slice(0, count).join(" ") + more;
}
function htmlExcerpt(text, maxLength = 255) {
  return truncate(stripTags(text), maxLength);
}
var init_formatting = __esm({
  "cp-includes/formatting.js"() {
    __name(wptexturize, "wptexturize");
    __name(stripTags, "stripTags");
    __name(escHtml, "escHtml");
    __name(truncate, "truncate");
    __name(trimWords, "trimWords");
    __name(htmlExcerpt, "htmlExcerpt");
  }
});

// cp-includes/hooks.js
function registerCoreHooks(cp) {
  const { hooks } = cp;
  hooks.addFilter("the_content", (content) => wpAutoP(content), 10);
  hooks.addFilter("the_content", (content) => wptexturize(content), 20);
  hooks.addFilter("the_title", (title) => title ? String(title).replace(/<[^>]+>/g, "") : "", 10);
  hooks.addFilter("get_the_excerpt", (excerpt, post) => {
    if (excerpt)
      return excerpt;
    if (!post?.post_content)
      return "";
    return trimWords(stripTags(post.post_content), 55) + "\u2026";
  }, 10);
  hooks.addFilter("comment_text", (text) => wpAutoP(escHtml(text || "")), 10);
  hooks.addAction("cp_head", (cp2) => {
    cp2._headTags = cp2._headTags || [];
  }, 1);
}
function wpAutoP(text) {
  if (!text)
    return "";
  const blocks = /^(address|article|aside|blockquote|canvas|dd|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|noscript|ol|p|pre|section|table|tfoot|thead|tbody|tr|td|th|ul|video)/i;
  text = text.replace(/\r\n|\r/g, "\n");
  const parts = text.split(/\n\n+/);
  const result = parts.map((part) => {
    const trimmed = part.trim();
    if (!trimmed)
      return "";
    if (blocks.test(trimmed))
      return trimmed;
    const inner = trimmed.replace(/\n/g, "<br />\n");
    return `<p>${inner}</p>`;
  });
  return result.filter(Boolean).join("\n\n");
}
var init_hooks = __esm({
  "cp-includes/hooks.js"() {
    init_formatting();
    __name(registerCoreHooks, "registerCoreHooks");
    __name(wpAutoP, "wpAutoP");
  }
});

// cp-includes/jwt.js
function base64urlEncode(buf) {
  const b64 = typeof buf === "string" ? btoa(buf) : btoa(String.fromCharCode(...new Uint8Array(buf)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64urlDecode(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}
async function signJwt(payload, secret, expiresIn = 86400) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1e3);
  const claims = {
    iat: now,
    exp: now + expiresIn,
    jti: crypto.randomUUID(),
    ...payload
  };
  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(claims));
  const data = `${headerB64}.${payloadB64}`;
  const key = await importHmacKey(secret);
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const sigB64 = base64urlEncode(sigBuf);
  return `${data}.${sigB64}`;
}
async function verifyJwt(token, secret) {
  if (!token || typeof token !== "string")
    return null;
  const parts = token.split(".");
  if (parts.length !== 3)
    return null;
  const [headerB64, payloadB64, sigB64] = parts;
  try {
    const key = await importHmacKey(secret);
    const data = `${headerB64}.${payloadB64}`;
    const sigBytes = base64urlDecode(sigB64);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      new TextEncoder().encode(data)
    );
    if (!valid)
      return null;
  } catch (_) {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)));
  } catch (_) {
    return null;
  }
  const now = Math.floor(Date.now() / 1e3);
  if (payload.exp && payload.exp < now)
    return null;
  return payload;
}
function buildAuthCookie(token, maxAge = 86400, secure = true) {
  const flags = [
    `cp_token=${token}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Strict`,
    `Max-Age=${maxAge}`,
    secure ? "Secure" : ""
  ].filter(Boolean).join("; ");
  return flags;
}
function clearAuthCookie() {
  return "cp_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT";
}
var init_jwt = __esm({
  "cp-includes/jwt.js"() {
    __name(base64urlEncode, "base64urlEncode");
    __name(base64urlDecode, "base64urlDecode");
    __name(importHmacKey, "importHmacKey");
    __name(signJwt, "signJwt");
    __name(verifyJwt, "verifyJwt");
    __name(buildAuthCookie, "buildAuthCookie");
    __name(clearAuthCookie, "clearAuthCookie");
  }
});

// cp-includes/crypto.js
function b64encode(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function b64decode(str) {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}
function strToBytes(str) {
  return new TextEncoder().encode(str);
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    strToBytes(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: HASH_ITERATIONS, hash: HASH_ALGORITHM },
    keyMaterial,
    256
  );
  return `$cp$${HASH_ITERATIONS}$${b64encode(salt)}$${b64encode(derived)}`;
}
async function checkPassword(password, storedHash) {
  if (!storedHash)
    return false;
  if (storedHash.startsWith("$P$") || storedHash.startsWith("$H$")) {
    return false;
  }
  const parts = storedHash.split("$");
  if (parts.length < 5 || parts[1] !== "cp")
    return false;
  const iterations = parseInt(parts[2], 10);
  const salt = b64decode(parts[3]);
  const expected = b64decode(parts[4]);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    strToBytes(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: HASH_ALGORITHM },
    keyMaterial,
    256
  );
  const a = new Uint8Array(derived);
  const b = expected;
  if (a.length !== b.length)
    return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++)
    diff |= a[i] ^ b[i];
  return diff === 0;
}
async function hmacHash(data, key) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    strToBytes(key),
    { name: "HMAC", hash: HASH_ALGORITHM },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, strToBytes(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function cpHash(data, secret = "") {
  return hmacHash(data, secret || "default");
}
var HASH_ALGORITHM, HASH_ITERATIONS;
var init_crypto = __esm({
  "cp-includes/crypto.js"() {
    __name(b64encode, "b64encode");
    __name(b64decode, "b64decode");
    __name(strToBytes, "strToBytes");
    HASH_ALGORITHM = "SHA-256";
    HASH_ITERATIONS = 1e5;
    __name(hashPassword, "hashPassword");
    __name(checkPassword, "checkPassword");
    __name(hmacHash, "hmacHash");
    __name(cpHash, "cpHash");
  }
});

// cp-includes/user.js
async function getUserById(cp, id) {
  const prefix = cp.db_prefix || "cp_";
  const row = await cp.db.prepare(`SELECT * FROM ${prefix}users WHERE ID=? LIMIT 1`).bind(id).first();
  if (!row)
    return null;
  return hydrateUser(cp, row);
}
async function getUserByLogin(cp, login) {
  const prefix = cp.db_prefix || "cp_";
  const row = await cp.db.prepare(`SELECT * FROM ${prefix}users WHERE user_login=? LIMIT 1`).bind(login).first();
  if (!row)
    return null;
  return hydrateUser(cp, row);
}
async function getUserByEmail(cp, email) {
  const prefix = cp.db_prefix || "cp_";
  const row = await cp.db.prepare(`SELECT * FROM ${prefix}users WHERE user_email=? LIMIT 1`).bind(email).first();
  if (!row)
    return null;
  return hydrateUser(cp, row);
}
async function authenticateUser(cp, login, password) {
  const user = login.includes("@") ? await getUserByEmail(cp, login) : await getUserByLogin(cp, login);
  if (!user)
    return null;
  const ok = await checkPassword(password, user.user_pass);
  return ok ? user : null;
}
async function hydrateUser(cp, row) {
  if (!row)
    return null;
  const prefix = cp.db_prefix || "cp_";
  let roles = ["subscriber"];
  try {
    const capRow = await cp.db.prepare(`SELECT meta_value FROM ${prefix}usermeta WHERE user_id=? AND meta_key=?`).bind(row.ID, `${prefix}capabilities`).first();
    if (capRow?.meta_value) {
      const caps = JSON.parse(capRow.meta_value);
      roles = Object.keys(caps).filter((k) => caps[k]);
    }
  } catch (_) {
  }
  return {
    ID: row.ID,
    user_login: row.user_login,
    user_pass: row.user_pass,
    user_email: row.user_email,
    user_registered: row.user_registered,
    user_status: row.user_status,
    display_name: row.display_name || row.user_login,
    user_url: row.user_url || "",
    user_nicename: row.user_nicename || row.user_login,
    roles,
    // Never expose password hash in serialisation helpers
    toJSON() {
      const { user_pass: _, ...safe } = this;
      return safe;
    }
  };
}
async function getCurrentUser(cp) {
  if (!cp.user || !cp.user.ID)
    return null;
  return getUserById(cp, cp.user.ID);
}
async function getUserBy(cp, field, value) {
  if (field === "id" || field === "ID")
    return getUserById(cp, value);
  if (field === "login" || field === "user_login")
    return getUserByLogin(cp, value);
  if (field === "email" || field === "user_email")
    return getUserByEmail(cp, value);
  return null;
}
var init_user = __esm({
  "cp-includes/user.js"() {
    init_crypto();
    __name(getUserById, "getUserById");
    __name(getUserByLogin, "getUserByLogin");
    __name(getUserByEmail, "getUserByEmail");
    __name(authenticateUser, "authenticateUser");
    __name(hydrateUser, "hydrateUser");
    __name(getCurrentUser, "getCurrentUser");
    __name(getUserBy, "getUserBy");
  }
});

// cp-includes/session.js
async function initSession(cp) {
  const token = extractToken(cp.request);
  if (!token)
    return;
  try {
    const payload = await verifyJwt(token, cp.config.AUTH_KEY);
    if (!payload || !payload.sub)
      return;
    const jti = payload.jti || payload.sub;
    const revoked = await cp.kv.get(`cp:token_revoked:${jti}`).catch(() => null);
    if (revoked)
      return;
    const user = await getUserById(cp, Number(payload.sub));
    if (user) {
      cp.currentUser = user;
    }
  } catch (_) {
  }
}
function extractToken(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/cp_token=([^;]+)/);
  if (match)
    return match[1];
  const auth = request.headers.get("Authorization") || "";
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  if (bearer)
    return bearer[1];
  return null;
}
var init_session = __esm({
  "cp-includes/session.js"() {
    init_jwt();
    init_user();
    __name(initSession, "initSession");
    __name(extractToken, "extractToken");
  }
});

// cp-settings.js
async function cpSettings(cp) {
  cp.version = CP_VERSION;
  cp.cpinc = CPINC;
  cp.cpadmin = CPADMIN;
  registerCoreHooks(cp);
  await initSession(cp);
  if (cp.config.installed) {
    await loadActivePlugins(cp);
    cp.hooks.doAction("cp_plugins_loaded", cp);
  }
  await loadActiveTheme(cp);
  cp.hooks.doAction("cp_init", cp);
  cp.hooks.doAction("cp_loaded", cp);
}
var init_cp_settings = __esm({
  "cp-settings.js"() {
    init_cp_config();
    init_plugin_loader();
    init_theme_loader();
    init_hooks();
    init_session();
    __name(cpSettings, "cpSettings");
  }
});

// cp-load.js
async function cpLoad(request, env, ctx, options = {}) {
  if (!env.CP_DB) {
    return errorResponse(
      "CloudPress Error: D1 database binding <code>CP_DB</code> is not configured. Please add a D1 database binding named <strong>CP_DB</strong> in your Cloudflare Workers settings."
    );
  }
  if (!env.CP_KV) {
    return errorResponse(
      "CloudPress Error: KV namespace binding <code>CP_KV</code> is not configured. Please add a KV namespace binding named <strong>CP_KV</strong> in your Cloudflare Workers settings."
    );
  }
  let config;
  try {
    config = await loadConfig(env);
  } catch (e) {
    return errorResponse(
      `CloudPress Error: Could not load configuration. ${e.message}<br>Make sure <code>cp-config.js</code> is correctly set up or run the installer at <a href="/cp-admin/setup-config">/cp-admin/setup-config</a>.`
    );
  }
  const cp = {
    // Cloudflare bindings
    db: env.CP_DB,
    // D1 database
    kv: env.CP_KV,
    // KV namespace
    // GitHub source (optional, for theme/plugin sync)
    github: env.GITHUB_TOKEN ? env.GITHUB_TOKEN : null,
    // Config values
    config,
    // Request context
    request,
    env,
    ctx,
    url: new URL(request.url),
    // Options
    options,
    // Runtime state
    query: {},
    currentUser: null,
    hooks: createHookSystem(),
    // Helpers
    db_prefix: config.DB_PREFIX || "cp_"
  };
  await cpSettings(cp);
  return cp;
}
function createHookSystem() {
  const actions = {};
  const filters = {};
  return {
    addAction(hook, callback, priority = 10) {
      if (!actions[hook])
        actions[hook] = [];
      actions[hook].push({ callback, priority });
      actions[hook].sort((a, b) => a.priority - b.priority);
    },
    doAction(hook, ...args) {
      (actions[hook] || []).forEach(({ callback }) => callback(...args));
    },
    addFilter(hook, callback, priority = 10) {
      if (!filters[hook])
        filters[hook] = [];
      filters[hook].push({ callback, priority });
      filters[hook].sort((a, b) => a.priority - b.priority);
    },
    applyFilters(hook, value, ...args) {
      return (filters[hook] || []).reduce(
        (val, { callback }) => callback(val, ...args),
        value
      );
    }
  };
}
function errorResponse(message) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CloudPress &rsaquo; Error</title>
  <link rel="stylesheet" href="/cp-includes/css/error.css">
</head>
<body>
  <div class="error-box">
    <h1>CloudPress &rsaquo; Configuration Error</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
  return {
    __cpError: true,
    response: new Response(html, {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    })
  };
}
var init_cp_load = __esm({
  "cp-load.js"() {
    init_cp_config();
    init_cp_settings();
    __name(cpLoad, "cpLoad");
    __name(createHookSystem, "createHookSystem");
    __name(errorResponse, "errorResponse");
  }
});

// cp-cron.js
var cp_cron_exports = {};
__export(cp_cron_exports, {
  cpClearScheduledHook: () => cpClearScheduledHook,
  cpScheduleEvent: () => cpScheduleEvent,
  cpUnscheduleEvent: () => cpUnscheduleEvent,
  handleCronRequest: () => handleCronRequest,
  handleScheduled: () => handleScheduled,
  runCronJobs: () => runCronJobs
});
async function handleCronRequest(request, env, ctx) {
  if (request.method.toUpperCase() !== "GET") {
    return new Response("", { status: 405 });
  }
  const cp = await cpLoad(request, env, ctx, { DOING_CRON: true });
  if (cp.__cpError)
    return cp.response;
  ctx.waitUntil(runCronJobs(cp));
  return new Response("", {
    status: 200,
    headers: {
      "Expires": "Wed, 11 Jan 1984 05:00:00 GMT",
      "Cache-Control": "no-cache, must-revalidate, max-age=0"
    }
  });
}
async function handleScheduled(event, env, ctx) {
  const request = new Request("https://internal/cp-cron", { method: "GET" });
  const cp = await cpLoad(request, env, ctx, { DOING_CRON: true });
  if (cp.__cpError) {
    console.error("[CloudPress Cron] Bootstrap failed:", cp.response.status);
    return;
  }
  await runCronJobs(cp);
}
async function runCronJobs(cp) {
  const { db, kv } = cp;
  const prefix = cp.config.DB_PREFIX || "cp_";
  const gmtNow = Math.floor(Date.now() / 1e3);
  const existingLock = await kv.get(CRON_LOCK_KEY);
  if (existingLock) {
    return;
  }
  const lockToken = `${gmtNow}.${Math.random()}`;
  await kv.put(CRON_LOCK_KEY, lockToken, { expirationTtl: CRON_LOCK_TTL });
  const acquiredLock = await kv.get(CRON_LOCK_KEY);
  if (acquiredLock !== lockToken)
    return;
  try {
    const { results: dueEvents } = await db.prepare(`
      SELECT * FROM ${prefix}cron_events
      WHERE timestamp <= ?
      ORDER BY timestamp ASC
    `).bind(gmtNow).all();
    if (!dueEvents || dueEvents.length === 0) {
      return;
    }
    for (const event of dueEvents) {
      const currentLock = await kv.get(CRON_LOCK_KEY);
      if (currentLock !== lockToken) {
        console.log("[CloudPress Cron] Lock stolen, stopping.");
        return;
      }
      let args = [];
      try {
        args = JSON.parse(event.args || "[]");
      } catch (_) {
      }
      if (event.schedule) {
        const interval = getCronInterval(event.schedule);
        if (interval) {
          const nextTimestamp = Math.floor(Date.now() / 1e3) + interval;
          await db.prepare(`
            UPDATE ${prefix}cron_events
            SET timestamp = ?
            WHERE id = ?
          `).bind(nextTimestamp, event.id).run();
        } else {
          await db.prepare(`DELETE FROM ${prefix}cron_events WHERE id = ?`).bind(event.id).run();
        }
      } else {
        await db.prepare(`DELETE FROM ${prefix}cron_events WHERE id = ?`).bind(event.id).run();
      }
      try {
        cp.hooks.doAction(event.hook, ...args);
        cp.hooks.doAction("cp_cron_event_ran", event.hook, args);
      } catch (err) {
        console.error(`[CloudPress Cron] Hook '${event.hook}' failed:`, err);
        cp.hooks.doAction("cp_cron_event_error", event.hook, args, err);
      }
    }
  } finally {
    const finalLock = await kv.get(CRON_LOCK_KEY);
    if (finalLock === lockToken) {
      await kv.delete(CRON_LOCK_KEY);
    }
  }
}
function getCronInterval(schedule) {
  const schedules = {
    "minutely": 60,
    "hourly": 3600,
    "twicedaily": 43200,
    "daily": 86400,
    "weekly": 604800
  };
  return schedules[schedule] || null;
}
async function cpScheduleEvent(cp, timestamp, schedule, hook, args = []) {
  const prefix = cp.config.DB_PREFIX || "cp_";
  await cp.db.prepare(`
    INSERT INTO ${prefix}cron_events (timestamp, schedule, hook, args)
    VALUES (?, ?, ?, ?)
  `).bind(timestamp, schedule || null, hook, JSON.stringify(args)).run();
}
async function cpUnscheduleEvent(cp, timestamp, hook, args = []) {
  const prefix = cp.config.DB_PREFIX || "cp_";
  await cp.db.prepare(`
    DELETE FROM ${prefix}cron_events
    WHERE timestamp = ? AND hook = ? AND args = ?
  `).bind(timestamp, hook, JSON.stringify(args)).run();
}
async function cpClearScheduledHook(cp, hook) {
  const prefix = cp.config.DB_PREFIX || "cp_";
  await cp.db.prepare(`DELETE FROM ${prefix}cron_events WHERE hook = ?`).bind(hook).run();
}
var CRON_LOCK_KEY, CRON_LOCK_TTL;
var init_cp_cron = __esm({
  "cp-cron.js"() {
    init_cp_load();
    CRON_LOCK_KEY = "cp:doing_cron";
    CRON_LOCK_TTL = 60;
    __name(handleCronRequest, "handleCronRequest");
    __name(handleScheduled, "handleScheduled");
    __name(runCronJobs, "runCronJobs");
    __name(getCronInterval, "getCronInterval");
    __name(cpScheduleEvent, "cpScheduleEvent");
    __name(cpUnscheduleEvent, "cpUnscheduleEvent");
    __name(cpClearScheduledHook, "cpClearScheduledHook");
  }
});

// cp-blog-header.js
init_cp_load();

// cp-includes/post.js
init_formatting();
async function getPost(cp, id) {
  const prefix = cp.db_prefix || "cp_";
  return cp.db.prepare(`SELECT * FROM ${prefix}posts WHERE ID=? LIMIT 1`).bind(id).first();
}
__name(getPost, "getPost");
async function getPosts(cp, args = {}) {
  const prefix = cp.db_prefix || "cp_";
  const postType = args.post_type || "post";
  const postStatus = args.post_status || "publish";
  const limit = Math.min(parseInt(args.posts_per_page || args.numberposts || 10), 100);
  const offset = parseInt(args.offset || 0);
  const safeOrder = args.order === "ASC" ? "ASC" : "DESC";
  const validOrderby = {
    date: "post_date",
    modified: "post_modified",
    title: "post_title",
    ID: "ID",
    rand: "RANDOM()",
    comment_count: "comment_count",
    menu_order: "menu_order"
  };
  const orderby = validOrderby[args.orderby] || "post_date";
  let where = `post_type=? AND post_status!=?`;
  const params = [postType, "auto-draft"];
  if (postStatus !== "any") {
    where += ` AND post_status=?`;
    params.push(postStatus);
  }
  if (args.author) {
    where += " AND post_author=?";
    params.push(args.author);
  }
  if (args.s) {
    where += " AND post_title LIKE ?";
    params.push(`%${args.s}%`);
  }
  if (args.post__in?.length) {
    where += ` AND ID IN (${args.post__in.map(() => "?").join(",")})`;
    params.push(...args.post__in);
  }
  if (args.post__not_in?.length) {
    where += ` AND ID NOT IN (${args.post__not_in.map(() => "?").join(",")})`;
    params.push(...args.post__not_in);
  }
  const sql = `SELECT * FROM ${prefix}posts WHERE ${where} ORDER BY ${orderby} ${safeOrder} LIMIT ? OFFSET ?`;
  const rows = await cp.db.prepare(sql).bind(...params, limit, offset).all();
  return rows.results || [];
}
__name(getPosts, "getPosts");
async function insertPost(cp, data) {
  const prefix = cp.db_prefix || "cp_";
  const now = (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 19);
  const title = data.post_title || "";
  const content = data.post_content || "";
  const excerpt = data.post_excerpt || "";
  const status = data.post_status || "draft";
  const type = data.post_type || "post";
  const slug = data.post_name || slugify(title) || `post-${Date.now()}`;
  const author = data.post_author || 1;
  const date = data.post_date || now;
  const parent = data.post_parent || 0;
  const order = data.menu_order || 0;
  const result = await cp.db.prepare(`
    INSERT INTO ${prefix}posts
      (post_author, post_date, post_date_gmt, post_content, post_title, post_excerpt,
       post_status, post_type, post_name, post_parent, menu_order,
       comment_status, ping_status, post_modified, post_modified_gmt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'open','open',?,?)
  `).bind(author, date, date, content, title, excerpt, status, type, slug, parent, order, now, now).run();
  return result.meta?.last_row_id;
}
__name(insertPost, "insertPost");
async function pingsOpen(cp, postId) {
  const post = await getPost(cp, postId);
  return post && post.ping_status === "open";
}
__name(pingsOpen, "pingsOpen");

// cp-includes/query.js
init_option();
async function cpQuery(request, cp) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  const prefix = cp.db_prefix || "cp_";
  const paged = parseInt(url.searchParams.get("paged") || "1");
  const postsPerPage = parseInt(await getOption(cp, "posts_per_page", 10));
  cp.query = {
    is_home: false,
    is_single: false,
    is_page: false,
    is_archive: false,
    is_category: false,
    is_tag: false,
    is_author: false,
    is_search: false,
    is_404: false,
    is_feed: false,
    paged,
    posts_per_page: postsPerPage,
    found_posts: 0,
    max_num_pages: 1,
    posts: [],
    queried_object: null,
    request_path: path
  };
  const q = cp.query;
  if (path === "/" || parts.length === 1 && parts[0] === "page") {
    q.is_home = true;
    const showOnFront = await getOption(cp, "show_on_front", "posts");
    if (showOnFront === "page") {
      const pageOnFront = await getOption(cp, "page_on_front", 0);
      if (pageOnFront) {
        const p = await getPost(cp, pageOnFront);
        if (p) {
          q.is_page = true;
          q.is_home = false;
          q.queried_object = p;
          q.posts = [p];
          return;
        }
      }
    }
    await loadArchivePosts(cp, q, { post_type: "post", post_status: "publish" }, postsPerPage, paged, prefix);
    return;
  }
  if (url.searchParams.has("s") || parts[0] === "search") {
    const s = url.searchParams.get("s") || parts[1] || "";
    q.is_search = true;
    q.search_query = s;
    await loadArchivePosts(cp, q, { post_type: "post", post_status: "publish", s }, postsPerPage, paged, prefix);
    return;
  }
  if (parts[0] === "category" && parts[1]) {
    q.is_archive = true;
    q.is_category = true;
    const slug = parts[1];
    const term = await cp.db.prepare(`SELECT * FROM ${prefix}terms t JOIN ${prefix}term_taxonomy tt ON t.term_id=tt.term_id WHERE tt.taxonomy='category' AND t.slug=? LIMIT 1`).bind(slug).first().catch(() => null);
    if (!term) {
      q.is_404 = true;
      return;
    }
    q.queried_object = term;
    const ids = await cp.db.prepare(`SELECT object_id FROM ${prefix}term_relationships WHERE term_taxonomy_id=?`).bind(term.term_taxonomy_id).all().catch(() => ({ results: [] }));
    const postIds = (ids.results || []).map((r) => r.object_id);
    if (postIds.length) {
      await loadArchivePosts(cp, q, { post_type: "post", post_status: "publish", post__in: postIds }, postsPerPage, paged, prefix);
    }
    return;
  }
  if (parts[0] === "tag" && parts[1]) {
    q.is_archive = true;
    q.is_tag = true;
    const slug = parts[1];
    const term = await cp.db.prepare(`SELECT * FROM ${prefix}terms t JOIN ${prefix}term_taxonomy tt ON t.term_id=tt.term_id WHERE tt.taxonomy='post_tag' AND t.slug=? LIMIT 1`).bind(slug).first().catch(() => null);
    if (!term) {
      q.is_404 = true;
      return;
    }
    q.queried_object = term;
    const ids = await cp.db.prepare(`SELECT object_id FROM ${prefix}term_relationships WHERE term_taxonomy_id=?`).bind(term.term_taxonomy_id).all().catch(() => ({ results: [] }));
    const postIds = (ids.results || []).map((r) => r.object_id);
    if (postIds.length) {
      await loadArchivePosts(cp, q, { post_type: "post", post_status: "publish", post__in: postIds }, postsPerPage, paged, prefix);
    }
    return;
  }
  if (parts[0] === "author" && parts[1]) {
    q.is_archive = true;
    q.is_author = true;
    const author = await cp.db.prepare(`SELECT * FROM ${prefix}users WHERE user_login=? OR user_nicename=? LIMIT 1`).bind(parts[1], parts[1]).first().catch(() => null);
    if (!author) {
      q.is_404 = true;
      return;
    }
    q.queried_object = author;
    await loadArchivePosts(cp, q, { post_type: "post", post_status: "publish", author: author.ID }, postsPerPage, paged, prefix);
    return;
  }
  if (/^\d{4}$/.test(parts[0]) && parts.length <= 2) {
    q.is_archive = true;
    const year = parts[0];
    const month = parts[1];
    let wherePart = `post_type='post' AND post_status='publish' AND strftime('%Y', post_date)=?`;
    const params = [year];
    if (month) {
      wherePart += ` AND strftime('%m', post_date)=?`;
      params.push(month.padStart(2, "0"));
    }
    const offset = (paged - 1) * postsPerPage;
    const [countRow, rows] = await Promise.all([
      cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}posts WHERE ${wherePart}`).bind(...params).first(),
      cp.db.prepare(`SELECT * FROM ${prefix}posts WHERE ${wherePart} ORDER BY post_date DESC LIMIT ? OFFSET ?`).bind(...params, postsPerPage, offset).all()
    ]);
    q.found_posts = countRow?.n ?? 0;
    q.max_num_pages = Math.ceil(q.found_posts / postsPerPage) || 1;
    q.posts = rows.results || [];
    return;
  }
  if (parts.length === 3 && /^\d{4}$/.test(parts[0]) && /^\d{2}$/.test(parts[1])) {
    const slug = parts[2];
    const post = await cp.db.prepare(`SELECT * FROM ${prefix}posts WHERE post_name=? AND post_type='post' AND post_status='publish' LIMIT 1`).bind(slug).first().catch(() => null);
    if (!post) {
      q.is_404 = true;
      return;
    }
    q.is_single = true;
    q.queried_object = post;
    q.posts = [post];
    return;
  }
  if (url.searchParams.has("p")) {
    const id = parseInt(url.searchParams.get("p"));
    const post = await getPost(cp, id).catch(() => null);
    if (!post || post.post_status !== "publish") {
      q.is_404 = true;
      return;
    }
    q.is_single = true;
    q.queried_object = post;
    q.posts = [post];
    return;
  }
  if (url.searchParams.has("page_id")) {
    const id = parseInt(url.searchParams.get("page_id"));
    const page = await getPost(cp, id).catch(() => null);
    if (!page || page.post_status !== "publish") {
      q.is_404 = true;
      return;
    }
    q.is_page = true;
    q.queried_object = page;
    q.posts = [page];
    return;
  }
  if (parts.length >= 1) {
    const slug = parts[parts.length - 1];
    const page = await cp.db.prepare(`SELECT * FROM ${prefix}posts WHERE post_name=? AND post_type='page' AND post_status='publish' LIMIT 1`).bind(slug).first().catch(() => null);
    if (page) {
      q.is_page = true;
      q.queried_object = page;
      q.posts = [page];
      return;
    }
    const post = await cp.db.prepare(`SELECT * FROM ${prefix}posts WHERE post_name=? AND post_status='publish' LIMIT 1`).bind(slug).first().catch(() => null);
    if (post) {
      q.is_single = true;
      q.queried_object = post;
      q.posts = [post];
      return;
    }
  }
  q.is_404 = true;
}
__name(cpQuery, "cpQuery");
async function loadArchivePosts(cp, q, args, postsPerPage, paged, prefix) {
  const offset = (paged - 1) * postsPerPage;
  const postType = args.post_type || "post";
  const status = args.post_status || "publish";
  let where = `post_type=? AND post_status=?`;
  const params = [postType, status];
  if (args.author) {
    where += " AND post_author=?";
    params.push(args.author);
  }
  if (args.s) {
    where += " AND post_title LIKE ?";
    params.push(`%${args.s}%`);
  }
  if (args.post__in?.length) {
    where += ` AND ID IN (${args.post__in.map(() => "?").join(",")})`;
    params.push(...args.post__in);
  }
  const [countRow, rows] = await Promise.all([
    cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}posts WHERE ${where}`).bind(...params).first(),
    cp.db.prepare(`SELECT * FROM ${prefix}posts WHERE ${where} ORDER BY post_date DESC LIMIT ? OFFSET ?`).bind(...params, postsPerPage, offset).all()
  ]);
  q.found_posts = countRow?.n ?? 0;
  q.max_num_pages = Math.ceil(q.found_posts / postsPerPage) || 1;
  q.posts = rows.results || [];
}
__name(loadArchivePosts, "loadArchivePosts");

// cp-includes/template-loader.js
init_option();
init_formatting();
var KV_PREFIX = "cp:template:";
var TEMPLATE_KV_TTL = 3600;
async function loadTemplate(requestOrCp, cpOrTemplateName, context = {}) {
  let request, cp, templateName;
  if (requestOrCp instanceof Request) {
    request = requestOrCp;
    cp = cpOrTemplateName;
    templateName = resolveTemplateName(request, cp);
  } else if (requestOrCp && typeof requestOrCp === "object" && requestOrCp.db) {
    cp = requestOrCp;
    templateName = cpOrTemplateName || "index";
    request = cp.request;
  } else {
    cp = cpOrTemplateName;
    templateName = "index";
    request = cp?.request;
  }
  if (request && new URL(request.url).pathname === "/api/render") {
    return renderApiResponse(request, cp);
  }
  const hierarchy = buildHierarchy(templateName, { ...context, cp });
  for (const tmpl of hierarchy) {
    const content = await fetchTemplate(cp, tmpl);
    if (content !== null) {
      const html = await renderTemplateContent(content, { cp, request, ...context });
      if (html.trim().toLowerCase().startsWith("<!doctype")) {
        return new Response(html, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" }
        });
      }
      return new Response(
        wrapInFullPage(html, cp, templateName),
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }
  }
  return new Response(
    defaultTemplate(templateName, { ...context, cp }),
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
__name(loadTemplate, "loadTemplate");
async function renderApiResponse(request, cp) {
  const url = new URL(request.url);
  const reqPath = url.searchParams.get("path") || "/";
  let post = null;
  try {
    if (cp?.db) {
      const prefix = cp.db_prefix || "cp_";
      const slug = reqPath.replace(/^\/+/, "").split("/").pop() || "";
      if (slug) {
        post = await cp.db.prepare(
          `SELECT ID, post_title, post_content, post_status, post_type
             FROM ${prefix}posts
            WHERE post_name=? AND post_status='publish'
            LIMIT 1`
        ).bind(slug).first();
      }
    }
  } catch (_) {
  }
  const templateName = resolveTemplateFromPath(reqPath);
  const result = await loadTemplate(cp, templateName, { post, path: reqPath });
  if (result instanceof Response)
    return result;
  return new Response(String(result), {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}
__name(renderApiResponse, "renderApiResponse");
function resolveTemplateName(request, cp) {
  if (!request)
    return "index";
  const url = new URL(request.url);
  const path = url.pathname;
  return resolveTemplateFromPath(path, cp);
}
__name(resolveTemplateName, "resolveTemplateName");
function resolveTemplateFromPath(path, cp) {
  if (path === "/" || path === "")
    return "index";
  if (path.startsWith("/cp-admin"))
    return "index";
  if (/^\/\d{4}\/\d{2}\//.test(path))
    return "single";
  if (path.startsWith("/category/") || path.startsWith("/tag/") || path.startsWith("/author/")) {
    return "archive";
  }
  if (path.startsWith("/search") || path.includes("?s="))
    return "search";
  if (path.endsWith("/feed") || path.endsWith("/feed/rss"))
    return "feed";
  if (/^\/[a-z0-9\-_]+\/?$/.test(path)) {
    return cp?.query?.is_page ? "page" : "page";
  }
  return "index";
}
__name(resolveTemplateFromPath, "resolveTemplateFromPath");
function buildHierarchy(templateName, context) {
  const base = (templateName || "index").replace(/\.html$/, "");
  const list = [];
  list.push(`${base}.html`);
  if (base === "single")
    list.push("singular.html");
  if (base === "page")
    list.push("singular.html");
  if (base.startsWith("archive"))
    list.push("archive.html");
  if (context.taxonomy)
    list.push(`taxonomy-${context.taxonomy}.html`);
  if (context.term)
    list.push("taxonomy.html");
  if (base !== "index")
    list.push("index.html");
  return [...new Set(list)];
}
__name(buildHierarchy, "buildHierarchy");
async function fetchTemplate(cp, filename) {
  const kvKey = KV_PREFIX + filename;
  try {
    const cached = await cp?.kv?.get(kvKey);
    if (cached !== null && cached !== void 0)
      return cached;
  } catch (_) {
  }
  const githubRepo = cp?.config?.GITHUB_REPO || await getOption(cp, "cp_github_repo", "");
  const githubToken = cp?.config?.GITHUB_TOKEN || cp?.env?.CP_GITHUB_TOKEN || "";
  const activeTheme = await getOption(cp, "template", "");
  if (!githubRepo)
    return null;
  const themePath = activeTheme ? `themes/${activeTheme}/${filename}` : `templates/${filename}`;
  const apiUrl = `https://api.github.com/repos/${githubRepo}/contents/${themePath}`;
  try {
    const headers = {
      "User-Agent": "CloudPress/2.0",
      "Accept": "application/vnd.github.v3.raw"
    };
    if (githubToken)
      headers["Authorization"] = `Bearer ${githubToken}`;
    const res = await fetch(apiUrl, { headers });
    if (!res.ok)
      return null;
    const content = await res.text();
    if (cp?.kv) {
      cp.kv.put(kvKey, content, { expirationTtl: TEMPLATE_KV_TTL }).catch(() => {
      });
    }
    return content;
  } catch (_) {
    return null;
  }
}
__name(fetchTemplate, "fetchTemplate");
async function renderTemplateContent(template, context) {
  return interpolate(template, context);
}
__name(renderTemplateContent, "renderTemplateContent");
function interpolate(template, context) {
  return template.replace(/\{\{(\s*[\w.]+\s*)\}\}/g, (_, key) => {
    const parts = key.trim().split(".");
    let val = context;
    for (const p of parts) {
      if (val == null)
        return "";
      val = val[p];
    }
    return val != null ? String(val) : "";
  });
}
__name(interpolate, "interpolate");
function wrapInFullPage(content, cp, templateName) {
  const siteName = cp?.config?.SITE_NAME || "CloudPress";
  const siteUrl = cp?.config?.SITE_URL || "";
  const adminSlug = cp?.config?.ADMIN_SLUG || "cp-admin";
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="CloudPress">
  <title>${escHtml(siteName)}</title>
  <style>
    *,*::before,*::after{box-sizing:border-box}
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Noto Sans KR','Malgun Gothic','Segoe UI',sans-serif;line-height:1.7;color:#1d2327;background:#fff;display:flex;flex-direction:column;min-height:100vh}
    a{color:#2271b1;text-decoration:none}
    a:hover{text-decoration:underline}
    img{max-width:100%;height:auto}
    .cp-container{max-width:860px;margin:0 auto;padding:0 1.5rem}
    .cp-site-wrap{flex:1}
    .cp-header{background:#1d2327;color:#fff;padding:1.1rem 0;box-shadow:0 2px 4px rgba(0,0,0,.15)}
    .cp-header-inner{display:flex;align-items:center;justify-content:space-between;max-width:860px;margin:0 auto;padding:0 1.5rem}
    .cp-header a.cp-site-name{color:#fff;text-decoration:none;font-size:1.35rem;font-weight:700;letter-spacing:-.3px}
    .cp-header nav a{color:rgba(255,255,255,.75);text-decoration:none;margin-left:1.5rem;font-size:.9rem;transition:.15s}
    .cp-header nav a:hover{color:#fff}
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
    .cp-single-content blockquote{border-left:4px solid #2271b1;padding:.75rem 1rem;margin:1.5rem 0;background:#f8f9fa;color:#3c434a}
    .cp-single-footer{margin-top:2.5rem;padding-top:1.5rem;border-top:1px solid #f0f0f1}
    .cp-back-link{font-size:.9rem;color:#646970}
    .cp-empty-state{text-align:center;padding:2rem 0;color:#646970}
    .cp-empty-icon{font-size:3rem;margin-bottom:1rem}
    .cp-empty-state h2{font-size:1.4rem;color:#1d2327;margin:0 0 .5rem}
    .cp-empty-state p{margin:0 0 1.5rem}
    .cp-btn-primary{display:inline-block;background:#2271b1;color:#fff;padding:.6rem 1.4rem;border-radius:4px;font-weight:600;text-decoration:none;transition:.15s}
    .cp-btn-primary:hover{background:#135e96;text-decoration:none;color:#fff}
    .cp-404{text-align:center;padding:5rem 0}
    .cp-404 h1{font-size:5rem;font-weight:900;color:#dcdcde;margin:0}
    .cp-footer{background:#f6f7f7;border-top:1px solid #dcdcde;padding:1.5rem 0;text-align:center;color:#646970;font-size:.85rem}
    .cp-footer a{color:#646970}
    @media(max-width:600px){
      .cp-site-title{font-size:1.6rem}
      .cp-single-title{font-size:1.5rem}
      .cp-post-card-title{font-size:1.2rem}
    }
  </style>
</head>
<body>
  <header class="cp-header">
    <div class="cp-header-inner">
      <a href="/" class="cp-site-name">${escHtml(siteName)}</a>
      <nav>
        <a href="/">홈</a>
        
      </nav>
    </div>
  </header>
  <div class="cp-site-wrap">
    <div class="cp-container">
      ${content}
    </div>
  </div>
  <footer class="cp-footer">
    <div class="cp-container">
      &copy; ${(/* @__PURE__ */ new Date()).getFullYear()} ${escHtml(siteName)}
    </div>
  </footer>
</body>
</html>`;
}
__name(wrapInFullPage, "wrapInFullPage");
function defaultTemplate(templateName, context) {
  const cp = context.cp;
  const post = context.post;
  const title = post?.post_title || cp?.config?.SITE_NAME || "CloudPress Site";
  const content = post?.post_content || "";
  const siteName = cp?.config?.SITE_NAME || title;
  return wrapInFullPage(
    content ? `<article class="entry">
           <h1 class="entry-title">${escHtml(title)}</h1>
           <div class="entry-content">${content}</div>
         </article>` : `<div style="text-align:center;padding:4rem 0">
           <h1>${escHtml(siteName)}</h1>
         </div>`,
    cp,
    templateName
  );
}
__name(defaultTemplate, "defaultTemplate");

// cp-blog-header.js
async function handleRequest(request, env, ctx, options = {}) {
  let cp;
  try {
    cp = await cpLoad(request, env, ctx, options);
  } catch (e) {
    console.error("[cp-blog-header] cpLoad error:", e?.message);
    return errorPage("\uCD08\uAE30\uD654 \uC624\uB958", e?.message || "cpLoad \uC2E4\uD328");
  }
  if (cp && cp.__cpError) {
    return cp.response;
  }
  try {
    await cpQuery(request, cp);
  } catch (e) {
    console.error("[cp-blog-header] cpQuery error:", e?.message);
  }
  try {
    const result = await loadTemplate(request, cp);
    if (result instanceof Response) {
      return result;
    }
    if (typeof result === "string") {
      return new Response(result, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }
    return result;
  } catch (e) {
    console.error("[cp-blog-header] loadTemplate error:", e?.message);
    return errorPage("\uB80C\uB354\uB9C1 \uC624\uB958", e?.message || "\uD15C\uD50C\uB9BF \uB85C\uB4DC \uC2E4\uD328");
  }
}
__name(handleRequest, "handleRequest");
function errorPage(title, detail) {
  return new Response(
    `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CloudPress \u2014 ${escHtml2(title)}</title>
  <link rel="stylesheet" href="/cp-includes/css/error.css">
</head>
<body>
  <div class="error-box">
    <h1>CloudPress \u203A ${escHtml2(title)}</h1>
    <p>${escHtml2(detail)}</p>
  </div>
</body>
</html>`,
    { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
__name(errorPage, "errorPage");
function escHtml2(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(escHtml2, "escHtml");

// cp-activate.js
init_cp_load();

// cp-includes/sanitize.js
init_formatting();
function sanitizeTextField(str) {
  return String(str || "").replace(/<[^>]+>/g, "").replace(/[\r\n\t]+/g, " ").trim();
}
__name(sanitizeTextField, "sanitizeTextField");
function sanitizeEmail(str) {
  const s = String(str || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : "";
}
__name(sanitizeEmail, "sanitizeEmail");
function sanitizeUrl(str, allowedSchemes = ["http", "https", "mailto"]) {
  const s = String(str || "").trim();
  if (!s)
    return "";
  try {
    const u = new URL(s);
    const scheme = u.protocol.replace(":", "");
    if (!allowedSchemes.includes(scheme))
      return "";
    return u.href;
  } catch (_) {
    if (s.startsWith("/"))
      return s;
    return "";
  }
}
__name(sanitizeUrl, "sanitizeUrl");

// cp-includes/ms-functions.js
init_crypto();
init_option();
async function cpmuValidateUserSignup(cp, userLogin, userEmail) {
  const errors = [];
  if (!userLogin || userLogin.length < 4) {
    errors.push("Username must be at least 4 characters.");
  } else if (!/^[a-z0-9_\-\.]+$/.test(userLogin)) {
    errors.push("Username may only contain lowercase letters, numbers, hyphens, underscores, and periods.");
  } else {
    const existing = await userExistsByLogin(cp, userLogin);
    if (existing)
      errors.push("That username is already registered.");
    const signup = await signupExistsByLogin(cp, userLogin);
    if (signup)
      errors.push("That username is already pending activation.");
  }
  const cleanEmail = sanitizeEmail(userEmail);
  if (!cleanEmail) {
    errors.push("Invalid email address.");
  } else {
    const existing = await userExistsByEmail(cp, cleanEmail);
    if (existing)
      errors.push("That email address is already registered.");
  }
  return { user_name: userLogin, user_email: cleanEmail || userEmail, errors };
}
__name(cpmuValidateUserSignup, "cpmuValidateUserSignup");
async function cpmuValidateBlogSignup(cp, blogname, blogTitle, user = null) {
  const errors = [];
  const reserved = ["www", "web", "root", "admin", "main", "invite", "blogs", "cp-admin", "cp-login"];
  if (!blogname || blogname.length < 4) {
    errors.push("Site name must be at least 4 characters.");
  } else if (!/^[a-z0-9\-]+$/.test(blogname)) {
    errors.push("Site name may only contain lowercase letters, numbers, and hyphens.");
  } else if (reserved.includes(blogname)) {
    errors.push("That site name is not allowed.");
  } else {
    const existing = await blogExistsBySlug(cp, blogname);
    if (existing)
      errors.push("That site name is already taken.");
  }
  if (!blogTitle || blogTitle.trim().length < 1) {
    errors.push("Please provide a site title.");
  }
  return { blogname, blog_title: blogTitle, errors };
}
__name(cpmuValidateBlogSignup, "cpmuValidateBlogSignup");
async function cpmuRegisterUser(cp, userLogin, userEmail, meta = {}) {
  const prefix = cp.db_prefix || "cp_";
  const key = await generateActivationKey(userLogin);
  const now = (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace("T", " ");
  const metaJson = JSON.stringify(meta);
  await cp.db.prepare(`
    INSERT INTO ${prefix}signups
      (domain, path, title, user_login, user_email, registered, activation_key, meta)
    VALUES ('', '', '', ?, ?, ?, ?, ?)
  `).bind(userLogin, userEmail, now, key, metaJson).run();
  return { activation_key: key };
}
__name(cpmuRegisterUser, "cpmuRegisterUser");
async function cpmuRegisterBlog(cp, domain, path, title, userId, meta = {}) {
  const prefix = cp.db_prefix || "cp_";
  const key = await generateActivationKey(`${domain}${path}`);
  const now = (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace("T", " ");
  const metaJson = JSON.stringify({ ...meta, user_id: userId });
  await cp.db.prepare(`
    INSERT INTO ${prefix}signups
      (domain, path, title, user_login, user_email, registered, activation_key, meta)
    VALUES (?, ?, ?, '', '', ?, ?, ?)
  `).bind(domain, path, title, now, key, metaJson).run();
  return { activation_key: key };
}
__name(cpmuRegisterBlog, "cpmuRegisterBlog");
async function cpmuActivateSignup(cp, key) {
  const prefix = cp.db_prefix || "cp_";
  const signup = await cp.db.prepare(`
    SELECT * FROM ${prefix}signups WHERE activation_key=? AND active=0 LIMIT 1
  `).bind(key).first();
  if (!signup)
    return { error: "Invalid or already used activation key." };
  const now = (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace("T", " ");
  const meta = JSON.parse(signup.meta || "{}");
  let password = meta.password || generateRandomPassword();
  const hashed = await hashPassword(password);
  let userId = 0;
  let blogId = 0;
  if (signup.user_login) {
    await cp.db.prepare(`
      INSERT OR IGNORE INTO ${prefix}users
        (user_login, user_pass, user_email, user_registered, user_status, display_name)
      VALUES (?, ?, ?, ?, 0, ?)
    `).bind(signup.user_login, hashed, signup.user_email, now, signup.user_login).run();
    const row = await cp.db.prepare(
      `SELECT ID FROM ${prefix}users WHERE user_login=? LIMIT 1`
    ).bind(signup.user_login).first();
    userId = row?.ID || 0;
  }
  if (signup.domain && signup.path) {
    await cp.db.prepare(`
      INSERT OR IGNORE INTO ${prefix}blogs
        (site_id, domain, path, registered, last_updated, public)
      VALUES (1, ?, ?, ?, ?, 1)
    `).bind(signup.domain, signup.path, now, now).run();
    const row = await cp.db.prepare(
      `SELECT blog_id FROM ${prefix}blogs WHERE domain=? AND path=? LIMIT 1`
    ).bind(signup.domain, signup.path).first();
    blogId = row?.blog_id || 0;
  }
  await cp.db.prepare(`
    UPDATE ${prefix}signups SET active=1, activated=? WHERE activation_key=?
  `).bind(now, key).run();
  return { user_id: userId, blog_id: blogId, password };
}
__name(cpmuActivateSignup, "cpmuActivateSignup");
async function userExistsByLogin(cp, login) {
  const prefix = cp.db_prefix || "cp_";
  return cp.db.prepare(`SELECT ID FROM ${prefix}users WHERE user_login=? LIMIT 1`).bind(login).first();
}
__name(userExistsByLogin, "userExistsByLogin");
async function userExistsByEmail(cp, email) {
  const prefix = cp.db_prefix || "cp_";
  return cp.db.prepare(`SELECT ID FROM ${prefix}users WHERE user_email=? LIMIT 1`).bind(email).first();
}
__name(userExistsByEmail, "userExistsByEmail");
async function signupExistsByLogin(cp, login) {
  const prefix = cp.db_prefix || "cp_";
  return cp.db.prepare(`SELECT signup_id FROM ${prefix}signups WHERE user_login=? AND active=0 LIMIT 1`).bind(login).first();
}
__name(signupExistsByLogin, "signupExistsByLogin");
async function blogExistsBySlug(cp, slug) {
  const prefix = cp.db_prefix || "cp_";
  return cp.db.prepare(`SELECT blog_id FROM ${prefix}blogs WHERE domain LIKE ? OR path=? LIMIT 1`).bind(`${slug}.%`, `/${slug}/`).first();
}
__name(blogExistsBySlug, "blogExistsBySlug");
async function generateActivationKey(seed) {
  const data = new TextEncoder().encode(seed + Date.now() + Math.random());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
__name(generateActivationKey, "generateActivationKey");
function generateRandomPassword(length = 12) {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
__name(generateRandomPassword, "generateRandomPassword");

// cp-includes/functions.js
init_option();
init_formatting();

// cp-includes/link-template.js
init_option();
async function getPermalink(cp, post) {
  const siteUrl = await getOption(cp, "siteurl", cp.config?.SITE_URL || cp.url.origin);
  const permalinks = await getOption(cp, "permalink_structure", "/%year%/%monthnum%/%postname%/");
  const postObj = typeof post === "object" ? post : await fetchPost(cp, post);
  if (!postObj)
    return siteUrl;
  if (postObj.post_type === "page") {
    return `${siteUrl.replace(/\/$/, "")}/${postObj.post_name}/`;
  }
  const date = new Date(postObj.post_date || Date.now());
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const slug = (permalinks || "/%postname%/").replace("%year%", year).replace("%monthnum%", month).replace("%day%", day).replace("%postname%", postObj.post_name || String(postObj.ID)).replace("%post_id%", String(postObj.ID)).replace("%author%", postObj.post_author || "1");
  return `${siteUrl.replace(/\/$/, "")}${slug}`;
}
__name(getPermalink, "getPermalink");
async function getCommentLink(cp, comment) {
  const prefix = cp.db_prefix || "cp_";
  let commentObj = comment;
  if (typeof comment !== "object") {
    commentObj = await cp.db.prepare(
      `SELECT * FROM ${prefix}comments WHERE comment_ID=? LIMIT 1`
    ).bind(comment).first();
  }
  if (!commentObj)
    return "";
  const postUrl = await getPermalink(cp, commentObj.comment_post_ID);
  return `${postUrl}#comment-${commentObj.comment_ID}`;
}
__name(getCommentLink, "getCommentLink");
async function getRegistrationUrl(cp) {
  const siteUrl = await getOption(cp, "siteurl", cp.config?.SITE_URL || cp.url.origin);
  return `${siteUrl.replace(/\/$/, "")}/cp-signup`;
}
__name(getRegistrationUrl, "getRegistrationUrl");
async function fetchPost(cp, postId) {
  const prefix = cp.db_prefix || "cp_";
  return cp.db.prepare(`SELECT * FROM ${prefix}posts WHERE ID=? LIMIT 1`).bind(postId).first();
}
__name(fetchPost, "fetchPost");

// cp-includes/functions.js
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
__name(jsonResponse, "jsonResponse");
function redirect(url, status = 302) {
  return new Response(null, { status, headers: { Location: url } });
}
__name(redirect, "redirect");
function isMultisite() {
  return false;
}
__name(isMultisite, "isMultisite");
function cpSafeRedirect(url, status = 302) {
  return redirect(url, status);
}
__name(cpSafeRedirect, "cpSafeRedirect");
function cpRedirect(url, status = 302) {
  return redirect(url, status);
}
__name(cpRedirect, "cpRedirect");

// cp-activate.js
init_formatting();
async function handleActivate(request, env, ctx) {
  const cp = await cpLoad(request, env, ctx, { CP_INSTALLING: true });
  if (cp.__cpError)
    return cp.response;
  if (!isMultisite(cp)) {
    return cpRedirect(await getRegistrationUrl(cp));
  }
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  let key = "";
  const getKey = url.searchParams.get("key") || "";
  if (method === "POST") {
    const formData = await request.formData().catch(() => new FormData());
    const postKey = formData.get("key") || "";
    if (getKey && postKey && getKey !== postKey) {
      return cpDie(
        cp,
        "A key value mismatch has been detected. Please follow the link provided in your activation email.",
        "An error occurred during the activation",
        400
      );
    }
    key = postKey ? sanitizeTextField(postKey) : getKey ? sanitizeTextField(getKey) : "";
  } else {
    key = getKey ? sanitizeTextField(getKey) : "";
  }
  let result = null;
  let activateCookieKey = null;
  if (key) {
    if (url.searchParams.has("key")) {
      const cleanUrl = new URL(url.toString());
      cleanUrl.searchParams.delete("key");
      const cookieId = crypto.randomUUID();
      await env.CP_KV.put(`cp:activate_cookie:${cookieId}`, key, { expirationTtl: 1800 });
      const response2 = cpRedirect(cleanUrl.toString());
      response2.headers.append("Set-Cookie", `cp_activate=${cookieId}; Path=/; HttpOnly; SameSite=Lax`);
      return response2;
    } else {
      result = await cpmuActivateSignup(cp, key);
    }
  }
  if (result === null) {
    const cookieHeader = request.headers.get("Cookie") || "";
    const cookieMatch = cookieHeader.match(/cp_activate=([^;]+)/);
    if (cookieMatch) {
      const cookieId = cookieMatch[1];
      const storedKey = await env.CP_KV.get(`cp:activate_cookie:${cookieId}`);
      if (storedKey) {
        key = storedKey;
        result = await cpmuActivateSignup(cp, storedKey);
        await env.CP_KV.delete(`cp:activate_cookie:${cookieId}`);
        activateCookieKey = cookieId;
      }
    }
  }
  let statusCode = 200;
  if (result === null || result?.error === "invalid_key") {
    statusCode = 404;
  } else if (result?.error && !["already_active", "blog_taken"].includes(result.error)) {
    statusCode = 400;
  }
  const html = await renderActivatePage(cp, key, result, url);
  const response = new Response(html, {
    status: statusCode,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache"
    }
  });
  if (activateCookieKey) {
    response.headers.append(
      "Set-Cookie",
      `cp_activate=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`
    );
  }
  return response;
}
__name(handleActivate, "handleActivate");
async function renderActivatePage(cp, key, result, url) {
  const siteName = cp.config.SITE_NAME || "CloudPress";
  let bodyContent = "";
  if (!key) {
    const actionUrl = url.pathname;
    bodyContent = `
      <h2>Activation Key Required</h2>
      <form id="activateform" method="post" action="${actionUrl}">
        <p>
          <label for="key">Activation Key:</label><br>
          <input type="text" name="key" id="key" value="" size="50" autofocus>
        </p>
        <p class="submit">
          <button type="submit" id="submit" class="cp-btn">Activate</button>
        </p>
      </form>`;
  } else if (result?.error && ["already_active", "blog_taken"].includes(result.error)) {
    const signup = result.data || {};
    bodyContent = `
      <h2>Your account is now active!</h2>
      <p class="lead-in">
        Your account has been activated. You may now
        <a href="/cp-login">log in</a> using your chosen username
        &#8220;${escHtml(signup.user_login || "")}&#8221;.
        Please check your email inbox at ${escHtml(signup.user_email || "")} for your login instructions.
      </p>`;
  } else if (result === null || result?.error) {
    bodyContent = `
      <h2>An error occurred during the activation</h2>
      ${result?.message ? `<p>${escHtml(result.message)}</p>` : ""}`;
  } else {
    const loginUrl = result.blog_id ? `/cp-login` : `/cp-login`;
    bodyContent = `
      <h2>Your account is now active!</h2>
      <div id="signup-welcome">
        <p><span class="h3">Username:</span> ${escHtml(result.user_login || "")}</p>
        <p><span class="h3">Password:</span> ${escHtml(result.password || "")}</p>
      </div>
      <p class="view">
        Your account is now activated.
        <a href="${loginUrl}">Log in</a> or go back to the
        <a href="/">homepage</a>.
      </p>`;
  }
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(siteName)} &rsaquo; Activate</title>
  <link rel="stylesheet" href="/cp-includes/css/activate.css">
</head>
<body>
<div id="signup-content">
  <div class="cp-activate-container">
    ${bodyContent}
  </div>
</div>
</body>
</html>`;
}
__name(renderActivatePage, "renderActivatePage");
function cpDie(cp, message, title = "Error", status = 500) {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>${escHtml(title)}</title></head>
<body><h1>${escHtml(title)}</h1><p>${escHtml(message)}</p></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}
__name(cpDie, "cpDie");

// cp-signup.js
init_cp_load();
init_formatting();

// cp-includes/mail.js
init_option();
async function cpMail(cp, to, subject, message, headers = {}, attachments = []) {
  const siteName = await getOption(cp, "blogname", cp.config?.SITE_NAME || "CloudPress");
  const siteUrl = await getOption(cp, "siteurl", cp.config?.SITE_URL || cp.url?.origin || "");
  const domain = siteUrl ? new URL(siteUrl).hostname : "example.com";
  const fromAddress = cp.env?.CP_MAIL_FROM || `noreply@${domain}`;
  const fromName = cp.env?.CP_MAIL_FROM_NAME || siteName;
  const toList = Array.isArray(to) ? to : [to];
  const contentType = headers["Content-Type"] || "text/html; charset=UTF-8";
  const isHtml = contentType.includes("text/html");
  const mailData = cp.hooks?.applyFilters?.("cp_mail", { to: toList, subject, message, headers }) || {
    to: toList,
    subject,
    message,
    headers
  };
  try {
    return await sendViaMailChannels(cp, {
      from: { email: fromAddress, name: fromName },
      to: mailData.to.map((addr) => ({ email: addr.trim() })),
      subject: mailData.subject,
      content: isHtml ? [{ type: "text/html", value: mailData.message }] : [{ type: "text/plain", value: mailData.message }],
      headers: mailData.headers
    });
  } catch (err) {
    if (cp.config?.CP_DEBUG) {
      console.error("[cpMail] send failed:", err);
    }
    return false;
  }
}
__name(cpMail, "cpMail");
async function sendActivationEmail(cp, email, activationKey) {
  const siteName = await getOption(cp, "blogname", cp.config?.SITE_NAME || "CloudPress");
  const siteUrl = await getOption(cp, "siteurl", cp.config?.SITE_URL || cp.url?.origin || "");
  const activateUrl = `${siteUrl.replace(/\/$/, "")}/cp-activate?key=${encodeURIComponent(activationKey)}&email=${encodeURIComponent(email)}`;
  return cpMail(
    cp,
    email,
    `Activate your account at ${siteName}`,
    `<p>Thank you for registering at <strong>${siteName}</strong>.</p><p>Please click the link below to activate your account:</p><p><a href="${activateUrl}">${activateUrl}</a></p><p>If you did not register, you can ignore this email.</p>`
  );
}
__name(sendActivationEmail, "sendActivationEmail");
async function sendViaMailChannels(cp, payload) {
  const body = {
    personalizations: [
      {
        to: payload.to,
        ...payload.cc?.length ? { cc: payload.cc } : {},
        ...payload.bcc?.length ? { bcc: payload.bcc } : {}
      }
    ],
    from: payload.from,
    subject: payload.subject,
    content: payload.content
  };
  const res = await fetch("https://api.mailchannels.net/tx/v1/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return res.status === 202 || res.status === 200;
}
__name(sendViaMailChannels, "sendViaMailChannels");

// cp-signup.js
async function handleSignup(request, env, ctx) {
  const cp = await cpLoad(request, env, ctx);
  if (cp.__cpError)
    return cp.response;
  if (!isMultisite(cp)) {
    return cpRedirect("/");
  }
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  let stage = "user";
  let errors = {};
  let formData = {};
  if (method === "POST") {
    const fd = await request.formData().catch(() => new FormData());
    for (const [k, v] of fd.entries()) {
      formData[k] = typeof v === "string" ? v : "";
    }
    stage = formData.stage || "validate_user";
  } else {
    stage = url.searchParams.get("stage") || "user";
  }
  const registrationMode = cp.hooks.applyFilters("cp_registration_open", cp.config.REGISTRATION || "none");
  let html = "";
  switch (stage) {
    case "validate_user": {
      const userLogin = sanitizeTextField(formData.user_name || "");
      const userEmail = sanitizeEmail(formData.user_email || "");
      const validation = await cpmuValidateUserSignup(cp, userLogin, userEmail);
      errors = validation.errors;
      if (Object.keys(errors).length === 0) {
        const key = await cpmuRegisterUser(cp, userLogin, userEmail);
        await sendActivationEmail(cp, userEmail, key);
        html = renderSignupComplete(cp, userEmail);
      } else {
        html = renderUserForm(cp, errors, { user_name: userLogin, user_email: userEmail });
      }
      break;
    }
    case "validate_blog": {
      const userLogin = sanitizeTextField(formData.user_name || "");
      const userEmail = sanitizeEmail(formData.user_email || "");
      const blogDomain = sanitizeTextField(formData.blogname || "");
      const blogTitle = sanitizeTextField(formData.blog_title || "");
      const blogPublic = formData.blog_public !== "0";
      const validation = await cpmuValidateBlogSignup(cp, blogDomain, blogTitle, { user_name: userLogin, user_email: userEmail });
      errors = validation.errors;
      if (Object.keys(errors).length === 0) {
        const key = await cpmuRegisterBlog(cp, userLogin, userEmail, blogDomain, blogTitle, blogPublic);
        await sendActivationEmail(cp, userEmail, key);
        html = renderSignupComplete(cp, userEmail);
      } else {
        html = renderBlogForm(cp, errors, formData);
      }
      break;
    }
    case "blog":
      html = renderBlogForm(cp, {}, {});
      break;
    case "user":
    default:
      html = renderUserForm(cp, {}, {});
      break;
  }
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
__name(handleSignup, "handleSignup");
function renderLayout(cp, title, content) {
  const siteName = cp.config.SITE_NAME || "CloudPress";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(siteName)} &rsaquo; ${escHtml(title)}</title>
  <link rel="stylesheet" href="/cp-includes/css/signup.css">
</head>
<body>
<div class="signup-wrapper">
  <div class="site-name"><a href="/">${escHtml(siteName)}</a></div>
  <div class="signup-box">
    ${content}
  </div>
</div>
</body>
</html>`;
}
__name(renderLayout, "renderLayout");
function renderUserForm(cp, errors, values) {
  const errorHtml = Object.values(errors).length ? `<ul class="error-list">${Object.values(errors).map((e) => `<li>${escHtml(e)}</li>`).join("")}</ul>` : "";
  const content = `
    <h2>Create an Account</h2>
    ${errorHtml}
    <form method="post" action="/cp-signup">
      <input type="hidden" name="stage" value="validate_user">
      <label for="user_name">Username</label>
      <input type="text" name="user_name" id="user_name" value="${escHtml(values.user_name || "")}" autocomplete="username" autofocus>
      <p class="hint">Lowercase letters, numbers, and underscores only.</p>
      <label for="user_email">Email Address</label>
      <input type="email" name="user_email" id="user_email" value="${escHtml(values.user_email || "")}" autocomplete="email">
      <button type="submit" class="cp-btn">Create Account</button>
    </form>`;
  return renderLayout(cp, "Sign Up", content);
}
__name(renderUserForm, "renderUserForm");
function renderBlogForm(cp, errors, values) {
  const errorHtml = Object.values(errors).length ? `<ul class="error-list">${Object.values(errors).map((e) => `<li>${escHtml(e)}</li>`).join("")}</ul>` : "";
  const content = `
    <h2>Create Your Site</h2>
    ${errorHtml}
    <form method="post" action="/cp-signup">
      <input type="hidden" name="stage" value="validate_blog">
      <input type="hidden" name="user_name" value="${escHtml(values.user_name || "")}">
      <input type="hidden" name="user_email" value="${escHtml(values.user_email || "")}">
      <label for="blogname">Site Address</label>
      <input type="text" name="blogname" id="blogname" value="${escHtml(values.blogname || "")}" autofocus>
      <p class="hint">Only lowercase letters and numbers. Cannot be changed.</p>
      <label for="blog_title">Site Title</label>
      <input type="text" name="blog_title" id="blog_title" value="${escHtml(values.blog_title || "")}">
      <button type="submit" class="cp-btn">Create Site</button>
    </form>`;
  return renderLayout(cp, "Create Site", content);
}
__name(renderBlogForm, "renderBlogForm");
function renderSignupComplete(cp, email) {
  const content = `
    <div class="success">
      <h2>Check Your Email</h2>
      <p>We have sent an activation link to <strong>${escHtml(email)}</strong>.</p>
      <p>Please click the link in the email to activate your account. If you do not receive it, check your spam folder.</p>
    </div>`;
  return renderLayout(cp, "Registration Complete", content);
}
__name(renderSignupComplete, "renderSignupComplete");

// cp-comments-post.js
init_cp_load();

// cp-includes/comment.js
init_option();
init_formatting();
async function insertComment(cp, data) {
  const prefix = cp.db_prefix || "cp_";
  const now = (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 19);
  const approved = data.comment_approved ?? "0";
  const parent = data.comment_parent || 0;
  const result = await cp.db.prepare(`
    INSERT INTO ${prefix}comments
      (comment_post_ID, comment_author, comment_author_email, comment_author_url,
       comment_author_IP, comment_date, comment_date_gmt, comment_content,
       comment_approved, comment_agent, comment_type, comment_parent, user_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    data.comment_post_ID || 0,
    data.comment_author || "",
    data.comment_author_email || "",
    data.comment_author_url || "",
    data.comment_author_IP || "",
    data.comment_date || now,
    data.comment_date_gmt || now,
    data.comment_content || "",
    approved,
    data.comment_agent || "",
    data.comment_type || "comment",
    parent,
    data.user_id || 0
  ).run();
  if (approved === "1" && data.comment_post_ID) {
    await updateCommentCount(cp, data.comment_post_ID);
  }
  return result.meta?.last_row_id || 0;
}
__name(insertComment, "insertComment");
async function updateCommentCount(cp, postId) {
  const prefix = cp.db_prefix || "cp_";
  const row = await cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}comments WHERE comment_post_ID=? AND comment_approved='1'`).bind(postId).first();
  await cp.db.prepare(`UPDATE ${prefix}posts SET comment_count=? WHERE ID=?`).bind(row?.n ?? 0, postId).run();
}
__name(updateCommentCount, "updateCommentCount");
async function handleCommentSubmission(request, cp) {
  const data = await request.formData().catch(() => new FormData());
  const commentPostId = parseInt(data.get("comment_post_ID") || "0");
  const author = String(data.get("author") || "").trim();
  const email = String(data.get("email") || "").trim();
  const url = String(data.get("url") || "").trim();
  const comment = String(data.get("comment") || "").trim();
  if (!comment)
    return { error: "Comment is empty." };
  const id = await insertComment(cp, {
    comment_post_ID: commentPostId,
    comment_author: author,
    comment_author_email: email,
    comment_author_url: url,
    comment_content: comment,
    comment_approved: 1
  });
  return { id };
}
__name(handleCommentSubmission, "handleCommentSubmission");
async function newComment(cp, data) {
  return insertComment(cp, data);
}
__name(newComment, "newComment");

// cp-comments-post.js
init_user();
init_crypto();
init_formatting();
async function handleCommentsPost(request, env, ctx) {
  if (request.method.toUpperCase() !== "POST") {
    return new Response("Method not allowed. Use POST to submit comments.", {
      status: 405,
      headers: {
        "Allow": "POST",
        "Content-Type": "text/plain"
      }
    });
  }
  const cp = await cpLoad(request, env, ctx);
  if (cp.__cpError)
    return cp.response;
  let postData = {};
  try {
    const formData = await request.formData();
    for (const [key, value] of formData.entries()) {
      postData[key] = value;
    }
  } catch (_) {
    return cpDie2(cp, "Invalid form data.", "Comment Submission Failure", 400);
  }
  const responseHeaders = new Headers({
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma": "no-cache"
  });
  const commentResult = await handleCommentSubmission(cp, postData);
  if (commentResult.error) {
    const { status = 400, message } = commentResult;
    return cpDie2(cp, `<p>${escHtml(message)}</p>`, "Comment Submission Failure", status, true);
  }
  const comment = commentResult.comment;
  const user = await getCurrentUser(cp);
  const cookiesConsent = !!postData["cp-comment-cookies-consent"];
  cp.hooks.doAction("set_comment_cookies", comment, user, cookiesConsent);
  let location = postData.redirect_to ? `${postData.redirect_to}#comment-${comment.comment_ID}` : await getCommentLink(cp, comment);
  if (!cookiesConsent && comment.comment_approved === "0" && comment.comment_author_email) {
    const moderationHash = await cpHash(comment.comment_date_gmt, cp.config.AUTH_KEY);
    const locUrl = new URL(location, cp.config.SITE_URL || "https://example.com");
    locUrl.searchParams.set("unapproved", comment.comment_ID);
    locUrl.searchParams.set("moderation-hash", moderationHash);
    location = locUrl.toString();
  }
  location = cp.hooks.applyFilters("comment_post_redirect", location, comment);
  return cpSafeRedirect(location, responseHeaders);
}
__name(handleCommentsPost, "handleCommentsPost");
function cpDie2(cp, message, title = "Error", status = 500, backLink = false) {
  const back = backLink ? '<p><a href="javascript:history.back()">&larr; Go back</a></p>' : "";
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)}</title>
  <link rel="stylesheet" href="/cp-includes/css/comments.css">
</head>
<body>
  <div class="box">
    <h1>${escHtml(title)}</h1>
    ${message}
    ${back}
  </div>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}
__name(cpDie2, "cpDie");

// cp-router.js
init_cp_cron();

// cp-trackback.js
init_cp_load();
init_formatting();
async function handleTrackback(request, env, ctx, routeParams = {}) {
  const cp = await cpLoad(request, env, ctx);
  if (cp.__cpError)
    return cp.response;
  cp.currentUser = null;
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  let postId = parseInt(routeParams.post_id || url.searchParams.get("tb_id") || "0", 10);
  if (!postId) {
    const parts = url.pathname.split("/").filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      const n = parseInt(parts[i], 10);
      if (n > 0) {
        postId = n;
        break;
      }
    }
  }
  let postData = {};
  if (method === "POST") {
    try {
      const formData = await request.formData();
      for (const [k, v] of formData.entries()) {
        postData[k] = typeof v === "string" ? v : "";
      }
    } catch (_) {
    }
  }
  const trackbackUrl = postData.url ? sanitizeUrl(postData.url) : "";
  let charset = postData.charset ? sanitizeTextField(postData.charset) : "";
  let title = postData.title || "";
  let excerpt = postData.excerpt || "";
  let blogName = postData.blog_name || "";
  if (charset) {
    charset = charset.replace(/[, ]/g, "").toUpperCase().trim();
    const allowedCharsets = ["UTF-8", "ASCII", "ISO-8859-1", "EUC-JP", "SJIS"];
    if (!allowedCharsets.includes(charset))
      charset = "";
  }
  if (charset.includes("UTF-7")) {
    return new Response("", { status: 400 });
  }
  title = sanitizeTextField(title);
  excerpt = sanitizeTextField(excerpt);
  blogName = sanitizeTextField(blogName);
  if (!postId) {
    return trackbackResponse(true, "I really need an ID for this to work.");
  }
  if (!trackbackUrl && !title && !blogName) {
    const permalink = `/?p=${postId}`;
    return Response.redirect(cp.hooks.applyFilters("cp_redirect_no_trackback", permalink, postId), 302);
  }
  if (trackbackUrl && title) {
    cp.hooks.doAction("pre_trackback_post", postId, trackbackUrl, charset, title, excerpt, blogName);
    const isPingsOpen = await pingsOpen(cp, postId);
    if (!isPingsOpen) {
      return trackbackResponse(true, "Sorry, trackbacks are closed for this item.");
    }
    title = htmlExcerpt(title, 250);
    excerpt = htmlExcerpt(excerpt, 252);
    const prefix = cp.config.DB_PREFIX || "cp_";
    const existing = await cp.db.prepare(`
      SELECT comment_ID FROM ${prefix}comments
      WHERE comment_post_ID = ? AND comment_author_url = ?
      LIMIT 1
    `).bind(postId, trackbackUrl).first();
    if (existing) {
      return trackbackResponse(true, "There is already a ping from that URL for this post.");
    }
    const commentData = {
      comment_post_ID: postId,
      comment_author: blogName,
      comment_author_email: "",
      comment_author_url: trackbackUrl,
      comment_content: `<strong>${title}</strong>

${excerpt}`,
      comment_type: "trackback"
    };
    const result = await newComment(cp, commentData);
    if (result.error) {
      return trackbackResponse(true, result.message);
    }
    const trackbackId = result.comment_ID;
    cp.hooks.doAction("trackback_post", trackbackId);
    return trackbackResponse(false);
  }
  return trackbackResponse(true, "Missing trackback URL or title.");
}
__name(handleTrackback, "handleTrackback");
function trackbackResponse(error, errorMessage = "") {
  let xml = '<?xml version="1.0" encoding="utf-8"?>\n<response>\n';
  if (error) {
    xml += `<error>1</error>
<message>${escXml(errorMessage)}</message>
`;
  } else {
    xml += "<error>0</error>\n";
  }
  xml += "</response>";
  return new Response(xml, {
    status: error ? 400 : 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" }
  });
}
__name(trackbackResponse, "trackbackResponse");
function escXml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
__name(escXml, "escXml");

// cp-links-opml.js
init_cp_load();

// cp-includes/category.js
init_formatting();
async function getTerms(cp, args = {}) {
  const prefix = cp.db_prefix || "cp_";
  const taxonomy = args.taxonomy || "category";
  const hideEmpty = args.hide_empty !== false;
  const limit = Math.min(parseInt(args.number || 0) || 200, 500);
  const orderby = args.orderby === "count" ? "tt.count" : args.orderby === "name" ? "t.name" : "t.name";
  const order = args.order === "DESC" ? "DESC" : "ASC";
  const parent = args.parent !== void 0 ? args.parent : null;
  const where = ["tt.taxonomy=?"];
  const params = [taxonomy];
  if (hideEmpty) {
    where.push("tt.count > 0");
  }
  if (parent !== null) {
    where.push("tt.parent=?");
    params.push(parent);
  }
  if (args.search) {
    where.push("t.name LIKE ?");
    params.push(`%${args.search}%`);
  }
  const rows = await cp.db.prepare(`
    SELECT t.*, tt.taxonomy, tt.description, tt.parent, tt.count, tt.term_taxonomy_id
    FROM ${prefix}terms t
    JOIN ${prefix}term_taxonomy tt ON t.term_id = tt.term_id
    WHERE ${where.join(" AND ")}
    ORDER BY ${orderby} ${order}
    LIMIT ?
  `).bind(...params, limit).all();
  return rows.results || [];
}
__name(getTerms, "getTerms");

// cp-includes/bookmark.js
async function getBookmarks(cp, args = {}) {
  const prefix = cp.db_prefix || "cp_";
  const {
    orderby = "name",
    order = "ASC",
    limit = -1,
    category = 0,
    category_name = "",
    hide_invisible = "1",
    include = "",
    exclude = "",
    search = ""
  } = args;
  const safeOrder = order.toUpperCase() === "DESC" ? "DESC" : "ASC";
  const colMap = { name: "link_name", rating: "link_rating", updated: "link_updated", id: "link_id" };
  const safeOrderby = colMap[orderby] || "link_name";
  let sql = `SELECT l.* FROM ${prefix}links l`;
  const params = [];
  if (category || category_name) {
    sql += `
      JOIN ${prefix}term_relationships tr ON tr.object_id = l.link_id
      JOIN ${prefix}term_taxonomy tt ON tt.term_taxonomy_id = tr.term_taxonomy_id AND tt.taxonomy='link_category'
      JOIN ${prefix}terms t ON t.term_id = tt.term_id`;
  }
  const where = [];
  if (hide_invisible === "1") {
    where.push(`l.link_visible='Y'`);
  }
  if (include) {
    const ids = include.split(",").map((s) => parseInt(s.trim())).filter(Boolean);
    if (ids.length)
      where.push(`l.link_id IN (${ids.join(",")})`);
  }
  if (exclude) {
    const ids = exclude.split(",").map((s) => parseInt(s.trim())).filter(Boolean);
    if (ids.length)
      where.push(`l.link_id NOT IN (${ids.join(",")})`);
  }
  if (category) {
    where.push(`t.term_id=?`);
    params.push(category);
  }
  if (category_name) {
    where.push(`t.slug=?`);
    params.push(category_name);
  }
  if (search) {
    where.push(`(l.link_name LIKE ? OR l.link_url LIKE ? OR l.link_description LIKE ?)`);
    const q = `%${search}%`;
    params.push(q, q, q);
  }
  if (where.length)
    sql += " WHERE " + where.join(" AND ");
  sql += ` ORDER BY ${safeOrderby} ${safeOrder}`;
  if (limit > 0) {
    sql += " LIMIT ?";
    params.push(limit);
  }
  const stmt = params.length ? cp.db.prepare(sql).bind(...params) : cp.db.prepare(sql);
  const { results } = await stmt.all();
  return results || [];
}
__name(getBookmarks, "getBookmarks");

// cp-links-opml.js
init_option();
async function handleLinksOpml(request, env, ctx) {
  const cp = await cpLoad(request, env, ctx);
  if (cp.__cpError)
    return cp.response;
  const url = new URL(request.url);
  let linkCat = url.searchParams.get("link_cat") || "";
  if (linkCat && !["all", "0"].includes(linkCat)) {
    linkCat = parseInt(linkCat, 10);
    if (isNaN(linkCat) || linkCat <= 0)
      linkCat = "";
  }
  const blogCharset = await getOption(cp, "blogcharset") || "UTF-8";
  const blogName = await getOption(cp, "blogname") || (cp.config.SITE_NAME || "CloudPress");
  let cats;
  if (!linkCat) {
    cats = await getTerms(cp, { taxonomy: "link_category", hierarchical: false });
  } else {
    cats = await getTerms(cp, { taxonomy: "link_category", hierarchical: false, include: [linkCat] });
  }
  cp.hooks.doAction("opml_head");
  const now = (/* @__PURE__ */ new Date()).toUTCString();
  let xml = `<?xml version="1.0"?>
`;
  xml += `<opml version="1.0">
`;
  xml += `	<head>
`;
  xml += `		<title>Links for ${escXml2(blogName)}</title>
`;
  xml += `		<dateCreated>${escXml2(now)}</dateCreated>
`;
  xml += `	</head>
`;
  xml += `	<body>
`;
  for (const cat of cats || []) {
    const catName = cp.hooks.applyFilters("link_category", cat.name || "");
    xml += `<outline type="category" title="${escXml2(catName)}">
`;
    const bookmarks = await getBookmarks(cp, { category: cat.term_id });
    for (const bookmark of bookmarks || []) {
      const title = cp.hooks.applyFilters("link_title", bookmark.link_name || "");
      const updated = bookmark.link_updated && bookmark.link_updated !== "0000-00-00 00:00:00" ? bookmark.link_updated : "";
      xml += `	<outline text="${escXml2(title)}" type="link" `;
      xml += `xmlUrl="${escXml2(bookmark.link_rss || "")}" `;
      xml += `htmlUrl="${escXml2(bookmark.link_url || "")}" `;
      if (updated)
        xml += `updated="${escXml2(updated)}" `;
      xml += `/>
`;
    }
    xml += `</outline>
`;
  }
  xml += `	</body>
</opml>`;
  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": `text/xml; charset=${blogCharset}`,
      "Cache-Control": "no-cache"
    }
  });
}
__name(handleLinksOpml, "handleLinksOpml");
function escXml2(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
__name(escXml2, "escXml");

// cp-mail.js
init_cp_load();
init_option();
init_user();

// cp-includes/transient.js
var KEY_PREFIX = "cp:transient:";
async function setTransient(cp, key, value, expiration = 3600) {
  const kvKey = KEY_PREFIX + key;
  const stored = JSON.stringify(value);
  const opts = expiration > 0 ? { expirationTtl: expiration } : {};
  try {
    await cp.kv.put(kvKey, stored, opts);
    return true;
  } catch (_) {
    return false;
  }
}
__name(setTransient, "setTransient");
async function getTransient(cp, key) {
  const kvKey = KEY_PREFIX + key;
  try {
    const raw = await cp.kv.get(kvKey);
    if (raw === null)
      return false;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return raw;
    }
  } catch (_) {
    return false;
  }
}
__name(getTransient, "getTransient");

// cp-mail.js
init_formatting();
var MAIL_INTERVAL = 5 * 60;
async function handleMail(request, env, ctx) {
  const cp = await cpLoad(request, env, ctx);
  if (cp.__cpError)
    return cp.response;
  const enablePostByEmail = cp.hooks.applyFilters("enable_post_by_email_configuration", true);
  if (!enablePostByEmail) {
    return cpDie3(cp, "This action has been disabled by the administrator.", 403);
  }
  const mailserverUrl = await getOption(cp, "mailserver_url");
  if (!mailserverUrl || mailserverUrl === "mail.example.com") {
    return cpDie3(cp, "This action has been disabled by the administrator.", 403);
  }
  cp.hooks.doAction("cp_mail");
  const lastChecked = await getTransient(cp, "mailserver_last_checked");
  if (lastChecked) {
    const elapsed = Math.floor(Date.now() / 1e3) - parseInt(lastChecked, 10);
    const remaining = MAIL_INTERVAL - elapsed;
    return cpDie3(
      cp,
      `Email checks are rate limited to once every ${formatDuration(MAIL_INTERVAL)}. Next check available in ${formatDuration(Math.max(0, remaining))}.`,
      429
    );
  }
  await setTransient(cp, "mailserver_last_checked", String(Math.floor(Date.now() / 1e3)), MAIL_INTERVAL);
  const output = [];
  try {
    const result = await processMailbox(cp, output);
    if (!result.success) {
      return cpDie3(cp, result.message, 500);
    }
  } catch (err) {
    return cpDie3(cp, `Mail processing error: ${escHtml(err.message)}`, 500);
  }
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>CloudPress Mail</title></head><body><h1>Mail Processing Results</h1>${output.join("\n")}</body></html>`,
    {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    }
  );
}
__name(handleMail, "handleMail");
async function processMailbox(cp, output) {
  const pendingEmails = await cp.kv.list({ prefix: "cp:pending_email:" });
  if (!pendingEmails.keys || pendingEmails.keys.length === 0) {
    output.push("<p>There does not seem to be any new mail.</p>");
    return { success: true };
  }
  const defaultCategory = await getOption(cp, "default_email_category") || 1;
  const gmtOffset = parseFloat(await getOption(cp, "gmt_offset") || "0");
  const phonDelim = "::";
  for (const { name: kvKey } of pendingEmails.keys) {
    let emailData;
    try {
      emailData = await cp.kv.get(kvKey, { type: "json" });
      if (!emailData)
        continue;
    } catch (_) {
      continue;
    }
    const { from, subject: rawSubject, body, date } = emailData;
    let postAuthor = 1;
    const authorEmail = sanitizeEmail(from || "");
    if (authorEmail) {
      const userdata = await getUserBy(cp, "email", authorEmail);
      if (userdata) {
        postAuthor = userdata.ID;
      }
    }
    let subject = (rawSubject || "").split(phonDelim)[0].trim();
    let content = (body || "").split(phonDelim)[1] || body || "";
    content = content.trim();
    content = cp.hooks.applyFilters("cp_mail_original_content", content);
    const postContent = cp.hooks.applyFilters("phone_content", content);
    const postTitle = subject || "Untitled";
    const postStatus = postAuthor === 1 ? "pending" : "publish";
    const postDate = date ? new Date(date).toISOString().replace("T", " ").slice(0, 19) : null;
    const postData = {
      post_content: postContent,
      post_title: postTitle,
      post_date: postDate,
      post_author: postAuthor,
      post_category: [defaultCategory],
      post_status: postStatus
    };
    const postID = await insertPost(cp, postData);
    if (!postID) {
      output.push(`<p>Failed to insert post for email: ${escHtml(rawSubject)}</p>`);
      continue;
    }
    cp.hooks.doAction("publish_phone", postID);
    output.push(`<p><strong>Author:</strong> ${escHtml(String(postAuthor))}</p>`);
    output.push(`<p><strong>Posted title:</strong> ${escHtml(postTitle)}</p>`);
    await cp.kv.delete(kvKey);
  }
  return { success: true };
}
__name(processMailbox, "processMailbox");
function formatDuration(seconds) {
  if (seconds < 60)
    return `${seconds} seconds`;
  if (seconds < 3600)
    return `${Math.floor(seconds / 60)} minutes`;
  return `${Math.floor(seconds / 3600)} hours`;
}
__name(formatDuration, "formatDuration");
function cpDie3(cp, message, status = 500) {
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>CloudPress Mail</title></head>
<body><p>${escHtml(message)}</p></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}
__name(cpDie3, "cpDie");

// cp-admin/index.js
init_cp_load();

// cp-admin/auth-check.js
init_jwt();
init_user();
init_session();
async function requireAdmin(cp) {
  const user = await getAdminUser(cp);
  if (!user) {
    const loginUrl = `/cp-login?redirect_to=${encodeURIComponent(cp.url.pathname + cp.url.search)}`;
    return Response.redirect(new URL(loginUrl, cp.url.origin).toString(), 302);
  }
  if (!userHasRole(user, ["administrator"])) {
    return new Response(
      '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Access Denied</title></head><body><h1>Access Denied</h1><p>You do not have permission to access the admin area.</p><a href="/">Return to site</a></body></html>',
      { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
  cp.currentUser = user;
  return null;
}
__name(requireAdmin, "requireAdmin");
async function getAdminUser(cp) {
  const token = extractToken(cp.request);
  if (!token)
    return null;
  try {
    const payload = await verifyJwt(token, cp.config.AUTH_KEY);
    if (!payload || !payload.sub)
      return null;
    const revoked = await cp.kv.get(`cp:token_revoked:${payload.jti || payload.sub}`);
    if (revoked)
      return null;
    const user = await getUserById(cp, payload.sub);
    return user || null;
  } catch (_) {
    return null;
  }
}
__name(getAdminUser, "getAdminUser");
function userHasRole(user, roles) {
  if (!user)
    return false;
  const userRoles = user.roles || [];
  return roles.some((r) => userRoles.includes(r));
}
__name(userHasRole, "userHasRole");

// cp-admin/admin-shell.js
init_option();
init_formatting();
async function renderAdminShell(cp, content, opts = {}) {
  const { title = "Dashboard", bodyClass = "", notices = [] } = opts;
  const siteName = await getOption(cp, "blogname").catch(() => cp.config.SITE_NAME || "CloudPress");
  const siteUrl = cp.config.SITE_URL || cp.url.origin;
  const user = cp.currentUser;
  const userLogin = user?.user_login || "Admin";
  const currentPath = cp.url.pathname;
  const adminVersion = cp.version || "1.2.0";
  const navItems = buildNavItems(cp, currentPath);
  const navHtml = renderNav(navItems, currentPath);
  const noticeHtml = notices.map(
    (n) => `<div class="cp-notice cp-notice-${n.type || "info"}" role="alert"><p>${escHtml(n.message)}</p></div>`
  ).join("");
  return `<!DOCTYPE html>
<html lang="ko" class="cp-admin">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)} &lsaquo; CloudPress Admin</title>
  <meta name="robots" content="noindex,nofollow">
  <link rel="icon" href="/cp-admin/images/favicon.ico" type="image/x-icon">
  <link rel="stylesheet" href="/cp-admin/css/admin.css">
</head>
<body class="cp-admin-body ${escHtml(bodyClass)}">

<!-- -- Top Bar ------------------------------------------------------------- -->
<div id="cp-topbar">
  <div class="cp-topbar-left">
    <button id="cp-menu-toggle" aria-label="Toggle menu" onclick="document.body.classList.toggle('cp-sidebar-open')">
      <span></span><span></span><span></span>
    </button>
    <a href="${escHtml(siteUrl)}" class="cp-site-link" target="_blank" title="Visit site">
      &#127758; ${escHtml(siteName)}
    </a>
  </div>
  <div class="cp-topbar-right">
    <span class="cp-version">CloudPress ${escHtml(adminVersion)}</span>
    <div class="cp-user-menu">
      <button class="cp-user-btn" onclick="this.parentElement.classList.toggle('open')">
        ${escHtml(userLogin)} &#9660;
      </button>
      <div class="cp-user-dropdown">
        <a href="/cp-admin/profile">Profile</a>
        <a href="${escHtml(siteUrl)}" target="_blank">View Site</a>
        <hr>
        <a href="/cp-logout" class="cp-logout">Log Out</a>
      </div>
    </div>
  </div>
</div>

<!-- -- Layout -------------------------------------------------------------- -->
<div id="cp-layout">

  <!-- Sidebar -->
  <nav id="cp-sidebar" aria-label="Admin navigation">
    <div class="cp-sidebar-header">
      <a href="/cp-admin" class="cp-logo">
        <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="32" height="32" rx="8" fill="#F6821F"/>
          <path d="M8 16C8 11.582 11.582 8 16 8C20.418 8 24 11.582 24 16C24 20.418 20.418 24 16 24C11.582 24 8 20.418 8 16Z" fill="white" fill-opacity="0.2"/>
          <path d="M13 12L19 16L13 20V12Z" fill="white"/>
        </svg>
        <span>CloudPress</span>
      </a>
    </div>
    ${navHtml}
  </nav>

  <!-- Main Content -->
  <main id="cp-main">
    <div class="cp-page-header">
      <h1 class="cp-page-title">${escHtml(title)}</h1>
    </div>
    ${noticeHtml}
    <div class="cp-content-wrap">
      ${content}
    </div>
  </main>

</div>

<!-- -- Admin Footer ---------------------------------------------------------- -->
<footer id="cp-footer">
  <span>CloudPress ${escHtml(adminVersion)} &mdash; Powered by <a href="https://cloudflare.com" target="_blank">Cloudflare</a></span>
</footer>

<script>${getAdminJS()}<\/script>
</body>
</html>`;
}
__name(renderAdminShell, "renderAdminShell");
function buildNavItems(cp, currentPath) {
  return [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: "&#9635;",
      href: "/cp-admin",
      exact: true
    },
    {
      id: "posts",
      label: "Posts",
      icon: "&#128221;",
      href: "/cp-admin/edit",
      children: [
        { label: "All Posts", href: "/cp-admin/edit" },
        { label: "Add New", href: "/cp-admin/post-new" },
        { label: "Categories", href: "/cp-admin/edit-tags?taxonomy=category" },
        { label: "Tags", href: "/cp-admin/edit-tags?taxonomy=post_tag" }
      ]
    },
    {
      id: "media",
      label: "Media",
      icon: "&#128247;",
      href: "/cp-admin/upload",
      children: [
        { label: "Library", href: "/cp-admin/upload" },
        { label: "Add New", href: "/cp-admin/media-new" }
      ]
    },
    {
      id: "pages",
      label: "Pages",
      icon: "&#128196;",
      href: "/cp-admin/edit?post_type=page",
      children: [
        { label: "All Pages", href: "/cp-admin/edit?post_type=page" },
        { label: "Add New", href: "/cp-admin/page-new" }
      ]
    },
    {
      id: "comments",
      label: "Comments",
      icon: "&#128172;",
      href: "/cp-admin/edit-comments"
    },
    {
      id: "appearance",
      label: "Appearance",
      icon: "&#127912;",
      href: "/cp-admin/themes",
      children: [
        { label: "Themes", href: "/cp-admin/themes" },
        { label: "Theme Editor", href: "/cp-admin/theme-editor" }
      ]
    },
    {
      id: "plugins",
      label: "Plugins",
      icon: "&#129529;",
      href: "/cp-admin/plugins",
      children: [
        { label: "Installed Plugins", href: "/cp-admin/plugins" },
        { label: "Add New", href: "/cp-admin/plugin-install" },
        { label: "Plugin Editor", href: "/cp-admin/plugin-editor" }
      ]
    },
    {
      id: "users",
      label: "Users",
      icon: "&#128101;",
      href: "/cp-admin/users",
      children: [
        { label: "All Users", href: "/cp-admin/users" },
        { label: "Add New", href: "/cp-admin/user-new" },
        { label: "Profile", href: "/cp-admin/profile" }
      ]
    },
    {
      id: "tools",
      label: "Tools",
      icon: "&#128295;",
      href: "/cp-admin/tools",
      children: [
        { label: "Available Tools", href: "/cp-admin/tools" },
        { label: "Import", href: "/cp-admin/import" },
        { label: "Export", href: "/cp-admin/export" },
        { label: "GitHub Sync", href: "/cp-admin/github-sync" }
      ]
    },
    {
      id: "settings",
      label: "Settings",
      icon: "&#9881;",
      href: "/cp-admin/options-general",
      children: [
        { label: "General", href: "/cp-admin/options-general" },
        { label: "Writing", href: "/cp-admin/options-writing" },
        { label: "Reading", href: "/cp-admin/options-reading" },
        { label: "Discussion", href: "/cp-admin/options-discussion" },
        { label: "Media", href: "/cp-admin/options-media" },
        { label: "Permalinks", href: "/cp-admin/options-permalink" },
        { label: "GitHub", href: "/cp-admin/options-general#github" }
      ]
    }
  ];
}
__name(buildNavItems, "buildNavItems");
function renderNav(items, currentPath) {
  return `<ul class="cp-nav-list">
    ${items.map((item) => {
    const isActive = item.exact ? currentPath === item.href : currentPath.startsWith(item.href.split("?")[0]);
    const hasChildren = item.children && item.children.length;
    return `<li class="cp-nav-item ${isActive ? "active" : ""} ${hasChildren ? "has-children" : ""}">
        <a href="${escHtml(item.href)}" class="cp-nav-link">
          <span class="cp-nav-icon">${item.icon}</span>
          <span class="cp-nav-label">${escHtml(item.label)}</span>
          ${hasChildren ? '<span class="cp-nav-arrow">&#9660;</span>' : ""}
        </a>
        ${hasChildren ? `
        <ul class="cp-subnav">
          ${item.children.map((child) => `
            <li class="${currentPath === child.href.split("?")[0] ? "active" : ""}">
              <a href="${escHtml(child.href)}">${escHtml(child.label)}</a>
            </li>
          `).join("")}
        </ul>` : ""}
      </li>`;
  }).join("")}
  </ul>`;
}
__name(renderNav, "renderNav");
function getAdminJS() {
  return `
// Close dropdowns on outside click
document.addEventListener('click', function(e) {
  if (!e.target.closest('.cp-user-menu')) {
    document.querySelectorAll('.cp-user-menu.open').forEach(m => m.classList.remove('open'));
  }
});

// Nav submenu toggle (click-based for accessibility)
document.querySelectorAll('.cp-nav-item.has-children > .cp-nav-link').forEach(link => {
  link.addEventListener('click', function(e) {
    if (window.innerWidth < 1200) {
      e.preventDefault();
      this.parentElement.classList.toggle('active');
    }
  });
});

// AJAX form submit helper (used by sub-pages)
window.cpAjax = async function(action, data) {
  const fd = new FormData();
  fd.append('action', action);
  Object.entries(data || {}).forEach(([k,v]) => fd.append(k, v));
  const r = await fetch('/cp-admin/admin-ajax', { method: 'POST', body: fd });
  return r.json();
};

// Confirm delete
document.querySelectorAll('[data-confirm]').forEach(el => {
  el.addEventListener('click', function(e) {
    if (!confirm(this.dataset.confirm || 'Are you sure?')) e.preventDefault();
  });
});
`;
}
__name(getAdminJS, "getAdminJS");

// cp-admin/installer.js
init_cp_config();
init_crypto();
var SCHEMA_VERSION = 1;
async function handleInstaller(request, env, ctx) {
  if (!env.CP_DB)
    return bindingError("CP_DB", "D1 database");
  if (!env.CP_KV)
    return bindingError("CP_KV", "KV namespace");
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const method = request.method.toUpperCase();
  let isInstalled = false;
  try {
    const cfg = await env.CP_KV.get("cp:config", { type: "json" });
    isInstalled = !!(cfg && cfg.installed);
  } catch (_) {
  }
  if (path === "/cp-admin/setup-config") {
    return handleSetupConfig(request, env, method, isInstalled);
  }
  if (path === "/cp-admin/install") {
    return handleInstall(request, env, method, isInstalled, url);
  }
  return new Response("Not found", { status: 404 });
}
__name(handleInstaller, "handleInstaller");
async function handleSetupConfig(request, env, method, isInstalled) {
  if (isInstalled) {
    return htmlResponse(renderAlreadyInstalled(), 200);
  }
  let errors = {};
  let values = {};
  if (method === "POST") {
    const fd = await request.formData().catch(() => new FormData());
    values = {
      site_url: (fd.get("site_url") || "").trim(),
      site_name: (fd.get("site_name") || "").trim(),
      admin_email: (fd.get("admin_email") || "").trim(),
      db_prefix: (fd.get("db_prefix") || "cp_").trim(),
      github_repo: (fd.get("github_repo") || "").trim()
    };
    if (!values.site_name)
      errors.site_name = "Site name is required.";
    if (!values.admin_email || !values.admin_email.includes("@"))
      errors.admin_email = "Valid email required.";
    if (!/^[a-zA-Z][a-zA-Z0-9_]*_$/.test(values.db_prefix)) {
      errors.db_prefix = "Prefix must start with a letter, contain only letters/numbers/underscores, and end with _.";
    }
    if (Object.keys(errors).length === 0) {
      await env.CP_KV.put("cp:install_step1", JSON.stringify(values), { expirationTtl: 3600 });
      return redirect("/cp-admin/install");
    }
  }
  return htmlResponse(renderSetupForm(errors, values), 200);
}
__name(handleSetupConfig, "handleSetupConfig");
async function handleInstall(request, env, method, isInstalled, url) {
  if (isInstalled && !url.searchParams.has("force")) {
    return htmlResponse(renderAlreadyInstalled(), 200);
  }
  let step1 = {};
  try {
    step1 = await env.CP_KV.get("cp:install_step1", { type: "json" }) || {};
  } catch (_) {
  }
  let errors = {};
  let values = {};
  if (method === "POST") {
    const fd = await request.formData().catch(() => new FormData());
    values = {
      admin_user: (fd.get("admin_user") || "").trim(),
      admin_password: (fd.get("admin_password") || "").trim(),
      admin_password2: (fd.get("admin_password2") || "").trim()
    };
    if (!values.admin_user || !/^[a-zA-Z0-9_.-]+$/.test(values.admin_user)) {
      errors.admin_user = "Username must contain only letters, numbers, underscores, hyphens, or dots.";
    }
    if (!values.admin_password || values.admin_password.length < 8) {
      errors.admin_password = "Password must be at least 8 characters.";
    }
    if (values.admin_password !== values.admin_password2) {
      errors.admin_password2 = "Passwords do not match.";
    }
    if (Object.keys(errors).length === 0) {
      const result = await runInstall(env, step1, values);
      if (result.success) {
        await env.CP_KV.delete("cp:install_step1");
        return htmlResponse(renderInstallSuccess(result), 200);
      } else {
        errors.install = result.message;
      }
    }
  }
  return htmlResponse(renderInstallForm(errors, values, step1), 200);
}
__name(handleInstall, "handleInstall");
async function runInstall(env, step1, adminInfo) {
  const prefix = step1.db_prefix || "cp_";
  const siteUrl = step1.site_url || "";
  const siteName = step1.site_name || "CloudPress Site";
  try {
    await createSchema(env.CP_DB, prefix);
    const passwordHash = await hashPassword(adminInfo.admin_password);
    const now = (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 19);
    await env.CP_DB.prepare(`
      INSERT INTO ${prefix}users
        (user_login, user_pass, user_email, user_registered, display_name, user_status)
      VALUES (?, ?, ?, ?, ?, 0)
    `).bind(
      adminInfo.admin_user,
      passwordHash,
      step1.admin_email || "",
      now,
      adminInfo.admin_user
    ).run();
    const userRow = await env.CP_DB.prepare(
      `SELECT ID FROM ${prefix}users WHERE user_login = ? LIMIT 1`
    ).bind(adminInfo.admin_user).first();
    const userId = userRow?.ID || 1;
    await env.CP_DB.prepare(`
      INSERT INTO ${prefix}usermeta (user_id, meta_key, meta_value)
      VALUES (?, ?, ?)
    `).bind(userId, `${prefix}capabilities`, JSON.stringify({ administrator: true })).run();
    const defaultOptions = [
      ["siteurl", siteUrl || "http://localhost"],
      ["blogname", siteName],
      ["blogdescription", "Just another CloudPress site"],
      ["admin_email", step1.admin_email || ""],
      ["blogcharset", "UTF-8"],
      ["date_format", "F j, Y"],
      ["time_format", "g:i a"],
      ["posts_per_page", "10"],
      ["default_comment_status", "open"],
      ["default_ping_status", "open"],
      ["permalink_structure", "/%year%/%monthnum%/%postname%/"],
      ["cp_schema_version", String(SCHEMA_VERSION)],
      ["cp_user_roles", JSON.stringify({
        administrator: { name: "Administrator", capabilities: { administrator: true } },
        editor: { name: "Editor", capabilities: { edit_posts: true, publish_posts: true } },
        author: { name: "Author", capabilities: { edit_posts: true, upload_files: true } },
        contributor: { name: "Contributor", capabilities: { edit_posts: true } },
        subscriber: { name: "Subscriber", capabilities: { read: true } }
      })],
      ["active_plugins", "[]"],
      ["template", "default"],
      ["stylesheet", "default"],
      ["cp_github_repo", step1.github_repo || ""]
    ];
    for (const [key, value] of defaultOptions) {
      await env.CP_DB.prepare(`
        INSERT OR IGNORE INTO ${prefix}options (option_name, option_value, autoload)
        VALUES (?, ?, 'yes')
      `).bind(key, value).run();
    }
    await env.CP_DB.prepare(`
      INSERT INTO ${prefix}terms (name, slug, term_group)
      VALUES ('Uncategorized', 'uncategorized', 0)
    `).run();
    const termRow = await env.CP_DB.prepare(
      `SELECT term_id FROM ${prefix}terms WHERE slug = 'uncategorized' LIMIT 1`
    ).first();
    const termId = termRow?.term_id || 1;
    await env.CP_DB.prepare(`
      INSERT INTO ${prefix}term_taxonomy (term_id, taxonomy, description, parent, count)
      VALUES (?, 'category', '', 0, 1)
    `).bind(termId).run();
    await env.CP_DB.prepare(`
      INSERT INTO ${prefix}posts
        (post_author, post_date, post_content, post_title, post_status, post_type,
         post_name, comment_status, ping_status, post_modified)
      VALUES (?, ?, ?, 'Hello world!', 'publish', 'post',
              'hello-world', 'open', 'open', ?)
    `).bind(
      userId,
      now,
      "<p>Welcome to CloudPress. This is your first post. Edit or delete it, then start writing!</p>",
      now
    ).run();
    await saveConfig(env, {
      SITE_URL: siteUrl,
      SITE_NAME: siteName,
      ADMIN_EMAIL: step1.admin_email || "",
      DB_PREFIX: prefix,
      GITHUB_REPO: step1.github_repo || "",
      installed: true
    });
    return { success: true, admin_user: adminInfo.admin_user };
  } catch (err) {
    console.error("[CloudPress Install]", err);
    return { success: false, message: `Install failed: ${err.message}` };
  }
}
__name(runInstall, "runInstall");
async function createSchema(db, prefix) {
  const tables = [
    `CREATE TABLE IF NOT EXISTS ${prefix}posts (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      post_author INTEGER NOT NULL DEFAULT 0,
      post_date TEXT NOT NULL DEFAULT '',
      post_date_gmt TEXT NOT NULL DEFAULT '',
      post_content TEXT NOT NULL DEFAULT '',
      post_title TEXT NOT NULL DEFAULT '',
      post_excerpt TEXT NOT NULL DEFAULT '',
      post_status TEXT NOT NULL DEFAULT 'publish',
      comment_status TEXT NOT NULL DEFAULT 'open',
      ping_status TEXT NOT NULL DEFAULT 'open',
      post_password TEXT NOT NULL DEFAULT '',
      post_name TEXT NOT NULL DEFAULT '',
      to_ping TEXT NOT NULL DEFAULT '',
      pinged TEXT NOT NULL DEFAULT '',
      post_modified TEXT NOT NULL DEFAULT '',
      post_modified_gmt TEXT NOT NULL DEFAULT '',
      post_content_filtered TEXT NOT NULL DEFAULT '',
      post_parent INTEGER NOT NULL DEFAULT 0,
      guid TEXT NOT NULL DEFAULT '',
      menu_order INTEGER NOT NULL DEFAULT 0,
      post_type TEXT NOT NULL DEFAULT 'post',
      post_mime_type TEXT NOT NULL DEFAULT '',
      comment_count INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS ${prefix}postmeta (
      meta_id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL DEFAULT 0,
      meta_key TEXT DEFAULT NULL,
      meta_value TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS ${prefix}users (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      user_login TEXT NOT NULL DEFAULT '',
      user_pass TEXT NOT NULL DEFAULT '',
      user_nicename TEXT NOT NULL DEFAULT '',
      user_email TEXT NOT NULL DEFAULT '',
      user_url TEXT NOT NULL DEFAULT '',
      user_registered TEXT NOT NULL DEFAULT '',
      user_activation_key TEXT NOT NULL DEFAULT '',
      user_status INTEGER NOT NULL DEFAULT 0,
      display_name TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS ${prefix}usermeta (
      umeta_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 0,
      meta_key TEXT DEFAULT NULL,
      meta_value TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS ${prefix}options (
      option_id INTEGER PRIMARY KEY AUTOINCREMENT,
      option_name TEXT NOT NULL DEFAULT '',
      option_value TEXT NOT NULL DEFAULT '',
      autoload TEXT NOT NULL DEFAULT 'yes',
      UNIQUE(option_name)
    )`,
    `CREATE TABLE IF NOT EXISTS ${prefix}terms (
      term_id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      slug TEXT NOT NULL DEFAULT '',
      term_group INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS ${prefix}term_taxonomy (
      term_taxonomy_id INTEGER PRIMARY KEY AUTOINCREMENT,
      term_id INTEGER NOT NULL DEFAULT 0,
      taxonomy TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      parent INTEGER NOT NULL DEFAULT 0,
      count INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS ${prefix}term_relationships (
      object_id INTEGER NOT NULL DEFAULT 0,
      term_taxonomy_id INTEGER NOT NULL DEFAULT 0,
      term_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (object_id, term_taxonomy_id)
    )`,
    `CREATE TABLE IF NOT EXISTS ${prefix}comments (
      comment_ID INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_post_ID INTEGER NOT NULL DEFAULT 0,
      comment_author TEXT NOT NULL DEFAULT '',
      comment_author_email TEXT NOT NULL DEFAULT '',
      comment_author_url TEXT NOT NULL DEFAULT '',
      comment_author_IP TEXT NOT NULL DEFAULT '',
      comment_date TEXT NOT NULL DEFAULT '',
      comment_date_gmt TEXT NOT NULL DEFAULT '',
      comment_content TEXT NOT NULL DEFAULT '',
      comment_karma INTEGER NOT NULL DEFAULT 0,
      comment_approved TEXT NOT NULL DEFAULT '1',
      comment_agent TEXT NOT NULL DEFAULT '',
      comment_type TEXT NOT NULL DEFAULT 'comment',
      comment_parent INTEGER NOT NULL DEFAULT 0,
      user_id INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS ${prefix}commentmeta (
      meta_id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id INTEGER NOT NULL DEFAULT 0,
      meta_key TEXT DEFAULT NULL,
      meta_value TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS ${prefix}links (
      link_id INTEGER PRIMARY KEY AUTOINCREMENT,
      link_url TEXT NOT NULL DEFAULT '',
      link_name TEXT NOT NULL DEFAULT '',
      link_image TEXT NOT NULL DEFAULT '',
      link_target TEXT NOT NULL DEFAULT '',
      link_description TEXT NOT NULL DEFAULT '',
      link_visible TEXT NOT NULL DEFAULT 'Y',
      link_owner INTEGER NOT NULL DEFAULT 1,
      link_rating INTEGER NOT NULL DEFAULT 0,
      link_updated TEXT NOT NULL DEFAULT '',
      link_rel TEXT NOT NULL DEFAULT '',
      link_notes TEXT NOT NULL DEFAULT '',
      link_rss TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS ${prefix}cron_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      schedule TEXT,
      hook TEXT NOT NULL,
      args TEXT NOT NULL DEFAULT '[]'
    )`
  ];
  for (const sql of tables) {
    await db.prepare(sql).run();
  }
  const indexes = [
    `CREATE INDEX IF NOT EXISTS ${prefix}posts_post_name ON ${prefix}posts(post_name)`,
    `CREATE INDEX IF NOT EXISTS ${prefix}posts_post_type_status ON ${prefix}posts(post_type, post_status)`,
    `CREATE INDEX IF NOT EXISTS ${prefix}postmeta_post_id ON ${prefix}postmeta(post_id)`,
    `CREATE INDEX IF NOT EXISTS ${prefix}postmeta_meta_key ON ${prefix}postmeta(meta_key)`,
    `CREATE INDEX IF NOT EXISTS ${prefix}users_user_login ON ${prefix}users(user_login)`,
    `CREATE INDEX IF NOT EXISTS ${prefix}users_user_email ON ${prefix}users(user_email)`,
    `CREATE INDEX IF NOT EXISTS ${prefix}usermeta_user_id ON ${prefix}usermeta(user_id)`,
    `CREATE INDEX IF NOT EXISTS ${prefix}comments_post_id ON ${prefix}comments(comment_post_ID)`,
    `CREATE INDEX IF NOT EXISTS ${prefix}term_relationships_tid ON ${prefix}term_relationships(term_taxonomy_id)`,
    `CREATE INDEX IF NOT EXISTS ${prefix}cron_events_ts ON ${prefix}cron_events(timestamp)`
  ];
  for (const idx of indexes) {
    await db.prepare(idx).run().catch(() => {
    });
  }
}
__name(createSchema, "createSchema");
function renderSetupForm(errors, values) {
  return layout("CloudPress Setup -- Step 1: Configuration", `
    <div class="install-card">
      <h2>Welcome to CloudPress</h2>
      <p class="lead">Let's configure your site before installing. This information is stored securely in Cloudflare KV.</p>
      ${renderErrors(errors)}
      <form method="post">
        <table class="form-table">
          <tr>
            <th><label for="site_url">Site URL</label></th>
            <td>
              <input type="url" id="site_url" name="site_url" class="regular-text"
                     value="${esc(values.site_url || "")}" placeholder="https://example.com">
              <p class="description">The full URL where CloudPress will live. Must match your Cloudflare Worker route.</p>
            </td>
          </tr>
          <tr>
            <th><label for="site_name">Site Title</label></th>
            <td>
              <input type="text" id="site_name" name="site_name" class="regular-text"
                     value="${esc(values.site_name || "")}" required>
            </td>
          </tr>
          <tr>
            <th><label for="admin_email">Admin Email</label></th>
            <td>
              <input type="email" id="admin_email" name="admin_email" class="regular-text"
                     value="${esc(values.admin_email || "")}" required>
            </td>
          </tr>
          <tr>
            <th><label for="db_prefix">Table Prefix</label></th>
            <td>
              <input type="text" id="db_prefix" name="db_prefix" class="regular-text"
                     value="${esc(values.db_prefix || "cp_")}" pattern="[a-zA-Z][a-zA-Z0-9_]*_">
              <p class="description">D1 table prefix. Must end with underscore. Default: <code>cp_</code></p>
            </td>
          </tr>
          <tr>
            <th><label for="github_repo">GitHub CMS Repo</label></th>
            <td>
              <input type="text" id="github_repo" name="github_repo" class="regular-text"
                     value="${esc(values.github_repo || "")}" placeholder="owner/repo">
              <p class="description">Optional: GitHub repository for themes/plugins (e.g. <code>myorg/cloudpress-themes</code>). Set GitHub Token as a Cloudflare Worker secret (<code>CP_GITHUB_TOKEN</code>).</p>
            </td>
          </tr>
        </table>
        <p class="submit">
          <button type="submit" class="btn btn-primary">Continue to Installation &rarr;</button>
        </p>
      </form>
    </div>
  `);
}
__name(renderSetupForm, "renderSetupForm");
function renderInstallForm(errors, values, step1) {
  return layout("CloudPress Setup -- Step 2: Create Admin User", `
    <div class="install-card">
      <h2>Create Your Administrator Account</h2>
      <p class="lead">Almost there! Set up your admin login credentials.</p>
      ${step1.site_name ? `<p>Site: <strong>${esc(step1.site_name)}</strong></p>` : ""}
      ${renderErrors(errors)}
      <form method="post">
        <table class="form-table">
          <tr>
            <th><label for="admin_user">Admin Username</label></th>
            <td>
              <input type="text" id="admin_user" name="admin_user" class="regular-text"
                     value="${esc(values.admin_user || "admin")}" required autocomplete="username">
              <p class="description">Lowercase letters, numbers, hyphens, underscores, and dots only.</p>
            </td>
          </tr>
          <tr>
            <th><label for="admin_password">Password</label></th>
            <td>
              <input type="password" id="admin_password" name="admin_password" class="regular-text"
                     value="" required minlength="8" autocomplete="new-password">
              <p class="description">Minimum 8 characters. Use a strong password.</p>
            </td>
          </tr>
          <tr>
            <th><label for="admin_password2">Confirm Password</label></th>
            <td>
              <input type="password" id="admin_password2" name="admin_password2" class="regular-text"
                     value="" required minlength="8" autocomplete="new-password">
            </td>
          </tr>
        </table>
        <p class="submit">
          <button type="submit" class="btn btn-primary">Install CloudPress</button>
        </p>
      </form>
    </div>
  `);
}
__name(renderInstallForm, "renderInstallForm");
function renderInstallSuccess(result) {
  return layout("CloudPress Installed!", `
    <div class="install-card success-card">
      <div class="success-icon">&#10003;</div>
      <h2>CloudPress has been installed successfully!</h2>
      <p>Your site is ready. Here are your login details -- <strong>save them now</strong>.</p>
      <table class="form-table">
        <tr>
          <th>Username</th>
          <td><code>${esc(result.admin_user)}</code></td>
        </tr>
        <tr>
          <th>Password</th>
          <td><em>The password you chose during installation.</em></td>
        </tr>
      </table>
      <p class="submit">
        <a href="/cp-login" class="btn btn-primary">Log In to CloudPress Admin</a>
        <a href="/" class="btn btn-secondary">Visit Site</a>
      </p>
    </div>
  `);
}
__name(renderInstallSuccess, "renderInstallSuccess");
function renderAlreadyInstalled() {
  return layout("Already Installed", `
    <div class="install-card">
      <h2>CloudPress is already installed.</h2>
      <p>If you need to reinstall, add <code>?force=1</code> to the URL (this will reset your database).</p>
      <p>
        <a href="/cp-login" class="btn btn-primary">Log In</a>
        <a href="/" class="btn btn-secondary">Visit Site</a>
      </p>
    </div>
  `);
}
__name(renderAlreadyInstalled, "renderAlreadyInstalled");
function renderErrors(errors) {
  const msgs = Object.values(errors);
  if (!msgs.length)
    return "";
  return `<div class="notice-error"><ul>${msgs.map((m) => `<li>${esc(m)}</li>`).join("")}</ul></div>`;
}
__name(renderErrors, "renderErrors");
function layout(title, content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)}</title>
  <link rel="stylesheet" href="/cp-admin/css/installer.css">
</head>
<body>
<div class="install-wrap">
  <div class="install-header">
    <a href="/" class="install-logo">Cloud<span>Press</span></a>
  </div>
  ${content}
</div>
</body>
</html>`;
}
__name(layout, "layout");
function htmlResponse(html, status = 200) {
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
__name(htmlResponse, "htmlResponse");
function esc(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(esc, "esc");
function bindingError(binding, name) {
  return new Response(
    `<!DOCTYPE html><html><body><h1>CloudPress Install Error</h1><p>Cloudflare binding <strong>${binding}</strong> (${name}) is not configured. Please add it in the Cloudflare Workers dashboard before installing.</p></body></html>`,
    { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
__name(bindingError, "bindingError");

// cp-admin/pages/dashboard.js
init_option();
async function handleDashboard(request, cp) {
  const prefix = cp.config.DB_PREFIX || "cp_";
  const [postCount, pageCount, commentCount, userCount] = await Promise.all([
    cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}posts WHERE post_type='post' AND post_status='publish'`).first(),
    cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}posts WHERE post_type='page' AND post_status='publish'`).first(),
    cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}comments WHERE comment_approved='1'`).first(),
    cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}users`).first()
  ]);
  const recentPosts = await cp.db.prepare(
    `SELECT ID, post_title, post_status, post_date FROM ${prefix}posts
     WHERE post_type='post' ORDER BY post_date DESC LIMIT 5`
  ).all();
  const recentComments = await cp.db.prepare(
    `SELECT c.comment_ID, c.comment_author, c.comment_content, c.comment_approved, c.comment_date,
            p.post_title
     FROM ${prefix}comments c
     LEFT JOIN ${prefix}posts p ON c.comment_post_ID = p.ID
     ORDER BY c.comment_date DESC LIMIT 5`
  ).all();
  const siteName = await getOption(cp, "blogname").catch(() => "CloudPress");
  const siteUrl = await getOption(cp, "siteurl").catch(() => "/");
  const user = cp.currentUser;
  const content = `
<div class="cp-dash-grid">
  <div class="cp-dash-stat">
    <div class="cp-dash-stat-icon">&#128221;</div>
    <div>
      <div class="cp-dash-stat-num">${postCount?.n ?? 0}</div>
      <div class="cp-dash-stat-label">Published Posts</div>
    </div>
  </div>
  <div class="cp-dash-stat">
    <div class="cp-dash-stat-icon">&#128196;</div>
    <div>
      <div class="cp-dash-stat-num">${pageCount?.n ?? 0}</div>
      <div class="cp-dash-stat-label">Pages</div>
    </div>
  </div>
  <div class="cp-dash-stat">
    <div class="cp-dash-stat-icon">&#128172;</div>
    <div>
      <div class="cp-dash-stat-num">${commentCount?.n ?? 0}</div>
      <div class="cp-dash-stat-label">Comments</div>
    </div>
  </div>
  <div class="cp-dash-stat">
    <div class="cp-dash-stat-icon">&#128101;</div>
    <div>
      <div class="cp-dash-stat-num">${userCount?.n ?? 0}</div>
      <div class="cp-dash-stat-label">Users</div>
    </div>
  </div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">

  <!-- Quick Actions -->
  <div class="cp-card">
    <h2>Quick Actions</h2>
    <div style="display:flex;flex-direction:column;gap:8px">
      <a href="/cp-admin/post-new" class="cp-btn" style="justify-content:center">&#43; New Post</a>
      <a href="/cp-admin/page-new" class="cp-btn cp-btn-secondary" style="justify-content:center">&#43; New Page</a>
      <a href="/cp-admin/upload" class="cp-btn cp-btn-secondary" style="justify-content:center">&#43; Upload Media</a>
      <a href="/cp-admin/github-sync" class="cp-btn cp-btn-secondary" style="justify-content:center">&#127758; GitHub Sync</a>
    </div>
  </div>

  <!-- At a Glance -->
  <div class="cp-card">
    <h2>Site Info</h2>
    <table style="width:100%;font-size:13px;border-collapse:collapse">
      <tr><td style="padding:5px 0;color:#646970">Site</td><td><a href="${esc2(siteUrl)}" target="_blank">${esc2(siteName)}</a></td></tr>
      <tr><td style="padding:5px 0;color:#646970">CloudPress Version</td><td>${esc2(cp.version || "1.2.0")}</td></tr>
      <tr><td style="padding:5px 0;color:#646970">Logged in as</td><td>${esc2(user?.display_name || user?.user_login || "")}</td></tr>
      <tr><td style="padding:5px 0;color:#646970">Role</td><td><span class="cp-badge cp-badge-publish">${esc2((user?.roles || ["administrator"])[0])}</span></td></tr>
      <tr><td style="padding:5px 0;color:#646970">Platform</td><td>Cloudflare Workers + D1 + KV</td></tr>
    </table>
  </div>

</div>

<!-- Recent Posts -->
<div class="cp-card">
  <h2>Recent Posts</h2>
  ${(recentPosts?.results || []).length ? `
  <div class="cp-table-wrap">
    <table class="cp-table">
      <thead><tr><th>Title</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
      <tbody>
        ${(recentPosts.results || []).map((p) => `
          <tr>
            <td><a href="/cp-admin/post?post=${p.ID}">${esc2(p.post_title || "(no title)")}</a></td>
            <td><span class="cp-badge cp-badge-${p.post_status}">${esc2(p.post_status)}</span></td>
            <td>${esc2(formatDate(p.post_date))}</td>
            <td>
              <a href="/cp-admin/post?post=${p.ID}" class="cp-btn cp-btn-secondary" style="padding:3px 10px;font-size:12px">Edit</a>
              <a href="/?p=${p.ID}" target="_blank" class="cp-btn cp-btn-secondary" style="padding:3px 10px;font-size:12px">View</a>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  </div>
  ` : '<p style="color:#646970">No posts yet. <a href="/cp-admin/post-new">Write your first post</a>.</p>'}
</div>

<!-- Recent Comments -->
<div class="cp-card">
  <h2>Recent Comments</h2>
  ${(recentComments?.results || []).length ? `
  <div class="cp-table-wrap">
    <table class="cp-table">
      <thead><tr><th>Author</th><th>Comment</th><th>Post</th><th>Status</th></tr></thead>
      <tbody>
        ${(recentComments.results || []).map((c) => `
          <tr>
            <td>${esc2(c.comment_author)}</td>
            <td>${esc2(truncate2(c.comment_content, 60))}</td>
            <td>${esc2(c.post_title || "")}</td>
            <td><span class="cp-badge ${c.comment_approved === "1" ? "cp-badge-publish" : "cp-badge-pending"}">${c.comment_approved === "1" ? "Approved" : "Pending"}</span></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  </div>
  ` : '<p style="color:#646970">No comments yet.</p>'}
</div>
`;
  const html = await renderAdminShell(cp, content, { title: "Dashboard" });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
__name(handleDashboard, "handleDashboard");
function esc2(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(esc2, "esc");
function formatDate(dateStr) {
  if (!dateStr)
    return "";
  try {
    return new Date(dateStr).toLocaleDateString();
  } catch (_) {
    return dateStr;
  }
}
__name(formatDate, "formatDate");
function truncate2(str, n) {
  if (!str)
    return "";
  return str.length > n ? str.slice(0, n) + "..." : str;
}
__name(truncate2, "truncate");

// cp-admin/pages/posts.js
async function handlePosts(request, cp, opts = {}) {
  const url = cp.url;
  const prefix = cp.config.DB_PREFIX || "cp_";
  const postType = opts.post_type || url.searchParams.get("post_type") || "post";
  const status = url.searchParams.get("post_status") || "all";
  const page = Math.max(1, parseInt(url.searchParams.get("paged") || "1"));
  const perPage = 20;
  const offset = (page - 1) * perPage;
  const search = url.searchParams.get("s") || "";
  const method = request.method.toUpperCase();
  if (method === "POST") {
    const fd = await request.formData().catch(() => new FormData());
    const action = fd.get("action") || "";
    const postIds = fd.getAll("post[]").map(Number).filter(Boolean);
    if (postIds.length) {
      if (action === "trash") {
        for (const id of postIds) {
          await cp.db.prepare(`UPDATE ${prefix}posts SET post_status='trash' WHERE ID=?`).bind(id).run();
        }
      } else if (action === "delete") {
        for (const id of postIds) {
          await cp.db.prepare(`DELETE FROM ${prefix}posts WHERE ID=?`).bind(id).run();
        }
      } else if (action === "publish") {
        for (const id of postIds) {
          await cp.db.prepare(`UPDATE ${prefix}posts SET post_status='publish' WHERE ID=?`).bind(id).run();
        }
      }
    }
  }
  let whereClauses = [`post_type=?`];
  let params = [postType];
  if (status !== "all") {
    whereClauses.push(`post_status=?`);
    params.push(status);
  } else {
    whereClauses.push(`post_status != 'auto-draft'`);
  }
  if (search) {
    whereClauses.push(`post_title LIKE ?`);
    params.push(`%${search}%`);
  }
  const whereStr = whereClauses.join(" AND ");
  const [countRow, posts] = await Promise.all([
    cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}posts WHERE ${whereStr}`).bind(...params).first(),
    cp.db.prepare(
      `SELECT p.ID, p.post_title, p.post_status, p.post_date, p.post_author,
              u.display_name as author_name
       FROM ${prefix}posts p
       LEFT JOIN ${prefix}users u ON p.post_author = u.ID
       WHERE ${whereStr}
       ORDER BY p.post_date DESC
       LIMIT ? OFFSET ?`
    ).bind(...params, perPage, offset).all()
  ]);
  const total = countRow?.n ?? 0;
  const totalPages = Math.ceil(total / perPage);
  const typeLabel = postType === "post" ? "Posts" : "Pages";
  const newHref = postType === "post" ? "/cp-admin/post-new" : "/cp-admin/page-new";
  const statusCounts = await cp.db.prepare(
    `SELECT post_status, COUNT(*) as n FROM ${prefix}posts WHERE post_type=? GROUP BY post_status`
  ).bind(postType).all();
  const countMap = {};
  (statusCounts.results || []).forEach((r) => {
    countMap[r.post_status] = r.n;
  });
  const content = `
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
  <div style="display:flex;gap:12px;font-size:13px">
    ${["all", "publish", "draft", "pending", "trash"].map((s) => {
    const n = s === "all" ? total : countMap[s] || 0;
    return `<a href="/cp-admin/edit?post_type=${postType}&post_status=${s}"
                 style="color:${status === s ? "#1d2327" : "#2271b1"};font-weight:${status === s ? "600" : "400"};text-decoration:none">
                ${capitalize(s)} <span style="color:#646970">(${n})</span>
              </a>`;
  }).join(" | ")}
  </div>
  <a href="${newHref}" class="cp-btn">&#43; Add New ${typeLabel.slice(0, -1)}</a>
</div>

<!-- Search -->
<form method="get" style="margin-bottom:14px;display:flex;gap:8px">
  <input type="hidden" name="post_type" value="${esc3(postType)}">
  <input type="text" name="s" value="${esc3(search)}" placeholder="Search ${typeLabel.toLowerCase()}..."
         class="cp-form-input" style="max-width:280px">
  <button type="submit" class="cp-btn cp-btn-secondary">Search</button>
</form>

<!-- Bulk Actions -->
<form method="post" id="posts-form">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
    <select name="action" class="cp-form-select" style="max-width:160px">
      <option value="">Bulk Actions</option>
      <option value="publish">Publish</option>
      <option value="trash">Move to Trash</option>
      <option value="delete">Delete Permanently</option>
    </select>
    <button type="submit" class="cp-btn cp-btn-secondary">Apply</button>
  </div>

  <div class="cp-table-wrap">
    <table class="cp-table">
      <thead>
        <tr>
          <th style="width:32px"><input type="checkbox" id="check-all" onchange="document.querySelectorAll('.post-check').forEach(c => c.checked = this.checked)"></th>
          <th>Title</th>
          <th>Author</th>
          <th>Status</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        ${(posts?.results || []).length ? (posts.results || []).map((p) => `
          <tr>
            <td><input type="checkbox" name="post[]" value="${p.ID}" class="post-check"></td>
            <td>
              <strong><a href="/cp-admin/post?post=${p.ID}">${esc3(p.post_title || "(no title)")}</a></strong>
              <div class="row-actions" style="font-size:12px;margin-top:4px">
                <a href="/cp-admin/post?post=${p.ID}" style="color:#2271b1">Edit</a> |
                <a href="/?p=${p.ID}" target="_blank" style="color:#2271b1">View</a> |
                <a href="?post_type=${postType}&action=trash&post=${p.ID}"
                   onclick="return confirm('Move to trash?')"
                   style="color:#d63638">Trash</a>
              </div>
            </td>
            <td>${esc3(p.author_name || "")}</td>
            <td><span class="cp-badge cp-badge-${p.post_status}">${esc3(p.post_status)}</span></td>
            <td style="font-size:12px;color:#646970">${esc3(formatDate2(p.post_date))}</td>
          </tr>
        `).join("") : `
          <tr><td colspan="5" style="text-align:center;padding:40px;color:#646970">
            No ${typeLabel.toLowerCase()} found. <a href="${newHref}">Create one</a>.
          </td></tr>
        `}
      </tbody>
    </table>
  </div>
</form>

<!-- Pagination -->
${totalPages > 1 ? `
<div style="display:flex;gap:6px;align-items:center;margin-top:16px;justify-content:center">
  ${page > 1 ? `<a href="?post_type=${postType}&paged=${page - 1}" class="cp-btn cp-btn-secondary">&lsaquo; Prev</a>` : ""}
  <span style="color:#646970;font-size:13px">Page ${page} of ${totalPages}</span>
  ${page < totalPages ? `<a href="?post_type=${postType}&paged=${page + 1}" class="cp-btn cp-btn-secondary">Next &rsaquo;</a>` : ""}
</div>
` : ""}
`;
  const html = await renderAdminShell(cp, content, { title: typeLabel });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
__name(handlePosts, "handlePosts");
function esc3(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(esc3, "esc");
function formatDate2(d) {
  if (!d)
    return "";
  try {
    return new Date(d).toLocaleDateString();
  } catch (_) {
    return d;
  }
}
__name(formatDate2, "formatDate");
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
__name(capitalize, "capitalize");

// cp-admin/pages/post-edit.js
/**
 * CloudPress Admin - Post / Page Editor
 * Replaces WordPress wp-admin/post.php + wp-admin/post-new.php
 *
 * 변경사항:
 *  - 워드프레스식 메타박스 시스템 구현
 *    · 상단: 제목 입력 + 퍼마링크
 *    · 에디터 아래: 사용자 정의 필드(Custom Fields) 메타박스
 *    · 우측 사이드바: Publish / 카테고리 / 태그 / 특성 이미지 / 페이지 속성 메타박스
 *    · 메타박스 접기/펼치기 가능 (WP 동일 UX)
 *    · 메타박스 순서 drag 없이 CSS order로 관리
 *  - postmeta (커스텀 필드) CRUD 지원
 *  - 언어에 따른 레이블 (WPLANG 옵션 반영)
 *
 * @package CloudPress
 */


async function handlePostEdit(request, cp, opts = {}) {
  const url      = cp.url;
  const prefix   = cp.config.DB_PREFIX || 'cp_';
  const method   = request.method.toUpperCase();
  const postType = opts.post_type || url.searchParams.get('post_type') || 'post';
  const postId   = parseInt(url.searchParams.get('post') || url.searchParams.get('page') || '0');
  const lang     = await getOption(cp, 'WPLANG').catch(() => 'ko_KR') || 'ko_KR';
  const L        = getLabels(lang);

  let post    = null;
  let notices = [];

  // 기존 포스트 로드
  if (postId) {
    post = await cp.db.prepare(
      `SELECT * FROM ${prefix}posts WHERE ID=? AND post_type=? LIMIT 1`
    ).bind(postId, postType).first();
    if (!post) notices.push({ type: 'error', message: L.postNotFound });
  }

  // ── POST 저장 처리 ──────────────────────────────────────
  if (method === 'POST') {
    const fd       = await request.formData().catch(() => new FormData());
    const title    = (fd.get('post_title') || '').trim();
    const content  = fd.get('post_content') || '';
    const excerpt  = fd.get('post_excerpt') || '';
    const slug     = (fd.get('post_name') || slugify(title)).trim();
    const now      = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const authorId = cp.currentUser?.ID || 1;

    // Scheduled publish support
    const scheduledDate = fd.get('post_date') || '';
    let postDate = now;
    let status = fd.get('post_status') || 'draft';
    if (scheduledDate) {
      const sched = new Date(scheduledDate);
      if (!isNaN(sched.getTime())) {
        postDate = sched.toISOString().replace('T', ' ').slice(0, 19);
        // If publish requested but date is in the future, set to 'future'
        if (status === 'publish' && sched > new Date()) {
          status = 'future';
        }
      }
    }

    // postmeta 저장 (커스텀 필드)
    const metaKeys   = fd.getAll('meta_key[]');
    const metaValues = fd.getAll('meta_value[]');
    const metaIds    = fd.getAll('meta_id[]');

    let savedPostId = postId;

    if (!postId || !post) {
      const result = await cp.db.prepare(`
        INSERT INTO ${prefix}posts
          (post_author, post_date, post_content, post_title, post_excerpt, post_status,
           post_type, post_name, comment_status, ping_status, post_modified, post_date_gmt, post_modified_gmt)
        VALUES (?,?,?,?,?,?,?,?,'open','open',?,?,?)
      `).bind(authorId, postDate, content, title, excerpt, status, postType, slug, now, now, now).run();

      savedPostId = result.meta?.last_row_id;
      const redirectType = postType === 'page' ? 'page' : 'post';
      // 메타 및 카테고리 저장 후 리다이렉트
      await savePostMeta(cp, prefix, savedPostId, metaIds, metaKeys, metaValues);
      await savePostCategories(cp, prefix, savedPostId, fd.getAll('post_category[]'));
      await savePostTags(cp, prefix, savedPostId, fd.get('post_tags') || '');
      return Response.redirect(
        `${cp.url.origin}/cp-admin/${redirectType}?post=${savedPostId}&message=1`, 302
      );
    } else {
      await cp.db.prepare(`
        UPDATE ${prefix}posts SET
          post_title=?, post_content=?, post_excerpt=?, post_status=?,
          post_name=?, post_date=?, post_modified=?, post_modified_gmt=?
        WHERE ID=?
      `).bind(title, content, excerpt, status, slug, postDate, now, now, postId).run();

      post = await cp.db.prepare(`SELECT * FROM ${prefix}posts WHERE ID=? LIMIT 1`).bind(postId).first();
      await savePostMeta(cp, prefix, postId, metaIds, metaKeys, metaValues);
      await savePostCategories(cp, prefix, postId, fd.getAll('post_category[]'));
      await savePostTags(cp, prefix, postId, fd.get('post_tags') || '');
      notices.push({ type: 'success', message: L.postUpdated });
    }
  }

  const msg = url.searchParams.get('message');
  if (msg === '1') notices.push({ type: 'success', message: L.postPublished });

  // ── 데이터 로드 ──────────────────────────────────────────
  let categories = [];
  let postCategoryIds = new Set();
  if (postType === 'post') {
    const cats = await cp.db.prepare(
      `SELECT t.term_id, t.name FROM ${prefix}terms t
       JOIN ${prefix}term_taxonomy tt ON t.term_id = tt.term_id
       WHERE tt.taxonomy = 'category'`
    ).all();
    categories = cats?.results || [];

    // 현재 포스트에 지정된 카테고리 ID 로드
    if (postId) {
      try {
        const assigned = await cp.db.prepare(
          `SELECT tt.term_id FROM ${prefix}term_relationships tr
           JOIN ${prefix}term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
           WHERE tr.object_id = ? AND tt.taxonomy = 'category'`
        ).bind(postId).all();
        postCategoryIds = new Set((assigned?.results || []).map(r => String(r.term_id)));
      } catch (_) {}
    }
  }

  let postMetas = [];
  let existingTags = [];
  if (postId) {
    const metaRows = await cp.db.prepare(
      `SELECT meta_id, meta_key, meta_value FROM ${prefix}postmeta WHERE post_id=? ORDER BY meta_id`
    ).bind(postId).all();
    postMetas = metaRows?.results || [];
    // 내부 메타(_로 시작) 숨김
    postMetas = postMetas.filter(m => !String(m.meta_key).startsWith('_'));

    // 기존 태그 로드
    try {
      const tagRows = await cp.db.prepare(
        `SELECT t.name FROM ${prefix}terms t
         JOIN ${prefix}term_taxonomy tt ON t.term_id = tt.term_id
         JOIN ${prefix}term_relationships tr ON tt.term_taxonomy_id = tr.term_taxonomy_id
         WHERE tr.object_id = ? AND tt.taxonomy = 'post_tag'`
      ).bind(postId).all();
      existingTags = (tagRows?.results || []).map(r => r.name);
    } catch (_) {}
  }

  const isNew     = !postId || !post;
  const typeLabel = postType === 'page' ? L.page : L.post;
  const listHref  = postType === 'page' ? '/cp-admin/edit?post_type=page' : '/cp-admin/edit';

  // ── HTML 렌더링 ──────────────────────────────────────────
  const pageContent = `
<style>
/* ── 메타박스 시스템 ── */
.metabox-holder{display:grid;grid-template-columns:1fr 282px;gap:20px;align-items:start}
.metabox{background:#fff;border:1px solid #dcdcde;border-radius:4px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.07)}
.metabox-title{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;cursor:pointer;user-select:none;border-bottom:1px solid #dcdcde;background:#f9f9f9;border-radius:4px 4px 0 0}
.metabox-title h3{margin:0;font-size:13px;font-weight:600;color:#1d2327}
.metabox-toggle{font-size:10px;color:#646970;transition:transform .2s}
.metabox.closed .metabox-toggle{transform:rotate(-90deg)}
.metabox.closed .metabox-body{display:none}
.metabox-body{padding:14px}
/* 제목 영역 */
#titlediv{background:#fff;border:1px solid #dcdcde;border-radius:4px;margin-bottom:20px;padding:0;box-shadow:0 1px 3px rgba(0,0,0,.07)}
#title{width:100%;border:none;padding:16px 20px;font-size:22px;font-weight:600;outline:none;color:#1d2327;border-radius:4px;font-family:inherit}
#titlediv .permalink-row{padding:6px 20px 10px;font-size:13px;color:#646970;border-top:1px solid #f0f0f1}
#titlediv .permalink-row a{color:#2271b1;text-decoration:none}
#titlediv .permalink-row a:hover{text-decoration:underline}
/* ── 블록 에디터 ── */
#wp-content-editor-tools{padding:8px 12px;border-bottom:1px solid #dcdcde;display:flex;gap:4px;flex-wrap:wrap;background:#f9f9f9;align-items:center}
.toolbar-btn{padding:4px 8px;border:1px solid #dcdcde;border-radius:3px;background:#fff;cursor:pointer;font-size:13px;line-height:1.4;transition:.1s;position:relative}
.toolbar-btn:hover{background:#f0f0f1;border-color:#8c8f94}
.toolbar-btn.active{background:#e0e0e0}
.toolbar-sep{width:1px;background:#dcdcde;margin:2px 4px;align-self:stretch}
/* 블록 컨테이너 */
#block-editor-wrap{position:relative;min-height:420px}
#block-editor{min-height:420px;padding:16px 20px 60px;outline:none;font-size:15px;line-height:1.8;color:#1d2327;cursor:text}
#block-editor:focus{outline:none}
#block-editor [data-block]{position:relative;margin:0 0 4px;border-radius:4px;transition:.1s}
#block-editor [data-block]:hover{outline:1px dashed #dcdcde}
#block-editor [data-block]:focus-within{outline:2px solid rgba(34,113,177,.25)}
/* 블록 타입별 스타일 */
#block-editor p{margin:0 0 2px;padding:4px 0}
#block-editor h1{font-size:2rem;font-weight:800;margin:8px 0 4px;line-height:1.2}
#block-editor h2{font-size:1.5rem;font-weight:700;margin:8px 0 4px}
#block-editor h3{font-size:1.25rem;font-weight:700;margin:6px 0 4px}
#block-editor h4{font-size:1.1rem;font-weight:700;margin:6px 0 4px}
#block-editor h5{font-size:1rem;font-weight:700;margin:4px 0}
#block-editor h6{font-size:.9rem;font-weight:700;margin:4px 0;color:#646970}
#block-editor blockquote{border-left:4px solid #2271b1;margin:8px 0;padding:8px 16px;background:#f8f9fa;border-radius:0 4px 4px 0;color:#3c434a}
#block-editor pre{background:#1d2327;color:#e0e0e0;padding:14px 16px;border-radius:4px;font-family:monospace;font-size:13px;overflow-x:auto;margin:8px 0}
#block-editor code{background:#f0f0f1;padding:2px 6px;border-radius:3px;font-family:monospace;font-size:13px}
#block-editor hr{border:none;border-top:2px solid #dcdcde;margin:16px 0}
#block-editor ul,#block-editor ol{padding-left:24px;margin:4px 0}
#block-editor li{padding:2px 0}
#block-editor img{max-width:100%;border-radius:4px;display:block;margin:8px 0}
#block-editor .cp-block-button-wrap{margin:8px 0}
#block-editor .cp-block-btn{display:inline-block;background:#2271b1;color:#fff;padding:10px 22px;border-radius:4px;text-decoration:none;font-size:15px;font-weight:500;cursor:default}
#block-editor table{width:100%;border-collapse:collapse;margin:8px 0}
#block-editor table td,#block-editor table th{border:1px solid #dcdcde;padding:8px 12px;font-size:14px}
#block-editor table th{background:#f0f0f1;font-weight:600}
/* 슬래시 커맨드 팝업 */
#slash-menu{position:absolute;background:#fff;border:1px solid #dcdcde;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.15);min-width:260px;max-height:320px;overflow-y:auto;z-index:999;display:none}
#slash-menu.visible{display:block}
.slash-menu-item{display:flex;align-items:center;gap:10px;padding:8px 14px;cursor:pointer;transition:.1s;font-size:13px}
.slash-menu-item:hover,.slash-menu-item.selected{background:#f0f6ff}
.slash-menu-icon{font-size:18px;width:28px;text-align:center;flex-shrink:0}
.slash-menu-label{font-weight:600;color:#1d2327}
.slash-menu-desc{font-size:11px;color:#646970;margin-top:1px}
.slash-menu-section{padding:6px 14px 4px;font-size:11px;font-weight:700;color:#646970;text-transform:uppercase;letter-spacing:.5px;border-top:1px solid #f0f0f1;margin-top:4px}
.slash-menu-section:first-child{border-top:none;margin-top:0}
/* 블록 추가 힌트 */
.cp-block-hint{display:flex;align-items:center;gap:8px;padding:10px 4px;color:#c3c4c7;font-size:14px;cursor:text;user-select:none}
.cp-block-hint:hover{color:#8c8f94}
.cp-block-add-btn{width:24px;height:24px;border-radius:50%;border:1.5px solid #c3c4c7;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;color:#c3c4c7;transition:.15s;flex-shrink:0}
.cp-block-add-btn:hover{border-color:#2271b1;color:#2271b1;background:rgba(34,113,177,.05)}
/* HTML 뷰 */
#editor-html{display:none;width:100%;min-height:420px;padding:20px;border:none;font-family:'JetBrains Mono','Fira Code',monospace;font-size:13px;resize:vertical;outline:none;color:#1d2327;line-height:1.7;background:#fafafa}
/* 커스텀 필드 */
#custom-fields-table{width:100%;border-collapse:collapse;font-size:13px}
#custom-fields-table th{text-align:left;padding:6px 8px;background:#f0f0f1;font-weight:600;border:1px solid #dcdcde}
#custom-fields-table td{padding:6px 8px;border:1px solid #dcdcde;vertical-align:top}
#custom-fields-table input{width:100%;border:1px solid #dcdcde;border-radius:3px;padding:4px 6px;font-size:13px}
#custom-fields-table textarea{width:100%;border:1px solid #dcdcde;border-radius:3px;padding:4px 6px;font-size:13px;resize:vertical;min-height:48px}
/* Publish 박스 */
.publish-actions{display:flex;gap:8px;margin-top:12px}
.publish-actions .cp-btn{flex:1;justify-content:center}
.post-meta-info{margin-top:10px;padding-top:10px;border-top:1px solid #dcdcde;font-size:12px;color:#646970;line-height:1.8}
</style>

<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
  <a href="${listHref}" style="color:#2271b1;text-decoration:none;font-size:13px">&larr; ${L.allItems(typeLabel)}</a>
  ${post && post.post_status === 'publish' ? `<a href="/${post.post_name || '?p='+post.ID}" target="_blank" class="cp-btn cp-btn-secondary" style="font-size:12px;padding:4px 10px">${L.viewItem(typeLabel)}</a>` : ''}
</div>

<form method="post" id="post-form">

<!-- 제목 -->
<div id="titlediv">
  <input type="text" name="post_title" id="title"
         value="${esc(post?.post_title || '')}"
         placeholder="${L.addTitle}">
  ${post?.post_name ? `
  <div class="permalink-row">
    ${L.permalink}: <a href="/${esc(post.post_name)}" target="_blank">${esc(post.post_name)}</a>
    &nbsp;<a href="#" onclick="document.getElementById('slug-edit').style.display='inline';return false">${L.editSlug}</a>
  </div>` : ''}
</div>

<div class="metabox-holder">

  <!-- ── 좌측 컬럼 ── -->
  <div id="postbox-container-2">

    <!-- 에디터 메타박스 -->
    <div class="metabox" id="postdivrich">
      <div class="metabox-title" onclick="toggleMetabox(this)">
        <h3>${L.content}</h3>
        <span class="metabox-toggle">&#9660;</span>
      </div>
      <div class="metabox-body" style="padding:0">
        <div id="wp-content-editor-tools">
          <button type="button" class="toolbar-btn" onclick="execFmt('bold')" title="굵게"><b>B</b></button>
          <button type="button" class="toolbar-btn" onclick="execFmt('italic')" title="기울임"><i>I</i></button>
          <button type="button" class="toolbar-btn" onclick="execFmt('underline')" title="밑줄"><u>U</u></button>
          <button type="button" class="toolbar-btn" onclick="execFmt('strikeThrough')" title="취소선"><s>S</s></button>
          <div class="toolbar-sep"></div>
          <button type="button" class="toolbar-btn" onclick="insertLink2()" title="링크">🔗</button>
          <button type="button" class="toolbar-btn" onclick="insertImage2()" title="이미지">🖼</button>
          <div class="toolbar-sep"></div>
          <button type="button" class="toolbar-btn" onclick="execFmt('removeFormat')" title="서식 제거" style="font-size:11px">Tx</button>
          <div style="flex:1"></div>
          <button type="button" class="toolbar-btn" id="btn-visual" onclick="switchEditorTab('visual')" style="background:#e0e0e0" title="비주얼 편집">비주얼</button>
          <button type="button" class="toolbar-btn" id="btn-html" onclick="switchEditorTab('html')" title="HTML 편집">HTML</button>
        </div>
        <div id="block-editor-wrap">
          <div id="block-editor" contenteditable="true" spellcheck="true"></div>
          <div id="slash-menu" role="listbox" aria-label="블록 선택"></div>
        </div>
        <textarea id="editor-html" name="post_content">${esc(post?.post_content || '')}</textarea>
      </div>
    </div>

    <!-- 발췌문 메타박스 -->
    <div class="metabox" id="postexcerpt">
      <div class="metabox-title" onclick="toggleMetabox(this)">
        <h3>${L.excerpt}</h3>
        <span class="metabox-toggle">&#9660;</span>
      </div>
      <div class="metabox-body">
        <textarea name="post_excerpt" rows="3" class="cp-form-textarea" style="max-width:100%;width:100%"
                  placeholder="${L.excerptPlaceholder}">${esc(post?.post_excerpt || '')}</textarea>
        <p class="cp-description">${L.excerptDesc}</p>
      </div>
    </div>

    <!-- 슬러그 메타박스 -->
    <div class="metabox" id="slugdiv">
      <div class="metabox-title" onclick="toggleMetabox(this)">
        <h3>${L.slug}</h3>
        <span class="metabox-toggle">&#9660;</span>
      </div>
      <div class="metabox-body">
        <input type="text" name="post_name" class="cp-form-input" style="max-width:100%;width:100%"
               id="post_name" value="${esc(post?.post_name || '')}"
               placeholder="${L.slugPlaceholder}">
        <p class="cp-description">${L.slugDesc}</p>
      </div>
    </div>

    <!-- 커스텀 필드 메타박스 -->
    <div class="metabox closed" id="postcustom">
      <div class="metabox-title" onclick="toggleMetabox(this)">
        <h3>${L.customFields}</h3>
        <span class="metabox-toggle">&#9660;</span>
      </div>
      <div class="metabox-body">
        <table id="custom-fields-table">
          <thead>
            <tr>
              <th style="width:35%">${L.name}</th>
              <th>${L.value}</th>
              <th style="width:60px">${L.delete}</th>
            </tr>
          </thead>
          <tbody id="custom-fields-body">
            ${postMetas.map((m, idx) => `
            <tr id="meta-row-${m.meta_id}">
              <td>
                <input type="hidden" name="meta_id[]" value="${esc(String(m.meta_id))}">
                <input type="text" name="meta_key[]" value="${esc(m.meta_key)}" placeholder="${L.key}">
              </td>
              <td>
                <textarea name="meta_value[]" rows="2">${esc(m.meta_value || '')}</textarea>
              </td>
              <td style="text-align:center">
                <button type="button" class="cp-btn cp-btn-danger" style="padding:3px 8px;font-size:12px"
                        onclick="removeMetaRow(this)">&times;</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid #dcdcde">
          <strong style="font-size:13px">${L.addNewField}</strong>
          <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;margin-top:8px;align-items:start">
            <input type="text" id="new-meta-key" placeholder="${L.key}" class="cp-form-input" style="max-width:100%">
            <textarea id="new-meta-value" rows="2" class="cp-form-textarea" placeholder="${L.value}" style="max-width:100%;width:100%"></textarea>
            <button type="button" class="cp-btn" style="align-self:start" onclick="addMetaRow()">${L.add}</button>
          </div>
        </div>
      </div>
    </div>

  </div><!-- /postbox-container-2 -->

  <!-- ── 우측 사이드바 ── -->
  <div id="postbox-container-1">

    <!-- Publish 메타박스 -->
    <div class="metabox" id="submitdiv">
      <div class="metabox-title" onclick="toggleMetabox(this)">
        <h3>${L.publish}</h3>
        <span class="metabox-toggle">&#9660;</span>
      </div>
      <div class="metabox-body">
        <div style="margin-bottom:10px">
          <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px">${L.status}</label>
          <select name="post_status" id="post_status_select" class="cp-form-select" style="max-width:100%;width:100%" onchange="onStatusChange(this.value)">
            <option value="draft"   ${(post?.post_status || 'draft') === 'draft'   ? 'selected' : ''}>${L.draft}</option>
            <option value="publish" ${(post?.post_status === 'publish' || post?.post_status === 'future') ? 'selected' : ''}>${L.published}</option>
            <option value="private" ${post?.post_status === 'private' ? 'selected' : ''}>${L.private}</option>
            <option value="pending" ${post?.post_status === 'pending' ? 'selected' : ''}>${L.pendingReview}</option>
          </select>
        </div>
        <!-- 예약 발행 날짜 선택 -->
        <div id="schedule-date-wrap" style="margin-bottom:10px;${(post?.post_status === 'future') ? '' : 'display:none'}">
          <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px">&#128197; ${L.scheduleFor || '예약 발행 시간'}</label>
          <input type="datetime-local" name="post_date" id="post_date_input"
                 class="cp-form-input" style="width:100%"
                 value="${post?.post_date ? post.post_date.replace(' ','T').slice(0,16) : ''}">
          <p class="cp-description" style="margin-top:4px">${L.scheduleDesc || '미래 날짜를 선택하면 자동 예약 발행됩니다.'}</p>
        </div>
        <div class="publish-actions">
          <button type="button" class="cp-btn cp-btn-secondary"
                  onclick="document.querySelector('[name=post_status]').value='draft';document.getElementById('post-form').submit()">
            ${L.saveDraft}
          </button>
          <button type="button" class="cp-btn" id="publish-btn"
                  onclick="submitPublish()">
            ${post?.post_status === 'future' ? (L.scheduled || '예약됨') : (isNew ? L.publish : L.update)}
          </button>
        </div>
        ${post ? `
        <div class="post-meta-info">
          <div>${L.created}: ${esc(formatDate(post.post_date))}</div>
          <div>${L.modified}: ${esc(formatDate(post.post_modified))}</div>
          <div>ID: ${post.ID}</div>
        </div>` : ''}
      </div>
    </div>

    <!-- 카테고리 메타박스 (post only) -->
    ${postType === 'post' ? `
    <div class="metabox" id="categorydiv">
      <div class="metabox-title" onclick="toggleMetabox(this)">
        <h3>${L.categories}</h3>
        <span class="metabox-toggle">&#9660;</span>
      </div>
      <div class="metabox-body">
        ${categories.length ? `
        <div style="max-height:180px;overflow-y:auto;margin-bottom:8px">
          ${categories.map(cat => `
            <label style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px;cursor:pointer">
              <input type="checkbox" name="post_category[]" value="${cat.term_id}" ${postCategoryIds.has(String(cat.term_id)) ? 'checked' : ''}>
              ${esc(cat.name)}
            </label>
          `).join('')}
        </div>` : `<p style="color:#646970;font-size:13px">${L.noCategories}</p>`}
        <div style="border-top:1px solid #dcdcde;padding-top:10px;font-size:12px">
          <a href="/cp-admin/edit-tags?taxonomy=category" style="color:#2271b1">${L.manageCategories}</a>
        </div>
      </div>
    </div>` : ''}

    <!-- 태그 메타박스 (post only) -->
    ${postType === 'post' ? `
    <div class="metabox" id="tagsdiv-post_tag">
      <div class="metabox-title" onclick="toggleMetabox(this)">
        <h3>${L.tags}</h3>
        <span class="metabox-toggle">&#9660;</span>
      </div>
      <div class="metabox-body">
        <div style="display:flex;gap:6px;margin-bottom:8px">
          <input type="text" id="tag-input" class="cp-form-input" style="flex:1;max-width:none"
                 placeholder="${L.tagsPlaceholder}" onkeydown="if(event.key==='Enter'){event.preventDefault();addTag()}">
          <button type="button" class="cp-btn cp-btn-secondary" onclick="addTag()">${L.add}</button>
        </div>
        <div id="tag-cloud" style="min-height:32px;display:flex;flex-wrap:wrap;gap:4px"></div>
        <input type="hidden" name="post_tags" id="post_tags_input" value="">
        <p class="cp-description" style="margin-top:8px">${L.tagsDesc}</p>
      </div>
    </div>` : ''}

    <!-- 특성 이미지 메타박스 -->
    <div class="metabox" id="postimagediv">
      <div class="metabox-title" onclick="toggleMetabox(this)">
        <h3>${L.featuredImage}</h3>
        <span class="metabox-toggle">&#9660;</span>
      </div>
      <div class="metabox-body">
        <div id="featured-image-wrap">
          <div style="background:#f0f0f1;border:2px dashed #dcdcde;border-radius:4px;padding:20px;text-align:center;color:#646970;font-size:13px;cursor:pointer"
               onclick="setFeaturedImage()">
            <div style="font-size:28px;margin-bottom:6px">&#128247;</div>
            <a style="color:#2271b1">${L.setFeaturedImage}</a>
          </div>
        </div>
        <input type="hidden" name="meta_featured_image" id="featured-image-url" value="">
      </div>
    </div>

    <!-- 페이지 속성 메타박스 (page only) -->
    ${postType === 'page' ? `
    <div class="metabox" id="pageparentdiv">
      <div class="metabox-title" onclick="toggleMetabox(this)">
        <h3>${L.pageAttributes}</h3>
        <span class="metabox-toggle">&#9660;</span>
      </div>
      <div class="metabox-body">
        <div style="margin-bottom:10px">
          <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">${L.template}</label>
          <select name="page_template" class="cp-form-select" style="width:100%;max-width:100%">
            <option value="default">${L.defaultTemplate}</option>
            <option value="full-width">${L.fullWidth}</option>
            <option value="sidebar-left">${L.sidebarLeft}</option>
            <option value="blank">${L.blankTemplate}</option>
          </select>
        </div>
        <div>
          <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">${L.order}</label>
          <input type="number" name="menu_order" class="cp-form-input" style="max-width:80px"
                 value="${esc(String(post?.menu_order || 0))}">
          <p class="cp-description">${L.orderDesc}</p>
        </div>
      </div>
    </div>` : ''}

  </div><!-- /postbox-container-1 -->
</div><!-- /metabox-holder -->
</form>

<script>
// ═══════════════════════════════════════════════════════════════
// CloudPress 블록 에디터 — / 슬래시 커맨드
// ═══════════════════════════════════════════════════════════════

const editor = document.getElementById('block-editor');
const slashMenu = document.getElementById('slash-menu');
let editorMode = 'visual';
let slashQuery = '';
let slashRange = null;
let selectedIdx = 0;

// ── 초기화: 기존 콘텐츠 로드 ─────────────────────────────────
(function initEditor() {
  const raw = document.getElementById('editor-html').value;
  if (raw.trim()) {
    editor.innerHTML = raw;
  } else {
    insertEmptyParagraph();
  }
  // 각 블록에 data-block 속성 부여
  normalizeBlocks();
})();

function insertEmptyParagraph() {
  const p = document.createElement('p');
  p.setAttribute('data-block', 'paragraph');
  p.innerHTML = '<br>';
  editor.appendChild(p);
  placeCursorIn(p);
}

function normalizeBlocks() {
  Array.from(editor.childNodes).forEach(node => {
    if (node.nodeType === 3 && node.textContent.trim()) {
      // 텍스트 노드 → p로 래핑
      const p = document.createElement('p');
      p.setAttribute('data-block', 'paragraph');
      p.textContent = node.textContent;
      editor.replaceChild(p, node);
    } else if (node.nodeType === 1 && !node.getAttribute('data-block')) {
      node.setAttribute('data-block', guessBlockType(node));
    }
  });
}

function guessBlockType(el) {
  const tag = el.tagName?.toLowerCase();
  if (/^h[1-6]$/.test(tag)) return 'heading';
  if (tag === 'blockquote') return 'quote';
  if (tag === 'pre') return 'code';
  if (tag === 'ul') return 'list';
  if (tag === 'ol') return 'list-ordered';
  if (tag === 'hr') return 'separator';
  if (tag === 'table') return 'table';
  if (tag === 'figure' || tag === 'img') return 'image';
  return 'paragraph';
}

// ── 블록 정의 ─────────────────────────────────────────────────
const BLOCKS = [
  { group: '텍스트', items: [
    { id: 'paragraph',  icon: '¶',  label: '단락',     desc: '기본 텍스트 블록',     key: ['p','단락','텍스트'] },
    { id: 'h1',         icon: 'H1', label: '제목 1',   desc: '가장 큰 제목',         key: ['h1','제목1'] },
    { id: 'h2',         icon: 'H2', label: '제목 2',   desc: '큰 제목',              key: ['h2','제목2'] },
    { id: 'h3',         icon: 'H3', label: '제목 3',   desc: '중간 제목',            key: ['h3','제목3'] },
    { id: 'h4',         icon: 'H4', label: '제목 4',   desc: '작은 제목',            key: ['h4','제목4'] },
    { id: 'h5',         icon: 'H5', label: '제목 5',   desc: '더 작은 제목',         key: ['h5','제목5'] },
    { id: 'h6',         icon: 'H6', label: '제목 6',   desc: '가장 작은 제목',       key: ['h6','제목6'] },
    { id: 'quote',      icon: '❝',  label: '인용구',   desc: '인용 블록',            key: ['인용','quote','blockquote'] },
    { id: 'preformatted', icon: '</>',label: '서식 있는 텍스트', desc: '그대로 표시',  key: ['pre','서식'] },
  ]},
  { group: '목록', items: [
    { id: 'list',         icon: '•',  label: '목록 (점)',   desc: '글머리 기호 목록', key: ['ul','목록','list'] },
    { id: 'list-ordered', icon: '1.', label: '목록 (번호)', desc: '순서 있는 목록',   key: ['ol','번호','ordered'] },
  ]},
  { group: '미디어', items: [
    { id: 'image',      icon: '🖼',  label: '이미지',   desc: 'URL로 이미지 삽입',   key: ['img','이미지','image'] },
    { id: 'video',      icon: '▶',  label: '동영상',   desc: 'YouTube/Vimeo 임베드', key: ['video','영상','youtube'] },
  ]},
  { group: '디자인', items: [
    { id: 'separator',  icon: '—',  label: '구분선',   desc: '수평선 삽입',          key: ['hr','구분','separator'] },
    { id: 'button',     icon: '🔘', label: '버튼',     desc: '클릭 버튼',            key: ['btn','버튼','button'] },
    { id: 'table',      icon: '⊞',  label: '표',       desc: '테이블 삽입',          key: ['table','표','grid'] },
    { id: 'code',       icon: '{}', label: '코드',     desc: '코드 블록',            key: ['code','코드'] },
    { id: 'html',       icon: '<>', label: 'HTML',     desc: '순수 HTML 입력',       key: ['html','raw'] },
  ]},
];

// ── 블록 삽입 ─────────────────────────────────────────────────
function insertBlock(blockId) {
  hideSlashMenu();

  // 슬래시 텍스트 노드 제거
  if (slashRange) {
    try {
      const node = slashRange.startContainer;
      if (node.nodeType === 3) {
        const text = node.textContent;
        const slashPos = text.lastIndexOf('/');
        if (slashPos !== -1) {
          node.textContent = text.slice(0, slashPos);
        }
      }
    } catch(_) {}
  }

  // 현재 빈 블록 또는 새 위치 결정
  const sel = window.getSelection();
  let currentBlock = sel?.anchorNode?.closest?.('[data-block]') || editor.lastElementChild;

  let newEl = null;

  switch (blockId) {
    case 'paragraph':
      newEl = makeBlock('p', 'paragraph', '');
      break;
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
      newEl = makeBlock(blockId, 'heading', '');
      break;
    case 'quote':
      newEl = makeBlock('blockquote', 'quote', '인용문을 입력하세요…');
      break;
    case 'preformatted':
      newEl = makeBlock('pre', 'preformatted', '');
      break;
    case 'list':
      newEl = document.createElement('ul');
      newEl.setAttribute('data-block', 'list');
      newEl.innerHTML = '<li>목록 항목</li>';
      break;
    case 'list-ordered':
      newEl = document.createElement('ol');
      newEl.setAttribute('data-block', 'list-ordered');
      newEl.innerHTML = '<li>목록 항목</li>';
      break;
    case 'separator':
      newEl = document.createElement('hr');
      newEl.setAttribute('data-block', 'separator');
      newEl.contentEditable = 'false';
      break;
    case 'image': {
      const src = prompt('이미지 URL을 입력하세요:');
      if (!src) return;
      const alt = prompt('대체 텍스트 (선택):') || '';
      newEl = document.createElement('figure');
      newEl.setAttribute('data-block', 'image');
      newEl.innerHTML = \`<img src="${src}" alt="${alt}" style="max-width:100%;border-radius:4px">\`;
      break;
    }
    case 'video': {
      const vurl = prompt('YouTube/Vimeo URL을 입력하세요:');
      if (!vurl) return;
      const vid = extractVideoId(vurl);
      newEl = document.createElement('figure');
      newEl.setAttribute('data-block', 'video');
      newEl.innerHTML = vid
        ? \`<iframe src="https://www.youtube.com/embed/${vid}" width="100%" height="315" frameborder="0" allowfullscreen style="border-radius:4px;display:block"></iframe>\`
        : \`<a href="${vurl}" target="_blank">${vurl}</a>\`;
      break;
    }
    case 'button': {
      const txt = prompt('버튼 텍스트:', '자세히 보기') || '자세히 보기';
      const href = prompt('링크 URL:', '#') || '#';
      newEl = document.createElement('div');
      newEl.setAttribute('data-block', 'button');
      newEl.className = 'cp-block-button-wrap';
      newEl.innerHTML = \`<a href="${href}" class="cp-block-btn">${txt}</a>\`;
      break;
    }
    case 'table': {
      const cols = parseInt(prompt('열 수:', '3') || '3');
      const rows = parseInt(prompt('행 수 (헤더 포함):', '3') || '3');
      newEl = document.createElement('table');
      newEl.setAttribute('data-block', 'table');
      let html = '<thead><tr>' + Array(cols).fill(0).map((_,i) => \`<th contenteditable="true">제목 ${i+1}</th>\`).join('') + '</tr></thead><tbody>';
      for (let r = 1; r < rows; r++) {
        html += '<tr>' + Array(cols).fill(0).map(() => '<td contenteditable="true">내용</td>').join('') + '</tr>';
      }
      html += '</tbody>';
      newEl.innerHTML = html;
      break;
    }
    case 'code': {
      newEl = document.createElement('pre');
      newEl.setAttribute('data-block', 'code');
      newEl.innerHTML = '<code>// 코드를 입력하세요</code>';
      break;
    }
    case 'html': {
      const rawHtml = prompt('HTML 코드를 입력하세요:');
      if (!rawHtml) return;
      newEl = document.createElement('div');
      newEl.setAttribute('data-block', 'html');
      newEl.innerHTML = rawHtml;
      break;
    }
    default:
      newEl = makeBlock('p', 'paragraph', '');
  }

  // 현재 블록 뒤에 삽입
  if (currentBlock && currentBlock.parentNode === editor) {
    if (isEmpty(currentBlock)) {
      editor.replaceChild(newEl, currentBlock);
    } else {
      currentBlock.insertAdjacentElement('afterend', newEl);
    }
  } else {
    editor.appendChild(newEl);
  }

  // 뒤에 빈 단락 추가 (HR, image 등)
  if (['separator','image','video','table','button','html'].includes(blockId)) {
    const after = makeBlock('p', 'paragraph', '');
    newEl.insertAdjacentElement('afterend', after);
    placeCursorIn(after);
  } else {
    placeCursorIn(newEl);
  }

  syncToHtml();
}

function makeBlock(tag, type, text) {
  const el = document.createElement(tag);
  el.setAttribute('data-block', type);
  if (text) el.textContent = text;
  else el.innerHTML = '<br>';
  return el;
}

function isEmpty(el) {
  return !el || el.innerHTML === '' || el.innerHTML === '<br>' || el.textContent.trim() === '';
}

function placeCursorIn(el) {
  if (!el || el.tagName === 'HR') return;
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// ── 슬래시 메뉴 ─────────────────────────────────────────────
function showSlashMenu(range, query) {
  slashRange = range;
  slashQuery = query.toLowerCase();
  selectedIdx = 0;
  renderSlashMenu();
  positionSlashMenu(range);
  slashMenu.classList.add('visible');
}

function hideSlashMenu() {
  slashMenu.classList.remove('visible');
  slashRange = null;
  slashQuery = '';
}

function renderSlashMenu() {
  const q = slashQuery;
  let html = '';
  let totalIdx = 0;
  let first = true;

  BLOCKS.forEach(group => {
    const matched = group.items.filter(item =>
      !q || item.key.some(k => k.includes(q)) || item.label.toLowerCase().includes(q) || item.id.includes(q)
    );
    if (!matched.length) return;

    html += \`<div class="slash-menu-section${first ? ' first' : ''}">${group.group}</div>\`;
    first = false;

    matched.forEach(item => {
      const isSelected = totalIdx === selectedIdx;
      html += \`<div class="slash-menu-item${isSelected ? ' selected' : ''}" role="option" data-block-id="${item.id}" onclick="insertBlock('${item.id}')">
        <span class="slash-menu-icon">${item.icon}</span>
        <div>
          <div class="slash-menu-label">${item.label}</div>
          <div class="slash-menu-desc">${item.desc}</div>
        </div>
      </div>\`;
      totalIdx++;
    });
  });

  slashMenu.innerHTML = html || '<div style="padding:12px 16px;color:#646970;font-size:13px">일치하는 블록이 없습니다</div>';
}

function positionSlashMenu(range) {
  const rect = range.getBoundingClientRect();
  const wrapRect = editor.closest('#block-editor-wrap').getBoundingClientRect();
  const top  = rect.bottom - wrapRect.top + 4;
  const left = Math.max(0, rect.left - wrapRect.left);
  slashMenu.style.top  = top + 'px';
  slashMenu.style.left = left + 'px';
}

function getSlashMenuItems() {
  return slashMenu.querySelectorAll('.slash-menu-item');
}

// ── 키보드 이벤트 ────────────────────────────────────────────
editor.addEventListener('keydown', function(e) {
  if (slashMenu.classList.contains('visible')) {
    const items = getSlashMenuItems();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIdx = Math.min(selectedIdx + 1, items.length - 1);
      renderSlashMenu();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIdx = Math.max(selectedIdx - 1, 0);
      renderSlashMenu();
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const selected = items[selectedIdx];
      if (selected) {
        const blockId = selected.getAttribute('data-block-id');
        insertBlock(blockId);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      hideSlashMenu();
      return;
    }
  }

  // Enter → 새 단락 블록
  if (e.key === 'Enter' && !e.shiftKey) {
    const sel = window.getSelection();
    const block = sel?.anchorNode?.closest?.('[data-block]');
    if (block && (block.tagName === 'PRE' || block.getAttribute('data-block') === 'preformatted')) {
      // pre 안에서는 Enter = 개행
      return;
    }
    e.preventDefault();
    const newP = makeBlock('p', 'paragraph', '');
    if (block && block.parentNode === editor) {
      block.insertAdjacentElement('afterend', newP);
    } else {
      editor.appendChild(newP);
    }
    placeCursorIn(newP);
    syncToHtml();
    return;
  }

  // Backspace: 빈 블록 제거
  if (e.key === 'Backspace') {
    const sel = window.getSelection();
    const block = sel?.anchorNode?.closest?.('[data-block]');
    if (block && isEmpty(block) && editor.children.length > 1) {
      e.preventDefault();
      const prev = block.previousElementSibling;
      editor.removeChild(block);
      if (prev) placeCursorIn(prev);
      syncToHtml();
    }
  }
});

editor.addEventListener('input', function(e) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const node  = range.startContainer;

  if (node.nodeType !== 3) { syncToHtml(); return; }

  const text    = node.textContent;
  const offset  = range.startOffset;
  const before  = text.slice(0, offset);
  const slashAt = before.lastIndexOf('/');

  if (slashAt !== -1) {
    const query = before.slice(slashAt + 1);
    // 슬래시 뒤에 공백 없이 알파벳/한글만
    if (/^[\w가-힣]*$/.test(query)) {
      const slashR = range.cloneRange();
      slashR.setStart(node, slashAt);
      slashR.setEnd(node, offset);
      showSlashMenu(slashR, query);
      syncToHtml();
      return;
    }
  }

  hideSlashMenu();
  syncToHtml();
});

// 에디터 바깥 클릭 → 메뉴 숨김
document.addEventListener('click', e => {
  if (!slashMenu.contains(e.target) && !editor.contains(e.target)) {
    hideSlashMenu();
  }
});

// ── 포맷팅 함수 ──────────────────────────────────────────────
function execFmt(cmd) {
  editor.focus();
  document.execCommand(cmd, false, null);
  syncToHtml();
}

function insertLink2() {
  const url = prompt('URL을 입력하세요:');
  if (url) { editor.focus(); document.execCommand('createLink', false, url); syncToHtml(); }
}

function insertImage2() {
  insertBlock('image');
}

// ── 탭 전환 ──────────────────────────────────────────────────
function switchEditorTab(mode) {
  editorMode = mode;
  const wrap  = document.getElementById('block-editor-wrap');
  const html  = document.getElementById('editor-html');
  const bVis  = document.getElementById('btn-visual');
  const bHtml = document.getElementById('btn-html');

  if (mode === 'html') {
    syncToHtml();
    wrap.style.display  = 'none';
    html.style.display  = 'block';
    html.style.minHeight= '420px';
    bVis.classList.remove('active');
    bHtml.classList.add('active');
    bHtml.style.background = '#e0e0e0';
    bVis.style.background  = '';
  } else {
    syncFromHtml();
    html.style.display  = 'none';
    wrap.style.display  = '';
    bVis.classList.add('active');
    bHtml.classList.remove('active');
    bVis.style.background  = '#e0e0e0';
    bHtml.style.background = '';
  }
}

function syncToHtml() {
  document.getElementById('editor-html').value = editor.innerHTML;
}

function syncFromHtml() {
  editor.innerHTML = document.getElementById('editor-html').value || '<p data-block="paragraph"><br></p>';
  normalizeBlocks();
}

// ── 유틸 ─────────────────────────────────────────────────────
function extractVideoId(url) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  return m ? m[1] : null;
}

// ── 메타박스 접기/펼치기 ─────────────────────────────────────
function toggleMetabox(titleEl) {
  const box = titleEl.closest('.metabox');
  box.classList.toggle('closed');
  const id     = box.id;
  const closed = box.classList.contains('closed');
  try {
    const state = JSON.parse(localStorage.getItem('cp_metabox_state') || '{}');
    state[id] = closed;
    localStorage.setItem('cp_metabox_state', JSON.stringify(state));
  } catch(_) {}
}

(function() {
  try {
    const state = JSON.parse(localStorage.getItem('cp_metabox_state') || '{}');
    Object.entries(state).forEach(([id, closed]) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('closed', closed);
    });
  } catch(_) {}
})();

// ── 커스텀 필드 ─────────────────────────────────────────────
let metaRowIdx = ${postMetas.length};
function addMetaRow() {
  const key = document.getElementById('new-meta-key').value.trim();
  const val = document.getElementById('new-meta-value').value;
  if (!key) { alert('키를 입력하세요.'); return; }
  const tbody = document.getElementById('custom-fields-body');
  const tr = document.createElement('tr');
  tr.innerHTML = \`
    <td>
      <input type="hidden" name="meta_id[]" value="new_\${metaRowIdx}">
      <input type="text" name="meta_key[]" value="\${key.replace(/"/g,'&quot;')}">
    </td>
    <td><textarea name="meta_value[]" rows="2">\${val.replace(/</g,'&lt;')}</textarea></td>
    <td style="text-align:center">
      <button type="button" class="cp-btn cp-btn-danger" style="padding:3px 8px;font-size:12px"
              onclick="removeMetaRow(this)">&times;</button>
    </td>\`;
  tbody.appendChild(tr);
  document.getElementById('new-meta-key').value   = '';
  document.getElementById('new-meta-value').value = '';
  metaRowIdx++;
}
function removeMetaRow(btn) { btn.closest('tr').remove(); }

// ── 태그 ────────────────────────────────────────────────────
let tags = ${JSON.stringify(existingTags)};
if (tags.length) renderTags();
function addTag() {
  const input = document.getElementById('tag-input');
  const raw   = input.value.trim();
  if (!raw) return;
  raw.split(',').map(t => t.trim()).filter(Boolean).forEach(t => {
    if (!tags.includes(t)) { tags.push(t); renderTags(); }
  });
  input.value = '';
}
function removeTag(t) { tags = tags.filter(x => x !== t); renderTags(); }
function renderTags() {
  const cloud = document.getElementById('tag-cloud');
  cloud.innerHTML = tags.map(t =>
    \`<span style="background:#f0f0f1;border:1px solid #dcdcde;border-radius:12px;padding:2px 10px;font-size:12px;display:flex;align-items:center;gap:4px">
       \${t}
       <button type="button" onclick="removeTag('\${t}')" style="background:none;border:none;cursor:pointer;color:#646970;font-size:14px;padding:0;line-height:1">&times;</button>
     </span>\`
  ).join('');
  document.getElementById('post_tags_input').value = tags.join(',');
}

// ── 특성 이미지 ─────────────────────────────────────────────
function setFeaturedImage() {
  const url = prompt('이미지 URL을 입력하세요:');
  if (url) {
    document.getElementById('featured-image-url').value = url;
    document.getElementById('featured-image-wrap').innerHTML =
      \`<img src="\${url}" style="max-width:100%;border-radius:4px;margin-bottom:8px">
       <br><a href="#" onclick="clearFeaturedImage();return false" style="font-size:12px;color:#d63638">특성 이미지 제거</a>\`;
  }
}
function clearFeaturedImage() {
  document.getElementById('featured-image-url').value = '';
  document.getElementById('featured-image-wrap').innerHTML =
    \`<div style="background:#f0f0f1;border:2px dashed #dcdcde;border-radius:4px;padding:20px;text-align:center;color:#646970;font-size:13px;cursor:pointer" onclick="setFeaturedImage()">
       <div style="font-size:28px;margin-bottom:6px">🖼</div>
       <a style="color:#2271b1">특성 이미지 설정</a>
     </div>\`;
}

// ── 제출 전 동기화 ───────────────────────────────────────────
document.getElementById('post-form').addEventListener('submit', function() {
  if (editorMode === 'visual') syncToHtml();
});

// ── 슬러그 자동 생성 ─────────────────────────────────────────
document.getElementById('title').addEventListener('blur', function() {
  const slugField = document.getElementById('post_name');
  if (!slugField.value && this.value) {
    slugField.value = this.value.toLowerCase()
      .replace(/[\s]+/g,'-')
      .replace(/[^a-z0-9\-가-힣]/g,'')
      .replace(/^-|-$/g,'');
  }
});

// ── 예약발행 상태 변경 핸들러 ──────────────────────────────────
function onStatusChange(val) {
  const wrap = document.getElementById('schedule-date-wrap');
  const btn  = document.getElementById('publish-btn');
  if (val === 'publish') {
    wrap.style.display = 'block';
    if (btn) btn.textContent = '예약/발행';
  } else {
    wrap.style.display = 'none';
    if (btn) btn.textContent = val === 'draft' ? '임시저장' : '업데이트';
  }
}

function submitPublish() {
  const sel   = document.getElementById('post_status_select');
  const dateI = document.getElementById('post_date_input');
  if (sel && sel.value === 'publish' && dateI && dateI.value) {
    const chosen = new Date(dateI.value);
    if (chosen > new Date()) {
      sel.value = 'publish'; // server will set 'future' automatically
    }
  }
  document.getElementById('post-form').submit();
}


</script>
`;

  const html = await renderAdminShell(cp, pageContent, {
    title: isNew ? `${L.new} ${typeLabel}` : `${L.edit} ${typeLabel}`,
    notices,
  });
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ---------------------------------------------------------------------------
// postmeta 저장 헬퍼
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 카테고리 저장 헬퍼 (term_relationships + term_taxonomy count 갱신)
// ---------------------------------------------------------------------------

async function savePostCategories(cp, prefix, postId, categoryIds) {
  if (!postId) return;
  try {
    await cp.db.prepare(
      `DELETE FROM ${prefix}term_relationships WHERE object_id=? AND term_taxonomy_id IN (SELECT term_taxonomy_id FROM ${prefix}term_taxonomy WHERE taxonomy='category')`
    ).bind(postId).run();
  } catch(_) {}
  const ids = (categoryIds||[]).map(c=>parseInt(c)).filter(Boolean);
  if (!ids.length) return;
  const ph = ids.map(()=>'?').join(',');
  const ttRows = await cp.db.prepare(
    `SELECT term_id, term_taxonomy_id FROM ${prefix}term_taxonomy WHERE term_id IN (${ph}) AND taxonomy='category'`
  ).bind(...ids).all().catch(()=>({results:[]}));
  for (const tt of (ttRows.results||[])) {
    await cp.db.prepare(
      `INSERT OR IGNORE INTO ${prefix}term_relationships (object_id,term_taxonomy_id) VALUES(?,?)`
    ).bind(postId,tt.term_taxonomy_id).run().catch(()=>{});
  }
  // 개별 루프 없이 단일 서브쿼리 UPDATE
  await cp.db.prepare(
    `UPDATE ${prefix}term_taxonomy SET count=(SELECT COUNT(*) FROM ${prefix}term_relationships tr JOIN ${prefix}posts p ON p.ID=tr.object_id WHERE tr.term_taxonomy_id=${prefix}term_taxonomy.term_taxonomy_id AND p.post_status='publish') WHERE taxonomy='category'`
  ).run().catch(()=>{});
}

async function savePostTags(cp, prefix, postId, tagsStr) {
  if (!postId) return;
  try {
    await cp.db.prepare(
      `DELETE FROM ${prefix}term_relationships WHERE object_id=? AND term_taxonomy_id IN (SELECT term_taxonomy_id FROM ${prefix}term_taxonomy WHERE taxonomy='post_tag')`
    ).bind(postId).run();
  } catch(_) {}
  const tagNames = (tagsStr||'').split(',').map(t=>t.trim()).filter(Boolean);
  if (!tagNames.length) return;
  // 기존 태그 한 번에 조회 (루프 SELECT 제거)
  const ph = tagNames.map(()=>'?').join(',');
  const existingRows = await cp.db.prepare(
    `SELECT t.term_id, t.name, tt.term_taxonomy_id FROM ${prefix}terms t JOIN ${prefix}term_taxonomy tt ON tt.term_id=t.term_id AND tt.taxonomy='post_tag' WHERE t.name IN (${ph})`
  ).bind(...tagNames).all().catch(()=>({results:[]}));
  const existingMap = new Map((existingRows.results||[]).map(r=>[r.name,r]));
  for (const name of tagNames) {
    try {
      let termTaxonomyId;
      if (existingMap.has(name)) {
        termTaxonomyId = existingMap.get(name).term_taxonomy_id;
      } else {
        const slug = name.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9\-가-힣]/g,'');
        const ins = await cp.db.prepare(`INSERT INTO ${prefix}terms (name,slug) VALUES(?,?)`).bind(name,slug).run();
        const termId = ins.meta?.last_row_id;
        if (!termId) continue;
        const ttIns = await cp.db.prepare(`INSERT INTO ${prefix}term_taxonomy (term_id,taxonomy,description,parent,count) VALUES(?,'post_tag','',0,0)`).bind(termId).run();
        termTaxonomyId = ttIns.meta?.last_row_id;
      }
      if (termTaxonomyId) {
        await cp.db.prepare(`INSERT OR IGNORE INTO ${prefix}term_relationships (object_id,term_taxonomy_id) VALUES(?,?)`).bind(postId,termTaxonomyId).run();
      }
    } catch(_) {}
  }
}

async function savePostMeta(cp, prefix, postId, metaIds, metaKeys, metaValues) {
  if (!postId || !metaKeys?.length) return;
  await cp.db.prepare(
    `DELETE FROM ${prefix}postmeta WHERE post_id=? AND meta_key NOT LIKE '\\_%' ESCAPE '\\'`
  ).bind(postId).run().catch(()=>{});
  // D1 batch: 여러 INSERT를 한 번의 왕복으로
  const stmts = [];
  for (let i = 0; i < metaKeys.length; i++) {
    const key = (metaKeys[i]||'').trim();
    const val = metaValues[i]||'';
    if (!key || key.startsWith('_')) continue;
    stmts.push(cp.db.prepare(`INSERT INTO ${prefix}postmeta (post_id,meta_key,meta_value) VALUES(?,?,?)`).bind(postId,key,val));
  }
  if (stmts.length) await cp.db.batch(stmts).catch(()=>{});
}


// ---------------------------------------------------------------------------
// 언어 레이블
// ---------------------------------------------------------------------------

function getLabels(lang) {
  const KO = {
    postNotFound: '포스트를 찾을 수 없습니다.',
    postUpdated: '포스트가 업데이트되었습니다.',
    postPublished: '포스트가 게시되었습니다.',
    allItems: t => `모든 ${t}`,
    viewItem: t => `${t} 보기`,
    addTitle: '제목 추가',
    permalink: '퍼마링크',
    editSlug: '편집',
    content: '본문',
    excerpt: '발췌문',
    excerptPlaceholder: '발췌문을 입력하세요 (선택사항)',
    excerptDesc: '자동 생성된 발췌문 대신 직접 입력할 수 있습니다.',
    slug: '슬러그',
    slugPlaceholder: '제목에서 자동 생성',
    slugDesc: 'URL에 사용될 슬러그를 입력하세요.',
    customFields: '사용자 정의 필드',
    name: '이름',
    value: '값',
    delete: '삭제',
    key: '키',
    addNewField: '새 필드 추가',
    add: '추가',
    keyRequired: '키를 입력하세요.',
    publish: '게시',
    status: '상태',
    draft: '초안',
    published: '게시됨',
    private: '비공개',
    pendingReview: '검토 대기',
    scheduleFor: '예약 발행 시간',
    scheduleDesc: '미래 날짜를 선택하면 자동 예약 발행됩니다.',
    scheduled: '예약됨',
    saveDraft: '초안 저장',
    update: '업데이트',
    new: '새',
    edit: '편집',
    post: '포스트',
    page: '페이지',
    created: '생성',
    modified: '수정',
    categories: '카테고리',
    noCategories: '카테고리가 없습니다.',
    manageCategories: '카테고리 관리',
    tags: '태그',
    tagsPlaceholder: '태그 입력 후 Enter 또는 쉼표',
    tagsDesc: '쉼표로 구분하여 여러 태그를 추가하세요.',
    featuredImage: '특성 이미지',
    setFeaturedImage: '특성 이미지 설정',
    removeFeaturedImage: '특성 이미지 제거',
    pageAttributes: '페이지 속성',
    template: '템플릿',
    defaultTemplate: '기본 템플릿',
    fullWidth: '전체 너비',
    sidebarLeft: '왼쪽 사이드바',
    blankTemplate: '빈 템플릿',
    order: '순서',
    orderDesc: '숫자가 낮을수록 먼저 표시됩니다.',
    enterUrl: 'URL을 입력하세요:',
    enterImageUrl: '이미지 URL을 입력하세요:',
    bold: '굵게', italic: '기울임', underline: '밑줄', strikethrough: '취소선',
    bulletList: '글머리 기호', numberedList: '번호 목록',
    indent: '들여쓰기', outdent: '내어쓰기',
    blockquote: '인용구', separator: '구분선', link: '링크', image: '이미지', removeFormat: '서식 제거',
  };
  const EN = {
    postNotFound: 'Post not found.',
    postUpdated: 'Post updated.',
    postPublished: 'Post published.',
    allItems: t => `All ${t}s`,
    viewItem: t => `View ${t}`,
    addTitle: 'Add title',
    permalink: 'Permalink',
    editSlug: 'Edit',
    content: 'Content',
    excerpt: 'Excerpt',
    excerptPlaceholder: 'Write an excerpt (optional)',
    excerptDesc: 'Excerpts are optional hand-crafted summaries.',
    slug: 'Slug',
    slugPlaceholder: 'auto-generated-from-title',
    slugDesc: 'The URL-friendly slug for this post.',
    customFields: 'Custom Fields',
    name: 'Name',
    value: 'Value',
    delete: 'Delete',
    key: 'Key',
    addNewField: 'Add New Custom Field',
    add: 'Add',
    keyRequired: 'Please enter a key.',
    publish: 'Publish',
    status: 'Status',
    draft: 'Draft',
    published: 'Published',
    private: 'Private',
    pendingReview: 'Pending Review',
    scheduleFor: 'Schedule For',
    scheduleDesc: 'Select a future date to schedule this post.',
    scheduled: 'Scheduled',
    saveDraft: 'Save Draft',
    update: 'Update',
    new: 'New',
    edit: 'Edit',
    post: 'Post',
    page: 'Page',
    created: 'Created',
    modified: 'Modified',
    categories: 'Categories',
    noCategories: 'No categories found.',
    manageCategories: 'Manage Categories',
    tags: 'Tags',
    tagsPlaceholder: 'Add tag then Enter or comma',
    tagsDesc: 'Separate tags with commas.',
    featuredImage: 'Featured Image',
    setFeaturedImage: 'Set featured image',
    removeFeaturedImage: 'Remove featured image',
    pageAttributes: 'Page Attributes',
    template: 'Template',
    defaultTemplate: 'Default Template',
    fullWidth: 'Full Width',
    sidebarLeft: 'Sidebar Left',
    blankTemplate: 'Blank',
    order: 'Order',
    orderDesc: 'Pages are usually sorted by this field.',
    enterUrl: 'Enter URL:',
    enterImageUrl: 'Enter image URL:',
    bold: 'Bold', italic: 'Italic', underline: 'Underline', strikethrough: 'Strikethrough',
    bulletList: 'Bullet List', numberedList: 'Numbered List',
    indent: 'Indent', outdent: 'Outdent',
    blockquote: 'Blockquote', separator: 'Horizontal Rule', link: 'Insert Link', image: 'Insert Image', removeFormat: 'Remove Formatting',
  };
  return lang === 'ko_KR' ? KO : EN;
}

__name(handlePostEdit, "handlePostEdit");
function esc4(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(esc4, "esc");
function formatDate3(d) {
  if (!d)
    return "";
  try {
    return new Date(d).toLocaleString();
  } catch (_) {
    return d;
  }
}
__name(formatDate3, "formatDate");
function slugify3(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
__name(slugify3, "slugify");

// cp-admin/pages/pages.js
function esc5(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(esc5, "esc");
async function handlePages(request, cp) {
  const prefix = cp.db_prefix || "cp_";
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  let notice = null;
  if (method === "POST") {
    const fd = await request.formData().catch(() => new FormData());
    const action = fd.get("action") || "";
    const id = parseInt(fd.get("post_id") || 0);
    if (action === "trash" && id) {
      await cp.db.prepare(
        `UPDATE ${prefix}posts SET post_status='trash' WHERE ID=? AND post_type='page'`
      ).bind(id).run();
      notice = { type: "success", message: "Page moved to Trash." };
    }
    if (action === "restore" && id) {
      await cp.db.prepare(
        `UPDATE ${prefix}posts SET post_status='draft' WHERE ID=? AND post_type='page'`
      ).bind(id).run();
      notice = { type: "success", message: "Page restored." };
    }
    if (action === "delete" && id) {
      await cp.db.prepare(`DELETE FROM ${prefix}posts WHERE ID=? AND post_type='page'`).bind(id).run();
      notice = { type: "success", message: "Page permanently deleted." };
    }
  }
  const status = url.searchParams.get("status") || "any";
  const search = (url.searchParams.get("s") || "").trim();
  const page = Math.max(1, parseInt(url.searchParams.get("paged") || 1));
  const limit = 20;
  const offset = (page - 1) * limit;
  const conditions = [`post_type='page'`];
  const params = [];
  if (status !== "any") {
    conditions.push(`post_status=?`);
    params.push(status);
  } else {
    conditions.push(`post_status != 'trash'`);
  }
  if (search) {
    conditions.push(`post_title LIKE ?`);
    params.push(`%${search}%`);
  }
  const where = `WHERE ${conditions.join(" AND ")}`;
  const total = await cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}posts ${where}`).bind(...params).first();
  const rows = await cp.db.prepare(
    `SELECT ID, post_title, post_status, post_date, post_modified, post_author
     FROM ${prefix}posts ${where} ORDER BY post_date DESC LIMIT ? OFFSET ?`
  ).bind(...params, limit, offset).all();
  const pages = rows.results || [];
  const totalPages = Math.ceil((total?.n || 0) / limit);
  const statusTabs = ["any", "publish", "draft", "pending", "trash"].map((s) => {
    const active = status === s ? ' style="font-weight:bold;border-bottom:2px solid #0073aa"' : "";
    const label = s === "any" ? "All" : s.charAt(0).toUpperCase() + s.slice(1);
    const q = new URLSearchParams(url.searchParams);
    q.set("status", s);
    q.delete("paged");
    return `<a href="?${q}"${active}>${esc5(label)}</a>`;
  }).join(" | ");
  const rows_html = pages.map((p) => `
  <tr>
    <td><strong><a href="/cp-admin/post?post_id=${p.ID}&post_type=page">${esc5(p.post_title || "(no title)")}</a></strong>
      <div class="row-actions">
        <a href="/cp-admin/post?post_id=${p.ID}&post_type=page">Edit</a> |
        <form method="post" style="display:inline" onsubmit="return confirm('Move to trash?')">
          <input type="hidden" name="post_id" value="${p.ID}">
          <input type="hidden" name="action" value="trash">
          <button type="submit" class="cp-btn-link">Trash</button>
        </form>
        ${p.post_status === "publish" ? `| <a href="/${esc5(p.ID)}" target="_blank">View</a>` : ""}
      </div>
    </td>
    <td><span class="cp-status cp-status-${esc5(p.post_status)}">${esc5(p.post_status)}</span></td>
    <td>${esc5(new Date(p.post_date).toLocaleDateString("ko-KR"))}</td>
  </tr>`).join("");
  const content = `
<div class="cp-card">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <h1>Pages</h1>
    <a href="/cp-admin/page-new" class="cp-btn">&#43; Add New Page</a>
  </div>
  <div style="margin-bottom:12px">${statusTabs}</div>
  <form method="get" style="margin-bottom:12px;display:flex;gap:8px">
    <input type="hidden" name="status" value="${esc5(status)}">
    <input type="text" name="s" value="${esc5(search)}" placeholder="Search pages..." style="padding:6px 10px;border:1px solid #ccc;border-radius:4px;flex:1">
    <button type="submit" class="cp-btn cp-btn-secondary">Search</button>
  </form>
  <table class="cp-table">
    <thead><tr><th>Title</th><th>Status</th><th>Date</th></tr></thead>
    <tbody>${rows_html || '<tr><td colspan="3" style="text-align:center;color:#999">No pages found.</td></tr>'}</tbody>
  </table>
  <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
    ${page > 1 ? `<a href="?paged=${page - 1}&status=${esc5(status)}" class="cp-btn cp-btn-secondary">&laquo; Prev</a>` : ""}
    <span style="line-height:36px;color:#666">Page ${page} of ${totalPages || 1}</span>
    ${page < totalPages ? `<a href="?paged=${page + 1}&status=${esc5(status)}" class="cp-btn cp-btn-secondary">Next &raquo;</a>` : ""}
  </div>
</div>`;
  return new Response(
    await renderAdminShell(cp, content, { title: "Pages", notices: notice ? [notice] : [] }),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
__name(handlePages, "handlePages");

// cp-includes/media-handler.js
init_cp_load();
async function handleMedia(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/cp-content\/uploads\//, "").replace(/^\/uploads\//, "");
  if (!path || path.includes("..")) {
    return new Response("Not Found", { status: 404 });
  }
  try {
    const b64 = await env.CP_KV.get(`cp:media:${path}`);
    if (b64) {
      const binary = base64ToBinary(b64);
      const mimeType = guessMime(path);
      return new Response(binary, {
        headers: {
          "Content-Type": mimeType,
          "Cache-Control": "public, max-age=31536000, immutable",
          "Content-Length": String(binary.byteLength)
        }
      });
    }
  } catch (_) {
  }
  try {
    const row = await env.CP_DB.prepare(
      `SELECT mime_type, file_size FROM cp_media WHERE file_path=? LIMIT 1`
    ).bind(path).first();
    if (row) {
      const b64 = await env.CP_KV.get(`cp:media:${path}`);
      if (b64) {
        const binary = base64ToBinary(b64);
        return new Response(binary, {
          headers: {
            "Content-Type": row.mime_type,
            "Cache-Control": "public, max-age=86400"
          }
        });
      }
    }
  } catch (_) {
  }
  return new Response("Not Found", { status: 404 });
}
__name(handleMedia, "handleMedia");
async function handleUpload(cp, file, postId = 0) {
  const MAX_SIZE = 5 * 1024 * 1024;
  if (!file || !file.name)
    return { error: "No file provided." };
  if (file.size > MAX_SIZE)
    return { error: `File too large. Maximum size is ${MAX_SIZE / 1024 / 1024} MB.` };
  const allowed = getAllowedMimeTypes();
  const mime = file.type || guessMime(file.name);
  if (!Object.values(allowed).includes(mime) && !mime.startsWith("image/")) {
    return { error: `File type "${mime}" is not allowed.` };
  }
  const prefix = cp.db_prefix || "cp_";
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const safeName = sanitizeFileName(file.name);
  const date = /* @__PURE__ */ new Date();
  const yearMonth = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}`;
  const uniqueName = `${Date.now()}-${safeName}`;
  const filePath = `${yearMonth}/${uniqueName}`;
  const now = date.toISOString().replace("T", " ").slice(0, 19);
  const buffer = await file.arrayBuffer();
  const b64 = binaryToBase64(buffer);
  try {
    await cp.kv.put(`cp:media:${filePath}`, b64);
  } catch (e) {
    return { error: `KV storage error: ${e.message}` };
  }
  const result = await cp.db.prepare(`
    INSERT INTO ${prefix}media
      (file_name, file_path, mime_type, file_size, post_id, uploaded_by, upload_date, storage)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'kv')
  `).bind(
    safeName,
    filePath,
    mime,
    file.size,
    postId,
    cp.currentUser?.ID || 0,
    now
  ).run();
  const mediaId = result.meta?.last_row_id || 0;
  const siteUrl = cp.config.SITE_URL || cp.url.origin;
  return {
    media_id: mediaId,
    file_path: filePath,
    url: `${siteUrl}/uploads/${filePath}`,
    mime_type: mime,
    file_size: file.size
  };
}
__name(handleUpload, "handleUpload");
async function getMediaItems(cp, args = {}) {
  const prefix = cp.db_prefix || "cp_";
  const limit = Math.min(parseInt(args.limit || 40), 200);
  const offset = parseInt(args.offset || 0);
  const mime = args.mime_type || "";
  const postId = args.post_id || 0;
  const where = [];
  const params = [];
  if (mime) {
    where.push("mime_type LIKE ?");
    params.push(`${mime}%`);
  }
  if (postId) {
    where.push("post_id=?");
    params.push(postId);
  }
  const whereStr = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await cp.db.prepare(`
    SELECT media_id, file_name, file_path, mime_type, file_size, width, height,
           post_id, uploaded_by, upload_date, alt_text, caption
    FROM ${prefix}media ${whereStr}
    ORDER BY upload_date DESC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();
  const siteUrl = cp.config?.SITE_URL || "";
  return (rows.results || []).map((m) => ({
    ...m,
    url: `${siteUrl}/uploads/${m.file_path}`
  }));
}
__name(getMediaItems, "getMediaItems");
async function deleteMedia(cp, mediaId) {
  const prefix = cp.db_prefix || "cp_";
  const row = await cp.db.prepare(`SELECT file_path FROM ${prefix}media WHERE media_id=? LIMIT 1`).bind(mediaId).first();
  if (!row)
    return false;
  try {
    await cp.kv.delete(`cp:media:${row.file_path}`);
  } catch (_) {
  }
  await cp.db.prepare(`DELETE FROM ${prefix}media WHERE media_id=?`).bind(mediaId).run();
  return true;
}
__name(deleteMedia, "deleteMedia");
function getAllowedMimeTypes() {
  return {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    mp4: "video/mp4",
    webm: "video/webm",
    txt: "text/plain",
    csv: "text/csv",
    zip: "application/zip"
  };
}
__name(getAllowedMimeTypes, "getAllowedMimeTypes");
function guessMime(filename) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  const map = getAllowedMimeTypes();
  return map[ext] || "application/octet-stream";
}
__name(guessMime, "guessMime");
function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}
__name(sanitizeFileName, "sanitizeFileName");
function binaryToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
__name(binaryToBase64, "binaryToBase64");
function base64ToBinary(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
__name(base64ToBinary, "base64ToBinary");

// cp-admin/pages/media.js
function esc6(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(esc6, "esc");
async function handleMediaPage(request, cp) {
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  let notice = null;
  if (method === "POST") {
    const ct = request.headers.get("Content-Type") || "";
    if (ct.includes("multipart/form-data")) {
      const fd = await request.formData().catch(() => new FormData());
      const action = fd.get("action") || "";
      if (action === "delete") {
        const id = parseInt(fd.get("media_id") || 0);
        if (id) {
          await deleteMedia(cp, id);
          notice = { type: "success", message: "Media file deleted." };
        }
      } else {
        const file = fd.get("file");
        if (file && file.name) {
          const result = await handleUpload(cp, file);
          if (result.error) {
            notice = { type: "error", message: result.error };
          } else {
            notice = { type: "success", message: `File uploaded: <a href="${esc6(result.url)}" target="_blank">${esc6(result.file_path)}</a>` };
          }
        }
      }
    }
  }
  const page = Math.max(1, parseInt(url.searchParams.get("paged") || 1));
  const limit = 20;
  const items = await getMediaItems(cp, { limit, offset: (page - 1) * limit });
  const siteUrl = cp.config?.SITE_URL || cp.url.origin;
  const gridHtml = items.map((m) => {
    const isImg = m.mime_type?.startsWith("image/");
    const thumb = isImg ? `<img src="${esc6(m.url)}" alt="${esc6(m.alt_text)}" style="width:100%;height:100%;object-fit:cover;border-radius:4px">` : `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:2rem;color:#888">&#128196;</div>`;
    return `
  <div class="cp-media-item" style="position:relative;background:#f0f0f0;border-radius:6px;overflow:hidden;aspect-ratio:1">
    <a href="${esc6(m.url)}" target="_blank" style="display:block;height:100%">${thumb}</a>
    <div style="padding:4px 6px;background:#fff;border-top:1px solid #e0e0e0;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc6(m.file_name)}">
      ${esc6(m.file_name)}
    </div>
    <form method="post" style="margin:0" onsubmit="return confirm('Delete this file?')">
      <input type="hidden" name="action" value="delete">
      <input type="hidden" name="media_id" value="${m.media_id}">
      <button type="submit" title="Delete" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,.6);border:none;color:#fff;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:12px;line-height:22px;padding:0">&#10005;</button>
    </form>
  </div>`;
  }).join("");
  const content = `
<div class="cp-card">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <h1>Media Library</h1>
  </div>

  <!-- Upload Form -->
  <details style="margin-bottom:20px;background:#f9f9f9;border:1px solid #ddd;border-radius:6px;padding:16px">
    <summary style="cursor:pointer;font-weight:600;font-size:15px">&#8593; Upload New File</summary>
    <form method="post" enctype="multipart/form-data" style="margin-top:16px">
      <div style="display:flex;gap:12px;align-items:flex-end">
        <div style="flex:1">
          <label style="display:block;margin-bottom:4px;font-weight:500">Choose File</label>
          <input type="file" name="file" accept="image/*,application/pdf,text/*,audio/*,video/*" required
                 style="display:block;width:100%;padding:8px;border:2px dashed #ccc;border-radius:4px;cursor:pointer">
        </div>
        <button type="submit" class="cp-btn">Upload</button>
      </div>
      <p style="color:#888;font-size:12px;margin-top:8px">Max 5 MB. Stored in KV (no R2 required).</p>
    </form>
  </details>

  <!-- Grid -->
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px">
    ${gridHtml || '<p style="color:#999;grid-column:1/-1;text-align:center">No media files yet.</p>'}
  </div>

  ${items.length === limit ? `<div style="margin-top:16px;text-align:right"><a href="?paged=${page + 1}" class="cp-btn cp-btn-secondary">Next Page &raquo;</a></div>` : ""}
  ${page > 1 ? `<div style="margin-top:16px"><a href="?paged=${page - 1}" class="cp-btn cp-btn-secondary">&laquo; Previous</a></div>` : ""}
</div>`;
  return new Response(
    await renderAdminShell(cp, content, { title: "Media Library", notices: notice ? [notice] : [] }),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
__name(handleMediaPage, "handleMediaPage");

// cp-admin/pages/comments.js
async function handleComments(request, cp) {
  const prefix = cp.db_prefix || "cp_";
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const action = url.searchParams.get("action") || "";
  const cid = parseInt(url.searchParams.get("c") || "0");
  const status = url.searchParams.get("comment_status") || "all";
  const page = Math.max(1, parseInt(url.searchParams.get("paged") || "1"));
  const perPage = 20;
  const notices = [];
  if (method === "POST") {
    const fd = await request.formData().catch(() => new FormData());
    const bulkAction = fd.get("action") || action;
    const ids = fd.getAll("delete_comments[]").map(Number).filter(Boolean);
    if (cid && !ids.length)
      ids.push(cid);
    if (ids.length) {
      if (bulkAction === "approve") {
        for (const id of ids)
          await cp.db.prepare(`UPDATE ${prefix}comments SET comment_approved='1' WHERE comment_ID=?`).bind(id).run();
        notices.push({ type: "success", message: `${ids.length} comment(s) approved.` });
      } else if (bulkAction === "unapprove") {
        for (const id of ids)
          await cp.db.prepare(`UPDATE ${prefix}comments SET comment_approved='0' WHERE comment_ID=?`).bind(id).run();
        notices.push({ type: "success", message: `${ids.length} comment(s) unapproved.` });
      } else if (bulkAction === "spam") {
        for (const id of ids)
          await cp.db.prepare(`UPDATE ${prefix}comments SET comment_approved='spam' WHERE comment_ID=?`).bind(id).run();
        notices.push({ type: "success", message: `${ids.length} comment(s) marked as spam.` });
      } else if (bulkAction === "trash" || bulkAction === "delete") {
        for (const id of ids)
          await cp.db.prepare(`DELETE FROM ${prefix}comments WHERE comment_ID=?`).bind(id).run();
        notices.push({ type: "success", message: `${ids.length} comment(s) deleted.` });
      }
    }
  }
  const counts = await Promise.all([
    cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}comments`).first(),
    cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}comments WHERE comment_approved='1'`).first(),
    cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}comments WHERE comment_approved='0'`).first(),
    cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}comments WHERE comment_approved='spam'`).first()
  ]);
  const [total, approved, pending, spam] = counts.map((r) => r?.n ?? 0);
  let whereSql = "";
  if (status === "approved")
    whereSql = `WHERE c.comment_approved='1'`;
  else if (status === "pending")
    whereSql = `WHERE c.comment_approved='0'`;
  else if (status === "spam")
    whereSql = `WHERE c.comment_approved='spam'`;
  const offset = (page - 1) * perPage;
  const { results: comments } = await cp.db.prepare(`
    SELECT c.*, p.post_title
    FROM ${prefix}comments c
    LEFT JOIN ${prefix}posts p ON c.comment_post_ID = p.ID
    ${whereSql}
    ORDER BY c.comment_date DESC
    LIMIT ? OFFSET ?
  `).bind(perPage, offset).all();
  const totalFiltered = status === "all" ? total : status === "approved" ? approved : status === "pending" ? pending : spam;
  const totalPages = Math.ceil(totalFiltered / perPage);
  const noticeHtml = notices.map(
    (n) => `<div class="cp-notice cp-notice-${n.type}">${esc7(n.message)}</div>`
  ).join("");
  const statusTabs = [
    { key: "all", label: `All (${total})` },
    { key: "approved", label: `Approved (${approved})` },
    { key: "pending", label: `Pending (${pending})` },
    { key: "spam", label: `Spam (${spam})` }
  ].map((t) => `<a href="?comment_status=${t.key}" class="cp-tab${status === t.key ? " active" : ""}">${t.label}</a>`).join(" | ");
  const rows = (comments || []).map((c) => `
    <tr>
      <td><input type="checkbox" name="delete_comments[]" value="${c.comment_ID}"></td>
      <td>
        <strong>${esc7(c.comment_author)}</strong><br>
        <a href="mailto:${esc7(c.comment_author_email)}">${esc7(c.comment_author_email)}</a><br>
        <span style="color:#646970;font-size:12px">${esc7(c.comment_author_IP || "")}</span>
      </td>
      <td>
        <div style="max-width:380px">${esc7(truncate3(c.comment_content, 120))}</div>
        <div class="cp-row-actions" style="margin-top:4px">
          <a href="?action=approve&c=${c.comment_ID}" style="color:#46b450">Approve</a> |
          <a href="?action=unapprove&c=${c.comment_ID}" style="color:#f56e28">Unapprove</a> |
          <a href="?action=spam&c=${c.comment_ID}" style="color:#dc3232">Spam</a> |
          <a href="?action=delete&c=${c.comment_ID}" style="color:#dc3232" onclick="return confirm('Delete this comment?')">Delete</a>
        </div>
      </td>
      <td>
        <a href="/cp-admin/post?post=${c.comment_post_ID}">${esc7(c.post_title || "(no title)")}</a>
      </td>
      <td>
        <span class="cp-badge ${c.comment_approved === "1" ? "cp-badge-publish" : "cp-badge-pending"}">
          ${c.comment_approved === "1" ? "Approved" : c.comment_approved === "spam" ? "Spam" : "Pending"}
        </span>
      </td>
      <td style="font-size:12px;color:#646970">${esc7(formatDate4(c.comment_date))}</td>
    </tr>
  `).join("");
  const pagination = totalPages > 1 ? `
    <div style="margin-top:12px;text-align:right">
      ${page > 1 ? `<a href="?comment_status=${status}&paged=${page - 1}" class="cp-btn cp-btn-secondary">&#8592; Prev</a>` : ""}
      <span style="margin:0 8px;color:#646970">Page ${page} / ${totalPages}</span>
      ${page < totalPages ? `<a href="?comment_status=${status}&paged=${page + 1}" class="cp-btn cp-btn-secondary">Next &#8594;</a>` : ""}
    </div>` : "";
  const content = `
${noticeHtml}
<div class="cp-card">
  <div style="margin-bottom:12px">${statusTabs}</div>
  <form method="post">
    <div style="margin-bottom:8px;display:flex;gap:8px;align-items:center">
      <select name="action" class="cp-form-select" style="width:auto">
        <option value="">Bulk Actions</option>
        <option value="approve">Approve</option>
        <option value="unapprove">Unapprove</option>
        <option value="spam">Mark as Spam</option>
        <option value="delete">Delete</option>
      </select>
      <button type="submit" class="cp-btn cp-btn-secondary">Apply</button>
    </div>
    <div class="cp-table-wrap">
      <table class="cp-table">
        <thead>
          <tr>
            <th><input type="checkbox" id="cb-all"></th>
            <th>Author</th>
            <th>Comment</th>
            <th>In Response To</th>
            <th>Status</th>
            <th>Submitted</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:#646970;padding:24px">No comments found.</td></tr>'}</tbody>
      </table>
    </div>
    ${pagination}
  </form>
</div>
<script>
  document.getElementById('cb-all')?.addEventListener('change', function() {
    document.querySelectorAll('input[name="delete_comments[]"]').forEach(cb => cb.checked = this.checked);
  });
<\/script>`;
  const html = await renderAdminShell(cp, content, { title: "Comments" });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
__name(handleComments, "handleComments");
function esc7(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(esc7, "esc");
function truncate3(str, n) {
  return str && str.length > n ? str.slice(0, n) + "..." : str || "";
}
__name(truncate3, "truncate");
function formatDate4(d) {
  try {
    return new Date(d).toLocaleString();
  } catch (_) {
    return d || "";
  }
}
__name(formatDate4, "formatDate");

// cp-admin/pages/themes.js
init_theme_loader();
init_option();
function esc8(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(esc8, "esc");
async function handleThemes(request, cp) {
  const method = request.method.toUpperCase();
  let notice = null;
  if (method === "POST") {
    const fd = await request.formData().catch(() => new FormData());
    const action = fd.get("action") || "";
    const slug = (fd.get("theme") || "").trim();
    if (action === "activate" && slug) {
      await switchTheme(cp, slug);
      notice = { type: "success", message: `Theme "${esc8(slug)}" activated.` };
    }
    if (action === "install_builtin") {
      const builtinSlug = "cloudpress-default";
      await updateOption(cp, "template", builtinSlug);
      await updateOption(cp, "stylesheet", builtinSlug);
      const meta = { name: "CloudPress Default", version: "1.2.0", description: "The default CloudPress theme.", author: "CloudPress" };
      await cp.kv.put(`cp:theme:meta:${builtinSlug}`, JSON.stringify(meta)).catch(() => {
      });
      await cp.kv.put("cp:themes:list", JSON.stringify([{ slug: builtinSlug, ...meta }])).catch(() => {
      });
      notice = { type: "success", message: "Default theme installed and activated." };
      cp.theme = { slug: builtinSlug, ...meta };
    }
  }
  const themes = await getThemes(cp);
  const activeSlug = await getOption(cp, "template", "").catch(() => "");
  const themeCards = themes.length ? themes.map((t) => {
    const isActive = t.slug === activeSlug;
    return `
  <div class="cp-card" style="position:relative${isActive ? ";border:2px solid #0073aa" : ""}">
    ${isActive ? '<div style="position:absolute;top:10px;right:10px;background:#0073aa;color:#fff;padding:2px 8px;border-radius:3px;font-size:12px">Active</div>' : ""}
    <h3 style="margin:0 0 6px">${esc8(t.name || t.slug)}</h3>
    <p style="color:#666;font-size:13px;margin:0 0 4px">${esc8(t.description || "")}</p>
    <p style="color:#999;font-size:12px;margin:0 0 12px">v${esc8(t.version || "1.0.0")} by ${esc8(t.author || "")}</p>
    ${!isActive ? `
    <form method="post">
      <input type="hidden" name="action" value="activate">
      <input type="hidden" name="theme" value="${esc8(t.slug)}">
      <button type="submit" class="cp-btn">Activate</button>
    </form>` : '<span style="color:#0073aa;font-weight:600">Currently Active</span>'}
  </div>`;
  }).join("") : `<div class="cp-card" style="grid-column:1/-1;text-align:center;color:#888">
        <p>No themes installed.</p>
        <form method="post">
          <input type="hidden" name="action" value="install_builtin">
          <button type="submit" class="cp-btn">Install Default Theme</button>
        </form>
       </div>`;
  const content = `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
  <h1>Themes</h1>
</div>
<p style="color:#666;margin-bottom:20px">Themes are loaded from GitHub. Set your GitHub repo in <a href="/cp-admin/options-general">General Settings</a>.</p>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px">
  ${themeCards}
</div>`;
  return new Response(
    await renderAdminShell(cp, content, { title: "Themes", notices: notice ? [notice] : [] }),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
__name(handleThemes, "handleThemes");

// cp-admin/pages/plugins.js
init_option();
function esc9(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(esc9, "esc");
async function getPlugins(cp) {
  try {
    const raw = await cp.kv.get("cp:plugins:list", { type: "json" });
    return Array.isArray(raw) ? raw : [];
  } catch (_) {
    return [];
  }
}
__name(getPlugins, "getPlugins");
async function getActivePlugins(cp) {
  try {
    const raw = await cp.kv.get("cp:plugins:active", { type: "json" });
    return Array.isArray(raw) ? raw : [];
  } catch (_) {
    return [];
  }
}
__name(getActivePlugins, "getActivePlugins");
async function handlePlugins(request, cp) {
  const method = request.method.toUpperCase();
  let notice = null;
  if (method === "POST") {
    const fd = await request.formData().catch(() => new FormData());
    const action = fd.get("action") || "";
    const slug = (fd.get("plugin") || "").trim();
    const active2 = await getActivePlugins(cp);
    if (action === "activate" && slug && !active2.includes(slug)) {
      active2.push(slug);
      await cp.kv.put("cp:plugins:active", JSON.stringify(active2)).catch(() => {
      });
      notice = { type: "success", message: `Plugin "${esc9(slug)}" activated.` };
    }
    if (action === "deactivate" && slug) {
      const updated = active2.filter((p) => p !== slug);
      await cp.kv.put("cp:plugins:active", JSON.stringify(updated)).catch(() => {
      });
      notice = { type: "success", message: `Plugin "${esc9(slug)}" deactivated.` };
    }
    if (action === "delete" && slug) {
      const plugins2 = await getPlugins(cp);
      const updated = plugins2.filter((p) => p.slug !== slug);
      await cp.kv.put("cp:plugins:list", JSON.stringify(updated)).catch(() => {
      });
      const active22 = (await getActivePlugins(cp)).filter((p) => p !== slug);
      await cp.kv.put("cp:plugins:active", JSON.stringify(active22)).catch(() => {
      });
      notice = { type: "success", message: `Plugin "${esc9(slug)}" deleted.` };
    }
    if (action === "install_github") {
      const repo = (fd.get("github_repo") || "").trim();
      const plugSlug = repo.split("/").pop() || repo;
      if (repo) {
        const plugins2 = await getPlugins(cp);
        if (!plugins2.find((p) => p.slug === plugSlug)) {
          plugins2.push({ slug: plugSlug, name: plugSlug, github_repo: repo, version: "1.2.0", description: `GitHub: ${repo}` });
          await cp.kv.put("cp:plugins:list", JSON.stringify(plugins2)).catch(() => {
          });
          notice = { type: "success", message: `Plugin "${esc9(plugSlug)}" added from GitHub.` };
        } else {
          notice = { type: "error", message: "Plugin already exists." };
        }
      }
    }
  }
  const plugins = await getPlugins(cp);
  const active = await getActivePlugins(cp);
  const rows = plugins.map((p) => {
    const isActive = active.includes(p.slug);
    return `
  <tr>
    <td>
      <strong>${esc9(p.name || p.slug)}</strong>
      <div style="color:#666;font-size:12px;margin-top:2px">${esc9(p.description || "")}</div>
      <div class="row-actions" style="margin-top:4px">
        ${isActive ? `<form method="post" style="display:inline"><input type="hidden" name="action" value="deactivate"><input type="hidden" name="plugin" value="${esc9(p.slug)}"><button type="submit" class="cp-btn-link" style="color:#a00">Deactivate</button></form>` : `<form method="post" style="display:inline"><input type="hidden" name="action" value="activate"><input type="hidden" name="plugin" value="${esc9(p.slug)}"><button type="submit" class="cp-btn-link">Activate</button></form>`}
        &nbsp;|&nbsp;
        <form method="post" style="display:inline" onsubmit="return confirm('Delete plugin?')">
          <input type="hidden" name="action" value="delete">
          <input type="hidden" name="plugin" value="${esc9(p.slug)}">
          <button type="submit" class="cp-btn-link" style="color:#a00">Delete</button>
        </form>
      </div>
    </td>
    <td>v${esc9(p.version || "?")}</td>
    <td><span class="cp-status ${isActive ? "cp-status-publish" : "cp-status-draft"}">${isActive ? "Active" : "Inactive"}</span></td>
    ${p.github_repo ? `<td><a href="https://github.com/${esc9(p.github_repo)}" target="_blank" style="font-size:12px">${esc9(p.github_repo)}</a></td>` : "<td>--</td>"}
  </tr>`;
  }).join("");
  const content = `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
  <h1>Plugins</h1>
</div>

<details class="cp-card" style="margin-bottom:20px">
  <summary style="cursor:pointer;font-weight:600">&#43; Add Plugin from GitHub</summary>
  <form method="post" style="margin-top:14px;display:flex;gap:10px;align-items:flex-end">
    <div style="flex:1">
      <label style="display:block;margin-bottom:4px;font-weight:500">GitHub Repository (owner/repo)</label>
      <input type="text" name="github_repo" placeholder="e.g. username/my-cloudpress-plugin"
             style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
    </div>
    <input type="hidden" name="action" value="install_github">
    <button type="submit" class="cp-btn">Add Plugin</button>
  </form>
</details>

<div class="cp-card">
  <table class="cp-table">
    <thead><tr><th>Plugin</th><th>Version</th><th>Status</th><th>Source</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:#999;padding:20px">No plugins installed.</td></tr>'}</tbody>
  </table>
</div>`;
  return new Response(
    await renderAdminShell(cp, content, { title: "Plugins", notices: notice ? [notice] : [] }),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
__name(handlePlugins, "handlePlugins");

// cp-admin/pages/users.js
init_crypto();
function esc10(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(esc10, "esc");
async function handleUsers(request, cp) {
  const prefix = cp.db_prefix || "cp_";
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  let notice = null;
  if (method === "POST") {
    const fd = await request.formData().catch(() => new FormData());
    const action = fd.get("action") || "";
    const uid = parseInt(fd.get("user_id") || 0);
    const me2 = cp.currentUser?.ID;
    if (action === "delete" && uid && uid !== me2) {
      await cp.db.prepare(`DELETE FROM ${prefix}users WHERE ID=?`).bind(uid).run();
      await cp.db.prepare(`DELETE FROM ${prefix}usermeta WHERE user_id=?`).bind(uid).run();
      notice = { type: "success", message: "User deleted." };
    }
    if (action === "add_user") {
      const login = (fd.get("user_login") || "").trim();
      const email = (fd.get("user_email") || "").trim();
      const pass = (fd.get("user_pass") || "").trim();
      const role2 = fd.get("role") || "subscriber";
      const now = (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 19);
      if (!login || !email || !pass) {
        notice = { type: "error", message: "Login, email, and password are required." };
      } else {
        const exists = await cp.db.prepare(`SELECT ID FROM ${prefix}users WHERE user_login=? OR user_email=?`).bind(login, email).first();
        if (exists) {
          notice = { type: "error", message: "Username or email already in use." };
        } else {
          const hash = await hashPassword(pass);
          const res = await cp.db.prepare(
            `INSERT INTO ${prefix}users (user_login,user_pass,user_email,user_registered,user_status,display_name)
             VALUES (?,?,?,?,0,?)`
          ).bind(login, hash, email, now, login).run();
          const newId = res.meta?.last_row_id;
          if (newId) {
            await cp.db.prepare(`INSERT INTO ${prefix}usermeta (user_id,meta_key,meta_value) VALUES (?,?,?)`).bind(newId, `${prefix}capabilities`, JSON.stringify({ [role2]: true })).run();
          }
          notice = { type: "success", message: `User "${esc10(login)}" created.` };
        }
      }
    }
  }
  const search = (url.searchParams.get("s") || "").trim();
  const role = url.searchParams.get("role") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("paged") || 1));
  const limit = 20;
  const conds = [];
  const params = [];
  if (search) {
    conds.push("(user_login LIKE ? OR user_email LIKE ? OR display_name LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const total = await cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}users ${where}`).bind(...params).first();
  const rows = await cp.db.prepare(
    `SELECT u.ID, u.user_login, u.user_email, u.display_name, u.user_registered,
            m.meta_value as caps
     FROM ${prefix}users u
     LEFT JOIN ${prefix}usermeta m ON m.user_id=u.ID AND m.meta_key='${prefix}capabilities'
     ${where} ORDER BY u.ID ASC LIMIT ? OFFSET ?`
  ).bind(...params, limit, (page - 1) * limit).all();
  const users = rows.results || [];
  const me = cp.currentUser?.ID;
  function parseRole(caps) {
    try {
      const obj = typeof caps === "string" ? JSON.parse(caps) : caps || {};
      return Object.keys(obj).find((k) => obj[k]) || "subscriber";
    } catch (_) {
      return "subscriber";
    }
  }
  __name(parseRole, "parseRole");
  const tableRows = users.map((u) => {
    const userRole = parseRole(u.caps);
    const isSelf = u.ID === me;
    return `
  <tr>
    <td><strong>${esc10(u.user_login)}</strong>${isSelf ? ' <span style="color:#0073aa">(You)</span>' : ""}</td>
    <td>${esc10(u.display_name || u.user_login)}</td>
    <td><a href="mailto:${esc10(u.user_email)}">${esc10(u.user_email)}</a></td>
    <td>${esc10(userRole)}</td>
    <td style="white-space:nowrap">
      <a href="/cp-admin/user-edit?user_id=${u.ID}" class="cp-btn cp-btn-secondary" style="padding:4px 10px;font-size:12px">Edit</a>
      ${!isSelf ? `
      <form method="post" style="display:inline" onsubmit="return confirm('Delete user?')">
        <input type="hidden" name="action" value="delete">
        <input type="hidden" name="user_id" value="${u.ID}">
        <button type="submit" class="cp-btn" style="background:#a00;padding:4px 10px;font-size:12px">Delete</button>
      </form>` : ""}
    </td>
  </tr>`;
  }).join("");
  const totalPages = Math.ceil((total?.n || 0) / limit);
  const content = `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
  <h1>Users</h1>
</div>

<!-- Add user -->
<details class="cp-card" style="margin-bottom:20px">
  <summary style="cursor:pointer;font-weight:600">&#43; Add New User</summary>
  <form method="post" style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
    <input type="hidden" name="action" value="add_user">
    <div>
      <label style="display:block;margin-bottom:4px;font-weight:500">Username *</label>
      <input type="text" name="user_login" required style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
    </div>
    <div>
      <label style="display:block;margin-bottom:4px;font-weight:500">Email *</label>
      <input type="email" name="user_email" required style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
    </div>
    <div>
      <label style="display:block;margin-bottom:4px;font-weight:500">Password *</label>
      <input type="password" name="user_pass" required style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
    </div>
    <div>
      <label style="display:block;margin-bottom:4px;font-weight:500">Role</label>
      <select name="role" style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;background:#fff;box-sizing:border-box">
        <option value="subscriber">Subscriber</option>
        <option value="contributor">Contributor</option>
        <option value="author">Author</option>
        <option value="editor">Editor</option>
        <option value="administrator">Administrator</option>
      </select>
    </div>
    <div style="grid-column:1/-1">
      <button type="submit" class="cp-btn">Add User</button>
    </div>
  </form>
</details>

<!-- Table -->
<div class="cp-card">
  <form method="get" style="margin-bottom:12px;display:flex;gap:8px">
    <input type="text" name="s" value="${esc10(search)}" placeholder="Search users..." style="padding:6px 10px;border:1px solid #ccc;border-radius:4px;flex:1">
    <button type="submit" class="cp-btn cp-btn-secondary">Search</button>
  </form>
  <table class="cp-table">
    <thead><tr><th>Username</th><th>Name</th><th>Email</th><th>Role</th><th>Actions</th></tr></thead>
    <tbody>${tableRows || '<tr><td colspan="5" style="text-align:center;color:#999;padding:20px">No users found.</td></tr>'}</tbody>
  </table>
  <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
    ${page > 1 ? `<a href="?paged=${page - 1}&s=${esc10(search)}" class="cp-btn cp-btn-secondary">&laquo; Prev</a>` : ""}
    <span style="line-height:36px;color:#666">Page ${page} of ${totalPages || 1}</span>
    ${page < totalPages ? `<a href="?paged=${page + 1}&s=${esc10(search)}" class="cp-btn cp-btn-secondary">Next &raquo;</a>` : ""}
  </div>
</div>`;
  return new Response(
    await renderAdminShell(cp, content, { title: "Users", notices: notice ? [notice] : [] }),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
__name(handleUsers, "handleUsers");

// cp-admin/pages/user-edit.js
init_crypto();
function esc11(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(esc11, "esc");
async function handleUserEdit(request, cp) {
  const prefix = cp.db_prefix || "cp_";
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const userId = parseInt(url.searchParams.get("user_id") || cp.currentUser?.ID || 0);
  let notice = null;
  if (!userId) {
    return new Response("User not found", { status: 404 });
  }
  if (method === "POST") {
    const fd = await request.formData().catch(() => new FormData());
    const displayName = (fd.get("display_name") || "").trim();
    const email = (fd.get("user_email") || "").trim();
    const newPass = (fd.get("new_pass") || "").trim();
    const role = fd.get("role") || "";
    if (!email || !email.includes("@")) {
      notice = { type: "error", message: "Valid email required." };
    } else {
      const updates = ["display_name=?", "user_email=?"];
      const params = [displayName, email];
      if (newPass) {
        const hash = await hashPassword(newPass);
        updates.push("user_pass=?");
        params.push(hash);
      }
      params.push(userId);
      await cp.db.prepare(
        `UPDATE ${prefix}users SET ${updates.join(",")} WHERE ID=?`
      ).bind(...params).run();
      if (role) {
        const existing = await cp.db.prepare(
          `SELECT umeta_id FROM ${prefix}usermeta WHERE user_id=? AND meta_key=?`
        ).bind(userId, `${prefix}capabilities`).first();
        const caps = JSON.stringify({ [role]: true });
        if (existing) {
          await cp.db.prepare(
            `UPDATE ${prefix}usermeta SET meta_value=? WHERE user_id=? AND meta_key=?`
          ).bind(caps, userId, `${prefix}capabilities`).run();
        } else {
          await cp.db.prepare(
            `INSERT INTO ${prefix}usermeta (user_id,meta_key,meta_value) VALUES (?,?,?)`
          ).bind(userId, `${prefix}capabilities`, caps).run();
        }
      }
      notice = { type: "success", message: "User updated." };
    }
  }
  const user = await cp.db.prepare(
    `SELECT u.ID, u.user_login, u.user_email, u.display_name, u.user_registered,
            m.meta_value as caps
     FROM ${prefix}users u
     LEFT JOIN ${prefix}usermeta m ON m.user_id=u.ID AND m.meta_key='${prefix}capabilities'
     WHERE u.ID=? LIMIT 1`
  ).bind(userId).first();
  if (!user)
    return new Response("User not found", { status: 404 });
  function getRole(caps) {
    try {
      const obj = typeof caps === "string" ? JSON.parse(caps) : caps || {};
      return Object.keys(obj).find((k) => obj[k]) || "subscriber";
    } catch (_) {
      return "subscriber";
    }
  }
  __name(getRole, "getRole");
  const currentRole = getRole(user.caps);
  const roles = ["subscriber", "contributor", "author", "editor", "administrator"];
  const content = `
<div class="cp-card" style="max-width:600px">
  <h1>Edit User: ${esc11(user.user_login)}</h1>
  <form method="post">
    <div style="display:grid;gap:16px;margin-top:16px">

      <div>
        <label style="display:block;margin-bottom:4px;font-weight:500">Username</label>
        <input type="text" value="${esc11(user.user_login)}" disabled
               style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;background:#f5f5f5;box-sizing:border-box;color:#666">
        <p style="color:#888;font-size:12px;margin:4px 0 0">Username cannot be changed.</p>
      </div>

      <div>
        <label style="display:block;margin-bottom:4px;font-weight:500">Display Name</label>
        <input type="text" name="display_name" value="${esc11(user.display_name || user.user_login)}"
               style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
      </div>

      <div>
        <label style="display:block;margin-bottom:4px;font-weight:500">Email *</label>
        <input type="email" name="user_email" value="${esc11(user.user_email)}" required
               style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
      </div>

      <div>
        <label style="display:block;margin-bottom:4px;font-weight:500">Role</label>
        <select name="role" style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;background:#fff;box-sizing:border-box">
          ${roles.map((r) => `<option value="${r}"${r === currentRole ? " selected" : ""}>${r.charAt(0).toUpperCase() + r.slice(1)}</option>`).join("")}
        </select>
      </div>

      <div>
        <label style="display:block;margin-bottom:4px;font-weight:500">New Password</label>
        <input type="password" name="new_pass" placeholder="Leave blank to keep current password"
               style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
      </div>

      <div style="display:flex;gap:10px;margin-top:8px">
        <button type="submit" class="cp-btn">Save Changes</button>
        <a href="/cp-admin/users" class="cp-btn cp-btn-secondary">Cancel</a>
      </div>
    </div>
  </form>
</div>`;
  return new Response(
    await renderAdminShell(cp, content, { title: `Edit User: ${user.user_login}`, notices: notice ? [notice] : [] }),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
__name(handleUserEdit, "handleUserEdit");

// cp-admin/pages/profile.js
init_crypto();
function esc12(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(esc12, "esc");
async function handleProfile(request, cp) {
  const prefix = cp.db_prefix || "cp_";
  const method = request.method.toUpperCase();
  const me = cp.currentUser;
  let notice = null;
  if (!me) {
    return new Response("", { status: 302, headers: { Location: "/cp-login" } });
  }
  if (method === "POST") {
    const fd = await request.formData().catch(() => new FormData());
    const displayName = (fd.get("display_name") || "").trim();
    const email = (fd.get("user_email") || "").trim();
    const firstName = (fd.get("first_name") || "").trim();
    const lastName = (fd.get("last_name") || "").trim();
    const bio = (fd.get("description") || "").trim();
    const newPass = (fd.get("new_pass") || "").trim();
    const confirmPass = (fd.get("confirm_pass") || "").trim();
    if (!email || !email.includes("@")) {
      notice = { type: "error", message: "Valid email required." };
    } else if (newPass && newPass !== confirmPass) {
      notice = { type: "error", message: "Passwords do not match." };
    } else {
      const updates = ["display_name=?", "user_email=?"];
      const params = [displayName || me.user_login, email];
      if (newPass) {
        const hash = await hashPassword(newPass);
        updates.push("user_pass=?");
        params.push(hash);
      }
      params.push(me.ID);
      await cp.db.prepare(`UPDATE ${prefix}users SET ${updates.join(",")} WHERE ID=?`).bind(...params).run();
      const metaFields = { first_name: firstName, last_name: lastName, description: bio };
      for (const [key, val] of Object.entries(metaFields)) {
        const existing = await cp.db.prepare(
          `SELECT umeta_id FROM ${prefix}usermeta WHERE user_id=? AND meta_key=? LIMIT 1`
        ).bind(me.ID, key).first();
        if (existing) {
          await cp.db.prepare(`UPDATE ${prefix}usermeta SET meta_value=? WHERE user_id=? AND meta_key=?`).bind(val, me.ID, key).run();
        } else {
          await cp.db.prepare(`INSERT INTO ${prefix}usermeta (user_id,meta_key,meta_value) VALUES (?,?,?)`).bind(me.ID, key, val).run();
        }
      }
      notice = { type: "success", message: "Profile updated." };
    }
  }
  const user = await cp.db.prepare(
    `SELECT ID, user_login, user_email, display_name FROM ${prefix}users WHERE ID=? LIMIT 1`
  ).bind(me.ID).first();
  const metaRows = await cp.db.prepare(
    `SELECT meta_key, meta_value FROM ${prefix}usermeta WHERE user_id=? AND meta_key IN ('first_name','last_name','description')`
  ).bind(me.ID).all();
  const meta = {};
  (metaRows.results || []).forEach((r) => {
    meta[r.meta_key] = r.meta_value;
  });
  const content = `
<div class="cp-card" style="max-width:640px">
  <h1>Your Profile</h1>
  <form method="post" style="margin-top:16px">
    <div style="display:grid;gap:16px">

      <div>
        <label style="display:block;margin-bottom:4px;font-weight:500">Username</label>
        <input type="text" value="${esc12(user?.user_login)}" disabled
               style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;background:#f5f5f5;box-sizing:border-box;color:#666">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <label style="display:block;margin-bottom:4px;font-weight:500">First Name</label>
          <input type="text" name="first_name" value="${esc12(meta.first_name || "")}"
                 style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
        </div>
        <div>
          <label style="display:block;margin-bottom:4px;font-weight:500">Last Name</label>
          <input type="text" name="last_name" value="${esc12(meta.last_name || "")}"
                 style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
        </div>
      </div>

      <div>
        <label style="display:block;margin-bottom:4px;font-weight:500">Display Name</label>
        <input type="text" name="display_name" value="${esc12(user?.display_name || user?.user_login || "")}"
               style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
      </div>

      <div>
        <label style="display:block;margin-bottom:4px;font-weight:500">Email *</label>
        <input type="email" name="user_email" value="${esc12(user?.user_email || "")}" required
               style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
      </div>

      <div>
        <label style="display:block;margin-bottom:4px;font-weight:500">Bio</label>
        <textarea name="description" rows="4" style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;resize:vertical">${esc12(meta.description || "")}</textarea>
      </div>

      <hr style="border:none;border-top:1px solid #eee;margin:4px 0">
      <h3 style="margin:0">Change Password</h3>

      <div>
        <label style="display:block;margin-bottom:4px;font-weight:500">New Password</label>
        <input type="password" name="new_pass" placeholder="Leave blank to keep current"
               style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
      </div>
      <div>
        <label style="display:block;margin-bottom:4px;font-weight:500">Confirm Password</label>
        <input type="password" name="confirm_pass" placeholder="Repeat new password"
               style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
      </div>

      <div>
        <button type="submit" class="cp-btn">Save Changes</button>
      </div>
    </div>
  </form>
</div>`;
  return new Response(
    await renderAdminShell(cp, content, { title: "Your Profile", notices: notice ? [notice] : [] }),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
__name(handleProfile, "handleProfile");

// cp-admin/pages/options.js
async function handleOptions(request, cp) {
  const content = `
<div class="cp-card">
  <h1>Settings</h1>
  <p style="color:#666;margin-bottom:24px">Manage your CloudPress site settings.</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px">

    <a href="/cp-admin/options-general" style="display:block;padding:20px;background:#f9f9f9;border:1px solid #ddd;border-radius:8px;text-decoration:none;color:inherit;transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,.1)'" onmouseout="this.style.boxShadow=''">
      <div style="font-size:2rem;margin-bottom:8px">&#9881;&#65039;</div>
      <strong>General</strong>
      <p style="color:#888;font-size:13px;margin:4px 0 0">Site title, tagline, URL, email, timezone.</p>
    </a>

    <a href="/cp-admin/options-writing" style="display:block;padding:20px;background:#f9f9f9;border:1px solid #ddd;border-radius:8px;text-decoration:none;color:inherit;transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,.1)'" onmouseout="this.style.boxShadow=''">
      <div style="font-size:2rem;margin-bottom:8px">&#128221;</div>
      <strong>Writing</strong>
      <p style="color:#888;font-size:13px;margin:4px 0 0">Default post category, post format, editor settings.</p>
    </a>

    <a href="/cp-admin/options-reading" style="display:block;padding:20px;background:#f9f9f9;border:1px solid #ddd;border-radius:8px;text-decoration:none;color:inherit;transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,.1)'" onmouseout="this.style.boxShadow=''">
      <div style="font-size:2rem;margin-bottom:8px">&#128214;</div>
      <strong>Reading</strong>
      <p style="color:#888;font-size:13px;margin:4px 0 0">Front page, blog page, posts per page, feed.</p>
    </a>

    <a href="/cp-admin/options-discussion" style="display:block;padding:20px;background:#f9f9f9;border:1px solid #ddd;border-radius:8px;text-decoration:none;color:inherit;transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,.1)'" onmouseout="this.style.boxShadow=''">
      <div style="font-size:2rem;margin-bottom:8px">&#128172;</div>
      <strong>Discussion</strong>
      <p style="color:#888;font-size:13px;margin:4px 0 0">Comment moderation, notifications, avatars.</p>
    </a>

    <a href="/cp-admin/options-media" style="display:block;padding:20px;background:#f9f9f9;border:1px solid #ddd;border-radius:8px;text-decoration:none;color:inherit;transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,.1)'" onmouseout="this.style.boxShadow=''">
      <div style="font-size:2rem;margin-bottom:8px">&#128247;</div>
      <strong>Media</strong>
      <p style="color:#888;font-size:13px;margin:4px 0 0">Image sizes, upload settings.</p>
    </a>

    <a href="/cp-admin/options-permalink" style="display:block;padding:20px;background:#f9f9f9;border:1px solid #ddd;border-radius:8px;text-decoration:none;color:inherit;transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,.1)'" onmouseout="this.style.boxShadow=''">
      <div style="font-size:2rem;margin-bottom:8px">&#128279;</div>
      <strong>Permalinks</strong>
      <p style="color:#888;font-size:13px;margin:4px 0 0">URL structure for posts and pages.</p>
    </a>

  </div>
</div>`;
  return new Response(
    await renderAdminShell(cp, content, { title: "Settings" }),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
__name(handleOptions, "handleOptions");

// cp-admin/pages/options-general.js
init_option();
async function handleOptionsGeneral(request, cp) {
  const prefix = cp.config.DB_PREFIX || "cp_";
  const method = request.method.toUpperCase();
  let notices = [];
  const optionKeys = [
    "blogname",
    "blogdescription",
    "siteurl",
    "admin_email",
    "blogcharset",
    "date_format",
    "time_format",
    "timezone_string",
    "gmt_offset",
    "start_of_week",
    "default_role",
    "users_can_register",
    "cp_github_repo"
  ];
  if (method === "POST") {
    const fd = await request.formData().catch(() => new FormData());
    for (const key of optionKeys) {
      const val = fd.get(key);
      if (val !== null) {
        await updateOption(cp, key, val);
      }
    }
    const newRepo = fd.get("cp_github_repo") || "";
    try {
      const cfg = await cp.kv.get("cp:config", { type: "json" }) || {};
      cfg.GITHUB_REPO = newRepo;
      await cp.kv.put("cp:config", JSON.stringify(cfg));
    } catch (_) {
    }
    notices.push({ type: "success", message: "Settings saved." });
  }
  const opts = {};
  for (const key of optionKeys) {
    opts[key] = await getOption(cp, key).catch(() => "");
  }
  const githubToken = cp.config.GITHUB_TOKEN || cp.env?.CP_GITHUB_TOKEN || "";
  const content = `
<form method="post">
  <div class="cp-card">
    <h2>Site Settings</h2>
    <table class="cp-form-table">
      <tr>
        <th><label for="blogname">Site Title</label></th>
        <td><input type="text" id="blogname" name="blogname" class="cp-form-input"
                   value="${esc13(opts.blogname)}"></td>
      </tr>
      <tr>
        <th><label for="blogdescription">Tagline</label></th>
        <td>
          <input type="text" id="blogdescription" name="blogdescription" class="cp-form-input"
                 value="${esc13(opts.blogdescription)}">
          <p class="cp-description">In a few words, explain what this site is about.</p>
        </td>
      </tr>
      <tr>
        <th><label for="siteurl">Site Address (URL)</label></th>
        <td>
          <input type="url" id="siteurl" name="siteurl" class="cp-form-input"
                 value="${esc13(opts.siteurl)}">
          <p class="cp-description">Your Cloudflare Worker route URL.</p>
        </td>
      </tr>
      <tr>
        <th><label for="admin_email">Admin Email</label></th>
        <td>
          <input type="email" id="admin_email" name="admin_email" class="cp-form-input"
                 value="${esc13(opts.admin_email)}">
        </td>
      </tr>
      <tr>
        <th><label for="users_can_register">Membership</label></th>
        <td>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" id="users_can_register" name="users_can_register" value="1"
                   ${opts.users_can_register === "1" ? "checked" : ""}>
            Anyone can register
          </label>
        </td>
      </tr>
      <tr>
        <th><label for="default_role">New User Default Role</label></th>
        <td>
          <select id="default_role" name="default_role" class="cp-form-select">
            ${["subscriber", "contributor", "author", "editor", "administrator"].map(
    (role) => `<option value="${role}" ${opts.default_role === role ? "selected" : ""}>${capitalize2(role)}</option>`
  ).join("")}
          </select>
          <p class="cp-description">Admin manually assigns roles. All accounts start with this default role.</p>
        </td>
      </tr>
    </table>
  </div>

  <div class="cp-card">
    <h2>Date &amp; Time</h2>
    <table class="cp-form-table">
      <tr>
        <th><label for="date_format">Date Format</label></th>
        <td>
          <input type="text" id="date_format" name="date_format" class="cp-form-input"
                 value="${esc13(opts.date_format || "F j, Y")}">
          <p class="cp-description">Example: <code>F j, Y</code> -> ${(/* @__PURE__ */ new Date()).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
        </td>
      </tr>
      <tr>
        <th><label for="time_format">Time Format</label></th>
        <td>
          <input type="text" id="time_format" name="time_format" class="cp-form-input"
                 value="${esc13(opts.time_format || "g:i a")}">
        </td>
      </tr>
      <tr>
        <th><label for="timezone_string">Timezone</label></th>
        <td>
          <select id="timezone_string" name="timezone_string" class="cp-form-select">
            ${getTimezones().map(
    (tz) => `<option value="${esc13(tz)}" ${opts.timezone_string === tz ? "selected" : ""}>${esc13(tz)}</option>`
  ).join("")}
          </select>
        </td>
      </tr>
      <tr>
        <th><label for="start_of_week">Week Starts On</label></th>
        <td>
          <select id="start_of_week" name="start_of_week" class="cp-form-select">
            ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(
    (d, i) => `<option value="${i}" ${opts.start_of_week == i ? "selected" : ""}>${d}</option>`
  ).join("")}
          </select>
        </td>
      </tr>
    </table>
  </div>

  <!-- GitHub Integration -->
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
                 value="${esc13(opts.cp_github_repo || cp.config.GITHUB_REPO || "")}"
                 placeholder="owner/repo-name">
          <p class="cp-description">
            GitHub repo containing <code>themes/</code> and <code>plugins/</code> folders.
            Example: <code>myorg/cloudpress-themes</code><br>
            Full URL also works: <code>https://github.com/owner/repo</code>
          </p>
        </td>
      </tr>
      <tr>
        <th>GitHub Token</th>
        <td>
          <span class="cp-badge ${githubToken ? "cp-badge-publish" : "cp-badge-draft"}">
            ${githubToken ? "&#10003; Token configured as Worker secret" : "&#8855; Not configured"}
          </span>
          ${!githubToken ? `
          <p class="cp-description" style="margin-top:8px">
            <strong>To set token:</strong><br>
            <code>npx wrangler secret put CP_GITHUB_TOKEN</code><br>
            Generate at: <a href="https://github.com/settings/tokens" target="_blank">github.com/settings/tokens</a>
            (requires <code>repo</code> scope for private repos, or no scope for public)
          </p>
          ` : ""}
        </td>
      </tr>
      <tr>
        <th></th>
        <td>
          <a href="/cp-admin/github-sync" class="cp-btn cp-btn-secondary">Open GitHub Sync Manager &rarr;</a>
        </td>
      </tr>
    </table>
  </div>

  <p>
    <button type="submit" class="cp-btn">Save Changes</button>
  </p>
</form>
`;
  const html = await renderAdminShell(cp, content, { title: "General Settings", notices });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
__name(handleOptionsGeneral, "handleOptionsGeneral");
function getTimezones() {
  return [
    "UTC",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Anchorage",
    "Pacific/Honolulu",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Europe/Moscow",
    "Asia/Dubai",
    "Asia/Kolkata",
    "Asia/Shanghai",
    "Asia/Seoul",
    "Asia/Tokyo",
    "Australia/Sydney",
    "Pacific/Auckland"
  ];
}
__name(getTimezones, "getTimezones");
function esc13(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(esc13, "esc");
function capitalize2(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
__name(capitalize2, "capitalize");

// cp-admin/pages/options-writing.js
init_option();
function esc14(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(esc14, "esc");
async function handleOptionsWriting(request, cp) {
  const method = request.method.toUpperCase();
  let notice = null;
  const keys = [
    "default_category",
    "default_post_format",
    "default_link_category",
    "mailserver_url",
    "mailserver_login",
    "mailserver_pass",
    "mailserver_port"
  ];
  if (method === "POST") {
    const fd = await request.formData().catch(() => new FormData());
    for (const key of keys) {
      const val = fd.get(key);
      if (val !== null)
        await updateOption(cp, key, val.trim());
    }
    notice = { type: "success", message: "Settings saved." };
  }
  const vals = {};
  for (const key of keys) {
    vals[key] = await getOption(cp, key, "").catch(() => "");
  }
  let categories = [];
  try {
    const prefix = cp.db_prefix || "cp_";
    const cats = await cp.db.prepare(
      `SELECT t.term_id, t.name FROM ${prefix}terms t
       JOIN ${prefix}term_taxonomy tt ON tt.term_id=t.term_id
       WHERE tt.taxonomy='category' ORDER BY t.name ASC`
    ).all();
    categories = cats.results || [];
  } catch (_) {
  }
  const catOptions = categories.map(
    (c) => `<option value="${esc14(c.term_id)}"${vals.default_category == c.term_id ? " selected" : ""}>${esc14(c.name)}</option>`
  ).join("");
  const formats = ["", "aside", "chat", "gallery", "link", "image", "quote", "status", "video", "audio"];
  const fmtOptions = formats.map(
    (f) => `<option value="${esc14(f)}"${vals.default_post_format === f ? " selected" : ""}>${f || "Standard"}</option>`
  ).join("");
  const content = `
<div class="cp-card" style="max-width:700px">
  <h1>Writing Settings</h1>
  <form method="post" style="margin-top:16px">
    <table style="width:100%;border-collapse:collapse">
      <tbody>

        <tr style="border-bottom:1px solid #eee">
          <th style="width:200px;text-align:left;padding:14px 0;font-weight:500;vertical-align:top">Default Post Category</th>
          <td style="padding:14px 0 14px 20px">
            <select name="default_category" style="padding:8px 10px;border:1px solid #ccc;border-radius:4px;background:#fff;min-width:200px">
              ${catOptions || '<option value="1">Uncategorized</option>'}
            </select>
          </td>
        </tr>

        <tr style="border-bottom:1px solid #eee">
          <th style="text-align:left;padding:14px 0;font-weight:500;vertical-align:top">Default Post Format</th>
          <td style="padding:14px 0 14px 20px">
            <select name="default_post_format" style="padding:8px 10px;border:1px solid #ccc;border-radius:4px;background:#fff;min-width:200px">
              ${fmtOptions}
            </select>
          </td>
        </tr>

        <tr>
          <td colspan="2" style="padding:20px 0 8px"><h3 style="margin:0">Post via Email</h3>
          <p style="color:#888;font-size:13px;margin:4px 0 0">CloudPress uses Cloudflare Email Workers for post-by-email. Configure your mail server below.</p></td>
        </tr>

        <tr style="border-bottom:1px solid #eee">
          <th style="text-align:left;padding:14px 0;font-weight:500">Mail Server</th>
          <td style="padding:14px 0 14px 20px">
            <input type="text" name="mailserver_url" value="${esc14(vals.mailserver_url)}" placeholder="mail.example.com"
                   style="padding:8px 10px;border:1px solid #ccc;border-radius:4px;width:220px">
            Port: <input type="number" name="mailserver_port" value="${esc14(vals.mailserver_port || "110")}"
                         style="padding:8px 10px;border:1px solid #ccc;border-radius:4px;width:70px">
          </td>
        </tr>

        <tr style="border-bottom:1px solid #eee">
          <th style="text-align:left;padding:14px 0;font-weight:500">Login Name</th>
          <td style="padding:14px 0 14px 20px">
            <input type="text" name="mailserver_login" value="${esc14(vals.mailserver_login)}"
                   style="padding:8px 10px;border:1px solid #ccc;border-radius:4px;width:220px">
          </td>
        </tr>

        <tr style="border-bottom:1px solid #eee">
          <th style="text-align:left;padding:14px 0;font-weight:500">Password</th>
          <td style="padding:14px 0 14px 20px">
            <input type="password" name="mailserver_pass" value="${esc14(vals.mailserver_pass)}"
                   style="padding:8px 10px;border:1px solid #ccc;border-radius:4px;width:220px">
          </td>
        </tr>

      </tbody>
    </table>
    <div style="margin-top:20px">
      <button type="submit" class="cp-btn">Save Changes</button>
    </div>
  </form>
</div>`;
  return new Response(
    await renderAdminShell(cp, content, { title: "Writing Settings", notices: notice ? [notice] : [] }),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
__name(handleOptionsWriting, "handleOptionsWriting");

// cp-admin/pages/options-reading.js
init_option();
function esc15(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(esc15, "esc");
async function handleOptionsReading(request, cp) {
  const method = request.method.toUpperCase();
  let notice = null;
  const prefix = cp.db_prefix || "cp_";
  const keys = ["show_on_front", "page_on_front", "page_for_posts", "posts_per_page", "posts_per_rss", "rss_use_excerpt", "blog_public"];
  if (method === "POST") {
    const fd = await request.formData().catch(() => new FormData());
    for (const key of keys) {
      const val = fd.get(key);
      if (val !== null)
        await updateOption(cp, key, val.trim());
    }
    await updateOption(cp, "blog_public", fd.get("blog_public") ? "1" : "0");
    await updateOption(cp, "rss_use_excerpt", fd.get("rss_use_excerpt") ? "1" : "0");
    notice = { type: "success", message: "Settings saved." };
  }
  const vals = {};
  for (const key of keys) {
    vals[key] = await getOption(cp, key, "").catch(() => "");
  }
  let pages = [];
  try {
    const res = await cp.db.prepare(
      `SELECT ID, post_title FROM ${prefix}posts WHERE post_type='page' AND post_status='publish' ORDER BY post_title ASC`
    ).all();
    pages = res.results || [];
  } catch (_) {
  }
  const pageOpts = /* @__PURE__ */ __name((selected) => pages.map(
    (p) => `<option value="${esc15(p.ID)}"${String(selected) === String(p.ID) ? " selected" : ""}>${esc15(p.post_title)}</option>`
  ).join(""), "pageOpts");
  const showOnFront = vals.show_on_front || "posts";
  const content = `
<div class="cp-card" style="max-width:700px">
  <h1>Reading Settings</h1>
  <form method="post" style="margin-top:16px">
    <table style="width:100%;border-collapse:collapse">
      <tbody>

        <tr style="border-bottom:1px solid #eee">
          <th style="width:200px;text-align:left;padding:14px 0;font-weight:500;vertical-align:top">Your homepage displays</th>
          <td style="padding:14px 0 14px 20px">
            <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
              <input type="radio" name="show_on_front" value="posts" ${showOnFront === "posts" ? "checked" : ""}>
              Your latest posts
            </label>
            <label style="display:flex;align-items:center;gap:8px">
              <input type="radio" name="show_on_front" value="page" ${showOnFront === "page" ? "checked" : ""}>
              A static page
            </label>
            <div style="margin-top:10px;padding-left:24px;display:grid;gap:8px">
              <div>
                <label style="font-size:13px;color:#555">Homepage: </label>
                <select name="page_on_front" style="padding:6px 8px;border:1px solid #ccc;border-radius:4px;background:#fff">
                  <option value="">-- Select --</option>
                  ${pageOpts(vals.page_on_front)}
                </select>
              </div>
              <div>
                <label style="font-size:13px;color:#555">Posts page: </label>
                <select name="page_for_posts" style="padding:6px 8px;border:1px solid #ccc;border-radius:4px;background:#fff">
                  <option value="">-- Select --</option>
                  ${pageOpts(vals.page_for_posts)}
                </select>
              </div>
            </div>
          </td>
        </tr>

        <tr style="border-bottom:1px solid #eee">
          <th style="text-align:left;padding:14px 0;font-weight:500">Blog pages show at most</th>
          <td style="padding:14px 0 14px 20px">
            <input type="number" name="posts_per_page" value="${esc15(vals.posts_per_page || "10")}" min="1" max="100"
                   style="padding:8px 10px;border:1px solid #ccc;border-radius:4px;width:70px"> posts
          </td>
        </tr>

        <tr style="border-bottom:1px solid #eee">
          <th style="text-align:left;padding:14px 0;font-weight:500">Syndication feeds show the most recent</th>
          <td style="padding:14px 0 14px 20px">
            <input type="number" name="posts_per_rss" value="${esc15(vals.posts_per_rss || "10")}" min="1" max="100"
                   style="padding:8px 10px;border:1px solid #ccc;border-radius:4px;width:70px"> items
          </td>
        </tr>

        <tr style="border-bottom:1px solid #eee">
          <th style="text-align:left;padding:14px 0;font-weight:500;vertical-align:top">For each post in a feed, include</th>
          <td style="padding:14px 0 14px 20px">
            <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <input type="radio" name="rss_use_excerpt" value="0" ${vals.rss_use_excerpt === "0" || !vals.rss_use_excerpt ? "checked" : ""}>
              Full text
            </label>
            <label style="display:flex;align-items:center;gap:8px">
              <input type="radio" name="rss_use_excerpt" value="1" ${vals.rss_use_excerpt === "1" ? "checked" : ""}>
              Excerpt
            </label>
          </td>
        </tr>

        <tr>
          <th style="text-align:left;padding:14px 0;font-weight:500;vertical-align:top">Search engine visibility</th>
          <td style="padding:14px 0 14px 20px">
            <label style="display:flex;align-items:flex-start;gap:8px">
              <input type="checkbox" name="blog_public" value="0" ${vals.blog_public === "0" ? "checked" : ""} style="margin-top:3px">
              <span>Discourage search engines from indexing this site
                <span style="display:block;color:#888;font-size:12px;margin-top:2px">It is up to search engines to honor this request.</span>
              </span>
            </label>
          </td>
        </tr>

      </tbody>
    </table>
    <div style="margin-top:20px">
      <button type="submit" class="cp-btn">Save Changes</button>
    </div>
  </form>
</div>`;
  return new Response(
    await renderAdminShell(cp, content, { title: "Reading Settings", notices: notice ? [notice] : [] }),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
__name(handleOptionsReading, "handleOptionsReading");

// cp-admin/pages/options-discussion.js
init_option();
function esc16(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(esc16, "esc");
var KEYS_DISCUSSION = [
  "default_pingback_flag",
  "default_ping_status",
  "default_comment_status",
  "require_name_email",
  "comment_registration",
  "close_comments_for_old_posts",
  "close_comments_days_old",
  "thread_comments",
  "thread_comments_depth",
  "page_comments",
  "comments_per_page",
  "default_comments_page",
  "comment_order",
  "comments_notify",
  "moderation_notify",
  "comment_moderation",
  "comment_previously_approved",
  "comment_max_links",
  "moderation_keys",
  "disallowed_keys",
  "show_avatars",
  "avatar_rating",
  "avatar_default"
];
var CHECKBOX_KEYS = [
  "default_pingback_flag",
  "default_ping_status",
  "default_comment_status",
  "require_name_email",
  "comment_registration",
  "close_comments_for_old_posts",
  "thread_comments",
  "page_comments",
  "comments_notify",
  "moderation_notify",
  "comment_moderation",
  "comment_previously_approved",
  "show_avatars"
];
async function handleOptionsDiscussion(request, cp) {
  const method = request.method.toUpperCase();
  let notice = null;
  if (method === "POST") {
    const fd = await request.formData().catch(() => new FormData());
    for (const key of KEYS_DISCUSSION) {
      if (CHECKBOX_KEYS.includes(key)) {
        await updateOption(cp, key, fd.get(key) ? "1" : "0");
      } else {
        const val = fd.get(key);
        if (val !== null)
          await updateOption(cp, key, val.trim());
      }
    }
    notice = { type: "success", message: "Settings saved." };
  }
  const v = {};
  for (const key of KEYS_DISCUSSION) {
    v[key] = await getOption(cp, key, "").catch(() => "");
  }
  function chk(key) {
    return v[key] === "1" ? "checked" : "";
  }
  __name(chk, "chk");
  const content = `
<div class="cp-card" style="max-width:720px">
  <h1>Discussion Settings</h1>
  <form method="post" style="margin-top:16px">

    <h2 style="font-size:16px;border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:0">Default post settings</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr style="border-bottom:1px solid #eee"><td style="padding:12px 0">
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="default_pingback_flag" value="1" ${chk("default_pingback_flag")}> Attempt to notify any blogs linked to from the article</label>
      </td></tr>
      <tr style="border-bottom:1px solid #eee"><td style="padding:12px 0">
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="default_ping_status" value="1" ${chk("default_ping_status")}> Allow link notifications from other blogs (pingbacks and trackbacks) on new posts</label>
      </td></tr>
      <tr><td style="padding:12px 0">
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="default_comment_status" value="1" ${chk("default_comment_status")}> Allow people to submit comments on new posts</label>
      </td></tr>
    </table>

    <h2 style="font-size:16px;border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:0">Other comment settings</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr style="border-bottom:1px solid #eee"><td style="padding:12px 0">
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="require_name_email" value="1" ${chk("require_name_email")}> Comment author must fill out name and email</label>
      </td></tr>
      <tr style="border-bottom:1px solid #eee"><td style="padding:12px 0">
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="comment_registration" value="1" ${chk("comment_registration")}> Users must be registered and logged in to comment</label>
      </td></tr>
      <tr style="border-bottom:1px solid #eee"><td style="padding:12px 0">
        <label style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" name="close_comments_for_old_posts" value="1" ${chk("close_comments_for_old_posts")}>
          Automatically close comments on posts older than
          <input type="number" name="close_comments_days_old" value="${esc16(v.close_comments_days_old || "14")}" min="1" style="width:60px;padding:4px 6px;border:1px solid #ccc;border-radius:4px;margin:0 4px"> days
        </label>
      </td></tr>
      <tr style="border-bottom:1px solid #eee"><td style="padding:12px 0">
        <label style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" name="thread_comments" value="1" ${chk("thread_comments")}>
          Enable threaded (nested) comments
          <input type="number" name="thread_comments_depth" value="${esc16(v.thread_comments_depth || "5")}" min="2" max="10" style="width:50px;padding:4px 6px;border:1px solid #ccc;border-radius:4px;margin:0 4px"> levels deep
        </label>
      </td></tr>
      <tr><td style="padding:12px 0">
        <label style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" name="page_comments" value="1" ${chk("page_comments")}>
          Break comments into pages with
          <input type="number" name="comments_per_page" value="${esc16(v.comments_per_page || "50")}" min="1" style="width:60px;padding:4px 6px;border:1px solid #ccc;border-radius:4px;margin:0 4px"> comments per page
        </label>
      </td></tr>
    </table>

    <h2 style="font-size:16px;border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:0">Email me whenever</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr style="border-bottom:1px solid #eee"><td style="padding:12px 0">
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="comments_notify" value="1" ${chk("comments_notify")}> Anyone posts a comment</label>
      </td></tr>
      <tr><td style="padding:12px 0">
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="moderation_notify" value="1" ${chk("moderation_notify")}> A comment is held for moderation</label>
      </td></tr>
    </table>

    <h2 style="font-size:16px;border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:0">Before a comment appears</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr style="border-bottom:1px solid #eee"><td style="padding:12px 0">
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="comment_moderation" value="1" ${chk("comment_moderation")}> Comment must be manually approved</label>
      </td></tr>
      <tr><td style="padding:12px 0">
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="comment_previously_approved" value="1" ${chk("comment_previously_approved")}> Comment author must have a previously approved comment</label>
      </td></tr>
    </table>

    <h2 style="font-size:16px;border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:0">Comment Moderation</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr><td style="padding:12px 0">
        <label style="display:block;margin-bottom:6px">Hold a comment if it contains
          <input type="number" name="comment_max_links" value="${esc16(v.comment_max_links || "2")}" min="0" style="width:55px;padding:4px 6px;border:1px solid #ccc;border-radius:4px;margin:0 4px"> or more links
        </label>
        <label style="display:block;margin-bottom:4px;font-weight:500;margin-top:10px">Comment blocklist</label>
        <textarea name="disallowed_keys" rows="5" style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;resize:vertical;font-size:12px">${esc16(v.disallowed_keys)}</textarea>
        <p style="color:#888;font-size:12px;margin:4px 0 0">One word or IP per line. Comments containing these will be blocked.</p>
      </td></tr>
    </table>

    <h2 style="font-size:16px;border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:0">Avatars</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr style="border-bottom:1px solid #eee"><td style="padding:12px 0">
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="show_avatars" value="1" ${chk("show_avatars")}> Show Avatars</label>
      </td></tr>
    </table>

    <div><button type="submit" class="cp-btn">Save Changes</button></div>
  </form>
</div>`;
  return new Response(
    await renderAdminShell(cp, content, { title: "Discussion Settings", notices: notice ? [notice] : [] }),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
__name(handleOptionsDiscussion, "handleOptionsDiscussion");

// cp-admin/pages/options-media.js
init_option();
function esc17(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(esc17, "esc");
var KEYS_MEDIA = [
  "thumbnail_size_w",
  "thumbnail_size_h",
  "thumbnail_crop",
  "medium_size_w",
  "medium_size_h",
  "large_size_w",
  "large_size_h",
  "uploads_use_yearmonth_folders"
];
async function handleOptionsMedia(request, cp) {
  const method = request.method.toUpperCase();
  let notice = null;
  if (method === "POST") {
    const fd = await request.formData().catch(() => new FormData());
    for (const key of KEYS_MEDIA) {
      if (key === "thumbnail_crop" || key === "uploads_use_yearmonth_folders") {
        await updateOption(cp, key, fd.get(key) ? "1" : "0");
      } else {
        const val = fd.get(key);
        if (val !== null)
          await updateOption(cp, key, val.trim());
      }
    }
    notice = { type: "success", message: "Settings saved." };
  }
  const v = {};
  for (const key of KEYS_MEDIA) {
    v[key] = await getOption(cp, key, "").catch(() => "");
  }
  const content = `
<div class="cp-card" style="max-width:680px">
  <h1>Media Settings</h1>
  <form method="post" style="margin-top:16px">

    <h2 style="font-size:16px;border-bottom:1px solid #eee;padding-bottom:8px">Image sizes</h2>
    <p style="color:#888;font-size:13px;margin:-4px 0 16px">Note: CloudPress stores files in KV. Resize operations are performed at upload time.</p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">

      <tr style="border-bottom:1px solid #eee">
        <th style="text-align:left;padding:14px 0;font-weight:500;width:180px;vertical-align:top">Thumbnail size</th>
        <td style="padding:14px 0 14px 20px">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            Width <input type="number" name="thumbnail_size_w" value="${esc17(v.thumbnail_size_w || "150")}" min="0"
                         style="width:70px;padding:6px 8px;border:1px solid #ccc;border-radius:4px">
            Height <input type="number" name="thumbnail_size_h" value="${esc17(v.thumbnail_size_h || "150")}" min="0"
                          style="width:70px;padding:6px 8px;border:1px solid #ccc;border-radius:4px">
          </div>
          <label style="display:flex;align-items:center;gap:8px;margin-top:8px">
            <input type="checkbox" name="thumbnail_crop" value="1" ${v.thumbnail_crop === "1" ? "checked" : ""}>
            Crop thumbnail to exact dimensions
          </label>
        </td>
      </tr>

      <tr style="border-bottom:1px solid #eee">
        <th style="text-align:left;padding:14px 0;font-weight:500;vertical-align:top">Medium size</th>
        <td style="padding:14px 0 14px 20px">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            Max Width <input type="number" name="medium_size_w" value="${esc17(v.medium_size_w || "300")}" min="0"
                             style="width:70px;padding:6px 8px;border:1px solid #ccc;border-radius:4px">
            Max Height <input type="number" name="medium_size_h" value="${esc17(v.medium_size_h || "300")}" min="0"
                              style="width:70px;padding:6px 8px;border:1px solid #ccc;border-radius:4px">
          </div>
        </td>
      </tr>

      <tr>
        <th style="text-align:left;padding:14px 0;font-weight:500;vertical-align:top">Large size</th>
        <td style="padding:14px 0 14px 20px">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            Max Width <input type="number" name="large_size_w" value="${esc17(v.large_size_w || "1024")}" min="0"
                             style="width:70px;padding:6px 8px;border:1px solid #ccc;border-radius:4px">
            Max Height <input type="number" name="large_size_h" value="${esc17(v.large_size_h || "1024")}" min="0"
                              style="width:70px;padding:6px 8px;border:1px solid #ccc;border-radius:4px">
          </div>
        </td>
      </tr>

    </table>

    <h2 style="font-size:16px;border-bottom:1px solid #eee;padding-bottom:8px">Uploading Files</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr><td style="padding:12px 0">
        <label style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" name="uploads_use_yearmonth_folders" value="1" ${v.uploads_use_yearmonth_folders !== "0" ? "checked" : ""}>
          Organize my uploads into month- and year-based folders
        </label>
        <p style="color:#888;font-size:12px;margin:6px 0 0">Files stored in KV with keys like <code>cp:media:2024/01/filename.jpg</code></p>
      </td></tr>
    </table>

    <div><button type="submit" class="cp-btn">Save Changes</button></div>
  </form>
</div>`;
  return new Response(
    await renderAdminShell(cp, content, { title: "Media Settings", notices: notice ? [notice] : [] }),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
__name(handleOptionsMedia, "handleOptionsMedia");

// cp-admin/pages/options-permalink.js
init_option();
function esc18(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(esc18, "esc");
async function handleOptionsPermalink(request, cp) {
  const method = request.method.toUpperCase();
  let notice = null;
  if (method === "POST") {
    const fd = await request.formData().catch(() => new FormData());
    let structure = (fd.get("permalink_structure") || "").trim();
    if (fd.get("selection") === "custom") {
      structure = (fd.get("custom_structure") || "").trim();
    }
    await updateOption(cp, "permalink_structure", structure);
    await updateOption(cp, "category_base", (fd.get("category_base") || "").trim());
    await updateOption(cp, "tag_base", (fd.get("tag_base") || "").trim());
    notice = { type: "success", message: "Permalink structure saved." };
  }
  const current = await getOption(cp, "permalink_structure", "/%year%/%monthnum%/%postname%/").catch(() => "/%year%/%monthnum%/%postname%/");
  const catBase = await getOption(cp, "category_base", "").catch(() => "");
  const tagBase = await getOption(cp, "tag_base", "").catch(() => "");
  const structures = [
    { label: "Plain", value: "", example: "/?p=123" },
    { label: "Day and name", value: "/%year%/%monthnum%/%day%/%postname%/", example: "/2024/01/01/sample-post/" },
    { label: "Month and name", value: "/%year%/%monthnum%/%postname%/", example: "/2024/01/sample-post/" },
    { label: "Numeric", value: "/archives/%post_id%", example: "/archives/123" },
    { label: "Post name", value: "/%postname%/", example: "/sample-post/" }
  ];
  const isCustom = !structures.find((s) => s.value === current);
  const rows = structures.map((s) => `
  <tr style="border-bottom:1px solid #f0f0f0">
    <td style="padding:10px 0">
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
        <input type="radio" name="selection" value="${esc18(s.value)}"
               ${current === s.value && !isCustom ? "checked" : ""} style="margin:0"
               onchange="document.getElementById('permalink_structure').value='${esc18(s.value)}'">
        <span style="font-weight:500;min-width:160px">${esc18(s.label)}</span>
        <code style="background:#f5f5f5;padding:2px 8px;border-radius:3px;font-size:13px">${esc18(s.example)}</code>
      </label>
    </td>
  </tr>`).join("");
  const content = `
<div class="cp-card" style="max-width:720px">
  <h1>Permalink Settings</h1>
  <p style="color:#666;margin-bottom:8px">CloudPress uses the URL structure to route requests via the Worker. Choose a structure that works for your site.</p>

  <form method="post" style="margin-top:16px">
    <input type="hidden" name="permalink_structure" id="permalink_structure" value="${esc18(current)}">

    <h2 style="font-size:16px;border-bottom:1px solid #eee;padding-bottom:8px">Common settings</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      ${rows}
      <tr>
        <td style="padding:10px 0">
          <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer">
            <input type="radio" name="selection" value="custom" ${isCustom ? "checked" : ""} style="margin:3px 0 0"
                   onchange="document.getElementById('permalink_structure').value=document.getElementById('custom_structure').value">
            <span>
              <span style="font-weight:500;display:block;margin-bottom:6px">Custom Structure</span>
              <input type="text" id="custom_structure" name="custom_structure"
                     value="${esc18(isCustom ? current : "")}"
                     placeholder="/%year%/%monthnum%/%postname%/"
                     style="width:360px;padding:8px 10px;border:1px solid #ccc;border-radius:4px"
                     oninput="document.querySelector('[name=selection][value=custom]').checked=true;document.getElementById('permalink_structure').value=this.value">
              <p style="color:#888;font-size:12px;margin:4px 0 0">Tags: %year% %monthnum% %day% %hour% %minute% %second% %post_id% %postname% %category% %author%</p>
            </span>
          </label>
        </td>
      </tr>
    </table>

    <h2 style="font-size:16px;border-bottom:1px solid #eee;padding-bottom:8px">Optional</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr style="border-bottom:1px solid #f0f0f0">
        <th style="text-align:left;padding:12px 0;font-weight:500;width:180px">Category base</th>
        <td style="padding:12px 0 12px 20px">
          <span style="color:#888;margin-right:4px">${esc18(cp.config?.SITE_URL || cp.url?.origin || "")}/</span>
          <input type="text" name="category_base" value="${esc18(catBase)}" placeholder="category"
                 style="padding:6px 10px;border:1px solid #ccc;border-radius:4px;width:200px">
        </td>
      </tr>
      <tr>
        <th style="text-align:left;padding:12px 0;font-weight:500">Tag base</th>
        <td style="padding:12px 0 12px 20px">
          <span style="color:#888;margin-right:4px">${esc18(cp.config?.SITE_URL || cp.url?.origin || "")}/</span>
          <input type="text" name="tag_base" value="${esc18(tagBase)}" placeholder="tag"
                 style="padding:6px 10px;border:1px solid #ccc;border-radius:4px;width:200px">
        </td>
      </tr>
    </table>

    <div><button type="submit" class="cp-btn">Save Changes</button></div>
  </form>
</div>`;
  return new Response(
    await renderAdminShell(cp, content, { title: "Permalink Settings", notices: notice ? [notice] : [] }),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
__name(handleOptionsPermalink, "handleOptionsPermalink");

// cp-admin/pages/import.js
init_crypto();
function esc19(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(esc19, "esc");
async function handleImport(request, cp) {
  const method = request.method.toUpperCase();
  const prefix = cp.db_prefix || "cp_";
  let notice = null;
  let importLog = null;
  if (method === "POST") {
    const fd = await request.formData().catch(() => new FormData());
    const action = fd.get("action") || "";
    if (action === "import_wxr") {
      const file = fd.get("wxr_file");
      if (!file || !file.name) {
        notice = { type: "error", message: "Please select a WordPress XML (.xml) export file." };
      } else {
        try {
          const text = await file.text();
          const result = await importWXR(cp, prefix, text);
          importLog = result;
          notice = { type: "success", message: `Import complete: ${result.posts} posts, ${result.pages} pages, ${result.users} users imported.` };
        } catch (e) {
          notice = { type: "error", message: `Import failed: ${e.message}` };
        }
      }
    }
    if (action === "import_json") {
      const file = fd.get("json_file");
      if (!file || !file.name) {
        notice = { type: "error", message: "Please select a CloudPress JSON export file." };
      } else {
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          let posts = 0, users = 0;
          const now = (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 19);
          if (Array.isArray(data.posts)) {
            for (const p of data.posts) {
              await cp.db.prepare(
                `INSERT OR IGNORE INTO ${prefix}posts (post_title,post_content,post_status,post_type,post_date,post_modified,post_author,post_name)
                 VALUES (?,?,?,?,?,?,?,?)`
              ).bind(
                p.post_title || "",
                p.post_content || "",
                p.post_status || "draft",
                p.post_type || "post",
                p.post_date || now,
                p.post_modified || now,
                1,
                p.post_name || ""
              ).run();
              posts++;
            }
          }
          if (Array.isArray(data.users)) {
            for (const u of data.users) {
              const hash = await hashPassword(Math.random().toString(36).slice(2));
              await cp.db.prepare(
                `INSERT OR IGNORE INTO ${prefix}users (user_login,user_pass,user_email,user_registered,user_status,display_name)
                 VALUES (?,?,?,?,0,?)`
              ).bind(u.user_login || "", hash, u.user_email || "", now, u.display_name || u.user_login || "").run();
              users++;
            }
          }
          notice = { type: "success", message: `JSON import complete: ${posts} posts, ${users} users.` };
        } catch (e) {
          notice = { type: "error", message: `JSON import failed: ${e.message}` };
        }
      }
    }
  }
  const content = `
<div class="cp-card" style="max-width:720px">
  <h1>Import</h1>
  <p style="color:#666;margin-bottom:24px">Import content from another site into CloudPress.</p>

  <!-- WordPress XML Import -->
  <div style="border:1px solid #ddd;border-radius:8px;padding:20px;margin-bottom:20px">
    <h2 style="margin:0 0 8px;font-size:18px">&#128196; WordPress (WXR)</h2>
    <p style="color:#666;font-size:14px;margin:0 0 16px">Import posts, pages, comments, categories, tags, and users from a WordPress XML export file.</p>
    <form method="post" enctype="multipart/form-data">
      <input type="hidden" name="action" value="import_wxr">
      <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <label style="display:block;margin-bottom:4px;font-weight:500">Choose WordPress export file (.xml)</label>
          <input type="file" name="wxr_file" accept=".xml,text/xml" required
                 style="display:block;width:100%;padding:8px;border:2px dashed #ccc;border-radius:4px;cursor:pointer;box-sizing:border-box">
        </div>
        <button type="submit" class="cp-btn">Import</button>
      </div>
    </form>
  </div>

  <!-- CloudPress JSON Import -->
  <div style="border:1px solid #ddd;border-radius:8px;padding:20px;margin-bottom:20px">
    <h2 style="margin:0 0 8px;font-size:18px">&#128196; CloudPress JSON</h2>
    <p style="color:#666;font-size:14px;margin:0 0 16px">Import from a CloudPress JSON export file (generated by the Export tool).</p>
    <form method="post" enctype="multipart/form-data">
      <input type="hidden" name="action" value="import_json">
      <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <label style="display:block;margin-bottom:4px;font-weight:500">Choose CloudPress export file (.json)</label>
          <input type="file" name="json_file" accept=".json,application/json" required
                 style="display:block;width:100%;padding:8px;border:2px dashed #ccc;border-radius:4px;cursor:pointer;box-sizing:border-box">
        </div>
        <button type="submit" class="cp-btn">Import</button>
      </div>
    </form>
  </div>

  ${importLog ? `
  <div style="background:#f5f5f5;border-radius:6px;padding:16px;margin-top:16px;font-family:monospace;font-size:13px">
    <strong>Import Summary</strong><br>
    Posts: ${importLog.posts ?? 0}<br>
    Pages: ${importLog.pages ?? 0}<br>
    Users: ${importLog.users ?? 0}<br>
    Comments: ${importLog.comments ?? 0}<br>
    Categories: ${importLog.categories ?? 0}<br>
    Tags: ${importLog.tags ?? 0}<br>
    Errors: ${(importLog.errors || []).length}
    ${importLog.errors?.length ? `<br><span style="color:#c00">Errors:<br>${importLog.errors.map((e) => esc19(e)).join("<br>")}</span>` : ""}
  </div>` : ""}
</div>`;
  return new Response(
    await renderAdminShell(cp, content, { title: "Import", notices: notice ? [notice] : [] }),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
__name(handleImport, "handleImport");
async function importWXR(cp, prefix, xml) {
  const log = { posts: 0, pages: 0, users: 0, comments: 0, categories: 0, tags: 0, errors: [] };
  const now = (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 19);
  function extractTag(str, tag) {
    const m = str.match(new RegExp(`<${tag}(?:[^>]*)><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}(?:[^>]*)>([\\s\\S]*?)</${tag}>`, "i"));
    return m ? (m[1] ?? m[2] ?? "").trim() : "";
  }
  __name(extractTag, "extractTag");
  const catMatches = xml.matchAll(/<wp:category>([\s\S]*?)<\/wp:category>/g);
  for (const m of catMatches) {
    try {
      const name = extractTag(m[1], "wp:cat_name");
      const slug = extractTag(m[1], "wp:category_nicename");
      if (name) {
        await cp.db.prepare(`INSERT OR IGNORE INTO ${prefix}terms (name,slug,term_group) VALUES (?,?,0)`).bind(name, slug || name.toLowerCase().replace(/\s+/g, "-")).run();
        const term = await cp.db.prepare(`SELECT term_id FROM ${prefix}terms WHERE slug=? LIMIT 1`).bind(slug || name).first();
        if (term) {
          await cp.db.prepare(`INSERT OR IGNORE INTO ${prefix}term_taxonomy (term_id,taxonomy,description,parent,count) VALUES (?,?,?,?,0)`).bind(term.term_id, "category", "", 0).run();
        }
        log.categories++;
      }
    } catch (e) {
      log.errors.push(`Category: ${e.message}`);
    }
  }
  const tagMatches = xml.matchAll(/<wp:tag>([\s\S]*?)<\/wp:tag>/g);
  for (const m of tagMatches) {
    try {
      const name = extractTag(m[1], "wp:tag_name");
      const slug = extractTag(m[1], "wp:tag_slug");
      if (name) {
        await cp.db.prepare(`INSERT OR IGNORE INTO ${prefix}terms (name,slug,term_group) VALUES (?,?,0)`).bind(name, slug || name.toLowerCase().replace(/\s+/g, "-")).run();
        const term = await cp.db.prepare(`SELECT term_id FROM ${prefix}terms WHERE slug=? LIMIT 1`).bind(slug || name).first();
        if (term) {
          await cp.db.prepare(`INSERT OR IGNORE INTO ${prefix}term_taxonomy (term_id,taxonomy,description,parent,count) VALUES (?,?,?,?,0)`).bind(term.term_id, "post_tag", "", 0).run();
        }
        log.tags++;
      }
    } catch (e) {
      log.errors.push(`Tag: ${e.message}`);
    }
  }
  const authorMatches = xml.matchAll(/<wp:author>([\s\S]*?)<\/wp:author>/g);
  for (const m of authorMatches) {
    try {
      const login = extractTag(m[1], "wp:author_login");
      const email = extractTag(m[1], "wp:author_email");
      const name = extractTag(m[1], "wp:author_display_name") || login;
      if (login) {
        const hash = await hashPassword(Math.random().toString(36).slice(2) + Date.now());
        await cp.db.prepare(
          `INSERT OR IGNORE INTO ${prefix}users (user_login,user_pass,user_email,user_registered,user_status,display_name)
           VALUES (?,?,?,?,0,?)`
        ).bind(login, hash, email, now, name).run();
        log.users++;
      }
    } catch (e) {
      log.errors.push(`Author: ${e.message}`);
    }
  }
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
  for (const m of itemMatches) {
    try {
      const itemXml = m[1];
      const title = extractTag(itemXml, "title");
      const content = extractTag(itemXml, "content:encoded");
      const excerpt = extractTag(itemXml, "excerpt:encoded");
      const status = extractTag(itemXml, "wp:status");
      const postType = extractTag(itemXml, "wp:post_type");
      const postName = extractTag(itemXml, "wp:post_name");
      const postDate = (extractTag(itemXml, "wp:post_date") || now).replace("T", " ").slice(0, 19);
      const authorLogin = extractTag(itemXml, "dc:creator");
      if (postType === "attachment" || postType === "nav_menu_item")
        continue;
      let authorId = 1;
      if (authorLogin) {
        const au = await cp.db.prepare(`SELECT ID FROM ${prefix}users WHERE user_login=? LIMIT 1`).bind(authorLogin).first();
        if (au)
          authorId = au.ID;
      }
      const res = await cp.db.prepare(
        `INSERT INTO ${prefix}posts
           (post_title,post_content,post_excerpt,post_status,post_type,post_name,post_date,post_modified,post_author,comment_status,ping_status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(title, content, excerpt, status || "draft", postType || "post", postName || "", postDate, postDate, authorId, "open", "open").run();
      const newPostId = res.meta?.last_row_id;
      if (postType === "page")
        log.pages++;
      else
        log.posts++;
      if (newPostId) {
        const commentMatches = itemXml.matchAll(/<wp:comment>([\s\S]*?)<\/wp:comment>/g);
        for (const cm of commentMatches) {
          try {
            const cx = cm[1];
            await cp.db.prepare(
              `INSERT INTO ${prefix}comments
                 (comment_post_ID,comment_author,comment_author_email,comment_author_url,comment_content,comment_date,comment_approved)
               VALUES (?,?,?,?,?,?,?)`
            ).bind(
              newPostId,
              extractTag(cx, "wp:comment_author"),
              extractTag(cx, "wp:comment_author_email"),
              extractTag(cx, "wp:comment_author_url"),
              extractTag(cx, "wp:comment_content"),
              (extractTag(cx, "wp:comment_date") || now).slice(0, 19),
              extractTag(cx, "wp:comment_approved") || "1"
            ).run();
            log.comments++;
          } catch (e) {
            log.errors.push(`Comment: ${e.message}`);
          }
        }
      }
    } catch (e) {
      log.errors.push(`Item: ${e.message}`);
    }
  }
  return log;
}
__name(importWXR, "importWXR");

// cp-admin/pages/export.js
function escXml3(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
__name(escXml3, "escXml");
function cdata(str) {
  return `<![CDATA[${String(str ?? "")}]]>`;
}
__name(cdata, "cdata");
async function handleExport(request, cp) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") || "";
  const prefix = cp.db_prefix || "cp_";
  if (format === "json" || format === "wxr") {
    const postType = url.searchParams.get("post_type") || "all";
    const status = url.searchParams.get("status") || "all";
    const conditions = [];
    const params = [];
    if (postType !== "all") {
      conditions.push(`post_type=?`);
      params.push(postType);
    } else {
      conditions.push(`post_type IN ('post','page')`);
    }
    if (status !== "all") {
      conditions.push(`post_status=?`);
      params.push(status);
    } else {
      conditions.push(`post_status != 'trash'`);
    }
    const where = `WHERE ${conditions.join(" AND ")}`;
    const posts = await cp.db.prepare(
      `SELECT p.*, u.user_login as author_login, u.user_email as author_email, u.display_name as author_display
       FROM ${prefix}posts p
       LEFT JOIN ${prefix}users u ON u.ID = p.post_author
       ${where} ORDER BY p.post_date ASC`
    ).bind(...params).all();
    const allPosts = posts.results || [];
    const postIds = allPosts.map((p) => p.ID);
    let allComments = [];
    if (postIds.length) {
      const placeholders = postIds.map(() => "?").join(",");
      const cRes = await cp.db.prepare(
        `SELECT * FROM ${prefix}comments WHERE comment_post_ID IN (${placeholders}) ORDER BY comment_date ASC`
      ).bind(...postIds).all();
      allComments = cRes.results || [];
    }
    const userRes = await cp.db.prepare(`SELECT ID, user_login, user_email, display_name, user_registered FROM ${prefix}users`).all();
    const users = userRes.results || [];
    const termRes = await cp.db.prepare(
      `SELECT t.term_id, t.name, t.slug, tt.taxonomy
       FROM ${prefix}terms t JOIN ${prefix}term_taxonomy tt ON tt.term_id=t.term_id`
    ).all();
    const terms = termRes.results || [];
    const siteUrl = cp.config?.SITE_URL || cp.url?.origin || "";
    const siteName = cp.config?.SITE_NAME || "CloudPress Site";
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if (format === "json") {
      const data = { exported_at: now, site_url: siteUrl, site_name: siteName, posts: allPosts, users, terms, comments: allComments };
      return new Response(JSON.stringify(data, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="cloudpress-export-${now.slice(0, 10)}.json"`
        }
      });
    }
    const commentsById = {};
    for (const c of allComments) {
      const pid = c.comment_post_ID;
      if (!commentsById[pid])
        commentsById[pid] = [];
      commentsById[pid].push(c);
    }
    const userXml = users.map((u) => `
    <wp:author>
      <wp:author_id>${u.ID}</wp:author_id>
      <wp:author_login>${cdata(u.user_login)}</wp:author_login>
      <wp:author_email>${cdata(u.user_email)}</wp:author_email>
      <wp:author_display_name>${cdata(u.display_name)}</wp:author_display_name>
    </wp:author>`).join("");
    const catXml = terms.filter((t) => t.taxonomy === "category").map((t) => `
    <wp:category>
      <wp:term_id>${t.term_id}</wp:term_id>
      <wp:category_nicename>${cdata(t.slug)}</wp:category_nicename>
      <wp:cat_name>${cdata(t.name)}</wp:cat_name>
    </wp:category>`).join("");
    const tagXml = terms.filter((t) => t.taxonomy === "post_tag").map((t) => `
    <wp:tag>
      <wp:term_id>${t.term_id}</wp:term_id>
      <wp:tag_slug>${cdata(t.slug)}</wp:tag_slug>
      <wp:tag_name>${cdata(t.name)}</wp:tag_name>
    </wp:tag>`).join("");
    const itemsXml = allPosts.map((p) => {
      const comments = (commentsById[p.ID] || []).map((c) => `
        <wp:comment>
          <wp:comment_id>${c.comment_ID}</wp:comment_id>
          <wp:comment_author>${cdata(c.comment_author)}</wp:comment_author>
          <wp:comment_author_email>${cdata(c.comment_author_email)}</wp:comment_author_email>
          <wp:comment_author_url>${cdata(c.comment_author_url)}</wp:comment_author_url>
          <wp:comment_date>${cdata(c.comment_date)}</wp:comment_date>
          <wp:comment_content>${cdata(c.comment_content)}</wp:comment_content>
          <wp:comment_approved>${cdata(c.comment_approved)}</wp:comment_approved>
        </wp:comment>`).join("");
      return `
    <item>
      <title>${cdata(p.post_title)}</title>
      <link>${escXml3(siteUrl)}/?p=${p.ID}</link>
      <pubDate>${new Date(p.post_date).toUTCString()}</pubDate>
      <dc:creator>${cdata(p.author_login)}</dc:creator>
      <content:encoded>${cdata(p.post_content)}</content:encoded>
      <excerpt:encoded>${cdata(p.post_excerpt)}</excerpt:encoded>
      <wp:post_id>${p.ID}</wp:post_id>
      <wp:post_date>${cdata(p.post_date)}</wp:post_date>
      <wp:post_modified>${cdata(p.post_modified)}</wp:post_modified>
      <wp:comment_status>${cdata(p.comment_status)}</wp:comment_status>
      <wp:ping_status>${cdata(p.ping_status)}</wp:ping_status>
      <wp:post_name>${cdata(p.post_name)}</wp:post_name>
      <wp:status>${cdata(p.post_status)}</wp:status>
      <wp:post_type>${cdata(p.post_type)}</wp:post_type>
      ${comments}
    </item>`;
    }).join("");
    const wxr = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:wfw="http://wellformedweb.org/CommentAPI/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:wp="http://wordpress.org/export/1.2/">
  <channel>
    <title>${cdata(siteName)}</title>
    <link>${escXml3(siteUrl)}</link>
    <description></description>
    <pubDate>${(/* @__PURE__ */ new Date()).toUTCString()}</pubDate>
    <language>ko-KR</language>
    <wp:wxr_version>1.2</wp:wxr_version>
    <wp:base_site_url>${escXml3(siteUrl)}</wp:base_site_url>
    <wp:base_blog_url>${escXml3(siteUrl)}</wp:base_blog_url>
    ${userXml}${catXml}${tagXml}${itemsXml}
  </channel>
</rss>`;
    return new Response(wxr, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="cloudpress-export-${now.slice(0, 10)}.xml"`
      }
    });
  }
  const content = `
<div class="cp-card" style="max-width:640px">
  <h1>Export</h1>
  <p style="color:#666;margin-bottom:20px">Export your content in CloudPress JSON or WordPress WXR (XML) format.</p>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">

    <!-- JSON Export -->
    <div style="border:1px solid #ddd;border-radius:8px;padding:20px">
      <h2 style="margin:0 0 8px;font-size:17px">&#128196; CloudPress JSON</h2>
      <p style="color:#666;font-size:13px;margin:0 0 16px">Export all content as a JSON file. Use this to import into another CloudPress site.</p>
      <form method="get">
        <input type="hidden" name="format" value="json">
        <div style="display:grid;gap:10px">
          <div>
            <label style="display:block;margin-bottom:4px;font-size:13px;font-weight:500">Content Type</label>
            <select name="post_type" style="width:100%;padding:7px 10px;border:1px solid #ccc;border-radius:4px;background:#fff">
              <option value="all">All content</option>
              <option value="post">Posts only</option>
              <option value="page">Pages only</option>
            </select>
          </div>
          <div>
            <label style="display:block;margin-bottom:4px;font-size:13px;font-weight:500">Status</label>
            <select name="status" style="width:100%;padding:7px 10px;border:1px solid #ccc;border-radius:4px;background:#fff">
              <option value="all">All statuses</option>
              <option value="publish">Published</option>
              <option value="draft">Draft</option>
            </select>
          </div>
          <button type="submit" class="cp-btn">&#8595; Download JSON</button>
        </div>
      </form>
    </div>

    <!-- WXR Export -->
    <div style="border:1px solid #ddd;border-radius:8px;padding:20px">
      <h2 style="margin:0 0 8px;font-size:17px">&#128196; WordPress WXR</h2>
      <p style="color:#666;font-size:13px;margin:0 0 16px">Export as WordPress XML format. Import this into a WordPress site.</p>
      <form method="get">
        <input type="hidden" name="format" value="wxr">
        <div style="display:grid;gap:10px">
          <div>
            <label style="display:block;margin-bottom:4px;font-size:13px;font-weight:500">Content Type</label>
            <select name="post_type" style="width:100%;padding:7px 10px;border:1px solid #ccc;border-radius:4px;background:#fff">
              <option value="all">All content</option>
              <option value="post">Posts only</option>
              <option value="page">Pages only</option>
            </select>
          </div>
          <div>
            <label style="display:block;margin-bottom:4px;font-size:13px;font-weight:500">Status</label>
            <select name="status" style="width:100%;padding:7px 10px;border:1px solid #ccc;border-radius:4px;background:#fff">
              <option value="all">All statuses</option>
              <option value="publish">Published</option>
              <option value="draft">Draft</option>
            </select>
          </div>
          <button type="submit" class="cp-btn">&#8595; Download XML</button>
        </div>
      </form>
    </div>

  </div>
</div>`;
  return new Response(
    await renderAdminShell(cp, content, { title: "Export" }),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
__name(handleExport, "handleExport");

// cp-admin/pages/tools.js
async function handleTools(request, cp) {
  const method = request.method.toUpperCase();
  const prefix = cp.db_prefix || "cp_";
  let notice = null;
  if (method === "POST") {
    const fd = await request.formData().catch(() => new FormData());
    const action = fd.get("action") || "";
    if (action === "flush_kv") {
      const PURGE_PREFIXES = [
        "cp:themes:list",
        "cp:template:",
        "cp:theme:meta:",
        "cp:option:",
        "cp:post:",
        "cp:query:",
        "cp:update:",
        "cp:transient:",
        "cp:doing_cron"
      ];
      const singleKeys2 = PURGE_PREFIXES.filter((k) => !k.endsWith(":"));
      for (const k of singleKeys2) {
        try { await cp.kv.delete(k); } catch (_) {}
      }
      const prefixKeys3 = PURGE_PREFIXES.filter((k) => k.endsWith(":"));
      let totalDeleted2 = 0;
      for (const pfx of prefixKeys3) {
        try {
          let cursor;
          do {
            const opts = cursor ? { prefix: pfx, cursor } : { prefix: pfx };
            const listResult = await cp.kv.list(opts);
            for (const key of (listResult.keys || [])) {
              await cp.kv.delete(key.name).catch(() => {});
              totalDeleted2++;
            }
            cursor = listResult.list_complete ? null : listResult.cursor;
          } while (cursor);
        } catch (_) {}
      }
      notice = { type: "success", message: `\uCE90\uC2DC \uC644\uC804 \uC0AD\uC81C \uC644\uB8CC. KV \uD0A4 ${totalDeleted2}\uAC1C \uC81C\uAC70\uB428.` };
    }
    if (action === "recount_terms") {
      try {
        const terms = await cp.db.prepare(
          `SELECT tt.term_taxonomy_id, tt.term_id, tt.taxonomy FROM ${prefix}term_taxonomy tt`
        ).all();
        for (const tt of terms.results || []) {
          const count = await cp.db.prepare(
            `SELECT COUNT(*) as n FROM ${prefix}term_relationships tr
             JOIN ${prefix}posts p ON p.ID=tr.object_id
             WHERE tr.term_taxonomy_id=? AND p.post_status='publish'`
          ).bind(tt.term_taxonomy_id).first();
          await cp.db.prepare(
            `UPDATE ${prefix}term_taxonomy SET count=? WHERE term_taxonomy_id=?`
          ).bind(count?.n || 0, tt.term_taxonomy_id).run();
        }
        notice = { type: "success", message: "Term counts updated." };
      } catch (e) {
        notice = { type: "error", message: `Error: ${e.message}` };
      }
    }
    if (action === "delete_orphaned_meta") {
      try {
        await cp.db.prepare(
          `DELETE FROM ${prefix}postmeta WHERE post_id NOT IN (SELECT ID FROM ${prefix}posts)`
        ).run();
        await cp.db.prepare(
          `DELETE FROM ${prefix}commentmeta WHERE comment_id NOT IN (SELECT comment_ID FROM ${prefix}comments)`
        ).run();
        notice = { type: "success", message: "Orphaned meta data deleted." };
      } catch (e) {
        notice = { type: "error", message: `Error: ${e.message}` };
      }
    }
    if (action === "run_cron") {
      try {
        const { handleScheduled: handleScheduled2 } = await Promise.resolve().then(() => (init_cp_cron(), cp_cron_exports));
        await handleScheduled2({ scheduledTime: Date.now(), cron: "manual" }, cp.env, cp.ctx);
        notice = { type: "success", message: "Cron tasks executed manually." };
      } catch (e) {
        notice = { type: "error", message: `Cron error: ${e.message}` };
      }
    }
  }
  let dbStats = null;
  try {
    const [postCount, commentCount, termCount, userCount, mediaCount] = await Promise.all([
      cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}posts WHERE post_status != 'trash'`).first(),
      cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}comments`).first(),
      cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}terms`).first(),
      cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}users`).first(),
      cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}media`).first().catch(() => ({ n: 0 }))
    ]);
    dbStats = { posts: postCount?.n || 0, comments: commentCount?.n || 0, terms: termCount?.n || 0, users: userCount?.n || 0, media: mediaCount?.n || 0 };
  } catch (_) {
  }
  const content = `
<div class="cp-card" style="max-width:720px">
  <h1>Tools</h1>

  ${dbStats ? `
  <div style="background:#f9f9f9;border:1px solid #e0e0e0;border-radius:8px;padding:16px;margin-bottom:24px">
    <h3 style="margin:0 0 12px;font-size:15px">Database Stats</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px;text-align:center">
      ${[["Posts", dbStats.posts], ["Comments", dbStats.comments], ["Terms", dbStats.terms], ["Users", dbStats.users], ["Media", dbStats.media]].map(([l, n]) => `
      <div style="background:#fff;border:1px solid #ddd;border-radius:6px;padding:12px">
        <div style="font-size:1.5rem;font-weight:700;color:#0073aa">${n}</div>
        <div style="font-size:12px;color:#666">${l}</div>
      </div>`).join("")}
    </div>
  </div>` : ""}

  <div style="display:grid;gap:16px">

    <div style="border:1px solid #ddd;border-radius:8px;padding:18px">
      <h3 style="margin:0 0 6px">Flush Cache</h3>
      <p style="color:#666;font-size:13px;margin:0 0 12px">Clear all template and theme caches stored in KV. Useful after updating theme files in GitHub.</p>
      <form method="post">
        <input type="hidden" name="action" value="flush_kv">
        <button type="submit" class="cp-btn">Flush Cache</button>
      </form>
    </div>

    <div style="border:1px solid #ddd;border-radius:8px;padding:18px">
      <h3 style="margin:0 0 6px">Update Term Counts</h3>
      <p style="color:#666;font-size:13px;margin:0 0 12px">Recalculate the post count for all categories and tags.</p>
      <form method="post">
        <input type="hidden" name="action" value="recount_terms">
        <button type="submit" class="cp-btn">Update Counts</button>
      </form>
    </div>

    <div style="border:1px solid #ddd;border-radius:8px;padding:18px">
      <h3 style="margin:0 0 6px">Delete Orphaned Meta</h3>
      <p style="color:#666;font-size:13px;margin:0 0 12px">Remove post and comment metadata that no longer has a parent record.</p>
      <form method="post" onsubmit="return confirm('Delete orphaned metadata?')">
        <input type="hidden" name="action" value="delete_orphaned_meta">
        <button type="submit" class="cp-btn">Delete Orphaned Meta</button>
      </form>
    </div>

    <div style="border:1px solid #ddd;border-radius:8px;padding:18px">
      <h3 style="margin:0 0 6px">Run Cron Manually</h3>
      <p style="color:#666;font-size:13px;margin:0 0 12px">Trigger cron tasks immediately (scheduled posts, ping handling, etc.).</p>
      <form method="post">
        <input type="hidden" name="action" value="run_cron">
        <button type="submit" class="cp-btn">Run Cron Now</button>
      </form>
    </div>

    <div style="border:1px solid #ddd;border-radius:8px;padding:18px">
      <h3 style="margin:0 0 6px">Import / Export</h3>
      <p style="color:#666;font-size:13px;margin:0 0 12px">Move your content to or from other sites.</p>
      <div style="display:flex;gap:10px">
        <a href="/cp-admin/import" class="cp-btn">Import</a>
        <a href="/cp-admin/export" class="cp-btn cp-btn-secondary">Export</a>
      </div>
    </div>

  </div>
</div>`;
  return new Response(
    await renderAdminShell(cp, content, { title: "Tools", notices: notice ? [notice] : [] }),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
__name(handleTools, "handleTools");

// cp-admin/pages/upgrade.js
init_cp_config();
function esc20(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(esc20, "esc");
async function handleUpgrade(request, cp) {
  const method = request.method.toUpperCase();
  let notice = null;
  let latestInfo = null;
  try {
    const githubRepo = cp.config?.GITHUB_REPO || await cp.db.prepare(
      `SELECT option_value FROM ${cp.db_prefix || "cp_"}options WHERE option_name='cp_github_repo' LIMIT 1`
    ).first().then((r) => r?.option_value || "").catch(() => "");
    if (githubRepo) {
      const headers = { "User-Agent": "CloudPress/1.0" };
      if (cp.config?.GITHUB_TOKEN)
        headers["Authorization"] = `Bearer ${cp.config.GITHUB_TOKEN}`;
      const res = await fetch(`https://api.github.com/repos/${githubRepo}/releases/latest`, { headers });
      if (res.ok) {
        const data = await res.json();
        latestInfo = { version: data.tag_name?.replace(/^v/, "") || "unknown", url: data.html_url, body: data.body || "" };
      }
    }
  } catch (_) {
  }
  if (method === "POST") {
    const fd = await request.formData().catch(() => new FormData());
    const action = fd.get("action") || "";
    if (action === "flush_update_cache") {
      await cp.kv.delete("cp:update:check").catch(() => {
      });
      notice = { type: "success", message: "Update cache cleared." };
    }
  }
  const currentVersion = CP_VERSION || cp.version || "1.2.0";
  const isUpToDate = !latestInfo || latestInfo.version === currentVersion;
  const content = `
<div class="cp-card" style="max-width:720px">
  <h1>CloudPress Updates</h1>

  <!-- Current version -->
  <div style="background:#f9f9f9;border:1px solid #e0e0e0;border-radius:8px;padding:20px;margin-bottom:24px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div>
        <div style="font-size:13px;color:#888;margin-bottom:4px">Current Version</div>
        <div style="font-size:22px;font-weight:700;color:#0073aa">CloudPress ${esc20(currentVersion)}</div>
      </div>
      ${isUpToDate ? `<div style="background:#46b450;color:#fff;padding:8px 16px;border-radius:6px;font-weight:600">&#10003; Up to Date</div>` : `<div style="background:#d63638;color:#fff;padding:8px 16px;border-radius:6px;font-weight:600">&#9888; Update Available</div>`}
    </div>
  </div>

  ${latestInfo && !isUpToDate ? `
  <div style="border:2px solid #d63638;border-radius:8px;padding:20px;margin-bottom:24px">
    <h2 style="margin:0 0 8px;color:#d63638">New Version Available: ${esc20(latestInfo.version)}</h2>
    <p style="color:#555;font-size:14px;margin:0 0 16px">CloudPress is deployed via Cloudflare Workers. To update, pull the latest code and re-deploy:</p>
    <pre style="background:#f5f5f5;padding:14px;border-radius:6px;overflow-x:auto;font-size:13px">git pull origin main
npx wrangler deploy</pre>
    ${latestInfo.url ? `<a href="${esc20(latestInfo.url)}" target="_blank" class="cp-btn" style="margin-top:12px;display:inline-block">View Release Notes &#8599;</a>` : ""}
  </div>` : ""}

  ${isUpToDate ? `
  <div style="color:#46b450;font-size:15px;margin-bottom:20px">&#10003; You are running the latest version of CloudPress.</div>` : ""}

  <!-- How to update -->
  <div style="border:1px solid #ddd;border-radius:8px;padding:20px;margin-bottom:20px">
    <h3 style="margin:0 0 12px">How to Update CloudPress</h3>
    <ol style="color:#555;font-size:14px;line-height:1.8;margin:0;padding-left:20px">
      <li>Pull the latest code from your GitHub repository</li>
      <li>Run <code style="background:#f5f5f5;padding:1px 6px;border-radius:3px">npx wrangler deploy</code> to deploy to Cloudflare Workers</li>
      <li>Your site will update instantly with zero downtime</li>
    </ol>
    <pre style="background:#f5f5f5;padding:14px;border-radius:6px;overflow-x:auto;font-size:13px;margin-top:12px">cd your-cloudpress-folder
git pull origin main
npx wrangler deploy</pre>
  </div>

  <!-- Database migrations -->
  <div style="border:1px solid #ddd;border-radius:8px;padding:20px;margin-bottom:20px">
    <h3 style="margin:0 0 8px">Database Migrations</h3>
    <p style="color:#666;font-size:13px;margin:0 0 12px">If an update requires database schema changes, run:</p>
    <pre style="background:#f5f5f5;padding:14px;border-radius:6px;overflow-x:auto;font-size:13px">npx wrangler d1 migrations apply cloudpress-db</pre>
  </div>

  <!-- Actions -->
  <div style="display:flex;gap:10px;flex-wrap:wrap">
    <form method="post">
      <input type="hidden" name="action" value="flush_update_cache">
      <button type="submit" class="cp-btn cp-btn-secondary">Clear Update Cache</button>
    </form>
    <a href="/cp-admin" class="cp-btn cp-btn-secondary">Back to Dashboard</a>
  </div>
</div>`;
  return new Response(
    await renderAdminShell(cp, content, { title: "Updates", notices: notice ? [notice] : [] }),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
__name(handleUpgrade, "handleUpgrade");

// cp-admin/ajax.js
init_cp_load();
var AJAX_ACTIONS = /* @__PURE__ */ new Map();
async function handleAjax(request, env, ctx) {
  if (request.method.toUpperCase() !== "POST") {
    return jsonResponse({ success: false, data: "Method not allowed" }, 405);
  }
  let formData;
  try {
    formData = await request.formData();
  } catch (_) {
    return jsonResponse({ success: false, data: "Invalid request body" }, 400);
  }
  const action = formData.get("action") || "";
  if (!action) {
    return jsonResponse({ success: false, data: "No action specified" }, 400);
  }
  const cp = await cpLoad(request, env, ctx);
  if (cp.__cpError)
    return jsonResponse({ success: false, data: "Server error" }, 500);
  const user = await getAdminUser(cp);
  cp.currentUser = user;
  const entry = AJAX_ACTIONS.get(action);
  if (!entry) {
    const builtinResult = await handleBuiltinAction(action, cp, formData, user);
    if (builtinResult !== null)
      return builtinResult;
    return jsonResponse({ success: false, data: `Unknown action: ${action}` }, 400);
  }
  if (!entry.nopriv && !user) {
    return jsonResponse({ success: false, data: "-1" }, 401);
  }
  try {
    const result = await entry.handler(cp, formData);
    return jsonResponse({ success: true, data: result });
  } catch (err) {
    console.error("[CloudPress AJAX]", action, err);
    return jsonResponse({ success: false, data: err.message }, 500);
  }
}
__name(handleAjax, "handleAjax");
async function handleBuiltinAction(action, cp, formData, user) {
  switch (action) {
    case "heartbeat": {
      if (!user)
        return jsonResponse({ success: false, data: "-1" }, 401);
      return jsonResponse({ success: true, data: { nonce: await generateNonce(cp), time: Date.now() } });
    }
    case "autosave":
    case "cp_autosave": {
      if (!user)
        return jsonResponse({ success: false, data: "-1" }, 401);
      const postId = parseInt(formData.get("post_id") || "0");
      const content = formData.get("post_content") || "";
      const title = formData.get("post_title") || "";
      if (postId) {
        const prefix = cp.config.DB_PREFIX || "cp_";
        await cp.db.prepare(
          `UPDATE ${prefix}posts SET post_title=?, post_content=?, post_modified=? WHERE ID=?`
        ).bind(title, content, (/* @__PURE__ */ new Date()).toISOString().slice(0, 19), postId).run();
      }
      return jsonResponse({ success: true, data: { saved: true, postId } });
    }
    case "delete_post":
    case "cp_delete_post": {
      if (!user)
        return jsonResponse({ success: false, data: "-1" }, 401);
      const id = parseInt(formData.get("id") || "0");
      if (!id)
        return jsonResponse({ success: false, data: "Invalid ID" }, 400);
      const prefix = cp.config.DB_PREFIX || "cp_";
      await cp.db.prepare(`UPDATE ${prefix}posts SET post_status='trash' WHERE ID=?`).bind(id).run();
      return jsonResponse({ success: true, data: { deleted: true } });
    }
    case "cp_save_option": {
      if (!user)
        return jsonResponse({ success: false, data: "-1" }, 401);
      const key = formData.get("key") || "";
      const val = formData.get("value") || "";
      if (!key)
        return jsonResponse({ success: false, data: "No key" }, 400);
      const prefix = cp.config.DB_PREFIX || "cp_";
      await cp.db.prepare(
        `INSERT INTO ${prefix}options (option_name, option_value, autoload)
         VALUES (?, ?, 'yes')
         ON CONFLICT(option_name) DO UPDATE SET option_value=excluded.option_value`
      ).bind(key, val).run();
      return jsonResponse({ success: true, data: { saved: true } });
    }
    case "cp_github_status": {
      if (!user)
        return jsonResponse({ success: false, data: "-1" }, 401);
      const prefix = cp.config.DB_PREFIX || "cp_";
      const repoRow = await cp.db.prepare(
        `SELECT option_value FROM ${prefix}options WHERE option_name='cp_github_repo' LIMIT 1`
      ).first();
      return jsonResponse({ success: true, data: { repo: repoRow?.option_value || "" } });
    }
    case "approve-comment": {
      if (!user)
        return jsonResponse({ success: false, data: "-1" }, 401);
      const id = parseInt(formData.get("id") || "0");
      const prefix = cp.config.DB_PREFIX || "cp_";
      await cp.db.prepare(
        `UPDATE ${prefix}comments SET comment_approved='1' WHERE comment_ID=?`
      ).bind(id).run();
      return jsonResponse({ success: true, data: { approved: true } });
    }
    case "trash-comment": {
      if (!user)
        return jsonResponse({ success: false, data: "-1" }, 401);
      const id = parseInt(formData.get("id") || "0");
      const prefix = cp.config.DB_PREFIX || "cp_";
      await cp.db.prepare(
        `UPDATE ${prefix}comments SET comment_approved='trash' WHERE comment_ID=?`
      ).bind(id).run();
      return jsonResponse({ success: true, data: { trashed: true } });
    }
    case "cp_toggle_plugin": {
      if (!user)
        return jsonResponse({ success: false, data: "-1" }, 401);
      const plugin = formData.get("plugin") || "";
      const enable = formData.get("enable") === "1";
      if (!plugin)
        return jsonResponse({ success: false, data: "No plugin specified" }, 400);
      const prefix = cp.config.DB_PREFIX || "cp_";
      const row = await cp.db.prepare(
        `SELECT option_value FROM ${prefix}options WHERE option_name='active_plugins' LIMIT 1`
      ).first();
      let plugins = [];
      try {
        plugins = JSON.parse(row?.option_value || "[]");
      } catch (_) {
      }
      if (enable && !plugins.includes(plugin))
        plugins.push(plugin);
      if (!enable)
        plugins = plugins.filter((p) => p !== plugin);
      await cp.db.prepare(
        `UPDATE ${prefix}options SET option_value=? WHERE option_name='active_plugins'`
      ).bind(JSON.stringify(plugins)).run();
      return jsonResponse({ success: true, data: { plugins } });
    }
    default:
      return null;
  }
}
__name(handleBuiltinAction, "handleBuiltinAction");
async function generateNonce(cp) {
  const key = `${cp.currentUser?.ID || "anon"}:${Math.floor(Date.now() / 864e5)}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(key + (cp.config.NONCE_KEY || "nonce"));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 10);
}
__name(generateNonce, "generateNonce");

// cp-admin/index.js
async function handleAdmin(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/cp-admin";
  const method = request.method.toUpperCase();
  if (path === "/cp-admin/setup-config" || path === "/cp-admin/install") {
    return handleInstaller(request, env, ctx);
  }
  if (path === "/cp-admin/admin-ajax" || path === "/cp-admin/admin-ajax.js") {
    return handleAjax(request, env, ctx);
  }
  if (path === "/cp-admin/github-sync" || path.startsWith("/cp-admin/github-sync/")) {
    return handleAjax(request, env, ctx);
  }
  const cp = await cpLoad(request, env, ctx);
  if (cp.__cpError)
    return cp.response;
  const authResult = await requireAdmin(cp);
  if (authResult)
    return authResult;
  return dispatchAdmin(request, env, ctx, cp, path, method, url);
}
__name(handleAdmin, "handleAdmin");
async function dispatchAdmin(request, env, ctx, cp, path, method, url) {
  if (path === "/cp-admin" || path === "/cp-admin/index") {
    return handleDashboard(request, cp);
  }
  if (path === "/cp-admin/edit") {
    return handlePosts(request, cp);
  }
  if (path === "/cp-admin/post-new" || path === "/cp-admin/post") {
    return handlePostEdit(request, cp);
  }
  if (path === "/cp-admin/edit" && url.searchParams.get("post_type") === "page") {
    return handlePages(request, cp);
  }
  if (path === "/cp-admin/page-new" || path === "/cp-admin/page") {
    return handlePostEdit(request, cp, { post_type: "page" });
  }
  if (path === "/cp-admin/upload" || path === "/cp-admin/media-new") {
    return handleMediaPage(request, cp);
  }
  if (path === "/cp-admin/edit-comments") {
    return handleComments(request, cp);
  }
  if (path === "/cp-admin/themes" || path === "/cp-admin/theme-install") {
    return handleThemes(request, cp);
  }
  if (path === "/cp-admin/plugins" || path === "/cp-admin/plugin-install") {
    return handlePlugins(request, cp);
  }
  if (path === "/cp-admin/users") {
    return handleUsers(request, cp);
  }
  if (path === "/cp-admin/user-new" || path === "/cp-admin/user-edit") {
    return handleUserEdit(request, cp);
  }
  if (path === "/cp-admin/profile") {
    return handleProfile(request, cp);
  }
  if (path === "/cp-admin/options-general") {
    return handleOptionsGeneral(request, cp);
  }
  if (path === "/cp-admin/options-writing") {
    return handleOptionsWriting(request, cp);
  }
  if (path === "/cp-admin/options-reading") {
    return handleOptionsReading(request, cp);
  }
  if (path === "/cp-admin/options-discussion") {
    return handleOptionsDiscussion(request, cp);
  }
  if (path === "/cp-admin/options-media") {
    return handleOptionsMedia(request, cp);
  }
  if (path === "/cp-admin/options-permalink") {
    return handleOptionsPermalink(request, cp);
  }
  if (path === "/cp-admin/options") {
    return handleOptions(request, cp);
  }
  if (path === "/cp-admin/tools") {
    return handleTools(request, cp);
  }
  if (path === "/cp-admin/import") {
    return handleImport(request, cp);
  }
  if (path === "/cp-admin/export") {
    return handleExport(request, cp);
  }
  if (path === "/cp-admin/update-core" || path === "/cp-admin/upgrade") {
    return handleUpgrade(request, cp);
  }
  return new Response(
    await renderAdminShell(cp, "<h2>Page Not Found</h2><p>The requested admin page does not exist.</p>", { title: "404 Not Found" }),
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
__name(dispatchAdmin, "dispatchAdmin");

// cp-includes/auth.js
init_cp_load();
init_user();
init_jwt();
async function handleLogin(request, env, ctx) {
  const cp = await cpLoad(request, env, ctx);
  if (cp.__cpError)
    return cp.response;
  const url = cp.url;
  const method = request.method.toUpperCase();
  if (cp.currentUser) {
    return Response.redirect(url.origin + "/cp-admin", 302);
  }
  const redirectTo = url.searchParams.get("redirect_to") || "/cp-admin";
  let error = "";
  if (method === "POST") {
    const fd = await request.formData().catch(() => new FormData());
    const login = (fd.get("log") || "").trim();
    const password = fd.get("pwd") || "";
    const remember = fd.get("rememberme") === "1";
    const user = await authenticateUser(cp, login, password);
    if (user) {
      const ttl = remember ? 30 * 86400 : 86400;
      const token = await signJwt(
        { sub: String(user.ID), login: user.user_login, roles: user.roles },
        cp.config.AUTH_KEY,
        ttl
      );
      const secure = url.protocol === "https:";
      const cookie = buildAuthCookie(token, ttl, secure);
      const safeRedirect = redirectTo.startsWith("/") ? redirectTo : "/cp-admin";
      return new Response(null, {
        status: 302,
        headers: {
          Location: url.origin + safeRedirect,
          "Set-Cookie": cookie
        }
      });
    } else {
      error = "Invalid username or password. Please try again.";
    }
  }
  const html = renderLoginPage(error, redirectTo, cp.config.SITE_NAME || "CloudPress");
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
__name(handleLogin, "handleLogin");
async function handleLogout(request, env, ctx) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/cp-login",
      "Set-Cookie": clearAuthCookie()
    }
  });
}
__name(handleLogout, "handleLogout");
function renderLoginPage(error, redirectTo, siteName) {
  const esc22 = /* @__PURE__ */ __name((s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"), "esc");
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Log In &lsaquo; ${esc22(siteName)}</title>
  <link rel="stylesheet" href="/cp-includes/css/login.css">
</head>
<body>
<div class="login-wrap">
  <div class="login-logo">
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="16" fill="#F6821F"/>
      <path d="M16 32C16 23.163 23.163 16 32 16C40.837 16 48 23.163 48 32C48 40.837 40.837 48 32 48C23.163 48 16 40.837 16 32Z" fill="white" fill-opacity="0.2"/>
      <path d="M26 24L38 32L26 40V24Z" fill="white"/>
    </svg>
    <h1>${esc22(siteName)}</h1>
  </div>

  <div class="login-box">
    ${error ? `<div class="login-error">${esc22(error)}</div>` : ""}
    <form method="post" action="/cp-login">
      <input type="hidden" name="redirect_to" value="${esc22(redirectTo)}">

      <label for="user_login">Username or Email</label>
      <input type="text" id="user_login" name="log" autocomplete="username" autofocus required>

      <label for="user_pass">Password</label>
      <input type="password" id="user_pass" name="pwd" autocomplete="current-password" required>

      <div class="login-remember">
        <input type="checkbox" id="rememberme" name="rememberme" value="1">
        <label for="rememberme" style="font-weight:400;margin:0">Remember me</label>
      </div>

      <button type="submit" class="login-btn">Log In</button>
    </form>
  </div>

  <div class="login-footer">
    <a href="/">&larr; Back to ${esc22(siteName)}</a>
  </div>
</div>
</body>
</html>`;
}
__name(renderLoginPage, "renderLoginPage");

// cp-includes/feed.js
init_cp_load();
init_option();
async function handleFeed(request, env, ctx) {
  const cp = await cpLoad(request, env, ctx);
  if (cp.__cpError)
    return cp.response;
  const url = new URL(request.url);
  const path = url.pathname;
  const isAtom = path.endsWith("/atom");
  const [blogname, tagline, siteurl, postsPerRss] = await Promise.all([
    getOption(cp, "blogname", "CloudPress Site"),
    getOption(cp, "blogdescription", ""),
    getOption(cp, "siteurl", url.origin),
    getOption(cp, "posts_per_rss", 10)
  ]);
  const posts = await getPosts(cp, {
    post_type: "post",
    post_status: "publish",
    posts_per_page: parseInt(postsPerRss) || 10,
    orderby: "date",
    order: "DESC"
  });
  const feedUrl = `${siteurl}/feed`;
  if (isAtom) {
    return atomFeed({ posts, blogname, tagline, siteurl, feedUrl, cp });
  }
  return rssFeed({ posts, blogname, tagline, siteurl, feedUrl, cp });
}
__name(handleFeed, "handleFeed");
function rssFeed({ posts, blogname, tagline, siteurl, feedUrl, cp }) {
  const lastBuild = posts[0]?.post_modified || (/* @__PURE__ */ new Date()).toUTCString();
  const pubDate = new Date(lastBuild).toUTCString();
  const items = posts.map((post) => {
    const link = postLink(siteurl, post);
    const pubdate = new Date(post.post_date || Date.now()).toUTCString();
    const content = escXml4(post.post_content || "");
    const excerpt = escXml4(trimExcerpt(post.post_content || post.post_excerpt || "", 55));
    return `
  <item>
    <title><![CDATA[${post.post_title || "(no title)"}]]></title>
    <link>${escXml4(link)}</link>
    <pubDate>${pubdate}</pubDate>
    <dc:creator><![CDATA[${post.post_author || ""}]]></dc:creator>
    <guid isPermaLink="true">${escXml4(link)}</guid>
    <description><![CDATA[${excerpt}]]></description>
    <content:encoded><![CDATA[${content}]]></content:encoded>
  </item>`;
  }).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title><![CDATA[${blogname}]]></title>
  <link>${escXml4(siteurl)}</link>
  <description><![CDATA[${tagline}]]></description>
  <language>ko</language>
  <lastBuildDate>${pubDate}</lastBuildDate>
  <atom:link href="${escXml4(feedUrl)}" rel="self" type="application/rss+xml"/>
  <generator>CloudPress</generator>
${items}
</channel>
</rss>`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=UTF-8",
      "Cache-Control": "public, max-age=600"
    }
  });
}
__name(rssFeed, "rssFeed");
function atomFeed({ posts, blogname, tagline, siteurl, feedUrl, cp }) {
  const updated = posts[0]?.post_modified ? new Date(posts[0].post_modified).toISOString() : (/* @__PURE__ */ new Date()).toISOString();
  const entries = posts.map((post) => {
    const link = postLink(siteurl, post);
    const updated2 = new Date(post.post_modified || post.post_date || Date.now()).toISOString();
    const content = escXml4(post.post_content || "");
    return `
  <entry>
    <title type="html"><![CDATA[${post.post_title || "(no title)"}]]></title>
    <link rel="alternate" type="text/html" href="${escXml4(link)}"/>
    <id>${escXml4(link)}</id>
    <updated>${updated2}</updated>
    <content type="html"><![CDATA[${content}]]></content>
    <summary type="html"><![CDATA[${trimExcerpt(post.post_content || "", 55)}]]></summary>
  </entry>`;
  }).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="html"><![CDATA[${blogname}]]></title>
  <subtitle type="html"><![CDATA[${tagline}]]></subtitle>
  <link rel="alternate" type="text/html" href="${escXml4(siteurl)}"/>
  <link rel="self" type="application/atom+xml" href="${escXml4(feedUrl)}/atom"/>
  <id>${escXml4(siteurl)}/</id>
  <updated>${updated}</updated>
  <generator>CloudPress</generator>
${entries}
</feed>`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/atom+xml; charset=UTF-8",
      "Cache-Control": "public, max-age=600"
    }
  });
}
__name(atomFeed, "atomFeed");
function postLink(siteurl, post) {
  const base = String(siteurl || "").replace(/\/$/, "");
  if (post.post_name) {
    const d = post.post_date ? new Date(post.post_date) : /* @__PURE__ */ new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${base}/${y}/${m}/${post.post_name}/`;
  }
  return `${base}/?p=${post.ID}`;
}
__name(postLink, "postLink");
function escXml4(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
__name(escXml4, "escXml");
function trimExcerpt(content, wordCount) {
  const text = content.replace(/<[^>]+>/g, "").trim();
  const words = text.split(/\s+/).filter(Boolean);
  return words.length > wordCount ? words.slice(0, wordCount).join(" ") + "\u2026" : text;
}
__name(trimExcerpt, "trimExcerpt");

// cp-includes/sitemap.js
init_cp_load();
init_option();
async function handleSitemap(request, env, ctx) {
  const cp = await cpLoad(request, env, ctx);
  if (cp.__cpError)
    return cp.response;
  const url = new URL(request.url);
  const path = url.pathname;
  const prefix = cp.db_prefix || "cp_";
  const siteUrl = (await getOption(cp, "siteurl", url.origin)).replace(/\/$/, "");
  if (path === "/sitemap.xml" || path === "/cp-sitemap.xml") {
    return sitemapIndex(cp, siteUrl, url);
  }
  if (path === "/sitemap-posts.xml") {
    return postsSitemap(cp, prefix, siteUrl, "post");
  }
  if (path === "/sitemap-pages.xml") {
    return postsSitemap(cp, prefix, siteUrl, "page");
  }
  if (path === "/sitemap-terms.xml") {
    return termsSitemap(cp, prefix, siteUrl);
  }
  return new Response("Not Found", { status: 404 });
}
__name(handleSitemap, "handleSitemap");
async function sitemapIndex(cp, siteUrl, url) {
  const entries = [
    `${siteUrl}/sitemap-posts.xml`,
    `${siteUrl}/sitemap-pages.xml`,
    `${siteUrl}/sitemap-terms.xml`
  ].map((loc) => `
  <sitemap>
    <loc>${esc21(loc)}</loc>
    <lastmod>${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}</lastmod>
  </sitemap>`).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>`;
  return xmlResponse(xml);
}
__name(sitemapIndex, "sitemapIndex");
async function postsSitemap(cp, prefix, siteUrl, postType) {
  const rows = await cp.db.prepare(`
    SELECT ID, post_name, post_date, post_modified, post_type
    FROM ${prefix}posts
    WHERE post_type=? AND post_status='publish'
    ORDER BY post_modified DESC
    LIMIT 1000
  `).bind(postType).all();
  const urls = (rows.results || []).map((post) => {
    const loc = postPermalink(siteUrl, post);
    const lastmod = (post.post_modified || post.post_date || "").slice(0, 10);
    const freq = postType === "post" ? "weekly" : "monthly";
    const priority = postType === "post" ? "0.8" : "0.6";
    return `
  <url>
    <loc>${esc21(loc)}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}
    <changefreq>${freq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
  }).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
  return xmlResponse(xml);
}
__name(postsSitemap, "postsSitemap");
async function termsSitemap(cp, prefix, siteUrl) {
  const rows = await cp.db.prepare(`
    SELECT t.term_id, t.slug, tt.taxonomy, tt.count
    FROM ${prefix}terms t
    JOIN ${prefix}term_taxonomy tt ON t.term_id = tt.term_id
    WHERE tt.taxonomy IN ('category', 'post_tag') AND tt.count > 0
    ORDER BY tt.count DESC
    LIMIT 1000
  `).all();
  const urls = (rows.results || []).map((term) => {
    const loc = termPermalink(siteUrl, term);
    return `
  <url>
    <loc>${esc21(loc)}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.4</priority>
  </url>`;
  }).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
  return xmlResponse(xml);
}
__name(termsSitemap, "termsSitemap");
function postPermalink(siteUrl, post) {
  if (post.post_name) {
    const d = post.post_date ? new Date(post.post_date) : /* @__PURE__ */ new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    if (post.post_type === "page")
      return `${siteUrl}/${post.post_name}/`;
    return `${siteUrl}/${y}/${m}/${post.post_name}/`;
  }
  return `${siteUrl}/?p=${post.ID}`;
}
__name(postPermalink, "postPermalink");
function termPermalink(siteUrl, term) {
  if (term.taxonomy === "category")
    return `${siteUrl}/category/${term.slug}/`;
  if (term.taxonomy === "post_tag")
    return `${siteUrl}/tag/${term.slug}/`;
  return `${siteUrl}/${term.taxonomy}/${term.slug}/`;
}
__name(termPermalink, "termPermalink");
function esc21(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
__name(esc21, "esc");
function xmlResponse(xml) {
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=UTF-8",
      "Cache-Control": "public, max-age=3600"
    }
  });
}
__name(xmlResponse, "xmlResponse");

// cp-router.js
async function route(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();
  if ((path.startsWith("/cp-includes/") && !path.startsWith("/cp-includes/css/")) || path.startsWith("/cp-config") || path.startsWith("/cp-settings") || path.startsWith("/cp-load") || path.startsWith("/node_modules/")) {
    return forbidden();
  }
  if (path.startsWith("/cp-admin/css/")) {
    return serveInlineCss(path);
  }
  if (path.startsWith("/cp-includes/css/")) {
    return serveInlineCss(path);
  }
  if (path === "/cp-admin/setup-config" || path === "/cp-admin/install") {
    return handleInstaller(request, env, ctx);
  }
  if (path.startsWith("/cp-admin/images/")) {
    return serveAdminAsset(path);
  }
  if (path.startsWith("/uploads/") || path.startsWith("/cp-content/uploads/")) {
    return handleMedia(request, env, ctx);
  }
  if (path === "/feed" || path === "/feed/rss" || path === "/feed/atom" || path.endsWith("/feed") || path.endsWith("/feed/rss")) {
    return handleFeed(request, env, ctx);
  }
  if (path === "/cp-sitemap.xml" || path === "/sitemap.xml") {
    return handleSitemap(request, env, ctx);
  }
  if (path === "/cp-login") {
    return handleLogin(request, env, ctx);
  }
  if (path === "/cp-logout") {
    return handleLogout(request, env, ctx);
  }
  if (path === "/cp-admin" || path.startsWith("/cp-admin/")) {
    return handleAdmin(request, env, ctx);
  }
  if (path === "/cp-activate") {
    return handleActivate(request, env, ctx);
  }
  if (path === "/cp-signup") {
    return handleSignup(request, env, ctx);
  }
  if (path === "/cp-comments-post" || path === "/cp-comments-post.js") {
    return handleCommentsPost(request, env, ctx);
  }
  if (path === "/cp-cron") {
    return handleCronRequest(request, env, ctx);
  }
  if (path === "/cp-trackback" || path.includes("/trackback")) {
    const parts = path.split("/").filter(Boolean);
    const postIdx = parts.findIndex((p) => /^\d+$/.test(p));
    const postId = postIdx >= 0 ? parts[postIdx] : "";
    return handleTrackback(request, env, ctx, { post_id: postId });
  }
  if (path === "/cp-links-opml") {
    return handleLinksOpml(request, env, ctx);
  }
  if (path === "/cp-mail") {
    return handleMail(request, env, ctx);
  }
  if (path === "/robots.txt") {
    return new Response(
      `User-agent: *
Disallow: /cp-admin/
Sitemap: ${url.origin}/sitemap.xml
`,
      { headers: { "Content-Type": "text/plain" } }
    );
  }
  if (path === "/favicon.ico") {
    if (env.CP_KV) {
      try {
        const stored = await env.CP_KV.get("cp:favicon", { type: "arrayBuffer" });
        if (stored) {
          return new Response(stored, {
            headers: { "Content-Type": "image/x-icon", "Cache-Control": "public, max-age=86400" }
          });
        }
      } catch (_) {
      }
    }
    return serveAdminAsset("/cp-admin/images/favicon.ico");
  }
  return handleRequest(request, env, ctx, { CP_USE_THEMES: true });
}
__name(route, "route");
function serveAdminAsset(path) {
  const file = path.replace("/cp-admin/images/", "");
  switch (file) {
    case "favicon.ico":
    case "favicon.svg": {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#1d2327"/>
  <text x="4" y="24" font-family="system-ui,sans-serif" font-size="22" font-weight="800" fill="#F6821F">C</text>
  <text x="14" y="24" font-family="system-ui,sans-serif" font-size="22" font-weight="800" fill="#ffffff">P</text>
</svg>`;
      return new Response(svg, {
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=86400"
        }
      });
    }
    case "logo.svg": {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 32">
  <rect width="32" height="32" rx="6" fill="#1d2327"/>
  <text x="4" y="24" font-family="system-ui,sans-serif" font-size="22" font-weight="800" fill="#F6821F">C</text>
  <text x="14" y="24" font-family="system-ui,sans-serif" font-size="22" font-weight="800" fill="#ffffff">P</text>
  <text x="40" y="22" font-family="system-ui,sans-serif" font-size="16" font-weight="700" fill="#1d2327">Cloud<tspan fill="#F6821F">Press</tspan></text>
</svg>`;
      return new Response(svg, {
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=86400"
        }
      });
    }
    case "spinner.svg": {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="10" fill="none" stroke="#dcdcde" stroke-width="3"/>
  <path d="M12 2a10 10 0 0 1 10 10" fill="none" stroke="#2271b1" stroke-width="3" stroke-linecap="round">
    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/>
  </path>
</svg>`;
      return new Response(svg, {
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "no-cache"
        }
      });
    }
    default:
      return new Response("Not found", { status: 404 });
  }
}

__name(serveAdminAsset, "serveAdminAsset");
function cssResp(css) {
  return new Response(css, { headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
__name(cssResp, "cssResp");
function serveInlineCss(path) {
  const ADMIN_CSS = `:root{--cp-sidebar-w:240px;--cp-topbar-h:48px;--cp-bg:#f0f0f1;--cp-sidebar-bg:#1d2327;--cp-sidebar-text:#a7aaad;--cp-sidebar-hover:#2c3338;--cp-sidebar-active:#2271b1;--cp-topbar-bg:#1d2327;--cp-topbar-text:#a7aaad;--cp-accent:#2271b1;--cp-accent-hover:#135e96;--cp-white:#fff;--cp-border:#dcdcde;--cp-text:#1d2327;--cp-muted:#646970;--cp-radius:4px;--cp-shadow:0 1px 3px rgba(0,0,0,.12)}*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;background:var(--cp-bg);color:var(--cp-text)}#cp-topbar{position:fixed;top:0;left:0;right:0;height:var(--cp-topbar-h);background:var(--cp-topbar-bg);display:flex;align-items:center;justify-content:space-between;padding:0 16px;z-index:1000;color:var(--cp-topbar-text)}.cp-topbar-left,.cp-topbar-right{display:flex;align-items:center;gap:12px}#cp-menu-toggle{background:none;border:none;cursor:pointer;padding:6px;color:var(--cp-topbar-text);display:none;flex-direction:column;gap:4px}#cp-menu-toggle span{display:block;width:20px;height:2px;background:currentColor;transition:.2s}.cp-site-link{color:var(--cp-topbar-text);text-decoration:none;font-size:13px;opacity:.8;transition:.15s}.cp-site-link:hover{opacity:1;color:var(--cp-white)}.cp-version{font-size:11px;opacity:.5}.cp-user-menu{position:relative}.cp-user-btn{background:none;border:none;color:var(--cp-topbar-text);cursor:pointer;font-size:13px;padding:6px 10px;border-radius:var(--cp-radius);transition:.15s}.cp-user-btn:hover{background:var(--cp-sidebar-hover);color:var(--cp-white)}.cp-user-dropdown{display:none;position:absolute;right:0;top:calc(100% + 4px);background:var(--cp-white);border:1px solid var(--cp-border);border-radius:var(--cp-radius);min-width:150px;box-shadow:var(--cp-shadow);z-index:100}.cp-user-menu.open .cp-user-dropdown{display:block}.cp-user-dropdown a{display:block;padding:8px 14px;color:var(--cp-text);text-decoration:none;font-size:13px;transition:.1s}.cp-user-dropdown a:hover{background:var(--cp-bg)}.cp-user-dropdown hr{border:none;border-top:1px solid var(--cp-border);margin:4px 0}.cp-logout{color:#d63638!important}#cp-layout{display:flex;min-height:100vh;padding-top:var(--cp-topbar-h)}#cp-sidebar{width:var(--cp-sidebar-w);background:var(--cp-sidebar-bg);flex-shrink:0;overflow-y:auto;position:fixed;top:var(--cp-topbar-h);left:0;bottom:0;z-index:500;transition:transform .2s}.cp-sidebar-header{padding:16px 14px 8px;border-bottom:1px solid rgba(255,255,255,.07)}.cp-logo{display:flex;align-items:center;gap:8px;color:var(--cp-white);text-decoration:none;font-weight:700;font-size:16px}.cp-logo span{letter-spacing:-.3px}.cp-nav-list{list-style:none;margin:8px 0;padding:0}.cp-nav-item{margin:1px 0}.cp-nav-link{display:flex;align-items:center;gap:10px;padding:9px 14px;color:var(--cp-sidebar-text);text-decoration:none;border-radius:var(--cp-radius);margin:0 6px;transition:.15s;font-size:13px}.cp-nav-link:hover,.cp-nav-item.active>.cp-nav-link{color:var(--cp-white);background:var(--cp-sidebar-hover)}.cp-nav-item.active>.cp-nav-link{background:var(--cp-sidebar-active)}.cp-nav-icon{font-size:16px;flex-shrink:0;width:20px;text-align:center}.cp-nav-label{flex:1}.cp-nav-arrow{font-size:9px;opacity:.5;transition:transform .2s}.cp-nav-item.has-children.active .cp-nav-arrow,.cp-nav-item.has-children:hover .cp-nav-arrow{transform:rotate(180deg)}.cp-subnav{list-style:none;margin:0;padding:0 0 4px 44px;display:none}.cp-nav-item.has-children.active .cp-subnav,.cp-nav-item.has-children:hover .cp-subnav{display:block}.cp-subnav li a{display:block;padding:6px 10px;color:var(--cp-sidebar-text);text-decoration:none;font-size:12.5px;border-radius:var(--cp-radius);transition:.1s}.cp-subnav li a:hover,.cp-subnav li.active a{color:var(--cp-white);background:rgba(255,255,255,.07)}#cp-main{flex:1;margin-left:var(--cp-sidebar-w);padding:16px 24px 24px;min-height:calc(100vh - var(--cp-topbar-h))}.cp-page-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:10px;flex-wrap:wrap}.cp-page-title{font-size:22px;font-weight:400;margin:0;color:var(--cp-text);line-height:1.3}.cp-notice{border-left:4px solid var(--cp-accent);background:var(--cp-white);padding:10px 14px;border-radius:0 var(--cp-radius) var(--cp-radius) 0;margin-bottom:16px;box-shadow:var(--cp-shadow)}.cp-notice-success{border-color:#00a32a}.cp-notice-error{border-color:#d63638}.cp-notice-warning{border-color:#dba617}.cp-notice p{margin:0;font-size:13.5px}.cp-card{background:var(--cp-white);border:1px solid var(--cp-border);border-radius:var(--cp-radius);padding:20px;margin-bottom:20px;box-shadow:var(--cp-shadow)}.cp-card h2,.cp-card h3{margin:0 0 14px;font-size:15px;color:var(--cp-text)}.cp-table-wrap{background:var(--cp-white);border:1px solid var(--cp-border);border-radius:var(--cp-radius);overflow:hidden;margin-bottom:20px;box-shadow:var(--cp-shadow)}.cp-table{width:100%;border-collapse:collapse;font-size:13px}.cp-table th{background:var(--cp-bg);padding:10px 14px;text-align:left;font-weight:600;border-bottom:1px solid var(--cp-border);color:var(--cp-muted);font-size:12px;text-transform:uppercase;letter-spacing:.4px}.cp-table td{padding:10px 14px;border-bottom:1px solid var(--cp-border);vertical-align:middle}.cp-table tr:last-child td{border-bottom:none}.cp-table tr:hover td{background:#f9f9f9}.cp-table a{color:var(--cp-accent);text-decoration:none}.cp-table a:hover{text-decoration:underline}.cp-btn,.cp-btn-secondary{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:var(--cp-radius);font-size:13px;font-weight:500;cursor:pointer;text-decoration:none;border:1px solid transparent;transition:.15s;line-height:1.4}.cp-btn{background:var(--cp-accent);color:var(--cp-white);border-color:var(--cp-accent)}.cp-btn:hover{background:var(--cp-accent-hover);border-color:var(--cp-accent-hover)}.cp-btn-secondary{background:var(--cp-white);color:var(--cp-text);border-color:var(--cp-border)}.cp-btn-secondary:hover{background:var(--cp-bg);border-color:#8c8f94}.cp-btn-danger{background:#d63638;color:var(--cp-white);border-color:#d63638}.cp-btn-danger:hover{background:#b32d2e}.cp-form-table{width:100%;border-collapse:collapse}.cp-form-table tr{border-bottom:1px solid var(--cp-border)}.cp-form-table tr:last-child{border-bottom:none}.cp-form-table th{padding:14px 20px 14px 0;text-align:right;font-weight:600;width:200px;vertical-align:top;padding-top:18px;font-size:13px}.cp-form-table td{padding:14px 0}.cp-form-input,.cp-form-select,.cp-form-textarea{border:1px solid var(--cp-border);border-radius:var(--cp-radius);padding:7px 10px;font-size:14px;color:var(--cp-text);transition:.15s;width:100%;max-width:400px}.cp-form-input:focus,.cp-form-select:focus,.cp-form-textarea:focus{border-color:var(--cp-accent);outline:2px solid rgba(34,113,177,.2)}.cp-form-textarea{resize:vertical;min-height:80px}.cp-description{color:var(--cp-muted);font-size:12.5px;margin:.4rem 0 0}.cp-dash-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;margin-bottom:20px}.cp-dash-stat{background:var(--cp-white);border:1px solid var(--cp-border);border-radius:var(--cp-radius);padding:20px;display:flex;align-items:center;gap:16px;box-shadow:var(--cp-shadow)}.cp-dash-stat-icon{font-size:32px;flex-shrink:0}.cp-dash-stat-num{font-size:28px;font-weight:700;color:var(--cp-text);line-height:1}.cp-dash-stat-label{font-size:12px;color:var(--cp-muted);margin-top:4px}.cp-badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px}.cp-badge-publish{background:#edfaef;color:#00a32a}.cp-badge-draft{background:#f0f0f1;color:var(--cp-muted)}.cp-badge-pending{background:#fff8e5;color:#996800}.cp-badge-private{background:#f0f4f8;color:var(--cp-accent)}.cp-badge-trash{background:#fcf0f1;color:#d63638}#cp-footer{text-align:center;padding:16px;color:var(--cp-muted);font-size:12px;border-top:1px solid var(--cp-border);margin-left:var(--cp-sidebar-w)}#cp-footer a{color:var(--cp-accent);text-decoration:none}@media(max-width:782px){#cp-menu-toggle{display:flex}#cp-sidebar{transform:translateX(-100%)}body.cp-sidebar-open #cp-sidebar{transform:none}#cp-main,#cp-footer{margin-left:0}.cp-form-table th{display:none}.cp-form-table td{display:block;padding:10px 0}.cp-form-input,.cp-form-select,.cp-form-textarea{max-width:100%}.cp-dash-grid{grid-template-columns:1fr}}`;
  const INSTALLER_CSS = `*,*::before,*::after{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f0f1;margin:0;padding:2rem 1rem;color:#1d2327}.install-wrap{max-width:700px;margin:0 auto}.install-header{text-align:center;margin-bottom:2rem}.install-logo{font-size:2rem;font-weight:800;color:#1d2327;text-decoration:none}.install-logo span{color:#F6821F}.install-card{background:#fff;border-radius:8px;padding:2rem 2.5rem;box-shadow:0 2px 10px rgba(0,0,0,.08);margin-bottom:1.5rem}h2{font-size:1.4rem;margin:0 0 .5rem;color:#1d2327}.lead{color:#646970;margin:0 0 1.5rem}.form-table{width:100%;border-collapse:collapse;margin-bottom:1.5rem}.form-table tr{border-bottom:1px solid #dcdcde}.form-table tr:last-child{border-bottom:none}.form-table th{padding:14px 20px 14px 0;text-align:right;width:180px;font-size:13px;font-weight:600;vertical-align:top;padding-top:18px}.form-table td{padding:12px 0}.regular-text{width:100%;max-width:380px;padding:7px 10px;border:1px solid #8c8f94;border-radius:4px;font-size:14px;transition:.15s}.regular-text:focus{border-color:#2271b1;outline:2px solid rgba(34,113,177,.2)}.description{color:#646970;font-size:12.5px;margin:.4rem 0 0}code{background:#f0f0f1;padding:2px 6px;border-radius:3px;font-size:12px}.btn{display:inline-flex;align-items:center;padding:8px 18px;border-radius:4px;font-size:14px;font-weight:500;cursor:pointer;text-decoration:none;border:1px solid transparent;margin-right:8px;transition:.15s}.btn-primary{background:#2271b1;color:#fff;border-color:#2271b1}.btn-primary:hover{background:#135e96}.btn-secondary{background:#fff;color:#1d2327;border-color:#dcdcde}.btn-secondary:hover{background:#f0f0f1}.submit{margin-top:1rem}.notice-error{background:#fcf0f1;border-left:4px solid #d63638;padding:.8rem 1rem;border-radius:0 4px 4px 0;margin-bottom:1.2rem}.notice-error ul{margin:0;padding:0 0 0 1rem;color:#d63638;font-size:13.5px}.success-card{border-left:4px solid #00a32a}.success-icon{font-size:3rem;color:#00a32a;text-align:center;margin-bottom:1rem}`;
  const LOGIN_CSS = `*,*::before,*::after{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f0f0f1;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}.login-wrap{width:100%;max-width:360px}.login-logo{text-align:center;margin-bottom:24px}.login-logo svg{width:64px;height:64px}.login-logo h1{margin:8px 0 0;font-size:22px;font-weight:600;color:#1d2327}.login-box{background:#fff;border-radius:8px;padding:28px 32px;box-shadow:0 2px 12px rgba(0,0,0,.08)}.login-box label{display:block;font-size:13px;font-weight:600;color:#1d2327;margin-bottom:6px}.login-box input[type=text],.login-box input[type=password]{width:100%;padding:10px 14px;font-size:15px;border:1px solid #8c8f94;border-radius:4px;margin-bottom:16px;outline:none;transition:border-color .2s}.login-box input:focus{border-color:#2271b1;box-shadow:0 0 0 1px #2271b1}.login-remember{display:flex;align-items:center;gap:8px;font-size:13px;color:#3c434a;margin-bottom:18px}.login-btn{width:100%;padding:10px;font-size:15px;font-weight:600;background:#2271b1;color:#fff;border:none;border-radius:4px;cursor:pointer;transition:background .2s}.login-btn:hover{background:#135e96}.login-error{background:#fff0f0;border-left:4px solid #d63638;padding:10px 14px;color:#d63638;font-size:13px;border-radius:4px;margin-bottom:16px}.login-footer{text-align:center;margin-top:16px;font-size:12px;color:#646970}.login-footer a{color:#2271b1;text-decoration:none}`;
  const ACTIVATE_CSS = `*,*::before,*::after{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f1f1;margin:0;padding:2rem 1rem;color:#333}#signup-content{max-width:600px;margin:2rem auto}.cp-activate-container{background:#fff;border-radius:6px;padding:2rem 2.5rem;box-shadow:0 2px 8px rgba(0,0,0,.1)}h2{font-size:1.4rem;margin:0 0 1.2rem;color:#1d2327}label{font-weight:600;display:block;margin-bottom:.4rem}input[type="text"]{width:100%;padding:.6rem .8rem;font-size:1rem;border:1px solid #8c8f94;border-radius:4px}.cp-btn{background:#2271b1;color:#fff;border:none;padding:.6rem 1.4rem;font-size:1rem;border-radius:4px;cursor:pointer}.cp-btn:hover{background:#135e96}#signup-welcome{background:#f0f6fc;border-left:4px solid #2271b1;padding:1rem 1.4rem;border-radius:0 4px 4px 0;margin:1rem 0}#signup-welcome p{margin:.4rem 0}.h3{font-weight:700}a{color:#2271b1}.lead-in{line-height:1.7}`;
  const SIGNUP_CSS = `*,*::before,*::after{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f1f1;margin:0;padding:2rem 1rem;color:#333}.signup-wrapper{max-width:560px;margin:0 auto}.signup-box{background:#fff;border-radius:8px;padding:2.5rem;box-shadow:0 2px 10px rgba(0,0,0,.08)}h1{font-size:1.6rem;color:#1d2327;margin:0 0 .4rem}.site-name{text-align:center;margin-bottom:1.5rem}.site-name a{color:#1d2327;text-decoration:none;font-size:1.3rem;font-weight:700}h2{font-size:1.2rem;margin:0 0 1.5rem;color:#1d2327}label{display:block;font-weight:600;margin-bottom:.3rem;font-size:.9rem}input[type="text"],input[type="email"]{width:100%;padding:.55rem .75rem;font-size:1rem;border:1px solid #8c8f94;border-radius:4px;margin-bottom:1rem}input:focus{outline:2px solid #2271b1;border-color:#2271b1}.cp-btn{background:#2271b1;color:#fff;border:none;padding:.65rem 1.5rem;font-size:1rem;border-radius:4px;cursor:pointer;width:100%;margin-top:.5rem}.cp-btn:hover{background:#135e96}.error-list{background:#fcf0f1;border-left:4px solid #d63638;border-radius:0 4px 4px 0;padding:.8rem 1rem;margin-bottom:1.2rem;list-style:none;padding-left:1rem}.error-list li{color:#d63638;margin:.2rem 0;font-size:.9rem}.hint{font-size:.8rem;color:#666;margin-top:-.7rem;margin-bottom:1rem}.success{background:#edfaef;border-left:4px solid #00a32a;border-radius:0 4px 4px 0;padding:1rem 1.2rem}.success h2{color:#00a32a}`;
  const ERROR_CSS = `*,*::before,*::after{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f1f1;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.error-box{background:#fff;border-left:4px solid #e74c3c;border-radius:4px;padding:2rem 2.5rem;max-width:560px;box-shadow:0 2px 8px rgba(0,0,0,.1)}h1{color:#e74c3c;font-size:1.3rem;margin:0 0 1rem}p{color:#444;line-height:1.6}code{background:#f8f8f8;padding:2px 6px;border-radius:3px;font-family:monospace;color:#c0392b}a{color:#0073aa}`;
  const COMMENTS_CSS = `*,*::before,*::after{box-sizing:border-box}body{font-family:-apple-system,sans-serif;background:#f1f1f1;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.box{background:#fff;padding:2rem 2.5rem;border-radius:6px;border-left:4px solid #d63638;max-width:480px;box-shadow:0 2px 8px rgba(0,0,0,.1)}h1{color:#d63638;font-size:1.2rem;margin:0 0 1rem}a{color:#2271b1}`;
  const TEMPLATE_FALLBACK_CSS = `body{font-family:system-ui,sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem}`;
  const map = {
    "/cp-admin/css/admin.css": ADMIN_CSS,
    "/cp-admin/css/installer.css": INSTALLER_CSS,
    "/cp-includes/css/login.css": LOGIN_CSS,
    "/cp-includes/css/activate.css": ACTIVATE_CSS,
    "/cp-includes/css/signup.css": SIGNUP_CSS,
    "/cp-includes/css/error.css": ERROR_CSS,
    "/cp-includes/css/comments.css": COMMENTS_CSS,
    "/cp-includes/css/template-fallback.css": TEMPLATE_FALLBACK_CSS,
  };
  const css = map[path];
  if (!css) return new Response("Not found", { status: 404 });
  return cssResp(css);
}
__name(serveInlineCss, "serveInlineCss");
function forbidden() {
  return new Response("Forbidden", {
    status: 403,
    headers: { "Content-Type": "text/plain" }
  });
}
__name(forbidden, "forbidden");

// worker.js
init_cp_cron();
var worker_default = {
  /**
   * Handle HTTP requests.
   */
  async fetch(request, env, ctx) {
    return route(request, env, ctx);
  },
  /**
   * Handle Cloudflare Cron Triggers.
   */
  async scheduled(event, env, ctx) {
    return handleScheduled(event, env, ctx);
  }
};
export {
  worker_default as default
};
