/**
 * Strength .FIT decoding with @garmin/fitsdk.
 *
 * Reads `set` messages (repetitions, weight, duration, set_type, category,
 * category_subtype). `decodeStrengthFit` returns every set; use
 * `activeSets` (or `decodeActiveSets`) to drop rest sets.
 */
import { Decoder, Profile, Stream } from '@garmin/fitsdk';
import type { WatchSet } from './types';

const UINT16_INVALID = 0xffff;

/** Shape of a decoded FIT `set` message we rely on (SDK output, strings converted). */
export interface RawSetMesg {
  timestamp?: Date | number;
  startTime?: Date | number;
  duration?: number;
  repetitions?: number;
  weight?: number;
  setType?: string | number;
  category?: Array<string | number> | string | number;
  categorySubtype?: Array<number> | number;
}

export class FitDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FitDecodeError';
  }
}

function first<T>(v: T[] | T | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function toIso(v: Date | number | undefined): string | null {
  if (v instanceof Date) return v.toISOString();
  return null;
}

function finite(n: unknown): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** Resolve a category_subtype number to its FIT profile name, e.g. benchPress/1 → barbellBenchPress. */
export function subtypeName(category: string | null, subtype: number | null): string | null {
  if (!category || subtype == null) return null;
  const types = (Profile as unknown as { types: Record<string, Record<number, string>> }).types;
  const table = types[`${category}ExerciseName`];
  return table?.[subtype] ?? null;
}

/** Map one decoded `set` message to a WatchSet. Pure; exported for tests. */
export function mapSetMesg(m: RawSetMesg, index: number): WatchSet {
  const rawType = m.setType;
  const setType: WatchSet['setType'] = rawType === 'active' || rawType === 1 ? 'active' : 'rest';

  const rawCat = first(m.category);
  const category = typeof rawCat === 'string' && rawCat !== 'unknown' ? rawCat : null;

  const rawSub = first(m.categorySubtype);
  const subtype =
    typeof rawSub === 'number' && Number.isFinite(rawSub) && rawSub !== UINT16_INVALID ? rawSub : null;

  const reps = finite(m.repetitions);
  const weight = finite(m.weight);

  return {
    index,
    setType,
    category,
    subtype,
    subtypeName: subtypeName(category, subtype),
    reps,
    weightKg: weight,
    durationS: finite(m.duration),
    startTime: toIso(m.startTime) ?? toIso(m.timestamp),
  };
}

export function activeSets(sets: WatchSet[]): WatchSet[] {
  return sets.filter((s) => s.setType === 'active');
}

/** Decode a FIT file and return all set messages in file order. */
export function decodeStrengthFit(bytes: Uint8Array | ArrayBuffer): WatchSet[] {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const stream = Stream.fromByteArray(u8);
  if (!Decoder.isFIT(stream)) throw new FitDecodeError('Not a FIT file');
  const decoder = new Decoder(stream);
  const { messages, errors } = decoder.read({
    applyScaleAndOffset: true,
    expandSubFields: true,
    expandComponents: true,
    convertTypesToStrings: true,
    convertDateTimesToDates: true,
    mergeHeartRates: false,
  });
  const sets = (messages.setMesgs ?? []) as unknown as RawSetMesg[];
  if (errors.length && sets.length === 0) {
    throw new FitDecodeError(`FIT decode failed: ${String(errors[0])}`);
  }
  return sets.map((m, i) => mapSetMesg(m, i));
}

export function decodeActiveSets(bytes: Uint8Array | ArrayBuffer): WatchSet[] {
  return activeSets(decodeStrengthFit(bytes));
}
