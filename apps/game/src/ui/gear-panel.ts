import { SKINS } from '../character/skins';
import type { ChState } from '../game/ch-state';
import { gearUnlockCtx } from '../game/ch-state';
import {
  KULISSE_BUFFS,
  MAX_SKIN_LEVEL,
  MAX_SKIN_STARS,
  type SetBonusConfig,
  activeSets,
  craftCost,
  craftSkin,
  shardCost,
  skinCrafted,
  skinLevel,
  skinStarCount,
  skinUnlocked,
  sugarCostForStar,
} from '../game/gear';
import { SKIN_UNLOCKS } from '../game/gear';
import type { BackgroundKey, SkinKey, SkinRarity } from '../types';
import {
  FORGE_SLOTS,
  affixConfig,
  affixValue,
  qualityConfig,
  type RolledAffix,
} from '../game/affixes';
import {
  FORGE_UNLOCK_LEVELS,
  SHARDS_PER_EMBER,
  emberForShards,
  emberHeld,
  forgeSlotsOf,
  forgeSlotsUnlocked,
  nextForgeUnlock,
} from '../game/forge';
import { affixText } from './affix-text';
import { fmt, fmtInt } from './format';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

/** German rarity labels (§5.3). */
/** Die Freischalt-Level als Text — für die gesperrten Kacheln. */
const FORGE_UNLOCK_LEVELS_TEXT: readonly number[] = FORGE_UNLOCK_LEVELS;

/** Der Inhalt einer Schmiede-Kachel: Glyph + Wert, oder eine Einladung. */
function forgeChip(a: RolledAffix | null): string {
  if (!a) return '<i class="fs-g">🔨</i><span class="fs-t">leer</span>';
  const cfg = affixConfig(a.id);
  if (!cfg) return '<i class="fs-g">🔨</i><span class="fs-t">leer</span>';
  return (
    `<i class="fs-g">${cfg.glyph}</i>` +
    `<span class="fs-t">${affixText(cfg.stat, affixValue(a))}</span>` +
    `<span class="fs-q">${qualityConfig(a.q).mark}</span>`
  );
}

const RARITY_LABEL: Record<SkinRarity, string> = {
  common: 'Gewöhnlich',
  rare: 'Selten',
  epic: 'Episch',
  legendary: 'Legendär',
  mythic: 'Mythisch',
};

/** Kulisse chooser buttons: id + label + a short mini-buff hint (§5.5). */
const KULISSE_UI: { key: BackgroundKey; label: string }[] = [
  { key: 'club', label: '🪩 Club' },
  { key: 'synth', label: '🌆 Synth' },
  { key: 'beach', label: '🏖 Beach' },
  { key: 'space', label: '🚀 Space' },
];

export interface GearDeps {
  state: ChState;
  /** Equip changed: rebuild the 3D character, recompute, refresh HUD, persist. */
  onEquip: () => void;
  /** Level/star/craft changed the gear buffs: recompute, refresh HUD, persist. */
  onProgress: () => void;
  /** Kulisse/Auto changed: apply the background (world + audio), recompute, persist. */
  onKulisse: () => void;
  /** 3a: Den Schmiede-Dialog für einen Slot dieses Skins öffnen. */
  openForge: (id: SkinKey, slot: number) => void;
  /** 3a: Überschüssige Splitter in Schmiede-Glut tauschen (`SHARDS_PER_EMBER` : 1). */
  exchangeShards: (ember: number) => void;
}

/**
 * The 🎽 Gear/Skins tab (spec §5): equip one skin for its buff, level it with 🧩,
 * star it with 🍬, pick a kulisse (or „Auto (Tour)"), and read the active set bonuses.
 * Change-detected the same way as the other panels — `render()` runs on gear events
 * and the throttled 0.25 s tick, never in the click hot-path.
 */
export class Gear {
  private readonly body = byId('tabGear');

  constructor(private readonly deps: GearDeps) {
    this.body.innerHTML = `
      <div class="gear-bal" id="gearBal"></div>
      <div class="settings-section">
        <h3>Kulisse</h3>
        <div class="kulisse-row" id="kulisseRow"></div>
        <div class="dim" id="kulisseHint"></div>
      </div>
      <div class="settings-section">
        <h3>Set-Boni</h3>
        <div id="gearSets"></div>
      </div>
      <div class="settings-section">
        <h3>Skins</h3>
        <div class="skingrid" id="skinGrid"></div>
      </div>`;
    this.render();
  }

  // ---- actions ----

