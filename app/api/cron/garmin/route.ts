import { NextRequest, NextResponse } from 'next/server';
import { GarminNotConfiguredError } from '@/lib/garmin/errors';
import { runAllSyncs } from '@/lib/garmin/service';
import { isCronAuthorized } from '@/lib/server/cronAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/** Vercel Cron: GET with `Authorization: Bearer $CRON_SECRET`. Syncs every Garmin connection. */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const results = await runAllSyncs();
    return NextResponse.json({
      users: results.length,
      ok: results.filter((r) => r.status === 'ok').length,
      results: results.map((r) => ({ status: r.status, error: r.error, activities: r.activities, dailies: r.dailies })),
    });
  } catch (e) {
    if (e instanceof GarminNotConfiguredError) {
      return NextResponse.json({ skipped: true, error: 'not_configured', missingEnv: e.missing });
    }
    console.error('[cron/garmin]', e);
    return NextResponse.json({ error: 'cron_failed' }, { status: 500 });
  }
}
