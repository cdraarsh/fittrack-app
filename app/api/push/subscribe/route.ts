import { NextRequest, NextResponse } from 'next/server';
import { OWNER_ID } from '@/lib/owner';
import { createClient } from '@supabase/supabase-js';
import { validSubscription, type WebPushBody } from '@/lib/server/push';

export const dynamic = 'force-dynamic';


function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  const userId = OWNER_ID;

  let body: WebPushBody;
  try {
    body = (await req.json()) as WebPushBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!validSubscription(body)) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  }
  // JSON only: a cross-site form post (text/plain, urlencoded, multipart) can't replace the subscription.
  if (/text\/plain|form-urlencoded|multipart\/form-data/.test((req.headers.get('content-type') ?? '').toLowerCase())) {
    return NextResponse.json({ error: 'Expected application/json' }, { status: 415 });
  }

  const { error } = await admin()
    .from('ft_push_subscriptions')
    .upsert(
      { user_id: userId, push_type: 'web', subscription: { endpoint: body.endpoint, keys: { p256dh: body.keys.p256dh, auth: body.keys.auth } } },
      { onConflict: 'user_id' },
    );

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
