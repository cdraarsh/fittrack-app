# FitTrack QA Plan

> **Owner:** Aarsh
> **Last updated:** 2026-04-08
> **Scope:** FitTrack PWA (Next.js 15 App Router + Clerk + Supabase) at `/Users/aarsh/Documents/fittrack`
> **Goal:** Catch regressions before they reach production with a layered, automatable test strategy.

---

## 1. Test Pyramid Overview

```
            /\
           /  \        Manual exploratory + beta users
          /----\
         /  E2E \      Playwright (critical user flows)
        /--------\
       / Integr.  \    Route handlers + Supabase (real DB)
      /------------\
     /   Unit       \  Vitest + RTL (pure logic, components)
    /----------------\
```

| Layer | Tool | Target coverage | Runs |
|---|---|---|---|
| Unit | Vitest + RTL | 70% of `lib/` + component logic | Every commit |
| Integration | Vitest + local Supabase | All API routes + RLS | Every commit |
| E2E | Playwright + Clerk testing | 8 critical flows | Every PR |
| PWA | Lighthouse CI | PWA ≥ 90, Perf ≥ 80, A11y ≥ 90 | Every PR |
| Load | k6 | 100 concurrent users | Weekly / pre-release |
| Security | RLS tests + `npm audit` + OWASP ZAP | All tables, all deps | Every PR + weekly |
| Monitoring | Sentry + PostHog | 100% of prod | Always-on |

---

## 2. Critical User Flows (must-have E2E)

These are the flows that, if broken, make the app unusable. **All 8 must pass before deploy.**

1. **Sign-in** — Clerk email/password → redirect to `/dashboard`
2. **Onboarding** — new user completes `OnboardingWizard` → `ft_settings.onboarded = true`
3. **Log a workout set** — open Workouts tab → mark set done → persists to `ft_days.wo`
4. **Log a meal** — Nutrition tab → Food Search (Open Food Facts) → add to today → calories update
5. **Log weight** — Progress tab → add entry → appears in chart, persists to `ft_weights`
6. **Upload progress photo** — Progress tab → upload → signed URL renders → persists to `ft_photos`
7. **Water + checklist toggles** — Today tab → 3 glasses + sleep + no-sugar → reload → state persists
8. **Offline mode** — service worker caches shell, dashboard renders offline, writes queue on reconnect

---

## 3. Layer-by-Layer Plan

### 3.1 Unit tests (Vitest + React Testing Library)

**Priority targets in `lib/`:**
- `lib/utils.ts` — `getWeekNum`, `getTargets`, `getPhaseInfo`, `getProgramWeeks`, `computeWeeklySummary`, `todayIsGymDay`, `isWoDone`, `getWorkoutMap`
- `lib/constants.ts` — program templates, phase boundaries
- `lib/store.ts` — Zustand-style store reducers (mock Supabase)

**Component targets:**
- `components/streaks/StreakCard` — streak math
- `components/nutrition/CalorieBank` — 7-day rolling calc
- `components/checkin/FridayCheckIn` — gated rendering

**Setup:**
```bash
npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react
```

Add `vitest.config.ts` with `jsdom` environment and a `test/setup.ts` that mocks `@clerk/nextjs` and `@supabase/supabase-js`.

**Coverage target:** 70% of `lib/` (the pure logic), best-effort for components.

---

### 3.2 Integration tests (real Supabase)

**Why real, not mocked:** RLS policies are the biggest source of silent bugs. Mocking the Supabase client bypasses them entirely.

**Setup:**
```bash
# Spin up local Supabase
supabase start
# Seed with migrations + fixture users
supabase db reset
```

**Test areas:**
- **API routes in `app/api/**`** — call them with a forged Clerk JWT, assert response shape
- **RLS cross-user isolation** — user A must not read/write user B's `ft_days`, `ft_weights`, `ft_photos`
- **Storage policies** — only the owner can generate signed URLs for `progress-photos/<userId>/*`
- **Onboarding gate** — deleting `ft_settings` row re-triggers wizard

**Runtime:** Vitest in a separate `npm run test:integration` script, pointed at `SUPABASE_URL=http://localhost:54321`.

---

