'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Bike, Play, Square, RotateCcw, Pause, Sparkles } from 'lucide-react';
import { getDb } from '@/lib/local/db';
import { completeSession, resetSession, saveSet, startSession, updateSessionFields, LocalRuleError, type SetPatch } from '@/lib/local/actions';
import { useLastWeights, usePause, useSessionBundle, type SessionBundle } from '@/lib/local/hooks';
import { activeMs, clearPause, effectivePause, isPaused, pauseSession, resumeSession, type PauseState } from '@/lib/local/pause';
import { openCoach } from '@/lib/ui/overlays';
import {
  BAR_EQUIPMENT,
  BAR_KG,
  RAMP_SET_S,
  dayInfo,
  defaultRoutineOpen,
  missingWorkingSets,
  prefillWeight,
  rampUpSets,
  routineItems,
  routineMinutes,
} from '@/lib/program';
import ExerciseBlock, { type LoggerMode } from './ExerciseBlock';
import RoutineCard from './RoutineCard';
import { VideoButton } from './VideoSheet';
import { startRestTimer, stopRestTimer } from '../shared/RestTimer';
import { toast } from '../shared/Toast';
import { sound, useWakeLock } from './sound';

const RULE_MESSAGES: Record<LocalRuleError['code'], string> = {
  locked: 'This session is locked — finish the one before it first.',
  incomplete: 'Finish every working set first.',
  not_found: 'Session not found.',
  session_complete: 'Session is complete — only logged sets can be edited.',
  cannot_untick: 'Completed sets can’t be unticked.',
  active_program_exists: 'A program is already running.',
  swap_not_allowed: 'Swap not allowed here.',
  not_started: 'Tap Start to begin this session.',
};

export function ruleMessage(e: unknown): string {
  return e instanceof LocalRuleError ? RULE_MESSAGES[e.code] : 'Something went wrong';
}

interface Props {
  sessionId: string;
  userId: string;
  /** Read-only exercise list (future sessions). */
  preview?: boolean;
  onCompleted?: () => void;
}

export default function SessionLogger({ sessionId, userId, preview = false, onCompleted }: Props) {
  const bundle = useSessionBundle(sessionId);
  if (bundle === undefined) return <div className="h-40" aria-busy="true" />;
  if (bundle === null) return <p className="text-text3 text-sm">Session not found.</p>;
  return <Logger bundle={bundle} userId={userId} preview={preview} onCompleted={onCompleted} />;
}

