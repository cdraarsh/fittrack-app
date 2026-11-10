import type { SetLog } from '@/lib/program/types';

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);

/**
 * Merge two versions of one set (same id, or same session_exercise_id+set_index).
 * Last write wins by updated_at — except watch data only fills empty fields:
 * when the winner came from the watch, any value the app recorded is kept.
 * Mirrors the set_logs guard trigger.
 */
export function mergeSetLog(local: SetLog | undefined, remote: SetLog | undefined): SetLog | undefined {
  if (!local) return remote;
  if (!remote) return local;
  const remoteWins = ms(remote.updated_at) >= ms(local.updated_at);
  const winner = remoteWins ? remote : local;
  const loser = remoteWins ? local : remote;
  if (winner.source === 'watch' && loser.source === 'app') {
    const appHasValues = loser.weight_kg !== null || loser.reps !== null || loser.seconds !== null;
    return {
      ...winner,
      id: remote.id, // the server's id is canonical
      weight_kg: loser.weight_kg ?? winner.weight_kg,
      reps: loser.reps ?? winner.reps,
      seconds: loser.seconds ?? winner.seconds,
      rpe: loser.rpe ?? winner.rpe,
      done: loser.done || winner.done,
      source: appHasValues ? 'app' : 'watch',
    };
  }
  return { ...winner, id: remote.id };
}
