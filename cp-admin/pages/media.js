/**
 * CloudPress Admin - Media Library
 * Replaces WordPress wp-admin/upload.php
 *
 * @package CloudPress
 */

import { renderAdminShell }           from '../admin-shell.js';
import { handleUpload, getMediaItems, deleteMedia } from '../../cp-includes/media-handler.js';

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1048576).toFixed(1)} MB`;
}

export async function handleMedia(request, cp) {
  const method = request.method.toUpperCase();
  const url    = new URL(request.url);
  let notice   = null;

  // Upload
  if (method === 'POST') {
    const ct = request.headers.get('Content-Type') || '';
    if (ct.includes('multipart/form-data')) {
      const fd     = await request.formData().catch(() => new FormData());
      const action = fd.get('action') || '';
      if (action === 'delete') {
        const id = parseInt(fd.get('media_id') || 0);
        if (id) {
          await deleteMedia(cp, id);
          notice = { type: 'success', message: 'Media file deleted.' };
        }
      } else {
        const file = fd.get('file');
        if (file && file.name) {
          const result = await handleUpload(cp, file);
          if (result.error) {
            notice = { type: 'error', message: result.error };
          } else {
            notice = { type: 'success', message: `File uploaded: <a href="${esc(result.url)}" target="_blank">${esc(result.file_path)}</a>` };
          }
        }
      }
    }
  }

  const page   = Math.max(1, parseInt(url.searchParams.get('paged') || 1));
  const limit  = 20;
  const items  = await getMediaItems(cp, { limit, offset: (page - 1) * limit });
  const siteUrl = cp.config?.SITE_URL || cp.url.origin;

  const gridHtml = items.map(m => {
    const isImg = m.mime_type?.startsWith('image/');
    const thumb = isImg
      ? `<img src="${esc(m.url)}" alt="${esc(m.alt_text)}" style="width:100%;height:100%;object-fit:cover;border-radius:4px">`
      : `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:2rem;color:#888">&#128196;</div>`;
    return `
  <div class="cp-media-item" style="position:relative;background:#f0f0f0;border-radius:6px;overflow:hidden;aspect-ratio:1">
    <a href="${esc(m.url)}" target="_blank" style="display:block;height:100%">${thumb}</a>
    <div style="padding:4px 6px;background:#fff;border-top:1px solid #e0e0e0;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(m.file_name)}">
      ${esc(m.file_name)}
    </div>
    <form method="post" style="margin:0" onsubmit="return confirm('Delete this file?')">
      <input type="hidden" name="action" value="delete">
      <input type="hidden" name="media_id" value="${m.media_id}">
      <button type="submit" title="Delete" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,.6);border:none;color:#fff;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:12px;line-height:22px;padding:0">&#10005;</button>
    </form>
  </div>`;
  }).join('');

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

  ${items.length === limit ? `<div style="margin-top:16px;text-align:right"><a href="?paged=${page+1}" class="cp-btn cp-btn-secondary">Next Page &raquo;</a></div>` : ''}
  ${page > 1 ? `<div style="margin-top:16px"><a href="?paged=${page-1}" class="cp-btn cp-btn-secondary">&laquo; Previous</a></div>` : ''}
</div>`;

  return new Response(
    await renderAdminShell(cp, content, { title: 'Media Library', notices: notice ? [notice] : [] }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
