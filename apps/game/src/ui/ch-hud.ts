import {
  HINT_GAP_MAX,
  type PurchaseHint,
  bestPurchaseHint,
  bossGap,
  burstEstimate,
  purchaseSignature,
} from '../game/advisor';
import { gimmickForZone, themeForZone } from '../game/boss-gimmicks';
import type { ChState } from '../game/ch-state';
import { type CombatState, bossHp, bossTimeFraction, hpFraction, isBossZone } from '../game/combat';
import { MONSTERS_PER_ZONE } from '../game/combat';
import { comboTierName } from '../game/combo';
import { soulBonusEff } from '../game/heaven';
import { type StageStars, starBitsFor, starsAt } from '../game/stars';
import { transcendGlobalMult } from '../game/transcend';
import { fmt } from './format';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

/** Rivalen-Namen PRO THEME (der Gegner-Körper ist themengebunden — der Name folgt). */
const RIVALS: Record<'club' | 'synth' | 'beach' | 'space', string[]> = {
  club: ['Club-Rivalin', 'Möchtegern-Tänzer', 'TikTok-Twerker', 'Bühnen-Diva'],
  synth: ['Playback-Betrüger', 'Neon-Nervensäge', 'Retro-Rivale', 'Grid-Groover'],
  beach: ['Strand-Angeber', 'Krabben-König', 'Sonnenbrand-Shaker', 'Promenaden-Poser'],
  space: ['Alien-Groupie', 'Schwerelos-Shaker', 'Astro-Angeber', 'Mond-Wackler'],
};
const BOSSES = [
  'Goldener Twerk-Tyrann',
  'Bass-Baron',
  'Diva Supreme',
  'Der Hüft-Hüne',
  'Königin der Kurven',
  'DJ Dämon',
];

/**
 * Der angezeigte Gegner-Name. Boss-Namen tragen die Krone schon im String —
 * ROADMAP-V2 G2 nutzt genau diesen Namen fürs Auftritts-Banner, damit HUD und
 * Banner nie auseinanderlaufen (eine Quelle, keine Kopie).
 */
export function rivalName(zone: number, boss: boolean): string {
  if (boss) return '👑 ' + BOSSES[Math.floor(zone / 5) % BOSSES.length];
  const pool = RIVALS[stripTheme(zone)];
  return pool[zone % pool.length];
}

/**
 * Live HUD + rival/boss panel for the CH mode. HUD-throttle (spec §8.10, B7):
 * text/soul writes are cached and only touched on a real value change, so the
 * click hot-path and the per-frame loop never rebuild DOM needlessly. The moving
 * HP bar + boss timer are refreshed cheaply per frame via `frame()`.
 */
/** Kulissen-Tier je Zone — dieselbe Quelle wie Kulisse + Boss-Gimmick (A2). */
const stripTheme = themeForZone;
/** Insel-Thumbnail-Farben je Kulisse (Oberseite / Unterseite). */
const STRIP_COLORS: Record<'club' | 'synth' | 'beach' | 'space', [string, string]> = {
  club: ['#8b5cf6', '#4c2f8a'],
  synth: ['#d65cd0', '#7a2f8a'],
  beach: ['#eed28a', '#3aa0c9'],
  space: ['#8a8ac9', '#3a3a6a'],
};
/** Mini-Insel-SVG für die Zonen-Bildleiste (Goal: Bühnen als Bild, nicht nur Text). */
function islandSvg(zone: number): string {
  const [top, side] = STRIP_COLORS[stripTheme(zone)];
  return (
    `<svg viewBox="0 0 44 30" aria-hidden="true">` +
    `<ellipse cx="22" cy="12" rx="19" ry="8.5" fill="${top}"/>` +
    `<path d="M4 13c3 5 10 8 18 8s15-3 18-8l-3 6-4 4-6-2-3 5-4-5-6 2-5-4z" fill="${side}"/>` +
    `<path d="M13 21l2 5 3-4zM26 22l3 5 3-6z" fill="#5e421f"/>` +
    `</svg>`
  );
}

/**
 * Die Stern-Pips einer Bühne (ROADMAP-V2 P1): ein ★ je auf DIESER Bühne
 * möglichem Stern — Boss-Bühnen drei, normale zwei (ohne Timeout-Stern) —,
 * gefüllt oder leer. Bewusst Text-Glyphen statt SVG: sie sitzen als eine Zeile
 * unter der Bühnen-Nummer und kosten weder Draw-Call noch Layout-Sprung.
 */
