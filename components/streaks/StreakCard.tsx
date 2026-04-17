'use client';

import { Flame, CalendarCheck } from 'lucide-react';
import { useApp } from '@/lib/store';
import { computeStreaks } from '@/lib/utils';

export default function StreakCard() {
  const { settings, dayCache } = useApp();
  const { dayStreak, weekStreak } = computeStreaks(settings, dayCache);

  return (
    <div className="bg-surface border border-hairline rounded-card p-4 mb-3">
      <div className="font-sans text-[13px] font-black uppercase tracking-widest text-ink mb-3">Streaks</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface-2 rounded-sm p-4 text-center border border-hairline">
          <div className="flex justify-center mb-2"><Flame size={28} className="text-clay" /></div>
          <div className="font-mono tabular-nums text-3xl font-semibold text-clay">{dayStreak}</div>
          <div className="font-mono text-[10px] text-ink-3 uppercase tracking-wider font-bold mt-1">Day Streak</div>
          <div className="text-[11px] text-ink-3 mt-1">
            {dayStreak === 0 ? 'Log activity today to start' : dayStreak === 1 ? 'Keep it going tomorrow' : `${dayStreak} days straight`}
          </div>
        </div>
        <div className="bg-surface-2 rounded-sm p-4 text-center border border-hairline">
          <div className="flex justify-center mb-2"><CalendarCheck size={28} className="text-ink-2" /></div>
          <div className="font-mono tabular-nums text-3xl font-semibold text-ink">{weekStreak}</div>
          <div className="font-mono text-[10px] text-ink-3 uppercase tracking-wider font-bold mt-1">Week Streak</div>
          <div className="text-[11px] text-ink-3 mt-1">
            {weekStreak === 0 ? 'Hit ≥3 sessions this week' : weekStreak === 1 ? 'First full week done!' : `${weekStreak} weeks consistent`}
          </div>
        </div>
      </div>
    </div>
  );
}
