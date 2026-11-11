# FitTrack v2 — Rebuild Plan

Source of truth for the v2 rebuild. Full version with diagrams: https://claude.ai/artifact/TZS3Zn7WUYKDMJ9YN44VC7

## Goal and scope

PWA-first rebuild on the existing Next.js 15 + Supabase + Vercel skeleton (Clerk removed: no sign-in, single owner). Five features only:

1. **Garmin Connect** — watch strength sets, cardio, sleep and recovery data flow in without retyping.
2. **Data logging** — set-by-set logging that works offline and syncs later.
3. **Suggested days, locked** — the app always shows the next session; the one after unlocks only when this one is complete. No skipping.
4. **Exercise set** — one exercise library, mapped to Garmin exercise categories so watch sets match.
5. **Daily insight + AI coach** — context-aware, on free model APIs.

Done = open the installed app in airplane mode, log a full session, see the next one unlock, and see watch sets + recovery data appear on their own.

Work on a `v2` branch. Tag `v1.7.0` on main first.

## Keep / rebuild / park

| Area | v1 today | v2 |
| --- | --- | --- |
| Framework | Next.js 15 App Router, React 19, TS, Tailwind | Keep |
| Auth | Clerk + `middleware.ts` | Removed: app opens directly; `/api/token` mints a Supabase JWT for the single owner |
| DB client | `lib/supabase.ts` (Clerk JWT → Supabase) | Keep pattern with owner JWT; new schema |
| Hosting/jobs | Vercel + Cron (`vercel.json`) | Keep; cron runs Garmin sync |
| Web push | `web-push` + VAPID + `/api/push/subscribe` | Keep web part only |
| Tests/CI | Vitest, Playwright, Lighthouse CI, `qa.yml` | Keep |
| Service worker | hand-written `public/sw.js` (no offline pages) | Replace with Serwist; whole app shell offline |
| App state | one context, saves whole-day JSON every keystroke | Local-first: Dexie (IndexedDB) + sync outbox |
| Workout data | `ft_days` JSON per date, tied to weekday names | Normalized tables keyed by session number |
| Exercises | 23 + `SWAP_MAP` in `lib/constants.ts` | Library table seeded from these |
| Set logger UI | `ExerciseBlock` grid, rest timer, +2.5 kg hint | Keep layout; rewire to new store |
| AI | onboarding plan + coach | Rebuild as daily insight + coach (Feature 5) |
| Park (delete on v2) | Capacitor android/ios, `push-native.ts`, FCM/APNs, nutrition + `ft_foods`, photos, share card, streaks, check-ins, coach notes, manual recovery | — |

Rewrite `CLAUDE.md` / `AGENTS.md` (currently GitNexus boilerplate) for v2.

## Architecture

Phone holds the working copy; server is backup + Garmin bridge.

- Phone (installed PWA): Logger/Today UI → Dexie (IndexedDB) → sync outbox; Serwist caches app shell.
- Supabase: Postgres + RLS (owner JWT `sub`), `complete_session()` enforces no-skip.
- Vercel: Garmin sync job (cron + "Sync now"), insight/coach routes. Garmin key and AI keys never reach the browser.
- Garmin: watch → Garmin Connect → Personal API (pull only).

The unlock rule is ONE pure function (`lib/program/unlock.ts`) used on phone and mirrored in SQL; offline the phone unlocks, server confirms on sync.

```
app/
  (app)/today/  program/  history/  settings/
  api/garmin/connect/route.ts   # save key, test token
  api/garmin/sync/route.ts      # "Sync now"
  api/cron/garmin/route.ts      # scheduled pull
  api/insight/route.ts          # daily insight
  api/coach/route.ts            # coach chat
  api/push/subscribe/route.ts   # kept from v1
lib/
  local/      # Dexie schema, outbox, sync loop, hooks
  program/    # templates, session generator, unlock rule (pure, tested)
  garmin/     # token, API client, FIT decode, set matcher
  exercises/  # library types + seed
  ai/         # stats pack, provider chain, prompts, tools
supabase/migrations/
```

## Feature 1: Garmin Connect

Use Garmin's **Personal API**: no approval step, own account only, read-only ("pull only"). Covers Activity data (JSON + .FIT), Health data (JSON), Women's Health. Cannot push workouts to the watch (Training API is business-tier only). Not for multi-user commercial apps.