function starPips(zone: number, stars: StageStars): string {
  const mask = starsAt(stars, zone);
  const pips = starBitsFor(zone)
    .map((bit) => `<i class="${(mask & bit) !== 0 ? 'on' : ''}">★</i>`)
    .join('');
  return `<span class="zs-stars">${pips}</span>`;
}

/**
 * Steht der Spieler an der Frontier-Boss-Bühne, deren Gate noch offen ist (und
 * der Boss tanzt noch nicht)? Die gemeinsame Bedingung von „Boss herausfordern"
 * und der P3-Telemetrie-Zeile — EINE Quelle, damit beide nie auseinanderlaufen.
 */
function atFrontierGate(combat: CombatState): boolean {
  return isBossZone(combat.zone) && !combat.boss && combat.zone === combat.maxZone;
}

export class ChHud {
  private readonly zone = byId('zone');
  private readonly zoneKind = byId('zoneKind');
  private readonly gold = byId('gold');
  private readonly stats = byId('stats');
  private readonly comboEl = byId('combo');
  private readonly soulsEl = byId('souls');
  private readonly rivalNameEl = byId('rivalName');
  private readonly hpFill = byId('rivalHpFill');
  private readonly hpText = byId('rivalHpText');
  private readonly prog = byId('zoneProgress');
  private readonly timer = byId('rivalTimer');
  private readonly zoneStrip = byId('zoneStrip');
  private readonly bossBtn = byId('bossChallenge');
  private readonly bossHint = byId('bossHint');
  private readonly gimmickEl = byId('bossGimmick');

  // Cached last-written values (change-detection, no DOM churn).
  private cZone = '';
  private cKind = '';
  private cGold = '';
  private cStats = '';
  private cSouls = '';
  private cRival = '';
  private cHpText = '';
  private cHpPct = -1;
  private cProg = '';
  private cTimer = '';
  private cBoss: boolean | null = null;
  private cCombo = '';
  private cStrip = '';
  private cChallenge: boolean | null = null;
  // P3-Telemetrie: zuletzt geschriebene Zeile + Cache des Kauf-Tipps.
  private cHint = '';
  private hintSig = '';
  private hintBuy: PurchaseHint | null = null;
  // A2: zuletzt geschriebenes Gimmick-Label + Spotlight-Look der HP-Bar.
  private cGimmick = '';
  private cSpotlight: boolean | null = null;

  private setText(el: HTMLElement, next: string, cache: string): string {
    if (next !== cache) el.textContent = next;
    return next;
  }

  /** Full HUD refresh (call on discrete events + the 0.25 s tick). */
  update(state: ChState, combat: CombatState, dps: number, clickDmg: number): void {
    this.cZone = this.setText(this.zone, String(combat.zone), this.cZone);
    // Rendered as a stamped gold chip (`.zone-kind`), so plain text reads best.
    const kind = combat.boss ? 'BOSS' : isBossZone(combat.zone) ? 'VS' : '';
    this.cKind = this.setText(this.zoneKind, kind, this.cKind);
    this.cGold = this.setText(this.gold, fmt(state.gold), this.cGold);
    this.cStats = this.setText(this.stats, `DPS ${fmt(dps)} · Klick ${fmt(clickDmg)}`, this.cStats);

    const hpf = state.heaven.hpf;
    // 🔮 Transzendenz global boost (×3^TE, §4.5.3): shown once transcended even at 0
    // souls/HPF (the mult persists a full L1+L2 wipe), mirroring the 🍑 HPF badge. This
    // is the change-detected souls line, never the per-click hot-path innerHTML.
    const transcended = state.transcend.transcendences > 0;
    const soulsTxt =
      state.souls > 0 || hpf > 0 || transcended
        ? `${fmt(state.souls)} Seelen · +${Math.round(state.souls * soulBonusEff(hpf) * 100)}%` +
          (hpf > 0 ? ` · ${fmt(hpf)} HPF` : '') +
          (transcended ? ` · TE ×${fmt(transcendGlobalMult(state.transcend.te))}` : '')
        : '';
    if (soulsTxt !== this.cSouls) {
      this.cSouls = soulsTxt;
      this.soulsEl.classList.toggle('hidden', soulsTxt === '');
      if (soulsTxt) this.soulsEl.textContent = soulsTxt;
    }

    this.cRival = this.setText(this.rivalNameEl, rivalName(combat.zone, combat.boss), this.cRival);
    // ROADMAP-V2 A2: das Gimmick-Label des Gates steht DAUERHAFT klein an der
    // HP-Bar — das Banner sagt es einmal groß an, hier kann man es nachlesen,
    // solange der Boss tanzt.
    const gimmick = combat.boss ? gimmickForZone(combat.zone) : null;
    const label = gimmick?.label ?? '';
    if (label !== this.cGimmick) {
      this.cGimmick = label;
      this.gimmickEl.classList.toggle('hidden', label === '');
      if (label !== '') {
        this.gimmickEl.textContent = label;
        this.gimmickEl.title = gimmick?.description ?? '';
      }
    }
    this.updateZoneStrip(combat.zone, combat.maxZone, state.stageStars);
    // „Boss herausfordern": nur an der Frontier-Boss-Bühne, solange ihr Gate
    // unbesiegt ist und der Boss nicht schon tanzt.
    const challenge = atFrontierGate(combat);
    if (challenge !== this.cChallenge) {
      this.cChallenge = challenge;
      this.bossBtn.classList.toggle('hidden', !challenge);
      // P3: Die Telemetrie-Zeile teilt die Sichtbarkeits-Bedingung des Buttons —
      // sobald der Boss tanzt (oder man wegreist), verschwindet sie SOFORT, ohne
      // auf den 0.25-s-Tick zu warten. Nur das Rechnen hängt am Tick.
      if (!challenge) this.setHint('');
    }
    this.frame(combat);
  }

