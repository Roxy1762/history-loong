import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { joinGame, onSocket, disconnectSocket, requestHints, finishGame } from '../services/socket';
import Timeline from '../components/Timeline';
import Chat from '../components/Chat';
import PlayerList from '../components/PlayerList';
import ExportPanel from '../components/ExportPanel';
import type { Concept } from '../types';

// ── Name dialog ───────────────────────────────────────────────────────────────

function NameDialog({ onConfirm }: { onConfirm: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs p-7 animate-slide-up">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center text-4xl mx-auto mb-3">
            🐉
          </div>
          <h2 className="text-xl font-bold text-slate-800">加入游戏</h2>
          <p className="text-sm text-slate-500 mt-1">请输入你的昵称</p>
        </div>
        <form onSubmit={e => { e.preventDefault(); onConfirm(name.trim() || '匿名玩家'); }} className="space-y-3">
          <input
            className="input text-center text-lg py-3 font-medium"
            placeholder="你的昵称..."
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus maxLength={20}
          />
          <button type="submit" className="btn-primary w-full py-3">加入游戏</button>
        </form>
      </div>
    </div>
  );
}

// ── Game page ─────────────────────────────────────────────────────────────────

export default function Game() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();

  const {
    game, me, players, timeline, messages, connected, validating,
    activeTab, setActiveTab,
    setConnected, setMe, setGame, setPlayers,
    setTimeline, addConcept,
    setMessages, addMessage,
    setValidating, reset,
  } = useGameStore();

  const [showName, setShowName] = useState(true);
  const [showExport, setShowExport] = useState(false);
  const [hints, setHints] = useState<string[]>([]);
  const [newestId, setNewestId] = useState<string | undefined>();
  const [joinError, setJoinError] = useState('');
  const [hintLoading, setHintLoading] = useState(false);

  // ── Socket listeners ────────────────────────────────────────────────────────
  useEffect(() => {
    const offs = [
      onSocket('connect',    () => setConnected(true)),
      onSocket('disconnect', () => setConnected(false)),
      onSocket('message:new', msg => addMessage(msg)),
      onSocket('concept:new', ({ concept }: { concept: Concept }) => {
        addConcept(concept);
        setNewestId(concept.id);
        setValidating(null);
        setActiveTab('timeline');
        setTimeout(() => setNewestId(undefined), 4000);
      }),
      onSocket('concept:validating', e => setValidating(e)),
      onSocket('players:update', ({ players: p }) => setPlayers(p)),
      onSocket('game:finished', () => { if (game) setGame({ ...game, status: 'finished' }); }),
    ];
    return () => offs.forEach(off => off());
  }, [game]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { return () => { disconnectSocket(); reset(); }; }, []);

  const handleJoin = useCallback(async (playerName: string) => {
    if (!gameId) return;
    setShowName(false);
    const res = await joinGame({ gameId, playerName });
    if (res.error) { setJoinError(res.error); return; }
    if (res.game)     setGame(res.game);
    if (res.player)   setMe(res.player);
    if (res.timeline) setTimeline(res.timeline);
    if (res.messages) setMessages(res.messages);
  }, [gameId]);

  async function handleHint() {
    setHintLoading(true);
    const res = await requestHints();
    if (res.hints) setHints(res.hints);
    setHintLoading(false);
  }

  async function handleFinish() {
    if (!confirm('确认结束游戏？结束后可导出成果。')) return;
    await finishGame();
  }

  const gameFinished = game?.status === 'finished';

  if (joinError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-4">
          <div className="text-5xl">⚠️</div>
          <p className="text-xl text-red-500">{joinError}</p>
          <button className="btn-secondary" onClick={() => navigate('/')}>返回首页</button>
        </div>
      </div>
    );
  }

  return (
    <>
      {showName && <NameDialog onConfirm={handleJoin} />}
      {showExport && gameId && <ExportPanel gameId={gameId} onClose={() => setShowExport(false)} />}

      <div className="min-h-screen flex flex-col bg-slate-50">
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
                <h1 className="font-bold text-slate-800 truncate">
                  {game ? game.topic : '历史接龙'}
                </h1>
                {game && (
                  <code className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg font-mono border border-slate-200">
                    {game.id}
                  </code>
                )}
                {gameFinished && (
                  <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">已结束</span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                  <span className="text-xs text-slate-400">
                    {connected ? `${players.length} 人在线` : '连接中...'}
                  </span>
                </div>
                {timeline.length > 0 && (
                  <>
                    <span className="text-slate-200">·</span>
                    <span className="text-xs text-slate-400">{timeline.length} 个概念</span>
                  </>
                )}
                {validating && (
                  <>
                    <span className="text-slate-200">·</span>
                    <span className="text-xs text-indigo-500 animate-pulse font-medium">AI 验证中...</span>
                  </>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button onClick={handleHint} disabled={hintLoading}
                className="btn-secondary text-xs py-1.5 px-3 hidden sm:flex">
                {hintLoading ? '...' : '💡 提示'}
              </button>
              {!gameFinished && (
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
              <span key={h} className="text-xs px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full border border-amber-200 font-medium">
                {h}
              </span>
            ))}
            <button onClick={() => setHints([])} className="ml-auto text-amber-400 hover:text-amber-600 text-xs p-1">✕</button>
          </div>
        )}

        {/* Mobile tab bar */}
        <div className="flex border-b border-slate-100 bg-white md:hidden">
          {(['chat', 'timeline'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`flex-1 py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5
                ${activeTab === t ? 'text-indigo-600 border-b-2 border-indigo-500' : 'text-slate-400'}`}>
              {t === 'chat' ? '💬 聊天' : '📅 时间轴'}
              {t === 'timeline' && timeline.length > 0 && (
                <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full leading-none">
                  {timeline.length}
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
              </h2>
              <div className="flex-1" />
              {/* Mobile hint/finish buttons */}
              <button onClick={handleHint} disabled={hintLoading}
                className="btn-ghost text-xs py-1 px-2 sm:hidden">
                {hintLoading ? '...' : '💡'}
              </button>
              {!gameFinished && (
                <button onClick={handleFinish} className="btn-ghost text-xs py-1 px-2 text-red-400 sm:hidden">⏹</button>
              )}
            </div>
            <div className="flex-1 overflow-hidden">
              <Timeline timeline={timeline} newestId={newestId} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
