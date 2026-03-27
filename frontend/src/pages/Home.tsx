import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createGame, getGameModes } from '../services/api';
import type { GameModeConfig } from '../types';

export default function Home() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'create' | 'join'>('create');

  // Create form
  const [topic, setTopic] = useState('');
  const [mode, setMode] = useState('free');
  const [modes, setModes] = useState<Record<string, GameModeConfig>>({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Join form
  const [roomCode, setRoomCode] = useState('');
  const [joinError, setJoinError] = useState('');

  useEffect(() => {
    getGameModes().then(setModes).catch(() => {});
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return setCreateError('请输入游戏主题');
    setCreating(true);
    setCreateError('');
    try {
      const game = await createGame(topic.trim(), mode);
      navigate(`/game/${game.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '创建失败，请重试';
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (!code) return setJoinError('请输入房间码');
    navigate(`/game/${code}`);
  }

  const EXAMPLE_TOPICS = ['中国古代史', '唐朝政治制度', '欧洲文艺复兴', '工业革命', '二战历史'];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-gradient-to-br from-brand-50 via-white to-purple-50">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="text-6xl mb-3">🐉</div>
        <h1 className="text-4xl font-bold text-slate-800 mb-2">历史接龙</h1>
        <p className="text-slate-500 text-lg">多人在线历史知识接龙 · 自动生成时间轴</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-md">
        <div className="card p-0 overflow-hidden">
          {/* Tab switcher */}
          <div className="flex border-b border-slate-100">
            {(['create', 'join'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-3 text-sm font-medium transition-colors
                  ${tab === t ? 'text-brand-600 border-b-2 border-brand-500 bg-brand-50' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {t === 'create' ? '创建房间' : '加入房间'}
              </button>
            ))}
          </div>

          <div className="p-6">
            {tab === 'create' ? (
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">游戏主题</label>
                  <input
                    className="input"
                    placeholder="例如：中国古代史、法国大革命..."
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    maxLength={50}
                  />
                  {/* Quick pick examples */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {EXAMPLE_TOPICS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTopic(t)}
                        className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full hover:bg-brand-100 hover:text-brand-700 transition-colors"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">游戏模式</label>
                  <div className="space-y-2">
                    {Object.entries(modes).map(([key, cfg]) => (
                      <label
                        key={key}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                          ${mode === key ? 'border-brand-400 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}
                      >
                        <input
                          type="radio"
                          name="mode"
                          value={key}
                          checked={mode === key}
                          onChange={() => setMode(key)}
                          className="mt-0.5 accent-brand-500"
                        />
                        <div>
                          <div className="font-medium text-sm text-slate-800">{cfg.label}</div>
                          <div className="text-xs text-slate-500">{cfg.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {createError && <p className="text-sm text-red-500">{createError}</p>}

                <button type="submit" className="btn-primary w-full" disabled={creating}>
                  {creating ? '创建中...' : '创建房间'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleJoin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">房间码</label>
                  <input
                    className="input text-center text-xl font-mono tracking-widest uppercase"
                    placeholder="XXXXXX"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    maxLength={8}
                  />
                </div>
                {joinError && <p className="text-sm text-red-500">{joinError}</p>}
                <button type="submit" className="btn-primary w-full">加入房间</button>
              </form>
            )}
          </div>
        </div>

        {/* Feature list */}
        <div className="mt-8 grid grid-cols-3 gap-3 text-center">
          {[
            { icon: '🤖', label: 'AI 自动验证' },
            { icon: '📅', label: '时间轴生成' },
            { icon: '📤', label: '多格式导出' },
          ].map((f) => (
            <div key={f.label} className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
              <div className="text-2xl mb-1">{f.icon}</div>
              <div className="text-xs text-slate-600 font-medium">{f.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
