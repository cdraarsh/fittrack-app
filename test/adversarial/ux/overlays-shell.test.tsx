/**
 * Adversarial (UX commit a43fbc3): AppShell's focus tracking (overlay store),
 * the rest dock and the floating coach, rendered for real in jsdom.
 * A FAILING test = defect.
 */
import 'fake-indexeddb/auto';
import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

let pathname = '/today';
vi.mock('next/navigation', () => ({ usePathname: () => pathname, useRouter: () => ({ push: () => {} }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/audio/hooks', () => ({ useCueSetup: () => undefined, playCue: () => undefined }));
vi.mock('@/lib/local/hooks', async (orig) => {
  const real = await orig<typeof import('@/lib/local/hooks')>();
  return { ...real, useSyncEngine: () => undefined };
});

import AppShell from '@/components/app/AppShell';
import { setOverlay, useOverlays } from '@/lib/ui/overlays';
import { startRestTimer } from '@/components/shared/RestTimer';
import { openCoach } from '@/lib/ui/overlays';

function Probe() {
  const o = useOverlays();
  return <div data-testid="probe">{JSON.stringify(o)}</div>;
}
const probe = () => JSON.parse(screen.getByTestId('probe').textContent!) as { resting: boolean; inputFocused: boolean };

/** Mirrors Today's BodyWeightCard: the input is keyed by the saved row, so a save remounts it while focused. */
function KeyedField() {
  const [k, setK] = useState(0);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setK((n) => n + 1);
      }}
    >
      <input key={k} type="number" aria-label="Bodyweight in kg" />
      <button>Save</button>
    </form>
  );
}

if (!Element.prototype.scrollTo) Element.prototype.scrollTo = function () {} as never;

beforeEach(() => {
  setOverlay({ resting: false, inputFocused: false });
  localStorage.clear();
  pathname = '/today';
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
});

describe('adversarial: overlay store (inputFocused)', () => {
  it('holds: focus input -> button -> clears inputFocused', async () => {
    render(
      <AppShell>
        <Probe />
        <input aria-label="a" />
        <button>b</button>
      </AppShell>,
    );
    const a = screen.getByLabelText('a');
    act(() => a.focus());
    expect(probe().inputFocused).toBe(true);
    act(() => screen.getByText('b').focus());
    await waitFor(() => expect(probe().inputFocused).toBe(false));
  });

  it('holds: focus moving input -> input keeps inputFocused true, then blur clears it', async () => {
    render(
      <AppShell>
        <Probe />
        <input aria-label="a" />
        <input aria-label="c" type="number" />
      </AppShell>,
    );
    act(() => screen.getByLabelText('a').focus());
    act(() => screen.getByLabelText('c').focus());
    expect(probe().inputFocused).toBe(true);
    act(() => (document.activeElement as HTMLElement).blur());
    await waitFor(() => expect(probe().inputFocused).toBe(false));
  });

  it('BUG: a focused field that is removed (Enter-to-save remount, e.g. Bodyweight) leaves inputFocused stuck true -> rest dock hidden', async () => {
    render(
      <AppShell>
        <Probe />
        <KeyedField />
        <button>tick</button>
      </AppShell>,
    );
    const field = screen.getByLabelText('Bodyweight in kg');
    act(() => field.focus());
    act(() => {
      fireEvent.submit(field.closest('form')!); // Enter / iOS "Go"
    });
    expect(document.activeElement).toBe(document.body); // the field is gone, keyboard is down
    // Later: tick a set (focus on a button), a rest starts.
    act(() => screen.getByText('tick').focus());
    act(() => startRestTimer(90));
    const dismiss = await screen.findByRole('button', { name: 'Dismiss rest timer' });
    // The dock must be visible; inputFocused stuck => wrapper has `hidden`.
    expect(probe().inputFocused).toBe(false);
    expect(dismiss.parentElement!.className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });

  it('BUG: Escape-closing the coach while its message field is focused leaves inputFocused stuck -> coach button gone on every page', async () => {
    pathname = '/history';
    render(
      <AppShell>
        <Probe />
      </AppShell>,
    );
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Open AI coach' })));
    const msg = await screen.findByLabelText('Message the coach');
    act(() => msg.focus());
    expect(probe().inputFocused).toBe(true);
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'AI coach' })).toBeNull());
    // No field is focused any more; the floating coach must be reachable again.
    expect(screen.queryByRole('button', { name: 'Open AI coach' })).not.toBeNull();
  });
});

describe('adversarial: floating coach focus', () => {
  it('BUG: closing the coach opened from the floating button does not return focus to it', async () => {
    pathname = '/history';
    render(
      <AppShell>
        <Probe />
      </AppShell>,
    );
    const fab = screen.getByRole('button', { name: 'Open AI coach' });
    act(() => fab.focus());
    act(() => fireEvent.click(fab));
    const close = await screen.findByRole('button', { name: 'Close coach' });
    act(() => fireEvent.click(close));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'AI coach' })).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open AI coach' }));
  });

  it('BUG: opening the coach (aria-modal dialog) does not move focus into it', async () => {
    pathname = '/history';
    render(
      <AppShell>
        <Probe />
        <button>opener</button>
      </AppShell>,
    );
    act(() => screen.getByText('opener').focus());
    act(() => openCoach());
    const dialog = await screen.findByRole('dialog', { name: 'AI coach' });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('holds: focus returns to the session-bar style opener when the event opened the coach', async () => {
    pathname = '/history';
    render(
      <AppShell>
        <button>opener</button>
      </AppShell>,
    );
    const opener = screen.getByText('opener');
    act(() => opener.focus());
    act(() => openCoach());
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Close coach' })));
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('holds: resting flag clears when the rest is skipped', async () => {
    render(
      <AppShell>
        <Probe />
      </AppShell>,
    );
    act(() => startRestTimer(60));
    await waitFor(() => expect(probe().resting).toBe(true));
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Dismiss rest timer' })));
    await waitFor(() => expect(probe().resting).toBe(false));
  });
});
