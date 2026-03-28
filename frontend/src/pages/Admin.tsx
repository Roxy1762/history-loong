import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  setAdminKey, getAdminKey,
  adminGetStats, adminListAIConfigs, adminCreateAIConfig, adminUpdateAIConfig,
  adminActivateAIConfig, adminTestAIConfig, adminDeleteAIConfig,
  adminListDocs, adminUploadDoc, adminAddTextDoc, adminDeleteDoc,
  type AIConfig, type KnowledgeDoc,
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

type Tab = 'overview' | 'ai-config' | 'knowledge';

const NAV_ITEMS: { id: Tab; icon: string; label: string }[] = [
  { id: 'overview',   icon: '📊', label: '概览' },
  { id: 'ai-config',  icon: '🤖', label: 'AI 配置' },
  { id: 'knowledge',  icon: '📚', label: '知识库' },
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
          <p className="text-center text-xs text-slate-600 select-none">v0.1.0</p>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto p-6">
          {tab === 'overview'  && <OverviewPanel />}
          {tab === 'ai-config' && <AIConfigPanel />}
          {tab === 'knowledge' && <KnowledgePanel />}
        </div>
      </main>
    </div>
  );
}

// ── Panel: Overview ───────────────────────────────────────────────────────────

function OverviewPanel() {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [games, setGames] = useState<Game[]>([]);

  useEffect(() => {
    adminGetStats().then(d => { setStats(d.stats); setGames(d.recentGames); }).catch(() => {});
  }, []);

  const STAT_CARDS = [
    { key: 'total_games',      label: '总游戏数', icon: '🎮', color: 'bg-indigo-50 text-indigo-600' },
    { key: 'total_concepts',   label: '有效概念', icon: '📌', color: 'bg-emerald-50 text-emerald-600' },
    { key: 'total_docs',       label: '知识库文档', icon: '📄', color: 'bg-amber-50 text-amber-600' },
    { key: 'total_ai_configs', label: 'AI 配置', icon: '🤖', color: 'bg-purple-50 text-purple-600' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="概览" subtitle="系统运行状态一览" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STAT_CARDS.map(c => (
          <div key={c.key} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3 ${c.color}`}>
              {c.icon}
            </div>
            <div className="text-3xl font-bold text-slate-800">{stats[c.key] ?? '–'}</div>
            <div className="text-sm text-slate-500 mt-1">{c.label}</div>
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
