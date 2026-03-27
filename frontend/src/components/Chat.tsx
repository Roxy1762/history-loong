import { useEffect, useRef, useState } from 'react';
import type { Message, Player } from '../types';
import { sendMessage, submitConcept } from '../services/socket';
import { useGameStore } from '../store/gameStore';

interface Props {
  messages: Message[];
  me: Player | null;
  gameFinished: boolean;
}

export default function Chat({ messages, me, gameFinished }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'concept' | 'chat'>('concept');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const validating = useGameStore((s) => s.validating);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || submitting) return;
    setError('');
    setSubmitting(true);

    try {
      if (mode === 'concept') {
        const res = await submitConcept(text);
        if (res.error) setError(res.error);
      } else {
        const res = await sendMessage(text);
        if (res.error) setError(res.error);
      }
      setInput('');
    } catch {
      setError('发送失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <div className="text-center text-slate-400 text-sm py-8">
            还没有消息，快开始接龙吧！
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} isMe={msg.player_id === me?.id} />
        ))}

        {/* Validating indicator */}
        {validating && (
          <div className="flex items-center gap-2 text-sm text-slate-500 pl-2 animate-pulse">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            AI 正在验证「{validating.rawInput}」...
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {!gameFinished && (
        <div className="border-t border-slate-100 p-3 space-y-2">
          {/* Mode toggle */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 text-xs">
            {(['concept', 'chat'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-1 rounded-md font-medium transition-colors
                  ${mode === m ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {m === 'concept' ? '📚 提交历史概念' : '💬 聊天'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              className="input flex-1 text-sm"
              placeholder={mode === 'concept' ? '输入历史概念/事件/人物...' : '发送消息...'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={submitting}
              maxLength={100}
            />
            <button
              type="submit"
              className="btn-primary px-3 py-2 text-sm"
              disabled={submitting || !input.trim()}
            >
              {submitting ? '...' : '发送'}
            </button>
          </form>

          {error && <p className="text-xs text-red-500">{error}</p>}

          {mode === 'concept' && (
            <p className="text-xs text-slate-400">
              提交后 AI 将自动验证并归入时间轴
            </p>
          )}
        </div>
      )}

      {gameFinished && (
        <div className="border-t border-slate-100 p-3 text-center text-sm text-slate-400">
          游戏已结束，可在上方导出结果
        </div>
      )}
    </div>
  );
}

// ── MessageBubble ─────────────────────────────────────────────────────────────

function MessageBubble({ msg, isMe }: { msg: Message; isMe: boolean }) {
  if (msg.type === 'system') {
    return (
      <div className="flex justify-center">
        <span className={`text-xs px-3 py-1 rounded-full
          ${(msg.meta as Record<string, unknown>)?.rejected ? 'bg-red-50 text-red-500' : 'bg-slate-100 text-slate-500'}`}>
          {msg.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex gap-2 animate-fade-in ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white bg-brand-500">
        {(msg.player_name || '?').slice(0, 1)}
      </div>

      <div className={`max-w-[72%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
        {!isMe && (
          <span className="text-xs text-slate-400 ml-1">{msg.player_name}</span>
        )}
        <div
          className={`px-3 py-2 rounded-2xl text-sm break-words
            ${msg.type === 'concept_attempt' ? 'font-medium italic' : ''}
            ${isMe
              ? 'bg-brand-500 text-white rounded-tr-sm'
              : 'bg-white border border-slate-100 text-slate-800 rounded-tl-sm shadow-sm'
            }`}
        >
          {msg.type === 'concept_attempt' && !isMe && '📚 '}
          {msg.content}
        </div>
      </div>
    </div>
  );
}
