/**
 * Adversarial r3: Settings › Reminders (subscription-derived state) and the
 * coach cap input. A FAILING test = a defect.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

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

beforeEach(() => {
  updateSettings.mockClear();
  toastMock.mockClear();
  (globalThis as unknown as { Notification: unknown }).Notification = { permission: 'default', requestPermission: async () => 'granted' };
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
});

describe('Settings › Reminders when the service worker never becomes ready', () => {
  it('does not leave "Turn on" disabled forever (dev, SW registration failed, Firefox private window)', async () => {
    // navigator.serviceWorker exists but .ready never settles (next dev disables the SW).
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: new Promise(() => {}) } });
    render(<SettingsPage />);
    const btn = await screen.findByRole('button', { name: 'Turn on' });
    // Before 1e9de40 this was clickable with permission "default"; now it stays 'loading' (disabled) with no message.
    await waitFor(() => expect(btn).not.toBeDisabled(), { timeout: 1500 });
  });
});

describe('Settings › coach cap input', () => {
  it('junk the number field cannot parse ("1e", "-") is refused, not saved as "empty" (= cap 100)', async () => {
    render(<SettingsPage />);
    const input = screen.getByLabelText('Coach daily message cap') as HTMLInputElement;
    // A type=number input reports value "" for unparsable text (badInput); the handler treats it as "empty".
    fireEvent.change(input, { target: { value: '1e' } });
    // The field is now type=text (numeric keypad), so "1e" reaches onBlur as "1e" and is refused.
    await act(async () => {
      fireEvent.blur(input);
    });
    const patch = updateSettings.mock.calls.at(-1)?.[2] as { coach_daily_cap?: number | null } | undefined;
    expect(patch?.coach_daily_cap).not.toBeNull(); // was 20, silently becomes 100/day with no toast
  });

  it('holds: out-of-range is restored with a toast, valid saves', async () => {
    render(<SettingsPage />);
    const input = screen.getByLabelText('Coach daily message cap') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0' } });
    await act(async () => {
      fireEvent.blur(input);
    });
    expect(input.value).toBe('20');
    expect(toastMock).toHaveBeenCalled();
    expect(updateSettings).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '30' } });
    await act(async () => {
      fireEvent.blur(input);
    });
    expect((updateSettings.mock.calls.at(-1)?.[2] as { coach_daily_cap: number }).coach_daily_cap).toBe(30);
  });
});
