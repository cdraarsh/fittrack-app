'use client';

import React, { useState } from 'react';
import { Droplets, Moon, XCircle, Layers, TrendingUp, Flame, Trophy } from 'lucide-react';

const PHASE_ICONS = {
  foundation: <Layers size={20} className="text-purple" />,
  build:      <TrendingUp size={20} className="text-purple" />,
  strength:   <Flame size={20} className="text-purple" />,
  peak:       <Trophy size={20} className="text-purple" />,
} as Record<string, React.ReactNode>;
import { useApp } from '@/lib/store';
import { DAYS } from '@/lib/constants';
import { getTargets, getWeekNum, getDayDateInWeek, dk, isWoDone, getPhaseInfo, getProgramWeeks, getWorkoutMap, todayIsGymDay } from '@/lib/utils';
import { computeWeeklySummary } from '@/lib/utils';
import StreakCard from '../streaks/StreakCard';
import FridayCheckIn from '../checkin/FridayCheckIn';
import CoachNotes from '../notes/CoachNotes';
import RecoveryPanel from '../recovery/RecoveryPanel';
import CoachCard from '../coach/CoachCard';
import type { CoachTrigger, CoachContext } from '@/lib/aiCoach';

export default function TodayTab() {
  const { settings, getDayData, saveDayData, dayCache, weightCache, setCurrentTab } = useApp();

  const today     = new Date();
  const todayName = DAYS[today.getDay()];
  const isGymDay  = settings ? settings.gymDays.includes(todayName) : false;
  const isFriday  = todayName === 'friday';
  const isSunday  = todayName === 'sunday';
  const data      = getDayData(today);
  const targets   = getTargets(settings, isGymDay);
  const weekNum     = getWeekNum(settings);
  const totalWeeks  = getProgramWeeks(settings);
  const phase       = getPhaseInfo(weekNum, totalWeeks);

  const meals   = data.meals ?? [];
  const totCal  = meals.reduce((s, m) => s + m.calories, 0);
  const workoutMap = getWorkoutMap(settings);
  const wo         = workoutMap[todayName];
  const water   = data.check?.water ?? 0;

  // ─── Coach trigger evaluation ──────────────────────────────────────────────
  const hour = today.getHours();

  // missed_workout: gym day + no sets logged + past 9pm
  const hasAnySets = wo
    ? wo.exercises.some(ex => (data.wo?.[ex.id]?.sets ?? []).some(s => s?.done))
    : false;
  const isMissedWorkout = isGymDay && !hasAnySets && hour >= 21;

  // end_of_week: Sunday + at least 1 workout done this week
  const recentKeys = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - i); return dk(d);
  });
  const sessionsThisWeek = recentKeys.filter(k => {
    const dayData = dayCache[k];
    if (!dayData?.wo) return false;
    const wm = getWorkoutMap(settings);
    const dayName = DAYS[new Date(k).getDay()];
    return wm[dayName]?.exercises.some(ex =>
      (dayData.wo?.[ex.id]?.sets ?? []).some(s => s?.done)
    );
  }).length;
  const isEndOfWeek = isSunday && sessionsThisWeek >= 1;

  // phase_transition: only on the first day of the week that crosses a phase boundary
  // Without the day-of-week check, the card would appear all 7 days of the transition week.
  const prevWeekNum = Math.max(1, weekNum - 1);
  const prevPct = (prevWeekNum - 1) / totalWeeks;
  const curPct  = (weekNum - 1) / totalWeeks;
  const programStartDayOfWeek = settings ? new Date(settings.startDate).getDay() : -1;
  const isPhaseTransition =
    weekNum > 1 &&
    Math.floor(prevPct / 0.25) < Math.floor(curPct / 0.25) &&
    today.getDay() === programStartDayOfWeek;

  // calorie_streak_broken: 3+ consecutive days with meals logged, 0 today, past 7pm
  const hasLogged3Days = recentKeys.slice(1, 4).every(k => (dayCache[k]?.meals?.length ?? 0) > 0);
  const isCalorieStreakBroken = hasLogged3Days && meals.length === 0 && hour >= 19;

  const coachTrigger: CoachTrigger | null =
    isMissedWorkout      ? 'missed_workout'        :
    isEndOfWeek          ? 'end_of_week'            :
    isPhaseTransition    ? 'phase_transition'       :
    isCalorieStreakBroken ? 'calorie_streak_broken'  :
    null;

  // Context object passed to the coach API
  const gymDayCalTarget = getTargets(settings, true).calories;
  const avgCalsThisWeek = recentKeys.slice(0, 7).reduce((sum, k) => {
    const m = dayCache[k]?.meals ?? [];
    return sum + m.reduce((s, e) => s + e.calories, 0);
  }, 0) / 7;
  const completionRate = totalWeeks > 0
    ? Math.round((sessionsThisWeek / Math.max(1, settings?.gymDays.length ?? 3)) * 100)
    : 0;

  const coachContext: CoachContext = {
    name:           settings?.name ?? 'there',
    weekNum,
    totalWeeks,
    phase:          phase.phase,
    completionRate: Math.min(100, completionRate),
    avgCals:        Math.round(avgCalsThisWeek),
    targetCals:     gymDayCalTarget,
    isGymDay,
    trigger:        coachTrigger ?? 'user_initiated',
  };
  // ──────────────────────────────────────────────────────────────────────────

  async function setWater(n: number) {
    const cur = data.check?.water ?? 0;
    const next = cur === n ? n - 1 : n;
    await saveDayData(today, { ...data, check: { ...data.check, water: next } });
  }

  async function toggle(key: keyof typeof data.check) {
    await saveDayData(today, { ...data, check: { ...data.check, [key]: !data.check?.[key] } });
  }

  async function saveNotes(val: string) {
    await saveDayData(today, { ...data, notes: val });
  }

  return (
    <div>
      {/* Sunday weekly summary */}
      {isSunday && (() => {
        const ws = computeWeeklySummary(settings, dayCache, weightCache);
        return (
          <div className="bg-gradient-to-br from-accent/5 to-info/5 border border-accent/16 rounded-card p-4 mb-3">
            <div className="font-condensed text-sm font-black uppercase tracking-widest text-accent mb-3">Week {weekNum}/{totalWeeks} Summary</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { val: `${ws.sessionsDone}/${ws.sessionsScheduled}`, label: 'Sessions', color: ws.sessionsDone === ws.sessionsScheduled ? 'text-accent' : 'text-warn' },
                { val: ws.weightDelta !== null ? `${ws.weightDelta > 0 ? '+' : '−'}${Math.abs(ws.weightDelta)} kg` : '—', label: 'Weight Δ', color: ws.weightDelta !== null && ws.weightDelta <= 0 ? 'text-accent' : 'text-danger' },
                { val: ws.avgCals !== null ? `${ws.avgCals} kcal` : '—', label: 'Avg Calories', color: ws.avgCals && ws.avgCals <= ws.calTarget ? 'text-accent' : 'text-danger' },
                { val: ws.avgWater !== null ? `${ws.avgWater} gl` : '—', label: 'Avg Water', color: 'text-info' },
              ].map(({ val, label, color }) => (
                <div key={label} className="bg-bg2 rounded-[10px] p-2.5">
                  <div className={`font-condensed text-lg font-black ${color}`}>{val}</div>
                  <div className="text-[10px] text-text3 uppercase tracking-wider font-bold mt-0.5">{label}</div>
                </div>
              ))}
            </div>
            {ws.bestLift && (
              <div className="mt-2.5 text-xs text-text3">
                Best lift: <strong className="text-warn">{ws.bestLift.weight} kg × {ws.bestLift.reps}</strong> — {ws.bestLift.name}
              </div>
            )}
          </div>
        );
      })()}

      {/* Phase card */}
      {phase && (
        <div className="flex items-center gap-3 bg-gradient-to-br from-purple/5 to-info/5 border border-purple/18 rounded-card p-3.5 mb-3">
          <div className="w-10 h-10 bg-purple/10 rounded-[10px] flex items-center justify-center flex-shrink-0">{PHASE_ICONS[phase.icon]}</div>
          <div>
            <div className="text-[10px] text-purple font-black uppercase tracking-wider mb-0.5">Week {weekNum}/{totalWeeks} · {phase.weeks}</div>
            <div className="font-condensed text-base font-black">{phase.phase}</div>
            <div className="text-[12px] text-text3 leading-snug">{phase.desc}</div>
          </div>
        </div>
      )}

      {/* AI Coach */}
      {coachTrigger && <CoachCard trigger={coachTrigger} context={coachContext} />}

      {/* Targets */}
      <div className="bg-surface border border-hairline rounded-card p-4 mb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="font-sans text-[13px] font-black uppercase tracking-widest text-ink">Today's Targets</div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-2 bg-surface border border-hairline-2 rounded-full px-2 py-0.5">{isGymDay ? 'Gym Day' : 'Rest Day'}</div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { val: targets.calories, label: 'kcal'    },
            { val: `${targets.protein}g`, label: 'Protein' },
            { val: `${targets.carbs}g`,   label: 'Carbs'   },
            { val: `${targets.fat}g`,     label: 'Fat'     },
          ].map(({ val, label }) => (
            <div key={label} className="bg-surface-2 border border-hairline rounded-sm p-3 text-center">
              <div className="font-mono tabular-nums text-xl font-semibold text-ink">{val}</div>
              <div className="font-mono text-[10px] text-ink-3 uppercase tracking-wider font-bold mt-0.5">{label}</div>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-ink-3 mt-3">
          <span>Logged: <strong className="font-mono tabular-nums text-ink">{totCal} kcal</strong></span>
          <span>Left: <strong className={`font-mono tabular-nums ${totCal > targets.calories ? 'text-mustard' : 'text-sage'}`}>{targets.calories - totCal} kcal</strong></span>
        </div>
      </div>

      {/* Workout progress */}
      {wo && (() => {
        const totSets  = wo.exercises.reduce((s, e) => s + e.sets, 0);
        const doneSets = Object.values(data.wo ?? {}).reduce((s, e) => s + (e?.sets?.filter(x => x?.done)?.length ?? 0), 0);
        const p = totSets > 0 ? Math.round(doneSets / totSets * 100) : 0;
        return (
          <div className="bg-surface border border-hairline rounded-card p-4 mb-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-sans text-[13px] font-black uppercase tracking-widest text-ink">{wo.name}</div>
                <div className="text-xs text-ink-3 mt-0.5"><span className="font-mono tabular-nums">{doneSets}</span> / <span className="font-mono tabular-nums">{totSets}</span> sets logged</div>
              </div>
              <div className={`font-mono tabular-nums text-3xl font-semibold ${p === 100 ? 'text-sage' : p > 0 ? 'text-clay' : 'text-ink-3'}`}>{p}%</div>
            </div>
            <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden">
              <div className={`h-full ${p === 100 ? 'bg-sage' : 'bg-clay'} rounded-full transition-all duration-300`} style={{ width: `${p}%` }} />
            </div>
            <button onClick={() => setCurrentTab('workouts')} className="mt-3 w-full py-3 bg-clay hover:bg-clay-hover text-surface font-sans font-bold rounded-sm text-sm cursor-pointer active:scale-[0.97] transition-transform">
              Open Workout Log →
            </button>
          </div>
        );
      })()}

      {/* Daily checklist */}
      <div className="bg-surface border border-hairline rounded-card p-4 mb-3">
        <div className="font-sans text-[13px] font-black uppercase tracking-widest text-ink mb-3">Daily Checklist</div>
        {/* Water */}
        <div className="flex items-center justify-between py-2.5 border-b border-hairline">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-surface-2 border border-hairline rounded-sm flex items-center justify-center text-ink-2">
              <Droplets size={18} />
            </div>
            <div>
              <div className="text-sm text-ink">Water</div>
              <div className="text-[11px] text-ink-3">
                <span className="font-mono tabular-nums">{water}</span>/
                <span className="font-mono tabular-nums">7</span> glasses (<span className="font-mono tabular-nums">3.5</span> L)
              </div>
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap justify-end max-w-[200px]">
            {[1,2,3,4,5,6,7].map(i => (
              <button key={i} onClick={() => setWater(i)}
                className={`min-w-[36px] min-h-[36px] rounded-sm border flex items-center justify-center transition-colors duration-150 cursor-pointer active:scale-90 ${
                  water >= i ? 'bg-clay-wash border-clay-dim text-clay' : 'bg-surface-2 border-hairline text-ink-3'
                }`}>
                <Droplets size={14} />
              </button>
            ))}
          </div>
        </div>
        {/* Sleep */}
        <div className="flex items-center justify-between py-2.5 border-b border-hairline">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-surface-2 border border-hairline rounded-sm flex items-center justify-center text-ink-2">
              <Moon size={18} />
            </div>
            <span className="text-sm text-ink">Sleep 7+ hours</span>
          </div>
          <button onClick={() => toggle('sleep')} className={`w-12 h-7 rounded-full border relative transition-colors duration-150 cursor-pointer ${data.check?.sleep ? 'bg-clay border-clay' : 'bg-surface-2 border-hairline'}`}>
            <span className={`absolute w-5 h-5 rounded-full top-0.5 transition-transform duration-150 ${data.check?.sleep ? 'translate-x-5 bg-paper' : 'translate-x-0.5 bg-ink-3'}`} />
          </button>
        </div>
        {/* No sugar */}
        <div className="flex items-center justify-between py-2.5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-surface-2 border border-hairline rounded-sm flex items-center justify-center text-ink-2">
              <XCircle size={18} />
            </div>
            <span className="text-sm text-ink">No added sugar</span>
          </div>
          <button onClick={() => toggle('noSugar')} className={`w-12 h-7 rounded-full border relative transition-colors duration-150 cursor-pointer ${data.check?.noSugar ? 'bg-clay border-clay' : 'bg-surface-2 border-hairline'}`}>
            <span className={`absolute w-5 h-5 rounded-full top-0.5 transition-transform duration-150 ${data.check?.noSugar ? 'translate-x-5 bg-paper' : 'translate-x-0.5 bg-ink-3'}`} />
          </button>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-bg1 border border-border rounded-card p-4 mb-3">
        <div className="text-[13px] font-black uppercase tracking-widest text-text2 mb-3">Session Notes</div>
        <textarea
          defaultValue={data.notes}
          onChange={e => saveNotes(e.target.value)}
          placeholder="Form observations, how you felt, PRs…"
          className="w-full bg-bg2 border border-border rounded-[10px] text-sm text-text1 p-3 resize-none outline-none focus:border-accent min-h-[80px] leading-relaxed"
        />
      </div>

      <RecoveryPanel />

      {/* Friday check-in (v1.3) */}
      {isFriday && <FridayCheckIn />}

      <CoachNotes />

      <StreakCard />
    </div>
  );
}