  private equip(id: SkinKey): void {
    const { state } = this.deps;
    if (state.gear.skin === id || !this.unlocked(id)) return;
    state.gear.skin = id;
    this.deps.onEquip();
    this.render();
  }

  private levelUp(id: SkinKey): void {
    const { state } = this.deps;
    if (!this.unlocked(id)) return;
    const lv = skinLevel(state.gear, id);
    if (lv >= MAX_SKIN_LEVEL) return;
    const cost = shardCost(lv);
    if (state.gear.shards < cost) return;
    state.gear.shards -= cost;
    state.gear.skinLevels[id] = lv + 1;
    this.deps.onProgress();
    this.render();
  }

  private starUp(id: SkinKey): void {
    const { state } = this.deps;
    if (!this.unlocked(id)) return;
    const stars = skinStarCount(state.gear, id);
    const cost = sugarCostForStar(stars);
    if (cost === null || state.gear.sugarPeaches < cost) return;
    state.gear.sugarPeaches -= cost;
    state.gear.skinStars[id] = stars + 1;
    this.deps.onProgress();
    this.render();
  }

  private craft(id: SkinKey): void {
    const { state } = this.deps;
    const r = craftSkin(state.gear, id);
    if (!r.ok) return;
    state.gear = r.gear;
    this.deps.onProgress();
    this.render();
  }

  /**
   * Splitter in Glut tauschen. Bewusst EIN Stück je Druck statt „alles
   * umtauschen": Der Kurs ist absichtlich ungünstig (20 : 1), und ein
   * Alles-Knopf würde in einer Sekunde den Splitter-Vorrat leeren, den die
   * Skin-Level (und damit die Schmiede-SLOTS) brauchen. Wer viel tauschen will,
   * darf oft drücken — und merkt dabei, was es kostet.
   */
  private swap(): void {
    const { state } = this.deps;
    if (state.gear.shards < SHARDS_PER_EMBER) return;
    this.deps.exchangeShards(1);
    this.render();
  }

  private setKulisse(key: BackgroundKey): void {
    const { state } = this.deps;
    state.gear.bgAuto = false;
    state.gear.bg = key;
    this.deps.onKulisse();
    this.render();
  }

  private setAuto(): void {
    const { state } = this.deps;
    if (state.gear.bgAuto) return;
    state.gear.bgAuto = true;
    this.deps.onKulisse();
    this.render();
  }

  private unlocked(id: SkinKey): boolean {
    return skinUnlocked(id, gearUnlockCtx(this.deps.state));
  }

  // ---- render ----

  render(): void {
    const { state } = this.deps;
    // 3a: Die Glut steht neben den Splittern, aus denen sie zur Not entsteht —
    // der Umtausch-Knopf gehört an den Ort, an dem beide Zahlen sichtbar sind.
    const canSwap = emberForShards(state.gear.shards) >= 1;
    byId('gearBal').innerHTML =
      `<span class="gb-shard">🧩 ${fmt(state.gear.shards)} Splitter</span>` +
      `<span class="gb-sugar">🍬 ${fmt(state.gear.sugarPeaches)} Zuckerpfirsiche</span>` +
      `<span class="gb-ember">🔥 ${fmt(emberHeld(state.forge))} Glut</span>` +
      `<button class="gb-swap ${canSwap ? '' : 'off'}" id="gearSwap" type="button" ${canSwap ? '' : 'disabled'}>` +
      `${SHARDS_PER_EMBER} 🧩 → 1 🔥</button>`;
    byId('gearSwap').addEventListener('click', () => this.swap());

    this.renderKulisse();
    this.renderSets();
    this.renderGrid();
  }

  private renderKulisse(): void {
    const { state } = this.deps;
    const row = byId('kulisseRow');
    const btns = KULISSE_UI.map((k) => {
      const active = !state.gear.bgAuto && state.gear.bg === k.key;
      return `<button class="kbtn ${active ? 'active' : ''}" data-bg="${k.key}" type="button">${k.label}</button>`;
    });
    btns.push(
      `<button class="kbtn ${state.gear.bgAuto ? 'active' : ''}" data-bg="auto" type="button">🔄 Auto</button>`,
    );
    row.innerHTML = btns.join('');
    for (const b of Array.from(row.querySelectorAll<HTMLButtonElement>('.kbtn'))) {
      const bg = b.dataset.bg!;
      b.addEventListener('click', () =>
        bg === 'auto' ? this.setAuto() : this.setKulisse(bg as BackgroundKey),
      );
    }

    const kul = KULISSE_BUFFS[state.gear.bg];
    const kulTxt = affixText(kul.stat, kul.amount);
    byId('kulisseHint').textContent = state.gear.bgAuto
      ? `Tour-Modus: die Kulisse rotiert mit der Bühne. Aktiv: ${state.gear.bg} (${kulTxt}).`
      : `Feste Kulisse: ${kulTxt}.`;
  }

