'use client';

import { useState, useEffect, useCallback } from 'react';

// Global toast dispatcher
export function toast(msg: string) {
  window.dispatchEvent(new CustomEvent('fittrack:toast', { detail: msg }));
}

export default function Toast() {
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
    <div className={`fixed bottom-20 left-1/2 z-50 -translate-x-1/2 bg-bg2 border border-border rounded-xl px-4 py-2.5 text-[13px] font-semibold text-text2 whitespace-nowrap shadow-lg transition-all duration-200 ${
      visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
    }`}>
      {message}
    </div>
  );
}
