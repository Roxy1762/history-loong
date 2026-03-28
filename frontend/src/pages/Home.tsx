import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createGame, getGameModes } from '../services/api';
import type { GameModeConfig } from '../types';

const EXAMPLE_TOPICS = [
  '中国古代史', '唐朝政治制度', '欧洲文艺复兴',
  '工业革命', '二战历史', '丝绸之路', '明清经济',
];

export default function Home() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'create' | 'join'>('create');

  // Create form
  const [topic, setTopic] = useState('');
  const [mode, setMode] = useState('free');
  const [validationMode, setValidationMode] = useState<'realtime' | 'deferred'>('realtime');
  const [modes, setModes] = useState<Record<string, GameModeConfig>>({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Join form
  const [roomCode, setRoomCode] = useState('');

  useEffect(() => {
    getGameModes().then(setModes).catch(() => {});
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return setCreateError('请输入游戏主题');
    setCreating(true); setCreateError('');
    try {
      const game = await createGame(topic.trim(), mode, { validationMode });
      navigate(`/game/${game.id}`);
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : '创建失败，请重试');
    } finally {
      setCreating(false);
    }
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (!code) return;
    navigate(`/game/${code}`);
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-indigo-200/30 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-purple-200/30 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-pink-100/20 blur-3xl" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="text-3xl">🐉</span>
          <span className="font-bold text-slate-800 text-lg">历史接龙</span>
        </div>
        <Link to="/admin" className="text-sm text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          后台管理
        </Link>
      </nav>

      {/* Hero */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="text-center mb-10 animate-fade-in">
          <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-600 text-xs font-medium px-3 py-1.5 rounded-full mb-4 border border-indigo-100">
            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
            多人实时 · AI 验证 · 自动时间轴
          </div>
          <h1 className="text-5xl font-black text-slate-900 mb-3 leading-tight">
            <span className="gradient-text">历史接龙</span>
          </h1>
          <p className="text-slate-500 text-lg max-w-md mx-auto">
            多人实时历史知识接龙，AI 自动验证并生成时间轴，支持导出学习成果
          </p>
        </div>

        {/* Card */}
        <div className="w-full max-w-md animate-slide-up">
          <div className="card overflow-hidden shadow-xl shadow-slate-200/60">
            {/* Tab switcher */}
            <div className="flex border-b border-slate-100 bg-slate-50/50">
              {(['create', 'join'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 py-3.5 text-sm font-semibold transition-colors relative
                    ${tab === t ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  {t === 'create' ? '🎮 创建房间' : '🚪 加入房间'}
                  {tab === t && (
                    <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-indigo-500 rounded-t-full" />
                  )}
                </button>
              ))}
            </div>

            <div className="p-6">
              {tab === 'create' ? (
                <form onSubmit={handleCreate} className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">游戏主题</label>
                    <input
                      className="input"
                      placeholder="例如：中国古代史、法国大革命..."
                      value={topic}
                      onChange={e => setTopic(e.target.value)}
                      maxLength={50}
                    />
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {EXAMPLE_TOPICS.map(t => (
                        <button key={t} type="button" onClick={() => setTopic(t)}
                          className="text-xs px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full hover:bg-indigo-100 hover:text-indigo-700 transition-colors border border-transparent hover:border-indigo-200">
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">游戏模式</label>
                    <div className="space-y-2">
                      {Object.entries(modes).map(([key, cfg]) => (
                        <label key={key}
                          className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all
                            ${mode === key
                              ? 'border-indigo-400 bg-indigo-50/80'
                              : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                          <input type="radio" name="mode" value={key} checked={mode === key}
                            onChange={() => setMode(key)} className="mt-0.5 accent-indigo-500" />
                          <div>
                            <div className="font-semibold text-sm text-slate-800">{cfg.label}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{cfg.description}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Validation mode */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">验证时机</label>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { value: 'realtime', icon: '⚡', label: '实时验证', desc: '每次提交立即 AI 验证' },
                        { value: 'deferred', icon: '🎯', label: '结算验证', desc: '游戏结束时批量验证' },
                      ] as const).map(opt => (
                        <label key={opt.value}
                          className={`flex items-start gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all
                            ${validationMode === opt.value
                              ? 'border-indigo-400 bg-indigo-50/80'
                              : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                          <input type="radio" name="validationMode" value={opt.value}
                            checked={validationMode === opt.value}
                            onChange={() => setValidationMode(opt.value)}
                            className="mt-0.5 accent-indigo-500" />
                          <div>
                            <div className="font-semibold text-xs text-slate-800">{opt.icon} {opt.label}</div>
                            <div className="text-xs text-slate-400 mt-0.5">{opt.desc}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {createError && (
                    <div className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                      {createError}
                    </div>
                  )}

                  <button type="submit" className="btn-primary w-full py-3 text-base" disabled={creating}>
                    {creating ? '创建中...' : '创建房间 →'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleJoin} className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">房间码</label>
                    <input
                      className="input text-center text-2xl font-mono tracking-[0.3em] uppercase py-4"
                      placeholder="XXXXXXXX"
                      value={roomCode}
                      onChange={e => setRoomCode(e.target.value.toUpperCase())}
                      maxLength={8}
                    />
                  </div>
                  <button type="submit" className="btn-primary w-full py-3 text-base" disabled={!roomCode.trim()}>
                    加入房间 →
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="mt-8 grid grid-cols-3 gap-3 w-full max-w-md animate-fade-in">
          {[
            { icon: '🤖', title: 'AI 智能验证', desc: '自动识别历史概念' },
            { icon: '📅', title: '自动时间轴', desc: '按朝代自动归类' },
            { icon: '📤', title: '多格式导出', desc: 'JSON / MD / CSV' },
          ].map(f => (
            <div key={f.title} className="bg-white/80 backdrop-blur rounded-2xl p-4 border border-slate-100 text-center shadow-sm hover:shadow-md transition-shadow">
              <div className="text-2xl mb-1.5">{f.icon}</div>
              <div className="text-xs font-semibold text-slate-700">{f.title}</div>
              <div className="text-xs text-slate-400 mt-0.5">{f.desc}</div>
            </div>
          ))}
        </div>

        <p className="mt-6 text-xs text-slate-300 select-none">dev 0.1.1</p>
      </div>
    </div>
  );
}
