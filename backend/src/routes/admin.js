/**
 * Admin API Routes
 * All routes require X-Admin-Key header or ?key= query param.
 */

const express = require('express');
const multer  = require('multer');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const ai = require('../services/aiService');
const {
  ingestDocument,
  deleteDocument,
  listAIConfirmedDocs,
  vectorizeDocument,
  testEmbeddingConnection,
  testRerankConnection,
} = require('../services/knowledgeService');
const auditSvc = require('../services/auditService');
const cacheSvc = require('../services/cacheService');
const profileSvc = require('../services/profileService');
const messageSvc = require('../services/messageService');
const settlementSvc = require('../services/settlementService');
const curationSvc = require('../services/curationService');
const { GAME_MODES, COMBINABLE_MODES } = require('../plugins');
const { parseArray, parseObject } = require('../utils/json');
const { normalizeGameSettings } = require('../utils/gameSettings');

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

  // Get in-memory rooms for live connected player count
  const setupSocket = require('../socket');
  const rooms = setupSocket._rooms;

  // Enrich with concept counts and player counts
  const enriched = games.map(g => {
    const conceptCount = db.getConceptCount.get(g.id)?.count || 0;
    const playerCount  = db.getPlayerCount.get(g.id)?.count || 0;
    const pendingCount = db.getPendingConceptCount.get(g.id)?.count || 0;
    // Live connected players from in-memory room (more accurate than DB count)
    const onlineCount  = rooms?.get(g.id)?.players?.size ?? 0;
    return { ...g, settings: parseObject(g.settings, {}), conceptCount, playerCount, pendingCount, onlineCount };
  });
  console.log(`[Admin] GET /games enriched ${enriched.length} games`);
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
    game: { ...game, settings: parseObject(game.settings, {}) },
    concepts,
    players,
    messageCount,
  });
});

router.delete('/games/:id/concepts/:conceptId', (req, res) => {
  const id = req.params.id.toUpperCase();
  const conceptId = req.params.conceptId;
  const game = db.getGame.get(id);
  if (!game) return res.status(404).json({ error: '游戏不存在' });

  const concept = db.getConceptById.get(conceptId);
  if (!concept || concept.game_id !== id) {
    return res.status(404).json({ error: '概念不存在或不属于当前房间' });
  }

  const deleteTxn = db.db.transaction(() => {
    db.deleteAIDecisionByConcept.run(conceptId);
    db.deleteConceptOverride.run(conceptId);
    db.removeConceptFromAllCategories.run(conceptId);
    db.deleteConceptById.run(conceptId);
  });
  deleteTxn();

  logAdminAction('game_concept_delete', 'concept', conceptId, { gameId: id, name: concept.name || concept.raw_input });

  const messageId = uuidv4();
  const messageContent = `管理员删除了概念：${concept.name || concept.raw_input || conceptId}`;
  db.insertMessage.run(messageId, id, null, null, 'system', messageContent, JSON.stringify({ type: 'admin_delete_concept', conceptId }));

  const setupSocket = require('../socket');
  const io = setupSocket._io;
  if (io) {
    io.to(id).emit('concept:deleted', { conceptId });
    io.to(id).emit('message:new', {
      id: messageId,
      game_id: id,
      player_id: null,
      player_name: null,
      type: 'system',
      content: messageContent,
      meta: { type: 'admin_delete_concept', conceptId },
      created_at: new Date().toISOString(),
    });
  }

  res.json({ message: '概念已删除', conceptId });
});

