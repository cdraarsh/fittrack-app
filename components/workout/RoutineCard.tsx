'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { Check, ChevronDown, Flame, Snowflake } from 'lucide-react';
import type { RampSet, RoutineItem, RoutineKind } from '@/lib/program/routines';
import { VideoButton } from './VideoSheet';

/**
 * Warm-up / cool-down card. Guidance only: ticks and the open/closed toggle are
 * per session in localStorage (never Dexie, never Supabase), and nothing here
 * counts toward completing a session.
 */

const key = (sessionId: string, kind: RoutineKind, what: 'open' | 'ticks') => `fittrack:routine:${sessionId}:${kind}:${what}`;

function readJson<T>(k: string): T | null {
  try {
    const raw = window.localStorage.getItem(k);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}
function writeJson(k: string, v: unknown) {
  try {
    window.localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* private mode / storage full: ticks just won't persist */
  }
}

interface Ramp {
  exerciseName: string;
  sets: RampSet[];
}

interface Props {
  kind: RoutineKind;
  sessionId: string;
  items: RoutineItem[];
  minutes: number;
  /** Default expansion (lib/program/routines#defaultRoutineOpen); a manual toggle wins. */
  defaultOpen: boolean;
  /** Preview / locked: no ticks. */
  readOnly: boolean;
  /** Warm-up only: ramp-up sets for the day's first main lift. */
  ramp?: Ramp | null;
}

export default function RoutineCard({ kind, sessionId, items, minutes, defaultOpen, readOnly, ramp }: Props) {
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const [ticks, setTicks] = useState<string[]>([]);
  const panelId = useId();
  const title = kind === 'warmup' ? 'Warm-up' : 'Cool-down';

  // Load after mount (SSR-safe) and whenever the session changes.
  useEffect(() => {
    const o = readJson<boolean>(key(sessionId, kind, 'open'));
    setManualOpen(typeof o === 'boolean' ? o : null);
    const t = readJson<string[]>(key(sessionId, kind, 'ticks'));
    setTicks(Array.isArray(t) ? t.filter((x) => typeof x === 'string') : []);
  }, [sessionId, kind]);

  const open = readOnly ? (manualOpen ?? false) : (manualOpen ?? defaultOpen);

  const toggle = () => {
    const next = !open;
    setManualOpen(next);
    if (!readOnly) writeJson(key(sessionId, kind, 'open'), next);
  };

  const toggleTick = useCallback(
    (id: string) => {
      setTicks((prev) => {
        const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
        writeJson(key(sessionId, kind, 'ticks'), next);
        return next;
      });
    },
    [sessionId, kind],
  );

  const rampIds = ramp?.sets.map((_, i) => `ramp-${i}`) ?? [];
  const total = items.length + rampIds.length;
  const done = [...items.map((i) => i.id), ...rampIds].filter((id) => ticks.includes(id)).length;
  const Icon = kind === 'warmup' ? Flame : Snowflake;

  return (
    <section className="bg-bg2 border border-border rounded-[10px] mb-3" aria-label={title}>
      <h3 className="m-0">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="w-full min-h-12 flex items-center gap-2.5 px-3.5 py-3 text-left"
        >
          <Icon size={16} className={kind === 'warmup' ? 'text-energy' : 'text-info'} aria-hidden />
          <span className="font-condensed text-[17px] font-bold">
            {title} · ~{minutes} min
          </span>
          {!readOnly && done > 0 && (
            <span className="text-[11px] text-text3 font-semibold">
              {done}/{total}
            </span>
          )}
          <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-text3">Optional</span>
          <ChevronDown size={18} className={`text-text3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </h3>

      <div id={panelId} hidden={!open} className="px-3.5 pb-3">
        <ul className="divide-y divide-border">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-2 py-2">
              {!readOnly && <TickBox checked={ticks.includes(it.id)} label={`${it.name} done`} onChange={() => toggleTick(it.id)} />}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold leading-tight">
                  {it.name} <span className="text-text3 font-normal">· {it.dose}</span>
                </div>
                <div className="text-xs text-text2 leading-snug mt-0.5">{it.cue}</div>
              </div>
              <VideoButton videoKey={it.id} name={it.name} />
            </li>
          ))}
        </ul>

        {ramp && ramp.sets.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border">
            <div className="text-[11px] font-bold uppercase tracking-widest text-text3 mb-1">Ramp-up · {ramp.exerciseName}</div>
            <ul>
              {ramp.sets.map((s, i) => (
                <li key={i} className="flex items-center gap-2 py-1">
                  {!readOnly && <TickBox checked={ticks.includes(`ramp-${i}`)} label={`Ramp-up set ${i + 1} done`} onChange={() => toggleTick(`ramp-${i}`)} />}
                  <span className="text-sm font-semibold tabular-nums">
                    {s.emptyBar ? 'Empty bar' : s.kg === null ? 'Light' : `${s.kg} kg`} × {s.reps}
                  </span>
                  {s.pct !== null && <span className="text-xs text-text3">~{Math.round(s.pct * 100)}%</span>}
                </li>
              ))}
            </ul>
            {ramp.sets.length === 1 && ramp.sets[0].pct === null && (
              <p className="text-xs text-text3 mt-1">No working weight yet — add small jumps until your first set feels right.</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function TickBox({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className="w-11 h-11 -ml-2 flex-shrink-0 flex items-center justify-center"
    >
      <span
        className={`w-6 h-6 rounded-md border flex items-center justify-center transition-colors ${
          checked ? 'bg-accent/15 border-accent/50 text-accent' : 'bg-bg3 border-border text-transparent'
        }`}
      >
        <Check size={14} strokeWidth={3} />
      </span>
    </button>
  );
}
