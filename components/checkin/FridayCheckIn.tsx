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
    { val: 'on-track', label: 'On Track',  color: 'text-accent border-accent/35 bg-accent/10' },
    { val: 'mostly',   label: 'Mostly',    color: 'text-warn  border-warn/35  bg-warn/10'  },
    { val: 'off-track',label: 'Off Track', color: 'text-danger border-danger/35 bg-danger/10' },
  ];

  return (
    <div className="bg-gradient-to-br from-accent/5 to-info/5 border border-accent/18 rounded-card p-4 mb-3">
      <div className="font-condensed text-base font-black text-accent mb-1">Week Check-in</div>
      <div className="text-xs text-text2 mb-4">Quick weekly review — takes 30 seconds.</div>

      {/* Q1: Sessions */}
      <div className="mb-4">
        <div className="text-xs font-bold text-text2 mb-2">Sessions completed this week</div>
        <div className="flex gap-2">
          {[0,1,2,3,4].map(n => (
            <button key={n} onClick={() => setSessions(n)}
              className={`flex-1 py-2.5 rounded-xl font-condensed text-lg font-black border transition-all ${
                sessions === n ? 'bg-accent/12 border-accent/40 text-accent' : 'bg-bg2 border-border text-text3'
              }`}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Q2: Energy */}
      <div className="mb-4">
        <div className="text-xs font-bold text-text2 mb-2">Energy levels this week</div>
        <div className="flex gap-1">
          {[1,2,3,4,5].map(n => (
            <button key={n} onClick={() => setEnergy(n)}
              className={`flex-1 py-2.5 text-xl rounded-xl border transition-all ${
                energy >= n ? 'bg-warn/10 border-warn/35' : 'bg-bg2 border-border'
              }`}>
              ⭐
            </button>
          ))}
        </div>
      </div>

      {/* Q3: Diet */}
      <div className="mb-4">
        <div className="text-xs font-bold text-text2 mb-2">Diet adherence</div>
        <div className="flex gap-2">
          {dietOptions.map(opt => (
            <button key={opt.val} onClick={() => setDietAdherence(opt.val)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-black border transition-all ${
                dietAdherence === opt.val ? opt.color : 'bg-bg2 border-border text-text3'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Q4 + Q5: Free text */}
      <div className="mb-3">
        <div className="text-xs font-bold text-text2 mb-1.5">Hardest moment this week <span className="text-text3 font-normal">(optional)</span></div>
        <input
          type="text" value={hardestMoment} onChange={e => setHardestMoment(e.target.value)}
          placeholder="e.g. Deadlift form broke down on set 3"
          className="w-full bg-bg2 border border-border rounded-[10px] text-sm px-3 py-2.5 outline-none focus:border-accent text-text1"
        />
      </div>
      <div className="mb-4">
        <div className="text-xs font-bold text-text2 mb-1.5">One thing to improve next week <span className="text-text3 font-normal">(optional)</span></div>
        <input
          type="text" value={nextWeekGoal} onChange={e => setNextWeekGoal(e.target.value)}
          placeholder="e.g. Hit all 4 sessions, no skips"
          className="w-full bg-bg2 border border-border rounded-[10px] text-sm px-3 py-2.5 outline-none focus:border-accent text-text1"
        />
      </div>

      <button onClick={submit}
        className="w-full py-3 bg-gradient-to-r from-accent to-green-400 text-black font-bold rounded-[10px] text-sm">
        {saved2 ? 'Update Check-in ✓' : 'Save Check-in →'}
      </button>
    </div>
  );
}
