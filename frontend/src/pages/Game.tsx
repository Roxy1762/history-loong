import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import {
  joinGame, onSocket, onConnectionState, disconnectSocket,
  requestHints, finishGame, settleConcepts, validateSingleConcept, skipChallenge,
  editConcept, deleteConcept, adminJoinGame,
  type ConnectionState,
} from '../services/socket';
import Timeline from '../components/Timeline';
import Chat from '../components/Chat';
import PlayerList from '../components/PlayerList';
import ExportPanel from '../components/ExportPanel';
import ThemeSwitcher from '../components/ThemeSwitcher';
import type { ChallengeCard, Concept, Game, Message, Player, TurnState } from '../types';

function getActiveModeSet(game: Game | null | undefined): Set<string> {
  if (!game) return new Set();
  const extraModes = Array.isArray(game.settings?.extraModes) ? game.settings.extraModes : [];
  return new Set([game.mode, ...extraModes].filter((mode): mode is string => Boolean(mode)));
}

const PLAYER_ID_STORAGE_KEY = 'history_loong_player_id';
const PLAYER_NAME_STORAGE_KEY = 'history_loong_player_name';

function createLocalPlayerId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `p_${crypto.randomUUID().replace(/-/g, '')}`;
  }
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function getStablePlayerId(): string {
  const existing = localStorage.getItem(PLAYER_ID_STORAGE_KEY);
  if (existing) return existing;
  const next = createLocalPlayerId();
  localStorage.setItem(PLAYER_ID_STORAGE_KEY, next);
  return next;
}

function getStoredPlayerName(): string {
  return localStorage.getItem(PLAYER_NAME_STORAGE_KEY) || '';
}

function rememberPlayerName(name: string) {
  const normalized = name.trim();
  if (!normalized) return;
  localStorage.setItem(PLAYER_NAME_STORAGE_KEY, normalized.slice(0, 20));
}

function getAdminKeyFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const key = params.get('adminKey');
  return key && key.trim() ? key.trim() : null;
}

// ── Name dialog ───────────────────────────────────────────────────────────────

function NameDialog({ initialName, onConfirm }: { initialName?: string; onConfirm: (name: string) => void }) {
  const [name, setName] = useState(initialName || '');
  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" style={{ background: 'rgba(10,8,5,0.55)' }}>
      <div className="rounded-2xl shadow-2xl w-full max-w-xs p-7 animate-spring-in corner-ornament" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-heading font-black mx-auto mb-3 text-white shadow-md"
            style={{ background: 'var(--brand)' }}>龙</div>
          <h2 className="text-xl font-heading font-bold" style={{ color: 'var(--text-primary)' }}>加入游戏</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>请输入你的昵称</p>
        </div>
        <form onSubmit={e => { e.preventDefault(); onConfirm(name.trim() || '匿名玩家'); }} className="space-y-3">
          <input className="input text-center text-lg py-3 font-medium" placeholder="你的昵称..."
            value={name} onChange={e => setName(e.target.value)} autoFocus maxLength={20} />
          <button type="submit" className="btn-primary w-full py-3 font-heading">加入游戏</button>
        </form>
      </div>
    </div>
  );
}

// ── Settlement overlay ────────────────────────────────────────────────────────

function SettleOverlay() {
  const { settle } = useGameStore();
  if (!settle.running) return null;
  const pct = settle.total > 0 ? Math.round((settle.done / settle.total) * 100) : 0;
  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50" style={{ background: 'rgba(10,8,5,0.55)' }}>
      <div className="rounded-2xl shadow-2xl p-8 w-80 text-center animate-spring-in" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="text-4xl mb-4 font-heading" style={{ color: 'var(--brand)' }}>验</div>
        <h3 className="text-lg font-heading font-bold mb-1" style={{ color: 'var(--text-primary)' }}>AI 批量结算中</h3>
        <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>正在验证 {settle.total} 个历史概念...</p>
        <div className="w-full rounded-full h-2 mb-3 overflow-hidden" style={{ background: 'var(--bg-muted)' }}>
          <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: 'var(--brand)' }} />
        </div>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {settle.done} / {settle.total} — 通过 {settle.accepted}，淘汰 {settle.rejected}
        </div>
      </div>
    </div>
  );
}

// ── Settle result toast ───────────────────────────────────────────────────────

