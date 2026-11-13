import { test, expect } from '@playwright/test';

// Warm-up / cool-down cards and the exercise video sheet. YouTube is never
// loaded in tests: every youtube / ytimg request is fulfilled empty.
test.beforeEach(async ({ page }) => {
  await page.route('**/*youtube*', (r) => r.fulfill({ status: 200, body: '' }));
  await page.route('**/*youtube*/**', (r) => r.fulfill({ status: 200, body: '' }));
  await page.route('**/*ytimg*', (r) => r.fulfill({ status: 200, body: '' }));
  await page.route('**/*ytimg*/**', (r) => r.fulfill({ status: 200, body: '' }));
});

test('warm-up is open before Start, cool-down exists, video sheet opens and closes', async ({ page }) => {
  const youtubeRequests: string[] = [];
  page.on('request', (r) => {
    if (/youtube|ytimg/.test(r.url())) youtubeRequests.push(r.url());
  });

  await page.goto('/today');
  await page.getByRole('button', { name: /^Start program$/ }).click();
  await expect(page.getByRole('heading', { name: /Day 1 · .* is up next/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Start Day 1$/ })).toBeVisible();

  // Warm-up: visible and expanded before Start, with ramp-up sets; collapsible.
  const warmToggle = page.getByRole('button', { name: /^Warm-up · ~\d+ min/ });
  await expect(warmToggle).toBeVisible();
  await expect(warmToggle).toHaveAttribute('aria-expanded', 'true');
  const warmPanel = page.locator(`[id="${await warmToggle.getAttribute('aria-controls')}"]`);
  await expect(warmPanel).toBeVisible();
  await expect(warmPanel.getByText(/Ramp-up · /)).toBeVisible();
  await expect(warmPanel.getByText(/Empty bar × 10/)).toBeVisible();
  await warmToggle.click();
  await expect(warmToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(warmPanel).toBeHidden();
  await warmToggle.click();
  await expect(warmToggle).toHaveAttribute('aria-expanded', 'true');

  // Optional tick persists per session (localStorage), never blocks anything.
  const firstTick = warmPanel.getByRole('checkbox').first();
  await firstTick.click();
  await expect(firstTick).toHaveAttribute('aria-checked', 'true');

  // Cool-down exists, collapsed until the working sets are done.
  const coolToggle = page.getByRole('button', { name: /^Cool-down · ~\d+ min/ });
  await expect(coolToggle).toBeVisible();
  await expect(coolToggle).toHaveAttribute('aria-expanded', 'false');

  // Nothing from YouTube yet.
  expect(youtubeRequests).toEqual([]);

  // Video button on a routine item opens the sheet; Escape closes and focus returns.
  const videoBtn = warmPanel.getByRole('button', { name: /^Watch video: / }).first();
  await videoBtn.click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('link', { name: /Open in YouTube/ })).toHaveAttribute('href', /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/);
  await expect(sheet.locator('iframe')).toHaveCount(0);
  await sheet.getByRole('button', { name: /^Play video/ }).click();
  await expect(sheet.locator('iframe')).toHaveAttribute('src', /^https:\/\/www\.youtube-nocookie\.com\/embed\//);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(videoBtn).toBeFocused();

  // Manual toggle and ticks survive a reload.
  await warmToggle.click();
  await page.reload();
  await expect(page.getByRole('button', { name: /^Warm-up · ~\d+ min/ })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: /^Warm-up · ~\d+ min/ }).click();
  await expect(page.getByRole('checkbox').first()).toHaveAttribute('aria-checked', 'true');

  // After Start: main lifts have a video button too; the close button works.
  await page.getByRole('button', { name: /^Start Day 1$/ }).click();
  await expect(page.getByRole('timer', { name: 'Session time' })).toBeVisible();
  await page.getByRole('button', { name: /^Watch video: Flat Barbell Bench Press$/ }).click();
  await expect(page.getByRole('dialog', { name: 'Flat Barbell Bench Press' })).toBeVisible();
  await page.getByRole('button', { name: 'Close video' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