### 3.3 E2E tests (Playwright) — **already scaffolded**

**Location:** `/Users/aarsh/Documents/fittrack/e2e/`

**Existing specs (`dashboard.spec.ts`):**
- Dashboard loads
- Tab switching (Today ↔ Workouts ↔ Nutrition ↔ Progress)
- Log water
- Toggle sleep
- Session notes
- Offline service worker

**To add:**
- `workout.spec.ts` — open Workouts tab, complete an exercise set, verify persistence via reload
- `nutrition.spec.ts` — search food via Open Food Facts, add meal, assert calorie bank updates
- `weight.spec.ts` — add weight entry in Progress, verify chart renders
- `photo.spec.ts` — upload a fixture image, assert signed URL image renders
- `onboarding.spec.ts` — second Clerk user with no `ft_settings`, walk the wizard end-to-end
- `share-card.spec.ts` — click "Share", assert `navigator.share` is called (mock it)

**Run targets:**
- `npm run test:e2e` — local, against `localhost:3000`
- `PLAYWRIGHT_BASE_URL=https://fittrack-app-neon.vercel.app npm run test:e2e` — against preview/prod

**Test data hygiene:** Use a dedicated Clerk test user (`e2e-test@…`) with a known `user_id`. Add a Playwright `globalTeardown` that truncates `ft_days`, `ft_weights`, `ft_photos` for that user after each run.

---

### 3.4 PWA-specific testing

**Lighthouse CI:**
```bash
npm i -D @lhci/cli
```
Add `lighthouserc.json`:
- `categories:pwa >= 0.9`
- `categories:performance >= 0.8`
- `categories:accessibility >= 0.9`
- `categories:best-practices >= 0.9`

Run in GitHub Actions against every Vercel preview URL.

**Manual PWA checks (pre-release):**
- Install prompt fires on Android Chrome + iOS Safari
- Manifest icons render on home screen (192, 512, maskable)
- `navigator.share()` works on mobile (share card)
- Standalone mode hides browser chrome

**Offline checks (automated via Playwright):**
- `context.setOffline(true)` → reload → shell renders
- Writes queued offline → reconnect → writes sync
- Stale data shows "offline" badge

---

### 3.5 Load / stress testing

**Tool:** k6 (or Artillery).

**Scenarios:**
| Scenario | VUs | Duration | Target |
|---|---|---|---|
| Baseline read | 50 | 5 min | dashboard read path |
| Sustained write | 100 | 10 min | log meal + set + weight |
| Spike | 10 → 500 → 10 | 5 min | autoscaling behavior |

**Watch:**
- Supabase connection pool (upgrade to pooler if pegged)
- Vercel function cold starts (Fluid Compute should smooth this)
- p95 latency on `/api/*` routes
- RLS overhead on large `ft_days` tables

**Seed:** Create a test user with 5,000 `ft_days` rows and 500 weight entries before running.

---

### 3.6 Security testing

**RLS policy tests (integration layer):**
- Signed-in as user A, attempt SELECT/INSERT/UPDATE/DELETE on user B's rows → must 403
- Signed-in as user A, attempt to generate signed URL for `progress-photos/<userB>/*.jpg` → must fail
- Unauthenticated requests to protected routes → must 401

**Dependency scanning:**
- `npm audit --audit-level=high` in CI
- Dependabot / Snyk for auto PRs

**Auth edge cases:**
- Expired Clerk session → redirect to sign-in, no crash
- Clerk webhook replay → idempotent user creation

**Dynamic scanning:**
- OWASP ZAP baseline scan against preview URL (weekly cron)

---

### 3.7 Chaos / edge case matrix

| Scenario | Expected behavior |
|---|---|
| Slow 3G throttle | All flows complete within 15s, skeleton loaders shown |
| Network drop mid-save | Optimistic UI rolls back OR write queues, no data loss |
| Log workout at 23:59 → check at 00:01 | Streak increments correctly, no double-count |
| Timezone change mid-session | Day boundary recalculates cleanly |
| 5,000 workouts for one user | List virtualizes or paginates, no freeze |
| Clerk down | Graceful error page, not a blank screen |
| Supabase down | Read-only mode from cache, clear banner |
| Switch program length 16 → 8 weeks mid-program | Phase recalculates, no orphan data |
| Friday check-in on non-Friday | Does not render |
| Gym day config changes | `todayIsGymDay` + targets recalculate |

