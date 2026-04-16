import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Web Push body (existing)
interface WebPushBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// Native push body (Android FCM / iOS APNs)
interface NativePushBody {
  type: 'native';
  platform: 'android' | 'ios';
  token: string;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as WebPushBody | NativePushBody;

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let row: Record<string, unknown>;

  if ('type' in body && body.type === 'native') {
    // Native push (FCM / APNs)
    if (!body.token || !body.platform) {
      return NextResponse.json({ error: 'Invalid native push body' }, { status: 400 });
    }
    row = {
      user_id:         userId,
      push_type:       'native',
      native_token:    body.token,
      native_platform: body.platform,
      subscription:    null,
    };
  } else {
    // Web Push (VAPID)
    const wb = body as WebPushBody;
    if (!wb.endpoint) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
    }
    row = {
      user_id:         userId,
      push_type:       'web',
      subscription:    wb,
      native_token:    null,
      native_platform: null,
    };
  }

  const { error } = await supabaseAdmin
    .from('ft_push_subscriptions')
    .upsert(row, { onConflict: 'user_id' });

  if (error) {
    console.error('[push/subscribe] DB error:', error);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  await supabaseAdmin
    .from('ft_push_subscriptions')
    .delete()
    .eq('user_id', userId);

  return NextResponse.json({ ok: true });
}
