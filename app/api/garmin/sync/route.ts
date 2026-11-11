import { NextResponse } from 'next/server';
import { OWNER_ID } from '@/lib/owner';
import { GarminNotConfiguredError } from '@/lib/garmin/errors';
import { runUserSync } from '@/lib/garmin/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/** POST → "Sync now" for the owner. */
export async function POST() {
  const userId = OWNER_ID;
  try {
    const result = await runUserSync(userId);
    const status =
      result.status === 'not_connected' ? 404
      : result.status === 'auth_error' ? 401
      : result.status === 'error' ? 502
      : 200;
    return NextResponse.json(result, { status });
  } catch (e) {
    if (e instanceof GarminNotConfiguredError) {
      return NextResponse.json(
        { error: 'not_configured', message: 'Garmin sync is not configured on the server yet.', missingEnv: e.missing },
        { status: 503 },
      );
    }
    console.error('[garmin/sync]', e);
    return NextResponse.json({ error: 'sync_failed' }, { status: 500 });
  }
}
