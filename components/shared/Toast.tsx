'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOverlays } from '@/lib/ui/overlays';

// Global toast dispatcher
export function toast(msg: string) {
  window.dispatchEvent(new CustomEvent('fittrack:toast', { detail: msg }));
}

export default function Toast() {
  const { resting } = useOverlays();
  const [message, setMessage] = useState('');
  const [visible, setVisible] = useState(false);
  const timerRef = { current: null as ReturnType<typeof setTimeout> | null };

  const show = useCallback((msg: string) => {
    setMessage(msg);
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 2400);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => show((e as CustomEvent<string>).detail);
    window.addEventListener('fittrack:toast', handler);
    return () => window.removeEventListener('fittrack:toast', handler);
  }, [show]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed left-1/2 z-[45] -translate-x-1/2 max-w-[90%] text-center bg-bg2 border border-border rounded-xl px-4 py-2.5 text-[13px] font-semibold text-text1 shadow-lg transition-all duration-200 ${
        resting ? 'bottom-[calc(132px+env(safe-area-inset-bottom))]' : 'bottom-[calc(68px+env(safe-area-inset-bottom))]'
      } ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}
    >
      {message}
    </div>
  );
}