- Key created on Garmin Connect web; expiry 30/90/180/365 days; shown once.
- `POST https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token` with header `Authorization: ApiKey <key>` → OAuth2 access token, 24 h, no refresh token (request a new one each sync).
- Docs: https://developer.garmin.com/gc-developer-program/personal/personal-api , FAQ: https://developer.garmin.com/gc-developer-program/personal/personal-faq/ . Endpoints, rate limits, history window and which health fields exist are in Garmin's Swagger docs — **verify in Phase 0**.

Flow:
1. User pastes key in Settings → stored encrypted server-side; warn 7 days before expiry.
2. Sync job gets a fresh token, pulls activities + daily health since last sync.
3. Strength activity → download .FIT → decode with `@garmin/fitsdk` → read `set` messages (repetitions, weight, duration, set_type active/rest, category, category_subtype).
4. Matcher fills empty set rows, marked source `watch`.
5. Cardio activity → session cardio done + duration + avg HR.
6. Dailies (sleep, resting HR, HRV, Body Battery, stress, steps) → readiness strip + day suggestion.

Tip for users: the FIT file keeps only what the watch recorded; build each day template once in Garmin Connect's workout builder with the mapped names and start it on the watch.

## Feature 2: Data logging

- Every write goes to Dexie first, then an outbox (client-generated UUIDs → idempotent upserts).
- Outbox flushes on app open, `online`, `visibilitychange` (Safari has no Background Sync).
- Conflicts: last write wins by `updated_at`; watch data only fills empty fields.
- `navigator.storage.persist()` on first launch.
- Recorded: set (weight kg, reps or seconds, done, optional RPE, logged at, source app/watch); session (started/completed at, cardio, notes, swaps); day (bodyweight, readiness snapshot).
- Logger: prefill last weight for the exercise, reps placeholder = target range; tick saves + starts rest timer (save on tick/blur, not each keystroke); +2.5 kg hint when all sets hit top of range; swap within swap group counts; completed session editable for typos but done sets can't be unticked.
- Sound cues on set changes (set ticked, rest 3-2-1, rest over, next exercise, session complete) that must be heard over music playing on the iPhone: Web Audio tones, `navigator.audioSession.type = 'transient'` during a cue to duck the music, back to `'ambient'` after (never pause it). Timestamp-based rest timer + Screen Wake Lock while a session is in progress (a locked PWA can't play sounds on time). Settings: on/off, volume, test sound. Verify ducking and silent-switch behaviour on a real iPhone.

## Feature 3: Suggested days, locked

Program = numbered sessions, not weekdays. Exactly one session is Up next. States: `locked → up_next → in_progress → complete`.

- `locked → up_next`: previous session complete AND (rule `immediate` OR a later local calendar day). Default rule: `next_calendar_day`.
- `up_next → in_progress`: first set logged.
- `in_progress → complete`: every prescribed working set done with reps/seconds. Swaps count; matched watch sets count.
- No skip button, no reordering, no jumping ahead. Future sessions preview-only. Missed calendar days delay, never skip. Deloads stay in sequence. After the last session, offer the next block.
- Enforced twice: UI locks + server `complete_session()` refuses incomplete sessions; RLS/trigger rejects set_logs for sessions not `up_next`/`in_progress` (except typo fixes on done rows of a complete session).
- Suggestion: Today shows "Day N · <title> is up next" and recommends train/rest from preferred days + Garmin readiness vs personal baseline. Advice only.

## Feature 4: Exercise set

- `exercises` table: name, pattern, equipment, is_timed, rep_lo, rep_hi, swap_group, garmin_category, garmin_subtype.
- Seed from v1's 23 exercises + SWAP_MAP alternates until the user's list arrives (keep seed data-driven).
- Matching watch sets (active sets only, per session): 1) exact category+subtype; 2) category unique in session; 3) order fallback; 4) leftovers → "From watch, needs review" tray. Fill empty rows only.

## Feature 5: Daily insight + AI coach

One server-side agent reading a **stats pack**. Code computes every number; the model only writes words.

