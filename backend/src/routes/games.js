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

// POST /api/games/import — restore a game from a previously exported JSON
router.post('/import', (req, res) => {
  const data = req.body;

  if (!data || !data.game || !data.game.topic) {
    return res.status(400).json({ error: '无效的导入数据：缺少 game.topic' });
  }

  const orig = data.game;
  const mode = orig.mode || 'free';
  if (!GAME_MODES[mode]) {
    return res.status(400).json({ error: `未知游戏模式: ${mode}` });
  }

  // Create a new game with a fresh ID
  const newId = uuidv4().slice(0, 8).toUpperCase();
  const settings = JSON.stringify(orig.settings || {});
  const topic = `[导入] ${orig.topic || '未命名游戏'}`.slice(0, 80);

  db.createGame.run(newId, topic, mode, settings);
  // Mark it finished since we're restoring a snapshot
  db.updateGameStatus.run('finished', newId);

  let importedConcepts = 0;
  // Import validated timeline concepts
  const timeline = data.timeline || [];
  for (const c of timeline) {
    if (!c.name) continue;
    const cid = uuidv4();
    try {
      db.insertConcept.run(
        cid, newId,
        c.player_id || 'imported', c.player_name || '导入',
        c.raw_input || c.name, c.name,
        c.period || null, c.year ?? null,
        c.dynasty || null, c.description || null,
        JSON.stringify(Array.isArray(c.tags) ? c.tags : []),
        1, 0, null,
        JSON.stringify(c.extra || {})
      );
      importedConcepts++;
    } catch { /* skip malformed concepts */ }
  }

  // Import messages if present
  let importedMessages = 0;
  const messages = data.messages || [];
  for (const m of messages) {
    if (!m.content) continue;
    try {
      db.insertMessage.run(
        uuidv4(), newId,
        m.player_id || null, m.player_name || null,
        m.type || 'text', m.content,
        JSON.stringify(m.meta || {})
      );
      importedMessages++;
    } catch { /* skip */ }
  }

  console.log(`[Games] POST /import created gameId=${newId} concepts=${importedConcepts} messages=${importedMessages}`);
  const game = db.getGame.get(newId);
  res.json({
    game: { ...game, settings: JSON.parse(game.settings || '{}') },
    importedConcepts,
    importedMessages,
  });
});

module.exports = router;
