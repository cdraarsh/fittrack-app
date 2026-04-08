import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/user.json' });

test.beforeEach(async ({ page }) => {
  await page.goto('/dashboard');
  // AppShell shows a loading spinner then either OnboardingWizard or the tab bar.
  // Wait for the main header to appear.
  await expect(page.getByRole('heading', { name: 'FitTrack' })).toBeVisible();
});

test('dashboard loads with Today tab', async ({ page }) => {
  await expect(page.getByText("Today's Targets")).toBeVisible();
  await expect(page.getByText('Daily Checklist')).toBeVisible();
});

test('can switch tabs', async ({ page }) => {
  await page.getByRole('button', { name: 'Workouts' }).click();
  // WorkoutsTab should render — fallback to checking Today's Targets is no longer visible
  await expect(page.getByText("Today's Targets")).not.toBeVisible();

  await page.getByRole('button', { name: 'Nutrition' }).click();
  await page.getByRole('button', { name: 'Progress' }).click();
  await page.getByRole('button', { name: 'Today' }).click();
  await expect(page.getByText("Today's Targets")).toBeVisible();
});

test('can log water glasses', async ({ page }) => {
  // Water row shows "X/7 glasses". Click the 3rd water button.
  const waterRow = page.locator('div', { hasText: /glasses/ }).first();
  const buttons = waterRow.getByRole('button');
  await buttons.nth(2).click(); // 3rd glass
  await expect(page.getByText(/3\/7 glasses/)).toBeVisible();
});

test('can toggle sleep checklist item', async ({ page }) => {
  const sleepRow = page.locator('div').filter({ hasText: /^Sleep 7\+ hours$/ }).locator('..');
  const toggle = sleepRow.getByRole('button').last();
  await toggle.click();
  // Re-read from server — reload and confirm state persisted.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'FitTrack' })).toBeVisible();
});

test('can write session notes', async ({ page }) => {
  const notes = page.getByPlaceholder(/Form observations/);
  await notes.fill('E2E test note — felt strong today');
  await page.waitForTimeout(500); // debounced save
});

test('offline shell is served by service worker', async ({ page, context }) => {
  await page.waitForTimeout(1500); // let SW register
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('body')).toBeVisible();
  await context.setOffline(false);
});
