import { test as setup } from '@playwright/test';
import { clerk } from '@clerk/testing/playwright';
import path from 'node:path';

const authFile = path.join(__dirname, '.auth/user.json');

setup('authenticate', async ({ page }) => {
  await page.goto('/');
  await clerk.signIn({
    page,
    signInParams: {
      strategy: 'password',
      identifier: process.env.E2E_CLERK_USER_USERNAME!,
      password: process.env.E2E_CLERK_USER_PASSWORD!,
    },
  });
  await page.goto('/dashboard');
  await page.context().storageState({ path: authFile });
});
