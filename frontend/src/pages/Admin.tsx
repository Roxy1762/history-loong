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
  adminUpdateGameNotes, adminUpdateGameSettings, adminRestoreGame,
  adminGetLogs,
  adminListAIConfirmed, adminDeleteAIConfirmed, adminClearAIConfirmed,
  adminGetCurationPending, adminGetCurationActive,
  adminApproveConcept, adminApproveAll, adminArchiveConcept, adminRejectConcept,
  adminEditConcept, adminMergeConcepts,
  adminListCategories, adminCreateCategory, adminDeleteCategory, adminCategorizeConcept,
  type AIConfig, type KnowledgeDoc, type AdminGame, type LogEntry, type AIConfirmedDoc,
  type CurationConcept, type Category,
} from '../services/api';
import type { Game } from '../types';

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

type Tab = 'overview' | 'games' | 'ai-config' | 'knowledge' | 'ai-confirmed' | 'curation' | 'logs';

const NAV_ITEMS: { id: Tab; icon: string; label: string }[] = [
  { id: 'overview',      icon: '📊', label: '概览' },
  { id: 'games',         icon: '🎮', label: '游戏管理' },
  { id: 'ai-config',     icon: '🤖', label: 'AI 配置' },
  { id: 'knowledge',     icon: '📚', label: '知识库' },
  { id: 'ai-confirmed',  icon: '✅', label: 'AI 确认知识库' },
  { id: 'curation',      icon: '🎯', label: '知识策展' },
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
          {tab === 'curation'     && <CurationPanel />}
          {tab === 'logs'         && <LogsPanel />}
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
                    <ModeChip mode={g.mode} />
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

function ModeChip({ mode }: { mode: string }) {
  const map: Record<string, string> = { free: '自由', chain: '关联', ordered: '时序' };
  return <span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-600 rounded">{map[mode] || mode}</span>;
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

// ── Panel: Games Management ──────────────────────────────────────────────────

function GameRow({ game, onAction }: { game: AdminGame; onAction: (msg: string) => void }) {
  const [expanded,    setExpanded]    = useState(false);
  const [notes,       setNotes]       = useState((game as AdminGame & { notes?: string }).notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [settingsStr, setSettingsStr] = useState(JSON.stringify(game.settings, null, 2));
  const [savingSettings, setSavingSettings] = useState(false);

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
        <td className="px-4 py-3"><ModeChip mode={game.mode} /></td>
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
          <div className="flex items-center gap-1">
            <button onClick={() => setExpanded(e => !e)}
              className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors">
              详情
            </button>
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
        subtitle="管理 AI 接口，支持 Anthropic Claude 及任意 OpenAI 兼容接口"
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
          {configs.map(cfg => (
            <div
              key={cfg.id}
              className={`bg-white rounded-2xl border shadow-sm p-5 transition-all
                ${cfg.is_active ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-slate-100'}`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl
                    ${cfg.provider_type === 'anthropic' ? 'bg-orange-50' : 'bg-blue-50'}`}>
                    {cfg.provider_type === 'anthropic' ? '🔶' : '🔷'}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800 flex items-center gap-2">
                      {cfg.name}
                      {cfg.is_active === 1 && (
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-normal">当前使用</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {cfg.provider_type === 'anthropic' ? 'Anthropic Claude' : cfg.base_url}
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

              {testResult[cfg.id] && (
                <div className={`mt-3 text-xs px-3 py-2 rounded-lg
                  ${testResult[cfg.id].startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                  {testResult[cfg.id]}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <InfoBox>
        <strong>支持的接口类型：</strong>
        <ul className="mt-1 space-y-0.5 list-disc list-inside">
          <li><strong>Anthropic</strong> — 填入 API Key，选择 claude-* 模型</li>
          <li><strong>OpenAI Compatible</strong> — 填入 Base URL + API Key，支持 OpenAI、DeepSeek、Qwen、月之暗面、本地 Ollama 等所有兼容接口</li>
        </ul>
      </InfoBox>
    </div>
  );
}

function AIConfigForm({ initial, onClose, onSaved }: {
  initial: AIConfig | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name:          initial?.name          ?? '',
    provider_type: initial?.provider_type ?? 'openai-compatible',
    base_url:      initial?.base_url      ?? '',
    api_key:       initial ? '••••••••' : '',
    model:         initial?.model         ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  function update(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  const PRESETS: { label: string; base_url: string; model: string }[] = [
    { label: 'OpenAI',    base_url: 'https://api.openai.com/v1',         model: 'gpt-4o' },
    { label: 'DeepSeek',  base_url: 'https://api.deepseek.com/v1',       model: 'deepseek-chat' },
    { label: 'Qwen',      base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-max' },
    { label: 'Moonshot',  base_url: 'https://api.moonshot.cn/v1',        model: 'moonshot-v1-8k' },
    { label: 'Ollama',    base_url: 'http://localhost:11434/v1',          model: 'llama3' },
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr('');
    try {
      if (initial) {
        const payload: Partial<AIConfig> = { ...form };
        if (form.api_key === '••••••••') delete payload.api_key;
        await adminUpdateAIConfig(initial.id, payload);
      } else {
        await adminCreateAIConfig({ ...form, extra: {} });
      }
      onSaved();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

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
            </select>
          </FormField>
        </div>

        {form.provider_type === 'openai-compatible' && (
          <FormField label="Base URL">
            <div className="space-y-2">
              <input className="input font-mono text-sm" placeholder="https://api.openai.com/v1" value={form.base_url} onChange={e => update('base_url', e.target.value)} required />
              <div className="flex flex-wrap gap-1">
                {PRESETS.map(p => (
                  <button key={p.label} type="button" onClick={() => setForm(f => ({ ...f, base_url: p.base_url, model: p.model }))}
                    className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full hover:bg-indigo-100 hover:text-indigo-700 transition-colors">
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </FormField>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="API Key">
            <input className="input font-mono text-sm" type="password" placeholder="sk-..." value={form.api_key} onChange={e => update('api_key', e.target.value)} required={!initial} />
          </FormField>
          <FormField label="模型名称">
            <input className="input font-mono text-sm" placeholder="claude-sonnet-4-6 / gpt-4o / ..." value={form.model} onChange={e => update('model', e.target.value)} required />
          </FormField>
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
