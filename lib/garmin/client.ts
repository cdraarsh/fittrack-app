/**
 * Garmin Personal API client (read-only).
 *
 * LIVE-KEY BOUNDARY: this module + endpoints.ts + token.ts are the only code
 * that talks to Garmin. Everything is untested against the real API until a
 * Personal API key exists — see TODO(verify) in endpoints.ts. Response parsing
 * is deliberately defensive (unknown fields → null) so a shape mismatch
 * degrades to missing metrics instead of a crashed sync.
 */
import {
  ACTIVITY_MAX_PAGES,
  ACTIVITY_PAGE_SIZE,
  GARMIN_PATHS,
  garminBaseUrl,
} from './endpoints';
import { GarminAuthError, GarminHttpError } from './errors';
import type { FetchLike } from './token';
import type { GarminActivitySummary, GarminDaily } from './types';
import { extractFit } from './zip';

/** The surface sync.ts depends on (fakes implement this in tests). */
export interface GarminApi {
  listActivities(token: string, startDate: string, endDate: string): Promise<GarminActivitySummary[]>;
  /** Returns raw FIT bytes (unzipped). */
  downloadFit(token: string, activityId: string): Promise<Uint8Array>;
  getDailies(token: string, startDate: string, endDate: string): Promise<GarminDaily[]>;
}

type Json = Record<string, unknown>;

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function pick(o: Json | undefined, ...keys: string[]): number | null {
  if (!o) return null;
  for (const k of keys) {
    const n = num(o[k]);
    if (n != null) return n;
  }
  return null;
}

function asArray(v: unknown, ...keys: string[]): Json[] {
  if (Array.isArray(v)) return v as Json[];
  if (v && typeof v === 'object') {
    for (const k of keys) {
      const inner = (v as Json)[k];
      if (Array.isArray(inner)) return inner as Json[];
    }
  }
  return [];
}

