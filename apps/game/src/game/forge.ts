/**
 * **Die Skin-Schmiede** (IDEEN-GAMEPLAY 3a) — Reforging der Playermodels.
 *
 * Jeder der zehn Skins bekommt bis zu {@link FORGE_SLOTS} Schmiede-Slots,
 * freigeschaltet über seinen Skin-LEVEL ({@link FORGE_UNLOCK_LEVELS} = 10/25/32;
 * V2-4: Slot 3 lag mit Level 40 bei Σ 301 060 🧩 ≈ 2 150 h — praktisch
 * unerreichbar; Level 32 = Σ 50 580 🧩 ≈ 361 h ist die LÄNGSTE Jagd des Spiels,
 * aber eine mit Ankunft).
 * Ein Slot trägt genau EIN gerolltes Affix aus demselben Pool wie die Relikte
 * (`affixes.ts`), erweitert um die eine skin-exklusive Sorte dieses Skins.
 * **Reforge** heißt: gegen **Schmiede-Glut** (🔥) einen neuen Roll KAUFEN und ihn
 * danach annehmen oder verwerfen.
 *
 * ## Nur der getragene Skin zählt
 *
 * Die Slots eines nicht ausgerüsteten Skins falten ×1 — exakt wie `gearBonus`
 * nur den aktiven Skin liest. Das ist die eigentliche Leitplanke hinter „Affixe
 * multiplikativ NUR innerhalb ihres Terms": Man schmiedet an EINEM Lieblings-
 * Charakter, nicht an zehn parallel. Genau deshalb dürfen die skin-exklusiven
 * Affixe auch die doppelte Basis tragen.
 *
 * ## Die Slot-Leiter ist teuer — und das ist die Balance
 *
 * Die Freischaltung hängt an `gear.skinLevels`, und deren Kosten wachsen mit
 * `shardCost` um ×1.25 je Level. Kumuliert (gemessen, `npm run balance`
 * Abschnitt 11): **Slot 1 ≈ 370 🧩**, Slot 2 ≈ 10 550 🧩, Slot 3 ≈ 375 000 🧩.
 * Bei den in 3b gemessenen ~140 🧩/h im Beharrungszustand heißt das: Slot 1
 * fällt am ersten Abend, Slot 2 nach gut drei Tagen aktivem Spiel, Slot 3 ist
 * ein Lebenswerk. Der rechnerische Höchstfall des Budgets (drei volle
 * Schmiede-Slots) beschreibt also einen Spielstand, den fast niemand je hält —
 * die Leitplanke misst absichtlich diesen Extremfall.
 *
 * ## Die vier Frust-Regeln (Guardrail „Kein Blind-RNG")
 *
 *  1. **Angebot statt Überschreiben.** Ein bezahlter Roll wird GEZEIGT; der
 *     Spieler nimmt ihn an oder behält das Alte. Ein Slot wird nie blind
 *     überschrieben.
 *  2. **Gewürfelt wird NACH der Bezahlung** (die 3b-Lektion): Würde der Dialog
 *     schon beim Öffnen ziehen, könnte man das Angebot gratis ansehen, schließen
 *     und neu würfeln — Save-Scumming ohne Save.
 *  3. **Qualitäts-Pity** je Slot: `minQualityForDry` in `affixes.ts` hebt die
 *     Mindest-Qualität nach je {@link QUALITY_PITY_ROLLS} erfolglosen Rolls um
 *     eine Stufe; nach 15 ist „Makellos" garantiert. Die exakte Regel steht dort.
 *  4. **Affix-Lock** ({@link FORGE_LOCK_FACTOR}): Wer die SORTE festhält und nur
 *     die Qualität neu würfelt, zahlt das Dreifache.
 *
 * ### Warum der Lock genau ×3 kostet
 *
 * Der Pool eines Schmiede-Slots hat 10 Sorten (9 geteilte + 1 exklusive). Wer
 * eine BESTIMMTE Sorte in besserer Qualität will, trifft ohne Lock mit 1/10 ·
 * P(bessere Qualität), mit Lock mit P(bessere Qualität) — der Lock ist also
 * exakt eine **Verzehnfachung** der Trefferquote auf das gewünschte Ergebnis.
 * ×10 zu verlangen wäre erwartungswert-neutral und damit sinnlos (niemand würde
 * je locken); ×3 macht daraus ein klares, gutes Geschäft, für das man trotzdem
 * echte Währung liegen lassen muss. Bezahlt wird dabei der Verzicht auf das
 * Gegenteil: Ein freier Roll kann eine ANDERE, für den Build bessere Sorte
 * bringen — der Lock schließt genau diesen Glücksfall aus.
 */
