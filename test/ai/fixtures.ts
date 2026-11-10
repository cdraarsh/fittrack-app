import type { LanguageModelV3GenerateResult, LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { APICallError } from 'ai';
import { convertArrayToReadableStream } from 'ai/test';
import { addDays } from '@/lib/ai/stats';
import type { StatsInput } from '@/lib/ai/types';

export const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

export function textResult(text: string): LanguageModelV3GenerateResult {
  return {
    content: [{ type: 'text', text }],
    finishReason: { unified: 'stop', raw: 'stop' },
    usage,
    warnings: [],
  };
}

export function textStream(text: string) {
  const parts: LanguageModelV3StreamPart[] = [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 't1' },
    { type: 'text-delta', id: 't1', delta: text },
    { type: 'text-end', id: 't1' },
    { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
  ];
  return { stream: convertArrayToReadableStream(parts) };
}

export function rateLimitError(): APICallError {
  return new APICallError({
    message: 'Rate limit reached',
    url: 'https://example.test/v1/chat/completions',
    requestBodyValues: {},
    statusCode: 429,
    isRetryable: true,
  });
}

export const TODAY = '2026-11-10';

/** A 4-day/week program, 3 weeks in, with bench + squat history and Garmin + bodyweight data. */
export function richInput(): StatsInput {
  const sessions = [];
  const sessionExercises = [];
  const setLogs = [];
  // 12 completed sessions over the last 26 days, then session 13 next.
  for (let i = 1; i <= 16; i++) {
    const completed = i <= 12;
    const date = addDays(TODAY, -26 + (i - 1) * 2);
    sessions.push({
      id: `s${i}`,
      program_id: 'p1',
      seq: i,
      week: Math.ceil(i / 4),
      title: i % 2 ? 'Upper A' : 'Lower A',
      status: completed ? 'completed' : i === 13 ? 'unlocked' : 'locked',
      completed_at: completed ? `${date}T18:00:00Z` : null,
    });
    const lift = i % 2 ? 'bench' : 'squat';
    const base = lift === 'bench' ? 80 : 100;
    sessionExercises.push({
      id: `se${i}`, session_id: `s${i}`, exercise_id: lift, position: 1, sets: 3, rep_lo: 5, rep_hi: 8,
      target_kg: base + Math.floor((i - 1) / 2) * 2.5,
    });
    if (completed) {
      for (let k = 0; k < 3; k++) {
        setLogs.push({
          id: `l${i}-${k}`, session_exercise_id: `se${i}`, set_index: k,
          weight_kg: base + Math.floor((i - 1) / 2) * 2.5,
          reps: i === 12 && k === 2 ? 3 : 5, // last session: one missed rep target
          seconds: null, rpe: null, done: true, source: 'app', updated_at: `${date}T18:00:00Z`,
        });
      }
    }
  }
  const dailies = [];
  for (let d = 28; d >= 1; d--) {
    dailies.push({ date: addDays(TODAY, -d), sleep_s: 7.5 * 3600, resting_hr: 50, hrv: 60, body_battery: 70, stress_avg: 25, steps: 9000 });
  }
  dailies.push({ date: TODAY, sleep_s: 5 * 3600, resting_hr: 57, hrv: 48, body_battery: 25, stress_avg: 40, steps: 1000 });
  const bodyWeights = [];
  for (let d = 13; d >= 0; d--) bodyWeights.push({ date: addDays(TODAY, -d), kg: d >= 7 ? 82 : 81.5 });
  return {
    today: TODAY,
    program: { id: 'p1', name: 'Upper/Lower', start_date: addDays(TODAY, -26), sessions_per_week: 4, weeks: 4, status: 'active' },
    sessions,
    sessionExercises,
    setLogs,
    exercises: [
      { id: 'bench', name: 'Bench Press', pattern: 'chest', is_timed: false },
      { id: 'squat', name: 'Back Squat', pattern: 'quads', is_timed: false },
    ],
    dailies,
    bodyWeights,
  };
}
