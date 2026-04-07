import { DAYS, WORKOUTS, DEFAULT_GYM_DAYS } from './constants';
import type { Settings, DayData, WeightEntry, NutritionTargets, PREntry, MeasurementEntry, WorkoutTemplate } from './types';

// ─── Date helpers ─────────────────────────────────────────────
export function dk(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday:'long', month:'short', day:'numeric', year:'numeric' });
}

export function fmtShort(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

// ─── Settings helpers ─────────────────────────────────────────
export function defaultSettings(): Settings {
  return {
    name: '', startDate: dk(new Date()),
    gymDays: DEFAULT_GYM_DAYS,
    cals_gym: 2100, cals_rest: 1850, protein: 155, fat: 70,
    weight_start: 80, height: 175, onboarded: false, plan: 'free',
  };
}

export function getProgramStart(settings: Settings | null): Date {
  const s = settings ?? defaultSettings();
  return new Date(s.startDate + 'T00:00:00');
}

export function getGymDays(settings: Settings | null): string[] {
  return settings?.gymDays ?? DEFAULT_GYM_DAYS;
}

export function getProgramWeeks(settings: Settings | null): number {
  return settings?.programWeeks ?? 16;
}

export function getWeekNum(settings: Settings | null): number {
  const ms = Date.now() - getProgramStart(settings).getTime();
  return Math.max(1, Math.min(getProgramWeeks(settings), Math.floor(ms / (7 * 24 * 60 * 60 * 1000)) + 1));
}

export function getPhaseInfo(weekNum: number, totalWeeks: number) {
  const pct = (weekNum - 1) / totalWeeks;
  if (pct < 0.25) return { phase: 'Foundation Phase', icon: '🏗️', weeks: `1–${Math.round(totalWeeks * 0.25)}`,   desc: 'Prioritise form over load. Film your squat and deadlift every session.' };
  if (pct < 0.50) return { phase: 'Build Phase',       icon: '📈', weeks: `${Math.round(totalWeeks * 0.25) + 1}–${Math.round(totalWeeks * 0.5)}`,  desc: 'Start progressive overload. Add 2.5 kg when you hit the top of your rep range.' };
  if (pct < 0.75) return { phase: 'Strength Phase',    icon: '💪', weeks: `${Math.round(totalWeeks * 0.5) + 1}–${Math.round(totalWeeks * 0.75)}`, desc: 'Push RPE 8–9 on compounds. Track your PRs — this is where numbers should peak.' };
  return           { phase: 'Peak Phase',              icon: '🏆', weeks: `${Math.round(totalWeeks * 0.75) + 1}–${totalWeeks}`,                   desc: 'Peak intensity. Push hard and let your body peak.' };
}

export function getDayDateInWeek(workoutKey: string, settings: Settings | null): Date {
  const gymDays = [...getGymDays(settings)].sort((a, b) => DAYS.indexOf(a as typeof DAYS[number]) - DAYS.indexOf(b as typeof DAYS[number]));
  const workoutKeys = Object.keys(WORKOUTS);
  const position = workoutKeys.indexOf(workoutKey);
  const targetDay = gymDays[Math.min(position, gymDays.length - 1)] ?? gymDays[0];
  if (!targetDay) return getProgramStart(settings);

  const weekOffset = getWeekNum(settings) - 1;
  const programStart = getProgramStart(settings);
  const startDayIdx = programStart.getDay();
  const targetDayIdx = DAYS.indexOf(targetDay as typeof DAYS[number]);
  let daysOffset = targetDayIdx - startDayIdx;
  if (daysOffset < 0) daysOffset += 7;

  const d = new Date(programStart);
  d.setDate(d.getDate() + weekOffset * 7 + daysOffset);
  return d;
}

// ─── Nutrition ────────────────────────────────────────────────
export function calcTDEE(weight: number, height: number): number {
  const bmr = 10 * weight + 6.25 * height - 150 + 5;
  return Math.round(bmr * 1.55);
}

export function computeTargetsFromTDEE(weight: number, height: number) {
  const tdee = calcTDEE(weight, height);
  const cals_gym  = tdee - 200;
  const cals_rest = tdee - 450;
  const protein   = Math.round(weight * 1.8);
  const fat       = 65;
  return { cals_gym, cals_rest, protein, fat };
}

export function getTargets(settings: Settings | null, isGymDay: boolean): NutritionTargets {
  const s = settings ?? defaultSettings();
  const cals  = isGymDay ? s.cals_gym : s.cals_rest;
  const prot  = s.protein;
  const fat   = s.fat;
  const carbs = Math.max(30, Math.round((cals - prot * 4 - fat * 9) / 4));
  return { calories: cals, protein: prot, carbs, fat };
}

// ─── AI workout plan → WorkoutTemplate map ────────────────────
export function getWorkoutMap(settings: Settings | null): Record<string, WorkoutTemplate> {
  const aiPlan = settings?.aiPlan;
  if (!aiPlan?.workout_plan?.days?.length) return WORKOUTS;

  const gymDays = [...getGymDays(settings)].sort(
    (a, b) => DAYS.indexOf(a as typeof DAYS[number]) - DAYS.indexOf(b as typeof DAYS[number])
  );

  const map: Record<string, WorkoutTemplate> = {};
  aiPlan.workout_plan.days.forEach((aiDay, i) => {
    const dayName = gymDays[i];
    if (!dayName) return;
    map[dayName] = {
      day: dayName.charAt(0).toUpperCase() + dayName.slice(1),
      name: aiDay.day_label,
      exercises: aiDay.exercises.map(e => ({
        id: e.id,
        name: e.name,
        sets: e.sets,
        lo: e.reps_low,
        hi: e.reps_high,
        rest: e.rest,
        cue: e.coaching_cue,
        load: e.starting_load_kg,
        isTime: e.is_timed,
      })),
      cardio: aiDay.cardio,
    };
  });
  return map;
}

// ─── Workout helpers ──────────────────────────────────────────
export function isWoDone(dayName: string, data: DayData, workoutMap?: Record<string, WorkoutTemplate>): boolean {
  const wo = (workoutMap ?? WORKOUTS)[dayName];
  if (!wo) return false;
  return wo.exercises.every(ex => {
    const sets = data.wo?.[ex.id]?.sets ?? [];
    return sets.slice(0, ex.sets).filter(s => s?.done).length >= ex.sets;
  });
}

export function todayIsGymDay(settings: Settings | null): boolean {
  const todayName = DAYS[new Date().getDay()];
  return getGymDays(settings).includes(todayName);
}

// ─── PRs ─────────────────────────────────────────────────────
export function computePRs(dayCache: Record<string, DayData>, workoutMap?: Record<string, WorkoutTemplate>): Record<string, PREntry> {
  const exNames: Record<string, string> = {};
  for (const wo of Object.values(workoutMap ?? WORKOUTS))
    for (const ex of wo.exercises)
      exNames[ex.id] = ex.name;

  const prs: Record<string, PREntry> = {};
  for (const [dateStr, dayData] of Object.entries(dayCache)) {
    for (const [exId, exData] of Object.entries(dayData?.wo ?? {})) {
      for (const s of exData?.sets ?? []) {
        if (!s?.done || !s?.weight || s.weight <= 0) continue;
        if (!prs[exId] || s.weight > prs[exId].weight) {
          prs[exId] = { weight: s.weight, reps: s.reps, date: dateStr, name: exNames[exId] ?? exId };
        }
      }
    }
  }
  return prs;
}

// ─── Consistency ──────────────────────────────────────────────
export function calcConsistency(settings: Settings | null, dayCache: Record<string, DayData>) {
  const gymDays = getGymDays(settings);
  const workoutMap = getWorkoutMap(settings);
  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 27);

  let scheduled = 0, completed = 0;
  const d = new Date(cutoff);
  while (d <= today) {
    const n = DAYS[d.getDay()];
    if (gymDays.includes(n)) {
      scheduled++;
      const data = dayCache[dk(d)] ?? { wo:{}, check:{}, meals:[], notes:'' };
      if (isWoDone(n, data, workoutMap)) completed++;
    }
    d.setDate(d.getDate() + 1);
  }
  return { scheduled, completed, pct: scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0 };
}

