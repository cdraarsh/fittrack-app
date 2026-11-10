'use client';

import React, { useRef, useState } from 'react';
import { Lightbulb, ArrowLeftRight, Check, Circle, Trophy, Watch } from 'lucide-react';
import { hitTopOfRange, roundToPlate } from '@/lib/program';
import type { SessionBundleItem } from '@/lib/local/hooks';
import type { SetPatch } from '@/lib/local/actions';
import SwapSheet from './SwapSheet';
import { toast } from '../shared/Toast';

export type LoggerMode = 'active' | 'complete' | 'preview';

interface Props {
  item: SessionBundleItem;
  mode: LoggerMode;
  isDeload: boolean;
  /** Last done weight for this exercise in an earlier session (prefill). */
  lastWeight: number | null;
  onSave: (setIndex: number, patch: SetPatch) => Promise<unknown>;
  /** Called after a set is ticked done; `exerciseDone` = this tick finished the exercise. */
  onTicked: (restSeconds: number, exerciseDone: boolean) => void;
}

const parseNum = (v: string, int: boolean): number | null => {
  if (v.trim() === '') return null;
  const n = int ? parseInt(v, 10) : parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * v1's set grid, rewired to the local store. Saves on tick and on blur, never
 * per keystroke. Weight prefills from the last session (deload: ~60 %), reps
 * placeholder is the target range.
 */
export default function ExerciseBlock({ item, mode, isDeload, lastWeight, onSave, onTicked }: Props) {
  const { se, exercise, prescribed, logs } = item;
  const [swapOpen, setSwapOpen] = useState(false);
  const weightRefs = useRef<(HTMLInputElement | null)[]>([]);
  const valueRefs = useRef<(HTMLInputElement | null)[]>([]);

  const timed = exercise?.is_timed ?? false;
  const swapped = se.exercise_id !== se.prescribed_exercise_id;
  const byIndex = new Map(logs.map((l) => [l.set_index, l]));
  const prefill =
    lastWeight !== null ? (isDeload ? roundToPlate(lastWeight * 0.6) : lastWeight) : se.target_kg;
  const topOfRange = hitTopOfRange(se, logs, timed);

  async function blurSave(i: number, field: 'weight_kg' | 'reps' | 'seconds', raw: string) {
    const log = byIndex.get(i);
    const val = parseNum(raw, field !== 'weight_kg');
    const current = log ? log[field] : field === 'weight_kg' ? prefill : null;
    if (val === current) return;
    if (mode === 'complete' && (!log?.done || val === null || (field !== 'weight_kg' && val === 0))) return;
    try {
      await onSave(i, { [field]: val });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save');
    }
  }

  async function tick(i: number) {
    const log = byIndex.get(i);
    if (mode !== 'active') return;
    const nowDone = !log?.done;
    const weight = parseNum(weightRefs.current[i]?.value ?? '', false);
    const value = parseNum(valueRefs.current[i]?.value ?? '', true);
    if (nowDone && !value) {
      toast(timed ? 'Enter seconds first' : 'Enter reps first');
      valueRefs.current[i]?.focus();
      return;
    }
    const patch: SetPatch = { done: nowDone, weight_kg: weight, [timed ? 'seconds' : 'reps']: value };
    try {
      await onSave(i, patch);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save');
      return;
    }
    if (nowDone) {
      const doneAfter = Array.from({ length: se.sets }, (_, k) => (k === i ? true : !!byIndex.get(k)?.done)).every(Boolean);
      onTicked(se.rest_s, doneAfter);
    }
  }

  return (
    <div className="bg-bg2 border border-border rounded-[10px] p-3.5 mb-3">
      <div className="flex items-start justify-between mb-0.5">
        <div className="font-condensed text-[17px] font-bold leading-tight">
          {exercise?.name ?? se.exercise_id}
          {swapped && <span className="text-[11px] text-text3 font-normal ml-1">(swapped from {prescribed?.name})</span>}
        </div>
        {mode === 'active' && (
          <button
            aria-label="Swap exercise"
            onClick={() => setSwapOpen(true)}
            className="text-text3 hover:text-accent ml-2 flex-shrink-0 cursor-pointer"
          >
            <ArrowLeftRight size={15} />
          </button>
        )}
      </div>
      <div className="text-[11px] text-text3 font-semibold tracking-wide mb-2.5">
        {se.sets} × {se.rep_lo}
        {se.rep_lo !== se.rep_hi ? `–${se.rep_hi}` : ''}
        {timed ? 's' : ' reps'} · Rest {se.rest_s}s
        {se.target_kg !== null && se.target_kg > 0 && <> · start {se.target_kg} kg</>}
      </div>

      {exercise?.cue && mode !== 'preview' && (
        <div className="flex items-start gap-2 text-warn bg-warn/5 border border-warn/12 rounded-lg p-2 mb-3 text-xs leading-snug">
          <Lightbulb size={13} className="flex-shrink-0 mt-0.5" />
          <span>{isDeload ? `Deload: ~60% of your usual load, same reps. ${exercise.cue}` : exercise.cue}</span>
        </div>
      )}

      {mode !== 'preview' && (
        <div className="grid grid-cols-[26px_1fr_1fr_44px] gap-1.5 items-center">
          <span className="text-[10px] text-text3 font-bold uppercase">#</span>
          <span className="text-[10px] text-text3 font-bold uppercase">kg</span>
          <span className="text-[10px] text-text3 font-bold uppercase">{timed ? 'sec' : 'reps'}</span>
          <span />
          {Array.from({ length: se.sets }, (_, i) => {
            const log = byIndex.get(i);
            const done = !!log?.done;
            const w = log?.weight_kg ?? (log ? null : prefill);
            const v = timed ? log?.seconds : log?.reps;
            const editable = mode === 'active' || (mode === 'complete' && done);
            return (
              <React.Fragment key={`${i}:${log?.updated_at ?? ''}`}>
                <span className="text-xs text-text3 font-semibold text-center">
                  {i + 1}
                  {log?.source === 'watch' && <Watch size={9} className="inline ml-0.5 text-info" aria-label="from watch" />}
                </span>
                <input
                  ref={(el) => { weightRefs.current[i] = el; }}
                  type="number"
                  inputMode="decimal"
                  aria-label={`Set ${i + 1} weight`}
                  defaultValue={w ?? undefined}
                  placeholder="kg"
                  readOnly={!editable}
                  onBlur={(e) => void blurSave(i, 'weight_kg', e.target.value)}
                  className="bg-bg3 border border-border rounded-lg text-sm font-semibold text-center py-2 px-1 w-full outline-none focus:border-accent focus:bg-accent/[0.04] read-only:opacity-40"
                />
                <input
                  ref={(el) => { valueRefs.current[i] = el; }}
                  type="number"
                  inputMode="numeric"
                  aria-label={`Set ${i + 1} ${timed ? 'seconds' : 'reps'}`}
                  defaultValue={v ?? undefined}
                  placeholder={`${se.rep_lo}–${se.rep_hi}`}
                  readOnly={!editable}
                  onBlur={(e) => void blurSave(i, timed ? 'seconds' : 'reps', e.target.value)}
                  className="bg-bg3 border border-border rounded-lg text-sm font-semibold text-center py-2 px-1 w-full outline-none focus:border-accent focus:bg-accent/[0.04] read-only:opacity-40"
                />
                <button
                  aria-label={done ? `Set ${i + 1} done` : `Tick set ${i + 1}`}
                  aria-pressed={done}
                  disabled={mode !== 'active'}
                  onClick={() => void tick(i)}
                  className={`flex items-center justify-center rounded-lg py-2 w-full border transition-all cursor-pointer active:scale-95 ${
                    mode !== 'active' && !done ? 'opacity-30' : ''
                  } ${done ? 'bg-accent/10 border-accent/35 text-accent' : 'bg-bg3 border-border text-text3'}`}
                >
                  {done ? <Check size={14} strokeWidth={2.5} /> : <Circle size={14} />}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}

      {topOfRange && mode === 'active' && (
        <div className="flex items-center gap-2 mt-2.5 bg-accent/5 border border-accent/18 rounded-lg px-3 py-2 text-xs text-accent font-semibold">
          <Trophy size={13} className="flex-shrink-0" /> All sets hit top of range — add 2.5 kg next session!
        </div>
      )}

      {swapOpen && <SwapSheet sessionExerciseId={se.id} currentId={se.exercise_id} prescribedId={se.prescribed_exercise_id} onClose={() => setSwapOpen(false)} />}
    </div>
  );
}
