import { NextRequest, NextResponse } from 'next/server';
import { GarminNotConfiguredError } from '@/lib/garmin/errors';
import { runAllSyncs } from '@/lib/garmin/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/** Vercel Cron: GET with `Authorization: Bearer $CRON_SECRET`. Syncs every Garmin connection. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
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