import {
  type AffixConfig,
  type RolledAffix,
  type RollSource,
  FORGE_SLOTS,
  MAX_QUALITY,
  QUALITY_PITY_ROLLS,
  affixConfig,
  clampQuality,
  forgePool,
  minQualityForDry,
  nextDry,
  rollAffix,
  rollQuality,
} from './affixes';
import type { ChestTier } from './chests';

// ---------------------------------------------------------------------------
// Der Zustand
// ---------------------------------------------------------------------------

/** Ein Schmiede-Slot: das getragene Affix + sein Trocken-Zähler. */
export interface ForgeSlot {
  /** Das Affix in diesem Slot (`null` = leer, noch nie geschmiedet). */
  affix: RolledAffix | null;
  /** Bezahlte Rolls ohne Qualitäts-Verbesserung (treibt das Pity). */
  dry: number;
}

/** Die persistierte Schmiede-Slice (CH-Save v17). */
export interface ForgeState {
  /** Gehaltene Schmiede-Glut (🔥). */
  ember: number;
  /** Je Skin-Id bis zu {@link FORGE_SLOTS} Slots. Fehlt = alle leer. */
  slots: Record<string, ForgeSlot[]>;
}

/** Eine frische (leere) Schmiede. */
export function createForge(): ForgeState {
  return { ember: 0, slots: {} };
}

/** Ein leerer Slot. */
export function emptyForgeSlot(): ForgeSlot {
  return { affix: null, dry: 0 };
}

// ---------------------------------------------------------------------------
// Freischaltung
// ---------------------------------------------------------------------------

/**
 * Skin-Level, ab denen der 1., 2. und 3. Schmiede-Slot offen sind. Direkt aus
 * dem Ideen-Dokument übernommen und gegen die `shardCost`-Leiter gemessen (siehe
 * Modul-Kopf) — die Zahlen sind also nicht bloß abgeschrieben, sondern in
 * Spielzeit übersetzt.
 */
export const FORGE_UNLOCK_LEVELS: readonly number[] = [10, 25, 32];

/** Wie viele Slots ein Skin mit `level` offen hat (0…{@link FORGE_SLOTS}). */
export function forgeSlotsUnlocked(level: number): number {
  if (!Number.isFinite(level) || level <= 0) return 0;
  let n = 0;
  for (const at of FORGE_UNLOCK_LEVELS) if (level >= at) n++;
  return Math.min(FORGE_SLOTS, n);
}

/** Das Level, das den NÄCHSTEN Slot öffnet (`null`, wenn alle offen sind). */
export function nextForgeUnlock(level: number): number | null {
  for (const at of FORGE_UNLOCK_LEVELS) if (level < at) return at;
  return null;
}

// ---------------------------------------------------------------------------
// Slot-Zugriff (immer sanierend, nie werfend)
// ---------------------------------------------------------------------------

/** Die Slot-Reihe eines Skins, auf {@link FORGE_SLOTS} aufgefüllt. */
export function forgeSlotsOf(f: ForgeState, skin: string): ForgeSlot[] {
  const raw = f.slots[skin] ?? [];
  const out: ForgeSlot[] = [];
  for (let i = 0; i < FORGE_SLOTS; i++) {
    const s = raw[i];
    out.push(
      s ? { affix: s.affix ?? null, dry: Math.max(0, Math.floor(s.dry) || 0) } : emptyForgeSlot(),
    );
  }
  return out;
}

