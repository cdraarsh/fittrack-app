'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { Activity, CloudOff, HeartPulse, TrendingDown, TrendingUp, Watch } from 'lucide-react';
import Spinner from '@/components/app/Spinner';
import { getDb } from '@/lib/local/db';
import { useLocalUserId, useSettings } from '@/lib/local/hooks';
import { createSupabaseClient } from '@/lib/supabase';
import { liftProgress, type LiftPoint } from '@/lib/strength/lifts';
import { buildRecovery } from '@/lib/ai/stats';
import { localDate } from '@/lib/program';
import type { GarminDailyRow } from '@/lib/ai/types';
import { humanizeError } from '@/lib/ui/errors';

type Tab = 'lifts' | 'garmin' | 'recovery';
const TABS: { id: Tab; label: string }[] = [
  { id: 'lifts', label: 'Lifts' },
  { id: 'garmin', label: 'Garmin workouts' },
  { id: 'recovery', label: 'Recovery' },
];
const TAB_KEY = 'fittrack:strength-tab';

/** Strength data: lift progress (local, offline) and Garmin workouts / recovery (server). */
export default function StrengthPage() {
  const [tab, setTab] = useState<Tab>('lifts');
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TAB_KEY) as Tab | null;
      if (saved && TABS.some((t) => t.id === saved)) setTab(saved);
    } catch {
      /* storage blocked */
    }
  }, []);
  const choose = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* ignore */
    }
  };

  return (
    <div>
      <h2 className="font-condensed text-2xl font-black mb-3">Strength</h2>
      <div role="tablist" aria-label="Strength data" className="flex gap-1 p-1 mb-4 bg-bg2 border border-border rounded-xl">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => choose(t.id)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              const i = TABS.findIndex((x) => x.id === tab);
              const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
              choose(next.id);
              document.getElementById(`tab-${next.id}`)?.focus();
            }}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
              tab === t.id ? 'bg-accent text-bg' : 'text-text2 hover:text-text1'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'lifts' ? <LiftsTab /> : tab === 'garmin' ? <GarminTab /> : <RecoveryTab />}
      </div>
    </div>
  );
}

// ─── Lifts (local data, works offline) ────────────────────────────────────────

