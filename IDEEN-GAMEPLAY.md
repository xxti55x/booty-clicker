# IDEEN — Gameplay-Erweiterungen (Progression · permanente Skilltrees · Reforging · Upgrade-Avatare)

Ideen-Sammlung, KEINE beschlossene Roadmap: vier Themenfelder, jedes im
Ist-Stand verankert, mit Anknüpfpunkten an echte Systeme, Balance-Leitplanken
und offenen Fragen. Aufwand: **S** ≈ ½ Tag · **M** ≈ 1–2 Tage · **L** ≈ 3+ Tage.

## Was heute schon permanent ist (damit nichts doppelt erfunden wird)

| Schicht                                             | Überlebt                            | Stirbt bei                   |
| --------------------------------------------------- | ----------------------------------- | ---------------------------- |
| Vergoldungen, Perm-Tokens, Truhen-Skins, Gear/Skins | Aszension + Himmelfahrt             | Transzendenz: NEIN — bleiben |
| Himmelsbaum (18 Knoten, 3 Doktrinen)                | Aszension                           | Transzendenz (wipet L1+L2)   |
| Mythos-Shop (4 Knoten, TE)                          | ALLES — auch weitere Transzendenzen | —                            |
| Bühnen-Sterne (P1)                                  | alle drei Schichten                 | —                            |

Die Lücke ist sichtbar: Zwischen „bleibt für immer" (Mythos, Sterne) und
„Build pro Ära" (Himmelsbaum) fehlt eine **verdiente, unverlierbare
Charakter-Progression** — genau da setzen die Ideen an.

---

## 1 · Mehr Progression

### 1a · Crew-Meisterschaft (per-Mitglied, permanent) · M

Jedes der 15 Crew-Mitglieder sammelt **Einsatz-XP** (Lebenszeit-Level, die je
in dieses Mitglied gekauft wurden — der Zähler existiert implizit über die
Käufe und müsste nur als Highwater persistiert werden). Schwellen ⇒
Meisterschafts-Ränge (Bronze/Silber/Gold/Legende), je Rang ein KLEINER
permanenter Perk aufs Mitglied (+2 % Eigen-DPS je Rang, Rang 4: die erste
Fähigkeits-Stufe ist nach jedem Reset gratis). Warum: Die Crew ist heute
austauschbare Mathematik — Meisterschaft macht aus „DJ Wumms" einen alten
Weggefährten. Anknüpfung: `heroes.ts`-Kurven, `stageStars`-Muster fürs
Persistieren, Rang-Abzeichen auf der Crew-Card (→ Avatar-System, Feld 4).
**Leitplanke**: Perks additiv-klein (≤ +8 % gesamt pro Mitglied), sonst frisst
die Permanenz die v12-Verlangsamung.

### 1b · Gebietsherrschaft pro Theme · M

Vier permanente Ruf-Leisten (Club/Synth/Beach/Space), gefüllt durch Kills und
Boss-Siege im jeweiligen Theme (die Theme-Zuordnung existiert: `bgForZone`).
Ruf-Stufen schalten THEME-GEBUNDENE Boni frei („Club-Legende: +5 % BP auf
Club-Bühnen") plus je eine kosmetische Insel-Trophäe (Pokal am Inselrand —
G3-Ambient-Slot wiederverwenden). Warum: Rückreisen (travelTo) und die
A1-Farm-Wahl bekommen eine zweite Entscheidungs-Ebene: WO man farmt, zählt.
**Leitplanke**: Boni nur auf dem eigenen Theme (kein Global-Creep), Kurve
logarithmisch (Ruf-Stufe 10 braucht Wochen).

### 1c · Relikte aus tiefen Bossen · L

Ab Bühne 50 droppen Frontier-Bosse selten (Pity-geschützt, `chests.ts`-Muster)
**Relikte**: sammelbare Items mit 1–2 gerollten Affixen aus einem Pool
(Klick %, Boss-Schaden, Combo-Fenster, Offline-Rate …), drei Trage-Slots.
Relikte sind die Brücke zum Reforging (Feld 3) und der Endgame-Loot, den die
Truhen-Ökonomie oberhalb von Mythic heute nicht hat. **Leitplanke**: Affix-Pool
klein (8–10), Werte gedeckelt, Sim MUSS Relikte falten (E-Anker!).

### 1d · Legenden-Level (Endless-Meta nach der ersten Transzendenz) · S

Nach Transzendenz 1: jede weitere Himmelfahrt gibt 1 **Legenden-Level** —
unendlich, je +0.5 % global, rein additiv, nie gewipet. Warum: Nach dem
Mythos-Board (6 TE) ist die vierte Schicht heute „nur noch ×3^TE" — ein
Zähler, der IMMER tickt, gibt Ultra-Langzeitspielern eine sichtbare Zahl.
**Leitplanke**: additiv statt multiplikativ, damit der Float-Guard (z300) und
die Anker unberührt bleiben.

---

## 2 · Permanente Skilltrees

