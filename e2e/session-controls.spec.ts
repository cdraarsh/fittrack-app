import { test, expect } from '@playwright/test';

// Start / Stop / Reset and the floating coach, on a fresh device.
test('an accidental start can be reset from Stop; the coach floats on every page', async ({ page }) => {
  await page.goto('/today');
  await page.getByRole('button', { name: /^Start program$/ }).click();
  await expect(page.getByRole('heading', { name: /Day 1 · .* is up next/ })).toBeVisible();

  // Floating coach: on Today and Program, knows the session that's up next.
  const fab = page.getByRole('button', { name: 'Open AI coach' });
  await expect(fab).toBeVisible();
  await fab.click();
  const coach = page.getByRole('dialog', { name: 'AI coach' });
  await expect(coach).toBeVisible();
  await expect(coach.getByRole('button', { name: /Train Day 1 or rest today\?/ })).toBeVisible();
  await coach.getByRole('button', { name: 'Close coach' }).click();
  await expect(coach).toHaveCount(0);

  // "Accidental" start: one set logged.
  await page.getByRole('button', { name: /^Start Day 1$/ }).click();
  await expect(page.getByRole('timer', { name: 'Session time' })).toBeVisible();
  await page.getByLabel(/ set \d+ weight$/).first().fill('40');
  await page.getByLabel(/ set \d+ reps$/).first().fill('8');
  await page.getByRole('button', { name: /^Tick .+ set \d+$/ }).first().click();
  await expect(page.getByRole('button', { name: / set 1 done$/ }).first()).toBeVisible();

  // In session the coach suggestions follow the session.
  await fab.click();
  await expect(coach.getByRole('button', { name: /^What weight for / })).toBeVisible();
  await page.keyboard.press('Escape');

  // Stop → reset needs a second, explicit confirmation.
  await page.getByRole('button', { name: /^Stop$/ }).click();
  const stop = page.getByRole('dialog', { name: 'Stop session?' });
  await expect(stop.getByRole('button', { name: /Finish later/ })).toBeVisible();
  await stop.getByRole('button', { name: /Reset session \(started by accident\)/ }).click();
  await stop.getByRole('button', { name: /Yes, discard 1 logged set and reset/ }).click();

  await expect(page.getByRole('heading', { name: /Day 1 · .* is up next/ })).toBeVisible();
  await expect(page.getByRole('timer', { name: 'Session time' })).toHaveCount(0);
  await expect(page.getByLabel(/ set \d+ weight$/)).toHaveCount(0);

  // Still reset after a reload (nothing came back from the local store).
  await page.reload();
  await expect(page.getByRole('heading', { name: /Day 1 · .* is up next/ })).toBeVisible();
  // Starting again shows empty sets: the discarded one didn't come back.
  await page.getByRole('button', { name: /^Start Day 1$/ }).click();
  await expect(page.getByLabel(/ set \d+ reps$/).first()).toHaveValue('');
  await expect(page.getByRole('button', { name: / set \d+ done$/ })).toHaveCount(0);

  // Reps first, then tick: the prefilled weight is saved with the set.
  await page.getByLabel(/ set \d+ reps$/).first().fill('9');
  await page.getByLabel(/ set \d+ reps$/).first().blur();
  await page.getByRole('button', { name: /^Tick .+ set \d+$/ }).first().click();
  await expect(page.getByRole('button', { name: / set 1 done$/ }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/ set \d+ weight$/).first()).not.toHaveValue('');

  // Finish later keeps progress.
  await page.getByRole('button', { name: /^Stop$/ }).click();
  await stop.getByRole('button', { name: /Finish later/ }).click();
  await expect(page.getByRole('heading', { name: /Day 1 · .* — paused/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Resume$/ })).toBeVisible();
  // Paused: the coach button is back (it hides only while actively training).

  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open AI coach' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Program', exact: true })).toHaveCount(0);
});
