'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';

const KEY = 'fittrack:insight';
export const SYNCED_EVENT = 'fittrack:synced';
/** A non-final answer is re-asked after a sync at most this often. */
const REFETCH_MIN_MS = 2 * 60_000;

interface InsightResponse {
  text?: string;
  source?: 'model' | 'rules';
  cached?: boolean;
  degraded?: boolean;
}
interface Stored {
  date: string;
  text: string;
  final: boolean;
}

/**
 * Today's ≤3-line insight from /api/insight.
 * - Final for the day (never re-asked): a model answer, or anything the server
 *   says it cached (incl. a rules row after a model failure).
 * - Not final: a rules answer the server didn't cache (no program on the server
 *   yet, or no AI key). Shown, remembered for offline opens, and re-asked after
 *   a sync at most every 2 minutes, one request at a time.
 * - A degraded answer (server couldn't read the database) is shown but never stored.
 */
export default function DailyInsight({ today }: { today: string }) {
  const [text, setText] = useState<string | null>(null);
  const final = useRef(false);
  const inFlight = useRef(false);
  const inFlightSince = useRef(0);
  const lastFetch = useRef(0);
  const todayRef = useRef(today);
  todayRef.current = today;

  const load = useCallback(
    (fromSync: boolean) => {
      // A request older than 30 s (aborted, or the PWA was suspended mid-request) no longer blocks.
      const busy = inFlight.current && Date.now() - inFlightSince.current < 30_000;
      if (final.current || busy || typeof navigator === 'undefined' || !navigator.onLine) return;
      if (fromSync && Date.now() - lastFetch.current < REFETCH_MIN_MS) return;
      inFlight.current = true;
      inFlightSince.current = Date.now();
      lastFetch.current = Date.now();
      const forDay = today;
      fetch('/api/insight', { cache: 'no-store', signal: AbortSignal.timeout(30_000) })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: InsightResponse | null) => {
          // A late answer for a day that has since ended is dropped.
          if (!d?.text || forDay !== todayRef.current) return;
          setText(d.text);
          if (d.degraded) return;
          const isFinal = d.source === 'model' || d.cached === true;
          if (isFinal) final.current = true;
          try {
            localStorage.setItem(KEY, JSON.stringify({ date: forDay, text: d.text, final: isFinal } satisfies Stored));
          } catch {
            /* ignore */
          }
        })
        .catch(() => {})
        .finally(() => {
          inFlight.current = false;
        });
    },
    [today],
  );

  useEffect(() => {
    final.current = false;
    lastFetch.current = 0;
    inFlight.current = false; // a request still running for yesterday must not block today's
    let cached: Stored | null = null;
    try {
      cached = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    } catch {
      /* ignore */
    }
    if (cached?.date === today && cached.text) {
      setText(cached.text);
      // Older stored entries had no flag and were only ever model answers.
      if (cached.final !== false) {
        final.current = true;
        return;
      }
    } else {
      setText(null);
    }
    load(false);
    const onSynced = () => load(true);
    window.addEventListener(SYNCED_EVENT, onSynced);
    return () => window.removeEventListener(SYNCED_EVENT, onSynced);
  }, [today, load]);

  if (!text) return null;
  return (
    <div className="flex gap-2.5 bg-purple/5 border border-purple/20 rounded-[10px] p-3 mb-3 text-[13px] text-text2 leading-snug whitespace-pre-line">
      <Sparkles size={15} className="text-purple flex-shrink-0 mt-0.5" />
      <div>{text}</div>
    </div>
  );
}
