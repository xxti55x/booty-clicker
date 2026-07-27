import * as THREE from 'three';

/**
 * ROADMAP-V2 G5 — „Gesichter leben".
 *
 * Vier billige Gesichts-Zustände auf dem BESTEHENDEN Rig: Blinzeln, Pupillen,
 * die den Rivalen tracken, ein O-Mund während der Ekstase und eine Grimasse
 * nach einem Boss-Timeout. Alles ist Mesh-Sichtbarkeit/-Scale/-Position UNTER
 * dem `head`-Bone — es gibt keinen neuen Bone, keine neue Textur und keinen
 * neuen Draw-Call-Pfad. Der Physik-Kontrakt (`stepPhysics`/`applyPose`/
 * `renderCheeks`, Bone-Namen und -Pivots) bleibt unberührt: der Kopf-Bone wird
 * hier nie geschrieben, nur seine Kinder.
 *
 * Aufbau wie `accents.ts`: eine reine Zustands-Struktur (`FaceState`) mit
 * reinen Schritt-/Ansichts-Funktionen plus ein dünner Schreiber (`applyFace`),
 * der die in `buildCharacter` registrierten Handles (`FaceRig`) mit der
 * berechneten Ansicht füttert. Die Loop tickt einmal pro Frame mit `dt` und
 * dem Zustand (Ziel-Richtung, Ekstase-Flag) — sonst nichts.
 *
 * Zwei bewusste Entscheidungen:
 *  · **Verstecken heißt `scale ≈ 0`, nicht `visible = false`.** Der
 *    `models/`-Export (`dev/export-models.ts` → `GLTFExporter`) läuft mit dem
 *    Vorgabewert `onlyVisible: true` — unsichtbare Knoten fielen also still aus
 *    den .glb-Dateien. Lider und O-Mund bleiben deshalb sichtbar und ruhen auf
 *    `REST_SCALE`; im Bild ist das sub-pixel, im Export sind sie vollwertige
 *    Meshes mit Material.
 *  · **Kein Quality-Schalter.** Die Meshes existieren ohnehin (sie werden mit
 *    dem Kopf gebaut, ob sie sich bewegen oder nicht); der Laufzeit-Anteil sind
 *    ein Timer, ein Lerp und ~8 Scale-/Positions-Schreibvorgänge pro Frame —
 *    das ist billiger als das Abfragen eines Presets. Auch `low` blinzelt.
 */

/** Kürzester Abstand zwischen zwei Blinzlern (s). */
export const BLINK_MIN_S = 3;
/** Längster Abstand zwischen zwei Blinzlern (s). */
export const BLINK_MAX_S = 6;
/** Dauer eines Blinzlers (s) — zu, wieder auf. */
export const BLINK_S = 0.12;
/** Ab diesem Lid-Schluss verschwinden die Pupillen (kein Glitch durchs Lid). */
export const PUPIL_HIDE_AT = 0.6;
/** Maximaler Pupillen-Versatz in Kopf-Einheiten (je Achse). */
export const PUPIL_MAX = 0.02;
/** Blickrichtung → Versatz: eine normierte Richtung von 1 gäbe diesen Ausschlag. */
export const PUPIL_GAIN = 0.06;
/** Nachzieh-Rate der Pupillen (1/s, exponentiell) — träge statt zackig. */
export const PUPIL_LERP = 6;
/** Dauer der Boss-Fail-Grimasse (s). */
export const GRIMACE_S = 1.5;
/** Letzte Sekunden der Grimasse, in denen die Brauen zurückfahren (s). */
export const GRIMACE_FADE_S = 0.3;
/** Brauen-Schrägstellung der Grimasse (rad, ×Seite; Gegenrichtung zu „angry"). */
export const GRIMACE_BROW = -0.45;
/** Ruhe-Scale versteckter Gesichts-Meshes (nicht 0: erhält Normalen/Export). */
export const REST_SCALE = 0.001;
/** Anteil, um den die Robo-Visor-Pixel beim „Blinken" zusammenfahren. */
export const VISOR_BLINK = 0.85;
/** Blickziel-Höhe über `entity.root` (der Rivale steht auf seinem Wurzelpunkt). */
export const RIVAL_AIM_UP = 2.2;

/** Eine Pupille + ihre Ruhelage (der Versatz wird immer absolut geschrieben). */
export interface PupilHandle {
  m: THREE.Object3D;
  base: THREE.Vector3;
}

/** Eine Braue + ihre Ruhe-Rotation und Seite (−1/+1). */
export interface BrowHandle {
  m: THREE.Object3D;
  baseZ: number;
  side: number;
}

