import type { Equipment, Exercise, Pattern } from './types';

/**
 * Exercise library seed — v1's 23 program exercises plus every SWAP_MAP
 * alternate. This file is the source of truth: the SQL seed
 * (supabase/migrations/20261110000001_v2_exercise_seed.sql) is generated from it
 * by `npm run db:seed:gen` and a test fails if the two drift.
 *
 * Swap groups are movement families. v1's per-exercise SWAP_MAP lists overlapped
 * (e.g. T-Bar Row was an alternate for both Cable Row and Bent-Over Row), so the
 * overlapping lists are merged into one group each.
 *
 * Garmin fields: FIT SDK `exercise_category` names, plus the per-category
 * `*_exercise_name` subtype only where we are confident of the exact name.
 * Unknown → null (the matcher falls back to category-unique / order matching).
 */

interface Opts {
  timed?: boolean;
  cat?: string | null;
  sub?: string | null;
  cue?: string | null;
}

function ex(
  id: string,
  name: string,
  pattern: Pattern,
  equipment: Equipment,
  swap_group: string,
  rep_lo: number,
  rep_hi: number,
  o: Opts = {},
): Exercise {
  return {
    id,
    name,
    pattern,
    equipment,
    is_timed: o.timed ?? false,
    rep_lo,
    rep_hi,
    swap_group,
    garmin_category: o.cat ?? null,
    garmin_subtype: o.sub ?? null,
    cue: o.cue ?? null,
  };
}

/** The 23 exercises v1's 4-day program prescribes. */
export const PRIMARY_EXERCISES: Exercise[] = [
  // Upper A — push focus
  ex('bench', 'Flat Barbell Bench Press', 'horizontal_push', 'barbell', 'chest_press', 8, 10, { cat: 'bench_press', sub: 'barbell_bench_press', cue: 'Add 2.5 kg when you hit 3×10.' }),
  ex('shoulder', 'Seated DB Shoulder Press', 'vertical_push', 'dumbbell', 'shoulder_press', 10, 12, { cat: 'shoulder_press' }),
  ex('cablerow', 'Cable Row (wide grip)', 'horizontal_pull', 'cable', 'row', 10, 12, { cat: 'row', cue: 'Stack position you can control for all 12.' }),
  ex('latpull', 'Lat Pulldown', 'vertical_pull', 'cable', 'vertical_pull', 10, 12, { cat: 'pull_up', cue: 'Squeeze lats hard at bottom.' }),
  ex('tricep', 'Tricep Rope Pushdown', 'elbow_extension', 'cable', 'triceps', 12, 15, { cat: 'triceps_extension', cue: 'Light weight, full range of motion.' }),
  ex('bicep', 'DB Bicep Curl', 'elbow_flexion', 'dumbbell', 'biceps', 12, 15, { cat: 'curl', cue: 'No swinging.' }),
  // Lower A — quad focus
  ex('squat', 'Barbell Back Squat', 'squat', 'barbell', 'quad', 8, 10, { cat: 'squat', cue: 'Depth > weight. Film your sets.' }),
  ex('legprss', 'Leg Press', 'squat', 'machine', 'quad', 10, 12, { cat: 'squat', sub: 'leg_press', cue: 'Full range.' }),
  ex('rdl', 'Romanian Deadlift', 'hinge', 'barbell', 'hinge', 10, 12, { cat: 'deadlift', cue: 'Feel the hamstring stretch.' }),
  ex('legcurl', 'Leg Curl (machine)', 'knee_flexion', 'machine', 'hamstring_curl', 12, 15, { cat: 'leg_curl', cue: 'Controlled eccentric — 3 sec lowering.' }),
  ex('calf', 'Standing Calf Raise', 'calf', 'machine', 'calf', 15, 20, { cat: 'calf_raise', cue: 'Pause 2 sec at top of each rep.' }),
  ex('plank', 'Plank', 'core', 'bodyweight', 'core_brace', 30, 45, { timed: true, cat: 'plank', cue: 'Squeeze glutes, brace abs.' }),
  // Upper B — pull focus
  ex('bentrow', 'Barbell Bent-Over Row', 'horizontal_pull', 'barbell', 'row', 8, 10, { cat: 'row', cue: 'Chest to bar, no heaving.' }),
  ex('incline', 'Incline DB Bench Press', 'horizontal_push', 'dumbbell', 'incline_press', 10, 12, { cat: 'bench_press', sub: 'incline_dumbbell_bench_press' }),
  ex('facepull', 'Seated Cable Face Pull', 'horizontal_pull', 'cable', 'rear_delt', 12, 15, { cue: 'Light. External rotate at end of each rep.' }),
  ex('lateral', 'Lateral Raise (DB)', 'shoulder_isolation', 'dumbbell', 'lateral_raise', 12, 15, { cat: 'lateral_raise', cue: 'Lead with the pinky.' }),
  ex('ohtri', 'Overhead Tricep Extension', 'elbow_extension', 'cable', 'triceps', 12, 15, { cat: 'triceps_extension', cue: 'Stretch fully at bottom.' }),
  ex('hammer', 'Hammer Curl', 'elbow_flexion', 'dumbbell', 'biceps', 12, 15, { cat: 'curl' }),
  // Lower B — hinge focus
  ex('deadlift', 'Deadlift (Trap Bar / Conv.)', 'hinge', 'barbell', 'hinge', 6, 8, { cat: 'deadlift', cue: 'Brace hard, flat back.' }),
  ex('bss', 'Bulgarian Split Squat', 'lunge', 'dumbbell', 'quad', 10, 10, { cat: 'lunge', cue: 'Per leg.' }),
  ex('hipthru', 'Hip Thrust', 'hinge', 'barbell', 'hinge', 10, 12, { cat: 'hip_raise', cue: 'Squeeze glutes 2 sec.' }),
  ex('legext', 'Leg Extension', 'knee_extension', 'machine', 'knee_extension', 12, 15, { cue: 'Controlled, squeeze at top.' }),
  ex('kneeraise', 'Hanging Knee Raise / Cable Crunch', 'core', 'bodyweight', 'core_flexion', 12, 15, { cat: 'leg_raise', cue: 'Slow and controlled.' }),
];

