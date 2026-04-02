const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'history-loong-jwt-secret-change-in-production';
const JWT_EXPIRES = '30d';
const BCRYPT_ROUNDS = 10;

// ── Token helpers ─────────────────────────────────────────────────────────────

function generateToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
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

  db.insertUser.run(id, trimmed, hash, trimmed, '#6366f1', '🐉');
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

  const token = generateToken(user.id);
  return { user: sanitize(user), token };
}

function getById(userId) {
  const user = db.getUserById.get(userId);
  if (!user) return null;
  return sanitize(user);
}

async function updateProfile(userId, { nickname, avatar_color, avatar_emoji }) {
  const user = db.getUserById.get(userId);
  if (!user) return { error: '用户不存在' };

  const newNickname = nickname != null ? String(nickname).trim().slice(0, 20) || user.nickname : user.nickname;
  const newColor = avatar_color || user.avatar_color;
  const newEmoji = avatar_emoji || user.avatar_emoji;

  db.updateUser.run(newNickname, newColor, newEmoji, userId);
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

async function adminResetPassword(userId, newPassword) {
  const user = db.getUserById.get(userId);
  if (!user) return { error: '用户不存在' };
  if (!newPassword || newPassword.length < 6) return { error: '新密码至少 6 位' };
  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  db.updateUserPassword.run(hash, userId);
  return { ok: true };
}

function adminDeleteUser(userId) {
  const user = db.getUserById.get(userId);
  if (!user) return { error: '用户不存在' };
  db.deleteUser.run(userId);
  return { ok: true };
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitize(user) {
  if (!user) return null;
  const { password_hash: _, ...safe } = user;
  return safe;
}

module.exports = {
  register, login, getById,
  updateProfile, changePassword,
  listUsers, adminResetPassword, adminDeleteUser,
  requireAuth, verifyToken, sanitize,
};
