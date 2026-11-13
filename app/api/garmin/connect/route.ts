import { NextRequest, NextResponse } from 'next/server';
import { OWNER_ID } from '@/lib/owner';
import { GarminAuthError, GarminHttpError, GarminNotConfiguredError } from '@/lib/garmin/errors';
import { connectGarmin, disconnectGarmin, getGarminStatus, resolveExpiry } from '@/lib/garmin/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function notConfigured(e: GarminNotConfiguredError) {
  return NextResponse.json(
    { error: 'not_configured', message: 'Garmin sync is not configured on the server yet.', missingEnv: e.missing },
    { status: 503 },
  );
}

/** GET → connection status (never returns the key). */
export async function GET() {
  const userId = OWNER_ID;
  try {
    return NextResponse.json(await getGarminStatus(userId));
  } catch (e) {
    console.error('[garmin/connect GET]', e);
    return NextResponse.json({ error: 'status_failed' }, { status: 500 });
  }
}

/** POST { apiKey, expiresAt? | expiresInDays? (30|90|180|365) } → test token, store encrypted. */
export async function POST(req: NextRequest) {
  const userId = OWNER_ID;

  let body: { apiKey?: unknown; expiresAt?: unknown; expiresInDays?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  if (!apiKey || apiKey.length > 4096) {
    return NextResponse.json({ error: 'missing_api_key' }, { status: 400 });
  }

  try {
    const expiry = resolveExpiry(body);
    if (body?.expiresAt !== undefined && expiry === null) {
      return NextResponse.json({ error: 'Key expiry must be a date in the next year' }, { status: 400 });
    }
    await connectGarmin(userId, apiKey, expiry);
    return NextResponse.json(await getGarminStatus(userId));
  } catch (e) {
    if (e instanceof GarminNotConfiguredError) return notConfigured(e);
    if (e instanceof GarminAuthError) {
      return NextResponse.json(
        { error: 'invalid_key', message: 'Garmin rejected this API key. Check it was copied fully and has not expired.' },
        { status: 400 },
      );
    }
    if (e instanceof GarminHttpError) {
      return NextResponse.json({ error: 'garmin_unavailable', status: e.status }, { status: 502 });
    }
    console.error('[garmin/connect POST]', e);
    return NextResponse.json({ error: 'connect_failed' }, { status: 500 });
  }
}

/** DELETE → remove the stored key. Synced activities/dailies are kept. */
export async function DELETE() {
  const userId = OWNER_ID;
  try {
    await disconnectGarmin(userId);
    return NextResponse.json({ connected: false });
  } catch (e) {
    if (e instanceof GarminNotConfiguredError) return notConfigured(e);
    console.error('[garmin/connect DELETE]', e);
    return NextResponse.json({ error: 'disconnect_failed' }, { status: 500 });
  }
}
