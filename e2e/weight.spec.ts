import { test, expect } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';

// Weight tests write to the same user's weight log — run serially to avoid race conditions
test.describe.configure({ mode: 'serial' });
test.use({ storageState: 'e2e/.auth/user.json' });

test.beforeEach(async ({ page }) => {
  await setupClerkTestingToken({ page });
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'FitTrack' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Progress' }).click();
});

test('progress tab renders weight progress section', async ({ page }) => {
  await expect(page.getByText('Weight Progress')).toBeVisible();
});

test('can log a weight entry and see it reflected in current weight', async ({ page }) => {
  // The weight form is hidden by default — click "+ Log" to reveal it
  await page.getByRole('button', { name: '+ Log' }).first().click();

  const weightInput = page.getByPlaceholder('e.g. 82.5');
  await expect(weightInput).toBeVisible();

  await weightInput.fill('81.5');
  await page.getByRole('button', { name: 'Save' }).click();

  // Current weight stat card should update to show the new value
  await expect(page.getByText(/81\.5 kg/)).toBeVisible();
});

test('weight entry persists across reload', async ({ page }) => {
  await page.getByRole('button', { name: '+ Log' }).first().click();
  const weightInput = page.getByPlaceholder('e.g. 82.5');
  await weightInput.fill('81.8');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/81\.8 kg/)).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'FitTrack' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Progress' }).click();
  await expect(page.getByText(/81\.8 kg/)).toBeVisible();
});

test('weight chart canvas is rendered', async ({ page }) => {
  // Chart.js renders a <canvas> element inside the weight section
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
});
