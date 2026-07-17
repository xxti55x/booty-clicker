# Booty Clicker v2 — „Endless Twerk" · Design- & Implementation-Spec (M7+)

> Zielgruppe dieses Dokuments: autonome Coding-Agents (z. B. Claude Code) **und** menschliche Reviewer.
> **Revision 2:** Der Product Owner hat den Pivot zur **kompletten Clicker-Heroes-MVP („auf Booty
> Clicker umgestellt")** entschieden; die MVP-Kernmodule sind bereits committet und unit-getestet
> (`game/combat.ts`, `game/heroes.ts`, `game/ascension.ts`, `game/ch-state.ts`, `save/ch-store.ts`,
> plus der endless-sichere `ui/format.ts`). Diese Spec baut **auf diesem MVP** auf — alle Formeln,
> Zahlen und Milestones sind mit dem tatsächlichen Code abgeglichen; Abweichungen von der
> ursprünglichen v2-Skizze sind ausgewiesen und begründet.
> Arbeite die Milestones **strikt in Reihenfolge** ab (M7 → …). Ein Milestone gilt erst als fertig,
> wenn alle Akzeptanzkriterien erfüllt sind und `npm run build` + `npm test` grün sind.
> Bei Unklarheiten: konservativ entscheiden, Entscheidung in `DECISIONS.md` dokumentieren.
> Die Architektur-Regeln aus Spec §4 (pure testbare Kernmodule, Daten statt Code, versionierte
> Saves mit never-throw-Validierung, fail-silent Netcode, keine echten Personen, < 5 MB) gelten
> **unverändert weiter**.

---

## §0 Agenten-Handover — so arbeitest du dieses Dokument ab

Dieses Dokument ist der **verbindliche Bauplan** für alles nach dem MVP. Wer übernimmt
(Agent oder Mensch), braucht nichts außer dieser Datei + dem Repo. Lies §0 zuerst.

### 0.1 Arbeitsschleife (pro Milestone)

1. **Kontext laden:** §1 (Vision + die HARTE REGEL), §2 (Ist-Zustand — was bereits existiert),
   §3 (offene Bugs mit Status).
2. **Nächsten offenen Milestone wählen** — **strikt in Reihenfolge** aus dem Index (§0.3) bzw.
   §10. Nicht vorgreifen; ein Milestone ist erst „fertig", wenn alle seine Akzeptanzkriterien
   erfüllt sind.
3. **Detail lesen:** Jeder Milestone in §10 verlinkt die Fach-§§ (§4–§9) mit Formeln,
   Datentabellen, Save-Version und Akzeptanzkriterien.
4. **Implementieren:** pures, DOM-freies **Kernmodul zuerst** (Pfeiler P6), dünner Glue danach;
   jeder Balancing-Wert ist **Daten**, kein im Code vergrabenes Literal.
5. **Alle Akzeptanzkriterien** des Milestones erfüllen — sie sind die Definition of Done.
6. **Gates grün:** `npm run lint` · `npm run format:check` · `npm test` · `npm run build`
   (< 5 MB) — plus Headless-Smoke, wo UI/Loop betroffen sind.
7. **Doku:** `README.md` + `DECISIONS.md` aktualisieren; jede nicht-offensichtliche Entscheidung
   in `DECISIONS.md` (newest-first) loggen.
8. **Commit + Push** auf den Feature-Branch (ein Milestone = ≥ 1 in sich grüner Commit).

### 0.2 Unumstößliche Regeln (gelten in JEDEM Milestone)

- **P1 — Klick ist König:** Kein System darf den aktiven Klick entwerten; `clickDamage ∝ ΣDPS`
  bleibt erhalten; Invariante **E4** (§4.8) wird per Sim abgesichert.
- **Endlos & soft-lock-frei:** keine Content-Decke; Boss-Timeout ⇒ Farmen, **nie** Bühnenverlust.
- **Pure Kernmodule + Daten statt Code** (P6): Spiel-Logik lebt in `game/*`, deterministisch
  unit-getestet; DOM/Three/Audio bleiben dünner Glue.
- **Saves:** eigener Key `bootyclicker.ch`, versioniert, **never-throw**, `Object.hasOwn`-
  Validierung, korruptes Teilobjekt ⇒ sauberer Fresh-Start; **ein Schema-Bump pro
  bedarfstragendem Milestone** (§9.2.1), mit Migrations- und Validator-Test.
- **Netcode fail-silent & default-aus** (`VITE_API_BASE`); **keine echten Personen, kein
  Echtgeld, keine Accounts**.
- **Budget:** Bundle < 5 MB, 60 fps, Partikel < 1 ms/Frame; **kein `innerHTML`-Rebuild im
  Klick-Hot-Path**.
- **RNG:** alle spielrelevanten Zufallszüge über den seedbaren RNG (§9.4), damit alles
  testbar und save-scum-fest bleibt.

### 0.3 Milestone-Index (Status auf einen Blick)

| M         | Titel                            | Kernziel                                                                                                  | Save | Status                                                                                           |
| --------- | -------------------------------- | --------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------ |
| **M-MVP** | Clicker-Heroes-Umbau             | Bühnen/Boss-Loop, Crew-DPS, Ruhm-Seelen, Klick-Juice-Basis, CH-Save + Offline, neue UI                    | v1   | ✅ **committet & headless-verifiziert** (175 Game- + 9 API-Tests, Build ~566 KB, 15-Check-Smoke) |
| M7        | MVP-Härtung & Kern-Hygiene       | Klick-Mathe → pures `click.ts`, seedbarer RNG, Tab-Rückkehr-Grant, Legacy-Erbe, Doku                      | v2   | ⬜ offen (**nächster**)                                                                          |
| M8        | Klick-Juice 2.0                  | Combo-Tiers + Soft-Decay, On-Beat, Twerk-Ekstase, Popup-Pool, Mobile-Sheet                                | v3   | ⬜                                                                                               |
| M9        | Endless-Skalierung               | Seelen-Retune, +5 Crew-Tiers + endlose Meilensteine, Vergoldungen, Travel-UI, `simulateEndless` (CI-Gate) | v4   | ⬜                                                                                               |
| M10       | Ahnen & Himmelfahrt (Schicht 2)  | Twerk-Ahnen (Seelen-Sink), Himmelspfirsiche + Himmelsbaum, Coach-Offline                                  | v5   | ⬜                                                                                               |
| M11       | Skins als Gear                   | Skin-/Kulissen-Wahl **mit Buffs**, Level/Sterne, Set-Boni                                                 | v6   | ⬜                                                                                               |
| M12       | Pfirsich-Truhen & Loot           | Truhen/Schlüssel/Pity/Luck, Rückkehr des Goldenen Pfirsichs                                               | v7   | ⬜                                                                                               |
| M13       | Meta, Retention & Leaderboard v2 | Daily/Quests/Achievements/Stats, `maxZone`-Bestenliste (Upsert)                                           | v8   | ⬜                                                                                               |
| M14       | Endless-QA & Release 2.0         | `simulateEndless` voll (E1–E4), Transzendenz-Gerüst (Flag), Perf-Pass, Release                            | —    | ⬜                                                                                               |

> **Der MVP (M-MVP) ist fertig, committet und headless-verifiziert** — die einzige
> Voraussetzung für M7 ist damit erfüllt. Ein übernehmender Agent startet direkt mit **M7**.

---

## §1 Vision & Design-Pfeiler

### 1.1 Die Fantasie

Du bist Manager:in des größten Twerk-Phänomens der Galaxis. Jeder Klick ist ein Hüftschwung,
der die **Ausdauer** des aktuellen Twerk-Rivalen drainiert; deine **Crew** (vom Hype-Girl bis
zur Twerk-Legende) tanzt idle mit. Bühne für Bühne, Boss für Boss, Tour für Tour — und wenn die
Wand zu hoch wird, gehst du in Rente und kassierst **Ruhm-Seelen** für die nächste, stärkere
Karriere. Ton: überdreht, humorvoll, technisch sauber. Keine echten Personen, kein Echtgeld,
kein Account-Zwang.

### 1.2 Die HARTE REGEL (vom Product Owner gesetzt)

> **Der Hauptinhalt ist das KLICKEN/TWERKEN selbst.** Jedes System — Crew, Prestige, Skins,
> Truhen, Events — muss in den aktiven Klick zurückfüttern und ihn lohnender, saftiger und
> spektakulärer machen. Idle-DPS ist willkommen (damit Fortschritt auch über Nacht passiert),
> aber **immer zweitrangig** gegenüber dem, was eine aktive Session an Payoff liefert.

Das MVP verankert das bereits strukturell: `clickDamageRaw = CLICK_BASE + 0.2 · totalDPS`
(`heroes.ts:140–142`) — ein Shake schlägt immer mit einem satten Anteil der **gesamten**
Crew-DPS zu, plus Krit und Combo obendrauf. Konkretisierung als messbare Invariante (§4.8, E4):

> **Klick-Invariante (gemessen):** Eine aktive Spielerin (3 Klicks/s, Combo + Krits genutzt)
> steht nach 45 Minuten ~10 Bühnen vor einer Gelegenheitsspielerin (1 Klick/s, ohne Juice) —
> das entspricht ≈ ×1,6¹⁰ ≈ **×110 Ausdauer**. Diese Lücke darf durch kein späteres System
> unter ~8 Bühnen schrumpfen.

### 1.3 Endlosigkeit als Produktziel

Das Spiel darf **nie** „fertig" sein:

1. **Endlose Bühnen-Leiter** (implementiert, `combat.ts`): Ausdauer wächst mit ×1,6 pro Bühne —
   es gibt immer eine nächste Wand, und niemals einen Soft-Lock (Boss-Timeout ⇒ Farmen, nie
   Bühnenverlust).
2. **Gestapelte Prestige-Schichten:** Schicht 1 (Ruhm-Seelen) ist implementiert; §4.5 stapelt
   Aszension (Himmelspfirsiche) und Transzendenz darauf. Wenn Schicht n stagniert, lockt n+1.
3. **Ehrliche Endlos-Kriterien:** Die Messungen in §4.8 zeigen, dass ein _linearer_
   Seelen-Multiplikator gegen _exponentielle_ Ausdauer strukturell plateaut. „Endlos" heißt
   deshalb nicht „feste Runs geben ewig Seelen", sondern: **die Zeit bis zur nächsten Bestzone
   bzw. bis +50 % Gesamtmacht bleibt beschränkt** (Kriterien E1–E4, per Sim in CI asserted).

### 1.4 Design-Pfeiler

| #   | Pfeiler                             | Bedeutung                                                                                                                                                                                                   |
| --- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **Click is King**                   | Der Klick ist die beste Schadens- und Show-Quelle. `clickDamage ∝ totalDPS` garantiert: jede Idle-Investition buff't den Klick mit.                                                                         |
| P2  | **Immer eine nächste Wand**         | Bühnen-Ausdauer ×1,6/Bühne; wer steckt, farmt (`travelTo`) oder prestiget — nie ein Dead End.                                                                                                               |
| P3  | **Jede Session hinterlässt Spuren** | Bestzone, Seelen, Vergoldungen, Splitter, Schlüssel, Quests — auch 3 Minuten zählen.                                                                                                                        |
| P4  | **Juice skaliert mit Leistung**     | Combo-Tiers, Krits, Beat-Treffer eskalieren Partikel, Sound, Shake, Haptik. Gut spielen _fühlt_ sich besser an.                                                                                             |
| P5  | **Offline-fähig & fair**            | Kein Echtgeld, keine Accounts. Leaderboard optional & fail-silent. Alles erspielbar.                                                                                                                        |
| P6  | **Testbare Reinheit**               | Jede Mechanik existiert zuerst als pures, deterministisch getestetes Modul; DOM/Three/Audio bleiben dünner Glue. (Die MVP-Kernmodule leben das bereits — der WIP-Glue hat hier zwei Schulden, siehe N2/N3.) |

---

## §2 Ist-Zustand

### 2.1 Der CH-MVP-Pivot (aktueller Kern)

Produktentscheidung: **„komplette MVP für Clicker Heroes, auf Booty Clicker umgestellt."**
Statt den flachen M0–M6-Clicker (Upgrades → einmaliger Boss → additives Rebirth) weiter zu
flicken, wurde der Kernloop durch einen Clicker-Heroes-Loop ersetzt. Der gesamte MVP
(Kernmodule **und** Loop/UI-Verdrahtung) ist committet, gepusht und headless-verifiziert
(175 Game- + 9 API-Tests, Build ~566 KB, 15-Check-Smoke):

**Committete, unit-getestete pure Module:**

| Modul                             | Inhalt (verifiziert)                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/game/src/game/combat.ts`    | Endlose Bühnen-Leiter: `monsterHp(z) = 10 · 1.6^(z−1)`; **10 Rivalen pro Bühne** (`MONSTERS_PER_ZONE`); jede **5.** Bühne ein Boss (`BOSS_HP_FACTOR` ×10) am **30-s-Timer**; Gold `= ceil(HP/15)`, Boss ×12. Pure Reducer `hit()`/`tickBoss()`/`travelTo()`/`spawnFor()`. Boss-Timeout ⇒ Rivalen respawnen (`killsThisZone → 0`), **nie** Bühnenverlust. `travelTo` erlaubt Farmen in 1..maxZone. |
| `apps/game/src/game/heroes.ts`    | **Crew** = 10 Mitglieder („Booty-Boss (Du)" 5 BP/1 DPS → „Twerk-Legende" 20 M BP/700 k DPS), Kostenwachstum **1,07**/Level, Meilenstein-Verdopplungen bei **[10, 25, 50, 100, 200, 400, 800]**, `clickDamageRaw = 1 + 0.2 · totalRawDps` (`CLICK_BASE`/`CLICK_DPS_SHARE`). Bulk-Kauf geschlossen: `bulkCost` (geometrische Summe), `maxAffordable` (log-Formel + Float-Guard).                    |
| `apps/game/src/game/ascension.ts` | Prestige-Schicht 1 **Ruhm-Seelen**: `soulsForMaxZone(z) = ⌊z^1.6 / 40⌋` (0 unter Bühne 10, `ASCEND_MIN_ZONE`), `soulMult = 1 + 0.1 · souls`. Seelen sind an die **Lifetime**-Bestzone gepinnt (`pendingSouls` = Differenz zum Bank-Stand) ⇒ kein Farm-Exploit durch häufiges Aszendieren. `applyAscension` lässt die Bank **nie schrumpfen** (retune-sicher).                                     |
| `apps/game/src/game/ch-state.ts`  | `ChState { gold, zone, killsThisZone, runMaxZone, crew, souls, lifetimeMaxZone, totalClicks }`; `dpsOf`/`clickDamageOf` falten `soulMult` ein; abgeleitete Werte werden **nie** persistiert. `ascendState` resettet den Run, behält Seelen/Lifetime-Bestzone/totalClicks.                                                                                                                         |
| `apps/game/src/save/ch-store.ts`  | Eigener Save-Key **`bootyclicker.ch`**, Schema `v: 1`, never-throw-Validierung (`isChSave`), Invarianten-Reparatur beim Laden (`runMaxZone ≥ zone` etc.), UTF-8-sicherer Base64-Export/Import. **Offline-Gold:** Crew farmt die _aktuelle_ Bühne (nie Bosse), `offlineGold = kills/s · gold(z) · 0.5`, Cap **8 h** (`OFFLINE_CAP_S`, `OFFLINE_EFF`).                                              |
| `apps/game/src/ui/format.ts`      | **B1 behoben:** Suffixe bis `Dc` (10³³), darüber wissenschaftliche Notation (`"1.00e36"`), `∞`-Guard, Negative; eigene Testdatei `format.test.ts`.                                                                                                                                                                                                                                                |

**Verdrahtung & UI (committet & headless-verifiziert):**

- `main.ts` komplett auf den CH-Loop umgeschrieben: Klick trifft den Rivalen, Crew-DPS tickt,
  Boss-Timer, Aszension, Offline-Gold + Welcome-Back beim Boot, Autosave 10 s +
  `visibilitychange(hidden)` + `beforeunload`, `e.repeat`-Guard an der Leertaste (B4 ✔).
- Neue UI: `ui/ch-hud.ts` (Bühnen-Anzeige, Rivalen-HP-Balken, Boss-Timer, `spawnPop`),
  `ui/crew.ts` (Crew-Shop mit **×1/×10/Max**), `ui/prestige.ts` (Ruhm-Tab mit Seelen-Vorschau),
  `ui/ch-settings.ts`; Tabs: 🕺 Crew · ✨ Ruhm · ⚙️.
- **Provisorischer Klick-Juice im Glue** (Konstanten in `main.ts`, nicht in einem puren Modul):
  `CRIT_CHANCE = 0.2`, `CRIT_MULT = 5`, Combo `+2 %`/Stack, Cap 50 (max ×2), Fenster 1,5 s mit
  **Hard-Reset** auf 0; Krit-Popup + stärkerer Screen-Shake. Krit-Roll via `Math.random`.
- Kulissen rotieren **automatisch** alle 10 Bühnen (`club → synth → beach → space` zyklisch);
  Figur fix auf dem Klassiker-Skin.
- Throttled 0,4-s-Tick: `document.title` + Re-Render des offenen Tabs (Crew-Affordability
  bleibt beim Idlen frisch — B6 ✔ für den neuen Shop).

**Im MVP bewusst entfallen (eingemottet, Module existieren weiter, Tests grün):** der
Upgrade-Shop (`economy.ts`), der alte Boss-Fight (`boss.ts`), additives Rebirth
(`progression.ts`), Achievements-UI, Goldener Pfirsich (`events.ts`), Skin-/Kulissen-Wahl,
Leaderboard-Client-Verdrahtung, Legacy-Save (`bootyclicker.save`, Schema v4 — wird vom CH-Loop
nicht gelesen). §2.3 listet, was davon wann zurückkommt.

### 2.2 Warum der Pivot nötig war (Kurz-Audit des Legacy-Kerns)

Der M0–M6-Kern (11 Upgrades, 50-k-Boss, `prestigeMult = 1 + rebirths`) hatte eine harte Decke:
nach ~2–3 h existierte kein Ziel mehr — einmaliger Boss, 4 Endgame-Upgrades mit explodierenden
Mult-Kosten (gr 1,9–2,5), Achievements bis 1 M BP, und ein Prestige, dessen relativer Gewinn
von +50 % (NG+1) auf +0,99 % (NG+100) fiel. Details und Belege: §3 (B2/B3, historisch).
Der CH-Loop ersetzt genau diese Decke durch eine formelbasierte, unendliche Leiter.

### 2.3 MVP → v2 Gap-Checkliste

Was der MVP noch **nicht** hat und wo es landet (Details in den Fach-§§, Reihenfolge in §10):

| #   | Lücke                                                      | MVP-Stand                 | v2-Ziel                                | Milestone |
| --- | ---------------------------------------------------------- | ------------------------- | -------------------------------------- | --------- |
| G1  | Klick-Mathe (Krit/Combo) liegt im Glue, `Math.random`      | provisorisch in `main.ts` | pures `game/click.ts` + seedbarer RNG  | M7        |
| G2  | Offline-Gutschrift bei Tab-Rückkehr                        | nur beim Boot             | `visibilitychange → visible` Grant     | M7        |
| G3  | Legacy-Save-Übernahme                                      | wird ignoriert            | einmaliger „Erbe der alten Tour"-Bonus | M7        |
| G4  | Combo flach (linear, Hard-Reset)                           | Cap ×2, Reset auf 0       | Tiers + Soft-Decay                     | M8        |
| G5  | On-Beat-Bonus, Twerk-Ekstase, Ability-Bar                  | fehlen                    | §4.2.3/4.2.4                           | M8        |
| G6  | Popup-Pooling, Haptik, Musik-Layer, Mobile-Sheet           | fehlen                    | §8                                     | M8        |
| G7  | Seelen-Kurve plateaut (Messung N1)                         | `⌊z^1.6/40⌋`              | + „Legendäre Auftritte"-Term           | M9        |
| G8  | Crew endet bei „Twerk-Legende"; Meilensteine enden bei 800 | 10 Tiers, 7 Schwellen     | +5 Tiers, endlose Schwellen            | M9        |
| G9  | Vergoldungen (Gilds)                                       | fehlen                    | §4.3.4                                 | M9        |
| G10 | Farm-/Travel-UI (`travelTo` ist pure da)                   | keine UI                  | Bühnen-Wahl ≤ Bestzone                 | M9        |
| G11 | Seelen-Sink (Ahnen)                                        | Seelen nur passiv         | §4.6                                   | M10       |
| G12 | Prestige-Schicht 2/3                                       | nur Schicht 1             | HPF + Himmelsbaum, TE-Gerüst           | M10/M14   |
| G13 | Skins/Kulissen: Wahl + Buffs                               | Skin fix, Kulisse auto    | Skins-als-Gear                         | M11       |
| G14 | Truhen/Loot/Schlüssel, Goldener Pfirsich                   | fehlen / entfallen        | §6                                     | M12       |
| G15 | Achievements (CH-Modus), Quests, Daily, Stats              | entfallen / fehlen        | §7                                     | M13       |
| G16 | Leaderboard (v2-Metrik `maxZone`)                          | Client unverdrahtet       | §7.4/§9.7                              | M13       |
| G17 | `simulateEndless` als CI-Gate                              | nur Modul-Unit-Tests      | §9.5                                   | M9 + M14  |

---

## §3 Bugs, Probleme & Tech-Debt

Alle Punkte im Code verifiziert; Statusspalte = Stand nach dem CH-Pivot (committete Module +
verifizierter WIP-Glue). Severity: 🔴 blockiert Endless-Ziel/Kernloop · 🟠 deutlich spürbar ·
🟡 Politur/Debt.

### 3.1 Befunde aus dem M0–M6-Audit (mit Pivot-Status)

**B1 🔴 → ✅ ERLEDIGT — Zahlenformatierung lief ab 10²¹ über.**
`fmt(1e21)` → `"1000.00Qi"`, `fmt(1e30)` → 13-stellige Ziffernkette (per Node-Repro belegt).
Behoben in `ui/format.ts`: Suffixe bis `Dc` (10³³), darüber `"1.00e36"`, `∞`- und
Negativ-Guards; eigene Tests (`format.test.ts`). Referenz für §9.3.

**B2 🔴 → 🟠 TEILWEISE — Prestige stallt.**
Das additive `prestigeMult = 1 + rebirths` (`progression.ts:136–138`, Legacy) ist durch
Ruhm-Seelen ersetzt — strukturell die richtige (CH-)Lösung. **Aber:** die Messung N1 (§4.8)
zeigt, dass die implementierte Kurve `⌊z^1.6/40⌋` bei fester Run-Länge nach 3–4 Aszensionen
bei **~13 Seelen (×2,3), Bühne ~50** plateaut. Rest-Fix: §4.5.1-Retune + §4.6 Ahnen (M9/M10).

**B3 🔴 → ✅ WEITGEHEND ERLEDIGT — Content war endlich.**
Der einmalige 75-k-HP-Boss und die 4 Endgame-Upgrades sind durch die endlose Bühnen-Leiter +
Crew ersetzt (`combat.ts`, `heroes.ts`). Verbleibend: Meta-Content (Ahnen, Gear, Truhen,
Quests) — G11–G15.

**B4 🔴 → ✅ ERLEDIGT — Leertaste mit Key-Repeat war ein Gratis-Autoclicker.**
Der neue `keydown`-Handler hat den Guard (`main.ts`, WIP: `if (e.repeat) return; // B4`).
AC-Absicherung per Test bleibt Pflicht (M7).

**B5 🟠 → 🟠 TEILWEISE — Hintergrund-Tab verdient nichts.**
Offline-Gold wird beim **Boot** korrekt gutgeschrieben (`loadCh` + `offlineGold` +
Welcome-Back, WIP-`main.ts:73–91`); `visibilitychange` persistiert aber weiterhin nur beim
Verstecken — **Rückkehr in den Tab schreibt nichts gut** (rAF pausiert, `dt`-Clamp 0,05 s
schluckt die Wegzeit). Fix M7: Grant bei `visible` über dieselbe pure `offlineGold`.

**B6 🟠 → ✅ ERLEDIGT (neuer Shop) — Shop-Affordability veraltete beim Idlen.**
Der WIP-0,4-s-Tick re-rendert den offenen Tab (Crew-Kosten bleiben frisch). Schönheitsfehler:
es ist ein voller `innerHTML`-Rebuild alle 0,4 s bei offenem Tab → fällt unter B7.

**B7 🟠 → 🟠 OFFEN — DOM-Churn pro Klick & pro Frame.**
Weiterhin: `hud.update(...)` ungedrosselt jeden Frame; `spawnPop` erzeugt pro Klick/Krit ein
frisches DOM-Element (`ui/ch-hud.ts:88 ff.`); Crew-Tab-Full-Rebuild alle 0,4 s. Bei 10+ cps
(Ziel!) plus Krit-Popups messbar. Fix M8: HUD nur bei Wertänderung, Popup-Pool (≤ 24 Nodes)

- Batching, Crew-Zeilen-Update in place.

**B8 🟠 → 🟡 TEILWEISE (Metrik-Problem obsolet) — Bestenliste.**
Die Boss-Zeit-Metrik ist mit dem alten Boss verschwunden; der Client ist aktuell gar nicht
verdrahtet. Die natürliche Endless-Metrik existiert jetzt im State (`lifetimeMaxZone`).
Offen: Worker-v2 (Upsert pro Nickname statt unbegrenzter `INSERT`s, `apps/api/src/index.ts:83–85`)

- Client-Wiring → M13, Vertrag §9.7.

**B9 🟠 → 🟠 OFFEN (verschärft) — Skins ohne Gameplay.**
Im MVP ist sogar die Skin-/Kulissen-**Wahl** entfallen (Figur fix „classic", Kulisse
auto-rotierend). v2: Skins-als-Gear (§5) bringt Wahl **und** Buffs zurück → M11.

**B10 🟠 → 🟠 OFFEN — Nur ein Random-Event, keine Loot-Schleife.**
Der Goldene Pfirsich ist im MVP entfallen; Truhen/Schlüssel fehlen weiter → M12 (§6).

**B11 🟠 → ✅ WEITGEHEND ERLEDIGT — Offline-Regeln.**
Neu: Cap 8 h (statt 2 h), Rate 50 %, DPS-basiert und bühnenbezogen (`offlineGold` farmt die
aktuelle Bühne, nie Bosse) — sauber und pure. Verbleibend: reine Klick-Builds (Crew-los)
verdienen offline 0; Fix über Twerk-Coaches (§4.3.5) + Cap-Upgrades im Himmelsbaum → M10.

**B12 🟡 → 🟠 TEILWEISE — Aktiver Layer flach.**
Krit (20 %/×5) und Combo (+2 %/Stack, Cap ×2) existieren jetzt — aber: im Glue statt in einem
puren Modul (N2), unseeded (N3), Combo mit Hard-Reset (`main.ts:383–386`), kein On-Beat, keine
Fähigkeit. → M7 (Struktur) + M8 (Tiefe).

**B13 🟡 → 🟡 OFFEN — Mobile-Layout-Schulden.**
(a) Shop unter 640 px vollflächig — Figur beim Shoppen unsichtbar (`style.css:733–737`);
(b) kein Safe-Area-Handling (`index.html`-Viewport ohne `viewport-fit=cover`, kein `env()`).
(c — Pfirsich-Spawn) derzeit obsolet, kehrt mit M12 zurück (dann mit Clamp + Sheet-Regel).
→ (b) M7, (a) M8.

**B14 🟡 → ✅ OBSOLET — Boost-Inkonsequenzen.**
Pfirsich-Boost und alter Boss-Modus existieren nicht mehr; bei der Wiedereinführung (M12)
fließt jeder Boost durch die eine `effectiveClick`-Pipeline (§4.1), womit die Klasse von
Inkonsistenzen strukturell verschwindet.

**B15 🟡 → 🟡 OFFEN — Float-Präzision als Zeitbombe.**
Unverändert relevant — mit dem §4.5.1-Retune wachsen Seelenzahlen exponentiell. Doubles
bleiben die Entscheidung (§9.3); der Sim-Guard (§9.5) überwacht Stalls durch
Präzisionsverlust. → M9/M14.

**B16 🟡 → 🟡 OFFEN (verschärft) — Doku-Drift.**
`README.md` beschreibt jetzt ein Spiel, das es so nicht mehr gibt (Upgrade-Shop, 50-k-Boss,
Schema-v3-Behauptung). → M7.

**B17 🟡 → ✅ ERLEDIGT — Bulk-Buy.**
`bulkCost`/`maxAffordable` (geschlossene Formeln, Float-Guard) + ×1/×10/Max-UI im Crew-Tab.

### 3.2 Neue Befunde (aus MVP-Review + Messung)

**N1 🔴 — Die Seelen-Ökonomie plateaut (gemessen).**

- **Symptom:** Deterministische Sim (Annahmen §4.8) über 45-min-Runs: Bank 9 → 11 → 12 → 13,
  dann dauerhaft **+0 Seelen**; Bestzone konvergiert gegen ~50. Auch ein isolierter
  Kurven-Retune verschiebt die Wand nur (Bühne 55 bzw. mit Crew-Ausbau 80), beseitigt sie nicht.
- **Ursache (strukturell, zwei Faktoren):** (1) `soulMult` ist **linear** in den Seelen, die
  Ausdauer **exponentiell** in der Bühne — ein Mult ×X kauft nur `ln X / ln 1,6` Bühnen direkt;
  (2) die Crew sättigt: Kosten wachsen ×1,07/Level unbegrenzt, DPS/Level ist zwischen
  Meilensteinen linear und die Schwellen enden bei 800 (`heroes.ts:29`), der Tier-Katalog bei
  der Twerk-Legende.
- **Fix-Stack (jede Stufe einzeln gemessen, §4.8):** exponentieller Seelen-Term (§4.5.1) +
  Crew-Erweiterung & endlose Meilensteine (§4.3.3) + Vergoldungen (§4.3.4) + Ahnen als
  compoundende Prozent-Effekte (§4.6) + HPF-Seelen-Verstärker (§4.5.2). Erfolgskriterium
  reformuliert als E1–E4 (§4.8).

**N2 🟠 — Klick-Mathe lebt im Glue statt im puren Kern.**
`CRIT_CHANCE/CRIT_MULT/COMBO_*` + `comboMult` sind Konstanten/Closures in `main.ts:37–48` —
verletzt die Testbare-Kern-Regel (P6) und ist unbalancierbar ohne Logik-Datei anzufassen.
Fix M7: Umzug in pures `game/click.ts` (Daten + Funktionen + Tests), Glue ruft nur noch auf.

**N3 🟠 — Krit-Roll via `Math.random`.**
Nicht deterministisch testbar, und sobald Loot existiert (M12) Save-Scumming-anfällig.
Fix M7: seedbarer mulberry32-RNG (`util/rng.ts`), `{ seed, cursor }` im CH-Save (v2).

**N4 🟡 — Doppelte Ökonomie im Repo.**
Legacy-Module (economy/progression/boss/events/achievements + Legacy-Save-Layer) sind aus
`main.ts` ausgehängt (Tree-Shaking entfernt sie aus dem Bundle), aber Repo + Tests tragen zwei
Welten. Entscheidung M7: Legacy bleibt als eingefrorenes Archiv (Tests grün, keine Pflege) —
plus einmaliger „Erbe"-Import (§9.2.3); Entfernung erst, wenn der Erbe-Import verschifft ist.

**N5 🟡 — Feature-Regressionen gegenüber M6 dokumentieren.**
Skin-/Kulissen-Wahl, Achievements, Pfirsich, Leaderboard sind bewusst raus — das muss in
README/TESTPLAN sichtbar sein (sonst testet QA Geisterfeatures). → M7 Doku, Rückkehr M11–M13.

**N6 🟡 — Combo-Hard-Reset im Glue.**
`comboTimer ≤ 0 ⇒ combo = 0` (`main.ts:383–386`) — bestraft Shop-Griffe maximal.
Fix M8: Soft-Decay (§4.2.2).

### 3.3 Triage-Matrix (offene Punkte, Severity × Aufwand)

| Punkt                                | Severity | Aufwand | Milestone |
| ------------------------------------ | -------- | ------- | --------- |
| N2 Klick-Mathe → pures Modul         | 🟠       | S       | M7        |
| N3 seedbarer RNG                     | 🟠       | S       | M7        |
| B5 Tab-Rückkehr-Grant                | 🟠       | S       | M7        |
| B16/N5 Doku-Drift                    | 🟡       | S       | M7        |
| B13b Safe-Area                       | 🟡       | XS      | M7        |
| G3 Erbe-Import                       | 🟡       | S       | M7        |
| B7 DOM-Churn/Popup-Pool              | 🟠       | M       | M8        |
| N6/G4 Combo-Tiers + Decay            | 🟠       | M       | M8        |
| G5 On-Beat + Ekstase                 | 🟠       | M       | M8        |
| B13a Mobile-Sheet                    | 🟡       | M       | M8        |
| **N1 Seelen-Plateau**                | 🔴       | M       | M9        |
| G8/G9 Crew-Skalierung + Vergoldungen | 🔴       | M       | M9        |
| G17 simulateEndless-CI               | 🟠       | M       | M9/M14    |
| G11 Ahnen                            | 🟠       | M       | M10       |
| G12 Aszension L2                     | 🟠       | M       | M10       |
| B9/G13 Skins-als-Gear                | 🟠       | L       | M11       |
| B10/G14 Truhen                       | 🟠       | L       | M12       |
| G15/G16 Meta + Leaderboard v2        | 🟠       | M       | M13       |
| B15 Float-Guard                      | 🟡       | S       | M9/M14    |

---

## §4 Progression 2.0 — endlos, klick-zentriert (Kern-Deliverable)

Explizit benannte Vorbilder und ihr Status nach dem Pivot:

| Vorbild                                                  | Entliehene Mechanik                                                                                                                           | Status                                                                                                                                                 |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Clicker Heroes**                                       | Zonen-Leiter (HP ~×1,6), Boss-Timer, Helden mit 1,07-Kosten + Meilenstein-×2, Ascension → Souls (+10 %/Stück), Gilds, Ancients, Transcendence | Leiter, Crew, Meilensteine, Souls: **implementiert** (`combat.ts`/`heroes.ts`/`ascension.ts`). Gilds → §4.3.4, Ancients → §4.6, Transcendence → §4.5.3 |
| **AdVenture Capitalist**                                 | Besitz-Meilenstein-Multiplikatoren, Manager-Automation                                                                                        | Meilensteine: **implementiert** ([10…800]); „Manager" als Twerk-Coaches → §4.3.5                                                                       |
| **Cookie Clicker**                                       | Klick-Gebäude-Synergie, Golden Cookies, Click Frenzy, Heavenly Chips, Sugar Lumps                                                             | Synergie: **implementiert** (`clickDamage ∝ 0,2·DPS`); Pfirsich-Events → M12; Ekstase → §4.2.4; Himmelspfirsiche → §4.5.2; Zuckerpfirsiche → §5.4      |
| **Antimatter Dimensions / NGU / Trimps / Realm Grinder** | Gestapelte Reset-Schichten, die die Zeitkonstante der unteren drücken; Challenges                                                             | Schichten 2/3 → §4.5; Challenge-Quests → §7.2; Endlos-Kriterien E1–E4 → §4.8                                                                           |

### 4.0 Implementierte Basis (verbindliche Formeln + Anschauungszahlen)

```
Ausdauer:   HP(z)      = 10 · 1.6^(z−1)          Boss: ×10, Timer 30 s, jede 5. Bühne
Gold:       gold(z)    = ceil(HP(z) / 15)         Boss: ×12   (Verhältnis Gold/HP konstant!)
Crew:       cost(lv)   = floor(base · 1.07^lv)    DPS(lv) = base · lv · 2^(#Meilensteine ≤ lv)
Klick:      clickRaw   = 1 + 0.2 · ΣDPS_raw
Seelen:     RS(z)      = ⌊z^1.6 / 40⌋  (z ≥ 10)   Mult = 1 + 0.1 · RS   (lifetime-gepinnt)
Offline:    gold/s     = DPS/HP(z) · gold(z) · 0.5, Cap 8 h
```

| Bühne z | HP(z)   | gold(z) | Boss-HP (falls z%5=0) | RS(z) |
| ------- | ------- | ------- | --------------------- | ----- |
| 1       | 10      | 1       | —                     | 0     |
| 5       | 65,5    | 5       | 655                   | 0     |
| 10      | 687     | 46      | 6 872                 | 0     |
| 11      | 1 100   | 74      | —                     | **1** |
| 20      | 6,08 K  | 406     | 60,8 K                | 3     |
| 25      | 63,8 K  | 4,25 K  | 638 K                 | 4     |
| 30      | 669 K   | 44,6 K  | 6,69 M                | 5     |
| 40      | 73,6 M  | 4,90 M  | 736 M                 | 9     |
| 50      | 8,08 B  | 539 M   | 80,8 B                | 13    |
| 60      | 888 B   | 59,2 B  | 8,88 T                | 17    |
| 100     | 1,26e21 | 8,4e19  | 1,26e22               | 39    |

Wichtige Eigenschaft (Abweichung von der ursprünglichen v2-Skizze, **übernommen wie
implementiert**): Das Gold/HP-Verhältnis ist **konstant** (1/15) — die Wand entsteht nicht
drop-seitig, sondern **kosten-seitig** (1,07^Level gegen lineare DPS/Level zwischen den
Meilensteinen). Die ursprünglich skizzierte „Bounty-Schere" (1,033^z) ist damit hinfällig;
§4.8 rechnet mit dem echten Modell.

### 4.1 Der aktive Klick-Layer als Star

Die eine pure Quelle der Klick-Wahrheit (M7 zieht sie aus dem Glue in `game/click.ts`, N2):

```
effectiveClick(ctx) =
  clickDamageOf(state)                 // = (1 + 0.2·ΣDPS_raw) · soulMult   [implementiert]
  × comboMult(ctx.combo)               // §4.2.2  [Basis implementiert im Glue]
  × critRoll(rng, chance, mult)        // §4.2.1  [implementiert im Glue → Modul + Seed]
  × beatBonus(ctx.onBeat)              // §4.2.3  [neu, M8]
  × frenzyMult(now)                    // §4.2.4  [neu, M8]
  × gearMult(ctx.gear)                 // §5      [neu, M11]
  × eventMult(now)                     // §6/M12  [Pfirsich-Rückkehr]
```

Idle-DPS läuft immer parallel (`dpsOf`), aber ohne Krit/Combo/Beat/Ekstase — Klicken bleibt
König (P1, belegt durch E4).

### 4.2 Teilsysteme des Klick-Layers

**4.2.1 Twerk-Krits — implementierte Werte werden Baseline.**

- **Übernommen wie im WIP-Glue:** Chance **20 %**, Multiplikator **×5** (EV ×1,8). Begründung
  gegen die ursprünglich skizzierten 2 %/×8 (EV ×1,28): (a) die gemessenen Pacing-Tabellen
  (§4.8) basieren bereits darauf; (b) häufige Krits = häufige Juice-Momente (P4); (c) ein
  seltener Riesen-Krit passt schlechter zu 3 cps Dauerfeuer.
- Skalierung: Ahnen/Skins erhöhen primär den **Multiplikator** (unbegrenzt — der
  Endless-Hebel); Chance hart gedeckelt bei **40 %** (Basis 20 + max. +20).
- M7: Roll via seedbarem RNG, Konstanten als Daten in `game/click.ts`, Unit-Tests
  (deterministische Sequenz, EV-Property-Test).

**4.2.2 Combo 2.0 (M8) — Basis bleibt, Tiers kommen obendrauf.**

- **Basis (implementiert):** +2 %/Stack, Cap 50 ⇒ max ×2, Fenster 1,5 s.
- **Neu:** benannte Tiers mit Zusatz-Perks (nicht mehr roher Mult — der bleibt bei ×2-Cap,
  damit die gemessene Balance steht):

| Tier | Stacks | Name      | Zusatz-Perk                          | Juice                           |
| ---- | ------ | --------- | ------------------------------------ | ------------------------------- |
| 1    | 10     | „Warm"    | —                                    | Partikel-Stufe 1                |
| 2    | 25     | „Heiß"    | +3 % Krit-Chance                     | Shake-Puls, Musik-Layer 1       |
| 3    | 50     | „Feuer"   | +6 % Krit-Chance                     | Partikel-Stufe 2, Musik-Layer 2 |
| 4    | 100*   | „Inferno" | +25 % Krit-Mult, Beat-Fenster +40 ms | Aura, Musik-Layer 3             |

*Stacks > 50 erhöhen den Mult nicht mehr, zählen aber für Tiers/Quests weiter; Cap-Anhebung
ist ein Ahnen-/Gear-Effekt.

- **Soft-Decay statt Hard-Reset (N6):** nach Fensterablauf −20 % der Stacks pro Sekunde
  (mind. 1/s) statt `combo = 0`. Ein Shop-Griff kostet Momentum, nicht alles.
- Pure Engine `game/combo.ts`: `comboOnClick`, `comboStep(dt)`, `comboMult`, `comboTier` —
  Glue ruft nur noch auf.

**4.2.3 On-Beat-Bonus (M8) — nutzt das vorhandene Beat-System.**
Der `BeatTracker` (`audio/beat.ts`) liefert Onsets; ein Klick innerhalb ±100 ms gilt als
„Im Takt!": **×1,5** auf diesen Klick, +1 Extra-Stack, goldener Blitz. Da das Tempo mit
`drive` steigt (schneller klicken → schnellerer Beat), entsteht ein Flow-Loop. Pure Prüfung
`isOnBeat(phase, clickT)` in `game/click.ts`.

**4.2.4 Aktive Fähigkeit „Twerk-Ekstase" (M8, à la Click Frenzy).**

- Lade-Meter 0–100: +1 pro Klick, +2 pro On-Beat-Klick. Voll ⇒ Taste `F`/Button.
- Effekt: **12 s lang ×10 Klick-Schaden**, Ekstase-Musik-Layer, FOV-Punch, Dauer-Partikel.
- Später (Himmelsbaum, M10): „Beat-Drop" (Sofortschaden 30 × effectiveClick, Cooldown 120 s),
  „Pfirsichregen" (5 Mini-Pfirsiche, je +60 s ×2-Boost bei Fang — M12-Synergie).
- Persistenz: Meter, aktive Fenster als Epoch-ms (CH-Save v3, §9.2). Pure `game/ability.ts`.

**4.2.5 Klick-Synergie — bereits implementiert.**
`clickDamageRaw = 1 + 0.2 · ΣDPS_raw` ist die Cookie-Clicker-Synergie in Reinform: jede
Crew-Investition buff't den Klick automatisch mit. Kein weiterer Mechanismus nötig; der
`CLICK_DPS_SHARE`-Wert (0,2) ist der zentrale P1-Tuning-Knopf und wandert als benannte
Konstante in die Balancing-Doku.

### 4.3 Crew, Meilensteine & Vergoldungen

**4.3.1 Implementierter Katalog (Daten, `heroes.ts`):**

| Crew-Mitglied      | Kosten (Lv 0→1) | Basis-DPS/Lv |
| ------------------ | --------------- | ------------ |
| Booty-Boss (Du)    | 5               | 1            |
| Hype-Girl          | 50              | 5            |
| DJ Wumms           | 250             | 22           |
| Türsteher          | 1 000           | 74           |
| Insta-Influencerin | 4 000           | 245          |
| Star-Choreograph   | 20 000          | 1 100        |
| Musik-Produzent    | 100 000         | 5 000        |
| A-Promi            | 500 000         | 22 000       |
| Club-Tycoon        | 3 M             | 120 000      |
| Twerk-Legende      | 20 M            | 700 000      |

Kostenwachstum 1,07/Level; Meilenstein-×2 bei [10, 25, 50, 100, 200, 400, 800]; Bulk-Kauf
×1/×10/×Max mit geschlossenen Formeln (alles implementiert + getestet).

**4.3.2 Crew-Fortschrittsbalken (M8-Politur):** pro Mitglied „noch n Level bis ×2" —
das AdCap-Gefühl, reine UI über `MILESTONES`.

**4.3.3 Crew-Erweiterung + endlose Meilensteine (M9, Anti-Plateau Stufe „Kosten-Seite").**
Fünf neue Tiers (reine Daten, Muster ~×6–8 Kosten, ~×6–7 DPS pro Schritt fortgesetzt):

| Neu                     | Kosten | Basis-DPS/Lv |
| ----------------------- | ------ | ------------ |
| Viral-Video-Team        | 150 M  | 4,5 M        |
| Hologramm-Double        | 1,2 B  | 30 M         |
| KI-Choreo-Cluster       | 10 B   | 220 M        |
| Orbitale Tanz-Station   | 80 B   | 1,6 B        |
| Kosmische Twerk-Entität | 650 B  | 12 B         |

Zusätzlich werden die Meilensteine endlos: nach 800 jede weitere **Verdopplung** (1600, 3200,
6400, …) ⇒ `DPS(lv)` wächst langfristig ~quadratisch statt linear — die Crew sättigt nie hart.
(Beide Änderungen zusammen gemessen: verschieben die 45-min-Wand von Bühne 55 auf 80, §4.8.)

**4.3.4 Vergoldungen (Gilds, M9).**
Jeder **Erst-Clear einer 10er-Bühne** (10, 20, 30, …) gewährt 1 **Vergoldung**: permanent
**×1,25 DPS** für ein zufälliges Crew-Mitglied (Umhängen später für 5 RS — CH-Gild-Move).
Vergoldungen überleben die Aszension ⇒ auch ein Run **ohne** neue Seelen, der eine neue
10er-Bühne erreicht, hinterlässt permanente Macht (P3; Anti-Plateau-Baustein). Persistenz:
`gilds: Record<heroId, number>` (CH-Save v2).

**4.3.5 Twerk-Coaches (Manager, M10 via Himmelsbaum).**
Ein Coach klickt 1×/s mit 25 % des effektiven Klickwerts (ohne Krit/Beat), upgradebar auf
4 cps. Automation imitiert _schwaches_ aktives Spiel statt es zu ersetzen (E4 bleibt).
Coaches zählen in `offlineGold` hinein (`dps + coachCps · 0.25 · clickDamage`) — damit
verdienen auch klick-lastige Builds offline (Rest von B11).

### 4.4 Die Welttournee — Bühnen-Leiter (implementiert; v2-Aufsätze)

**Implementierte Semantik (`combat.ts`, verbindlich):** 10 Rivalen pro Bühne; jede 5. Bühne
Boss (×10 HP, 30 s); Boss-Timeout ⇒ Rivalen respawnen, Bühne bleibt (nie Soft-Lock); Kills
droppen Gold sofort; `travelTo` klemmt auf 1..maxZone. Der Rivale steht als zweites Rig in
der Szene (WIP-Glue), Kulisse rotiert alle 10 Bühnen.

**v2-Aufsätze:**

1. **Farm-/Travel-UI (M9, G10):** Bühnen-Stepper im HUD (`◀ Bühne 37 ▶`, Max-Knopf) über das
   pure `travelTo` — tiefer farmen ist Strategie, keine Strafe.
2. **Rivalen-Namen & Boss-Inszenierung (M8/M9):** prozedurale Namen aus Listen („Groupie",
   „Rivalin Rita", …; Bosse: „Der Goldene Twerk-Tyrann" als **Boss von Bühne 10** —
   Kontinuität zum M2-Charakter; sein Erst-Kill triggert das Erbe-Achievement und später
   (M11) den Tyrann-Skin). Bühnen-Namen: „Neon-Keller Bottrop" → „Orbital-Arena Kepler-7b".
3. **Kill-Hooks für spätere Systeme:** Combo +2 Stacks pro Kill (M8), Schlüssel-/Truhen-Drops
   (M12), Quest-Zähler (M13) — alle hängen am puren `HitResult` (`killed/advancedZone/
bossSpawned`), kein neuer Zustand im Glue.

**Akzeptanzkriterien §4.4:**

1. Formeln bleiben exakt `combat.ts` (Regressionstests bestehen unverändert).
2. Travel-UI kann nie über `maxZone` hinaus (pure Clamp, Test).
3. Boss-Bühne-10-Erstkill feuert das Tyrann-Ereignis (Hook-Test).
4. Kill-Hooks sind pure Ableitungen aus `HitResult` (kein DOM-Zustand).

### 4.5 Drei gestapelte Prestige-Schichten

| Schicht | Name                                  | Währung                   | Gate (erstes Mal)                         | Resettet                                    | Bleibt                                                                         |
| ------- | ------------------------------------- | ------------------------- | ----------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------ |
| L1      | **Aszension** (implementiert: „Ruhm") | Ruhm-Seelen (RS)          | Bühne ≥ 10 + ≥ 1 neue Seele (`canAscend`) | Gold, Crew, Bühne/Kills (`ascendState`)     | RS, `lifetimeMaxZone`, `totalClicks`, Vergoldungen*, Ahnen*, Gear*, Schlüssel* |
| L2      | **Ruhmes-Himmelfahrt**                | Himmelspfirsiche (HPF)    | 1 000 RS lifetime                         | alles aus L1 **plus** RS-Bank & Ahnen-Level | HPF, Himmelsbaum, Gear, Schlüssel/Splitter, Achievements                       |
| L3      | **Transzendenz** (Gerüst)             | Transzendente Essenz (TE) | 100 HPF lifetime                          | alles aus L2 **plus** HPF & Himmelsbaum     | TE, Mythos-Skins, TE-Globalfaktor                                              |

\* sobald das jeweilige System existiert (M9–M12); der Reset-Scope je Schicht wird pro
Milestone per Snapshot-Test festgeschrieben.

**4.5.1 Schicht 1 — Ruhm-Seelen: implementiert + Retune (M9, gegen N1).**

- **Implementiert:** `RS(z) = ⌊z^1.6/40⌋`, +10 %/Seele, lifetime-gepinnt (kein Farm-Exploit),
  Bank schrumpft nie (`applyAscension`-Guard — genau dieser Guard macht den Retune
  migrationssicher).
- **Gemessenes Problem (N1):** Kurve zu flach ⇒ Bank-Plateau 13 RS / Bühne ~50.
- **Retune (additiv, kein Nerf):** neuer Term **„Legendäre Auftritte"**:

```
RS_v2(z) = ⌊z^1.6 / 40⌋ + ⌊1.10^z − 1⌋        (z ≥ 10)
```

| z      | 10  | 15  | 20  | 25  | 30  | 40  | 50  | 60  | 75    | 100    |
| ------ | --- | --- | --- | --- | --- | --- | --- | --- | ----- | ------ |
| RS alt | 0   | 1   | 3   | 4   | 5   | 9   | 13  | 17  | 25    | 39     |
| RS_v2  | 1   | 4   | 8   | 13  | 21  | 53  | 129 | 320 | 1 295 | 13 818 |

Der exponentielle Term sorgt dafür, dass jede neue Bestzone die Bank **vervielfacht** statt
inkrementiert (gemessene Kette: 53 → 129 → 203 allein durch den Term; mit Crew-Ausbau
53 → 810 → 2 070, §4.8). Bestands-Banken bleiben dank Guard unangetastet.

- UI (implementiert im WIP-Prestige-Tab, beibehalten): Vorschau „Aszendieren jetzt: +X Seelen
  (+Y %)" vor dem Reset.

**4.5.2 Schicht 2 — Ruhmes-Himmelfahrt: Himmelspfirsiche (M10).**

- Ertrag: `HPF = ⌊√(RS_lifetime / 1000)⌋` — erste Himmelfahrt ab 1 000 RS lifetime
  (≈ Bühne 70–80 mit RS_v2, mehrere Stunden), 100 k RS → 10 HPF, 1 M RS → 31 HPF.
- **Doppelwirkung** (der compoundende Anti-Plateau-Kern):
  1. +2 % globaler Schaden pro gehaltenem HPF;
  2. **Seelen-Verstärker:** `SOUL_BONUS_eff = 0.10 + 0.002 · HPF` — jede Seele wird selbst
     stärker. Damit multiplizieren sich L1 und L2, statt sich zu addieren.
- **Himmelsbaum** (ausgegebene HPF, permanent über alle Aszensionen):

| Knoten                 | Kosten (HPF) | Effekt                                                 |
| ---------------------- | ------------ | ------------------------------------------------------ |
| Twerk-Coach I–IV       | 5/15/40/100  | Auto-Klicker 1→4 cps (§4.3.5)                          |
| Frühstarter            | 8            | Start nach Aszension: Crew-Level = 10 % der vorherigen |
| Nachtschicht I–II      | 10/25        | Offline-Cap 8 h → 16 h → 24 h                          |
| Beat-Drop              | 20           | Fähigkeit (§4.2.4)                                     |
| Pfirsichregen          | 30           | Fähigkeit (§4.2.4)                                     |
| Ekstase-Ausdauer I–III | 12/30/75     | Ekstase +3 s je Stufe                                  |
| Truhen-Magnet          | 15           | +25 % Schlüssel-Drops (M12)                            |
| Bühnen-Sprinter        | 25           | Bühnen < ⌊Bestzone/3⌋ brauchen nur 3 Kills             |

**4.5.3 Schicht 3 — Transzendenz (Gerüst, M14, Feature-Flag).**
`TE = ⌊log10(HPF_lifetime)⌋`; Wirkung ×3^TE global + Mythos-Content (Skin „Diamant-Booty", 5. Kulisse „Astral-Klub"). Volle Ausgestaltung erst nach Live-Daten aus L1/L2 (§11).

**Akzeptanzkriterien §4.5:**

1. `RS_v2` pure + getestet, inkl. Property „jede neue Bestzone +5 ⇒ Bank wächst ≥ ×1,3
   (für z ≥ 40)"; Bestands-Banken schrumpfen nie (Guard-Test bleibt grün).
2. Reset-Scopes je Schicht als Snapshot-Tests (Tabelle oben exakt).
3. HPF-Verstärker: `soulMult`-Berechnung mit HPF > 0 getestet (kompoundierend, nicht additiv).
4. Aszensions-/Himmelfahrts-Dialoge zeigen Vorschau (+RS bzw. +HPF) vor dem Reset.

### 4.6 Twerk-Ahnen (Ancients — der Seelen-Sink, M10)

Kosten: `cost(lv) = lv + 1` RS (Summe n(n+1)/2). **Ausgegebene Seelen buffen nicht mehr über
`soulMult`** — der klassische CH-Tradeoff (Roh-Mult vs. Spezial-Perk). Daten-Array
`game/ancients.ts`; Effekte fließen als pure Modifikatoren in `effectiveClick`/`dpsOf`:

| Ahn:in               | Flavor                | Effekt/Level            | Cap               |
| -------------------- | --------------------- | ----------------------- | ----------------- |
| **Twerkules**        | Held der 1000 Reps    | +5 % Klick-Schaden      | —                 |
| **Poposeidon**       | Herr der Wellen       | +15 % Crew-DPS          | —                 |
| **Cheeksana**        | Auge des Sturms       | +0,5 % Krit-Chance      | 40 (= Chance-Cap) |
| **Glutaeus Maximus** | Gladiator             | +10 % Boss-Schaden      | —                 |
| **Chronilla**        | Hüterin der Zeit      | +1 s Boss-Timer         | 15                |
| **Peachiel**         | Erzengel des Goldes   | +10 % Gold              | —                 |
| **Wackelias**        | Der Unerschütterliche | +0,05 s Combo-Fenster   | 10                |
| **Beatrix**          | Taktgeberin           | +10 ms On-Beat-Fenster  | 8                 |
| **Truhilda**         | Schatzmeisterin       | +2 % Truhen-Luck        | 15                |
| **Ekstasius**        | Der Entfesselte       | −5 % Ekstase-Ladebedarf | 10                |

Caps nur, wo Unbegrenztheit degeneriert (Chance/Fenster/Timer); Prozent-Output-Ahnen sind der
endlose Seelen-Sink. Die %-Effekte compounden über Runs — zusammen mit Vergoldungen der Grund,
warum auch ein „+0-Seelen-Run" nie wertlos ist (Anti-Plateau, N1).

**Akzeptanzkriterien §4.6:** 1. Konfig ist Daten (Balancing ohne Logikänderung). 2. `ancientBonus(id, lv)` pure + getestet; Caps im puren Kauf-Guard. 3. Kauf senkt `soulMult` korrekt und erhöht den Perk (Bilanz-Test).

### 4.7 Währungs-Karte

| Kürzel | Name                  | Verdienen                                | Ausgeben                                       | Reset-Scope |
| ------ | --------------------- | ---------------------------------------- | ---------------------------------------------- | ----------- |
| BP     | Booty Points (= Gold) | Kills, Boss ×12, Offline, Truhen         | Crew-Level                                     | L1          |
| RS     | Ruhm-Seelen           | Aszension (`RS_v2(maxZone)`)             | Ahnen; gehaltene = +10 %·(1+0,002·HPF) je      | L2          |
| 🏅     | Vergoldungen          | Erst-Clear jeder 10er-Bühne              | ×1,25 auf ein Crew-Mitglied; Umhängen 5 RS     | nie         |
| HPF    | Himmelspfirsiche      | Himmelfahrt (`⌊√(RS_life/1000)⌋`)        | Himmelsbaum; gehaltene = +2 %/Stk + Verstärker | L3          |
| TE     | Transzendente Essenz  | Transzendenz (`⌊log10 HPF_life⌋`)        | ×3^TE, Mythos-Content                          | nie         |
| 🔑     | Truhenschlüssel       | Bosse, Quests, Daily, Combo-Meilensteine | Truhen öffnen (§6)                             | nie         |
| 🧩     | Pfirsich-Splitter     | Truhen, Duplikate, Quests                | Skins leveln (§5.4)                            | nie         |
| 🍬     | Zuckerpfirsich        | 1×/24 h Echtzeit                         | Skin-Sterne (§5.4)                             | nie         |

### 4.8 Gemessene Pacing-Daten, Plateau-Analyse & Endlos-Kriterien

Alle Zahlen stammen aus einer deterministischen Sim **über die implementierten Formeln**
(Vorläufer von `simulateEndless`, §9.5). Annahmen: 3 Klicks/s, Combo dauerhaft ×2,
Krit-EV ×1,8 (= 20 %/×5), ROI-greedy Crew-Käufe, 1-s-Schritte.

**Messung 1 — Run 1 (0 Seelen), Zeit bis Bühne:**

| Bühne                      | 5       | 10  | 15  | 20  | 25  | 30                    | 35   | 40   | 45   |
| -------------------------- | ------- | --- | --- | --- | --- | --------------------- | ---- | ---- | ---- |
| aktiv (3 cps + Juice)      | 0,6 min | 1,4 | 2,8 | 5,0 | 8,3 | 13,4                  | 22,8 | 36,2 | 56,6 |
| casual (1 cps, ohne Juice) | 2,8 min | 4,9 | —   | —   | —   | Bühne@45 min = **30** | —    | —    | —    |

Aktiv erreicht Bühne **40** in 45 min — 10 Bühnen (≈ ×110 Ausdauer) vor casual. **Das ist die
Klick-Invariante in Zahlen** (E4).

**Messung 2 — Aszensions-Kette mit implementierter Kurve (45-min-Runs):**

| Run | Start-Mult | Bestzone | +RS    | Bank             |
| --- | ---------- | -------- | ------ | ---------------- |
| 1   | ×1,0       | 40       | +9     | 9                |
| 2   | ×1,9       | 45       | +2     | 11               |
| 3   | ×2,1       | 49       | +1     | 12               |
| 4   | ×2,2       | 50       | +1     | 13               |
| 5–6 | ×2,3       | 50       | **+0** | 13 — **Plateau** |

**Messung 3 — Fix-Stack (jede Stufe isoliert gemessen):**

| Konfiguration                         | Kette (Bank)     | Plateau         |
| ------------------------------------- | ---------------- | --------------- |
| implementiert                         | 9 → 11 → 12 → 13 | Bühne ~50, ×2,3 |
| + RS_v2-Term                          | 53 → 129 → 203   | Bühne ~55, ×21  |
| + 5 Crew-Tiers + endlose Meilensteine | 53 → 810 → 2 070 | Bühne ~80, ×208 |

**Analyse (die ehrliche Lektion):** Bei **fester** Run-Länge plateaut jede lineare
Mult-Ökonomie gegen exponentielle Ausdauer — das gilt auch für Clicker Heroes selbst. Dort
tragen ab da (a) Ancients mit compoundenden %-Effekten, (b) Gilds, (c) längere Runs, die
durch die Meta immer _schneller bis zur alten Bestzone_ werden. Genau diese drei Bausteine
liefern §4.6 (Ahnen), §4.3.4 (Vergoldungen) und der HPF-Verstärker (§4.5.2). „Endlos" wird
darum **so** definiert und getestet:

**Endlos-Kriterien (CI-Asserts in `simulateEndless`, §9.5):**

- **E1 (kein Hard-Cap):** Für jede erreichte Bestzone z existiert ein Spielzustand, der z+5
  erreicht (DPS wächst mit Gold unbegrenzt; endlose Meilensteine garantieren das strukturell).
- **E2 (weiche Wand):** Zeit bis `lifetimeMaxZone + 5` steigt pro Verbesserung um ≤ ×2
  (erste 30 Verbesserungen, volles v2-System).
- **E3 (Loop bleibt lebendig):** Zeit bis „+50 % Gesamtmacht" ≤ 90 min über die ersten
  20 Aszensionen (Gesamtmacht = effektive DPS+Klick bei Bestzonen-Farm).
- **E4 (Klick-Invariante):** aktiv (3 cps + Juice) ≥ 8 Bühnen vor casual (1 cps, ohne Juice)
  im 45-min-Fenster. Gemessen heute: 10.

**Pacing-Zieltabelle v2 (Toleranz ±25 %, per Sim kalibriert):**

| Meilenstein der Spielerin                | Ziel                           |
| ---------------------------------------- | ------------------------------ |
| Bühne 10 (Tyrann-Boss)                   | ~1,5 min                       |
| Erste sinnvolle Aszension (Bühne ~30–40) | 15–40 min                      |
| Zweite Aszension                         | +15–25 min                     |
| Bühne 80 (kumuliert)                     | 3–5 h                          |
| Erste Himmelfahrt (1 000 RS lifetime)    | 5–9 h kumuliert                |
| Transzendenz-Gate (100 HPF)              | Größenordnung Tage (Flag, §11) |

---

## §5 Skins als Gear (Buffs statt Kosmetik — M11)

### 5.1 Prinzip

Im MVP ist die Figur fix und die Kulisse rotiert automatisch — M11 bringt **Wahl + Wirkung**
zurück: 1 aktiver Skin (voller Buff) + Kulissen-Mini-Buff + Set-Boni. Kein Skin ist rein
kosmetisch; die stärksten Buffs sind Klick-Buffs (P1). Erwerb über Bühnen-Meilensteine
(`lifetimeMaxZone` als Gate, analog zum alten `revealAt`-Muster), Boss-Erst-Kills oder Truhen
(M12); Fortschritt über Level (Splitter) und Sterne (Zuckerpfirsiche).

### 5.2 Datenmodell

`SkinConfig` (`character/skins.ts`, `types.ts`) wird erweitert — Daten, kein Code:

```ts
interface SkinConfig {
  …bestehende Felder…
  rarity: 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
  buff: { stat: BuffStat; perLevel: number };   // linear pro Level
  star: { stat: BuffStat; perStar: number };    // Sterne 0–5
}
type BuffStat = 'clickPct' | 'dpsPct' | 'critChance' | 'critMult' | 'comboWindow'
  | 'comboDecay' | 'goldPct' | 'bossDmg' | 'bossTimer' | 'beatWindow'
  | 'chestLuck' | 'keyDrop' | 'offlineCap' | 'frenzyDur';
```

`game/gear.ts` faltet Skin + Kulisse + Sets zu einem puren `GearBonus`, konsumiert von
`effectiveClick`/`dpsOf`.

### 5.3 Katalog (5 bestehende + 5 neue, alle prozedural baubar)

| Skin                     | Rarität   | Buff/Level            | Stern-Bonus          | Beschaffung               |
| ------------------------ | --------- | --------------------- | -------------------- | ------------------------- |
| 🕺 Klassiker             | Common    | +4 % Klick            | +10 % Klick/⭐       | Start                     |
| 🪩 Disco-King            | Rare      | +0,4 % Krit-Chance    | +5 % Krit-Mult/⭐    | Start                     |
| 🤖 Robo-Twerk 3000       | Rare      | +8 % Crew-DPS         | Coach +0,2 cps/⭐    | Bühne 15 erreicht         |
| 🎤 Der Showmaster        | Epic      | +0,06 s Combo-Fenster | −4 % Combo-Decay/⭐  | Bühne 25 erreicht         |
| 👑 Goldener Twerk-Tyrann | Legendary | +12 % Boss-Schaden    | +2 % Truhen-Luck/⭐  | Boss Bühne 10 (Erst-Kill) |
| 🥷 Neon-Ninja            | Epic      | +8 ms Beat-Fenster    | On-Beat ×1,5→×1,6/⭐ | Truhen-Craft (120 🧩)     |
| 🏴‍☠️ Pfirsich-Pirat        | Rare      | +6 % Schlüssel-Drop   | +5 % Gold/⭐         | Truhen-Craft (80 🧩)      |
| 🌋 Lava-Twerker          | Epic      | +6 % Krit-Mult        | Ekstase +1 s/⭐      | Boss Bühne 50 (Erst-Kill) |
| 🛸 Galaktischer Gyrator  | Legendary | +10 % Ekstase-Dauer   | −8 % Ladebedarf/⭐   | 1. Himmelfahrt            |
| 💎 Diamant-Booty         | Mythic    | +2 % ALLES            | +3 % ALLES/⭐        | Transzendenz              |

### 5.4 Level & Sterne

- **Level 1–50:** `splitter(lv) = 10 · ⌈1.25^lv⌉`; lineare Buff-Skalierung.
- **Sterne 0–5:** je 1 Zuckerpfirsich × (Sterne + 1); Zuckerpfirsich reift 1×/24 h Echtzeit
  (Sugar-Lump-Anker: langsame, nicht grindbare Meta-Währung → täglicher Login-Grund, §7.1).
- Duplikat aus Truhe → 25 🧩 (Common) … 400 🧩 (Legendary).

### 5.5 Set-Boni (Skin × Kulisse)

| Set              | Kombination                               | Bonus                    |
| ---------------- | ----------------------------------------- | ------------------------ |
| „Studio 54"      | Disco-King + Neon-Club                    | +10 % Krit-Schaden       |
| „Retrowelle"     | Neon-Ninja + Synthwave                    | Beat-Fenster +20 ms      |
| „Endless Summer" | Pfirsich-Pirat + Sunset Beach             | Offline-Rate 50 % → 65 % |
| „Void-Funk"      | Galaktischer Gyrator + Deep Space         | +15 % Crew-DPS           |
| „Krönung"        | Tyrann + beliebige Boss-Bühne (z % 5 = 0) | +10 % Boss-Schaden       |

Kulissen allein: Club +0,1 s Combo-Fenster · Synth +10 ms Beat-Fenster · Beach +2 h
Offline-Cap · Space +5 % Crew-DPS. Manuelle Kulissen-Wahl kehrt zurück; die MVP-Auto-Rotation
bleibt als Default („Tour-Modus") wählbar.

**Akzeptanzkriterien §5:**

1. `gearBonus(state)` pure; Skin-Wechsel ändert `effectiveClick` deterministisch (Test).
2. Set-Erkennung als Daten-Tabelle; ≥ 2 Sets getestet.
3. Legacy-Erbe (§9.2.3): `bossDefeated`-Altsave ⇒ Tyrann-Skin ab M11 freigeschaltet.
4. Jede Skin-Karte zeigt Rarität, Buff, Level, Kosten — kein buff-loser Skin.
5. E4 bleibt mit Best-in-Slot-Idle-Gear erfüllt (Sim-Messpunkt).

---

## §6 Pfirsich-Truhen — Loot ohne Echtgeld (M12)

### 6.1 Quellen von Truhen & Schlüsseln

| Quelle                                     | Drop                                               |
| ------------------------------------------ | -------------------------------------------------- |
| Boss-Kill (jede 5. Bühne)                  | 1 🔑 garantiert; Truhe 100 % (Tier bühnenabhängig) |
| Rivalen-Kill                               | 3 % Chance Holztruhe (skaliert mit Truhen-Luck)    |
| Combo-Tier 3 (erstmals pro Run)            | 1 🔑                                               |
| Goldener Pfirsich (kehrt als Event zurück) | ×3-Boost 60 s wie gehabt + 25 % Chance 1 🔑        |
| Daily-Login (§7.1)                         | 1 Goldtruhe                                        |
| Quests (§7.2)                              | 🔑/Truhen/🧩 laut Quest                            |
| 20 min aktive Session (> 500 Klicks)       | 1 Holztruhe (max 3/Tag)                            |

Truhen landen in einem Inventar (🎁-Tab); Öffnen kostet 🔑 (Holz 0, Gold 1, Diamant 3,
Mythos 10).

### 6.2 Tiers & Beispiel-Loot-Tabelle

| Truhe      | Typische Quelle           | 🔑  | Budget                |
| ---------- | ------------------------- | --- | --------------------- |
| 🪵 Holz    | Kills, Session-Drip       | 0   | klein (BP/Kurz-Boost) |
| 🥇 Gold    | Bosse < Bühne 50, Daily   | 1   | mittel (🧩-Kern)      |
| 💠 Diamant | Bosse ≥ Bühne 50, Quests  | 3   | groß (Epic-Chance)    |
| 🌌 Mythos  | Bosse ≥ Bühne 150, Events | 10  | Jackpot               |

**Goldtruhe (Gewichtssumme 100):** 30 → BP = 15 min aktuelles Gesamteinkommen · 25 →
×2-Boost 10 min (stackt Dauer, nicht Faktor) · 22 → 3–8 🧩 · 10 → +1 🔑 · 8 →
Permanent-Token „+1 % Krit-Schaden" · 3 → 🍬 · 2 → **Jackpot** (Truhen-Skin; Duplikat → 🧩).
Diamant: Budget ×4, 🧩 10–25, Jackpot 5 %, Token-Pool erweitert (+0,1 % Krit-Chance /
+1 % Gold / +1 % Crew-DPS).

### 6.3 Fairness-Regeln (P5)

1. **Pity:** spätestens jede 12. Gold-/4. Diamanttruhe enthält 🧩-Maximum **oder** Jackpot;
   Zähler pro Tier persistiert.
2. **Duplikat-Schutz:** fester 🧩-Kurs, nie „nichts".
3. **Kein Kauf:** 🔑/Truhen ausschließlich erspielbar. Keine Ausnahme, nie.
4. **Truhen-Luck** (Truhilda, Tyrann-Sterne, Truhen-Magnet) verschiebt Gewichte von Zeile 1
   nach unten — pure `applyLuck(table, luck)`, getestet.
5. **Transparenz:** Loot-Tabellen (Gewichte in %) im 🎁-Tab einsehbar.

### 6.4 Determinismus

Alle Rolls über den seedbaren RNG (§9.4): `openChest(tier, state, rng)` pure ⇒
`{ rewards, newPity }`. Da `{ seed, cursor }` im Save liegen, ist Save-Scumming vor Truhen
wirkungslos.

**Akzeptanzkriterien §6:**

1. `openChest` deterministisch (gleicher Seed ⇒ gleicher Loot) + Verteilungstest
   (10 000 Ziehungen, χ²-Toleranz).
2. Pity-Grenzfall exakt (11 Nieten ⇒ 12. trifft).
3. Truhen-Öffnung: 1,2-s-Animation, per Klick skippbar (§8.6).
4. Inventar/🔑/Pity überleben Reload (CH-Save-Version des Milestones, Migrationstest).
5. Kein Netzwerk-/Echtgeld-Pfad (Review-Checkliste in TESTPLAN).

---

## §7 Meta & Retention (offline-freundlich, fail-silent — M13)

### 7.1 Daily-Anker

1 Goldtruhe/Tag; Streak bis 7 (Tag 7: Diamanttruhe + 2 🔑), Streak-Schutz 1×/Woche gratis
(kein FOMO-Terror). 🍬-Reifung (24-h-Echtzeit-Timer) als zweiter Anker. Alles lokal
(`Date.now`), kein Server.

### 7.2 Quests/Challenges

3 Slots, täglich rotierend, deterministisch aus dem Datum ge-seedet; Reroll 1×/Tag.
Daten-Array `game/quests.ts`. Beispiele: „Erreiche Combo-Tier 3" (2 🔑) · „Besiege 4 Bosse"
(Goldtruhe) · „500 On-Beat-Klicks" (Diamanttruhe) · „Erreiche eine neue Bestzone" (5 RS) ·
„Aszendiere einmal" (20 🧩).

### 7.3 Achievements (Rückkehr im CH-Modus)

Das 18er-Set wird durch ein CH-natives Set ersetzt/erweitert (Daten): Bühnen-Meilensteine
(10/25/50/100/200), Boss-Streaks ohne Timeout, Combo-Tiers, Krit-Zähler, Aszensionen,
Vergoldungen, Truhen. Legacy-Achievements, die es im CH-Modus nicht mehr geben kann, entfallen
ersatzlos (Doku in DECISIONS.md).

### 7.4 Leaderboard v2 (G16, behebt B8 endgültig)

- **Metrik: `maxZone`** (= `lifetimeMaxZone`) + Anzeige `souls`, `ascensions` — monoton,
  endless-tauglich, durch Prestige nicht brech-, sondern förderbar.
- **Upsert pro Nickname** (D1 `UNIQUE(nickname)`, Update nur bei größerer Zone) statt
  unbegrenzter `INSERT`s. Vertrag §9.7. Alte `scores`-Tabelle: Archiv oder Drop → §11.
- Client bleibt fail-silent & default-aus (`VITE_API_BASE`), Wiring wie M5-Muster.

### 7.5 Saison-Events & Statistik

Client-seitig datumsbasiert (Oktober „Spooky Booty", Dezember „Frost-Twerk"; Event-Skins
bleiben danach craftbar — kein Hardlock). Statistik-Tab (📊 im ⚙️): Gold lifetime, Klicks,
Krits, On-Beat-Quote, höchste Combo, Boss-Kills/-Timeouts, Bestzone, Aszensionen, RS lifetime,
Truhen, Spielzeit.

**Akzeptanzkriterien §7:**

1. Daily/Streak/Quests voll offline; Uhr-Manipulation ⇒ Neutralverhalten, nie Crash (Tests).
2. Quest-Rotation deterministisch aus Datum (Test: gleiches Datum ⇒ gleiche Quests).
3. Leaderboard v2: Upsert-Semantik per In-Memory-Fakes getestet (M5-Muster); Spiel voll
   spielbar ohne API.
4. Statistik trennt lifetime vs. run-scoped korrekt über Aszensionen (Test).

---

## §8 UX / Juice / Feel — Klicken muss sich großartig anfühlen

Bereits im WIP-Glue: Krit-Popups („CRIT"), stärkerer Shake bei Krit, Combo-Anzeige,
Boss-Toasts, Kulissen-Wechsel als Bühnen-Belohnung. Der Rest (alles über die bestehenden
Toggles in `bootyclicker.settings`; neu: Haptik, Popup-Dichte):

1. **Hit-Feedback-Basis:** Klick = Cheek-Impuls (existiert) + 60-ms-Skalen-Punch am Pelvis +
   Mini-Burst. Krit: Ring-Burst + Gold-Blitz + tiefer Boom-Layer.
2. **Floating Numbers 2.0:** Krit ×1,6 Größe/golden/rotierend; On-Beat mit „♪"-Präfix;
   Gold-Popups (implementiert) getrennt von Schadens-Popups stylen.
3. **Popup-Pooling & Batching (B7):** max. 1 Popup/80 ms, Akkumulator aggregiert („+12,4 K ×7");
   Pool aus 24 wiederverwendeten Nodes statt `createElement` pro Klick (`ui/pops.ts`, pure
   Batcher-Logik getestet).
4. **Screen-Shake-Tiers:** Combo-Tier 2: 0,2 · Tier 3: 0,35 · Ekstase: 0,5 · Boss-Kill: 0,6 —
   weiterhin nur im Render-Call, nie in OrbitControls-State (M4-Muster).
5. **Partikel skalieren mit Combo:** Burst = `8 + Tier · 6` (Pool 200, ggf. 400 — messen,
   < 1 ms/Frame bleibt AC).
6. **Truhen-Animation (M12):** wackeln → aufspringen → Reward-Karten, 1,2 s, skippbar;
   Ratsche + Jingle prozedural.
7. **Mobile:** Shop als **Bottom-Sheet** (~55 % Höhe — Figur & Rivale bleiben sichtbar, B13a);
   `viewport-fit=cover` + `env(safe-area-inset-*)` auf allen fixed-Elementen (B13b, M7).
8. **Haptik:** `navigator.vibrate?.(8)` pro Klick (gedrosselt 1×/100 ms), 35 ms bei Krit,
   Muster `[20,30,60]` bei Boss-Kill/Jackpot; Feature-Detection, Toggle, iOS-no-op.
9. **Ability-Bar:** unten mittig Ekstase-Meter (füllt sichtbar), daneben Fähigkeiten mit
   radialem Cooldown; Tasten `F`/`D`/`R`.
10. **Sound-Layering:** Combo-Tier schaltet Musik-Layer zu (Tier 2: Perkussion, Tier 3:
    Lead-Arp +1 Oktave, Ekstase: alles + Filter-Sweep) — `MusicPlayer.setIntensity(0..3)`,
    additiv zum 16-Step-Pattern.
11. **HUD-Wahrheit:** DPS/Klick-Zeile zeigt **effektive** Werte inkl. aktiver Boosts; das
    Bühnen-Widget (implementiert) erhält Boss-Timer-Puls < 10 s.

**Akzeptanzkriterien §8:**

1. 12 cps + Krits + Partikel: 60 fps auf Referenz-Laptop (gemessen, TESTPLAN-Eintrag).
2. Popup-DOM ≤ 24 Nodes gleichzeitig (Pool-Zähler-Test).
3. Haptik nie > 10×/s, nie ohne Toggle.
4. Alle neuen Effekte einzeln abschaltbar; „Effekte aus" ⇒ MVP-Optik.
5. Bottom-Sheet: Figur + Rivale beim Shoppen sichtbar (Screenshot-Nachweis).

---

## §9 Technisches Design & Architektur-Fit

### 9.1 Modul-Layout (bestehend + neu; alle neuen Kernmodule pure & DOM-frei)

```
BESTEHEND (committet):
apps/game/src/game/combat.ts     # Bühnen/Boss-Loop            [M-MVP]
apps/game/src/game/heroes.ts     # Crew, Meilensteine, Bulk    [M-MVP]
apps/game/src/game/ascension.ts  # Ruhm-Seelen                 [M-MVP]
apps/game/src/game/ch-state.ts   # CH-State + abgeleitete Werte[M-MVP]
apps/game/src/save/ch-store.ts   # CH-Save v1 + Offline-Gold   [M-MVP]
apps/game/src/ui/format.ts       # endless-sicheres fmt()      [M-MVP]

NEU:
apps/game/src/util/rng.ts        # mulberry32, seedbar                    [M7]
apps/game/src/game/click.ts      # effectiveClick, Krit, On-Beat          [M7/M8]
apps/game/src/game/combo.ts      # Tiers + Soft-Decay                     [M8]
apps/game/src/game/ability.ts    # Ekstase/Beat-Drop/Pfirsichregen        [M8]
apps/game/src/game/gild.ts       # Vergoldungen                           [M9]
apps/game/src/game/ancients.ts   # Ahnen-Konfig + Boni                    [M10]
apps/game/src/game/heaven.ts     # HPF + Himmelsbaum                      [M10]
apps/game/src/game/gear.ts       # Skin/Kulissen/Set-Fold                 [M11]
apps/game/src/game/chests.ts     # Loot, Pity, Luck                       [M12]
apps/game/src/game/quests.ts     # Daily/Quests/Streak                    [M13]
apps/game/src/game/sim.ts        # simulateEndless                        [M9+]
apps/game/src/ui/pops.ts, ability.ts, chest.ts, stats.ts, gear.ts  # Glue
```

Legacy-Module (economy/progression/boss/events/achievements + `save/store.ts`) bleiben als
eingefrorenes Archiv im Repo (Tests grün, keine Weiterentwicklung), bis der Erbe-Import
(§9.2.3) verschifft ist; danach Entfernung als eigener Aufräum-Commit (N4, DECISIONS.md).
`main.ts` bleibt der einzige Wiring-Ort; > ~600 Zeilen ⇒ Extraktion nach `bootstrap/`.

### 9.2 Save-Evolution (Key `bootyclicker.ch`, never-throw, `Object.hasOwn`-Disziplin)

**9.2.1 Versionsplan** (ein Bump pro bedarfstragendem Milestone; Migrationskette v1→… nach dem
Registry-Muster von `save/migrate.ts` — nie werfen, Zukunfts-/Unsinns-Versionen ⇒ sauberer
Fresh-Start):

| Version            | Milestone | Neue Felder                                                                                                                              |
| ------------------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| v1 (implementiert) | MVP       | `gold, zone, killsThisZone, runMaxZone, crew, souls, lifetimeMaxZone, totalClicks, lastSeen`                                             |
| v2                 | M7        | `rng: { seed, cursor }` · `stats: { crits, onBeatClicks, bossKills, bossTimeouts, goldLifetime, playTimeS }` · `legacyImported: boolean` |
| v3                 | M8        | `ability: { charge, frenzyUntil, cooldowns }` · `combo: { stacks }` (Reload-Kontinuität)                                                 |
| v4                 | M9        | `gilds: Record<heroId, number>` · `rsLifetime`                                                                                           |
| v5                 | M10       | `ancients: Record<string, number>` · `heaven: { hpf, hpfLifetime, ascensions2, tree: Record<string, number> }`                           |
| v6                 | M11       | `gear: { skin, bg, bgAuto, skinLevels, skinStars, shards, sugarPeaches, nextSugarAt }`                                                   |
| v7                 | M12       | `chests: { keys, inventory, pity }` · `permTokens`                                                                                       |
| v8                 | M13       | `meta: { questDate, questProgress, questsClaimed, streak, lastLoginDay }` · `achievements: string[]`                                     |

Jede Migration: Default-Werte, Validator-Erweiterung (pro Feld Typ + Range, unbekannte Keys
ignorieren), Migrationstest (vN-Save lädt verlustfrei in vN+1; korruptes Teilobjekt ⇒ null ⇒
sauberer Neustart — bestehendes `isChSave`-Muster).

**9.2.2 Invarianten-Reparatur** bleibt wie implementiert (`stateFromSave`: `runMaxZone ≥ zone`,
`lifetimeMaxZone ≥ runMaxZone`) und wird pro neuem Feld fortgeschrieben (z. B. Pity ≥ 0,
`nextSugarAt` zu weit in der Zukunft ⇒ auf `now + 24 h` klemmen).

**9.2.3 „Erbe der alten Tour" (M7, einmalig).** Beim ersten CH-Boot mit vorhandenem
Legacy-Save (`bootyclicker.save`, v1–v4 über die bestehende `loadGame`-Kette lesbar):

- `rebirths ≥ 1` ⇒ Start-RS = `7 · rebirths` (großzügig, ≈ je eine Bühne-34-Bestzone);
- `bossDefeated` ⇒ Tyrann-Skin-Anspruch vorgemerkt (einlösbar ab M11) + Achievement-Vormerkung;
- `maxBp ≥ 50 000` ⇒ 1 Goldtruhe vorgemerkt (einlösbar ab M12).
  Danach `legacyImported = true`; der Legacy-Key wird **nicht** gelöscht (Archiv). Test:
  Import ist idempotent (zweiter Boot ⇒ kein Doppel-Bonus).

### 9.3 Zahlenformat & -grenzen — Entscheidung bestätigt: **Doubles, kein BigNumber**

`fmt()` ist geliefert (B1 ✔): benannte Suffixe bis `Dc` (10³³), darüber wissenschaftlich
(`"1.00e36"`), `∞`- und Negativ-Guards, Tests in `format.test.ts`. Abwägung unverändert:

|        | Doubles + e-Notation (gewählt)                            | BigNumber-Lib (`break_infinity`, ~25 KB) |
| ------ | --------------------------------------------------------- | ---------------------------------------- |
| Bundle | ±0 KB                                                     | +25–30 KB                                |
| Umbau  | keiner                                                    | jede Formel + alle Tests + Save-Format   |
| Grenze | 1,8e308 hart; Additions-Präzision ab Verhältnis 2⁵³ (B15) | praktisch unbegrenzt                     |

Die Prestige-Schichten halten Werte pro Run < 1e60 (Bühne ~300 ⇒ HP ~1e58 — weit vor der
Double-Grenze greift L1/L2-Reset-Druck). Der Sim-Guard (§9.5) asserted: kleinster relevanter
Gewinn > `wert · 2⁻⁵⁰`. Erst wenn Transzendenz-Tuning das sprengt, wird BigNumber ein eigener
Milestone (§11).

### 9.4 Deterministische Zufälligkeit (M7)

`util/rng.ts`: mulberry32 (32-Bit-Seed, ~10 Zeilen, keine Dependency). `{ seed, cursor }` im
CH-Save v2; jede Ziehung inkrementiert `cursor`, Reload setzt den Strom exakt fort ⇒
Save-Scumming (Krits heute, Loot ab M12) wirkungslos + volle Testbarkeit. Alle
spielrelevanten Rolls (Krit, Loot, Quest-Rotation, Vergoldungs-Ziel) ziehen aus injizierten
RNG-Funktionen; `Math.random` bleibt nur für nicht-spielrelevante Optik (Partikelrichtungen,
Kamera-Shake) erlaubt. Tests: gleiche Seed+Cursor ⇒ identische Sequenz über Serialisierung.

### 9.5 `simulateEndless` (M9, CI-Gate ab dann; Vollausbau M14)

Deterministischer Bot **über die echten Module** (combat/heroes/ascension/click/…): klickt
`clickRate` cps, nutzt Ekstase optimal, kauft ROI-greedy (inkl. Meilenstein-Sprünge), farmt
via `travelTo`, aszendiert bei Grenznutzen < Schwelle, kauft Ahnen nach fixer Priorität.
Die Messwerte aus §4.8 sind die Kalibrier-Baseline (Sim-Annahmen dort dokumentiert). Asserts:

1. Pacing-Zieltabelle §4.8 (±25 %).
2. Endlos-Kriterien E1–E4.
3. Float-Guard (§9.3).
4. Sim-Eigenlaufzeit < 10 s (1-s-Schritte, gedeckelte Run-Anzahl).

### 9.6 Performance-Budget (unverändert hart)

Bundle < 5 MB (Basis ~578 KB; alle neuen Systeme sind Code/Daten, Schätzung +80–120 KB —
einziges Budget-Risiko wäre BigNumber, §11). 60 fps Referenz-Laptop; Partikel < 1 ms/Frame
(Mess-AC); FPS-Cap/Qualitäts-Presets decken neue Effekte mit ab; Draw Calls < 150 (Rivalen-Rig
statt Boss-Rig, Truhen-UI ist DOM); Popup-Pool ≤ 24 Nodes; kein `innerHTML`-Rebuild im
Klick-Hot-Path.

### 9.7 Leaderboard-API v2 (fix, M13)

```
POST /api/v2/scores
  Body: { "nickname": string, "maxZone": number, "souls": number, "ascensions": number }
  201: { "rank": number }   400 | 429 wie gehabt
  Semantik: Upsert pro Nickname; Update nur wenn maxZone größer.
GET /api/v2/scores/top?limit=50
  200: [{ "nickname": string, "maxZone": number, "souls": number,
          "ascensions": number, "updatedAt": string }]
```

D1: `scores_v2(nickname TEXT UNIQUE, max_zone INTEGER, souls REAL, ascensions INTEGER,
updated_at TEXT)` + Index `max_zone DESC`. Nickname-Regeln (`[a-zA-Z0-9_ ]{2,16}`),
Rate-Limit 5/min/IP, In-Memory-Fake-Tests: identisch zum M5-Muster.

---

## §10 Implementation-Roadmap (M7+, strikte Reihenfolge, baut auf dem CH-MVP auf)

> Jeder Milestone ist eigenständig shippable, endet grün (`lint`/`test`/`build`) und mit
> Update von `README.md` + `DECISIONS.md` (DoD). Balancing-Werte sind Daten. Voraussetzung
> für M7 (**erfüllt**): die MVP-Verdrahtung (main.ts + ch-ui) ist committet, gepusht und der
> Test-Satz grün.

### M7 — MVP-Härtung & Kern-Hygiene

- **Klick-Mathe in den Kern (N2):** `game/click.ts` mit `CRIT_CHANCE/CRIT_MULT/COMBO_*` als
  Daten + `effectiveClick`-Grundpipeline; `main.ts` ruft nur noch auf.
- **Seedbarer RNG (N3):** `util/rng.ts`; Krit-Roll umgestellt; CH-Save **v2** (`rng`, `stats`,
  `legacyImported`) + Migration v1→v2 + Validator-Tests.
- **Tab-Rückkehr-Grant (B5):** `visibilitychange → visible` schreibt `offlineGold` seit dem
  letzten Tick gut; Welcome-Back ab > 60 s.
- **„Erbe der alten Tour" (§9.2.3):** einmaliger Legacy-Import (RS, Vormerkungen), idempotent.
- **Safe-Area (B13b):** `viewport-fit=cover` + `env()`-Padding.
- **Doku (B16/N5):** README/TESTPLAN beschreiben den CH-Loop; entfallene M6-Features als
  „kehrt in Mx zurück" gelistet; DECISIONS-Einträge (Pivot, Krit-Baseline, Legacy-Archiv).
- **Akzeptanzkriterien:**
  1. `effectiveClick` deterministisch getestet (Seed ⇒ exakte Krit-Sequenz; EV-Property
     ×1,8 ± 1 % über 100 k Rolls).
  2. Gehaltene Leertaste erzeugt genau 1 Shake (Test mit `repeat: true`).
  3. Tab 10 min hidden ⇒ Grant bei Rückkehr = `offlineGold(dps, zone, 10 min)` (injizierte
     Clock, Test).
  4. v1-Save lädt verlustfrei in v2; korruptes `rng`-Feld ⇒ frischer Seed statt Crash.
  5. Erbe-Import: NG+3-Legacy-Save ⇒ 21 RS; zweiter Boot ⇒ kein Doppel-Bonus (Tests).
  6. Alle bestehenden Modul-Tests bleiben grün; Bundle-Delta < +10 KB.

### M8 — Klick-Juice 2.0 (der Star zuerst)

- `game/combo.ts` (Tiers + Soft-Decay statt Hard-Reset, N6/G4), On-Beat-Bonus
  (`isOnBeat` + BeatTracker-Anbindung), `game/ability.ts` (Twerk-Ekstase), CH-Save **v3**.
- Juice-Paket: Popup-Pool/Batching (B7), Krit-/On-Beat-Optik, Screen-Shake-Tiers,
  Combo-Partikel, Haptik-Toggle, Ability-Bar, `MusicPlayer.setIntensity`,
  Crew-Meilenstein-Fortschrittsbalken (§4.3.2), Mobile-Bottom-Sheet (B13a).
- HUD-Drossel: Update nur bei Wertänderung bzw. 0,25-s-Tick (Rest von B7).
- **Akzeptanzkriterien:**
  1. Combo zerfällt gestuft (1,5 s Pause ⇒ −20 %/s, kein Reset auf 0; Test).
  2. Tier-Perks wirken (Tier 2 ⇒ +3 % Krit-Chance, deterministisch per Seed getestet).
  3. Ekstase: +1/Klick, +2 on-beat, ×10 für 12 s; Zustand überlebt Reload (v3-Test).
  4. On-Beat-Fenster ±100 ms gegen BeatTracker-Onsets getestet (pure Phase-Injektion).
  5. 12-cps-Stresstest 60 fps; Popup-Nodes ≤ 24 (gemessen, TESTPLAN).
  6. Bottom-Sheet: Figur + Rivale sichtbar beim Shoppen (Screenshot).

### M9 — Endless-Skalierung (Anti-Plateau, gegen N1)

- **Seelen-Retune:** `RS_v2 = ⌊z^1.6/40⌋ + ⌊1.10^z − 1⌋` (§4.5.1) — der Bank-Guard macht’s
  migrationsfrei.
- **Crew-Ausbau:** +5 Tiers (Daten, §4.3.3), endlose Meilensteine (1600, 3200, …).
- **Vergoldungen** (`game/gild.ts`, CH-Save **v4**): 1 pro Erst-Clear jeder 10er-Bühne,
  ×1,25 auf zufälliges Mitglied (RNG-seeded), Umhängen für 5 RS.
- **Farm-/Travel-UI** (G10) über `travelTo`.
- **`simulateEndless` v1** als CI-Gate: E1, E2, E4 + Pacing-Tabelle.
- **Akzeptanzkriterien:**
  1. `RS_v2` Property-Test (§4.5-AC 1); Bestands-Bank schrumpft nie.
  2. Meilenstein-Formel: `milestoneMult(1600) = 2⁸` etc. (Tests); `maxAffordable` bleibt
     exakt für neue Tiers (Property gegen iterative Summe).
  3. Vergoldung deterministisch (Seed ⇒ gleiches Ziel-Mitglied), überlebt Aszension (v4-Test).
  4. Sim: 45-min-Run-Kette erreicht in ≤ 6 Runs Bühne ≥ 75 und Bank ≥ 500 RS (Baseline
     §4.8 Messung 3, ±25 %); E1/E2/E4 grün.
  5. Travel-Clamp 1..maxZone (Test); UI zeigt Farm-Bühne im HUD.

### M10 — Ahnen & Ruhmes-Himmelfahrt (Schicht 2)

- `game/ancients.ts` (10 Ahnen, Daten; Kauf-Guard mit Caps) + 🌀-Ahnen-Tab.
- `game/heaven.ts`: HPF-Formel, Himmelfahrts-Reset, Seelen-Verstärker
  (`SOUL_BONUS_eff = 0.10 + 0.002·HPF`), Himmelsbaum-Grundknoten (Coaches, Nachtschicht,
  Frühstarter, Ekstase-Ausdauer). CH-Save **v5**.
- Offline final: Coach-Anteil in `offlineGold` (Rest von B11).
- **Akzeptanzkriterien:**
  1. Ahnen-Kauf senkt `soulMult`, erhöht Perk (Bilanz-Test); Caps enforced.
  2. Himmelfahrts-Reset-Scope exakt (RS/Ahnen fallen; Vergoldungen/Gear-Ansprüche bleiben —
     Snapshot-Test).
  3. HPF-Vorschau im Dialog; `HPF(1000) = 1`, `HPF(1e6) = 31` (Tests).
  4. Sim: E3 grün (Zeit bis +50 % Macht ≤ 90 min über 20 Aszensionen); erste Himmelfahrt
     im 5–9-h-Fenster (±25 %).
  5. Coach klickt 1 cps × 25 % Klickwert idle + offline (Tests mit injizierter Clock).

### M11 — Skins als Gear

- `SkinConfig`-Erweiterung + 5 neue Skins (prozedural), `game/gear.ts`, Set-Boni,
  Level/Sterne + 🧩/🍬-Ökonomie (§5); Kulissen-Wahl zurück (Auto-Rotation bleibt Default).
  CH-Save **v6**; Erbe-Vormerkung Tyrann-Skin wird eingelöst.
- **Akzeptanzkriterien:**
  1. `gearBonus` pure; Skin-Wechsel wirkt sofort auf `effectiveClick` (Test).
  2. ≥ 2 Set-Boni per Test; 🍬 reift 1×/24 h, Uhr-Rückstellung ⇒ Klemmen statt Negativ-Timer.
  3. Erbe: `bossDefeated`-Altsave ⇒ Tyrann verfügbar (Test).
  4. Jede Skin-Karte zeigt Rarität/Buff/Level/Kosten.
  5. E4 bleibt mit Best-in-Slot-Idle-Gear erfüllt (Sim-Messpunkt).

### M12 — Pfirsich-Truhen & Loot

- `game/chests.ts` (Tiers, Tabellen, Pity, Luck), 🔑-Ökonomie, 🎁-Tab + Öffnungs-Animation,
  Drop-Hooks an `HitResult`/Combo/Session; **Goldener Pfirsich kehrt zurück** (Event +
  🔑-Chance; Spawn-Clamp bei Resize + Despawn bei offenem Sheet — B13c). CH-Save **v7**.
- **Akzeptanzkriterien:**
  1. `openChest` deterministisch + Verteilungstest (10 k Ziehungen, χ²).
  2. Pity-Grenzfall exakt; Luck-Umgewichtung getestet.
  3. Loot-Tabellen im UI einsehbar; Animation skippbar.
  4. Pfirsich despawnt bei Vollbild-Sheet; Position bei Resize geklemmt (Tests/Smoke).
  5. Kein Echtgeld-/Netzwerk-Pfad (Review-Checkliste).

### M13 — Meta, Retention & Leaderboard v2

- `game/quests.ts` (Daily/Streak/3 Quest-Slots, datums-seeded, Reroll), CH-natives
  Achievement-Set, 📊-Statistik-Tab. CH-Save **v8**.
- Leaderboard v2: Worker `scores_v2` (Upsert) + Client-Wiring (`lifetimeMaxZone`),
  fail-silent wie M5; Alt-Tabelle laut §11-Entscheid.
- **Akzeptanzkriterien:**
  1. Quests deterministisch aus Datum; Reroll 1×/Tag; Uhr-Manipulation neutral (Tests).
  2. Streak-Schutz-Logik getestet.
  3. Worker: Upsert ersetzt nur bei größerer Zone; Rate-Limit greift (Fake-Tests).
  4. Spiel voll spielbar ohne API; Submit-Prompt nur bei neuer Bestzone.
  5. Statistik lifetime vs. run korrekt über Aszensionen/Himmelfahrten (Test).

### M14 — Endless-QA, Transzendenz-Gerüst & Release 2.0

- `simulateEndless` voll ausgebaut (E1–E4 + Float-Guard, alle Systeme im Bot), CI-Pflicht.
- Transzendenz-Gerüst hinter Feature-Flag (Formeln + Tests, UI aus — §11-Entscheid).
- Performance-Pass (12-cps-Stress, Partikel-Messung, Lighthouse ≥ 85), TESTPLAN v2
  (CH-Loop-Matrix: Bühnen, Bosse, Aszension, Himmelfahrt, Truhen, Mobile-Sheet),
  itch-/Pages-Release. Legacy-Aufräum-Commit laut N4-Entscheid.
- **Akzeptanzkriterien:**
  1. CI enthält die komplette `simulateEndless`-Suite; E1–E4 grün.
  2. Bundle < 5 MB dokumentiert; 60-fps-Referenzlauf dokumentiert.
  3. Dokumentierter Playthrough: frischer Save → 3 Aszensionen → 1 Himmelfahrt.
  4. Float-Guard grün bis Bühne 300 (HP ~1e58).
  5. `README`/`DECISIONS`/`TESTPLAN` konsistent (kein B16-Rückfall).

---

## §11 Offene Fragen & Risiken (Entscheidungen für den Menschen)

1. **Krit-Baseline 20 %/×5:** aus dem WIP-Glue übernommen und in die Messungen eingebacken.
   Alternative (seltener/dicker: 10 %/×10, ähnlicher EV) wäre ein reiner Datentweak.
   → Gefühlstest in M8, Entscheidung dokumentieren.
2. **Erbe-Großzügigkeit:** 7 RS pro Legacy-Rebirth ist gesetzt, aber verhandelbar (3 = streng,
   `RS_v2(10·rebirths)` = sehr großzügig). → vor M7 bestätigen.
3. **RS_v2-Wachstum (1,10^z):** macht Seelenzahlen ab Bühne ~150 sehr groß (1,6 M bei z 150) —
   gewollt (Zahlen-Rausch ist Genre-Charme, `fmt` kann es), aber die Ahnen-Kostenkurve
   (`lv + 1` RS) braucht dann ggf. eine zweite, steilere Stufe. → Tuning-Review in M10.
4. **Alte Boss-Zeit-Tabelle** (D1 `scores`): archivieren (read-only „Klassik"-Tab) oder
   löschen? → vor M13.
5. **Transzendenz-Umfang:** bewusst dünn (Flag). Wer M14 erreicht, könnte auf ein Gerüst
   treffen — akzeptiert, solange das Flag aus bleibt, bis das Tuning steht. → M14-Review.
6. **Float-Grenze:** Sollte Transzendenz-Tuning Werte > 1e60 pro Run erfordern, wird
   `break_infinity` (+~25 KB, große Regression) ein eigener Milestone; der Sim-Guard ist das
   Frühwarnsystem. → akzeptiertes Restrisiko.
7. **Legacy-Code-Entfernung (N4):** Archiv-Zustand ist gewollt redundant; Entfernen erst nach
   verschifftem Erbe-Import. Zeitpunkt (M8? M14?) → Geschmacksfrage, Default: M14.
8. **Kulissen-Auto-Rotation vs. Wahl:** die MVP-Auto-Rotation ist charmant (Bühnenwechsel als
   Belohnung); M11 macht sie zum Default mit Opt-out. → bestätigen.
9. **Scope-Risiko M11/M12** (Gear + Loot sind die dicksten Brocken): beide liegen bewusst
   _nach_ dem endlosen, klick-zentrierten Kern (M7–M10) — bei Zeitdruck ist das Spiel ab M10
   bereits „endlos + geil klickbar" shippable. → bestätigen, dass M11–M13 einzeln
   verschiebbar sind.
10. **Saison-Events rein datumsbasiert** (kein Server): Zeitzonen-Kanten und
    „Datum-zurückstellen"-Cheese akzeptiert (Single-Player-Spaß > Wasserdichtheit). → bestätigen.

---

_Ende der Spec. Der MVP ist committet & verifiziert — **nächster Schritt für Agents: M7
(Härtung)**, dann strikt der Reihe nach weiter (§0.3-Index). Jede nicht-offensichtliche
Entscheidung in `DECISIONS.md` loggen; ab M9 ersetzt `simulateEndless` den alten
`simulatePlaythrough` als Balancing-Gate._
