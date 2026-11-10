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

  // Wait until we land on Today (middleware passed, session established).
  await page.waitForURL('**/today', { timeout: 30_000 });

  await page.context().storageState({ path: authFile });
});