### 2a · Die Legenden-Konstellation (der „bleibt für immer"-Baum) · L

Ein Sternbild-Baum, den **keine der drei Prestige-Schichten wipet** —
Gegenstück zum Himmelsbaum (der pro Transzendenz-Ära lebt). Währung:
**Sternenstaub**, verdient NUR aus unverlierbaren Quellen: Bühnen-Sterne-
Meilensteine (P1), Achievements, Erst-Kills tiefer Bosse, Saison-Abschlüsse.
Form: 3 Konstellationen à ~8 Knoten (Start / Tempo / Ausdauer), Knoten klein
(+1–2 %), aber am Ende jeder Konstellation EIN Identitäts-Knoten („Beginne
jede Tour mit dem Kobold-Buff aktiv", „Boss-Timer-Fails erstatten 25 % der
Rivalen-Welle"). Warum permanent UND gedeckelt funktioniert: Die Währung ist
endlich (Sterne/Achievements sind endlich), der Baum hat einen Boden — kein
Infinite-Creep, sondern ein Lebenswerk mit Abschluss. **Leitplanke**: Gesamt-
Budget des vollen Baums ≤ ×1.5 global; Sim bekommt den Voll-Ausbau als
eigenen Anker-Lauf („Konstellation komplett" als neues Bot-Profil).

### 2b · Skin-Meisterschafts-Pfade (pro Playermodel) · M

Jeder der 10 Skins bekommt einen 5-Knoten-Mini-Pfad (permanent), gefüllt
durch **Tragezeit + Boss-Kills im Skin**: Knoten 1–4 kleine skin-typische
Boni (Klassiker: Klick; Robo: Coach-cps; Pirat: Gold …— an `star.stat`
anlehnen), Knoten 5 ein **kosmetischer Signature-Move** (der Skin bekommt
einen eigenen Sieges-Move aus dem A4-Set — Choreo existiert). Warum: Skins
sind heute Gear-Mathematik plus Optik; Meisterschaft belohnt Treue zum
Lieblings-Charakter statt Min-Maxing. Anknüpfung: `gear.skinLevels`-Muster,
A4-`useSet`.

---

## 3 · Reforging der Charaktere

### 3a · Skin-Schmiede (Reforging der Playermodels) · L

Jeder Skin erhält 1–3 **Schmiede-Slots** (freigeschaltet über Skin-Level
10/25/40). Ein Slot trägt ein gerolltes Affix (Pool wie Relikte, Feld 1c,
plus skin-exklusive: Disco „Sequin-Crit", Lava „Glut-DoT auf Boss").
**Reforge** = Affix neu rollen gegen **Schmiede-Glut**; Glut entsteht durch
das **Einschmelzen doppelter Truhen-Skins** (heute wertlose Duplikate — die
Jackpot-Truhen-Skins bekommen damit eine Ökonomie) und überschüssiger
Splitter. UX-Regeln gegen Frust: neuer Roll wird ANGEBOTEN (behalten/verwerfen
— nie blind überschreiben), Qualitäts-Pity (nach 5 Rolls ohne Verbesserung
steigt die Mindest-Qualität), Affix-Lock gegen erhöhte Kosten. **Leitplanke**:
Affixe multiplikativ NUR innerhalb des Skins, global gedeckelt; Sim faltet die
Best-Case-Schmiede in die Gear-E4-Läufe.

### 3b · Crew-Umschulung (Reforging der Spezial-Fähigkeiten) · M

Die v11-Spezial-Stufen (gold/crit/critdmg/boss/combo/beat/ekstase/idle) sind
pro Mitglied FIX verdrahtet (`TIER_PATTERNS`). Umschulung: gegen Splitter +
Abklingzeit darf EIN Spezial-Slot eines Mitglieds auf eine andere Sorte
gerollt werden (Angebot aus 2 zufälligen Alternativen — Wahl, kein Blind-
Roll). Warum: Build-Craft auf der Crew-Ebene, ohne neue Mitglieder zu
erfinden; die Wand-Telemetrie (P3) kann sogar empfehlen, WOHIN sich
Umschulen lohnt. **Leitplanke**: Rhythmus-Muster (2P+2S je Zyklus) bleibt —
nur die SORTE des S rollt; Sim behandelt umgeschulte Slots wie gekaufte
(bestehende `crewSpecialBonuses`-Faltung trägt das ohne Umbau).

### 3c · Prestige-Reforge: der Erben-Moment · S (Konzept-Ergänzung)

Beim Transzendieren darf EIN Crew-Mitglied als „Erbe" markiert werden: es
behält seine Meisterschafts-Ränge (1a) doppelt gewichtet in der neuen Ära.
Macht die Transzendenz-Zeremonie (G4) zu einer Charakter-Entscheidung statt
nur einem Reset — und kostet nichts an Balance (Meisterschaft ist ohnehin
permanent; nur die Gewichtung wandert).

---

## 4 · Avatare für JEDES kaufbare Upgrade

Heute sind Crew-Cards und ihre Fähigkeits-Slots reine Text-Zeilen — 15
Mitglieder × Level-Reihen × Fähigkeits-Stufen, alles gesichtslos. Ziel: **jede
kaufbare Zeile zeigt ein Gesicht, das zum Charakter passt.**

### 4a · Prozeduraler Portrait-Baukasten (die Basis) · M

Ein `ui/avatars.ts`-Generator zeichnet pro Crew-Mitglied ein 48-px-SVG-
Portrait in der bestehenden Stroke-Icon-Sprache (KEINE Emojis, keine
Bild-Assets — bleibt im Bundle-Budget): Kopfform + Frisur + EIN Signatur-
Accessoire + Mitglieds-Palette, deterministisch aus der Mitglieds-Id.
Signaturen: Booty-Boss Krone schief · Hype-Girl Pompons · DJ Wumms
Kopfhörer · Türsteher Sonnenbrille · Insta-Influencerin Handy · Star-
Choreograph Klemmbrett · Musik-Produzent Mischpult-Fader · A-Promi
Sternbrille · Club-Tycoon Zigarre/Anzugkragen · Twerk-Legende Lorbeer ·
Viral-Bot Antenne · Hologramm Scanlines · KI-Cluster Chip · Orbital-Station
Solarpanel · Kosmische Entität Sternennebel. Die 10 Playermodel-Skins
brauchen KEINEN Baukasten — für sie existieren echte Renders
(`models/renders/character-*.jpg`), die der Gear-Tab als Avatar nutzt.

### 4b · Avatar auf jeder Kauf-Zeile · M (nach 4a)

- **Crew-Card**: Portrait links, Level-Kauf-Reihe daneben — das Portrait
  bekommt je Meisterschafts-Rang (1a) einen Rahmen (Bronze→Legende).
- **Fähigkeits-Slots** (die + Kauf-Kacheln): dasselbe Portrait, klein, mit
  der Sorten-Ikone (gold/crit/boss …) als Overlay-Badge unten rechts und
  einem Tier-Rahmen — man sieht auf einen Blick WER und WAS. Power-Stufen
  tragen das Portrait mit Muskel-Pose-Variante (zweite Baukasten-Pose),
  Spezial-Stufen mit dem Sorten-Accessoire (Gold-Kette, Crit-Blitz …).
- **Himmelsbaum/Mythos/Ahnen**: Ahnen sind benannte Charaktere (Twerkules!)
  und bekommen denselben Baukasten; Baum-Knoten behalten ihre Ast-Ikonen
  (Knoten sind Konzepte, keine Personen — bewusste Grenze).
- **Umschulung/Schmiede (Feld 3)**: der Reforge-Dialog zeigt das Portrait
  groß — der Charakter, an dem gerade geschmiedet wird, IST die Szene.

**Leitplanken**: SVGs gecacht (ein `<symbol>`-Sprite, keine per-Zeile-
Duplikate — die Crew-Liste rebuildet im 0.25-s-Tick!), Portrait-Knoten vom
Delegations-Klickpfad ausgenommen (die Ability-Kauf-Bugfix-Lektion), Headless-
Screenshot-Serie aller 15 Portraits als Abnahme.

---

## Empfohlene Erkundungs-Reihenfolge (falls daraus Pakete werden)

| Schritt | Idee                       | Warum zuerst                                                  |
| ------- | -------------------------- | ------------------------------------------------------------- |
| 1       | 4a + 4b Avatare            | Reine Präsentation, null Balance-Risiko, sofort spürbar.      |
| 2       | 1a Crew-Meisterschaft      | Kleinster permanenter Layer, füttert die Avatar-Rahmen.       |
| 3       | 3b Umschulung              | Baut nur auf Bestehendem (Specials, Splitter, P3-Telemetrie). |
| 4       | 2a Konstellation           | Der große permanente Baum — braucht die Sternenstaub-Quellen. |
| 5       | 1b Gebietsherrschaft       | Zweite Entscheidungs-Ebene fürs Farmen.                       |
| 6       | 1c + 3a Relikte & Schmiede | Zusammen EIN Loot-Paket (geteilter Affix-Pool).               |
| 7       | 2b + 3c + 1d               | Feinschliff-Permanenz, wenn der Rest steht.                   |

## Guardrails (gelten für jede Umsetzung)

- **Permanenz ist gedeckelt oder additiv**: endliche Währungen (Sterne,
  Achievements) für endliche Bäume; unendliche Zähler (1d) nur additiv-klein.
- **Sim zuerst**: jeder neue Machtterm wird im Bot gefaltet ODER als
  dokumentierte Untergrenze begründet; `npm run balance` vor/nach.
- **Kein Blind-RNG beim Reforging**: immer Angebot + Behalten-Wahl + Pity.
- **Save-Disziplin**: jedes neue Feld → Schema-Bump + X7-Matrix-Fixture-Paar.
- **Avatare bleiben in der Stroke-Sprache** und im Bundle-Budget (< 1.5 MB).
