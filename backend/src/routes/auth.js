const express = require('express');
const router = express.Router();
const authSvc = require('../services/authService');

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
  const { nickname, avatar_color, avatar_emoji } = req.body || {};
  const result = await authSvc.updateProfile(req.userId, { nickname, avatar_color, avatar_emoji });
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

module.exports = router;
