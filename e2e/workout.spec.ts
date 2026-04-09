import { test, expect } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';

test.use({ storageState: 'e2e/.auth/user.json' });

test.beforeEach(async ({ page }) => {
  // Force date to Friday of this week — the 3rd gym day (friday) maps to WORKOUTS 'wednesday'
  // template. That card's date = start-of-week + 4 days = Friday, so isToday=true on Friday.
  await page.clock.setSystemTime(new Date('2026-04-10T10:00:00'));
  await setupClerkTestingToken({ page });
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'FitTrack' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Workouts' }).click();
  // Wednesday card auto-opens (isToday=true). Wait for kg input to be visible.
  await expect(page.getByPlaceholder('kg').first()).toBeVisible({ timeout: 10_000 });
});

test('workouts tab renders at least one exercise block', async ({ page }) => {
  // ExerciseBlock renders exercise name + set toggle buttons
  const firstToggle = page.locator('button').filter({ hasText: /[✓○]/ }).first();
  await expect(firstToggle).toBeVisible();
});

test('can mark a set as done', async ({ page }) => {
  // Fill in weight and reps for the first set, then mark it done
  const kgInput = page.getByPlaceholder('kg').first();
  const repsInput = page.locator('input[placeholder*="–"]').first();
  const toggleBtn = page.locator('button').filter({ hasText: '○' }).first();

  await kgInput.fill('40');
  await repsInput.fill('10');
  await toggleBtn.click();

  // After toggle the button should show ✓
  await expect(page.locator('button').filter({ hasText: '✓' }).first()).toBeVisible();
});

test('set-done state persists across reload', async ({ page }) => {
  const kgInput = page.getByPlaceholder('kg').first();
  const repsInput = page.locator('input[placeholder*="–"]').first();
  const toggleBtn = page.locator('button').filter({ hasText: '○' }).first();

  await kgInput.fill('40');
  await repsInput.fill('10');
  await toggleBtn.click();
  await expect(page.locator('button').filter({ hasText: '✓' }).first()).toBeVisible();

  // Reload and confirm the checkmark is still there
  await page.reload();
  await expect(page.getByRole('heading', { name: 'FitTrack' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Workouts' }).click();
  await expect(page.locator('button').filter({ hasText: '✓' }).first()).toBeVisible();
});
