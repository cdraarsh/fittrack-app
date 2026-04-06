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