router.put('/games/:id/concepts/:conceptId', (req, res) => {
  const id = req.params.id.toUpperCase();
  const conceptId = req.params.conceptId;
  const game = db.getGame.get(id);
  if (!game) return res.status(404).json({ error: '游戏不存在' });

  const concept = db.getConceptById.get(conceptId);
  if (!concept || concept.game_id !== id) {
    return res.status(404).json({ error: '概念不存在或不属于当前房间' });
  }

  const body = req.body || {};
  const nextRawInput = String(body.raw_input ?? concept.raw_input ?? '').trim();
  const nextName = String(body.name ?? concept.name ?? nextRawInput).trim();
  if (!nextRawInput || !nextName) {
    return res.status(400).json({ error: '概念名称不能为空' });
  }

  let nextYear = concept.year;
  if (Object.prototype.hasOwnProperty.call(body, 'year')) {
    if (body.year === null || body.year === '') nextYear = null;
    else if (Number.isFinite(Number(body.year))) nextYear = Math.trunc(Number(body.year));
    else return res.status(400).json({ error: '年份必须为有效整数' });
  }

  const nextDynasty = Object.prototype.hasOwnProperty.call(body, 'dynasty')
    ? (body.dynasty == null ? null : String(body.dynasty).trim() || null)
    : concept.dynasty;
  const nextPeriod = Object.prototype.hasOwnProperty.call(body, 'period')
    ? (body.period == null ? null : String(body.period).trim() || null)
    : concept.period;
  const nextDescription = Object.prototype.hasOwnProperty.call(body, 'description')
    ? (body.description == null ? null : String(body.description).trim() || null)
    : concept.description;
  const nextTags = Array.isArray(body.tags)
    ? body.tags.map(tag => String(tag).trim()).filter(Boolean)
    : parseArray(concept.tags, []);

  db.updateConceptAdmin.run(
    nextRawInput,
    nextName,
    nextPeriod,
    nextYear,
    nextDynasty,
    nextDescription,
    JSON.stringify(nextTags),
    conceptId,
  );

  const updated = db.getConceptById.get(conceptId);
  const payload = {
    ...updated,
    tags: parseArray(updated.tags, []),
    extra: parseObject(updated.extra, {}),
  };

  logAdminAction('game_concept_edit', 'concept', conceptId, {
    gameId: id,
    name: nextName,
    rawInput: nextRawInput,
  });

  const messageId = uuidv4();
  const messageContent = `管理员编辑了概念：${nextName}`;
  db.insertMessage.run(messageId, id, null, null, 'system', messageContent, JSON.stringify({ type: 'admin_edit_concept', conceptId }));

  const setupSocket = require('../socket');
  const io = setupSocket._io;
  if (io) {
    io.to(id).emit('concept:edited', { concept: payload });
    io.to(id).emit('message:new', {
      id: messageId,
      game_id: id,
      player_id: null,
      player_name: null,
      type: 'system',
      content: messageContent,
      meta: { type: 'admin_edit_concept', conceptId },
      created_at: new Date().toISOString(),
    });
  }

  res.json({ message: '概念已更新', concept: payload });
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

// Update game notes
router.put('/games/:id/notes', (req, res) => {
  const id = req.params.id.toUpperCase();
  const { notes = '' } = req.body;
  console.log(`[Admin] PUT /games/${id}/notes`);
  const game = db.getGame.get(id);
  if (!game) return res.status(404).json({ error: '游戏不存在' });

  db.updateGameNotes.run(String(notes).slice(0, 500), id);
  res.json({ message: '备注已更新' });
});

// Update game settings
router.put('/games/:id/settings', (req, res) => {
  const id = req.params.id.toUpperCase();
  const { settings } = req.body;
  console.log(`[Admin] PUT /games/${id}/settings`);
  const game = db.getGame.get(id);
  if (!game) return res.status(404).json({ error: '游戏不存在' });
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: '请提供有效的 settings 对象' });
  }

  // Merge with existing settings
  const existing = parseObject(game.settings, {});
  const merged = normalizeGameSettings({ ...existing, ...settings });
  db.updateGameSettings.run(JSON.stringify(merged), id);
  console.log(`[Admin] Updated settings for ${id}`);
  res.json({ message: '设置已更新', settings: merged });
});

// Update survival lives for an online player in a game room
router.post('/games/:id/players/:playerId/lives', (req, res) => {
  const id = req.params.id.toUpperCase();
  const playerId = req.params.playerId;
  const lives = Number(req.body?.lives);
  if (!Number.isFinite(lives)) return res.status(400).json({ error: '请提供有效的血量数值' });
  const nextLives = Math.max(0, Math.min(10, Math.floor(lives)));

  const game = db.getGame.get(id);
  if (!game) return res.status(404).json({ error: '游戏不存在' });

  const setupSocket = require('../socket');
  const rooms = setupSocket._rooms;
  const io = setupSocket._io;
  const room = rooms?.get(id);
  if (!room) return res.status(400).json({ error: '房间当前未激活，无法调整实时血量' });
  if (!room.players?.has(playerId)) return res.status(404).json({ error: '玩家不在该房间内' });

  room.lives.set(playerId, nextLives);
  const target = room.players.get(playerId);
  const players = [...room.players.values()].map(p => ({
    ...p,
    score: room.scores.get(p.id) || 0,
    lives: room.lives.get(p.id),
  }));
  io?.to(id).emit('players:update', { players });

  const content = `管理员将 ${target?.name || playerId} 的生命值调整为 ${nextLives}`;
  const msgId = uuidv4();
  db.insertMessage.run(msgId, id, null, null, 'system', content, JSON.stringify({ type: 'admin_adjust_lives', playerId, lives: nextLives }));
  io?.to(id).emit('message:new', {
    id: msgId,
    game_id: id,
    player_id: null,
    player_name: null,
    type: 'system',
    content,
    meta: { type: 'admin_adjust_lives', playerId, lives: nextLives },
    created_at: new Date().toISOString(),
  });

  res.json({ message: '血量已更新', playerId, lives: nextLives });
});


