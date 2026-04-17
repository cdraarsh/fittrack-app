'use client';

import { useApp } from '@/lib/store';
import { computeCalorieBank } from '@/lib/utils';

export default function CalorieBank() {
  const { settings, dayCache } = useApp();
  const { days, bankBalance, loggedDays } = computeCalorieBank(settings, dayCache);

  const maxBudget = Math.max(...days.map(d => d.budget));

  return (
    <div className="bg-surface border border-hairline rounded-card p-4 mb-3">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[13px] font-black uppercase tracking-widest text-ink-2">Calorie Bank</div>
        <div className={`font-sans text-lg font-black ${bankBalance >= 0 ? 'text-clay' : 'text-clay'}`}>
          {bankBalance >= 0 ? '+' : ''}{bankBalance} kcal
        </div>
      </div>

      {/* 7-day bars */}
      <div className="flex items-end gap-1.5 h-16 mb-2">
        {days.map(d => {
          const budgetH = Math.round((d.budget / maxBudget) * 100);
          const actualH = d.actual > 0 ? Math.round((Math.min(d.actual, d.budget * 1.2) / maxBudget) * 100) : 0;
          const over = d.actual > d.budget;
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-0.5 h-full">
              <div className="w-full flex flex-col justify-end h-full relative">
                {/* Budget bar (background) */}
                <div
                  className="w-full rounded-sm bg-surface-2 border border-hairline absolute bottom-0"
                  style={{ height: `${budgetH}%` }}
                />
                {/* Actual bar */}
                {d.actual > 0 && (
                  <div
                    className={`w-full rounded-sm absolute bottom-0 transition-all ${
                      over ? 'bg-clay/50' : 'bg-clay/60'
                    }`}
                    style={{ height: `${actualH}%` }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Day labels */}
      <div className="flex gap-1.5 mb-3">
        {days.map(d => (
          <div key={d.date} className="flex-1 text-center text-[10px] text-ink-3 font-bold">{d.label}</div>
        ))}
      </div>

      <div className="flex items-center justify-between text-[11px] text-ink-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-clay/60 inline-block" />Actual</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-surface-2 border border-hairline inline-block" />Budget</span>
        </div>
        <span>{loggedDays}/7 days logged</span>
      </div>
    </div>
  );
}
