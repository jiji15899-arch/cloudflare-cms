/**
 * CloudPress Admin - Tools
 * Replaces WordPress wp-admin/tools.php
 * @package CloudPress
 */

import { renderAdminShell } from '../admin-shell.js';

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export async function handleTools(request, cp) {
  const method = request.method.toUpperCase();
  const prefix = cp.db_prefix || 'cp_';
  let notice   = null;

  if (method === 'POST') {
    const fd     = await request.formData().catch(() => new FormData());
    const action = fd.get('action') || '';

    if (action === 'flush_kv') {
      // 완전 KV 캐시 제거: 모든 cp: 접두사 키를 열거 후 삭제
      const PURGE_PREFIXES = [
        'cp:themes:list',
        'cp:template:',
        'cp:theme:meta:',
        'cp:option:',
        'cp:post:',
        'cp:query:',
        'cp:update:',
        'cp:transient:',
        'cp:doing_cron',
      ];

      // 단일 키 삭제
      const singleKeys = PURGE_PREFIXES.filter(k => !k.endsWith(':'));
      for (const k of singleKeys) {
        try { await cp.kv.delete(k); } catch (_) {}
      }

      // 접두사 기반 열거 삭제
      const prefixKeys = PURGE_PREFIXES.filter(k => k.endsWith(':'));
      let totalDeleted = 0;
      for (const prefix of prefixKeys) {
        try {
          let cursor;
          do {
            const opts = cursor ? { prefix, cursor } : { prefix };
            const listResult = await cp.kv.list(opts);
            for (const key of (listResult.keys || [])) {
              await cp.kv.delete(key.name).catch(() => {});
              totalDeleted++;
            }
            cursor = listResult.list_complete ? null : listResult.cursor;
          } while (cursor);
        } catch (_) {}
      }
      notice = { type: 'success', message: `캐시 완전 삭제 완료. KV 키 ${totalDeleted}개 제거됨 (옵션·템플릿·테마·포스트·트랜지언트 포함).` };
    }

    if (action === 'recount_terms') {
      try {
        const terms = await cp.db.prepare(
          `SELECT tt.term_taxonomy_id, tt.term_id, tt.taxonomy FROM ${prefix}term_taxonomy tt`
        ).all();
        for (const tt of (terms.results || [])) {
          const count = await cp.db.prepare(
            `SELECT COUNT(*) as n FROM ${prefix}term_relationships tr
             JOIN ${prefix}posts p ON p.ID=tr.object_id
             WHERE tr.term_taxonomy_id=? AND p.post_status='publish'`
          ).bind(tt.term_taxonomy_id).first();
          await cp.db.prepare(
            `UPDATE ${prefix}term_taxonomy SET count=? WHERE term_taxonomy_id=?`
          ).bind(count?.n || 0, tt.term_taxonomy_id).run();
        }
        notice = { type: 'success', message: 'Term counts updated.' };
      } catch (e) {
        notice = { type: 'error', message: `Error: ${e.message}` };
      }
    }

    if (action === 'delete_orphaned_meta') {
      try {
        await cp.db.prepare(
          `DELETE FROM ${prefix}postmeta WHERE post_id NOT IN (SELECT ID FROM ${prefix}posts)`
        ).run();
        await cp.db.prepare(
          `DELETE FROM ${prefix}commentmeta WHERE comment_id NOT IN (SELECT comment_ID FROM ${prefix}comments)`
        ).run();
        notice = { type: 'success', message: 'Orphaned meta data deleted.' };
      } catch (e) {
        notice = { type: 'error', message: `Error: ${e.message}` };
      }
    }

    if (action === 'run_cron') {
      try {
        const { handleScheduled } = await import('../../cp-cron.js');
        await handleScheduled({ scheduledTime: Date.now(), cron: 'manual' }, cp.env, cp.ctx);
        notice = { type: 'success', message: 'Cron tasks executed manually.' };
      } catch (e) {
        notice = { type: 'error', message: `Cron error: ${e.message}` };
      }
    }
  }

  // DB stats
  let dbStats = null;
  try {
    const [postCount, commentCount, termCount, userCount, mediaCount] = await Promise.all([
      cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}posts WHERE post_status != 'trash'`).first(),
      cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}comments`).first(),
      cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}terms`).first(),
      cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}users`).first(),
      cp.db.prepare(`SELECT COUNT(*) as n FROM ${prefix}media`).first().catch(() => ({ n: 0 })),
    ]);
    dbStats = { posts: postCount?.n||0, comments: commentCount?.n||0, terms: termCount?.n||0, users: userCount?.n||0, media: mediaCount?.n||0 };
  } catch (_) {}

  const content = `
<div class="cp-card" style="max-width:720px">
  <h1>Tools</h1>

  ${dbStats ? `
  <div style="background:#f9f9f9;border:1px solid #e0e0e0;border-radius:8px;padding:16px;margin-bottom:24px">
    <h3 style="margin:0 0 12px;font-size:15px">Database Stats</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px;text-align:center">
      ${[['Posts',dbStats.posts],['Comments',dbStats.comments],['Terms',dbStats.terms],['Users',dbStats.users],['Media',dbStats.media]].map(([l,n])=>`
      <div style="background:#fff;border:1px solid #ddd;border-radius:6px;padding:12px">
        <div style="font-size:1.5rem;font-weight:700;color:#0073aa">${n}</div>
        <div style="font-size:12px;color:#666">${l}</div>
      </div>`).join('')}
    </div>
  </div>` : ''}

  <div style="display:grid;gap:16px">

    <div style="border:1px solid #ddd;border-radius:8px;padding:18px">
      <h3 style="margin:0 0 6px">🗑️ 전체 캐시 완전 삭제 (DNS 캐시 포함)</h3>
      <p style="color:#666;font-size:13px;margin:0 0 12px">KV에 저장된 <strong>모든 캐시</strong>를 삭제합니다. 옵션 캐시·템플릿 캐시·테마 캐시·포스트 캐시·트랜지언트 등 이전 버전 잔류 항목까지 완전 제거됩니다. 업데이트 직후 또는 레이아웃이 이상할 때 실행하세요.</p>
      <form method="post" onsubmit="return confirm('모든 KV 캐시를 삭제합니다. 계속하시겠습니까?')">
        <input type="hidden" name="action" value="flush_kv">
        <button type="submit" class="cp-btn cp-btn-danger">전체 캐시 삭제</button>
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
    await renderAdminShell(cp, content, { title: 'Tools', notices: notice ? [notice] : [] }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
