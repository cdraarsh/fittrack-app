/** Movement pattern — used for grouping and weekly-volume stats. */
export type Pattern =
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'knee_flexion'
  | 'knee_extension'
  | 'calf'
  | 'elbow_flexion'
  | 'elbow_extension'
  | 'shoulder_isolation'
  | 'chest_isolation'
  | 'core';

export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'cable'
  | 'machine'
  | 'smith'
  | 'trap_bar'
  | 'bodyweight'
  | 'band'
  | 'other';

/**
 * One row of the `exercises` table. `id` is a stable text slug so seeds,
 * templates and the client can reference it offline.
 *
 * `garmin_category` / `garmin_subtype` use the FIT SDK Profile names in
 * snake_case (e.g. `bench_press` / `barbell_bench_press`). Null = unknown;
 * the watch-set matcher then falls back to order.
 */
export interface Exercise {
  id: string;
  name: string;
  pattern: Pattern;
  equipment: Equipment;
  is_timed: boolean;
  rep_lo: number;
  rep_hi: number;
  swap_group: string;
  garmin_category: string | null;
  garmin_subtype: string | null;
  cue: string | null;
}
