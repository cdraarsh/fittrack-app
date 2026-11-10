import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CuePlayer, CUES, cueDuration, RESTORE_AFTER_MS, type AudioContextLike, type AudioSessionLike } from '@/lib/audio/cues';
import { dueRestCues, remainingSeconds, startRest, STALE_CUE_MS } from '@/lib/audio/rest';

function fakeContext(state = 'suspended') {
  const oscs: { type: string; freq: number; start: number; stop: number }[] = [];
  const peaks: number[] = [];
  const ctx = {
    state,
    currentTime: 10,
    destination: {},
    resume: vi.fn(async () => {
      ctx.state = 'running';
    }),
    createOscillator: () => {
      const o = { type: 'sine' as OscillatorType, freq: 0, start: 0, stop: 0 };
      oscs.push(o as never);
      return {
        get type() { return o.type; },
        set type(v: OscillatorType) { o.type = v; },
        frequency: { setValueAtTime: (v: number) => (o.freq = v), linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
        connect: () => {},
        start: (t: number) => (o.start = t),
        stop: (t: number) => (o.stop = t),
      };
    },
    createGain: () => ({
      gain: { setValueAtTime: () => {}, linearRampToValueAtTime: (v: number) => peaks.push(v), exponentialRampToValueAtTime: () => {} },
      connect: () => {},
    }),
  };
  return { ctx: ctx as unknown as AudioContextLike & { resume: ReturnType<typeof vi.fn> }, oscs, peaks };
}

describe('CuePlayer', () => {
  let session: AudioSessionLike & { history: string[] };
  beforeEach(() => {
    vi.useFakeTimers();
    const history: string[] = [];
    let type = 'auto';
    session = {
      history,
      get type() { return type; },
      set type(v: string) { type = v; history.push(v); },
    };
  });

  it('does nothing until unlocked by a gesture', () => {
    const { ctx } = fakeContext();
    const p = new CuePlayer({ createContext: () => ctx, getAudioSession: () => session });
    expect(p.play('tick')).toBe(false);
    expect(session.history).toEqual([]);
  });

  it('unlock sets ambient (mix, never interrupt) and resumes the shared context once', () => {
    const { ctx } = fakeContext();
    const create = vi.fn(() => ctx);
    const p = new CuePlayer({ createContext: create, getAudioSession: () => session });
    p.unlock();
    p.unlock();
    expect(create).toHaveBeenCalledTimes(1);
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(session.history).toEqual(['ambient']);
  });

  it('switches to transient for the cue, then back to ambient after it ends', () => {
    const { ctx, oscs } = fakeContext('running');
    const p = new CuePlayer({ createContext: () => ctx, getAudioSession: () => session });
    p.unlock();
    expect(p.play('go')).toBe(true);
    expect(session.type).toBe('transient');
    expect(oscs).toHaveLength(CUES.go.length);
    expect(oscs[0].start).toBeGreaterThan(10); // scheduled slightly ahead of currentTime
    const restoreMs = (0.03 + cueDuration('go')) * 1000 + RESTORE_AFTER_MS;
    vi.advanceTimersByTime(restoreMs - 5);
    expect(session.type).toBe('transient');
    vi.advanceTimersByTime(10);
    expect(session.type).toBe('ambient');
    expect(session.history).toEqual(['ambient', 'transient', 'ambient']);
    expect(session.history).not.toContain('playback');
    expect(session.history).not.toContain('transient-solo');
  });

  it('overlapping cues restore only after the last one', () => {
    const { ctx } = fakeContext('running');
    const p = new CuePlayer({ createContext: () => ctx, getAudioSession: () => session });
    p.unlock();
    p.play('countdown');
    vi.advanceTimersByTime(300);
    p.play('session_complete');
    vi.advanceTimersByTime(400);
    expect(session.type).toBe('transient');
    vi.advanceTimersByTime(2000);
    expect(session.type).toBe('ambient');
  });

  it('respects mute and volume', () => {
    const { ctx, peaks } = fakeContext('running');
    const p = new CuePlayer({ createContext: () => ctx, getAudioSession: () => session });
    p.unlock();
    p.volume = 0.5;
    p.play('tick');
    expect(peaks[0]).toBeCloseTo(CUES.tick[0].gain * 0.5);
    p.enabled = false;
    expect(p.play('tick')).toBe(false);
    p.enabled = true;
    p.volume = 0;
    expect(p.play('tick')).toBe(false);
  });

  it('is a silent no-op without Audio Session API, and plays without crashing', () => {
    const { ctx, oscs } = fakeContext('running');
    const p = new CuePlayer({ createContext: () => ctx, getAudioSession: () => null });
    p.unlock();
    expect(p.play('next_exercise')).toBe(true);
    expect(oscs.map((o) => o.freq)).toEqual([660, 990]);
    vi.runAllTimers();
  });

  it('is a no-op when Web Audio is unavailable', () => {
    const p = new CuePlayer({ createContext: () => null, getAudioSession: () => session });
    p.unlock();
    expect(p.play('go')).toBe(false);
    expect(session.history).toEqual(['ambient']);
  });

  it('resume() wakes a context iOS suspended in the background', () => {
    const { ctx } = fakeContext('running');
    const p = new CuePlayer({ createContext: () => ctx, getAudioSession: () => session });
    p.unlock();
    (ctx as { state: string }).state = 'interrupted';
    p.resume();
    expect(ctx.resume).toHaveBeenCalled();
  });
});

describe('rest timer (timestamp based)', () => {
  const t0 = 1_000_000;
  it('remaining time comes from the stored end time', () => {
    const r = startRest(90, t0);
    expect(remainingSeconds(r, t0)).toBe(90);
    expect(remainingSeconds(r, t0 + 60_500)).toBe(30); // e.g. after a minute in the background
    expect(remainingSeconds(r, t0 + 200_000)).toBe(0);
  });

  it('fires 3-2-1 countdown then go, each once', () => {
    const r = startRest(60, t0);
    const fired = new Set<string>();
    const at = (s: number) => dueRestCues(r, t0 + s * 1000, fired);
    expect(at(10)).toEqual([]);
    expect(at(57)).toEqual(['countdown']);
    expect(at(57.2)).toEqual([]);
    expect(at(58)).toEqual(['countdown']);
    expect(at(59)).toEqual(['countdown']);
    expect(at(60)).toEqual(['go']);
    expect(at(61)).toEqual([]);
  });

  it('after coming back late, no burst and no stale cues', () => {
    const r = startRest(60, t0);
    const fired = new Set<string>();
    expect(dueRestCues(r, t0 + 59_500, fired)).toEqual(['countdown']); // only the freshest
    const fired2 = new Set<string>();
    expect(dueRestCues(r, t0 + 60_000 + STALE_CUE_MS + 1, fired2)).toEqual([]);
  });

  it('short rests skip countdown marks before the start', () => {
    const fired = new Set<string>();
    const r = startRest(2, t0);
    expect(dueRestCues(r, t0, fired)).toEqual([]);
    expect(dueRestCues(r, t0 + 1000, fired)).toEqual(['countdown']);
  });
});
