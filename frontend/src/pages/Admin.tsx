import { useState, useEffect, useCallback } from 'react';

/** Debounce a value by `delay` ms. */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debouncedValue;
}
import { useNavigate } from 'react-router-dom';
import {
  setAdminKey, getAdminKey,
  adminGetStats, adminListAIConfigs, adminCreateAIConfig, adminUpdateAIConfig,
  adminActivateAIConfig, adminTestAIConfig, adminDeleteAIConfig,
  adminListDocs, adminUploadDoc, adminAddTextDoc, adminDeleteDoc,
  adminListGames, adminFinishGame, adminDeleteGame,
  adminUpdateGameNotes, adminUpdateGameSettings, adminUpdateGameModes, adminRestoreGame,
  adminGetLogs, getGameModes,
  adminListAIConfirmed, adminDeleteAIConfirmed, adminClearAIConfirmed,
  adminGetCurationPending, adminGetCurationActive,
  adminApproveConcept, adminApproveAll, adminArchiveConcept, adminRejectConcept,
  adminEditConcept, adminMergeConcepts,
  adminListCategories, adminCreateCategory, adminDeleteCategory, adminCategorizeConcept,
  adminGetAIDecisions, adminGetAIDecision,
  type AIConfig, type KnowledgeDoc, type AdminGame, type LogEntry, type AIConfirmedDoc,
  type CurationConcept, type Category, type AIDecision,
} from '../services/api';
import type { Game, GameModeConfig } from '../types';

// ── Login screen ──────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [key, setKey] = useState('');
  const [err, setErr] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setAdminKey(key);
    try {
      await adminGetStats();
      onLogin();
    } catch {
      setErr('密钥错误，请重试');
    }
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
      <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 w-full max-w-sm border border-white/20 shadow-2xl">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">⚙️</div>
          <h1 className="text-2xl font-bold text-white">后台管理</h1>
          <p className="text-slate-400 text-sm mt-1">History-Loong Admin</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <input
            type="password"
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            placeholder="管理员密钥"
            value={key}
            onChange={e => setKey(e.target.value)}
            autoFocus
          />
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <button className="w-full py-3 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-xl transition-colors">
            登录
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Sidebar navigation ────────────────────────────────────────────────────────

type Tab = 'overview' | 'games' | 'ai-config' | 'knowledge' | 'ai-confirmed' | 'curation' | 'ai-decisions' | 'logs';

const NAV_ITEMS: { id: Tab; icon: string; label: string }[] = [
  { id: 'overview',      icon: '📊', label: '概览' },
  { id: 'games',         icon: '🎮', label: '游戏管理' },
  { id: 'ai-config',     icon: '🤖', label: 'AI 配置' },
  { id: 'knowledge',     icon: '📚', label: '知识库' },
  { id: 'ai-confirmed',  icon: '✅', label: 'AI 确认知识库' },
  { id: 'curation',      icon: '🎯', label: '知识策展' },
  { id: 'ai-decisions',  icon: '🔬', label: 'AI 完整回复' },
  { id: 'logs',          icon: '🔍', label: '服务器日志' },
];

// ── Main Admin shell ──────────────────────────────────────────────────────────

export default function Admin() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    if (getAdminKey()) {
      adminGetStats().then(() => setAuthed(true)).catch(() => {});
    }
  }, []);

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;

  return (
    <div className="min-h-screen flex bg-slate-100">
      {/* Sidebar */}
      <aside className="w-56 bg-slate-900 flex flex-col shadow-xl flex-shrink-0">
        <div className="p-5 border-b border-slate-700">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 text-white hover:text-indigo-300 transition-colors">
            <span className="text-2xl">🐉</span>
            <div>
              <div className="font-bold text-sm">历史接龙</div>
              <div className="text-xs text-slate-400">后台管理</div>
            </div>
          </button>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${tab === item.id
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-700 space-y-2">
          <button
            onClick={() => { setAdminKey(''); setAuthed(false); }}
            className="w-full text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            退出登录
          </button>
          <p className="text-center text-xs text-slate-600 select-none">dev0.3.0</p>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto p-6">
          {tab === 'overview'     && <OverviewPanel onNavigate={setTab} />}
          {tab === 'games'        && <GamesPanel />}
          {tab === 'ai-config'    && <AIConfigPanel />}
          {tab === 'knowledge'    && <KnowledgePanel />}
          {tab === 'ai-confirmed' && <AIConfirmedPanel onNavigateCuration={() => setTab('curation')} />}
          {tab === 'curation'      && <CurationPanel />}
          {tab === 'ai-decisions'  && <AIDecisionsPanel />}
          {tab === 'logs'          && <LogsPanel />}
        </div>
      </main>
    </div>
  );
}

// ── Panel: Overview ───────────────────────────────────────────────────────────

