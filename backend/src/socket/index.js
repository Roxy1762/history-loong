/**
 * Socket.io game logic
 *
 * Validation modes (game.settings.validationMode):
 *   'realtime'  — AI validates each concept immediately (default)
 *   'deferred'  — concepts saved as pending; batch-validated on game:settle
 *
 * Game modes (game.mode):
 *   'free'        — no restrictions, any player any time
 *   'chain'       — new concept must relate to the previous one
 *   'ordered'     — concepts must be in chronological order
 *   'relay'       — each player can submit once per round; round resets when all submit
 *   'turn-order'  — strict rotation: players take turns in join order
 *   'score-race'  — free submission, AI rates difficulty 1-5; scores accumulate
 *   'challenge'   — free submission + rotating challenge cards; bonus score for completing challenge
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const ai = require('../services/aiService');
const { getContextForConcept, searchContext, ingestAIConfirmedConcept, validateFromKnowledge } = require('../services/knowledgeService');
const { TimelineService } = require('../services/timelineService');
const { pluginEvents } = require('../plugins');
const auditSvc = require('../services/auditService');
const profileSvc = require('../services/profileService');
const settlementSvc = require('../services/settlementService');

// ── In-memory rooms ───────────────────────────────────────────────────────────

const rooms = new Map();

/**
 * Room shape:
 * {
 *   players: Map<playerId, { id, name, color }>,
 *   joinOrder: string[],      // player ids in join order (for turn-order)
 *   settling: boolean,
 *   turnIndex: number,        // current turn index (turn-order mode)
 *   roundSubmitted: Set<string>, // player ids that submitted in current relay round
 *   scores: Map<playerId, number>, // score-race / challenge scores
 *   challengeCard: { id, text, tag } | null,  // current challenge card
 *   challengeRound: number,   // how many accepted concepts in this challenge card round
 * }
 */

const COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6',
];

// Challenge cards pool for 'challenge' mode
const CHALLENGE_CARDS = [
  { id: 'military',  text: '提交一个军事战役或战争相关概念', tag: '军事' },
  { id: 'person',    text: '提交一位历史人物（帝王将相、文人）', tag: '人物' },
  { id: 'female',    text: '提交一位女性历史人物或以女性为主角的事件', tag: '女性' },
  { id: 'culture',   text: '提交一个文化、艺术或思想领域的概念', tag: '文化' },
  { id: 'economic',  text: '提交一个经济、贸易或技术相关概念', tag: '经济' },
  { id: 'religion',  text: '提交一个宗教、哲学或典籍相关概念', tag: '思想' },
  { id: 'disaster',  text: '提交一个自然灾害、战乱或社会变革事件', tag: '变革' },
  { id: 'foreign',   text: '提交一个涉及外交、边疆或对外关系的概念', tag: '外交' },
  { id: 'ancient',   text: '提交一个先秦时代（公元前221年之前）的概念', tag: '先秦' },
  { id: 'modern',    text: '提交一个近现代（1840年后）的历史概念', tag: '近代' },
];

function getRoom(gameId) {
  if (!rooms.has(gameId)) {
    rooms.set(gameId, {
      players: new Map(),
      joinOrder: [],
      settling: false,
      turnIndex: 0,
      roundSubmitted: new Set(),
      scores: new Map(),
      challengeCard: null,
      challengeRound: 0,
    });
  }
  return rooms.get(gameId);
}

function pickColor(room) {
  const used = new Set([...room.players.values()].map(p => p.color));
  return COLORS.find(c => !used.has(c)) || COLORS[Math.floor(Math.random() * COLORS.length)];
}

function broadcastPlayers(io, gameId) {
  const room = getRoom(gameId);
  const players = [...room.players.values()].map(p => ({
    ...p,
    score: room.scores.get(p.id) || 0,
  }));
  console.log(`[Socket] broadcastPlayers gameId=${gameId} count=${players.length}`);
  io.to(gameId).emit('players:update', { players });
}

function broadcastTurnState(io, gameId) {
  const room = getRoom(gameId);
  const order = room.joinOrder.filter(id => room.players.has(id));
  const currentIdx = room.turnIndex % Math.max(order.length, 1);
  const currentPlayerId = order[currentIdx] || null;
  const currentPlayer = currentPlayerId ? room.players.get(currentPlayerId) : null;
  io.to(gameId).emit('turn:update', {
    currentPlayerId,
    currentPlayerName: currentPlayer?.name || null,
    turnIndex: currentIdx,
    order,
  });
}

