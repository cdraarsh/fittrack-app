'use client';

import { useState, useRef } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import type { CoachTrigger, CoachContext } from '@/lib/aiCoach';
import { TRIGGER_OPENERS } from '@/lib/aiCoach';

interface Props {
  trigger: CoachTrigger;
  context: CoachContext;
}

const MAX_TURNS = 3;

export default function CoachCard({ trigger, context }: Props) {
  const [messages, setMessages] = useState<{ role: 'coach' | 'user'; text: string }[]>([
    { role: 'coach', text: TRIGGER_OPENERS[trigger] },
  ]);
  const [input,     setInput]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const turnCount = messages.filter(m => m.role === 'user').length;
  const done      = turnCount >= MAX_TURNS;
  const inputRef  = useRef<HTMLInputElement>(null);

  async function send() {
    const msg = input.trim();
    if (!msg || loading || done) return;

    setInput('');
    setError(null);
    setMessages(prev => [...prev, { role: 'user', text: msg }]);
    setLoading(true);

    // Optimistic empty coach message — will be filled by stream
    setMessages(prev => [...prev, { role: 'coach', text: '' }]);

    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, turnCount, context }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Error ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) {
          accumulated += decoder.decode(); // flush any buffered multi-byte chars
          break;
        }
        accumulated += decoder.decode(value, { stream: true });
        // Update the last coach message in place as chunks arrive
        setMessages(prev => {
          const next = [...prev];
          next[next.length - 1] = { role: 'coach', text: accumulated };
          return next;
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
      // Remove the empty coach placeholder on error
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  return (
    <div className="mb-3 bg-surface border border-hairline rounded-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-hairline bg-clay-wash">
        <MessageCircle size={14} className="text-clay flex-shrink-0" />
        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-clay">Coach</span>
        <span className="ml-auto font-mono text-[10px] text-ink-3"><span className="tabular-nums">{MAX_TURNS - turnCount}</span> reply{MAX_TURNS - turnCount !== 1 ? 's' : ''} left</span>
      </div>

      {/* Messages */}
      <div className="px-4 py-3 space-y-2.5">
        {messages.map((m, i) => (
          <div key={i} className={`text-sm leading-relaxed ${m.role === 'coach' ? 'text-ink' : 'text-ink-2 text-right'}`}>
            {m.role === 'coach' && (
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-clay mr-1.5">Coach</span>
            )}
            {m.text || (loading && i === messages.length - 1
              ? <span className="inline-block w-4 h-4 border-2 border-clay/30 border-t-clay rounded-full animate-spin align-middle" />
              : null
            )}
          </div>
        ))}

        {error && (
          <div className="text-xs text-clay bg-clay-wash rounded-lg px-3 py-2">{error}</div>
        )}

        {done && (
          <div className="text-xs text-ink-3 text-center pt-1">
            For more, come back tomorrow.
          </div>
        )}
      </div>

      {/* Input */}
      {!done && (
        <div className="flex items-center gap-2 px-3 pb-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={loading}
            placeholder="Reply…"
            className="flex-1 bg-surface-2 border border-hairline rounded-sm text-sm px-3 py-2 outline-none focus:border-clay text-ink placeholder:text-ink-3 disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="p-2 rounded-sm bg-clay hover:bg-clay-hover text-surface disabled:opacity-40 cursor-pointer active:scale-95 transition-transform flex-shrink-0"
          >
            <Send size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
