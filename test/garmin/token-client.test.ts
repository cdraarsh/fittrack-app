// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { buildFit } from './helpers';
import { exchangeApiKey, parseTokenResponse } from '@/lib/garmin/token';
import { createGarminClient, mergeDailies, normalizeActivity } from '@/lib/garmin/client';
import { GarminAuthError, GarminHttpError } from '@/lib/garmin/errors';
import { DEFAULT_BASE_URL, GARMIN_PATHS } from '@/lib/garmin/endpoints';
import { extractFit } from '@/lib/garmin/zip';

const b64u = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (exp: number) => `${b64u({ alg: 'none' })}.${b64u({ exp })}.sig`;

function fitBytes(): Uint8Array {
  return buildFit([{ setType: 'active', repetitions: 5, weight: 100, category: ['squat'] }]);
}

/** Minimal single-entry ZIP (deflate) for tests. */
function zip(name: string, data: Uint8Array): Uint8Array {
  const comp = deflateRawSync(data);
  const nameB = Buffer.from(name);
  const loc = Buffer.alloc(30);
  loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(8, 8);
  loc.writeUInt32LE(comp.length, 18); loc.writeUInt32LE(data.length, 22); loc.writeUInt16LE(nameB.length, 26);
  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(8, 10);
  cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(nameB.length, 28);
  cen.writeUInt32LE(0, 42);
  const cenOff = loc.length + nameB.length + comp.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cen.length + nameB.length, 12); eocd.writeUInt32LE(cenOff, 16);
  return new Uint8Array(Buffer.concat([loc, nameB, comp, cen, nameB, eocd]));
}

describe('token exchange', () => {
  it('POSTs the ApiKey header and parses a plain-text JWT', async () => {
    const exp = Math.floor(Date.UTC(2026, 10, 11) / 1000);
    const fetch = vi.fn(async () => new Response(jwt(exp), { status: 200 }));
    const t = await exchangeApiKey(' abc123 ', { fetch });
    expect(fetch).toHaveBeenCalledWith(
      `${DEFAULT_BASE_URL}${GARMIN_PATHS.token}`,
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'ApiKey abc123' }) }),
    );
    expect(t.accessToken).toBe(jwt(exp));
    expect(t.expiresAt.toISOString()).toBe('2026-11-11T00:00:00.000Z');
  });

  it('parses JSON bodies and falls back to 24 h', () => {
    const now = new Date('2026-11-10T00:00:00Z');
    expect(parseTokenResponse('{"access_token":"opaque","expires_in":3600}', now).expiresAt.toISOString()).toBe('2026-11-10T01:00:00.000Z');
    expect(parseTokenResponse('opaque-token', now).expiresAt.toISOString()).toBe('2026-11-11T00:00:00.000Z');
  });

  it('maps 401 to GarminAuthError and 5xx to GarminHttpError', async () => {
    await expect(exchangeApiKey('k', { fetch: async () => new Response('no', { status: 401 }) })).rejects.toBeInstanceOf(GarminAuthError);
    await expect(exchangeApiKey('k', { fetch: async () => new Response('boom', { status: 503 }) })).rejects.toBeInstanceOf(GarminHttpError);
    await expect(exchangeApiKey('  ')).rejects.toBeInstanceOf(GarminAuthError);
  });
});

describe('garmin client', () => {
  it('lists activities with bearer auth, paging and normalisation', async () => {
    const calls: string[] = [];
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(url);
      expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
      return Response.json([
        { activityId: 111, activityName: 'Upper A', activityType: { typeKey: 'strength_training' }, startTimeGMT: '2026-11-09 18:02:11', duration: 3600.4, averageHR: 112 },
        { activityName: 'no id' },
      ]);
    });
    const list = await createGarminClient({ fetch }).listActivities('tok', '2026-11-01', '2026-11-10');
    expect(calls[0]).toContain(GARMIN_PATHS.activitySearch);
    expect(calls[0]).toContain('startDate=2026-11-01');
    expect(calls).toHaveLength(1); // short page → stop
    expect(list).toEqual([
      expect.objectContaining({ activityId: '111', typeKey: 'strength_training', startTime: '2026-11-09T18:02:11.000Z', durationS: 3600.4, avgHr: 112 }),
    ]);
  });

  it('downloads and unzips the FIT', async () => {
    const fit = fitBytes();
    const fetch = vi.fn(async () => new Response(Buffer.from(zip('111_ACTIVITY.fit', fit))));
    const out = await createGarminClient({ fetch }).downloadFit('tok', '111');
    expect(Buffer.from(out).equals(Buffer.from(fit))).toBe(true);
    expect(extractFit(fit)).toBe(fit); // bare FIT passes through
    await expect(createGarminClient({ fetch }).downloadFit('tok', '../x')).rejects.toThrow();
  });

  it('throws GarminAuthError on 401 from data endpoints', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 401 }));
    await expect(createGarminClient({ fetch }).listActivities('tok', 'a', 'b')).rejects.toBeInstanceOf(GarminAuthError);
  });

  it('merges dailies and tolerates a failing optional endpoint', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.includes('dailysummaries')) {
        return Response.json({ data: [{ calendarDate: '2026-11-09', totalSteps: 9000, restingHeartRate: 52, averageStressLevel: 30, bodyBatteryAtWakeTime: 80 }] });
      }
      if (url.includes('sleep')) return new Response('down', { status: 500 });
      return Response.json({ hrvSummaries: [{ calendarDate: '2026-11-09', lastNightAvg: 61 }] });
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const d = await createGarminClient({ fetch }).getDailies('tok', '2026-11-09', '2026-11-09');
    warn.mockRestore();
    expect(d).toEqual([
      expect.objectContaining({ date: '2026-11-09', steps: 9000, restingHr: 52, stressAvg: 30, bodyBattery: 80, hrv: 61, sleepS: null }),
    ]);
  });

  it('mergeDailies reads sleep DTOs', () => {
    const d = mergeDailies({ sleep: [{ dailySleepDTO: { calendarDate: '2026-11-08', sleepTimeSeconds: 27000 } }] });
    expect(d[0]).toMatchObject({ date: '2026-11-08', sleepS: 27000 });
  });

  it('normalizeActivity accepts epoch timestamps', () => {
    expect(normalizeActivity({ activityId: 5, beginTimestamp: Date.UTC(2026, 0, 1), activityType: { typeKey: 'running' } })?.startTime).toBe('2026-01-01T00:00:00.000Z');
  });
});
