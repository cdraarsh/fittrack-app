/**
 * Adversarial whole-app pass: Settings edge states (reminders toggle on iOS,
 * coach cap input). A FAILING test = a defect.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const updateSettings = vi.fn(async () => ({}));
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
vi.mock('@/lib/local/actions', () => ({ updateSettings: (...a: unknown[]) => updateSettings(...(a as [])) }));
vi.mock('@/lib/local/db', () => ({ getDb: () => ({}) }));
vi.mock('@/components/settings/GarminSection', () => ({ default: () => null }));
vi.mock('@/components/workout/sound', () => ({ sound: { test: vi.fn() } }));

import SettingsPage from '@/app/(app)/settings/page';

let subscription: { unsubscribe: () => Promise<boolean>; toJSON: () => unknown } | null;
beforeEach(() => {
  updateSettings.mockClear();
  subscription = null;
  (globalThis as unknown as { Notification: unknown }).Notification = { permission: 'granted', requestPermission: async () => 'granted' };
  const reg = {
    pushManager: {
      getSubscription: async () => subscription,
      subscribe: async () => {
        subscription = { unsubscribe: async () => ((subscription = null), true), toJSON: () => ({ endpoint: 'https://p/x', keys: { p256dh: 'p', auth: 'a' } }) };
        return subscription;
      },
    },
  };
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve(reg) } });
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
});

describe('Settings › Reminders', () => {
  it('after "Turn off", reminders can be turned on again (permission stays "granted")', async () => {
    subscription = { unsubscribe: async () => ((subscription = null), true), toJSON: () => ({}) };
    render(<SettingsPage />);
    const off = await screen.findByRole('button', { name: 'Turn off' });
    await act(async () => {
      fireEvent.click(off);
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Turn on' })).not.toBeNull(), { timeout: 500 });
  });

  it('a granted permission with NO push subscription (subscribe or save failed) does not show reminders as on', async () => {
    subscription = null;
    render(<SettingsPage />);
    await act(async () => {});
    expect(screen.queryByRole('button', { name: 'Turn off' })).toBeNull();
  });
});

describe('Settings › coach cap input', () => {
  it('a negative / junk entry does not silently become cap 0 (coach fully disabled, 429 on every message)', async () => {
    render(<SettingsPage />);
    const input = screen.getByLabelText('Coach daily message cap') as HTMLInputElement;
    // Math.max(0, parseInt(v) || 0): "-5", "-", "." and NaN all become 0 = coach off.
    fireEvent.change(input, { target: { value: '-5' } });
    fireEvent.blur(input);
    const patch = (updateSettings.mock.calls.at(-1) as unknown[] | undefined)?.[2] as { coach_daily_cap?: number | null } | undefined;
    expect(patch?.coach_daily_cap).not.toBe(0);
  });
});
