'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { playCue } from '@/lib/audio/hooks';
import { dueRestCues, remainingSeconds, REST_STORAGE_KEY, startRest, type RestState } from '@/lib/audio/rest';

/** Start (or restart) the rest timer from anywhere. */
export function startRestTimer(seconds: number) {
  window.dispatchEvent(new CustomEvent('fittrack:rest', { detail: seconds }));
}

/** Cancel a running rest (session reset or completed). */
export function stopRestTimer() {
  window.dispatchEvent(new CustomEvent('fittrack:rest', { detail: 0 }));
}

function load(): RestState | null {
  try {
    const raw = localStorage.getItem(REST_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RestState) : null;
  } catch {
    return null;
  }
}
function save(s: RestState | null) {
  try {
    if (s) localStorage.setItem(REST_STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(REST_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Timestamp-based rest timer: the end time is stored (and survives reloads),
 * so it's correct after the app was backgrounded. Plays 3-2-1 beeps and a
 * "go" chime via the shared cue player.
 */
export default function RestTimer() {
  const [rest, setRest] = useState<RestState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef(new Set<string>());

  const dismiss = useCallback(() => {
    setRest(null);
    save(null);
  }, []);

  useEffect(() => {
    const restored = load();
    if (restored && restored.endsAt > Date.now()) setRest(restored);
    else save(null);
    const handler = (e: Event) => {
      const seconds = (e as CustomEvent<number>).detail;
      if (!(seconds > 0)) {
        setRest(null);
        save(null);
        return;
      }
      const r = startRest(seconds);
      fired.current = new Set();
      setRest(r);
      save(r);
      setNow(Date.now());
    };
    window.addEventListener('fittrack:rest', handler);
    return () => window.removeEventListener('fittrack:rest', handler);
  }, []);

  useEffect(() => {
    if (!rest) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      for (const cue of dueRestCues(rest, t, fired.current)) playCue(cue);
    };
    tick();
    const id = setInterval(tick, 200);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [rest]);

  // Hide 2 s after reaching zero.
  useEffect(() => {
    if (rest && now >= rest.endsAt + 2000) dismiss();
  }, [rest, now, dismiss]);

  if (!rest) return null;
  const remaining = remainingSeconds(rest, now);
  const pct = rest.total > 0 ? (remaining / rest.total) * 100 : 0;
  const isDone = remaining === 0;
  const isLow = pct < 30;

  return (
    <div
      role="timer"
      aria-live="polite"
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-bg2 border border-accent/25 rounded-xl px-4 py-2.5 shadow-lg min-w-[200px]"
    >
      <div>
        <div className="text-[11px] text-text3 font-semibold">Rest</div>
        <div className={`font-condensed text-2xl font-black ${isDone ? 'text-accent' : isLow ? 'text-danger' : 'text-accent'}`}>
          {isDone ? 'Go!' : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`}
        </div>
      </div>
      <div className="flex-1 h-1.5 bg-bg3 rounded-full overflow-hidden min-w-[60px]">
        <div className={`h-full rounded-full transition-[width] duration-200 ${isLow ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
      </div>
      <button onClick={dismiss} aria-label="Dismiss rest timer" className="text-text3 hover:text-text2 text-lg leading-none">
        ✕
      </button>
    </div>
  );
}