Each row → dedicated test or manual checklist item.

---

### 3.8 Monitoring (production)

**Sentry (`@sentry/nextjs`):**
- Capture all unhandled errors client + server
- Source maps uploaded per deploy
- Alert on error rate > 1% per hour
- Tag events with `user.id` (Clerk) for reproducibility

**PostHog:**
- Session replays for anonymized users
- Funnel: land → sign-in → onboard → log first workout
- Feature flags for risky rollouts

**Vercel Analytics:**
- Core Web Vitals on every route
- Alert on LCP regression > 20%

---

## 4. Test Data Strategy

**Dev database:** Shared with E2E — cheap, fast, but requires cleanup.

**E2E test user:**
- Email: `e2e-test@fittrack.local`
- Pre-seeded `ft_settings` with `onboarded = true`, 16-week program, 4 gym days
- Pre-seeded `ft_days` for the last 7 days (some complete, some partial)
- Cleanup: `globalTeardown` DELETE WHERE user_id = <e2e user> for `ft_days`, `ft_weights`, `ft_photos`, `ft_meal_templates`

**Fixtures:**
- `e2e/fixtures/progress-photo.jpg` — 800×1000 test image
- `e2e/fixtures/food-barcode.json` — mocked Open Food Facts response

---

## 5. CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/qa.yml
name: QA
on: [pull_request]

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - checkout
      - setup-node
      - npm ci
      - npm run test:unit

  integration:
    runs-on: ubuntu-latest
    services:
      supabase: { image: supabase/postgres }
    steps:
      - checkout
      - npm ci
      - supabase start
      - npm run test:integration

  e2e:
    runs-on: ubuntu-latest
    needs: [unit, integration]
    steps:
      - checkout
      - npm ci
      - npx playwright install chromium
      - name: Wait for Vercel preview
        uses: patrickedqvist/wait-for-vercel-preview@v1
      - run: PLAYWRIGHT_BASE_URL=${{ steps.preview.outputs.url }} npm run test:e2e

  lighthouse:
    runs-on: ubuntu-latest
    needs: e2e
    steps:
      - checkout
      - npm ci
      - npx lhci autorun --collect.url=${{ steps.preview.outputs.url }}
```

**Gating rules:**
- Unit + Integration must pass → blocks merge
- E2E must pass → blocks merge
- Lighthouse thresholds → warning only (for now)
- Security scan → weekly cron, creates issues

---

## 6. Release QA Checklist (pre-prod deploy)

- [ ] All CI jobs green
- [ ] Manual smoke test on Android Chrome (PWA install + offline)
- [ ] Manual smoke test on iOS Safari (PWA install + share card)
- [ ] Lighthouse PWA ≥ 90 on preview
- [ ] Sentry error rate stable for 24h on preview
- [ ] Supabase migration (if any) dry-run on staging branch
- [ ] Rollback plan documented
- [ ] Post-deploy: watch Sentry + Vercel Analytics for 1h

---

## 7. Current Status

| Layer | Status |
|---|---|
| Unit tests | ❌ Not set up |
| Integration tests | ❌ Not set up |
| E2E (Playwright) | ✅ Scaffolded 2026-04-08 — 7 tests in `e2e/dashboard.spec.ts` |
| Lighthouse CI | ❌ Not set up |
| Load tests | ❌ Not set up |
| Security (RLS) | ⚠️ Relies on Supabase policy correctness, untested |
| Sentry | ❌ Not installed |
| PostHog | ❌ Not installed |

---

## 8. Next Steps (in priority order)

1. **Finish Playwright specs** — add workout, nutrition, weight, photo, onboarding flows
2. **Install Sentry** — `npx @sentry/wizard@latest -i nextjs`
3. **Add Lighthouse CI** — cheap insurance on PWA + perf budgets
4. **Add Vitest for `lib/utils.ts`** — high-value pure logic, no infra needed
5. **Local Supabase integration tests** — catch RLS bugs before prod
6. **k6 baseline load test** — know your ceiling before users find it
