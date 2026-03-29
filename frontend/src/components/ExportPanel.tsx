import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { exportGame, getExportFormats, importGame } from '../services/api';

interface Props {
  gameId: string;
  onClose: () => void;
}

const FORMAT_INFO: Record<string, { label: string; icon: string; desc: string; color: string }> = {
  json:     { label: 'JSON',     icon: '{}',  desc: '结构化数据，可重新导入恢复', color: 'bg-blue-50 text-blue-600 border-blue-200' },
  markdown: { label: 'Markdown', icon: '#',   desc: '带格式文本，适合 Notion / Obsidian', color: 'bg-purple-50 text-purple-600 border-purple-200' },
  csv:      { label: 'CSV',      icon: '≡',   desc: '表格数据，适合 Excel 分析', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  html:     { label: 'HTML',     icon: '◱',   desc: '可视化网页，直接在浏览器打开', color: 'bg-orange-50 text-orange-600 border-orange-200' },
};

export default function ExportPanel({ gameId, onClose }: Props) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [formats, setFormats] = useState(['json', 'markdown', 'csv']);
  const [selected, setSelected] = useState('markdown');
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  // Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ gameId: string; concepts: number; messages: number } | null>(null);
  const [importError, setImportError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getExportFormats().then(setFormats).catch(() => {});
  }, []);

  async function handleExport() {
    setExporting(true); setError(''); setDone(false);
    try {
      await exportGame(gameId, selected as 'json' | 'markdown' | 'csv' | 'html');
      setDone(true);
    } catch { setError('导出失败，请重试'); }
    finally { setExporting(false); }
  }

  async function handleImport() {
    if (!importFile) return;
    setImporting(true); setImportError(''); setImportResult(null);
    try {
      const text = await importFile.text();
      const json = JSON.parse(text);
      const result = await importGame(json);
      setImportResult({
        gameId: result.game.id,
        concepts: result.importedConcepts,
        messages: result.importedMessages,
      });
    } catch (err) {
      setImportError(err instanceof Error ? `导入失败：${err.message}` : '导入失败，请确认文件格式正确');
    } finally {
      setImporting(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.json')) setImportFile(file);
    else setImportError('请选择 .json 格式的导出文件');
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
      <div
        className="rounded-3xl shadow-2xl w-full max-w-sm animate-slide-up"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-4 sm:hidden">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />
        </div>

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
          {(['export', 'import'] as const).map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className="flex-1 py-3 text-sm font-semibold transition-colors relative"
              style={{ color: activeTab === t ? 'var(--brand)' : 'var(--text-muted)' }}
            >
              {t === 'export' ? '📤 导出成果' : '📥 导入恢复'}
              {activeTab === t && (
                <span
                  className="absolute bottom-0 left-4 right-4 h-0.5 rounded-t-full"
                  style={{ background: 'var(--brand)' }}
                />
              )}
            </button>
          ))}
          <button
            onClick={onClose}
            className="px-4 py-3 transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {activeTab === 'export' ? (
          <>
            {/* Format picker */}
            <div className="p-5 space-y-2.5">
              <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>时间轴 + 完整聊天记录</p>
              {formats.map(fmt => {
                const info = FORMAT_INFO[fmt] || { label: fmt.toUpperCase(), icon: '📁', desc: '', color: 'bg-slate-50 text-slate-600 border-slate-200' };
                return (
                  <label
                    key={fmt}
                    className={`flex items-center gap-4 p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                      selected === fmt ? 'selected' : ''
                    }`}
                    style={{
                      borderColor: selected === fmt ? 'var(--brand)' : 'var(--border)',
                      background: selected === fmt ? 'var(--brand-light)' : 'transparent',
                    }}
                  >
                    <input type="radio" name="fmt" value={fmt} checked={selected === fmt}
                      onChange={() => setSelected(fmt)} className="accent-indigo-500 sr-only" />
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono font-bold text-sm border ${info.color}`}>
                      {info.icon}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{info.label}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{info.desc}</div>
                    </div>
                    {selected === fmt && (
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: 'var(--brand)' }}
                      >
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </label>
                );
              })}
            </div>

            {/* Actions */}
            <div className="px-5 pb-6 space-y-2">
              {error && <p className="text-sm text-red-500 text-center bg-red-50 rounded-xl py-2 border border-red-100">{error}</p>}
              {done  && <p className="text-sm text-emerald-600 text-center bg-emerald-50 rounded-xl py-2 border border-emerald-100">✅ 文件已下载到本地</p>}
              <button className="btn-primary w-full py-3 text-sm" onClick={handleExport} disabled={exporting}>
                {exporting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    导出中...
                  </span>
                ) : `下载 ${(FORMAT_INFO[selected]?.label || selected)} 文件`}
              </button>
            </div>
          </>
        ) : (
          /* Import tab */
          <div className="p-5 space-y-4">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              上传之前导出的 <strong>JSON</strong> 文件，系统将创建一个新的恢复房间。
            </p>

            {importResult ? (
              <div className="space-y-3">
                <div
                  className="rounded-2xl p-4 text-center border"
                  style={{ background: 'var(--brand-light)', borderColor: 'color-mix(in srgb, var(--brand) 30%, transparent)' }}
                >
                  <div className="text-3xl mb-2">✅</div>
                  <div className="font-semibold text-sm mb-1" style={{ color: 'var(--brand)' }}>导入成功！</div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    新房间 <code className="font-mono font-bold">{importResult.gameId}</code>
                    <br />导入了 {importResult.concepts} 个概念，{importResult.messages} 条消息
                  </div>
                </div>
                <button
                  className="btn-primary w-full py-3"
                  onClick={() => navigate(`/game/${importResult.gameId}`)}
                >
                  进入恢复的房间 →
                </button>
                <button className="btn-secondary w-full py-2 text-sm" onClick={() => setImportResult(null)}>
                  重新导入
                </button>
              </div>
            ) : (
              <>
                {/* Drop zone */}
                <div
                  className="border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all"
                  style={{
                    borderColor: importFile ? 'var(--brand)' : 'var(--border)',
                    background: importFile ? 'var(--brand-light)' : 'var(--bg-muted)',
                  }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) setImportFile(f);
                    }}
                  />
                  {importFile ? (
                    <>
                      <div className="text-2xl mb-1">📄</div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--brand)' }}>{importFile.name}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {(importFile.size / 1024).toFixed(1)} KB · 点击重新选择
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-3xl mb-2">📁</div>
                      <div className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                        拖拽或点击选择 JSON 文件
                      </div>
                      <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                        仅支持历史接龙导出的 JSON 格式
                      </div>
                    </>
                  )}
                </div>

                {importError && (
                  <p className="text-sm text-red-500 text-center bg-red-50 rounded-xl py-2 border border-red-100 animate-slide-down">
                    {importError}
                  </p>
                )}

                <button
                  className="btn-primary w-full py-3 text-sm"
                  onClick={handleImport}
                  disabled={!importFile || importing}
                >
                  {importing ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      导入中...
                    </span>
                  ) : '导入并恢复游戏'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
