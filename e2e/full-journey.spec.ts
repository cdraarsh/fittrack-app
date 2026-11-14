import { test, expect, type BrowserContext, type Page } from '@playwright/test';

/**
 * One user, end to end, every edge case we know about. Runs serially in a
 * single phone-sized browser because each step builds on the server state the
 * previous one left. Needs a production build (service worker for offline
 * reloads) and a real Supabase with a throwaway NEXT_PUBLIC_OWNER_ID.
 *
 *   E2E_FULL=1 PLAYWRIGHT_BASE_URL=http://localhost:3400 npx playwright test e2e/full-journey.spec.ts --headed
 */
test.skip(!process.env.E2E_FULL, 'full journey runs only against a prod build + real Supabase (E2E_FULL=1)');
test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let page: Page;

const toast = (re: RegExp) => page.getByText(re).last();
const outboxStatuses = () =>
  page.evaluate(
    () =>
      new Promise<string[]>((res) => {
        const q = indexedDB.open('fittrack');
        q.onsuccess = () => {
          const g = q.result.transaction('outbox').objectStore('outbox').getAll();
          g.onsuccess = () => res(g.result.map((o: { status: string }) => o.status));
        };
      }),
  );
const expectSynced = async () => {
  await expect.poll(outboxStatuses, { timeout: 60_000, message: 'outbox drains to Supabase' }).toEqual([]);
  await expect(page.getByText(/not synced/)).toHaveCount(0);
};
const goOffline = async () => {
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
};
const goOnline = async () => {
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
};
const dismissRest = async () => {
  const close = page.getByRole('button', { name: /dismiss|close rest|skip rest/i });
  if (await close.count()) await close.first().click().catch(() => {});
};
const coachDialog = () => page.getByRole('dialog', { name: 'AI coach' });
const stopDialog = () => page.getByRole('dialog', { name: 'Stop session?' });

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  // Never hit YouTube from tests; never spend AI quota on the coach.
  await context.route(/youtube|ytimg|googlevideo/, (r) => r.fulfill({ status: 204, body: '' }));
  await context.route('**/api/coach', (r) =>
    r.request().method() === 'POST'
      ? r.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', headers: { 'x-coach-remaining': '19' }, body: 'Mock coach: keep 40 kg, add 2.5 kg next time.' })
      : r.fallback(),
  );
  page = await context.newPage();
});
test.afterAll(async () => context?.close());

test('1. first launch: start the program; no Program tab; Day 1 is up next and read-only', async () => {
  await page.goto('/today');
  await expect(page.getByRole('link', { name: 'Program', exact: true })).toHaveCount(0);
  for (const name of ['Today', 'Strength', 'History', 'Settings']) await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Start program$/ }).click();
  await expect(page.getByRole('heading', { name: /Day 1 · Upper · Push is up next/ })).toBeVisible();
  await expect(page.getByText(/^Cycle 1/)).toBeVisible();
  await expect(page.getByText(/\bWeek \d/)).toHaveCount(0);
  await expect(page.getByLabel(/ set \d+ weight$/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Stop$/ })).toHaveCount(0);
  await expectSynced();
});

test('2. warm-up open before Start, cool-down closed; ticks and toggles survive reload; ramp-up shown', async () => {
  const warm = page.getByRole('button', { name: /Warm-up · ~\d+ min/ });
  const cool = page.getByRole('button', { name: /Cool-down · ~\d+ min/ });
  await expect(warm).toHaveAttribute('aria-expanded', 'true');
  await expect(cool).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText(/Empty bar|kg ×/).first()).toBeVisible();
  const firstTick = page.getByRole('checkbox').first();
  await firstTick.click();
  await expect(firstTick).toHaveAttribute('aria-checked', 'true');
  await cool.click();
  await expect(cool).toHaveAttribute('aria-expanded', 'true');
  await page.reload();
  await expect(page.getByRole('button', { name: /Cool-down · ~\d+ min/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('checkbox').first()).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: /Cool-down · ~\d+ min/ }).click();
});

