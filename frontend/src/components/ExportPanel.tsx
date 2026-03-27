import { useState, useEffect } from 'react';
import { exportGame, getExportFormats } from '../services/api';

interface Props {
  gameId: string;
  onClose: () => void;
}

const FORMAT_LABELS: Record<string, { label: string; icon: string; desc: string }> = {
  json:     { label: 'JSON',     icon: '📄', desc: '结构化数据，适合二次开发' },
  markdown: { label: 'Markdown', icon: '📝', desc: '带格式的文本，适合笔记工具' },
  csv:      { label: 'CSV',      icon: '📊', desc: '表格数据，适合 Excel 分析' },
};

export default function ExportPanel({ gameId, onClose }: Props) {
  const [formats, setFormats] = useState<string[]>(['json', 'markdown', 'csv']);
  const [selected, setSelected] = useState('json');
  const [exporting, setExporting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getExportFormats().then(setFormats).catch(() => {});
  }, []);

  async function handleExport() {
    setExporting(true);
    setError('');
    setSuccess(false);
    try {
      await exportGame(gameId, selected);
      setSuccess(true);
    } catch {
      setError('导出失败，请重试');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800">导出成果</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Format picker */}
        <div className="p-5 space-y-3">
          <p className="text-sm text-slate-500 mb-3">选择导出格式：</p>
          {formats.map((fmt) => {
            const info = FORMAT_LABELS[fmt] || { label: fmt.toUpperCase(), icon: '📁', desc: '' };
            return (
              <label
                key={fmt}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors
                  ${selected === fmt ? 'border-brand-400 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <input
                  type="radio"
                  name="format"
                  value={fmt}
                  checked={selected === fmt}
                  onChange={() => setSelected(fmt)}
                  className="accent-brand-500"
                />
                <span className="text-xl">{info.icon}</span>
                <div>
                  <div className="font-medium text-sm text-slate-800">{info.label}</div>
                  {info.desc && <div className="text-xs text-slate-500">{info.desc}</div>}
                </div>
              </label>
            );
          })}
        </div>

        {/* Export includes */}
        <div className="px-5 pb-3">
          <p className="text-xs text-slate-400">导出内容包括：时间轴（已验证概念）+ 完整聊天记录</p>
        </div>

        {/* Actions */}
        <div className="p-5 pt-2 space-y-2">
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          {success && <p className="text-sm text-green-600 text-center">✓ 文件已下载</p>}
          <button
            className="btn-primary w-full"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? '导出中...' : `下载 ${(FORMAT_LABELS[selected]?.label || selected).toUpperCase()}`}
          </button>
          <button className="btn-secondary w-full" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
