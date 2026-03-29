import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createGame, getGameModes } from '../services/api';
import ThemeSwitcher from '../components/ThemeSwitcher';
import type { GameModeConfig } from '../types';

const EXAMPLE_TOPICS = [
  '中国古代史', '唐朝政治制度', '欧洲文艺复兴',
  '工业革命', '二战历史', '丝绸之路', '明清经济',
];

export default function Home() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [prevTab, setPrevTab] = useState<'create' | 'join'>('create');

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

  function switchTab(t: 'create' | 'join') {
    setPrevTab(tab);
    setTab(t);
  }

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

  const slideDir = tab === 'join' && prevTab === 'create' ? 'animate-tab-in' : 'animate-tab-in-left';

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{ backgroundColor: 'var(--bg-page)' }}
    >
      {/* Background decoration — uses theme CSS variables */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="deco-blob absolute -top-40 -right-40 w-96 h-96"
          style={{ background: 'var(--deco-blob1)' }}
        />
        <div
          className="deco-blob absolute -bottom-40 -left-40 w-96 h-96"
          style={{ background: 'var(--deco-blob2)' }}
        />
        <div
          className="deco-blob absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px]"
          style={{ background: 'var(--deco-blob3)' }}
        />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="text-3xl animate-float">🐉</span>
          <span className="font-heading font-bold text-xl" style={{ color: 'var(--text-primary)' }}>
            历史接龙
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeSwitcher />
          <Link
            to="/admin"
            className="text-sm transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg"
            style={{ color: 'var(--text-muted)' }}
            onMouseOver={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
            onMouseOut={e => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            后台管理
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="text-center mb-10 animate-fade-in">
          <div
            className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full mb-5 border"
            style={{
              background: 'var(--brand-light)',
              color: 'var(--brand)',
              borderColor: 'color-mix(in srgb, var(--brand) 25%, transparent)',
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: 'var(--brand)' }}
            />
            多人实时 · AI 验证 · 自动时间轴
          </div>
          <h1 className="text-5xl font-heading font-black mb-3 leading-tight" style={{ color: 'var(--text-primary)' }}>
            <span className="gradient-text">历史接龙</span>
          </h1>
          <p className="text-lg max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>
            多人实时历史知识接龙，AI 自动验证并生成时间轴，支持导出学习成果
          </p>
        </div>

        {/* Card */}
        <div className="w-full max-w-md animate-slide-up" style={{ animationDelay: '60ms' }}>
          <div
            className="overflow-hidden rounded-2xl shadow-xl"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              boxShadow: '0 20px 60px var(--shadow)',
            }}
          >
            {/* Tab switcher */}
            <div
              className="flex border-b"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-muted)' }}
            >
              {(['create', 'join'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => switchTab(t)}
                  className="flex-1 py-3.5 text-sm font-semibold transition-all duration-200 relative"
                  style={{
                    color: tab === t ? 'var(--brand)' : 'var(--text-muted)',
                    background: tab === t ? 'var(--bg-card)' : 'transparent',
                  }}
                >
                  {t === 'create' ? '🎮 创建房间' : '🚪 加入房间'}
                  {tab === t && (
                    <span
                      className="absolute bottom-0 left-4 right-4 h-0.5 rounded-t-full animate-expand-width"
                      style={{ background: 'var(--brand)' }}
                    />
                  )}
                </button>
              ))}
            </div>

            <div className="p-6">
              <div key={tab} className={slideDir}>
                {tab === 'create' ? (
                  <form onSubmit={handleCreate} className="space-y-5">
                    <div>
                      <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                        游戏主题
                      </label>
                      <input
                        className="input"
                        placeholder="例如：中国古代史、法国大革命..."
                        value={topic}
                        onChange={e => setTopic(e.target.value)}
                        maxLength={50}
                      />
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {EXAMPLE_TOPICS.map(t => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setTopic(t)}
                            className="text-xs px-2.5 py-1 rounded-full border transition-all duration-150"
                            style={{
                              background: topic === t ? 'var(--brand-light)' : 'var(--bg-muted)',
                              color: topic === t ? 'var(--brand)' : 'var(--text-secondary)',
                              borderColor: topic === t
                                ? 'color-mix(in srgb, var(--brand) 40%, transparent)'
                                : 'var(--border)',
                            }}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                        游戏模式
                      </label>
                      <div className="space-y-2">
                        {Object.entries(modes).map(([key, cfg]) => (
                          <label
                            key={key}
                            className={`option-card flex items-start gap-3 p-3.5 ${mode === key ? 'selected' : ''}`}
                          >
                            <input
                              type="radio"
                              name="mode"
                              value={key}
                              checked={mode === key}
                              onChange={() => setMode(key)}
                              className="mt-0.5"
                              style={{ accentColor: 'var(--brand)' }}
                            />
                            <div>
                              <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                                {cfg.label}
                              </div>
                              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                {cfg.description}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Validation mode */}
                    <div>
                      <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                        验证时机
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { value: 'realtime', icon: '⚡', label: '实时验证', desc: '每次提交立即 AI 验证' },
                          { value: 'deferred', icon: '🎯', label: '结算验证', desc: '按需批量验证，不结束游戏' },
                        ] as const).map(opt => (
                          <label
                            key={opt.value}
                            className={`option-card flex items-start gap-2 p-3 ${validationMode === opt.value ? 'selected' : ''}`}
                          >
                            <input
                              type="radio"
                              name="validationMode"
                              value={opt.value}
                              checked={validationMode === opt.value}
                              onChange={() => setValidationMode(opt.value)}
                              className="mt-0.5"
                              style={{ accentColor: 'var(--brand)' }}
                            />
                            <div>
                              <div className="font-semibold text-xs" style={{ color: 'var(--text-primary)' }}>
                                {opt.icon} {opt.label}
                              </div>
                              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                {opt.desc}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    {createError && (
                      <div className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2 animate-slide-down">
                        {createError}
                      </div>
                    )}

                    <button type="submit" className="btn-primary w-full py-3 text-base font-heading" disabled={creating}>
                      {creating ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          创建中...
                        </span>
                      ) : '创建房间 →'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleJoin} className="space-y-5">
                    <div>
                      <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                        房间码
                      </label>
                      <input
                        className="input text-center text-2xl font-mono tracking-[0.3em] uppercase py-4"
                        placeholder="XXXXXXXX"
                        value={roomCode}
                        onChange={e => setRoomCode(e.target.value.toUpperCase())}
                        maxLength={8}
                      />
                      <p className="text-xs text-center mt-2" style={{ color: 'var(--text-muted)' }}>
                        输入创建者提供的 8 位房间码
                      </p>
                    </div>
                    <button
                      type="submit"
                      className="btn-primary w-full py-3 text-base font-heading"
                      disabled={!roomCode.trim()}
                    >
                      加入房间 →
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="mt-8 grid grid-cols-3 gap-3 w-full max-w-md animate-fade-in" style={{ animationDelay: '120ms' }}>
          {[
            { icon: '🤖', title: 'AI 智能验证', desc: '本地知识库优先，AI 兜底' },
            { icon: '📅', title: '自动时间轴', desc: '按朝代自动归类' },
            { icon: '📤', title: '多格式导出', desc: 'JSON / MD / CSV / 可重新导入' },
          ].map((f, i) => (
            <div
              key={f.title}
              className="backdrop-blur rounded-2xl p-4 text-center hover-lift animate-fade-in"
              style={{
                background: 'color-mix(in srgb, var(--bg-card) 85%, transparent)',
                border: '1px solid var(--border-subtle)',
                boxShadow: '0 2px 8px var(--shadow)',
                animationDelay: `${150 + i * 60}ms`,
              }}
            >
              <div className="text-2xl mb-1.5">{f.icon}</div>
              <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{f.title}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{f.desc}</div>
            </div>
          ))}
        </div>

        <p className="mt-6 text-xs select-none" style={{ color: 'var(--border)' }}>dev 0.2.0</p>
      </div>
    </div>
  );
}
