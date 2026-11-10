// Server-only: mints a Supabase JWT for the single owner (no sign-in).
// Signed HS256 with the project's JWT secret (Supabase → Settings → JWT Keys →
// legacy JWT secret). Anyone who can reach /api/token gets this token, so
// protect a public deployment at the edge (e.g. Vercel Deployment Protection).
import { createHmac } from 'node:crypto';
import { OWNER_ID } from '@/lib/owner';

export const TOKEN_TTL_S = 60 * 60;

export class TokenNotConfiguredError extends Error {
  constructor() {
    super('SUPABASE_JWT_SECRET is not set');
  }
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString('base64url');

export function signJwt(payload: Record<string, unknown>, secret: string): string {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

export function mintOwnerToken(now = Date.now(), secret = process.env.SUPABASE_JWT_SECRET): { token: string; expiresAt: number } {
  if (!secret) throw new TokenNotConfiguredError();
  const iat = Math.floor(now / 1000);
  const exp = iat + TOKEN_TTL_S;
  const token = signJwt({ sub: OWNER_ID, role: 'authenticated', aud: 'authenticated', iat, exp }, secret);
  return { token, expiresAt: exp * 1000 };
}
