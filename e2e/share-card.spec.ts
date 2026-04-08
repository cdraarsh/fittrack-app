import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/user.json' });

test('Share button calls navigator.share when available', async ({ page }) => {
  // Inject a mock before the page loads so ShareCard picks it up
  await page.addInitScript(() => {
    const calls: unknown[] = [];
    (window as unknown as { __shareCalls: unknown[] }).__shareCalls = calls;
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: unknown) => {
        calls.push(data);
      },
    });
  });

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'FitTrack' })).toBeVisible();
  await page.getByRole('button', { name: 'Progress' }).click();

  const shareBtn = page.getByRole('button', { name: /Share/i });
  await expect(shareBtn).toBeVisible();
  await shareBtn.click();

  // Verify navigator.share was called with a title
  const calls = await page.evaluate(() =>
    (window as unknown as { __shareCalls: unknown[] }).__shareCalls
  );
  expect(calls.length).toBeGreaterThan(0);
  expect((calls[0] as { title?: string }).title).toBeTruthy();
});

test('Share button falls back to clipboard when navigator.share is absent', async ({ page }) => {
  // Remove navigator.share so the component falls back to clipboard.writeText
  await page.addInitScript(() => {
    const writes: string[] = [];
    (window as unknown as { __clipboardWrites: string[] }).__clipboardWrites = writes;
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          writes.push(text);
        },
      },
    });
  });

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'FitTrack' })).toBeVisible();
  await page.getByRole('button', { name: 'Progress' }).click();

  await page.getByRole('button', { name: /Share/i }).click();

  const writes = await page.evaluate(() =>
    (window as unknown as { __clipboardWrites: string[] }).__clipboardWrites
  );
  expect(writes.length).toBeGreaterThan(0);
  expect(writes[0].length).toBeGreaterThan(0);
});
