'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
        <Row label="Daily message cap" hint="1–100 a day. Empty = the maximum (100).">
          <input
            // text + numeric keypad: a number field reports "" for junk like "1e", indistinguishable from empty.
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            defaultValue={settings.coach_daily_cap ?? ''}
            onBlur={(e) => {
              const raw = e.target.value.trim();
              if (raw === '') {
                if (settings.coach_daily_cap !== null) save({ coach_daily_cap: null });
                return;
              }
              const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
              // Junk or out of range never silently turns the coach off: put the old value back.
              if (!Number.isInteger(n) || n < 1 || n > 100) {
                e.target.value = settings.coach_daily_cap === null ? '' : String(settings.coach_daily_cap);
                toast('Pick a cap from 1 to 100, or leave it empty for the maximum');
                return;
              }
              if (n !== settings.coach_daily_cap) save({ coach_daily_cap: n });
            }}
            className="w-20 h-11 bg-bg3 border border-border-strong rounded-lg text-base font-semibold text-center"
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

function sameKey(buf: ArrayBuffer | null, b64url: string): boolean {
  if (!buf) return true; // unknown (older browsers): keep it
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (const x of bytes) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === b64url.replace(/=+$/, '');
}

/** navigator.serviceWorker.ready never settles when no worker is active (dev, failed registration, private windows). */
async function swReady(ms = 1000): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

function NotificationsCard() {
  // On/off comes from the actual push subscription, not the permission: after
  // "Turn off" the permission stays granted, and a failed subscribe or save
  // must not show reminders as on.
  type State = 'loading' | 'unsupported' | 'no-worker' | 'denied' | 'off' | 'on';
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }
    try {
      const reg = await swReady();
      if (!reg) {
        setState('no-worker');
        return;
      }
      if (!reg.pushManager) {
        setState('unsupported');
        return;
      }
      setState((await reg.pushManager.getSubscription()) ? 'on' : 'off');
    } catch {
      setState('off');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast(permission === 'denied' ? 'Notifications are blocked for this app' : 'Notifications not allowed');
        return;
      }
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) {
        toast('Reminders aren’t set up on the server yet');
        return;
      }
      const reg = await swReady();
      if (!reg) {
        toast('The app’s background worker isn’t running — reopen the app and try again');
        return;
      }
      // Re-subscribe if an old subscription was made with a different server key
      // (pushes to it would fail with 403 forever).
      let sub = await reg.pushManager.getSubscription();
      if (sub && !sameKey(sub.options?.applicationServerKey ?? null, key)) {
        await sub.unsubscribe().catch(() => false);
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const res = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) {
        await sub.unsubscribe().catch(() => false); // don't look "on" when the server doesn't know
        toast('Could not save reminders');
        return;
      }
      toast('Reminders on');
    } catch {
      toast('Could not turn reminders on');
    } finally {
      await refresh();
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await swReady();
      await (await reg?.pushManager.getSubscription())?.unsubscribe();
      await fetch('/api/push/subscribe', { method: 'DELETE' }).catch(() => null); // offline: the cron drops it on 404/410
      toast('Reminders off');
    } catch {
      toast('Could not turn reminders off');
    } finally {
      await refresh();
      setBusy(false);
    }
  }

  return (
    <Card title="Reminders">
      <Row label="Morning reminder" hint="A morning push when a session is waiting. On iPhone, install the app to the Home Screen first.">
        {state === 'unsupported' ? (
          <span className="text-xs text-text3">Not supported here</span>
        ) : state === 'denied' ? (
          <span className="text-xs text-text3">Blocked in system settings</span>

        ) : state === 'on' ? (
          <button disabled={busy} onClick={() => void disable()} className="h-11 px-3 rounded-lg bg-bg3 border border-border text-sm">
            Turn off
          </button>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <button
              disabled={busy || state === 'loading'}
              onClick={() => void (state === 'no-worker' ? refresh() : enable())}
              className="h-11 px-3 rounded-lg bg-accent/10 border border-accent/30 text-accent text-sm font-bold disabled:opacity-40"
            >
              {state === 'no-worker' ? 'Try again' : 'Turn on'}
            </button>
            {state === 'no-worker' && <span className="text-xs text-text3 text-right">Open the installed app, then try again</span>}
          </div>
        )}
      </Row>
    </Card>
  );
}