  private renderSets(): void {
    const sets = activeSets(this.deps.state.gear);
    const el = byId('gearSets');
    if (sets.length === 0) {
      el.innerHTML = `<div class="dim">Kein Set aktiv — kombiniere Skin × Kulisse (z. B. Disco-King + Club = „Studio 54").</div>`;
      return;
    }
    el.innerHTML = sets.map((s: SetBonusConfig) => this.setRow(s)).join('');
  }

  private setRow(s: SetBonusConfig): string {
    return `<div class="gear-set"><span class="gs-name">✨ ${s.name}</span><span class="gs-eff">${affixText(s.stat, s.amount)}</span></div>`;
  }

  private renderGrid(): void {
    const grid = byId('skinGrid');
    grid.innerHTML = (Object.keys(SKINS) as SkinKey[]).map((id) => this.card(id)).join('');
    for (const btn of Array.from(grid.querySelectorAll<HTMLButtonElement>('button[data-act]'))) {
      const card = btn.closest<HTMLElement>('.skincard');
      const id = card?.dataset.id as SkinKey | undefined;
      if (!id) continue;
      const act = btn.dataset.act;
      btn.addEventListener('click', () => {
        if (act === 'equip') this.equip(id);
        else if (act === 'level') this.levelUp(id);
        else if (act === 'star') this.starUp(id);
        else if (act === 'craft') this.craft(id);
        else if (act === 'forge') this.deps.openForge(id, Number(btn.dataset.slot ?? '0'));
      });
    }
  }

  private unlockHint(id: SkinKey): string {
    const rule = SKIN_UNLOCKS[id];
    switch (rule.kind) {
      case 'zone':
        return `🔒 ab Bühne ${rule.zone}`;
      case 'boss':
        return `🔒 Boss Bühne ${rule.zone} besiegen`;
      case 'himmelfahrt':
        return `🔒 nach 1. Himmelfahrt`;
      case 'craft':
        return `🔒 per Craft (${rule.craftCost} 🧩)`;
      case 'transcend':
        return `🔒 ab Transzendenz`;
      default:
        return `🔒 gesperrt`;
    }
  }

  /**
   * **Die Schmiede-Reihe** (3a) — bis zu drei Kacheln direkt an der Skin-Karte.
   *
   * Sie sitzt hier und nicht in einem eigenen Tab, weil ein Slot ANTEIL dieses
   * Skins ist: Er wird von seinem Level freigeschaltet, er wirkt nur, solange
   * dieser Skin getragen wird, und er verschwindet aus der Rechnung, sobald man
   * einen anderen ausrüstet. Eine zweite Liste woanders müsste all das noch
   * einmal erklären.
   *
   * Drei Zustände je Kachel: **gesperrt** (nennt das Level, das sie öffnet),
   * **leer** (lädt zum ersten Schmieden ein) und **belegt** (Glyph + Wert, in
   * der Farbe der Qualität). Gesperrte Kacheln sind bewusst sichtbar — sie sind
   * das Ziel, für das man den Skin weiter levelt.
   */
  private forgeRow(id: SkinKey, level: number, unlocked: boolean): string {
    const { state } = this.deps;
    const open = forgeSlotsUnlocked(level);
    const slots = forgeSlotsOf(state.forge, id);
    const next = nextForgeUnlock(level);
    const chips: string[] = [];
    for (let i = 0; i < FORGE_SLOTS; i++) {
      if (i >= open) {
        const at = FORGE_UNLOCK_LEVELS_TEXT[i];
        chips.push(`<span class="fs off" title="Öffnet bei Skin-Level ${at}">🔒 Lv ${at}</span>`);
        continue;
      }
      const a = slots[i].affix;
      chips.push(
        `<button class="fs ${a ? `q${a.q}` : 'empty'}" data-act="forge" data-slot="${i}" type="button"` +
          ` ${unlocked ? '' : 'disabled'} title="Schmiede-Slot ${i + 1}">${forgeChip(a)}</button>`,
      );
    }
    const hint =
      open === 0 && next !== null
        ? `<span class="sc-fh dim">Schmiede ab Lv ${next}</span>`
        : `<span class="sc-fh dim">🔥 ${fmtInt(emberHeld(state.forge))}</span>`;
    return `<div class="sc-forge">${hint}${chips.join('')}</div>`;
  }

