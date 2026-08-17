import * as THREE from 'three';

/**
 * **Boden-Ringe** (D-02/13/16/19/23) — die gezeichnete Form aller Bühnen-Effekte.
 *
 * Leitbild S3 „Jeder Effekt hat eine Form": Treffer, Kill, Boss-Auftritt und
 * Landung sind gerichtete Ringe auf dem Deck, kein formloser heller Fleck. Weil
 * sie UNTER den Akteuren liegen, können sie per Konstruktion keine Silhouette
 * zudecken (K-3) — genau deshalb ist der Ring das Mittel der Wahl.
 *
 * Bauform: EIN Pool aus wenigen Slots, EINE geteilte PlaneGeometry, EINE
 * gecachte Ring-Textur. Das Material ist pro Slot eigen (Farbe/Deckkraft sind
 * per Effekt verschieden), aber vom Programm-TYP her identisch mit dem
 * Kontaktschatten (Basic + Map + transparent) — es kommt kein Shader-Programm
 * dazu (K-7). Bewusst NORMALES Blending, kein Additiv: additive Ringe wären
 * genau der weiße Fleck, den D-02 abschafft.
 *
 * Zwei Betriebsarten:
 *  · `spawn` — ein einmaliger Anschlag-Ring (schnell auf, langsam aus, K-4),
 *    der sich selbst aufräumt.
 *  · `attach` — ein PERSISTENTER Ring an einem Objekt (Boss-Aura, Rarity), der
 *    optional mit dem Beat pulst und per `release` zurückgegeben wird.
 */

/** Slots im Pool: 2 persistente (Boss + Rarity) + Reserve für Transienten. */
const SLOTS = 8;
/**
 * Deckoberkante der Insel in WELT-Koordinaten (`world/island.TOP_Y`). Bewusst
 * als Konstante dupliziert statt importiert: `engine/` darf nicht auf `world/`
 * zeigen — dieselbe Schichtregel, nach der `scene.ts` seinen Kontaktschatten
 * auf −2.385 setzt.
 */
const DECK_Y = -2.4;
/** Höhe über der Deckoberkante — über dem AO-Ring (+0.004), unter den Tiles. */
const RING_Y = 0.01;

interface Slot {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  /** Restlaufzeit des transienten Rings (s); ≤ 0 = frei oder persistent. */
  t: number;
  dur: number;
  r0: number;
  r1: number;
  opacity: number;
  /** Persistent belegt (via `attach`) — wird von `spawn` nie überschrieben. */
  held: boolean;
  /** Persistent: mit dem Beat pulsen? */
  pulse: boolean;
  baseR: number;
}

export interface SpawnOpts {
  /** Startradius (Welt-Einheiten). */
  r0: number;
  /** Endradius. */
  r1: number;
  /** Dauer in Sekunden — K-5-Raster einhalten. */
  dur: number;
  color: number;
  /** Spitzen-Deckkraft (Default 0.75 — nie deckend, der Ring ist Licht). */
  opacity?: number;
}

export interface AttachOpts {
  r: number;
  color: number;
  /** Mit dem Beat atmen (Boss-Aura) oder ruhig stehen (Rarity)? */
  pulse?: boolean;
  opacity?: number;
  /**
   * D-19: Lokale Ring-Höhe unterm Träger (Default {@link RING_Y} — für Träger,
   * die selbst AUF dem Deck stehen). Der Rarity-Ring hängt an der Spieler-
   * Spin-Gruppe im Welt-Ursprung und braucht die Deckhöhe als Versatz.
   */
  y?: number;
}

/** Handle eines persistenten Rings — zurückgeben mit {@link RingPool.release}. */
export type RingHandle = number;

let ringTex: THREE.CanvasTexture | null = null;

