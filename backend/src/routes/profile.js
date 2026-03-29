/**
 * Player Profile & Leaderboard Routes
 * Public endpoints (no auth required).
 */

const express = require('express');
const profileSvc = require('../services/profileService');

const router = express.Router();

// GET /api/profile/:playerId — get a player's profile
router.get('/:playerId', (req, res) => {
  const profile = profileSvc.getProfile(req.params.playerId);
  if (!profile) return res.status(404).json({ error: '玩家不存在' });
  res.json({ profile });
});

// GET /api/leaderboard — top players by accepted concepts
router.get('/', (_req, res) => {
  const leaderboard = profileSvc.getLeaderboard(50);
  res.json({ leaderboard });
});

module.exports = router;
