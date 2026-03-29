import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import {
  joinGame, onSocket, onConnectionState, disconnectSocket,
  requestHints, finishGame, settleConcepts, validateSingleConcept,
  type ConnectionState,
} from '../services/socket';
import Timeline from '../components/Timeline';
import Chat from '../components/Chat';
import PlayerList from '../components/PlayerList';
import ExportPanel from '../components/ExportPanel';
import ThemeSwitcher from '../components/ThemeSwitcher';
import type { Concept } from '../types';

// ── Name dialog ───────────────────────────────────────────────────────────────

function NameDialog({ onConfirm }: { onConfirm: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs p-7 animate-slide-up">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center text-4xl mx-auto mb-3">🐉</div>
          <h2 className="text-xl font-bold text-slate-800">加入游戏</h2>
          <p className="text-sm text-slate-500 mt-1">请输入你的昵称</p>
        </div>
        <form onSubmit={e => { e.preventDefault(); onConfirm(name.trim() || '匿名玩家'); }} className="space-y-3">
          <input className="input text-center text-lg py-3 font-medium" placeholder="你的昵称..."
            value={name} onChange={e => setName(e.target.value)} autoFocus maxLength={20} />
          <button type="submit" className="btn-primary w-full py-3">加入游戏</button>
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-80 text-center animate-slide-up">
        <div className="text-5xl mb-4">⚖️</div>
        <h3 className="text-xl font-bold text-slate-800 mb-1">AI 批量结算中</h3>
        <p className="text-sm text-slate-500 mb-6">
          正在验证 {settle.total} 个历史概念...
        </p>
        {/* Progress bar */}
        <div className="w-full bg-slate-100 rounded-full h-3 mb-3">
          <div
            className="bg-indigo-500 h-3 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-xs text-slate-400">
          {settle.done} / {settle.total} — 通过 {settle.accepted}，淘汰 {settle.rejected}
        </div>
      </div>
    </div>
  );
}

// ── Settle result toast ───────────────────────────────────────────────────────

