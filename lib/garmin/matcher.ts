/**
 * Pure watch-set → session set matcher (PLAN_V2 Feature 4).
 *
 * Active watch sets only, per session:
 *   1. exact category + subtype
 *   2. category unique in session
 *   3. order fallback (uncategorised or ambiguous-category sets follow
 *      the neighbouring matched exercise, else session order)
 *   4. leftovers → "From watch, needs review" tray
 * Fill empty rows only; filled rows are marked source 'watch'.
 */
import type {
  LeftoverSet,
  MatchResult,
  MatchRule,
  MatchSessionExercise,
  MatchSetLog,
  SetFill,
  WatchSet,
} from './types';

/** "BENCH_PRESS", "benchPress", "Bench Press" → "benchpress". */
export function normalizeKey(v: string | null | undefined): string | null {
  if (v == null) return null;
  const k = String(v).toLowerCase().replace(/[^a-z0-9]/g, '');
  return k.length ? k : null;
}

const UNKNOWN_CATEGORIES = new Set(['unknown', 'invalid']);

function watchCategory(s: WatchSet): string | null {
  const k = normalizeKey(s.category);
  if (k == null || UNKNOWN_CATEGORIES.has(k) || /^\d+$/.test(k)) return null;
  return k;
}

function subtypeMatches(ex: MatchSessionExercise, s: WatchSet): boolean {
  const want = ex.garminSubtype;
  if (want == null || want === '') return false;
  if (typeof want === 'number' || /^\d+$/.test(String(want))) {
    return s.subtype != null && Number(want) === s.subtype;
  }
  const a = normalizeKey(String(want));
  const b = normalizeKey(s.subtypeName);
  return a != null && a === b;
}

/** A set_logs row is "empty" if it is not done and has no reps/seconds/weight. */
export function isEmptyLog(l: MatchSetLog): boolean {
  return !l.done && l.reps == null && l.seconds == null && l.weightKg == null;
}

/** A row the watch may fill: no row at all, or a not-done row missing reps/seconds. */
function isFillable(l: MatchSetLog | undefined): boolean {
  if (!l) return true;
  return !l.done && l.reps == null && l.seconds == null;
}

interface Slot {
  setIndex: number;
  log: MatchSetLog | undefined;
}

export function matchWatchSets(
  watchSets: WatchSet[],
  exercises: MatchSessionExercise[],
  logs: MatchSetLog[],
): MatchResult {
  const active = watchSets
    .filter((s) => s.setType === 'active')
    .sort((a, b) => a.index - b.index);
  const ignoredRest = watchSets.length - active.length;

  const ordered = [...exercises].sort((a, b) => a.position - b.position);

  // Empty slots per exercise, ascending set index.
  const slots = new Map<string, Slot[]>();
  for (const ex of ordered) {
    const byIndex = new Map<number, MatchSetLog>();
    for (const l of logs) if (l.sessionExerciseId === ex.id) byIndex.set(l.setIndex, l);
    const free: Slot[] = [];
    for (let i = 0; i < ex.sets; i++) {
      const log = byIndex.get(i);
      if (isFillable(log)) free.push({ setIndex: i, log });
    }
    slots.set(ex.id, free);
  }
  const capacity = new Map<string, number>(ordered.map((e) => [e.id, slots.get(e.id)!.length]));
  const take = (exId: string) => capacity.set(exId, capacity.get(exId)! - 1);
  const hasRoom = (exId: string) => capacity.get(exId)! > 0;

  const assigned = new Map<number, { exId: string; rule: MatchRule }>();
  const byCategory = (cat: string) =>
    ordered.filter((e) => normalizeKey(e.garminCategory) === cat);

  // Pass 1: exact category + subtype.
  for (const s of active) {
    const cat = watchCategory(s);
    if (!cat) continue;
    const ex = byCategory(cat).find((e) => subtypeMatches(e, s) && hasRoom(e.id));
    if (ex) {
      assigned.set(s.index, { exId: ex.id, rule: 'exact' });
      take(ex.id);
    }
  }

  // Pass 2: category unique in session.
  for (const s of active) {
    if (assigned.has(s.index)) continue;
    const cat = watchCategory(s);
    if (!cat) continue;
    const cands = byCategory(cat);
    if (cands.length === 1 && hasRoom(cands[0].id)) {
      assigned.set(s.index, { exId: cands[0].id, rule: 'category' });
      take(cands[0].id);
    }
  }

  // Pass 3: order fallback, chronological. Applies to uncategorised sets and
  // sets whose category matches several exercises. A set with a known category
  // that matches no exercise in the session is NOT forced in — it is a leftover.
  const leftovers: LeftoverSet[] = [];
  let cursor: string | null = null; // exercise of the previous matched set
  for (const s of active) {
    const prior = assigned.get(s.index);
    if (prior) {
      cursor = prior.exId;
      continue;
    }
    const cat = watchCategory(s);
    const pool = cat ? byCategory(cat) : ordered;
    if (cat && pool.length === 0) {
      leftovers.push({ set: s, reason: 'no_matching_exercise' });
      continue;
    }
    let ex: MatchSessionExercise | undefined;
    if (cursor && hasRoom(cursor) && pool.some((e) => e.id === cursor)) {
      ex = pool.find((e) => e.id === cursor);
    } else {
      const cursorPos = cursor ? ordered.find((e) => e.id === cursor)!.position : -Infinity;
      ex =
        pool.find((e) => hasRoom(e.id) && e.position >= cursorPos) ??
        pool.find((e) => hasRoom(e.id));
    }
    if (!ex) {
      leftovers.push({ set: s, reason: 'no_empty_slot' });
      continue;
    }
    assigned.set(s.index, { exId: ex.id, rule: 'order' });
    take(ex.id);
    cursor = ex.id;
  }

  // Build fills: each exercise's assigned sets, in chronological order, zip
  // onto its empty slots in set-index order.
  const fills: SetFill[] = [];
  for (const ex of ordered) {
    const mine = active.filter((s) => assigned.get(s.index)?.exId === ex.id);
    const free = slots.get(ex.id)!;
    mine.forEach((s, i) => {
      const slot = free[i];
      fills.push(buildFill(ex, slot, s, assigned.get(s.index)!.rule));
    });
  }

  return { fills, leftovers, ignoredRest };
}

function buildFill(ex: MatchSessionExercise, slot: Slot, s: WatchSet, rule: MatchRule): SetFill {
  const log = slot.log;
  const fill: SetFill = {
    setLogId: log?.id ?? null,
    sessionExerciseId: ex.id,
    setIndex: slot.setIndex,
    done: true,
    source: 'watch',
    rule,
    watchSetIndex: s.index,
  };
  if (log?.weightKg == null && s.weightKg != null) fill.weightKg = s.weightKg;
  if (ex.isTimed) {
    const secs = s.durationS != null ? Math.round(s.durationS) : null;
    if (log?.seconds == null && secs != null) fill.seconds = secs;
  } else if (log?.reps == null && s.reps != null) {
    fill.reps = s.reps;
  }
  return fill;
}
