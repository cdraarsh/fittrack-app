'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Bike } from 'lucide-react';
import { getDb } from '@/lib/local/db';
import { completeSession, saveSet, updateSessionFields, LocalRuleError, type SetPatch } from '@/lib/local/actions';
import { useLastWeights, useSessionBundle, type SessionBundle } from '@/lib/local/hooks';
import { missingWorkingSets } from '@/lib/program';
import ExerciseBlock, { type LoggerMode } from './ExerciseBlock';
import { startRestTimer } from '../shared/RestTimer';
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
  const mode: LoggerMode = preview || session.status === 'locked' ? 'preview' : session.status === 'complete' ? 'complete' : 'active';
  const exerciseIds = useMemo(() => [...new Set(items.map((i) => i.se.exercise_id))], [items]);
  const lastWeights = useLastWeights(exerciseIds, session.id) ?? {};
  const missing = missingWorkingSets(items.map((i) => i.se), items.flatMap((i) => i.logs));
  const [busy, setBusy] = useState(false);

  useWakeLock(session.status === 'in_progress');

  const save = (sessionExerciseId: string) => (setIndex: number, patch: SetPatch) =>
    saveSet(getDb(), userId, { sessionExerciseId, setIndex, patch }).catch((e) => {
      throw new Error(ruleMessage(e));
    });

  const onTicked = (rest: number, exerciseDone: boolean) => {
    if (exerciseDone) sound.nextExercise();
    else sound.setDone();
    startRestTimer(rest);
  };

  async function complete() {
    setBusy(true);
    try {
      const r = await completeSession(getDb(), userId, session.id);
      sound.sessionComplete();
      toast(r.programComplete ? 'Program complete!' : `Day ${session.seq} complete`);
      onCompleted?.();
    } catch (e) {
      toast(ruleMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {items.map((item) => (
        <ExerciseBlock
          key={item.se.id}
          item={item}
          mode={mode}
          isDeload={session.is_deload}
          lastWeight={lastWeights[item.se.exercise_id] ?? null}
          onSave={save(item.se.id)}
          onTicked={onTicked}
        />
      ))}

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
