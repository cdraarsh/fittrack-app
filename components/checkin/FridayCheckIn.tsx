'use client';

import { useState } from 'react';
import { useApp } from '@/lib/store';
import { toast } from '../shared/Toast';
import type { CheckInV2 } from '@/lib/types';

export default function FridayCheckIn() {
  const { getDayData, saveDayData } = useApp();
  const today = new Date();
  const data  = getDayData(today);
  const saved = data.checkin_v2;

  const [sessions,       setSessions]       = useState<number>(saved?.sessions ?? -1);
  const [energy,         setEnergy]         = useState<number>(saved?.energy ?? 0);
  const [dietAdherence,  setDietAdherence]  = useState<CheckInV2['dietAdherence'] | ''>(saved?.dietAdherence ?? '');
  const [hardestMoment,  setHardestMoment]  = useState(saved?.hardestMoment ?? '');
  const [nextWeekGoal,   setNextWeekGoal]   = useState(saved?.nextWeekGoal ?? '');
  const [saved2, setSaved2] = useState(!!saved);

  async function submit() {
    if (sessions < 0 || energy === 0 || !dietAdherence) {
      toast('Fill in the first three questions'); return;
    }
    const checkin_v2: CheckInV2 = { sessions, energy, dietAdherence, hardestMoment, nextWeekGoal };
    await saveDayData(today, { ...data, checkin_v2 });
    setSaved2(true);
    toast('Week check-in saved 🎉');
  }

  const dietOptions: { val: CheckInV2['dietAdherence']; label: string; color: string }[] = [
    { val: 'on-track', label: 'On Track',  color: 'text-sage border-sage/35 bg-sage/10' },
    { val: 'mostly',   label: 'Mostly',    color: 'text-mustard border-mustard/35 bg-mustard/10' },
    { val: 'off-track',label: 'Off Track', color: 'text-clay border-clay-dim bg-clay-wash' },
  ];

  return (
    <div className="bg-surface border border-hairline rounded-card p-4 mb-3">
      <div className="font-sans text-base font-black text-clay mb-1">Week Check-in</div>
      <div className="text-xs text-ink-2 mb-4">Quick weekly review — takes 30 seconds.</div>

      {/* Q1: Sessions */}
      <div className="mb-4">
        <div className="text-xs font-bold text-ink-2 mb-2">Sessions completed this week</div>
        <div className="flex gap-2">
          {[0,1,2,3,4].map(n => (
            <button key={n} onClick={() => setSessions(n)}
              className={`flex-1 py-2.5 rounded-sm font-mono tabular-nums text-lg font-semibold border transition-all ${
                sessions === n ? 'bg-clay-wash border-clay-dim text-clay' : 'bg-surface-2 border-hairline text-ink-3'
              }`}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Q2: Energy */}
      <div className="mb-4">
        <div className="text-xs font-bold text-ink-2 mb-2">Energy levels this week</div>
        <div className="flex gap-1">
          {[1,2,3,4,5].map(n => (
            <button key={n} onClick={() => setEnergy(n)}
              className={`flex-1 py-2.5 text-xl rounded-sm border transition-all ${
                energy >= n ? 'bg-mustard/10 border-mustard/35' : 'bg-surface-2 border-hairline'
              }`}>
              ⭐
            </button>
          ))}
        </div>
      </div>

      {/* Q3: Diet */}
      <div className="mb-4">
        <div className="text-xs font-bold text-ink-2 mb-2">Diet adherence</div>
        <div className="flex gap-2">
          {dietOptions.map(opt => (
            <button key={opt.val} onClick={() => setDietAdherence(opt.val)}
              className={`flex-1 py-2.5 rounded-sm text-xs font-black border transition-all ${
                dietAdherence === opt.val ? opt.color : 'bg-surface-2 border-hairline text-ink-3'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Q4 + Q5: Free text */}
      <div className="mb-3">
        <div className="text-xs font-bold text-ink-2 mb-1.5">Hardest moment this week <span className="text-ink-3 font-normal">(optional)</span></div>
        <input
          type="text" value={hardestMoment} onChange={e => setHardestMoment(e.target.value)}
          placeholder="e.g. Deadlift form broke down on set 3"
          className="w-full bg-surface-2 border border-hairline rounded-sm text-sm px-3 py-2.5 outline-none focus:border-clay text-ink"
        />
      </div>
      <div className="mb-4">
        <div className="text-xs font-bold text-ink-2 mb-1.5">One thing to improve next week <span className="text-ink-3 font-normal">(optional)</span></div>
        <input
          type="text" value={nextWeekGoal} onChange={e => setNextWeekGoal(e.target.value)}
          placeholder="e.g. Hit all 4 sessions, no skips"
          className="w-full bg-surface-2 border border-hairline rounded-sm text-sm px-3 py-2.5 outline-none focus:border-clay text-ink"
        />
      </div>

      <button onClick={submit}
        className="w-full py-3 bg-clay hover:bg-clay-hover text-surface font-bold rounded-sm text-sm">
        {saved2 ? 'Update Check-in ✓' : 'Save Check-in →'}
      </button>
    </div>
  );
}
