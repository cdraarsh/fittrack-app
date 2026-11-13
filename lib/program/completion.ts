import type { SessionExercise, SetLog } from './types';

type SE = Pick<SessionExercise, 'id' | 'sets'>;
type Log = Pick<SetLog, 'session_exercise_id' | 'set_index' | 'done' | 'reps' | 'seconds'> & { weight_kg?: number | null };

/** A working set counts when it is ticked done with reps or seconds recorded. */
export function isWorkingSetDone(log: Log | undefined): boolean {
  return !!log && log.done && ((log.reps ?? 0) > 0 || (log.seconds ?? 0) > 0);
}

/**
 * Number of prescribed working sets (set_index 0..sets-1 of every session
 * exercise) not yet done. Swaps don't matter: sets hang off the session
 * exercise, whichever exercise it currently points to. Mirrors the check in
 * SQL `complete_session()`.
 */
export function missingWorkingSets(exercises: SE[], logs: Log[]): number {
  const byKey = new Map(logs.map((l) => [`${l.session_exercise_id}:${l.set_index}`, l]));
  let missing = 0;
  for (const se of exercises) {
    for (let i = 0; i < se.sets; i++) {
      if (!isWorkingSetDone(byKey.get(`${se.id}:${i}`))) missing++;
    }
  }
  return missing;
}

export function allWorkingSetsDone(exercises: SE[], logs: Log[]): boolean {
  return missingWorkingSets(exercises, logs) === 0;
}

/** Every prescribed set done at or above the top of the range (reps or seconds). */
function allAtTop(se: Pick<SessionExercise, 'id' | 'sets' | 'rep_hi'>, logs: Log[], isTimed: boolean): boolean {
  for (let i = 0; i < se.sets; i++) {
    const l = logs.find((x) => x.session_exercise_id === se.id && x.set_index === i);
    if (!isWorkingSetDone(l)) return false;
    const v = isTimed ? l!.seconds ?? 0 : l!.reps ?? 0;
    if (v < se.rep_hi) return false;
  }
  return se.sets > 0;
}

/** +2.5 kg hint: only for loaded rep work (never timed holds or bodyweight). */
export function hitTopOfRange(
  se: Pick<SessionExercise, 'id' | 'sets' | 'rep_hi'>,
  logs: Log[],
  isTimed: boolean,
): boolean {
  if (isTimed || !allAtTop(se, logs, false)) return false;
  // Loaded work: every prescribed set carries weight (extra sets don't count).
  for (let i = 0; i < se.sets; i++) {
    const l = logs.find((x) => x.session_exercise_id === se.id && x.set_index === i);
    if (!((l?.weight_kg ?? 0) > 0)) return false;
  }
  return true;
}

/** What to progress next time, matched to the kind of exercise; null when not earned yet. */
export function topOfRangeHint(
  se: Pick<SessionExercise, 'id' | 'sets' | 'rep_hi'>,
  logs: Log[],
  isTimed: boolean,
): string | null {
  if (!allAtTop(se, logs, isTimed)) return null;
  if (isTimed) return `Every hold hit ${se.rep_hi} s — add 5–10 s next session.`;
  if (hitTopOfRange(se, logs, false)) return 'All sets hit top of range — add 2.5 kg next session!';
  return 'All sets hit the top — add reps or load next session.';
}
