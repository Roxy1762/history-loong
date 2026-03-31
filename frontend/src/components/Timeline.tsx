import { useState, memo, useCallback } from 'react';
import type { Concept } from '../types';
import { useGameStore } from '../store/gameStore';

interface Props {
  timeline: Concept[];
  pendingConcepts?: Concept[];
  newestId?: string;
  onValidateConcept?: (conceptId: string) => void;
  validatingConceptIds?: Set<string>;
  isDeferred?: boolean;
  selectedPendingIds?: Set<string>;
  me?: { id: string } | null;
  isAdmin?: boolean;
  editingConceptId?: string | null;
  editingInput?: string;
  onStartEdit?: (id: string, current: string) => void;
  onEditInputChange?: (v: string) => void;
  onConfirmEdit?: () => void;
  onCancelEdit?: () => void;
  onDeleteConcept?: (id: string, name: string) => void;
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

// Difficulty stars (1–5) from concept.extra.difficulty
function DifficultyStars({ difficulty }: { difficulty?: unknown }) {
  const d = Math.max(1, Math.min(5, parseInt(String(difficulty)) || 0));
  if (!d) return null;
  const colors = ['', 'text-slate-300', 'text-slate-400', 'text-amber-400', 'text-orange-500', 'text-red-500'];
  return (
    <span title={`冷僻程度 ${d}/5`} className={`text-xs ${colors[d] || 'text-slate-300'}`}>
      {'★'.repeat(d)}{'☆'.repeat(5 - d)}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

const Timeline = memo(function Timeline({
  timeline,
  pendingConcepts = [],
  newestId,
  onValidateConcept,
  validatingConceptIds = new Set(),
  isDeferred = false,
  selectedPendingIds,
  me,
  isAdmin = false,
  editingConceptId,
  editingInput = '',
  onStartEdit,
  onEditInputChange,
  onConfirmEdit,
  onCancelEdit,
  onDeleteConcept,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { toggleSelectedPending } = useGameStore();

  // Use store's selectedPendingIds if not passed directly (bridge)
  const storeSelected = useGameStore(s => s.selectedPendingIds);
  const effectiveSelected = selectedPendingIds ?? storeSelected;

  if (timeline.length === 0 && pendingConcepts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 gap-3" style={{ color: 'var(--text-muted)' }}>
        <div className="text-6xl opacity-50 animate-float font-heading">轴</div>
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

  // Select all / deselect all helper shown when there are pending concepts in deferred mode
  const allSelected = pendingConcepts.length > 0 &&
    pendingConcepts.every(c => effectiveSelected.has(c.id));

  function handleSelectAll() {
    if (allSelected) {
      pendingConcepts.forEach(c => {
        if (effectiveSelected.has(c.id)) toggleSelectedPending(c.id);
      });
    } else {
      pendingConcepts.forEach(c => {
        if (!effectiveSelected.has(c.id)) toggleSelectedPending(c.id);
      });
    }
  }

  return (
    <div className="h-full overflow-y-auto px-5 py-5 space-y-8">
      {/* Pending section */}
      {pendingConcepts.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
            <span className="text-xs font-heading font-bold px-3 py-1.5 rounded-full animate-pulse"
              style={{ background: 'color-mix(in srgb, var(--gold-accent) 12%, var(--bg-card))', color: 'var(--gold-accent)', border: '1px solid color-mix(in srgb, var(--gold-accent) 30%, transparent)' }}>
              待验证 ({pendingConcepts.length})
            </span>
            {isDeferred && (
              <button
                onClick={handleSelectAll}
                className="text-xs underline transition-colors"
                style={{ color: 'var(--brand)' }}
              >
                {allSelected ? '取消全选' : '全选'}
              </button>
            )}
            <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
          </div>
          <div className="relative pl-7 space-y-2">
            <div className="absolute left-[11px] top-2 bottom-2 w-0.5 rounded-full" style={{ background: 'var(--border)' }} />
            {pendingConcepts.map(c => {
              const isValidating = validatingConceptIds.has(c.id);
              const isSelected = effectiveSelected.has(c.id);
              const isEditing = editingConceptId === c.id;
              const canEdit = !isValidating && (isAdmin || c.player_id === me?.id);
              return (
                <div key={c.id} className="relative animate-spring-in">
                  <div className={`absolute -left-[26px] top-3.5 w-3.5 h-3.5 rounded-full border-2 shadow z-10 ${isValidating ? 'animate-pulse' : ''}`}
                    style={{
                      borderColor: 'var(--bg-card)',
                      background: isValidating ? 'var(--brand)' : isSelected ? 'var(--brand-dark)' : 'var(--gold-accent)',
                    }} />
                  <div
                    className="rounded-2xl px-4 py-3 transition-all duration-200"
                    style={{
                      opacity: isValidating ? 0.7 : 1,
                      background: isEditing
                        ? 'color-mix(in srgb, var(--brand) 6%, var(--bg-card))'
                        : isSelected
                          ? 'color-mix(in srgb, var(--brand) 8%, var(--bg-card))'
                          : 'color-mix(in srgb, var(--gold-accent) 6%, var(--bg-card))',
                      border: `1px solid ${isEditing ? 'var(--brand)' : isSelected ? 'var(--brand)' : 'var(--border)'}`,
                      cursor: isEditing ? 'default' : 'pointer',
                    }}
                    onClick={() => !isEditing && isDeferred && toggleSelectedPending(c.id)}
                  >
                    {isEditing ? (
                      /* Inline edit mode */
                      <div className="space-y-2" onClick={e => e.stopPropagation()}>
                        <input
                          className="w-full text-sm border border-blue-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
                          value={editingInput}
                          onChange={e => onEditInputChange?.(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') onConfirmEdit?.(); if (e.key === 'Escape') onCancelEdit?.(); }}
                          autoFocus
                        />
                        <div className="flex gap-1.5 justify-end">
                          <button onClick={onCancelEdit} className="text-xs px-2.5 py-1 rounded-lg border text-slate-500 hover:bg-slate-100 transition-colors">取消</button>
                          <button onClick={onConfirmEdit} className="text-xs px-2.5 py-1 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors font-medium">保存</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 flex-wrap">
                          {isDeferred && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectedPending(c.id)}
                              onClick={e => e.stopPropagation()}
                              className="rounded border-amber-300 text-violet-500 focus:ring-violet-400 w-3.5 h-3.5 flex-shrink-0"
                            />
                          )}
                          <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{c.raw_input}</span>
                          {isValidating ? (
                            <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
                              style={{ background: 'var(--brand-light)', color: 'var(--brand)', border: '1px solid color-mix(in srgb, var(--brand) 25%, transparent)' }}>
                              <span className="w-1 h-1 rounded-full animate-bounce" style={{ background: 'var(--brand)', animationDelay: '0ms' }} />
                              <span className="w-1 h-1 rounded-full animate-bounce" style={{ background: 'var(--brand)', animationDelay: '150ms' }} />
                              <span className="w-1 h-1 rounded-full animate-bounce" style={{ background: 'var(--brand)', animationDelay: '300ms' }} />
                              验证中
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full"
                              style={{
                                background: isSelected ? 'var(--brand-light)' : 'color-mix(in srgb, var(--gold-accent) 12%, var(--bg-card))',
                                color: isSelected ? 'var(--brand)' : 'var(--gold-accent)',
                                border: `1px solid ${isSelected ? 'color-mix(in srgb, var(--brand) 25%, transparent)' : 'color-mix(in srgb, var(--gold-accent) 30%, transparent)'}`,
                              }}>
                              {isSelected ? '已选' : '待验证'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-1.5 gap-2">
                          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{c.player_name}</div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {onValidateConcept && !isValidating && (
                              <button
                                onClick={e => { e.stopPropagation(); onValidateConcept(c.id); }}
                                className="text-xs px-2 py-0.5 rounded-lg transition-all duration-150 font-medium"
                                style={{ background: 'var(--brand-light)', color: 'var(--brand)', border: '1px solid color-mix(in srgb, var(--brand) 25%, transparent)' }}
                              >验证</button>
                            )}
                            {canEdit && onStartEdit && (
                              <button
                                onClick={e => { e.stopPropagation(); onStartEdit(c.id, c.raw_input); }}
                                className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg
                                  hover:bg-blue-100 transition-colors font-medium"
                              >✏️</button>
                            )}
                            {canEdit && onDeleteConcept && (
                              <button
                                onClick={e => { e.stopPropagation(); onDeleteConcept(c.id, c.raw_input); }}
                                className="text-xs px-2 py-0.5 bg-red-50 text-red-500 border border-red-200 rounded-lg
                                  hover:bg-red-100 transition-colors font-medium"
                              >🗑️</button>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Validated timeline groups */}
      {groups.map(({ era, concepts }, groupIdx) => {
        const color = getEraColor(era);
        return (
          <div key={era} className={`animate-fade-in stagger-${Math.min(groupIdx + 1, 5)}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`h-px flex-1 ${color.line}`} />
              <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${color.badge}`}>
                {era}
              </span>
              <div className={`h-px flex-1 ${color.line}`} />
            </div>

            <div className="relative pl-7 space-y-3">
              <div className={`absolute left-[11px] top-2 bottom-2 w-0.5 ${color.line} rounded-full`} />
              {concepts.map(c => (
                <ConceptCard
                  key={c.id}
                  concept={c}
                  color={color}
                  isNew={c.id === newestId}
                  expanded={expandedId === c.id}
                  onToggle={setExpandedId}
                  isAdmin={isAdmin}
                  onDelete={onDeleteConcept}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
});

export default Timeline;

// ── ConceptCard ────────────────────────────────────────────────────────────────

interface CardProps {
  concept: Concept;
  color: { dot: string; badge: string; line: string };
  isNew: boolean;
  expanded: boolean;
  onToggle: (id: string | null) => void;
  isAdmin?: boolean;
  onDelete?: (id: string, name: string) => void;
}

const ConceptCard = memo(function ConceptCard({ concept: c, color, isNew, expanded, onToggle, isAdmin, onDelete }: CardProps) {
  const ragPolished = String((c.extra as Record<string, unknown>)?.ragPolished || '').trim();
  const handleToggle = useCallback(
    () => onToggle(expanded ? null : c.id),
    [onToggle, expanded, c.id],
  );
  return (
    <div className={`relative ${isNew ? 'animate-spring-in' : 'animate-slide-up'}`}>
      <div className={`absolute -left-[26px] top-4 w-3.5 h-3.5 rounded-full border-2 shadow z-10
        ${color.dot} ${isNew ? 'timeline-dot-new scale-125' : ''}`}
        style={{ borderColor: 'var(--bg-card)' }} />

      <button
        onClick={handleToggle}
        className={`w-full text-left rounded-2xl shadow-sm hover:shadow-md
          transition-all duration-200 hover:-translate-y-0.5`}
        style={{
          background: 'var(--bg-card)',
          border: isNew ? '1.5px solid var(--brand)' : '1px solid var(--border-subtle)',
        }}
      >
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-heading font-bold" style={{ color: 'var(--text-primary)' }}>{c.name}</span>
                {c.dynasty && (
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${color.badge}`}>
                    {c.dynasty}
                  </span>
                )}
                {isNew && (
                  <span className="text-xs px-2 py-0.5 text-white rounded-full font-medium animate-pop-in" style={{ background: 'var(--brand)' }}>新</span>
                )}
                {/* Difficulty stars */}
                <DifficultyStars difficulty={(c.extra as Record<string, unknown>)?.difficulty} />
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{formatYear(c.year)}</span>
                {c.period && c.period !== `${formatYear(c.year)}` && (
                  <>
                    <span style={{ color: 'var(--border)' }}>·</span>
                    <span className="text-xs truncate max-w-[160px]" style={{ color: 'var(--text-muted)' }}>{c.period}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: 'var(--text-muted)', background: 'var(--bg-muted)', border: '1px solid var(--border-subtle)' }}>
                {c.player_name}
              </span>
              {isAdmin && onDelete && (
                <button
                  onClick={e => { e.stopPropagation(); onDelete(c.id, c.name); }}
                  className="text-xs px-1.5 py-0.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="管理员删除"
                >🗑️</button>
              )}
              <svg className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                style={{ color: 'var(--text-muted)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {c.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2.5">
              {c.tags.map(tag => (
                <span key={tag} className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--brand-light)', color: 'var(--brand)', border: '1px solid color-mix(in srgb, var(--brand) 20%, transparent)' }}>
                  {tag}
                </span>
              ))}
            </div>
          )}

          {expanded && c.description && (
            <div className="mt-3 pt-3 text-sm leading-relaxed text-left animate-slide-down" style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
              {c.description}
            </div>
          )}
          {expanded && ragPolished && (
            <div className="mt-2 text-xs rounded-xl px-3 py-2 whitespace-pre-wrap leading-relaxed"
              style={{ background: 'color-mix(in srgb, var(--brand) 6%, var(--bg-card))', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
              <div className="font-heading font-semibold mb-1">教材检索参考（AI精简）</div>
              {ragPolished}
            </div>
          )}
        </div>
      </button>
    </div>
  );
});
