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
  adminListDocs, adminUploadDoc, adminAddTextDoc, adminDeleteDoc, adminVectorizeDoc, adminCheckEmbedding, adminCheckRerank, adminCheckAuxiliary,
  adminListGames, adminGetGame, adminFinishGame, adminDeleteGame,
  adminUpdateGameNotes, adminUpdateGameSettings, adminUpdateGameModes, adminRestoreGame, adminSetPlayerLives, adminDeleteGameConcept, adminUpdateGameConcept,
  adminGetLogs, getGameModes,
  adminListAIConfirmed, adminDeleteAIConfirmed, adminClearAIConfirmed,
  adminGetCurationPending, adminGetCurationActive,
  adminApproveConcept, adminApproveAll, adminArchiveConcept, adminRejectConcept,
  adminEditConcept, adminMergeConcepts,
  adminListCategories, adminCreateCategory, adminDeleteCategory, adminCategorizeConcept, adminCategorizeConceptsBatch,
  adminGetAIDecisions, adminGetAIDecision,
  type AIConfig, type KnowledgeDoc, type AdminGame, type LogEntry, type AIConfirmedDoc,
  type CurationConcept, type Category, type AIDecision,
} from '../services/api';
import type { Game, GameModeConfig, Concept } from '../types';
import axios from 'axios';

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
    survival: '生存',
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
  const [showModeEditor, setShowModeEditor] = useState(true);
  const [showQuickSettings, setShowQuickSettings] = useState(true);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const parsedSettings = (game.settings || {}) as Record<string, unknown>;
  const [quickSettings, setQuickSettings] = useState({
    maxPlayers: Number(parsedSettings.maxPlayers) || 0,
    submitCooldownSec: Number(parsedSettings.submitCooldownSec) || 0,
    hintCooldownSec: Number(parsedSettings.hintCooldownSec) || 0,
    initialLives: Math.max(1, Math.min(10, Number(parsedSettings.initialLives) || 3)),
  });
  const [detailPlayers, setDetailPlayers] = useState<Array<{ id: string; name: string }>>([]);
  const [detailConcepts, setDetailConcepts] = useState<Concept[]>([]);
  const [conceptQuery, setConceptQuery] = useState('');
  const [conceptStatusFilter, setConceptStatusFilter] = useState<'all' | 'pending' | 'validated' | 'rejected'>('all');
  const [selectedConceptIds, setSelectedConceptIds] = useState<Set<string>>(new Set());
  const [editingConcept, setEditingConcept] = useState<Concept | null>(null);
  const [batchDeletingConcepts, setBatchDeletingConcepts] = useState(false);
  const [editingLives, setEditingLives] = useState<Record<string, number>>({});
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

    adminGetGame(game.id)
      .then((detail: { players: Array<{ id: string; name: string }>; concepts?: Concept[] }) => {
        const players = (detail.players || []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }));
        setDetailPlayers(players);
        setDetailConcepts(detail.concepts || []);
        setSelectedConceptIds(new Set());
        const initLives = Math.max(1, Math.min(10, Number(parsedSettings.initialLives) || 3));
        setEditingLives(Object.fromEntries(players.map((p: { id: string; name: string }) => [p.id, initLives])));
      })
      .catch(() => {
        setDetailPlayers([]);
        setDetailConcepts([]);
        setSelectedConceptIds(new Set());
      });
  }, [expanded, game.id, parsedSettings.initialLives]);

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

  async function saveQuickSettings() {
    let base: Record<string, unknown> = {};
    try { base = JSON.parse(settingsStr || '{}') as Record<string, unknown>; } catch { /* ignore */ }
    const next = {
      ...base,
      maxPlayers: Math.max(0, Math.min(20, quickSettings.maxPlayers || 0)),
      submitCooldownSec: Math.max(0, Math.min(60, quickSettings.submitCooldownSec || 0)),
      hintCooldownSec: Math.max(0, Math.min(120, quickSettings.hintCooldownSec || 0)),
      initialLives: Math.max(1, Math.min(10, quickSettings.initialLives || 3)),
    };
    setSettingsStr(JSON.stringify(next, null, 2));
    setSavingSettings(true);
    try {
      await adminUpdateGameSettings(game.id, next);
      onAction('快捷设置已更新');
    } catch {
      onAction('快捷设置更新失败');
    }
    setSavingSettings(false);
  }

  async function handleSavePlayerLives(playerId: string, playerName: string) {
    const lives = Math.max(0, Math.min(10, editingLives[playerId] ?? quickSettings.initialLives));
    try {
      await adminSetPlayerLives(game.id, playerId, lives);
      onAction(`已将 ${playerName} 血量调整为 ${lives}`);
    } catch (err: unknown) {
      onAction(err instanceof Error ? err.message : '血量调整失败');
    }
  }

  async function handleDeleteConcept(conceptId: string, conceptLabel: string) {
    if (!confirm(`确认删除概念「${conceptLabel}」吗？`)) return;
    try {
      await adminDeleteGameConcept(game.id, conceptId);
      setDetailConcepts(prev => prev.filter(concept => concept.id !== conceptId));
      setSelectedConceptIds(prev => {
        const next = new Set(prev);
        next.delete(conceptId);
        return next;
      });
      onAction(`已删除概念 ${conceptLabel}`);
    } catch (err: unknown) {
      onAction(err instanceof Error ? err.message : '删除概念失败');
    }
  }

  async function handleBatchDeleteConcepts() {
    const ids = Array.from(selectedConceptIds);
    if (ids.length === 0) return;
    if (!confirm(`确认批量删除这 ${ids.length} 个概念吗？此操作不可撤销。`)) return;
    setBatchDeletingConcepts(true);
    try {
      const results = await Promise.allSettled(ids.map(id => adminDeleteGameConcept(game.id, id)));
      const deletedIds = ids.filter((_, index) => results[index]?.status === 'fulfilled');
      const failedCount = ids.length - deletedIds.length;
      if (deletedIds.length > 0) {
        setDetailConcepts(prev => prev.filter(concept => !deletedIds.includes(concept.id)));
        setSelectedConceptIds(new Set());
      }
      onAction(
        failedCount > 0
          ? `已删除 ${deletedIds.length} 个概念，失败 ${failedCount} 个`
          : `已批量删除 ${deletedIds.length} 个概念`
      );
    } catch (err: unknown) {
      onAction(err instanceof Error ? err.message : '批量删除概念失败');
    } finally {
      setBatchDeletingConcepts(false);
    }
  }

  async function handleEditConcept(patches: {
    raw_input?: string;
    name?: string;
    dynasty?: string | null;
    period?: string | null;
    year?: number | null;
    description?: string | null;
    tags?: string[];
  }) {
    if (!editingConcept) return;
    try {
      const result = await adminUpdateGameConcept(game.id, editingConcept.id, patches);
      setDetailConcepts(prev => prev.map(concept => (
        concept.id === editingConcept.id ? result.concept : concept
      )));
      setEditingConcept(null);
      onAction(`已更新概念 ${result.concept.name || result.concept.raw_input}`);
    } catch (err: unknown) {
      throw err instanceof Error ? err : new Error('保存概念失败');
    }
  }

  function toggleConceptSelected(conceptId: string) {
    setSelectedConceptIds(prev => {
      const next = new Set(prev);
      if (next.has(conceptId)) next.delete(conceptId);
      else next.add(conceptId);
      return next;
    });
  }

  const filteredConcepts = detailConcepts.filter(concept => {
    const matchesStatus = conceptStatusFilter === 'all'
      ? true
      : conceptStatusFilter === 'validated'
        ? concept.validated === 1
        : conceptStatusFilter === 'rejected'
          ? concept.rejected === 1
          : concept.validated !== 1 && concept.rejected !== 1;
    if (!matchesStatus) return false;
    const keyword = conceptQuery.trim().toLowerCase();
    if (!keyword) return true;
    const haystack = [
      concept.name,
      concept.raw_input,
      concept.player_name,
      concept.dynasty,
      concept.period,
      concept.description,
      concept.year != null ? String(concept.year) : '',
      ...concept.tags,
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(keyword);
  });

  const allFilteredSelected = filteredConcepts.length > 0
    && filteredConcepts.every(concept => selectedConceptIds.has(concept.id));

  function toggleSelectAllFiltered() {
    setSelectedConceptIds(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredConcepts.forEach(concept => next.delete(concept.id));
      } else {
        filteredConcepts.forEach(concept => next.add(concept.id));
      }
      return next;
    });
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
            <div className="space-y-3 max-w-3xl">
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

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-slate-600">概念管理</div>
                    <div className="text-[11px] text-slate-400">支持搜索、状态筛选、批量删除和编辑</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-500">共 {detailConcepts.length} 条</span>
                    <span className="rounded-full bg-indigo-50 px-2 py-1 text-[11px] text-indigo-600">当前 {filteredConcepts.length} 条</span>
                  </div>
                </div>

                <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
                  <input
                    type="text"
                    value={conceptQuery}
                    onChange={e => setConceptQuery(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    placeholder="搜索概念名、原始输入、玩家、朝代、标签"
                  />
                  <select
                    value={conceptStatusFilter}
                    onChange={e => setConceptStatusFilter(e.target.value as 'all' | 'pending' | 'validated' | 'rejected')}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    <option value="all">全部状态</option>
                    <option value="pending">待处理</option>
                    <option value="validated">已通过</option>
                    <option value="rejected">已驳回</option>
                  </select>
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAllFiltered}
                        disabled={filteredConcepts.length === 0}
                      />
                      <span>全选当前结果</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleBatchDeleteConcepts}
                      disabled={selectedConceptIds.size === 0 || batchDeletingConcepts}
                      className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {batchDeletingConcepts ? '删除中...' : `批量删除 (${selectedConceptIds.size})`}
                    </button>
                  </div>
                </div>

                {detailConcepts.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
                    暂无概念数据
                  </div>
                ) : filteredConcepts.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
                    没有符合当前搜索或筛选条件的概念
                  </div>
                ) : (
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {filteredConcepts.map(concept => {
                      const label = concept.name || concept.raw_input || concept.id;
                      const statusText = concept.validated ? '已通过' : concept.rejected ? '已驳回' : '待处理';
                      const statusClass = concept.validated
                        ? 'bg-emerald-50 text-emerald-700'
                        : concept.rejected
                          ? 'bg-red-50 text-red-600'
                          : 'bg-amber-50 text-amber-700';
                      const metaParts = [
                        concept.player_name || '未知玩家',
                        concept.year != null ? String(concept.year) : '',
                        concept.dynasty || '',
                        concept.period || '',
                      ].filter(Boolean);

                      return (
                        <div key={concept.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              checked={selectedConceptIds.has(concept.id)}
                              onChange={() => toggleConceptSelected(concept.id)}
                            />
                          </label>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-medium text-slate-800">{label}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusClass}`}>{statusText}</span>
                            </div>
                            <div className="mt-1 truncate text-xs text-slate-400">{metaParts.join(' · ')}</div>
                            {concept.description && (
                              <div className="mt-1 line-clamp-1 text-xs text-slate-500">{concept.description}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingConcept(concept)}
                              className="rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs text-indigo-600 transition-colors hover:bg-indigo-100"
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteConcept(concept.id, String(label))}
                              className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-600 transition-colors hover:bg-red-100"
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Quick settings */}
              <div className="rounded-xl border border-slate-200 bg-white">
                <button
                  onClick={() => setShowQuickSettings(v => !v)}
                  className="w-full px-3 py-2.5 flex items-center justify-between text-left"
                >
                  <span className="text-xs font-semibold text-slate-600">⚡ 快捷设置（减少滚动）</span>
                  <span className="text-slate-400 text-xs">{showQuickSettings ? '收起' : '展开'}</span>
                </button>
                {showQuickSettings && (
                  <div className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <label className="text-xs text-slate-600 space-y-1">
                      <span>最大玩家数</span>
                      <input
                        type="number"
                        min={0}
                        max={20}
                        className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5"
                        value={quickSettings.maxPlayers}
                        onChange={e => setQuickSettings(prev => ({ ...prev, maxPlayers: parseInt(e.target.value) || 0 }))}
                      />
                    </label>
                    <label className="text-xs text-slate-600 space-y-1">
                      <span>提交冷却(秒)</span>
                      <input
                        type="number"
                        min={0}
                        max={60}
                        className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5"
                        value={quickSettings.submitCooldownSec}
                        onChange={e => setQuickSettings(prev => ({ ...prev, submitCooldownSec: parseInt(e.target.value) || 0 }))}
                      />
                    </label>
                    <label className="text-xs text-slate-600 space-y-1">
                      <span>提示冷却(秒)</span>
                      <input
                        type="number"
                        min={0}
                        max={120}
                        className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5"
                        value={quickSettings.hintCooldownSec}
                        onChange={e => setQuickSettings(prev => ({ ...prev, hintCooldownSec: parseInt(e.target.value) || 0 }))}
                      />
                    </label>
                    <label className="text-xs text-slate-600 space-y-1">
                      <span>生存初始血量</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5"
                        value={quickSettings.initialLives}
                        onChange={e => setQuickSettings(prev => ({ ...prev, initialLives: parseInt(e.target.value) || 3 }))}
                      />
                    </label>
                    <div className="sm:col-span-3 flex justify-end">
                      <button onClick={saveQuickSettings} disabled={savingSettings}
                        className="text-xs px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors font-medium">
                        {savingSettings ? '保存中...' : '保存快捷设置'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {modeDraft === 'survival' && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3 space-y-2">
                  <div className="text-xs font-semibold text-rose-700">🛡️ 生存模式血量管理（在线实时）</div>
                  {detailPlayers.length === 0 ? (
                    <div className="text-xs text-rose-500">暂无可调整玩家（房间未激活或无人在线）</div>
                  ) : (
                    <div className="space-y-2">
                      {detailPlayers.map(p => (
                        <div key={p.id} className="flex items-center gap-2">
                          <div className="text-sm text-slate-700 w-28 truncate" title={p.name}>{p.name}</div>
                          <input
                            type="number"
                            min={0}
                            max={10}
                            className="w-20 text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
                            value={editingLives[p.id] ?? quickSettings.initialLives}
                            onChange={e => setEditingLives(prev => ({ ...prev, [p.id]: parseInt(e.target.value) || 0 }))}
                          />
                          <button
                            onClick={() => handleSavePlayerLives(p.id, p.name)}
                            className="text-xs px-2.5 py-1.5 rounded-lg bg-rose-100 text-rose-700 hover:bg-rose-200 transition-colors"
                          >
                            保存血量
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Mode editor */}
              <div className="rounded-xl border border-slate-200 bg-white">
                <button
                  onClick={() => setShowModeEditor(v => !v)}
                  className="w-full px-3 py-2.5 flex items-center justify-between text-left"
                >
                  <span className="text-xs font-semibold text-slate-600">🎮 游戏模式</span>
                  <span className="text-slate-400 text-xs">{showModeEditor ? '收起' : '展开'}</span>
                </button>
                {showModeEditor && (
                  <div className="space-y-3 px-3 pb-3">
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
                )}
              </div>

              {/* Advanced JSON settings */}
              <div className="rounded-xl border border-slate-200 bg-white">
                <button
                  onClick={() => setShowAdvancedSettings(v => !v)}
                  className="w-full px-3 py-2.5 flex items-center justify-between text-left"
                >
                  <span className="text-xs font-semibold text-slate-600">⚙️ 高级设置(JSON)</span>
                  <span className="text-slate-400 text-xs">{showAdvancedSettings ? '收起' : '展开'}</span>
                </button>
                {showAdvancedSettings && (
                  <div className="px-3 pb-3">
                    <textarea
                      className="w-full text-xs font-mono border border-slate-200 rounded-xl px-3 py-2 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      rows={4}
                      value={settingsStr}
                      onChange={e => setSettingsStr(e.target.value)}
                    />
                    <button onClick={saveSettings} disabled={savingSettings}
                      className="mt-1.5 text-xs px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors font-medium">
                      {savingSettings ? '更新中...' : '更新设置'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
      {editingConcept && (
        <EditGameConceptModal
          concept={editingConcept}
          onSave={handleEditConcept}
          onClose={() => setEditingConcept(null)}
        />
      )}
    </>
  );
}

function EditGameConceptModal({
  concept,
  onSave,
  onClose,
}: {
  concept: Concept;
  onSave: (patches: {
    raw_input?: string;
    name?: string;
    dynasty?: string | null;
    period?: string | null;
    year?: number | null;
    description?: string | null;
    tags?: string[];
  }) => Promise<void>;
  onClose: () => void;
}) {
  const [rawInput, setRawInput] = useState(concept.raw_input ?? '');
  const [name, setName] = useState(concept.name ?? concept.raw_input ?? '');
  const [dynasty, setDynasty] = useState(concept.dynasty ?? '');
  const [period, setPeriod] = useState(concept.period ?? '');
  const [year, setYear] = useState(concept.year != null ? String(concept.year) : '');
  const [description, setDescription] = useState(concept.description ?? '');
  const [tagsStr, setTagsStr] = useState(Array.isArray(concept.tags) ? concept.tags.join(', ') : '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      const yearVal = year.trim() ? parseInt(year.trim(), 10) : null;
      if (year.trim() && Number.isNaN(yearVal)) {
        setErr('年份必须是整数');
        setSaving(false);
        return;
      }
      await onSave({
        raw_input: rawInput.trim(),
        name: name.trim(),
        dynasty: dynasty.trim() || null,
        period: period.trim() || null,
        year: yearVal,
        description: description.trim() || null,
        tags: tagsStr.split(/[，,、]/).map(tag => tag.trim()).filter(Boolean),
      });
    } catch (error: unknown) {
      setErr(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <h3 className="text-lg font-bold text-slate-800">编辑房间概念</h3>
          <button onClick={onClose} className="text-xl leading-none text-slate-400 hover:text-slate-600">×</button>
        </div>
        <form onSubmit={submit} className="space-y-4 p-6">
          <FormField label="原始输入">
            <input className="input" value={rawInput} onChange={e => setRawInput(e.target.value)} required />
          </FormField>
          <FormField label="概念名称">
            <input className="input" value={name} onChange={e => setName(e.target.value)} required />
          </FormField>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="朝代">
              <input className="input" value={dynasty} onChange={e => setDynasty(e.target.value)} />
            </FormField>
            <FormField label="时期">
              <input className="input" value={period} onChange={e => setPeriod(e.target.value)} />
            </FormField>
            <FormField label="年份">
              <input className="input" value={year} onChange={e => setYear(e.target.value)} placeholder="可填负数" />
            </FormField>
          </div>
          <FormField label="简介">
            <textarea className="input resize-none" rows={3} value={description} onChange={e => setDescription(e.target.value)} />
          </FormField>
          <FormField label="标签">
            <input className="input" value={tagsStr} onChange={e => setTagsStr(e.target.value)} placeholder="用逗号分隔多个标签" />
          </FormField>
          {err && <p className="text-sm text-red-500">{err}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>取消</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? '保存中...' : '保存'}</button>
          </div>
        </form>
      </div>
    </div>
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
const ADMIN_RAG_PARAM_DOCS = [
  { name: '主题 TopN', desc: '先召回最相关主题数量。更大覆盖更广，但噪声也可能增加。' },
  { name: '概念 TopN', desc: '每个主题下保留的概念条数。提高后通常能增强命中率，但会加长上下文。' },
  { name: '上下文最大字数', desc: '送入模型的 RAG 文本长度上限。过小丢信息，过大增加延迟和成本。' },
  { name: 'FTS 候选倍率', desc: '全文检索候选放大倍数。值越大，重排可选空间越大。' },
  { name: 'FTS 最少候选数', desc: '全文检索阶段至少保留的候选条数，避免低召回时候选过少。' },
  { name: '拼接分隔', desc: '多段检索文本拼接方式：分隔线更清晰，空行更紧凑。' },
  { name: '默认在聊天区显示 AI 教材摘录', desc: '开启后，建房默认会在聊天区展示模型使用的教材摘录。' },
];

function clampInt(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  const n = Math.trunc(value);
  return Math.min(max, Math.max(min, n));
}

function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function normalizeKnowledgeNumericInputs<T extends {
  topicTopN: number;
  conceptTopN: number;
  candidateMultiplier: number;
  contextMaxChars: number;
  embeddingWeight: number;
  ftsWeight: number;
  rerankWeight: number;
  polishMaxChars: number;
  roomDefaultTopicTopN: number;
  roomDefaultConceptTopN: number;
  roomDefaultContextMaxChars: number;
  roomDefaultFtsMultiplier: number;
  roomDefaultFtsMinCandidates: number;
}>(knowledge: T): T {
  return {
    ...knowledge,
    topicTopN: clampInt(knowledge.topicTopN, 1, 10, 1),
    conceptTopN: clampInt(knowledge.conceptTopN, 1, 12, 2),
    candidateMultiplier: clampInt(knowledge.candidateMultiplier, 1, 20, 4),
    contextMaxChars: clampInt(knowledge.contextMaxChars, 200, 4000, 800),
    embeddingWeight: clampNumber(knowledge.embeddingWeight, 0, 1, 0.85),
    ftsWeight: clampNumber(knowledge.ftsWeight, 0, 1, 0.15),
    rerankWeight: clampNumber(knowledge.rerankWeight, 0, 1, 0.8),
    polishMaxChars: clampInt(knowledge.polishMaxChars, 200, 4000, 1200),
    roomDefaultTopicTopN: clampInt(knowledge.roomDefaultTopicTopN, 1, 10, 1),
    roomDefaultConceptTopN: clampInt(knowledge.roomDefaultConceptTopN, 1, 12, 2),
    roomDefaultContextMaxChars: clampInt(knowledge.roomDefaultContextMaxChars, 200, 4000, 800),
    roomDefaultFtsMultiplier: clampInt(knowledge.roomDefaultFtsMultiplier, 1, 20, 4),
    roomDefaultFtsMinCandidates: clampInt(knowledge.roomDefaultFtsMinCandidates, 1, 200, 12),
  };
}

function formatApiError(err: unknown, fallback = '请求失败') {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    const msg = err.response?.data?.error || err.message || fallback;
    return detail ? `${msg}\n${String(detail).slice(0, 400)}` : msg;
  }
  return err instanceof Error ? err.message : fallback;
}

function readKnowledgeExtra(extra: Record<string, unknown> | null | undefined) {
  const legacyEnabled = typeof extra?.kb_enabled === 'boolean' ? extra.kb_enabled : false;
  return {
    provider: typeof extra?.kb_provider === 'string' ? extra.kb_provider : 'siliconflow',
    enabled: legacyEnabled,
    embeddingEnabled: typeof extra?.kb_embedding_enabled === 'boolean' ? extra.kb_embedding_enabled : legacyEnabled,
    rerankEnabled: typeof extra?.kb_rerank_enabled === 'boolean' ? extra.kb_rerank_enabled : legacyEnabled,
    apiKey: typeof extra?.kb_api_key === 'string' ? extra.kb_api_key : '',
    baseUrl: typeof extra?.kb_base_url === 'string' ? extra.kb_base_url : '',
    embeddingModel: typeof extra?.kb_embedding_model === 'string' ? extra.kb_embedding_model : '',
    rerankModel: typeof extra?.kb_rerank_model === 'string' ? extra.kb_rerank_model : '',
    rerankInstruction: typeof extra?.kb_rerank_instruction === 'string' ? extra.kb_rerank_instruction : '',
    topicTopN: typeof extra?.kb_topic_top_n === 'number' ? extra.kb_topic_top_n : 1,
    conceptTopN: typeof extra?.kb_concept_top_n === 'number' ? extra.kb_concept_top_n : 2,
    candidateMultiplier: typeof extra?.kb_candidate_multiplier === 'number' ? extra.kb_candidate_multiplier : 4,
    contextMaxChars: typeof extra?.kb_context_max_chars === 'number' ? extra.kb_context_max_chars : 800,
    embeddingWeight: typeof extra?.kb_embedding_weight === 'number' ? extra.kb_embedding_weight : 0.85,
    ftsWeight: typeof extra?.kb_fts_weight === 'number' ? extra.kb_fts_weight : 0.15,
    rerankWeight: typeof extra?.kb_rerank_weight === 'number' ? extra.kb_rerank_weight : 0.8,
    polishEnabled: typeof extra?.kb_polish_enabled === 'boolean' ? extra.kb_polish_enabled : true,
    polishMaxChars: typeof extra?.kb_polish_max_chars === 'number' ? extra.kb_polish_max_chars : 1200,
    roomDefaultTopicTopN: typeof extra?.kb_room_default_topic_top_n === 'number' ? extra.kb_room_default_topic_top_n : 1,
    roomDefaultConceptTopN: typeof extra?.kb_room_default_concept_top_n === 'number' ? extra.kb_room_default_concept_top_n : 2,
    roomDefaultContextMaxChars: typeof extra?.kb_room_default_context_max_chars === 'number' ? extra.kb_room_default_context_max_chars : 800,
    roomDefaultFtsMultiplier: typeof extra?.kb_room_default_fts_multiplier === 'number' ? extra.kb_room_default_fts_multiplier : 4,
    roomDefaultFtsMinCandidates: typeof extra?.kb_room_default_fts_min_candidates === 'number' ? extra.kb_room_default_fts_min_candidates : 12,
    roomDefaultShowPolishedInChat: typeof extra?.kb_room_default_show_polished_in_chat === 'boolean' ? extra.kb_room_default_show_polished_in_chat : false,
    roomDefaultJoinSeparator: extra?.kb_room_default_join_separator === 'double_newline' ? 'double_newline' : 'rule',
  };
}

function writeKnowledgeExtra(
  existingExtra: Record<string, unknown>,
  next: {
    enabled: boolean;
    embeddingEnabled: boolean;
    rerankEnabled: boolean;
    apiKey: string;
    baseUrl: string;
    embeddingModel: string;
    rerankModel: string;
    rerankInstruction: string;
    topicTopN: number;
    conceptTopN: number;
    candidateMultiplier: number;
    contextMaxChars: number;
    embeddingWeight: number;
    ftsWeight: number;
    rerankWeight: number;
    polishEnabled: boolean;
    polishMaxChars: number;
    roomDefaultTopicTopN: number;
    roomDefaultConceptTopN: number;
    roomDefaultContextMaxChars: number;
    roomDefaultFtsMultiplier: number;
    roomDefaultFtsMinCandidates: number;
    roomDefaultShowPolishedInChat: boolean;
    roomDefaultJoinSeparator: string;
  },
  preservedApiKey = ''
) {
  const merged = { ...existingExtra };

  delete merged.kb_provider;
  delete merged.kb_enabled;
  delete merged.kb_embedding_enabled;
  delete merged.kb_rerank_enabled;
  delete merged.kb_api_key;
  delete merged.kb_base_url;
  delete merged.kb_embedding_model;
  delete merged.kb_rerank_model;
  delete merged.kb_rerank_instruction;
  delete merged.kb_topic_top_n;
  delete merged.kb_concept_top_n;
  delete merged.kb_candidate_multiplier;
  delete merged.kb_context_max_chars;
  delete merged.kb_embedding_weight;
  delete merged.kb_fts_weight;
  delete merged.kb_rerank_weight;
  delete merged.kb_polish_enabled;
  delete merged.kb_polish_max_chars;
  delete merged.kb_room_default_topic_top_n;
  delete merged.kb_room_default_concept_top_n;
  delete merged.kb_room_default_context_max_chars;
  delete merged.kb_room_default_fts_multiplier;
  delete merged.kb_room_default_fts_min_candidates;
  delete merged.kb_room_default_show_polished_in_chat;
  delete merged.kb_room_default_join_separator;

  const apiKey = next.apiKey === SECRET_MASK ? preservedApiKey : next.apiKey.trim();
  const baseUrl = next.baseUrl.trim().replace(/\/$/, '');
  const embeddingModel = next.embeddingModel.trim();
  const rerankModel = next.rerankModel.trim();
  const rerankInstruction = next.rerankInstruction.trim();

  const hasAnyValue = Boolean(
    apiKey || baseUrl || embeddingModel || rerankModel || rerankInstruction ||
    next.enabled || next.embeddingEnabled || next.rerankEnabled ||
    next.roomDefaultTopicTopN || next.roomDefaultConceptTopN || next.roomDefaultContextMaxChars ||
    next.roomDefaultFtsMultiplier || next.roomDefaultFtsMinCandidates ||
    next.roomDefaultShowPolishedInChat
  );
  if (!hasAnyValue) return merged;

  merged.kb_provider = 'siliconflow';
  merged.kb_enabled = next.enabled;
  merged.kb_embedding_enabled = next.embeddingEnabled;
  merged.kb_rerank_enabled = next.rerankEnabled;
  if (apiKey) merged.kb_api_key = apiKey;
  if (baseUrl) merged.kb_base_url = baseUrl;
  if (embeddingModel) merged.kb_embedding_model = embeddingModel;
  if (rerankModel) merged.kb_rerank_model = rerankModel;
  if (rerankInstruction) merged.kb_rerank_instruction = rerankInstruction;
  merged.kb_topic_top_n = Number(next.topicTopN) || 1;
  merged.kb_concept_top_n = Number(next.conceptTopN) || 2;
  merged.kb_candidate_multiplier = Number(next.candidateMultiplier) || 4;
  merged.kb_context_max_chars = Number(next.contextMaxChars) || 800;
  merged.kb_embedding_weight = Number(next.embeddingWeight) || 0.85;
  merged.kb_fts_weight = Number(next.ftsWeight) || 0.15;
  merged.kb_rerank_weight = Number(next.rerankWeight) || 0.8;
  merged.kb_polish_enabled = Boolean(next.polishEnabled);
  merged.kb_polish_max_chars = Number(next.polishMaxChars) || 1200;
  merged.kb_room_default_topic_top_n = Number(next.roomDefaultTopicTopN) || 1;
  merged.kb_room_default_concept_top_n = Number(next.roomDefaultConceptTopN) || 2;
  merged.kb_room_default_context_max_chars = Number(next.roomDefaultContextMaxChars) || 800;
  merged.kb_room_default_fts_multiplier = Number(next.roomDefaultFtsMultiplier) || 4;
  merged.kb_room_default_fts_min_candidates = Number(next.roomDefaultFtsMinCandidates) || 12;
  merged.kb_room_default_show_polished_in_chat = Boolean(next.roomDefaultShowPolishedInChat);
  merged.kb_room_default_join_separator = next.roomDefaultJoinSeparator === 'double_newline' ? 'double_newline' : 'rule';

  return merged;
}

function readAuxExtra(extra: Record<string, unknown> | null | undefined) {
  return {
    enabled: typeof extra?.aux_enabled === 'boolean' ? extra.aux_enabled : false,
    providerType: typeof extra?.aux_provider_type === 'string' ? extra.aux_provider_type : 'openai-compatible',
    baseUrl: typeof extra?.aux_base_url === 'string' ? extra.aux_base_url : '',
    apiKey: typeof extra?.aux_api_key === 'string' ? extra.aux_api_key : '',
    model: typeof extra?.aux_model === 'string' ? extra.aux_model : '',
    systemPrompt: typeof extra?.aux_system_prompt === 'string' ? extra.aux_system_prompt : '你是主模型的辅助判定器，只返回简洁结果。',
    sceneRagGate: typeof extra?.aux_scene_rag_gate === 'boolean' ? extra.aux_scene_rag_gate : true,
    sceneQueryRewrite: typeof extra?.aux_scene_query_rewrite === 'boolean' ? extra.aux_scene_query_rewrite : true,
    sceneContextGuard: typeof extra?.aux_scene_context_guard === 'boolean' ? extra.aux_scene_context_guard : true,
    sceneJsonRepair: typeof extra?.aux_scene_json_repair === 'boolean' ? extra.aux_scene_json_repair : true,
    sceneReasonRewrite: typeof extra?.aux_scene_reason_rewrite === 'boolean' ? extra.aux_scene_reason_rewrite : true,
  };
}

function writeAuxExtra(
  existingExtra: Record<string, unknown>,
  next: {
    enabled: boolean;
    providerType: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    systemPrompt: string;
    sceneRagGate: boolean;
    sceneQueryRewrite: boolean;
    sceneContextGuard: boolean;
    sceneJsonRepair: boolean;
    sceneReasonRewrite: boolean;
  },
  preservedApiKey = '',
) {
  const merged = { ...existingExtra };
  delete merged.aux_enabled;
  delete merged.aux_provider_type;
  delete merged.aux_base_url;
  delete merged.aux_api_key;
  delete merged.aux_model;
  delete merged.aux_system_prompt;
  delete merged.aux_scene_rag_gate;
  delete merged.aux_scene_query_rewrite;
  delete merged.aux_scene_context_guard;
  delete merged.aux_scene_json_repair;
  delete merged.aux_scene_reason_rewrite;

  const apiKey = next.apiKey === SECRET_MASK ? preservedApiKey : next.apiKey.trim();
  const baseUrl = next.baseUrl.trim().replace(/\/$/, '');
  const model = next.model.trim();
  const systemPrompt = next.systemPrompt.trim();
  if (!next.enabled && !apiKey && !model && !baseUrl) return merged;

  merged.aux_enabled = Boolean(next.enabled);
  merged.aux_provider_type = next.providerType || 'openai-compatible';
  if (baseUrl) merged.aux_base_url = baseUrl;
  if (apiKey) merged.aux_api_key = apiKey;
  if (model) merged.aux_model = model;
  if (systemPrompt) merged.aux_system_prompt = systemPrompt;
  merged.aux_scene_rag_gate = Boolean(next.sceneRagGate);
  merged.aux_scene_query_rewrite = Boolean(next.sceneQueryRewrite);
  merged.aux_scene_context_guard = Boolean(next.sceneContextGuard);
  merged.aux_scene_json_repair = Boolean(next.sceneJsonRepair);
  merged.aux_scene_reason_rewrite = Boolean(next.sceneReasonRewrite);

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
                        Embedding{knowledge.embeddingEnabled ? '已启用' : '已配置'}: <span className="font-mono">{knowledge.embeddingModel}</span>
                      </span>
                    )}
                    {knowledge.rerankModel && (
                      <span className="text-xs px-2 py-0.5 rounded-full border bg-violet-50 text-violet-700 border-violet-200">
                        Rerank{knowledge.rerankEnabled ? '已启用' : '已配置'}: <span className="font-mono">{knowledge.rerankModel}</span>
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
  const initialAux = readAuxExtra(initial?.extra);

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
    embeddingEnabled: initialKnowledge.embeddingEnabled,
    rerankEnabled: initialKnowledge.rerankEnabled,
    apiKey: initialKnowledge.apiKey ? SECRET_MASK : '',
    baseUrl: initialKnowledge.baseUrl,
    embeddingModel: initialKnowledge.embeddingModel,
    rerankModel: initialKnowledge.rerankModel,
    rerankInstruction: initialKnowledge.rerankInstruction,
    topicTopN: initialKnowledge.topicTopN,
    conceptTopN: initialKnowledge.conceptTopN,
    candidateMultiplier: initialKnowledge.candidateMultiplier,
    contextMaxChars: initialKnowledge.contextMaxChars,
    embeddingWeight: initialKnowledge.embeddingWeight,
    ftsWeight: initialKnowledge.ftsWeight,
    rerankWeight: initialKnowledge.rerankWeight,
    polishEnabled: initialKnowledge.polishEnabled,
    polishMaxChars: initialKnowledge.polishMaxChars,
    roomDefaultTopicTopN: initialKnowledge.roomDefaultTopicTopN,
    roomDefaultConceptTopN: initialKnowledge.roomDefaultConceptTopN,
    roomDefaultContextMaxChars: initialKnowledge.roomDefaultContextMaxChars,
    roomDefaultFtsMultiplier: initialKnowledge.roomDefaultFtsMultiplier,
    roomDefaultFtsMinCandidates: initialKnowledge.roomDefaultFtsMinCandidates,
    roomDefaultShowPolishedInChat: initialKnowledge.roomDefaultShowPolishedInChat,
    roomDefaultJoinSeparator: initialKnowledge.roomDefaultJoinSeparator,
  });
  const [aux, setAux] = useState({
    enabled: initialAux.enabled,
    providerType: initialAux.providerType,
    baseUrl: initialAux.baseUrl,
    apiKey: initialAux.apiKey ? SECRET_MASK : '',
    model: initialAux.model,
    systemPrompt: initialAux.systemPrompt,
    sceneRagGate: initialAux.sceneRagGate,
    sceneQueryRewrite: initialAux.sceneQueryRewrite,
    sceneContextGuard: initialAux.sceneContextGuard,
    sceneJsonRepair: initialAux.sceneJsonRepair,
    sceneReasonRewrite: initialAux.sceneReasonRewrite,
  });
  const [glmApiPath, setGlmApiPath] = useState(initialGlmPath);
  const [saving, setSaving] = useState(false);
  const [checkingEmbedding, setCheckingEmbedding] = useState(false);
  const [checkingRerank, setCheckingRerank] = useState(false);
  const [checkingAuxiliary, setCheckingAuxiliary] = useState(false);
  const [err, setErr] = useState('');
  const [knowledgeCheckMsg, setKnowledgeCheckMsg] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const [showRagHelp, setShowRagHelp] = useState(false);

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
      if (knowledge.enabled && !knowledge.embeddingEnabled && !knowledge.rerankEnabled) {
        throw new Error('启用知识库增强时，请至少启用 Embedding 或 Rerank');
      }
      if (knowledge.embeddingEnabled && !knowledge.embeddingModel.trim()) {
        throw new Error('已启用 Embedding，请填写嵌入模型');
      }
      if (knowledge.rerankEnabled && !knowledge.rerankModel.trim()) {
        throw new Error('已启用 Rerank，请填写重排序模型');
      }
      const normalizedKnowledge = normalizeKnowledgeNumericInputs(knowledge);
      setKnowledge(normalizedKnowledge);
      const mergedKnowledgeExtra = writeKnowledgeExtra(initial?.extra || {}, normalizedKnowledge, initialKnowledge.apiKey);
      const mergedExtra = writeAuxExtra(mergedKnowledgeExtra, aux, initialAux.apiKey);

      const payload: Partial<AIConfig> & { system_prompt?: string } = {
        ...form,
        base_url: effectiveBaseUrl,
        system_prompt: form.system_prompt || undefined,
        extra: mergedExtra,
      };
      if (initial) {
        if (form.api_key === SECRET_MASK) delete payload.api_key;
        await adminUpdateAIConfig(initial.id, payload);
      } else {
        await adminCreateAIConfig({ ...payload, extra: (payload.extra || {}) } as Omit<AIConfig, 'id' | 'is_active' | 'created_at'>);
      }
      onSaved();
    } catch (e: unknown) {
      setErr(formatApiError(e, '保存失败'));
    } finally {
      setSaving(false);
    }
  }

  async function handleCheckEmbedding() {
    setCheckingEmbedding(true);
    setKnowledgeCheckMsg('');
    try {
      const normalizedKnowledge = normalizeKnowledgeNumericInputs(knowledge);
      setKnowledge(normalizedKnowledge);
      const payload = {
        enabled: normalizedKnowledge.enabled,
        embeddingEnabled: normalizedKnowledge.embeddingEnabled,
        rerankEnabled: normalizedKnowledge.rerankEnabled,
        apiKey: normalizedKnowledge.apiKey === SECRET_MASK ? initialKnowledge.apiKey : normalizedKnowledge.apiKey.trim(),
        baseUrl: normalizedKnowledge.baseUrl.trim(),
        embeddingModel: normalizedKnowledge.embeddingModel.trim(),
        rerankModel: normalizedKnowledge.rerankModel.trim(),
        rerankInstruction: normalizedKnowledge.rerankInstruction.trim(),
        topicTopN: normalizedKnowledge.topicTopN,
        conceptTopN: normalizedKnowledge.conceptTopN,
        candidateMultiplier: normalizedKnowledge.candidateMultiplier,
        contextMaxChars: normalizedKnowledge.contextMaxChars,
        embeddingWeight: normalizedKnowledge.embeddingWeight,
        ftsWeight: normalizedKnowledge.ftsWeight,
        rerankWeight: normalizedKnowledge.rerankWeight,
        polishEnabled: normalizedKnowledge.polishEnabled,
        polishMaxChars: normalizedKnowledge.polishMaxChars,
      };
      const res = await adminCheckEmbedding(payload);
      setKnowledgeCheckMsg(`✅ ${res.message}（${res.model}）`);
    } catch (e: unknown) {
      setKnowledgeCheckMsg(`❌ ${formatApiError(e, 'Embedding 检测失败')}`);
    } finally {
      setCheckingEmbedding(false);
    }
  }

  async function handleCheckRerank() {
    setCheckingRerank(true);
    setKnowledgeCheckMsg('');
    try {
      const normalizedKnowledge = normalizeKnowledgeNumericInputs(knowledge);
      setKnowledge(normalizedKnowledge);
      const payload = {
        enabled: normalizedKnowledge.enabled,
        embeddingEnabled: normalizedKnowledge.embeddingEnabled,
        rerankEnabled: normalizedKnowledge.rerankEnabled,
        apiKey: normalizedKnowledge.apiKey === SECRET_MASK ? initialKnowledge.apiKey : normalizedKnowledge.apiKey.trim(),
        baseUrl: normalizedKnowledge.baseUrl.trim(),
        embeddingModel: normalizedKnowledge.embeddingModel.trim(),
        rerankModel: normalizedKnowledge.rerankModel.trim(),
        rerankInstruction: normalizedKnowledge.rerankInstruction.trim(),
        topicTopN: normalizedKnowledge.topicTopN,
        conceptTopN: normalizedKnowledge.conceptTopN,
        candidateMultiplier: normalizedKnowledge.candidateMultiplier,
        contextMaxChars: normalizedKnowledge.contextMaxChars,
        embeddingWeight: normalizedKnowledge.embeddingWeight,
        ftsWeight: normalizedKnowledge.ftsWeight,
        rerankWeight: normalizedKnowledge.rerankWeight,
        polishEnabled: normalizedKnowledge.polishEnabled,
        polishMaxChars: normalizedKnowledge.polishMaxChars,
      };
      const res = await adminCheckRerank(payload);
      setKnowledgeCheckMsg(`✅ ${res.message}（${res.model}）`);
    } catch (e: unknown) {
      setKnowledgeCheckMsg(`❌ ${formatApiError(e, 'Rerank 检测失败')}`);
    } finally {
      setCheckingRerank(false);
    }
  }

  async function handleCheckAuxiliary() {
    setCheckingAuxiliary(true);
    setKnowledgeCheckMsg('');
    try {
      const payload = {
        providerType: aux.providerType,
        baseUrl: aux.baseUrl.trim(),
        apiKey: aux.apiKey === SECRET_MASK ? initialAux.apiKey : aux.apiKey.trim(),
        model: aux.model.trim(),
        systemPrompt: aux.systemPrompt.trim(),
      };
      const res = await adminCheckAuxiliary(payload);
      setKnowledgeCheckMsg(`✅ ${res.message}（${res.provider} / ${res.model}）`);
    } catch (e: unknown) {
      setKnowledgeCheckMsg(`❌ ${formatApiError(e, '辅助 LLM 检测失败')}`);
    } finally {
      setCheckingAuxiliary(false);
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={knowledge.embeddingEnabled}
                  onChange={e => updateKnowledge('embeddingEnabled', e.target.checked)}
                />
                启用 Embedding 向量检索
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={knowledge.rerankEnabled}
                  onChange={e => updateKnowledge('rerankEnabled', e.target.checked)}
                />
                启用 Rerank 重排
              </label>
            </div>

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

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <FormField label="主题 TopN">
                <input className="input font-mono text-sm" type="number" min={1} max={10} value={knowledge.topicTopN}
                  onChange={e => updateKnowledge('topicTopN', Number(e.target.value))} />
              </FormField>
              <FormField label="概念 TopN">
                <input className="input font-mono text-sm" type="number" min={1} max={12} value={knowledge.conceptTopN}
                  onChange={e => updateKnowledge('conceptTopN', Number(e.target.value))} />
              </FormField>
              <FormField label="候选倍数">
                <input className="input font-mono text-sm" type="number" min={1} max={10} value={knowledge.candidateMultiplier}
                  onChange={e => updateKnowledge('candidateMultiplier', Number(e.target.value))} />
              </FormField>
              <FormField label="上下文上限字数">
                <input className="input font-mono text-sm" type="number" min={200} max={4000} value={knowledge.contextMaxChars}
                  onChange={e => updateKnowledge('contextMaxChars', Number(e.target.value))} />
              </FormField>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <FormField label="Embedding 权重">
                <input className="input font-mono text-sm" type="number" step="0.05" min={0} max={1} value={knowledge.embeddingWeight}
                  onChange={e => updateKnowledge('embeddingWeight', Number(e.target.value))} />
              </FormField>
              <FormField label="FTS 权重">
                <input className="input font-mono text-sm" type="number" step="0.05" min={0} max={1} value={knowledge.ftsWeight}
                  onChange={e => updateKnowledge('ftsWeight', Number(e.target.value))} />
              </FormField>
              <FormField label="Rerank 最终权重">
                <input className="input font-mono text-sm" type="number" step="0.05" min={0} max={1} value={knowledge.rerankWeight}
                  onChange={e => updateKnowledge('rerankWeight', Number(e.target.value))} />
              </FormField>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={knowledge.polishEnabled} onChange={e => updateKnowledge('polishEnabled', e.target.checked)} />
                启用 AI 精简 RAG 结果并展示到回复/时间轴
              </label>
              <FormField label="AI 精简字数上限">
                <input className="input font-mono text-sm" type="number" min={200} max={4000} value={knowledge.polishMaxChars}
                  onChange={e => updateKnowledge('polishMaxChars', Number(e.target.value))} />
              </FormField>
            </div>

            <div className="border border-slate-200 rounded-xl p-3 space-y-3 bg-slate-50">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-700">建房页 RAG 高级设置默认值</div>
                <button
                  type="button"
                  onClick={() => setShowRagHelp(true)}
                  className="text-[11px] px-2 py-1 rounded-md border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition-colors"
                >
                  ❓ 参数说明
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <FormField label="主题 TopN">
                  <input className="input font-mono text-sm" type="number" min={1} max={10} value={knowledge.roomDefaultTopicTopN}
                    onChange={e => updateKnowledge('roomDefaultTopicTopN', Number(e.target.value))} />
                </FormField>
                <FormField label="概念 TopN">
                  <input className="input font-mono text-sm" type="number" min={1} max={12} value={knowledge.roomDefaultConceptTopN}
                    onChange={e => updateKnowledge('roomDefaultConceptTopN', Number(e.target.value))} />
                </FormField>
                <FormField label="上下文最大字数">
                  <input className="input font-mono text-sm" type="number" min={200} max={4000} value={knowledge.roomDefaultContextMaxChars}
                    onChange={e => updateKnowledge('roomDefaultContextMaxChars', Number(e.target.value))} />
                </FormField>
                <FormField label="FTS 候选倍率">
                  <input className="input font-mono text-sm" type="number" min={1} max={20} value={knowledge.roomDefaultFtsMultiplier}
                    onChange={e => updateKnowledge('roomDefaultFtsMultiplier', Number(e.target.value))} />
                </FormField>
                <FormField label="FTS 最少候选数">
                  <input className="input font-mono text-sm" type="number" min={1} max={200} value={knowledge.roomDefaultFtsMinCandidates}
                    onChange={e => updateKnowledge('roomDefaultFtsMinCandidates', Number(e.target.value))} />
                </FormField>
                <FormField label="拼接分隔">
                  <select className="input text-sm" value={knowledge.roomDefaultJoinSeparator}
                    onChange={e => updateKnowledge('roomDefaultJoinSeparator', (e.target.value === 'double_newline' ? 'double_newline' : 'rule'))}>
                    <option value="rule">分隔线（---）</option>
                    <option value="double_newline">空行</option>
                  </select>
                </FormField>
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={knowledge.roomDefaultShowPolishedInChat}
                  onChange={e => updateKnowledge('roomDefaultShowPolishedInChat', e.target.checked)}
                />
                默认在聊天区显示 AI 教材摘录
              </label>
            </div>
            {showRagHelp && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
                style={{ background: 'rgba(15, 23, 42, 0.55)' }}
                onClick={() => setShowRagHelp(false)}
              >
                <div
                  className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-4"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-semibold text-slate-900">RAG 参数说明</h3>
                    <button
                      type="button"
                      className="text-sm px-2 py-1 rounded-md border border-slate-300 text-slate-700"
                      onClick={() => setShowRagHelp(false)}
                    >
                      关闭
                    </button>
                  </div>
                  <div className="space-y-2.5 text-sm max-h-[55vh] overflow-y-auto pr-1 text-slate-700">
                    {ADMIN_RAG_PARAM_DOCS.map(item => (
                      <div key={item.name}>
                        <div className="font-semibold text-slate-900">{item.name}</div>
                        <div>{item.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary text-xs py-1.5" onClick={handleCheckEmbedding} disabled={checkingEmbedding}>
                {checkingEmbedding ? 'Embedding 检测中...' : '检测 Embedding'}
              </button>
              <button type="button" className="btn-secondary text-xs py-1.5" onClick={handleCheckRerank} disabled={checkingRerank}>
                {checkingRerank ? 'Rerank 检测中...' : '检测 Rerank'}
              </button>
              <button type="button" className="btn-secondary text-xs py-1.5" onClick={handleCheckAuxiliary} disabled={checkingAuxiliary}>
                {checkingAuxiliary ? '辅助 LLM 检测中...' : '检测辅助 LLM'}
              </button>
            </div>
            {knowledgeCheckMsg && (
              <p className={`text-xs whitespace-pre-wrap ${knowledgeCheckMsg.startsWith('✅') ? 'text-green-600' : 'text-red-500'}`}>
                {knowledgeCheckMsg}
              </p>
            )}

            <div className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
              请求会按 SiliconFlow 官方接口结构发送：
              <span className="font-mono"> /embeddings</span> 使用嵌入模型，
              <span className="font-mono"> /rerank</span> 使用 <span className="font-mono">query</span>、<span className="font-mono">documents</span>、<span className="font-mono">top_n</span>，若填写上方指令则附带 <span className="font-mono">instruction</span>。
            </div>
          </div>
        </div>

        <div className="border border-indigo-100 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-indigo-800">辅助 LLM（可选）</div>
              <p className="text-xs text-indigo-700 mt-0.5">用于主模型前后置判定：RAG开关、检索改写、上下文守门、JSON修复、驳回理由润色。</p>
            </div>
            <label className="inline-flex items-center gap-2 text-sm font-medium text-indigo-800">
              <input type="checkbox" checked={aux.enabled} onChange={e => setAux(v => ({ ...v, enabled: e.target.checked }))} />
              启用辅助 LLM
            </label>
          </div>
          <div className="p-4 bg-white space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <FormField label="Provider Type">
                <select className="input text-sm" value={aux.providerType} onChange={e => setAux(v => ({ ...v, providerType: e.target.value }))}>
                  <option value="openai-compatible">openai-compatible</option>
                  <option value="anthropic">anthropic</option>
                  <option value="google">google</option>
                  <option value="glm">glm</option>
                </select>
              </FormField>
              <FormField label="Base URL">
                <input className="input font-mono text-sm" placeholder="https://api.deepseek.com/v1" value={aux.baseUrl}
                  onChange={e => setAux(v => ({ ...v, baseUrl: e.target.value }))} />
              </FormField>
              <FormField label="模型">
                <input className="input font-mono text-sm" placeholder="deepseek-chat" value={aux.model}
                  onChange={e => setAux(v => ({ ...v, model: e.target.value }))} />
              </FormField>
            </div>
            <FormField label="辅助 API Key">
              <input className="input font-mono text-sm" type="password" placeholder="sk-..." value={aux.apiKey}
                onChange={e => setAux(v => ({ ...v, apiKey: e.target.value }))} />
            </FormField>
            <FormField label="辅助 System Prompt（可选）">
              <textarea className="w-full text-xs font-mono border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 resize-none"
                rows={3} value={aux.systemPrompt} onChange={e => setAux(v => ({ ...v, systemPrompt: e.target.value }))} />
            </FormField>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-slate-700">
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={aux.sceneRagGate} onChange={e => setAux(v => ({ ...v, sceneRagGate: e.target.checked }))} />场景1：RAG启停判定</label>
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={aux.sceneQueryRewrite} onChange={e => setAux(v => ({ ...v, sceneQueryRewrite: e.target.checked }))} />场景2：检索Query改写</label>
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={aux.sceneContextGuard} onChange={e => setAux(v => ({ ...v, sceneContextGuard: e.target.checked }))} />场景3：RAG上下文守门</label>
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={aux.sceneJsonRepair} onChange={e => setAux(v => ({ ...v, sceneJsonRepair: e.target.checked }))} />场景4：JSON结果修复</label>
              <label className="inline-flex items-center gap-2 md:col-span-2"><input type="checkbox" checked={aux.sceneReasonRewrite} onChange={e => setAux(v => ({ ...v, sceneReasonRewrite: e.target.checked }))} />场景5：驳回原因短句化</label>
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
  const [vectorizingDocId, setVectorizingDocId] = useState<string | null>(null);
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

  async function handleVectorize(id: string, title: string) {
    setVectorizingDocId(id);
    setMsg('');
    try {
      const res = await adminVectorizeDoc(id);
      setMsg(`✅ 「${title}」向量化完成，共处理 ${res.vectorized} 个片段`);
    } catch (err: unknown) {
      setMsg(`❌ ${formatApiError(err, '向量化失败')}`);
    } finally {
      setVectorizingDocId(null);
    }
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
                  <div className="mt-1">
                    {doc.vectorized_at ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        已向量化 · {doc.vectorized_at.slice(0, 16).replace('T', ' ')}
                      </span>
                    ) : (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                        未向量化
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleVectorize(doc.id, doc.title)}
                    disabled={vectorizingDocId === doc.id}
                    className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {vectorizingDocId === doc.id ? '向量化中...' : '手动向量化'}
                  </button>
                  <button onClick={() => handleDelete(doc.id, doc.title)} className="text-xs text-red-400 hover:text-red-600 transition-colors px-2 py-1">
                    删除
                  </button>
                </div>
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
  const [batchCategoryId, setBatchCategoryId] = useState('');
  const [batchCategorizing, setBatchCategorizing] = useState(false);

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

  async function handleBatchCategorize(remove = false) {
    const conceptIds = Array.from(selected);
    if (!batchCategoryId || conceptIds.length === 0) return;
    setBatchCategorizing(true);
    try {
      const res = await adminCategorizeConceptsBatch(conceptIds, batchCategoryId, remove);
      showMsg(`${remove ? '批量移除分类' : '批量归类'}完成，处理 ${res.affected} 条`);
      reloadActive();
      setSelected(new Set());
    } catch {
      showMsg('批量分类失败', true);
    } finally {
      setBatchCategorizing(false);
    }
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
              {selected.size > 0 && categories.length > 0 && (
                <>
                  <select
                    value={batchCategoryId}
                    onChange={e => setBatchCategoryId(e.target.value)}
                    className="text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600"
                  >
                    <option value="">选择批量分类</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                  <button
                    disabled={!batchCategoryId || batchCategorizing}
                    onClick={() => handleBatchCategorize(false)}
                    className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg transition-colors font-medium"
                  >
                    {batchCategorizing ? '处理中...' : `批量归类 (${selected.size})`}
                  </button>
                  <button
                    disabled={!batchCategoryId || batchCategorizing}
                    onClick={() => handleBatchCategorize(true)}
                    className="text-xs px-3 py-1.5 bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 text-slate-700 rounded-lg transition-colors font-medium"
                  >
                    批量移除分类
                  </button>
                </>
              )}
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
                     selected.validation_method === 'rag+ai' ? 'RAG + AI' :
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
              {selected.ai_prompt && (
                <div>
                  <div className="text-xs font-semibold text-slate-600 mb-1.5">🧾 完整提示词（Prompt）</div>
                  <pre className="text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 overflow-x-auto whitespace-pre-wrap break-all text-slate-700 max-h-52 overflow-y-auto">
                    {selected.ai_prompt}
                  </pre>
                </div>
              )}
              {selected.ai_response && (
                <div>
                  <div className="text-xs font-semibold text-slate-600 mb-1.5">📤 AI 完整回复</div>
                  {(() => {
                    try {
                      const parsed = JSON.parse(selected.ai_response);
                      const rag = parsed?.rag;
                      const auxiliary = parsed?.auxiliary || rag?.auxTrace;
                      const rawOutput = parsed?.rawOutput;
                      const ragFlow = rag?.flow;
                      return (
                        <div className="space-y-2 mb-2">
                          {rag && (
                            <div className="text-xs bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 text-indigo-700">
                              <div className="font-semibold mb-1">RAG 全流程</div>
                              <div>是否启用：{rag.used ? '是' : '否'}</div>
                              <div className="mt-1 whitespace-pre-wrap break-all">
                                检索上下文：{rag.context ? String(rag.context) : '（空）'}
                              </div>
                              {ragFlow && (
                                <pre className="mt-2 text-[11px] font-mono bg-white/70 border border-indigo-100 rounded p-2 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                                  {JSON.stringify(ragFlow, null, 2)}
                                </pre>
                              )}
                            </div>
                          )}
                          {rawOutput && (
                            <div>
                              <div className="text-xs font-semibold text-slate-600 mb-1">🧠 模型原始输出</div>
                              <pre className="text-xs font-mono bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 overflow-x-auto whitespace-pre-wrap break-all text-amber-900 max-h-52 overflow-y-auto">
                                {String(rawOutput)}
                              </pre>
                            </div>
                          )}
                          {auxiliary && (
                            <div className="text-xs bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 text-emerald-700">
                              <div className="font-semibold mb-1">🧩 辅助 LLM 日志</div>
                              <pre className="mt-1 text-[11px] font-mono bg-white/70 border border-emerald-100 rounded p-2 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                                {JSON.stringify(auxiliary, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    } catch {
                      return null;
                    }
                  })()}
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
                        {d.validation_method === 'kb' ? 'KB' : d.validation_method === 'cache' ? '缓存' : d.validation_method === 'rag+ai' ? 'RAG' : 'AI'}
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
        <strong>AI 完整回复</strong>：显示每次验证中 AI 返回的完整 JSON（包括 difficulty、tags 等字段）、完整 Prompt、模型原始输出，以及 RAG 是否启用与检索上下文全流程。点击「查看」可展开完整内容。
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