  /**
   * Wand-Telemetrie (ROADMAP-V2 P3) — NUR aus dem 0.25-s-Tick aufrufen, nie pro
   * Frame und nie aus dem Klick-Pfad: `bossGap`/`burstEstimate` sind billig, aber
   * die Kauf-Rangfolge scannt die ganze Crew. Sie wird zusätzlich hinter einer
   * Cache-Signatur (Gold/Level/Fähigkeiten) gehalten, läuft also nur nach einer
   * echten Konto- oder Crew-Änderung erneut.
   */
  advise(state: ChState, combat: CombatState, dps: number, clickDmg: number): void {
    if (!atFrontierGate(combat)) {
      this.setHint('');
      return;
    }
    const gap = bossGap(state, combat, dps, clickDmg);
    if (!(gap < HINT_GAP_MAX)) {
      this.setHint(''); // Lücke zu (oder unbekannt) ⇒ kein ungefragter Ratschlag
      return;
    }
    const sig = purchaseSignature(state);
    if (sig !== this.hintSig) {
      this.hintSig = sig;
      this.hintBuy = bestPurchaseHint(state);
    }
    const burst = fmt(burstEstimate(state, dps, clickDmg));
    const boss = fmt(bossHp(combat.zone));
    const tip = this.hintBuy
      ? ` — Tipp: <b>${this.hintBuy.label}</b> · ${fmt(this.hintBuy.cost)} BP${
          this.hintBuy.affordable ? '' : ' (sparen)'
        }`
      : '';
    this.setHint(`Dein Burst ~${burst} · Boss ${boss}${tip}`);
  }

  /** Telemetrie-Zeile schreiben/verstecken (change-detected, kein DOM-Churn). */
  private setHint(html: string): void {
    if (html === this.cHint) return;
    this.cHint = html;
    this.bossHint.classList.toggle('hidden', html === '');
    if (html !== '') this.bossHint.innerHTML = html;
  }

