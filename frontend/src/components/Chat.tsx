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
}

const Chat = memo(function Chat({
  messages, me, gameFinished,
  isMyTurn = true, isTurnMode = false, turnPlayerName = null,
  fillInput = '',
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || submitting || conceptBlocked) return;
    setError(''); setSubmitting(true);
    try {
      const res = mode === 'concept' ? await submitConcept(text) : await sendMessage(text);
      if (res.error) setError(res.error);
      else setInput('');
    } catch { setError('发送失败，请重试'); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="flex flex-col h-full bg-slate-50/50 overflow-hidden">
      {/* Messages — independently scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <div className="text-5xl opacity-40 mb-3">💬</div>
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
                <span key={d} className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
            <span className="text-xs text-slate-400 italic">
              AI 正在验证「{validating.rawInput}」...
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      {!gameFinished ? (
        <div className="border-t border-slate-100 bg-white px-4 py-3 space-y-2.5 flex-shrink-0">
          {/* Mode tabs */}
          <div className="flex gap-1 bg-slate-100 p-0.5 rounded-xl text-xs">
            {(['concept', 'chat'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 py-1.5 rounded-lg font-semibold transition-all
                  ${mode === m ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {m === 'concept' ? '📚 提交历史概念' : '💬 聊天'}
              </button>
            ))}
          </div>

          {/* Turn-order lock notice */}
          {conceptBlocked && (
            <div className="flex items-center gap-2 text-xs px-3 py-2 bg-violet-50 border border-violet-100 rounded-xl text-violet-600">
              <span>⏳</span>
              <span>等待 <strong>{turnPlayerName || '其他玩家'}</strong> 提交后轮到你...</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              className={`input flex-1 ${conceptBlocked ? 'opacity-50 cursor-not-allowed' : ''}`}
              placeholder={
                conceptBlocked
                  ? `等待 ${turnPlayerName || '其他玩家'} 的回合...`
                  : mode === 'concept' ? '输入历史概念、事件、人物...' : '发送消息...'
              }
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={submitting || conceptBlocked}
              maxLength={100}
            />
            <button type="submit" disabled={submitting || !input.trim() || conceptBlocked}
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
            <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
              {error}
            </div>
          )}
          {mode === 'concept' && !error && !conceptBlocked && (
            <p className="text-xs text-slate-400">AI 验证通过后自动归入时间轴</p>
          )}
        </div>
      ) : (
        <div className="border-t border-slate-100 bg-white px-4 py-4 text-center flex-shrink-0">
          <span className="text-sm text-slate-400">游戏已结束 — 可在顶部导出成果</span>
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
    return (
      <div className="flex justify-center animate-fade-in">
        <span className={`text-xs px-3 py-1.5 rounded-full border
          ${isRejected
            ? 'bg-red-50 text-red-500 border-red-100'
            : isChallengeComplete
              ? 'bg-purple-50 text-purple-600 border-purple-100 font-semibold'
              : meta?.concept
                ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                : 'bg-slate-100 text-slate-500 border-slate-200'
          }`}>
          {msg.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex gap-2.5 animate-slide-up ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white shadow-sm
        ${isMe ? 'bg-indigo-500' : 'bg-gradient-to-br from-slate-400 to-slate-600'}`}>
        {(msg.player_name || '?')[0]}
      </div>
      <div className={`max-w-[76%] flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}>
        {!isMe && (
          <span className="text-xs text-slate-400 ml-1 font-medium">{msg.player_name}</span>
        )}
        <div className={`px-3.5 py-2 text-sm leading-relaxed break-words
          ${msg.type === 'concept_attempt' ? 'font-medium' : ''}
          ${isMe ? 'bubble-me' : 'bubble-other'}`}>
          {msg.type === 'concept_attempt' && !isMe && (
            <span className="mr-1 text-xs">📚</span>
          )}
          {msg.content}
        </div>
      </div>
    </div>
  );
}