/** "2026-11-09 18:02:11" (GMT) | epoch ms | ISO → ISO UTC. */
function toIsoUtc(gmt: unknown, epochMs: unknown): string | null {
  const ms = num(epochMs);
  if (ms != null) return new Date(ms).toISOString();
  if (typeof gmt === 'string' && gmt) {
    const s = /[zZ]|[+-]\d\d:?\d\d$/.test(gmt) ? gmt : `${gmt.replace(' ', 'T')}Z`;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

export function normalizeActivity(a: Json): GarminActivitySummary | null {
  const id = a.activityId ?? a.activityID ?? a.id;
  if (id == null) return null;
  const type = (a.activityType as Json | undefined)?.typeKey ?? a.activityTypeKey ?? a.type;
  const startSecs = num(a.startTimeInSeconds);
  const epochMs = num(a.beginTimestamp) ?? (startSecs != null ? startSecs * 1000 : null);
  const start = toIsoUtc(a.startTimeGMT ?? a.startTime, epochMs);
  if (!start) return null;
  return {
    activityId: String(id),
    name: typeof a.activityName === 'string' ? a.activityName : null,
    typeKey: typeof type === 'string' ? type : 'unknown',
    startTime: start,
    durationS: pick(a, 'duration', 'durationInSeconds', 'elapsedDuration'),
    avgHr: pick(a, 'averageHR', 'averageHeartRate', 'averageHeartRateInBeatsPerMinute'),
    raw: a,
  };
}

function dateKey(o: Json): string | null {
  const d = o.calendarDate ?? o.date ?? o.summaryDate;
  return typeof d === 'string' ? d.slice(0, 10) : null;
}

/** Merge the per-metric responses into one GarminDaily per date. Exported for tests. */
export function mergeDailies(parts: {
  summaries?: unknown;
  sleep?: unknown;
  hrv?: unknown;
}): GarminDaily[] {
  const days = new Map<string, GarminDaily>();
  const day = (date: string) => {
    let d = days.get(date);
    if (!d) {
      d = { date, sleepS: null, restingHr: null, hrv: null, bodyBattery: null, stressAvg: null, steps: null, raw: {} };
      days.set(date, d);
    }
    return d;
  };

  for (const s of asArray(parts.summaries, 'data', 'dailySummaries')) {
    const date = dateKey(s);
    if (!date) continue;
    const d = day(date);
    d.steps = pick(s, 'totalSteps', 'steps');
    d.restingHr = pick(s, 'restingHeartRate', 'restingHeartRateInBeatsPerMinute');
    d.stressAvg = pick(s, 'averageStressLevel', 'averageStress');
    d.bodyBattery = pick(s, 'bodyBatteryAtWakeTime', 'bodyBatteryMostRecentValue', 'bodyBatteryHighestValue');
    d.sleepS = d.sleepS ?? pick(s, 'sleepingSeconds');
    d.raw!.summary = s;
  }

  for (const s of asArray(parts.sleep, 'data', 'dailySleepSummaries', 'sleepSummaries')) {
    const dto = (s.dailySleepDTO as Json | undefined) ?? s;
    const date = dateKey(dto);
    if (!date) continue;
    const d = day(date);
    const secs = pick(dto, 'sleepTimeSeconds', 'durationInSeconds', 'totalSleepSeconds');
    if (secs != null) d.sleepS = secs;
    d.raw!.sleep = s;
  }

  for (const s of asArray(parts.hrv, 'hrvSummaries', 'data')) {
    const date = dateKey(s);
    if (!date) continue;
    const d = day(date);
    d.hrv = pick(s, 'lastNightAvg', 'lastNightAverage', 'weeklyAvg');
    d.raw!.hrv = s;
  }

  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function createGarminClient(opts: { fetch?: FetchLike } = {}): GarminApi {
  const f = opts.fetch ?? fetch;

  async function get(token: string, path: string, params?: Record<string, string | number>, accept = 'application/json') {
    const qs = params ? `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}` : '';
    const res = await f(`${garminBaseUrl()}${path}${qs}`, {
      method: 'GET',
      headers: { Accept: accept, Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) throw new GarminAuthError(res.status, 'Garmin access token rejected');
    if (!res.ok) throw new GarminHttpError(res.status, path, await res.text());
    return res;
  }

  async function getJson(token: string, path: string, params?: Record<string, string | number>): Promise<unknown> {
    const res = await get(token, path, params);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  /** A failing optional metric endpoint shouldn't sink the whole dailies pull. */
  async function optional(p: Promise<unknown>): Promise<unknown> {
    try {
      return await p;
    } catch (e) {
      if (e instanceof GarminAuthError) throw e;
      console.warn('[garmin] optional dailies endpoint failed:', (e as Error).message);
      return null;
    }
  }

  return {
    async listActivities(token, startDate, endDate) {
      const out: GarminActivitySummary[] = [];
      for (let page = 0; page < ACTIVITY_MAX_PAGES; page++) {
        const body = await getJson(token, GARMIN_PATHS.activitySearch, {
          start: page * ACTIVITY_PAGE_SIZE,
          limit: ACTIVITY_PAGE_SIZE,
          startDate,
          endDate,
        });
        const rows = asArray(body, 'activityList', 'activities', 'data');
        for (const r of rows) {
          const a = normalizeActivity(r);
          if (a) out.push(a);
        }
        if (rows.length < ACTIVITY_PAGE_SIZE) break;
      }
      return out;
    },

    async downloadFit(token, activityId) {
      if (!/^\d+$/.test(activityId)) throw new Error('activityId must be numeric');
      const res = await get(
        token,
        GARMIN_PATHS.activityDownload(activityId),
        undefined,
        'application/zip, application/x-zip-compressed, application/octet-stream',
      );
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (!bytes.length) throw new Error('Empty activity download');
      return extractFit(bytes);
    },

    async getDailies(token, startDate, endDate) {
      const [summaries, sleep, hrv] = await Promise.all([
        optional(getJson(token, GARMIN_PATHS.dailySummaries, { startDate, endDate })),
        optional(getJson(token, GARMIN_PATHS.sleepSummaries, { startDate, endDate })),
        optional(getJson(token, GARMIN_PATHS.hrvDaily(startDate, endDate))),
      ]);
      return mergeDailies({ summaries, sleep, hrv });
    },
  };
}
