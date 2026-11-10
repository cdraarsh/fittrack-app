// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { syncAll, syncUser, syncWindow, type ActivityRecord, type ConnectionRow, type GarminRepo, type SessionContext, type SyncDeps, type SyncOutcome } from '@/lib/garmin/sync';
import type { GarminApi } from '@/lib/garmin/client';
import { GarminAuthError } from '@/lib/garmin/errors';
import type { GarminActivitySummary, GarminDaily, SetFill, WatchSet } from '@/lib/garmin/types';
import { ex, ws } from './helpers';

const NOW = new Date('2026-11-10T06:00:00Z');

function conn(p: Partial<ConnectionRow> = {}): ConnectionRow {
  return { userId: 'u1', apiKeyEnc: 'enc:key', keyLast4: 'key1', keyExpiresAt: null, lastSyncedAt: null, lastSyncStatus: null, lastSyncError: null, ...p };
}

function act(id: string, typeKey: string, startTime = '2026-11-09T18:00:00.000Z'): GarminActivitySummary {
  return { activityId: id, name: null, typeKey, startTime, durationS: 3600, avgHr: 120, raw: {} };
}

class FakeRepo implements GarminRepo {
  conns = new Map<string, ConnectionRow>([['u1', conn()]]);
  processed = new Set<string>();
  session: SessionContext | null = {
    sessionId: 's1',
    exercises: [ex({ id: 'row', position: 0, sets: 2, garminCategory: 'ROW' })],
    logs: [],
  };
  fills: SetFill[] = [];
  activities: ActivityRecord[] = [];
  dailies: GarminDaily[] = [];
  outcomes: SyncOutcome[] = [];
  async getConnection(u: string) { return this.conns.get(u) ?? null; }
  async listConnections() { return [...this.conns.values()]; }
  async getProcessedActivityIds(_u: string, ids: string[]) { return new Set(ids.filter((i) => this.processed.has(i))); }
  async findSessionForActivity() { return this.session; }
  async applySetFills(_u: string, f: SetFill[]) { this.fills.push(...f); }
  async upsertActivity(r: ActivityRecord) { this.activities.push(r); }
  async upsertDailies(_u: string, d: GarminDaily[]) { this.dailies.push(...d); }
  async saveFit(u: string, id: string) { return `${u}/${id}.fit`; }
  async recordSyncResult(_u: string, o: SyncOutcome) { this.outcomes.push(o); }
}

function fakeApi(activities: GarminActivitySummary[], over: Partial<GarminApi> = {}): GarminApi {
  return {
    listActivities: vi.fn(async () => activities),
    downloadFit: vi.fn(async () => new Uint8Array([1])),
    getDailies: vi.fn(async (): Promise<GarminDaily[]> => [
      { date: '2026-11-09', sleepS: 27000, restingHr: 50, hrv: 60, bodyBattery: 70, stressAvg: 25, steps: 8000 },
    ]),
    ...over,
  };
}

function deps(repo: FakeRepo, api: GarminApi, sets: WatchSet[] = [ws({ index: 0, category: 'row' }), ws({ index: 1, setType: 'rest' }), ws({ index: 2, category: 'squat' })]): SyncDeps {
  return {
    repo,
    api,
    exchangeToken: vi.fn(async (k: string) => {
      expect(k).toBe('key');
      return { accessToken: 'tok', expiresAt: new Date(NOW.getTime() + 86_400_000) };
    }),
    decryptKey: (enc) => enc.replace(/^enc:/, ''),
    decodeFit: () => sets,
    now: () => NOW,
  };
}

describe('syncWindow', () => {
  it('first sync looks back 14 days; later syncs overlap 1 day', () => {
    expect(syncWindow(null, NOW)).toEqual({ startDate: '2026-10-27', endDate: '2026-11-10' });
    expect(syncWindow('2026-11-09T05:30:00Z', NOW)).toEqual({ startDate: '2026-11-08', endDate: '2026-11-10' });
  });
});

