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
  /** ROADMAP-V2 X5: läuft gerade das Ekstase-Fenster? (Theme-Zusatzstimme) */
  private ekstase = false;

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

  /**
   * ROADMAP-V2 X5 + „fetziger Soundtrack": Ekstase-Fenster auf/zu. Beim ÖFFNEN
   * zündet einmal der Drop-Impact (Sub-Kick + Noise-Crash), danach schaltet der
   * ganze Groove einen Gang hoch (siehe `tick`/`scheduleStep`): Tempo +22 %,
   * Four-on-the-floor, durchlaufende Hats, doppelte Bass-Rate mit Quint-Wechsel
   * — dazu weiter die Theme-Zusatzstimme. Schließen fällt hart zurück in den
   * Grund-Groove (der Kontrast IST das Signal).
   */
  setEkstase(on: boolean): void {
    if (on && !this.ekstase) this.dropImpact(this.ctx.currentTime);
    this.ekstase = on;
  }

  /** Der eine große Schlag, wenn das Fenster aufgeht: Sub-Kick + Crash. */
  private dropImpact(time: number): void {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, time);
    osc.frequency.exponentialRampToValueAtTime(32, time + 0.32);
    g.gain.setValueAtTime(0.34, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.42);
    osc.connect(g);
    g.connect(this.out);
    osc.start(time);
    osc.stop(time + 0.45);
    const src = this.ctx.createBufferSource();
    src.buffer = getNoiseBuffer(this.ctx);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(1200, time);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.12, time);
    ng.gain.exponentialRampToValueAtTime(0.0001, time + 0.6);
    src.connect(hp);
    hp.connect(ng);
    ng.connect(this.out);
    src.start(time);
    src.stop(time + 0.65);
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
    // Ekstase schaltet den Gang hoch: +22 % Tempo — genug für „fetzig",
    // wenig genug, dass der On-Beat-Tap dem Takt noch folgen kann.
    const secPerStep = (60 / this.track.bpm / 2) * (this.ekstase ? 0.82 : 1);
    while (this.nextNoteTime < this.ctx.currentTime + 0.2) {
      this.scheduleStep(this.step, this.nextNoteTime);
      this.nextNoteTime += secPerStep;
      this.step = (this.step + 1) % 16;
    }
    this.timer = setTimeout(this.tick, 55);
  };

  private scheduleStep(step: number, time: number): void {
    const { rootHz, scale, wave } = this.track;
    const deg = scale[step % scale.length]!;
    const oct = step % 8 >= 4 ? 2 : 1; // lift the arp an octave in the 2nd half
    if (this.ekstase) {
      // Der Drop-Groove: Four-on-the-floor, Hats auf JEDEM Achtel, Bass in
      // doppelter Rate mit Wechsel auf die Quinte — der Grund-Groove darunter
      // bleibt erkennbar (gleiche Skala, gleiches Arp), er rennt nur.
      if (step % 2 === 0) this.kick(time);
      this.hat(time);
      const bSemi = step % 4 < 2 ? 0 : 7;
      this.voice((rootHz / 2) * Math.pow(2, bSemi / 12), time, 0.2, wave, 0.16);
    } else {
      if (step % 4 === 0) this.voice(rootHz / 2, time, 0.32, wave, 0.14); // bass
      if (step % 2 === 1) this.hat(time);
    }
    this.voice(rootHz * oct * Math.pow(2, deg / 12), time, 0.16, wave, 0.06); // arp

    // Additive combo-intensity layers (spec §8.10) — muteable (all under `out`),
    // lazy (only while the loop plays), never autoplaying.
    if (this.intensity >= 1 && step % 4 === 2) this.kick(time); // Tier 2: percussion
    if (this.intensity >= 2) {
      this.voice(rootHz * 2 * oct * Math.pow(2, deg / 12), time, 0.12, wave, 0.045); // Tier 3: lead +1 oct
    }
    if (this.intensity >= 3 && step % 8 === 0) this.sweep(time); // Ekstase: filter-sweep

    // ROADMAP-V2 X5: die ZWEITE Instrumenten-Lage des Themes — nur im
    // Ekstase-Fenster, dezent unter dem Hauptmix (Gains ≈ ein Drittel der
    // Bass-Stimme), damit sie das Fenster faerbt statt es zu übertönen.
    if (this.ekstase) this.ekstaseLayer(step, time, deg, oct);
  }

  /**
   * Ein Schritt der Theme-Zusatzstimme (`TrackConfig.ekstase`). Alles hängt am
   * selben `out`-Bus wie der Rest der Musik — der Mute-Schalter erwischt sie
   * also automatisch, und sie kann nie ohne laufenden Loop klingen.
   */
  private ekstaseLayer(step: number, time: number, deg: number, oct: number): void {
    const { rootHz, ekstase } = this.track;
    switch (ekstase) {
      case 'stab': {
        // Club: synkopierte Akkord-Stiche auf den Off-Beats — kurz und funky.
        if (step % 8 !== 3 && step % 8 !== 6) return;
        for (const semi of [0, 3, 10]) {
          this.voice(rootHz * 2 * Math.pow(2, semi / 12), time, 0.09, 'square', 0.03);
        }
        return;
      }
      case 'arp': {
        // Synth: laufendes Sechzehntel-Arpeggio, die zweite Stimme leicht
        // verstimmt (das „breite" Synth-Arp entsteht genau aus der Schwebung).
        const f = rootHz * 4 * Math.pow(2, deg / 12);
        this.voice(f, time, 0.07, 'sawtooth', 0.028);
        this.voice(f * 1.005, time + 0.03, 0.06, 'sawtooth', 0.02);
        return;
      }
      case 'steel': {
        // Beach: Steel-Drum-Anmutung — Grundton plus ein INHARMONISCHER
        // Partialton (×2.76), beide mit weichem Ausklang.
        if (step % 4 !== 2) return;
        const f = rootHz * 2 * oct * Math.pow(2, deg / 12);
        this.voice(f, time, 0.34, 'triangle', 0.034);
        this.voice(f * 2.76, time, 0.22, 'sine', 0.016);
        return;
      }
      case 'pad': {
        // Space: ein langes, atmendes Pad im Achttakt (Quint + Oktave).
        if (step % 8 !== 0) return;
        for (const mult of [1, 1.5, 2]) this.pad(rootHz * mult, time, 1.9, 0.022);
        return;
      }
    }
  }

  /** Lange Pad-Stimme mit weichem An- und Abschwellen (Space-Ekstase). */
  private pad(freq: number, time: number, dur: number, gain: number): void {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(gain, time + dur * 0.4);
    g.gain.linearRampToValueAtTime(0.0001, time + dur);
    osc.connect(g);
    g.connect(this.out);
    osc.start(time);
    osc.stop(time + dur + 0.05);
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

  /**
   * ROADMAP-V2 X5: Ekstase-Fenster auf/zu. Wird pro Frame gerufen und ist
   * absichtlich zustandslos-billig (ein Boolean weiter nach unten reichen);
   * ohne Kontext ein No-op wie alles hier.
   */
  setEkstase(on: boolean): void {
    this.music?.setEkstase(on);
  }

  /**
   * Beweis-Oberfläche (X5, gleicher Geist wie `window.chLoot`): Kontext-Status
   * und die EFFEKTIVE Master-Lautstärke. Damit kann der Headless-Smoke den
   * Mute-Vertrag messen, statt ihn zu behaupten.
   */
  get debug(): { ctx: string; master: number; muted: boolean } {
    return {
      ctx: this.ctx?.state ?? 'none',
      master: this.master?.gain.value ?? -1,
      muted: this.prefs.muted,
    };
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

  private clapNoise(gain: number, dur: number, delay = 0): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus) return;
    const t = ctx.currentTime + delay;
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

  /**
   * ROADMAP-V2 G2 — Bass-Drop-Stinger zum Boss-Auftritt. Drei Lagen im
   * bestehenden Graph (keine Samples): ein gefilterter Rausch-Riser zieht 0.45 s
   * hoch, dann fällt ein Sub-Sinus von 110 auf 32 Hz („Drop") und ein
   * Sägezahn-Grollen + Klatsch setzen den Aufschlag. Ohne Kontext ein No-op —
   * derselbe Vertrag wie alle SFX hier.
   */
  bossIntro(): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus) return;
    const t = ctx.currentTime;
    const DROP = 0.45; // Sekunden bis zum Aufschlag
    // Riser: Bandpass-Rauschen, das in den Drop hineinzieht.
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer(ctx);
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(420, t);
    bp.frequency.exponentialRampToValueAtTime(6200, t + DROP);
    const rg = ctx.createGain();
    rg.gain.setValueAtTime(0.0001, t);
    rg.gain.exponentialRampToValueAtTime(0.1, t + DROP * 0.94);
    rg.gain.exponentialRampToValueAtTime(0.0001, t + DROP + 0.12);
    src.connect(bp);
    bp.connect(rg);
    rg.connect(bus);
    src.start(t);
    src.stop(t + DROP + 0.16);
    // Drop: Sub-Sinus 110 → 32 Hz.
    const sub = ctx.createOscillator();
    const sg = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(110, t + DROP);
    sub.frequency.exponentialRampToValueAtTime(32, t + DROP + 0.5);
    sg.gain.setValueAtTime(0.0001, t + DROP);
    sg.gain.linearRampToValueAtTime(0.28, t + DROP + 0.03);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + DROP + 0.62);
    sub.connect(sg);
    sg.connect(bus);
    sub.start(t + DROP);
    sub.stop(t + DROP + 0.68);
    // Aufschlag: tiefes Sägezahn-Grollen + Klatsch.
    this.tone(65.41, 0.7, 'sawtooth', 0.11, DROP);
    this.clapNoise(0.16, 0.26, DROP);
  }

  /**
   * ROADMAP-V2 G2 — Mini-Fanfare fürs Zonen-Clear (25/25 ohne Boss): zwei kurze
   * Töne, hörbar leiser und kürzer als `bossWin`, damit der Boss-Sieg der
   * lautere Moment bleibt.
   */
  zoneClear(): void {
    [659.25, 987.77].forEach((f, i) => this.tone(f, 0.13, 'triangle', 0.075, i * 0.08));
  }

  bossWin(): void {
    [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      this.tone(f, 0.22, 'sawtooth', 0.14, i * 0.1),
    );
    // G2: die Fanfare bekommt einen Schluss-Akkord + Jubel-Klatsch statt
    // einfach abzureißen — der Sieg-Beat braucht ein Ende, keinen Abbruch.
    [523.25, 659.25, 783.99, 1318.5].forEach((f) => this.tone(f, 0.65, 'triangle', 0.095, 0.5));
    this.clapNoise(0.15, 0.32, 0.5);
  }

  bossLose(): void {
    [440, 349.23, 261.63, 174.61].forEach((f, i) => this.tone(f, 0.24, 'sine', 0.14, i * 0.12));
  }

  /**
   * Eine Stimme mit WEICHEM Anschwellen (der `tone`-Helfer schlägt in 6 ms an —
   * gut für Klicks, falsch für eine getragene Zeremonie). Optional gleitet die
   * Frequenz über die Laufzeit, was den Transzendenz-Sog trägt.
   */
  private swell(
    freq: number,
    dur: number,
    wave: OscillatorType,
    gain: number,
    delay = 0,
    attack = 0.25,
    toFreq = 0,
  ): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t);
    if (toFreq > 0) osc.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(attack, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  /**
   * ROADMAP-V2 X5 — Der Stinger einer Prestige-Zeremonie (G4). Drei Klänge, die
   * sich so klar unterscheiden wie die Blenden darüber:
   *
   *  · `ascend`      — hell und aufsteigend: eine Dur-Leiter nach oben plus
   *                    Glitzer-Rauschen, kurz und freudig (die häufigste Schicht).
   *  · `himmelfahrt` — warm und groß: ein getragener Akkord, der anschwillt,
   *                    darüber ein Fanfaren-Motiv (Oktave über dem Grundton).
   *  · `transcend`   — mystisch und tief: ein Sub-Ton, der um eine Oktave nach
   *                    unten gleitet, darüber inharmonische Glocken (der
   *                    „Sog nach innen" der Implosion).
   *
   * Alles synthetisch im bestehenden SFX-Graph, ohne Kontext ein No-op — und
   * weil es am `sfxBus` hängt, schaltet der Mute-Knopf es mit ab.
   */
  ceremony(kind: 'ascend' | 'himmelfahrt' | 'transcend'): void {
    if (!this.ctx || !this.sfxBus) return;
    if (kind === 'ascend') {
      [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) =>
        this.tone(f, 0.26, 'triangle', 0.12, i * 0.075),
      );
      this.tone(1567.98, 0.5, 'sine', 0.07, 0.38); // Glanz-Ton obendrauf
      this.clapNoise(0.05, 0.3, 0.36); // feines Glitzern
      return;
    }
    if (kind === 'himmelfahrt') {
      // Getragener Akkord (C3–G3–C4–E4), der über eine halbe Sekunde anschwillt.
      [130.81, 196.0, 261.63, 329.63].forEach((f, i) =>
        this.swell(f, 1.5, 'triangle', 0.085, i * 0.05, 0.42),
      );
      // Fanfare darüber — sie kommt erst, wenn der Akkord steht.
      [523.25, 659.25, 783.99].forEach((f, i) =>
        this.tone(f, 0.38, 'sawtooth', 0.085, 0.5 + i * 0.14),
      );
      this.clapNoise(0.1, 0.4, 0.5);
      return;
    }
    // transcend: Sub-Gleiter nach unten + inharmonische Glocken darüber.
    this.swell(110, 1.8, 'sine', 0.2, 0, 0.3, 55);
    this.swell(73.42, 1.8, 'triangle', 0.09, 0.06, 0.35, 36.71);
    [932.33, 1244.51, 1567.98].forEach((f, i) =>
      this.swell(f, 1.1 - i * 0.15, 'sine', 0.055, 0.24 + i * 0.16, 0.05),
    );
    this.tone(46.25, 1.4, 'sine', 0.13, 0.5); // der tiefe Boden darunter
  }

  /**
   * ROADMAP-V2 X5 — Der Kobold hoppelt auf die Bühne (A3): ein kurzes, freches
   * „hehe" aus vier Blips, die zwischen zwei Tonhöhen springen, mit einem
   * tiefen Hüpf-Ton darunter. Bewusst leise und sehr kurz — es ist ein Hinweis,
   * kein Ereignis.
   */
  goblinSpawn(): void {
    [980, 1240, 980, 1180].forEach((f, i) => this.tone(f, 0.045, 'square', 0.075, i * 0.062));
    this.tone(196, 0.12, 'triangle', 0.06, 0.02);
  }

  /** X5 — Kobold gefangen: heller Erfolgs-Plink plus Jubel-Klatsch. */
  goblinCatch(): void {
    [783.99, 1046.5, 1567.98].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.12, i * 0.065));
    this.clapNoise(0.12, 0.2, 0.13);
  }
}
