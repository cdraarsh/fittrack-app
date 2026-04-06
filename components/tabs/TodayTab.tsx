'use client';

import { useState } from 'react';
import { Droplets, Moon, XCircle } from 'lucide-react';
import { useApp } from '@/lib/store';
import { DAYS, WORKOUTS } from '@/lib/constants';
import { getTargets, getWeekNum, getDayDateInWeek, dk, isWoDone, getPhaseInfo, getProgramWeeks } from '@/lib/utils';
import { computeWeeklySummary } from '@/lib/utils';
import StreakCard from '../streaks/StreakCard';
import FridayCheckIn from '../checkin/FridayCheckIn';
import CoachNotes from '../notes/CoachNotes';

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
  const wo      = WORKOUTS[todayName];
  const water   = data.check?.water ?? 0;

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
          <div className="w-10 h-10 bg-purple/10 rounded-[10px] flex items-center justify-center text-xl flex-shrink-0">{phase.icon}</div>
          <div>
            <div className="text-[10px] text-purple font-black uppercase tracking-wider mb-0.5">Week {weekNum}/{totalWeeks} · {phase.weeks}</div>
            <div className="font-condensed text-base font-black">{phase.phase}</div>
            <div className="text-[12px] text-text3 leading-snug">{phase.desc}</div>
          </div>
        </div>
      )}

      {/* Targets */}
      <div className="bg-bg1 border border-border rounded-card p-4 mb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] font-black uppercase tracking-widest text-text2">Today's Targets</div>
          <div className="text-[11px] text-text3">{isGymDay ? 'Gym Day' : 'Rest Day'}</div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { val: targets.calories, label: 'kcal',    color: 'text-warn' },
            { val: `${targets.protein}g`, label: 'Protein', color: 'text-info' },
            { val: `${targets.carbs}g`,   label: 'Carbs',   color: 'text-purple' },
            { val: `${targets.fat}g`,     label: 'Fat',     color: 'text-danger' },
          ].map(({ val, label, color }) => (
            <div key={label} className="bg-bg2 border border-border rounded-[10px] p-3 text-center">
              <div className={`font-condensed text-xl font-black ${color}`}>{val}</div>
              <div className="text-[10px] text-text3 uppercase tracking-wider font-bold mt-0.5">{label}</div>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-text3 mt-3">
          <span>Logged: <strong className="text-text1">{totCal} kcal</strong></span>
          <span>Left: <strong className={totCal > targets.calories ? 'text-danger' : 'text-accent'}>{targets.calories - totCal} kcal</strong></span>
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
                <div className="text-[13px] font-black uppercase tracking-widest text-text2">{wo.name}</div>
                <div className="text-xs text-text3 mt-0.5">{doneSets} / {totSets} sets logged</div>
              </div>
              <div className={`font-condensed text-3xl font-black ${p === 100 ? 'text-accent' : 'text-text2'}`}>{p}%</div>
            </div>
            <div className="h-1.5 bg-bg3 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-accent to-green-400 rounded-full transition-all" style={{ width: `${p}%` }} />
            </div>
            <button onClick={() => setCurrentTab('workouts')} className="mt-3 w-full py-3 bg-gradient-to-r from-accent to-green-400 text-black font-bold rounded-[10px] text-sm">
              Open Workout Log →
            </button>
          </div>
        );
      })()}

      {/* Daily checklist */}
      <div className="bg-bg1 border border-border rounded-card p-4 mb-3">
        <div className="text-[13px] font-black uppercase tracking-widest text-text2 mb-3">Daily Checklist</div>
        {/* Water */}
        <div className="flex items-center justify-between py-2.5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-info/10 border border-info/20 rounded-[10px] flex items-center justify-center text-info">
              <Droplets size={18} />
            </div>
            <div>
              <div className="text-sm">Water</div>
              <div className="text-[11px] text-text3">{water}/7 glasses (3.5 L)</div>
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap justify-end max-w-[200px]">
            {[1,2,3,4,5,6,7].map(i => (
              <button key={i} onClick={() => setWater(i)}
                className={`min-w-[36px] min-h-[36px] rounded-lg border flex items-center justify-center transition-colors duration-150 cursor-pointer ${
                  water >= i ? 'bg-info/15 border-info/40 text-info' : 'bg-bg3 border-border text-text3/40'
                }`}>
                <Droplets size={14} />
              </button>
            ))}
          </div>
        </div>
        {/* Sleep */}
        <div className="flex items-center justify-between py-2.5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-purple/10 border border-purple/20 rounded-[10px] flex items-center justify-center text-purple">
              <Moon size={18} />
            </div>
            <span className="text-sm">Sleep 7+ hours</span>
          </div>
          <button onClick={() => toggle('sleep')} className={`w-12 h-7 rounded-full border relative transition-colors duration-150 cursor-pointer ${data.check?.sleep ? 'bg-accent/18 border-accent' : 'bg-bg3 border-border'}`}>
            <span className={`absolute w-5 h-5 rounded-full top-0.5 transition-transform duration-150 ${data.check?.sleep ? 'translate-x-5 bg-accent' : 'translate-x-0.5 bg-text3'}`} />
          </button>
        </div>
        {/* No sugar */}
        <div className="flex items-center justify-between py-2.5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-danger/10 border border-danger/20 rounded-[10px] flex items-center justify-center text-danger">
              <XCircle size={18} />
            </div>
            <span className="text-sm">No added sugar</span>
          </div>
          <button onClick={() => toggle('noSugar')} className={`w-12 h-7 rounded-full border relative transition-colors duration-150 cursor-pointer ${data.check?.noSugar ? 'bg-accent/18 border-accent' : 'bg-bg3 border-border'}`}>
            <span className={`absolute w-5 h-5 rounded-full top-0.5 transition-transform duration-150 ${data.check?.noSugar ? 'translate-x-5 bg-accent' : 'translate-x-0.5 bg-text3'}`} />
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

      {/* Friday check-in (v1.3) */}
      {isFriday && <FridayCheckIn />}

      <CoachNotes />

      <StreakCard />
    </div>
  );
}
