/**
 * Garmin Personal API endpoint constants — the ONLY place paths live.
 *
 * Sources: PLAN_V2.md (token endpoint) and Garmin's reference client
 * github.com/garmin/connect-personal-api-python (constants.py, client.py,
 * auth.py). Garmin's own Swagger page is JS-rendered and was not readable.
 *
 * TODO(verify): every path, query param and response field below against the
 * Swagger docs (https://developer.garmin.com/gc-developer-program/personal/swagger-docs/)
 * with a real key in Phase 0. Response field names used by client.ts parsers
 * are guesses based on Garmin Connect's web API and are parsed defensively.
 */

/** TODO(verify): base URL (overridable with GARMIN_PERSONAL_API_BASE_URL). */
export const DEFAULT_BASE_URL = 'https://personal.connectapi.garmin.com';

export function garminBaseUrl(): string {
  return (process.env.GARMIN_PERSONAL_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

export const GARMIN_PATHS = {
  /**
   * POST, header `Authorization: ApiKey <key>`. Documented in PLAN_V2 and the FAQ.
   * The reference client reads the response body as a plain-text JWT (exp claim);
   * token.ts also accepts JSON `{ access_token, expires_in }`. TODO(verify) body shape.
   */
  token: '/personalapitoken-service/personal-api/personal-api-key/token',

  /** GET ?start=&limit=&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD. TODO(verify) params + fields. */
  activitySearch: '/activitylist-service/activities/search/activities',

  /** GET → original activity file as a ZIP (contains the .fit). TODO(verify). */
  activityDownload: (activityId: string) => `/download-service/files/activity/${activityId}`,

  /** GET ?startDate=&endDate= → { data: [...] } daily summaries. TODO(verify) field names. */
  dailySummaries: '/usersummary-service/v2/dailysummaries',

  /** GET ?startDate=&endDate= → sleep summaries. TODO(verify). */
  sleepSummaries: '/sleep-service/sleep/dailySleepSummariesByDate',

  /** GET → HRV daily summaries for an inclusive range. TODO(verify). */
  hrvDaily: (start: string, end: string) => `/hrv-service/hrv/daily/${start}/${end}`,

  /** GET → daily stress stats for an inclusive range. TODO(verify). */
  stressDaily: (start: string, end: string) => `/usersummary-service/stats/stress/daily/${start}/${end}`,

  /** GET ?startDate=&endDate= → Body Battery daily reports. TODO(verify). */
  bodyBatteryDaily: '/wellness-service/wellness/bodyBattery/reports/daily',
} as const;

/** Page size for activity search. TODO(verify) max limit / rate limits. */
export const ACTIVITY_PAGE_SIZE = 50;
export const ACTIVITY_MAX_PAGES = 10;

/** How far back the first sync looks. TODO(verify) the API's history window. */
export const FIRST_SYNC_LOOKBACK_DAYS = 14;

/** Re-read this many days before last_synced_at so late uploads are caught. */
export const SYNC_OVERLAP_DAYS = 1;

/** Garmin activity type keys treated as strength (FIT decode + matcher). TODO(verify). */
export const STRENGTH_TYPE_KEYS = new Set(['strength_training', 'indoor_strength_training']);
