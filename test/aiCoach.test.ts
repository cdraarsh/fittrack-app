import { describe, it, expect } from 'vitest';
import {
  buildCoachContextBlock,
  buildCoachUserMessage,
  TRIGGER_OPENERS,
  COACH_SYSTEM_PROMPT,
} from '@/lib/aiCoach';
import type { CoachContext } from '@/lib/aiCoach';

const baseCtx: CoachContext = {
  name: 'Alex',
  weekNum: 4,
  totalWeeks: 12,
  phase: 'Build',
  completionRate: 75,
  avgCals: 2100,
  targetCals: 2400,
  isGymDay: true,
  trigger: 'user_initiated',
};

describe('buildCoachContextBlock', () => {
  it('includes name, week, and phase', () => {
    const block = buildCoachContextBlock(baseCtx);
    expect(block).toContain('Alex');
    expect(block).toContain('Week 4 of 12');
    expect(block).toContain('Build');
  });

  it('includes completion rate and calorie data', () => {
    const block = buildCoachContextBlock(baseCtx);
    expect(block).toContain('75%');
    expect(block).toContain('2100');
    expect(block).toContain('2400');
  });

  it('labels gym day correctly', () => {
    const block = buildCoachContextBlock(baseCtx);
    expect(block).toContain('a gym day');
  });

  it('labels rest day correctly', () => {
    const block = buildCoachContextBlock({ ...baseCtx, isGymDay: false });
    expect(block).toContain('a rest day');
  });

  it('includes trigger label for missed_workout', () => {
    const block = buildCoachContextBlock({ ...baseCtx, trigger: 'missed_workout' });
    expect(block).toContain('missed workout');
  });

  it('includes trigger label for end_of_week', () => {
    const block = buildCoachContextBlock({ ...baseCtx, trigger: 'end_of_week' });
    expect(block).toContain('end of week');
  });

  it('includes trigger label for phase_transition', () => {
    const block = buildCoachContextBlock({ ...baseCtx, trigger: 'phase_transition' });
    expect(block).toContain('phase transition');
  });

  it('includes trigger label for calorie_streak_broken', () => {
    const block = buildCoachContextBlock({ ...baseCtx, trigger: 'calorie_streak_broken' });
    expect(block).toContain('calorie streak broken');
  });
});

describe('buildCoachUserMessage', () => {
  it('includes the user message verbatim', () => {
    const msg = buildCoachUserMessage('Should I skip today?', baseCtx);
    expect(msg).toContain('"Should I skip today?"');
  });

  it('includes the context block', () => {
    const msg = buildCoachUserMessage('How are my macros?', baseCtx);
    expect(msg).toContain('Alex');
    expect(msg).toContain('Week 4 of 12');
  });

  it('context block comes before user message', () => {
    const msg = buildCoachUserMessage('test message', baseCtx);
    const contextIdx = msg.indexOf('User context:');
    const messageIdx = msg.indexOf('User message:');
    expect(contextIdx).toBeLessThan(messageIdx);
  });
});

describe('TRIGGER_OPENERS', () => {
  it('has an opener for every trigger type', () => {
    const triggers = [
      'missed_workout',
      'end_of_week',
      'phase_transition',
      'calorie_streak_broken',
      'user_initiated',
    ] as const;
    for (const t of triggers) {
      expect(TRIGGER_OPENERS[t]).toBeTruthy();
      expect(typeof TRIGGER_OPENERS[t]).toBe('string');
    }
  });

  it('all openers are non-empty strings', () => {
    for (const opener of Object.values(TRIGGER_OPENERS)) {
      expect(opener.length).toBeGreaterThan(0);
    }
  });
});

describe('COACH_SYSTEM_PROMPT', () => {
  it('contains hard safety rules', () => {
    expect(COACH_SYSTEM_PROMPT).toContain('pain');
    expect(COACH_SYSTEM_PROMPT).toContain('1200');
  });

  it('is a non-empty string', () => {
    expect(typeof COACH_SYSTEM_PROMPT).toBe('string');
    expect(COACH_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });
});