// Update primary mode + extra modes
router.put('/games/:id/modes', (req, res) => {
  const id = req.params.id.toUpperCase();
  const { mode, extraModes = [] } = req.body;
  console.log(`[Admin] PUT /games/${id}/modes mode=${mode} extraModes=${JSON.stringify(extraModes)}`);

  const game = db.getGame.get(id);
  if (!game) return res.status(404).json({ error: '游戏不存在' });

  if (!mode || !GAME_MODES[mode]) {
    return res.status(400).json({ error: '请提供有效的主模式' });
  }
  if (!Array.isArray(extraModes)) {
    return res.status(400).json({ error: 'extraModes 必须是数组' });
  }

  const normalizedExtraModes = [...new Set(extraModes)]
    .filter(Boolean)
    .filter(em => em !== mode);

  for (const em of normalizedExtraModes) {
    if (!COMBINABLE_MODES[em] && !GAME_MODES[em]) {
      return res.status(400).json({ error: `未知附加模式: ${em}` });
    }
  }

  const existingSettings = parseObject(game.settings, {});
  const nextSettings = normalizeGameSettings({ ...existingSettings, extraModes: normalizedExtraModes });

  db.updateGameMode.run(mode, id);
  db.updateGameSettings.run(JSON.stringify(nextSettings), id);

  const updated = db.getGame.get(id);
  const payload = {
    ...updated,
    settings: parseObject(updated.settings, {}),
  };

  db.insertMessage.run(
    uuidv4(),
    id,
    null,
    null,
    'system',
    `管理员已更新游戏模式：主模式「${mode}」${normalizedExtraModes.length > 0 ? `，附加模式 ${normalizedExtraModes.join('、')}` : ''}`,
    JSON.stringify({ type: 'admin_mode_update', mode, extraModes: normalizedExtraModes })
  );

  res.json({
    message: '游戏模式已更新',
    game: payload,
  });
});

