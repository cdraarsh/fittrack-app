import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { isCronAuthorized } from '@/lib/server/cronAuth';
import { dayInfo } from '@/lib/program/days';

export const dynamic = 'force-dynamic';

/** Local reminder window. Vercel Hobby runs a cron once a day: vercel.json
 *  schedules 01:30 UTC (07:00 in India); other zones get it only if that lands
 *  in the morning there. */
const REMINDER_HOURS = { from: 6, to: 11 } as const;

function localParts(timeZone: string, now: Date): { weekday: number; hour: number } {
  const f = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: 'numeric', hourCycle: 'h23' });
  const parts = Object.fromEntries(f.formatToParts(now).map((p) => [p.type, p.value]));
  return { weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday), hour: Number(parts.hour) % 24 };
}

/**
 * Morning web-push reminder on a preferred training day, only when a session
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
  const [{ data: settingsRows }, { data: current }] = await Promise.all([
    db.from('user_settings').select('user_id, preferred_days, timezone').in('user_id', userIds),
    db
      .from('program_sessions')
      .select('user_id, seq, title, template_key, status')
      .in('user_id', userIds)
      .in('status', ['up_next', 'in_progress'])
      .order('seq', { ascending: true }),
  ]);
  const settings = new Map((settingsRows ?? []).map((r) => [r.user_id as string, r]));
  const waiting = new Map<string, { seq: number; title: string | null; template_key: string; status: string }>();
  for (const s of current ?? []) if (!waiting.has(s.user_id as string)) waiting.set(s.user_id as string, s as never);

  const now = new Date();
  let sent = 0;
  const errors: string[] = [];
  await Promise.allSettled(
    subs.map(async (sub) => {
      const s = settings.get(sub.user_id);
      const session = waiting.get(sub.user_id);
      if (!s || !session || !sub.subscription?.endpoint) return;
      const { weekday, hour } = localParts(s.timezone || 'UTC', now);
      if (!(s.preferred_days ?? []).includes(weekday)) return;
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
        if (code === 404 || code === 410) await db.from('ft_push_subscriptions').delete().eq('user_id', sub.user_id);
        else errors.push(String(err));
      }
    }),
  );

  if (errors.length) console.error('[cron/reminders] errors:', errors);
  return NextResponse.json({ sent, errors: errors.length });
}
