# Generate Plan API — V2 Improvements

**Goal:** Reduce perceived latency, tighten prompt math, keep Sonnet 4.6 quality.

**Scope:** `lib/aiPlan.ts` + `app/api/generate-plan/route.ts` + the client call site(s) that consume `generateAIPlan()`.

---

## Phase A — Prompt hardening (no schema changes)

Edit `lib/aiPlan.ts` → `PLAN_SYSTEM_PROMPT` `Rules:` block. Additions:

1. **Activity multipliers (deterministic TDEE math):**
   > To compute TDEE, multiply BMR by these exact scalars — Sedentary=1.2, Light=1.375, Moderate=1.55, Active=1.725.

2. **Deficit ceiling:**
   > Never prescribe a calorie deficit greater than 1000 kcal below TDEE, regardless of how aggressive the user's target is. If their target weight implies a larger deficit, lengthen the timeline in `program_notes`.

3. **Obese protein rule:**
   > If BMI > 30, calculate protein using TARGET bodyweight, not current bodyweight. Prevents prescribing absurd protein quantities.

4. **Chain-of-thought anchor (before output):**
   > Before producing the final JSON, silently compute: BMR (Mifflin-St Jeor), TDEE (BMR × activity scalar), goal-adjusted calories, protein g, fat g, carbs g. Do not output these steps — but the final numbers must be internally consistent with them.

**Out of scope for V2** (require schema changes, defer):
- `injuries_or_limitations` field in `OnboardingProfile`
- `fiber_g` / `hydration_ml` fields in `AIPlanSchema`

---

## Phase B — Streaming + prompt caching

Edit `app/api/generate-plan/route.ts`:

1. Swap `generateText` → `streamObject` from `ai` SDK. Return a streamed response.
2. Enable Anthropic prompt caching on `PLAN_SYSTEM_PROMPT` via `providerOptions.anthropic.cacheControl = { type: 'ephemeral' }`. System prompt is ~3KB static → high cache hit rate.
3. Keep the existing `AIPlanSchema` Zod validation.

Edit `lib/aiPlan.ts` → `generateAIPlan()`:

1. Switch from `res.json()` to stream parsing via `readStreamableValue` / SSE consumption.
2. Change return signature OR add `generateAIPlanStream()` that yields partial `AIPlan` objects.

**Client consumer** (whichever onboarding component calls `generateAIPlan`):

1. Render partial state as it streams — `daily_targets` first, then `workout_plan.days[]` as they fill in.
2. Show a progress indicator keyed to schema completeness instead of a blind spinner.

---

## Phase C — Benchmark + optional Haiku fallback (deferred)

After A+B ship, measure TTFT and total completion time with and without cache. Only if latency is still unacceptable:

- A/B test `claude-haiku-4-5-20251001` with the same prompt.
- Tighten Zod bounds (`.min() / .max()` on calories, protein, sets, reps) so a weaker model fails loudly rather than drifting.
- Fallback: if Haiku output fails schema validation, retry once on Sonnet.

---

## Verification checklist

- [ ] TDEE values from the API match a manual Mifflin-St Jeor calculation for a sample profile (±50 kcal).
- [ ] Obese profile (BMI 32+) gets protein based on target weight, not current.
- [ ] Extreme target weight (e.g. 150kg → 70kg in 12 weeks) produces a deficit ≤1000 kcal with `program_notes` flagging the timeline.
- [ ] Client shows partial content within 2s of request start (streaming check).
- [ ] Repeat call from the same deploy shows `cache_read_input_tokens > 0` in logs (caching check).
- [ ] No regression in the consecutive-day split conflict logic — generate a Mon/Tue schedule and confirm different muscle groups.

---

## Files touched

| File | Phase | Change |
|------|-------|--------|
| `lib/aiPlan.ts` | A | Add 4 rules to `PLAN_SYSTEM_PROMPT` |
| `app/api/generate-plan/route.ts` | B | `generateText` → `streamObject`, add cacheControl |
| `lib/aiPlan.ts` | B | Rewrite `generateAIPlan()` to consume stream |
| Onboarding component (TBD) | B | Render partial plan as it streams |

## Out of scope

- Adding injuries / fiber / hydration (schema change — separate PR).
- Model swap to Haiku (Phase C, deferred until benchmarked).
