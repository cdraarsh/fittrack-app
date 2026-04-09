import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

webpush.setVapidDetails(
  process.env.VAPID_EMAIL!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export async function GET(req: NextRequest) {
  // Protect with CRON_SECRET (set in Vercel env + vercel.json bearer check)
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const todayName = DAY_NAMES[new Date().getUTCDay()];

  // Fetch all subscriptions with their settings
  const { data: subs, error } = await supabaseAdmin
    .from('ft_push_subscriptions')
    .select('user_id, subscription');

  if (error || !subs?.length) {
    return NextResponse.json({ sent: 0 });
  }

  // Fetch settings for all subscribed users
  const userIds = subs.map(s => s.user_id);
  const { data: settingsRows } = await supabaseAdmin
    .from('ft_settings')
    .select('user_id, data')
    .in('user_id', userIds);

  const settingsMap = new Map(
    (settingsRows ?? []).map(r => [r.user_id, r.data])
  );

  let sent = 0;
  const results = await Promise.allSettled(
    subs.map(async ({ user_id, subscription }) => {
      const settings = settingsMap.get(user_id);
      if (!settings?.gymDays?.includes(todayName)) return;

      const payload = JSON.stringify({
        title: 'Time to train',
        body: "Today's a gym day — open FitTrack to log your workout.",
        tag: 'workout-reminder',
        url: '/dashboard',
      });

      await webpush.sendNotification(subscription, payload);
      sent++;
    })
  );

  // Log any send failures for Sentry to pick up
  results.forEach(r => {
    if (r.status === 'rejected') console.error('push send failed:', r.reason);
  });

  return NextResponse.json({ sent });
}
