'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Watch } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { toast } from '../shared/Toast';

/**
 * Garmin Connect (Personal API) settings. Talks only to the Garmin track's
 * HTTP contract — /api/garmin/connect (GET/POST/DELETE) and /api/garmin/sync —
 * plus the `garmin_activities` review tray (match_status = 'review').
 */
interface GarminStatus {
  configured: boolean;
  connected: boolean;
  keyLast4: string | null;
  keyExpiresAt: string | null;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  missingEnv?: string[];
}

interface ReviewActivity {
  garmin_activity_id: number;
  name: string | null;
  type: string;
  start_time: string;
  unmatched_sets: unknown[];
}

const EXPIRY_OPTIONS = [30, 90, 180, 365] as const;
const DAY = 86_400_000;

export default function GarminSection() {
  const [status, setStatus] = useState<GarminStatus | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<ReviewActivity[]>([]);
  const keyRef = useRef<HTMLInputElement>(null);
  const [expires, setExpires] = useState<(typeof EXPIRY_OPTIONS)[number]>(365);
  const db = useMemo(() => createSupabaseClient(), []);

  const load = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const res = await fetch('/api/garmin/connect', { cache: 'no-store' });
      if (res.status === 503) return setNotConfigured(true);
      if (res.ok) setStatus(await res.json());
    } catch {
      /* offline */
    }
    const { data } = await db
      .from('garmin_activities')
      .select('garmin_activity_id, name, type, start_time, unmatched_sets')
      .eq('match_status', 'review')
      .order('start_time', { ascending: false })
      .limit(20);
    setReview((data as ReviewActivity[] | null) ?? []);
  }, [db]);

  useEffect(() => {
    void load();
  }, [load]);

  async function connect() {
    const apiKey = keyRef.current?.value.trim();
    if (!apiKey) return toast('Paste your Garmin API key');
    setBusy(true);
    try {
      const res = await fetch('/api/garmin/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, expiresInDays: expires }),
      });
      if (res.status === 503) setNotConfigured(true);
      else if (res.ok) {
        setStatus(await res.json());
        if (keyRef.current) keyRef.current.value = '';
        toast('Garmin connected');
      } else toast('Garmin rejected that key');
    } catch {
      toast('You’re offline');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await fetch('/api/garmin/connect', { method: 'DELETE' });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setBusy(true);
    try {
      const res = await fetch('/api/garmin/sync', { method: 'POST' });
      toast(res.ok ? 'Garmin synced' : 'Garmin sync failed');
      await load();
    } catch {
      toast('You’re offline');
    } finally {
      setBusy(false);
    }
  }

  async function dismiss(id: number) {
    await db.from('garmin_activities').update({ unmatched_sets: [], match_status: 'matched', updated_at: new Date().toISOString() }).eq('garmin_activity_id', id);
    setReview((r) => r.filter((a) => a.garmin_activity_id !== id));
  }

  const daysLeft = status?.keyExpiresAt ? Math.ceil((new Date(status.keyExpiresAt).getTime() - Date.now()) / DAY) : null;

  return (
    <section className="bg-bg2 border border-border rounded-card p-4 mb-3">
      <h3 className="text-[12px] font-black uppercase tracking-widest text-text2 mb-3 flex items-center gap-1.5">
        <Watch size={13} /> Garmin
      </h3>

      {notConfigured || status?.configured === false ? (
        <p className="text-xs text-text3">
          Garmin sync isn’t configured on the server yet{status?.missingEnv?.length ? ` (missing ${status.missingEnv.join(', ')})` : ''}.
        </p>
      ) : !status ? (
        <p className="text-xs text-text3">Connect when online to see Garmin status.</p>
      ) : status.connected ? (
        <div className="space-y-2">
          <div className="text-sm">
            Connected · key ••••{status.keyLast4}
            {status.lastSyncedAt && (
              <span className="text-text3 text-xs block">
                Last sync {new Date(status.lastSyncedAt).toLocaleString()}
                {status.lastSyncStatus && status.lastSyncStatus !== 'ok' ? ` (${status.lastSyncStatus})` : ''}
              </span>
            )}
          </div>
          {daysLeft !== null && daysLeft <= 7 && (
            <div className="text-xs text-warn bg-warn/5 border border-warn/20 rounded-lg p-2">
              {daysLeft <= 0 ? 'Your Garmin API key has expired.' : `Your Garmin API key expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`} Create a
              new one on Garmin Connect and paste it below.
            </div>
          )}
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => void syncNow()} className="px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/30 text-accent text-sm font-bold">
              Sync now
            </button>
            <button disabled={busy} onClick={() => void disconnect()} className="px-3 py-1.5 rounded-lg bg-bg3 border border-border text-sm">
              Disconnect
            </button>
          </div>
        </div>
      ) : null}

      {status && status.configured !== false && !notConfigured && (!status.connected || (daysLeft !== null && daysLeft <= 7)) && (
        <div className="mt-3 space-y-2">
          <input
            ref={keyRef}
            type="password"
            autoComplete="off"
            placeholder="Garmin Personal API key"
            aria-label="Garmin Personal API key"
            className="w-full bg-bg3 border border-border rounded-lg text-sm px-3 py-2 outline-none focus:border-accent"
          />
          <div className="flex gap-2 items-center">
            <select
              value={expires}
              onChange={(e) => setExpires(Number(e.target.value) as (typeof EXPIRY_OPTIONS)[number])}
              className="bg-bg3 border border-border rounded-lg text-sm px-2 py-1.5"
              aria-label="Key expiry"
            >
              {EXPIRY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  Expires in {d} days
                </option>
              ))}
            </select>
            <button disabled={busy} onClick={() => void connect()} className="px-3 py-1.5 rounded-lg bg-accent text-bg text-sm font-bold">
              Connect
            </button>
          </div>
        </div>
      )}

      {review.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-bold text-warn mb-1">From watch, needs review</div>
          <ul className="space-y-1.5">
            {review.map((a) => (
              <li key={a.garmin_activity_id} className="flex items-center justify-between text-xs bg-bg3 rounded-lg px-2.5 py-2">
                <span>
                  {a.name ?? a.type} · {new Date(a.start_time).toLocaleDateString()} · {a.unmatched_sets.length} unmatched set
                  {a.unmatched_sets.length === 1 ? '' : 's'}
                </span>
                <button onClick={() => void dismiss(a.garmin_activity_id)} className="text-text3 underline">
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
