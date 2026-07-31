# ROADMAP V2 — Anreifen: Progression · Grafik · Abwechslung · Unfinished Business

> **Status: ✅ komplett umgesetzt** (alle 18 Pakete; Umsetzung Opus-Agenten,
> Review Fable, Verlauf in DECISIONS.md). Bekannte Rest-Punkte: der tote
> Bloom-Pfad bleibt aus (Known Issue, eigenes Paket) und das Mobil-Preset
> wählt sich nicht selbst (Restschuld aus X6).

Nachfolger von `ROADMAP.md` (dessen Phasen T + L sind umgesetzt; die offenen
Phasen U + F gehen hier in Säule G und Säule X auf). Vier Säulen, jede mit
Ist-Stand-Anker, konkreten Paketen und einer Messlatte (DoD). Aufwand:
**S** ≈ ½ Tag · **M** ≈ 1–2 Tage · **L** ≈ 3+ Tage.

## Ist-Stand (worauf V2 aufsetzt)

- **Loop**: Zonen/Boss-Gates alle 5 Bühnen, Boss-Timeout wirft auf die
  Vor-Bühne zurück, „Boss herausfordern"-Button an der Frontier, Zonen-Strip
  klickbar (nur erreichte Bühnen, Frontier immer erreichbar).
- **Prestige**: Aszension (Ruhm-Seelen → Ahnen) → Himmelfahrt (HPF →
  Himmelsbaum) → Transzendenz (TE) — alle drei live; erste Himmelfahrt nach
  v12 ≈ 15 h (bewusst Multi-Session).
- **Economy**: Truhen/Schlüssel/Perm-Tokens/Splitter→Skins, Goldener
  Pfirsich, Offline-Verdienst (Cap/Rate über Boni ausbaubar), Quests +
  Achievements, Leaderboard-v2-API (Hono + D1).
- **Präsentation**: 4 Themen-Inseln mit eigenen Licht-Rigs, prozedurale
  512²-Texturen + Relief, Bloom (high), Cartoon-Real-Rigs (Hände/Füße/Haare),
  8 Choreo-Moves + Klick-Akzente + Cheek-Physik, 15 Crew-Mitglieder mit
  Fähigkeits-Rhythmen, 10 Skins als Gear.
- **Guardrails**: 515 Tests inkl. Sim-Anker (E2/E3/E4, Himmelfahrts-Fenster,
  Float-Guard z300), Headless-Screenshot-Ritual, models/-Kette mit
  Coverage-Gate, Budgets (Bundle < 5 MB, aktuell ~733 KB).

---

## Säule P — Progression anreifen

Der Kern dreht: langsam, mit echten Wänden und drei Prestige-Schichten. Was
fehlt, ist **Griffigkeit** — sichtbare Nahziele zwischen den Wänden und
Entscheidungen, die sich wie Spielzüge anfühlen statt wie Warten.

### P1 · Bühnen-Sterne (Nahziele im Kern-Loop) · M · ✅

Jede Bühne trägt bis zu 3 ⭐: (1) geclert, (2) Boss ohne Timeout,
(3) Boss mit ≥ x3-Combo besiegt. Sterne sind rein kosmetisch-sammelnd
(Zonen-Strip zeigt sie als Mini-Pips) plus EIN kleiner Sammel-Meilenstein
alle 15 Sterne (Truhe). Warum: Rückreisen + Boss-Retry (gerade gebaut)
bekommen ein Ziel jenseits von „farmen müssen".
**DoD**: Sterne persistieren im Save (v-Bump + Migration + Tests), Strip
zeigt sie, Meilenstein-Toast feuert, Sim unbeeinflusst (kosmetisch).

### P2 · Transzendenz-Teaser + TE-Sink · M · ✅

