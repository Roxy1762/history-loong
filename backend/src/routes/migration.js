/**
 * Migration Routes
 *
 * Two route groups are exported:
 *   - adminRouter:  admin-protected endpoints for export/import/tokens
 *                   (mounted under /api/admin/migration)
 *   - publicRouter: token-protected snapshot endpoint used by another server
 *                   to pull state during online migration
 *                   (mounted under /api/migration)
 */

const express = require('express');
const multer  = require('multer');
const migrationSvc = require('../services/migrationService');
const authSvc = require('../services/authService');
const db = require('../db');

const adminRouter  = express.Router();
const publicRouter = express.Router();

// 200 MB upper bound for the JSON snapshot upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

const rp = (section, action) => authSvc.requirePermission(section, action);

// ── Admin: export full snapshot ───────────────────────────────────────────────

adminRouter.get('/export', rp('migration', 'manage'), (_req, res) => {
  console.log('[Migration] GET /export');
  try {
    const snapshot = migrationSvc.buildSnapshot({ includeAvatars: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `history-loong-snapshot_${ts}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(snapshot));
  } catch (err) {
    console.error('[Migration] Export failed:', err);
    res.status(500).json({ error: err.message || '导出失败' });
  }
});

// ── Admin: summary (counts only) ──────────────────────────────────────────────

adminRouter.get('/summary', rp('migration', 'manage'), (_req, res) => {
  try {
    const snap = migrationSvc.buildSnapshot({ includeAvatars: false });
    res.json({
      version: snap.version,
      counts: snap.counts,
      avatarCount: (require('fs').existsSync && require('../utils/avatarStorage'))
        ? null : 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || '获取摘要失败' });
  }
});

// ── Admin: import snapshot from uploaded file ─────────────────────────────────

adminRouter.post('/import', rp('migration', 'manage'), upload.single('snapshot'), (req, res) => {
  console.log('[Migration] POST /import');
  try {
    let payload;
    if (req.file && req.file.buffer) {
      payload = JSON.parse(req.file.buffer.toString('utf-8'));
    } else if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
      payload = req.body;
    } else {
      return res.status(400).json({ error: '请上传迁移文件' });
    }

    const summary = migrationSvc.restoreSnapshot(payload);
    return res.json({
      ok: true,
      summary,
      note: '导入成功。所有 Token 与管理员密钥已同步，请使用源端凭据重新登录。',
    });
  } catch (err) {
    console.error('[Migration] Import failed:', err);
    return res.status(400).json({ error: err.message || '导入失败' });
  }
});

// ── Admin: import from a remote server using a token ──────────────────────────

adminRouter.post('/pull', rp('migration', 'manage'), async (req, res) => {
  const { sourceUrl, token } = req.body || {};
  if (!sourceUrl || !token) return res.status(400).json({ error: '请提供源服务器地址和迁移 Token' });

  let base;
  try {
    base = new URL(String(sourceUrl).trim()).toString().replace(/\/+$/, '');
  } catch {
    return res.status(400).json({ error: '源服务器地址无效' });
  }

  const target = `${base}/api/migration/snapshot?token=${encodeURIComponent(token)}`;
  console.log(`[Migration] POST /pull from ${base}`);

  try {
    const r = await fetch(target, { method: 'GET' });
    if (!r.ok) {
      let msg = `源服务器返回 ${r.status}`;
      try {
        const j = await r.json();
        if (j && j.error) msg = j.error;
      } catch { /* not JSON */ }
      return res.status(400).json({ error: msg });
    }
    const snapshot = await r.json();
    const summary = migrationSvc.restoreSnapshot(snapshot);
    return res.json({
      ok: true,
      summary,
      note: '在线迁移完成。请使用源服务器的凭据重新登录。',
    });
  } catch (err) {
    console.error('[Migration] Pull failed:', err);
    return res.status(500).json({ error: err.message || '拉取失败' });
  }
});

// ── Admin: token management ───────────────────────────────────────────────────

adminRouter.get('/tokens', rp('migration', 'manage'), (_req, res) => {
  res.json({ tokens: migrationSvc.listTokens() });
});

adminRouter.post('/tokens', rp('migration', 'manage'), (req, res) => {
  const { ttlMinutes, note } = req.body || {};
  const entry = migrationSvc.createToken({ ttlMinutes, note });
  res.json({
    token: entry.token,
    createdAt: entry.createdAt,
    expiresAt: entry.expiresAt,
    note: entry.note,
  });
});

adminRouter.delete('/tokens/:token', rp('migration', 'manage'), (req, res) => {
  migrationSvc.revokeToken(req.params.token);
  res.json({ ok: true });
});

// ── Public: snapshot pull endpoint, gated by temporary token ──────────────────
//
// This route is intentionally NOT behind admin auth — it is the only way an
// outside server can fetch state. Access is controlled solely by the token,
// which is short-lived and revocable from the admin UI.

publicRouter.get('/snapshot', (req, res) => {
  const token = req.query.token || req.headers['x-migration-token'];
  if (!token) return res.status(401).json({ error: '缺少迁移 Token' });
  const entry = migrationSvc.consumeToken(String(token));
  if (!entry) return res.status(401).json({ error: '迁移 Token 无效或已过期' });

  console.log(`[Migration] Public snapshot requested with token ${entry.token.slice(0, 12)}…`);
  try {
    const snapshot = migrationSvc.buildSnapshot({ includeAvatars: true });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(snapshot));
  } catch (err) {
    console.error('[Migration] Public snapshot failed:', err);
    res.status(500).json({ error: err.message || '导出失败' });
  }
});

publicRouter.get('/ping', (_req, res) => {
  res.json({ ok: true, service: 'history-loong-migration', version: migrationSvc.SNAPSHOT_VERSION });
});

module.exports = { adminRouter, publicRouter };
