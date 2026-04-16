# FitTrack Changelog

## v1.7.0 — 2026-04-16

### Added
- **AI Coach** — context-aware coaching card on the Today tab. Appears automatically on four triggers: missed workout (gym day, no sets logged, past 9pm), end-of-week check-in (Sunday), phase transition (first day of new training phase), and calorie streak broken (3+ days logged, nothing today, past 7pm). Up to 3 turns per session. Streams responses from Claude with prompt caching on the system prompt.
- **Food Search API** (`/api/food/search`) — server-side food search backed by a Supabase `ft_foods` table. Hits local DB first (seeded Indian staples + cached results), falls back to Open Food Facts with a 4s timeout. Results cached in Supabase automatically.
- **Serving size support** in FoodSearch — toggle between grams and unit-based entry (e.g. "1 roti", "2 eggs") when a food has a serving unit defined.
- **Supabase food migrations** — `ft_foods` table with 50+ Indian staple entries, serving size columns, and index on `name`.

### Changed
- **Tab bar** — icons added to all tabs (Zap, Dumbbell, Apple, TrendingUp) with label below; touch target increased to 48px.
- **Phase icons** — replaced emoji with Lucide SVG icons (Layers, TrendingUp, Flame, Trophy) for consistent rendering across platforms.
- **Exercise set buttons** — replaced emoji checkmarks with Lucide `Check`/`Circle` icons; swap button uses `ArrowLeftRight` instead of `⇄`.
- **Plan generation** — migrated from `generateText` to `streamObject` for streaming structured output with prompt caching on the system prompt.

### Fixed
- Phase transition coach card no longer fires all 7 days of the transition week — restricted to the first day of the program week only.
- TextDecoder final flush added to coach streaming loop — prevents dropped non-ASCII characters at stream end.
- User PII removed from `generate-plan` server logs.

---

## v1.6.2 — 2026-04-07

### Delete Account Data
- New Danger Zone section in Settings tab
- Two-step confirmation — user must type `DELETE` to activate the button
- Permanently deletes all Supabase rows (`ft_settings`, `ft_days`, `ft_weights`, `ft_photos`) and all storage files from the private progress-photos bucket
- Signs the user out after successful deletion
- Error toast + safe fallback if deletion fails

### PWA Service Worker Fix
- Bumped cache name to `fittrack-v1.6` to bust stale caches on existing devices
- HTML pages now use network-first strategy — new deployments always reach the network
- `_next/static/` assets remain cache-first (content-hashed, safe to cache long-term)
- Clerk, Supabase, and API routes are network-only (never cached)

---

## v1.6.0 — 2026-04-07

### AI-Powered Onboarding
- New 6-step onboarding wizard collects age, gender, primary goal, target weight, activity level outside gym, training experience, and diet preferences
- After gym day selection, Claude (claude-sonnet-4.6 via Vercel AI Gateway) generates a fully personalised plan:
  - Precise TDEE using Mifflin-St Jeor equation (with age + gender)
  - Calorie targets split by gym day / rest day
  - Protein, carbs, and fat breakdown tailored to goal
  - Cardio prescription (gym days + rest days + weekly steps target)
  - Nutrition principles specific to the user's diet style
  - Foods to prioritise and foods to limit
  - Top 3 habits to nail in week 1
  - Phase-by-phase targets across the full program
- AI-generated targets replace the old TDEE estimate for calorie/macro settings
- If AI generation fails, wizard falls back to TDEE estimate with auto/manual override
- Raw profile and AI plan saved to `ft_settings` for future personalisation features

### New Files
- `app/api/generate-plan/route.ts` — server-side route using Vercel AI SDK (`generateText` + `Output.object`)
- `lib/aiPlan.ts` — expert system prompt, prompt builder, and `generateAIPlan()` client helper

### Types
- Added `AIPlan`, `UserProfile`, `OnboardingProfile` to `lib/types.ts`
- `Settings` now includes optional `aiPlan` and `userProfile` fields

---

## v1.5.0

- Dynamic program length: 8 / 10 / 12 / 16 / 20 weeks (quartile-based phases)
- Food search via Open Food Facts API
- Meal templates
- Calorie bank (7-day budget vs actual)
- Progress photos (private Supabase Storage, 1-year signed URLs)
- Share card (`navigator.share()`)
- Coach notes (per-week textarea)
- PR detection, streak tracking, weekly check-ins

## v1.3.0

- Friday check-in v2 (sessions, energy, diet adherence, weekly goal)
- Streaks: day streak + week streak
- Weekly summary card
- Measurements tracking (waist, chest, arms, hips)

## v1.0.0

- Initial release: 4-day Upper/Lower program, nutrition tracking, weight log, progress tab
