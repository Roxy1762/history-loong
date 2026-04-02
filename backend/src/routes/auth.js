const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const authSvc = require('../services/authService');
const db = require('../db');
const { resolveAvatarsDir } = require('../utils/avatarStorage');

// ── Avatar upload setup ───────────────────────────────────────────────────────

const AVATARS_DIR = resolveAvatarsDir(path.join(__dirname, '../../../data/avatars'));

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter(_req, file, cb) {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('只支持 JPG / PNG / GIF / WebP 格式'));
    }
  },
});

function parseDbDateMs(value) {
  if (!value || typeof value !== 'string') return NaN;
  // SQLite datetime('now') is "YYYY-MM-DD HH:MM:SS" (UTC), normalize to ISO 8601.
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  return Date.parse(normalized);
}

// ── Public: Register ──────────────────────────────────────────────────────────

router.post('/register', async (req, res) => {
  const { username, password } = req.body || {};
  const result = await authSvc.register(username, password);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

// ── Public: Login ─────────────────────────────────────────────────────────────

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  const result = await authSvc.login(username, password);
  if (result.error) return res.status(401).json({ error: result.error });
  res.json(result);
});

// ── Authenticated: Get current user ──────────────────────────────────────────

router.get('/me', authSvc.requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ── Authenticated: Update profile ─────────────────────────────────────────────

router.patch('/me', authSvc.requireAuth, async (req, res) => {
  const { nickname, avatar_color, avatar_emoji, avatar_type, username } = req.body || {};

  // Username self-service change (admin-configurable cooldown)
  if (username != null) {
    const user = db.getUserById.get(req.userId);
    const cooldownDays = parseInt(db.getSetting.get('username_change_cooldown_days')?.value ?? '30', 10);
    if (cooldownDays > 0 && user.username_changed_at) {
      const COOLDOWN_MS = cooldownDays * 24 * 60 * 60 * 1000;
      const changedAtMs = parseDbDateMs(user.username_changed_at);
      const elapsed = Number.isFinite(changedAtMs) ? Date.now() - changedAtMs : Number.POSITIVE_INFINITY;
      if (elapsed < COOLDOWN_MS) {
        const daysLeft = Math.ceil((COOLDOWN_MS - elapsed) / (24 * 60 * 60 * 1000));
        return res.status(400).json({ error: `用户名修改冷却中，还需等待 ${daysLeft} 天` });
      }
    }
    const trimmed = String(username).trim();
    if (!trimmed || trimmed.length < 2 || trimmed.length > 30) {
      return res.status(400).json({ error: '用户名须为 2–30 个字符' });
    }
    if (!/^[\w\u4e00-\u9fa5\-_.@]+$/.test(trimmed)) {
      return res.status(400).json({ error: '用户名只能包含字母、数字、中文、下划线、短横线、点或 @' });
    }
    const existing = db.getUserByUsername.get(trimmed);
    if (existing && existing.id !== req.userId) {
      return res.status(400).json({ error: '用户名已被注册' });
    }
    db.updateUserUsername.run(trimmed, req.userId);
  }

  const result = await authSvc.updateProfile(req.userId, { nickname, avatar_color, avatar_emoji, avatar_type });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

// ── Authenticated: Change password ────────────────────────────────────────────

router.post('/change-password', authSvc.requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const result = await authSvc.changePassword(req.userId, currentPassword, newPassword);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

// ── Authenticated: Upload avatar image ────────────────────────────────────────

router.post('/avatar', authSvc.requireAuth, (req, res, next) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || '上传失败' });
    next();
  });
}, (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传图片文件（JPG/PNG/GIF/WebP）' });

  if (!AVATARS_DIR) {
    return res.status(503).json({ error: '头像存储不可用，请联系管理员' });
  }

  const mimeExt = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };
  const ext = mimeExt[req.file.mimetype] || 'jpg';
  const filename = `${req.userId}.${ext}`;

  // Remove any previous avatar files for this user
  ['jpg', 'png', 'gif', 'webp'].forEach(e => {
    const old = path.join(AVATARS_DIR, `${req.userId}.${e}`);
    try { fs.unlinkSync(old); } catch { /* ignore */ }
  });

  fs.writeFileSync(path.join(AVATARS_DIR, filename), req.file.buffer);

  const avatarUrl = `/avatars/${filename}`;
  db.updateUserAvatarUrl.run(avatarUrl, req.userId);

  const user = db.getUserById.get(req.userId);
  return res.json({ user: authSvc.sanitize(user) });
});

// ── Authenticated: Remove avatar image (revert to text/emoji) ─────────────────

router.delete('/avatar', authSvc.requireAuth, (req, res) => {
  if (!AVATARS_DIR) {
    return res.status(503).json({ error: '头像存储不可用，请联系管理员' });
  }

  const user = db.getUserById.get(req.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  // Remove saved file
  ['jpg', 'png', 'gif', 'webp'].forEach(e => {
    const old = path.join(AVATARS_DIR, `${req.userId}.${e}`);
    try { fs.unlinkSync(old); } catch { /* ignore */ }
  });

  // Revert to emoji type, clear avatar_url
  db.db.prepare(`UPDATE users SET avatar_url=NULL, avatar_type='emoji', updated_at=datetime('now') WHERE id=?`).run(req.userId);
  return res.json({ user: authSvc.sanitize(db.getUserById.get(req.userId)) });
});

// ── Public: Get username change cooldown setting ──────────────────────────────

router.get('/settings/username-cooldown', (_req, res) => {
  const days = parseInt(db.getSetting.get('username_change_cooldown_days')?.value ?? '30', 10);
  res.json({ cooldownDays: days });
});

module.exports = router;
