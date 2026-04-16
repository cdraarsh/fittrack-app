import { NextRequest, NextResponse } from 'next/server';
import { streamText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { auth } from '@clerk/nextjs/server';
import { COACH_SYSTEM_PROMPT, buildCoachUserMessage } from '@/lib/aiCoach';
import type { CoachContext } from '@/lib/aiCoach';

export const maxDuration = 60;

const MAX_TURNS = 3;

export async function POST(req: NextRequest) {
  try {
    // Auth — never trust userId from the request body
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json() as {
      message: string;
      turnCount: number;
      context: CoachContext;
    };

    const { message, turnCount, context } = body;

    // Server-side turn enforcement (client also enforces for UX)
    if (turnCount >= MAX_TURNS) {
      return NextResponse.json(
        { error: 'Session limit reached. Come back tomorrow.' },
        { status: 429 }
      );
    }

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const result = streamText({
      model: anthropic('claude-sonnet-4-6'),
      messages: [
        {
          role: 'system',
          // Static portion cached — pays 0.1x on repeated calls
          content: COACH_SYSTEM_PROMPT,
          providerOptions: {
            anthropic: { cacheControl: { type: 'ephemeral' } },
          },
        },
        {
          role: 'user',
          content: buildCoachUserMessage(message, context),
        },
      ],
      maxOutputTokens: 300,
      onError({ error }) {
        console.error('[coach] stream error:', error);
      },
      onFinish({ usage }) {
        console.log('[coach] finish', { userId, turnCount, usage });
      },
    });

    return result.toTextStreamResponse();
  } catch (err) {
    console.error('[coach] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Something went wrong' },
      { status: 500 }
    );
  }
}
