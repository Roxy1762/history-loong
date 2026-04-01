import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createGame, getGameModes } from '../services/api';
import ThemeSwitcher from '../components/ThemeSwitcher';
import type { GameModeConfig } from '../types';

const RAG_LIMITS = {
  topicTopN: { min: 1, max: 10, fallback: 1 },
  conceptTopN: { min: 1, max: 12, fallback: 2 },
  contextMaxChars: { min: 200, max: 4000, fallback: 800 },
  ftsCandidateMultiplier: { min: 1, max: 20, fallback: 4 },
  ftsMinCandidates: { min: 1, max: 200, fallback: 12 },
} as const;

const RAG_PARAM_DOCS = [
  { name: '主题 TopN', desc: '先召回最相关的主题数量。数值越高，覆盖面越广，但可能引入更多噪声。' },
  { name: '概念 TopN', desc: '每个主题下进一步选取的概念条数。适当提高可增加命中率，但会增加上下文长度。' },
  { name: '上下文最大字数', desc: '送入模型前，RAG 文本允许的最大长度。过小会丢信息，过大可能增加延迟与成本。' },
  { name: 'FTS 候选倍率', desc: '全文检索阶段的候选放大倍数。值越大，重排器选择空间越大，但检索耗时也会上升。' },
  { name: 'FTS 最少候选数', desc: '全文检索至少保留的候选条目数。用于避免低召回场景下候选过少。' },
  { name: '拼接分隔', desc: '控制多段 RAG 文本如何拼接：分隔线更清晰，空行更紧凑。' },
  { name: '在聊天区显示 AI 教材摘录', desc: '开启后，聊天区会展示模型使用的参考摘录，便于教学和溯源。' },
];

const EXAMPLE_TOPICS = [
  '中国古代史', '唐朝政治制度', '欧洲文艺复兴',
  '工业革命', '二战历史', '丝绸之路', '明清经济',
  '中国近代史', '古希腊文明',
];

const SHI_JI_QUOTES = [
  { quote: '项庄舞剑，意在沛公。', source: '《史记·项羽本纪》' },
  { quote: '燕雀安知鸿鹄之志哉。', source: '《史记·陈涉世家》' },
  { quote: '桃李不言，下自成蹊。', source: '《史记·李将军列传》' },
  { quote: '运筹策帷帐之中，决胜于千里之外。', source: '《史记·高祖本纪》' },
  { quote: '众口铄金，积毁销骨。', source: '《史记·张仪列传》' },
  { quote: '大行不顾细谨，大礼不辞小让。', source: '《史记·项羽本纪》' },
  { quote: '人为刀俎，我为鱼肉。', source: '《史记·项羽本纪》' },
  { quote: '沛公居山东时，贪于财货，好美姬。', source: '《史记·项羽本纪》' },
  { quote: '王侯将相宁有种乎！', source: '《史记·陈涉世家》' },
  { quote: '燕雀安知鸿鹄之志。', source: '《史记·陈涉世家》' },
  { quote: '反听之谓聪，内视之谓明，自胜之谓强。', source: '《史记·商君列传》' },
  { quote: '智者千虑，必有一失；愚者千虑，必有一得。', source: '《史记·淮阴侯列传》' },
  { quote: '狡兔死，走狗烹；高鸟尽，良弓藏。', source: '《史记·越王勾践世家》' },
  { quote: '飞鸟尽，良弓藏；狡兔死，走狗烹。', source: '《史记·越王勾践世家》' },
  { quote: '祸兮福所倚，福兮祸所伏。', source: '《史记·管晏列传》' },
  { quote: '能行之者未必能言，能言之者未必能行。', source: '《史记·孙子吴起列传》' },
  { quote: '前事不忘，后事之师。', source: '《史记·秦始皇本纪》' },
  { quote: '天下熙熙，皆为利来；天下攘攘，皆为利往。', source: '《史记·货殖列传》' },
  { quote: '不鸣则已，一鸣惊人。', source: '《史记·滑稽列传》' },
  { quote: '积羽沉舟，群轻折轴。', source: '《史记·张仪列传》' },
  { quote: '当断不断，反受其乱。', source: '《史记·齐悼惠王世家》' },
  { quote: '以权利合者，权利尽而交疏。', source: '《史记·郑世家》' },
  { quote: '士为知己者死，女为悦己者容。', source: '《史记·刺客列传》' },
  { quote: '千人之诺诺，不如一士之谔谔。', source: '《史记·商君列传》' },
  { quote: '慈母有败子，而严家无格虏。', source: '《史记·李斯列传》' },
  { quote: '日中则移，月满则亏。', source: '《史记·范雎蔡泽列传》' },
  { quote: '欲而不知止，失其所以欲；有而不知足，失其所以有。', source: '《史记·日者列传》' },
  { quote: '以三寸之舌，强于百万之师。', source: '《史记·平原君虞卿列传》' },
  { quote: '仓廪实而知礼节，衣食足而知荣辱。', source: '《史记·管晏列传》' },
  { quote: '得黄金百斤，不如得季布一诺。', source: '《史记·季布栾布列传》' },
  { quote: '人弃我取，人取我与。', source: '《史记·货殖列传》' },
  { quote: '将相和，则国家兴。', source: '《史记·廉颇蔺相如列传》' },
] as const;

