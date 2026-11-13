'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';

const KEY = 'fittrack:insight';
export const SYNCED_EVENT = 'fittrack:synced';

interface InsightResponse {
  text?: string;
  source?: 'model' | 'rules';
  degraded?: boolean;
}

/**
 * Today's ≤3-line insight from /api/insight. Only a real model insight is kept
 * for the day (so offline opens still show it); rule-based or degraded answers
 * are shown but re-fetched after the next successful sync, so an insight made
 * before the program reached the server never sticks.
 */
export default function DailyInsight({ today }: { today: string }) {
  const [text, setText] = useState<string | null>(null);
  const final = useRef(false);

  const load = useCallback(() => {
    if (final.current || typeof navigator === 'undefined' || !navigator.onLine) return () => {};
    let cancelled = false;
    fetch('/api/insight', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: InsightResponse | null) => {
        if (cancelled || !d?.text) return;
        setText(d.text);
        if (d.source === 'model' && !d.degraded) {
          final.current = true;
          try {
            localStorage.setItem(KEY, JSON.stringify({ date: today, text: d.text }));
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [today]);

  useEffect(() => {
    final.current = false;
    let cached: { date: string; text: string } | null = null;
    try {
      cached = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    } catch {
      /* ignore */
    }
    if (cached?.date === today && cached.text) {
      setText(cached.text);
      final.current = true;
      return;
    }
    const cancel = load();
    const onSynced = () => load();
    window.addEventListener(SYNCED_EVENT, onSynced);
    return () => {
      cancel();
      window.removeEventListener(SYNCED_EVENT, onSynced);
    };
  }, [today, load]);

  if (!text) return null;
  return (
    <div className="flex gap-2.5 bg-purple/5 border border-purple/20 rounded-[10px] p-3 mb-3 text-[13px] text-text2 leading-snug whitespace-pre-line">
      <Sparkles size={15} className="text-purple flex-shrink-0 mt-0.5" />
      <div>{text}</div>
    </div>
  );
}