describe('syncUser', () => {
  it('not connected', async () => {
    const repo = new FakeRepo();
    repo.conns.clear();
    const r = await syncUser('u1', deps(repo, fakeApi([])));
    expect(r.status).toBe('not_connected');
    expect(repo.outcomes).toHaveLength(0);
  });

  it('strength → decode + match + fills; cardio → linked; dailies upserted; watermark advanced', async () => {
    const repo = new FakeRepo();
    const api = fakeApi([act('2', 'running', '2026-11-09T19:00:00.000Z'), act('1', 'strength_training')]);
    const r = await syncUser('u1', deps(repo, api));
    expect(r.status).toBe('ok');
    expect(api.listActivities).toHaveBeenCalledWith('tok', '2026-10-27', '2026-11-10');
    expect(api.downloadFit).toHaveBeenCalledWith('tok', '1');
    expect(api.downloadFit).toHaveBeenCalledTimes(1);
    expect(repo.fills).toHaveLength(1);
    expect(repo.fills[0]).toMatchObject({ sessionExerciseId: 'row', source: 'watch' });
    expect(repo.activities.map((a) => [a.garminActivityId, a.matchStatus])).toEqual([
      ['1', 'review'], // processed oldest first; squat set → review tray
      ['2', 'cardio_linked'],
    ]);
    expect(repo.activities[0]).toMatchObject({ matchedSessionId: 's1', matchedCount: 1, fitPath: 'u1/1.fit' });
    expect(repo.activities[0].unmatchedSets.map((l) => l.reason)).toEqual(['no_matching_exercise']);
    expect(repo.dailies).toHaveLength(1);
    expect(repo.outcomes).toEqual([{ at: NOW.toISOString(), status: 'ok', error: null, lastSyncedAt: NOW.toISOString() }]);
    expect(r.activities).toMatchObject({ seen: 2, strength: 1, cardio: 1, filledSets: 1, reviewSets: 1 });
  });

  it('skips already-processed activities', async () => {
    const repo = new FakeRepo();
    repo.processed.add('1');
    const api = fakeApi([act('1', 'strength_training')]);
    const r = await syncUser('u1', deps(repo, api));
    expect(api.downloadFit).not.toHaveBeenCalled();
    expect(r.activities.skipped).toBe(1);
  });

  it('no session → leftovers marked no_session', async () => {
    const repo = new FakeRepo();
    repo.session = null;
    await syncUser('u1', deps(repo, fakeApi([act('1', 'strength_training')])));
    expect(repo.activities[0].matchStatus).toBe('no_session');
    expect(repo.activities[0].unmatchedSets.map((l) => l.reason)).toEqual(['no_session', 'no_session']); // 2 active, rest dropped
    expect(repo.fills).toHaveLength(0);
  });

  it('per-activity failure → partial, watermark held at the failed activity', async () => {
    const repo = new FakeRepo();
    const api = fakeApi([act('1', 'strength_training', '2026-11-08T10:00:00.000Z'), act('2', 'running')], {
      downloadFit: vi.fn(async () => { throw new Error('boom'); }),
    });
    const r = await syncUser('u1', deps(repo, api));
    expect(r.status).toBe('partial');
    expect(repo.activities.find((a) => a.garminActivityId === '1')).toMatchObject({ matchStatus: 'error', error: 'boom' });
    expect(repo.outcomes[0]).toMatchObject({ status: 'partial', lastSyncedAt: '2026-11-08T10:00:00.000Z' });
  });

  it('rejected key → auth_error, watermark untouched', async () => {
    const repo = new FakeRepo();
    const d = deps(repo, fakeApi([]));
    d.exchangeToken = async () => { throw new GarminAuthError(401); };
    const r = await syncUser('u1', d);
    expect(r.status).toBe('auth_error');
    expect(repo.outcomes[0]).toMatchObject({ status: 'auth_error', lastSyncedAt: null });
  });

  it('syncAll iterates every connection', async () => {
    const repo = new FakeRepo();
    repo.conns.set('u2', conn({ userId: 'u2' }));
    const results = await syncAll(deps(repo, fakeApi([])));
    expect(results.map((r) => [r.userId, r.status])).toEqual([['u1', 'ok'], ['u2', 'ok']]);
  });
});
