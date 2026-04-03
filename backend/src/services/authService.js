const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const JWT_EXPIRES = '30d';
const BCRYPT_ROUNDS = 10;

// ── Dynamic secret loading (DB > env > fallback) ──────────────────────────────

function getJwtSecret() {
  try {
    const row = db.getSetting.get('jwt_secret');
    if (row && row.value && row.value.trim().length >= 16) return row.value.trim();
  } catch { /* DB not ready */ }
  return process.env.JWT_SECRET || 'history-loong-jwt-secret-change-in-production';
}

function getAdminKey() {
  try {
    const row = db.getSetting.get('admin_key');
    if (row && row.value && row.value.trim()) return row.value.trim();
  } catch { /* DB not ready */ }
  return process.env.ADMIN_KEY || 'admin';
}

// ── Token helpers ─────────────────────────────────────────────────────────────

function generateToken(userId) {
  return jwt.sign({ sub: userId }, getJwtSecret(), { expiresIn: JWT_EXPIRES });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, getJwtSecret());
  } catch {
    return null;
  }
}

// ── Auth operations ───────────────────────────────────────────────────────────

async function register(username, password) {
  const trimmed = (username || '').trim();
  if (!trimmed || trimmed.length < 2 || trimmed.length > 30) {
    return { error: '用户名须为 2–30 个字符' };
  }
  if (!/^[\w\u4e00-\u9fa5\-_.@]+$/.test(trimmed)) {
    return { error: '用户名只能包含字母、数字、中文、下划线、短横线、点或 @' };
  }
  if (!password || password.length < 6) {
    return { error: '密码至少 6 位' };
  }

  const existing = db.getUserByUsername.get(trimmed);
  if (existing) return { error: '用户名已被注册' };

  const id = `u_${uuidv4().replace(/-/g, '')}`;
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Assign next sequential uid
  const { max } = db.getMaxUid.get();
  const uid = max + 1;

  // Default avatar_type is 'text' (文字头像) for new registrations
  db.insertUser.run(id, trimmed, hash, trimmed, '#6366f1', '🐉', 'text', uid);
  const user = db.getUserById.get(id);
  const token = generateToken(id);
  return { user: sanitize(user), token };
}

async function login(username, password) {
  const trimmed = (username || '').trim();
  if (!trimmed || !password) return { error: '请填写用户名和密码' };

  const user = db.getUserByUsername.get(trimmed);
  if (!user) return { error: '用户名或密码错误' };

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return { error: '用户名或密码错误' };

  // Record login time and count
  db.recordUserLogin.run(user.id);

  const token = generateToken(user.id);
  return { user: sanitize(db.getUserById.get(user.id)), token };
}

function getById(userId) {
  const user = db.getUserById.get(userId);
  if (!user) return null;
  return sanitize(user);
}

async function updateProfile(userId, { nickname, avatar_color, avatar_emoji, avatar_type }) {
  const user = db.getUserById.get(userId);
  if (!user) return { error: '用户不存在' };

  const newNickname = nickname != null ? String(nickname).trim().slice(0, 20) || user.nickname : user.nickname;
  const newColor = avatar_color || user.avatar_color;
  const newEmoji = avatar_emoji !== undefined ? avatar_emoji : user.avatar_emoji;
  const newAvatarType = avatar_type || user.avatar_type || 'text';

  db.updateUser.run(newNickname, newColor, newEmoji, newAvatarType, userId);
  return { user: sanitize(db.getUserById.get(userId)) };
}

async function changePassword(userId, currentPassword, newPassword) {
  const user = db.getUserById.get(userId);
  if (!user) return { error: '用户不存在' };

  const ok = await bcrypt.compare(currentPassword, user.password_hash);
  if (!ok) return { error: '当前密码不正确' };

  if (!newPassword || newPassword.length < 6) return { error: '新密码至少 6 位' };

  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  db.updateUserPassword.run(hash, userId);
  return { ok: true };
}

// ── Admin operations ──────────────────────────────────────────────────────────

function listUsers() {
  return db.listUsers.all();
}