/** Weicher Kreisring auf transparentem Grund (gecacht, ein Kanal für alle). */
function ringTexture(): THREE.CanvasTexture {
  if (ringTex) return ringTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  // Innen leer, außen weich auslaufend — die Kante trägt, nicht die Fläche.
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(0.78, 'rgba(255,255,255,1)');
  g.addColorStop(0.95, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  ringTex = new THREE.CanvasTexture(c);
  return ringTex;
}

export class RingPool {
  private readonly slots: Slot[] = [];

  constructor(private readonly scene: THREE.Scene) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2); // flach aufs Deck
    for (let i = 0; i < SLOTS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: ringTexture(),
        transparent: true,
        depthWrite: false,
        opacity: 0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.slots.push({
        mesh,
        mat,
        t: 0,
        dur: 1,
        r0: 0,
        r1: 1,
        opacity: 0.75,
        held: false,
        pulse: false,
        baseR: 1,
      });
    }
  }

  /** Freien, NICHT persistent belegten Slot suchen (ältester transienter zuerst). */
  private free(): Slot | null {
    let oldest: Slot | null = null;
    for (const s of this.slots) {
      if (s.held) continue;
      if (s.t <= 0) return s;
      if (!oldest || s.t < oldest.t) oldest = s;
    }
    return oldest;
  }

  /**
   * Einmaliger Ring am Weltpunkt (x, z) auf Deckhöhe. Der Ring wächst mit einer
   * Anschlag-Kurve (schnell raus, langsam aus) und blendet dabei ab — K-4.
   */
  spawn(x: number, z: number, o: SpawnOpts): void {
    const s = this.free();
    if (!s) return;
    s.held = false;
    s.t = o.dur;
    s.dur = o.dur;
    s.r0 = o.r0;
    s.r1 = o.r1;
    s.opacity = o.opacity ?? 0.75;
    s.mat.color.setHex(o.color);
    // `spawn` bekommt WELT-Koordinaten (Hüfte, Gegner-Fuß) — der Ring gehört
    // aber aufs DECK, nicht auf die Höhe des Auslösers.
    s.mesh.position.set(x, DECK_Y + RING_Y, z);
    if (s.mesh.parent !== this.scene) this.scene.add(s.mesh);
    s.mesh.visible = true;
  }

  /**
   * Persistenter Ring als KIND eines Objekts (Boss-Aura, Rarity-Sockel). Der
   * Ring folgt jeder Bewegung und Skalierung seines Trägers.
   */
  attach(parent: THREE.Object3D, o: AttachOpts): RingHandle {
    const s = this.free();
    if (!s) return -1;
    s.held = true;
    s.t = 0;
    s.pulse = o.pulse ?? false;
    s.baseR = o.r;
    s.opacity = o.opacity ?? 0.5;
    s.mat.color.setHex(o.color);
    s.mat.opacity = s.opacity;
    // `attach`-Ringe hängen an einem Träger, der schon auf dem Deck steht —
    // hier ist der Versatz LOKAL (oder explizit via `o.y`, siehe AttachOpts).
    s.mesh.position.set(0, o.y ?? RING_Y, 0);
    s.mesh.scale.set(o.r * 2, 1, o.r * 2);
    s.mesh.visible = true;
    parent.add(s.mesh);
    return this.slots.indexOf(s);
  }

  /** Persistenten Ring zurückgeben (Skin-/Boss-Wechsel). */
  release(h: RingHandle): void {
    const s = this.slots[h];
    if (!s || !s.held) return;
    s.held = false;
    s.t = 0;
    s.mesh.visible = false;
    s.mesh.removeFromParent();
    this.scene.add(s.mesh);
  }

  /** Aus dem Render-Loop: `dt` treibt die Transienten, `beatV` die Aura-Pulse. */
  update(dt: number, beatV = 0): void {
    for (const s of this.slots) {
      if (s.held) {
        if (s.pulse) {
          const k = s.baseR * (1 + 0.08 * beatV);
          s.mesh.scale.set(k * 2, 1, k * 2);
          s.mat.opacity = s.opacity * (0.75 + 0.25 * beatV);
        }
        continue;
      }
      if (s.t <= 0) continue;
      s.t = Math.max(0, s.t - dt);
      // Anschlag: der Radius schießt raus (1−(1−k)³), die Deckkraft fällt linear.
      const k = 1 - s.t / s.dur;
      const e = 1 - Math.pow(1 - k, 3);
      const r = s.r0 + (s.r1 - s.r0) * e;
      s.mesh.scale.set(r * 2, 1, r * 2);
      s.mat.opacity = s.opacity * (1 - k);
      if (s.t <= 0) s.mesh.visible = false;
    }
  }
}
