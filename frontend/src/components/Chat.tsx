import { useEffect, useRef, useState, memo } from 'react';
import type { Message, Player } from '../types';
import { sendMessage, submitConcept } from '../services/socket';
import { useGameStore } from '../store/gameStore';

interface Props {
  messages: Message[];
  me: Player | null;
  gameFinished: boolean;
  isMyTurn?: boolean;        // turn-order mode: is it this player's turn?
  isTurnMode?: boolean;      // whether we are in turn-order mode
  turnPlayerName?: string | null; // whose turn it is (when it's not mine)
  fillInput?: string;        // when set, auto-fills the concept input (hint click)
  readOnlyReason?: string | null;
}

const Chat = memo(function Chat({
  messages, me, gameFinished,
  isMyTurn = true, isTurnMode = false, turnPlayerName = null,
  fillInput = '',
  readOnlyReason = null,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'concept' | 'chat'>('concept');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const validating = useGameStore(s => s.validating);

  // Auto-fill input when a hint is clicked
  useEffect(() => {
    if (fillInput) {
      setInput(fillInput);
      setMode('concept');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [fillInput]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // In turn mode, concept input is blocked unless it's your turn
  const conceptBlocked = isTurnMode && !isMyTurn && mode === 'concept';
  const readOnlyBlocked = Boolean(readOnlyReason);
  const inputBlocked = conceptBlocked || readOnlyBlocked;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || submitting || inputBlocked) return;
    setError(''); setSubmitting(true);
    try {
      const res = mode === 'concept' ? await submitConcept(text) : await sendMessage(text);
      if (res.error) setError(res.error);
      else setInput('');
    } catch { setError('发送失败，请重试'); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg-page)' }}>
      {/* Messages — independently scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--text-muted)' }}>
            <div className="text-5xl opacity-40 mb-3 font-heading">史</div>
            <p className="text-sm font-medium">游戏刚刚开始</p>
            <p className="text-xs mt-1">切换到「提交概念」模式，开始历史接龙！</p>
          </div>
        )}

        {messages.map(msg => (
          <MessageRow key={msg.id} msg={msg} isMe={msg.player_id === me?.id} />
        ))}

        {validating && (
          <div className="flex items-center gap-2 ml-2 animate-fade-in">
            <div className="flex gap-1 items-center">
              {[0, 150, 300].map(d => (
                <span key={d} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--brand)', animationDelay: `${d}ms` }} />
              ))}
            </div>
            <span className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
              AI 正在验证「{validating.rawInput}」...
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      {!gameFinished ? (
        <div className="px-4 py-3 space-y-2.5 flex-shrink-0" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          {/* Mode tabs */}
          <div className="flex gap-1 p-0.5 rounded-xl text-xs" style={{ background: 'var(--bg-muted)' }}>
            {(['concept', 'chat'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className="flex-1 py-1.5 rounded-lg font-semibold transition-all"
                style={{
                  background: mode === m ? 'var(--bg-card)' : 'transparent',
                  color: mode === m ? 'var(--brand)' : 'var(--text-muted)',
                  boxShadow: mode === m ? '0 1px 3px var(--shadow)' : 'none',
                }}>
                {m === 'concept' ? '提交历史概念' : '聊天'}
              </button>
            ))}
          </div>

          {/* Turn-order lock notice */}
          {inputBlocked && (
            <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl" style={{ background: 'var(--brand-light)', border: '1px solid var(--border-subtle)', color: 'var(--brand)' }}>
              <span>
                {readOnlyBlocked
                  ? readOnlyReason
                  : <>等待 <strong>{turnPlayerName || '其他玩家'}</strong> 提交后轮到你...</>}
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              className={`input flex-1 ${inputBlocked ? 'opacity-50 cursor-not-allowed' : ''}`}
              placeholder={
                readOnlyBlocked
                  ? readOnlyReason || '当前不可输入'
                  : conceptBlocked
                  ? `等待 ${turnPlayerName || '其他玩家'} 的回合...`
                  : mode === 'concept' ? '输入历史概念、事件、人物...' : '发送消息...'
              }
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={submitting || inputBlocked}
              maxLength={100}
            />
            <button type="submit" disabled={submitting || !input.trim() || inputBlocked}
              className="btn-primary px-4 shrink-0">
              {submitting
                ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
              }
            </button>
          </form>

          {error && (
            <div className="text-xs rounded-lg px-3 py-1.5" style={{ color: 'var(--seal-red)', background: 'color-mix(in srgb, var(--seal-red) 8%, var(--bg-card))', border: '1px solid color-mix(in srgb, var(--seal-red) 20%, transparent)' }}>
              {error}
            </div>
          )}
          {mode === 'concept' && !error && !inputBlocked && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>AI 验证通过后自动归入时间轴</p>
          )}
        </div>
      ) : (
        <div className="px-4 py-4 text-center flex-shrink-0" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>游戏已结束 — 可在顶部导出成果</span>
        </div>
      )}
    </div>
  );
});

export default Chat;

// ── MessageRow ────────────────────────────────────────────────────────────────

function MessageRow({ msg, isMe }: { msg: Message; isMe: boolean }) {
  if (msg.type === 'system') {
    const meta = msg.meta as Record<string, unknown>;
    const isRejected = meta?.rejected;
    const isChallengeComplete = meta?.type === 'challenge_complete';
    const isRag = Boolean(meta?.rag);
    return (
      <div className="flex justify-center animate-fade-in">
        <span className="text-xs px-3 py-1.5 rounded-2xl whitespace-pre-wrap max-w-[92%]"
          style={{
            background: isRejected
              ? 'color-mix(in srgb, var(--seal-red) 8%, var(--bg-card))'
              : isChallengeComplete
                ? 'color-mix(in srgb, var(--brand) 10%, var(--bg-card))'
                : meta?.concept
                  ? 'color-mix(in srgb, #10b981 8%, var(--bg-card))'
                  : isRag
                    ? 'color-mix(in srgb, #06b6d4 8%, var(--bg-card))'
                    : 'var(--bg-muted)',
            color: isRejected
              ? 'var(--seal-red)'
              : isChallengeComplete
                ? 'var(--brand)'
                : meta?.concept
                  ? '#059669'
                  : isRag
                    ? '#0891b2'
                    : 'var(--text-muted)',
            border: `1px solid ${isRejected
              ? 'color-mix(in srgb, var(--seal-red) 20%, transparent)'
              : 'var(--border-subtle)'}`,
            fontWeight: isChallengeComplete ? 600 : 400,
          }}>
          {msg.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex gap-2.5 animate-slide-up ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white shadow-sm"
        style={{ background: isMe ? 'var(--brand)' : 'var(--text-muted)' }}>
        {(msg.player_name || '?')[0]}
      </div>
      <div className={`max-w-[76%] flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}>
        {!isMe && (
          <span className="text-xs ml-1 font-medium" style={{ color: 'var(--text-muted)' }}>{msg.player_name}</span>
        )}
        <div className={`px-3.5 py-2 text-sm leading-relaxed break-words
          ${msg.type === 'concept_attempt' ? 'font-medium' : ''}
          ${isMe ? 'bubble-me' : 'bubble-other'}`}>
          {msg.content}
        </div>
      </div>
    </div>
  );
}
