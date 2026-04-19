/**
 * CloudPress Media Handler
 * Replaces WordPress wp-includes/media.php + upload handling
 *
 * [!]  R2 is NOT used.
 * Media files are stored as base64 blobs in D1 (cp_media table) for small files,
 * and in KV for files up to ~25 MB.
 * The table must be created by the installer (see cp-admin/installer.js).
 *
 * Schema (added to installer SQL):
 *   CREATE TABLE IF NOT EXISTS cp_media (
 *     media_id      INTEGER PRIMARY KEY AUTOINCREMENT,
 *     file_name     TEXT NOT NULL,
 *     file_path     TEXT NOT NULL UNIQUE,
 *     mime_type     TEXT NOT NULL DEFAULT 'application/octet-stream',
 *     file_size     INTEGER NOT NULL DEFAULT 0,
 *     width         INTEGER,
 *     height        INTEGER,
 *     post_id       INTEGER DEFAULT 0,
 *     uploaded_by   INTEGER DEFAULT 0,
 *     upload_date   TEXT NOT NULL,
 *     storage       TEXT NOT NULL DEFAULT 'kv',
 *     alt_text      TEXT DEFAULT '',
 *     caption       TEXT DEFAULT ''
 *   );
 *
 * KV key pattern: cp:media:<file_path>  -> base64 string
 *
 * @package CloudPress
 */

import { cpLoad } from '../cp-load.js';

// -- Public: serve media ------------------------------------------------------

/**
 * Serve a media file from KV/D1.
 * Handles requests to /uploads/* or /cp-content/uploads/*
 *
 * @param {Request} request
 * @param {object}  env
 * @param {object}  ctx
 * @returns {Promise<Response>}
 */
export async function handleMedia(request, env, ctx) {
  const url  = new URL(request.url);
  const path = url.pathname
    .replace(/^\/cp-content\/uploads\//, '')
    .replace(/^\/uploads\//, '');

  if (!path || path.includes('..')) {
    return new Response('Not Found', { status: 404 });
  }

  // Try KV first (fast)
  try {
    const b64 = await env.CP_KV.get(`cp:media:${path}`);
    if (b64) {
      const binary   = base64ToBinary(b64);
      const mimeType = guessMime(path);
      return new Response(binary, {
        headers: {
          'Content-Type':  mimeType,
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Content-Length': String(binary.byteLength),
        },
      });
    }
  } catch (_) {}

  // Fall back to D1 (inline data)
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
            'Content-Type':  row.mime_type,
            'Cache-Control': 'public, max-age=86400',
          },
        });
      }
    }
  } catch (_) {}

  return new Response('Not Found', { status: 404 });
}

// -- Upload --------------------------------------------------------------------

/**
 * Handle a media file upload from a multipart/form-data request.
 * Equivalent to wp_handle_upload().
 *
 * @param {object} cp
 * @param {File}   file      Web API File object from formData()
 * @param {number} [postId]  Attach to post
 * @returns {Promise<{ media_id: number, url: string, file_path: string }|{ error: string }>}
 */
