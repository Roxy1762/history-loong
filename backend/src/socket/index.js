/**
 * Socket.io game logic
 * Handles real-time events: join, submit concept, chat, leave.
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const ai = require('../services/aiService');
const { getContextForConcept } = require('../services/knowledgeService');
const { TimelineService } = require('../services/timelineService');
const { pluginEvents } = require('../plugins');

// In-memory rooms: roomId → { players: Map<socketId, playerInfo>, topic, mode }
const rooms = new Map();

const COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6',
];

function getRoom(gameId) {
  if (!rooms.has(gameId)) rooms.set(gameId, { players: new Map() });
  return rooms.get(gameId);
}

function pickColor(room) {
  const used = new Set([...room.players.values()].map((p) => p.color));
  return COLORS.find((c) => !used.has(c)) || COLORS[Math.floor(Math.random() * COLORS.length)];
}

function broadcastPlayers(io, gameId) {
  const room = getRoom(gameId);
  const players = [...room.players.values()];
  io.to(gameId).emit('players:update', { players });
}

function sysMessage(io, gameId, content, meta = {}) {
  const msg = {
    id: uuidv4(),
    game_id: gameId,
    player_id: null,
    player_name: null,
    type: 'system',
    content,
    meta,
    created_at: new Date().toISOString(),
  };
  db.insertMessage.run(msg.id, gameId, null, null, 'system', content, JSON.stringify(meta));
  io.to(gameId).emit('message:new', msg);
}

module.exports = function setupSocket(io) {
  io.on('connection', (socket) => {
    let currentGameId = null;
    let currentPlayer = null;

    // ── join ──────────────────────────────────────────────────────────────────
    socket.on('game:join', ({ gameId, playerName }, callback) => {
      const id = (gameId || '').toUpperCase();
      const game = db.getGame.get(id);

      if (!game) return callback?.({ error: '房间不存在' });

      const room = getRoom(id);
      const color = pickColor(room);
      const playerId = socket.id;

      currentGameId = id;
      currentPlayer = { id: playerId, name: playerName || '匿名玩家', color };

      room.players.set(playerId, currentPlayer);
      socket.join(id);

      // Persist player
      db.upsertPlayer.run(playerId, id, currentPlayer.name, color);

      // Send initial state
      const concepts = db.getConceptsByGame.all(id).map((c) => ({
        ...c,
        tags: JSON.parse(c.tags || '[]'),
        extra: JSON.parse(c.extra || '{}'),
      }));
      const messages = db.getMessagesByGame.all(id).map((m) => ({
        ...m,
        meta: JSON.parse(m.meta || '{}'),
      }));
      const ts = new TimelineService();
      const timeline = ts.buildTimeline(concepts);

      callback?.({
        ok: true,
        game: { ...game, settings: JSON.parse(game.settings || '{}') },
        player: currentPlayer,
        timeline,
        messages,
      });

      broadcastPlayers(io, id);
      sysMessage(io, id, `${currentPlayer.name} 加入了游戏`);

      pluginEvents.emit('player:join', { game, player: currentPlayer });
    });

    // ── submit concept ────────────────────────────────────────────────────────
    socket.on('concept:submit', async ({ rawInput }, callback) => {
      if (!currentGameId || !currentPlayer) {
        return callback?.({ error: '请先加入房间' });
      }

      const game = db.getGame.get(currentGameId);
      if (!game) return callback?.({ error: '房间不存在' });
      if (game.status === 'finished') return callback?.({ error: '游戏已结束' });

      const input = (rawInput || '').trim();
      if (!input) return callback?.({ error: '请输入内容' });

      // Broadcast "thinking" status
      io.to(currentGameId).emit('concept:validating', {
        playerId: currentPlayer.id,
        playerName: currentPlayer.name,
        rawInput: input,
      });

      // Save chat message first
      const chatMsgId = uuidv4();
      const chatMsg = {
        id: chatMsgId,
        game_id: currentGameId,
        player_id: currentPlayer.id,
        player_name: currentPlayer.name,
        type: 'concept_attempt',
        content: input,
        meta: {},
        created_at: new Date().toISOString(),
      };
      db.insertMessage.run(chatMsg.id, currentGameId, currentPlayer.id, currentPlayer.name, 'concept_attempt', input, '{}');
      io.to(currentGameId).emit('message:new', chatMsg);

      try {
        const existingConcepts = db.getConceptsByGame.all(currentGameId)
          .filter((c) => c.validated)
          .map((c) => ({ name: c.name, period: c.period }));

        const gameSettings = JSON.parse(game.settings || '{}');
        const knowledgeContext = getContextForConcept(input, game.topic);

        const result = await ai.validateConcept(input, game.topic, existingConcepts, {
          mode: game.mode,
          ...gameSettings,
        }, knowledgeContext);

        const conceptId = uuidv4();

        if (!result.valid) {
          // Rejected concept
          db.insertConcept.run(
            conceptId, currentGameId, currentPlayer.id, currentPlayer.name,
            input, input, null, null, null, null, '[]', 0, 1, result.reason || '无效', '{}'
          );

          const rejMsg = {
            id: uuidv4(),
            game_id: currentGameId,
            player_id: null,
            player_name: null,
            type: 'system',
            content: `「${input}」被驳回：${result.reason || '与主题无关或不是有效历史概念'}`,
            meta: { conceptId, rejected: true },
            created_at: new Date().toISOString(),
          };
          db.insertMessage.run(rejMsg.id, currentGameId, null, null, 'system', rejMsg.content, JSON.stringify(rejMsg.meta));
          io.to(currentGameId).emit('message:new', rejMsg);
          callback?.({ ok: false, reason: result.reason });
          return;
        }

        // Valid concept — save
        const tags = JSON.stringify(Array.isArray(result.tags) ? result.tags : []);
        const extra = JSON.stringify(result.extra || {});
        db.insertConcept.run(
          conceptId, currentGameId, currentPlayer.id, currentPlayer.name,
          input, result.name, result.period, result.year ?? null,
          result.dynasty, result.description, tags, 1, 0, null, extra
        );

        const ts = new TimelineService();
        const concept = {
          id: conceptId,
          game_id: currentGameId,
          player_id: currentPlayer.id,
          player_name: currentPlayer.name,
          raw_input: input,
          name: result.name,
          period: result.period,
          year: result.year ?? null,
          dynasty: result.dynasty,
          description: result.description,
          tags: Array.isArray(result.tags) ? result.tags : [],
          extra: result.extra || {},
          validated: 1,
          rejected: 0,
          eraLabel: ts.getEraLabel(result.year ?? null),
          created_at: new Date().toISOString(),
        };

        // System message confirming the concept
        const confirmContent = `✓ 「${result.name}」已加入时间轴（${result.dynasty || result.period || '年代不详'}）`;
        const confirmMeta = { conceptId, concept: true };
        db.insertMessage.run(uuidv4(), currentGameId, null, null, 'system', confirmContent, JSON.stringify(confirmMeta));
        io.to(currentGameId).emit('message:new', {
          id: uuidv4(), game_id: currentGameId, type: 'system',
          content: confirmContent, meta: confirmMeta, created_at: new Date().toISOString(),
        });

        // Broadcast new concept to all players
        io.to(currentGameId).emit('concept:new', { concept });
        callback?.({ ok: true, concept });

        pluginEvents.emit('concept:accepted', { game, concept, player: currentPlayer });

      } catch (err) {
        console.error('[Socket] concept:submit error:', err);
        const errMsg = err.message || 'AI 验证失败，请稍后重试';
        sysMessage(io, currentGameId, `验证出错：${errMsg}`);
        callback?.({ error: errMsg });
      }
    });

    // ── chat message ──────────────────────────────────────────────────────────
    socket.on('message:send', ({ content }, callback) => {
      if (!currentGameId || !currentPlayer) return callback?.({ error: '请先加入房间' });
      const text = (content || '').trim();
      if (!text) return;

      const msg = {
        id: uuidv4(),
        game_id: currentGameId,
        player_id: currentPlayer.id,
        player_name: currentPlayer.name,
        type: 'text',
        content: text,
        meta: {},
        created_at: new Date().toISOString(),
      };
      db.insertMessage.run(msg.id, currentGameId, msg.player_id, msg.player_name, 'text', text, '{}');
      io.to(currentGameId).emit('message:new', msg);
      callback?.({ ok: true });
    });

    // ── request hints ─────────────────────────────────────────────────────────
    socket.on('game:hint', async (_, callback) => {
      if (!currentGameId) return callback?.({ error: '请先加入房间' });
      try {
        const game = db.getGame.get(currentGameId);
        const existing = db.getConceptsByGame.all(currentGameId).filter((c) => c.validated);
        const hints = await ai.suggestConcepts(game.topic, existing);
        callback?.({ ok: true, hints });
      } catch (err) {
        callback?.({ error: '获取提示失败' });
      }
    });

    // ── finish game ───────────────────────────────────────────────────────────
    socket.on('game:finish', (_, callback) => {
      if (!currentGameId) return callback?.({ error: '请先加入房间' });
      db.updateGameStatus.run('finished', currentGameId);
      sysMessage(io, currentGameId, '游戏已结束，可以导出结果了');
      io.to(currentGameId).emit('game:finished');
      callback?.({ ok: true });
    });

    // ── disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      if (!currentGameId || !currentPlayer) return;
      const room = getRoom(currentGameId);
      room.players.delete(currentPlayer.id);
      broadcastPlayers(io, currentGameId);
      sysMessage(io, currentGameId, `${currentPlayer.name} 离开了游戏`);
      pluginEvents.emit('player:leave', { gameId: currentGameId, player: currentPlayer });
    });
  });
};
