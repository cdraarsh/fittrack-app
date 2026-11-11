/**
 * Personal API key → OAuth2 access token (24 h, no refresh token).
 * A fresh token is requested for every sync; nothing is cached.
 */
import { GARMIN_PATHS, garminBaseUrl } from './endpoints';
import { GarminAuthError, GarminHttpError } from './errors';

export interface GarminAccessToken {
  accessToken: string;
  /** When the token expires (≤ 24 h, or earlier if the API key expires first). */
  expiresAt: Date;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const DAY_MS = 24 * 60 * 60 * 1000;

function jwtExp(token: string): number | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const json = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { exp?: unknown };
    return typeof json.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
}

/** Parse the token response body. Plain-text JWT (reference client) or JSON. */
export function parseTokenResponse(body: string, now: Date = new Date()): GarminAccessToken {
  const text = body.trim();
  let accessToken = text;
  let expiresInS: number | null = null;
  if (text.startsWith('{')) {
    const j = JSON.parse(text) as Record<string, unknown>;
    const t = j.access_token ?? j.accessToken ?? j.token;
    if (typeof t !== 'string' || !t) throw new Error('Garmin token response had no access token');
    accessToken = t;
    const e = j.expires_in ?? j.expiresIn;
    if (typeof e === 'number') expiresInS = e;
  } else if (text.startsWith('"')) {
    accessToken = JSON.parse(text) as string;
  }
  if (!accessToken) throw new Error('Garmin token response was empty');

  const exp = jwtExp(accessToken);
  const expiresAt =
    exp != null
      ? new Date(exp * 1000)
      : new Date(now.getTime() + (expiresInS != null ? expiresInS * 1000 : DAY_MS));
  return { accessToken, expiresAt };
}

/**
 * Exchange the API key for an access token.
 * Throws GarminAuthError on 401/403 (bad / deleted / expired key).
 */
export async function exchangeApiKey(
  apiKey: string,
  opts: { fetch?: FetchLike; now?: Date } = {},
): Promise<GarminAccessToken> {
  const key = apiKey.trim();
  if (!key) throw new GarminAuthError(400, 'Empty Garmin API key');
  const f = opts.fetch ?? fetch;
  const path = GARMIN_PATHS.token;
  const res = await f(`${garminBaseUrl()}${path}`, {
    method: 'POST',
    headers: { Accept: '*/*', Authorization: `ApiKey ${key}` },
    cache: 'no-store',
  });
  const body = await res.text();
  if (res.status === 401 || res.status === 403) throw new GarminAuthError(res.status);
  if (!res.ok) throw new GarminHttpError(res.status, path, body);
  return parseTokenResponse(body, opts.now);
}
