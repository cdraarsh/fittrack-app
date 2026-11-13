/**
 * Adversarial r4: <DailyInsight> single-flight / throttle / {final} flag / stale-day guard.
 * A FAILING test = a defect.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import DailyInsight, { SYNCED_EVENT } from '@/components/app/DailyInsight';

const KEY = 'fittrack:insight';
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
const D = '2026-11-16';
const D1 = '2026-11-17';

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('DailyInsight', () => {
  it("stale-day guard: yesterday's in-flight answer is not shown (and made final) after the day rolls over", async () => {
    // 23:59: Today mounts, the model request is slow; at 00:00 Today re-renders with the new date.
    let releaseD!: () => void;
    const gateD = new Promise<void>((r) => (releaseD = r));
    const fetchMock = vi.fn(async () => {
      if (fetchMock.mock.calls.length === 1) {
        await gateD;
        return json({ date: D, text: 'Yesterday: bench 40 kg is up next.', source: 'model', cached: false });
      }
      return json({ date: D1, text: 'Today: squat day.', source: 'model', cached: false });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { rerender } = render(<DailyInsight today={D} />);
    rerender(<DailyInsight today={D1} />);
    await act(async () => {
      releaseD();
    });
    await act(async () => {});
    // `forDay !== today` compares the same closure variable: always false, so D's text
    // is shown under D1, final.current = true, and D1 is never asked (inFlight blocked its load).
    expect(screen.queryByText('Yesterday: bench 40 kg is up next.')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('holds: a rejected fetch clears inFlight (a later sync, past the throttle, re-asks)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const fetchMock = vi.fn(async () => {
      if (fetchMock.mock.calls.length === 1) throw new TypeError('Load failed');
      return json({ date: D, text: 'ok', source: 'rules', cached: false });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<DailyInsight today={D} />);
    await act(async () => {});
    vi.setSystemTime(Date.now() + 3 * 60_000);
    await act(async () => {
      window.dispatchEvent(new Event(SYNCED_EVENT));
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('holds: throttle — non-final answer is re-asked after a sync only after 2 minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const fetchMock = vi.fn(async () => json({ date: D, text: 'rules', source: 'rules', cached: false }));
    vi.stubGlobal('fetch', fetchMock);
    render(<DailyInsight today={D} />);
    await act(async () => {});
    await act(async () => {
      window.dispatchEvent(new Event(SYNCED_EVENT));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 121_000);
    await act(async () => {
      window.dispatchEvent(new Event(SYNCED_EVENT));
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('holds: old stored entry (no flag) is final; {final:false} is shown and re-asked; degraded is never stored', async () => {
    const fetchMock = vi.fn(async () => json({ date: D, text: 'degraded rules', source: 'rules', cached: false, degraded: true }));
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem(KEY, JSON.stringify({ date: D, text: 'old model text' }));
    const a = render(<DailyInsight today={D} />);
    expect(screen.getByText('old model text')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    a.unmount();

    localStorage.setItem(KEY, JSON.stringify({ date: D, text: 'stored rules', final: false }));
    render(<DailyInsight today={D} />);
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('degraded rules')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(KEY)!).text).toBe('stored rules');
  });

  it('a request that never settles (no timeout / abort) blocks every later re-ask while mounted', async () => {
    // iOS can suspend a PWA mid-request; nothing bounds the fetch, so inFlight stays true.
    vi.useFakeTimers({ toFake: ['Date'] });
    let n = 0;
    const fetchMock = vi.fn(() => (++n === 1 ? new Promise<Response>(() => {}) : Promise.resolve(json({ date: D, text: 'x', source: 'model' }))));
    vi.stubGlobal('fetch', fetchMock);
    render(<DailyInsight today={D} />);
    vi.setSystemTime(Date.now() + 60 * 60_000);
    await act(async () => {
      window.dispatchEvent(new Event(SYNCED_EVENT));
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
