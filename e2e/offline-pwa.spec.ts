import { test, expect } from '@playwright/test';

// Airplane mode on the installed app: once the service worker has cached the
// app shell, every app route opens and a session can be logged with no network.
// Needs a production build (the service worker is disabled in `next dev`):
//   npm run build && npm start, then PLAYWRIGHT_BASE_URL=http://localhost:3000

test('app shell opens offline and a set can be logged', async ({ page, context }) => {
  await page.goto('/today');
  const hasSw = await page
    .evaluate(() =>
      Promise.race([
        navigator.serviceWorker?.ready.then(() => true),
        new Promise<boolean>((r) => setTimeout(() => r(false), 5000)),
      ]),
    )
    .catch(() => false);
  test.skip(!hasSw, 'service worker not active (dev server)');

  // Let the worker take control and warm every app route.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.evaluate(() => navigator.serviceWorker.controller!.postMessage({ type: 'WARM_APP_SHELL' }));
  await expect
    .poll(() => page.evaluate(async () => (await Promise.all(['/today', '/program', '/history', '/settings'].map((p) => caches.match(p)))).every(Boolean)))
    .toBe(true);

  await context.setOffline(true);

  // Full page loads of every app route work from the cache.
  for (const path of ['/program', '/history', '/settings', '/today']) {
    const res = await page.goto(path);
    expect(res?.ok() ?? true).toBe(true);
    await expect(page.getByRole('link', { name: 'Today', exact: true }).first()).toBeVisible();
  }

  await page.getByRole('button', { name: /^Start program$/ }).click();
  await page.getByLabel(/^Set \d+ weight$/).first().fill('40');
  await page.getByLabel(/^Set \d+ reps$/).first().fill('9');
  await page.getByRole('button', { name: /^Tick set \d+$/ }).first().click();
  await expect(page.getByRole('heading', { name: /Day 1 · .* in progress/ })).toBeVisible();

  // Still there after a reload with no network.
  await page.reload();
  await expect(page.getByLabel(/^Set \d+ reps$/).first()).toHaveValue('9');
  await expect(page.getByText(/Offline/)).toBeVisible();
});
