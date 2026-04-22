'use client';

import React, { useState } from 'react';
import { Droplets, Moon, XCircle, Layers, TrendingUp, Flame, Trophy } from 'lucide-react';
import { useApp } from '@/lib/store';
import { DAYS } from '@/lib/constants';
import { getTargets, getWeekNum, dk, getPhaseInfo, getProgramWeeks, getWorkoutMap, todayIsGymDay, computeWeeklySummary } from '@/lib/utils';
import StreakCard from '../streaks/StreakCard';
import FridayCheckIn from '../checkin/FridayCheckIn';
import CoachNotes from '../notes/CoachNotes';
import RecoveryPanel from '../recovery/RecoveryPanel';
import CoachCard from '../coach/CoachCard';
import type { CoachTrigger, CoachContext } from '@/lib/aiCoach';

const PHASE_ICONS: Record<string, React.ReactNode> = {
  foundation: <Layers size={20} />,
  build:      <TrendingUp size={20} />,
  strength:   <Flame size={20} />,
  peak:       <Trophy size={20} />,
};

function Ring({ size, stroke, pct, color, children }: {
  size: number; stroke: number; pct: number; color: string; children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.06)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(pct, 1))} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', lineHeight: 1.1 }}>
        {children}
      </div>
    </div>
  );
}

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

  const meals    = data.meals ?? [];
  const totCal   = meals.reduce((s, m) => s + m.calories, 0);
  const totProt  = Math.round(meals.reduce((s, m) => s + (m.protein ?? 0), 0));
  const totCarbs = Math.round(meals.reduce((s, m) => s + (m.carbs ?? 0), 0));
  const totFat   = Math.round(meals.reduce((s, m) => s + (m.fat ?? 0), 0));

  const workoutMap = getWorkoutMap(settings);
  const wo         = workoutMap[todayName];

  // ─── Coach trigger evaluation ──────────────────────────────────────────────
  const hour = today.getHours();
  const hasAnySets = wo
    ? wo.exercises.some(ex => (data.wo?.[ex.id]?.sets ?? []).some(s => s?.done))
    : false;
  const isMissedWorkout = isGymDay && !hasAnySets && hour >= 21;

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

  const prevWeekNum = Math.max(1, weekNum - 1);
  const prevPct = (prevWeekNum - 1) / totalWeeks;
  const curPct  = (weekNum - 1) / totalWeeks;
  const programStartDayOfWeek = settings ? new Date(settings.startDate).getDay() : -1;
  const isPhaseTransition =
    weekNum > 1 &&
    Math.floor(prevPct / 0.25) < Math.floor(curPct / 0.25) &&
    today.getDay() === programStartDayOfWeek;

  const hasLogged3Days = recentKeys.slice(1, 4).every(k => (dayCache[k]?.meals?.length ?? 0) > 0);
  const isCalorieStreakBroken = hasLogged3Days && meals.length === 0 && hour >= 19;

  const coachTrigger: CoachTrigger | null =
    isMissedWorkout       ? 'missed_workout'        :
    isEndOfWeek           ? 'end_of_week'            :
    isPhaseTransition     ? 'phase_transition'       :
    isCalorieStreakBroken ? 'calorie_streak_broken'  :
    null;

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

  const water = data.check?.water ?? 0;

  return (
    <div>
      {/* Sunday weekly summary */}
      {isSunday && (() => {
        const ws = computeWeeklySummary(settings, dayCache, weightCache);
        return (
          <div className="bg-bg1 border border-border rounded-card p-4 mb-3">
            <div className="font-sans text-[10px] font-black uppercase tracking-widest text-text3 mb-3">
              Week <span className="font-mono tabular-nums">{weekNum}</span>/<span className="font-mono tabular-nums">{totalWeeks}</span> Summary
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { val: `${ws.sessionsDone}/${ws.sessionsScheduled}`, label: 'Sessions' },
                { val: ws.weightDelta !== null ? `${ws.weightDelta > 0 ? '+' : '−'}${Math.abs(ws.weightDelta)} kg` : '—', label: 'Weight Δ' },
                { val: ws.avgCals !== null ? `${ws.avgCals} kcal` : '—', label: 'Avg Calories' },
                { val: ws.avgWater !== null ? `${ws.avgWater} gl` : '—', label: 'Avg Water' },
              ].map(({ val, label }) => (
                <div key={label} className="bg-bg2 border border-border rounded-sm p-2.5">
                  <div className="font-condensed text-lg font-bold text-text1 tabular-nums">{val}</div>
                  <div className="font-sans text-[10px] text-text3 uppercase tracking-wider font-bold mt-0.5">{label}</div>
                </div>
              ))}
            </div>
            {ws.bestLift && (
              <div className="mt-2.5 text-xs text-text3">
                Best lift: <strong className="font-mono tabular-nums text-accent">{ws.bestLift.weight} kg × {ws.bestLift.reps}</strong> — {ws.bestLift.name}
              </div>
            )}
          </div>
        );
      })()}

      {/* Phase card */}
      {phase && (
        <div className="flex items-center gap-3 rounded-card p-3.5 mb-3" style={{ background: 'linear-gradient(135deg,rgba(167,139,250,.05),rgba(96,165,250,.05))', border: '1px solid rgba(167,139,250,.18)' }}>
          <div className="w-10 h-10 rounded-sm flex items-center justify-center flex-shrink-0 text-purple" style={{ background: 'rgba(167,139,250,.1)', border: '1px solid rgba(167,139,250,.2)' }}>
            {PHASE_ICONS[phase.icon]}
          </div>
          <div>
            <div className="font-sans text-[10px] text-purple font-black uppercase tracking-wider mb-0.5">
              Week <span className="tabular-nums">{weekNum}</span>/<span className="tabular-nums">{totalWeeks}</span> · {phase.weeks}
            </div>
            <div className="font-condensed text-base font-black text-text1">{phase.phase}</div>
            <div className="text-[12px] text-text3 leading-snug">{phase.desc}</div>
          </div>
        </div>
      )}

      {/* AI Coach */}
      {coachTrigger && <CoachCard trigger={coachTrigger} context={coachContext} />}

      {/* Today's Targets — hero ring layout */}
      <div className="bg-bg1 border border-border rounded-card p-4 mb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="font-sans text-[10px] font-black uppercase tracking-widest text-text3">Today's Targets</div>
          <span className="font-sans text-[11px] font-bold px-2 py-0.5 rounded-full text-text3 border border-border">{isGymDay ? 'Gym Day' : 'Rest Day'}</span>
        </div>
        <div className="flex gap-5 items-center">
          {/* Hero kcal ring */}
          <Ring size={116} stroke={9} pct={totCal / Math.max(1, targets.calories)} color="#f97316">
            <span className="font-condensed font-black text-[26px] text-text1 tabular-nums" style={{ lineHeight: 1 }}>{totCal.toLocaleString()}</span>
            <span className="font-sans text-[9px] text-energy font-bold uppercase tracking-widest mt-0.5">kcal</span>
            <span className="font-sans text-[10px] text-text3 mt-0.5">of {targets.calories.toLocaleString()}</span>
          </Ring>
          {/* Macro mini-rings */}
          <div className="flex-1 flex flex-col gap-3">
            {[
              { label: 'Protein', logged: totProt,  target: targets.protein, color: '#60a5fa', unit: 'g' },
              { label: 'Carbs',   logged: totCarbs, target: targets.carbs,   color: '#a78bfa', unit: 'g' },
              { label: 'Fat',     logged: totFat,   target: targets.fat,     color: '#ef4444', unit: 'g' },
            ].map(m => (
              <div key={m.label} className="flex items-center gap-3">
                <Ring size={38} stroke={4} pct={m.logged / Math.max(1, m.target)} color={m.color}>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-barlow-condensed)', fontWeight: 700, color: m.color }}>
                    {Math.round(m.logged / Math.max(1, m.target) * 100)}
                  </span>
                </Ring>
                <div className="flex-1">
                  <div className="text-[12px] text-text2">{m.label}</div>
                  <div className="text-[11px] text-text3 tabular-nums">
                    <span className="text-text1">{m.logged}{m.unit}</span> / {m.target}{m.unit}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Workout progress */}
      {wo && (() => {
        const totSets  = wo.exercises.reduce((s, e) => s + e.sets, 0);
        const doneSets = Object.values(data.wo ?? {}).reduce((s, e) => s + (e?.sets?.filter(x => x?.done)?.length ?? 0), 0);
        const p = totSets > 0 ? Math.round(doneSets / totSets * 100) : 0;
        return (
          <div className="bg-bg1 border border-border rounded-card p-4 mb-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-sans text-[10px] font-black uppercase tracking-widest text-text3">{wo.name}</div>
                <div className="text-xs text-text3 mt-0.5">
                  <span className="tabular-nums">{doneSets}</span> / <span className="tabular-nums">{totSets}</span> sets logged
                </div>
              </div>
              <div className={`font-condensed tabular-nums text-[30px] font-black leading-none ${p === 100 ? 'text-accent' : p > 0 ? 'text-energy' : 'text-text3'}`}>{p}%</div>
            </div>
            <div className="h-2.5 bg-bg3 rounded-full overflow-hidden mb-3">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${p}%`, background: 'linear-gradient(90deg,#f97316,#22c55e)' }} />
            </div>
            <button
              onClick={() => setCurrentTab('workouts')}
              className="w-full py-3 text-black font-bold rounded-sm text-sm cursor-pointer active:scale-[0.97] transition-transform"
              style={{ background: 'linear-gradient(90deg,#f97316,#22c55e)' }}
            >
              Open Workout Log →
            </button>
          </div>
        );
      })()}

      {/* Daily Checklist */}
      <div className="bg-bg1 border border-border rounded-card p-4 mb-3">
        <div className="font-sans text-[10px] font-black uppercase tracking-widest text-text3 mb-3">Daily Checklist</div>

        {/* Water */}
        <div className="flex items-center justify-between py-2.5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-sm flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(96,165,250,.1)', border: '1px solid rgba(96,165,250,.2)' }}>
              <Droplets size={18} className="text-info" />
            </div>
            <div>
              <div className="text-sm text-text1">Water</div>
              <div className="text-[11px] text-text3">
                <span className="tabular-nums">{water}</span>/<span className="tabular-nums">7</span> glasses (<span className="tabular-nums">3.5</span> L)
              </div>
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap justify-end max-w-[200px]">
            {[1,2,3,4,5,6,7].map(i => (
              <button key={i} onClick={() => setWater(i)}
                className="min-w-[32px] min-h-[32px] rounded-sm flex items-center justify-center cursor-pointer active:scale-90 transition-colors duration-150"
                style={{
                  border: `1px solid ${water >= i ? 'rgba(96,165,250,.4)' : '#232b38'}`,
                  background: water >= i ? 'rgba(96,165,250,.15)' : '#1e2532',
                }}>
                <Droplets size={12} style={{ color: water >= i ? '#60a5fa' : 'rgba(100,116,139,.4)' }} />
              </button>
            ))}
          </div>
        </div>

        {/* Sleep */}
        <div className="flex items-center justify-between py-2.5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-sm flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(167,139,250,.1)', border: '1px solid rgba(167,139,250,.2)' }}>
              <Moon size={18} className="text-purple" />
            </div>
            <span className="text-sm text-text1">Sleep 7+ hours</span>
          </div>
          <button onClick={() => toggle('sleep')} className="w-12 h-7 rounded-full relative cursor-pointer transition-colors duration-150"
            style={{ border: `1px solid ${data.check?.sleep ? '#22c55e' : '#232b38'}`, background: data.check?.sleep ? 'rgba(34,197,94,.18)' : '#1e2532' }}>
            <span className="absolute w-5 h-5 rounded-full top-0.5 transition-all duration-150"
              style={{ left: data.check?.sleep ? 22 : 2, background: data.check?.sleep ? '#22c55e' : '#64748b' }} />
          </button>
        </div>

        {/* No sugar */}
        <div className="flex items-center justify-between py-2.5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-sm flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)' }}>
              <XCircle size={18} className="text-danger" />
            </div>
            <span className="text-sm text-text1">No added sugar</span>
          </div>
          <button onClick={() => toggle('noSugar')} className="w-12 h-7 rounded-full relative cursor-pointer transition-colors duration-150"
            style={{ border: `1px solid ${data.check?.noSugar ? '#22c55e' : '#232b38'}`, background: data.check?.noSugar ? 'rgba(34,197,94,.18)' : '#1e2532' }}>
            <span className="absolute w-5 h-5 rounded-full top-0.5 transition-all duration-150"
              style={{ left: data.check?.noSugar ? 22 : 2, background: data.check?.noSugar ? '#22c55e' : '#64748b' }} />
          </button>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-bg1 border border-border rounded-card p-4 mb-3">
        <div className="font-sans text-[10px] font-black uppercase tracking-widest text-text3 mb-3">Session Notes</div>
        <textarea
          defaultValue={data.notes}
          onChange={e => saveNotes(e.target.value)}
          placeholder="Form observations, how you felt, PRs…"
          className="w-full bg-bg2 border border-border rounded-sm text-sm text-text1 p-3 resize-none outline-none focus:border-accent min-h-[80px] leading-relaxed placeholder:text-text3"
        />
      </div>

      <RecoveryPanel />

      {isFriday && <FridayCheckIn />}

      <CoachNotes />

      <StreakCard />
    </div>
  );
}
