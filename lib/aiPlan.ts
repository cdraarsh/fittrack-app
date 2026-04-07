import type { AIPlan, OnboardingProfile } from './types';
export type { AIPlan, OnboardingProfile };

// ─── Expert system prompt ─────────────────────────────────────────────────────

export const PLAN_SYSTEM_PROMPT = `You are an expert sports dietitian and certified strength coach with 15+ years of experience building personalised transformation programs. You have deep knowledge of exercise physiology, evidence-based nutrition, and behaviour change.

When given a user profile, you will:
1. Calculate a precise TDEE using the Mifflin-St Jeor equation (accounts for age and gender — NOT the simplified BMR * 1.55 shortcut)
2. Set calorie targets based on the user's goal with a sustainable deficit or surplus
3. Set macros based on goal priority: protein to preserve/build muscle, fat minimum for hormones, carbs fill the remainder
4. Prescribe cardio that is additive but not excessive — fat loss happens at the table, not the treadmill
5. Give nutrition principles that are specific to this person's diet style and restrictions
6. Prioritise habits that have the highest impact for a beginner or intermediate lifter

Rules:
- Weight loss: target 0.4–0.7 kg/week. Never below 1200 kcal for women or 1500 kcal for men.
- Muscle gain: target 0.15–0.3 kg/week surplus. Keep deficit for recomp near 100–200 kcal.
- Protein: 1.8–2.2 g/kg of CURRENT bodyweight. Round to nearest 5g.
- Fat: minimum 0.8 g/kg bodyweight, rounded to nearest 5g. Cap at 35% of calories.
- Carbs: remainder after protein + fat calories. Round to nearest 5g.
- Gym day vs rest day: reduce rest day carbs by 30–40%, not protein or fat.
- Be specific and actionable. Vague outputs are useless.

For the workout plan, generate exactly gym_days_per_week workout days. Rules:
- Split selection by frequency:
  - 2 days: Full Body A, Full Body B
  - 3 days: Push (chest/shoulders/triceps), Pull (back/biceps), Legs
  - 4 days: Upper A (push focus), Lower A (quad focus), Upper B (pull focus), Lower B (hinge focus)
  - 5+ days: PPL + Upper + Lower
- Volume by experience:
  - Beginner: 3 sets, 4–5 exercises/day, compound-focused, higher reps (10–15)
  - Intermediate: 3–4 sets, 5–6 exercises, mix of compounds and isolation
  - Advanced: 4–5 sets, 6–7 exercises, periodised rep ranges
- Goal adjustments:
  - Weight loss: rep range 12–15, rest 45–75s, mandatory cardio 20–30 min
  - Muscle gain: rep range 6–12, rest 90–120s, light cardio 10–15 min
  - Recomp: rep range 10–12, rest 60–90s, moderate cardio 15–20 min
- Starting loads: conservative estimates based on the person's bodyweight and experience. Beginners start light.
- Exercise IDs: short snake_case strings (e.g. "bench", "squat", "rdl") — must be unique across all days.
- Coaching cues: one specific, actionable sentence per exercise.
- Cardio field: one specific prescription string (e.g. "Incline treadmill walk 12% grade 5.5 kph — 20 min").`;

export function buildPlanUserPrompt(profile: OnboardingProfile): string {
  const goalLabel = {
    weight_loss: 'Weight Loss (fat loss while preserving muscle)',
    muscle_gain: 'Muscle Gain (lean bulk)',
    recomp: 'Body Recomposition (lose fat and build muscle simultaneously)',
  }[profile.goal];

  const activityLabel = {
    sedentary: 'Sedentary (desk job, minimal walking outside of gym)',
    light: 'Lightly active (some walking, standing job)',
    moderate: 'Moderately active (physical job or daily walks)',
    active: 'Very active (physical job + daily activity)',
  }[profile.activity_outside_gym];

  const experienceLabel = {
    beginner: 'Beginner (< 1 year of consistent training)',
    intermediate: 'Intermediate (1–3 years)',
    advanced: 'Advanced (3+ years)',
  }[profile.experience];

  const dietLabel = {
    no_restriction: 'No dietary restrictions — eats everything',
    vegetarian: 'Vegetarian (no meat, eats dairy and eggs)',
    vegan: 'Vegan (no animal products)',
    keto: 'Ketogenic (very low carb, high fat)',
    high_protein: 'High-protein focus',
  }[profile.diet_style];

  const weightDelta = profile.weight_kg - profile.target_weight_kg;
  const weightGoal = profile.goal !== 'muscle_gain'
    ? `\nTarget weight: ${profile.target_weight_kg} kg (needs to ${weightDelta > 0 ? `lose ${weightDelta.toFixed(1)} kg` : `gain ${Math.abs(weightDelta).toFixed(1)} kg`})`
    : '';

  return `
User Profile:
---
Name: ${profile.name}
Age: ${profile.age} years
Gender: ${profile.gender}
Current weight: ${profile.weight_kg} kg
Height: ${profile.height_cm} cm
BMI: ${(profile.weight_kg / Math.pow(profile.height_cm / 100, 2)).toFixed(1)}
Primary goal: ${goalLabel}${weightGoal}
Program length: ${profile.program_weeks} weeks
Gym days per week: ${profile.gym_days_per_week}
Activity outside gym: ${activityLabel}
Training experience: ${experienceLabel}
Diet style: ${dietLabel}
Foods to avoid: ${profile.foods_to_avoid || 'None specified'}
---

Build a precise, personalised plan for this person. Be specific — generic outputs are useless.
`.trim();
}

// ─── Client-side call to our API route ───────────────────────────────────────

export async function generateAIPlan(profile: OnboardingProfile): Promise<AIPlan> {
  const res = await fetch('/api/generate-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Plan generation failed (${res.status})`);
  }

  const { plan } = await res.json() as { plan: AIPlan };
  return plan;
}
