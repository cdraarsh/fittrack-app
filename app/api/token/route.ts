import { NextResponse } from 'next/server';
import { mintOwnerToken, TokenNotConfiguredError } from '@/lib/auth/supabaseToken';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET → short-lived Supabase JWT for the single owner (no sign-in). */
export async function GET() {
  try {
    return NextResponse.json(mintOwnerToken(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof TokenNotConfiguredError) {
      return NextResponse.json({ error: 'not_configured', missingEnv: ['SUPABASE_JWT_SECRET'] }, { status: 503 });
    }
    throw e;
  }
}
