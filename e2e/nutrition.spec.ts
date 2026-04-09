import { test, expect } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';

test.use({ storageState: 'e2e/.auth/user.json' });

// Mock Open Food Facts API to avoid flaky external network calls
const FOOD_MOCK_RESPONSE = {
  products: [{
    product_name: 'Banana Test Food',
    brands: 'Test Brand',
    nutriments: {
      'energy-kcal_100g': 89,
      'proteins_100g': 1.1,
      'carbohydrates_100g': 23,
      'fat_100g': 0.3,
    },
  }],
};

test.beforeEach(async ({ page }) => {
  // Mock Open Food Facts API (use regex for reliable matching)
  await page.route(/openfoodfacts\.org/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FOOD_MOCK_RESPONSE) })
  );
  await setupClerkTestingToken({ page });
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'FitTrack' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Nutrition', exact: true }).click();
});

test('nutrition tab renders calorie targets', async ({ page }) => {
  // Macros section shows "X / Ykcal" — use first() to avoid strict mode violation
  await expect(page.getByText(/kcal/i).first()).toBeVisible();
});

test('can search food and add a meal entry', async ({ page }) => {
  // Open the add meal form then switch to Search DB mode
  await page.getByRole('button', { name: '+ Add Meal' }).click();
  await page.getByRole('button', { name: 'Search DB' }).click();

  const searchInput = page.getByPlaceholder(/chicken breast/i);
  await expect(searchInput).toBeVisible();

  await searchInput.fill('banana');

  // Wait for mocked results to appear
  const firstResult = page.locator('button').filter({ hasText: /banana test food/i }).first();
  await expect(firstResult).toBeVisible({ timeout: 5_000 });
  await firstResult.click(); // picks the food — shows quantity + "Add" button

  // Click "Add" in FoodSearch to confirm selection (calls onSelect → manual mode)
  await page.getByRole('button', { name: 'Add' }).click();

  // Now in manual mode — click Save Meal to add the entry
  await page.getByRole('button', { name: 'Save Meal' }).click();

  // The food name should now appear in the meal log
  await expect(page.getByText('Banana Test Food')).toBeVisible();
});

test('calorie total updates after adding a food item', async ({ page }) => {
  // Capture initial calorie total — text is "0 / 1850kcal" (no space before kcal)
  const bankText = page.getByText(/\/ \d+kcal/i).first();
  const before = await bankText.textContent();

  // Open the add meal form, switch to search, add a food
  await page.getByRole('button', { name: '+ Add Meal' }).click();
  await page.getByRole('button', { name: 'Search DB' }).click();

  const searchInput = page.getByPlaceholder(/chicken breast/i);
  await searchInput.fill('rice');

  const firstResult = page.locator('button').filter({ hasText: /banana test food/i }).first();
  await expect(firstResult).toBeVisible({ timeout: 5_000 });
  await firstResult.click(); // picks the food

  await page.getByRole('button', { name: 'Add' }).click(); // confirms selection

  await page.getByRole('button', { name: 'Save Meal' }).click();

  // Allow UI to update
  await page.waitForTimeout(300);
  const after = await bankText.textContent();
  expect(after).not.toBe(before);
});
