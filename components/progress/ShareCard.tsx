'use client';

import { useRef } from 'react';
import { useApp } from '@/lib/store';
import { getWeekNum, computeStreaks, calcConsistency, computeWeeklySummary } from '@/lib/utils';
import { toast } from '../shared/Toast';

export default function ShareCard() {
  const { settings, dayCache, weightCache } = useApp();
  const cardRef = useRef<HTMLDivElement>(null);

  const weekNum     = getWeekNum(settings);
  const streaks     = computeStreaks(settings, dayCache);
  const cons        = calcConsistency(settings, dayCache);
  const ws          = computeWeeklySummary(settings, dayCache, weightCache);
  const name        = settings?.name ?? 'Athlete';

  const wDelta = ws.weightDelta !== null
    ? `${ws.weightDelta <= 0 ? '−' : '+'}${Math.abs(ws.weightDelta)} kg`
    : '—';

  const shareText = [
    `🏋️ Week ${weekNum}/16 Check-in`,
    ``,
    `👤 ${name}`,
    `📅 Sessions: ${ws.sessionsDone}/${ws.sessionsScheduled}`,
    `🔥 Day streak: ${streaks.dayStreak}`,
    `📊 Consistency: ${cons.pct}%`,
    `⚖️ Weight: ${wDelta}`,
    ws.avgCals ? `🥩 Avg calories: ${ws.avgCals} kcal` : null,
    ws.bestLift ? `🏆 Best lift: ${ws.bestLift.weight} kg × ${ws.bestLift.reps} — ${ws.bestLift.name}` : null,
    ``,
    `Built with FitTrack`,
  ].filter(Boolean).join('\n');

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Week ${weekNum} Check-in`, text: shareText });
        return;
      } catch { /* fallthrough to clipboard */ }
    }
    await navigator.clipboard.writeText(shareText);
    toast('Stats copied to clipboard');
  }

  return (
    <div className="bg-surface border border-hairline rounded-card p-4 mb-3">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[13px] font-black uppercase tracking-widest text-ink-2">Share Your Progress</div>
        <button onClick={share} className="text-xs font-bold px-3 py-1.5 bg-clay hover:bg-clay-hover text-surface rounded-lg">
          Share →
        </button>
      </div>

      {/* Card preview */}
      <div ref={cardRef} className="bg-gradient-to-br from-bg2 to-bg3 border border-hairline rounded-[14px] p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-sans text-xl font-black">FitTrack</div>
            <div className="text-[11px] text-ink-3">Week {weekNum} of 16</div>
          </div>
          <div className="text-right">
            <div className="font-sans text-2xl font-black text-clay">{streaks.dayStreak}</div>
            <div className="text-[10px] text-ink-3 uppercase">day streak 🔥</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { val: `${ws.sessionsDone}/${ws.sessionsScheduled}`, label: 'Sessions', color: 'text-clay' },
            { val: `${cons.pct}%`, label: 'Consistency', color: cons.pct >= 80 ? 'text-clay' : 'text-mustard' },
            { val: wDelta, label: 'Weight Δ', color: ws.weightDelta !== null && ws.weightDelta <= 0 ? 'text-clay' : 'text-mustard' },
          ].map(({ val, label, color }) => (
            <div key={label} className="bg-surface/60 rounded-sm p-2 text-center">
              <div className={`font-sans text-lg font-black ${color}`}>{val}</div>
              <div className="text-[10px] text-ink-3 uppercase font-bold mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {ws.bestLift && (
          <div className="bg-warn/5 border border-warn/15 rounded-lg px-3 py-2 text-xs">
            <span className="text-mustard font-bold">🏆 Best lift this week: </span>
            <span className="text-ink-2">{ws.bestLift.weight} kg × {ws.bestLift.reps} — {ws.bestLift.name}</span>
          </div>
        )}

        <div className="mt-3 text-[10px] text-ink-3 text-right">
          {name} · FitTrack 16-week program
        </div>
      </div>
    </div>
  );
}