Der 🔮-Tab erscheint erst mit der ersten Himmelfahrt (~15 h) — korrekt fürs
Pacing, aber die dritte Schicht ist bis dahin UNSICHTBARES Versprechen.
(a) Ab der ersten **Aszension** ein gesperrter Teaser-Eintrag im Himmel-Tab
(„🔮 ??? — erreiche die erste Himmelfahrt"); (b) TE braucht neben dem
Global-Mult einen **Shop mit 3–4 Wahl-Knoten** (z. B. „Start mit Crew-Lv 5",
„Bosse −10 % HP", „Offline-Cap ×2") — Transzendieren wird Entscheidung, nicht
nur Zahl.
**DoD**: Teaser sichtbar ab Aszension 1 (Headless-Beweis mit präpariertem
Save), TE-Shop mit Kosten-Kurve + Tests, Sim-Anker nachgezogen falls nötig.

### P3 · Wand-Telemetrie im Spiel (Ehrlichkeit statt Frust) · S · ✅

An der Frontier-Boss-Bühne zeigt die Boss-Card eine ehrliche Schätzung:
„Dein Burst: ~X · Boss-Ausdauer: Y" + Tipp, welcher Kauf die Lücke am
schnellsten schließt (bestes ROI aus der existierenden Greedy-Logik der Sim,
als Hint wiederverwendet). Warum: Der neue Fallback-Loop sagt WOHIN, aber
nicht WARUM man verlor.
**DoD**: Hint erscheint nur bei erkennbarer Lücke (> 20 %), verschwindet im
Kampf, ein Unit-Test auf die Empfehlungslogik.

### P4 · Himmelsbaum-Ausbau (Schicht 2 vertiefen) · L · ✅

Der Himmelsbaum ist der dünnste Prestige-Layer: wenige Knoten, kaum
Verzweigung. Ausbau auf 3 Äste (Ökonomie / Kampf / Ritual) mit je 4–5
Knoten, davon 2 Build-definierende Exklusiv-Wahlen pro Ast (Respec gegen
HPF). Warum: Zwischen erster Himmelfahrt (15 h) und Transzendenz (100 HPF)
liegt die längste Strecke des Spiels — sie braucht Entscheidungs-Dichte.
**DoD**: Baum-UI mit Ast-Layout, Exklusiv-Logik + Respec getestet,
E-Sim-Anker (Himmelfahrts-Kadenz) bleibt im Fenster oder wird begründet
re-ankert.

### P5 · Balance-Ritual formalisieren · S · ✅

Die Sim-Anker sind Gold wert, aber verstreut. Ein `npm run balance`-Skript
druckt die Kennlinien (t10/t25/t75, erste Himmelfahrt, längste Durststrecke,
Wand-Zonen pro Seed) als Tabelle — Pflichtlauf vor jedem Balance-Commit,
Output-Snapshot in DECISIONS.md.
**DoD**: Skript existiert, läuft < 60 s, Werte matchen die Test-Anker.

---

## Säule G — Grafik-Updates

Phase T/L (Texturen, Licht, Bloom) sind durch — die Lücke ist jetzt
**Bewegung und Momente**: alles steht noch hart im Raum, Übergänge sind Cuts.
(Absorbiert Phase F der alten Roadmap.)

### G1 · Bühnen-Wechsel als Moment · M · ✅

Beim Theme-Wechsel (nach Boss ODER Rückreise über eine Theme-Grenze) fährt
die alte Insel nach unten aus, die neue schwebt ein (~1.2 s, Kamera ruhig).
`World.setBackground` bekommt eine Ein-/Ausfahr-Animation der `islandGroup`
(translate + leichter Tilt, Cubic-Ease), währenddessen Klicks gepuffert.
**DoD**: Headless-Frame-Serie des Übergangs (6 Frames) ohne Hard-Cut;
Rückreise-Übergang ebenso; low-Preset überspringt die Animation.

### G2 · Boss-Auftritt + Sieg-Beat · M · ✅

Boss-Spawn: 0.8 s Licht-Dim auf den Rivalen, Kamera-Punch-In, Namens-Banner
rollt ein (CSS), Bass-Drop-Stinger. Boss-Kill: Konfetti-Burst + Fanfare +
das existierende Truhen-Toast als „Loot-Karte" mit Icon-Stagger. Zonen-Clear
(25/25): Mini-Fanfare. Warum: Der wichtigste Kampf des Loops sieht heute aus
wie jeder Rivalen-Wechsel.
**DoD**: 30-s-Screencast Boss-Ankunft → Kill → Theme-Wechsel liest sich wie
ein fertiges Spiel; Effekte hängen am Quality-Preset.

### G3 · Idle-Leben pro Theme · S · ✅

3–4 extrem billige Ambient-Sprites je Theme auf Kurven: Club Glühwürmchen/
Konfetti-Drift (existiert teils), Synth Sternschnuppen, Beach Möwen +
Wellen-Schaum-Puls am Inselrand, Space Kometen. Publikum-Silhouetten am
Inselrand, die zum Beat wippen (Instanced Quads, ein Material).
**DoD**: Draw-Calls pro Bühne bleiben < 250; Screenshot je Theme zeigt
Leben; low-Preset halbiert die Dichte.

### G4 · Prestige-Zeremonien · M · ✅

Aszension/Himmelfahrt/Transzendenz sind heute ein Klick + Toast — für
Aktionen, die Stunden Fortschritt wipen, viel zu beiläufig. Vollbild-Blende
(1.5–2 s): Seelen-/Pfirsich-/Essenz-Regen, Zahlen-Aufzähler („+N 👻"),
danach der frische Run mit kurzem „Neustart"-Sweep über die Insel.
**DoD**: je Schicht eine unterscheidbare Zeremonie, abbrechbar (Skip-Tap),
Headless-Screenshot je Zeremonie-Peak.

### G5 · Gesichter leben · S · ✅

Die Cartoon-Real-Gesichter sind statisch. Billige Wins im bestehenden Rig:
Blinzeln (Lid-Scale-Keyframe alle 3–6 s), Pupillen tracken den Rivalen
(±0.02 Offset), Mund-Zustand bei Ekstase (O-Mund-Torus-Swap) und Boss-Fail
(Grimasse). Alles reine Mesh-Sichtbarkeit/Scale unter dem head-Bone —
Physik-Kontrakt unberührt.
**DoD**: Nahaufnahme-Screenshots der 4 Zustände; kein neuer Bone, Export-
Kette läuft unverändert durch.

### G6 · UI-Zahlen-Leben (Alt-Phase U, gezielt) · M · ✅

Das Wichtigste aus der alten Phase U, nicht alles: BP-Zähler tweent, Käufe
lösen Coin-Fly zum Zähler aus, Ability-Kauf feiert im Slot (Mini-Konfetti),
Tab-Wechsel mit 120-ms-Fade. Leere Zustände der Tabs (Ahnen vor Aszension
etc.) bekommen je eine Illustration + einen Satz.
**DoD**: Klick-durch-alle-Tabs-Serie ohne „toten" Screen; jede Kauf-Aktion
hat sicht- und hörbares Feedback.

---

## Säule A — Abwechslung beim Gameplay

Der Loop ist solide, aber jede Bühne spielt sich identisch. Abwechslung
heißt: **Regeln, die pro Bühne/Kampf variieren** — klein genug, um die
Balance-Anker nicht zu sprengen.

### A1 · Bühnen-Modifikatoren · L · ✅

Ab Bühne 11 trägt jede Nicht-Boss-Bühne einen von ~8 seeded Modifikatoren,
im Strip + der Bühnen-Card sichtbar: „Goldrausch" (+50 % BP, −25 % Combo-
Fenster), „Zähe Menge" (+30 % HP, Rivale droppt Truhen-Chance ×2),
„Beat-Nacht" (On-Beat-Klicks ×1.5), „Nebel" (DPS −20 %, Klick +30 %) …
Rückreisen wird damit strategisch: Farm-Bühne nach Modifikator wählen.
**DoD**: Modifikator-Katalog als pures Modul + Tests; Sim versteht die
Modifikatoren (Anker nachgezogen und in DECISIONS begründet); Strip-Badge +
Card-Erklärung; seeded pro Run (Aszension remixt).

### A2 · Boss-Gimmicks pro Theme · L · ✅

Bosse unterscheiden sich nur in HP. Je Theme EIN Mechanik-Twist:
**Club** „Spotlight-Phasen" (2×5 s: nur Klicks zählen, DPS pausiert),
**Synth** „Schild-Takte" (immun außer im Beat-Fenster — nutzt die
existierende Beat-Logik), **Beach** „Wellen-Heilung" (heilt 5 %/10 s — DPS-
Check), **Space** „Gravitations-Combo" (Combo verfällt doppelt so schnell,
zählt aber ×1.5). Der „Boss herausfordern"-Loop bekommt damit Lese-Tiefe:
Man scheitert an einer MECHANIK und rüstet gezielt dagegen.
**DoD**: je Theme ein Gimmick, im Boss-Banner erklärt (ein Satz), pure
Logik + Tests, Sim-Bosse rechnen die Gimmicks (Anker-Lauf dokumentiert).

