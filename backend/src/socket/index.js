/**
 * Socket.io game logic
 *
 * Validation modes (game.settings.validationMode):
 *   'realtime'  — AI validates each concept immediately (default)
 *   'deferred'  — concepts saved as pending; batch-validated on game:settle
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const ai = require('../services/aiService');
const { getContextForConcept, searchContext } = require('../services/knowledgeService');
const { TimelineService } = require('../services/timelineService');
const { pluginEvents } = require('../plugins');

// In-memory rooms
const rooms = new Map();

const COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6',
];

function getRoom(gameId) {
  if (!rooms.has(gameId)) rooms.set(gameId, { players: new Map(), settling: false });
  return rooms.get(gameId);
}

function pickColor(room) {
  const used = new Set([...room.players.values()].map(p => p.color));
  return COLORS.find(c => !used.has(c)) || COLORS[Math.floor(Math.random() * COLORS.length)];
}

function broadcastPlayers(io, gameId) {
  const players = [...getRoom(gameId).players.values()];
  io.to(gameId).emit('players:update', { players });
}

function sysMessage(io, gameId, content, meta = {}) {
  const msg = {
    id: uuidv4(), game_id: gameId, player_id: null, player_name: null,
    type: 'system', content, meta, created_at: new Date().toISOString(),
  };
  db.insertMessage.run(msg.id, gameId, null, null, 'system', content, JSON.stringify(meta));
  io.to(gameId).emit('message:new', msg);
}

function parseConcept(row) {
  return { ...row, tags: JSON.parse(row.tags || '[]'), extra: JSON.parse(row.extra || '{}') };
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

      const room    = getRoom(id);
      const color   = pickColor(room);
      const playerId = socket.id;

      currentGameId  = id;
      currentPlayer  = { id: playerId, name: playerName || '匿名玩家', color };

      room.players.set(playerId, currentPlayer);
      socket.join(id);
      db.upsertPlayer.run(playerId, id, currentPlayer.name, color);

      const settings = JSON.parse(game.settings || '{}');
      const ts       = new TimelineService();

      // Validated concepts → timeline
      const allConcepts    = db.getConceptsByGame.all(id).map(parseConcept);
      const timeline       = ts.buildTimeline(allConcepts);

      // Pending concepts (deferred mode)
      const pendingConcepts = db.getPendingConcepts.all(id).map(parseConcept);

      const messages = db.getMessagesByGame.all(id).map(m => ({ ...m, meta: JSON.parse(m.meta || '{}') }));

      callback?.({
        ok: true,
        game: { ...game, settings },
        player: currentPlayer,
        timeline,
        pendingConcepts,
        messages,
      });

      broadcastPlayers(io, id);
      sysMessage(io, id, `${currentPlayer.name} 加入了游戏`);
      pluginEvents.emit('player:join', { game, player: currentPlayer });
    });

    // ── submit concept ────────────────────────────────────────────────────────
    socket.on('concept:submit', async ({ rawInput }, callback) => {
      if (!currentGameId || !currentPlayer) return callback?.({ error: '请先加入房间' });

      const game = db.getGame.get(currentGameId);
      if (!game)                      return callback?.({ error: '房间不存在' });
      if (game.status === 'finished') return callback?.({ error: '游戏已结束' });
      if (getRoom(currentGameId).settling) return callback?.({ error: '正在结算中，请稍候' });

      const input = (rawInput || '').trim();
      if (!input) return callback?.({ error: '请输入内容' });

      const settings = JSON.parse(game.settings || '{}');
      const isDeferred = settings.validationMode === 'deferred';

      // Save chat message
      const chatMsg = {
        id: uuidv4(), game_id: currentGameId,
        player_id: currentPlayer.id, player_name: currentPlayer.name,
        type: 'concept_attempt', content: input, meta: {}, created_at: new Date().toISOString(),
      };
      db.insertMessage.run(chatMsg.id, currentGameId, chatMsg.player_id, chatMsg.player_name, 'concept_attempt', input, '{}');
      io.to(currentGameId).emit('message:new', chatMsg);

      // ── Deferred mode: just save as pending ──────────────────────────────
      if (isDeferred) {
        const conceptId = uuidv4();
        db.insertConcept.run(
          conceptId, currentGameId, currentPlayer.id, currentPlayer.name,
          input, input, null, null, null, null, '[]', 0, 0, null, '{}'
        );
        const pending = {
          id: conceptId, game_id: currentGameId,
          player_id: currentPlayer.id, player_name: currentPlayer.name,
          raw_input: input, name: input, validated: 0, rejected: 0,
          tags: [], extra: {}, created_at: new Date().toISOString(),
        };
        io.to(currentGameId).emit('concept:pending', { concept: pending });
        callback?.({ ok: true, pending: true, concept: pending });
        return;
      }

      // ── Real-time mode: AI validate immediately ───────────────────────────
      io.to(currentGameId).emit('concept:validating', {
        playerId: currentPlayer.id, playerName: currentPlayer.name, rawInput: input,
      });

      try {
        const existing = db.getConceptsByGame.all(currentGameId)
          .filter(c => c.validated)
          .map(c => ({ name: c.name, period: c.period }));

        const knowledgeContext = getContextForConcept(input, game.topic);
        const result = await ai.validateConcept(input, game.topic, existing, { mode: game.mode, ...settings }, knowledgeContext);

        const conceptId = uuidv4();

        if (!result.valid) {
          db.insertConcept.run(conceptId, currentGameId, currentPlayer.id, currentPlayer.name,
            input, input, null, null, null, null, '[]', 0, 1, result.reason || '无效', '{}');

          const rejMsg = { id: uuidv4(), type: 'system', game_id: currentGameId,
            content: `「${input}」被驳回：${result.reason || '与主题无关'}`,
            meta: { conceptId, rejected: true }, created_at: new Date().toISOString() };
          db.insertMessage.run(rejMsg.id, currentGameId, null, null, 'system', rejMsg.content, JSON.stringify(rejMsg.meta));
          io.to(currentGameId).emit('message:new', rejMsg);
          return callback?.({ ok: false, reason: result.reason });
        }

        const tags  = JSON.stringify(Array.isArray(result.tags) ? result.tags : []);
        const extra = JSON.stringify(result.extra || {});
        db.insertConcept.run(conceptId, currentGameId, currentPlayer.id, currentPlayer.name,
          input, result.name, result.period, result.year ?? null,
          result.dynasty, result.description, tags, 1, 0, null, extra);

        const ts = new TimelineService();
        const concept = {
          id: conceptId, game_id: currentGameId,
          player_id: currentPlayer.id, player_name: currentPlayer.name,
          raw_input: input, name: result.name, period: result.period,
          year: result.year ?? null, dynasty: result.dynasty,
          description: result.description, tags: Array.isArray(result.tags) ? result.tags : [],
          extra: result.extra || {}, validated: 1, rejected: 0,
          eraLabel: ts.getEraLabel(result.year ?? null), created_at: new Date().toISOString(),
        };

        const confirmContent = `✓ 「${result.name}」已加入时间轴（${result.dynasty || result.period || '年代不详'}）`;
        db.insertMessage.run(uuidv4(), currentGameId, null, null, 'system', confirmContent, JSON.stringify({ conceptId, concept: true }));
        io.to(currentGameId).emit('message:new', {
          id: uuidv4(), type: 'system', game_id: currentGameId,
          content: confirmContent, meta: { conceptId, concept: true }, created_at: new Date().toISOString(),
        });

        io.to(currentGameId).emit('concept:new', { concept });
        callback?.({ ok: true, concept });
        pluginEvents.emit('concept:accepted', { game, concept, player: currentPlayer });

      } catch (err) {
        console.error('[Socket] concept:submit error:', err);
        sysMessage(io, currentGameId, `验证出错：${err.message}`);
        callback?.({ error: err.message });
      }
    });

    // ── batch settle (deferred mode) ──────────────────────────────────────────
    socket.on('game:settle', async (_, callback) => {
      if (!currentGameId) return callback?.({ error: '请先加入房间' });

      const game = db.getGame.get(currentGameId);
      if (!game) return callback?.({ error: '房间不存在' });

      const room = getRoom(currentGameId);
      if (room.settling) return callback?.({ error: '已在结算中' });

      const pending = db.getPendingConcepts.all(currentGameId);
      if (!pending.length) {
        // Nothing pending — just finish
        db.updateGameStatus.run('finished', currentGameId);
        sysMessage(io, currentGameId, '没有待验证的概念，游戏结束');
        io.to(currentGameId).emit('game:finished');
        return callback?.({ ok: true, accepted: 0, rejected: 0 });
      }

      room.settling = true;
      sysMessage(io, currentGameId, `开始结算，共 ${pending.length} 个概念待验证...`);
      io.to(currentGameId).emit('game:settle:start', { total: pending.length });
      callback?.({ ok: true, total: pending.length });

      try {
        const settings = JSON.parse(game.settings || '{}');
        const knowledgeContext = searchContext(game.topic, 3);

        const results = await ai.batchValidateConcepts(pending, game.topic, knowledgeContext);

        const ts = new TimelineService();
        let accepted = 0, rejected = 0;

        for (const r of results) {
          const row = pending.find(p => p.id === r.id);
          if (!row) continue;

          if (r.valid) {
            const tags  = JSON.stringify(Array.isArray(r.tags) ? r.tags : []);
            const extra = JSON.stringify({});
            db.acceptConcept.run(
              r.name || row.raw_input, r.period || null, r.year ?? null,
              r.dynasty || null, r.description || null, tags, extra, r.id
            );
            const concept = {
              id: r.id, game_id: currentGameId,
              player_id: row.player_id, player_name: row.player_name,
              raw_input: row.raw_input, name: r.name || row.raw_input,
              period: r.period, year: r.year ?? null, dynasty: r.dynasty,
              description: r.description, tags: Array.isArray(r.tags) ? r.tags : [],
              extra: {}, validated: 1, rejected: 0,
              eraLabel: ts.getEraLabel(r.year ?? null), created_at: row.created_at,
            };
            io.to(currentGameId).emit('concept:settled', { conceptId: r.id, accepted: true, concept });
            accepted++;
          } else {
            db.rejectConcept.run(r.reason || '不符合主题', r.id);
            io.to(currentGameId).emit('concept:settled', {
              conceptId: r.id, accepted: false,
              reason: r.reason || '不符合主题', playerName: row.player_name, rawInput: row.raw_input,
            });
            rejected++;
          }
        }

        io.to(currentGameId).emit('game:settle:progress', { done: results.length, total: pending.length });

        db.updateGameStatus.run('finished', currentGameId);
        sysMessage(io, currentGameId, `结算完成：${accepted} 个通过，${rejected} 个淘汰`);
        io.to(currentGameId).emit('game:settle:done', { accepted, rejected });
        io.to(currentGameId).emit('game:finished');

      } catch (err) {
        console.error('[Socket] game:settle error:', err);
        room.settling = false;
        sysMessage(io, currentGameId, `结算出错：${err.message}`);
      } finally {
        room.settling = false;
      }
    });

    // ── chat message ──────────────────────────────────────────────────────────
    socket.on('message:send', ({ content }, callback) => {
      if (!currentGameId || !currentPlayer) return callback?.({ error: '请先加入房间' });
      const text = (content || '').trim();
      if (!text) return;
      const msg = {
        id: uuidv4(), game_id: currentGameId,
        player_id: currentPlayer.id, player_name: currentPlayer.name,
        type: 'text', content: text, meta: {}, created_at: new Date().toISOString(),
      };
      db.insertMessage.run(msg.id, currentGameId, msg.player_id, msg.player_name, 'text', text, '{}');
      io.to(currentGameId).emit('message:new', msg);
      callback?.({ ok: true });
    });

    // ── hints ─────────────────────────────────────────────────────────────────
    socket.on('game:hint', async (_, callback) => {
      if (!currentGameId) return callback?.({ error: '请先加入房间' });
      try {
        const game     = db.getGame.get(currentGameId);
        const existing = db.getConceptsByGame.all(currentGameId).filter(c => c.validated);
        const hints    = await ai.suggestConcepts(game.topic, existing);
        callback?.({ ok: true, hints });
      } catch {
        callback?.({ error: '获取提示失败' });
      }
    });

    // ── finish (realtime mode) ────────────────────────────────────────────────
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
      getRoom(currentGameId).players.delete(currentPlayer.id);
      broadcastPlayers(io, currentGameId);
      sysMessage(io, currentGameId, `${currentPlayer.name} 离开了游戏`);
      pluginEvents.emit('player:leave', { gameId: currentGameId, player: currentPlayer });
    });
  });
};
