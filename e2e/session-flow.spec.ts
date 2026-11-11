import { test, expect, type Page } from '@playwright/test';

// Full local-first flow on a fresh device (each test gets empty IndexedDB):
// start program → log every Day 1 set (survives reload + offline) → complete →
// Day 2 locked until the next calendar day → unlocks the day after.
// Runs without a reachable Supabase: sync just reports the server as unreachable.

const DAY1 = new Date('2026-11-10T09:00:00');
const DAY2 = new Date('2026-11-11T09:00:00');

async function logAllSets(page: Page) {
  const weights = page.getByLabel(/^Set \d+ weight$/);
  const reps = page.getByLabel(/^Set \d+ reps$/);
  const n = await reps.count();
  for (let i = 0; i < n; i++) {
    await weights.nth(i).fill('20');
    await reps.nth(i).fill('10');
    await reps.nth(i).blur();
  }
  return n;
}

async function tickAll(page: Page) {
  const ticks = page.getByRole('button', { name: /^Tick set \d+$/ });
  // Tick one set at a time and wait for it to register, like a person would.
  for (let guard = 0; guard < 50 && (await ticks.count()) > 0; guard++) {
    const btn = await ticks.first().elementHandle();
    await btn!.click();
    await expect.poll(() => btn!.getAttribute('aria-pressed')).toBe('true');
  }
  await expect(ticks).toHaveCount(0);
}

test('log Day 1 offline, complete it, Day 2 unlocks only the next day', async ({ page, context }) => {
  await page.clock.setFixedTime(DAY1);
  await page.goto('/today');

  await page.getByRole('button', { name: /^Start program$/ }).click();
  await expect(page.getByRole('heading', { name: /Day 1 · .* is up next/ })).toBeVisible();

  // Values typed before a reload are kept (Dexie, save on blur).
  const total = await logAllSets(page);
  expect(total).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByLabel(/^Set \d+ reps$/).first()).toHaveValue('10');

  // Airplane mode: ticking still works and is queued.
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await tickAll(page);
  await expect(page.getByText(/Offline/)).toBeVisible();

  await page.getByRole('button', { name: /^Complete (session|day)/i }).click();

  // Day 1 done → Day 2 is the next session but locked until tomorrow.
  await expect(page.getByText(/Unlocks/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Tick set \d+$/ })).toHaveCount(0);

  // Future sessions can't be logged from Program either.
  await context.setOffline(false);
  await page.goto('/program');
  const day3 = page.getByRole('button', { name: /Day 3\b/ });
  if (await day3.count()) {
    await day3.first().click();
    await expect(page.getByRole('button', { name: /^Tick set \d+$/ })).toHaveCount(0);
  }

  // Next calendar day: Day 2 is up next.
  await page.clock.setFixedTime(DAY2);
  await page.goto('/today');
  await expect(page.getByRole('heading', { name: /Day 2 · .* is up next/ })).toBeVisible();

  // With a real Supabase behind the app, everything queued offline must reach it.
  if (process.env.E2E_EXPECT_SYNC) {
    const outbox = () =>
      page.evaluate(
        () =>
          new Promise<string[]>((res) => {
            const q = indexedDB.open('fittrack');
            q.onsuccess = () => {
              const g = q.result.transaction('outbox').objectStore('outbox').getAll();
              g.onsuccess = () => res(g.result.map((o: { status: string }) => o.status));
            };
          }),
      );
    await expect.poll(outbox, { timeout: 60_000 }).toEqual([]);
    await expect(page.getByText(/to sync|Offline|not synced/)).toHaveCount(0);
  }
});
