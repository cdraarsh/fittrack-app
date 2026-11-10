import { deterministicUuid } from './ids';
import { phaseForWeek, roundToPlate, type ProgramTemplate } from './templates';
import type { Program, ProgramSession, SessionExercise } from './types';

export interface GenerateInput {
  template: ProgramTemplate;
  programId: string;
  userId: string;
  /** Local calendar date the block starts (YYYY-MM-DD). Informational only. */
  startDate: string;
  /** Creation timestamp (ISO). Passed in so the generator stays pure. */
  now: string;
}

export interface GeneratedProgram {
  program: Program;
  sessions: ProgramSession[];
  sessionExercises: SessionExercise[];
}

export const sessionId = (programId: string, seq: number) => deterministicUuid(`session:${programId}:${seq}`);
export const sessionExerciseId = (programId: string, seq: number, position: number) =>
  deterministicUuid(`session_exercise:${programId}:${seq}:${position}`);

/**
 * Expand a template into numbered sessions. Pure and deterministic: the same
 * input always yields the same rows (ids included). Session 1 starts `up_next`,
 * every other session `locked` — the server's insert trigger enforces the same.
 */
export function generateProgram({ template, programId, userId, startDate, now }: GenerateInput): GeneratedProgram {
  const perWeek = template.rotation.length;
  const total = template.weeks * perWeek;

  const program: Program = {
    id: programId,
    user_id: userId,
    name: template.name,
    template_key: template.key,
    start_date: startDate,
    sessions_per_week: perWeek,
    weeks: template.weeks,
    status: 'active',
    completed_at: null,
    created_at: now,
    updated_at: now,
  };

  const sessions: ProgramSession[] = [];
  const sessionExercises: SessionExercise[] = [];

  for (let seq = 1; seq <= total; seq++) {
    const week = Math.ceil(seq / perWeek);
    const tpl = template.sessions[template.rotation[(seq - 1) % perWeek]];
    if (!tpl) throw new Error(`Template ${template.key} has no session '${template.rotation[(seq - 1) % perWeek]}'`);
    const isDeload = template.deloadWeeks.includes(week);
    const id = sessionId(programId, seq);

    sessions.push({
      id,
      program_id: programId,
      user_id: userId,
      seq,
      week,
      template_key: tpl.key,
      title: isDeload ? `${tpl.title} (Deload)` : tpl.title,
      phase: phaseForWeek(template, week),
      is_deload: isDeload,
      cardio_target: tpl.cardio,
      status: seq === 1 ? 'up_next' : 'locked',
      unlocked_at: seq === 1 ? now : null,
      started_at: null,
      completed_at: null,
      cardio_done: false,
      cardio_duration_s: null,
      cardio_avg_hr: null,
      notes: null,
      created_at: now,
      updated_at: now,
    });

    tpl.exercises.forEach((ex, position) => {
      const target =
        ex.start_kg === null ? null : isDeload ? roundToPlate(ex.start_kg * template.deloadLoadFactor) : ex.start_kg;
      sessionExercises.push({
        id: sessionExerciseId(programId, seq, position),
        session_id: id,
        user_id: userId,
        exercise_id: ex.exercise_id,
        prescribed_exercise_id: ex.exercise_id,
        position,
        sets: ex.sets,
        rep_lo: ex.rep_lo,
        rep_hi: ex.rep_hi,
        rest_s: ex.rest_s,
        target_kg: target,
        created_at: now,
        updated_at: now,
      });
    });
  }

  return { program, sessions, sessionExercises };
}