/** Die zwei Mund-Varianten: der Lächel-/Grimassen-Bogen und der O-Ring. */
export interface MouthHandle {
  arc: THREE.Object3D;
  /** `arc.rotation.z` des Lächelns (Bogen öffnet nach oben). */
  smileZ: number;
  /** `arc.rotation.z` der Grimasse (derselbe Bogen um 180° gedreht). */
  frownZ: number;
  /** `arc.position.y` des Lächelns. */
  smileY: number;
  /**
   * `arc.position.y` der Grimasse: um den Bogen-Radius TIEFER. Der gedrehte
   * Halb-Torus wölbt sich sonst nach oben aus der Mundzone heraus und läuft um
   * die Nase herum (im ersten Beweis-Lauf sah die Grimasse aus wie ein Schnurr-
   * bart). Abgesenkt liegen die Mundwinkel dort, wo vorher das Lächeln endete.
   */
  frownY: number;
  o: THREE.Object3D;
}

/**
 * Die Gesichts-Handles eines gebauten Charakters. `buildCharacter` füllt sie
 * dort, wo es ein Standard-Gesicht gibt (jeder `face()`-Aufrufer). Robo und
 * Ninja tragen Visor bzw. Maske und haben KEIN Standard-Gesicht: dort bleiben
 * die Listen leer und jede Funktion hier ist ein No-op — der Robo bekommt
 * lediglich seine zwei Visor-Pixel registriert und „blinkt" damit.
 */
export interface FaceRig {
  /** Augenlider (Pivot am oberen Lidrand, `scale.y` 0…1 = offen…zu). */
  lids: THREE.Object3D[];
  pupils: PupilHandle[];
  brows: BrowHandle[];
  mouth: MouthHandle | null;
  /** Robo-Visor-Pixel (kein echtes Gesicht — nur der Blink-Ersatz). */
  visorPixels: THREE.Object3D[];
}

/** Leere Handles — `buildCharacter` registriert hinein, was der Stil hergibt. */
export function createFaceRig(): FaceRig {
  return { lids: [], pupils: [], brows: [], mouth: null, visorPixels: [] };
}

/** Lebender Gesichts-Zustand (transient, nie persistiert). */
export interface FaceState {
  /** Restzeit bis zum nächsten Blinzeln (s). */
  nextBlink: number;
  /** Restlaufzeit des aktuellen Blinzelns (s, 0 = Augen offen). */
  blinkLeft: number;
  /** Geglätteter Pupillen-Versatz (Kopf-lokal). */
  px: number;
  py: number;
  /** Restlaufzeit der Grimasse (s). */
  grimaceLeft: number;
}

/** Zufälliger Abstand bis zum nächsten Blinzeln. */
export function blinkGap(rnd: () => number = Math.random): number {
  return BLINK_MIN_S + rnd() * (BLINK_MAX_S - BLINK_MIN_S);
}

/** Frisches, ruhiges Gesicht. */
export function createFaceState(rnd: () => number = Math.random): FaceState {
  return { nextBlink: blinkGap(rnd), blinkLeft: 0, px: 0, py: 0, grimaceLeft: 0 };
}

/** Sofort blinzeln (Debug-Hook `window.chFace.blink`). Läuft nie doppelt. */
export function forceBlink(s: FaceState, rnd: () => number = Math.random): void {
  if (s.blinkLeft > 0) return;
  s.blinkLeft = BLINK_S;
  s.nextBlink = blinkGap(rnd);
}

/** Boss-Timeout: 1.5 s Grimasse (nachfeuern setzt sie zurück). Mutiert. */
export function triggerGrimace(s: FaceState): void {
  s.grimaceLeft = GRIMACE_S;
}

/** Ein Achsen-Versatz aus einer normierten Blickrichtung, geklemmt. */
export function clampPupil(dir: number): number {
  const v = dir * PUPIL_GAIN;
  return v < -PUPIL_MAX ? -PUPIL_MAX : v > PUPIL_MAX ? PUPIL_MAX : v;
}

/** Lid-Schluss dieses Frames: 0 = offen, 1 = zu (Sinus-Halbwelle). */
export function lidClose(s: FaceState): number {
  if (s.blinkLeft <= 0) return 0;
  return Math.sin(Math.PI * (1 - s.blinkLeft / BLINK_S));
}

/** Kopf-lokale Blickrichtung (normiert); `stepFace` macht den Versatz daraus. */
export interface FaceAim {
  x: number;
  y: number;
}