/** Every v1 SWAP_MAP alternate, deduplicated. */
export const ALTERNATE_EXERCISES: Exercise[] = [
  // chest_press
  ex('db-bench', 'DB Bench Press', 'horizontal_push', 'dumbbell', 'chest_press', 8, 10, { cat: 'bench_press', sub: 'dumbbell_bench_press' }),
  ex('smith-press', 'Smith Machine Press', 'horizontal_push', 'smith', 'chest_press', 8, 10, { cat: 'bench_press', sub: 'smith_machine_bench_press' }),
  ex('weighted-pushup', 'Weighted Push-Up', 'horizontal_push', 'bodyweight', 'chest_press', 8, 12, { cat: 'push_up' }),
  // shoulder_press
  ex('standing-db-press', 'Standing DB Press', 'vertical_push', 'dumbbell', 'shoulder_press', 10, 12, { cat: 'shoulder_press' }),
  ex('machine-shoulder-press', 'Machine Shoulder Press', 'vertical_push', 'machine', 'shoulder_press', 10, 12, { cat: 'shoulder_press' }),
  ex('arnold-press', 'Arnold Press', 'vertical_push', 'dumbbell', 'shoulder_press', 10, 12, { cat: 'shoulder_press' }),
  // row
  ex('tbar-row', 'T-Bar Row', 'horizontal_pull', 'barbell', 'row', 8, 12, { cat: 'row' }),
  ex('chest-supported-row', 'Chest-Supported Row', 'horizontal_pull', 'dumbbell', 'row', 10, 12, { cat: 'row' }),
  ex('single-arm-db-row', 'Single-Arm DB Row', 'horizontal_pull', 'dumbbell', 'row', 10, 12, { cat: 'row' }),
  ex('cable-row-underhand', 'Cable Row (underhand)', 'horizontal_pull', 'cable', 'row', 8, 10, { cat: 'row' }),
  ex('pendlay-row', 'Pendlay Row', 'horizontal_pull', 'barbell', 'row', 8, 10, { cat: 'row' }),
  // vertical_pull
  ex('assisted-pullup', 'Assisted Pull-Up', 'vertical_pull', 'machine', 'vertical_pull', 8, 12, { cat: 'pull_up' }),
  ex('neutral-pulldown', 'Neutral Grip Pulldown', 'vertical_pull', 'cable', 'vertical_pull', 10, 12, { cat: 'pull_up' }),
  ex('straight-arm-pulldown', 'Straight-Arm Pulldown', 'vertical_pull', 'cable', 'vertical_pull', 12, 15),
  // triceps
  ex('tricep-bar-pushdown', 'Tricep Bar Pushdown', 'elbow_extension', 'cable', 'triceps', 12, 15, { cat: 'triceps_extension' }),
  ex('overhead-db-extension', 'Overhead DB Extension', 'elbow_extension', 'dumbbell', 'triceps', 12, 15, { cat: 'triceps_extension' }),
  ex('dips', 'Dips (BW)', 'elbow_extension', 'bodyweight', 'triceps', 8, 15),
  ex('skull-crusher', 'Skull Crusher', 'elbow_extension', 'barbell', 'triceps', 10, 12, { cat: 'triceps_extension' }),
  ex('close-grip-bench', 'Close-Grip Bench Press', 'elbow_extension', 'barbell', 'triceps', 8, 12, { cat: 'bench_press', sub: 'close_grip_barbell_bench_press' }),
  // biceps
  ex('barbell-curl', 'Barbell Curl', 'elbow_flexion', 'barbell', 'biceps', 10, 12, { cat: 'curl' }),
  ex('cable-curl', 'Cable Curl', 'elbow_flexion', 'cable', 'biceps', 12, 15, { cat: 'curl' }),
  ex('concentration-curl', 'Concentration Curl', 'elbow_flexion', 'dumbbell', 'biceps', 12, 15, { cat: 'curl' }),
  ex('cross-body-curl', 'Cross-Body Curl', 'elbow_flexion', 'dumbbell', 'biceps', 12, 15, { cat: 'curl' }),
  ex('cable-hammer-curl', 'Cable Hammer Curl', 'elbow_flexion', 'cable', 'biceps', 12, 15, { cat: 'curl' }),
  ex('zottman-curl', 'Zottman Curl', 'elbow_flexion', 'dumbbell', 'biceps', 12, 15, { cat: 'curl' }),
  // quad
  ex('goblet-squat', 'Goblet Squat', 'squat', 'dumbbell', 'quad', 10, 12, { cat: 'squat', sub: 'goblet_squat' }),
  ex('hack-squat', 'Hack Squat Machine', 'squat', 'machine', 'quad', 8, 12, { cat: 'squat' }),
  ex('safety-bar-squat', 'Safety Bar Squat', 'squat', 'barbell', 'quad', 8, 10, { cat: 'squat' }),
  ex('db-step-up', 'Step-Up (DB)', 'lunge', 'dumbbell', 'quad', 10, 12),
  ex('db-reverse-lunge', 'Reverse Lunge (DB)', 'lunge', 'dumbbell', 'quad', 10, 12, { cat: 'lunge' }),
  ex('single-leg-press', 'Single-Leg Press', 'squat', 'machine', 'quad', 10, 12),
  // hinge
  ex('sl-rdl', 'Single-Leg RDL (DB)', 'hinge', 'dumbbell', 'hinge', 10, 12, { cat: 'deadlift' }),
  ex('good-morning', 'Good Morning', 'hinge', 'barbell', 'hinge', 10, 12),
  ex('cable-pull-through', 'Cable Pull-Through', 'hinge', 'cable', 'hinge', 12, 15),
  ex('sumo-deadlift', 'Sumo Deadlift', 'hinge', 'barbell', 'hinge', 6, 8, { cat: 'deadlift', sub: 'sumo_deadlift' }),
  ex('trap-bar-deadlift', 'Trap Bar Deadlift', 'hinge', 'trap_bar', 'hinge', 6, 8, { cat: 'deadlift', sub: 'trap_bar_deadlift' }),
  ex('glute-bridge', 'Glute Bridge (floor)', 'hinge', 'bodyweight', 'hinge', 12, 15, { cat: 'hip_raise' }),
  ex('banded-hip-thrust', 'Banded Hip Thrust', 'hinge', 'band', 'hinge', 12, 15, { cat: 'hip_raise' }),
  // hamstring_curl
  ex('nordic-curl', 'Nordic Curl', 'knee_flexion', 'bodyweight', 'hamstring_curl', 5, 8, { cat: 'leg_curl' }),
  ex('single-leg-curl', 'Single-Leg Curl', 'knee_flexion', 'machine', 'hamstring_curl', 12, 15, { cat: 'leg_curl' }),
  ex('swiss-ball-curl', 'Swiss Ball Curl', 'knee_flexion', 'other', 'hamstring_curl', 12, 15, { cat: 'leg_curl' }),
  // calf
  ex('seated-calf-raise', 'Seated Calf Raise', 'calf', 'machine', 'calf', 15, 20, { cat: 'calf_raise' }),
  ex('donkey-calf-raise', 'Donkey Calf Raise', 'calf', 'machine', 'calf', 15, 20, { cat: 'calf_raise' }),
  ex('leg-press-calf', 'Calf Press (Leg Press)', 'calf', 'machine', 'calf', 15, 20, { cat: 'calf_raise' }),
  // core_brace
  ex('dead-bug', 'Dead Bug', 'core', 'bodyweight', 'core_brace', 10, 12),
  ex('rkc-plank', 'RKC Plank', 'core', 'bodyweight', 'core_brace', 20, 30, { timed: true, cat: 'plank' }),
  ex('ab-wheel', 'Ab Wheel Rollout', 'core', 'other', 'core_brace', 8, 12),
  // incline_press
  ex('incline-barbell-press', 'Incline Barbell Press', 'horizontal_push', 'barbell', 'incline_press', 8, 10, { cat: 'bench_press', sub: 'incline_barbell_bench_press' }),
  ex('high-cable-fly', 'Cable Fly (high)', 'chest_isolation', 'cable', 'incline_press', 12, 15, { cat: 'flye' }),
  ex('pec-deck', 'Pec Deck', 'chest_isolation', 'machine', 'incline_press', 12, 15, { cat: 'flye' }),
  // rear_delt
  ex('band-pull-apart', 'Band Pull-Apart', 'horizontal_pull', 'band', 'rear_delt', 15, 20),
  ex('db-reverse-fly', 'Reverse Fly (DB)', 'shoulder_isolation', 'dumbbell', 'rear_delt', 12, 15),
  ex('cable-external-rotation', 'Cable External Rotation', 'shoulder_isolation', 'cable', 'rear_delt', 12, 15),
  // lateral_raise
  ex('cable-lateral-raise', 'Cable Lateral Raise', 'shoulder_isolation', 'cable', 'lateral_raise', 12, 15, { cat: 'lateral_raise' }),
  ex('machine-lateral-raise', 'Machine Lateral Raise', 'shoulder_isolation', 'machine', 'lateral_raise', 12, 15, { cat: 'lateral_raise' }),
  ex('upright-row', 'Upright Row', 'shoulder_isolation', 'barbell', 'lateral_raise', 10, 12),
  // knee_extension
  ex('terminal-knee-extension', 'Terminal Knee Extension', 'knee_extension', 'band', 'knee_extension', 15, 20),
  ex('vmo-squat', 'VMO Squat', 'squat', 'bodyweight', 'knee_extension', 12, 15),
  ex('sissy-squat', 'Sissy Squat', 'squat', 'bodyweight', 'knee_extension', 10, 12),
  // core_flexion
  ex('cable-crunch', 'Cable Crunch', 'core', 'cable', 'core_flexion', 12, 15, { cat: 'crunch' }),
  ex('decline-situp', 'Decline Sit-Up', 'core', 'bodyweight', 'core_flexion', 12, 15, { cat: 'sit_up' }),
  ex('l-sit', 'L-Sit Hold', 'core', 'bodyweight', 'core_flexion', 15, 30, { timed: true }),
];

