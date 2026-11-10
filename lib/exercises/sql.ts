import type { Exercise } from './types';

function lit(v: string | number | boolean | null): string {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  return `'${v.replace(/'/g, "''")}'`;
}

const COLS = [
  'id', 'name', 'pattern', 'equipment', 'is_timed', 'rep_lo', 'rep_hi',
  'swap_group', 'garmin_category', 'garmin_subtype', 'cue',
] as const;

/**
 * Render the exercise seed migration from the TS library. Deterministic, so a
 * test can compare it to the committed SQL file byte-for-byte.
 */
export function buildExerciseSeedSql(exercises: Exercise[]): string {
  const rows = exercises.map(
    (e) => `  (${COLS.map((c) => lit(e[c] as string | number | boolean | null)).join(', ')})`,
  );
  return [
    '-- GENERATED from lib/exercises/seed.ts — do not edit by hand.',
    '-- Regenerate with: npm run db:seed:gen',
    '',
    `insert into public.exercises (${COLS.join(', ')}) values`,
    rows.join(',\n'),
    'on conflict (id) do update set',
    COLS.filter((c) => c !== 'id').map((c) => `  ${c} = excluded.${c}`).join(',\n') + ',',
    '  updated_at = now();',
    '',
  ].join('\n');
}
