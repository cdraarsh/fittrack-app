# FitTrack v2

Single-user, PWA-first strength tracker. A program is a list of **numbered
sessions**; exactly one is up next and the following one unlocks only when it
is complete. Logging works fully offline. Source of truth for scope:
`PLAN_V2.md`.

## Stack

- Next.js 15 App Router, React 19, TypeScript (strict), Tailwind 3
- Clerk auth (`middleware.ts`); Supabase Postgres with RLS keyed to the Clerk
  JWT `sub` via `public.requesting_user_id()`
- Dexie (IndexedDB) local copy + outbox → Supabase (`lib/local`)
- Serwist service worker (`app/sw.ts` → generated `public/sw.js`)
- Vercel (hosting + Cron), web push (VAPID)
- Vitest (+ fake-indexeddb, PGlite for SQL), Playwright + `@clerk/testing`

## Layout

```
app/(app)/today|program|history|settings   client pages reading Dexie (offline shell)
app/sw.ts                                  service worker (precache + app-shell caches + push)
app/api/push/subscribe, api/cron/reminders web push
app/api/garmin/*, api/cron/garmin          Garmin track (lib/garmin)
app/api/insight, api/coach                 AI track (lib/ai)
components/workout/                        ExerciseBlock (set grid), SessionLogger, SwapSheet, sound.ts
components/app/                            AppShell (nav, sync engine), DailyInsight
components/settings/GarminSection.tsx      Garmin UI over the /api/garmin contract
lib/program/   templates, generate.ts (pure, deterministic), unlock.ts (state machine), completion.ts, types.ts (DB rows)
lib/exercises/ seed.ts (library source of truth), sql.ts (seed SQL generator)
lib/local/     db.ts (Dexie), outbox.ts, actions.ts (all writes), sync.ts, merge.ts, hooks.ts
lib/audio/     cues.ts (Web Audio + Audio Session), rest.ts (timestamp timer), wakeLock.ts
lib/supabase.ts  browser client with the Clerk token
supabase/migrations/20261110000000_v2_core.sql  schema, RLS, triggers, complete_session()
```

## Data flow (local-first)

1. Every write goes through `lib/local/actions.ts`: update Dexie, run the
   unlock state machine locally, enqueue the Supabase write in the outbox.
   Never write to Supabase directly from UI code.
2. The outbox flushes in order on app open, `online`, `visibilitychange`, and
   ~1.5 s after a write. Ops carry client UUIDs; upserts are idempotent
   (set_logs ids are deterministic per session_exercise + set index; program
   rows are insert-only `ON CONFLICT DO NOTHING`). Transient errors stop the
   flush; server rejections park the op as `failed` (shown in Settings).
3. Pull runs only when no ops are pending: server rows win for programs /
   sessions / session_exercises; set_logs, settings, body weights merge
   last-write-wins by `updated_at`; watch data only fills empty fields.
4. Save sets on tick or blur, never per keystroke.

## Locked progression

`locked → up_next → in_progress → complete`, one function:
`lib/program/unlock.ts#advance`, mirrored in SQL (`_refresh_unlocks`,
`complete_session`, `set_logs` guard trigger).

- Unlock: previous session complete AND (rule `immediate` OR a later local
  calendar day in `user_settings.timezone`). Default `next_calendar_day`.
- Complete: every prescribed working set (`set_index < sets`) done with reps or
  seconds; swaps count. Only via `complete_session()`; clients have no
  privilege on `program_sessions.status`.
- No skip, no reorder, no jumping ahead; missed days delay; deloads stay in
  sequence; after the last session the UI offers the next block.
- Completed sessions accept typo edits on done rows; done can't be unticked.

If you change the rule, change `unlock.ts`, the SQL functions, and both test
suites (`test/program/unlock.test.ts`, `test/db/schema.test.ts`) together.

## Commands

```bash
npm run dev            # Turbopack dev server (service worker disabled in dev)
npm run build && npm start   # production build; test offline/PWA here
npx tsc --noEmit       # typecheck
npx vitest run         # unit + SQL (PGlite) tests
npm run db:seed:gen    # regenerate the exercise seed SQL from lib/exercises/seed.ts
npm run test:e2e       # Playwright (needs Clerk test user env)
```

## Conventions

- DB rows use snake_case column names end to end (`lib/program/types.ts`).
- `user_id` is `text` = Clerk `sub`; every user table has RLS on
  `requesting_user_id()`. New tables must do the same.
- Pure logic (program, unlock, matcher, cue scheduling) lives in `lib/` with
  Vitest tests; UI stays thin.
- Migrations are append-only; never edit an applied migration.
- Exercise library changes: edit `lib/exercises/seed.ts`, run
  `npm run db:seed:gen`, commit both.
- Garmin keys and AI keys stay server-side.
- Audio: never set `navigator.audioSession.type` to `playback` or
  `transient-solo`, and never loop silent audio.
