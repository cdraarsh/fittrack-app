import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/user.json' });

test.beforeEach(async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'FitTrack' })).toBeVisible();
  await page.getByRole('button', { name: 'Nutrition' }).click();
});

test('nutrition tab renders calorie targets', async ({ page }) => {
  // CalorieBank shows "X / Y kcal" for today
  await expect(page.getByText(/kcal/i)).toBeVisible();
});

test('can search food and add a meal entry', async ({ page }) => {
  // FoodSearch input
  const searchInput = page.getByPlaceholder(/chicken breast/i);
  await expect(searchInput).toBeVisible();

  await searchInput.fill('banana');

  // Wait for Open Food Facts results to appear (network call)
  const firstResult = page.locator('button').filter({ hasText: /banana/i }).first();
  await expect(firstResult).toBeVisible({ timeout: 10_000 });
  await firstResult.click();

  // After picking, a quantity input and "Add" button appear
  const addBtn = page.getByRole('button', { name: 'Add' });
  await expect(addBtn).toBeVisible();
  await addBtn.click();

  // The food name should now appear in the meal log
  await expect(page.getByText(/banana/i)).toBeVisible();
});

test('calorie total updates after adding a food item', async ({ page }) => {
  // Capture initial kcal text
  const bankText = page.getByText(/\/ \d+ kcal/i).first();
  const before = await bankText.textContent();

  const searchInput = page.getByPlaceholder(/chicken breast/i);
  await searchInput.fill('rice');

  const firstResult = page.locator('button').filter({ hasText: /rice/i }).first();
  await expect(firstResult).toBeVisible({ timeout: 10_000 });
  await firstResult.click();

  const addBtn = page.getByRole('button', { name: 'Add' });
  await addBtn.click();

  // Allow UI to update
  await page.waitForTimeout(300);
  const after = await bankText.textContent();
  expect(after).not.toBe(before);
});
