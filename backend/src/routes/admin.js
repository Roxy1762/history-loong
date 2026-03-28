/**
 * Admin API Routes
 * All routes require X-Admin-Key header or ?key= query param.
 */

const express = require('express');
const multer  = require('multer');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const ai = require('../services/aiService');
const { ingestDocument, deleteDocument } = require('../services/knowledgeService');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter(_req, file, cb) {
    const allowed = ['.txt', '.md', '.markdown'];
    const ext = '.' + file.originalname.split('.').pop().toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

// ── Auth middleware ───────────────────────────────────────────────────────────

const ADMIN_KEY = process.env.ADMIN_KEY || 'admin';

router.use((req, res, next) => {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key !== ADMIN_KEY) {
    console.warn(`[Admin] Unauthorized request to ${req.method} ${req.path}`);
    return res.status(401).json({ error: '未授权，请提供正确的管理员密钥' });
  }
  next();
});

// ── Stats ─────────────────────────────────────────────────────────────────────

router.get('/stats', (_req, res) => {
  console.log('[Admin] GET /stats');
  const stats = db.stats.get();
  const recentGames = db.listGames.all().slice(0, 10);
  res.json({ stats, recentGames });
});

// ── Game Management ──────────────────────────────────────────────────────────

router.get('/games', (req, res) => {
  const status = req.query.status;
  console.log(`[Admin] GET /games status=${status || 'all'}`);
  let games;
  if (status) {
    games = db.listGamesByStatus.all(status);
  } else {
    games = db.listAllGames.all();
  }
  // Enrich with concept counts and player counts
  const enriched = games.map(g => {
    const conceptCount = db.getConceptCount.get(g.id)?.count || 0;
    const playerCount = db.getPlayerCount.get(g.id)?.count || 0;
    const pendingCount = db.getPendingConceptCount.get(g.id)?.count || 0;
    return { ...g, settings: JSON.parse(g.settings || '{}'), conceptCount, playerCount, pendingCount };
  });
  res.json({ games: enriched });
});

router.get('/games/:id', (req, res) => {
  const id = req.params.id.toUpperCase();
  console.log(`[Admin] GET /games/${id}`);
  const game = db.getGame.get(id);
  if (!game) return res.status(404).json({ error: '游戏不存在' });

  const concepts = db.getConceptsByGame.all(id).map(c => ({
    ...c, tags: JSON.parse(c.tags || '[]'), extra: JSON.parse(c.extra || '{}'),
  }));
  const players = db.getPlayers.all(id);
  const messageCount = db.getMessageCount.get(id)?.count || 0;

  res.json({
    game: { ...game, settings: JSON.parse(game.settings || '{}') },
    concepts,
    players,
    messageCount,
  });
});

router.post('/games/:id/finish', (req, res) => {
  const id = req.params.id.toUpperCase();
  console.log(`[Admin] POST /games/${id}/finish`);
  const game = db.getGame.get(id);
  if (!game) return res.status(404).json({ error: '游戏不存在' });
  if (game.status === 'finished') return res.json({ message: '游戏已经结束' });

  db.updateGameStatus.run('finished', id);

  // Notify connected players via socket if available
  const setupSocket = require('../socket');
  const io = setupSocket._io;
  if (io) {
    io.to(id).emit('message:new', {
      id: uuidv4(), game_id: id, player_id: null, player_name: null,
      type: 'system', content: '管理员已结束游戏',
      meta: {}, created_at: new Date().toISOString(),
    });
    io.to(id).emit('game:finished');
    console.log(`[Admin] Emitted game:finished to room ${id}`);
  }

  // Persist the system message
  db.insertMessage.run(uuidv4(), id, null, null, 'system', '管理员已结束游戏', '{}');

  res.json({ message: '游戏已结束' });
});

router.delete('/games/:id', (req, res) => {
  const id = req.params.id.toUpperCase();
  console.log(`[Admin] DELETE /games/${id}`);
  const game = db.getGame.get(id);
  if (!game) return res.status(404).json({ error: '游戏不存在' });

  // Kick all connected players via socket
  const setupSocket = require('../socket');
  const io = setupSocket._io;
  const rooms = setupSocket._rooms;
  if (io) {
    io.to(id).emit('message:new', {
      id: uuidv4(), game_id: id, player_id: null, player_name: null,
      type: 'system', content: '管理员已删除该房间',
      meta: {}, created_at: new Date().toISOString(),
    });
    io.to(id).emit('game:deleted');
    // Disconnect sockets from the room
    io.in(id).socketsLeave(id);
    console.log(`[Admin] Kicked all sockets from room ${id}`);
  }
  if (rooms) rooms.delete(id);

  // Delete all associated data
  db.deleteMessagesByGame.run(id);
  db.deleteConceptsByGame.run(id);
  db.deletePlayersByGame.run(id);
  db.deleteGame.run(id);

  console.log(`[Admin] Game ${id} and all associated data deleted`);
  res.json({ message: '游戏及相关数据已删除' });
});

