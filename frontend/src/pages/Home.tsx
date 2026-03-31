import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createGame, getGameModes } from '../services/api';
import ThemeSwitcher from '../components/ThemeSwitcher';
import type { GameModeConfig } from '../types';

const EXAMPLE_TOPICS = [
  '中国古代史', '唐朝政治制度', '欧洲文艺复兴',
  '工业革命', '二战历史', '丝绸之路', '明清经济',
  '资本主义世界殖民体系', '中国近代史', '古希腊文明',
];

function normalizeExtraModes(primaryMode: string, extraModes: string[]) {
  return [...new Set(extraModes.filter(Boolean))].filter(mode => mode !== primaryMode);
}

function getCombinedModes(primaryMode: string, extraModes: string[]) {
  return [primaryMode, ...normalizeExtraModes(primaryMode, extraModes)];
}

export default function Home() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [prevTab, setPrevTab] = useState<'create' | 'join'>('create');

  // Create form
  const [topic, setTopic] = useState('');
  const [mode, setMode] = useState('free');
  const [extraModes, setExtraModes] = useState<string[]>([]);
  const [validationMode, setValidationMode] = useState<'realtime' | 'deferred'>('realtime');
  const [modes, setModes] = useState<Record<string, GameModeConfig>>({});
  const [combinableModes, setCombinableModes] = useState<Record<string, GameModeConfig>>({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Advanced settings
  const [challengeThreshold, setChallengeThreshold] = useState(2);
  const [skipCooldownMs, setSkipCooldownMs] = useState(0);
  const [maxPlayers, setMaxPlayers] = useState(0); // 0 = unlimited
  const [ragTopicTopN, setRagTopicTopN] = useState(1);
  const [ragConceptTopN, setRagConceptTopN] = useState(2);
  const [ragContextMaxChars, setRagContextMaxChars] = useState(800);
  const [ragFtsCandidateMultiplier, setRagFtsCandidateMultiplier] = useState(4);
  const [ragFtsMinCandidates, setRagFtsMinCandidates] = useState(12);
  const [ragShowPolishedInChat, setRagShowPolishedInChat] = useState(false);
  const [ragJoinSeparator, setRagJoinSeparator] = useState<'rule' | 'double_newline'>('rule');
  const [showRagHelp, setShowRagHelp] = useState(false);

  // Join form
  const [roomCode, setRoomCode] = useState('');

  useEffect(() => {
    getGameModes().then(data => {
      setModes(data.modes);
      setCombinableModes(data.combinableModes || {});
      const d = (data.ragDefaults || {}) as Record<string, unknown>;
      if (Number.isFinite(Number(d.ragTopicTopN))) setRagTopicTopN(Math.max(1, Number(d.ragTopicTopN)));
      if (Number.isFinite(Number(d.ragConceptTopN))) setRagConceptTopN(Math.max(1, Number(d.ragConceptTopN)));
      if (Number.isFinite(Number(d.ragContextMaxChars))) setRagContextMaxChars(Math.max(200, Number(d.ragContextMaxChars)));
      if (Number.isFinite(Number(d.ragFtsCandidateMultiplier))) setRagFtsCandidateMultiplier(Math.max(1, Number(d.ragFtsCandidateMultiplier)));
      if (Number.isFinite(Number(d.ragFtsMinCandidates))) setRagFtsMinCandidates(Math.max(1, Number(d.ragFtsMinCandidates)));
      if (typeof d.ragShowPolishedInChat === 'boolean') setRagShowPolishedInChat(d.ragShowPolishedInChat);
      if (d.ragJoinSeparator === 'double_newline' || d.ragJoinSeparator === 'rule') {
        setRagJoinSeparator(d.ragJoinSeparator);
      }
    }).catch(() => {});
  }, []);

  function switchTab(t: 'create' | 'join') {
    setPrevTab(tab);
    setTab(t);
  }

  function toggleExtraMode(m: string) {
    setExtraModes(prev =>
      normalizeExtraModes(mode, prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
    );
  }

  const normalizedExtraModes = normalizeExtraModes(mode, extraModes);
  const parseInputNumber = (value: string, fallback: number) => {
    if (value === '') return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const combinedModes = getCombinedModes(mode, extraModes);
  const hasChallengeMode = combinedModes.includes('challenge');
  const hasScoreMode = combinedModes.includes('score-race') || combinedModes.includes('challenge');
  const showChallengeSettings = hasChallengeMode;
  const modeSummary = combinedModes.map(key => modes[key]?.label || combinableModes[key]?.label || key);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return setCreateError('请输入游戏主题');
    setCreating(true); setCreateError('');
    try {
      const settings: Record<string, unknown> = { validationMode };
      if (normalizedExtraModes.length > 0) settings.extraModes = normalizedExtraModes;
      // Challenge settings
      if (hasChallengeMode) {
        settings.challengeThreshold = challengeThreshold;
        settings.skipCooldownMs = skipCooldownMs;
      }

      if (maxPlayers > 0) settings.maxPlayers = maxPlayers;
      settings.ragTopicTopN = ragTopicTopN;
      settings.ragConceptTopN = ragConceptTopN;
      settings.ragContextMaxChars = ragContextMaxChars;
      settings.ragFtsCandidateMultiplier = ragFtsCandidateMultiplier;
      settings.ragFtsMinCandidates = ragFtsMinCandidates;
      settings.ragShowPolishedInChat = ragShowPolishedInChat;
      settings.ragJoinSeparator = ragJoinSeparator;

      const game = await createGame(topic.trim(), mode, settings);
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
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="deco-blob absolute -top-40 -right-40 w-96 h-96" style={{ background: 'var(--deco-blob1)' }} />
        <div className="deco-blob absolute -bottom-40 -left-40 w-96 h-96" style={{ background: 'var(--deco-blob2)' }} />
        <div className="deco-blob absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px]" style={{ background: 'var(--deco-blob3)' }} />
      </div>

      {/* Nav */}
      <nav className="relative z-30 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="text-3xl animate-float">🐉</span>
          <span className="font-heading font-bold text-xl" style={{ color: 'var(--text-primary)' }}>历史接龙</span>
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
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--brand)' }} />
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
            <div className="flex border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-muted)' }}>
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
                    <span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-t-full animate-expand-width" style={{ background: 'var(--brand)' }} />
                  )}
                </button>
              ))}
            </div>

            <div className="p-6">
              <div key={tab} className={slideDir}>
                {tab === 'create' ? (
                  <form onSubmit={handleCreate} className="space-y-5">
                    {/* Topic */}
                    <div>
                      <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>游戏主题</label>
                      <input
                        className="input"
                        placeholder="例如：中国古代史、资本主义殖民体系..."
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
                              borderColor: topic === t ? 'color-mix(in srgb, var(--brand) 40%, transparent)' : 'var(--border)',
                            }}
                          >{t}</button>
                        ))}
                      </div>
                    </div>

                    {/* Primary mode */}
                    <div>
                      <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>主要游戏模式</label>
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
                              onChange={() => {
                                setMode(key);
                                // Remove from extra if it was there
                                setExtraModes(prev => prev.filter(m => m !== key));
                              }}
                              className="mt-0.5"
                              style={{ accentColor: 'var(--brand)' }}
                            />
                            <div>
                              <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{cfg.label}</div>
                              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{cfg.description}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Extra combinable modes */}
                    {Object.keys(combinableModes).length > 0 && (
                      <div>
                        <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                          叠加玩法
                          <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>（可与主模式叠加）</span>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(combinableModes).map(([key, cfg]) => {
                            const isPrimary = mode === key;
                            const isChecked = extraModes.includes(key) || isPrimary;
                            return (
                              <label
                                key={key}
                                className={`option-card flex items-start gap-2 p-3 cursor-pointer ${isChecked ? 'selected' : ''} ${isPrimary ? 'opacity-60 cursor-not-allowed' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={isPrimary}
                                  onChange={() => !isPrimary && toggleExtraMode(key)}
                                  className="mt-0.5"
                                  style={{ accentColor: 'var(--brand)' }}
                                />
                                <div>
                                  <div className="font-semibold text-xs" style={{ color: 'var(--text-primary)' }}>{cfg.label}</div>
                                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{cfg.description}</div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="rounded-xl border p-3" style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)' }}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>当前生效模式</span>
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {hasScoreMode ? '含积分结算' : '普通结算'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {modeSummary.map(label => (
                          <span
                            key={label}
                            className="text-xs px-2.5 py-1 rounded-full border font-medium"
                            style={{
                              background: 'var(--bg-card)',
                              color: 'var(--text-secondary)',
                              borderColor: 'var(--border)',
                            }}
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                      {hasChallengeMode && (
                        <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
                          挑战玩法自带奖励结算，无需再重复勾选“积分竞速”。
                        </p>
                      )}
                    </div>

                    {/* Validation mode */}
                    <div>
                      <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>验证时机</label>
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
                              <div className="font-semibold text-xs" style={{ color: 'var(--text-primary)' }}>{opt.icon} {opt.label}</div>
                              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{opt.desc}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Advanced settings toggle */}
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowAdvanced(v => !v)}
                        className="flex items-center gap-1.5 text-sm font-medium transition-colors"
                        style={{ color: showAdvanced ? 'var(--brand)' : 'var(--text-muted)' }}
                      >
                        <svg className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        高级设置
                      </button>

                      {showAdvanced && (
                        <div className="mt-3 space-y-4 p-4 rounded-xl border animate-slide-down" style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)' }}>
                          {/* Challenge settings */}
                          {showChallengeSettings && (
                            <>
                              <div>
                                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                                  🃏 挑战卡换牌阈值
                                  <span className="ml-1 font-normal" style={{ color: 'var(--text-muted)' }}>（每完成几个概念换一张卡）</span>
                                </label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="range" min={1} max={10} step={1}
                                    value={challengeThreshold}
                                    onChange={e => setChallengeThreshold(Number(e.target.value))}
                                    className="flex-1"
                                    style={{ accentColor: 'var(--brand)' }}
                                  />
                                  <span className="text-sm font-bold w-6 text-center" style={{ color: 'var(--brand)' }}>{challengeThreshold}</span>
                                </div>
                              </div>
                              <div>
                                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                                  🔀 换题冷却时间
                                  <span className="ml-1 font-normal" style={{ color: 'var(--text-muted)' }}>（0 = 无限制）</span>
                                </label>
                                <div className="grid grid-cols-4 gap-1.5">
                                  {[0, 10000, 30000, 60000].map(ms => (
                                    <button
                                      key={ms}
                                      type="button"
                                      onClick={() => setSkipCooldownMs(ms)}
                                      className="text-xs py-1.5 rounded-lg border font-medium transition-all"
                                      style={{
                                        background: skipCooldownMs === ms ? 'var(--brand-light)' : 'var(--bg-card)',
                                        color: skipCooldownMs === ms ? 'var(--brand)' : 'var(--text-secondary)',
                                        borderColor: skipCooldownMs === ms ? 'color-mix(in srgb, var(--brand) 40%, transparent)' : 'var(--border)',
                                      }}
                                    >
                                      {ms === 0 ? '无限制' : ms === 10000 ? '10秒' : ms === 30000 ? '30秒' : '60秒'}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}

                          {/* Max players */}
                          <div>
                            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                              👥 最大玩家数
                              <span className="ml-1 font-normal" style={{ color: 'var(--text-muted)' }}>（0 = 不限制）</span>
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="range" min={0} max={20} step={1}
                                value={maxPlayers}
                                onChange={e => setMaxPlayers(Number(e.target.value))}
                                className="flex-1"
                                style={{ accentColor: 'var(--brand)' }}
                              />
                              <span className="text-sm font-bold w-8 text-center" style={{ color: 'var(--brand)' }}>
                                {maxPlayers === 0 ? '∞' : maxPlayers}
                              </span>
                            </div>
                          </div>

                          <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                            <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                              📚 RAG 检索参数
                              <button
                                type="button"
                                onClick={() => setShowRagHelp(v => !v)}
                                className="ml-2 text-[11px] px-2 py-0.5 rounded border"
                                style={{ color: 'var(--brand)', borderColor: 'var(--border)' }}
                              >
                                {showRagHelp ? '收起说明' : '参数说明'}
                              </button>
                            </div>
                            {showRagHelp && (
                              <div className="text-xs rounded-lg border p-2 mb-2 space-y-1" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
                                <p><strong>主题 TopN</strong>：按主题检索返回的片段数量。</p>
                                <p><strong>概念 TopN</strong>：按提交概念检索返回的片段数量。</p>
                                <p><strong>上下文最大字数</strong>：最终拼接后送给 AI 的最大字数上限。</p>
                                <p><strong>FTS 候选倍率</strong>：候选池大小约为 <code>TopN × 倍率</code>。</p>
                                <p><strong>FTS 最少候选数</strong>：候选池下限，避免候选过少。</p>
                                <p><strong>拼接分隔</strong>：检索片段之间的连接方式（分隔线/空行）。</p>
                                <p><strong>聊天区教材摘录</strong>：通过后是否把 AI 精简教材摘录发到聊天区。</p>
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>主题 TopN</label>
                                <input className="input text-sm" type="number" min={1} max={10} value={ragTopicTopN}
                                  onChange={e => setRagTopicTopN(parseInputNumber(e.target.value, ragTopicTopN))} />
                              </div>
                              <div>
                                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>概念 TopN</label>
                                <input className="input text-sm" type="number" min={1} max={12} value={ragConceptTopN}
                                  onChange={e => setRagConceptTopN(parseInputNumber(e.target.value, ragConceptTopN))} />
                              </div>
                              <div>
                                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>上下文最大字数</label>
                                <input className="input text-sm" type="number" min={200} max={4000} value={ragContextMaxChars}
                                  onChange={e => setRagContextMaxChars(parseInputNumber(e.target.value, ragContextMaxChars))} />
                              </div>
                              <div>
                                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>FTS 候选倍率</label>
                                <input className="input text-sm" type="number" min={1} max={20} value={ragFtsCandidateMultiplier}
                                  onChange={e => setRagFtsCandidateMultiplier(parseInputNumber(e.target.value, ragFtsCandidateMultiplier))} />
                              </div>
                              <div>
                                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>FTS 最少候选数</label>
                                <input className="input text-sm" type="number" min={1} max={200} value={ragFtsMinCandidates}
                                  onChange={e => setRagFtsMinCandidates(parseInputNumber(e.target.value, ragFtsMinCandidates))} />
                              </div>
                              <div>
                                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>拼接分隔</label>
                                <select className="input text-sm" value={ragJoinSeparator} onChange={e => setRagJoinSeparator(e.target.value as 'rule' | 'double_newline')}>
                                  <option value="rule">分隔线（---）</option>
                                  <option value="double_newline">空行</option>
                                </select>
                              </div>
                            </div>
                            <label className="mt-2 inline-flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                              <input
                                type="checkbox"
                                checked={ragShowPolishedInChat}
                                onChange={e => setRagShowPolishedInChat(e.target.checked)}
                                style={{ accentColor: 'var(--brand)' }}
                              />
                              在聊天区显示 AI 教材摘录
                            </label>
                          </div>
                        </div>
                      )}
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
                      <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>房间码</label>
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
            { icon: '🤖', title: 'AI 智能验证', desc: '时代感知验证，精准分类' },
            { icon: '📅', title: '自动时间轴', desc: '按朝代自动归类' },
            { icon: '🎮', title: '多模式叠加', desc: '自由组合玩法规则' },
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

        <p className="mt-6 text-xs select-none" style={{ color: 'var(--border)' }}>dev 0.3.0</p>
      </div>
    </div>
  );
}
