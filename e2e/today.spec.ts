import { test, expect } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';

test.use({ storageState: 'e2e/.auth/user.json' });

test.beforeEach(async ({ page }) => {
  await setupClerkTestingToken({ page });
});

test('Today shows the start button or the session that is up next', async ({ page }) => {
  await page.goto('/today');
  const start = page.getByRole('button', { name: /Start (program|next block)/ });
  const upNext = page.getByRole('heading', { name: /Day \d+ · .*(is up next|in progress)/ });
  const locked = page.getByText(/Unlocks/);
  await expect(start.or(upNext).or(locked)).toBeVisible({ timeout: 15_000 });
});

test('future sessions are preview-only on Program', async ({ page }) => {
  await page.goto('/program');
  const locked = page.getByRole('button', { name: /Day 64/ });
  if (await locked.isVisible().catch(() => false)) {
    await locked.click();
    await expect(page.getByRole('button', { name: /Tick set/ })).toHaveCount(0);
  }
});
