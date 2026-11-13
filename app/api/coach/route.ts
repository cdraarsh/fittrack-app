// /api/coach — coach chat on Today.
// GET  → recent messages + today's cap status.
// POST { message } → streamed plain-text reply. Read-only tools, single owner (no sign-in),
// persisted to coach_messages, daily user-message cap enforced server-side.

import { NextRequest, NextResponse } from 'next/server';
import { stepCountIs, streamText } from 'ai';
import { getAuthedSupabase } from '@/lib/ai/db';
import {
  COACH_HISTORY_LIMIT,
  MAX_COACH_MESSAGE_CHARS,
  checkDailyCap,
  countUserMessagesOn,
  resolveDailyCap,
  toModelHistory,
  parseCoachContext,
  formatCoachContext,
} from '@/lib/ai/coach';
import {
  createCoachDataSource,
  insertCoachMessage,
  listCoachMessages,
  loadStatsInput,
  loadUserSettings,
} from '@/lib/ai/loader';
import { buildCoachSystem } from '@/lib/ai/prompts';
import { createFallbackModel, getProviderChain } from '@/lib/ai/providers';
import { ruleBasedInsight } from '@/lib/ai/rules';
import { buildStatsPack, localDate } from '@/lib/ai/stats';
import { createCoachTools } from '@/lib/ai/tools';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'private, no-store' };

async function capStatus(db: SupabaseClient, userId: string) {
  const settings = await loadUserSettings(db, userId);
  const tz = settings?.timezone;
  const today = localDate(new Date(), tz);
  // 36h window covers "today" in any timezone; the exact day is filtered in code.
  const sinceIso = new Date(Date.now() - 36 * 3600_000).toISOString();
  const recent = await listCoachMessages(db, userId, { sinceIso, limit: 500 });
  const cap = checkDailyCap(countUserMessagesOn(recent, today, tz), resolveDailyCap(settings));
  return { today, cap };
}

export async function GET() {
  const authed = await getAuthedSupabase();
  if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { userId, db } = authed;
  try {
    const [{ cap }, messages] = await Promise.all([capStatus(db, userId), listCoachMessages(db, userId, { limit: 30 })]);
    return NextResponse.json(
      {
        messages: messages.map(m => ({ id: m.id, role: m.role, content: m.content, created_at: m.created_at })),
        ...cap,
        available: getProviderChain().length > 0,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error('[coach] GET error:', err);
    return NextResponse.json({ error: 'Could not load coach history' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authed = await getAuthedSupabase();
  if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { userId, db } = authed;

  const body = (await req.json().catch(() => null)) as { message?: unknown; context?: unknown } | null;
  const liveContext = formatCoachContext(parseCoachContext(body?.context));
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  if (message.length > MAX_COACH_MESSAGE_CHARS) {
    return NextResponse.json({ error: `Keep it under ${MAX_COACH_MESSAGE_CHARS} characters` }, { status: 400 });
  }

  try {
    const { today, cap } = await capStatus(db, userId);
    if (!cap.allowed) {
      return NextResponse.json(
        { error: `Daily coach limit reached (${cap.cap}). Back tomorrow.`, ...cap },
        { status: 429, headers: NO_STORE },
      );
    }

    const pack = buildStatsPack(await loadStatsInput(db, userId, today));
    const providers = getProviderChain();
    if (providers.length === 0) {
      // No key configured: answer with the rule-based summary; not persisted or counted.
      const text = `The coach is offline right now (no AI provider configured). Today's summary:\n${ruleBasedInsight(pack)}`;
      return new Response(text, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'x-coach-fallback': 'no-provider', ...NO_STORE },
      });
    }

    const history = toModelHistory(await listCoachMessages(db, userId, { limit: COACH_HISTORY_LIMIT - 1 }));
    await insertCoachMessage(db, userId, { role: 'user', content: message });

    const model = createFallbackModel(providers, {
      onFallback: (label, e) => console.warn(`[coach] ${label} failed, falling back:`, e instanceof Error ? e.message : e),
    });

    const result = streamText({
      model,
      system: buildCoachSystem(pack, liveContext),
      messages: [...history, { role: 'user', content: message }],
      tools: createCoachTools(userId, createCoachDataSource(db, today)),
      stopWhen: stepCountIs(5),
      maxRetries: 0,
      maxOutputTokens: 1200,
      onError({ error }) {
        console.error('[coach] stream error:', error);
      },
      async onFinish({ steps }) {
        const text = steps.map(s => s.text).join('').trim();
        if (!text) return;
        const toolCalls = steps.flatMap(s => s.toolCalls.map(c => ({ toolName: c.toolName, input: c.input })));
        try {
          await insertCoachMessage(db, userId, {
            role: 'assistant',
            content: text.slice(0, 8000),
            tool_calls: toolCalls.length ? { model: model.lastUsed, calls: toolCalls } : { model: model.lastUsed },
          });
        } catch (err) {
          console.error('[coach] persist assistant failed:', err);
        }
      },
    });

    return result.toTextStreamResponse({
      headers: { 'x-coach-remaining': String(cap.remaining - 1), ...NO_STORE },
    });
  } catch (err) {
    console.error('[coach] POST error:', err);
    return NextResponse.json({ error: 'Coach is unavailable right now' }, { status: 500 });
  }
}
