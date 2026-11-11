import { Encoder, Profile, type Encodable, type Mesg } from '@garmin/fitsdk';

/** Build a synthetic FIT file: a file_id followed by the given `set` messages. */
export function buildFit(sets: Record<string, unknown>[]): Uint8Array {
  const e = new Encoder();
  const w = (m: Record<string, unknown>) => e.writeMesg(m as unknown as Encodable<Mesg>);
  w({ mesgNum: Profile.MesgNum.FILE_ID, type: 'activity', manufacturer: 'development', product: 0, timeCreated: new Date('2026-11-09T10:00:00Z'), serialNumber: 1 });
  for (const s of sets) w({ mesgNum: Profile.MesgNum.SET, ...s });
  return e.close();
}
import type { MatchSessionExercise, MatchSetLog, WatchSet } from '@/lib/garmin/types';

let n = 0;
export function ws(p: Partial<WatchSet> = {}): WatchSet {
  return {
    index: p.index ?? n++,
    setType: 'active',
    category: null,
    subtype: null,
    subtypeName: null,
    reps: 8,
    weightKg: 50,
    durationS: 30,
    startTime: null,
    ...p,
  };
}

export function ex(p: Partial<MatchSessionExercise> & { id: string; position: number }): MatchSessionExercise {
  return { sets: 3, isTimed: false, garminCategory: null, garminSubtype: null, ...p };
}

export function log(p: Partial<MatchSetLog> & { id: string; sessionExerciseId: string; setIndex: number }): MatchSetLog {
  return { weightKg: null, reps: null, seconds: null, done: false, ...p };
}