export async function handleUpload(cp, file, postId = 0) {
  const MAX_SIZE = 5 * 1024 * 1024;  // 5 MB per file limit for KV values

  if (!file || !file.name) return { error: 'No file provided.' };
  if (file.size > MAX_SIZE) return { error: `File too large. Maximum size is ${MAX_SIZE / 1024 / 1024} MB.` };

  const allowed = getAllowedMimeTypes();
  const mime    = file.type || guessMime(file.name);

  if (!Object.values(allowed).includes(mime) && !mime.startsWith('image/')) {
    return { error: `File type "${mime}" is not allowed.` };
  }

  const prefix     = cp.db_prefix || 'cp_';
  const ext        = (file.name.split('.').pop() || '').toLowerCase();
  const safeName   = sanitizeFileName(file.name);
  const date       = new Date();
  const yearMonth  = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`;
  const uniqueName = `${Date.now()}-${safeName}`;
  const filePath   = `${yearMonth}/${uniqueName}`;
  const now        = date.toISOString().replace('T', ' ').slice(0, 19);

  // Read file to base64
  const buffer = await file.arrayBuffer();
  const b64    = binaryToBase64(buffer);

  // Store in KV
  try {
    await cp.kv.put(`cp:media:${filePath}`, b64);
  } catch (e) {
    return { error: `KV storage error: ${e.message}` };
  }

  // Record in D1
  const result = await cp.db.prepare(`
    INSERT INTO ${prefix}media
      (file_name, file_path, mime_type, file_size, post_id, uploaded_by, upload_date, storage)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'kv')
  `).bind(
    safeName, filePath, mime, file.size,
    postId, cp.currentUser?.ID || 0, now
  ).run();

  const mediaId = result.meta?.last_row_id || 0;
  const siteUrl = cp.config.SITE_URL || cp.url.origin;

  return {
    media_id:  mediaId,
    file_path: filePath,
    url:       `${siteUrl}/uploads/${filePath}`,
    mime_type: mime,
    file_size: file.size,
  };
}

/**
 * Get media library items.
 *
 * @param {object} cp
 * @param {object} args
 * @returns {Promise<object[]>}
 */
export async function getMediaItems(cp, args = {}) {
  const prefix  = cp.db_prefix || 'cp_';
  const limit   = Math.min(parseInt(args.limit || 40), 200);
  const offset  = parseInt(args.offset || 0);
  const mime    = args.mime_type || '';
  const postId  = args.post_id  || 0;

  const where  = [];
  const params = [];

  if (mime)   { where.push('mime_type LIKE ?'); params.push(`${mime}%`); }
  if (postId) { where.push('post_id=?');         params.push(postId); }

  const whereStr = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await cp.db.prepare(`
    SELECT media_id, file_name, file_path, mime_type, file_size, width, height,
           post_id, uploaded_by, upload_date, alt_text, caption
    FROM ${prefix}media ${whereStr}
    ORDER BY upload_date DESC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  const siteUrl = cp.config?.SITE_URL || '';
  return (rows.results || []).map(m => ({
    ...m,
    url: `${siteUrl}/uploads/${m.file_path}`,
  }));
}

/**
 * Delete a media item from KV + D1.
 *
 * @param {object} cp
 * @param {number} mediaId
 * @returns {Promise<boolean>}
 */
export async function deleteMedia(cp, mediaId) {
  const prefix = cp.db_prefix || 'cp_';
  const row    = await cp.db
    .prepare(`SELECT file_path FROM ${prefix}media WHERE media_id=? LIMIT 1`)
    .bind(mediaId).first();

  if (!row) return false;

  try { await cp.kv.delete(`cp:media:${row.file_path}`); } catch (_) {}
  await cp.db.prepare(`DELETE FROM ${prefix}media WHERE media_id=?`).bind(mediaId).run();
  return true;
}

// -- Allowed types -------------------------------------------------------------

/**
 * Get allowed upload MIME types.
 * Equivalent to get_allowed_mime_types().
 *
 * @returns {object}  { ext: mime, ... }
 */
export function getAllowedMimeTypes() {
  return {
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    png:  'image/png',
    gif:  'image/gif',
    webp: 'image/webp',
    svg:  'image/svg+xml',
    pdf:  'application/pdf',
    mp3:  'audio/mpeg',
    ogg:  'audio/ogg',
    mp4:  'video/mp4',
    webm: 'video/webm',
    txt:  'text/plain',
    csv:  'text/csv',
    zip:  'application/zip',
  };
}

// -- Internals -----------------------------------------------------------------

function guessMime(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const map = getAllowedMimeTypes();
  return map[ext] || 'application/octet-stream';
}

function sanitizeFileName(name) {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function binaryToBase64(buffer) {
  const bytes  = new Uint8Array(buffer);
  let binary   = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBinary(b64) {
  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