function normalizeExtraModes(primaryMode: string, extraModes: string[]) {
  return [...new Set(extraModes.filter(Boolean))].filter(mode => mode !== primaryMode);
}

function getCombinedModes(primaryMode: string, extraModes: string[]) {
  return [primaryMode, ...normalizeExtraModes(primaryMode, extraModes)];
}

function parseAndClampInt(value: string, rule: { min: number; max: number; fallback: number }) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return rule.fallback;
  return Math.min(rule.max, Math.max(rule.min, parsed));
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
  const [maxPlayers, setMaxPlayers] = useState(0);
  const [ragTopicTopNInput, setRagTopicTopNInput] = useState(String(RAG_LIMITS.topicTopN.fallback));
  const [ragConceptTopNInput, setRagConceptTopNInput] = useState(String(RAG_LIMITS.conceptTopN.fallback));
  const [ragContextMaxCharsInput, setRagContextMaxCharsInput] = useState(String(RAG_LIMITS.contextMaxChars.fallback));
  const [ragFtsCandidateMultiplierInput, setRagFtsCandidateMultiplierInput] = useState(String(RAG_LIMITS.ftsCandidateMultiplier.fallback));
  const [ragFtsMinCandidatesInput, setRagFtsMinCandidatesInput] = useState(String(RAG_LIMITS.ftsMinCandidates.fallback));
  const [ragShowPolishedInChat, setRagShowPolishedInChat] = useState(false);
  const [ragJoinSeparator, setRagJoinSeparator] = useState<'rule' | 'double_newline'>('rule');
  const [showRagHelp, setShowRagHelp] = useState(false);

  // Join form
  const [roomCode, setRoomCode] = useState('');
  const [heroQuote] = useState(() => SHI_JI_QUOTES[Math.floor(Math.random() * SHI_JI_QUOTES.length)]);

  useEffect(() => {
    getGameModes().then(data => {
      setModes(data.modes);
      setCombinableModes(data.combinableModes || {});
      const d = (data.ragDefaults || {}) as Record<string, unknown>;
      if (Number.isFinite(Number(d.ragTopicTopN))) setRagTopicTopNInput(String(Number(d.ragTopicTopN)));
      if (Number.isFinite(Number(d.ragConceptTopN))) setRagConceptTopNInput(String(Number(d.ragConceptTopN)));
      if (Number.isFinite(Number(d.ragContextMaxChars))) setRagContextMaxCharsInput(String(Number(d.ragContextMaxChars)));
      if (Number.isFinite(Number(d.ragFtsCandidateMultiplier))) setRagFtsCandidateMultiplierInput(String(Number(d.ragFtsCandidateMultiplier)));
      if (Number.isFinite(Number(d.ragFtsMinCandidates))) setRagFtsMinCandidatesInput(String(Number(d.ragFtsMinCandidates)));
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
      if (hasChallengeMode) {
        settings.challengeThreshold = challengeThreshold;
        settings.skipCooldownMs = skipCooldownMs;
      }
      if (maxPlayers > 0) settings.maxPlayers = maxPlayers;
      const ragTopicTopN = parseAndClampInt(ragTopicTopNInput, RAG_LIMITS.topicTopN);
      const ragConceptTopN = parseAndClampInt(ragConceptTopNInput, RAG_LIMITS.conceptTopN);
      const ragContextMaxChars = parseAndClampInt(ragContextMaxCharsInput, RAG_LIMITS.contextMaxChars);
      const ragFtsCandidateMultiplier = parseAndClampInt(ragFtsCandidateMultiplierInput, RAG_LIMITS.ftsCandidateMultiplier);
      const ragFtsMinCandidates = parseAndClampInt(ragFtsMinCandidatesInput, RAG_LIMITS.ftsMinCandidates);

      setRagTopicTopNInput(String(ragTopicTopN));
      setRagConceptTopNInput(String(ragConceptTopN));
      setRagContextMaxCharsInput(String(ragContextMaxChars));
      setRagFtsCandidateMultiplierInput(String(ragFtsCandidateMultiplier));
      setRagFtsMinCandidatesInput(String(ragFtsMinCandidates));

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
      className="min-h-dvh flex flex-col relative overflow-hidden paper-bg"
      style={{ backgroundColor: 'var(--bg-page)' }}
    >
      {/* Background decoration — ink wash blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="deco-blob absolute -top-32 -right-32 w-80 h-80 opacity-70" style={{ background: 'var(--deco-blob1)' }} />
        <div className="deco-blob absolute -bottom-32 -left-32 w-80 h-80 opacity-70" style={{ background: 'var(--deco-blob2)' }} />
        <div className="deco-blob absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] opacity-50" style={{ background: 'var(--deco-blob3)' }} />
        {/* Decorative Chinese characters background */}
        <div className="absolute top-8 left-8 writing-vertical text-[80px] font-heading font-black select-none pointer-events-none opacity-[0.04]"
          style={{ color: 'var(--text-primary)', lineHeight: 1 }}>
          史
        </div>
        <div className="absolute bottom-8 right-8 writing-vertical text-[80px] font-heading font-black select-none pointer-events-none opacity-[0.04]"
          style={{ color: 'var(--text-primary)', lineHeight: 1 }}>
          龙
        </div>
      </div>

      {/* Nav */}
      <nav className="relative z-30 flex items-center justify-between px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xl shadow-sm"
            style={{ background: 'var(--brand)', color: '#fff' }}>
            龙
          </div>
          <span className="font-heading font-bold text-lg tracking-wide" style={{ color: 'var(--text-primary)' }}>历史接龙</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeSwitcher />
          <Link
            to="/admin"
            className="text-xs transition-all flex items-center gap-1.5 px-3 py-1.5 rounded-lg border"
            style={{
              color: 'var(--text-muted)',
              borderColor: 'var(--border)',
              background: 'var(--bg-card)',
            }}
            onMouseOver={e => {
              e.currentTarget.style.color = 'var(--brand)';
              e.currentTarget.style.borderColor = 'var(--brand)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.color = 'var(--text-muted)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            后台
          </Link>
        </div>
      </nav>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-6">

        {/* Hero title */}
        <div className="text-center mb-7 animate-fade-in">
          <div
            className="max-w-2xl mx-auto px-4 py-4 rounded-2xl border"
            style={{
              background: 'color-mix(in srgb, var(--brand-light) 45%, var(--bg-card))',
              borderColor: 'color-mix(in srgb, var(--brand) 20%, transparent)',
            }}
          >
            <p className="text-xl sm:text-2xl font-heading font-bold leading-relaxed" style={{ color: 'var(--text-primary)' }}>
              「{heroQuote.quote}」
            </p>
            <p className="mt-2 text-sm sm:text-base" style={{ color: 'var(--text-secondary)' }}>
              —— {heroQuote.source}
            </p>
          </div>
          <p className="text-xs sm:text-sm max-w-md mx-auto leading-relaxed mt-3" style={{ color: 'var(--text-muted)' }}>
            每次打开页面随机展示一则《史记》名句
          </p>
        </div>

        {/* Main card */}
        <div className="w-full max-w-md animate-slide-up" style={{ animationDelay: '60ms' }}>
          <div
            className="overflow-hidden rounded-xl corner-ornament"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              boxShadow: '0 8px 40px var(--shadow), 0 1px 0 color-mix(in srgb, var(--gold-accent) 20%, transparent) inset',
            }}
          >
            {/* Gold top bar */}
            <div className="h-0.5 w-full" style={{ background: 'linear-gradient(to right, var(--gradient-start), var(--gradient-mid), var(--gradient-end))' }} />

            {/* Tab switcher */}
            <div className="flex" style={{ background: 'var(--bg-muted)', borderBottom: '1px solid var(--border)' }}>
              {(['create', 'join'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => switchTab(t)}
                  className="flex-1 py-3 text-sm font-semibold transition-all duration-200 relative"
                  style={{
                    color: tab === t ? 'var(--brand)' : 'var(--text-muted)',
                    background: tab === t ? 'var(--bg-card)' : 'transparent',
                  }}
                >
                  {t === 'create' ? '创建房间' : '加入房间'}
                  {tab === t && (
                    <span className="absolute bottom-0 left-6 right-6 h-0.5 rounded-t-full animate-expand-width" style={{ background: 'var(--brand)' }} />
                  )}
                </button>
              ))}
            </div>

            <div className="p-5">
              <div key={tab} className={slideDir}>
                {tab === 'create' ? (
                  <form onSubmit={handleCreate} className="space-y-4">
                    {/* Topic */}
                    <div>
                      <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>游戏主题</label>
                      <input
                        className="input"
                        placeholder="例如：中国古代史、丝绸之路..."
                        value={topic}
                        onChange={e => setTopic(e.target.value)}
                        maxLength={50}
                      />
                      <div className="flex flex-wrap gap-1.5 mt-2">
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
                      <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>游戏模式</label>
                      <div className="space-y-1.5">
                        {Object.entries(modes).map(([key, cfg]) => (
                          <label
                            key={key}
                            className={`option-card flex items-start gap-3 p-3 ${mode === key ? 'selected' : ''}`}
                          >
                            <input
                              type="radio"
                              name="mode"
                              value={key}
                              checked={mode === key}
                              onChange={() => {
                                setMode(key);
                                setExtraModes(prev => prev.filter(m => m !== key));
                              }}
                              className="mt-0.5"
                              style={{ accentColor: 'var(--brand)' }}
                            />
                            <div>
                              <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{cfg.label}</div>
                              <div className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{cfg.description}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Extra combinable modes */}
                    {Object.keys(combinableModes).length > 0 && (
                      <div>
                        <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                          叠加玩法
                          <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>（可与主模式组合）</span>
                        </label>
                        <div className="grid grid-cols-2 gap-1.5">
                          {Object.entries(combinableModes).map(([key, cfg]) => {
                            const isPrimary = mode === key;
                            const isChecked = extraModes.includes(key) || isPrimary;
                            return (
                              <label
                                key={key}
                                className={`option-card flex items-start gap-2 p-2.5 cursor-pointer ${isChecked ? 'selected' : ''} ${isPrimary ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={isPrimary}
                                  onChange={() => !isPrimary && toggleExtraMode(key)}
                                  className="mt-0.5 flex-shrink-0"
                                  style={{ accentColor: 'var(--brand)' }}
                                />
                                <div>
                                  <div className="font-semibold text-xs" style={{ color: 'var(--text-primary)' }}>{cfg.label}</div>
                                  <div className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{cfg.description}</div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Active modes summary */}
                    <div className="rounded-lg px-3 py-2 flex items-center gap-2 flex-wrap" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                      <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>当前模式：</span>
                      {modeSummary.map(label => (
                        <span key={label} className="badge-brand">{label}</span>
                      ))}
                      {hasChallengeMode && (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>含奖励结算</span>
                      )}
                    </div>

                    {/* Validation mode */}
                    <div>
                      <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>验证时机</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {([
                          { value: 'realtime', label: '⚡ 实时验证', desc: '每次提交立即验证' },
                          { value: 'deferred', label: '🎯 批量验证', desc: '按需批量验证' },
                        ] as const).map(opt => (
                          <label
                            key={opt.value}
                            className={`option-card flex items-start gap-2 p-2.5 ${validationMode === opt.value ? 'selected' : ''}`}
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
                              <div className="font-semibold text-xs" style={{ color: 'var(--text-primary)' }}>{opt.label}</div>
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
                        className="flex items-center gap-1.5 text-xs font-medium transition-colors"
                        style={{ color: showAdvanced ? 'var(--brand)' : 'var(--text-muted)' }}
                      >
                        <svg className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        高级设置
                      </button>

                      {showAdvanced && (
                        <div className="mt-2.5 space-y-3.5 p-3.5 rounded-lg border animate-slide-down" style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)' }}>
                          {/* Challenge settings */}
                          {showChallengeSettings && (
                            <>
                              <div>
                                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                                  挑战卡换牌阈值
                                  <span className="ml-1 font-normal" style={{ color: 'var(--text-muted)' }}>（每完成几个概念换一张）</span>
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
                                  换题冷却时间
                                  <span className="ml-1 font-normal" style={{ color: 'var(--text-muted)' }}>（0 = 无限制）</span>
                                </label>
                                <div className="grid grid-cols-4 gap-1">
                                  {[0, 10000, 30000, 60000].map(ms => (
                                    <button
                                      key={ms}
                                      type="button"
                                      onClick={() => setSkipCooldownMs(ms)}
                                      className="text-xs py-1.5 rounded-md border font-medium transition-all"
                                      style={{
                                        background: skipCooldownMs === ms ? 'var(--brand-light)' : 'var(--bg-card)',
                                        color: skipCooldownMs === ms ? 'var(--brand)' : 'var(--text-secondary)',
                                        borderColor: skipCooldownMs === ms ? 'color-mix(in srgb, var(--brand) 40%, transparent)' : 'var(--border)',
                                      }}
                                    >
                                      {ms === 0 ? '无限' : ms === 10000 ? '10秒' : ms === 30000 ? '30秒' : '1分'}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}

                          {/* Max players */}
                          <div>
                            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                              最大玩家数
                              <span className="ml-1 font-normal" style={{ color: 'var(--text-muted)' }}>（0 = 不限）</span>
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

                          <div className="pt-2.5 border-t" style={{ borderColor: 'var(--border)' }}>
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>RAG 检索参数</div>
                              <button
                                type="button"
                                onClick={() => setShowRagHelp(true)}
                                className="text-xs px-2 py-0.5 rounded border transition-colors"
                                style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)', background: 'var(--bg-card)' }}
                              >
                                参数说明
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>主题 TopN</label>
                                <input className="input text-sm" type="number" min={1} max={10} value={ragTopicTopNInput}
                                  onChange={e => setRagTopicTopNInput(e.target.value)} />
                              </div>
                              <div>
                                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>概念 TopN</label>
                                <input className="input text-sm" type="number" min={1} max={12} value={ragConceptTopNInput}
                                  onChange={e => setRagConceptTopNInput(e.target.value)} />
                              </div>
                              <div>
                                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>上下文最大字数</label>
                                <input className="input text-sm" type="number" min={200} max={4000} value={ragContextMaxCharsInput}
                                  onChange={e => setRagContextMaxCharsInput(e.target.value)} />
                              </div>
                              <div>
                                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>FTS 候选倍率</label>
                                <input className="input text-sm" type="number" min={1} max={20} value={ragFtsCandidateMultiplierInput}
                                  onChange={e => setRagFtsCandidateMultiplierInput(e.target.value)} />
                              </div>
                              <div>
                                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>FTS 最少候选数</label>
                                <input className="input text-sm" type="number" min={1} max={200} value={ragFtsMinCandidatesInput}
                                  onChange={e => setRagFtsMinCandidatesInput(e.target.value)} />
                              </div>
                              <div>
                                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>拼接分隔</label>
                                <select className="input text-sm" value={ragJoinSeparator} onChange={e => setRagJoinSeparator(e.target.value as 'rule' | 'double_newline')}>
                                  <option value="rule">分隔线（---）</option>
                                  <option value="double_newline">空行</option>
                                </select>
                              </div>
                            </div>
                            <label className="mt-2 inline-flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
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

                    {/* RAG Help Modal */}
                    {showRagHelp && (
                      <div
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        style={{ background: 'rgba(15, 10, 5, 0.6)', backdropFilter: 'blur(4px)' }}
                        onClick={() => setShowRagHelp(false)}
                      >
                        <div
                          className="w-full max-w-lg rounded-xl border p-5 animate-spring-in"
                          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                          onClick={e => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>RAG 参数说明</h3>
                            <button
                              type="button"
                              className="text-xs px-2.5 py-1 rounded border transition-colors"
                              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                              onClick={() => setShowRagHelp(false)}
                            >关闭</button>
                          </div>
                          <div className="space-y-2.5 text-sm max-h-[55vh] overflow-y-auto pr-1" style={{ color: 'var(--text-secondary)' }}>
                            {RAG_PARAM_DOCS.map(item => (
                              <div key={item.name}>
                                <div className="font-semibold text-xs" style={{ color: 'var(--text-primary)' }}>{item.name}</div>
                                <div className="text-xs mt-0.5 leading-relaxed">{item.desc}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {createError && (
                      <div className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2 animate-slide-down">
                        {createError}
                      </div>
                    )}

                    <button type="submit" className="btn-primary w-full py-3 text-base font-heading" disabled={creating}>
                      {creating ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          创建中...
                        </span>
                      ) : '开始游戏 →'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleJoin} className="space-y-5">
                    <div>
                      <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>房间码</label>
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

          {/* Feature cards */}
          <div className="mt-5 grid grid-cols-3 gap-3 animate-fade-in" style={{ animationDelay: '120ms' }}>
            {[
              { icon: '🤖', title: 'AI 智能验证', desc: '精准分类历史概念' },
              { icon: '📅', title: '自动时间轴', desc: '按朝代自动归类' },
              { icon: '🎮', title: '多模式叠加', desc: '自由组合玩法规则' },
            ].map((f, i) => (
              <div
                key={f.title}
                className="rounded-xl p-3 text-center hover-lift animate-fade-in"
                style={{
                  background: 'color-mix(in srgb, var(--bg-card) 90%, transparent)',
                  border: '1px solid var(--border-subtle)',
                  animationDelay: `${150 + i * 60}ms`,
                }}
              >
                <div className="text-xl mb-1">{f.icon}</div>
                <div className="text-xs font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{f.title}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{f.desc}</div>
              </div>
            ))}
          </div>

          <p className="mt-4 text-center text-xs select-none" style={{ color: 'var(--border)' }}>dev 0.3.0</p>
        </div>
      </div>
    </div>
  );
}