test('3. video sheet: nothing loads until Play; Escape closes and returns focus; offline message', async () => {
  const yt: string[] = [];
  page.on('request', (r) => /youtube|ytimg/.test(r.url()) && yt.push(r.url()));
  const btn = page.getByRole('button', { name: /^Watch video: Flat Barbell Bench Press/ });
  await btn.click();
  const sheet = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Close video' }) });
  await expect(sheet).toBeVisible();
  expect(yt.filter((u) => /youtube-nocookie\.com\/embed/.test(u))).toHaveLength(0);
  await sheet.getByRole('button', { name: /^Play video:/ }).click();
  await expect(sheet.locator('iframe[src*="youtube-nocookie.com/embed"]')).toHaveCount(1);
  await expect(sheet.getByRole('link', { name: /Open in YouTube/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(btn).toBeFocused();

  await goOffline();
  await btn.click();
  await expect(page.getByText(/Videos need a connection/)).toBeVisible();
  await page.getByRole('button', { name: 'Close video' }).click();
  await goOnline();
});

test('4. Start: timer, inputs appear with prefilled weight; coach knows the session', async () => {
  await page.getByRole('button', { name: /^Start Day 1$/ }).click();
  await expect(page.getByRole('heading', { name: /Day 1 · Upper · Push in progress/ })).toBeVisible();
  await expect(page.getByRole('timer', { name: 'Session time' })).toBeVisible();
  await expect(page.getByLabel(/ set \d+ weight$/).first()).toHaveValue('40');
  await expect(page.getByRole('button', { name: /^Start Day 1$/ })).toHaveCount(0);

  await expect(page.getByRole('button', { name: 'Open AI coach' })).toHaveCount(1); // session bar only, no floating button
  await page.getByRole('button', { name: 'Open AI coach' }).click();
  await expect(coachDialog().getByRole('button', { name: /^What weight for Flat Barbell Bench Press\?/ })).toBeVisible();
  await expect(coachDialog().getByLabel('Message the coach')).not.toBeFocused(); // chips first, no keyboard
  await page.keyboard.press('Escape');
  await expect(coachDialog()).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open AI coach' })).toBeFocused();
});

test('5. validation: ticking without reps is refused; reps-first keeps the prefilled weight', async () => {
  await page.getByRole('button', { name: /^Tick .+ set \d+$/ }).first().click();
  await expect(toast(/Enter reps first/)).toBeVisible();
  await expect(page.getByRole('button', { name: / set \d+ done$/ })).toHaveCount(0);

  const reps = page.getByLabel(/ set \d+ reps$/).first();
  await reps.fill('8');
  await reps.blur();
  await page.getByRole('button', { name: /^Tick .+ set \d+$/ }).first().click();
  await expect(page.getByRole('button', { name: / set 1 done$/ }).first()).toBeVisible();
  await expect(page.getByText(/^Rest$/)).toBeVisible();
  await page.getByRole('button', { name: '15 seconds more rest' }).click();
  await expect(page.getByRole('button', { name: 'Open AI coach' })).toHaveCount(1);
  await page.reload();
  await expect(page.getByLabel(/ set \d+ weight$/).first()).toHaveValue('40');
  await expect(page.getByLabel(/ set \d+ reps$/).first()).toHaveValue('8');
});

test('6. Stop sheet: Escape and Keep going close it; Finish later keeps progress', async () => {
  await page.getByRole('button', { name: /^Stop$/ }).click();
  await expect(stopDialog()).toBeVisible();
  await expect(stopDialog().getByRole('button', { name: /Complete session/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(stopDialog()).toHaveCount(0);
  await page.getByRole('button', { name: /^Stop$/ }).click();
  await stopDialog().getByRole('button', { name: 'Keep going' }).click();
  await expect(stopDialog()).toHaveCount(0);
  await page.getByRole('button', { name: /^Stop$/ }).click();
  await stopDialog().getByRole('button', { name: /Finish later/ }).click();
  // Finish later = paused: heading, Resume, the timer stops, rest is cleared, progress kept.
  await expect(page.getByRole('heading', { name: /Day 1 · Upper · Push — paused/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Resume$/ })).toBeVisible();
  await expect(page.getByText(/^Rest$/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: / set 1 done$/ }).first()).toBeVisible();
  const t1 = await page.getByRole('timer', { name: 'Session time' }).innerText();
  await page.waitForTimeout(2200);
  expect(await page.getByRole('timer', { name: 'Session time' }).innerText()).toBe(t1);
  await page.reload();
  await expect(page.getByRole('heading', { name: /— paused/ })).toBeVisible();
  await page.getByRole('button', { name: /^Resume$/ }).click();
  await expect(page.getByRole('heading', { name: /Day 1 · Upper · Push in progress/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Resume$/ })).toHaveCount(0);
});

test('7. Reset needs a second confirmation, discards the set, cancels rest, and sticks after sync + reload', async () => {
  await page.getByRole('button', { name: /^Stop$/ }).click();
  await stopDialog().getByRole('button', { name: /Reset session \(started by accident\)/ }).click();
  await stopDialog().getByRole('button', { name: /Yes, discard 1 logged set and reset/ }).click();
  await expect(page.getByRole('heading', { name: /Day 1 · Upper · Push is up next/ })).toBeVisible();
  await expect(page.getByText(/^Rest$/)).toHaveCount(0);
  await expect(page.getByLabel(/ set \d+ weight$/)).toHaveCount(0);
  await expectSynced();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Day 1 · Upper · Push is up next/ })).toBeVisible();
  // Nothing logged → one-step reset.
  await page.getByRole('button', { name: /^Start Day 1$/ }).click();
  await page.getByRole('button', { name: /^Stop$/ }).click();
  await stopDialog().getByRole('button', { name: /Reset — nothing logged yet/ }).click();
  await expect(page.getByRole('heading', { name: /is up next/ })).toBeVisible();
  await expectSynced();
});

test('8. swap within the group and revert', async () => {
  await page.getByRole('button', { name: /^Start Day 1$/ }).click();
  await page.getByRole('button', { name: 'Swap exercise' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Swap exercise' });
  const alt = sheet.getByRole('button').filter({ hasNotText: /Original|Active|Cancel|Close/ }).first();
  const altName = (await alt.innerText()).split('\n')[0].trim();
  await alt.click();
  await expect(toast(new RegExp(`Swapped to ${altName.replace(/[()]/g, '.')}`))).toBeVisible();
  await expect(page.getByText(new RegExp(`^${altName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)).first()).toBeVisible();
  await expect(page.getByText(/swapped from Flat Barbell Bench Press/)).toBeVisible();
  await page.getByRole('button', { name: 'Swap exercise' }).first().click();
  await page.getByRole('dialog', { name: 'Swap exercise' }).getByRole('button').filter({ hasText: /Original/ }).click();
  await expect(toast(/Reverted to original/)).toBeVisible();
  await expect(page.getByText('Flat Barbell Bench Press', { exact: true }).first()).toBeVisible();
});

test('9. log every set, half of them offline (reload offline works), Complete only when all are done', async () => {
  const fill = async (from: number, to: number) => {
    const weights = page.getByLabel(/ set \d+ weight$/);
    const reps = page.getByLabel(/ set \d+ reps$/);
    for (let i = from; i < to; i++) {
      const w = weights.nth(i);
      if (!(await w.inputValue())) await w.fill('20');
      await reps.nth(i).fill('10');
      await reps.nth(i).blur();
    }
  };
  const tickAll = async (limit: number) => {
    const ticks = page.getByRole('button', { name: /^Tick .+ set \d+$/ });
    for (let n = 0; n < limit && (await ticks.count()) > 0; n++) {
      const b = await ticks.first().elementHandle();
      await b!.scrollIntoViewIfNeeded();
      await b!.click();
      await expect.poll(() => b!.getAttribute('aria-pressed')).toBe('true');
      await dismissRest();
    }
  };
  const total = await page.getByLabel(/ set \d+ reps$/).count();
  expect(total).toBeGreaterThan(10);
  await fill(0, total);
  await expect(page.getByRole('button', { name: /working sets? to go/ })).toBeDisabled();
  await tickAll(6);
  await expectSynced();

  await goOffline();
  await tickAll(4);
  await expect(page.getByText(/Offline/)).toBeVisible();
  await page.reload(); // served by the service worker
  await expect(page.getByRole('heading', { name: /Day 1 · Upper · Push in progress/ })).toBeVisible();
  await expect(page.getByRole('button', { name: / set \d+ done$/ })).toHaveCount(10);
  await goOnline();
  await tickAll(100);
  await expect(page.getByRole('button', { name: /^Tick .+ set \d+$/ })).toHaveCount(0);
  await expectSynced();
});

test('10. cool-down opens when all working sets are done; Stop → Complete; Day 2 locked until tomorrow', async () => {
  await expect(page.getByRole('button', { name: /Cool-down · ~\d+ min/ })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: /^Stop$/ }).click();
  await stopDialog().getByRole('button', { name: /Complete session/ }).click();
  await expect(toast(/Day 1 · Upper · Push complete/)).toBeVisible();
  await expect(page.getByText(/Unlocks/)).toBeVisible();
  await expect(page.getByRole('heading', { name: /Day 2 · Lower · Quads/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Start Day 2$/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Tick .+ set \d+$/ })).toHaveCount(0);
  await expectSynced();
  await page.reload();
  await expect(page.getByText(/Unlocks/)).toBeVisible(); // server agrees after pull
});

test('11. History: typo edit on a done set is saved; done sets cannot be unticked', async () => {
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: /Day 1 · Upper · Push/ }).click();
  const w = page.getByLabel(/ set \d+ weight$/).first();
  await w.fill('42.5');
  await w.blur();
  await expect(page.getByRole('button', { name: / set 1 done$/ }).first()).toBeDisabled();
  await expectSynced();
  await page.reload();
  await page.getByRole('button', { name: /Day 1 · Upper · Push/ }).click();
  await expect(page.getByLabel(/ set \d+ weight$/).first()).toHaveValue('42.5');
});

test('12. Strength tabs: Lifts shows progress; Garmin and Recovery explain the missing watch; arrow keys switch tabs', async () => {
  await page.getByRole('link', { name: 'Strength', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Lifts' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Flat Barbell Bench Press')).toBeVisible();
  await expect(page.getByText(/est\. 1RM kg/i).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Lifts' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Garmin workouts' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(/Garmin isn’t connected yet|No strength workouts/)).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Recovery' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(/Garmin isn’t connected yet|No recovery data/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Recovery' })).toHaveAttribute('aria-selected', 'true');
  await goOffline();
  await page.getByRole('tab', { name: 'Garmin workouts' }).click();
  await expect(page.getByText(/needs a connection/)).toBeVisible();
  await page.getByRole('tab', { name: 'Lifts' }).click();
  await expect(page.getByText('Flat Barbell Bench Press')).toBeVisible();
  await goOnline();
});

test('13. coach: chips send, reply streams in; offline send is refused politely', async () => {
  await page.getByRole('button', { name: 'Open AI coach' }).click();
  await coachDialog().getByRole('button', { name: /How is my progress\?|How are my main lifts/ }).first().click();
  await expect(coachDialog().getByText(/Mock coach: keep 40 kg/)).toBeVisible();
  await goOffline();
  await coachDialog().getByLabel('Message the coach').fill('Am I recovering?');
  await coachDialog().getByRole('button', { name: 'Send' }).click();
  await expect(coachDialog().getByText(/offline/i)).toBeVisible();
  await goOnline();
  await coachDialog().getByRole('button', { name: 'Close coach' }).click();
  await expect(coachDialog()).toHaveCount(0);
});

test('14. Settings: unlock rule → Immediately opens Day 2 now; bodyweight validation', async () => {
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Unlock rule').selectOption('immediate');
  await expectSynced();
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Day 2 · Lower · Quads is up next/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: /^Start Day 2$/ })).toBeVisible();

  const bw = page.getByLabel('Bodyweight in kg');
  await bw.fill('0');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(toast(/Enter a weight in kg/)).toBeVisible();
  await bw.fill('78.4');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(toast(/Bodyweight saved/)).toBeVisible();
  await expectSynced();
});