function SettleResult({
  result,
  onClose,
  onEndGame,
}: {
  result: { accepted: number; rejected: number; endGame?: boolean } | null;
  onClose: () => void;
  onEndGame: () => void;
}) {
  if (!result) return null;
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className="rounded-3xl shadow-2xl w-full max-w-xs p-7 text-center animate-slide-up"
        style={{ background: 'var(--bg-card)' }}
      >
        <div className="text-5xl mb-4">🎉</div>
        <h3 className="text-xl font-heading font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
          结算完成！
        </h3>
        {!result.endGame && (
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
            游戏仍在进行，可继续提交
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 mb-6 mt-4">
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
            <div className="text-3xl font-black text-emerald-600">{result.accepted}</div>
            <div className="text-xs text-emerald-600 mt-1">✅ 通过</div>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
            <div className="text-3xl font-black text-red-500">{result.rejected}</div>
            <div className="text-xs text-red-500 mt-1">❌ 淘汰</div>
          </div>
        </div>
        <button className="btn-primary w-full py-3 mb-2" onClick={onClose}>
          查看时间轴
        </button>
        {!result.endGame && (
          <button
            className="btn-danger w-full py-2 text-sm"
            onClick={onEndGame}
          >
            ⏹ 结束游戏
          </button>
        )}
      </div>
    </div>
  );
}

// ── Game page ─────────────────────────────────────────────────────────────────

export default function Game() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate   = useNavigate();

  const {
    game, me, players, timeline, pendingConcepts,
    messages, connected, validating,
    activeTab, setActiveTab,
    setConnected, setMe, setGame, setPlayers,
    setTimeline, addConcept,
    setPendingConcepts, addPendingConcept, removePendingConcept,
    setMessages, addMessage,
    setValidating,
    settle, setSettleRunning, incrementSettleDone, resetSettle,
    reset,
  } = useGameStore();

  const [showName,    setShowName]    = useState(true);
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

  // Track latest values in refs so socket handlers always have fresh values
  // This avoids the stale closure bug where useEffect depended on [game]
  const meRef     = useRef(me);
  const gameIdRef = useRef(gameId);
  const gameRef   = useRef(game);
  useEffect(() => { meRef.current = me; },     [me]);
  useEffect(() => { gameIdRef.current = gameId; }, [gameId]);
  useEffect(() => { gameRef.current = game; }, [game]);

  const isDeferred = game?.settings?.validationMode === 'deferred';
  const gameFinished = game?.status === 'finished';

  // ── Socket listeners (registered ONCE, using refs for fresh values) ─────────
  useEffect(() => {
    console.log('[Game] Setting up socket listeners');

    const offs = [
      onSocket('connect', async () => {
        console.log('[Game] Socket connected');
        setConnected(true);
        setConnError('');
        // If the socket reconnected while we were already in a room, re-join so
        // the backend can restore currentGameId / currentPlayer for this socket.
        const gid = gameIdRef.current;
        const player = meRef.current;
        if (gid && player) {
          console.log(`[Game] Reconnect re-join gameId=${gid} player=${player.name}`);
          const res = await joinGame({ gameId: gid, playerName: player.name });
          if (res.error) {
            console.warn(`[Game] Reconnect re-join failed: ${res.error}`);
            return; // reconnect join failure is non-fatal
          }
          console.log('[Game] Reconnect re-join OK');
          if (res.game)            setGame(res.game);
          if (res.player)          setMe(res.player);
          if (res.timeline)        setTimeline(res.timeline);
          if (res.pendingConcepts) setPendingConcepts(res.pendingConcepts);
          if (res.messages)        setMessages(res.messages);
        }
      }),
      onSocket('connect_error', (err) => {
        console.error('[Game] Socket connect_error:', err.message);
        // Only surface the error before the user has joined; after joining,
        // the disconnect indicator in the header is sufficient feedback.
        if (!meRef.current) setConnError('无法连接到服务器，请检查网络或刷新页面重试');
      }),
      onSocket('disconnect', (reason) => {
        console.warn(`[Game] Socket disconnected: ${reason}`);
        setConnected(false);
      }),
      onSocket('message:new', msg => {
        console.log(`[Game] message:new type=${msg.type} content="${msg.content?.slice(0, 50)}"`);
        addMessage(msg);
      }),

      // Real-time mode: concept validated immediately
      onSocket('concept:new', ({ concept }: { concept: Concept }) => {
        console.log(`[Game] concept:new name="${concept.name}" year=${concept.year}`);
        addConcept(concept);
        setNewestId(concept.id);
        setValidating(null);
        setActiveTab('timeline');
        setTimeout(() => setNewestId(undefined), 4000);
      }),

      // Deferred mode: concept saved as pending
      onSocket('concept:pending', ({ concept }: { concept: Concept }) => {
        console.log(`[Game] concept:pending name="${concept.name}"`);
        addPendingConcept(concept);
      }),

      onSocket('concept:validating', e => {
        console.log(`[Game] concept:validating player=${e.playerName} input="${e.rawInput}"`);
        setValidating(e);
      }),

      // Settlement events
      onSocket('game:settle:start', ({ total }) => {
        console.log(`[Game] game:settle:start total=${total}`);
        setSettleRunning(total);
      }),
      onSocket('concept:settled', e => {
        console.log(`[Game] concept:settled conceptId=${e.conceptId} accepted=${e.accepted}`);
        removePendingConcept(e.conceptId);
        // Only count toward batch-settle progress when a batch settle is running
        if (useGameStore.getState().settle.running) incrementSettleDone(e.accepted);
        // Clear single-validation loading state
        setValidatingConceptIds(prev => {
          const next = new Set(prev);
          next.delete(e.conceptId);
          return next;
        });
        if (e.accepted && e.concept) {
          addConcept(e.concept);
          setNewestId(e.concept.id);
          setActiveTab('timeline');
          setTimeout(() => setNewestId(undefined), 4000);
        }
      }),
      onSocket('game:settle:done', e => {
        console.log(`[Game] game:settle:done accepted=${e.accepted} rejected=${e.rejected} endGame=${e.endGame}`);
        resetSettle();
        setSettling(false);
        setSettleResult({ accepted: e.accepted, rejected: e.rejected, endGame: e.endGame });
      }),

      onSocket('players:update', ({ players: p }) => {
        console.log(`[Game] players:update count=${p.length}`);
        setPlayers(p);
      }),
      onSocket('game:finished', () => {
        console.log('[Game] game:finished');
        // Use ref to get latest game value — avoids stale closure
        const currentGame = gameRef.current;
        if (currentGame) setGame({ ...currentGame, status: 'finished' });
      }),
      onSocket('game:deleted', () => {
        console.log('[Game] game:deleted — redirecting to home');
        alert('管理员已删除该房间');
        window.location.href = '/';
      }),
      onSocket('game:restored', () => {
        console.log('[Game] game:restored');
        const currentGame = gameRef.current;
        if (currentGame) setGame({ ...currentGame, status: 'playing' });
      }),
    ];
    return () => {
      console.log('[Game] Tearing down socket listeners');
      offs.forEach(off => off());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Empty deps: listeners registered once, use refs for fresh values

  useEffect(() => {
    const off = onConnectionState(setConnState);
    return () => off();
  }, []);

  useEffect(() => { return () => { disconnectSocket(); reset(); }; }, []);

  // ── Join ────────────────────────────────────────────────────────────────────
  const handleJoin = useCallback(async (playerName: string) => {
    if (!gameId) return;
    setShowName(false);
    console.log(`[Game] handleJoin gameId=${gameId} playerName=${playerName}`);
    const res = await joinGame({ gameId, playerName });
    if (res.error) {
      console.error(`[Game] handleJoin FAILED: ${res.error}`);
      setJoinError(res.error);
      return;
    }
    console.log('[Game] handleJoin OK');
    if (res.game)             setGame(res.game);
    if (res.player)           setMe(res.player);
    if (res.timeline)         setTimeline(res.timeline);
    if (res.pendingConcepts)  setPendingConcepts(res.pendingConcepts);
    if (res.messages)         setMessages(res.messages);
  }, [gameId]);

  // ── Settle ──────────────────────────────────────────────────────────────────
  async function handleSettle(endGame = false) {
    if (settling) return;
    const confirmMsg = endGame
      ? `确认结算并结束游戏？将对 ${pendingConcepts.length} 个概念进行 AI 批量验证。`
      : `确认开始批量结算？将对 ${pendingConcepts.length} 个概念进行 AI 验证，结算后可继续游戏。`;
    if (!confirm(confirmMsg)) return;
    setSettling(true);
    console.log(`[Game] handleSettle start endGame=${endGame}`);
    const res = await settleConcepts(endGame);
    if (res.error) {
      console.error(`[Game] handleSettle FAILED: ${res.error}`);
      alert(res.error);
      setSettling(false);
    }
    // Progress tracked via socket events
  }

  // ── Hint ────────────────────────────────────────────────────────────────────
  async function handleHint() {
    setHintLoading(true);
    console.log('[Game] requestHints');
    const res = await requestHints();
    if (res.hints) setHints(res.hints);
    setHintLoading(false);
  }

  // ── Validate single concept (free validation) ──────────────────────────────
  async function handleValidateSingle(conceptId: string) {
    setValidatingConceptIds(prev => new Set([...prev, conceptId]));
    console.log(`[Game] handleValidateSingle conceptId=${conceptId}`);
    const res = await validateSingleConcept(conceptId);
    if (res.error) {
      console.error(`[Game] handleValidateSingle FAILED: ${res.error}`);
      // Remove from validating set on error (success is cleared by concept:settled event)
      setValidatingConceptIds(prev => {
        const next = new Set(prev);
        next.delete(conceptId);
        return next;
      });
      alert(`验证失败：${res.error}`);
    }
  }

  // ── Finish (realtime mode) ──────────────────────────────────────────────────
  async function handleFinish() {
    if (!confirm('确认结束游戏？结束后可导出成果。')) return;
    console.log('[Game] handleFinish');
    await finishGame();
  }

  if (joinError || connError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-4">
          <div className="text-5xl">{connError ? '📡' : '⚠️'}</div>
          <p className="text-xl text-red-500">{joinError || connError}</p>
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
      {showName  && <NameDialog onConfirm={handleJoin} />}
      {showExport && gameId && <ExportPanel gameId={gameId} onClose={() => setShowExport(false)} />}
      <SettleOverlay />
      {settleResult && (
        <SettleResult
          result={settleResult}
          onClose={() => { setSettleResult(null); setActiveTab('timeline'); }}
          onEndGame={async () => { setSettleResult(null); await handleFinish(); }}
        />
      )}

      <div className="min-h-screen flex flex-col bg-slate-50">
        {/* ── Connection status banner ── */}
        {connState && connState.status === 'reconnecting' && (
          <div className="bg-amber-500 text-white text-xs px-4 py-1.5 flex items-center gap-2 justify-center z-20">
            <span className="w-2 h-2 rounded-full bg-white/70 animate-pulse flex-shrink-0" />
            正在重新连接服务器…（第 {connState.attempt} 次尝试）请稍候
          </div>
        )}
        {connState && connState.status === 'failed' && (
          <div className="bg-red-600 text-white text-xs px-4 py-1.5 flex items-center gap-2 justify-center z-20">
            <span className="text-white">⚠️</span>
            连接失败，请
            <button className="underline font-semibold" onClick={() => window.location.reload()}>刷新页面</button>
            重试
          </div>
        )}

        {/* ── Header ── */}
        <header className="bg-white border-b border-slate-100 shadow-sm z-10">
          <div className="flex items-center gap-3 px-4 py-3">
            <button onClick={() => navigate('/')}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-bold text-slate-800 truncate">{game ? game.topic : '历史接龙'}</h1>
                {game && (
                  <code className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg font-mono border border-slate-200">
                    {game.id}
                  </code>
                )}
                {isDeferred && !gameFinished && (
                  <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full border border-amber-200 font-medium">
                    结算模式
                  </span>
                )}
                {gameFinished && (
                  <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">已结束</span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    connected ? 'bg-emerald-400' :
                    connState?.status === 'reconnecting' ? 'bg-amber-400 animate-pulse' :
                    connState?.status === 'failed' ? 'bg-red-500' : 'bg-slate-300 animate-pulse'
                  }`} />
                  <span className="text-xs text-slate-400">
                    {connected ? `${players.length} 人在线` :
                     connState?.status === 'reconnecting' ? `重连中 #${connState.attempt}` :
                     connState?.status === 'failed' ? '连接失败' : '连接中...'}
                  </span>
                </div>
                {timeline.length > 0 && (
                  <span className="text-xs text-slate-400">
                    <span className="text-slate-200 mr-1">·</span>{timeline.length} 已验证
                  </span>
                )}
                {isDeferred && pendingConcepts.length > 0 && (
                  <span className="text-xs text-amber-600 font-medium">
                    <span className="text-slate-200 mr-1">·</span>⏳ {pendingConcepts.length} 待结算
                  </span>
                )}
                {validating && (
                  <span className="text-xs text-indigo-500 animate-pulse font-medium">
                    <span className="text-slate-200 mr-1">·</span>AI 验证中...
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <ThemeSwitcher />
              <button onClick={handleHint} disabled={hintLoading}
                className="btn-secondary text-xs py-1.5 px-3 hidden sm:flex">
                {hintLoading ? '...' : '💡'}
              </button>

              {/* Deferred: settle buttons */}
              {isDeferred && !gameFinished && pendingConcepts.length > 0 && (
                <div className="flex gap-1">
                  <button onClick={() => handleSettle(false)} disabled={settling}
                    className="text-xs py-1.5 px-2.5 rounded-lg font-medium transition-colors"
                    style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}
                    title="批量验证，不结束游戏">
                    {settling ? '验证中...' : `⚖️ 验证 (${pendingConcepts.length})`}
                  </button>
                  <button onClick={() => handleSettle(true)} disabled={settling}
                    className="btn-danger text-xs py-1.5 px-2.5"
                    title="验证并结束游戏">
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
            <div className="px-4 pb-2.5 border-t border-slate-50 pt-2">
              <PlayerList players={players} me={me} />
            </div>
          )}
        </header>

        {/* Hints banner */}
        {hints.length > 0 && (
          <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border-b border-amber-100 px-4 py-2.5 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-amber-700 font-semibold shrink-0">💡 AI 建议：</span>
            {hints.map(h => (
              <span key={h} className="text-xs px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full border border-amber-200 font-medium">{h}</span>
            ))}
            <button onClick={() => setHints([])} className="ml-auto text-amber-400 hover:text-amber-600 text-xs p-1">✕</button>
          </div>
        )}

        {/* Deferred mode banner (when no pending concepts yet) */}
        {isDeferred && !gameFinished && pendingConcepts.length === 0 && timeline.length === 0 && (
          <div className="bg-indigo-50 border-b border-indigo-100 px-4 py-2.5 text-center">
            <span className="text-sm text-indigo-600">
              🎯 <strong>结算模式</strong> — 自由提交概念，游戏结束时由 AI 统一验证，不影响游戏节奏
            </span>
          </div>
        )}

        {/* Mobile tab bar */}
        <div className="flex border-b border-slate-100 bg-white md:hidden">
          {(['chat', 'timeline'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`flex-1 py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5
                ${activeTab === t ? 'text-indigo-600 border-b-2 border-indigo-500' : 'text-slate-400'}`}>
              {t === 'chat' ? '💬 聊天' : '📅 时间轴'}
              {t === 'timeline' && (
                <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full leading-none">
                  {timeline.length}{pendingConcepts.length > 0 ? `+${pendingConcepts.length}⏳` : ''}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Main split layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Chat pane */}
          <div className={`flex flex-col overflow-hidden border-r border-slate-100 w-full md:w-[420px] lg:w-[460px] flex-shrink-0
            ${activeTab === 'chat' ? 'flex' : 'hidden md:flex'}`}>
            <Chat messages={messages} me={me} gameFinished={gameFinished} />
          </div>

          {/* Timeline pane */}
          <div className={`flex-1 flex flex-col overflow-hidden
            ${activeTab === 'timeline' ? 'flex' : 'hidden md:flex'}`}>
            <div className="px-5 py-3 border-b border-slate-100 bg-white flex items-center gap-3">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                时间轴
                {timeline.length > 0 && (
                  <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-semibold">
                    {timeline.length}
                  </span>
                )}
                {isDeferred && pendingConcepts.length > 0 && (
                  <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-semibold">
                    +{pendingConcepts.length} ⏳
                  </span>
                )}
              </h2>
              <div className="flex-1" />
              <button onClick={handleHint} disabled={hintLoading}
                className="btn-ghost text-xs py-1 px-2 sm:hidden">
                {hintLoading ? '...' : '💡'}
              </button>
              {isDeferred && !gameFinished && pendingConcepts.length > 0 && (
                <button onClick={handleSettle} disabled={settling}
                  className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors sm:hidden">
                  ⚖️ 结算
                </button>
              )}
              {!isDeferred && !gameFinished && (
                <button onClick={handleFinish} className="btn-ghost text-xs py-1 px-2 text-red-400 sm:hidden">⏹</button>
              )}
            </div>
            <div className="flex-1 overflow-hidden">
              <Timeline
                timeline={timeline}
                pendingConcepts={pendingConcepts}
                newestId={newestId}
                onValidateConcept={!gameFinished ? handleValidateSingle : undefined}
                validatingConceptIds={validatingConceptIds}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
