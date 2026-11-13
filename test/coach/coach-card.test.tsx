import 'fake-indexeddb/auto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import CoachCard from '@/components/coach/CoachCard';

afterEach(() => vi.restoreAllMocks());
// jsdom has no element scrolling.
Element.prototype.scrollTo = function () {} as never;

describe('CoachCard', () => {
  it('a slow history load does not wipe a message sent and answered meanwhile', async () => {
    let releaseHistory!: () => void;
    const historyGate = new Promise<void>((r) => (releaseHistory = r));
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      if (!init || !init.method || init.method === 'GET') {
        await historyGate;
        return new Response(JSON.stringify({ messages: [{ role: 'assistant', content: 'old history' }], cap: 20, used: 0, remaining: 20, available: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Fresh reply', { headers: { 'Content-Type': 'text/plain', 'x-coach-remaining': '19' } });
    });
    render(<CoachCard suggestions={['How is my progress?']} />);
    fireEvent.click(screen.getByRole('button', { name: 'How is my progress?' }));
    await screen.findByText('Fresh reply');
    await act(async () => releaseHistory());
    await waitFor(() => expect(screen.getByText('Fresh reply')).toBeTruthy());
    expect(screen.queryByText('old history')).toBeNull();
  });
});
