// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { generateText, stepCountIs } from 'ai';
import type { LanguageModelV3GenerateResult } from '@ai-sdk/provider';
import { MockLanguageModelV3, mockValues } from 'ai/test';
import { COACH_TOOL_NAMES, createCoachTools, type CoachDataSource } from '@/lib/ai/tools';
import { textResult, usage } from './fixtures';

function fakeDs(): CoachDataSource & { calls: { method: string; userId: string; args: unknown }[] } {
  const calls: { method: string; userId: string; args: unknown }[] = [];
  const rec = (method: string) => async (userId: string, args: unknown) => {
    calls.push({ method, userId, args });
    return method === 'sessionSets' ? null : method === 'exerciseHistory' ? { exercise: 'Bench Press', entries: [] } : [];
  };
  return {
    calls,
    exerciseHistory: vi.fn(rec('exerciseHistory')) as CoachDataSource['exerciseHistory'],
    sessionSets: vi.fn(rec('sessionSets')) as CoachDataSource['sessionSets'],
    garminDailies: vi.fn(rec('garminDailies')) as CoachDataSource['garminDailies'],
    bodyweightTrend: vi.fn(rec('bodyweightTrend')) as CoachDataSource['bodyweightTrend'],
  };
}

const opts = { toolCallId: 't', messages: [] };

describe('coach tools', () => {
  it('exposes exactly the four read-only tools', () => {
    const tools = createCoachTools('user_a', fakeDs());
    expect(Object.keys(tools).sort()).toEqual([...COACH_TOOL_NAMES].sort());
    for (const name of Object.keys(tools)) {
      expect(name).not.toMatch(/skip|unlock|complete|edit|update|delete|write|log(?!ged)|set(?!s)/i);
    }
  });

  it('requires a user', () => {
    expect(() => createCoachTools('', fakeDs())).toThrow();
  });

  it('binds every call to the authenticated user, ignoring any user id in the input', async () => {
    const ds = fakeDs();
    const tools = createCoachTools('user_a', ds);
    const evil = { userId: 'user_b', user_id: 'user_b' };
    await tools.getExerciseHistory.execute!({ exercise: 'bench', weeks: 8, ...evil } as never, opts);
    await tools.getSessionSets.execute!({ seq: 3, ...evil } as never, opts);
    await tools.getGarminDailies.execute!({ from: '2026-11-01', to: '2026-11-10', ...evil } as never, opts);
    await tools.getBodyweightTrend.execute!({ days: 28, ...evil } as never, opts);
    expect(ds.calls).toHaveLength(4);
    expect(ds.calls.every(c => c.userId === 'user_a')).toBe(true);
    expect(JSON.stringify(ds.calls.map(c => c.args))).not.toContain('user_b');
  });

  it('clamps ranges', async () => {
    const ds = fakeDs();
    const tools = createCoachTools('user_a', ds);
    await tools.getGarminDailies.execute!({ from: '2025-01-01', to: '2026-11-10' }, opts);
    expect(ds.calls[0].args).toEqual({ from: '2026-08-12', to: '2026-11-10' });
    await tools.getBodyweightTrend.execute!({ days: 9999 }, opts);
    expect(ds.calls[1].args).toEqual({ days: 180 });
    await tools.getExerciseHistory.execute!({ exercise: 'squat', weeks: 500 }, opts);
    expect(ds.calls[2].args).toEqual({ exercise: 'squat', weeks: 26 });
  });

  it('end to end through the SDK: model-supplied user id is stripped by the schema', async () => {
    const ds = fakeDs();
    // mockValues: the array form of doGenerate is off by one in this ai/test version.
    const next = mockValues<LanguageModelV3GenerateResult>(
        {
          content: [
            {
              type: 'tool-call',
              toolCallId: 'c1',
              toolName: 'getBodyweightTrend',
              input: JSON.stringify({ days: 14, userId: 'user_b' }),
            },
          ],
          finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
          usage,
          warnings: [],
        },
        textResult('Your weight is stable.'),
    );
    const model = new MockLanguageModelV3({ doGenerate: async () => next() });
    const res = await generateText({
      model,
      prompt: 'how is my weight?',
      tools: createCoachTools('user_a', ds),
      stopWhen: stepCountIs(3),
    });
    expect(res.text).toBe('Your weight is stable.');
    expect(ds.calls).toEqual([{ method: 'bodyweightTrend', userId: 'user_a', args: { days: 14 } }]);
    // Tool definitions sent to the model carry no user field.
    const sent = JSON.stringify(model.doGenerateCalls[0].tools);
    expect(sent).not.toMatch(/user_?id/i);
  });
});
