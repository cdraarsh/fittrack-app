'use client';

import { useEffect } from 'react';
import { getCuePlayer, type CueName } from './cues';

/**
 * Wire the shared cue player: apply the user's sound prefs, unlock the
 * AudioContext on the first user gesture, resume it on visibilitychange.
 */
export function useCueSetup(prefs: { enabled: boolean; volume: number } | undefined): void {
  useEffect(() => {
    const p = getCuePlayer();
    if (prefs) {
      p.enabled = prefs.enabled;
      p.volume = prefs.volume;
    }
  }, [prefs?.enabled, prefs?.volume]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const p = getCuePlayer();
    const unlock = () => p.unlock();
    const onVis = () => {
      if (document.visibilityState === 'visible') p.resume();
    };
    document.addEventListener('pointerdown', unlock, { passive: true });
    document.addEventListener('touchend', unlock, { passive: true });
    document.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('touchend', unlock);
      document.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
}

export function playCue(name: CueName): void {
  getCuePlayer().play(name);
}
