'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

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

  useEffect(() => {
    if (remaining === 0 && visible) {
      const t = setTimeout(() => setVisible(false), 2000);
      return () => clearTimeout(t);
    }
  }, [remaining, visible]);

  if (!visible) return null;

  const pct = total > 0 ? (remaining / total) * 100 : 0;
  const isDone = remaining === 0;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-sm px-4 py-2.5 min-w-[180px]"
      style={{ background: '#161b24', border: '1px solid rgba(249,115,22,.3)', boxShadow: '0 10px 30px rgba(0,0,0,.4)' }}>
      <div>
        <div className="text-[11px] text-text3 font-semibold">Rest</div>
        <div className="font-condensed text-[24px] font-black leading-none text-energy">
          {isDone ? 'Go!' : `${remaining}s`}
        </div>
      </div>
      <div className="flex-1 h-1.5 bg-bg3 rounded-full overflow-hidden min-w-[60px]">
        <div className="h-full rounded-full transition-all duration-1000 bg-energy" style={{ width: `${pct}%` }} />
      </div>
      <button onClick={dismiss} className="text-text3 hover:text-text1 text-lg leading-none cursor-pointer">✕</button>
    </div>
  );
}
