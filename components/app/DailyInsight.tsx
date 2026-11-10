'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

const KEY = 'fittrack:insight';

/** Today's ≤3-line insight from /api/insight (AI track), cached per day for offline opens. */
export default function DailyInsight({ today }: { today: string }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let cached: { date: string; text: string } | null = null;
    try {
      cached = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    } catch {
      /* ignore */
    }
    if (cached?.date === today) {
      setText(cached.text);
      return;
    }
    if (!navigator.onLine) return;
    let cancelled = false;
    fetch('/api/insight', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { text?: string } | null) => {
        if (cancelled || !d?.text) return;
        setText(d.text);
        try {
          localStorage.setItem(KEY, JSON.stringify({ date: today, text: d.text }));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [today]);

  if (!text) return null;
  return (
    <div className="flex gap-2.5 bg-purple/5 border border-purple/20 rounded-[10px] p-3 mb-3 text-[13px] text-text2 leading-snug whitespace-pre-line">
      <Sparkles size={15} className="text-purple flex-shrink-0 mt-0.5" />
      <div>{text}</div>
    </div>
  );
}