/** Das Affix in Slot `slot` von `skin` (`null` = leer/unbekannt). */
export function forgeAffixAt(f: ForgeState, skin: string, slot: number): RolledAffix | null {
  return forgeSlotsOf(f, skin)[slot]?.affix ?? null;
}

/** Der Trocken-Zähler eines Slots. */
export function forgeDryAt(f: ForgeState, skin: string, slot: number): number {
  return forgeSlotsOf(f, skin)[slot]?.dry ?? 0;
}

/**
 * Die WIRKSAMEN Affixe der Schmiede: die Slots des AKTIVEN Skins, und davon nur
 * die, die sein Level auch freigeschaltet hat. Ein Slot, dessen Level nach einem
 * Katalog-Umbau nicht mehr reicht, faltet damit still ×1, statt eine Zahl zu
 * zahlen, die der Spieler nicht mehr verdient hat.
 */
export function forgeAffixes(f: ForgeState, skin: string, level: number): readonly RolledAffix[] {
  const open = forgeSlotsUnlocked(level);
  const out: RolledAffix[] = [];
  const slots = forgeSlotsOf(f, skin);
  for (let i = 0; i < open; i++) {
    const a = slots[i].affix;
    if (a) out.push(a);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Die Glut-Ökonomie
// ---------------------------------------------------------------------------

/**
 * Glut aus einem **doppelten Jackpot-Truhen-Skin** — der Faucet, den das
 * Ideen-Dokument fordert („die Jackpot-Truhen-Skins bekommen damit eine
 * Ökonomie").
 *
 * Das Einschmelzen passiert AUTOMATISCH, in derselben Sekunde, in der das
 * Duplikat fällt: Ein Duplikat-Fach wäre eine Schachtel um eine Zahl, und die
 * bestehende Duplikat-Regel (§6.3.2) rechnet ohnehin schon still in Splitter um.
 * Die Splitter bleiben dabei **unangetastet** — sie sind in §6.3.2 zugesagt und
 * tragen die in 3b geeichte Umschul-Leiter. Ein Duplikat wird also nicht
 * umgewidmet, sondern zusätzlich wertvoll: genau das, was „heute wertlos" meinte.
 *
 * Die Staffel folgt der Seltenheit der Truhe (Holz 2 · Gold 5 · Diamant 12 ·
 * Mythos 30) — ein Mythos-Duplikat zahlt damit gut den doppelten Reforge auf
 * Slot 1.
 */
export const DUP_EMBER: Record<ChestTier, number> = {
  wood: 2,
  gold: 5,
  diamond: 12,
  mythic: 30,
};

/** Glut für ein Duplikat der Truhen-Stufe `tier`. */
export function emberForDuplicate(tier: ChestTier): number {
  return DUP_EMBER[tier] ?? 0;
}

/**
 * Wechselkurs des **Splitter-Überschusses**: 🧩 je 1 🔥. Bewusst UNGÜNSTIG
 * gewählt und gegen die in 3b gemessene Splitter-Kurve geeicht: Im
 * Beharrungszustand fallen ~140 🧩/h (96 % davon aus dem Boss-Faucet). Wer
 * ALLES umtauscht, bekommt daraus 7 🔥/h — gerade genug für einen halben
 * Slot-2-Reforge. Der Kurs ist damit ein **Überlauf-Ventil**, kein Haupt-Faucet:
 * Splitter bleiben die Währung der Skin-Level (und der Skin-Level ist es, der
 * die Schmiede-Slots überhaupt erst öffnet), und wer sie in Glut kippt, bezahlt
 * seinen dritten Slot mit dem zweiten.
 */
export const SHARDS_PER_EMBER = 20;

/** Wie viel Glut `shards` Splitter ergeben (abgerundet). */
export function emberForShards(shards: number): number {
  if (!Number.isFinite(shards) || shards <= 0) return 0;
  return Math.floor(shards / SHARDS_PER_EMBER);
}

/** Wie viele Splitter `ember` Glut kosten (der exakte Rückweg). */
export function shardsForEmber(ember: number): number {
  return Math.max(0, Math.floor(ember)) * SHARDS_PER_EMBER;
}

/** Die gehaltene Glut, saniert. */
export function emberHeld(f: ForgeState): number {
  return Number.isFinite(f.ember) && f.ember > 0 ? Math.floor(f.ember) : 0;
}

/** Glut gutschreiben (rein, immer eine NEUE Slice). */
export function addEmber(f: ForgeState, n: number): ForgeState {
  if (!Number.isFinite(n) || n <= 0) return f;
  return { ...f, ember: emberHeld(f) + Math.floor(n) };
}

// ---------------------------------------------------------------------------
// Kosten
// ---------------------------------------------------------------------------

/** 🔥-Preis eines Rolls auf dem ERSTEN Schmiede-Slot, ohne Lock. */
export const FORGE_BASE_COST = 12;
/** Verdopplung je Slot (Slot 1 → 12, Slot 2 → 24, Slot 3 → 48). */
export const FORGE_SLOT_GROWTH = 2;
/** Aufschlag für den Affix-Lock (Begründung im Modul-Kopf). */
export const FORGE_LOCK_FACTOR = 3;

/**
 * 🔥-Preis eines Rolls: `12 · 2^slot · (Lock ? 3 : 1)`. `slot` ist 0-basiert.
 * Ein Slot außerhalb des gültigen Bereichs liefert 0 — der Aufrufer prüft das
 * ohnehin, aber die Funktion wirft nie.
 *
 * Bewusst KEINE Roll-Eskalation wie bei 3b: Dort war der Eskalator nötig, weil
 * Splitter im Überfluss fließen und ein Roll sonst spam-bar wäre. Glut ist die
 * knappe Währung dieses Systems (~7 🔥/h aus dem Umtausch, dazu Duplikate) —
 * die Knappheit IST die Bremse, und ein zweiter Zähler darüber würde nur die
 * Spieler bestrafen, die ihn ohnehin schon spüren.
 */
export function forgeCost(slot: number, locked = false): number {
  const s = Math.floor(slot);
  if (!Number.isFinite(s) || s < 0 || s >= FORGE_SLOTS) return 0;
  return FORGE_BASE_COST * Math.pow(FORGE_SLOT_GROWTH, s) * (locked ? FORGE_LOCK_FACTOR : 1);
}

// ---------------------------------------------------------------------------
// Rollen
// ---------------------------------------------------------------------------

/**
 * Einen Roll für einen Slot ziehen. Mit `lock` bleibt die Sorte des aktuellen
 * Affixes stehen und NUR die Qualität wird neu gewürfelt (ein Lock auf einem
 * leeren Slot ist bedeutungslos und rollt wie ein freier Roll). `minQ` kommt aus
 * dem Qualitäts-Pity des Slots.
 *
 * Zieht 2 Floats ohne Lock (Sorte, Qualität) und 1 mit Lock (nur Qualität) —
 * beide aus dem persistierten Spiel-Strom.
 */
export function rollForgeAffix(
  pool: readonly AffixConfig[],
  current: RolledAffix | null,
  locked: boolean,
  minQ: number,
  rng: RollSource,
): RolledAffix {
  if (locked && current && affixConfig(current.id)) {
    return { id: current.id, q: rollQuality(rng.next(), minQ) };
  }
  return rollAffix(pool, rng.next(), rng.next(), minQ);
}

/**
 * **Die Best-Case-Schmiede** für das Anker-Profil `SIM_FORGE` (`sim.ts`) und die
 * Budget-Rechnung: drei **makellose** Slots auf den drei Sorten, die einen
 * farmenden Spielstand am stärksten beschleunigen — Klick, Crew-DPS, BP.
 *
 * Bewusst GETEILTE Sorten, keine skin-exklusiven: Der Bot modelliert keinen
 * bestimmten Skin, und die exklusiven Sorten zahlen ohnehin auf Boss-Schaden
 * (Lava) oder Krit-Chance (Disco) — Terme, die der Bot per dokumentiertem
 * Ausschluss gar nicht rechnet. Das theoretische Maximum über ALLE Sorten misst
 * dagegen `affixPowerBudget()` analytisch; dieses Profil misst, was davon im
 * laufenden Spiel als Zeit ankommt.
 */
export const FORGE_BEST: readonly RolledAffix[] = [
  { id: 'click', q: MAX_QUALITY },
  { id: 'dps', q: MAX_QUALITY },
  { id: 'gold', q: MAX_QUALITY },
];

/** Ein bezahlter Roll: alles, was der Dialog danach anzeigen und buchen muss. */
export interface ForgeRoll {
  /** Das Angebot — annehmen oder verwerfen. */
  readonly offer: RolledAffix;
  /** Die Schmiede NACH Bezahlung + Pity-Fortschreibung (Angebot noch nicht drin). */
  readonly forge: ForgeState;
  /** Die Mindest-Qualität, mit der dieser Roll lief (Anzeige). */
  readonly minQuality: number;
}

/**
 * Einen Roll BEZAHLEN und ziehen — die eine Funktion, die Preis, Pity und
 * Zufall zusammenbringt. Reihenfolge ist Absicht: erst Glut abbuchen, dann
 * würfeln (3b-Lektion gegen Refresh-Scumming). Liefert `null`, wenn der Slot
 * nicht existiert oder die Glut nicht reicht — der Aufrufer zeigt den Knopf dann
 * gar nicht erst aktiv.
 */
export function payForgeRoll(
  f: ForgeState,
  skin: string,
  slot: number,
  locked: boolean,
  rng: RollSource,
): ForgeRoll | null {
  if (!Number.isInteger(slot) || slot < 0 || slot >= FORGE_SLOTS) return null;
  const cost = forgeCost(slot, locked);
  const held = emberHeld(f);
  if (cost <= 0 || held < cost) return null;
  const slots = forgeSlotsOf(f, skin);
  const current = slots[slot].affix;
  const minQuality = minQualityForDry(slots[slot].dry);
  const offer = rollForgeAffix(forgePool(skin), current, locked, minQuality, rng);
  slots[slot] = { affix: current, dry: nextDry(slots[slot].dry, current, offer) };
  return {
    offer,
    minQuality,
    forge: { ember: held - cost, slots: { ...f.slots, [skin]: slots } },
  };
}

/**
 * Ein Angebot ANNEHMEN: das Affix wandert in den Slot. Der Trocken-Zähler bleibt
 * stehen, wie ihn {@link payForgeRoll} gesetzt hat — er misst die Qualitäts-
 * Strecke, nicht die Zahl der Annahmen.
 */
export function acceptForgeRoll(
  f: ForgeState,
  skin: string,
  slot: number,
  affix: RolledAffix,
): ForgeState {
  if (!Number.isInteger(slot) || slot < 0 || slot >= FORGE_SLOTS) return f;
  if (!affixConfig(affix.id)) return f;
  const slots = forgeSlotsOf(f, skin);
  slots[slot] = { affix: { id: affix.id, q: clampQuality(affix.q) }, dry: slots[slot].dry };
  return { ...f, slots: { ...f.slots, [skin]: slots } };
}

/**
 * Wie viele erfolglose Rolls diesem Slot noch bis zur NÄCHSTEN Pity-Stufe
 * fehlen (`null`, wenn „Makellos" schon garantiert ist) — die Zahl, die der
 * Dialog zeigt, damit niemand raten muss.
 */
export function rollsToNextPity(dry: number): number | null {
  const d = Math.max(0, Math.floor(dry) || 0);
  if (minQualityForDry(d) >= 3) return null;
  return QUALITY_PITY_ROLLS - (d % QUALITY_PITY_ROLLS);
}
