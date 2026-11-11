/**
 * Server entry points used by the API routes: wires the real dependencies
 * (Supabase service-role repo, Garmin HTTP client, AES key crypto, FIT decoder).
 * Server-only.
 */
import { createGarminClient } from './client';
import { decryptApiKey, encryptApiKey } from './crypto';
import { assertGarminConfigured, createSupabaseGarminRepo, missingGarminEnv } from './db';
import { expiryFromLifetime, expiryWarning, KEY_LIFETIME_DAYS, type ExpiryInfo } from './expiry';
import { decodeStrengthFit } from './fit';
import { syncAll, syncUser, type SyncDeps, type SyncResult } from './sync';
import { exchangeApiKey } from './token';

export function defaultSyncDeps(): SyncDeps {
  assertGarminConfigured();
  return {
    repo: createSupabaseGarminRepo(),
    api: createGarminClient(),
    exchangeToken: (k) => exchangeApiKey(k),
    decryptKey: (enc) => decryptApiKey(enc),
    decodeFit: decodeStrengthFit,
  };
}

export interface GarminStatus {
  configured: boolean;
  missingEnv: string[];
  connected: boolean;
  keyLast4: string | null;
  expiry: ExpiryInfo;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
}

export async function getGarminStatus(userId: string): Promise<GarminStatus> {
  const missing = missingGarminEnv();
  const base: GarminStatus = {
    configured: missing.length === 0,
    missingEnv: missing,
    connected: false,
    keyLast4: null,
    expiry: expiryWarning(null),
    lastSyncedAt: null,
    lastSyncStatus: null,
    lastSyncError: null,
  };
  if (missing.length) return base;
  const conn = await createSupabaseGarminRepo().getConnection(userId);
  if (!conn) return base;
  return {
    ...base,
    connected: true,
    keyLast4: conn.keyLast4,
    expiry: expiryWarning(conn.keyExpiresAt),
    lastSyncedAt: conn.lastSyncedAt,
    lastSyncStatus: conn.lastSyncStatus,
    lastSyncError: conn.lastSyncError,
  };
}

/** Resolve the key expiry from request input: explicit ISO date or a lifetime in days. */
export function resolveExpiry(input: { expiresAt?: unknown; expiresInDays?: unknown }, now = new Date()): string | null {
  if (typeof input.expiresAt === 'string') {
    const d = new Date(input.expiresAt);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const days = Number(input.expiresInDays);
  if ((KEY_LIFETIME_DAYS as readonly number[]).includes(days)) return expiryFromLifetime(days, now).toISOString();
  return null;
}

/** Validate the key with a live token exchange, then store it encrypted. Throws GarminAuthError on a bad key. */
export async function connectGarmin(userId: string, apiKey: string, keyExpiresAt: string | null): Promise<void> {
  assertGarminConfigured();
  const key = apiKey.trim();
  await exchangeApiKey(key);
  await createSupabaseGarminRepo().saveConnection({
    userId,
    apiKeyEnc: encryptApiKey(key),
    keyLast4: key.slice(-4),
    keyExpiresAt,
  });
}

export async function disconnectGarmin(userId: string): Promise<void> {
  assertGarminConfigured();
  await createSupabaseGarminRepo().deleteConnection(userId);
}

export async function runUserSync(userId: string): Promise<SyncResult> {
  return syncUser(userId, defaultSyncDeps());
}

export async function runAllSyncs(): Promise<SyncResult[]> {
  return syncAll(defaultSyncDeps());
}
