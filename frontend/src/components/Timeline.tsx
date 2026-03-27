import { useState } from 'react';
import type { Concept } from '../types';

interface Props {
  timeline: Concept[];
  newestId?: string;
}

// ── Era color mapping ─────────────────────────────────────────────────────────

const ERA_COLORS: Record<string, { dot: string; badge: string; line: string }> = {
  '夏':      { dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 border-amber-200',   line: 'bg-amber-200' },
  '商':      { dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200',   line: 'bg-amber-200' },
  '西周':    { dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 border-amber-200',   line: 'bg-amber-200' },
  '春秋':    { dot: 'bg-orange-400',  badge: 'bg-orange-50 text-orange-700 border-orange-200', line: 'bg-orange-200' },
  '战国':    { dot: 'bg-orange-500',  badge: 'bg-orange-50 text-orange-700 border-orange-200', line: 'bg-orange-200' },
  '秦':      { dot: 'bg-red-500',     badge: 'bg-red-50 text-red-700 border-red-200',         line: 'bg-red-200' },
  '西汉':    { dot: 'bg-rose-400',    badge: 'bg-rose-50 text-rose-700 border-rose-200',       line: 'bg-rose-200' },
  '新':      { dot: 'bg-rose-300',    badge: 'bg-rose-50 text-rose-600 border-rose-200',       line: 'bg-rose-200' },
  '东汉':    { dot: 'bg-rose-500',    badge: 'bg-rose-50 text-rose-700 border-rose-200',       line: 'bg-rose-200' },
  '三国':    { dot: 'bg-purple-400',  badge: 'bg-purple-50 text-purple-700 border-purple-200', line: 'bg-purple-200' },
  '西晋':    { dot: 'bg-purple-300',  badge: 'bg-purple-50 text-purple-600 border-purple-200', line: 'bg-purple-200' },
  '东晋':    { dot: 'bg-purple-400',  badge: 'bg-purple-50 text-purple-700 border-purple-200', line: 'bg-purple-200' },
  '南北朝':  { dot: 'bg-violet-400',  badge: 'bg-violet-50 text-violet-700 border-violet-200', line: 'bg-violet-200' },
  '隋':      { dot: 'bg-sky-400',     badge: 'bg-sky-50 text-sky-700 border-sky-200',          line: 'bg-sky-200' },
  '唐':      { dot: 'bg-sky-500',     badge: 'bg-sky-50 text-sky-700 border-sky-200',          line: 'bg-sky-200' },
  '五代十国':{ dot: 'bg-blue-300',    badge: 'bg-blue-50 text-blue-600 border-blue-200',       line: 'bg-blue-200' },
  '宋':      { dot: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 border-blue-200',       line: 'bg-blue-200' },
  '元':      { dot: 'bg-teal-500',    badge: 'bg-teal-50 text-teal-700 border-teal-200',       line: 'bg-teal-200' },
  '明':      { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', line: 'bg-emerald-200' },
  '清':      { dot: 'bg-green-500',   badge: 'bg-green-50 text-green-700 border-green-200',    line: 'bg-green-200' },
  '中华民国':{ dot: 'bg-indigo-400',  badge: 'bg-indigo-50 text-indigo-700 border-indigo-200', line: 'bg-indigo-200' },
  '中华人民共和国': { dot: 'bg-indigo-600', badge: 'bg-indigo-50 text-indigo-800 border-indigo-300', line: 'bg-indigo-300' },
};

const DEFAULT_COLOR = { dot: 'bg-slate-400', badge: 'bg-slate-50 text-slate-600 border-slate-200', line: 'bg-slate-200' };

function getEraColor(eraLabel = '') {
  for (const [key, val] of Object.entries(ERA_COLORS)) {
    if (eraLabel.includes(key)) return val;
  }
  return DEFAULT_COLOR;
}

function formatYear(year: number | null): string {
  if (year == null) return '年代不详';
  if (year < 0) return `前 ${Math.abs(year)} 年`;
  return `${year} 年`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Timeline({ timeline, newestId }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (timeline.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 gap-3 text-slate-400">
        <div className="text-6xl opacity-50">📅</div>
        <p className="font-medium">时间轴空空如也</p>
        <p className="text-sm">提交历史概念后自动出现</p>
      </div>
    );
  }

  // Group by era
  const groups: { era: string; concepts: Concept[] }[] = [];
  for (const c of timeline) {
    const era = c.eraLabel || '年代不详';
    const last = groups[groups.length - 1];
    if (last && last.era === era) {
      last.concepts.push(c);
    } else {
      groups.push({ era, concepts: [c] });
    }
  }

  return (
    <div className="h-full overflow-y-auto px-5 py-5 space-y-8">
      {groups.map(({ era, concepts }) => {
        const color = getEraColor(era);
        return (
          <div key={era} className="animate-fade-in">
            {/* Era header */}
            <div className="flex items-center gap-3 mb-4">
              <div className={`h-px flex-1 ${color.line}`} />
              <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${color.badge}`}>
                {era}
              </span>
              <div className={`h-px flex-1 ${color.line}`} />
            </div>

            {/* Concept list */}
            <div className="relative pl-7 space-y-3">
              {/* Vertical connector */}
              <div className={`absolute left-[11px] top-2 bottom-2 w-0.5 ${color.line} rounded-full`} />

              {concepts.map(c => (
                <ConceptCard
                  key={c.id}
                  concept={c}
                  color={color}
                  isNew={c.id === newestId}
                  expanded={expandedId === c.id}
                  onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── ConceptCard ────────────────────────────────────────────────────────────────

interface CardProps {
  concept: Concept;
  color: { dot: string; badge: string; line: string };
  isNew: boolean;
  expanded: boolean;
  onToggle: () => void;
}

function ConceptCard({ concept: c, color, isNew, expanded, onToggle }: CardProps) {
  return (
    <div className={`relative animate-slide-up`}>
      {/* Timeline dot */}
      <div className={`absolute -left-[26px] top-4 w-3.5 h-3.5 rounded-full border-2 border-white shadow z-10
        ${color.dot} ${isNew ? 'timeline-dot-new scale-125' : ''}`} />

      <button
        onClick={onToggle}
        className={`w-full text-left bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all
          ${isNew ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-100 hover:border-slate-200'}`}
      >
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-slate-800">{c.name}</span>
                {c.dynasty && (
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${color.badge}`}>
                    {c.dynasty}
                  </span>
                )}
                {isNew && (
                  <span className="text-xs px-2 py-0.5 bg-indigo-500 text-white rounded-full font-medium animate-pulse">
                    新
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs text-slate-400 font-mono">{formatYear(c.year)}</span>
                {c.period && c.period !== `${formatYear(c.year)}` && (
                  <>
                    <span className="text-slate-200">·</span>
                    <span className="text-xs text-slate-400 truncate max-w-[160px]">{c.period}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
              <span className="text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
                {c.player_name}
              </span>
              <svg className={`w-4 h-4 text-slate-300 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* Tags */}
          {c.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2.5">
              {c.tags.map(tag => (
                <span key={tag} className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-100">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Expanded */}
          {expanded && c.description && (
            <div className="mt-3 pt-3 border-t border-slate-50 text-sm text-slate-600 leading-relaxed text-left">
              {c.description}
            </div>
          )}
        </div>
      </button>
    </div>
  );
}
