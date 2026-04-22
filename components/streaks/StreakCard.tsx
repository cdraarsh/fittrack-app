'use client';

import { Flame, CalendarCheck } from 'lucide-react';
import { useApp } from '@/lib/store';
import { computeStreaks } from '@/lib/utils';

export default function StreakCard() {
  const { settings, dayCache } = useApp();
  const { dayStreak, weekStreak } = computeStreaks(settings, dayCache);

  return (
    <div className="bg-bg1 border border-border rounded-card p-4 mb-3">
      <div className="font-sans text-[10px] font-black uppercase tracking-widest text-text3 mb-3">Streaks</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-bg2 border border-border rounded-sm p-4 text-center">
          <div className="flex justify-center mb-2"><Flame size={28} className="text-warn" /></div>
          <div className="font-condensed tabular-nums text-[30px] font-black text-warn leading-none">{dayStreak}</div>
          <div className="font-sans text-[10px] text-text3 uppercase tracking-wider font-bold mt-1.5">Day Streak</div>
          <div className="text-[11px] text-text3 mt-1">
            {dayStreak === 0 ? 'Log activity today to start' : dayStreak === 1 ? 'Keep it going tomorrow' : `${dayStreak} days straight`}
          </div>
        </div>
        <div className="bg-bg2 border border-border rounded-sm p-4 text-center">
          <div className="flex justify-center mb-2"><CalendarCheck size={28} className="text-accent" /></div>
          <div className="font-condensed tabular-nums text-[30px] font-black text-accent leading-none">{weekStreak}</div>
          <div className="font-sans text-[10px] text-text3 uppercase tracking-wider font-bold mt-1.5">Week Streak</div>
          <div className="text-[11px] text-text3 mt-1">
            {weekStreak === 0 ? 'Hit ≥3 sessions this week' : weekStreak === 1 ? 'First full week done!' : `${weekStreak} weeks consistent`}
          </div>
        </div>
      </div>
    </div>
  );
}
