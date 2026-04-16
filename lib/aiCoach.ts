// ─── AI Coach — system prompt + context builder ──────────────────────────────
// The prompt is the product. Edit voice and guardrails here, not in the route.

export interface CoachContext {
  name: string;
  weekNum: number;
  totalWeeks: number;
  phase: string;
  completionRate: number;   // 0–100, last 7 days
  avgCals: number;          // average daily kcal logged this week
  targetCals: number;       // their gym-day calorie target
  isGymDay: boolean;
  trigger: CoachTrigger;
}

export type CoachTrigger =
  | 'missed_workout'
  | 'end_of_week'
  | 'phase_transition'
  | 'calorie_streak_broken'
  | 'user_initiated';

// Static portion — eligible for prompt caching (never changes between users)
export const COACH_SYSTEM_PROMPT = `You are a knowledgeable gym friend — not a generic AI assistant. You give specific, direct, encouraging advice without being fake. You think like someone who has trained for years and has watched dozens of friends start and quit.

Your job is to answer the one question the user is actually asking — not give a lecture. Two or three sentences is often the right length. Never bullet-point a casual question. Talk like a person.

HARD RULES — never break these, no exceptions:
- If the user describes pain, injury, or joint issues: say "sounds like one for a physio, not a gym friend" and stop.
- Never recommend a specific supplement, protein brand, or pre-workout.
- Never suggest eating below 1200 kcal/day.
- Never give medical or prescription advice.
- Never diagnose. Observe and redirect.

When the user says they feel like skipping: don't motivate them with platitudes. Ask what they feel like doing and scale accordingly — half session, just warmup, walk instead. Something beats nothing.

Keep answers to 2–4 sentences unless the question clearly needs more. Short answers are a feature.`;

// Dynamic portion — user context injected per request
export function buildCoachContextBlock(ctx: CoachContext): string {
  return `User context:
- Name: ${ctx.name}
- Week ${ctx.weekNum} of ${ctx.totalWeeks} (${ctx.phase})
- Last 7 days: ${ctx.completionRate}% workout completion rate
- Average calories this week: ${ctx.avgCals} kcal vs target ${ctx.targetCals} kcal
- Today is ${ctx.isGymDay ? 'a gym day' : 'a rest day'}
- Session triggered by: ${TRIGGER_LABELS[ctx.trigger]}`;
}

export function buildCoachUserMessage(message: string, ctx: CoachContext): string {
  return `${buildCoachContextBlock(ctx)}\n\nUser message: "${message}"`;
}

const TRIGGER_LABELS: Record<CoachTrigger, string> = {
  missed_workout:        'missed workout (gym day, no sets logged, past 9pm)',
  end_of_week:           'end of week check-in',
  phase_transition:      'phase transition',
  calorie_streak_broken: 'calorie streak broken',
  user_initiated:        'user tapped to ask a question',
};

// Opening message the coach card shows before the user types
export const TRIGGER_OPENERS: Record<CoachTrigger, string> = {
  missed_workout:
    "Looks like you haven't logged a workout today. Still planning to go, or is today becoming a rest day?",
  end_of_week:
    "Week's almost done — you showed up. Quick check-in: how's the energy been?",
  phase_transition:
    "You're entering a new phase of your program. The weights go up from here. Ready?",
  calorie_streak_broken:
    "You've been consistent with logging — noticed a gap today. Everything okay?",
  user_initiated:
    "What's on your mind?",
};
