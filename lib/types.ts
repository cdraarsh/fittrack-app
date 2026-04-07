// ─── Core data types ──────────────────────────────────────────

export interface SetData {
  weight?: number;
  reps?: number;
  done?: boolean;
}

export interface ExerciseData {
  sets?: SetData[];
}

export interface WorkoutData {
  [exId: string]: ExerciseData;
}

export interface CheckData {
  water?: number;
  sleep?: boolean;
  noSugar?: boolean;
  steps?: boolean;
  weighIn?: boolean;
}

export interface MealEntry {
  name: string;
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
}

export interface MealTemplate {
  id: string;
  name: string;
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
}

export interface CheckInV1 {
  text: string;
}

export interface CheckInV2 {
  sessions: number;          // 0–4
  energy: number;            // 1–5
  dietAdherence: 'on-track' | 'mostly' | 'off-track';
  hardestMoment?: string;
  nextWeekGoal?: string;
}

export interface DayData {
  wo: WorkoutData;
  cardio?: boolean;
  check: CheckData;
  meals: MealEntry[];
  notes: string;
  checkin?: string;      // legacy v1
  checkin_v2?: CheckInV2; // v1.3
}

export interface WeightEntry {
  date: string;   // YYYY-MM-DD
  weight: number;
}

export interface MeasurementEntry {
  date: string;
  waist?: number | null;
  chest?: number | null;
  leftArm?: number | null;
  rightArm?: number | null;
  hips?: number | null;
}

export interface PhotoEntry {
  id: string;
  date: string;        // YYYY-MM-DD
  url: string;
  storagePath: string;
  note?: string;
}

export interface StreakData {
  dayStreak: number;
  weekStreak: number;
  lastActivityDate: string;
}

export type PlanTier = 'free' | 'pro';

// ─── AI-generated onboarding plan ─────────────────────────────
export interface AIPlan {
  daily_targets: {
    gym_day_calories: number;
    rest_day_calories: number;
    protein_g: number;
    carbs_g_gym: number;
    carbs_g_rest: number;
    fat_g: number;
  };
  tdee_estimate: number;
  weekly_weight_change_target_kg: number;
  expected_weight_in_program_end_kg: number;
  cardio_recommendation: {
    gym_days: string;
    rest_days: string;
    weekly_steps_target: number;
  };
  nutrition_principles: string[];
  foods_to_prioritize: string[];
  foods_to_limit: string[];
  deficit_strategy: string;
  habit_priorities: string[];
  program_notes: string;
  phase_targets: {
    weeks_1_to_quarter: string;
    weeks_quarter_to_half: string;
    weeks_half_to_three_quarter: string;
    weeks_three_quarter_to_end: string;
  };
}

// ─── User profile from onboarding ─────────────────────────────
export interface UserProfile {
  age: number;
  gender: 'male' | 'female' | 'other';
  target_weight_kg: number;
  goal: 'weight_loss' | 'muscle_gain' | 'recomp';
  activity_outside_gym: 'sedentary' | 'light' | 'moderate' | 'active';
  experience: 'beginner' | 'intermediate' | 'advanced';
  diet_style: 'no_restriction' | 'vegetarian' | 'vegan' | 'keto' | 'high_protein';
  foods_to_avoid: string;
}

// Full profile sent to Claude — includes physical stats from Settings
export interface OnboardingProfile extends UserProfile {
  name: string;
  weight_kg: number;
  height_cm: number;
  gym_days_per_week: number;
  program_weeks: number;
}

export interface Settings {
  name: string;
  startDate: string;          // YYYY-MM-DD
  gymDays: string[];           // e.g. ['monday','tuesday','wednesday','thursday']
  cals_gym: number;
  cals_rest: number;
  protein: number;
  fat: number;
  weight_start: number;
  height: number;
  onboarded: boolean;
  swaps?: Record<string, string>;              // exId → display name
  customExercises?: Record<string, CustomExercise[]>;
  measurements?: MeasurementEntry[];
  plan?: PlanTier;                             // monetization hook
  mealTemplates?: MealTemplate[];
  coachNotes?: Record<string, string>;   // weekNum → text
  programWeeks?: number;                 // 8 | 10 | 12 | 16 | 20, default 16
  aiPlan?: AIPlan;                       // AI-generated personalised plan
  userProfile?: UserProfile;             // raw profile collected at onboarding
}

export interface CustomExercise {
  id: string;
  name: string;
  sets: number;
  reps: string;
  rest: string;
  load: number;
}

export interface PREntry {
  weight: number;
  reps?: number;
  date: string;
  name: string;
}

// ─── Workout template types ────────────────────────────────────

export interface ExerciseTemplate {
  id: string;
  name: string;
  sets: number;
  lo: number;
  hi: number;
  rest: string;
  cue: string;
  load: number | null;
  isTime?: boolean;
}

export interface WorkoutTemplate {
  day: string;
  name: string;
  exercises: ExerciseTemplate[];
  cardio: string;
}

// ─── App state ────────────────────────────────────────────────

export type TabName = 'today' | 'workouts' | 'nutrition' | 'progress' | 'settings';

export interface AppState {
  settings: Settings | null;
  dayCache: Record<string, DayData>;
  weightCache: WeightEntry[];
  isLoading: boolean;
  currentTab: TabName;
}

export interface NutritionTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}
