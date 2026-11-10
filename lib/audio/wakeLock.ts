'use client';

import { useEffect } from 'react';

interface Sentinel {
  release(): Promise<void>;
  released?: boolean;
}

/**
 * Keep the screen on while `active` (a session in progress): a locked or
 * backgrounded PWA can't play cues on time. Re-acquired when the page becomes
 * visible again (the OS drops the lock on hide); released when inactive.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    const wl = (typeof navigator !== 'undefined' ? (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<Sentinel> } }).wakeLock : undefined);
    if (!active || !wl) return;
    let sentinel: Sentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
      try {
        const s = await wl.request('screen');
        if (cancelled) void s.release();
        else sentinel = s;
      } catch {
        /* denied / low battery: ignore */
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') void acquire();
      else if (sentinel) void sentinel.release().catch(() => {}); // the OS drops it on hide anyway
    };
    void acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      if (sentinel) void sentinel.release().catch(() => {});
    };
  }, [active]);
}
