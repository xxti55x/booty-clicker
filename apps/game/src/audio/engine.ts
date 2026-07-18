import type { BackgroundKey } from '../types';
import { loadAudioPrefs, saveAudioPrefs, type AudioPrefs, type PrefsStorage } from './prefs';
import { MUSIC_TRACKS, type TrackConfig } from './tracks';

function ctxStorage(): PrefsStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Generative per-background loop: a 16-step bass + arpeggio + hi-hat pattern. */
class MusicPlayer {
  private track: TrackConfig = MUSIC_TRACKS.club;
  private step = 0;
  private nextNoteTime = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private playing = false;
  /** Combo-driven intensity 0..3 (spec §8.10): +percussion / +lead-arp / +sweep. */
  private intensity = 0;

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: GainNode,
  ) {}

  setTrack(bg: BackgroundKey): void {
    this.track = MUSIC_TRACKS[bg];
  }

  setIntensity(level: number): void {
    this.intensity = Math.max(0, Math.min(3, Math.floor(level)));
  }

  start(): void {
    if (this.playing) return;
    this.playing = true;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.12;
    this.tick();
  }

  stop(): void {
    this.playing = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private tick = (): void => {
    if (!this.playing) return;
    const secPerStep = 60 / this.track.bpm / 2; // eighth-note grid
    while (this.nextNoteTime < this.ctx.currentTime + 0.2) {
      this.scheduleStep(this.step, this.nextNoteTime);
      this.nextNoteTime += secPerStep;
      this.step = (this.step + 1) % 16;
    }
    this.timer = setTimeout(this.tick, 55);
  };

  private scheduleStep(step: number, time: number): void {
    const { rootHz, scale, wave } = this.track;
    if (step % 4 === 0) this.voice(rootHz / 2, time, 0.32, wave, 0.14); // bass
    const deg = scale[step % scale.length]!;
    const oct = step % 8 >= 4 ? 2 : 1; // lift the arp an octave in the 2nd half
    this.voice(rootHz * oct * Math.pow(2, deg / 12), time, 0.16, wave, 0.06); // arp
    if (step % 2 === 1) this.hat(time);

    // Additive combo-intensity layers (spec §8.10) — muteable (all under `out`),
    // lazy (only while the loop plays), never autoplaying.
    if (this.intensity >= 1 && step % 4 === 2) this.kick(time); // Tier 2: percussion
    if (this.intensity >= 2) {
      this.voice(rootHz * 2 * oct * Math.pow(2, deg / 12), time, 0.12, wave, 0.045); // Tier 3: lead +1 oct
    }
    if (this.intensity >= 3 && step % 8 === 0) this.sweep(time); // Ekstase: filter-sweep
  }

  /** A short pitched kick for the Tier-2 percussion layer. */
  private kick(time: number): void {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(50, time + 0.14);
    g.gain.setValueAtTime(0.16, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    osc.connect(g);
    g.connect(this.out);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  /** A rising filter-sweep accent for the Ekstase layer. */
  private sweep(time: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = getNoiseBuffer(this.ctx);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, time);
    lp.frequency.exponentialRampToValueAtTime(7000, time + 0.42);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.05, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.45);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.out);
    src.start(time);
    src.stop(time + 0.47);
  }

  private voice(freq: number, time: number, dur: number, wave: OscillatorType, gain: number): void {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g);
    g.connect(this.out);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private hat(time: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = getNoiseBuffer(this.ctx);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.05, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.out);
    src.start(time);
    src.stop(time + 0.05);
  }
}

let noiseBuffer: AudioBuffer | null = null;
function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}

/**
 * Web Audio engine (spec M3). The AudioContext is created lazily on the first
 * user gesture (`unlock`), so nothing autoplays. Master/music/sfx gain buses;
 * mute is persisted and takes effect immediately. All sound is synthesised —
 * no audio files (see public/CREDITS.md).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private music: MusicPlayer | null = null;
  private prefs: AudioPrefs;
  private currentBg: BackgroundKey = 'club';

  constructor(private readonly storage: PrefsStorage | null = ctxStorage()) {
    this.prefs = loadAudioPrefs(storage);
  }

  get muted(): boolean {
    return this.prefs.muted;
  }

  /** Create + resume the context. Must be called from a user gesture. */
  unlock(): void {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.music && !this.prefs.muted) this.music.start();
  }

  private init(): void {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.prefs.muted ? 0 : this.prefs.master;
    this.master.connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.prefs.music;
    this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.prefs.sfx;
    this.sfxBus.connect(this.master);
    this.music = new MusicPlayer(ctx, this.musicBus);
    this.music.setTrack(this.currentBg);
  }

  setMuted(muted: boolean): void {
    this.prefs.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : this.prefs.master;
    if (muted) this.music?.stop();
    else if (this.ctx?.state === 'running') this.music?.start();
    saveAudioPrefs(this.prefs, this.storage);
  }

  /** Flip mute and return the new state. */
  toggleMute(): boolean {
    this.setMuted(!this.prefs.muted);
    return this.prefs.muted;
  }

  setBackground(bg: BackgroundKey): void {
    this.currentBg = bg;
    this.music?.setTrack(bg);
  }

  /** Combo-tier music intensity 0..3 (spec §8.10); safe before the ctx exists. */
  setIntensity(level: number): void {
    this.music?.setIntensity(level);
  }

  // ---------- SFX ----------
  private tone(freq: number, dur: number, wave: OscillatorType, gain: number, delay = 0): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private clapNoise(gain: number, dur: number): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(bus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /** Beat clap, synced to the choreography phase. */
  beat(intensity = 1): void {
    this.clapNoise(0.12 * Math.min(1, intensity), 0.07);
  }

  click(): void {
    this.tone(700, 0.05, 'triangle', 0.12);
  }

  buy(): void {
    this.tone(523.25, 0.09, 'square', 0.14);
    this.tone(783.99, 0.12, 'square', 0.12, 0.06);
  }

  unlockJingle(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      this.tone(f, 0.16, 'triangle', 0.13, i * 0.07),
    );
  }

  combo(level: number): void {
    const f = 500 + Math.min(level, 40) * 18;
    this.tone(f, 0.07, 'sawtooth', 0.1);
  }

  bossHit(): void {
    this.tone(120, 0.08, 'square', 0.16);
    this.clapNoise(0.08, 0.05);
  }

  bossWin(): void {
    [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      this.tone(f, 0.22, 'sawtooth', 0.14, i * 0.1),
    );
  }

  bossLose(): void {
    [440, 349.23, 261.63, 174.61].forEach((f, i) => this.tone(f, 0.24, 'sine', 0.14, i * 0.12));
  }
}
