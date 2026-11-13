/**
 * Adversarial r4: Settings › Reminders (swReady timeout, sameKey) and the coach cap field.
 * A FAILING test = a defect.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const updateSettings = vi.fn(async (..._a: unknown[]) => ({}));
const toastMock = vi.fn();
const settings = {
  user_id: 'owner', preferred_days: [1, 2, 4, 5], units: 'kg', timezone: 'UTC', unlock_rule: 'next_calendar_day',
  sound_enabled: true, sound_volume: 0.8, coach_daily_cap: 20, created_at: '', updated_at: '',
};
vi.mock('@/lib/local/hooks', () => ({
  useLocalUserId: () => 'owner',
  useSettings: () => settings,
  requestSync: vi.fn(async () => {}),
  useOutboxCounts: () => ({ pending: 0, failed: [] }),
  useSyncStatus: () => ({ state: 'idle', lastError: null, lastSyncedAt: null }),
}));
vi.mock('@/lib/local/actions', () => ({ updateSettings: (...a: unknown[]) => updateSettings(...a) }));
vi.mock('@/lib/local/db', () => ({ getDb: () => ({}) }));
vi.mock('@/components/settings/GarminSection', () => ({ default: () => null }));
vi.mock('@/components/workout/sound', () => ({ sound: { test: vi.fn() } }));
vi.mock('@/components/shared/Toast', async (orig) => ({ ...(await orig<object>()), toast: (...a: unknown[]) => toastMock(...a) }));

import SettingsPage from '@/app/(app)/settings/page';

// A real-shaped VAPID public key (65 bytes, base64url, no padding).
const KEY_BYTES = new Uint8Array(65).map((_, i) => (i * 37 + 4) & 0xff);
KEY_BYTES[0] = 4;
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const KEY = b64url(KEY_BYTES);

function fakeSW(existing: { applicationServerKey: ArrayBuffer | null } | null) {
  const unsubscribe = vi.fn(async () => true);
  const sub = existing && { options: existing, unsubscribe, toJSON: () => ({ endpoint: 'https://web.push.apple.com/x', keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) } }) };
  const subscribe = vi.fn(async () => ({ options: { applicationServerKey: KEY_BYTES.buffer }, unsubscribe: vi.fn(), toJSON: () => ({}) }));
  const reg = { pushManager: { getSubscription: vi.fn(async () => sub), subscribe } };
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve(reg) } });
  return { unsubscribe, subscribe };
}

beforeEach(() => {
  updateSettings.mockClear();
  toastMock.mockClear();
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = KEY;
  (globalThis as unknown as { Notification: unknown }).Notification = { permission: 'granted', requestPermission: async () => 'granted' };
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
});

async function clickTurnOn() {
  const btn = await screen.findByRole('button', { name: 'Turn on' });
  await act(async () => {
    fireEvent.click(btn);
  });
  await act(async () => {});
}

describe('Settings › Reminders › sameKey', () => {
  it('holds: same key (ArrayBuffer vs base64url) keeps the subscription', async () => {
    const sw = fakeSW({ applicationServerKey: KEY_BYTES.buffer });
    // state shows "on" when a sub exists; force the enable() path by rendering with no sub first is not needed:
    // call enable() through "Turn on" after making getSubscription report null for the initial refresh.
    render(<SettingsPage />);
    await screen.findByRole('button', { name: 'Turn off' });
    expect(sw.unsubscribe).not.toHaveBeenCalled();
  });

  it('holds: enable() with a same-key sub does not re-subscribe; null key (Safari) is kept; padded env key matches', async () => {
    for (const [existingKey, envKey] of [
      [KEY_BYTES.buffer, KEY],
      [null, KEY],
      [KEY_BYTES.buffer, KEY + '='],
    ] as const) {
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = envKey;
      const sw = fakeSW({ applicationServerKey: existingKey });
      // Pretend the browser had no sub at refresh() but has one at enable() time: easiest is
      // Notification.permission 'default' → initial state comes from getSubscription anyway, so
      // drive enable() directly by rendering and clicking once the "off" state is shown.
      const reg = (await (navigator.serviceWorker as unknown as { ready: Promise<{ pushManager: { getSubscription: ReturnType<typeof vi.fn> } }> }).ready);
      const real = reg.pushManager.getSubscription.getMockImplementation()!;
      reg.pushManager.getSubscription.mockImplementationOnce(async () => null).mockImplementation(real);
      const r = render(<SettingsPage />);
      await clickTurnOn();
      expect(sw.unsubscribe, String(envKey)).not.toHaveBeenCalled();
      expect(sw.subscribe).not.toHaveBeenCalled();
      r.unmount();
    }
  });

  it('holds: a different key → unsubscribe + resubscribe with the current key', async () => {
    const other = KEY_BYTES.slice();
    other[10] ^= 1;
    const sw = fakeSW({ applicationServerKey: other.buffer });
    const reg = (await (navigator.serviceWorker as unknown as { ready: Promise<{ pushManager: { getSubscription: ReturnType<typeof vi.fn> } }> }).ready);
    const real = reg.pushManager.getSubscription.getMockImplementation()!;
    reg.pushManager.getSubscription.mockImplementationOnce(async () => null).mockImplementation(real);
    render(<SettingsPage />);
    await clickTurnOn();
    expect(sw.unsubscribe).toHaveBeenCalled();
    expect(sw.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: KEY });
  });
});

describe('Settings › Reminders › no worker', () => {
  it('"no-worker" is told apart from "off": the card does not offer a plain "Turn on" that only asks for permission and then fails', async () => {
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: new Promise(() => {}) } });
    (globalThis as unknown as { Notification: unknown }).Notification = { permission: 'default', requestPermission: vi.fn(async () => 'granted') };
    render(<SettingsPage />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1100));
    });
    // The new 'no-worker' state has no branch in the JSX: it renders exactly like 'off'.
    expect(screen.queryByRole('button', { name: 'Turn on' })).toBeNull();
  });
});

describe('Settings › coach cap', () => {
  it('holds: leading zeros, spaces, 100 ok; 101, 0, "1 0", fullwidth refused with toast', async () => {
    render(<SettingsPage />);
    const input = screen.getByLabelText('Coach daily message cap') as HTMLInputElement;
    const blur = async (v: string) => {
      fireEvent.change(input, { target: { value: v } });
      await act(async () => {
        fireEvent.blur(input);
      });
    };
    await blur(' 007 ');
    expect((updateSettings.mock.calls.at(-1)?.[2] as { coach_daily_cap: number }).coach_daily_cap).toBe(7);
    await blur('100');
    expect((updateSettings.mock.calls.at(-1)?.[2] as { coach_daily_cap: number }).coach_daily_cap).toBe(100);
    const n = updateSettings.mock.calls.length;
    for (const bad of ['101', '0', '1 0', '５０', '-3', '1e2']) await blur(bad);
    expect(updateSettings.mock.calls.length).toBe(n);
    expect(toastMock).toHaveBeenCalledTimes(6);
    expect(input.value).toBe('20');
  });
});
