# FitTrack Changelog

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