  /**
   * Bühnen-Bildleiste (Goal-Umbau: reine ANZEIGE, nicht klickbar — die Bühnen
   * wählt das Spiel selbst): fünf Insel-Thumbnails um die aktuelle Zone, die
   * aktive markiert, Boss-Gates (×5) mit Gold-Rand, kommende Zonen gedimmt.
   * Unter jeder Nummer die P1-Stern-Pips der Bühne.
   */
  private updateZoneStrip(zone: number, frontier: number, stars: StageStars): void {
    // Nur ERREICHTE Bühnen zeigen (nichts Zukünftiges spoilern): das Fenster
    // endet an der Frontier und jede Bühne ist klickbar — zurückreisen zum
    // Farmen, wieder vor zur Boss-Bühne.
    const end = Math.min(frontier, Math.max(zone + 2, 5));
    const start = Math.max(1, end - 4);
    // Die Sterne der SICHTBAREN Bühnen gehören in die Change-Detection: sonst
    // bliebe ein frisch verdienter Pip bis zur nächsten Bühnen-Änderung leer.
    let starSig = '';
    for (let z = start; z <= end; z++) starSig += `${starsAt(stars, z)},`;
    const sig = `${start}|${end}|${zone}|${frontier}|${starSig}${starsAt(stars, frontier)}`;
    if (sig === this.cStrip) return;
    this.cStrip = sig;
    const slot = (z: number): string => {
      const cls = ['zs', z === zone ? 'active' : 'go', z % 5 === 0 ? 'boss' : '']
        .filter(Boolean)
        .join(' ');
      const label = z % 5 === 0 ? `Boss-Bühne ${z}` : `Bühne ${z}`;
      const title = z === zone ? label : `Zu ${label} reisen`;
      return `<button type="button" class="${cls}" data-z="${z}"
           title="${title}">${islandSvg(z)}<span>${z}</span>${starPips(z, stars)}</button>`;
    };
    const slots: string[] = [];
    for (let z = start; z <= end; z++) slots.push(slot(z));
    // Weit zurückgereist? Die Frontier bleibt IMMER erreichbar — als letzter
    // Slot hinter einer „…"-Lücke (der Weg zurück zum Boss-Gate).
    if (frontier > end) {
      if (frontier > end + 1) slots.push('<span class="zs-gap">…</span>');
      slots.push(slot(frontier));
    }
    this.zoneStrip.innerHTML = slots.join('');
  }

  /** Cheap per-frame refresh of the moving bits (HP bar + boss timer/progress). */
  frame(combat: CombatState): void {
    const pct = Math.round(hpFraction(combat) * 1000) / 10; // 0.1 % granularity
    if (pct !== this.cHpPct) {
      this.cHpPct = pct;
      this.hpFill.style.width = `${pct}%`;
    }
    this.cHpText = this.setText(
      this.hpText,
      `${fmt(combat.hp)} / ${fmt(combat.hpMax)}`,
      this.cHpText,
    );

    if (this.cBoss !== combat.boss) {
      this.cBoss = combat.boss;
      this.prog.classList.toggle('hidden', combat.boss);
      this.timer.classList.toggle('hidden', !combat.boss);
      this.hpFill.classList.toggle('boss', combat.boss);
    }
    if (combat.boss) {
      this.cTimer = this.setText(this.timer, `⏱ ${Math.ceil(combat.bossTimer)}s`, this.cTimer);
      this.timer.classList.toggle('urgent', bossTimeFraction(combat) < 0.34);
    } else {
      this.cProg = this.setText(
        this.prog,
        `${combat.killsThisZone} / ${MONSTERS_PER_ZONE}`,
        this.cProg,
      );
    }
  }

  /**
   * Spotlight-Look der Boss-HP-Bar (ROADMAP-V2 A2, Club): solange die Phase
   * läuft, wechselt der Balken in den Phasen-Look und das Label pulst — der
   * Spieler sieht am Balken selbst, dass gerade nur Klicks zählen. Change-
   * detected, wird also gefahrlos pro Frame gerufen.
   */
  setSpotlight(on: boolean): void {
    if (on === this.cSpotlight) return;
    this.cSpotlight = on;
    this.hpFill.classList.toggle('spotlight', on);
    this.gimmickEl.classList.toggle('on', on);
  }

  /**
   * Ein 🌊-Puls auf der HP-Bar (Beach): die Welle hat gerade geheilt. Die
   * Animation wird per Reflow neu angestoßen, damit auch die dritte Welle
   * desselben Kampfes sichtbar ist.
   */
  pulseHeal(): void {
    this.hpFill.classList.remove('healed');
    void this.hpFill.offsetWidth;
    this.hpFill.classList.add('healed');
  }

  /** Combo readout with the tier name (e.g. "Combo ×27 · Heiß"). */
  setCombo(stacks: number, tier: number): void {
    const n = Math.floor(stacks);
    const name = comboTierName(tier);
    const txt = n > 1 ? `Combo ×${n}${name ? ` · ${name}` : ''}` : '';
    if (txt !== this.cCombo) {
      this.cCombo = txt;
      this.comboEl.textContent = txt;
      this.comboEl.className = tier > 0 ? `combo tier${tier}` : 'combo';
    }
  }
}
