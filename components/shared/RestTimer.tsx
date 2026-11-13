'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { playCue } from '@/lib/audio/hooks';
import { setOverlay, useOverlays } from '@/lib/ui/overlays';
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

  const overlays = useOverlays();
  useEffect(() => {
    setOverlay({ resting: !!rest });
  }, [rest]);

  const adjust = (deltaS: number) => {
    setRest((r) => {
      if (!r) return r;
      const endsAt = Math.max(Date.now() + 1000, r.endsAt + deltaS * 1000);
      const next = { endsAt, total: Math.max(1, r.total + deltaS) };
      save(next);
      fired.current = new Set();
      return next;
    });
  };

  if (!rest) return null;
  const remaining = remainingSeconds(rest, now);
  const pct = rest.total > 0 ? Math.min(100, (remaining / rest.total) * 100) : 0;
  const isDone = remaining === 0;
  const isLow = pct < 30;

  // The dock owns the bottom of the screen just above the nav. It hides while
  // the keyboard is up (iOS moves fixed elements unpredictably); cues still play.
  return (
    <div
      className={`fixed left-1/2 -translate-x-1/2 w-full max-w-app z-40 bottom-[calc(56px+env(safe-area-inset-bottom))] bg-bg1/95 backdrop-blur border-t border-accent/25 px-4 h-16 flex items-center gap-3 ${
        overlays.inputFocused ? 'hidden' : ''
      }`}
    >
      <div className="min-w-[64px]">
        <div className="text-xs text-text3 font-semibold">Rest</div>
        <div
          role="timer"
          aria-live="off"
          aria-label={isDone ? 'Rest over' : `Rest ${Math.floor(remaining / 60)} minutes ${remaining % 60} seconds left`}
          className={`font-condensed text-2xl font-black tabular-nums leading-none ${isDone ? 'text-accent' : isLow ? 'text-warn' : 'text-accent'}`}
        >
          {isDone ? 'Go!' : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`}
        </div>
      </div>
      <div className="flex-1 h-1.5 bg-bg3 rounded-full overflow-hidden" aria-hidden>
        <div className={`h-full rounded-full transition-[width] duration-200 ${isLow ? 'bg-warn' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
      </div>
      <button onClick={() => adjust(-15)} aria-label="15 seconds less rest" className="h-11 min-w-[44px] px-2 rounded-lg bg-bg3 border border-border text-sm font-bold">
        −15
      </button>
      <button onClick={() => adjust(15)} aria-label="15 seconds more rest" className="h-11 min-w-[44px] px-2 rounded-lg bg-bg3 border border-border text-sm font-bold">
        +15
      </button>
      <button onClick={dismiss} aria-label="Dismiss rest timer" className="h-11 px-3 rounded-lg text-sm font-bold text-text2">
        Skip
      </button>
    </div>
  );
}