function SettleResult({
  result, onClose, onEndGame,
}: {
  result: { accepted: number; rejected: number; endGame?: boolean } | null;
  onClose: () => void;
  onEndGame: () => void;
}) {
  if (!result) return null;
  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" style={{ background: 'rgba(10,8,5,0.5)' }}>
      <div className="rounded-2xl shadow-2xl w-full max-w-xs p-6 text-center animate-spring-in corner-ornament" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="text-4xl mb-3 font-heading" style={{ color: 'var(--brand)' }}>成</div>
        <h3 className="text-lg font-heading font-bold mb-1" style={{ color: 'var(--text-primary)' }}>结算完成！</h3>
        {!result.endGame && (
          <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>游戏仍在进行，可继续提交</p>
        )}
        <div className="grid grid-cols-2 gap-3 mb-5 mt-3">
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
            <div className="text-2xl font-black text-emerald-600">{result.accepted}</div>
            <div className="text-xs text-emerald-600 mt-0.5">通过</div>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-xl p-3">
            <div className="text-2xl font-black text-red-500">{result.rejected}</div>
            <div className="text-xs text-red-500 mt-0.5">淘汰</div>
          </div>
        </div>
        <button className="btn-primary w-full py-2.5 mb-2 font-heading" onClick={onClose}>查看时间轴</button>
        {!result.endGame && (
          <button className="btn-danger w-full py-2 text-sm" onClick={onEndGame}>结束游戏</button>
        )}
      </div>
    </div>
  );
}

// ── Score Leaderboard sidebar ─────────────────────────────────────────────────