function OverviewPanel({ onNavigate }: { onNavigate?: (tab: Tab) => void }) {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [games, setGames] = useState<Game[]>([]);

  useEffect(() => {
    adminGetStats().then(d => { setStats(d.stats); setGames(d.recentGames); }).catch(() => {});
  }, []);

  const STAT_CARDS = [
    { key: 'total_games',       label: '总游戏数',     icon: '🎮', color: 'bg-indigo-50 text-indigo-600',  nav: undefined },
    { key: 'active_games',      label: '进行中',       icon: '▶️', color: 'bg-green-50 text-green-600',   nav: 'games' as Tab },
    { key: 'total_concepts',    label: '有效概念',     icon: '📌', color: 'bg-emerald-50 text-emerald-600', nav: undefined },
    { key: 'total_players',     label: '历史玩家',     icon: '👥', color: 'bg-sky-50 text-sky-600',       nav: undefined },
    { key: 'total_docs',        label: '知识库文档',   icon: '📄', color: 'bg-amber-50 text-amber-600',   nav: 'knowledge' as Tab },
    { key: 'total_kb_active',   label: 'KB 已审概念',  icon: '✅', color: 'bg-teal-50 text-teal-600',     nav: 'curation' as Tab },
    { key: 'pending_curation',  label: '待策展',       icon: '🎯', color: 'bg-orange-50 text-orange-600', nav: 'curation' as Tab },
    { key: 'total_ai_configs',  label: 'AI 配置',      icon: '🤖', color: 'bg-purple-50 text-purple-600', nav: 'ai-config' as Tab },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="概览" subtitle="系统运行状态一览" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {STAT_CARDS.map(c => (
          <div
            key={c.key}
            onClick={() => c.nav && onNavigate?.(c.nav)}
            className={`bg-white rounded-2xl p-5 shadow-sm border border-slate-100 transition-all
              ${c.nav ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''}
              ${c.key === 'pending_curation' && (stats[c.key] ?? 0) > 0 ? 'ring-2 ring-orange-200' : ''}`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3 ${c.color}`}>
              {c.icon}
            </div>
            <div className="text-3xl font-bold text-slate-800">{stats[c.key] ?? '–'}</div>
            <div className="text-sm text-slate-500 mt-1">{c.label}</div>
            {c.key === 'pending_curation' && (stats[c.key] ?? 0) > 0 && (
              <div className="text-xs text-orange-500 mt-1 font-medium">点击前往策展 →</div>
            )}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">最近游戏</h3>
        </div>
        {games.length === 0 ? (
          <div className="p-8 text-center text-slate-400">暂无游戏记录</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                {['房间码', '主题', '模式', '状态', '创建时间'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {games.map(g => (
                <tr key={g.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-indigo-600 font-medium">{g.id}</td>
                  <td className="px-4 py-3 text-slate-700">{g.topic}</td>
                  <td className="px-4 py-3">
                    <ModeChip mode={g.mode} extraModes={Array.isArray(g.settings?.extraModes) ? g.settings.extraModes as string[] : []} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip status={g.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-400">{g.created_at.slice(0, 16).replace('T', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ModeChip({ mode, extraModes = [] }: { mode: string; extraModes?: string[] }) {
  const map: Record<string, string> = {
    free: '自由',
    chain: '关联',
    ordered: '时序',
    relay: '接力',
    'turn-order': '轮流',
    'score-race': '积分',
    challenge: '挑战',
  };
  const modes = [mode, ...extraModes.filter(m => m !== mode)];
  return (
    <div className="flex flex-wrap gap-1">
      {modes.map((item, idx) => (
        <span key={`${item}-${idx}`} className={`px-2 py-0.5 text-xs rounded ${idx === 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
          {map[item] || item}
        </span>
      ))}
    </div>
  );
}
function StatusChip({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    waiting:  'bg-yellow-100 text-yellow-700',
    playing:  'bg-green-100 text-green-700',
    finished: 'bg-slate-100 text-slate-500',
  };
  const labels: Record<string, string> = { waiting: '等待中', playing: '进行中', finished: '已结束' };
  return <span className={`px-2 py-0.5 text-xs rounded ${cfg[status] || 'bg-slate-100 text-slate-500'}`}>{labels[status] || status}</span>;
}

function normalizeExtraModes(primaryMode: string, extraModes: string[]) {
  return [...new Set(extraModes.filter(Boolean))].filter(mode => mode !== primaryMode);
}

// ── Panel: Games Management ──────────────────────────────────────────────────

function GameRow({ game, onAction }: { game: AdminGame; onAction: (msg: string) => void }) {
  const [expanded,    setExpanded]    = useState(false);
  const [notes,       setNotes]       = useState((game as AdminGame & { notes?: string }).notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [settingsStr, setSettingsStr] = useState(JSON.stringify(game.settings, null, 2));
  const [savingSettings, setSavingSettings] = useState(false);
  const [modeDraft, setModeDraft] = useState(game.mode);
  const [extraModeDraft, setExtraModeDraft] = useState<string[]>(
    normalizeExtraModes(game.mode, Array.isArray(game.settings?.extraModes) ? game.settings.extraModes as string[] : [])
  );
  const [savingModes, setSavingModes] = useState(false);
  const [modeOptions, setModeOptions] = useState<Record<string, GameModeConfig>>({});
  const [combinableModeOptions, setCombinableModeOptions] = useState<Record<string, GameModeConfig>>({});
  const normalizedExtraModeDraft = normalizeExtraModes(modeDraft, extraModeDraft);
  const modePreview = [modeDraft, ...normalizedExtraModeDraft].map(key => ({
    key,
    label: modeOptions[key]?.label || combinableModeOptions[key]?.label || key,
  }));

  useEffect(() => {
    if (!expanded) return;
    getGameModes()
      .then(data => {
        setModeOptions(data.modes || {});
        setCombinableModeOptions(data.combinableModes || {});
      })
      .catch(() => {});
  }, [expanded]);

  async function saveNotes() {
    setSavingNotes(true);
    try {
      await adminUpdateGameNotes(game.id, notes);
      onAction(`备注已保存`);
    } catch { onAction('保存备注失败'); }
    setSavingNotes(false);
  }

  async function saveSettings() {
    setSavingSettings(true);
    try {
      const parsed = JSON.parse(settingsStr);
      await adminUpdateGameSettings(game.id, parsed);
      onAction('设置已更新');
    } catch (err) {
      onAction(err instanceof SyntaxError ? 'JSON 格式有误' : '更新失败');
    }
    setSavingSettings(false);
  }

  async function saveModes() {
    setSavingModes(true);
    try {
      const normalizedExtraModes = normalizeExtraModes(modeDraft, extraModeDraft);
      await adminUpdateGameModes(game.id, modeDraft, normalizedExtraModes);
      setExtraModeDraft(normalizedExtraModes);
      const parsedSettings = JSON.parse(settingsStr || '{}');
      parsedSettings.extraModes = normalizedExtraModes;
      setSettingsStr(JSON.stringify(parsedSettings, null, 2));
      onAction('游戏模式已更新');
    } catch {
      onAction('更新游戏模式失败');
    }
    setSavingModes(false);
  }

  async function handleFinish() {
    if (!confirm(`确认结束游戏「${game.topic}」(${game.id})？`)) return;
    try { await adminFinishGame(game.id); onAction(`游戏 ${game.id} 已结束`); }
    catch { onAction('操作失败'); }
  }

  async function handleRestore() {
    if (!confirm(`确认恢复游戏「${game.topic}」(${game.id})为进行中状态？`)) return;
    try { await adminRestoreGame(game.id); onAction(`游戏 ${game.id} 已恢复`); }
    catch { onAction('恢复失败'); }
  }

  async function handleDelete() {
    if (!confirm(`确认删除游戏「${game.topic}」(${game.id})？\n此操作不可撤销。`)) return;
    try { await adminDeleteGame(game.id); onAction(`游戏 ${game.id} 已删除`); }
    catch { onAction('删除失败'); }
  }

  return (
    <>
      <tr className="hover:bg-slate-50 transition-colors">
        <td className="px-4 py-3 font-mono text-indigo-600 font-medium">
          <button onClick={() => setExpanded(e => !e)} className="flex items-center gap-1 hover:underline">
            {game.id}
            <svg className={`w-3 h-3 opacity-40 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
          </button>
        </td>
        <td className="px-4 py-3 text-slate-700 max-w-[180px]">
          <span className="truncate block">{game.topic}</span>
          {(game as AdminGame & { notes?: string }).notes && (
            <span className="text-xs text-amber-600 truncate block">📝 {(game as AdminGame & { notes?: string }).notes}</span>
          )}
        </td>
        <td className="px-4 py-3"><ModeChip mode={game.mode} extraModes={Array.isArray(game.settings?.extraModes) ? game.settings.extraModes as string[] : []} /></td>
        <td className="px-4 py-3"><StatusChip status={game.status} /></td>
        <td className="px-4 py-3 text-slate-600">
          <span className="font-medium">{game.conceptCount}</span>
          {game.pendingCount > 0 && <span className="text-amber-500 ml-1">+{game.pendingCount}⏳</span>}
        </td>
        <td className="px-4 py-3 text-slate-600">
          <span className={`font-medium ${game.onlineCount > 0 ? 'text-green-600' : 'text-slate-400'}`}>{game.onlineCount}</span>
          <span className="text-slate-300 mx-1">/</span>
          <span className="text-slate-500">{game.playerCount}</span>
        </td>
        <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{game.created_at.slice(0, 16).replace('T', ' ')}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1 flex-wrap">
            <button onClick={() => setExpanded(e => !e)}
              className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors">
              详情
            </button>
            <a
              href={`/game/${game.id}?adminKey=${encodeURIComponent(localStorage.getItem('admin_key') || 'admin')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-2 py-1 bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100 transition-colors border border-yellow-200"
              title="以管理员观察模式进入游戏（不会占用玩家名额，拥有编辑权限）">
              👑 观察
            </a>
            {game.status !== 'finished'
              ? <button onClick={handleFinish} className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors">结束</button>
              : <button onClick={handleRestore} className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors">恢复</button>
            }
            <button onClick={handleDelete} className="text-xs px-2 py-1 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors">删除</button>
          </div>
        </td>
      </tr>

      {/* Expanded detail row */}
      {expanded && (
        <tr>
          <td colSpan={8} className="bg-slate-50 border-b border-slate-100 px-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">📝 管理备注</label>
                <textarea
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  rows={3}
                  placeholder="记录备注信息（最多 500 字）..."
                  maxLength={500}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
                <button onClick={saveNotes} disabled={savingNotes}
                  className="mt-1.5 text-xs px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors font-medium">
                  {savingNotes ? '保存中...' : '保存备注'}
                </button>
              </div>
              {/* Mode editor */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">🎮 游戏模式</label>
                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                  <div>
                    <div className="text-xs text-slate-500 mb-1.5">主模式</div>
                    <select
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      value={modeDraft}
                      onChange={e => {
                        const nextMode = e.target.value;
                        setModeDraft(nextMode);
                        setExtraModeDraft(prev => prev.filter(m => m !== nextMode));
                      }}
                    >
                      {Object.entries(modeOptions).map(([key, cfg]) => (
                        <option key={key} value={key}>{cfg.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500 mb-1.5">附加模式</div>
                    <div className="space-y-2 max-h-40 overflow-auto pr-1">
                      {Object.entries(combinableModeOptions).map(([key, cfg]) => {
                        const checked = normalizedExtraModeDraft.includes(key);
                        const disabled = key === modeDraft;
                        return (
                          <label key={key} className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${checked ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200 bg-slate-50'} ${disabled ? 'opacity-50' : ''}`}>
                            <input
                              type="checkbox"
                              checked={checked || disabled}
                              disabled={disabled}
                              onChange={() => {
                                if (disabled) return;
                                setExtraModeDraft(prev =>
                                  normalizeExtraModes(modeDraft, prev.includes(key) ? prev.filter(m => m !== key) : [...prev, key])
                                );
                              }}
                              className="mt-0.5"
                            />
                            <div>
                              <div className="text-sm font-medium text-slate-700">{cfg.label}</div>
                              <div className="text-xs text-slate-500 mt-0.5">{cfg.description}</div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-xs text-slate-500 mb-2">当前生效模式</div>
                    <div className="flex flex-wrap gap-1.5">
                      {modePreview.map((item, idx) => (
                        <span
                          key={`${item.key}-${idx}`}
                          className={`px-2 py-0.5 text-xs rounded-full ${idx === 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-slate-600 border border-slate-200'}`}
                        >
                          {item.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button onClick={saveModes} disabled={savingModes}
                    className="text-xs px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors font-medium">
                    {savingModes ? '更新中...' : '保存模式'}
                  </button>
                </div>
              </div>
              {/* Settings */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">⚙️ 游戏设置 (JSON)</label>
                <textarea
                  className="w-full text-xs font-mono border border-slate-200 rounded-xl px-3 py-2 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  rows={3}
                  value={settingsStr}
                  onChange={e => setSettingsStr(e.target.value)}
                />
                <button onClick={saveSettings} disabled={savingSettings}
                  className="mt-1.5 text-xs px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors font-medium">
                  {savingSettings ? '更新中...' : '更新设置'}
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function GamesPanel() {
  const [games, setGames]               = useState<AdminGame[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchRaw, setSearchRaw]       = useState('');
  const search = useDebounce(searchRaw, 250);
  const [loading, setLoading]           = useState(false);
  const [actionMsg, setActionMsg]       = useState('');

  const reload = useCallback(() => {
    setLoading(true);
    adminListGames(statusFilter || undefined)
      .then(setGames)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => { reload(); }, [reload]);

  // Client-side text filter (debounced)
  const filteredGames = search
    ? games.filter(g =>
        g.id.toLowerCase().includes(search.toLowerCase()) ||
        g.topic.toLowerCase().includes(search.toLowerCase())
      )
    : games;

  function showMsg(msg: string) {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(''), 3000);
    // Reload after a tiny delay so DB writes settle
    setTimeout(() => reload(), 400);
  }

  return (
    <div className="space-y-5">
      <PageHeader title="游戏管理" subtitle="查看、管理游戏房间；支持备注、恢复意外结束的游戏" />

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-slate-600 font-medium shrink-0">状态：</span>
          {[
            { value: '', label: '全部' },
            { value: 'waiting', label: '等待中' },
            { value: 'playing', label: '进行中' },
            { value: 'finished', label: '已结束' },
          ].map(opt => (
            <button key={opt.value} onClick={() => setStatusFilter(opt.value)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors font-medium
                ${statusFilter === opt.value
                  ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <input
            className="text-sm border border-slate-200 rounded-xl px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 w-44"
            placeholder="搜索房间码 / 主题..."
            value={searchRaw}
            onChange={e => setSearchRaw(e.target.value)}
          />
          <button onClick={reload} disabled={loading} className="btn-secondary text-xs py-1.5 shrink-0">
            {loading ? '加载中...' : '刷新'}
          </button>
        </div>
      </div>

      {actionMsg && (
        <div className={`text-sm px-4 py-2.5 rounded-xl border animate-slide-down ${
          actionMsg.includes('失败') || actionMsg.includes('有误')
            ? 'bg-red-50 text-red-600 border-red-100'
            : 'bg-green-50 text-green-600 border-green-100'
        }`}>{actionMsg}</div>
      )}

      {filteredGames.length === 0 ? (
        <EmptyState icon="🎮" title="暂无游戏" desc={statusFilter || search ? '当前筛选条件下没有游戏' : '还没有创建过任何游戏'} />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800">
              游戏列表 <span className="text-slate-400 font-normal text-sm">
                ({filteredGames.length}{filteredGames.length !== games.length ? ` / ${games.length}` : ''})
              </span>
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  {['房间码', '主题/备注', '模式', '状态', '概念数', '在线/总', '创建时间', '操作'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredGames.map(g => <GameRow key={g.id} game={g} onAction={showMsg} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <InfoBox>
        <strong>操作说明：</strong>
        <ul className="mt-1 space-y-0.5 list-disc list-inside">
          <li>点击<strong>房间码</strong>展开详情，可编辑备注和游戏设置</li>
          <li><strong>结束</strong> — 标记为已结束并通知在线玩家</li>
          <li><strong>恢复</strong> — 将已结束的游戏恢复为进行中，玩家可继续提交</li>
          <li><strong>删除</strong> — 永久删除所有相关数据，不可恢复</li>
        </ul>
      </InfoBox>
    </div>
  );
}

// ── Panel: AI Config ──────────────────────────────────────────────────────────

const SECRET_MASK = '••••••••';

function readKnowledgeExtra(extra: Record<string, unknown> | null | undefined) {
  return {
    provider: typeof extra?.kb_provider === 'string' ? extra.kb_provider : 'siliconflow',
    enabled: Boolean(extra?.kb_enabled),
    apiKey: typeof extra?.kb_api_key === 'string' ? extra.kb_api_key : '',
    baseUrl: typeof extra?.kb_base_url === 'string' ? extra.kb_base_url : '',
    embeddingModel: typeof extra?.kb_embedding_model === 'string' ? extra.kb_embedding_model : '',
    rerankModel: typeof extra?.kb_rerank_model === 'string' ? extra.kb_rerank_model : '',
    rerankInstruction: typeof extra?.kb_rerank_instruction === 'string' ? extra.kb_rerank_instruction : '',
  };
}

function writeKnowledgeExtra(
  existingExtra: Record<string, unknown>,
  next: {
    enabled: boolean;
    apiKey: string;
    baseUrl: string;
    embeddingModel: string;
    rerankModel: string;
    rerankInstruction: string;
  },
  preservedApiKey = ''
) {
  const merged = { ...existingExtra };

  delete merged.kb_provider;
  delete merged.kb_enabled;
  delete merged.kb_api_key;
  delete merged.kb_base_url;
  delete merged.kb_embedding_model;
  delete merged.kb_rerank_model;
  delete merged.kb_rerank_instruction;

  const apiKey = next.apiKey === SECRET_MASK ? preservedApiKey : next.apiKey.trim();
  const baseUrl = next.baseUrl.trim().replace(/\/$/, '');
  const embeddingModel = next.embeddingModel.trim();
  const rerankModel = next.rerankModel.trim();
  const rerankInstruction = next.rerankInstruction.trim();

  const hasAnyValue = Boolean(apiKey || baseUrl || embeddingModel || rerankModel || rerankInstruction || next.enabled);
  if (!hasAnyValue) return merged;

  merged.kb_provider = 'siliconflow';
  merged.kb_enabled = next.enabled;
  if (apiKey) merged.kb_api_key = apiKey;
  if (baseUrl) merged.kb_base_url = baseUrl;
  if (embeddingModel) merged.kb_embedding_model = embeddingModel;
  if (rerankModel) merged.kb_rerank_model = rerankModel;
  if (rerankInstruction) merged.kb_rerank_instruction = rerankInstruction;

  return merged;
}

function AIConfigPanel() {
  const [configs, setConfigs] = useState<AIConfig[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AIConfig | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  const reload = useCallback(() => adminListAIConfigs().then(setConfigs).catch(() => {}), []);
  useEffect(() => { reload(); }, [reload]);

  async function handleActivate(id: string) {
    await adminActivateAIConfig(id);
    reload();
  }

  async function handleDelete(id: string) {
    if (!confirm('确认删除该配置？')) return;
    await adminDeleteAIConfig(id);
    reload();
  }

  async function handleTest(cfg: AIConfig) {
    setTesting(cfg.id);
    setTestResult(prev => ({ ...prev, [cfg.id]: '测试中...' }));
    try {
      const res = await adminTestAIConfig(cfg.id);
      setTestResult(prev => ({ ...prev, [cfg.id]: res.ok ? `✅ ${res.reply}` : `❌ ${res.error}` }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '未知错误';
      setTestResult(prev => ({ ...prev, [cfg.id]: `❌ ${msg}` }));
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI 配置"
        subtitle="管理 AI 接口，支持 Anthropic Claude、OpenAI 兼容接口、Google Gemini 及智谱 GLM"
        action={<button className="btn-primary text-sm" onClick={() => { setEditing(null); setShowForm(true); }}>+ 添加配置</button>}
      />

      {(showForm || editing) && (
        <AIConfigForm
          initial={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); reload(); }}
        />
      )}

      {configs.length === 0 ? (
        <EmptyState icon="🤖" title="暂无 AI 配置" desc="点击「添加配置」接入 Claude、DeepSeek、Qwen、本地 Ollama 等任意接口" />
      ) : (
        <div className="space-y-3">
          {configs.map(cfg => {
            const knowledge = readKnowledgeExtra(cfg.extra);
            return (
              <div
                key={cfg.id}
                className={`bg-white rounded-2xl border shadow-sm p-5 transition-all
                  ${cfg.is_active ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-slate-100'}`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl
                      ${cfg.provider_type === 'anthropic' ? 'bg-orange-50' : cfg.provider_type === 'google' ? 'bg-blue-50' : cfg.provider_type === 'glm' ? 'bg-cyan-50' : 'bg-indigo-50'}`}>
                      {cfg.provider_type === 'anthropic' ? '🔶' : cfg.provider_type === 'google' ? '🌐' : cfg.provider_type === 'glm' ? '💙' : '🔷'}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-800 flex items-center gap-2 flex-wrap">
                        {cfg.name}
                        {cfg.is_active === 1 && (
                          <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-normal">当前使用</span>
                        )}
                        {(cfg as AIConfig & { system_prompt?: string }).system_prompt && (
                          <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full font-normal border border-purple-100">自定义提示词</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {cfg.provider_type === 'anthropic' ? 'Anthropic Claude' : cfg.provider_type === 'google' ? 'Google AI Studio' : cfg.provider_type === 'glm' ? '智谱AI (BigModel)' : cfg.base_url}
                        <span className="ml-2 font-mono">{cfg.model}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => handleTest(cfg)}
                      disabled={testing === cfg.id}
                      className="btn-secondary text-xs py-1.5"
                    >
                      {testing === cfg.id ? '测试中...' : '测试连接'}
                    </button>
                    {cfg.is_active !== 1 && (
                      <button onClick={() => handleActivate(cfg.id)} className="btn-secondary text-xs py-1.5 text-indigo-600">
                        设为当前
                      </button>
                    )}
                    <button onClick={() => { setEditing(cfg); setShowForm(false); }} className="btn-secondary text-xs py-1.5">
                      编辑
                    </button>
                    <button onClick={() => handleDelete(cfg.id)} className="btn-secondary text-xs py-1.5 text-red-500">
                      删除
                    </button>
                  </div>
                </div>

                {(knowledge.enabled || knowledge.embeddingModel || knowledge.rerankModel) && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${knowledge.enabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                      知识库增强{knowledge.enabled ? '已启用' : '已配置'}
                    </span>
                    {knowledge.embeddingModel && (
                      <span className="text-xs px-2 py-0.5 rounded-full border bg-cyan-50 text-cyan-700 border-cyan-200">
                        Embedding: <span className="font-mono">{knowledge.embeddingModel}</span>
                      </span>
                    )}
                    {knowledge.rerankModel && (
                      <span className="text-xs px-2 py-0.5 rounded-full border bg-violet-50 text-violet-700 border-violet-200">
                        Rerank: <span className="font-mono">{knowledge.rerankModel}</span>
                      </span>
                    )}
                  </div>
                )}

                {testResult[cfg.id] && (
                  <div className={`mt-3 text-xs px-3 py-2 rounded-lg
                    ${testResult[cfg.id].startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                    {testResult[cfg.id]}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <InfoBox>
        <strong>支持的接口类型：</strong>
        <ul className="mt-1 space-y-0.5 list-disc list-inside">
          <li><strong>Anthropic</strong> — 填入 API Key，选择 claude-* 模型</li>
          <li><strong>OpenAI Compatible</strong> — 填入 Base URL + API Key，支持 OpenAI、DeepSeek、Qwen、月之暗面、本地 Ollama 等所有兼容接口</li>
          <li><strong>Google AI Studio</strong> — 填入 Google AI Studio API Key，模型填 <code>gemini-2.0-flash</code></li>
          <li><strong>智谱AI (GLM)</strong> — 填入 BigModel API Key，模型推荐 <code>glm-4.5-flash</code>，可分别配置 API 主机和路径</li>
          <li><strong>知识库增强检索</strong> — 可为当前 AI 配置单独填写 SiliconFlow 的嵌入模型与重排序模型，服务端会优先读取后台配置，环境变量作为兜底</li>
          <li>可为每个配置设置<strong>自定义提示词</strong>，调整验证风格和严格程度</li>
        </ul>
      </InfoBox>
    </div>
  );
}

/** Split a GLM base_url into [host, path]. E.g. "https://host/v4/chat/completions" → ["https://host/v4", "/chat/completions"] */
function splitGlmUrl(url: string): [string, string] {
  const pathIdx = url.indexOf('/chat/completions');
  if (pathIdx !== -1) return [url.slice(0, pathIdx), url.slice(pathIdx)];
  // Try other common path patterns
  const altIdx = url.indexOf('/v1/');
  if (altIdx !== -1) {
    const parts = url.split('/v1/');
    return [`${parts[0]}/v1`, `/${parts.slice(1).join('/v1/')}`];
  }
  return [url, '/chat/completions'];
}

function AIConfigForm({ initial, onClose, onSaved }: {
  initial: AIConfig | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  // For GLM, split the stored base_url into host + api_path for the UI
  const initialGlmHost = initial?.provider_type === 'glm' && initial.base_url
    ? splitGlmUrl(initial.base_url)[0]
    : 'https://open.bigmodel.cn/api/paas/v4';
  const initialGlmPath = initial?.provider_type === 'glm' && initial.base_url
    ? splitGlmUrl(initial.base_url)[1]
    : '/chat/completions';
  const initialKnowledge = readKnowledgeExtra(initial?.extra);

  const [form, setForm] = useState({
    name:          initial?.name          ?? '',
    provider_type: initial?.provider_type ?? 'openai-compatible',
    base_url:      (initial?.provider_type === 'glm' ? initialGlmHost : initial?.base_url) ?? '',
    api_key:       initial ? SECRET_MASK : '',
    model:         initial?.model         ?? '',
    system_prompt: (initial as (AIConfig & { system_prompt?: string }) | null)?.system_prompt ?? '',
  });
  const [knowledge, setKnowledge] = useState({
    enabled: initialKnowledge.enabled,
    apiKey: initialKnowledge.apiKey ? SECRET_MASK : '',
    baseUrl: initialKnowledge.baseUrl,
    embeddingModel: initialKnowledge.embeddingModel,
    rerankModel: initialKnowledge.rerankModel,
    rerankInstruction: initialKnowledge.rerankInstruction,
  });
  const [glmApiPath, setGlmApiPath] = useState(initialGlmPath);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);

  function update(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }
  function updateKnowledge<K extends keyof typeof knowledge>(key: K, value: typeof knowledge[K]) {
    setKnowledge(prev => ({ ...prev, [key]: value }));
  }

  const PRESETS: { label: string; base_url: string; model: string }[] = [
    { label: 'OpenAI',    base_url: 'https://api.openai.com/v1',         model: 'gpt-4o' },
    { label: 'DeepSeek',  base_url: 'https://api.deepseek.com/v1',       model: 'deepseek-chat' },
    { label: 'Qwen',      base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-max' },
    { label: 'Moonshot',  base_url: 'https://api.moonshot.cn/v1',        model: 'moonshot-v1-8k' },
    { label: 'Ollama',    base_url: 'http://localhost:11434/v1',          model: 'llama3' },
    { label: 'GLM',       base_url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.5-flash' },
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr('');
    try {
      // For GLM, combine host + path into base_url
      const effectiveBaseUrl = form.provider_type === 'glm'
        ? `${form.base_url.replace(/\/$/, '')}${glmApiPath.startsWith('/') ? glmApiPath : `/${glmApiPath}`}`
        : form.base_url;
      const knowledgeApiKey = knowledge.apiKey === SECRET_MASK ? initialKnowledge.apiKey : knowledge.apiKey.trim();
      if (knowledge.enabled && !knowledgeApiKey) {
        throw new Error('启用知识库增强时，请填写 SiliconFlow API Key');
      }
      if (knowledge.enabled && !knowledge.embeddingModel.trim() && !knowledge.rerankModel.trim()) {
        throw new Error('启用知识库增强时，至少填写一个嵌入模型或重排序模型');
      }

      const payload: Partial<AIConfig> & { system_prompt?: string } = {
        ...form,
        base_url: effectiveBaseUrl,
        system_prompt: form.system_prompt || undefined,
        extra: writeKnowledgeExtra(initial?.extra || {}, knowledge, initialKnowledge.apiKey),
      };
      if (initial) {
        if (form.api_key === SECRET_MASK) delete payload.api_key;
        await adminUpdateAIConfig(initial.id, payload);
      } else {
        await adminCreateAIConfig({ ...payload, extra: (payload.extra || {}) } as Omit<AIConfig, 'id' | 'is_active' | 'created_at'>);
      }
      onSaved();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  // All providers support custom base_url (for proxy/self-hosted scenarios)
  const needsBaseUrl = form.provider_type === 'openai-compatible';
  const supportsCustomUrl = ['anthropic', 'google', 'glm'].includes(form.provider_type);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h3 className="font-semibold text-slate-800 mb-4">{initial ? '编辑配置' : '添加 AI 配置'}</h3>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="名称">
            <input className="input" placeholder="我的Claude配置" value={form.name} onChange={e => update('name', e.target.value)} required />
          </FormField>
          <FormField label="提供商类型">
            <select className="input" value={form.provider_type} onChange={e => update('provider_type', e.target.value)}>
              <option value="openai-compatible">OpenAI Compatible（通用）</option>
              <option value="anthropic">Anthropic Claude（原生）</option>
              <option value="google">Google AI Studio（Gemini）</option>
              <option value="glm">智谱AI（BigModel）</option>
            </select>
          </FormField>
        </div>

        {/* OpenAI-compatible: full base_url field with presets */}
        {needsBaseUrl && (
          <FormField label="Base URL（API 地址）">
            <div className="space-y-2">
              <input className="input font-mono text-sm" placeholder="https://api.openai.com/v1" value={form.base_url} onChange={e => update('base_url', e.target.value)} required />
              <div className="flex flex-wrap gap-1">
                {PRESETS.filter(p => p.label !== 'GLM').map(p => (
                  <button key={p.label} type="button" onClick={() => setForm(f => ({ ...f, base_url: p.base_url, model: p.model }))}
                    className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full hover:bg-indigo-100 hover:text-indigo-700 transition-colors">
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </FormField>
        )}

        {/* GLM: host + path fields */}
        {form.provider_type === 'glm' && (
          <div className="space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FormField label="API 主机（Base URL）">
                <input
                  className="input font-mono text-sm"
                  placeholder="https://open.bigmodel.cn/api/paas/v4"
                  value={form.base_url}
                  onChange={e => update('base_url', e.target.value)}
                />
              </FormField>
              <FormField label="API 路径">
                <input
                  className="input font-mono text-sm"
                  placeholder="/chat/completions"
                  value={glmApiPath}
                  onChange={e => setGlmApiPath(e.target.value)}
                />
              </FormField>
            </div>
            <p className="text-xs text-slate-400 font-mono px-1">
              完整地址：{form.base_url.replace(/\/$/, '')}{glmApiPath.startsWith('/') ? glmApiPath : `/${glmApiPath}`}
            </p>
            <div className="flex flex-wrap gap-1">
              <button type="button"
                onClick={() => { setForm(f => ({ ...f, base_url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.5-flash' })); setGlmApiPath('/chat/completions'); }}
                className="text-xs px-2 py-0.5 bg-cyan-50 text-cyan-700 rounded-full border border-cyan-200 hover:bg-cyan-100 transition-colors">
                BigModel 默认
              </button>
            </div>
          </div>
        )}

        {/* Anthropic / Google: optional custom base_url (for proxy) */}
        {supportsCustomUrl && form.provider_type !== 'glm' && (
          <FormField label={`自定义 API 地址（可选，默认官方地址）`}>
            <input
              className="input font-mono text-sm"
              placeholder={form.provider_type === 'anthropic' ? 'https://api.anthropic.com (留空使用官方)' : 'https://generativelanguage.googleapis.com/v1beta (留空使用官方)'}
              value={form.base_url}
              onChange={e => update('base_url', e.target.value)}
            />
            <p className="text-xs text-slate-400 mt-1">可填入代理地址，用于中转 API 请求</p>
          </FormField>
        )}

        {form.provider_type === 'google' && (
          <div className="text-xs text-slate-500 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
            💡 Google AI Studio：填入 Google AI Studio 的 API Key，模型填写 <code>gemini-2.0-flash</code> 或 <code>gemini-1.5-pro</code>。支持自定义代理地址。
          </div>
        )}

        {form.provider_type === 'anthropic' && (
          <div className="text-xs text-slate-500 bg-purple-50 border border-purple-100 rounded-xl px-3 py-2">
            💡 Anthropic Claude：填入 Anthropic API Key，模型填写 <code>claude-sonnet-4-6</code> 或 <code>claude-opus-4-6</code>。支持自定义代理地址。
          </div>
        )}

        {form.provider_type === 'glm' && (
          <div className="text-xs text-slate-500 bg-cyan-50 border border-cyan-100 rounded-xl px-3 py-2">
            💡 智谱AI (GLM)：填入 BigModel API Key，模型推荐 <code>glm-4.5-flash</code>。API 主机 + 路径共同构成完整请求地址，支持自定义路径。
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="API Key">
            <input className="input font-mono text-sm" type="password" placeholder="sk-... / AIza..." value={form.api_key} onChange={e => update('api_key', e.target.value)} required={!initial} />
          </FormField>
          <FormField label="模型名称">
            <input className="input font-mono text-sm" placeholder={
              form.provider_type === 'google' ? 'gemini-2.0-flash' :
              form.provider_type === 'anthropic' ? 'claude-sonnet-4-6' : 'gpt-4o'
            } value={form.model} onChange={e => update('model', e.target.value)} required />
          </FormField>
        </div>

        <div className="border border-emerald-100 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-semibold text-emerald-800">知识库增强检索（SiliconFlow）</div>
                <p className="text-xs text-emerald-700 mt-0.5">
                  为当前 AI 配置补充独立的嵌入模型与重排序模型。服务端会优先读取这里的配置，环境变量作为兜底。
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm font-medium text-emerald-800">
                <input
                  type="checkbox"
                  checked={knowledge.enabled}
                  onChange={e => updateKnowledge('enabled', e.target.checked)}
                />
                启用增强检索
              </label>
            </div>
          </div>
          <div className="p-4 space-y-4 bg-white">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="SiliconFlow API Key">
                <input
                  className="input font-mono text-sm"
                  type="password"
                  placeholder="sk-sf-..."
                  value={knowledge.apiKey}
                  onChange={e => updateKnowledge('apiKey', e.target.value)}
                />
              </FormField>
              <FormField label="Base URL">
                <input
                  className="input font-mono text-sm"
                  placeholder="https://api.siliconflow.cn/v1"
                  value={knowledge.baseUrl}
                  onChange={e => updateKnowledge('baseUrl', e.target.value)}
                />
              </FormField>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="嵌入模型">
                <input
                  className="input font-mono text-sm"
                  placeholder="例如：BAAI/bge-large-zh-v1.5"
                  value={knowledge.embeddingModel}
                  onChange={e => updateKnowledge('embeddingModel', e.target.value)}
                />
              </FormField>
              <FormField label="重排序模型">
                <input
                  className="input font-mono text-sm"
                  placeholder="例如：BAAI/bge-reranker-v2-m3"
                  value={knowledge.rerankModel}
                  onChange={e => updateKnowledge('rerankModel', e.target.value)}
                />
              </FormField>
            </div>

            <FormField label="重排序指令（可选）">
              <textarea
                className="w-full text-sm font-mono border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:bg-white transition-colors"
                rows={3}
                placeholder="例如：请根据查询语义重新排序文档，优先保留与历史主题强相关的候选片段。"
                value={knowledge.rerankInstruction}
                onChange={e => updateKnowledge('rerankInstruction', e.target.value)}
              />
            </FormField>

            <div className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
              请求会按 SiliconFlow 官方接口结构发送：
              <span className="font-mono"> /embeddings</span> 使用嵌入模型，
              <span className="font-mono"> /rerank</span> 使用 <span className="font-mono">query</span>、<span className="font-mono">documents</span>、<span className="font-mono">top_n</span>，若填写上方指令则附带 <span className="font-mono">instruction</span>。
            </div>
          </div>
        </div>

        {/* System Prompt (advanced) */}
        <div className="border border-slate-100 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowPrompt(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 transition-colors"
          >
            <span>🧠 自定义提示词（可选）{form.system_prompt && <span className="ml-2 text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">已设置</span>}</span>
            <svg className={`w-4 h-4 text-slate-400 transition-transform ${showPrompt ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showPrompt && (
            <div className="p-4 bg-white border-t border-slate-100 space-y-2">
              <p className="text-xs text-slate-500">
                以 System Prompt 形式注入 AI，在所有验证请求前生效。可用于调整验证风格、添加专业知识、设置严格程度等。留空使用内置提示词。
              </p>
              <textarea
                className="w-full text-xs font-mono border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:bg-white transition-colors"
                rows={6}
                placeholder={`例如：
你是一位专业的中国历史学者，对各朝代政治、经济、文化有深入研究。
在验证历史概念时，请严格把握准确性，对模糊或争议性内容应说明原因。
对冷僻概念应给予较高的 difficulty 评分（4-5）。`}
                value={form.system_prompt}
                onChange={e => update('system_prompt', e.target.value)}
                maxLength={2000}
              />
              <div className="text-xs text-slate-400 text-right">{form.system_prompt.length}/2000</div>
            </div>
          )}
        </div>

        {err && <p className="text-sm text-red-500">{err}</p>}
        <div className="flex gap-3 justify-end">
          <button type="button" className="btn-secondary" onClick={onClose}>取消</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? '保存中...' : '保存'}</button>
        </div>
      </form>
    </div>
  );
}

// ── Panel: Knowledge Base ─────────────────────────────────────────────────────

function KnowledgePanel() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showTextForm, setShowTextForm] = useState(false);
  const [msg, setMsg] = useState('');

  const reload = useCallback(() => adminListDocs().then(setDocs).catch(() => {}), []);
  useEffect(() => { reload(); }, [reload]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setMsg('');
    try {
      const res = await adminUploadDoc(file) as { chunks: number };
      setMsg(`✅ 上传成功，切分为 ${res.chunks} 个片段`);
      reload();
    } catch (err: unknown) {
      setMsg(`❌ ${err instanceof Error ? err.message : '上传失败'}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`确认删除「${title}」？`)) return;
    await adminDeleteDoc(id);
    reload();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="知识库"
        subtitle="上传教材文本，AI 验证历史概念时将自动检索相关内容"
      />

      {/* Upload area */}
      <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center hover:border-indigo-300 transition-colors">
        <div className="text-4xl mb-2">📂</div>
        <p className="text-slate-600 font-medium mb-1">拖拽或点击上传文档</p>
        <p className="text-xs text-slate-400 mb-4">支持 .txt / .md 格式，最大 5MB</p>
        <label className="btn-primary cursor-pointer">
          {uploading ? '上传中...' : '选择文件'}
          <input type="file" accept=".txt,.md,.markdown" onChange={handleFileUpload} disabled={uploading} className="hidden" />
        </label>
        <button onClick={() => setShowTextForm(!showTextForm)} className="btn-secondary ml-3">
          ✏️ 粘贴文本
        </button>
        {msg && <p className={`mt-3 text-sm ${msg.startsWith('✅') ? 'text-green-600' : 'text-red-500'}`}>{msg}</p>}
      </div>

      {/* Paste text form */}
      {showTextForm && (
        <TextUploadForm onSaved={() => { setShowTextForm(false); reload(); }} onClose={() => setShowTextForm(false)} />
      )}

      {/* Document list */}
      {docs.length === 0 ? (
        <EmptyState icon="📚" title="知识库为空" desc="上传教材或参考资料后，AI 会在验证历史概念时自动参考相关内容" />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">文档列表 <span className="text-slate-400 font-normal text-sm">({docs.length})</span></h3>
          </div>
          <div className="divide-y divide-slate-50">
            {docs.map(doc => (
              <div key={doc.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors">
                <div className="text-2xl">📄</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-800 truncate">{doc.title}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {doc.filename} · {doc.total_chunks} 个片段 · {doc.created_at.slice(0, 10)}
                  </div>
                </div>
                <button onClick={() => handleDelete(doc.id, doc.title)} className="text-xs text-red-400 hover:text-red-600 transition-colors px-2 py-1">
                  删除
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <InfoBox>
        上传文档后，当玩家提交历史概念时，系统会自动检索知识库中的相关段落，并作为背景资料提供给 AI，提升验证准确度。
      </InfoBox>
    </div>
  );
}

function TextUploadForm({ onSaved, onClose }: { onSaved: () => void; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr('');
    try {
      await adminAddTextDoc(title, content);
      onSaved();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '添加失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h3 className="font-semibold text-slate-800 mb-4">粘贴文本内容</h3>
      <form onSubmit={submit} className="space-y-4">
        <FormField label="文档标题">
          <input className="input" placeholder="例如：人教版高中历史必修一第三章" value={title} onChange={e => setTitle(e.target.value)} required />
        </FormField>
        <FormField label="文本内容">
          <textarea
            className="input min-h-40 font-mono text-sm resize-y"
            placeholder="粘贴教材文本、知识点、历史资料..."
            value={content}
            onChange={e => setContent(e.target.value)}
            required
          />
        </FormField>
        {err && <p className="text-sm text-red-500">{err}</p>}
        <div className="flex gap-3 justify-end">
          <button type="button" className="btn-secondary" onClick={onClose}>取消</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? '添加中...' : '添加'}</button>
        </div>
      </form>
    </div>
  );
}

// ── Panel: AI-Confirmed Knowledge Base ───────────────────────────────────────

function AIConfirmedPanel({ onNavigateCuration }: { onNavigateCuration?: () => void }) {
  const [docs, setDocs]     = useState<AIConfirmedDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]       = useState('');
  const [search, setSearch] = useState('');

  const reload = useCallback(() => {
    setLoading(true);
    adminListAIConfirmed().then(setDocs).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function handleDelete(id: string, title: string) {
    if (!confirm(`确认从 AI 确认知识库中删除「${title}」？`)) return;
    try {
      await adminDeleteAIConfirmed(id);
      setMsg(`已删除「${title}」`);
      reload();
    } catch { setMsg('删除失败'); }
    setTimeout(() => setMsg(''), 3000);
  }

  async function handleClearAll() {
    if (!confirm(`确认清空全部 ${docs.length} 条 AI 确认知识库条目？\n\n这不会影响游戏数据，只清除自动索引的概念内容。`)) return;
    try {
      const res = await adminClearAIConfirmed();
      setMsg(res.message);
      reload();
    } catch { setMsg('清空失败'); }
    setTimeout(() => setMsg(''), 4000);
  }

  const filtered = docs.filter(d =>
    !search || d.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI 确认知识库"
        subtitle="游戏中 AI 验证通过的历史概念自动入库，供后续验证参考"
        action={
          docs.length > 0 ? (
            <button onClick={handleClearAll} className="btn-danger text-sm">
              🗑 清空全部
            </button>
          ) : undefined
        }
      />

      {msg && (
        <div className={`text-sm px-4 py-2.5 rounded-xl border ${
          msg.includes('失败') ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-600 border-green-100'
        }`}>{msg}</div>
      )}

      <div className="flex items-center gap-3 p-4 bg-orange-50 border border-orange-100 rounded-xl text-sm text-orange-700">
        <span className="text-lg">🎯</span>
        <span>新功能：使用<strong>知识策展</strong>面板对自动摄入的概念进行审核、编辑和分类，提升知识库质量。</span>
        {onNavigateCuration && (
          <button onClick={onNavigateCuration} className="ml-auto shrink-0 px-3 py-1.5 bg-orange-600 text-white text-xs rounded-lg hover:bg-orange-700 transition-colors font-medium">
            前往策展 →
          </button>
        )}
      </div>

      <InfoBox>
        <strong>工作原理：</strong>每当玩家提交的历史概念被 AI 验证通过，系统自动将该概念写入策展队列（待审核），审核通过后进入活跃知识库，下次验证相似概念时作为参考资料提供给 AI。
      </InfoBox>

      {/* Search */}
      {docs.length > 0 && (
        <input
          className="input max-w-xs"
          placeholder="搜索概念名称..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      )}

      {loading && <p className="text-sm text-slate-400">加载中...</p>}

      {!loading && docs.length === 0 ? (
        <EmptyState
          icon="✅"
          title="AI 确认知识库为空"
          desc="当玩家在游戏中成功提交并通过 AI 验证的历史概念后，将自动出现在这里"
        />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-semibold text-slate-800">
              概念列表
              <span className="text-slate-400 font-normal text-sm ml-1.5">
                ({filtered.length}{search ? ` / ${docs.length}` : ''})
              </span>
            </h3>
            <button onClick={reload} disabled={loading} className="btn-secondary text-xs py-1.5">
              {loading ? '加载中...' : '刷新'}
            </button>
          </div>
          <div className="divide-y divide-slate-50 max-h-[60vh] overflow-y-auto">
            {filtered.map(doc => (
              <div key={doc.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center text-lg flex-shrink-0">
                  ✅
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-800 truncate">{doc.title}</div>
                  <div className="text-xs text-slate-400 mt-0.5 flex gap-2">
                    {doc.game_id && (
                      <span>房间 <code className="font-mono text-indigo-500">{doc.game_id}</code></span>
                    )}
                    <span>{doc.created_at.slice(0, 16).replace('T', ' ')}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(doc.id, doc.title)}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors px-2 py-1 flex-shrink-0"
                >
                  删除
                </button>
              </div>
            ))}
            {filtered.length === 0 && search && (
              <div className="p-8 text-center text-slate-400 text-sm">没有匹配「{search}」的概念</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Panel: Knowledge Curation ─────────────────────────────────────────────────

type CurationSubTab = 'queue' | 'active' | 'categories';

function ConceptCard({
  concept, onApprove, onEdit, onReject,
}: {
  concept: CurationConcept;
  onApprove: () => void;
  onEdit: () => void;
  onReject: () => void;
}) {
  const yearDisplay = concept.year != null
    ? (concept.year < 0 ? `公元前 ${Math.abs(concept.year)} 年` : `公元 ${concept.year} 年`)
    : null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-800 truncate">{concept.title}</div>
          <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap gap-x-2">
            {concept.dynasty && <span className="text-indigo-500">{concept.dynasty}</span>}
            {yearDisplay && <span>{yearDisplay}</span>}
            {concept.game_id && <span>房间 <code className="font-mono text-teal-600">{concept.game_id}</code></span>}
            <span>{concept.created_at.slice(0, 10)}</span>
          </div>
        </div>
        <span className="shrink-0 text-xs px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full border border-amber-100">待审核</span>
      </div>

      {concept.description && (
        <p className="text-sm text-slate-600 line-clamp-2">{concept.description}</p>
      )}

      {concept.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {concept.tags.map(t => (
            <span key={t} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">{t}</span>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-1 border-t border-slate-50">
        <button onClick={onApprove}
          className="flex-1 text-xs py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors font-medium">
          ✓ 接受
        </button>
        <button onClick={onEdit}
          className="flex-1 text-xs py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors font-medium">
          ✏️ 编辑
        </button>
        <button onClick={onReject}
          className="flex-1 text-xs py-1.5 bg-red-50 text-red-600 border border-red-100 rounded-lg hover:bg-red-100 transition-colors font-medium">
          ✗ 拒绝
        </button>
      </div>
    </div>
  );
}

function EditConceptModal({
  concept, onSave, onClose,
}: {
  concept: CurationConcept;
  onSave: (patches: Parameters<typeof adminEditConcept>[1]) => Promise<void>;
  onClose: () => void;
}) {
  const [title,       setTitle]       = useState(concept.title);
  const [dynasty,     setDynasty]     = useState(concept.dynasty ?? '');
  const [period,      setPeriod]      = useState(concept.period ?? '');
  const [year,        setYear]        = useState(concept.year != null ? String(concept.year) : '');
  const [description, setDescription] = useState(concept.description ?? '');
  const [tagsStr,     setTagsStr]     = useState(concept.tags.join('、'));
  const [saving,      setSaving]      = useState(false);
  const [err,         setErr]         = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr('');
    try {
      const yearVal = year.trim() ? parseInt(year.trim()) : null;
      if (year.trim() && isNaN(yearVal!)) { setErr('年份必须是整数（负数表示公元前）'); setSaving(false); return; }
      await onSave({
        title:       title.trim() || undefined,
        dynasty:     dynasty.trim() || null,
        period:      period.trim() || null,
        year:        yearVal,
        description: description.trim() || null,
        tags:        tagsStr.split(/[、,，]/).map(t => t.trim()).filter(Boolean),
      });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800">编辑概念</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <FormField label="概念名称 *">
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} required />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="朝代 / 时期">
              <input className="input" placeholder="例：唐朝" value={dynasty} onChange={e => setDynasty(e.target.value)} />
            </FormField>
            <FormField label="年份（负数=公元前）">
              <input className="input" placeholder="例：618 或 -221" value={year} onChange={e => setYear(e.target.value)} />
            </FormField>
          </div>
          <FormField label="历史分期">
            <input className="input" placeholder="例：封建社会" value={period} onChange={e => setPeriod(e.target.value)} />
          </FormField>
          <FormField label="简介">
            <textarea className="input resize-none" rows={3} value={description} onChange={e => setDescription(e.target.value)} />
          </FormField>
          <FormField label="标签（逗号或顿号分隔）">
            <input className="input" placeholder="例：政治、战争、改革" value={tagsStr} onChange={e => setTagsStr(e.target.value)} />
          </FormField>
          {err && <p className="text-sm text-red-500">{err}</p>}
          <div className="flex gap-3 justify-end pt-1">
            <button type="button" className="btn-secondary" onClick={onClose}>取消</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? '保存中...' : '保存'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MergeConceptsModal({
  concepts, onMerge, onClose,
}: {
  concepts: CurationConcept[];
  onMerge: (keepId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [keepId, setKeepId] = useState(concepts[0]?.id ?? '');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onMerge(keepId);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800">合并概念</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <p className="text-sm text-slate-600">选择要保留的概念，其余 {concepts.length - 1} 个将被永久删除：</p>
          <div className="space-y-2">
            {concepts.map(c => (
              <label key={c.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors
                ${keepId === c.id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <input type="radio" name="keep" value={c.id} checked={keepId === c.id}
                  onChange={() => setKeepId(c.id)} className="mt-0.5 accent-indigo-600" />
                <div className="min-w-0">
                  <div className="font-medium text-slate-800">{c.title}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {c.dynasty && <span className="mr-2 text-indigo-500">{c.dynasty}</span>}
                    {c.year != null && <span>{c.year < 0 ? `公元前 ${Math.abs(c.year)}` : `公元 ${c.year}`} 年</span>}
                  </div>
                  {c.description && <p className="text-xs text-slate-500 mt-1 line-clamp-1">{c.description}</p>}
                </div>
              </label>
            ))}
          </div>
          <div className="flex gap-3 justify-end pt-1">
            <button type="button" className="btn-secondary" onClick={onClose}>取消</button>
            <button type="submit" className="btn-danger" disabled={saving}>
              {saving ? '合并中...' : `确认合并（保留 1 个）`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CurationPanel() {
  const [subTab,      setSubTab]      = useState<CurationSubTab>('queue');
  const [pending,     setPending]     = useState<CurationConcept[]>([]);
  const [active,      setActive]      = useState<CurationConcept[]>([]);
  const [categories,  setCategories]  = useState<Category[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [msg,         setMsg]         = useState('');
  const [editTarget,  setEditTarget]  = useState<CurationConcept | null>(null);
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [showMerge,   setShowMerge]   = useState(false);
  const [activeFilter,setActiveFilter]= useState('');
  const [catFilter,   setCatFilter]   = useState('');
  const [newCatName,  setNewCatName]  = useState('');
  const [newCatColor, setNewCatColor] = useState('#6366f1');
  const [savingCat,   setSavingCat]   = useState(false);
  const [batchApproving, setBatchApproving] = useState(false);

  const reloadPending = useCallback(() => {
    setLoading(true);
    adminGetCurationPending().then(setPending).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const reloadActive = useCallback(() => {
    setLoading(true);
    adminGetCurationActive('active').then(setActive).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const reloadCategories = useCallback(() => {
    adminListCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    reloadPending();
    reloadActive();
    reloadCategories();
  }, [reloadPending, reloadActive, reloadCategories]);

  function showMsg(text: string, isErr = false) {
    setMsg(isErr ? `❌ ${text}` : `✅ ${text}`);
    setTimeout(() => setMsg(''), 3000);
  }

  async function handleApprove(id: string) {
    try { await adminApproveConcept(id); reloadPending(); reloadActive(); showMsg('已接受'); }
    catch (e: unknown) { showMsg(e instanceof Error ? e.message : '接受失败', true); }
  }

  async function handleReject(id: string, title: string) {
    if (!confirm(`确认永久删除「${title}」？`)) return;
    try { await adminRejectConcept(id); reloadPending(); showMsg('已拒绝并删除'); }
    catch (e: unknown) { showMsg(e instanceof Error ? e.message : '删除失败', true); }
  }

  async function handleArchive(id: string) {
    try { await adminArchiveConcept(id); reloadActive(); showMsg('已归档'); }
    catch (e: unknown) { showMsg(e instanceof Error ? e.message : '归档失败', true); }
  }

  async function handleEdit(patches: Parameters<typeof adminEditConcept>[1]) {
    if (!editTarget) return;
    await adminEditConcept(editTarget.id, patches);
    setEditTarget(null);
    reloadPending();
    reloadActive();
    showMsg('已保存');
  }

  async function handleBatchApprove() {
    if (!confirm(`确认批量接受全部 ${pending.length} 条待审概念？`)) return;
    setBatchApproving(true);
    try {
      const res = await adminApproveAll();
      reloadPending(); reloadActive();
      showMsg(`批量接受完成，共接受 ${res.approved} 条`);
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : '批量接受失败', true);
    } finally {
      setBatchApproving(false);
    }
  }

  async function handleMerge(keepId: string) {
    const mergeIds = Array.from(selected).filter(id => id !== keepId);
    try {
      const res = await adminMergeConcepts(keepId, mergeIds);
      setSelected(new Set());
      setShowMerge(false);
      reloadActive();
      showMsg(`合并完成，已删除 ${res.deleted} 个重复条目`);
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : '合并失败', true);
    }
  }

  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setSavingCat(true);
    try {
      await adminCreateCategory(newCatName.trim(), newCatColor);
      setNewCatName(''); setNewCatColor('#6366f1');
      reloadCategories();
      showMsg('分类已创建');
    } catch { showMsg('创建分类失败', true); }
    finally { setSavingCat(false); }
  }

  async function handleDeleteCategory(id: string, name: string) {
    if (!confirm(`确认删除分类「${name}」？（不影响已归入的概念）`)) return;
    try { await adminDeleteCategory(id); reloadCategories(); showMsg('分类已删除'); }
    catch { showMsg('删除失败', true); }
  }

  async function handleCategorize(conceptId: string, categoryId: string, remove = false) {
    try {
      await adminCategorizeConcept(conceptId, categoryId, remove);
      reloadActive();
    } catch { showMsg('分类操作失败', true); }
  }

  // Filtered active list
  const filteredActive = active.filter(c => {
    const matchText = !activeFilter || c.title.toLowerCase().includes(activeFilter.toLowerCase());
    const matchCat  = !catFilter || c.categories.some(cat => cat.id === catFilter);
    return matchText && matchCat;
  });

  const selectedConcepts = active.filter(c => selected.has(c.id));

  return (
    <div className="space-y-5">
      <PageHeader
        title="知识策展"
        subtitle="审核、编辑、分类自动摄入的历史概念，把控知识库质量"
      />

      {msg && (
        <div className={`text-sm px-4 py-2.5 rounded-xl border animate-slide-down ${
          msg.startsWith('❌') ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-600 border-green-100'
        }`}>{msg}</div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {([
          { id: 'queue',      label: '摄入队列',   badge: pending.length },
          { id: 'active',     label: '活跃知识库', badge: active.length },
          { id: 'categories', label: '分类管理',   badge: categories.length },
        ] as { id: CurationSubTab; label: string; badge: number }[]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5
              ${subTab === tab.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {tab.label}
            {tab.badge > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold
                ${tab.id === 'queue' && tab.badge > 0
                  ? 'bg-orange-100 text-orange-600'
                  : 'bg-slate-200 text-slate-600'}`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Ingestion Queue ── */}
      {subTab === 'queue' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-slate-500">
              共 <strong>{pending.length}</strong> 条待审概念，由 AI 验证通过自动摄入，审核后方可进入活跃知识库。
            </p>
            <div className="flex gap-2">
              <button onClick={reloadPending} disabled={loading} className="btn-secondary text-xs py-1.5">刷新</button>
              {pending.length > 0 && (
                <button onClick={handleBatchApprove} disabled={batchApproving || loading}
                  className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium">
                  {batchApproving ? '处理中...' : `批量接受全部 (${pending.length})`}
                </button>
              )}
            </div>
          </div>

          {loading && <p className="text-sm text-slate-400">加载中...</p>}

          {!loading && pending.length === 0 ? (
            <EmptyState icon="🎯" title="摄入队列为空" desc="当 AI 验证通过新的历史概念后，会先进入此队列等待审核" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pending.map(c => (
                <ConceptCard
                  key={c.id}
                  concept={c}
                  onApprove={() => handleApprove(c.id)}
                  onEdit={() => setEditTarget(c)}
                  onReject={() => handleReject(c.id, c.title)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Active Knowledge Base ── */}
      {subTab === 'active' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap gap-3 items-center">
            <input
              className="text-sm border border-slate-200 rounded-xl px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 w-48"
              placeholder="搜索概念名称..."
              value={activeFilter}
              onChange={e => setActiveFilter(e.target.value)}
            />
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-xs text-slate-500">分类：</span>
                <button
                  onClick={() => setCatFilter('')}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors
                    ${!catFilter ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                  全部
                </button>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setCatFilter(cat.id === catFilter ? '' : cat.id)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors flex items-center gap-1
                      ${catFilter === cat.id ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                    {cat.name}
                  </button>
                ))}
              </div>
            )}
            <div className="ml-auto flex gap-2">
              {selected.size >= 2 && (
                <button onClick={() => setShowMerge(true)}
                  className="text-xs px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors font-medium">
                  合并选中 ({selected.size})
                </button>
              )}
              {selected.size > 0 && (
                <button onClick={() => setSelected(new Set())}
                  className="text-xs px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors">
                  取消选择
                </button>
              )}
              <button onClick={reloadActive} disabled={loading} className="btn-secondary text-xs py-1.5">刷新</button>
            </div>
          </div>

          {loading && <p className="text-sm text-slate-400">加载中...</p>}

          {!loading && filteredActive.length === 0 ? (
            <EmptyState icon="✅" title="活跃知识库为空" desc="已审核通过的概念会在这里显示" />
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>
                  显示 {filteredActive.length}{filteredActive.length !== active.length ? ` / ${active.length}` : ''} 条
                  {selected.size > 0 && <span className="ml-2 text-indigo-600 font-medium">已选 {selected.size} 条</span>}
                </span>
              </div>
              <div className="divide-y divide-slate-50 max-h-[65vh] overflow-y-auto">
                {filteredActive.map(c => {
                  const yearDisplay = c.year != null
                    ? (c.year < 0 ? `公元前 ${Math.abs(c.year)} 年` : `公元 ${c.year} 年`)
                    : null;
                  const isSelected = selected.has(c.id);
                  return (
                    <div key={c.id} className={`flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors ${isSelected ? 'bg-indigo-50' : ''}`}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => setSelected(prev => {
                          const next = new Set(prev);
                          if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                          return next;
                        })}
                        className="mt-1 accent-indigo-600 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-800">{c.title}</span>
                          {c.dynasty && <span className="text-xs text-indigo-500">{c.dynasty}</span>}
                          {yearDisplay && <span className="text-xs text-slate-400">{yearDisplay}</span>}
                        </div>
                        {c.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{c.description}</p>}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {c.tags.map(t => (
                            <span key={t} className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">{t}</span>
                          ))}
                          {c.categories.map(cat => (
                            <span key={cat.id} className="text-xs px-1.5 py-0.5 rounded flex items-center gap-0.5"
                              style={{ backgroundColor: cat.color + '20', color: cat.color }}>
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                              {cat.name}
                              <button onClick={() => handleCategorize(c.id, cat.id, true)}
                                className="ml-0.5 opacity-60 hover:opacity-100">×</button>
                            </span>
                          ))}
                          {categories.length > 0 && (
                            <select
                              value=""
                              onChange={e => { if (e.target.value) handleCategorize(c.id, e.target.value); }}
                              className="text-xs px-1 py-0.5 bg-slate-50 border border-slate-200 rounded cursor-pointer text-slate-400"
                            >
                              <option value="">+ 分类</option>
                              {categories
                                .filter(cat => !c.categories.some(cc => cc.id === cat.id))
                                .map(cat => (
                                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                                ))
                              }
                            </select>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => setEditTarget(c)}
                          className="text-xs px-2 py-1 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors">
                          编辑
                        </button>
                        <button onClick={() => handleArchive(c.id)}
                          className="text-xs px-2 py-1 text-amber-500 hover:bg-amber-50 rounded-lg transition-colors">
                          归档
                        </button>
                        <button onClick={() => handleReject(c.id, c.title)}
                          className="text-xs px-2 py-1 text-red-400 hover:bg-red-50 rounded-lg transition-colors">
                          删除
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Category Manager ── */}
      {subTab === 'categories' && (
        <div className="space-y-4 max-w-lg">
          <form onSubmit={handleCreateCategory} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <h3 className="font-semibold text-slate-800 text-sm">新建分类</h3>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <FormField label="分类名称">
                  <input className="input" placeholder="例：汉朝、改革、军事" value={newCatName}
                    onChange={e => setNewCatName(e.target.value)} required />
                </FormField>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">颜色</label>
                <input type="color" value={newCatColor} onChange={e => setNewCatColor(e.target.value)}
                  className="w-10 h-9 border border-slate-200 rounded-lg cursor-pointer p-0.5" />
              </div>
              <button type="submit" disabled={savingCat} className="btn-primary text-sm py-2">
                {savingCat ? '创建中...' : '创建'}
              </button>
            </div>
          </form>

          {categories.length === 0 ? (
            <EmptyState icon="🏷️" title="暂无分类" desc="创建分类后可对活跃知识库中的概念进行归类整理" />
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 text-xs text-slate-500">
                共 {categories.length} 个分类
              </div>
              <div className="divide-y divide-slate-50">
                {categories.map(cat => (
                  <div key={cat.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                    <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="flex-1 font-medium text-slate-800 text-sm">{cat.name}</span>
                    <span className="text-xs text-slate-400 font-mono">{cat.color}</span>
                    <button onClick={() => handleDeleteCategory(cat.id, cat.name)}
                      className="text-xs text-red-400 hover:text-red-600 transition-colors px-2 py-1">
                      删除
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit modal */}
      {editTarget && (
        <EditConceptModal
          concept={editTarget}
          onSave={handleEdit}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* Merge modal */}
      {showMerge && selectedConcepts.length >= 2 && (
        <MergeConceptsModal
          concepts={selectedConcepts}
          onMerge={handleMerge}
          onClose={() => setShowMerge(false)}
        />
      )}
    </div>
  );
}

// ── Panel: Server Logs ────────────────────────────────────────────────────────

const LEVEL_STYLES: Record<string, string> = {
  info:  'text-slate-500',
  warn:  'text-amber-600 font-medium',
  error: 'text-red-600 font-medium',
};

const LEVEL_BG: Record<string, string> = {
  info:  '',
  warn:  'bg-amber-50',
  error: 'bg-red-50',
};

// ── Panel: AI Decisions (full response viewer) ────────────────────────────────

function AIDecisionsPanel() {
  const [decisions, setDecisions] = useState<AIDecision[]>([]);
  const [loading, setLoading] = useState(false);
  const [gameIdFilter, setGameIdFilter] = useState('');
  const [selected, setSelected] = useState<AIDecision | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    adminGetAIDecisions(gameIdFilter || undefined)
      .then(setDecisions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [gameIdFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI 完整回复"
        subtitle="查看每次验证的完整 AI 响应、提示词和耗时"
        action={
          <div className="flex gap-2 items-center">
            <input
              className="input text-sm w-40"
              placeholder="按房间码筛选"
              value={gameIdFilter}
              onChange={e => setGameIdFilter(e.target.value.toUpperCase())}
            />
            <button className="btn-secondary text-sm" onClick={load} disabled={loading}>
              {loading ? '加载中...' : '刷新'}
            </button>
          </div>
        }
      />

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-semibold text-slate-800">AI 验证详情</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selected.raw_input && `输入：「${selected.raw_input}」`}
                  {selected.name && ` → 「${selected.name}」`}
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Metadata */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="font-semibold text-slate-600 mb-1">验证方式</div>
                  <span className={`px-2 py-0.5 rounded-full font-medium
                    ${selected.validation_method === 'kb' ? 'bg-green-100 text-green-700' :
                      selected.validation_method === 'cache' ? 'bg-blue-100 text-blue-700' :
                      'bg-indigo-100 text-indigo-700'}`}>
                    {selected.validation_method === 'kb' ? '知识库命中' :
                     selected.validation_method === 'cache' ? '缓存命中' :
                     selected.validation_method === 'admin_override' ? '管理员覆写' : 'AI 验证'}
                  </span>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="font-semibold text-slate-600 mb-1">结果</div>
                  <span className={`px-2 py-0.5 rounded-full font-medium
                    ${selected.validated ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {selected.validated ? '✅ 通过' : '❌ 驳回'}
                  </span>
                </div>
                {selected.ai_model && (
                  <div className="bg-slate-50 rounded-xl p-3 col-span-2">
                    <div className="font-semibold text-slate-600 mb-1">模型 · 耗时</div>
                    <span className="font-mono">{selected.ai_model}</span>
                    {selected.decision_ms && <span className="ml-2 text-slate-400">{selected.decision_ms}ms</span>}
                  </div>
                )}
                <div className="bg-slate-50 rounded-xl p-3 col-span-2">
                  <div className="font-semibold text-slate-600 mb-1">时间 · 房间</div>
                  <span>{selected.decision_made_at?.slice(0, 19).replace('T', ' ')}</span>
                  <span className="ml-2 font-mono text-indigo-500">{selected.game_id}</span>
                  {selected.player_name && <span className="ml-2 text-slate-400">by {selected.player_name}</span>}
                </div>
              </div>

              {/* AI Response (JSON pretty-print) */}
              {selected.ai_response && (
                <div>
                  <div className="text-xs font-semibold text-slate-600 mb-1.5">📤 AI 完整回复</div>
                  <pre className="text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 overflow-x-auto whitespace-pre-wrap break-all text-slate-700 max-h-64 overflow-y-auto">
                    {(() => {
                      try { return JSON.stringify(JSON.parse(selected.ai_response), null, 2); }
                      catch { return selected.ai_response; }
                    })()}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {decisions.length === 0 && !loading ? (
        <EmptyState icon="🔬" title="暂无验证记录" desc="游戏开始后，每次 AI 验证的完整回复将在此处显示" />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800">验证记录 <span className="text-slate-400 font-normal text-sm">({decisions.length})</span></h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  {['时间', '输入', '结果', '方式', '耗时', '房间', '操作'].map(h => (
                    <th key={h} className="px-3 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {decisions.map(d => (
                  <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2.5 text-xs text-slate-400 whitespace-nowrap">{d.decision_made_at?.slice(5, 19).replace('T', ' ')}</td>
                    <td className="px-3 py-2.5 max-w-[160px]">
                      <div className="truncate font-medium text-slate-700">{d.raw_input || d.name || '—'}</div>
                      {d.name && d.raw_input && d.name !== d.raw_input && (
                        <div className="truncate text-xs text-slate-400">{d.name}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                        ${d.validated ? 'bg-emerald-100 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                        {d.validated ? '✅' : '❌'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full
                        ${d.validation_method === 'kb' ? 'bg-green-100 text-green-700' :
                          d.validation_method === 'cache' ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-600'}`}>
                        {d.validation_method === 'kb' ? 'KB' : d.validation_method === 'cache' ? '缓存' : 'AI'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-400">{d.decision_ms ? `${d.decision_ms}ms` : '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-indigo-500">{d.game_id}</td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={async () => {
                          try {
                            const res = await adminGetAIDecision(d.concept_id);
                            setSelected({ ...d, ...(res.decision || {}) } as AIDecision);
                          } catch {
                            setSelected(d);
                          }
                        }}
                        className="text-xs px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors">
                        查看
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <InfoBox>
        <strong>AI 完整回复</strong>：显示每次验证中 AI 返回的完整 JSON（包括 difficulty、tags 等字段），以及验证方式（AI / 知识库命中 / 缓存）和耗时。点击「查看」可展开完整内容。
      </InfoBox>
    </div>
  );
}

function LogsPanel() {
  const [logs, setLogs]     = useState<LogEntry[]>([]);
  const [level, setLevel]   = useState('');
  const [limit, setLimit]   = useState(200);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    adminGetLogs(limit, level || undefined)
      .then(d => setLogs(d.logs))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [limit, level]);

  useEffect(() => { reload(); }, [reload]);

  // Auto-refresh every 5 s when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(reload, 5000);
    return () => clearInterval(id);
  }, [autoRefresh, reload]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="服务器日志"
        subtitle="实时查看后端输出，最新记录排最前"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(v => !v)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                autoRefresh
                  ? 'bg-green-100 text-green-700 border-green-200'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {autoRefresh ? '⟳ 自动刷新' : '⟳ 自动刷新'}
            </button>
            <button onClick={reload} disabled={loading} className="btn-secondary text-xs py-1.5">
              {loading ? '加载中…' : '刷新'}
            </button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-slate-600 font-medium">级别：</span>
        {[
          { value: '',      label: '全部' },
          { value: 'info',  label: 'INFO' },
          { value: 'warn',  label: 'WARN' },
          { value: 'error', label: 'ERROR' },
        ].map(opt => (
          <button
            key={opt.value}
            onClick={() => setLevel(opt.value)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors font-medium
              ${level === opt.value
                ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
          >
            {opt.label}
          </button>
        ))}
        <span className="ml-auto text-sm text-slate-500">
          显示最近
          <select
            className="mx-1 text-sm border border-slate-200 rounded px-1 py-0.5"
            value={limit}
            onChange={e => setLimit(Number(e.target.value))}
          >
            {[100, 200, 500, 1000].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          条
        </span>
      </div>

      {/* Log table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 text-xs text-slate-500">
          共 {logs.length} 条记录 {autoRefresh && <span className="ml-2 text-green-600">● 自动刷新中</span>}
        </div>
        {logs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">暂无日志</div>
        ) : (
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table className="w-full text-xs font-mono">
              <thead className="bg-slate-50 text-slate-500 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium w-36">时间</th>
                  <th className="px-3 py-2 text-left font-medium w-14">级别</th>
                  <th className="px-3 py-2 text-left font-medium">内容</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr key={i} className={`border-t border-slate-50 ${LEVEL_BG[log.level] ?? ''}`}>
                    <td className="px-3 py-1.5 text-slate-400 whitespace-nowrap">{log.ts.slice(0, 23).replace('T', ' ')}</td>
                    <td className={`px-3 py-1.5 uppercase ${LEVEL_STYLES[log.level] ?? ''}`}>{log.level}</td>
                    <td className="px-3 py-1.5 text-slate-700 break-all">{log.msg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <InfoBox>
        前端日志请打开浏览器控制台查看。在控制台输入 <code className="bg-blue-100 px-1 rounded">__socketLogs()</code> 可查看 Socket 连接详细记录。
      </InfoBox>
    </div>
  );
}

// ── Shared UI components ──────────────────────────────────────────────────────

function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-2">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">{title}</h2>
        {subtitle && <p className="text-slate-500 text-sm mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function EmptyState({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
      <div className="text-5xl mb-3">{icon}</div>
      <p className="font-medium text-slate-700">{title}</p>
      <p className="text-sm text-slate-400 mt-1">{desc}</p>
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700">
      ℹ️ {children}
    </div>
  );
}
