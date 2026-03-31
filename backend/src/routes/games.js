const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { GAME_MODES, COMBINABLE_MODES } = require('../plugins');
const messageSvc = require('../services/messageService');
const { parseArray, parseObject, toBoundedInt } = require('../utils/json');

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
  // Validate extra modes in settings.extraModes
  if (Array.isArray(settings.extraModes)) {
    for (const em of settings.extraModes) {
      if (!GAME_MODES[em] && !COMBINABLE_MODES[em]) {
        return res.status(400).json({ error: `未知附加模式: ${em}` });
      }
    }
    // Remove duplicate of primary mode from extraModes
    settings.extraModes = settings.extraModes.filter(em => em !== mode);
  }

  // Normalize optional per-room RAG settings
  settings.ragTopicTopN = toBoundedInt(settings.ragTopicTopN, { defaultValue: 1, min: 1, max: 10 });
  settings.ragConceptTopN = toBoundedInt(settings.ragConceptTopN, { defaultValue: 2, min: 1, max: 12 });
  settings.ragContextMaxChars = toBoundedInt(settings.ragContextMaxChars, { defaultValue: 800, min: 200, max: 4000 });
  settings.ragFtsCandidateMultiplier = toBoundedInt(settings.ragFtsCandidateMultiplier, { defaultValue: 4, min: 1, max: 20 });
  settings.ragFtsMinCandidates = toBoundedInt(settings.ragFtsMinCandidates, { defaultValue: 12, min: 1, max: 200 });
  settings.ragShowPolishedInChat = Boolean(settings.ragShowPolishedInChat);
  const sep = typeof settings.ragJoinSeparator === 'string' ? settings.ragJoinSeparator : 'rule';
  settings.ragJoinSeparator = sep === 'double_newline' ? 'double_newline' : 'rule';

  const id = uuidv4().slice(0, 8).toUpperCase();
  db.createGame.run(id, topic.trim(), mode, JSON.stringify(settings));
  const game = db.getGame.get(id);
  res.json({ game });
});

// GET /api/games/:id — get game info
router.get('/:id', (req, res) => {
  const game = db.getGame.get(req.params.id.toUpperCase());
  if (!game) return res.status(404).json({ error: '房间不存在' });

  game.settings = parseObject(game.settings, {});
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
    tags: parseArray(c.tags, []),
    extra: parseObject(c.extra, {}),
  }));
  res.json({ concepts });
});

// GET /api/games/:id/messages — get chat history
router.get('/:id/messages', (req, res) => {
  const game = db.getGame.get(req.params.id.toUpperCase());
  if (!game) return res.status(404).json({ error: '房间不存在' });

  const limit = toBoundedInt(req.query.limit, { defaultValue: 100, min: 1, max: 500 });
  const offset = toBoundedInt(req.query.offset, { defaultValue: 0, min: 0, max: 1000000 });
  const includeArchived = String(req.query.includeArchived || '') === '1';

  const messages = messageSvc.getMessages(game.id, limit, offset);
  const total = messageSvc.getMessageCount(game.id);
  const archivedMessages = includeArchived
    ? messageSvc.getArchivedMessages(game.id, limit, offset)
    : [];
  const archivedTotal = includeArchived
    ? db.getArchivedMessageCount.get(game.id)?.count ?? 0
    : undefined;

  res.json({
    messages,
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + messages.length < total,
      ...(includeArchived ? { archivedTotal } : {}),
    },
    ...(includeArchived ? { archivedMessages } : {}),
  });
});

// GET /api/games/:id/modes — list available game modes
router.get('/:id/modes', (_req, res) => {
  res.json({ modes: GAME_MODES, combinableModes: COMBINABLE_MODES });
});

// GET /api/modes
router.get('/', (_req, res) => {
  res.json({ modes: GAME_MODES, combinableModes: COMBINABLE_MODES });
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
    game: { ...game, settings: parseObject(game.settings, {}) },
    importedConcepts,
    importedMessages,
  });
});

module.exports = router;
