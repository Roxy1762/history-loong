import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { joinGame, onSocket, disconnectSocket, requestHints, finishGame } from '../services/socket';
import Timeline from '../components/Timeline';
import Chat from '../components/Chat';
import PlayerList from '../components/PlayerList';
import ExportPanel from '../components/ExportPanel';
import type { Concept } from '../types';

// ── Name input dialog ─────────────────────────────────────────────────────────

function NameDialog({ onConfirm }: { onConfirm: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-6 animate-slide-up">
        <div className="text-center mb-5">
          <div className="text-4xl mb-2">🐉</div>
          <h2 className="text-xl font-bold text-slate-800">加入游戏</h2>
          <p className="text-sm text-slate-500 mt-1">请输入你的昵称</p>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); onConfirm(name.trim() || '匿名玩家'); }}
          className="space-y-3"
        >
          <input
            className="input"
            placeholder="你的昵称..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={20}
          />
          <button type="submit" className="btn-primary w-full">加入</button>
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
  const [newestConceptId, setNewestConceptId] = useState<string | undefined>();
  const [joinError, setJoinError] = useState('');

  // ── Socket listeners ────────────────────────────────────────────────────────
  useEffect(() => {
    const offs = [
      onSocket('connect', () => setConnected(true)),
      onSocket('disconnect', () => setConnected(false)),
      onSocket('message:new', (msg) => addMessage(msg)),
      onSocket('concept:new', ({ concept }) => {
        addConcept(concept);
        setNewestConceptId(concept.id);
        setValidating(null);
        // Switch to timeline tab briefly
        setActiveTab('timeline');
        setTimeout(() => setNewestConceptId(undefined), 4000);
      }),
      onSocket('concept:validating', (e) => setValidating(e)),
      onSocket('players:update', ({ players: p }) => setPlayers(p)),
      onSocket('game:finished', () => {
        if (game) setGame({ ...game, status: 'finished' });
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [game]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectSocket();
      reset();
    };
  }, []);

  // ── Join ────────────────────────────────────────────────────────────────────
  const handleJoin = useCallback(async (playerName: string) => {
    if (!gameId) return;
    setShowName(false);
    const res = await joinGame({ gameId, playerName });
    if (res.error) {
      setJoinError(res.error);
      return;
    }
    if (res.game) setGame(res.game);
    if (res.player) setMe(res.player);
    if (res.timeline) setTimeline(res.timeline);
    if (res.messages) setMessages(res.messages);
  }, [gameId]);

  // ── Hints ───────────────────────────────────────────────────────────────────
  async function handleHint() {
    const res = await requestHints();
    if (res.hints) setHints(res.hints);
  }

  // ── Finish game ─────────────────────────────────────────────────────────────
  async function handleFinish() {
    if (!confirm('确认结束游戏？结束后可导出成果。')) return;
    await finishGame();
  }

  const gameFinished = game?.status === 'finished';

  // ── Render ──────────────────────────────────────────────────────────────────

  if (joinError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-xl text-red-500">⚠ {joinError}</p>
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
        <header className="bg-white border-b border-slate-100 shadow-sm px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="text-slate-400 hover:text-slate-600 transition-colors mr-1"
            title="返回首页"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-bold text-slate-800 truncate">
                {game ? `📚 ${game.topic}` : '历史接龙'}
              </h1>
              {game && (
                <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded font-mono">
                  {game.id}
                </span>
              )}
              {gameFinished && (
                <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">已结束</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-slate-300'}`} />
              <span className="text-xs text-slate-400">
                {connected ? `${players.length} 人在线` : '连接中...'}
              </span>
              <span className="text-xs text-slate-300">·</span>
              <span className="text-xs text-slate-400">{timeline.length} 个概念</span>
            </div>
          </div>

          {/* Header actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleHint}
              className="btn-secondary text-xs py-1.5 px-3"
              title="获取AI提示"
            >
              💡 提示
            </button>
            {!gameFinished && (
              <button
                onClick={handleFinish}
                className="btn-secondary text-xs py-1.5 px-3 text-red-500 hover:text-red-600"
              >
                结束
              </button>
            )}
            <button
              onClick={() => setShowExport(true)}
              className="btn-primary text-xs py-1.5 px-3"
            >
              📤 导出
            </button>
          </div>
        </header>

        {/* ── Players ── */}
        {players.length > 0 && (
          <div className="bg-white border-b border-slate-100 px-4 py-2">
            <PlayerList players={players} me={me} />
          </div>
        )}

        {/* ── Hints ── */}
        {hints.length > 0 && (
          <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-amber-700 font-medium">AI 建议：</span>
            {hints.map((h) => (
              <span key={h} className="text-xs px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full">
                {h}
              </span>
            ))}
            <button onClick={() => setHints([])} className="ml-auto text-amber-400 hover:text-amber-600 text-xs">
              ✕ 关闭
            </button>
          </div>
        )}

        {/* ── Mobile tab bar ── */}
        <div className="flex border-b border-slate-100 bg-white md:hidden">
          {(['chat', 'timeline'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5
                ${activeTab === t ? 'text-brand-600 border-b-2 border-brand-500' : 'text-slate-500'}`}
            >
              {t === 'chat' ? '💬 聊天' : '📅 时间轴'}
              {t === 'timeline' && timeline.length > 0 && (
                <span className="text-xs bg-brand-100 text-brand-600 px-1.5 py-0.5 rounded-full">
                  {timeline.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Main layout ── */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Chat (mobile: conditional, desktop: always) */}
          <div className={`flex-1 flex flex-col overflow-hidden md:max-w-md lg:max-w-lg border-r border-slate-100
            ${activeTab === 'chat' ? 'flex' : 'hidden md:flex'}`}>
            <Chat messages={messages} me={me} gameFinished={gameFinished} />
          </div>

          {/* Right: Timeline */}
          <div className={`flex-1 flex flex-col overflow-hidden bg-slate-50
            ${activeTab === 'timeline' ? 'flex' : 'hidden md:flex'}`}>
            <div className="px-4 py-3 border-b border-slate-100 bg-white flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">
                时间轴
                {timeline.length > 0 && (
                  <span className="ml-2 text-xs bg-brand-100 text-brand-600 px-2 py-0.5 rounded-full">
                    {timeline.length}
                  </span>
                )}
              </h2>
              {validating && (
                <span className="text-xs text-brand-500 animate-pulse">AI 验证中...</span>
              )}
            </div>
            <div className="flex-1 overflow-hidden">
              <Timeline timeline={timeline} newestId={newestConceptId} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
