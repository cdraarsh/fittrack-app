'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// Global event so any component can trigger the timer
export function startRestTimer(seconds: number) {
  window.dispatchEvent(new CustomEvent('fittrack:rest', { detail: seconds }));
}

export default function RestTimer() {
  const [total,     setTotal]     = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [visible,   setVisible]   = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  const dismiss = useCallback(() => { clear(); setVisible(false); }, [clear]);

  useEffect(() => {
    const handler = (e: Event) => {
      const secs = (e as CustomEvent<number>).detail;
      clear();
      setTotal(secs);
      setRemaining(secs);
      setVisible(true);
      intervalRef.current = setInterval(() => {
        setRemaining(prev => {
          if (prev <= 1) { clear(); return 0; }
          return prev - 1;
        });
      }, 1000);
    };
    window.addEventListener('fittrack:rest', handler);
    return () => window.removeEventListener('fittrack:rest', handler);
  }, [clear]);

  // Auto-dismiss 2s after hitting 0
  useEffect(() => {
    if (remaining === 0 && visible) {
      const t = setTimeout(() => setVisible(false), 2000);
      return () => clearTimeout(t);
    }
  }, [remaining, visible]);

  if (!visible) return null;

  const pct = total > 0 ? (remaining / total) * 100 : 0;
  const isLow = pct < 30;
  const isDone = remaining === 0;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-bg2 border border-accent/25 rounded-xl px-4 py-2.5 shadow-lg min-w-[180px]">
      <div>
        <div className="text-[11px] text-text3 font-semibold">Rest</div>
        <div className={`font-condensed text-2xl font-black ${isDone ? 'text-accent' : isLow ? 'text-danger' : 'text-accent'}`}>
          {isDone ? 'Go!' : `${remaining}s`}
        </div>
      </div>
      <div className="flex-1 h-1.5 bg-bg3 rounded-full overflow-hidden min-w-[60px]">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${isLow ? 'bg-danger' : 'bg-accent'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <button onClick={dismiss} className="text-text3 hover:text-text2 text-lg leading-none">✕</button>
    </div>
  );
}
