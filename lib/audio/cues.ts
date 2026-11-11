/**
 * Logger sound cues, synthesised with Web Audio (no files → work offline).
 *
 * iOS: the music the user is playing (Spotify / Apple Music) must keep going.
 *  - One shared AudioContext, created/resumed on the first user gesture and
 *    resumed again on visibilitychange.
 *  - Audio Session API (Safari 16.4+): the page sits in 'ambient' (mixes with
 *    other audio, never interrupts it); right before a cue we switch to
 *    'transient' so iOS briefly ducks the music, then back to 'ambient' shortly
 *    after the cue ends so the music returns to full volume.
 *  - Never 'playback' / 'transient-solo' (they pause other audio) and never a
 *    looping silent track to keep the context alive.
 * Everything is feature-detected; unsupported browsers just play the tone.
 */

export type CueName = 'tick' | 'countdown' | 'go' | 'next_exercise' | 'session_complete';

export interface ToneStep {
  freq: number;
  /** Seconds after the cue starts. */
  at: number;
  dur: number;
  /** Peak gain 0..1 before the user's volume is applied. */
  gain: number;
  type: OscillatorType;
}

export const CUES: Record<CueName, ToneStep[]> = {
  // (a) set ticked: short, soft
  tick: [{ freq: 1760, at: 0, dur: 0.05, gain: 0.25, type: 'sine' }],
  // (b) rest ending: one short beep, played at 3, 2 and 1 s
  countdown: [{ freq: 880, at: 0, dur: 0.12, gain: 0.5, type: 'square' }],
  // (c) rest over: stronger two-note chime
  go: [
    { freq: 1046.5, at: 0, dur: 0.5, gain: 0.8, type: 'triangle' },
    { freq: 1568, at: 0, dur: 0.5, gain: 0.5, type: 'triangle' },
    { freq: 2093, at: 0.12, dur: 0.45, gain: 0.45, type: 'sine' },
  ],
  // (d) next exercise: two-tone, rising
  next_exercise: [
    { freq: 660, at: 0, dur: 0.13, gain: 0.55, type: 'triangle' },
    { freq: 990, at: 0.16, dur: 0.16, gain: 0.55, type: 'triangle' },
  ],
  // (e) session complete: major arpeggio
  session_complete: [
    { freq: 523.25, at: 0, dur: 0.18, gain: 0.6, type: 'triangle' },
    { freq: 659.25, at: 0.15, dur: 0.18, gain: 0.6, type: 'triangle' },
    { freq: 783.99, at: 0.3, dur: 0.18, gain: 0.6, type: 'triangle' },
    { freq: 1046.5, at: 0.45, dur: 0.5, gain: 0.7, type: 'triangle' },
  ],
};

/** Seconds from cue start until its last tone has faded. */
export function cueDuration(name: CueName): number {
  return Math.max(...CUES[name].map((s) => s.at + s.dur));
}

/** Delay after a cue before the session goes back to 'ambient' (music back to full volume). */
export const RESTORE_AFTER_MS = 250;
const LEAD_S = 0.03;

// Minimal structural types so tests can inject fakes.
interface ParamLike {
  setValueAtTime(v: number, t: number): unknown;
  linearRampToValueAtTime(v: number, t: number): unknown;
  exponentialRampToValueAtTime(v: number, t: number): unknown;
}
interface NodeLike {
  connect(dest: unknown): unknown;
}
interface OscLike extends NodeLike {
  type: OscillatorType;
  frequency: ParamLike;
  start(t: number): void;
  stop(t: number): void;
}
interface GainLike extends NodeLike {
  gain: ParamLike;
}
export interface AudioContextLike {
  state: string;
  currentTime: number;
  destination: unknown;
  resume(): Promise<void>;
  createOscillator(): OscLike;
  createGain(): GainLike;
}
export interface AudioSessionLike {
  type: string;
}

export interface CuePlayerDeps {
  createContext?: () => AudioContextLike | null;
  getAudioSession?: () => AudioSessionLike | null;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
}

function defaultCreateContext(): AudioContextLike | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctor ? (new Ctor() as unknown as AudioContextLike) : null;
}

function defaultAudioSession(): AudioSessionLike | null {
  if (typeof navigator === 'undefined') return null;
  const s = (navigator as unknown as { audioSession?: AudioSessionLike }).audioSession;
  return s && 'type' in s ? s : null;
}

export class CuePlayer {
  enabled = true;
  volume = 0.8;
  private ctx: AudioContextLike | null = null;
  private restoreTimer: unknown = null;
  private readonly deps: Required<CuePlayerDeps>;

  constructor(deps: CuePlayerDeps = {}) {
    this.deps = {
      createContext: deps.createContext ?? defaultCreateContext,
      getAudioSession: deps.getAudioSession ?? defaultAudioSession,
      setTimer: deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms)),
      clearTimer: deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>)),
    };
  }

  private setSession(type: 'ambient' | 'transient'): void {
    const s = this.deps.getAudioSession();
    if (!s) return;
    try {
      if (s.type !== type) s.type = type;
    } catch {
      /* ignore */
    }
  }

  /** Call from a user gesture (first tap / "Start session"). Safe to call repeatedly. */
  unlock(): void {
    this.setSession('ambient'); // mix with, never interrupt, the user's music
    if (!this.ctx) this.ctx = this.deps.createContext();
    this.resume();
  }

  /** Resume a suspended/interrupted context (e.g. on visibilitychange). */
  resume(): void {
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume().catch(() => {});
  }

  get unlocked(): boolean {
    return this.ctx !== null;
  }

  /** Play a cue. Returns false when muted or audio isn't available yet. */
  play(name: CueName): boolean {
    if (!this.enabled || this.volume <= 0) return false;
    const ctx = this.ctx;
    if (!ctx) return false;
    this.resume();

    this.setSession('transient'); // iOS ducks other audio while we play
    const t0 = ctx.currentTime + LEAD_S;
    for (const step of CUES[name]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = step.type;
      osc.frequency.setValueAtTime(step.freq, t0 + step.at);
      const peak = Math.max(0.0001, step.gain * this.volume);
      g.gain.setValueAtTime(0.0001, t0 + step.at);
      g.gain.linearRampToValueAtTime(peak, t0 + step.at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + step.at + step.dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t0 + step.at);
      osc.stop(t0 + step.at + step.dur + 0.02);
    }

    // Back to ambient once the (latest) cue has finished.
    if (this.restoreTimer !== null) this.deps.clearTimer(this.restoreTimer);
    this.restoreTimer = this.deps.setTimer(() => {
      this.restoreTimer = null;
      this.setSession('ambient');
    }, (LEAD_S + cueDuration(name)) * 1000 + RESTORE_AFTER_MS);
    return true;
  }
}

let shared: CuePlayer | null = null;
/** The app-wide player (one AudioContext for the whole app). */
export function getCuePlayer(): CuePlayer {
  if (!shared) shared = new CuePlayer();
  return shared;
}