// Restore a finished/errored game back to playing
router.post('/games/:id/restore', (req, res) => {
  const id = req.params.id.toUpperCase();
  console.log(`[Admin] POST /games/${id}/restore`);
  const game = db.getGame.get(id);
  if (!game) return res.status(404).json({ error: '游戏不存在' });
  if (game.status === 'playing') return res.json({ message: '游戏已在进行中' });

  db.updateGameStatus.run('playing', id);

  // Notify connected players via socket if available
  const setupSocket = require('../socket');
  const io = setupSocket._io;
  if (io) {
    io.to(id).emit('message:new', {
      id: uuidv4(), game_id: id, player_id: null, player_name: null,
      type: 'system', content: '管理员已恢复游戏，可继续提交概念',
      meta: {}, created_at: new Date().toISOString(),
    });
    io.to(id).emit('game:restored');
    console.log(`[Admin] Emitted game:restored to room ${id}`);
  }

  db.insertMessage.run(uuidv4(), id, null, null, 'system', '管理员已恢复游戏，可继续提交概念', '{}');
  res.json({ message: '游戏已恢复为进行中状态' });
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
    system_prompt: c.system_prompt || null,
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
  const { name, provider_type, base_url, api_key, model, extra = {}, system_prompt } = req.body;
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
  // Update system_prompt separately (may be null to clear)
  if (system_prompt !== undefined) {
    db.updateAIConfigSystemPrompt.run(system_prompt || null, req.params.id);
  }
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

router.post('/knowledge/:id/vectorize', async (req, res) => {
  const doc = db.getDoc.get(req.params.id);
  if (!doc) return res.status(404).json({ error: '文档不存在' });

  try {
    const result = await vectorizeDocument(req.params.id);
    console.log(`[Admin] Knowledge vectorized id=${req.params.id} title="${doc.title}" chunks=${result.chunks}`);
    res.json({ message: '向量化完成', ...result });
  } catch (err) {
    const detail = err?.stack || err?.message || 'unknown error';
    console.error(`[Admin] Knowledge vectorize FAILED id=${req.params.id} title="${doc.title}": ${detail}`);
    res.status(400).json({ error: err.message || '向量化失败', detail });
  }
});

router.post('/knowledge/check/embedding', async (_req, res) => {
  try {
    const result = await testEmbeddingConnection(_req.body?.knowledge || _req.body || {});
    res.json({ message: 'Embedding 检测通过', ...result });
  } catch (err) {
    const detail = err?.stack || err?.message || 'unknown error';
    console.error(`[Admin] Knowledge embedding check FAILED: ${detail}`);
    res.status(400).json({ error: err.message || 'Embedding 检测失败', detail });
  }
});

router.post('/knowledge/check/rerank', async (_req, res) => {
  try {
    const result = await testRerankConnection(_req.body?.knowledge || _req.body || {});
    res.json({ message: 'Rerank 检测通过', ...result });
  } catch (err) {
    const detail = err?.stack || err?.message || 'unknown error';
    console.error(`[Admin] Knowledge rerank check FAILED: ${detail}`);
    res.status(400).json({ error: err.message || 'Rerank 检测失败', detail });
  }
});

router.post('/knowledge/check/auxiliary', async (_req, res) => {
  try {
    const result = await ai.testAuxiliaryConnection(_req.body?.auxiliary || _req.body || {});
    res.json({ message: '辅助 LLM 检测通过', ...result });
  } catch (err) {
    const detail = err?.stack || err?.message || 'unknown error';
    console.error(`[Admin] Auxiliary check FAILED: ${detail}`);
    res.status(400).json({ error: err.message || '辅助 LLM 检测失败', detail });
  }
});

// ── AI-Confirmed Knowledge Base ───────────────────────────────────────────────

router.get('/ai-confirmed', (_req, res) => {
  const docs = listAIConfirmedDocs();
  console.log(`[Admin] GET /ai-confirmed count=${docs.length}`);
  res.json({ docs });
});

router.delete('/ai-confirmed/:id', (req, res) => {
  const doc = db.getDoc.get(req.params.id);
  if (!doc) return res.status(404).json({ error: '条目不存在' });
  if (doc.source !== 'ai_confirmed') return res.status(400).json({ error: '该条目不属于 AI 确认知识库' });

  deleteDocument(req.params.id);
  console.log(`[Admin] AI-confirmed concept deleted id=${req.params.id} title="${doc.title}"`);
  res.json({ message: '已删除' });
});

// Bulk clear all AI-confirmed entries
router.delete('/ai-confirmed', (_req, res) => {
  const docs = listAIConfirmedDocs();
  for (const d of docs) {
    try { deleteDocument(d.id); } catch { /* non-fatal */ }
  }
  console.log(`[Admin] AI-confirmed bulk clear count=${docs.length}`);
  res.json({ message: `已清空 ${docs.length} 条 AI 确认知识库条目` });
});

// ── Server Logs ──────────────────────────────────────────────────────────────

router.get('/logs', (req, res) => {
  const logger = require('../logger');
  const limit  = Math.min(parseInt(req.query.limit) || 200, 1000);
  const level  = ['info', 'warn', 'error'].includes(req.query.level) ? req.query.level : null;
  const logs   = logger.getLogs(limit, level);
  console.log(`[Admin] GET /logs limit=${limit} level=${level || 'all'} returned=${logs.length}`);
  res.json({ count: logs.length, logs });
});

// ── AI Validation Audit ───────────────────────────────────────────────────────

router.get('/audit', (req, res) => {
  const { game_id, method, outcome } = req.query;
  const decisions = auditSvc.listDecisions({ gameId: game_id, method, outcome });
  console.log(`[Admin] GET /audit count=${decisions.length}`);
  res.json({ decisions });
});

router.get('/audit/:conceptId', (req, res) => {
  const decision = auditSvc.getDecision(req.params.conceptId);
  const override = auditSvc.getOverride(req.params.conceptId);
  if (!decision) return res.status(404).json({ error: '未找到验证记录' });
  res.json({ decision, override });
});

router.post('/audit/:conceptId/override', (req, res) => {
  const { decision, reason } = req.body;
  if (!['accepted', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: 'decision 必须是 accepted 或 rejected' });
  }
  try {
    const result = auditSvc.overrideConcept(req.params.conceptId, decision, reason);
    logAdminAction('concept_override', 'concept', req.params.conceptId, { decision, reason });
    console.log(`[Admin] Override concept id=${req.params.conceptId} decision=${decision}`);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Validation Cache ──────────────────────────────────────────────────────────

router.get('/cache/stats', (_req, res) => {
  res.json({ stats: cacheSvc.getStats() });
});

router.delete('/cache', (_req, res) => {
  const count = cacheSvc.clearAll();
  logAdminAction('cache_clear', 'cache', null, { count });
  res.json({ message: `已清空 ${count} 条缓存` });
});

// ── Settlement Recovery ───────────────────────────────────────────────────────

router.get('/settlements/incomplete', (_req, res) => {
  const items = settlementSvc.getIncompleteSettlements();
  res.json({ settlements: items });
});

router.post('/settlements/:gameId/retry', async (req, res) => {
  const gameId = req.params.gameId.toUpperCase();
  const game = db.getGame.get(gameId);
  if (!game) return res.status(404).json({ error: '游戏不存在' });
  if (game.settle_status !== 'started' && game.settle_status !== 'failed') {
    return res.status(400).json({ error: '该游戏没有未完成的结算' });
  }

  // Let the socket handler do the actual settlement; just clear the stuck flag
  // so players can trigger it again.
  settlementSvc.rollbackSettlement(gameId);

  const setupSocket = require('../socket');
  const io = setupSocket._io;
  if (io) {
    io.to(gameId).emit('message:new', {
      id: uuidv4(), game_id: gameId, player_id: null, player_name: null,
      type: 'system', content: '管理员已重置结算状态，可重新触发结算',
      meta: {}, created_at: new Date().toISOString(),
    });
  }
  logAdminAction('settlement_retry', 'game', gameId, {});
  res.json({ message: '结算状态已重置' });
});

router.post('/settlements/:gameId/rollback', (req, res) => {
  const gameId = req.params.gameId.toUpperCase();
  const game = db.getGame.get(gameId);
  if (!game) return res.status(404).json({ error: '游戏不存在' });

  settlementSvc.rollbackSettlement(gameId);
  logAdminAction('settlement_rollback', 'game', gameId, {});
  res.json({ message: '结算已回滚，待验证概念保留' });
});

router.post('/settlements/:gameId/abandon', (req, res) => {
  const gameId = req.params.gameId.toUpperCase();
  const game = db.getGame.get(gameId);
  if (!game) return res.status(404).json({ error: '游戏不存在' });

  settlementSvc.failSettlement(gameId);
  logAdminAction('settlement_abandon', 'game', gameId, {});
  res.json({ message: '结算已标记失败，玩家可重新加入' });
});

// ── Knowledge Curation ────────────────────────────────────────────────────────

router.get('/curation/pending', (_req, res) => {
  const items = curationSvc.getPendingIngestions();
  res.json({ concepts: items });
});

router.get('/curation/concepts', (req, res) => {
  const status = req.query.status || 'active';
  const items = curationSvc.getActiveConcepts(status);
  res.json({ concepts: items });
});

router.post('/curation/concepts/:id/approve', (req, res) => {
  try {
    const result = curationSvc.approveConcept(req.params.id);
    logAdminAction('kb_approve', 'knowledge', req.params.id, {});
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/curation/concepts/approve-all', (_req, res) => {
  const result = curationSvc.approveAll();
  logAdminAction('kb_approve_all', 'knowledge', null, result);
  res.json(result);
});

router.post('/curation/concepts/:id/archive', (req, res) => {
  try {
    const result = curationSvc.archiveConcept(req.params.id);
    logAdminAction('kb_archive', 'knowledge', req.params.id, {});
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/curation/concepts/:id', (req, res) => {
  try {
    const result = curationSvc.rejectConcept(req.params.id);
    logAdminAction('kb_delete', 'knowledge', req.params.id, {});
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/curation/concepts/:id', (req, res) => {
  try {
    const result = curationSvc.editConcept(req.params.id, req.body);
    logAdminAction('kb_edit', 'knowledge', req.params.id, req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/curation/concepts/:id/categorize', (req, res) => {
  const { categoryId, remove } = req.body;
  if (!categoryId) return res.status(400).json({ error: '请提供 categoryId' });
  if (remove) {
    curationSvc.removeFromCategory(req.params.id, categoryId);
  } else {
    curationSvc.assignCategory(req.params.id, categoryId);
  }
  res.json({ ok: true });
});

router.post('/curation/concepts/categorize-batch', (req, res) => {
  const { conceptIds, categoryId, remove } = req.body || {};
  if (!Array.isArray(conceptIds) || conceptIds.length === 0) {
    return res.status(400).json({ error: '请提供 conceptIds' });
  }
  if (!categoryId) return res.status(400).json({ error: '请提供 categoryId' });

  let affected = 0;
  for (const id of conceptIds) {
    if (!id) continue;
    if (remove) curationSvc.removeFromCategory(id, categoryId);
    else curationSvc.assignCategory(id, categoryId);
    affected++;
  }
  logAdminAction(remove ? 'kb_uncategorize_batch' : 'kb_categorize_batch', 'knowledge', null, { categoryId, affected });
  res.json({ ok: true, affected });
});

router.get('/curation/categories', (_req, res) => {
  res.json({ categories: curationSvc.listCategories() });
});

router.post('/curation/categories', (req, res) => {
  const { name, color, sortOrder } = req.body;
  if (!name) return res.status(400).json({ error: '请提供分类名称' });
  const cat = curationSvc.createCategory(name, color, sortOrder);
  logAdminAction('category_create', 'category', cat.id, { name });
  res.json(cat);
});

router.delete('/curation/categories/:id', (req, res) => {
  curationSvc.deleteCategory(req.params.id);
  logAdminAction('category_delete', 'category', req.params.id, {});
  res.json({ ok: true });
});

router.post('/curation/concepts/merge', (req, res) => {
  const { keepId, mergeIds } = req.body;
  if (!keepId || !Array.isArray(mergeIds) || mergeIds.length === 0) {
    return res.status(400).json({ error: '请提供 keepId 和 mergeIds 数组' });
  }
  try {
    const result = curationSvc.mergeConcepts(keepId, mergeIds);
    logAdminAction('kb_merge', 'knowledge', keepId, { mergeIds, deleted: result.deleted });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Message Archive ───────────────────────────────────────────────────────────

router.get('/games/:id/messages', (req, res) => {
  const id = req.params.id.toUpperCase();
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = parseInt(req.query.offset) || 0;
  const messages = messageSvc.getMessages(id, limit, offset);
  const total = messageSvc.getMessageCount(id);
  res.json({ messages, total, limit, offset });
});

router.get('/games/:id/messages/archive', (req, res) => {
  const id = req.params.id.toUpperCase();
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const messages = messageSvc.getArchivedMessages(id, limit, offset);
  res.json({ messages, limit, offset });
});

router.post('/messages/archive', (_req, res) => {
  const count = messageSvc.archiveAllOldMessages();
  logAdminAction('messages_archive', 'messages', null, { archived: count });
  res.json({ message: `已归档 ${count} 条消息` });
});

// ── Admin Audit Log ───────────────────────────────────────────────────────────

router.get('/audit-log', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const logs = db.listAdminAudit.all(limit);
  res.json({ logs });
});

// ── AI Config Priority ────────────────────────────────────────────────────────

router.put('/ai-configs/:id/priority', (req, res) => {
  const { priority, is_fallback } = req.body;
  const existing = db.getAIConfig.get(req.params.id);
  if (!existing) return res.status(404).json({ error: '配置不存在' });
  db.updateAIConfigPriority.run(
    priority ?? existing.priority ?? 0,
    is_fallback ? 1 : 0,
    req.params.id
  );
  logAdminAction('ai_config_priority', 'ai_config', req.params.id, { priority, is_fallback });
  res.json({ ok: true });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function logAdminAction(action, resourceType, resourceId, changes) {
  try {
    db.insertAdminAudit.run(
      uuidv4(),
      action,
      resourceType || null,
      resourceId || null,
      JSON.stringify(changes || {})
    );
  } catch { /* non-fatal */ }
}

function maskKey(key = '') {
  if (key.length <= 8) return '***';
  return key.slice(0, 4) + '*'.repeat(Math.max(0, key.length - 8)) + key.slice(-4);
}

module.exports = router;
