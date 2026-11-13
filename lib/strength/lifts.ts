// Per-exercise progress from local logs (works offline). Pure: rows in, summary out.
import { epley1RM } from '@/lib/ai/stats';

export interface LiftRowsInput {
  exercises: { id: string; name: string; is_timed?: boolean }[];
  sessions: { id: string; seq: number; template_key: string; completed_at: string | null; started_at: string | null }[];
  sessionExercises: { id: string; session_id: string; exercise_id: string }[];
  logs: { session_exercise_id: string; weight_kg: number | null; reps: number | null; seconds: number | null; done: boolean; logged_at: string | null; updated_at: string }[];
}

export interface LiftPoint {
  date: string; // YYYY-MM-DD of the session
  e1rm: number;
  topKg: number;
  topReps: number;
}

export interface LiftProgress {
  exerciseId: string;
  name: string;
  /** Best estimated 1RM ever, and the set it came from. */
  best: LiftPoint;
  latest: LiftPoint;
  /** One point per session (that session's best set), oldest first. */
  trend: LiftPoint[];
  /** latest − first in the last 28 days of trend, kg (null with < 2 points). */
  change28: number | null;
  sessions: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function liftProgress(input: LiftRowsInput, today = new Date().toISOString().slice(0, 10)): LiftProgress[] {
  const exById = new Map(input.exercises.map((e) => [e.id, e]));
  const sessionById = new Map(input.sessions.map((s) => [s.id, s]));
  const seById = new Map(input.sessionExercises.map((se) => [se.id, se]));

  // exercise → session → best set
  const per = new Map<string, Map<string, LiftPoint>>();
  for (const l of input.logs) {
    if (!l.done || l.weight_kg === null || l.weight_kg <= 0 || !l.reps) continue;
    const se = seById.get(l.session_exercise_id);
    const ex = se && exById.get(se.exercise_id);
    const s = se && sessionById.get(se.session_id);
    if (!se || !ex || !s || ex.is_timed) continue;
    const e1rm = epley1RM(l.weight_kg, l.reps);
    if (e1rm === null) continue;
    const date = (s.completed_at ?? s.started_at ?? l.logged_at ?? l.updated_at).slice(0, 10);
    const point: LiftPoint = { date, e1rm: round1(e1rm), topKg: l.weight_kg, topReps: l.reps };
    const bySession = per.get(ex.id) ?? new Map<string, LiftPoint>();
    const cur = bySession.get(s.id);
    if (!cur || point.e1rm > cur.e1rm) bySession.set(s.id, point);
    per.set(ex.id, bySession);
  }

  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 28);
  const since = cutoff.toISOString().slice(0, 10);

  const out: LiftProgress[] = [];
  for (const [exerciseId, bySession] of per) {
    const trend = [...bySession.values()].sort((a, b) => a.date.localeCompare(b.date));
    const best = trend.reduce((a, b) => (b.e1rm > a.e1rm ? b : a));
    const recent = trend.filter((p) => p.date >= since);
    out.push({
      exerciseId,
      name: exById.get(exerciseId)!.name,
      best,
      latest: trend[trend.length - 1],
      trend,
      change28: recent.length >= 2 ? round1(recent[recent.length - 1].e1rm - recent[0].e1rm) : null,
      sessions: trend.length,
    });
  }
  // Most recently trained first, then by name.
  return out.sort((a, b) => b.latest.date.localeCompare(a.latest.date) || a.name.localeCompare(b.name));
}
