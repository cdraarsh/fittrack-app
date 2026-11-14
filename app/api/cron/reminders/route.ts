import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { isCronAuthorized } from '@/lib/server/cronAuth';
import { dayInfo } from '@/lib/program/days';
import { advance, type SessionNode } from '@/lib/program/unlock';

export const dynamic = 'force-dynamic';

/** Local reminder window. Vercel Hobby runs a cron once a day: vercel.json
 *  schedules 01:30 UTC (07:00 in India); other zones get it only if that lands
 *  in the morning there. */
const REMINDER_HOURS = { from: 6, to: 11 } as const;

function localParts(timeZone: string, now: Date): { hour: number } {
  const f = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' });
  const parts = Object.fromEntries(f.formatToParts(now).map((p) => [p.type, p.value]));
  return { hour: Number(parts.hour) % 24 };
}

/**
 * Morning web-push reminder on any day a session
 * is actually waiting (up next or unfinished). Never on a locked day, a
 * finished block, or a day already trained. Expired subscriptions are removed.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapid = [process.env.VAPID_EMAIL, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY];
  if (!url || !key || vapid.some((v) => !v)) return NextResponse.json({ skipped: true, error: 'not_configured' });

  const db = createClient(url, key, { auth: { persistSession: false } });
  webpush.setVapidDetails(vapid[0]!.includes(':') ? vapid[0]! : `mailto:${vapid[0]}`, vapid[1]!, vapid[2]!);

  const { data: subs, error } = await db.from('ft_push_subscriptions').select('user_id, subscription').eq('push_type', 'web');
  if (error || !subs?.length) return NextResponse.json({ sent: 0 });

  const userIds = subs.map((s) => s.user_id as string);
  const [{ data: settingsRows }, { data: programs }] = await Promise.all([
    db.from('user_settings').select('user_id, timezone, unlock_rule').in('user_id', userIds),
    db.from('programs').select('id, user_id, status').in('user_id', userIds).eq('status', 'active'),
  ]);
  const settings = new Map((settingsRows ?? []).map((r) => [r.user_id as string, r]));
  const activeIds = (programs ?? []).map((p) => p.id as string);
  const { data: sessionRows } = activeIds.length
    ? await db
        .from('program_sessions')
        .select('id, user_id, program_id, seq, title, template_key, status, unlocked_at, started_at, completed_at')
        .in('program_id', activeIds)
        .order('seq', { ascending: true })
    : { data: [] as Record<string, unknown>[] };

  // Unlocks are applied lazily (when the app opens), so the DB can still say
  // "locked" the morning after a session. Run the app's own rule (advance) over
  // the active program to find what is really waiting today; nothing is written.
  const now = new Date();
  const waiting = new Map<string, SessionNode & { title: string | null; template_key: string }>();
  for (const userId of userIds) {
    const s = settings.get(userId);
    const rows = (sessionRows ?? []).filter((r) => r.user_id === userId) as unknown as (SessionNode & { title: string | null; template_key: string })[];
    if (!s || !rows.length) continue;
    const r = advance(rows, { type: 'refresh' }, { rule: s.unlock_rule ?? 'next_calendar_day', timeZone: s.timezone || 'UTC', now });
    if (r.current) waiting.set(userId, r.current);
  }

  let sent = 0;
  const errors: string[] = [];
  await Promise.allSettled(
    subs.map(async (sub) => {
      const s = settings.get(sub.user_id);
      const session = waiting.get(sub.user_id);
      if (!s || !session || !sub.subscription?.endpoint) return;
      const { hour } = localParts(s.timezone || 'UTC', now);
      // Already trained today (possible with the 'immediate' rule): no nudge.
      const tz = s.timezone || 'UTC';
      const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
      const trainedToday = (sessionRows ?? []).some(
        (r) => r.user_id === sub.user_id && typeof r.completed_at === 'string' && day(new Date(r.completed_at)) === day(now),
      );
      if (trainedToday) return;
      if (hour < REMINDER_HOURS.from || hour >= REMINDER_HOURS.to) return;
      const label = dayInfo(session).label;
      const payload = JSON.stringify({
        title: session.status === 'in_progress' ? 'Finish your session' : 'Time to train',
        body: session.status === 'in_progress' ? `${label} is waiting to be finished.` : `${label} is up next.`,
        tag: 'workout-reminder',
        url: '/today',
      });
      try {
        await webpush.sendNotification(sub.subscription, payload);
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        // Gone: drop exactly this endpoint (a newer subscription saved meanwhile survives).
        if (code === 404 || code === 410)
          await db.from('ft_push_subscriptions').delete().eq('user_id', sub.user_id).eq('subscription->>endpoint', sub.subscription.endpoint);
        else errors.push(String(err));
      }
    }),
  );

  if (errors.length) console.error('[cron/reminders] errors:', errors);
  return NextResponse.json({ sent, errors: errors.length });
}