// ─── Streaks (v1.3) ───────────────────────────────────────────
export function computeStreaks(settings: Settings | null, dayCache: Record<string, DayData>) {
  const gymDays = getGymDays(settings);
  const workoutMap = getWorkoutMap(settings);
  const today = new Date();

  // Day streak — consecutive days with activity (workout done OR meals logged OR checklist item)
  let dayStreak = 0;
  const d = new Date(today);
  while (true) {
    const dateStr = dk(d);
    const data = dayCache[dateStr];
    if (!data) break;
    const hasActivity =
      isWoDone(DAYS[d.getDay()], data, workoutMap) ||
      (data.meals?.length ?? 0) > 0 ||
      Object.values(data.check ?? {}).some(Boolean);
    if (!hasActivity) break;
    dayStreak++;
    d.setDate(d.getDate() - 1);
    if (dayStreak > 365) break;
  }

  // Week streak — consecutive weeks with ≥ min(3, gymDays.length) sessions
  const minSessions = Math.min(3, gymDays.length);
  let weekStreak = 0;
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday

  for (let w = 0; w < 52; w++) {
    const ws = new Date(weekStart);
    ws.setDate(ws.getDate() - w * 7);
    const we = new Date(ws);
    we.setDate(we.getDate() + 6);

    let sessionsThisWeek = 0;
    const wd = new Date(ws);
    while (wd <= we && wd <= today) {
      const n = DAYS[wd.getDay()];
      if (gymDays.includes(n)) {
        const data = dayCache[dk(wd)] ?? { wo:{}, check:{}, meals:[], notes:'' };
        if (isWoDone(n, data, workoutMap)) sessionsThisWeek++;
      }
      wd.setDate(wd.getDate() + 1);
    }
    if (sessionsThisWeek >= minSessions) weekStreak++;
    else break;
  }

  return { dayStreak, weekStreak };
}

