import { NextRequest } from 'next/server';
import { streamObject } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { PLAN_SYSTEM_PROMPT, buildPlanUserPrompt } from '@/lib/aiPlan';
import type { OnboardingProfile } from '@/lib/types';

export const maxDuration = 300;

const AIPlanSchema = z.object({
  daily_targets: z.object({
    gym_day_calories: z.number(),
    rest_day_calories: z.number(),
    protein_g: z.number(),
    carbs_g_gym: z.number(),
    carbs_g_rest: z.number(),
    fat_g: z.number(),
  }),
  tdee_estimate: z.number(),
  weekly_weight_change_target_kg: z.number(),
  expected_weight_in_program_end_kg: z.number(),
  cardio_recommendation: z.object({
    gym_days: z.string(),
    rest_days: z.string(),
    weekly_steps_target: z.number(),
  }),
  nutrition_principles: z.array(z.string()),
  foods_to_prioritize: z.array(z.string()),
  foods_to_limit: z.array(z.string()),
  deficit_strategy: z.string(),
  habit_priorities: z.array(z.string()),
  program_notes: z.string(),
  workout_plan: z.object({
    days: z.array(z.object({
      day_label: z.string(),
      focus: z.string(),
      exercises: z.array(z.object({
        id: z.string(),
        name: z.string(),
        sets: z.number(),
        reps_low: z.number(),
        reps_high: z.number(),
        rest: z.string(),
        starting_load_kg: z.number().nullable(),
        coaching_cue: z.string(),
        is_timed: z.boolean(),
      })),
      cardio: z.string(),
    })),
    progression_note: z.string(),
  }),
  phase_targets: z.object({
    weeks_1_to_quarter: z.string(),
    weeks_quarter_to_half: z.string(),
    weeks_half_to_three_quarter: z.string(),
    weeks_three_quarter_to_end: z.string(),
  }),
});

export async function POST(req: NextRequest) {
  try {
    const { profile } = await req.json() as { profile: OnboardingProfile };

    if (!profile?.weight_kg || !profile?.height_cm || !profile?.age) {
      return new Response(JSON.stringify({ error: 'Incomplete profile' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const userPrompt = buildPlanUserPrompt(profile);

    console.log('[generate-plan] request', { model: 'claude-sonnet-4-6', promptLen: userPrompt.length });

    const result = streamObject({
      model: anthropic('claude-sonnet-4-6'),
      schema: AIPlanSchema,
      messages: [
        {
          role: 'system',
          content: PLAN_SYSTEM_PROMPT,
          providerOptions: {
            anthropic: { cacheControl: { type: 'ephemeral' } },
          },
        },
        { role: 'user', content: userPrompt },
      ],
      onError({ error }) {
        console.error('[generate-plan] stream error:', error);
      },
      onFinish({ usage, object }) {
        console.log('[generate-plan] finish', JSON.stringify({
          usage,
          object,
        }, null, 2));
      },
    });

    return result.toTextStreamResponse();
  } catch (err) {
    console.error('[generate-plan] error:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
