'use client';

import { useEffect, useMemo, useState } from 'react';
import Spinner from '@/components/app/Spinner';
import GarminSection from '@/components/settings/GarminSection';
import { toast } from '@/components/shared/Toast';
import { sound } from '@/components/workout/sound';
import { getDb } from '@/lib/local/db';
import { updateSettings } from '@/lib/local/actions';
import { requestSync, useLocalUserId, useOutboxCounts, useSettings, useSyncStatus } from '@/lib/local/hooks';
import type { UserSettings } from '@/lib/program/types';
import { describeOp, humanizeError, refusalReason } from '@/lib/ui/errors';
import type { OutboxOp } from '@/lib/local/db';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-bg2 border border-border rounded-card p-4 mb-3">
      <h3 className="text-[12px] font-black uppercase tracking-widest text-text2 mb-3">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div>
        <div className="text-sm font-semibold">{label}</div>
        {hint && <div className="text-xs text-text3">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const userId = useLocalUserId();
  const settings = useSettings(userId);
  if (userId === undefined || !settings) return <Spinner />;
  if (!userId) return null;
  return <SettingsForm userId={userId} settings={settings} />;
}

function SettingsForm({ userId, settings }: { userId: string; settings: UserSettings }) {
  const save = (patch: Partial<UserSettings>) => void updateSettings(getDb(), userId, patch);
  const zones = useMemo(() => {
    try {
      return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
    } catch {
      return [];
    }
  }, []);

  return (
    <div>
      <h2 className="font-condensed text-2xl font-black mb-3">Settings</h2>

      <Card title="Training">
        <Row label="Next session opens" hint="After you complete a session">
          <select
            value={settings.unlock_rule}
            onChange={(e) => save({ unlock_rule: e.target.value as UserSettings['unlock_rule'] })}
            className="bg-bg3 border border-border rounded-lg text-sm px-2 py-1.5"
            aria-label="Unlock rule"
          >
            <option value="next_calendar_day">Next calendar day</option>
            <option value="immediate">Immediately</option>
          </select>
        </Row>
        <div className="py-2">
          <div className="text-sm font-semibold mb-1">Preferred training days</div>
          <div className="text-xs text-text3 mb-2">Used for the train/rest suggestion and reminders. Sessions never skip.</div>
          <div className="flex gap-1.5">
            {DAYS.map((d, i) => {
              const on = settings.preferred_days.includes(i);
              return (
                <button
                  key={d}
                  aria-pressed={on}
                  onClick={() =>
                    save({ preferred_days: on ? settings.preferred_days.filter((x) => x !== i) : [...settings.preferred_days, i].sort() })
                  }
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border ${on ? 'bg-accent/10 border-accent/35 text-accent' : 'bg-bg3 border-border text-text3'}`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
        <Row label="Time zone" hint="Decides when a new calendar day starts">
          {zones.length ? (
            <select
              value={settings.timezone}
              onChange={(e) => save({ timezone: e.target.value })}
              className="bg-bg3 border border-border rounded-lg text-sm px-2 py-1.5 max-w-[11rem]"
              aria-label="Time zone"
            >
              {(zones.includes(settings.timezone) ? zones : [settings.timezone, ...zones]).map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-text2">{settings.timezone}</span>
          )}
        </Row>
      </Card>

      <Card title="Sound cues">
        <Row label="Sound cues" hint="Set done, rest 3-2-1, go, next exercise, session done. Music keeps playing.">
          <input
            type="checkbox"
            className="w-5 h-5 accent-accent"
            checked={settings.sound_enabled}
            onChange={(e) => save({ sound_enabled: e.target.checked })}
            aria-label="Sound cues on"
          />
        </Row>
        <Row label="Volume">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            defaultValue={settings.sound_volume}
            disabled={!settings.sound_enabled}
            onPointerUp={(e) => save({ sound_volume: Number(e.currentTarget.value) })}
            onKeyUp={(e) => save({ sound_volume: Number(e.currentTarget.value) })}
            className="w-36 accent-accent"
            aria-label="Cue volume"
          />
        </Row>
        <button
          onClick={() => sound.test()}
          disabled={!settings.sound_enabled}
          className="mt-1 px-4 py-2 rounded-lg bg-bg3 border border-border text-sm font-semibold disabled:opacity-40"
        >
          Test sound
        </button>
      </Card>

      <Card title="AI coach">
        <Row label="Daily message cap" hint="Empty = no cap">
          <input
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={settings.coach_daily_cap ?? ''}
            onBlur={(e) => {
              const v = e.target.value.trim() === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0);
              if (v !== settings.coach_daily_cap) save({ coach_daily_cap: v });
            }}
            className="w-20 bg-bg3 border border-border rounded-lg text-sm font-semibold text-center py-1.5"
            aria-label="Coach daily message cap"
          />
        </Row>
      </Card>

      <GarminSection />

      <NotificationsCard />

      <SyncCard />
    </div>
  );
}

function SyncCard() {
  const status = useSyncStatus();
  const counts = useOutboxCounts();
  const [showFailed, setShowFailed] = useState(false);
  return (
    <Card title="Sync">
      <Row
        label={status.state === 'offline' ? 'Offline' : status.state === 'syncing' ? 'Syncing…' : status.state === 'error' ? 'Sync paused' : 'Up to date'}
        hint={status.lastSyncedAt ? `Last synced ${new Date(status.lastSyncedAt).toLocaleString()}` : 'Everything is saved on this phone first.'}
      >
        <button onClick={() => void requestSync()} className="px-3 py-1.5 rounded-lg bg-bg3 border border-border text-sm font-semibold">
          Sync now
        </button>
      </Row>
      <div className="text-xs text-text3">
        {counts?.pending ?? 0} change(s) waiting
        {counts?.failed.length ? (
          <>
            {' · '}
            <button className="text-danger underline" onClick={() => setShowFailed(!showFailed)}>
              {counts.failed.length} rejected by the server
            </button>
          </>
        ) : null}
      </div>
      {showFailed && counts?.failed.length ? <FailedList failed={counts.failed} /> : null}
      {status.lastError && status.state === 'error' && (
        <div className="text-xs text-text2 mt-1">
          {humanizeError(status.lastError)}
          <details className="mt-1 text-text3">
            <summary className="cursor-pointer">Details</summary>
            <code className="break-all">{status.lastError}</code>
          </details>
        </div>
      )}
    </Card>
  );
}

function FailedList({ failed }: { failed: OutboxOp[] }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <ul className="mt-2 space-y-1.5 text-xs text-text2">
      {failed.map((o) => (
        <li key={o.id}>
          {describeOp(o.payload)}: {refusalReason(o.last_error)}.
          {o.last_error && (
            <details className="text-text3">
              <summary className="cursor-pointer">Details</summary>
              <code className="break-all">{o.last_error}</code>
            </details>
          )}
        </li>
      ))}
      <li className="flex gap-3 pt-1">
        <button
          className="text-accent underline min-h-[44px]"
          onClick={() =>
            void getDb()
              .outbox.where('status')
              .equals('failed')
              .modify({ status: 'pending', attempts: 0 })
              .then(() => requestSync())
          }
        >
          Retry
        </button>
        {confirm ? (
          <button
            className="text-danger underline min-h-[44px]"
            onClick={() => void getDb().outbox.where('status').equals('failed').delete().then(() => requestSync())}
          >
            Yes, discard and reload from server
          </button>
        ) : (
          <button className="text-text2 underline min-h-[44px]" onClick={() => setConfirm(true)}>
            Discard…
          </button>
        )}
      </li>
    </ul>
  );
}

function NotificationsCard() {
  const [state, setState] = useState<'unsupported' | 'default' | 'granted' | 'denied'>('default');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) setState('unsupported');
    else setState(Notification.permission as 'default' | 'granted' | 'denied');
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      setState(permission as typeof state);
      if (permission !== 'granted') return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY });
      const res = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub.toJSON()) });
      toast(res.ok ? 'Reminders on' : 'Could not save reminders');
    } catch {
      toast('Could not enable notifications');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      await (await reg.pushManager.getSubscription())?.unsubscribe();
      await fetch('/api/push/subscribe', { method: 'DELETE' });
      toast('Reminders off');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Reminders">
      <Row label="Training-day reminder" hint="Web push on your preferred days. On iPhone, install the app to the Home Screen first.">
        {state === 'unsupported' ? (
          <span className="text-xs text-text3">Not supported here</span>
        ) : state === 'granted' ? (
          <button disabled={busy} onClick={() => void disable()} className="px-3 py-1.5 rounded-lg bg-bg3 border border-border text-sm">
            Turn off
          </button>
        ) : (
          <button
            disabled={busy || state === 'denied'}
            onClick={() => void enable()}
            className="px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/30 text-accent text-sm font-bold disabled:opacity-40"
          >
            {state === 'denied' ? 'Blocked' : 'Turn on'}
          </button>
        )}
      </Row>
    </Card>
  );
}