  private card(id: SkinKey): string {
    const { state } = this.deps;
    const cfg = SKINS[id];
    const unlocked = this.unlocked(id);
    const equipped = state.gear.skin === id;
    const lv = skinLevel(state.gear, id);
    const stars = skinStarCount(state.gear, id);

    // Buff descriptors (per-level buff + per-star bonus) — AC4: always shown.
    const buffTxt = `${affixText(cfg.buff.stat, cfg.buff.perLevel)}/Lv`;
    const starTxt = `${affixText(cfg.star.stat, cfg.star.perStar)}/⭐`;
    const nowTxt =
      lv > 0 || stars > 0
        ? `<div class="sc-now">jetzt ${affixText(cfg.buff.stat, cfg.buff.perLevel * lv)}` +
          (stars > 0 ? ` · ${affixText(cfg.star.stat, cfg.star.perStar * stars)}` : '') +
          `</div>`
        : '';

    // Level row (AC4: level + cost). Buttons disabled when locked/maxed/unaffordable.
    const atMaxLv = lv >= MAX_SKIN_LEVEL;
    const lvCost = shardCost(lv);
    const canLevel = unlocked && !atMaxLv && state.gear.shards >= lvCost;
    const lvBtn = atMaxLv
      ? `<button class="sc-btn" data-act="level" disabled>Max</button>`
      : `<button class="sc-btn ${canLevel ? '' : 'off'}" data-act="level" ${canLevel ? '' : 'disabled'}>⬆ ${fmt(lvCost)} 🧩</button>`;

    // Star row (AC4 continued: stars + cost).
    const atMaxStar = stars >= MAX_SKIN_STARS;
    const stCost = sugarCostForStar(stars);
    const canStar = unlocked && !atMaxStar && stCost !== null && state.gear.sugarPeaches >= stCost;
    const stBtn = atMaxStar
      ? `<button class="sc-btn" data-act="star" disabled>★ Max</button>`
      : `<button class="sc-btn ${canStar ? '' : 'off'}" data-act="star" ${canStar ? '' : 'disabled'}>⬆ ${stCost} 🍬</button>`;

    // Footer: equip (unlocked) · craft (craftable, not yet crafted) · lock hint.
    let footer: string;
    if (unlocked) {
      footer = `<button class="sc-equip ${equipped ? 'on' : ''}" data-act="equip">${equipped ? '✓ Ausgerüstet' : 'Ausrüsten'}</button>`;
    } else {
      const cc = craftCost(id);
      if (cc !== null && !skinCrafted(state.gear, id)) {
        const afford = state.gear.shards >= cc;
        footer =
          `<button class="sc-equip craft ${afford ? '' : 'off'}" data-act="craft" ${afford ? '' : 'disabled'}>Craften · ${cc} 🧩</button>` +
          `<div class="sc-lock">${this.unlockHint(id)}</div>`;
      } else {
        footer = `<div class="sc-lock">${this.unlockHint(id)}</div>`;
      }
    }

    const stars5 = '★★★★★'.slice(0, stars) + '☆☆☆☆☆'.slice(0, MAX_SKIN_STARS - stars);
    // IDEEN-GAMEPLAY 4a/4b: die 10 Playermodels brauchen KEINEN Baukasten — für
    // sie existieren echte Renders. `public/avatars/skin-*.jpg` sind aus
    // `models/renders/character-*.jpg` erzeugte 96×120-Büsten (~2 KB je Bild).
    return `<div class="skincard rarity-${cfg.rarity} ${equipped ? 'active' : ''} ${unlocked ? '' : 'locked'}" data-id="${id}">
      <div class="sc-head">
        <img class="sc-av" src="./avatars/skin-${id}.jpg" width="48" height="60" alt="" aria-hidden="true" loading="lazy" decoding="async">
        <span class="sc-hmeta">
          <span class="sc-icon">${cfg.icon}</span>
          <span class="sc-rarity">${RARITY_LABEL[cfg.rarity]}</span>
        </span>
      </div>
      <div class="sc-name">${cfg.name}</div>
      <div class="sc-buff">${buffTxt}<br>★ ${starTxt}</div>
      ${nowTxt}
      <div class="sc-row"><span class="sc-level">Lv ${lv}/${MAX_SKIN_LEVEL}</span>${lvBtn}</div>
      <div class="sc-row"><span class="sc-stars">${stars5} ${stars}/${MAX_SKIN_STARS}</span>${stBtn}</div>
      ${this.forgeRow(id, lv, unlocked)}
      ${footer}
    </div>`;
  }
}
