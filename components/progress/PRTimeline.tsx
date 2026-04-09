'use client';

import { useState, useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { computePRHistory, getWorkoutMap, fmtShort } from '@/lib/utils';
import type { Settings, DayData } from '@/lib/types';

Chart.register(...registerables);

interface Props {
  settings: Settings | null;
  dayCache: Record<string, DayData>;
}

export default function PRTimeline({ settings, dayCache }: Props) {
  const workoutMap = getWorkoutMap(settings);
  const history    = computePRHistory(dayCache, workoutMap);
  const entries    = Object.entries(history).filter(([, h]) => h.length > 0);

  const [selectedEx, setSelectedEx] = useState<string | null>(null);
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chart    = useRef<Chart | null>(null);

  // Build exercise name map for display
  const exNames: Record<string, string> = {};
  for (const wo of Object.values(workoutMap))
    for (const ex of wo.exercises)
      exNames[ex.id] = ex.name;

  // Current PR per exercise (last entry in history)
  const currentPRs = Object.fromEntries(
    entries.map(([exId, h]) => [exId, h[h.length - 1]])
  );
  const prList = Object.values(currentPRs).sort((a, b) => b.weight - a.weight);

  useEffect(() => {
    if (!chartRef.current || !selectedEx) return;
    const h = history[selectedEx];
    if (!h?.length) return;

    chart.current?.destroy();
    chart.current = new Chart(chartRef.current, {
      type: 'line',
      data: {
        labels: h.map(e => fmtShort(e.date)),
        datasets: [{
          data: h.map(e => e.weight),
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245,158,11,0.07)',
          borderWidth: 2,
          pointBackgroundColor: '#f59e0b',
          pointBorderColor: '#080b10',
          pointBorderWidth: 2,
          pointRadius: 5,
          tension: 0.3,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#161b24',
            borderColor: '#232b38',
            borderWidth: 1,
            callbacks: { label: c => `${c.raw} kg` },
          },
        },
        scales: {
          x: { grid: { color: 'rgba(35,43,56,0.6)' }, ticks: { color: '#64748b', font: { size: 11 } } },
          y: {
            grid: { color: 'rgba(35,43,56,0.6)' },
            ticks: { color: '#64748b', font: { size: 11 }, callback: v => v + ' kg' },
            min: Math.max(0, Math.min(...h.map(e => e.weight)) - 5),
          },
        },
      },
    });
    return () => { chart.current?.destroy(); };
  }, [selectedEx]);

  if (prList.length === 0) {
    return (
      <div className="bg-bg1 border border-border rounded-card p-4 mb-3">
        <div className="text-[13px] font-black uppercase tracking-widest text-text2 mb-3">Personal Records</div>
        <div className="text-center py-8 text-text3 text-sm">Log sets to start tracking PRs</div>
      </div>
    );
  }

  const selectedHistory = selectedEx ? history[selectedEx] : null;

  return (
    <div className="bg-bg1 border border-border rounded-card p-4 mb-3">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[13px] font-black uppercase tracking-widest text-text2">Personal Records</div>
        <div className="text-xs text-text3">{prList.length} lifts</div>
      </div>

      {prList.map(pr => {
        const exId = Object.keys(currentPRs).find(k => currentPRs[k] === pr)!;
        const isSelected = selectedEx === exId;
        const h = history[exId] ?? [];
        const delta = h.length > 1 ? +(h[h.length - 1].weight - h[0].weight).toFixed(1) : null;

        return (
          <div key={pr.name}>
            <button
              onClick={() => setSelectedEx(isSelected ? null : exId)}
              className="w-full flex items-center justify-between py-2.5 border-b border-border last:border-0 cursor-pointer text-left"
            >
              <div>
                <div className="text-sm font-semibold flex items-center gap-2">
                  {pr.name}
                  {delta !== null && delta > 0 && (
                    <span className="text-[10px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                      +{delta} kg
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-text3">
                  {fmtShort(pr.date)}{pr.reps ? ` · ${pr.reps} reps` : ''}
                  {h.length > 1 ? ` · ${h.length} PRs` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="font-condensed text-xl font-black text-warn">
                  {pr.weight} <span className="text-sm font-semibold">kg</span>
                </div>
                <span className={`text-text3 text-xs transition-transform ${isSelected ? 'rotate-90' : ''}`}>▸</span>
              </div>
            </button>

            {isSelected && selectedHistory && (
              <div className="py-3">
                {selectedHistory.length === 1 ? (
                  <div className="text-xs text-text3 text-center py-4">First PR set on {fmtShort(selectedHistory[0].date)} — log more to see progression.</div>
                ) : (
                  <div className="relative h-40">
                    <canvas ref={chartRef} />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
