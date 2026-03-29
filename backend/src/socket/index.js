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
const { getContextForConcept, searchContext, ingestAIConfirmedConcept, validateFromKnowledge } = require('../services/knowledgeService');
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
  console.log(`[Socket] broadcastPlayers gameId=${gameId} count=${players.length}`);
  io.to(gameId).emit('players:update', { players });
}

function sysMessage(io, gameId, content, meta = {}) {
  const msg = {
    id: uuidv4(), game_id: gameId, player_id: null, player_name: null,
    type: 'system', content, meta, created_at: new Date().toISOString(),
  };
  db.insertMessage.run(msg.id, gameId, null, null, 'system', content, JSON.stringify(meta));
  io.to(gameId).emit('message:new', msg);
  console.log(`[Socket] sysMessage gameId=${gameId}: ${content}`);
}

function parseConcept(row) {
  return { ...row, tags: JSON.parse(row.tags || '[]'), extra: JSON.parse(row.extra || '{}') };
}

/** Expose rooms map so admin can inspect / force-end games */
module.exports = function setupSocket(io) {
  // Store io reference for admin use
  module.exports._io = io;
  module.exports._rooms = rooms;

  io.on('connection', (socket) => {
    let currentGameId = null;
    let currentPlayer = null;

    console.log(`[Socket] new connection socketId=${socket.id} transport=${socket.conn?.transport?.name} remoteAddress=${socket.handshake?.address}`);

    // ── join ──────────────────────────────────────────────────────────────────
    socket.on('game:join', ({ gameId, playerName }, callback) => {
      const id = (gameId || '').toUpperCase();
      const ts_start = Date.now();
      console.log(`[Socket] game:join START socketId=${socket.id} gameId=${id} playerName=${playerName} transport=${socket.conn?.transport?.name}`);

      try {
        const game = db.getGame.get(id);
        if (!game) {
          console.warn(`[Socket] game:join FAILED — room not found gameId=${id}`);
          return callback?.({ error: '房间不存在' });
        }
        console.log(`[Socket] game:join DB lookup OK gameId=${id} status=${game.status}`);

        const room    = getRoom(id);
        const color   = pickColor(room);
        const playerId = socket.id;

        currentGameId  = id;
        currentPlayer  = { id: playerId, name: playerName || '匿名玩家', color };

        room.players.set(playerId, currentPlayer);
        socket.join(id);
        console.log(`[Socket] game:join socket.join OK gameId=${id} roomSize=${io.sockets.adapter.rooms.get(id)?.size ?? 0}`);

        db.upsertPlayer.run(playerId, id, currentPlayer.name, color);
        console.log(`[Socket] game:join player upserted playerId=${playerId} gameId=${id}`);

        // Transition game status from 'waiting' to 'playing' on first join
        if (game.status === 'waiting') {
          db.updateGameStatus.run('playing', id);
          game.status = 'playing';
          console.log(`[Socket] game status updated to 'playing' gameId=${id}`);
        }

        const settings = JSON.parse(game.settings || '{}');
        const ts       = new TimelineService();

        // Validated concepts → timeline
        const allConcepts    = db.getConceptsByGame.all(id).map(parseConcept);
        const timeline       = ts.buildTimeline(allConcepts);

        // Pending concepts (deferred mode)
        const pendingConcepts = db.getPendingConcepts.all(id).map(parseConcept);

        const messages = db.getMessagesByGame.all(id).map(m => ({ ...m, meta: JSON.parse(m.meta || '{}') }));

        const elapsed = Date.now() - ts_start;
        console.log(`[Socket] game:join OK socketId=${socket.id} gameId=${id} player=${currentPlayer.name} timeline=${timeline.length} pending=${pendingConcepts.length} messages=${messages.length} elapsed=${elapsed}ms`);

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
      } catch (err) {
        console.error(`[Socket] game:join ERROR socketId=${socket.id} gameId=${id}:`, err);
        callback?.({ error: `加入失败：${err.message}` });
      }
    });

    // ── submit concept ────────────────────────────────────────────────────────
    socket.on('concept:submit', async ({ rawInput }, callback) => {
      console.log(`[Socket] concept:submit socketId=${socket.id} gameId=${currentGameId} input="${rawInput}"`);

      if (!currentGameId || !currentPlayer) {
        console.warn(`[Socket] concept:submit REJECTED — not in room socketId=${socket.id}`);
        return callback?.({ error: '请先加入房间' });
      }

      const game = db.getGame.get(currentGameId);
      if (!game) {
        console.warn(`[Socket] concept:submit REJECTED — room not found gameId=${currentGameId}`);
        return callback?.({ error: '房间不存在' });
      }
      if (game.status === 'finished') {
        console.warn(`[Socket] concept:submit REJECTED — game finished gameId=${currentGameId}`);
        return callback?.({ error: '游戏已结束' });
      }
      if (getRoom(currentGameId).settling) {
        console.warn(`[Socket] concept:submit REJECTED — settling in progress gameId=${currentGameId}`);
        return callback?.({ error: '正在结算中，请稍候' });
      }

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
        console.log(`[Socket] concept:pending gameId=${currentGameId} conceptId=${conceptId} input="${input}"`);
        callback?.({ ok: true, pending: true, concept: pending });
        return;
      }

      // ── Real-time mode: AI validate immediately ───────────────────────────
      io.to(currentGameId).emit('concept:validating', {
        playerId: currentPlayer.id, playerName: currentPlayer.name, rawInput: input,
      });
      console.log(`[Socket] concept:validating gameId=${currentGameId} input="${input}"`);

      try {
        const existing = db.getConceptsByGame.all(currentGameId)
          .filter(c => c.validated)
          .map(c => ({ name: c.name, period: c.period }));

        // ── KB-first validation: skip AI if local KB has a confident match ──
        const kbCheck = validateFromKnowledge(input, game.topic);
        let result;
        if (kbCheck.confident) {
          result = kbCheck.result;
          console.log(`[Socket] KB validation HIT gameId=${currentGameId} input="${input}" name="${result.name}"`);
        } else {
          const knowledgeContext = getContextForConcept(input, game.topic);
          console.log(`[Socket] AI validation start gameId=${currentGameId} input="${input}" existing=${existing.length} hasKnowledge=${!!knowledgeContext}`);
          result = await ai.validateConcept(input, game.topic, existing, { mode: game.mode, ...settings }, knowledgeContext);
        }

        const conceptId = uuidv4();

        if (!result.valid) {
          db.insertConcept.run(conceptId, currentGameId, currentPlayer.id, currentPlayer.name,
            input, input, null, null, null, null, '[]', 0, 1, result.reason || '无效', '{}');

          const rejMsg = { id: uuidv4(), type: 'system', game_id: currentGameId,
            content: `「${input}」被驳回：${result.reason || '与主题无关'}`,
            meta: { conceptId, rejected: true }, created_at: new Date().toISOString() };
          db.insertMessage.run(rejMsg.id, currentGameId, null, null, 'system', rejMsg.content, JSON.stringify(rejMsg.meta));
          io.to(currentGameId).emit('message:new', rejMsg);
          console.log(`[Socket] concept REJECTED gameId=${currentGameId} input="${input}" reason="${result.reason}"`);
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
          eraLabel: ts.getEraLabel(result.year ?? null, result.dynasty), created_at: new Date().toISOString(),
        };

        const confirmContent = `✓ 「${result.name}」已加入时间轴（${result.dynasty || result.period || '年代不详'}）`;
        db.insertMessage.run(uuidv4(), currentGameId, null, null, 'system', confirmContent, JSON.stringify({ conceptId, concept: true }));
        io.to(currentGameId).emit('message:new', {
          id: uuidv4(), type: 'system', game_id: currentGameId,
          content: confirmContent, meta: { conceptId, concept: true }, created_at: new Date().toISOString(),
        });

        io.to(currentGameId).emit('concept:new', { concept });
        console.log(`[Socket] concept ACCEPTED gameId=${currentGameId} name="${result.name}" year=${result.year} dynasty=${result.dynasty}`);
        callback?.({ ok: true, concept });
        pluginEvents.emit('concept:accepted', { game, concept, player: currentPlayer });

        // Auto-ingest into AI-confirmed knowledge base for future validations
        try {
          ingestAIConfirmedConcept({ ...concept, id: conceptId }, currentGameId);
          console.log(`[Socket] AI-confirmed concept ingested name="${result.name}" gameId=${currentGameId}`);
        } catch (kbErr) {
          console.warn(`[Socket] AI KB ingest failed (non-fatal): ${kbErr.message}`);
        }

      } catch (err) {
        console.error(`[Socket] concept:submit ERROR gameId=${currentGameId} input="${input}":`, err);
        sysMessage(io, currentGameId, `验证出错：${err.message}`);
        callback?.({ error: err.message });
      }
    });

    // ── batch settle (deferred mode) ──────────────────────────────────────────
    // Payload: { endGame?: boolean } — if endGame=true the game ends after settle
    socket.on('game:settle', async ({ endGame = false } = {}, callback) => {
      console.log(`[Socket] game:settle socketId=${socket.id} gameId=${currentGameId} endGame=${endGame}`);

      if (!currentGameId) return callback?.({ error: '请先加入房间' });

      const game = db.getGame.get(currentGameId);
      if (!game) return callback?.({ error: '房间不存在' });

      const room = getRoom(currentGameId);
      if (room.settling) return callback?.({ error: '已在结算中' });

      const pending = db.getPendingConcepts.all(currentGameId);
      if (!pending.length) {
        if (endGame) {
          db.updateGameStatus.run('finished', currentGameId);
          sysMessage(io, currentGameId, '没有待验证的概念，游戏结束');
          io.to(currentGameId).emit('game:finished');
        } else {
          sysMessage(io, currentGameId, '当前没有待验证的概念');
        }
        console.log(`[Socket] game:settle — no pending concepts gameId=${currentGameId} endGame=${endGame}`);
        return callback?.({ ok: true, accepted: 0, rejected: 0 });
      }

      room.settling = true;
      sysMessage(io, currentGameId, `开始结算，共 ${pending.length} 个概念待验证...`);
      io.to(currentGameId).emit('game:settle:start', { total: pending.length });
      callback?.({ ok: true, total: pending.length });

      console.log(`[Socket] game:settle START gameId=${currentGameId} pending=${pending.length}`);

      try {
        const knowledgeContext = searchContext(game.topic, 2);

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
              eraLabel: ts.getEraLabel(r.year ?? null, r.dynasty), created_at: row.created_at,
            };
            io.to(currentGameId).emit('concept:settled', { conceptId: r.id, accepted: true, concept });
            accepted++;
            // Auto-ingest into AI-confirmed knowledge base
            try { ingestAIConfirmedConcept(concept, currentGameId); } catch { /* non-fatal */ }
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

        const summaryMsg = `结算完成：${accepted} 个通过，${rejected} 个淘汰${endGame ? '，游戏结束' : '，可继续提交'}`;
        sysMessage(io, currentGameId, summaryMsg);
        io.to(currentGameId).emit('game:settle:done', { accepted, rejected, endGame });

        if (endGame) {
          db.updateGameStatus.run('finished', currentGameId);
          io.to(currentGameId).emit('game:finished');
        }

        console.log(`[Socket] game:settle DONE gameId=${currentGameId} accepted=${accepted} rejected=${rejected} endGame=${endGame}`);

      } catch (err) {
        console.error(`[Socket] game:settle ERROR gameId=${currentGameId}:`, err);
        room.settling = false;
        sysMessage(io, currentGameId, `结算出错：${err.message}`);
      } finally {
        room.settling = false;
      }
    });

    // ── free validate: validate a single pending concept (no game end) ───────
    socket.on('concept:validate_single', async ({ conceptId }, callback) => {
      console.log(`[Socket] concept:validate_single socketId=${socket.id} gameId=${currentGameId} conceptId=${conceptId}`);

      if (!currentGameId || !currentPlayer) {
        return callback?.({ error: '请先加入房间' });
      }

      const game = db.getGame.get(currentGameId);
      if (!game) return callback?.({ error: '房间不存在' });
      if (game.status === 'finished') return callback?.({ error: '游戏已结束' });

      const room = getRoom(currentGameId);
      if (room.settling) return callback?.({ error: '正在批量结算中，请稍候' });

      // Find the pending concept
      const pending = db.getPendingConcepts.all(currentGameId);
      const row = pending.find(p => p.id === conceptId);
      if (!row) return callback?.({ error: '未找到该概念，可能已被验证' });

      // Mark this concept as "being validated" via a validating event
      io.to(currentGameId).emit('concept:validating', {
        playerId: row.player_id, playerName: row.player_name, rawInput: row.raw_input,
      });

      try {
        const existing = db.getConceptsByGame.all(currentGameId)
          .filter(c => c.validated)
          .map(c => ({ name: c.name, period: c.period }));

        const settings = JSON.parse(game.settings || '{}');

        // KB-first validation
        const kbCheck = validateFromKnowledge(row.raw_input, game.topic);
        let result;
        if (kbCheck.confident) {
          result = kbCheck.result;
          console.log(`[Socket] concept:validate_single KB HIT gameId=${currentGameId} input="${row.raw_input}"`);
        } else {
          const knowledgeContext = getContextForConcept(row.raw_input, game.topic);
          console.log(`[Socket] concept:validate_single AI start gameId=${currentGameId} input="${row.raw_input}"`);
          result = await ai.validateConcept(row.raw_input, game.topic, existing, { mode: game.mode, ...settings }, knowledgeContext);
        }

        const ts = new TimelineService();

        if (!result.valid) {
          db.rejectConcept.run(result.reason || '不符合主题', conceptId);
          io.to(currentGameId).emit('concept:settled', {
            conceptId, accepted: false,
            reason: result.reason || '不符合主题',
            playerName: row.player_name, rawInput: row.raw_input,
          });
          const rejMsg = {
            id: require('uuid').v4(), type: 'system', game_id: currentGameId,
            content: `「${row.raw_input}」被驳回：${result.reason || '与主题无关'}`,
            meta: { conceptId, rejected: true }, created_at: new Date().toISOString(),
          };
          db.insertMessage.run(rejMsg.id, currentGameId, null, null, 'system', rejMsg.content, JSON.stringify(rejMsg.meta));
          io.to(currentGameId).emit('message:new', rejMsg);
          console.log(`[Socket] concept:validate_single REJECTED input="${row.raw_input}" reason="${result.reason}"`);
          return callback?.({ ok: true });
        }

        const tags  = JSON.stringify(Array.isArray(result.tags) ? result.tags : []);
        const extra = JSON.stringify({});
        db.acceptConcept.run(
          result.name || row.raw_input, result.period || null, result.year ?? null,
          result.dynasty || null, result.description || null, tags, extra, conceptId
        );

        const concept = {
          id: conceptId, game_id: currentGameId,
          player_id: row.player_id, player_name: row.player_name,
          raw_input: row.raw_input, name: result.name || row.raw_input,
          period: result.period, year: result.year ?? null, dynasty: result.dynasty,
          description: result.description, tags: Array.isArray(result.tags) ? result.tags : [],
          extra: {}, validated: 1, rejected: 0,
          eraLabel: ts.getEraLabel(result.year ?? null, result.dynasty), created_at: row.created_at,
        };

        io.to(currentGameId).emit('concept:settled', { conceptId, accepted: true, concept });

        const confirmContent = `✓ 「${result.name}」已加入时间轴（${result.dynasty || result.period || '年代不详'}）`;
        const confirmId = require('uuid').v4();
        db.insertMessage.run(confirmId, currentGameId, null, null, 'system', confirmContent, JSON.stringify({ conceptId, concept: true }));
        io.to(currentGameId).emit('message:new', {
          id: confirmId, type: 'system', game_id: currentGameId,
          content: confirmContent, meta: { conceptId, concept: true }, created_at: new Date().toISOString(),
        });

        console.log(`[Socket] concept:validate_single ACCEPTED name="${result.name}" year=${result.year}`);

        try {
          ingestAIConfirmedConcept(concept, currentGameId);
        } catch (kbErr) {
          console.warn(`[Socket] AI KB ingest failed (non-fatal): ${kbErr.message}`);
        }

        callback?.({ ok: true });
      } catch (err) {
        console.error(`[Socket] concept:validate_single ERROR gameId=${currentGameId} conceptId=${conceptId}:`, err);
        callback?.({ error: err.message });
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
      console.log(`[Socket] message:send gameId=${currentGameId} player=${currentPlayer.name} content="${text.slice(0, 50)}"`);
      callback?.({ ok: true });
    });

    // ── hints ─────────────────────────────────────────────────────────────────
    socket.on('game:hint', async (_, callback) => {
      if (!currentGameId) return callback?.({ error: '请先加入房间' });
      console.log(`[Socket] game:hint gameId=${currentGameId}`);
      try {
        const game     = db.getGame.get(currentGameId);
        const existing = db.getConceptsByGame.all(currentGameId).filter(c => c.validated);
        const hints    = await ai.suggestConcepts(game.topic, existing);
        console.log(`[Socket] game:hint OK gameId=${currentGameId} hints=${hints.length}`);
        callback?.({ ok: true, hints });
      } catch (err) {
        console.error(`[Socket] game:hint ERROR gameId=${currentGameId}:`, err);
        callback?.({ error: '获取提示失败' });
      }
    });

    // ── finish (realtime mode) ────────────────────────────────────────────────
    socket.on('game:finish', (_, callback) => {
      if (!currentGameId) return callback?.({ error: '请先加入房间' });
      console.log(`[Socket] game:finish gameId=${currentGameId}`);
      db.updateGameStatus.run('finished', currentGameId);
      sysMessage(io, currentGameId, '游戏已结束，可以导出结果了');
      io.to(currentGameId).emit('game:finished');
      callback?.({ ok: true });
    });

    // ── disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      console.log(`[Socket] disconnect socketId=${socket.id} gameId=${currentGameId} player=${currentPlayer?.name} reason=${reason}`);
      if (!currentGameId || !currentPlayer) return;
      try {
        getRoom(currentGameId).players.delete(currentPlayer.id);
        broadcastPlayers(io, currentGameId);
        sysMessage(io, currentGameId, `${currentPlayer.name} 离开了游戏`);
        pluginEvents.emit('player:leave', { gameId: currentGameId, player: currentPlayer });
      } catch (err) {
        console.error(`[Socket] disconnect cleanup ERROR socketId=${socket.id} gameId=${currentGameId}:`, err);
      }
    });
  });
};
