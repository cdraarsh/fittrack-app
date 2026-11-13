'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Lock, PartyPopper, Play, Scale } from 'lucide-react';
import Spinner from '@/components/app/Spinner';
import DailyInsight from '@/components/app/DailyInsight';
import SessionLogger, { ruleMessage } from '@/components/workout/SessionLogger';
import { toast } from '@/components/shared/Toast';
import { getDb } from '@/lib/local/db';
import { saveBodyWeight, startProgram } from '@/lib/local/actions';
import { useActiveProgram, useBodyWeights, useLatestProgram, useLocalUserId, useProgramSessions, useProgress, useSettings, useSyncStatus } from '@/lib/local/hooks';
import { addDays, localDate } from '@/lib/program';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function weekdayIn(timeZone: string, d = new Date()): number {
  return WEEKDAYS.indexOf(new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(d));
}

function unlockLabel(date: string | null, timeZone: string): string {
  if (!date) return 'soon';
  const today = localDate(new Date(), timeZone);
  if (date <= today) return 'now';
  if (date === addDays(today, 1)) return 'tomorrow';
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function TodayPage() {
  const userId = useLocalUserId();
  const settings = useSettings(userId);
  const program = useActiveProgram(userId);
  const latest = useLatestProgram(userId);
  const sessions = useProgramSessions(program?.id);
  const tz = settings?.timezone ?? 'UTC';
  const progress = useProgress(sessions, settings?.unlock_rule ?? 'next_calendar_day', tz);
  const sync = useSyncStatus();
  const everSynced = useLiveQuery(async () => !!(await getDb().meta.get('last_synced_at')), [], undefined);
  const [starting, setStarting] = useState(false);

  if (userId === undefined || program === undefined || latest === undefined || !settings) return <Spinner />;

  async function start() {
    if (!userId) return;
    setStarting(true);
    try {
      await startProgram(getDb(), userId);
    } catch (e) {
      toast(ruleMessage(e));
    } finally {
      setStarting(false);
    }
  }

  // ── No active program: first run, or the last block is finished ──
  if (program === null) {
    const finished = latest?.status === 'complete';
    // Wait for the first pull so we don't start a second program, unless the
    // server can't be reached (offline, or the first sync failed).
    const canStart =
      everSynced || sync.state === 'offline' || sync.state === 'error' || (typeof navigator !== 'undefined' && !navigator.onLine);
    return (
      <div className="space-y-4">
        <div className="bg-bg2 border border-border rounded-card p-5 text-center">
          {finished ? <PartyPopper className="mx-auto text-accent mb-2" /> : <Play className="mx-auto text-accent mb-2" />}
          <h2 className="font-condensed text-2xl font-black mb-1">{finished ? 'Block complete' : 'Start your program'}</h2>
          <p className="text-text2 text-sm mb-4">
            {finished
              ? `All sessions of “${latest!.name}” are done. Start the next block when you’re ready.`
              : '16 weeks · 4 sessions a week · 64 numbered sessions. Each one unlocks when the one before it is done.'}
          </p>
          <button
            onClick={() => void start()}
            disabled={starting || !canStart}
            className="px-6 py-3 rounded-xl bg-accent text-bg font-bold disabled:opacity-40"
          >
            {!canStart ? 'Checking for your program…' : finished ? 'Start next block' : 'Start program'}
          </button>
        </div>
      </div>
    );
  }

  if (!sessions || !progress) return <Spinner />;
  const total = sessions.length;
  const preferred = settings.preferred_days.includes(weekdayIn(tz));
  const current = progress.current;
  const waiting = progress.waiting;

  return (
    <div className="space-y-4">
      <DailyInsight today={localDate(new Date(), tz)} />
      {current ? (
        <section aria-labelledby="up-next">
          <div className="mb-3">
            <div className="text-[11px] font-bold uppercase tracking-widest text-text3">
              Week {current.week} · {current.phase}
              {current.is_deload ? ' · Deload' : ''} · {current.seq}/{total}
            </div>
            <h2 id="up-next" className="font-condensed text-2xl font-black leading-tight">
              Day {current.seq} · {current.title} {current.status === 'in_progress' ? 'in progress' : 'is up next'}
            </h2>
            {current.status === 'up_next' && (
              <p className="text-xs text-text2 mt-1">
                {preferred ? 'Today is one of your training days.' : 'Not one of your usual training days — rest is fine too.'} Advice only.
              </p>
            )}
          </div>
          <SessionLogger sessionId={current.id} userId={userId} />
        </section>
      ) : waiting ? (
        <section className="space-y-3">
          <div className="bg-bg2 border border-border rounded-card p-4">
            <div className="flex items-center gap-2 text-text3 text-[11px] font-bold uppercase tracking-widest mb-1">
              <Lock size={12} /> Locked
            </div>
            <h2 className="font-condensed text-2xl font-black leading-tight">
              Day {waiting.seq} · {waiting.title}
            </h2>
            <p className="text-sm text-text2">
              Unlocks {unlockLabel(progress.unlocksOn, tz)}. Nice work on Day {waiting.seq - 1}.
            </p>
          </div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-text3">Preview</div>
          <SessionLogger sessionId={waiting.id} userId={userId} preview />
        </section>
      ) : (
        <div className="bg-bg2 border border-border rounded-card p-5 text-center">
          <PartyPopper className="mx-auto text-accent mb-2" />
          <h2 className="font-condensed text-2xl font-black">Program complete</h2>
          <p className="text-text2 text-sm">Every session is done — the next block will be offered here.</p>
        </div>
      )}

      <BodyWeightCard userId={userId} timeZone={tz} />
    </div>
  );
}

function BodyWeightCard({ userId, timeZone }: { userId: string; timeZone: string }) {
  const weights = useBodyWeights(userId);
  const today = localDate(new Date(), timeZone);
  const todays = weights?.find((w) => w.date === today);
  const last = weights?.[0];
  return (
    <form
      className="bg-bg2 border border-border rounded-card p-4 flex items-center gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const kg = parseFloat(new FormData(e.currentTarget).get('kg') as string);
        if (!Number.isFinite(kg) || kg <= 0 || kg >= 500) return toast('Enter a weight in kg');
        void saveBodyWeight(getDb(), userId, today, kg).then(() => toast('Bodyweight saved'));
      }}
    >
      <Scale size={18} className="text-info flex-shrink-0" />
      <div className="flex-1">
        <div className="text-sm font-semibold">Bodyweight</div>
        <div className="text-xs text-text3">{last ? `Last: ${last.kg} kg (${last.date})` : 'Log it in the morning'}</div>
      </div>
      <input
        key={todays?.updated_at ?? 'new'}
        name="kg"
        type="number"
        step="0.1"
        inputMode="decimal"
        defaultValue={todays?.kg}
        placeholder="kg"
        aria-label="Bodyweight in kg"
        className="w-20 bg-bg3 border border-border rounded-lg text-sm font-semibold text-center py-2 outline-none focus:border-accent"
      />
      <button className="px-3 py-2 rounded-lg bg-accent/10 border border-accent/30 text-accent text-sm font-bold">Save</button>
    </form>
  );
}
