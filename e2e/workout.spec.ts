import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/user.json' });

test.beforeEach(async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'FitTrack' })).toBeVisible();
  await page.getByRole('button', { name: 'Workouts' }).click();
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
  await expect(page.getByRole('heading', { name: 'FitTrack' })).toBeVisible();
  await page.getByRole('button', { name: 'Workouts' }).click();
  await expect(page.locator('button').filter({ hasText: '✓' }).first()).toBeVisible();
});
