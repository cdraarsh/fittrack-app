import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export const dynamic = 'force-dynamic';

/** Weekday (0 = Sunday) of `now` in the given IANA time zone. */
function weekdayIn(timeZone: string, now = new Date()): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

/**
 * Daily web-push reminder for users whose preferred training days include today
 * (in their own time zone). Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  const { data: subs, error } = await db
    .from('ft_push_subscriptions')
    .select('user_id, subscription')
    .eq('push_type', 'web');
  if (error || !subs?.length) return NextResponse.json({ sent: 0 });

  const { data: settingsRows } = await db
    .from('user_settings')
    .select('user_id, preferred_days, timezone')
    .in('user_id', subs.map((s) => s.user_id));
  const settings = new Map((settingsRows ?? []).map((r) => [r.user_id as string, r]));

  const payload = JSON.stringify({
    title: 'Time to train',
    body: 'Your next session is up — open FitTrack to log it.',
    tag: 'workout-reminder',
    url: '/today',
  });

  let sent = 0;
  const errors: string[] = [];
  await Promise.allSettled(
    subs.map(async (sub) => {
      const s = settings.get(sub.user_id);
      if (!s || !sub.subscription?.endpoint) return;
      const days: number[] = s.preferred_days ?? [];
      if (!days.includes(weekdayIn(s.timezone || 'UTC'))) return;
      try {
        await webpush.sendNotification(sub.subscription, payload);
        sent++;
      } catch (err) {
        errors.push(String(err));
      }
    }),
  );

  if (errors.length) console.error('[cron/reminders] errors:', errors);
  return NextResponse.json({ sent, errors: errors.length });
}