function ScoreBoard({ players, scores, me }: { players: { id: string; name: string; color: string }[]; scores: Record<string, number>; me: { id: string } | null }) {
  const sorted = [...players].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
  return (
    <div className="px-4 py-2.5" style={{ background: 'var(--brand-light)', borderBottom: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-heading font-bold" style={{ color: 'var(--gold-accent)' }}>积分榜</span>
      </div>
      <div className="flex gap-3 overflow-x-auto">
        {sorted.map((p, i) => (
          <div key={p.id} className={`flex items-center gap-1.5 shrink-0 px-2 py-1 rounded-full text-xs font-semibold`}
            style={{
              background: p.id === me?.id ? 'color-mix(in srgb, var(--gold-accent) 25%, transparent)' : 'var(--bg-card)',
              color: p.id === me?.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
            }}>
            <span>{i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : `#${i + 1}`}</span>
            <span>{p.name}</span>
            <span className="font-black" style={{ color: 'var(--gold-accent)' }}>{scores[p.id] || 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Challenge card banner ─────────────────────────────────────────────────────

function ChallengeBanner({ card, round, threshold = 2, onSkip, streak = 0 }: {
  card: { text: string; tag?: string } | null;
  round?: number;
  threshold?: number;
  onSkip?: () => void;
  streak?: number;
}) {
  const [skipping, setSkipping] = useState(false);

  async function handleSkip() {
    if (skipping || !onSkip) return;
    setSkipping(true);
    onSkip();
    setTimeout(() => setSkipping(false), 1000);
  }

  if (!card) return null;
  const remaining = Math.max(0, threshold - (round || 0));
  return (
    <div className="px-4 py-2 flex items-center gap-2 flex-wrap" style={{ background: 'var(--brand-light)', borderBottom: '1px solid var(--border-subtle)' }}>
      <span className="text-xs font-heading font-bold shrink-0" style={{ color: 'var(--brand)' }}>当前挑战：</span>
      <span className="text-xs font-medium flex-1" style={{ color: 'var(--text-primary)' }}>{card.text}</span>
      {streak > 1 && (
        <span className="text-xs font-bold shrink-0" style={{ color: 'var(--seal-red)' }}>x{streak}</span>
      )}
      <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>还需 {remaining} 个换牌</span>
      {onSkip && (
        <button
          onClick={handleSkip}
          disabled={skipping}
          className="text-xs px-2 py-0.5 rounded-full font-medium transition-colors shrink-0"
          style={{ background: 'var(--bg-muted)', color: 'var(--brand)', border: '1px solid var(--border)' }}
          title="手动换题">
          {skipping ? '...' : '换题'}
        </button>
      )}
    </div>
  );
}

// ── Challenge bonus toast ─────────────────────────────────────────────────────

function BonusToast({ bonus, playerName }: { bonus: number; playerName: string | null }) {
  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-slide-up">
      <div className="text-white px-5 py-3 rounded-2xl shadow-2xl text-center animate-pop-in" style={{ background: 'var(--brand)' }}>
        <div className="text-2xl font-heading font-black" style={{ color: 'var(--gold-accent)' }}>+{bonus}分</div>
        <div className="text-xs mt-0.5 opacity-90">
          {playerName ? `${playerName} 完成挑战！` : '挑战完成！'}
        </div>
      </div>
    </div>
  );
}

// ── Turn indicator banner ─────────────────────────────────────────────────────

function TurnBanner({ turnState, me }: { turnState: { currentPlayerId: string | null; currentPlayerName: string | null } | null; me: { id: string } | null }) {
  if (!turnState) return null;
  const isMyTurn = turnState.currentPlayerId === me?.id;
  return (
    <div className="px-4 py-2 text-center text-xs font-semibold flex-shrink-0"
      style={{
        background: isMyTurn ? 'color-mix(in srgb, var(--brand) 10%, var(--bg-card))' : 'var(--bg-muted)',
        borderBottom: '1px solid var(--border-subtle)',
        color: isMyTurn ? 'var(--brand)' : 'var(--text-muted)',
      }}>
      {isMyTurn
        ? '现在是你的回合，请提交一个历史概念！'
        : `等待 ${turnState.currentPlayerName || '其他玩家'} 提交...`}
    </div>
  );
}

// ── Game page ─────────────────────────────────────────────────────────────────

export default function Game() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate   = useNavigate();
  const adminKey = getAdminKeyFromUrl();

  const {
    game, me, players, timeline, pendingConcepts,
    messages, connected, validating,
    activeTab, setActiveTab,
    setConnected, setMe, setGame, setPlayers,
    setTimeline, addConcept,
    setPendingConcepts, addPendingConcept, removePendingConcept, updatePendingConcept,
    setMessages, addMessage,
    setValidating,
    settle, setSettleRunning, incrementSettleDone, resetSettle,
    turnState, setTurnState,
    scores, setScores,
    challengeCard, setChallengeCard,
    selectedPendingIds, clearSelectedPending,
    isAdmin, setIsAdmin,
    reset,
  } = useGameStore();

  const [showName,    setShowName]    = useState(!adminKey);
  const [showExport,  setShowExport]  = useState(false);
  const [hints,       setHints]       = useState<string[]>([]);
  const [newestId,    setNewestId]    = useState<string | undefined>();
  const [joinError,   setJoinError]   = useState('');
  const [connError,   setConnError]   = useState('');
  const [hintLoading, setHintLoading] = useState(false);
  const [settling,    setSettling]    = useState(false);
  const [settleResult, setSettleResult] = useState<{ accepted: number; rejected: number; endGame?: boolean } | null>(null);
  const [connState,   setConnState]   = useState<ConnectionState | null>(null);
  const [validatingConceptIds, setValidatingConceptIds] = useState<Set<string>>(new Set());
  const [challengeRound, setChallengeRound] = useState(0);
  const [bonusToast, setBonusToast] = useState<{ bonus: number; playerName: string | null } | null>(null);
  const [chatFill, setChatFill] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [editingConceptId, setEditingConceptId] = useState<string | null>(null);
  const [editingInput, setEditingInput] = useState('');

  const meRef     = useRef(me);
  const gameIdRef = useRef(gameId);
  const gameRef   = useRef(game);
  useEffect(() => { meRef.current = me; },     [me]);
  useEffect(() => { gameIdRef.current = gameId; }, [gameId]);
  useEffect(() => { gameRef.current = game; }, [game]);
  useEffect(() => { if (adminKey) setShowName(false); }, [adminKey]);

  const activeModes = getActiveModeSet(game);
  const isDeferred = game?.settings?.validationMode === 'deferred';
  const gameFinished = game?.status === 'finished';
  const isScoreMode = activeModes.has('score-race') || activeModes.has('challenge') || activeModes.has('survival');
  const isTurnMode  = activeModes.has('turn-order');
  const isRelayMode = activeModes.has('relay');
  const isChallengeMode = activeModes.has('challenge');
  const isSurvivalMode = activeModes.has('survival');
  const isOrderedMode = activeModes.has('ordered');
  const isChainMode = activeModes.has('chain');
  const isAdminObserver = Boolean(isAdmin && me?.isObserver);

  // Is it my turn right now?
  const isMyTurn = isTurnMode
    ? (turnState?.currentPlayerId === me?.id)
    : true; // other modes: always allowed
  const visibleTimeline = onlyMine && me ? timeline.filter(c => c.player_id === me.id) : timeline;
  const visiblePending = onlyMine && me ? pendingConcepts.filter(c => c.player_id === me.id) : pendingConcepts;

  const applyJoinState = useCallback((res: {
    game?: Game;
    player?: Player;
    timeline?: Concept[];
    pendingConcepts?: Concept[];
    messages?: Message[];
    messageTruncated?: boolean;
    scores?: Record<string, number>;
    turnState?: TurnState | null;
    challengeCard?: ChallengeCard | null;
  }, options?: { persistPlayerId?: boolean }) => {
    if (res.game) setGame(res.game);
    if (res.player) {
      setMe(res.player);
      setIsAdmin(Boolean(res.player.isAdmin));
      if (options?.persistPlayerId !== false && !res.player.isObserver && res.player.id) {
        localStorage.setItem(PLAYER_ID_STORAGE_KEY, res.player.id);
      }
    }
    if (res.timeline) setTimeline(res.timeline);
    if (res.pendingConcepts) setPendingConcepts(res.pendingConcepts);
    if (res.messages) {
      if (res.messageTruncated) {
        const notice: Message = {
          id: `sys_history_trimmed_${Date.now()}`,
          game_id: res.game?.id || gameId || '',
          player_id: null,
          player_name: null,
          type: 'system',
          content: '历史消息较多，当前仅加载最近 500 条。更早消息可通过接口分页获取。',
          meta: { truncated: true },
          created_at: new Date().toISOString(),
        };
        setMessages([...res.messages, notice]);
      } else {
        setMessages(res.messages);
      }
    }
    if (res.scores) setScores(res.scores);
    if (res.turnState !== undefined) setTurnState(res.turnState);
    if (res.challengeCard !== undefined) setChallengeCard(res.challengeCard);
  }, [gameId, setChallengeCard, setGame, setIsAdmin, setMe, setMessages, setPendingConcepts, setScores, setTimeline, setTurnState]);

  const joinAsRegularPlayer = useCallback(async (playerName: string, explicitPlayerId?: string) => {
    if (!gameId) return { error: '缺少房间号' };

    setJoinError('');
    setShowName(false);

    const normalizedName = (playerName || getStoredPlayerName() || '匿名玩家').trim().slice(0, 20) || '匿名玩家';
    const stablePlayerId = explicitPlayerId || getStablePlayerId();
    const res = await joinGame({ gameId, playerName: normalizedName, playerId: stablePlayerId });
    if (res.error) {
      setJoinError(res.error);
      setShowName(true);
      return res;
    }

    rememberPlayerName(normalizedName);
    applyJoinState(res);
    return res;
  }, [applyJoinState, gameId]);

  const joinAsAdminObserver = useCallback(async (targetGameId?: string) => {
    const nextGameId = targetGameId || gameId;
    if (!nextGameId || !adminKey) return { error: '缺少管理员密钥或房间号' };

    setJoinError('');
    setShowName(false);

    const res = await adminJoinGame(nextGameId, adminKey);
    if (res.error) {
      setJoinError(res.error);
      return res;
    }

    applyJoinState(res, { persistPlayerId: false });
    setIsAdmin(true);
    return res;
  }, [adminKey, applyJoinState, gameId, setIsAdmin]);

  // ── Socket listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    const offs = [
      onSocket('connect', async () => {
        setConnected(true);
        setConnError('');
        const gid = gameIdRef.current;
        const player = meRef.current;
        if (gid && player?.isObserver && adminKey) {
          await joinAsAdminObserver(gid);
          return;
        }
        if (gid && player) {
          await joinAsRegularPlayer(player.name, player.id || getStablePlayerId());
        }
      }),
      onSocket('connect_error', (err) => {
        if (!meRef.current) setConnError('无法连接到服务器，请检查网络或刷新页面重试');
        console.error('[Game] connect_error:', err.message);
      }),
      onSocket('disconnect', () => setConnected(false)),
      onSocket('message:new', msg => {
        addMessage(msg);
        // Show bonus toast when a challenge is completed
        const meta = msg.meta as Record<string, unknown>;
        if (meta?.type === 'challenge_complete' && typeof meta.bonus === 'number') {
          // Extract player name from message content (format: "🎯 {name} 完成了挑战...")
          const match = msg.content?.match(/^🎯 (.+?) 完成了挑战/);
          const pName = match ? match[1] : null;
          setBonusToast({ bonus: meta.bonus as number, playerName: pName });
          setTimeout(() => setBonusToast(null), 2500);
        }
      }),

      onSocket('concept:new', ({ concept }: { concept: Concept }) => {
        addConcept(concept);
        setNewestId(concept.id);
        setValidating(null);
        setActiveTab('timeline');
        setTimeout(() => setNewestId(undefined), 4000);
      }),
      onSocket('concept:pending', ({ concept }: { concept: Concept }) => addPendingConcept(concept)),
      onSocket('concept:validating', e => setValidating(e)),

      onSocket('game:settle:start', ({ total }) => setSettleRunning(total)),
      onSocket('concept:settled', e => {
        removePendingConcept(e.conceptId);
        if (useGameStore.getState().settle.running) incrementSettleDone(e.accepted);
        setValidatingConceptIds(prev => { const n = new Set(prev); n.delete(e.conceptId); return n; });
        if (e.accepted && e.concept) {
          addConcept(e.concept);
          setNewestId(e.concept.id);
          setActiveTab('timeline');
          setTimeout(() => setNewestId(undefined), 4000);
        }
      }),
      onSocket('game:settle:done', e => {
        resetSettle();
        setSettling(false);
        clearSelectedPending();
        setSettleResult({ accepted: e.accepted, rejected: e.rejected, endGame: e.endGame });
      }),

      onSocket('players:update', ({ players: p }) => setPlayers(p)),
      onSocket('game:finished', () => {
        const g = gameRef.current;
        if (g) setGame({ ...g, status: 'finished' });
      }),
      onSocket('game:deleted', () => {
        alert('管理员已删除该房间');
        window.location.href = '/';
      }),
      onSocket('game:restored', () => {
        const g = gameRef.current;
        if (g) setGame({ ...g, status: 'playing' });
      }),

      // New mode events
      onSocket('turn:update', e => setTurnState(e)),
      onSocket('scores:update', ({ scores: s }) => setScores(s)),
      onSocket('challenge:update', ({ card, round }) => {
        setChallengeCard(card);
        setChallengeRound(round);
      }),
      onSocket('relay:round_reset', () => {
        // Visual feedback handled by system message in chat
      }),

      // Concept edit/delete events
      onSocket('concept:edited', ({ concept }) => {
        updatePendingConcept(concept);
        useGameStore.getState().setTimeline(
          useGameStore.getState().timeline
            .map(c => c.id === concept.id ? concept : c)
        );
      }),
      onSocket('concept:deleted', ({ conceptId }) => {
        removePendingConcept(conceptId);
        // Also remove from validated timeline if it was there
        useGameStore.getState().setTimeline(
          useGameStore.getState().timeline.filter(c => c.id !== conceptId)
        );
      }),
    ];
    return () => offs.forEach(off => off());
  }, [addConcept, addMessage, adminKey, addPendingConcept, clearSelectedPending, incrementSettleDone, joinAsAdminObserver, joinAsRegularPlayer, removePendingConcept, resetSettle, setActiveTab, setChallengeCard, setConnected, setGame, setMessages, setPendingConcepts, setPlayers, setScores, setSettleRunning, setTimeline, setTurnState, setValidating, updatePendingConcept]);

  useEffect(() => {
    const off = onConnectionState(setConnState);
    return () => off();
  }, []);

  useEffect(() => { return () => { disconnectSocket(); reset(); }; }, []);

  useEffect(() => {
    if (!gameId || !adminKey || me) return;
    void joinAsAdminObserver(gameId);
  }, [adminKey, gameId, joinAsAdminObserver, me]);

  // ── Join ──────────────────────────────────────────────────────────────────
  const handleJoin = useCallback(async (playerName: string) => {
    await joinAsRegularPlayer(playerName);
  }, [joinAsRegularPlayer]);

  // ── Settle ────────────────────────────────────────────────────────────────
  async function handleSettle(endGame = false, onlySelected = false) {
    if (settling) return;
    const ids = onlySelected && selectedPendingIds.size > 0
      ? [...selectedPendingIds]
      : undefined;
    const count = ids ? ids.length : pendingConcepts.length;
    const confirmMsg = endGame
      ? `确认结算并结束游戏？将对 ${count} 个概念进行 AI 批量验证。`
      : `确认开始批量结算？将对 ${count} 个概念进行 AI 验证，结算后可继续游戏。`;
    if (!confirm(confirmMsg)) return;
    setSettling(true);
    const res = await settleConcepts(endGame, ids);
    if (res.error) { alert(res.error); setSettling(false); }
  }

  // ── Hint ──────────────────────────────────────────────────────────────────
  async function handleHint() {
    setHintLoading(true);
    const res = await requestHints();
    if (res.hints) setHints(res.hints);
    setHintLoading(false);
  }

  async function handleCopyRoomId() {
    if (!game?.id) return;
    try {
      await navigator.clipboard.writeText(game.id);
      alert(`房间号 ${game.id} 已复制`);
    } catch {
      alert('复制失败，请手动复制房间号');
    }
  }

  // ── Validate single ───────────────────────────────────────────────────────
  async function handleValidateSingle(conceptId: string) {
    setValidatingConceptIds(prev => new Set([...prev, conceptId]));
    const res = await validateSingleConcept(conceptId);
    if (res.error) {
      setValidatingConceptIds(prev => { const n = new Set(prev); n.delete(conceptId); return n; });
      alert(`验证失败：${res.error}`);
    }
  }

  // ── Skip challenge card ───────────────────────────────────────────────────
  async function handleSkipChallenge() {
    const res = await skipChallenge();
    if (res.error) alert(res.error);
  }

  // ── Concept edit ──────────────────────────────────────────────────────────
  function startEdit(conceptId: string, currentInput: string) {
    setEditingConceptId(conceptId);
    setEditingInput(currentInput);
  }

  async function confirmEdit() {
    if (!editingConceptId) return;
    const res = await editConcept(editingConceptId, editingInput);
    if (res.error) alert(`修改失败：${res.error}`);
    setEditingConceptId(null);
    setEditingInput('');
  }

  // ── Concept delete ────────────────────────────────────────────────────────
  async function handleDeleteConcept(conceptId: string, name: string) {
    if (!confirm(`确认删除「${name}」？此操作不可撤销。`)) return;
    const res = await deleteConcept(conceptId);
    if (res.error) alert(`删除失败：${res.error}`);
  }

  // ── Finish ────────────────────────────────────────────────────────────────
  async function handleFinish() {
    if (!confirm('确认结束游戏？结束后可导出成果。')) return;
    await finishGame();
  }

  if (joinError || connError) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-page)' }}>
        <div className="text-center space-y-4">
          <div className="text-5xl font-heading" style={{ color: 'var(--text-muted)' }}>{connError ? '断' : '误'}</div>
          <p className="text-xl" style={{ color: 'var(--seal-red)' }}>{joinError || connError}</p>
          {connError
            ? <button className="btn-primary" onClick={() => window.location.reload()}>刷新重试</button>
            : <button className="btn-secondary" onClick={() => navigate('/')}>返回首页</button>
          }
        </div>
      </div>
    );
  }

  return (
    <>
      {showName  && <NameDialog initialName={getStoredPlayerName()} onConfirm={handleJoin} />}
      {showExport && gameId && <ExportPanel gameId={gameId} onClose={() => setShowExport(false)} />}
      {bonusToast && <BonusToast bonus={bonusToast.bonus} playerName={bonusToast.playerName} />}
      <SettleOverlay />
      {settleResult && (
        <SettleResult
          result={settleResult}
          onClose={() => { setSettleResult(null); setActiveTab('timeline'); }}
          onEndGame={async () => { setSettleResult(null); await handleFinish(); }}
        />
      )}

      {/* h-screen + overflow-hidden keeps both chat and timeline independently scrollable */}
      <div className="h-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg-page)' }}>
        {/* ── Connection banners ── */}
        {connState?.status === 'reconnecting' && (
          <div className="text-white text-xs px-4 py-1.5 flex items-center gap-2 justify-center z-20" style={{ background: 'var(--gold-accent)' }}>
            <span className="w-2 h-2 rounded-full bg-white/70 animate-pulse flex-shrink-0" />
            正在重新连接服务器…（第 {connState.attempt} 次尝试）
          </div>
        )}
        {connState?.status === 'failed' && (
          <div className="text-white text-xs px-4 py-1.5 flex items-center gap-2 justify-center z-20" style={{ background: 'var(--seal-red)' }}>
            连接失败，请
            <button className="underline font-semibold" onClick={() => window.location.reload()}>刷新页面</button>
          </div>
        )}

        {/* ── Header ── */}
        <header className="shadow-sm z-10 flex-shrink-0" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3 px-4 py-3">
            <button onClick={() => navigate('/')}
              className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--bg-muted)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-heading font-bold truncate" style={{ color: 'var(--text-primary)' }}>{game ? game.topic : '历史接龙'}</h1>
                {game && (
                  <code className="text-xs px-2 py-0.5 rounded-lg font-mono" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
                    {game.id}
                  </code>
                )}
                {isDeferred && !gameFinished && (
                  <span className="seal-badge text-[10px]">结算</span>
                )}
                {isRelayMode && !gameFinished && (
                  <span className="seal-badge text-[10px]" style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }}>接力</span>
                )}
                {isTurnMode && !gameFinished && (
                  <span className="seal-badge text-[10px]" style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }}>轮流</span>
                )}
                {isOrderedMode && !gameFinished && (
                  <span className="seal-badge text-[10px]" style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }}>时序</span>
                )}
                {isChainMode && !gameFinished && (
                  <span className="seal-badge text-[10px]" style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }}>关联</span>
                )}
                {isScoreMode && !gameFinished && (
                  <span className="seal-badge text-[10px]" style={{ borderColor: 'var(--gold-accent)', color: 'var(--gold-accent)' }}>
                    {isChallengeMode ? '挑战' : '积分'}
                  </span>
                )}
                {isSurvivalMode && !gameFinished && (
                  <span className="seal-badge text-[10px]" style={{ borderColor: 'var(--seal-red)', color: 'var(--seal-red)' }}>生存</span>
                )}
                {gameFinished && (
                  <span className="badge-brand">已结束</span>
                )}
                {isAdmin && (
                  <span className="seal-badge text-[10px]" style={{ borderColor: 'var(--gold-accent)', color: 'var(--gold-accent)' }}>管理员</span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    connected ? 'bg-emerald-400' :
                    connState?.status === 'reconnecting' ? 'bg-amber-400 animate-pulse' :
                    connState?.status === 'failed' ? 'bg-red-500' : 'bg-slate-300 animate-pulse'
                  }`} />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {connected ? `${players.length} 人在线` :
                     connState?.status === 'reconnecting' ? `重连中` :
                     connState?.status === 'failed' ? '连接失败' : '连接中...'}
                  </span>
                </div>
                {timeline.length > 0 && (
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span style={{ color: 'var(--border)', marginRight: '4px' }}>·</span>{timeline.length} 已验证
                  </span>
                )}
                {isDeferred && pendingConcepts.length > 0 && (
                  <span className="text-xs font-medium" style={{ color: 'var(--gold-accent)' }}>
                    <span style={{ color: 'var(--border)', marginRight: '4px' }}>·</span>{pendingConcepts.length} 待结算
                  </span>
                )}
                {validating && (
                  <span className="text-xs animate-pulse font-medium" style={{ color: 'var(--brand)' }}>
                    <span style={{ color: 'var(--border)', marginRight: '4px' }}>·</span>AI 验证中...
                  </span>
                )}
                {/* My score badge */}
                {isScoreMode && me && !me.isObserver && (
                  <span className="text-xs font-bold" style={{ color: 'var(--gold-accent)' }}>
                    <span style={{ color: 'var(--border)', marginRight: '4px' }}>·</span>{scores[me.id] || 0} 分
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <ThemeSwitcher />
              <button onClick={handleHint} disabled={hintLoading}
                className="btn-secondary text-xs py-1.5 px-3 hidden sm:flex">
                {hintLoading ? '...' : '提示'}
              </button>
              <button onClick={handleCopyRoomId} className="btn-secondary text-xs py-1.5 px-3 hidden sm:flex">
                复制房号
              </button>

              {/* Multi-select batch validate button */}
              {isDeferred && !gameFinished && selectedPendingIds.size > 0 && (
                <button
                  onClick={() => handleSettle(false, true)}
                  disabled={settling}
                  className="text-xs py-1.5 px-2.5 rounded-lg font-medium transition-colors bg-violet-100 text-violet-700 hover:bg-violet-200"
                  title="验证选中的概念">
                  {settling ? '验证中...' : `✓ 验证选中 (${selectedPendingIds.size})`}
                </button>
              )}

              {/* Deferred: settle buttons */}
              {isDeferred && !gameFinished && pendingConcepts.length > 0 && selectedPendingIds.size === 0 && (
                <div className="flex gap-1">
                  <button onClick={() => handleSettle(false)} disabled={settling}
                    className="text-xs py-1.5 px-2.5 rounded-lg font-medium transition-colors"
                    style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}>
                    {settling ? '验证中...' : `⚖️ 验证 (${pendingConcepts.length})`}
                  </button>
                  <button onClick={() => handleSettle(true)} disabled={settling}
                    className="btn-danger text-xs py-1.5 px-2.5">
                    结束
                  </button>
                </div>
              )}

              {/* Realtime: finish button */}
              {!isDeferred && !gameFinished && (
                <button onClick={handleFinish}
                  className="btn-secondary text-xs py-1.5 px-3 text-red-400 hover:text-red-600 hidden sm:flex">
                  ⏹ 结束
                </button>
              )}

              <button onClick={() => setShowExport(true)} className="btn-primary text-xs py-1.5 px-3">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                导出
              </button>
            </div>
          </div>

          {/* Players strip */}
          {players.length > 0 && (
            <div className="px-4 pb-2.5 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <PlayerList players={players} me={me} />
            </div>
          )}
        </header>

        {isAdminObserver && (
          <div className="px-4 py-2 text-center flex-shrink-0" style={{ background: 'var(--brand-light)', borderBottom: '1px solid var(--border-subtle)' }}>
            <span className="text-xs" style={{ color: 'var(--brand)' }}>
              管理员观察模式已开启：不会占用玩家名额，也不会参与回合与聊天，可直接审核、修改、删除概念。
            </span>
          </div>
        )}

        {/* Hints banner */}
        {hints.length > 0 && (
          <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap flex-shrink-0" style={{ background: 'var(--brand-light)', borderBottom: '1px solid var(--border-subtle)' }}>
            <span className="text-xs font-heading font-semibold shrink-0" style={{ color: 'var(--brand)' }}>AI 建议：</span>
            {hints.map(h => (
              <button
                key={h}
                onClick={() => {
                  setChatFill(h);
                  setActiveTab('chat');
                  setTimeout(() => setChatFill(''), 100);
                }}
                className="text-xs px-2.5 py-1 rounded-full font-medium transition-colors cursor-pointer"
                style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                title="点击填入输入框"
              >{h}</button>
            ))}
            <button onClick={() => setHints([])} className="ml-auto text-xs p-1 transition-colors" style={{ color: 'var(--text-muted)' }}>✕</button>
          </div>
        )}

        {/* Score board (score-race / challenge mode) */}
        {isScoreMode && !gameFinished && players.length > 0 && (
          <ScoreBoard players={players} scores={scores} me={me} />
        )}

        {/* Challenge card banner */}
        {isChallengeMode && challengeCard && !gameFinished && (
          <ChallengeBanner
            card={challengeCard}
            round={challengeRound}
            threshold={(game?.settings as Record<string,unknown>)?.challengeThreshold as number ?? 2}
            onSkip={handleSkipChallenge}
          />
        )}

        {/* Turn indicator (turn-order mode) */}
        {isTurnMode && !gameFinished && (
          <TurnBanner turnState={turnState} me={me} />
        )}

        {/* Deferred mode banner */}
        {isDeferred && !gameFinished && pendingConcepts.length === 0 && timeline.length === 0 && (
          <div className="px-4 py-2.5 text-center flex-shrink-0" style={{ background: 'var(--brand-light)', borderBottom: '1px solid var(--border-subtle)' }}>
            <span className="text-sm" style={{ color: 'var(--brand)' }}>
              <strong className="font-heading">结算模式</strong> — 自由提交概念，按需批量验证
            </span>
          </div>
        )}

        {/* Relay mode banner */}
        {isRelayMode && !gameFinished && (
          <div className="px-4 py-2 text-center flex-shrink-0" style={{ background: 'var(--brand-light)', borderBottom: '1px solid var(--border-subtle)' }}>
            <span className="text-xs" style={{ color: 'var(--brand)' }}>
              <strong className="font-heading">接力模式</strong> — 每人每轮只能提交一次，所有人提交后进入下一轮
            </span>
          </div>
        )}

        {isSurvivalMode && !gameFinished && (
          <div className="px-4 py-2 text-center flex-shrink-0" style={{ background: 'color-mix(in srgb, var(--seal-red) 8%, var(--bg-card))', borderBottom: '1px solid var(--border-subtle)' }}>
            <span className="text-xs" style={{ color: 'var(--seal-red)' }}>
              <strong className="font-heading">生存模式</strong> — 被驳回会扣生命值，生命值归零后只能旁观
            </span>
          </div>
        )}

        {/* Mobile tab bar */}
        <div className="flex md:hidden flex-shrink-0" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
          {(['chat', 'timeline'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className="flex-1 py-3 text-sm font-heading font-semibold transition-colors flex items-center justify-center gap-1.5"
              style={{
                color: activeTab === t ? 'var(--brand)' : 'var(--text-muted)',
                borderBottom: activeTab === t ? '2px solid var(--brand)' : '2px solid transparent',
              }}>
              {t === 'chat' ? '聊天' : '时间轴'}
              {t === 'timeline' && (
                <span className="text-xs px-1.5 py-0.5 rounded-full leading-none" style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}>
                  {timeline.length}{pendingConcepts.length > 0 ? `+${pendingConcepts.length}` : ''}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Main split layout — both panes are independently scrollable */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Chat pane */}
          <div className={`flex flex-col overflow-hidden w-full md:w-[420px] lg:w-[460px] flex-shrink-0
            ${activeTab === 'chat' ? 'flex' : 'hidden md:flex'}`}
            style={{ borderRight: '1px solid var(--border)' }}>
            <Chat
              messages={messages}
              me={me}
              gameFinished={gameFinished}
              isMyTurn={isMyTurn}
              isTurnMode={isTurnMode}
              turnPlayerName={turnState?.currentPlayerName ?? null}
              fillInput={chatFill}
              readOnlyReason={isAdminObserver ? '管理员观察模式不可发送聊天或提交概念' : null}
            />
          </div>

          {/* Timeline pane */}
          <div className={`flex-1 flex flex-col overflow-hidden min-w-0
            ${activeTab === 'timeline' ? 'flex' : 'hidden md:flex'}`}>
            <div className="px-5 py-3 flex items-center gap-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <h2 className="font-heading font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                时间轴
                {timeline.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}>
                    {timeline.length}
                  </span>
                )}
                {isDeferred && pendingConcepts.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'color-mix(in srgb, var(--gold-accent) 15%, var(--bg-card))', color: 'var(--gold-accent)' }}>
                    +{pendingConcepts.length}
                  </span>
                )}
              </h2>
              <div className="flex-1" />
              {me && (
                <button
                  onClick={() => setOnlyMine(v => !v)}
                  className="text-xs px-2 py-1 rounded-lg transition-colors"
                  style={{
                    background: onlyMine ? 'var(--brand-light)' : 'var(--bg-card)',
                    color: onlyMine ? 'var(--brand)' : 'var(--text-muted)',
                    border: `1px solid ${onlyMine ? 'var(--brand)' : 'var(--border)'}`,
                  }}>
                  {onlyMine ? '只看我的：开' : '只看我的'}
                </button>
              )}
              {/* Selected batch validate (timeline header, mobile) */}
              {isDeferred && !gameFinished && selectedPendingIds.size > 0 && (
                <button
                  onClick={() => handleSettle(false, true)}
                  disabled={settling}
                  className="text-xs px-2 py-1 bg-violet-100 text-violet-700 rounded-lg hover:bg-violet-200 transition-colors font-medium">
                  ✓ 验证选中({selectedPendingIds.size})
                </button>
              )}
              <button onClick={handleHint} disabled={hintLoading}
                className="btn-ghost text-xs py-1 px-2 sm:hidden">
                {hintLoading ? '...' : '💡'}
              </button>
              {isDeferred && !gameFinished && pendingConcepts.length > 0 && selectedPendingIds.size === 0 && (
                <button onClick={() => handleSettle(false)} disabled={settling}
                  className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors sm:hidden">
                  ⚖️ 结算
                </button>
              )}
              {!isDeferred && !gameFinished && (
                <button onClick={handleFinish} className="btn-ghost text-xs py-1 px-2 text-red-400 sm:hidden">⏹</button>
              )}
            </div>
            <div className="flex-1 overflow-hidden min-h-0">
              <Timeline
                timeline={visibleTimeline}
                pendingConcepts={visiblePending}
                newestId={newestId}
                onValidateConcept={!gameFinished ? handleValidateSingle : undefined}
                validatingConceptIds={validatingConceptIds}
                isDeferred={isDeferred}
                selectedPendingIds={selectedPendingIds}
                me={me}
                isAdmin={isAdmin}
                editingConceptId={editingConceptId}
                editingInput={editingInput}
                onStartEdit={startEdit}
                onEditInputChange={setEditingInput}
                onConfirmEdit={confirmEdit}
                onCancelEdit={() => { setEditingConceptId(null); setEditingInput(''); }}
                onDeleteConcept={handleDeleteConcept}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
