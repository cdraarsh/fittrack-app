// @vitest-environment node
/**
 * Adversarial r4: app/sw.ts notificationclick (focus() first, then navigate()).
 * serwist is mocked; `self` is a fake ServiceWorkerGlobalScope.
 * A FAILING test = a defect.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('@serwist/next/worker', () => ({ defaultCache: [] }));
vi.mock('serwist', () => ({
  Serwist: class { addEventListeners() {} },
  NetworkFirst: class {},
  NetworkOnly: class {},
}));

type Handler = (e: unknown) => void;
const handlers: Record<string, Handler> = {};
const clients = { matchAll: vi.fn(), openWindow: vi.fn(async (u: string) => ({ url: u })) };

beforeAll(async () => {
  (globalThis as unknown as { self: unknown }).self = {
    __SW_MANIFEST: [],
    addEventListener: (t: string, h: Handler) => (handlers[t] = h),
    clients,
    registration: { showNotification: vi.fn() },
  };
  await import('@/app/sw');
});

function click(url = '/today') {
  let p: Promise<unknown> = Promise.resolve();
  handlers.notificationclick({ notification: { close() {}, data: { url } }, waitUntil: (x: Promise<unknown>) => (p = x) });
  return p;
}

describe('notificationclick', () => {
  it('holds: focuses the open window, then navigates it to the target', async () => {
    const w = { url: 'https://app/history', focus: vi.fn(async () => w), navigate: vi.fn(async () => w) };
    clients.matchAll.mockResolvedValueOnce([w]);
    await click('/today');
    expect(w.focus).toHaveBeenCalled();
    expect(w.navigate).toHaveBeenCalledWith('/today');
  });

  it('holds: navigate() rejecting (uncontrolled window) still resolves with the focused window', async () => {
    const w = { url: 'https://app/history', focus: vi.fn(async () => w), navigate: vi.fn(async () => { throw new TypeError('not controlled'); }) };
    clients.matchAll.mockResolvedValueOnce([w]);
    await expect(click('/today')).resolves.toBe(w);
  });

  it('focus() rejecting ("Not allowed to focus a window") still gets the user to the page (navigate or openWindow)', async () => {
    const w = {
      url: 'https://app/history',
      focus: vi.fn(async () => { throw new DOMException('Not allowed to focus a window.', 'InvalidAccessError'); }),
      navigate: vi.fn(async () => w),
    };
    clients.matchAll.mockResolvedValueOnce([w]);
    clients.openWindow.mockClear();
    await click('/today').catch(() => {});
    // Before 3dfc613 navigate() ran first, so the window at least moved; now nothing happens.
    expect(w.navigate.mock.calls.length + clients.openWindow.mock.calls.length).toBeGreaterThan(0);
  });

  it('holds: no open window → openWindow(target); non-path url → /today', async () => {
    clients.matchAll.mockResolvedValueOnce([]);
    clients.openWindow.mockClear();
    await click('https://evil.example/');
    expect(clients.openWindow).toHaveBeenCalledWith('/today');
  });

  it('protocol-relative "//host" passes the startsWith("/") check (push payload url → openWindow("//host"))', async () => {
    // Only the VAPID-key holder (the server) can send pushes, so this needs a leaked key.
    clients.matchAll.mockResolvedValueOnce([]);
    clients.openWindow.mockClear();
    await click('//evil.example/x');
    expect(clients.openWindow).toHaveBeenCalledWith('/today');
  });
});
