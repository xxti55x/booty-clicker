import type { BackgroundKey } from '../types';
import { loadAudioPrefs, saveAudioPrefs, type AudioPrefs, type PrefsStorage } from './prefs';
import { BOSS_TRACK, MUSIC_TRACKS, PATTERN_STEPS, type TrackConfig } from './tracks';

/** Takte je Phrase — die Länge des „Atems" eines Tracks. */
export const PHRASE_BARS = 8;
/** Ab diesem Takt verdichtet die Phrase (Build). */
export const BUILD_BAR = 4;
/** Ab diesem Takt macht sie auf (Drop). */
export const DROP_BAR = 6;

/** Die drei Abschnitte einer Phrase — reine Ableitung aus dem Takt-Zähler. */
export type Section = 'groove' | 'build' | 'drop';
export function sectionFor(bar: number): Section {
  if (bar >= DROP_BAR) return 'drop';
  if (bar >= BUILD_BAR) return 'build';
  return 'groove';
}

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
  /** Boss-Bühne aktiv? ⇒ der Hardcore-Track übernimmt den ganzen Loop. */
  private bossMode = false;
  /**
   * Laufender Takt der Songstruktur (0..PHRASE_BARS-1). Vorher lief ein einziger
   * 16-Schritt-Loop endlos und flach durch; jetzt atmet er in Achttakt-Phrasen:
   * GROOVE (0-3) trägt, BUILD (4-5) verdichtet und öffnet den Filter,
   * DROP (6-7) macht auf. Genau dieses Atmen unterscheidet einen Track von
   * einer Schleife — und es kostet nichts als einen Zähler.
   */
  private bar = 0;

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

  /** Boss-Bühne auf/zu — Öffnen schlägt denselben Impact wie der Ekstase-Drop. */
  setBossMode(on: boolean): void {
    if (on && !this.bossMode) this.dropImpact(this.ctx.currentTime);
    this.bossMode = on;
  }

  /** Der Track, der JETZT gilt: Boss-Bühnen spielen den Hardcore-Track. */
  private activeTrack(): TrackConfig {
    return this.bossMode ? BOSS_TRACK : this.track;
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
    const secPerStep = (60 / this.activeTrack().bpm / 2) * (this.ekstase ? 0.82 : 1);
    while (this.nextNoteTime < this.ctx.currentTime + 0.2) {
      this.scheduleStep(this.step, this.nextNoteTime);
      this.nextNoteTime += secPerStep;
      this.step = (this.step + 1) % PATTERN_STEPS;
      if (this.step === 0) this.bar = (this.bar + 1) % PHRASE_BARS;
    }
    this.timer = setTimeout(this.tick, 55);
  };

  private scheduleStep(step: number, time: number): void {
    const track = this.activeTrack();
    const { rootHz, wave, genre, hook, bass, detune, cutoff } = track;
    const section = sectionFor(this.bar);
    // Der Filter atmet mit der Phrase: im Build öffnet er weit (die Spannung
    // steigt hörbar), im Drop steht er offen, im Groove trägt er zurückhaltend.
    const openness =
      section === 'build' ? 1 + (this.bar - BUILD_BAR + 1) * 0.55 : section === 'drop' ? 2.1 : 1;
    const leadCut = Math.min(9000, cutoff * openness);
    // Die Melodie kommt aus dem Hook des Themes, nicht mehr aus dem
    // Skalen-Durchlauf: `null` ist eine echte Pause und lässt den Groove atmen.
    const hookSemi = hook[step % hook.length] ?? null;
    const bassSemi = bass[step % bass.length] ?? null;
    if (this.ekstase) {
      // Der Drop-Groove: Four-on-the-floor, Hats auf JEDEM Achtel, Bass in
      // doppelter Rate mit Wechsel auf die Quinte — der Grund-Groove darunter
      // bleibt erkennbar (gleiche Skala, gleiches Arp), er rennt nur.
      if (step % 2 === 0) this.kick(time);
      this.hat(time);
      const bSemi = step % 4 < 2 ? 0 : 7;
      this.voice((rootHz / 2) * Math.pow(2, bSemi / 12), time, 0.2, wave, 0.16);
    } else {
      // Techno-Grundgroove je Subgenre. Der BREAKDOWN ist die einzige Stelle,
      // an der die Kick schweigt: die letzten beiden Build-Takte tragen nur
      // Hats, Riser und Melodie — danach schlägt der Drop umso härter ein.
      const breakdown = section === 'build';
      switch (genre) {
        case 'bounce':
          // Four-on-the-floor + der „Donk" hüpft auf den Offbeats.
          if (step % 4 === 0 && !breakdown) this.kick(time);
          if (step % 4 === 2) this.voice(rootHz, time, 0.11, 'square', 0.12);
          if (step % 2 === 1) this.hat(time);
          break;
        case 'trance':
          // Rollender Achtel-Bass unterm Kick — der Motor jeder Trance-Nacht.
          if (step % 4 === 0 && !breakdown) this.kick(time);
          if (step % 2 === 1) this.hat(time);
          break;
        case 'house':
          // Four-on-the-floor + OFFENE Hats auf den Offbeats (längerer Ausklang).
          if (step % 4 === 0 && !breakdown) this.kick(time);
          if (step % 4 === 2) this.hat(time, 0.16);
          else if (step % 2 === 1) this.hat(time);
          break;
        case 'hardtechno':
          // Treibende Doppel-Kick, Hats auf jedem Achtel.
          if (step % 2 === 0 && !breakdown) this.kick(time);
          this.hat(time);
          break;
        case 'hardcore':
          // Boss: die Kick-Wand — jeder Achtel, mit Verzerr-Transiente. Sie
          // kennt KEINEN Breakdown; der Boss lässt nicht locker.
          this.kick(time, true);
          this.hat(time);
          break;
      }
      // Backbeat-Clap auf 2 und 4 — das Rückgrat jedes Tanzflächen-Grooves.
      // Im Breakdown bleibt er stehen und hält den Takt zusammen.
      if (step % 8 === 4) this.clap(time, breakdown ? 0.11 : 0.09);
      // Die Bassfigur des Themes (Muster statt Dauerton). Sie trägt zusätzlich
      // einen Sub auf den Taktschwerpunkten — Gewicht, kein Ton.
      if (bassSemi !== null && !breakdown) {
        const bHz = (rootHz / 2) * Math.pow(2, bassSemi / 12);
        this.voice(bHz, time, genre === 'house' ? 0.26 : 0.14, wave, 0.12);
        if (step % 8 === 0) this.sub(bHz / 2, time, 0.22);
      }
      // Der Riser läuft EINMAL je Phrase über die beiden Build-Takte.
      if (step === 0 && this.bar === BUILD_BAR) {
        this.riser(time, (60 / track.bpm) * 8);
      }
    }
    // Melodie: der Hook des Themes, gespielt als fette Doppel-Stimme. Im Drop
    // kommt die Oktave darüber dazu — dieselbe Melodie, nur größer.
    if (hookSemi !== null) {
      const hz = rootHz * Math.pow(2, hookSemi / 12);
      this.lead(hz, time, 0.19, wave, 0.075, detune, leadCut);
      if (section === 'drop') this.lead(hz * 2, time, 0.13, wave, 0.03, detune, leadCut);
    }

    // Additive combo-intensity layers (spec §8.10) — muteable (all under `out`),
    // lazy (only while the loop plays), never autoplaying. Sie hängen jetzt am
    // HOOK statt am Skalen-Durchlauf: die Combo macht denselben Song größer,
    // sie stellt keinen zweiten daneben.
    if (this.intensity >= 1 && step % 4 === 2) this.kick(time); // Tier 2: percussion
    if (this.intensity >= 2 && hookSemi !== null) {
      // Tier 3: dieselbe Melodie eine Oktave höher, schlank (kein Detune).
      this.voice(rootHz * 2 * Math.pow(2, hookSemi / 12), time, 0.12, wave, 0.045);
    }
    if (this.intensity >= 3 && step % 8 === 0) this.sweep(time); // Ekstase: filter-sweep

    // ROADMAP-V2 X5: die ZWEITE Instrumenten-Lage des Themes — nur im
    // Ekstase-Fenster, dezent unter dem Hauptmix (Gains ≈ ein Drittel der
    // Bass-Stimme), damit sie das Fenster faerbt statt es zu übertönen. Sie
    // liest denselben Hook (Pause = Pause), damit sie nie gegen ihn läuft.
    if (this.ekstase) {
      this.ekstaseLayer(step, time, hookSemi ?? 0, step % 8 >= 4 ? 2 : 1);
    }
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

  /**
   * A short pitched kick — `hard` (Boss-Hardcore) schlägt höher an, fällt
   * tiefer und legt eine Square-Transiente obendrauf (der „verzerrte" Biss,
   * ohne einen WaveShaper im Renderpfad zu bezahlen).
   */
  private kick(time: number, hard = false): void {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(hard ? 210 : 150, time);
    osc.frequency.exponentialRampToValueAtTime(hard ? 38 : 50, time + (hard ? 0.16 : 0.14));
    g.gain.setValueAtTime(hard ? 0.24 : 0.16, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    osc.connect(g);
    g.connect(this.out);
    osc.start(time);
    osc.stop(time + 0.2);
    if (hard) {
      const tr = this.ctx.createOscillator();
      const tg = this.ctx.createGain();
      tr.type = 'square';
      tr.frequency.setValueAtTime(96, time);
      tg.gain.setValueAtTime(0.07, time);
      tg.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
      tr.connect(tg);
      tg.connect(this.out);
      tr.start(time);
      tr.stop(time + 0.05);
    }
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

  /** Geschlossene Hat; `dur` > 0.04 macht sie zur OFFENEN (House-Offbeat). */
  /**
   * Der Backbeat-Clap auf 2 und 4 — das Instrument, das dem Groove vorher am
   * meisten gefehlt hat. Drei sehr schnelle Rausch-Anrisse (die „Hände") plus
   * ein längerer Körper, alles durch einen Bandpass: so klingt eine Handfläche
   * und nicht ein Zischen.
   */
  private clap(time: number, gain = 0.09): void {
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 1.1;
    const g = this.ctx.createGain();
    bp.connect(g);
    g.connect(this.out);
    // Die drei Anrisse im Abstand von ~9 ms — das Ohr hört sie als EINEN Schlag
    // mit Textur, nicht als drei Ereignisse.
    for (let i = 0; i < 3; i++) {
      const t = time + i * 0.009;
      g.gain.setValueAtTime(gain * (0.6 + 0.2 * i), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
    }
    const body = time + 0.027;
    g.gain.setValueAtTime(gain, body);
    g.gain.exponentialRampToValueAtTime(0.0001, body + 0.13);
    const src = this.ctx.createBufferSource();
    src.buffer = getNoiseBuffer(this.ctx);
    src.connect(bp);
    src.start(time);
    src.stop(time + 0.2);
  }

  /**
   * Lead-Stimme mit Doppel-Oszillator: zweimal derselbe Ton, gegeneinander um
   * `detune` Cent verstimmt, hinter einem Tiefpass. Die Schwebung der beiden
   * macht aus einem dünnen Piepen einen Synth-Sound — derselbe Trick, auf dem
   * jeder Trance-Lead steht. `cutoff` atmet mit der Songstruktur.
   */
  private lead(
    freq: number,
    time: number,
    dur: number,
    wave: OscillatorType,
    gain: number,
    detune: number,
    cutoff: number,
  ): void {
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cutoff, time);
    lp.Q.value = 6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    lp.connect(g);
    g.connect(this.out);
    for (const cents of [-detune, detune]) {
      const o = this.ctx.createOscillator();
      o.type = wave;
      o.frequency.setValueAtTime(freq, time);
      o.detune.setValueAtTime(cents, time);
      o.connect(lp);
      o.start(time);
      o.stop(time + dur + 0.02);
    }
  }

  /**
   * Das Fundament unter dem Kick: eine reine Sinus-Tiefe. Sie trägt keine
   * Melodie, sie trägt das Gewicht — auf Handy-Lautsprechern spürt man sie als
   * Druck, nicht als Ton.
   */
  private sub(freq: number, time: number, dur: number, gain = 0.13): void {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(g);
    g.connect(this.out);
    o.start(time);
    o.stop(time + dur + 0.02);
  }

  /**
   * Rausch-Anstieg über einen ganzen Takt: das Signal „gleich passiert etwas".
   * Läuft einmal im Build und macht den Drop überhaupt erst zu einem Ereignis.
   */
  private riser(time: number, dur: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = getNoiseBuffer(this.ctx);
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(700, time);
    bp.frequency.exponentialRampToValueAtTime(7200, time + dur);
    bp.Q.value = 2.5;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.05, time + dur * 0.85);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.out);
    src.start(time);
    src.stop(time + dur + 0.02);
  }

  private hat(time: number, dur = 0.04): void {
    const src = this.ctx.createBufferSource();
    src.buffer = getNoiseBuffer(this.ctx);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.05, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
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

  /** Boss-Bühne: der Hardcore-Track übernimmt (User-Auftrag „extra hard"). */
  setBossMode(on: boolean): void {
    this.music?.setBossMode(on);
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

  /**
   * Der Rickroll-Gag der alten Ahnen-Tastenfolge. Bewusst KEINE Tondatei: Das
   * Projekt lädt grundsätzlich keine externen Assets (Bundle-Größe, Lizenz —
   * siehe public/CREDITS.md), also spielt der Synthesizer eine eigene, im Stil
   * zitierende 80er-Pop-Hookline — dieselbe Bauweise wie jede andere Fanfare
   * hier. Achtel im Marsch-Tempo, Bläser-Sägezahn über einem Bass, und am
   * Ende der augenzwinkernde Aufschwung.
   */
  rickroll(): void {
    // C-Dur-Figur: Auftakt, dann die typische Vier-Ton-Wendung, zweimal.
    const MELODY: readonly [number, number][] = [
      [392, 0.0],
      [440, 0.16],
      [523.25, 0.32],
      [440, 0.48],
      [659.25, 0.64],
      [659.25, 0.88],
      [587.33, 1.06],
      [392, 1.34],
      [440, 1.5],
      [523.25, 1.66],
      [440, 1.82],
      [587.33, 1.98],
      [587.33, 2.22],
      [523.25, 2.4],
      [493.88, 2.58],
      [440, 2.78],
    ];
    for (const [hz, at] of MELODY) this.tone(hz, 0.17, 'sawtooth', 0.1, at);
    // Bassfundament auf den Taktschwerpunkten — vier Akkordstufen.
    [
      [130.81, 0.0],
      [164.81, 0.64],
      [174.61, 1.34],
      [196, 1.98],
    ].forEach(([hz, at]) => this.tone(hz!, 0.6, 'triangle', 0.11, at!));
    // Klatschen auf 2 und 4, wie es sich für die Ära gehört.
    [0.32, 0.96, 1.66, 2.3].forEach((at) => this.clapNoise(0.1, 0.22, at));
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
