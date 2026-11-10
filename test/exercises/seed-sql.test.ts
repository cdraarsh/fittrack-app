import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { EXERCISES } from '@/lib/exercises';
import { buildExerciseSeedSql } from '@/lib/exercises/sql';

const FILE = path.resolve(__dirname, '../../supabase/migrations/20261110000001_v2_exercise_seed.sql');

describe('exercise seed SQL', () => {
  it('matches lib/exercises/seed.ts (run `npm run db:seed:gen` to update)', () => {
    const sql = buildExerciseSeedSql(EXERCISES);
    if (process.env.UPDATE_SEED) fs.writeFileSync(FILE, sql);
    expect(fs.readFileSync(FILE, 'utf8')).toBe(sql);
  });
});