/**
 * v1's SWAP_MAP, re-expressed as exercise ids (names deduplicated: e.g.
 * "Tricep Pushdown (bar)" → tricep-bar-pushdown, "Romanian Deadlift (primary)" → rdl).
 * Kept so the library provably covers every v1 alternate.
 */
export const V1_SWAP_ALTERNATES: Record<string, string[]> = {
  bench: ['db-bench', 'smith-press', 'weighted-pushup'],
  shoulder: ['standing-db-press', 'machine-shoulder-press', 'arnold-press'],
  cablerow: ['tbar-row', 'chest-supported-row', 'single-arm-db-row'],
  latpull: ['assisted-pullup', 'neutral-pulldown', 'straight-arm-pulldown'],
  tricep: ['tricep-bar-pushdown', 'overhead-db-extension', 'dips'],
  bicep: ['barbell-curl', 'cable-curl', 'concentration-curl'],
  squat: ['goblet-squat', 'hack-squat', 'safety-bar-squat'],
  legprss: ['hack-squat', 'bss', 'db-step-up'],
  rdl: ['sl-rdl', 'good-morning', 'cable-pull-through'],
  legcurl: ['nordic-curl', 'single-leg-curl', 'swiss-ball-curl'],
  calf: ['seated-calf-raise', 'donkey-calf-raise', 'leg-press-calf'],
  plank: ['dead-bug', 'rkc-plank', 'ab-wheel'],
  bentrow: ['tbar-row', 'cable-row-underhand', 'pendlay-row'],
  incline: ['incline-barbell-press', 'high-cable-fly', 'pec-deck'],
  facepull: ['band-pull-apart', 'db-reverse-fly', 'cable-external-rotation'],
  lateral: ['cable-lateral-raise', 'machine-lateral-raise', 'upright-row'],
  ohtri: ['skull-crusher', 'tricep-bar-pushdown', 'close-grip-bench'],
  hammer: ['cross-body-curl', 'cable-hammer-curl', 'zottman-curl'],
  deadlift: ['sumo-deadlift', 'trap-bar-deadlift', 'rdl'],
  bss: ['db-reverse-lunge', 'db-step-up', 'single-leg-press'],
  hipthru: ['glute-bridge', 'cable-pull-through', 'banded-hip-thrust'],
  legext: ['terminal-knee-extension', 'vmo-squat', 'sissy-squat'],
  kneeraise: ['cable-crunch', 'decline-situp', 'l-sit'],
};

export const EXERCISES: Exercise[] = [...PRIMARY_EXERCISES, ...ALTERNATE_EXERCISES];

export const EXERCISES_BY_ID: Record<string, Exercise> = Object.fromEntries(
  EXERCISES.map((e) => [e.id, e]),
);

/** Exercises that can replace `exerciseId` (same swap group, excluding itself). */
export function swapOptions(exerciseId: string, library: Exercise[] = EXERCISES): Exercise[] {
  const me = library.find((e) => e.id === exerciseId);
  if (!me) return [];
  return library.filter((e) => e.swap_group === me.swap_group && e.id !== exerciseId);
}