function broadcastScores(io, gameId) {
  const room = getRoom(gameId);
  const scores = Object.fromEntries(room.scores);
  io.to(gameId).emit('scores:update', { scores });
}

function broadcastChallenge(io, gameId) {
  const room = getRoom(gameId);
  io.to(gameId).emit('challenge:update', {
    card: room.challengeCard,
    round: room.challengeRound,
  });
}

function pickNextChallenge(room) {
  const card = CHALLENGE_CARDS[Math.floor(Math.random() * CHALLENGE_CARDS.length)];
  room.challengeCard = card;
  room.challengeRound = 0;
  return card;
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
  module.exports._io = io;
  module.exports._rooms = rooms;

  io.on('connection', (socket) => {
    let currentGameId = null;
    let currentPlayer = null;

    console.log(`[Socket] new connection socketId=${socket.id} transport=${socket.conn?.transport?.name}`);

    // ── join ──────────────────────────────────────────────────────────────────
    socket.on('game:join', ({ gameId, playerName }, callback) => {
      const id = (gameId || '').toUpperCase();
      console.log(`[Socket] game:join socketId=${socket.id} gameId=${id} playerName=${playerName}`);

      try {
        const game = db.getGame.get(id);
        if (!game) return callback?.({ error: '房间不存在' });

        const room    = getRoom(id);
        const color   = pickColor(room);
        const playerId = socket.id;

        currentGameId  = id;
        currentPlayer  = { id: playerId, name: playerName || '匿名玩家', color };

        room.players.set(playerId, currentPlayer);
        if (!room.joinOrder.includes(playerId)) {
          room.joinOrder.push(playerId);
        }
        socket.join(id);

        db.upsertPlayer.run(playerId, id, currentPlayer.name, color);
        profileSvc.ensureProfile(playerId, currentPlayer.name, color);

        if (game.status === 'waiting') {
          db.updateGameStatus.run('playing', id);
          game.status = 'playing';
        }

        const settings = JSON.parse(game.settings || '{}');
        const ts       = new TimelineService();

        const allConcepts    = db.getConceptsByGame.all(id).map(parseConcept);
        const timeline       = ts.buildTimeline(allConcepts);
        const pendingConcepts = db.getPendingConcepts.all(id).map(parseConcept);
        const messages = db.getMessagesByGame.all(id).map(m => ({ ...m, meta: JSON.parse(m.meta || '{}') }));

        // Init challenge card if needed
        if (game.mode === 'challenge' && !room.challengeCard) {
          pickNextChallenge(room);
        }

        const scores = Object.fromEntries(room.scores);

        callback?.({
          ok: true,
          game: { ...game, settings },
          player: currentPlayer,
          timeline,
          pendingConcepts,
          messages,
          scores,
          turnState: game.mode === 'turn-order' ? {
            currentPlayerId: room.joinOrder.filter(pid => room.players.has(pid))[room.turnIndex % Math.max(room.joinOrder.filter(pid => room.players.has(pid)).length, 1)] || null,
            order: room.joinOrder.filter(pid => room.players.has(pid)),
          } : null,
          challengeCard: room.challengeCard,
        });

        broadcastPlayers(io, id);
        sysMessage(io, id, `${currentPlayer.name} 加入了游戏`);
        pluginEvents.emit('player:join', { game, player: currentPlayer });

        // Broadcast turn/challenge state to newcomer
        if (game.mode === 'turn-order') broadcastTurnState(io, id);
        if (game.mode === 'challenge' && room.challengeCard) broadcastChallenge(io, id);

      } catch (err) {
        console.error(`[Socket] game:join ERROR socketId=${socket.id} gameId=${id}:`, err);
        callback?.({ error: `加入失败：${err.message}` });
      }
    });

    // ── submit concept ────────────────────────────────────────────────────────
    socket.on('concept:submit', async ({ rawInput }, callback) => {
      console.log(`[Socket] concept:submit socketId=${socket.id} gameId=${currentGameId} input="${rawInput}"`);

      if (!currentGameId || !currentPlayer) return callback?.({ error: '请先加入房间' });

      const game = db.getGame.get(currentGameId);
      if (!game) return callback?.({ error: '房间不存在' });
      if (game.status === 'finished') return callback?.({ error: '游戏已结束' });

      const room = getRoom(currentGameId);
      if (room.settling) return callback?.({ error: '正在结算中，请稍候' });

      const input = (rawInput || '').trim();
      if (!input) return callback?.({ error: '请输入内容' });

      const settings = JSON.parse(game.settings || '{}');
      const isDeferred = settings.validationMode === 'deferred';

      // ── Turn-order mode check ─────────────────────────────────────────────
      if (game.mode === 'turn-order') {
        const order = room.joinOrder.filter(pid => room.players.has(pid));
        if (order.length > 0) {
          const currentTurnIdx = room.turnIndex % order.length;
          const expectedPlayerId = order[currentTurnIdx];
          if (expectedPlayerId !== currentPlayer.id) {
            const expectedName = room.players.get(expectedPlayerId)?.name || '其他玩家';
            return callback?.({ error: `现在是 ${expectedName} 的回合，请等待轮到你` });
          }
        }
      }

      // ── Relay mode check ──────────────────────────────────────────────────
      if (game.mode === 'relay') {
        if (room.roundSubmitted.has(currentPlayer.id)) {
          return callback?.({ error: '你本轮已提交过概念，等待其他玩家提交后开启新一轮' });
        }
      }

      // Save chat message
      const chatMsg = {
        id: uuidv4(), game_id: currentGameId,
        player_id: currentPlayer.id, player_name: currentPlayer.name,
        type: 'concept_attempt', content: input, meta: {}, created_at: new Date().toISOString(),
      };
      db.insertMessage.run(chatMsg.id, currentGameId, chatMsg.player_id, chatMsg.player_name, 'concept_attempt', input, '{}');
      io.to(currentGameId).emit('message:new', chatMsg);

      // ── Deferred mode: save as pending ────────────────────────────────────
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

        // Advance relay/turn-order state even for deferred
        _advanceTurnState(io, currentGameId, game, room, currentPlayer.id);
        return;
      }

      // ── Realtime: AI validate immediately ─────────────────────────────────
      io.to(currentGameId).emit('concept:validating', {
        playerId: currentPlayer.id, playerName: currentPlayer.name, rawInput: input,
      });

      try {
        const existing = db.getConceptsByGame.all(currentGameId)
          .filter(c => c.validated)
          .map(c => ({ name: c.name, period: c.period }));

        const kbCheck = validateFromKnowledge(input, game.topic);
        let result;
        let validationMethod = 'ai';
        const tsAI = Date.now();

        if (kbCheck.confident) {
          result = kbCheck.result;
          validationMethod = 'kb';
        } else {
          const knowledgeContext = getContextForConcept(input, game.topic);
          result = await ai.validateConcept(input, game.topic, existing, { mode: game.mode, ...settings }, knowledgeContext);
        }

        const msElapsed = Date.now() - tsAI;
        const conceptId = uuidv4();

        if (!result.valid) {
          db.insertConcept.run(conceptId, currentGameId, currentPlayer.id, currentPlayer.name,
            input, input, null, null, null, null, '[]', 0, 1, result.reason || '无效', '{}');

          auditSvc.logDecision(conceptId, currentGameId, validationMethod, {
            response: JSON.stringify({ valid: false, reason: result.reason }),
            ms: msElapsed,
          });
          profileSvc.recordConceptResult(currentPlayer.id, false, false);

          const rejMsg = {
            id: uuidv4(), type: 'system', game_id: currentGameId,
            content: `「${input}」被驳回：${result.reason || '与主题无关'}`,
            meta: { conceptId, rejected: true }, created_at: new Date().toISOString(),
          };
          db.insertMessage.run(rejMsg.id, currentGameId, null, null, 'system', rejMsg.content, JSON.stringify(rejMsg.meta));
          io.to(currentGameId).emit('message:new', rejMsg);
          return callback?.({ ok: false, reason: result.reason });
        }

        // ── Accepted ──────────────────────────────────────────────────────
        const difficulty = Math.max(1, Math.min(5, parseInt(result.difficulty) || 3));
        const tags  = JSON.stringify(Array.isArray(result.tags) ? result.tags : []);
        const extra = JSON.stringify(result.extra || { difficulty });
        db.insertConcept.run(conceptId, currentGameId, currentPlayer.id, currentPlayer.name,
          input, result.name, result.period, result.year ?? null,
          result.dynasty, result.description, tags, 1, 0, null, extra);

        auditSvc.logDecision(conceptId, currentGameId, validationMethod, {
          response: JSON.stringify(result),
          ms: msElapsed,
        });
        profileSvc.recordConceptResult(currentPlayer.id, true, false);

        const ts = new TimelineService();
        const concept = {
          id: conceptId, game_id: currentGameId,
          player_id: currentPlayer.id, player_name: currentPlayer.name,
          raw_input: input, name: result.name, period: result.period,
          year: result.year ?? null, dynasty: result.dynasty,
          description: result.description, tags: Array.isArray(result.tags) ? result.tags : [],
          extra: { difficulty, ...(result.extra || {}) }, validated: 1, rejected: 0,
          eraLabel: ts.getEraLabel(result.year ?? null, result.dynasty), created_at: new Date().toISOString(),
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

        // ── Score-race / challenge scoring ────────────────────────────────
        if (game.mode === 'score-race' || game.mode === 'challenge') {
          let points = difficulty * 10;
          let bonus = 0;

          // Challenge card bonus
          if (game.mode === 'challenge' && room.challengeCard) {
            const cardTag = room.challengeCard.tag;
            const matchesTags = (result.tags || []).some(t =>
              t.includes(cardTag) || cardTag.includes(t)
            );
            const matchesDesc = (result.description || '').includes(cardTag) ||
              (result.name || '').includes(cardTag);
            const matchesDynasty = (result.dynasty || '').includes(cardTag) ||
              (result.period || '').includes(cardTag);

            if (matchesTags || matchesDesc || matchesDynasty) {
              bonus = 50;
              const bonusMsg = `🎯 ${currentPlayer.name} 完成了挑战「${room.challengeCard.text}」+${bonus}分！`;
              sysMessage(io, currentGameId, bonusMsg, { type: 'challenge_complete', bonus });
            }

            // Rotate challenge every 5 accepted concepts
            room.challengeRound++;
            if (room.challengeRound >= 5) {
              const newCard = pickNextChallenge(room);
              sysMessage(io, currentGameId, `🃏 新挑战：${newCard.text}`);
              broadcastChallenge(io, currentGameId);
            }
          }

          const prevScore = room.scores.get(currentPlayer.id) || 0;
          room.scores.set(currentPlayer.id, prevScore + points + bonus);
          broadcastScores(io, currentGameId);
          broadcastPlayers(io, currentGameId);
        }

        // ── Relay/turn-order advancement ──────────────────────────────────
        _advanceTurnState(io, currentGameId, game, room, currentPlayer.id);

        try {
          ingestAIConfirmedConcept({ ...concept, id: conceptId }, currentGameId);
        } catch (kbErr) {
          console.warn(`[Socket] AI KB ingest failed (non-fatal): ${kbErr.message}`);
        }

      } catch (err) {
        console.error(`[Socket] concept:submit ERROR gameId=${currentGameId}:`, err);
        sysMessage(io, currentGameId, `验证出错：${err.message}`);
        callback?.({ error: err.message });
      }
    });

    // ── batch settle (deferred mode) ──────────────────────────────────────────
    socket.on('game:settle', async ({ endGame = false, conceptIds } = {}, callback) => {
      console.log(`[Socket] game:settle socketId=${socket.id} gameId=${currentGameId} endGame=${endGame} ids=${conceptIds?.length ?? 'all'}`);

      if (!currentGameId) return callback?.({ error: '请先加入房间' });

      const game = db.getGame.get(currentGameId);
      if (!game) return callback?.({ error: '房间不存在' });

      const room = getRoom(currentGameId);
      if (room.settling) return callback?.({ error: '已在结算中' });

      // If conceptIds provided, validate only those (multi-select batch)
      let pending = db.getPendingConcepts.all(currentGameId);
      if (Array.isArray(conceptIds) && conceptIds.length > 0) {
        pending = pending.filter(p => conceptIds.includes(p.id));
      }

      if (!pending.length) {
        if (endGame && !conceptIds?.length) {
          db.updateGameStatus.run('finished', currentGameId);
          sysMessage(io, currentGameId, '没有待验证的概念，游戏结束');
          io.to(currentGameId).emit('game:finished');
        } else {
          sysMessage(io, currentGameId, '当前没有待验证的概念');
        }
        return callback?.({ ok: true, accepted: 0, rejected: 0 });
      }

      room.settling = true;
      settlementSvc.startSettlement(currentGameId);
      sysMessage(io, currentGameId, `开始结算，共 ${pending.length} 个概念待验证...`);
      io.to(currentGameId).emit('game:settle:start', { total: pending.length });
      callback?.({ ok: true, total: pending.length });

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
            const difficulty = Math.max(1, Math.min(5, parseInt(r.difficulty) || 3));
            const extra = JSON.stringify({ difficulty });
            db.acceptConcept.run(
              r.name || row.raw_input, r.period || null, r.year ?? null,
              r.dynasty || null, r.description || null, tags, extra, r.id
            );
            auditSvc.logDecision(r.id, currentGameId, 'ai', { response: JSON.stringify(r) });
            profileSvc.recordConceptResult(row.player_id, true, false);

            const concept = {
              id: r.id, game_id: currentGameId,
              player_id: row.player_id, player_name: row.player_name,
              raw_input: row.raw_input, name: r.name || row.raw_input,
              period: r.period, year: r.year ?? null, dynasty: r.dynasty,
              description: r.description, tags: Array.isArray(r.tags) ? r.tags : [],
              extra: { difficulty }, validated: 1, rejected: 0,
              eraLabel: ts.getEraLabel(r.year ?? null, r.dynasty), created_at: row.created_at,
            };
            io.to(currentGameId).emit('concept:settled', { conceptId: r.id, accepted: true, concept });
            accepted++;
            try { ingestAIConfirmedConcept(concept, currentGameId); } catch { /* non-fatal */ }
          } else {
            db.rejectConcept.run(r.reason || '不符合主题', r.id);
            auditSvc.logDecision(r.id, currentGameId, 'ai', { response: JSON.stringify({ valid: false, reason: r.reason }) });
            profileSvc.recordConceptResult(row.player_id, false, false);
            io.to(currentGameId).emit('concept:settled', {
              conceptId: r.id, accepted: false,
              reason: r.reason || '不符合主题', playerName: row.player_name, rawInput: row.raw_input,
            });
            rejected++;
          }
        }

        const summaryMsg = `结算完成：${accepted} 个通过，${rejected} 个淘汰${endGame ? '，游戏结束' : '，可继续提交'}`;
        sysMessage(io, currentGameId, summaryMsg);
        io.to(currentGameId).emit('game:settle:done', { accepted, rejected, endGame });

        if (endGame && !conceptIds?.length) {
          db.updateGameStatus.run('finished', currentGameId);
          io.to(currentGameId).emit('game:finished');
        }

        settlementSvc.completeSettlement(currentGameId);
        console.log(`[Socket] game:settle DONE gameId=${currentGameId} accepted=${accepted} rejected=${rejected}`);

      } catch (err) {
        console.error(`[Socket] game:settle ERROR gameId=${currentGameId}:`, err);
        room.settling = false;
        settlementSvc.failSettlement(currentGameId);
        sysMessage(io, currentGameId, `结算出错：${err.message}`);
      } finally {
        room.settling = false;
      }
    });

    // ── free validate: validate a single pending concept ──────────────────────
    socket.on('concept:validate_single', async ({ conceptId }, callback) => {
      if (!currentGameId || !currentPlayer) return callback?.({ error: '请先加入房间' });

      const game = db.getGame.get(currentGameId);
      if (!game) return callback?.({ error: '房间不存在' });
      if (game.status === 'finished') return callback?.({ error: '游戏已结束' });

      const room = getRoom(currentGameId);
      if (room.settling) return callback?.({ error: '正在批量结算中，请稍候' });

      const pending = db.getPendingConcepts.all(currentGameId);
      const row = pending.find(p => p.id === conceptId);
      if (!row) return callback?.({ error: '未找到该概念，可能已被验证' });

      io.to(currentGameId).emit('concept:validating', {
        playerId: row.player_id, playerName: row.player_name, rawInput: row.raw_input,
      });

      try {
        const existing = db.getConceptsByGame.all(currentGameId)
          .filter(c => c.validated)
          .map(c => ({ name: c.name, period: c.period }));

        const settings = JSON.parse(game.settings || '{}');
        const kbCheck = validateFromKnowledge(row.raw_input, game.topic);
        let result;
        if (kbCheck.confident) {
          result = kbCheck.result;
        } else {
          const knowledgeContext = getContextForConcept(row.raw_input, game.topic);
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
            id: uuidv4(), type: 'system', game_id: currentGameId,
            content: `「${row.raw_input}」被驳回：${result.reason || '与主题无关'}`,
            meta: { conceptId, rejected: true }, created_at: new Date().toISOString(),
          };
          db.insertMessage.run(rejMsg.id, currentGameId, null, null, 'system', rejMsg.content, JSON.stringify(rejMsg.meta));
          io.to(currentGameId).emit('message:new', rejMsg);
          return callback?.({ ok: true });
        }

        const difficulty = Math.max(1, Math.min(5, parseInt(result.difficulty) || 3));
        const tags  = JSON.stringify(Array.isArray(result.tags) ? result.tags : []);
        const extra = JSON.stringify({ difficulty });
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
          extra: { difficulty }, validated: 1, rejected: 0,
          eraLabel: ts.getEraLabel(result.year ?? null, result.dynasty), created_at: row.created_at,
        };

        io.to(currentGameId).emit('concept:settled', { conceptId, accepted: true, concept });

        const confirmContent = `✓ 「${result.name}」已加入时间轴（${result.dynasty || result.period || '年代不详'}）`;
        const confirmId = uuidv4();
        db.insertMessage.run(confirmId, currentGameId, null, null, 'system', confirmContent, JSON.stringify({ conceptId, concept: true }));
        io.to(currentGameId).emit('message:new', {
          id: confirmId, type: 'system', game_id: currentGameId,
          content: confirmContent, meta: { conceptId, concept: true }, created_at: new Date().toISOString(),
        });

        try { ingestAIConfirmedConcept(concept, currentGameId); } catch { /* non-fatal */ }
        callback?.({ ok: true });
      } catch (err) {
        console.error(`[Socket] concept:validate_single ERROR gameId=${currentGameId}:`, err);
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
      } catch (err) {
        callback?.({ error: '获取提示失败' });
      }
    });

    // ── finish ────────────────────────────────────────────────────────────────
    socket.on('game:finish', (_, callback) => {
      if (!currentGameId) return callback?.({ error: '请先加入房间' });
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
        const room = getRoom(currentGameId);
        room.players.delete(currentPlayer.id);
        // Remove from joinOrder to avoid dead slots in turn rotation
        room.joinOrder = room.joinOrder.filter(id => id !== currentPlayer.id);
        // Recalculate turn index to not skip players
        if (room.joinOrder.length > 0) {
          room.turnIndex = room.turnIndex % room.joinOrder.length;
        }
        broadcastPlayers(io, currentGameId);
        sysMessage(io, currentGameId, `${currentPlayer.name} 离开了游戏`);
        pluginEvents.emit('player:leave', { gameId: currentGameId, player: currentPlayer });

        const game = db.getGame.get(currentGameId);
        if (game?.mode === 'turn-order') broadcastTurnState(io, currentGameId);
      } catch (err) {
        console.error(`[Socket] disconnect cleanup ERROR socketId=${socket.id}:`, err);
      }
    });
  });
};

// ── Turn/relay state advancement (internal helper) ────────────────────────────

function _advanceTurnState(io, gameId, game, room, playerId) {
  if (game.mode === 'turn-order') {
    const order = room.joinOrder.filter(pid => room.players.has(pid));
    if (order.length > 0) {
      room.turnIndex = (room.turnIndex + 1) % order.length;
      broadcastTurnState(io, gameId);
      const nextId = order[room.turnIndex];
      const nextName = room.players.get(nextId)?.name || '下一位玩家';
      sysMessage(io, gameId, `轮到 ${nextName} 提交概念了`);
    }
  } else if (game.mode === 'relay') {
    room.roundSubmitted.add(playerId);
    const activePlayers = [...room.players.keys()];
    const allSubmitted = activePlayers.every(pid => room.roundSubmitted.has(pid));
    if (allSubmitted) {
      room.roundSubmitted = new Set();
      const roundMsg = '🔄 所有玩家本轮已提交，新一轮开始！';
      sysMessage(io, gameId, roundMsg);
      io.to(gameId).emit('relay:round_reset', {});
    }
  }
}