/**
 * Blinzel-Timer, Pupillen-Nachlauf und Grimassen-Timeout um `dt` weiterdrehen.
 * Rein (bis auf die Mutation von `s`) — kein THREE, kein DOM.
 */
export function stepFace(
  s: FaceState,
  dt: number,
  aim: FaceAim,
  rnd: () => number = Math.random,
): void {
  if (s.blinkLeft > 0) {
    s.blinkLeft = Math.max(0, s.blinkLeft - dt);
  } else {
    s.nextBlink -= dt;
    if (s.nextBlink <= 0) {
      s.blinkLeft = BLINK_S;
      s.nextBlink = blinkGap(rnd);
    }
  }
  // Träge nachgeführt: exponentielles Nachziehen, framerate-unabhängig.
  const k = 1 - Math.exp(-dt * PUPIL_LERP);
  s.px += (clampPupil(aim.x) - s.px) * k;
  s.py += (clampPupil(aim.y) - s.py) * k;
  if (s.grimaceLeft > 0) s.grimaceLeft = Math.max(0, s.grimaceLeft - dt);
}

/** Was dieses Frame im Gesicht steht (aus dem Zustand abgeleitet, rein). */
export interface FaceView {
  /** Lid-Schluss 0…1. */
  lid: number;
  /** Pupillen-Versatz (Kopf-lokal). */
  px: number;
  py: number;
  /** Welche Mund-Variante sichtbar ist. */
  mouth: 'smile' | 'o' | 'frown';
  /** Brauen-Schrägstellung 0…1 (nur während der Grimasse). */
  brow: number;
}

/**
 * Zustand → Ansicht. Die Grimasse schlägt die Ekstase: ein Boss-Timeout wirft
 * uns aus dem Kampf, das Gesicht soll den Verlust zeigen, auch wenn das
 * ×10-Fenster technisch noch offen ist.
 */
export function faceView(s: FaceState, frenzy: boolean): FaceView {
  const grim = s.grimaceLeft > 0;
  return {
    lid: lidClose(s),
    px: s.px,
    py: s.py,
    mouth: grim ? 'frown' : frenzy ? 'o' : 'smile',
    brow: grim ? Math.min(1, s.grimaceLeft / GRIMACE_FADE_S) : 0,
  };
}

/**
 * Die Ansicht auf die Handles schreiben. Alle Werte sind ABSOLUT aus der
 * Ruhelage abgeleitet (nie inkrementell), also setzt `brow = 0` die Brauen
 * exakt auf ihre Bau-Rotation zurück und `mouth = 'smile'` den Bogen exakt auf
 * seine Bau-Drehung — kein Drift über Stunden.
 */
export function applyFace(rig: FaceRig, v: FaceView): void {
  const lid = Math.max(REST_SCALE, v.lid);
  for (const l of rig.lids) l.scale.y = lid;
  const hidePupils = v.lid >= PUPIL_HIDE_AT;
  for (const p of rig.pupils) {
    p.m.position.set(p.base.x + v.px, p.base.y + v.py, p.base.z);
    p.m.scale.setScalar(hidePupils ? REST_SCALE : 1);
  }
  const m = rig.mouth;
  if (m) {
    const o = v.mouth === 'o';
    const frown = v.mouth === 'frown';
    m.arc.scale.setScalar(o ? REST_SCALE : 1);
    m.arc.rotation.z = frown ? m.frownZ : m.smileZ;
    m.arc.position.y = frown ? m.frownY : m.smileY;
    m.o.scale.setScalar(o ? 1 : REST_SCALE);
  }
  for (const b of rig.brows) b.m.rotation.z = b.baseZ + b.side * GRIMACE_BROW * v.brow;
  for (const p of rig.visorPixels) p.scale.y = 1 - VISOR_BLINK * v.lid;
}

const _aim = new THREE.Vector3();

/**
 * Weltposition des Rivalen → kopf-lokale Blickrichtung (x/y, normiert).
 * `head.matrixWorld` muss aktuell sein (die Loop ruft es nach dem Physik-
 * Schritt ohnehin auf). Liegt das Ziel exakt im Kopf-Ursprung, ist der Blick
 * geradeaus.
 */
export function aimPupils(head: THREE.Object3D, target: THREE.Vector3): FaceAim {
  _aim.copy(target);
  head.worldToLocal(_aim);
  const len = Math.hypot(_aim.x, _aim.y, _aim.z);
  if (len < 1e-6) return { x: 0, y: 0 };
  return { x: _aim.x / len, y: _aim.y / len };
}
