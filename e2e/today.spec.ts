import { test, expect } from '@playwright/test';

test('Today shows the start button or the session that is up next', async ({ page }) => {
  await page.goto('/today');
  const start = page.getByRole('button', { name: /Start (program|next block)/ });
  const upNext = page.getByRole('heading', { name: /Day \d+ · .*(is up next|in progress)/ });
  const locked = page.getByText(/Unlocks/);
  await expect(start.or(upNext).or(locked)).toBeVisible({ timeout: 15_000 });
});

test('Strength screen has Lifts, Garmin workouts and Recovery tabs; no Program tab', async ({ page }) => {
  await page.goto('/strength');
  await expect(page.getByRole('link', { name: 'Program', exact: true })).toHaveCount(0);
  for (const name of ['Lifts', 'Garmin workouts', 'Recovery']) {
    await page.getByRole('tab', { name }).click();
    await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toBeVisible();
  }
});
