'use client';
/**
 * Who owns the bottom of the screen right now (UX_PLAN §3 stacking rules):
 * the rest dock while resting, nothing while the keyboard is up. The coach
 * button and toasts read this to stay out of the way.
 */
import { useSyncExternalStore } from 'react';

export interface OverlayState {
  resting: boolean;
  inputFocused: boolean;
}

let state: OverlayState = { resting: false, inputFocused: false };
const subs = new Set<() => void>();

export function setOverlay(patch: Partial<OverlayState>) {
  const next = { ...state, ...patch };
  if (next.resting === state.resting && next.inputFocused === state.inputFocused) return;
  state = next;
  subs.forEach((f) => f());
}

export function useOverlays(): OverlayState {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => state,
    () => state,
  );
}

/** Open the coach sheet from anywhere (e.g. the session bar). */
export function openCoach() {
  window.dispatchEvent(new Event('fittrack:coach-open'));
}
