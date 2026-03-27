const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { GAME_MODES } = require('../plugins');

const router = express.Router();

// Player color palette
const COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6',
];

// POST /api/games — create a new game room
router.post('/', (req, res) => {
  const { topic, mode = 'free', settings = {} } = req.body;
  if (!topic || !topic.trim()) {
    return res.status(400).json({ error: '请提供游戏主题' });
  }
  if (!GAME_MODES[mode]) {
    return res.status(400).json({ error: `未知游戏模式: ${mode}` });
  }

  const id = uuidv4().slice(0, 8).toUpperCase();
  db.createGame.run(id, topic.trim(), mode, JSON.stringify(settings));
  const game = db.getGame.get(id);
  res.json({ game });
});

// GET /api/games/:id — get game info
router.get('/:id', (req, res) => {
  const game = db.getGame.get(req.params.id.toUpperCase());
  if (!game) return res.status(404).json({ error: '房间不存在' });

  game.settings = JSON.parse(game.settings || '{}');
  const players = db.getPlayers.all(game.id);
  const conceptCount = db.getConceptCount.get(game.id).count;
  res.json({ game, players, conceptCount });
});

// GET /api/games/:id/concepts — get timeline data
router.get('/:id/concepts', (req, res) => {
  const game = db.getGame.get(req.params.id.toUpperCase());
  if (!game) return res.status(404).json({ error: '房间不存在' });

  const concepts = db.getConceptsByGame.all(game.id).map((c) => ({
    ...c,
    tags: JSON.parse(c.tags || '[]'),
    extra: JSON.parse(c.extra || '{}'),
  }));
  res.json({ concepts });
});

// GET /api/games/:id/messages — get chat history
router.get('/:id/messages', (req, res) => {
  const game = db.getGame.get(req.params.id.toUpperCase());
  if (!game) return res.status(404).json({ error: '房间不存在' });

  const messages = db.getMessagesByGame.all(game.id).map((m) => ({
    ...m,
    meta: JSON.parse(m.meta || '{}'),
  }));
  res.json({ messages });
});

// GET /api/games/:id/modes — list available game modes
router.get('/:id/modes', (_req, res) => {
  res.json({ modes: GAME_MODES });
});

// GET /api/modes
router.get('/', (_req, res) => {
  res.json({ modes: GAME_MODES });
});

module.exports = router;
