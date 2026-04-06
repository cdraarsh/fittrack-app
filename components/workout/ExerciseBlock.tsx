'use client';

import React, { useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { useApp } from '@/lib/store';
import { computePRs, dk } from '@/lib/utils';
import { startRestTimer } from '../shared/RestTimer';
import SwapSheet from './SwapSheet';
import type { ExerciseTemplate, DayData } from '@/lib/types';

interface Props {
  ex:      ExerciseTemplate;
  data:    DayData;
  isToday: boolean;
  date:    Date;
  dayName: string;
}

export default function ExerciseBlock({ ex, data, isToday, date, dayName }: Props) {
  const { settings, dayCache, saveDayData } = useApp();
  const [swapOpen, setSwapOpen] = useState(false);

  const exData = data.wo?.[ex.id] ?? {};
  const sets   = exData.sets ?? [];
  const dateStr = dk(date);

  const swappedName = settings?.swaps?.[ex.id];
  const displayName = swappedName ?? ex.name;

  // PR detection
  const prs = computePRs(dayCache);
  const existingPR = prs[ex.id];

  const allMax = sets.length >= ex.sets &&
    sets.slice(0, ex.sets).every(s => s?.done && (s?.reps ?? 0) >= ex.hi);

  async function saveField(idx: number, field: 'weight' | 'reps', raw: string) {
    const val = field === 'reps' ? parseInt(raw) : parseFloat(raw);
    if (isNaN(val)) return;
    const updated = structuredClone(data);
    if (!updated.wo[ex.id]) updated.wo[ex.id] = { sets: [] };
    if (!updated.wo[ex.id].sets![idx]) updated.wo[ex.id].sets![idx] = {};
    updated.wo[ex.id].sets![idx][field] = val;
    await saveDayData(date, updated);
  }

  async function toggleSet(idx: number) {
    const updated = structuredClone(data);
    if (!updated.wo[ex.id]) updated.wo[ex.id] = { sets: [] };
    if (!updated.wo[ex.id].sets![idx]) updated.wo[ex.id].sets![idx] = {};
    const nowDone = !updated.wo[ex.id].sets![idx].done;
    updated.wo[ex.id].sets![idx].done = nowDone;
    await saveDayData(date, updated);
    if (nowDone) startRestTimer(parseInt(ex.rest) || 60);
  }

  return (
    <div className="bg-bg2 border border-border rounded-[10px] p-3.5 mb-3">
      {/* Header */}
      <div className="flex items-start justify-between mb-0.5">
        <div className="font-condensed text-[17px] font-bold leading-tight">
          {displayName}
          {swappedName && <span className="text-[11px] text-text3 font-normal ml-1">(swapped)</span>}
        </div>
        {SWAP_MAP_HAS(ex.id) && isToday && (
          <button onClick={() => setSwapOpen(true)} className="text-text3 hover:text-accent text-lg leading-none ml-2 flex-shrink-0">⇄</button>
        )}
      </div>
      <div className="text-[11px] text-text3 font-semibold tracking-wide mb-2.5">
        {ex.sets} × {ex.lo}{ex.lo !== ex.hi ? `–${ex.hi}` : ''}{ex.isTime ? 's' : ' reps'} · Rest {ex.rest}
      </div>

      {/* Cue */}
      <div className="flex items-start gap-2 text-warn bg-warn/5 border border-warn/12 rounded-lg p-2 mb-3 text-xs leading-snug">
        <Lightbulb size={13} className="flex-shrink-0 mt-0.5" />
        <span>{ex.cue}</span>
      </div>

      {/* Sets grid */}
      <div className="grid grid-cols-[26px_1fr_1fr_44px] gap-1.5 items-center">
        <span className="text-[10px] text-text3 font-bold uppercase">#</span>
        <span className="text-[10px] text-text3 font-bold uppercase">kg</span>
        <span className="text-[10px] text-text3 font-bold uppercase">{ex.isTime ? 'sec' : 'reps'}</span>
        <span />
        {Array.from({ length: ex.sets }, (_, i) => {
          const s = sets[i] ?? {};
          const w = s.weight !== undefined ? s.weight : (ex.load !== null ? ex.load ?? '' : '');
          const isPR = s.done && s.weight && (!existingPR || s.weight > existingPR.weight);
          return (
            <React.Fragment key={i}>
              <span className="text-xs text-text3 font-semibold text-center">
                {i + 1}{isPR && <span className="text-warn text-[9px] ml-0.5">★</span>}
              </span>
              <input
                type="number" inputMode="decimal"
                defaultValue={w !== '' ? w : undefined}
                placeholder="kg"
                readOnly={!isToday}
                onChange={e => saveField(i, 'weight', e.target.value)}
                className="bg-bg3 border border-border rounded-lg text-sm font-semibold text-center py-2 px-1 w-full outline-none focus:border-accent focus:bg-accent/[0.04] read-only:opacity-40"
              />
              <input
                type="number" inputMode="numeric"
                defaultValue={s.reps || undefined}
                placeholder={`${ex.lo}–${ex.hi}`}
                readOnly={!isToday}
                onChange={e => saveField(i, 'reps', e.target.value)}
                className="bg-bg3 border border-border rounded-lg text-sm font-semibold text-center py-2 px-1 w-full outline-none focus:border-accent focus:bg-accent/[0.04] read-only:opacity-40"
              />
              <button
                disabled={!isToday}
                onClick={() => toggleSet(i)}
                className={`flex items-center justify-center rounded-lg py-2 w-full border transition-all disabled:opacity-30 ${
                  s.done
                    ? 'bg-accent/10 border-accent/35 text-accent'
                    : 'bg-bg3 border-border text-text3'
                }`}
              >
                {s.done ? '✓' : '○'}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Overload hint */}
      {allMax && isToday && (
        <div className="flex items-center gap-2 mt-2.5 bg-accent/5 border border-accent/18 rounded-lg px-3 py-2 text-xs text-accent font-semibold">
          🏆 All sets hit top of range — add 2.5 kg next session!
        </div>
      )}

      {swapOpen && <SwapSheet exId={ex.id} onClose={() => setSwapOpen(false)} />}
    </div>
  );
}

// Helper to avoid importing SWAP_MAP in this file
function SWAP_MAP_HAS(id: string): boolean {
  const ids = ['bench','shoulder','cablerow','latpull','tricep','bicep','squat','legprss','rdl','legcurl','calf','plank','bentrow','incline','facepull','lateral','ohtri','hammer','deadlift','bss','hipthru','legext','kneeraise'];
  return ids.includes(id);
}
