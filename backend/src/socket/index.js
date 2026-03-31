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
 *
 * Mode combination: game.settings.extraModes = string[] enables stacking multiple mode effects.
 *
 * Challenge settings (in game.settings):
 *   challengeThreshold  — how many accepted concepts before card rotates (default: 2)
 *   skipCooldownMs      — milliseconds between manual card skips (default: 0 = no limit)
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const ai = require('../services/aiService');
const {
  getContextForConceptAdvancedWithTrace,
  searchContextAdvancedWithTrace,
  getRagRuntimeConfig,
  ingestAIConfirmedConcept,
  validateFromKnowledge,
} = require('../services/knowledgeService');
const { TimelineService } = require('../services/timelineService');
const { pluginEvents } = require('../plugins');
const auditSvc = require('../services/auditService');
const profileSvc = require('../services/profileService');
const settlementSvc = require('../services/settlementService');
const { parseArray, parseObject } = require('../utils/json');

// ── In-memory rooms ───────────────────────────────────────────────────────────

const rooms = new Map();

/**
 * Room shape:
 * {
 *   players: Map<playerId, { id, name, color, isAdmin? }>,
 *   playerSockets: Map<playerId, socketId>,
 *   socketToPlayer: Map<socketId, playerId>,
 *   joinOrder: string[],
 *   settling: boolean,
 *   turnIndex: number,
 *   roundSubmitted: Set<string>,
 *   scores: Map<playerId, number>,
 *   challengeCard: { id, text, tag, periodHint? } | null,
 *   challengeRound: number,     // accepted concepts in current card round
 *   topicCards: Array | null,   // AI-generated topic-specific cards
 *   lastSkipAt: number,         // timestamp of last manual skip
 *   challengeStreak: number,    // consecutive challenge card completions
 *   lastChallengeCompleted: boolean, // did the last accepted concept complete the challenge?
 *   lastSubmitAt: Map<playerId, number>, // submit cooldown timestamps
 *   lastHintAt: Map<playerId, number>,   // hint cooldown timestamps
 *   lives: Map<playerId, number>,        // used by survival mode
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
      playerSockets: new Map(),
      socketToPlayer: new Map(),
      joinOrder: [],
      settling: false,
      turnIndex: 0,
      roundSubmitted: new Set(),
      scores: new Map(),
      challengeCard: null,
      challengeRound: 0,
      topicCards: null,
      lastSkipAt: 0,
      challengeStreak: 0,
      lastChallengeCompleted: false,
      lastSubmitAt: new Map(),
      lastHintAt: new Map(),
      lives: new Map(),
    });
  }
  return rooms.get(gameId);
}

/**
 * Check if game has a particular mode enabled (primary or combined extra mode).
 */
function hasMode(game, settings, mode) {
  if (game.mode === mode) return true;
  if (Array.isArray(settings?.extraModes) && settings.extraModes.includes(mode)) return true;
  return false;
}

function getActiveModes(game, settings) {
  return [...new Set([game.mode, ...(Array.isArray(settings?.extraModes) ? settings.extraModes : [])].filter(Boolean))];
}

function normalizePlayerId(raw) {
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  if (!id) return null;
  if (!/^[A-Za-z0-9_-]{6,100}$/.test(id)) return null;
  return id;
}

function isObserverPlayer(player) {
  return Boolean(player?.isObserver);
}

function resolveCurrentPlayer(room, socketId, currentPlayer) {
  if (currentPlayer) return currentPlayer;
  const mappedPlayerId = room.socketToPlayer.get(socketId);
  if (!mappedPlayerId) return null;
  return room.players.get(mappedPlayerId) || null;
}

function hasAdminPrivileges(room, player) {
  if (!player) return false;
  if (player.isAdmin === true) return true;
  return room.players.get(player.id)?.isAdmin === true;
}

function getActivePlayerIds(room) {
  return room.joinOrder.filter(id => room.players.has(id));
}

function getTurnStatePayload(room) {
  const order = getActivePlayerIds(room);
  const currentIdx = room.turnIndex % Math.max(order.length, 1);
  const currentPlayerId = order[currentIdx] || null;
  const currentPlayer = currentPlayerId ? room.players.get(currentPlayerId) : null;
  return {
    currentPlayerId,
    currentPlayerName: currentPlayer?.name || null,
    turnIndex: currentIdx,
    order,
  };
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
    lives: room.lives.get(p.id),
  }));
  console.log(`[Socket] broadcastPlayers gameId=${gameId} count=${players.length}`);
  io.to(gameId).emit('players:update', { players });
}

