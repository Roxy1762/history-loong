import { useState } from 'react';
import type { Concept } from '../types';

interface Props {
  timeline: Concept[];
  newestId?: string;
}

function formatYear(year: number | null): string {
  if (year == null) return '年代不详';
  if (year < 0) return `公元前 ${Math.abs(year)} 年`;
  return `公元 ${year} 年`;
}

export default function Timeline({ timeline, newestId }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (timeline.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 py-16 gap-3">
        <div className="text-5xl">📅</div>
        <p className="text-sm">时间轴空空如也</p>
        <p className="text-xs">提交历史概念后自动归入时间轴</p>
      </div>
    );
  }

  // Group by era
  const groups: Record<string, Concept[]> = {};
  for (const c of timeline) {
    const era = c.eraLabel || '年代不详';
    if (!groups[era]) groups[era] = [];
    groups[era].push(c);
  }

  return (
    <div className="overflow-y-auto h-full px-4 py-4 space-y-6">
      {Object.entries(groups).map(([era, concepts]) => (
        <div key={era}>
          {/* Era heading */}
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-slate-200" />
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
              {era}
            </span>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-slate-200" />
          </div>

          {/* Concept cards */}
          <div className="relative pl-6 space-y-3">
            {/* Vertical line */}
            <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-slate-200" />

            {concepts.map((c) => (
              <ConceptCard
                key={c.id}
                concept={c}
                isNew={c.id === newestId}
                expanded={expandedId === c.id}
                onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── ConceptCard ────────────────────────────────────────────────────────────────

interface CardProps {
  concept: Concept;
  isNew: boolean;
  expanded: boolean;
  onToggle: () => void;
}

function ConceptCard({ concept: c, isNew, expanded, onToggle }: CardProps) {
  return (
    <div className={`relative animate-slide-up ${isNew ? 'ring-2 ring-brand-300 ring-offset-1' : ''} rounded-lg`}>
      {/* Timeline dot */}
      <div
        className={`absolute -left-[25px] top-3.5 w-3 h-3 rounded-full border-2 border-white shadow-sm z-10
          ${isNew ? 'bg-brand-500 timeline-dot-new' : 'bg-brand-300'}`}
      />

      <button
        onClick={onToggle}
        className="w-full text-left bg-white rounded-lg border border-slate-100 shadow-sm hover:border-brand-200 transition-colors p-3"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-800 text-sm">{c.name}</span>
              {c.dynasty && (
                <span className="text-xs px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded border border-amber-200">
                  {c.dynasty}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {formatYear(c.year)}
              {c.period && c.period !== formatYear(c.year) && (
                <span className="ml-1 text-slate-300">· {c.period}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <PlayerBadge name={c.player_name} />
            <svg
              className={`w-3.5 h-3.5 text-slate-300 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Tags */}
        {c.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {c.tags.map((tag) => (
              <span key={tag} className="text-xs px-1.5 py-0.5 bg-brand-50 text-brand-600 rounded">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Expanded description */}
        {expanded && c.description && (
          <p className="mt-2 text-sm text-slate-600 border-t border-slate-50 pt-2 text-left">
            {c.description}
          </p>
        )}
      </button>
    </div>
  );
}

function PlayerBadge({ name }: { name: string }) {
  return (
    <span className="text-xs text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
      {name}
    </span>
  );
}
