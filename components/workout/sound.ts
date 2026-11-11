'use client';

/**
 * The logger's only coupling to lib/audio: keep audio API changes contained here.
 */
import { playCue } from '@/lib/audio/hooks';
import { getCuePlayer } from '@/lib/audio/cues';
import { useWakeLock } from '@/lib/audio/wakeLock';

export const sound = {
  setDone: () => playCue('tick'),
  nextExercise: () => playCue('next_exercise'),
  sessionComplete: () => playCue('session_complete'),
  /** Settings "Test sound": runs inside the click gesture, so it also unlocks iOS audio. */
  test: () => {
    getCuePlayer().unlock();
    playCue('go');
  },
};

export { useWakeLock };