// ─── Calorie bank (v1.4) ─────────────────────────────────────
export function computeCalorieBank(settings: Settings | null, dayCache: Record<string, DayData>) {
  const gymDays = getGymDays(settings);
  const today = new Date();

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    const dateStr = dk(d);
    const isGym = gymDays.includes(DAYS[d.getDay()]);
    const budget = isGym ? (settings?.cals_gym ?? 2100) : (settings?.cals_rest ?? 1850);
    const actual = (dayCache[dateStr]?.meals ?? []).reduce((s, m) => s + m.calories, 0);
    return { date: dateStr, label: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2), budget, actual, isGym };
  });

  const loggedDays = days.filter(d => d.actual > 0);
  const bankBalance = loggedDays.reduce((s, d) => s + (d.budget - d.actual), 0);

  return { days, bankBalance, loggedDays: loggedDays.length };
}

// ─── Weekly summary ───────────────────────────────────────────
export function computeWeeklySummary(settings: Settings | null, dayCache: Record<string, DayData>, weightCache: WeightEntry[]) {
  const gymDays = getGymDays(settings);
  const today = new Date();
  const isGym = todayIsGymDay(settings);
  const t = getTargets(settings, isGym);

  let sessionsScheduled = 0, sessionsDone = 0;
  let totalCals = 0, calDays = 0, totalWater = 0, waterDays = 0;
  let bestLift: { name: string; weight: number; reps: number; vol: number } | null = null;

  const d = new Date(today);
  d.setDate(d.getDate() - 6);

  const workoutMap = getWorkoutMap(settings);
  const exNames: Record<string, string> = {};
  for (const wo of Object.values(workoutMap))
    for (const ex of wo.exercises)
      exNames[ex.id] = ex.name;

  while (d <= today) {
    const n = DAYS[d.getDay()];
    const data = dayCache[dk(d)] ?? { wo:{}, check:{}, meals:[], notes:'' };
    if (gymDays.includes(n)) {
      sessionsScheduled++;
      if (isWoDone(n, data, workoutMap)) sessionsDone++;
    }
    const meals = data.meals ?? [];
    if (meals.length > 0) { totalCals += meals.reduce((s, m) => s + m.calories, 0); calDays++; }
    if ((data.check?.water ?? 0) > 0) { totalWater += data.check!.water!; waterDays++; }

    for (const [exId, exData] of Object.entries(data.wo ?? {})) {
      for (const s of exData?.sets ?? []) {
        if (s?.done && s?.weight && s?.reps) {
          const vol = s.weight * s.reps;
          if (!bestLift || vol > bestLift.vol)
            bestLift = { vol, weight: s.weight, reps: s.reps, name: exNames[exId] ?? exId };
        }
      }
    }
    d.setDate(d.getDate() + 1);
  }

  const weekStartStr = dk(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6));
  const weekEntries = weightCache.filter(e => e.date >= weekStartStr);
  const weightDelta = weekEntries.length >= 2
    ? +(weekEntries[weekEntries.length - 1].weight - weekEntries[0].weight).toFixed(1)
    : null;

  return {
    sessionsScheduled, sessionsDone,
    avgCals: calDays > 0 ? Math.round(totalCals / calDays) : null,
    calTarget: t.calories,
    avgWater: waterDays > 0 ? +(totalWater / waterDays).toFixed(1) : null,
    weightDelta, bestLift,
  };
}