// ── AI Configs ────────────────────────────────────────────────────────────────

router.get('/ai-configs', (_req, res) => {
  const configs = db.listAIConfigs.all().map((c) => ({
    ...c,
    api_key: maskKey(c.api_key),
    extra: JSON.parse(c.extra || '{}'),
  }));
  res.json({ configs });
});

router.post('/ai-configs', (req, res) => {
  const { name, provider_type, base_url, api_key, model, extra = {} } = req.body;
  if (!name || !provider_type || !api_key || !model) {
    return res.status(400).json({ error: '缺少必要字段：name, provider_type, api_key, model' });
  }
  if (provider_type === 'openai-compatible' && !base_url) {
    return res.status(400).json({ error: 'openai-compatible 类型需要提供 base_url' });
  }

  const id = uuidv4();
  db.insertAIConfig.run(id, name, provider_type, base_url || null, api_key, model, 0, JSON.stringify(extra));
  console.log(`[Admin] AI config created id=${id} name=${name} provider=${provider_type}`);
  res.json({ id, message: '创建成功' });
});

router.put('/ai-configs/:id', (req, res) => {
  const { name, provider_type, base_url, api_key, model, extra = {} } = req.body;
  const existing = db.getAIConfig.get(req.params.id);
  if (!existing) return res.status(404).json({ error: '配置不存在' });

  // Allow partial update of api_key (keep old if '***' placeholder sent)
  const finalKey = (api_key && !api_key.includes('*')) ? api_key : existing.api_key;
  db.updateAIConfig.run(
    name || existing.name,
    provider_type || existing.provider_type,
    base_url !== undefined ? base_url : existing.base_url,
    finalKey,
    model || existing.model,
    JSON.stringify(extra),
    req.params.id
  );
  console.log(`[Admin] AI config updated id=${req.params.id}`);
  res.json({ message: '更新成功' });
});

router.post('/ai-configs/:id/activate', (req, res) => {
  const existing = db.getAIConfig.get(req.params.id);
  if (!existing) return res.status(404).json({ error: '配置不存在' });

  db.setAllAIInactive.run();
  db.setAIActive.run(req.params.id);
  console.log(`[Admin] AI config activated id=${req.params.id} name=${existing.name}`);
  res.json({ message: '已激活' });
});

router.delete('/ai-configs/:id', (req, res) => {
  console.log(`[Admin] AI config deleted id=${req.params.id}`);
  db.deleteAIConfig.run(req.params.id);
  res.json({ message: '已删除' });
});

router.post('/ai-configs/:id/test', async (req, res) => {
  const row = db.getAIConfig.get(req.params.id);
  if (!row) return res.status(404).json({ error: '配置不存在' });

  // If request body contains a fresh api_key, use it for testing
  if (req.body.api_key && !req.body.api_key.includes('*')) {
    row.api_key = req.body.api_key;
  }

  console.log(`[Admin] Testing AI config id=${req.params.id} provider=${row.provider_type}`);
  try {
    const reply = await ai.testConfig(row);
    console.log(`[Admin] AI config test OK id=${req.params.id}`);
    res.json({ ok: true, reply });
  } catch (err) {
    console.error(`[Admin] AI config test FAILED id=${req.params.id}: ${err.message}`);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ── Knowledge Base ────────────────────────────────────────────────────────────

router.get('/knowledge', (_req, res) => {
  const docs = db.listDocs.all();
  res.json({ docs });
});

router.post('/knowledge/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请上传 .txt 或 .md 文件（最大 5MB）' });
  }

  const content = req.file.buffer.toString('utf-8');
  if (!content.trim()) {
    return res.status(400).json({ error: '文件内容为空' });
  }

  const title  = req.body.title || req.file.originalname.replace(/\.[^.]+$/, '');
  const result = ingestDocument(title, req.file.originalname, content);

  console.log(`[Admin] Knowledge uploaded title="${title}" chunks=${result.chunks}`);
  res.json({ message: '上传成功', docId: result.docId, chunks: result.chunks });
});

router.post('/knowledge/text', (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: '请提供 title 和 content' });
  }
  if (!content.trim()) {
    return res.status(400).json({ error: '内容不能为空' });
  }

  const result = ingestDocument(title, `${title}.txt`, content);
  console.log(`[Admin] Knowledge text added title="${title}" chunks=${result.chunks}`);
  res.json({ message: '添加成功', docId: result.docId, chunks: result.chunks });
});

router.delete('/knowledge/:id', (req, res) => {
  const doc = db.getDoc.get(req.params.id);
  if (!doc) return res.status(404).json({ error: '文档不存在' });

  deleteDocument(req.params.id);
  console.log(`[Admin] Knowledge deleted id=${req.params.id} title="${doc.title}"`);
  res.json({ message: '已删除' });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskKey(key = '') {
  if (key.length <= 8) return '***';
  return key.slice(0, 4) + '*'.repeat(Math.max(0, key.length - 8)) + key.slice(-4);
}

module.exports = router;
