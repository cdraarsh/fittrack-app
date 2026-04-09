import { test as setup } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const authFile = path.join(__dirname, '.auth/user.json');

setup('authenticate', async ({ page }) => {
  // Reuse existing session if it was created in the last 12 hours
  if (fs.existsSync(authFile)) {
    const age = Date.now() - fs.statSync(authFile).mtimeMs;
    if (age < 12 * 60 * 60 * 1000) {
      console.log('Reusing existing auth session (age:', Math.round(age / 60000), 'min)');
      return;
    }
  }

  await page.goto('/sign-in');

  // Fill the Clerk <SignIn> component via UI — this triggers the full
  // server-side session flow and sets __session + __client_uat properly.
  await page.getByPlaceholder('Enter your email address').fill(process.env.E2E_CLERK_USER_USERNAME!);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByPlaceholder('Enter your password').fill(process.env.E2E_CLERK_USER_PASSWORD!);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  // Wait until we land on the dashboard (middleware passed, session established).
  await page.waitForURL('**/dashboard', { timeout: 30_000 });

  // If the OnboardingWizard appears (no ft_settings row yet), complete it
  // so the storageState captures a fully-onboarded session.
  const wizard = page.getByText('Welcome to FitTrack');
  if (await wizard.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await page.getByPlaceholder('e.g. Aarsh').fill('E2E Tester');
    await page.getByPlaceholder('e.g. 104').fill('80');
    await page.getByPlaceholder('e.g. 175').fill('175');
    await page.getByRole('button', { name: /Next/i }).click();
    // Step 2: gym days — click Monday, Wednesday, Friday, Saturday
    for (const day of ['Monday', 'Wednesday', 'Friday', 'Saturday']) {
      const btn = page.getByRole('button', { name: day });
      if (await btn.isVisible({ timeout: 2_000 }).catch(() => false)) await btn.click();
    }
    await page.getByRole('button', { name: /Next/i }).click();
    // Step 3: calories/macros — just accept defaults and next
    await page.getByRole('button', { name: /Next/i }).click();
    // Continue through remaining steps
    const nextBtn = page.getByRole('button', { name: /Next|Finish|Start/i });
    while (await nextBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    }
    // Wait for FitTrack heading to confirm wizard is complete
    await page.getByRole('heading', { name: 'FitTrack' }).waitFor({ timeout: 15_000 });
  }

  await page.context().storageState({ path: authFile });
});