### A3 · Truhen-Kobold (aktives Event) · S · ✅

Alle ~4–7 min hoppelt ein Kobold mit Truhe über die Insel (8 s sichtbar);
5 schnelle Klicks fangen ihn → Truhe + kurzer Frenzy. Verpasst = weg.
Nutzt die Golden-Peach-Infrastruktur (Spawn-Kurve, Klick-Fang).
**DoD**: Fang-/Verpass-Pfad getestet, Spawn hängt an Sichtbarkeit (kein
Spawn im Hintergrund-Tab), Sim modelliert ihn als kleinen Faucet.

### A4 · Choreo-Set-Rotation · S · ✅

8 Moves existieren, aber die Auswahl ist energie-getrieben gleichförmig.
Pro Bühne ein „Set" aus 3 Moves (seeded), Boss-Kampf erzwingt die zwei
intensivsten; nach dem Sieg einmalig der Sieges-Move (Diva-Turn). Kostet
nichts (Moves existieren), macht Bühnen sichtbar unterschiedlich.
**DoD**: Set-Zuordnung deterministisch pro Bühne, Screenshot-Paare zweier
Bühnen zeigen unterschiedliche Move-Silhouetten.

### A5 · Wochen-Anker: „Bühne der Woche" · M (nach A1)

Ein seeded Wochen-Modifikator-Stack auf einer festen Bühnen-Nummer +
Leaderboard-Spalte (API v2 kann Boards) — „diese Woche: Bühne 40,
Goldrausch+Beat-Nacht". Retention-Anker ohne FOMO-Druck (rein kosmetische
Board-Platzierung).
**DoD**: Wochen-Seed serverlos deterministisch (ISO-Woche), Board-Eintrag
über die bestehende v2-API, UI-Karte im Ziele-Tab.