- Stats pack (~1–2K tokens): program position (session N/total, week, phase, days since last), last session top sets + misses, trends (e1RM main lifts 4 wks, weekly sets per muscle group, adherence), Garmin recovery vs 7-day/28-day baselines, bodyweight 7-day avg + change.
- Daily insight: first open each day, ≤3 lines (readiness, today's session + target loads, one trend). Generated after morning Garmin sync or on first open; cached in `daily_insights` (1 request/day). Rule-based fallback offline/on failure.
- Coach: chat on Today (rebuild v1 `CoachCard` + `lib/aiCoach.ts` streaming on the Vercel AI SDK). Read-only tools: exercise history, session sets, Garmin dailies range, bodyweight trend. May suggest swaps/deloads; cannot skip/unlock sessions or edit logs. Stored in `coach_messages`; daily message cap in Settings.
- Provider chain (switch on 429):
  1. Groq `openai/gpt-oss-120b` — free 30 RPM, 1K RPD, 8K TPM, 200K TPD; no training. Default. (`@ai-sdk/groq`, `GROQ_API_KEY`)
  2. OpenRouter free models e.g. `nvidia/nemotron-3-ultra-550b-a55b:free` — 20 RPM, 50/day (1K/day after $10 credits); disable training in settings. (`OPENROUTER_API_KEY`)
  3. Gemini Flash-Lite/Flash free — last resort or off: free-tier prompts used to improve Google products and may be human-reviewed outside EEA/UK/CH. (`GOOGLE_GENERATIVE_AI_API_KEY`)
- Verify tool calling with gpt-oss-120b on Groq free tier in Phase 0.

## Data model (12 tables)

| Table | Key fields |
| --- | --- |
| `exercises` | id, name, pattern, equipment, is_timed, rep_lo, rep_hi, swap_group, garmin_category, garmin_subtype |
| `programs` | user_id, name, start_date, sessions_per_week, weeks, status |
| `program_sessions` | program_id, user_id, seq, week, template_key, title, status, unlocked_at, completed_at |
| `session_exercises` | session_id, user_id, exercise_id, position, sets, rep_lo, rep_hi, rest_s, target_kg |
| `set_logs` | id (client uuid), session_exercise_id, user_id, set_index, weight_kg, reps, seconds, rpe, done, source, garmin_activity_id, updated_at |
| `garmin_connections` | user_id, api_key (encrypted), key_expires_at, last_synced_at |
| `garmin_activities` | garmin_activity_id, type, start_time, duration_s, avg_hr, fit_path, matched_session_id |
| `garmin_dailies` | date, sleep_s, resting_hr, hrv, body_battery, stress_avg, steps |
| `body_weights` | user_id, date, kg |
| `user_settings` | user_id, preferred_days, units, timezone, unlock_rule |
| `daily_insights` | user_id, date, text, stats_pack, model |
| `coach_messages` | user_id, role, content, tool_calls, created_at |

RLS on every user table keyed to the JWT `sub` (single owner). `complete_session(session_id)` Postgres function validates and unlocks; the client never sets `status` directly.

## Build phases (each ends with a check)

0. **Reset + Garmin spike** — v2 branch, tag v1.7.0, strip parked features; Personal API key; decode one strength .FIT. Check: real watch sets read from a .FIT file.
1. **Data foundation** — schema + RLS, exercise library seed, session generator. Check: a full numbered program generates.
2. **Offline logging** — Dexie + outbox, Serwist, logger UI. Check: full session logged in airplane mode syncs when back online.
3. **Locked progression** — states, `complete_session()` + guard, Today "up next". Check: Day N+1 can't be opened/logged until Day N is complete.
4. **Garmin sync** — key storage, sync job + cron, dailies, FIT decode, matcher + review tray. Check: a watch session shows up matched.
5. **Insight, coach, polish** — stats pack, daily insight, coach with tools, readiness suggestion, push reminders, Lighthouse PWA pass.

## Open questions (defaults in brackets)

- Exercise list to match — names, sets × reps, which day. [v1's 23 exercises]
- Program shape. [4-day split Upper A / Lower A / Upper B / Lower B, 16 weeks = 64 sessions]
- When the next session opens. [next calendar day]
- What counts as complete. [every prescribed set, swaps allowed]
- Garmin watch model; OK to create a Personal API key (renew ≤ yearly)?
- Single user? [yes — Personal API is own-account only]
- AI keys: Groq / OpenRouter / Gemini? [Groq; Gemini off]
- Bring v1 history across? [start fresh]
