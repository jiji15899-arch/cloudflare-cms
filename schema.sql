-- CloudPress CMS — schema.sql
-- D1 (SQLite) 스키마 — 기본 테이블 prefix: cp_
--
-- 실행 방법:
--   wrangler d1 execute cloudpress-db --file=schema.sql --remote
--
-- prefix를 바꾸고 싶으면 cp_ 를 원하는 값으로 일괄 치환 후 실행.
-- 인스톨러(/cp-admin/setup-config → /cp-admin/install)를 통해
-- 자동 실행되므로 직접 실행하지 않아도 됩니다.

-- ── cp_posts ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_posts (
  ID                    INTEGER PRIMARY KEY AUTOINCREMENT,
  post_author           INTEGER NOT NULL DEFAULT 0,
  post_date             TEXT    NOT NULL DEFAULT '',
  post_date_gmt         TEXT    NOT NULL DEFAULT '',
  post_content          TEXT    NOT NULL DEFAULT '',
  post_title            TEXT    NOT NULL DEFAULT '',
  post_excerpt          TEXT    NOT NULL DEFAULT '',
  post_status           TEXT    NOT NULL DEFAULT 'publish',
  comment_status        TEXT    NOT NULL DEFAULT 'open',
  ping_status           TEXT    NOT NULL DEFAULT 'open',
  post_password         TEXT    NOT NULL DEFAULT '',
  post_name             TEXT    NOT NULL DEFAULT '',
  to_ping               TEXT    NOT NULL DEFAULT '',
  pinged                TEXT    NOT NULL DEFAULT '',
  post_modified         TEXT    NOT NULL DEFAULT '',
  post_modified_gmt     TEXT    NOT NULL DEFAULT '',
  post_content_filtered TEXT    NOT NULL DEFAULT '',
  post_parent           INTEGER NOT NULL DEFAULT 0,
  guid                  TEXT    NOT NULL DEFAULT '',
  menu_order            INTEGER NOT NULL DEFAULT 0,
  post_type             TEXT    NOT NULL DEFAULT 'post',
  post_mime_type        TEXT    NOT NULL DEFAULT '',
  comment_count         INTEGER NOT NULL DEFAULT 0
);

-- ── cp_postmeta ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_postmeta (
  meta_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL DEFAULT 0,
  meta_key   TEXT    DEFAULT NULL,
  meta_value TEXT
);

-- ── cp_users ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_users (
  ID                   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_login           TEXT    NOT NULL DEFAULT '',
  user_pass            TEXT    NOT NULL DEFAULT '',
  user_nicename        TEXT    NOT NULL DEFAULT '',
  user_email           TEXT    NOT NULL DEFAULT '',
  user_url             TEXT    NOT NULL DEFAULT '',
  user_registered      TEXT    NOT NULL DEFAULT '',
  user_activation_key  TEXT    NOT NULL DEFAULT '',
  user_status          INTEGER NOT NULL DEFAULT 0,
  display_name         TEXT    NOT NULL DEFAULT ''
);

-- ── cp_usermeta ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_usermeta (
  umeta_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL DEFAULT 0,
  meta_key   TEXT    DEFAULT NULL,
  meta_value TEXT
);

-- ── cp_options ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_options (
  option_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  option_name  TEXT    NOT NULL DEFAULT '',
  option_value TEXT    NOT NULL DEFAULT '',
  autoload     TEXT    NOT NULL DEFAULT 'yes',
  UNIQUE(option_name)
);

-- ── cp_terms ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_terms (
  term_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL DEFAULT '',
  slug       TEXT    NOT NULL DEFAULT '',
  term_group INTEGER NOT NULL DEFAULT 0
);

-- ── cp_term_taxonomy ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_term_taxonomy (
  term_taxonomy_id INTEGER PRIMARY KEY AUTOINCREMENT,
  term_id          INTEGER NOT NULL DEFAULT 0,
  taxonomy         TEXT    NOT NULL DEFAULT '',
  description      TEXT    NOT NULL DEFAULT '',
  parent           INTEGER NOT NULL DEFAULT 0,
  count            INTEGER NOT NULL DEFAULT 0
);

-- ── cp_term_relationships ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_term_relationships (
  object_id        INTEGER NOT NULL DEFAULT 0,
  term_taxonomy_id INTEGER NOT NULL DEFAULT 0,
  term_order       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (object_id, term_taxonomy_id)
);

-- ── cp_comments ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_comments (
  comment_ID          INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_post_ID     INTEGER NOT NULL DEFAULT 0,
  comment_author      TEXT    NOT NULL DEFAULT '',
  comment_author_email TEXT   NOT NULL DEFAULT '',
  comment_author_url  TEXT    NOT NULL DEFAULT '',
  comment_author_IP   TEXT    NOT NULL DEFAULT '',
  comment_date        TEXT    NOT NULL DEFAULT '',
  comment_date_gmt    TEXT    NOT NULL DEFAULT '',
  comment_content     TEXT    NOT NULL DEFAULT '',
  comment_karma       INTEGER NOT NULL DEFAULT 0,
  comment_approved    TEXT    NOT NULL DEFAULT '1',
  comment_agent       TEXT    NOT NULL DEFAULT '',
  comment_type        TEXT    NOT NULL DEFAULT 'comment',
  comment_parent      INTEGER NOT NULL DEFAULT 0,
  user_id             INTEGER NOT NULL DEFAULT 0
);