async function adminResetPassword(userId, newPassword = '000000') {
  const user = db.getUserById.get(userId);
  if (!user) return { error: '用户不存在' };
  const pwd = newPassword || '000000';
  if (pwd.length < 6) return { error: '新密码至少 6 位' };
  const hash = await bcrypt.hash(pwd, BCRYPT_ROUNDS);
  db.updateUserPassword.run(hash, userId);
  return { ok: true };
}

async function adminUpdateUser(userId, { username, nickname, uid }) {
  const user = db.getUserById.get(userId);
  if (!user) return { error: '用户不存在' };

  if (username != null) {
    const trimmed = String(username).trim();
    if (!trimmed || trimmed.length < 2 || trimmed.length > 30) return { error: '用户名须为 2–30 个字符' };
    if (!/^[\w\u4e00-\u9fa5\-_.@]+$/.test(trimmed)) return { error: '用户名格式不合法' };
    const existing = db.getUserByUsername.get(trimmed);
    if (existing && existing.id !== userId) return { error: '用户名已被注册' };
    db.updateUserUsername.run(trimmed, userId);
  }

  if (nickname != null) {
    const newNickname = String(nickname).trim().slice(0, 20);
    const cur = db.getUserById.get(userId);
    db.updateUser.run(newNickname, cur.avatar_color, cur.avatar_emoji, cur.avatar_type || 'text', userId);
  }

  if (uid != null) {
    const numUid = Math.trunc(Number(uid));
    if (!Number.isFinite(numUid) || numUid < 1) return { error: 'UID 必须为正整数' };
    const existing = db.getUserByUid.get(numUid);
    if (existing && existing.id !== userId) return { error: 'UID 已被占用' };
    db.updateUserUid.run(numUid, userId);
  }

  return { user: sanitize(db.getUserById.get(userId)) };
}

function adminDeleteUser(userId) {
  const user = db.getUserById.get(userId);
  if (!user) return { error: '用户不存在' };
  db.deleteUser.run(userId);
  return { ok: true };
}

// ── Role management ───────────────────────────────────────────────────────────

function setUserRole(userId, role) {
  const validRoles = ['user', 'admin', 'super_admin'];
  if (!validRoles.includes(role)) return { error: '无效的角色' };
  const user = db.getUserById.get(userId);
  if (!user) return { error: '用户不存在' };
  db.setUserRole.run(role, userId);
  return { ok: true, role };
}

// ── Middleware ────────────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: '需要登录' });

  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: '登录已过期，请重新登录' });

  const user = db.getUserById.get(payload.sub);
  if (!user) return res.status(401).json({ error: '账号不存在' });

  req.user = sanitize(user);
  req.userId = user.id;
  next();
}

// Admin middleware: accepts either ADMIN_KEY header OR user with admin/super_admin role
function requireAdminAccess(req, res, next) {
  // 1. Check ADMIN_KEY header (legacy key-based access)
  const headerKey = req.headers['x-admin-key'] || req.query.key;
  if (headerKey && headerKey === getAdminKey()) return next();

  // 2. Check Bearer token for admin-role user
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      const user = db.getUserById.get(payload.sub);
      if (user && (user.role === 'admin' || user.role === 'super_admin')) {
        req.user = sanitize(user);
        req.userId = user.id;
        return next();
      }
    }
  }

  return res.status(401).json({ error: '需要管理员权限' });
}

// Super admin only (for security config changes)
function requireSuperAdmin(req, res, next) {
  const headerKey = req.headers['x-admin-key'] || req.query.key;
  if (headerKey && headerKey === getAdminKey()) return next();

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      const user = db.getUserById.get(payload.sub);
      if (user && user.role === 'super_admin') {
        req.user = sanitize(user);
        req.userId = user.id;
        return next();
      }
    }
  }

  return res.status(403).json({ error: '需要超级管理员权限' });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitize(user) {
  if (!user) return null;
  const { password_hash: _, ...safe } = user;
  return safe;
}

module.exports = {
  register, login, getById,
  updateProfile, changePassword,
  listUsers, adminResetPassword, adminUpdateUser, adminDeleteUser,
  setUserRole,
  requireAuth, requireAdminAccess, requireSuperAdmin,
  verifyToken, sanitize,
  getAdminKey, getJwtSecret,
};