---

## Säule X — Unfinished Business

Ehrliche Restliste — Dinge, die angefangen, versprochen oder halb sind.

### X1 · Alt-Phase U/F-Reste · (in G1–G6 absorbiert) · ✅

Die offenen Punkte der alten Roadmap leben jetzt als G1 (Insel-Übergang),
G2 (Boss-Auftritt/Sieg-Beat), G3 (Idle-Leben), G6 (UI-Feedback + leere
Zustände + Konsistenz-Audit der Rest-Emojis). `ROADMAP.md` bekommt einen
Verweis hierher. **DoD**: alte Datei markiert, keine Doppel-Liste.

### X2 · Ekstase-Fenster komplettieren · S · ✅

CSS-Rand-Glow existiert, Musik-Layer existiert, Shimmy existiert — es fehlt
der Deck-Emissive-Puls und ein HUD-Countdown-Ring am Ekstase-Button.
**DoD**: Screenshot Ekstase an/aus; Puls hängt am Quality-Preset.

### X3 · Offline-Rückkehr-Moment · S · ✅

`offlineGold` zahlt aus, aber die Rückkehr ist ein stiller Kontostand.
Welcome-Back-Card: „Du warst X h weg · Crew hat Y BP erspielt · [Einsacken]"
mit Cap-Anzeige (und Hinweis auf den Cap-Ausbau im Himmelsbaum → P4).
**DoD**: Card erscheint ab > 10 min Abwesenheit, Zahlen matchen
`offlineGold` exakt (Test), Screenshot.

### X4 · Leaderboard-UI-Endausbau · M · ✅

