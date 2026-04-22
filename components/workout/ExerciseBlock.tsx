'use client';

import React, { useState } from 'react';
import { Lightbulb, ArrowLeftRight, Check, Circle, Trophy } from 'lucide-react';
import { useApp } from '@/lib/store';
import { computePRs, dk } from '@/lib/utils';
import { startRestTimer } from '../shared/RestTimer';
import SwapSheet from './SwapSheet';
import type { ExerciseTemplate, DayData } from '@/lib/types';

interface Props {
  ex:       ExerciseTemplate;
  data:     DayData;
  isToday:  boolean;
  date:     Date;
  dayName:  string;
  isActive?: boolean;
}

export default function ExerciseBlock({ ex, data, isToday, date, dayName, isActive }: Props) {
  const { settings, dayCache, saveDayData } = useApp();
  const [swapOpen, setSwapOpen] = useState(false);

  const exData = data.wo?.[ex.id] ?? {};
  const sets   = exData.sets ?? [];

  const swappedName = settings?.swaps?.[ex.id];
  const displayName = swappedName ?? ex.name;

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

  const baseCard = isActive
    ? {
        position: 'relative' as const,
        background: 'linear-gradient(180deg, rgba(34,197,94,.08), rgba(34,197,94,.02) 60%, rgba(22,27,36,.6))',
        border: '1px solid rgba(34,197,94,.28)',
        borderRadius: 18,
        padding: 18,
        marginBottom: 16,
        overflow: 'hidden' as const,
        backdropFilter: 'blur(18px) saturate(160%)',
        WebkitBackdropFilter: 'blur(18px) saturate(160%)',
        boxShadow: '0 18px 36px rgba(0,0,0,.45), 0 2px 0 rgba(255,255,255,.04) inset, 0 -1px 0 rgba(34,197,94,.12) inset',
      }
    : {
        background: '#0e1117',
        border: '1px solid #232b38',
        borderRadius: 14,
        padding: '14px',
        marginBottom: 12,
        position: 'relative' as const,
        overflow: 'hidden' as const,
      };

  return (
    <div style={baseCard}>
      {/* liquid-glass radial highlight + active bar */}
      {isActive && (
        <>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 18, pointerEvents: 'none',
            background: 'radial-gradient(140% 60% at 0% 0%, rgba(255,255,255,.06), transparent 60%)',
          }} />
          <div style={{
            position: 'absolute', top: 14, left: 0, width: 3, height: 28,
            background: '#22c55e', borderRadius: '0 2px 2px 0',
            boxShadow: '0 0 12px rgba(34,197,94,.6)',
          }} />
        </>
      )}

      <div style={{ position: 'relative' }}>
        {/* Header */}
        <div className="flex items-start justify-between mb-0.5">
          <div className="flex items-baseline gap-2">
            <span className="font-condensed text-[18px] font-bold leading-tight text-text1">
              {displayName}
              {swappedName && <span className="text-[11px] text-text3 font-normal ml-1">(swapped)</span>}
            </span>
            {isActive && (
              <span style={{ fontSize: 9, color: '#22c55e', letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 600 }}>Active</span>
            )}
          </div>
          {SWAP_MAP_HAS(ex.id) && isToday && (
            <button onClick={() => setSwapOpen(true)} className="text-text3 hover:text-text2 ml-2 flex-shrink-0 cursor-pointer"><ArrowLeftRight size={15} /></button>
          )}
        </div>

        <div className="text-[11px] text-text3 font-semibold tracking-wide mb-2.5">
          {ex.sets} × {ex.lo}{ex.lo !== ex.hi ? `–${ex.hi}` : ''}{ex.isTime ? 's' : ' reps'} · Rest {ex.rest}
        </div>

        {/* Cue */}
        <div className="flex items-start gap-2 rounded-sm p-2 mb-3 text-xs leading-snug" style={{ background: 'rgba(245,158,11,.05)', border: '1px solid rgba(245,158,11,.15)', borderLeft: '2px solid rgba(245,158,11,.45)' }}>
          <Lightbulb size={13} className="text-warn flex-shrink-0 mt-0.5" />
          <span className="text-text2">{ex.cue}</span>
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
                  className="bg-bg2 border border-border rounded-sm text-sm font-semibold text-center py-2 px-1 w-full outline-none focus:border-accent text-text1 read-only:opacity-40"
                />
                <input
                  type="number" inputMode="numeric"
                  defaultValue={s.reps || undefined}
                  placeholder={`${ex.lo}–${ex.hi}`}
                  readOnly={!isToday}
                  onChange={e => saveField(i, 'reps', e.target.value)}
                  className="bg-bg2 border border-border rounded-sm text-sm font-semibold text-center py-2 px-1 w-full outline-none focus:border-accent text-text1 read-only:opacity-40"
                />
                <button
                  disabled={!isToday}
                  onClick={() => toggleSet(i)}
                  className={`flex items-center justify-center rounded-sm py-2 w-full border transition-all disabled:opacity-30 cursor-pointer active:scale-95 ${
                    s.done
                      ? 'border-accent/30 text-accent'
                      : 'border-border text-text3'
                  }`}
                  style={{ background: s.done ? 'rgba(34,197,94,.12)' : '#1e2532' }}
                >
                  {s.done ? <Check size={14} strokeWidth={2.5} /> : <Circle size={14} />}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* Overload hint */}
        {allMax && isToday && (
          <div className="flex items-center gap-2 mt-2.5 rounded-sm px-3 py-2 text-xs font-semibold text-accent" style={{ background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.2)' }}>
            <Trophy size={13} className="flex-shrink-0" /> All sets hit top of range — add 2.5 kg next session!
          </div>
        )}
      </div>

      {swapOpen && <SwapSheet exId={ex.id} onClose={() => setSwapOpen(false)} />}
    </div>
  );
}

function SWAP_MAP_HAS(id: string): boolean {
  const ids = ['bench','shoulder','cablerow','latpull','tricep','bicep','squat','legprss','rdl','legcurl','calf','plank','bentrow','incline','facepull','lateral','ohtri','hammer','deadlift','bss','hipthru','legext','kneeraise'];
  return ids.includes(id);
}