function LiftsTab() {
  const userId = useLocalUserId();
  const settings = useSettings(userId);
  const data = useLiveQuery(async () => {
    const db = getDb();
    const [exercises, sessions, sessionExercises, logs] = await Promise.all([
      db.exercises.toArray(),
      db.program_sessions.toArray(),
      db.session_exercises.toArray(),
      db.set_logs.filter((l) => l.done).toArray(),
    ]);
    return { exercises, sessions, sessionExercises, logs };
  }, []);
  const lifts = useMemo(
    () => (data ? liftProgress(data, localDate(new Date(), settings?.timezone ?? 'UTC')) : undefined),
    [data, settings?.timezone],
  );

  if (!lifts) return <Spinner />;
  if (lifts.length === 0) {
    return <Empty icon={<Activity size={20} />} text="No completed sets yet. Your lifts show up here after you log them." />;
  }
  return (
    <ul className="space-y-2">
      {lifts.map((l) => (
        <li key={l.exerciseId} className="bg-bg2 border border-border rounded-[10px] p-3.5">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{l.name}</div>
              <div className="text-xs text-text3 mt-0.5">
                Last {fmtDate(l.latest.date)}: {l.latest.topKg} kg × {l.latest.topReps} · {l.sessions} session{l.sessions === 1 ? '' : 's'}
              </div>
            </div>
            <div className="text-right">
              <div className="font-condensed text-xl font-black tabular-nums leading-none">{l.latest.e1rm}</div>
              <div className="text-xs text-text3 uppercase tracking-wider">est. 1RM kg</div>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <Sparkline points={l.trend} />
            <div className="text-xs text-text2 whitespace-nowrap">
              {l.change28 !== null ? (
                <span className={`inline-flex items-center gap-1 ${l.change28 >= 0 ? 'text-accent' : 'text-warn'}`}>
                  {l.change28 >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {l.change28 > 0 ? '+' : ''}
                  {l.change28} kg / 4 wk
                </span>
              ) : (
                <span className="text-text3">Best {l.best.e1rm} kg</span>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Sparkline({ points }: { points: LiftPoint[] }) {
  const pts = points.slice(-12);
  if (pts.length < 2) return <div className="flex-1 h-6" aria-hidden />;
  const vals = pts.map((p) => p.e1rm);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const d = pts.map((p, i) => `${(i / (pts.length - 1)) * 100},${22 - ((p.e1rm - min) / span) * 20}`).join(' ');
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="flex-1 h-6" role="img" aria-label={`Estimated 1RM trend, ${pts.length} sessions`}>
      <polyline points={d} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" className="text-accent" />
    </svg>
  );
}

// ─── Garmin (server data, needs a connection) ─────────────────────────────────

interface GarminActivity {
  garmin_activity_id: number;
  type: string | null;
  name: string | null;
  start_time: string;
  duration_s: number | null;
  avg_hr: number | null;
  match_status: string | null;
  matched_count: number | null;
}

type Load<T> = { state: 'loading' } | { state: 'offline' } | { state: 'error'; message: string } | { state: 'ok'; data: T };

/** Fetch from Supabase once on mount (online only). */
function useServer<T>(fetcher: (db: ReturnType<typeof createSupabaseClient>) => Promise<T>): Load<T> {
  const [load, setLoad] = useState<Load<T>>({ state: 'loading' });
  useEffect(() => {
    let cancelled = false;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setLoad({ state: 'offline' });
      return;
    }
    fetcher(createSupabaseClient())
      .then((data) => !cancelled && setLoad({ state: 'ok', data }))
      .catch((e) => !cancelled && setLoad({ state: 'error', message: e instanceof Error ? e.message : String(e) }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return load;
}

function useGarminConnected(): boolean | null {
  const [connected, setConnected] = useState<boolean | null>(null);
  useEffect(() => {
    fetch('/api/garmin/connect', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => setConnected(s ? !!s.connected : false))
      .catch(() => setConnected(null));
  }, []);
  return connected;
}

function GarminTab() {
  const connected = useGarminConnected();
  const load = useServer(async (db) => {
    const { data, error } = await db
      .from('garmin_activities')
      .select('garmin_activity_id, type, name, start_time, duration_s, avg_hr, match_status, matched_count')
      .order('start_time', { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);
    return ((data ?? []) as GarminActivity[]).filter((a) => /strength/i.test(a.type ?? ''));
  });

  if (load.state === 'loading') return <Spinner />;
  if (load.state === 'offline') return <OfflineNote />;
  if (load.state === 'error') return <Empty icon={<Watch size={20} />} text={`Couldn't load Garmin workouts. ${humanizeError(load.message) ?? ''}`} />;
  if (load.data.length === 0) {
    return (
      <Empty
        icon={<Watch size={20} />}
        text={connected === false ? 'Garmin isn’t connected yet.' : 'No strength workouts from your watch yet.'}
        action={connected === false ? { href: '/settings', label: 'Connect Garmin in Settings' } : undefined}
      />
    );
  }
  return (
    <ul className="space-y-2">
      {load.data.map((a) => (
        <li key={a.garmin_activity_id} className="bg-bg2 border border-border rounded-[10px] p-3.5 flex items-center gap-3">
          <Watch size={18} className="text-info flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{a.name || 'Strength workout'}</div>
            <div className="text-xs text-text3">
              {fmtDate(a.start_time)}
              {a.duration_s ? ` · ${Math.round(a.duration_s / 60)} min` : ''}
              {a.avg_hr ? ` · ${a.avg_hr} bpm avg` : ''}
            </div>
          </div>
          <MatchBadge status={a.match_status} count={a.matched_count} />
        </li>
      ))}
    </ul>
  );
}

function MatchBadge({ status, count }: { status: string | null; count: number | null }) {
  if (status === 'review') {
    return (
      <Link href="/settings" className="text-xs font-bold text-warn whitespace-nowrap">
        Needs review
      </Link>
    );
  }
  if (status === 'matched') return <span className="text-xs font-bold text-accent whitespace-nowrap">{count ?? 0} sets matched</span>;
  if (status === 'no_session') return <span className="text-xs text-text3 whitespace-nowrap">No session</span>;
  if (status === 'error') return <span className="text-xs text-danger whitespace-nowrap">Sync error</span>;
  return null;
}

// ─── Recovery (Garmin dailies vs 7- and 28-day baselines) ─────────────────────

const METRICS: { key: 'sleepH' | 'restingHr' | 'hrv' | 'bodyBattery' | 'stress'; label: string; unit: string; higherIsBetter: boolean }[] = [
  { key: 'sleepH', label: 'Sleep', unit: 'h', higherIsBetter: true },
  { key: 'restingHr', label: 'Resting HR', unit: 'bpm', higherIsBetter: false },
  { key: 'hrv', label: 'HRV', unit: 'ms', higherIsBetter: true },
  { key: 'bodyBattery', label: 'Body Battery', unit: '', higherIsBetter: true },
  { key: 'stress', label: 'Stress', unit: '', higherIsBetter: false },
];

function RecoveryTab() {
  const userId = useLocalUserId();
  const settings = useSettings(userId);
  const today = localDate(new Date(), settings?.timezone ?? 'UTC');
  const connected = useGarminConnected();
  const load = useServer(async (db) => {
    const { data, error } = await db
      .from('garmin_dailies')
      .select('date, sleep_s, resting_hr, hrv, body_battery, stress_avg, steps')
      .order('date', { ascending: false })
      .limit(35);
    if (error) throw new Error(error.message);
    return (data ?? []) as GarminDailyRow[];
  });

  if (load.state === 'loading') return <Spinner />;
  if (load.state === 'offline') return <OfflineNote />;
  if (load.state === 'error') return <Empty icon={<HeartPulse size={20} />} text={`Couldn't load recovery data. ${humanizeError(load.message) ?? ''}`} />;
  const rec = buildRecovery(load.data, today);
  if (!rec) {
    return (
      <Empty
        icon={<HeartPulse size={20} />}
        text={connected === false ? 'Garmin isn’t connected yet.' : 'No recovery data from your watch yet.'}
        action={connected === false ? { href: '/settings', label: 'Connect Garmin in Settings' } : undefined}
      />
    );
  }
  const steps = load.data.find((d) => d.date === rec.date)?.steps ?? null;
  const tone = rec.readiness === 'good' ? 'text-accent' : rec.readiness === 'moderate' ? 'text-warn' : 'text-danger';

  return (
    <div className="space-y-3">
      <div className="bg-bg2 border border-border rounded-[10px] p-4">
        <div className="text-xs font-bold uppercase tracking-widest text-text3">
          Readiness · {fmtDate(rec.date)}
          {rec.stale ? ' · not synced today' : ''}
        </div>
        <div className={`font-condensed text-3xl font-black capitalize ${tone}`}>{rec.readiness}</div>
        {rec.flags.length > 0 && <div className="text-xs text-text2 mt-1">{rec.flags.map(flagText).join(' · ')}</div>}
      </div>
      <table className="w-full text-sm bg-bg2 border border-border rounded-[10px] overflow-hidden">
        <caption className="sr-only">Latest Garmin recovery metrics against your 7- and 28-day averages</caption>
        <thead>
          <tr className="text-xs uppercase tracking-wider text-text3">
            <th scope="col" className="text-left font-bold px-3 py-2">Metric</th>
            <th scope="col" className="text-right font-bold px-2 py-2">Latest</th>
            <th scope="col" className="text-right font-bold px-2 py-2">7-day</th>
            <th scope="col" className="text-right font-bold px-3 py-2">28-day</th>
          </tr>
        </thead>
        <tbody>
          {METRICS.map((m) => {
            const v = rec.metrics[m.key];
            const worse =
              v.value !== null && v.avg28 !== null && (m.higherIsBetter ? v.value < v.avg28 * 0.95 : v.value > v.avg28 * 1.05);
            return (
              <tr key={m.key} className="border-t border-border">
                <th scope="row" className="text-left font-semibold px-3 py-2">{m.label}</th>
                <td className={`text-right tabular-nums px-2 py-2 ${worse ? 'text-warn' : ''}`}>{fmtNum(v.value, m.unit)}</td>
                <td className="text-right tabular-nums text-text2 px-2 py-2">{fmtNum(v.avg7, m.unit)}</td>
                <td className="text-right tabular-nums text-text2 px-3 py-2">{fmtNum(v.avg28, m.unit)}</td>
              </tr>
            );
          })}
          <tr className="border-t border-border">
            <th scope="row" className="text-left font-semibold px-3 py-2">Steps</th>
            <td className="text-right tabular-nums px-2 py-2">{steps === null ? '—' : steps.toLocaleString()}</td>
            <td className="px-2 py-2" />
            <td className="px-3 py-2" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function flagText(f: string): string {
  return (
    { hrv_below_baseline: 'HRV below your baseline', resting_hr_elevated: 'Resting HR up', short_sleep: 'Short sleep', low_body_battery: 'Low Body Battery' }[f] ??
    f.replace(/_/g, ' ')
  );
}

// ─── Shared bits ──────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
function fmtNum(v: number | null, unit: string): string {
  if (v === null) return '—';
  return `${Math.round(v * 10) / 10}${unit ? ` ${unit}` : ''}`;
}

function OfflineNote() {
  return <Empty icon={<CloudOff size={20} />} text="Garmin data needs a connection. Your lift progress works offline." />;
}

function Empty({ icon, text, action }: { icon: React.ReactNode; text: string; action?: { href: string; label: string } }) {
  return (
    <div className="bg-bg2 border border-border rounded-[10px] p-5 text-center text-sm text-text2">
      <div className="flex justify-center text-text3 mb-2">{icon}</div>
      <p>{text}</p>
      {action && (
        <Link href={action.href} className="inline-block mt-2 text-accent underline underline-offset-2 text-sm">
          {action.label}
        </Link>
      )}
    </div>
  );
}