function Logger({ bundle, userId, preview, onCompleted }: { bundle: SessionBundle; userId: string; preview: boolean; onCompleted?: () => void }) {
  const { session, items } = bundle;
  // up_next stays read-only until Start: typing into a set never starts a session.
  const mode: LoggerMode =
    preview || session.status === 'locked' || session.status === 'up_next' ? 'preview' : session.status === 'complete' ? 'complete' : 'active';
  const canStart = !preview && session.status === 'up_next';
  const running = !preview && session.status === 'in_progress';
  const exerciseIds = useMemo(() => [...new Set(items.map((i) => i.se.exercise_id))], [items]);
  const lastWeights = useLastWeights(exerciseIds, session.id) ?? {};
  const missing = missingWorkingSets(items.map((i) => i.se), items.flatMap((i) => i.logs));
  const [busy, setBusy] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const loggedSets = items.reduce((n, i) => n + i.logs.filter((l) => l.done || l.weight_kg !== null || l.reps !== null || l.seconds !== null).length, 0);

  // "Finish later" pauses locally: active-time timer, no wake lock, rest cleared.
  const pauseStored = usePause(session.id);
  const pause = effectivePause(pauseStored, session.started_at);
  const paused = running && isPaused(pause);
  const workingTotal = items.reduce((n, i) => n + i.se.sets, 0);
  const workingDone = items.reduce((n, i) => n + new Set(i.logs.filter((l) => l.done && l.set_index < i.se.sets).map((l) => l.set_index)).size, 0);

  useWakeLock(running && !paused);

  // Warm-up / cool-down: guidance only (localStorage ticks, never logged, never
  // part of completion). Ramp-up follows the first lift's prefilled weight.
  const routineReadOnly = preview || session.status === 'locked';
  const anyWorkingDone = items.some((i) => i.logs.some((l) => l.done && l.set_index < i.se.sets));
  const openInput = { readOnly: routineReadOnly, status: session.status, anyWorkingDone, allWorkingDone: missing === 0 };
  const warmup = routineItems(session.template_key, 'warmup');
  const cooldown = routineItems(session.template_key, 'cooldown');
  const first = items[0];
  const ramp = first
    ? {
        exerciseName: first.exercise?.name ?? first.se.exercise_id,
        sets: rampUpSets(prefillWeight(lastWeights[first.se.exercise_id] ?? null, session.is_deload, first.se.target_kg), {
          barKg: first.exercise && BAR_EQUIPMENT.has(first.exercise.equipment) ? BAR_KG : 0,
        }),
      }
    : null;

  const save = (sessionExerciseId: string) => async (setIndex: number, patch: SetPatch) => {
    // Logging while paused means you're back: resume the timer.
    if (paused) await resumeSession(getDb(), session.id, session.started_at);
    return saveSet(getDb(), userId, { sessionExerciseId, setIndex, patch }).catch((e) => {
      throw new Error(ruleMessage(e));
    });
  };

  async function pauseNow() {
    await pauseSession(getDb(), session.id, session.started_at);
    stopRestTimer();
    setStopOpen(false);
    toast('Paused — resume any time');
  }

  async function resumeNow() {
    await resumeSession(getDb(), session.id, session.started_at);
  }

  const onTicked = (rest: number, exerciseDone: boolean) => {
    if (exerciseDone) sound.nextExercise();
    else sound.setDone();
    startRestTimer(rest);
  };

  async function start() {
    setBusy(true);
    try {
      sound.start();
      await startSession(getDb(), userId, session.id);
    } catch (e) {
      toast(ruleMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    try {
      await resetSession(getDb(), userId, session.id);
      await clearPause(getDb(), session.id);
      stopRestTimer();
      setStopOpen(false);
      toast(`${dayInfo(session).label} reset — start it when you're ready`);
    } catch (e) {
      toast(ruleMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function complete() {
    setBusy(true);
    try {
      const r = await completeSession(getDb(), userId, session.id);
      await clearPause(getDb(), session.id);
      sound.sessionComplete();
      stopRestTimer();
      toast(r.programComplete ? 'Program complete!' : `${dayInfo(session).label} complete`);
      setStopOpen(false);
      onCompleted?.();
    } catch (e) {
      toast(ruleMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {canStart && (
        <button
          onClick={() => void start()}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-4 mb-3 rounded-xl font-condensed text-xl font-black bg-accent text-bg active:scale-[0.99] transition-transform disabled:opacity-60"
        >
          <Play size={20} fill="currentColor" /> Start Day {dayInfo(session).day}
        </button>
      )}

      {running && (
        <SessionBar
          pause={pause}
          paused={paused}
          done={workingDone}
          total={workingTotal}
          onResume={() => void resumeNow()}
          onStop={() => setStopOpen(true)}
        />
      )}

      {stopOpen && (
        <StopSheet
          missing={missing}
          loggedSets={loggedSets}
          busy={busy}
          onComplete={() => void complete()}
          onReset={() => void reset()}
          onPause={() => void pauseNow()}
          onClose={() => setStopOpen(false)}
        />
      )}

      {warmup.length > 0 && (
        <RoutineCard
          kind="warmup"
          sessionId={session.id}
          items={warmup}
          ramp={ramp}
          minutes={routineMinutes(warmup, (ramp?.sets.length ?? 0) * RAMP_SET_S)}
          defaultOpen={defaultRoutineOpen('warmup', openInput)}
          readOnly={routineReadOnly}
        />
      )}

      {mode === 'preview' ? (
        // Before Start (or a locked preview): one compact list, not a screen of empty cards.
        <section aria-label="Exercises" className="bg-bg2 border border-border rounded-[10px] mb-3 divide-y divide-border">
          {items.map((item) => {
            const name = item.exercise?.name ?? item.se.exercise_id;
            const kg = prefillWeight(lastWeights[item.se.exercise_id] ?? null, session.is_deload, item.se.target_kg);
            return (
              <div key={item.se.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{name}</div>
                  <div className="text-xs text-text3">
                    {item.se.sets} × {item.se.rep_lo}–{item.se.rep_hi}
                    {item.exercise?.is_timed ? ' s' : ''}
                    {kg !== null ? ` · ${kg} kg` : ''}
                  </div>
                </div>
                <VideoButton videoKey={item.se.exercise_id} name={name} />
              </div>
            );
          })}
        </section>
      ) : (
        items.map((item) => (
        <ExerciseBlock
          key={item.se.id}
          item={item}
          mode={mode}
          isDeload={session.is_deload}
          lastWeight={lastWeights[item.se.exercise_id] ?? null}
          onSave={save(item.se.id)}
          onTicked={onTicked}
        />
        ))
      )}

      {session.cardio_target && (
        <label className={`flex items-center gap-3 bg-bg2 border border-border rounded-[10px] p-3.5 mb-3 ${mode === 'preview' ? 'opacity-60' : ''}`}>
          <Bike size={16} className="text-energy flex-shrink-0" />
          <span className="flex-1 text-sm">
            {session.cardio_target}
            {session.cardio_duration_s ? (
              <span className="text-text3 text-xs ml-1">
                · watch: {Math.round(session.cardio_duration_s / 60)} min{session.cardio_avg_hr ? `, ${session.cardio_avg_hr} bpm` : ''}
              </span>
            ) : null}
          </span>
          <input
            type="checkbox"
            className="w-5 h-5 accent-accent"
            checked={session.cardio_done}
            disabled={mode === 'preview'}
            onChange={(e) => void updateSessionFields(getDb(), session.id, { cardio_done: e.target.checked }).catch((err) => toast(ruleMessage(err)))}
            aria-label="Cardio done"
          />
        </label>
      )}

      {cooldown.length > 0 && (
        <RoutineCard
          kind="cooldown"
          sessionId={session.id}
          items={cooldown}
          minutes={routineMinutes(cooldown)}
          defaultOpen={defaultRoutineOpen('cooldown', openInput)}
          readOnly={routineReadOnly}
        />
      )}

      {mode !== 'preview' && (
        <textarea
          key={session.updated_at}
          defaultValue={session.notes ?? ''}
          placeholder="Session notes"
          aria-label="Session notes"
          rows={2}
          onBlur={(e) => {
            const v = e.target.value.trim() || null;
            if (v !== session.notes) void updateSessionFields(getDb(), session.id, { notes: v }).catch((err) => toast(ruleMessage(err)));
          }}
          className="w-full bg-bg2 border border-border rounded-[10px] p-3 text-sm mb-3 outline-none focus:border-accent"
        />
      )}

      {mode === 'active' && (
        <button
          onClick={() => void complete()}
          disabled={busy || missing > 0}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-condensed text-lg font-bold bg-accent text-bg disabled:bg-bg3 disabled:text-text3 transition-colors"
        >
          <CheckCircle2 size={18} />
          {missing > 0 ? `${missing} working set${missing === 1 ? '' : 's'} to go` : 'Complete session'}
        </button>
      )}
    </div>
  );
}

function formatElapsed(ms: number): string {
  const t = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Sticky bar while a session runs: active training time (survives reloads and
 * excludes paused time), sets done, the coach, and Stop. Paused: Resume.
 */
function SessionBar({
  pause,
  paused,
  done,
  total,
  onResume,
  onStop,
}: {
  pause: PauseState;
  paused: boolean;
  done: number;
  total: number;
  onResume: () => void;
  onStop: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [paused]);
  const active = activeMs(pause, now);
  return (
    <div className="sticky top-[57px] z-30 -mx-4 px-4 py-2 mb-3 bg-bg/95 backdrop-blur border-b border-accent/15 flex items-center gap-2">
      {paused ? <Pause size={14} className="text-warn flex-shrink-0" aria-hidden /> : <span className="w-2 h-2 rounded-full bg-accent animate-pulse flex-shrink-0" aria-hidden />}
      <div className="min-w-0">
        <div className="text-xs font-bold uppercase tracking-widest text-text2 leading-none">{paused ? 'Paused' : 'In session'}</div>
        <div className="flex items-baseline gap-2">
          <span className="font-condensed text-xl font-black tabular-nums" aria-label="Session time" role="timer">
            {formatElapsed(active)}
          </span>
          <span className="text-xs text-text3 tabular-nums">
            {done}/{total} sets
          </span>
        </div>
      </div>
      <button onClick={openCoach} aria-label="Open AI coach" className="ml-auto w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-lg text-accent">
        <Sparkles size={18} />
      </button>
      {paused ? (
        <>
          <button onClick={onStop} aria-label="Stop" className="h-11 w-11 flex-shrink-0 flex items-center justify-center rounded-lg text-text2">
            <Square size={13} fill="currentColor" />
          </button>
          <button onClick={onResume} className="h-11 flex-shrink-0 flex items-center gap-1.5 px-4 rounded-lg bg-accent text-bg text-sm font-bold active:scale-95">
            <Play size={13} fill="currentColor" /> Resume
          </button>
        </>
      ) : (
        <button onClick={onStop} className="h-11 flex-shrink-0 flex items-center gap-1.5 px-4 rounded-lg bg-bg3 border border-border text-sm font-bold active:scale-95">
          <Square size={13} fill="currentColor" /> Stop
        </button>
      )}
    </div>
  );
}

/**
 * Stop: complete when every working set is done; otherwise pause (finish later)
 * or reset an accidental start — never skip.
 */
function StopSheet({
  missing,
  loggedSets,
  busy,
  onComplete,
  onReset,
  onPause,
  onClose,
}: {
  missing: number;
  loggedSets: number;
  busy: boolean;
  onComplete: () => void;
  onReset: () => void;
  onPause: () => void;
  onClose: () => void;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus the first action on open, Escape closes (not mid-action), Tab stays
  // inside, and focus returns to what opened it (the Stop button).
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
    return () => opener?.focus?.();
  }, []);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !busy) {
      e.stopPropagation();
      onClose();
    } else if (e.key === 'Tab') {
      const items = [...(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={() => !busy && onClose()} onKeyDown={onKeyDown}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stop-title"
        className="w-full max-w-app bg-bg1 border-t border-border rounded-t-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="stop-title" className="font-condensed text-2xl font-black">Stop session?</h3>
        {missing === 0 ? (
          <>
            <p className="text-sm text-text2">Every working set is done.</p>
            <button disabled={busy} onClick={onComplete} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-condensed text-lg font-bold bg-accent text-bg disabled:opacity-60">
              <CheckCircle2 size={18} /> Complete session
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-text2">
              {missing} working set{missing === 1 ? '' : 's'} left. Sessions can&apos;t be skipped — finish later, or reset if you started by accident.
            </p>
            <button disabled={busy} onClick={onPause} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold bg-bg3 border border-border disabled:opacity-60">
              <Pause size={16} /> Finish later
            </button>
          </>
        )}
        {missing > 0 &&
          (confirmReset || loggedSets === 0 ? (
            <button disabled={busy} onClick={onReset} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold bg-danger/15 text-danger border border-danger/40 disabled:opacity-60">
              <RotateCcw size={16} />
              {loggedSets === 0 ? 'Reset — nothing logged yet' : `Yes, discard ${loggedSets} logged set${loggedSets === 1 ? '' : 's'} and reset`}
            </button>
          ) : (
            <button disabled={busy} onClick={() => setConfirmReset(true)} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-danger">
              <RotateCcw size={14} /> Reset session (started by accident)
            </button>
          ))}
        <button onClick={onClose} className="w-full py-2 text-sm text-text3">
          Keep going
        </button>
      </div>
    </div>
  );
}
