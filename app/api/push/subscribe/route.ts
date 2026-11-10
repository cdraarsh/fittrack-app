import { NextRequest, NextResponse } from 'next/server';
import { OWNER_ID } from '@/lib/owner';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/** Web Push (VAPID) subscription body, as produced by PushSubscription.toJSON(). */
interface WebPushBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  const userId = OWNER_ID;

  const body = (await req.json()) as WebPushBody;
  if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  }

  const { error } = await admin()
    .from('ft_push_subscriptions')
    .upsert({ user_id: userId, push_type: 'web', subscription: body }, { onConflict: 'user_id' });

  if (error) {
    console.error('[push/subscribe] DB error:', error);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const userId = OWNER_ID;
  await admin().from('ft_push_subscriptions').delete().eq('user_id', userId);
  return NextResponse.json({ ok: true });
}
