// @vitest-environment node
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { mintOwnerToken, TOKEN_TTL_S, TokenNotConfiguredError } from '@/lib/auth/supabaseToken';
import { OWNER_ID } from '@/lib/owner';

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString());

describe('mintOwnerToken', () => {
  it('signs an HS256 JWT for the owner that Supabase RLS can read', () => {
    const now = Date.UTC(2026, 10, 10, 12);
    const { token, expiresAt } = mintOwnerToken(now, 'test-secret');
    const [h, b, sig] = token.split('.');
    expect(decode(h)).toEqual({ alg: 'HS256', typ: 'JWT' });
    const claims = decode(b);
    expect(claims).toMatchObject({ sub: OWNER_ID, role: 'authenticated', aud: 'authenticated' });
    expect(claims.exp - claims.iat).toBe(TOKEN_TTL_S);
    expect(expiresAt).toBe(claims.exp * 1000);
    expect(sig).toBe(createHmac('sha256', 'test-secret').update(`${h}.${b}`).digest('base64url'));
  });

  it('throws a not-configured error without a secret', () => {
    expect(() => mintOwnerToken(Date.now(), '')).toThrow(TokenNotConfiguredError);
  });
});
