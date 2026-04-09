import { test, expect } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import path from 'node:path';

test.use({ storageState: 'e2e/.auth/user.json' });

const FIXTURE_PHOTO = path.join(__dirname, 'fixtures/progress-photo.jpg');

test.beforeEach(async ({ page }) => {
  await setupClerkTestingToken({ page });
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'FitTrack' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Progress' }).click();
});

test('progress tab shows Add Photo button', async ({ page }) => {
  await expect(page.getByRole('button', { name: /Add Photo/i })).toBeVisible();
});

test('can upload a progress photo', async ({ page }) => {
  // The hidden <input type="file"> is triggered by clicking "Add Photo".
  // Use setInputFiles on the hidden input directly to avoid OS file picker.
  const fileInput = page.locator('input[type="file"][accept="image/*"]');
  await fileInput.setInputFiles(FIXTURE_PHOTO);

  // Uploading… button text appears while upload is in progress
  await expect(page.getByRole('button', { name: /Uploading/i })).toBeVisible({ timeout: 5_000 });

  // After upload completes the button returns to "Add Photo"
  await expect(page.getByRole('button', { name: /Add Photo/i })).toBeVisible({ timeout: 15_000 });
});

test('uploaded photo renders as an image in the grid', async ({ page }) => {
  // A seed photo is pre-loaded for the E2E user via seed-e2e-user.ts
  // Just verify the photo grid renders at least one image (the seeded one)
  const photo = page.locator('img[src*="supabase"]').first();
  await expect(photo).toBeVisible({ timeout: 10_000 });
});
