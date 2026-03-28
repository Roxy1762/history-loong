import { useState, useEffect } from 'react';
import { exportGame, getExportFormats } from '../services/api';

interface Props {
  gameId: string;
  onClose: () => void;
}

const FORMAT_INFO: Record<string, { label: string; icon: string; desc: string; color: string }> = {
  json:     { label: 'JSON',     icon: '{}',  desc: '结构化数据，适合二次开发', color: 'bg-blue-50 text-blue-600 border-blue-200' },
  markdown: { label: 'Markdown', icon: '#',   desc: '带格式文本，适合 Notion / Obsidian', color: 'bg-purple-50 text-purple-600 border-purple-200' },
  csv:      { label: 'CSV',      icon: '≡',   desc: '表格数据，适合 Excel 分析', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  html:     { label: 'HTML',     icon: '◱',   desc: '可视化网页，直接在浏览器打开', color: 'bg-orange-50 text-orange-600 border-orange-200' },
};

export default function ExportPanel({ gameId, onClose }: Props) {
  const [formats, setFormats] = useState(['json', 'markdown', 'csv']);
  const [selected, setSelected] = useState('markdown');
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getExportFormats().then(setFormats).catch(() => {});
  }, []);

  async function handleExport() {
    setExporting(true); setError(''); setDone(false);
    try {
      await exportGame(gameId, selected);
      setDone(true);
    } catch { setError('导出失败，请重试'); }
    finally { setExporting(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm animate-slide-up">
        {/* Handle bar */}
        <div className="flex justify-center pt-4 sm:hidden">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">导出成果</h2>
            <p className="text-xs text-slate-400 mt-0.5">时间轴 + 完整聊天记录</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Format picker */}
        <div className="p-5 space-y-2.5">
          {formats.map(fmt => {
            const info = FORMAT_INFO[fmt] || { label: fmt.toUpperCase(), icon: '📁', desc: '', color: 'bg-slate-50 text-slate-600 border-slate-200' };
            return (
              <label key={fmt}
                className={`flex items-center gap-4 p-3.5 rounded-2xl border-2 cursor-pointer transition-all
                  ${selected === fmt ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-100 hover:border-slate-200'}`}>
                <input type="radio" name="fmt" value={fmt} checked={selected === fmt}
                  onChange={() => setSelected(fmt)} className="accent-indigo-500 sr-only" />
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono font-bold text-sm border ${info.color}`}>
                  {info.icon}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm text-slate-800">{info.label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{info.desc}</div>
                </div>
                {selected === fmt && (
                  <div className="w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center shrink-0">
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
            ) : (
              `下载 ${(FORMAT_INFO[selected]?.label || selected)} 文件`
            )}
          </button>
          <button className="btn-secondary w-full py-2.5 text-sm" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}
