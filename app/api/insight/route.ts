// GET /api/insight — today's ≤3-line insight for the signed-in user.
// Cached in daily_insights (≤1 model request per user per day); rule-based
// fallback when no AI key is configured or every provider fails.

import { NextResponse } from 'next/server';
import { getAuthedSupabase } from '@/lib/ai/db';
import { getDailyInsight } from '@/lib/ai/insight';
import { createInsightStore, loadStatsInput, loadUserSettings } from '@/lib/ai/loader';
import { getProviderChain } from '@/lib/ai/providers';
import { ruleBasedInsight } from '@/lib/ai/rules';
import { buildStatsPack, emptyStatsInput, localDate } from '@/lib/ai/stats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  const authed = await getAuthedSupabase();
  if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { userId, db } = authed;

  let today = localDate(new Date());
  try {
    const settings = await loadUserSettings(db, userId);
    today = localDate(new Date(), settings?.timezone);
    const result = await getDailyInsight({
      userId,
      today,
      store: createInsightStore(db),
      loadStats: async () => buildStatsPack(await loadStatsInput(db, userId, today)),
      providers: getProviderChain(),
      log: (msg, data) => console.warn(`[insight] ${msg}`, data instanceof Error ? data.message : data ?? ''),
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    console.error('[insight] error:', err);
    // DB unreachable: still give the client something to show.
    return NextResponse.json(
      {
        date: today,
        text: ruleBasedInsight(buildStatsPack(emptyStatsInput(today))),
        model: 'rules',
        source: 'rules',
        cached: false,
        degraded: true,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
