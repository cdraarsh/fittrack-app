'use client';

// v2 coach chat. Self-contained: loads history + cap from GET /api/coach and
// streams replies from POST /api/coach (plain text). Mount anywhere (Today).

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';

interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
}

interface CapInfo {
  cap: number;
  used: number;
  remaining: number;
}

const OPENER = 'Ask about today’s session, a lift’s trend, recovery, or whether to swap or deload.';

export default function CoachCard({ className = '' }: { className?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [cap, setCap] = useState<CapInfo | null>(null);
  const [available, setAvailable] = useState(true);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/coach', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled || !data) return;
        setMessages((data.messages ?? []).filter((m: ChatMessage) => m.content));
        setCap({ cap: data.cap, used: data.used, remaining: data.remaining });
        setAvailable(data.available !== false);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const capped = cap !== null && cap.remaining <= 0;

  async function send() {
    const msg = input.trim();
    if (!msg || loading || capped) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError('You’re offline. The coach needs a connection.');
      return;
    }
    setInput('');
    setError(null);
    setLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: msg }, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 429 && typeof data.cap === 'number') {
          setCap({ cap: data.cap, used: data.used, remaining: 0 });
        }
        throw new Error(data.error ?? `Error ${res.status}`);
      }

      const fallback = res.headers.get('x-coach-fallback');
      const remaining = res.headers.get('x-coach-remaining');
      if (fallback) setAvailable(false);
      else if (remaining !== null) setCap(c => (c ? { ...c, used: c.used + 1, remaining: Math.max(0, +remaining) } : c));

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');
      const decoder = new TextDecoder();
      let text = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          text += decoder.decode();
          break;
        }
        text += decoder.decode(value, { stream: true });
        setMessages(prev => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', content: text };
          return next;
        });
      }
      if (!text.trim()) throw new Error('The coach couldn’t answer right now. Try again in a minute.');
      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: text };
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setMessages(prev => (prev[prev.length - 1]?.role === 'assistant' && !prev[prev.length - 1].content ? prev.slice(0, -1) : prev));
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  return (
    <section
      aria-label="Coach"
      className={`mb-3 bg-bg2 border border-accent/20 rounded-card overflow-hidden ${className}`}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-accent/5">
        <MessageCircle size={14} className="text-accent flex-shrink-0" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-accent">Coach</span>
        {!available && <span className="text-[10px] text-text3">offline mode</span>}
        {cap && (
          <span className="ml-auto text-[10px] text-text3" data-testid="coach-remaining">
            {cap.remaining} message{cap.remaining !== 1 ? 's' : ''} left today
          </span>
        )}
      </div>

      <div ref={listRef} className="px-4 py-3 space-y-2.5 max-h-80 overflow-y-auto" aria-live="polite">
        {messages.length === 0 && <div className="text-sm text-text2">{OPENER}</div>}
        {messages.map((m, i) => (
          <div
            key={m.id ?? i}
            className={`text-sm leading-relaxed whitespace-pre-wrap ${m.role === 'assistant' ? 'text-text1' : 'text-text2 text-right'}`}
          >
            {m.role === 'assistant' && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-accent mr-1.5">Coach</span>
            )}
            {m.content ||
              (loading && i === messages.length - 1 ? (
                <span className="inline-block w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin align-middle" />
              ) : null)}
          </div>
        ))}
        {error && <div className="text-xs text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</div>}
        {capped && <div className="text-xs text-text3 text-center pt-1">Daily limit reached. Back tomorrow.</div>}
      </div>

      {!capped && (
        <form
          className="flex items-center gap-2 px-3 pb-3"
          onSubmit={e => {
            e.preventDefault();
            send();
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={loading}
            maxLength={1000}
            placeholder="Ask the coach…"
            aria-label="Message the coach"
            className="flex-1 bg-bg3 border border-border rounded-xl text-sm px-3 py-2 outline-none focus:border-accent text-text1 placeholder:text-text3 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            aria-label="Send"
            className="p-2 rounded-xl bg-gradient-to-r from-energy to-accent text-black disabled:opacity-40 cursor-pointer active:scale-95 transition-transform flex-shrink-0"
          >
            <Send size={14} />
          </button>
        </form>
      )}
    </section>
  );
}