function broadcastTurnState(io, gameId) {
  io.to(gameId).emit('turn:update', getTurnStatePayload(getRoom(gameId)));
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

function applyLifePenalty(io, gameId, room, playerId, playerName) {
  const currentLives = Number(room.lives.get(playerId) ?? 0);
  if (currentLives <= 0) return;
  const nextLives = Math.max(0, currentLives - 1);
  room.lives.set(playerId, nextLives);
  broadcastPlayers(io, gameId);
  if (nextLives <= 0) {
    sysMessage(io, gameId, `💀 ${playerName} 生命值耗尽，进入旁观状态`);
  } else {
    sysMessage(io, gameId, `🩸 ${playerName} 被驳回，生命值剩余 ${nextLives}`);
  }
}

function pickNextChallenge(room) {
  // Prefer AI-generated topic-specific cards; fall back to generic pool
  const pool = (room.topicCards && room.topicCards.length > 0)
    ? room.topicCards
    : CHALLENGE_CARDS;
  // Avoid repeating the same card consecutively if pool is large enough
  let card;
  if (pool.length > 1 && room.challengeCard) {
    const others = pool.filter(c => c.id !== room.challengeCard.id);
    card = others[Math.floor(Math.random() * others.length)];
  } else {
    card = pool[Math.floor(Math.random() * pool.length)];
  }
  room.challengeCard = card;
  room.challengeRound = 0;
  return card;
}

function ensureChallengeState(io, gameId, game, settings, room) {
  if (!hasMode(game, settings, 'challenge') || room.challengeCard) return;

  pickNextChallenge(room); // start with generic card immediately

  if (room.topicCards) return;

  ai.generateChallengeCards(game.topic).then(cards => {
    if (cards && cards.length > 0) {
      room.topicCards = cards;
      pickNextChallenge(room);
      broadcastChallenge(io, gameId);
      console.log(`[Socket] Generated ${cards.length} topic cards for "${game.topic}"`);
    }
  }).catch(err => {
    console.warn(`[Socket] Topic cards generation failed (using generic): ${err.message}`);
  });
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
  return { ...row, tags: parseArray(row.tags, []), extra: parseObject(row.extra, {}) };
}

function buildGameSnapshot(game, room, player) {
  const settings = parseObject(game.settings, {});
  const ts = new TimelineService();
  const allConcepts = db.getConceptsByGame.all(game.id).map(parseConcept);
  const latestMessages = db.getLatestMessages.all(game.id, 500).reverse();

  return {
    ok: true,
    game: { ...game, settings },
    player,
    timeline: ts.buildTimeline(allConcepts),
    pendingConcepts: db.getPendingConcepts.all(game.id).map(parseConcept),
    messages: latestMessages.map(m => ({ ...m, meta: parseObject(m.meta, {}) })),
    messageTruncated: db.getMessageCount.get(game.id)?.count > latestMessages.length,
    scores: Object.fromEntries(room.scores),
    turnState: hasMode(game, settings, 'turn-order') ? getTurnStatePayload(room) : null,
    challengeCard: room.challengeCard,
  };
}

/** Expose rooms map so admin can inspect / force-end games */
module.exports = function setupSocket(io) {
  module.exports._io = io;
  module.exports._rooms = rooms;

  io.on('connection', (socket) => {
    let currentGameId = null;
    let currentPlayer = null;
    let wantsAdmin = false;

    console.log(`[Socket] new connection socketId=${socket.id} transport=${socket.conn?.transport?.name}`);

    // ── join ──────────────────────────────────────────────────────────────────
    socket.on('game:join', ({ gameId, playerName, playerId }, callback) => {
      const id = (gameId || '').toUpperCase();
      console.log(`[Socket] game:join socketId=${socket.id} gameId=${id} playerName=${playerName} playerId=${playerId || '-'}`);

      try {
        const game = db.getGame.get(id);
        if (!game) return callback?.({ error: '房间不存在' });

        const room = getRoom(id);
        const settings = JSON.parse(game.settings || '{}');
        const normalizedPlayerId = normalizePlayerId(playerId) || socket.id;
        const existingPlayer = room.players.get(normalizedPlayerId);
        const activePlayerIds = getActivePlayerIds(room);
        const maxPlayers = Number(settings.maxPlayers) || 0;

        if (!existingPlayer && maxPlayers > 0 && activePlayerIds.length >= maxPlayers) {
          return callback?.({ error: `房间已满（最多 ${maxPlayers} 人）` });
        }

        const color = existingPlayer?.color || pickColor(room);
        const previousSocketId = room.playerSockets.get(normalizedPlayerId);
        const isReconnect = Boolean(existingPlayer && previousSocketId && previousSocketId !== socket.id);

        currentGameId = id;
        currentPlayer = {
          id: normalizedPlayerId,
          name: (playerName || existingPlayer?.name || '匿名玩家').slice(0, 32),
          color,
          isAdmin: Boolean(existingPlayer?.isAdmin || wantsAdmin),
        };

        room.players.set(normalizedPlayerId, currentPlayer);
        if (hasMode(game, settings, 'survival') && !room.lives.has(normalizedPlayerId)) {
          const initialLives = Math.max(1, Math.min(10, Number(settings.initialLives) || 3));
          room.lives.set(normalizedPlayerId, initialLives);
        }
        if (!room.joinOrder.includes(normalizedPlayerId)) {
          room.joinOrder.push(normalizedPlayerId);
        }
        if (previousSocketId && previousSocketId !== socket.id) {
          room.socketToPlayer.delete(previousSocketId);
          const prevSocket = io.sockets.sockets.get(previousSocketId);
          if (prevSocket) prevSocket.leave(id);
          console.log(`[Socket] replaced stale socket playerId=${normalizedPlayerId} old=${previousSocketId} new=${socket.id}`);
        }
        room.playerSockets.set(normalizedPlayerId, socket.id);
        room.socketToPlayer.set(socket.id, normalizedPlayerId);
        socket.join(id);

        db.upsertPlayer.run(normalizedPlayerId, id, currentPlayer.name, color);
        profileSvc.ensureProfile(normalizedPlayerId, currentPlayer.name, color);

        if (game.status === 'waiting') {
          db.updateGameStatus.run('playing', id);
          game.status = 'playing';
        }

        ensureChallengeState(io, id, game, settings, room);
        callback?.(buildGameSnapshot(game, room, currentPlayer));

        broadcastPlayers(io, id);
        sysMessage(io, id, isReconnect ? `${currentPlayer.name} 重新连接到游戏` : `${currentPlayer.name} 加入了游戏`);
        pluginEvents.emit('player:join', { game, player: currentPlayer });

        // Broadcast turn/challenge state to newcomer
        if (hasMode(game, settings, 'turn-order')) broadcastTurnState(io, id);
        if (hasMode(game, settings, 'challenge') && room.challengeCard) broadcastChallenge(io, id);

      } catch (err) {
        console.error(`[Socket] game:join ERROR socketId=${socket.id} gameId=${id}:`, err);
        callback?.({ error: `加入失败：${err.message}` });
      }
    });

    // ── submit concept ────────────────────────────────────────────────────────
    socket.on('concept:submit', async ({ rawInput }, callback) => {
      console.log(`[Socket] concept:submit socketId=${socket.id} gameId=${currentGameId} input="${rawInput}"`);

      if (!currentGameId || !currentPlayer) return callback?.({ error: '请先加入房间' });
      if (isObserverPlayer(currentPlayer)) return callback?.({ error: '管理员观察模式不可提交概念' });

      const game = db.getGame.get(currentGameId);
      if (!game) return callback?.({ error: '房间不存在' });
      if (game.status === 'finished') return callback?.({ error: '游戏已结束' });

      const room = getRoom(currentGameId);
      if (room.settling) return callback?.({ error: '正在结算中，请稍候' });

      const input = (rawInput || '').trim();
      if (!input) return callback?.({ error: '请输入内容' });

      const settings = JSON.parse(game.settings || '{}');
      const isDeferred = settings.validationMode === 'deferred';

      const submitCooldownSec = Number(settings.submitCooldownSec) || 0;
      if (submitCooldownSec > 0) {
        const last = room.lastSubmitAt.get(currentPlayer.id) || 0;
        const now = Date.now();
        const remain = Math.ceil((submitCooldownSec * 1000 - (now - last)) / 1000);
        if (remain > 0) {
          return callback?.({ error: `提交冷却中，请 ${remain} 秒后再试` });
        }
      }

      if (hasMode(game, settings, 'survival')) {
        const lives = Number(room.lives.get(currentPlayer.id) ?? Math.max(1, Number(settings.initialLives) || 3));
        room.lives.set(currentPlayer.id, lives);
        if (lives <= 0) return callback?.({ error: '你已出局，当前为旁观状态' });
      }

      // ── Turn-order mode check ─────────────────────────────────────────────
      if (hasMode(game, settings, 'turn-order')) {
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
      if (hasMode(game, settings, 'relay')) {
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
        room.lastSubmitAt.set(currentPlayer.id, Date.now());

        // Advance relay/turn-order state even for deferred
        _advanceTurnState(io, currentGameId, game, room, currentPlayer.id);
        return;
      }

      // ── Realtime: AI validate immediately ─────────────────────────────────
      io.to(currentGameId).emit('concept:validating', {
        playerId: currentPlayer.id, playerName: currentPlayer.name, rawInput: input,
      });

      try {
        const ragRuntime = getRagRuntimeConfig(settings);
        const existing = db.getConceptsByGame.all(currentGameId)
          .filter(c => c.validated)
          .map(c => ({ name: c.name, period: c.period }));

        const auxPlan = await ai.planValidationAssist(input, game.topic, existing);
        const ragFlow = auxPlan.useRag
          ? await getContextForConceptAdvancedWithTrace(input, game.topic, {
            ...settings,
            topicQuery: auxPlan.topicQuery || game.topic,
            conceptQuery: auxPlan.conceptQuery || input,
            useTopicSearch: Boolean(settings?.ragUseTopicSearch) && auxPlan.useTopicSearch !== false,
          })
          : { context: '', trace: { stage: 'aux_skip', note: auxPlan.note || 'skip rag' } };
        const knowledgeContextRaw = ragFlow.context;
        const guardResult = await ai.guardRagContext(game.topic, input, knowledgeContextRaw);
        const knowledgeContext = guardResult.context;
        const polishedRag = (knowledgeContext && ragRuntime.polishEnabled)
          ? await ai.polishRagContext(knowledgeContext, ragRuntime.polishMaxChars)
          : '';
        const kbCheck = validateFromKnowledge(input, game.topic);
        let result;
        let aiTrace = null;
        let validationMethod = 'ai';
        const tsAI = Date.now();

        if (kbCheck.confident) {
          result = kbCheck.result;
          validationMethod = 'kb';
        } else {
          validationMethod = knowledgeContext ? 'rag+ai' : 'ai';
          const traced = await ai.validateConceptWithTrace(
            input,
            game.topic,
            existing,
            { mode: game.mode, modes: getActiveModes(game, settings), ...settings },
            knowledgeContext
          );
          result = traced.result;
          aiTrace = traced.trace;
        }

        const msElapsed = Date.now() - tsAI;
        const conceptId = uuidv4();
        const auxiliary = {
          plan: auxPlan?._trace || null,
          guard: guardResult.trace || null,
          aiValidation: aiTrace?.auxiliary || [],
        };

        if (!result.valid) {
          db.insertConcept.run(conceptId, currentGameId, currentPlayer.id, currentPlayer.name,
            input, input, null, null, null, null, '[]', 0, 1, result.reason || '无效', '{}');

          auditSvc.logDecision(conceptId, currentGameId, validationMethod, {
            prompt: aiTrace?.prompt || null,
            response: JSON.stringify({
              result: { valid: false, reason: result.reason },
              rawOutput: aiTrace?.rawOutput || null,
              rag: {
                used: Boolean(knowledgeContext),
                context: knowledgeContext || '',
                flow: ragFlow.trace,
                auxPlan,
                auxTrace: auxiliary,
              },
              auxiliary,
            }),
            provider: aiTrace?.provider || null,
            model: aiTrace?.model || null,
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
          room.lastSubmitAt.set(currentPlayer.id, Date.now());
          if (hasMode(game, settings, 'survival')) {
            applyLifePenalty(io, currentGameId, room, currentPlayer.id, currentPlayer.name);
          }
          return callback?.({ ok: false, reason: result.reason });
        }

        // ── Accepted ──────────────────────────────────────────────────────
        const difficulty = Math.max(1, Math.min(5, parseInt(result.difficulty) || 3));
        const tags  = JSON.stringify(Array.isArray(result.tags) ? result.tags : []);
        const extra = JSON.stringify({ ...(result.extra || {}), difficulty, ragPolished: polishedRag });
        db.insertConcept.run(conceptId, currentGameId, currentPlayer.id, currentPlayer.name,
          input, result.name, result.period, result.year ?? null,
          result.dynasty, result.description, tags, 1, 0, null, extra);

        auditSvc.logDecision(conceptId, currentGameId, validationMethod, {
          prompt: aiTrace?.prompt || null,
          response: JSON.stringify({
            result,
            rawOutput: aiTrace?.rawOutput || null,
            rag: {
              used: Boolean(aiTrace?.ragUsed),
              context: aiTrace?.knowledgeContext || '',
              flow: ragFlow.trace,
              auxPlan,
              auxTrace: auxiliary,
            },
            auxiliary,
          }),
          provider: aiTrace?.provider || null,
          model: aiTrace?.model || null,
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
          extra: { difficulty, ...(result.extra || {}), ragPolished: polishedRag }, validated: 1, rejected: 0,
          eraLabel: ts.getEraLabel(result.year ?? null, result.dynasty), created_at: new Date().toISOString(),
        };

        const confirmContent = `✓ 「${result.name}」已加入时间轴（${result.dynasty || result.period || '年代不详'}）`;
        db.insertMessage.run(uuidv4(), currentGameId, null, null, 'system', confirmContent, JSON.stringify({ conceptId, concept: true }));
        io.to(currentGameId).emit('message:new', {
          id: uuidv4(), type: 'system', game_id: currentGameId,
          content: confirmContent, meta: { conceptId, concept: true }, created_at: new Date().toISOString(),
        });
        if (polishedRag && ragRuntime.showPolishedInChat) {
          const ragMsg = `🧠 教材检索参考（AI精简）：\n${polishedRag}`;
          const ragId = uuidv4();
          db.insertMessage.run(ragId, currentGameId, null, null, 'system', ragMsg, JSON.stringify({ conceptId, rag: true }));
          io.to(currentGameId).emit('message:new', {
            id: ragId, type: 'system', game_id: currentGameId,
            content: ragMsg, meta: { conceptId, rag: true }, created_at: new Date().toISOString(),
          });
        }
        io.to(currentGameId).emit('concept:new', { concept });
        room.lastSubmitAt.set(currentPlayer.id, Date.now());

        if (hasMode(game, settings, 'survival')) {
          const prev = room.scores.get(currentPlayer.id) || 0;
          room.scores.set(currentPlayer.id, prev + 1);
          broadcastScores(io, currentGameId);
          broadcastPlayers(io, currentGameId);
        }
        callback?.({ ok: true, concept });
        pluginEvents.emit('concept:accepted', { game, concept, player: currentPlayer });

        // ── Score-race / challenge scoring ────────────────────────────────
        if (hasMode(game, settings, 'score-race') || hasMode(game, settings, 'challenge')) {
          let points = difficulty * 10;
          let bonus = 0;

          // Challenge card bonus (challenge mode)
          if (hasMode(game, settings, 'challenge') && room.challengeCard) {
            const cardTag = room.challengeCard.tag;
            const cardPeriodHint = room.challengeCard.periodHint || '';

            // Match against tags, description, name, dynasty/period
            const matchesTags = (result.tags || []).some(t =>
              t.includes(cardTag) || cardTag.includes(t)
            );
            const matchesDesc = (result.description || '').includes(cardTag) ||
              (result.name || '').includes(cardTag);
            const matchesDynasty = (result.dynasty || '').includes(cardTag) ||
              (result.period || '').includes(cardTag);

            const challengeCompleted = matchesTags || matchesDesc || matchesDynasty;

            if (challengeCompleted) {
              // Opt-1: Streak bonus — consecutive completions grant multiplier
              room.challengeStreak++;
              const streakBonus = Math.min(room.challengeStreak - 1, 5) * 10; // +10 per streak, max +50

              // Opt-2: Progressive early-bird bonus — complete early in card round for bigger reward
              const roundProgress = room.challengeRound; // 0 = first submission
              const earlyBonus = Math.max(0, (2 - roundProgress) * 15); // max +30 for first submission

              // Opt-3: Theme coherence bonus — card periodHint matches concept's dynasty/period
              let coherenceBonus = 0;
              if (cardPeriodHint) {
                const matchesPeriodHint = (result.dynasty || '').includes(cardPeriodHint) ||
                  (result.period || '').includes(cardPeriodHint) ||
                  cardPeriodHint.includes(result.dynasty || '') ||
                  (result.tags || []).some(t => cardPeriodHint.includes(t));
                if (matchesPeriodHint) coherenceBonus = 20;
              }

              bonus = 50 + streakBonus + earlyBonus + coherenceBonus;
              const streakLabel = room.challengeStreak > 1 ? ` (连续${room.challengeStreak}次🔥)` : '';
              const bonusMsg = `🎯 ${currentPlayer.name} 完成了挑战「${room.challengeCard.text}」+${bonus}分${streakLabel}！`;
              sysMessage(io, currentGameId, bonusMsg, { type: 'challenge_complete', bonus, streak: room.challengeStreak });

              room.lastChallengeCompleted = true;
            } else {
              // Missed this slot — break streak
              if (room.lastChallengeCompleted === false && room.challengeRound > 0) {
                room.challengeStreak = 0;
              }
              room.lastChallengeCompleted = false;
            }

            // Rotate card when threshold reached (configurable, default 2)
            const threshold = typeof settings.challengeThreshold === 'number'
              ? settings.challengeThreshold
              : 2;
            room.challengeRound++;
            if (room.challengeRound >= threshold) {
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
        const settleSettings = JSON.parse(game.settings || '{}');
        const ragRuntime = getRagRuntimeConfig(settleSettings);
        const settleRagFlow = await searchContextAdvancedWithTrace(game.topic, 2, settleSettings);
        const knowledgeContext = settleRagFlow.context;
        const polishedRag = (knowledgeContext && ragRuntime.polishEnabled)
          ? await ai.polishRagContext(knowledgeContext, ragRuntime.polishMaxChars)
          : '';
        const results = await ai.batchValidateConcepts(pending, game.topic, knowledgeContext);

        const ts = new TimelineService();
        let accepted = 0, rejected = 0;

        for (const r of results) {
          const row = pending.find(p => p.id === r.id);
          if (!row) continue;

          if (r.valid) {
            const tags  = JSON.stringify(Array.isArray(r.tags) ? r.tags : []);
            const difficulty = Math.max(1, Math.min(5, parseInt(r.difficulty) || 3));
            const extra = JSON.stringify({ difficulty, ragPolished: polishedRag });
            db.acceptConcept.run(
              r.name || row.raw_input, r.period || null, r.year ?? null,
              r.dynasty || null, r.description || null, tags, extra, r.id
            );
            auditSvc.logDecision(r.id, currentGameId, r?._trace?.ragUsed ? 'rag+ai' : 'ai', {
              prompt: r?._trace?.prompt || null,
              response: JSON.stringify({
                result: r,
                rawOutput: r?._trace?.rawOutput || null,
                rag: {
                  used: Boolean(r?._trace?.ragUsed),
                  context: r?._trace?.knowledgeContext || '',
                  flow: settleRagFlow.trace,
                },
              }),
              provider: r?._trace?.provider || null,
              model: r?._trace?.model || null,
            });
            profileSvc.recordConceptResult(row.player_id, true, false);

            const concept = {
              id: r.id, game_id: currentGameId,
              player_id: row.player_id, player_name: row.player_name,
              raw_input: row.raw_input, name: r.name || row.raw_input,
              period: r.period, year: r.year ?? null, dynasty: r.dynasty,
              description: r.description, tags: Array.isArray(r.tags) ? r.tags : [],
              extra: { difficulty, ragPolished: polishedRag }, validated: 1, rejected: 0,
              eraLabel: ts.getEraLabel(r.year ?? null, r.dynasty), created_at: row.created_at,
            };
            io.to(currentGameId).emit('concept:settled', { conceptId: r.id, accepted: true, concept });
            accepted++;
            if (hasMode(game, settleSettings, 'survival')) {
              const prev = room.scores.get(row.player_id) || 0;
              room.scores.set(row.player_id, prev + 1);
              broadcastScores(io, currentGameId);
              broadcastPlayers(io, currentGameId);
            }
            try { ingestAIConfirmedConcept(concept, currentGameId); } catch { /* non-fatal */ }
          } else {
            db.rejectConcept.run(r.reason || '不符合主题', r.id);
            auditSvc.logDecision(r.id, currentGameId, r?._trace?.ragUsed ? 'rag+ai' : 'ai', {
              prompt: r?._trace?.prompt || null,
              response: JSON.stringify({
                result: { valid: false, reason: r.reason },
                rawOutput: r?._trace?.rawOutput || null,
                rag: {
                  used: Boolean(r?._trace?.ragUsed),
                  context: r?._trace?.knowledgeContext || '',
                  flow: settleRagFlow.trace,
                },
              }),
              provider: r?._trace?.provider || null,
              model: r?._trace?.model || null,
            });
            profileSvc.recordConceptResult(row.player_id, false, false);
            io.to(currentGameId).emit('concept:settled', {
              conceptId: r.id, accepted: false,
              reason: r.reason || '不符合主题', playerName: row.player_name, rawInput: row.raw_input,
            });
            rejected++;
            if (hasMode(game, settleSettings, 'survival')) {
              applyLifePenalty(io, currentGameId, room, row.player_id, row.player_name);
            }
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
        const settings = JSON.parse(game.settings || '{}');
        const ragRuntime = getRagRuntimeConfig(settings);
        const existing = db.getConceptsByGame.all(currentGameId)
          .filter(c => c.validated)
          .map(c => ({ name: c.name, period: c.period }));
        const kbCheck = validateFromKnowledge(row.raw_input, game.topic);
        let result;
        let aiTrace = null;
        let ragFlow = null;
        let polishedRag = '';
        if (kbCheck.confident) {
          result = kbCheck.result;
        } else {
          ragFlow = await getContextForConceptAdvancedWithTrace(row.raw_input, game.topic, settings);
          const knowledgeContext = ragFlow.context;
          polishedRag = (knowledgeContext && ragRuntime.polishEnabled)
            ? await ai.polishRagContext(knowledgeContext, ragRuntime.polishMaxChars)
            : '';
          const traced = await ai.validateConceptWithTrace(
            row.raw_input,
            game.topic,
            existing,
            { mode: game.mode, modes: getActiveModes(game, settings), ...settings },
            knowledgeContext
          );
          result = traced.result;
          aiTrace = traced.trace;
        }

        const ts = new TimelineService();

        if (!result.valid) {
          db.rejectConcept.run(result.reason || '不符合主题', conceptId);
          auditSvc.logDecision(conceptId, currentGameId, aiTrace?.ragUsed ? 'rag+ai' : 'ai', {
            prompt: aiTrace?.prompt || null,
            response: JSON.stringify({
              result: { valid: false, reason: result.reason || '不符合主题' },
              rawOutput: aiTrace?.rawOutput || null,
              rag: {
                used: Boolean(aiTrace?.ragUsed),
                context: aiTrace?.knowledgeContext || '',
                flow: ragFlow?.trace || null,
              },
            }),
            provider: aiTrace?.provider || null,
            model: aiTrace?.model || null,
          });
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
          if (hasMode(game, settings, 'survival')) {
            applyLifePenalty(io, currentGameId, room, row.player_id, row.player_name);
          }
          return callback?.({ ok: true });
        }

        const difficulty = Math.max(1, Math.min(5, parseInt(result.difficulty) || 3));
        const tags  = JSON.stringify(Array.isArray(result.tags) ? result.tags : []);
        const extra = JSON.stringify({ difficulty, ragPolished: polishedRag });
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
          extra: { difficulty, ragPolished: polishedRag }, validated: 1, rejected: 0,
          eraLabel: ts.getEraLabel(result.year ?? null, result.dynasty), created_at: row.created_at,
        };

        io.to(currentGameId).emit('concept:settled', { conceptId, accepted: true, concept });
        auditSvc.logDecision(conceptId, currentGameId, aiTrace?.ragUsed ? 'rag+ai' : 'ai', {
          prompt: aiTrace?.prompt || null,
          response: JSON.stringify({
            result,
            rawOutput: aiTrace?.rawOutput || null,
            rag: {
              used: Boolean(aiTrace?.ragUsed),
              context: aiTrace?.knowledgeContext || '',
              flow: ragFlow?.trace || null,
            },
          }),
          provider: aiTrace?.provider || null,
          model: aiTrace?.model || null,
        });
        if (hasMode(game, settings, 'survival')) {
          const prev = room.scores.get(row.player_id) || 0;
          room.scores.set(row.player_id, prev + 1);
          broadcastScores(io, currentGameId);
          broadcastPlayers(io, currentGameId);
        }

        const confirmContent = `✓ 「${result.name}」已加入时间轴（${result.dynasty || result.period || '年代不详'}）`;
        const confirmId = uuidv4();
        db.insertMessage.run(confirmId, currentGameId, null, null, 'system', confirmContent, JSON.stringify({ conceptId, concept: true }));
        io.to(currentGameId).emit('message:new', {
          id: confirmId, type: 'system', game_id: currentGameId,
          content: confirmContent, meta: { conceptId, concept: true }, created_at: new Date().toISOString(),
        });
        if (polishedRag && ragRuntime.showPolishedInChat) {
          const ragMsg = `🧠 教材检索参考（AI精简）：\n${polishedRag}`;
          const ragId = uuidv4();
          db.insertMessage.run(ragId, currentGameId, null, null, 'system', ragMsg, JSON.stringify({ conceptId, rag: true }));
          io.to(currentGameId).emit('message:new', {
            id: ragId, type: 'system', game_id: currentGameId,
            content: ragMsg, meta: { conceptId, rag: true }, created_at: new Date().toISOString(),
          });
        }
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
      if (isObserverPlayer(currentPlayer)) return callback?.({ error: '管理员观察模式不可发送聊天消息' });
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
        const game = db.getGame.get(currentGameId);
        const room = getRoom(currentGameId);
        const settings = JSON.parse(game?.settings || '{}');
        const hintCooldownSec = Number(settings.hintCooldownSec) || 0;
        if (hintCooldownSec > 0 && currentPlayer?.id) {
          const last = room.lastHintAt.get(currentPlayer.id) || 0;
          const now = Date.now();
          const remain = Math.ceil((hintCooldownSec * 1000 - (now - last)) / 1000);
          if (remain > 0) return callback?.({ error: `提示冷却中，请 ${remain} 秒后再试` });
          room.lastHintAt.set(currentPlayer.id, now);
        }

        const existing = db.getConceptsByGame.all(currentGameId).filter(c => c.validated);
        const hints = await ai.suggestConcepts(game.topic, existing);
        callback?.({ ok: true, hints });
      } catch (err) {
        callback?.({ error: '获取提示失败' });
      }
    });

    // ── challenge: manual card skip ───────────────────────────────────────────
    socket.on('challenge:skip', (_, callback) => {
      if (!currentGameId || !currentPlayer) return callback?.({ error: '请先加入房间' });
      const game = db.getGame.get(currentGameId);
      if (!game) return callback?.({ error: '房间不存在' });
      const settings = JSON.parse(game.settings || '{}');
      if (!hasMode(game, settings, 'challenge')) return callback?.({ error: '当前不是挑战模式' });

      const room = getRoom(currentGameId);
      // skipCooldownMs: 0 (or undefined) = no cooldown; positive value = ms cooldown
      const cooldownMs = typeof settings.skipCooldownMs === 'number' ? settings.skipCooldownMs : 0;
      if (cooldownMs > 0) {
        const now = Date.now();
        if (now - room.lastSkipAt < cooldownMs) {
          const remaining = Math.ceil((cooldownMs - (now - room.lastSkipAt)) / 1000);
          return callback?.({ error: `换题冷却中，请等待 ${remaining} 秒` });
        }
        room.lastSkipAt = now;
      }

      // Reset streak on manual skip
      room.challengeStreak = 0;
      room.lastChallengeCompleted = false;
      const newCard = pickNextChallenge(room);
      sysMessage(io, currentGameId, `🔀 ${currentPlayer.name} 换了新挑战：${newCard.text}`);
      broadcastChallenge(io, currentGameId);
      callback?.({ ok: true, card: newCard });
    });

    // ── concept: edit (player edits own pending concept; admin edits any) ─────
    socket.on('concept:edit', ({ conceptId, newInput }, callback) => {
      if (!currentGameId || !currentPlayer) return callback?.({ error: '请先加入房间' });
      const game = db.getGame.get(currentGameId);
      if (!game || game.status === 'finished') return callback?.({ error: '游戏已结束' });

      const row = db.getConceptById.get(conceptId);
      if (!row) return callback?.({ error: '概念不存在' });
      if (row.game_id !== currentGameId) return callback?.({ error: '概念不属于本游戏' });

      const room = getRoom(currentGameId);
      const isAdmin = hasAdminPrivileges(room, currentPlayer);

      // Only allow editing pending (unvalidated) concepts; admins can also edit validated ones
      if (!isAdmin && row.validated === 1) return callback?.({ error: '已验证的概念无法修改' });
      if (!isAdmin && row.player_id !== currentPlayer.id) return callback?.({ error: '只能修改自己提交的概念' });

      const text = (newInput || '').trim();
      if (!text) return callback?.({ error: '概念内容不能为空' });

      // Update raw_input and name (reset validation state to pending)
      db.prepare(`UPDATE concepts SET raw_input=?, name=?, validated=0, rejected=0, reject_reason=NULL,
        year=NULL, dynasty=NULL, period=NULL, description=NULL, tags='[]', extra='{}'
        WHERE id=?`).run(text, text, conceptId);

      const updated = {
        id: conceptId, game_id: currentGameId,
        player_id: row.player_id, player_name: row.player_name,
        raw_input: text, name: text, validated: 0, rejected: 0,
        tags: [], extra: {}, created_at: row.created_at,
      };
      io.to(currentGameId).emit('concept:edited', { concept: updated });
      sysMessage(io, currentGameId, `✏️ 「${row.raw_input}」已被修改为「${text}」`);
      callback?.({ ok: true, concept: updated });
    });

    // ── concept: delete (player deletes own pending concept; admin deletes any) ─
    socket.on('concept:delete', ({ conceptId }, callback) => {
      if (!currentGameId) return callback?.({ error: '请先加入房间' });
      const game = db.getGame.get(currentGameId);
      if (!game) return callback?.({ error: '房间不存在' });

      const row = db.getConceptById.get(conceptId);
      if (!row) return callback?.({ error: '概念不存在' });
      if (row.game_id !== currentGameId) return callback?.({ error: '概念不属于本游戏' });

      const room = getRoom(currentGameId);
      const effectivePlayer = resolveCurrentPlayer(room, socket.id, currentPlayer)
        || (wantsAdmin ? { id: `admin_${socket.id}`, isAdmin: true } : null);
      if (!effectivePlayer) return callback?.({ error: '请先加入房间' });
      const isAdmin = hasAdminPrivileges(room, effectivePlayer);

      if (!isAdmin && row.player_id !== effectivePlayer.id) return callback?.({ error: '只能删除自己提交的概念' });
      if (!isAdmin && row.validated === 1) return callback?.({ error: '已验证的概念无法删除，请联系管理员' });

      db.prepare('DELETE FROM concepts WHERE id=?').run(conceptId);
      io.to(currentGameId).emit('concept:deleted', { conceptId });
      sysMessage(io, currentGameId, `🗑️ 「${row.name || row.raw_input}」已被删除`);
      callback?.({ ok: true });
    });

    // ── admin join (enter game with admin privileges) ─────────────────────────
    socket.on('admin:join', ({ gameId, adminKey }, callback) => {
      const ADMIN_KEY = process.env.ADMIN_KEY || 'admin';
      if (adminKey !== ADMIN_KEY) return callback?.({ error: '管理员密钥错误' });
      wantsAdmin = true;

      const id = (gameId || '').toUpperCase();
      const game = db.getGame.get(id);
      if (!game) return callback?.({ error: '房间不存在' });

      const room = getRoom(id);
      const settings = JSON.parse(game.settings || '{}');

      if (currentPlayer && !isObserverPlayer(currentPlayer) && room.players.has(currentPlayer.id)) {
        currentPlayer.isAdmin = true;
        room.players.set(currentPlayer.id, currentPlayer);
        broadcastPlayers(io, id);
        ensureChallengeState(io, id, game, settings, room);
        return callback?.(buildGameSnapshot(game, room, currentPlayer));
      }

      currentGameId = id;
      currentPlayer = {
        id: `admin_${socket.id}`,
        name: '管理员',
        color: '#f59e0b',
        isAdmin: true,
        isObserver: true,
      };
      socket.join(id);

      ensureChallengeState(io, id, game, settings, room);
      callback?.(buildGameSnapshot(game, room, currentPlayer));
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
      if (!currentGameId) return;
      try {
        if (isObserverPlayer(currentPlayer)) {
          socket.leave(currentGameId);
          return;
        }

        const room = getRoom(currentGameId);
        const disconnectedPlayerId = room.socketToPlayer.get(socket.id) || currentPlayer?.id;
        if (!disconnectedPlayerId) return;

        room.socketToPlayer.delete(socket.id);
        const activeSocketId = room.playerSockets.get(disconnectedPlayerId);
        if (activeSocketId && activeSocketId !== socket.id) {
          console.log(`[Socket] stale disconnect ignored socketId=${socket.id} playerId=${disconnectedPlayerId}`);
          return;
        }

        room.playerSockets.delete(disconnectedPlayerId);
        const leavingPlayer = room.players.get(disconnectedPlayerId) || currentPlayer;
        if (!leavingPlayer) return;

        room.players.delete(disconnectedPlayerId);
        room.lives.delete(disconnectedPlayerId);
        room.roundSubmitted.delete(disconnectedPlayerId);
        // Remove from joinOrder to avoid dead slots in turn rotation
        room.joinOrder = room.joinOrder.filter(id => id !== disconnectedPlayerId);
        // Recalculate turn index to not skip players
        if (room.joinOrder.length > 0) {
          room.turnIndex = room.turnIndex % room.joinOrder.length;
        }
        broadcastPlayers(io, currentGameId);
        sysMessage(io, currentGameId, `${leavingPlayer.name} 离开了游戏`);
        pluginEvents.emit('player:leave', { gameId: currentGameId, player: leavingPlayer });

        const game = db.getGame.get(currentGameId);
        if (game) {
          const settings = JSON.parse(game.settings || '{}');
          if (hasMode(game, settings, 'turn-order')) broadcastTurnState(io, currentGameId);
        }
      } catch (err) {
        console.error(`[Socket] disconnect cleanup ERROR socketId=${socket.id}:`, err);
      }
    });
  });
};

// ── Turn/relay state advancement (internal helper) ────────────────────────────

function _advanceTurnState(io, gameId, game, room, playerId) {
  const settings = JSON.parse(game.settings || '{}');

  if (hasMode(game, settings, 'turn-order')) {
    const order = getActivePlayerIds(room);
    if (order.length > 0) {
      room.turnIndex = (room.turnIndex + 1) % order.length;
      broadcastTurnState(io, gameId);
      const nextId = order[room.turnIndex];
      const nextName = room.players.get(nextId)?.name || '下一位玩家';
      sysMessage(io, gameId, `轮到 ${nextName} 提交概念了`);
    }
  } else if (hasMode(game, settings, 'relay')) {
    room.roundSubmitted.add(playerId);
    const activePlayers = getActivePlayerIds(room);
    const allSubmitted = activePlayers.every(pid => room.roundSubmitted.has(pid));
    if (allSubmitted) {
      room.roundSubmitted = new Set();
      const roundMsg = '🔄 所有玩家本轮已提交，新一轮开始！';
      sysMessage(io, gameId, roundMsg);
      io.to(gameId).emit('relay:round_reset', {});
    }
  }
}