-- ── cp_commentmeta ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_commentmeta (
  meta_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL DEFAULT 0,
  meta_key   TEXT    DEFAULT NULL,
  meta_value TEXT
);

-- ── cp_links ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_links (
  link_id          INTEGER PRIMARY KEY AUTOINCREMENT,
  link_url         TEXT    NOT NULL DEFAULT '',
  link_name        TEXT    NOT NULL DEFAULT '',
  link_image       TEXT    NOT NULL DEFAULT '',
  link_target      TEXT    NOT NULL DEFAULT '',
  link_description TEXT    NOT NULL DEFAULT '',
  link_visible     TEXT    NOT NULL DEFAULT 'Y',
  link_owner       INTEGER NOT NULL DEFAULT 1,
  link_rating      INTEGER NOT NULL DEFAULT 0,
  link_updated     TEXT    NOT NULL DEFAULT '',
  link_rel         TEXT    NOT NULL DEFAULT '',
  link_notes       TEXT    NOT NULL DEFAULT '',
  link_rss         TEXT    NOT NULL DEFAULT ''
);

-- ── cp_media ───────────────────────────────────────────────────────────────
-- Media stored in KV (base64). This table holds metadata only.
CREATE TABLE IF NOT EXISTS cp_media (
  media_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name     TEXT    NOT NULL,
  file_path     TEXT    NOT NULL UNIQUE,
  mime_type     TEXT    NOT NULL DEFAULT 'application/octet-stream',
  file_size     INTEGER NOT NULL DEFAULT 0,
  width         INTEGER,
  height        INTEGER,
  post_id       INTEGER DEFAULT 0,
  uploaded_by   INTEGER DEFAULT 0,
  upload_date   TEXT    NOT NULL DEFAULT '',
  storage       TEXT    NOT NULL DEFAULT 'kv',
  alt_text      TEXT    DEFAULT '',
  caption       TEXT    DEFAULT ''
);

-- ── cp_cron_events ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_cron_events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  schedule  TEXT,
  hook      TEXT    NOT NULL,
  args      TEXT    NOT NULL DEFAULT '[]'
);

-- ── 인덱스 ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS cp_posts_post_name         ON cp_posts(post_name);
CREATE INDEX IF NOT EXISTS cp_posts_post_type_status  ON cp_posts(post_type, post_status);
CREATE INDEX IF NOT EXISTS cp_posts_post_author       ON cp_posts(post_author);
CREATE INDEX IF NOT EXISTS cp_postmeta_post_id        ON cp_postmeta(post_id);
CREATE INDEX IF NOT EXISTS cp_postmeta_meta_key       ON cp_postmeta(meta_key);
CREATE INDEX IF NOT EXISTS cp_users_user_login        ON cp_users(user_login);
CREATE INDEX IF NOT EXISTS cp_users_user_email        ON cp_users(user_email);
CREATE INDEX IF NOT EXISTS cp_usermeta_user_id        ON cp_usermeta(user_id);
CREATE INDEX IF NOT EXISTS cp_usermeta_meta_key       ON cp_usermeta(meta_key);
CREATE INDEX IF NOT EXISTS cp_options_autoload        ON cp_options(autoload);
CREATE INDEX IF NOT EXISTS cp_terms_slug              ON cp_terms(slug);
CREATE INDEX IF NOT EXISTS cp_term_taxonomy_taxonomy  ON cp_term_taxonomy(taxonomy);
CREATE INDEX IF NOT EXISTS cp_term_rels_tid           ON cp_term_relationships(term_taxonomy_id);
CREATE INDEX IF NOT EXISTS cp_comments_post_id        ON cp_comments(comment_post_ID);
CREATE INDEX IF NOT EXISTS cp_comments_approved       ON cp_comments(comment_approved);
CREATE INDEX IF NOT EXISTS cp_commentmeta_comment_id  ON cp_commentmeta(comment_id);
CREATE INDEX IF NOT EXISTS cp_cron_events_ts          ON cp_cron_events(timestamp);
CREATE INDEX IF NOT EXISTS cp_media_file_path         ON cp_media(file_path);
CREATE INDEX IF NOT EXISTS cp_media_post_id           ON cp_media(post_id);

-- ── 기본 카테고리 ─────────────────────────────────────────────────────────
-- 인스톨러가 실행 시 삽입하므로 여기서는 IF NOT EXISTS 방식으로 삽입하지 않음.
-- 직접 실행하려면 아래 주석을 해제하세요:
--
-- INSERT OR IGNORE INTO cp_terms (name, slug, term_group) VALUES ('Uncategorized', 'uncategorized', 0);
-- INSERT OR IGNORE INTO cp_term_taxonomy (term_id, taxonomy, description, parent, count)
--   SELECT term_id, 'category', '', 0, 1 FROM cp_terms WHERE slug='uncategorized' LIMIT 1;
-- INSERT OR IGNORE INTO cp_options (option_name, option_value, autoload) VALUES
--   ('siteurl',             'http://localhost', 'yes'),
--   ('blogname',            'CloudPress Site',  'yes'),
--   ('blogdescription',     'Just another CloudPress site', 'yes'),
--   ('blogcharset',         'UTF-8',            'yes'),
--   ('posts_per_page',      '10',               'yes'),
--   ('permalink_structure', '/%year%/%monthnum%/%postname%/', 'yes'),
--   ('template',            'default',          'yes'),
--   ('stylesheet',          'default',          'yes'),
--   ('active_plugins',      '[]',               'yes');
