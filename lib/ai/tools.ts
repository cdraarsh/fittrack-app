// ─── Coach tools (read-only) ──────────────────────────────────────────────────
// Every tool is bound to the authenticated userId at construction time; the
// input schemas have no user field, so the model cannot address another user.
// There are deliberately no tools that skip/unlock sessions or edit logs.

import { tool } from 'ai';
import { z } from 'zod';
import type { BodyWeightRow, GarminDailyRow } from './types';

export interface ExerciseHistoryEntry {
  date: string | null;
  sessionSeq: number | null;
  sets: { kg: number | null; reps: number | null; seconds: number | null; rpe: number | null }[];
  bestE1rm: number | null;
}

export interface SessionSetsResult {
  seq: number;
  title: string | null;
  status: string | null;
  completedAt: string | null;
  exercises: {
    name: string;
    prescribed: { sets: number | null; repLo: number | null; repHi: number | null; targetKg: number | null };
    sets: { index: number | null; kg: number | null; reps: number | null; seconds: number | null; done: boolean; source: string | null }[];
  }[];
}

/** Read-only data access, always scoped by the userId passed in. */
export interface CoachDataSource {
  exerciseHistory(userId: string, args: { exercise: string; weeks: number }): Promise<{ exercise: string | null; entries: ExerciseHistoryEntry[] }>;
  sessionSets(userId: string, args: { seq: number }): Promise<SessionSetsResult | null>;
  garminDailies(userId: string, args: { from: string; to: string }): Promise<GarminDailyRow[]>;
  bodyweightTrend(userId: string, args: { days: number }): Promise<BodyWeightRow[]>;
}

export const COACH_TOOL_NAMES = ['getExerciseHistory', 'getSessionSets', 'getGarminDailies', 'getBodyweightTrend'] as const;

export const TOOL_LIMITS = { maxWeeks: 26, maxDays: 90, maxBodyweightDays: 180 } as const;

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

function clampRange(from: string, to: string, maxDays: number): { from: string; to: string } {
  const [a, b] = from <= to ? [from, to] : [to, from];
  const span = (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;
  if (span <= maxDays) return { from: a, to: b };
  const start = new Date(`${b}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - maxDays);
  return { from: start.toISOString().slice(0, 10), to: b };
}

export function createCoachTools(userId: string, ds: CoachDataSource) {
  if (!userId) throw new Error('createCoachTools requires an authenticated userId');
  return {
    getExerciseHistory: tool({
      description:
        'Logged sets for one exercise over recent weeks (by name, partial match), with best Epley e1RM per session.',
      inputSchema: z.object({
        exercise: z.string().min(2).max(60).describe('Exercise name, e.g. "bench press"'),
        weeks: z.number().int().min(1).max(TOOL_LIMITS.maxWeeks).default(8),
      }),
      execute: async ({ exercise, weeks }) =>
        ds.exerciseHistory(userId, { exercise, weeks: Math.min(Math.max(weeks ?? 8, 1), TOOL_LIMITS.maxWeeks) }),
    }),
    getSessionSets: tool({
      description: 'Prescription and logged sets for one program session by its session number.',
      inputSchema: z.object({ seq: z.number().int().min(1).max(1000).describe('Session number in the program') }),
      execute: async ({ seq }) => (await ds.sessionSets(userId, { seq })) ?? { error: 'session not found' },
    }),
    getGarminDailies: tool({
      description: 'Garmin daily health (sleep seconds, resting HR, HRV, Body Battery, stress, steps) for a date range (max 90 days).',
      inputSchema: z.object({ from: dateStr, to: dateStr }),
      execute: async ({ from, to }) => ds.garminDailies(userId, clampRange(from, to, TOOL_LIMITS.maxDays)),
    }),
    getBodyweightTrend: tool({
      description: 'Bodyweight entries (kg) for the last N days.',
      inputSchema: z.object({ days: z.number().int().min(7).max(TOOL_LIMITS.maxBodyweightDays).default(28) }),
      execute: async ({ days }) =>
        ds.bodyweightTrend(userId, { days: Math.min(Math.max(days ?? 28, 7), TOOL_LIMITS.maxBodyweightDays) }),
    }),
  };
}

export type CoachTools = ReturnType<typeof createCoachTools>;