API v2 (Saisons, mehrere Boards) ist fertiger als die UI: Im Spiel fehlt
Saison-Anzeige/-Countdown und der Board-Wechsler (Bestzone / wöchentlich →
A5). Plus Submit-Fehlerpfad sichtbar machen (heute stumm).
**DoD**: UI zeigt Saison + zwei Boards, Fehlerpfad mit Retry-Toast,
Worker-Tests grün.

### X5 · Audio-Lücken · M · ✅

Fehlt: Boss-Stinger (G2), Zeremonie-Klänge (G4), je Theme eine zweite
Instrumenten-Lage ab Ekstase, Kobold-Jingle (A3). Alles im bestehenden
WebAudio-Graph, keine Samples > 50 KB.
**DoD**: Audio-Smoke-Test (Mute-Toggle, keine Clipping-Warnung), Bundle
bleibt < 1.5 MB.

### X6 · Mobile-QA-Runde · M · ✅

Portrait-Kamera existiert, aber: Touch-Ziele im Strip (46 px ok, Gap-Slot
prüfen), Boss-Button unter dem Daumen, Bottom-Sheet-Federung (G6),
30-fps-Preset-Verifikation auf Mid-Range (SwiftShader-Proxy + echtes Gerät
falls verfügbar).
**DoD**: Headless-Portrait-Serie aller Kern-Flows (Klick, Kauf, Boss,
Prestige) ohne Layout-Bruch; fps-Messung im Log.

### X7 · Save-Hygiene vor neuen Feldern · S · ✅

P1 (Sterne), A1 (Modifikator-Seeds), P4 (Baum) bumpen das Schema. Vorher:
ein Migrations-Sammeltest, der JEDEN historischen Save-Stand (v5…v10)
durch die Kette zieht — existiert punktuell, wird auf eine Fixture-Matrix
gehoben.
**DoD**: `ch-store.test.ts`-Matrix über alle Versionen, ein kaputter Alt-
Save pro Version als Fixture.

---

## Reihenfolge (Empfehlung)

| Schritt | Paket        | Begründung                                                     |
| ------- | ------------ | -------------------------------------------------------------- |
| 1       | X7           | Fundament: alles Folgende schreibt ins Save.                   |
| 2       | G1 + G2      | Größter sichtbarer Sprung fürs Kern-Erlebnis (Boss + Wechsel). |
| 3       | P1 + P3      | Gibt dem neuen Rückreise/Retry-Loop sofort Ziele + Klarheit.   |
| 4       | X2 + X3 + G3 | Drei S-Pakete, runden Session-Anfang/-Mitte ab.                |
| 5       | A2           | Bosse tragen den Loop — Mechanik-Tiefe vor Breite.             |
| 6       | P2           | Transzendenz sichtbar machen, bevor A1 die Mitte streckt.      |
| 7       | A1 → A4 → A3 | Bühnen-Vielfalt, dann die kleinen Würzen.                      |
| 8       | G4 + G6 + X5 | Zeremonien + UI-Leben + Klang in einem Polish-Block.           |
| 9       | P4           | Der große Mittelspiel-Ausbau, wenn die Bühne dafür steht.      |
| 10      | A5 + X4      | Wochen-Loop + Board-UI zusammen (teilen sich die API).         |
| 11      | X6 + P5      | Abschluss-QA + Balance-Ritual als Dauerzustand.                |

## Guardrails (gelten für JEDES Paket)

- **Physik-Kontrakt unantastbar**: `stepPhysics`/`applyPose`/`renderCheeks`,
  Bone-Namen/-Pivots bleiben byte-gleich.
- **Sim zuerst**: Jede Regel-Änderung (P*, A*) läuft durch die Anker-Tests;
  Verschiebungen werden re-ankert UND in DECISIONS.md begründet — nie still.
- **Preset-Pflicht**: Jeder neue Effekt hängt an `engine/quality.ts`.
- **Beweis-Pflicht**: Headless-Screenshot/-Serie selbst ansehen; bei
  Modell-Änderungen die models/-Kette + Coverage-Gate.
- **Budgets**: Bundle < 1.5 MB (jetzt ~733 KB), Draw-Calls < 250/Bühne,
  Save-Migrationen verlustfrei, 60/30 fps (Desktop/Mobil-Preset).
