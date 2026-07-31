# DECISIONS.md

Log of non-obvious engineering decisions, newest first. Each milestone appends
here (spec §7).

## IDEEN-GAMEPLAY Schritt 6 — 1c Relikte + 3a Skin-Schmiede

- **EIN Pool, zwei Systeme — und das ist die ganze Architektur.** `affixes.ts`
  kennt weder Relikte noch Schmiede: Es ist reine Arithmetik über ein PAAR aus
  Sorte und Qualität (9 geteilte Sorten + 3 skin-exklusive, 4 Qualitätsstufen).
  `relics.ts` und `forge.ts` ziehen beide daraus, und beide laufen am Ende durch
  dieselbe eine Funktion `foldAffixes` in `ch-state.loadoutBonus`. Im Save steht
  nur `{ id, q }` — der WERT wird immer gerechnet (`affixValue`), nie
  gespeichert: Ein Katalog, der sich ändert, ändert damit rückwirkend jedes
  getragene Affix, statt Saves mit eingefrorenen Zahlen zu hinterlassen. Dasselbe
  Prinzip wie bei den Skin-Buffs (`perLevel · Level`).
- **Die Qualitäts-Spanne: ×0.4 / ×0.6 / ×0.8 / ×1.0 bei Gewichten 45/30/18/7.**
  Der Katalog-Wert IST damit der Höchstwert („Makellos" = volle Basis), ein
  Makellos-Roll ist 7 % wahrscheinlich und exakt 2,5-mal so stark wie ein
  Grob-Roll. Die Basen sind so gewählt, dass jede Stufe eine runde Zahl ergibt
  (0.04 ⇒ 1,6 / 2,4 / 3,2 / 4,0 %) — die UI muss nie „3,75 %" zeigen.
- **Der Deckel ist STRUKTURELL, nicht arithmetisch.** `AFFIX_STAT_CAP = +0.75`
  klemmt jeden Prozent-Term IM FOLD. Das ist kein Zierrat: Der Höchstfall aus
  neun Affixen liegt beim Boss-Term rechnerisch bei +105 % (6 × 10 % Relikt +
  3 × 15 % Glut-DoT) — die Zahlen allein hielten die Leitplanke also NICHT. Mit
  dem Deckel ist sie unabhängig vom Katalog wahr, und ein Test prüft das für
  JEDEN Prozent-Stat über 50 gestapelte Affixe.
- **Das Budget, erschöpfend gerechnet statt geschätzt.** Höchstfall sind neun
  Affixe (3 Relikt-Slots × bis zu 2 + 3 Schmiede-Slots). `affixPowerBudget()`
  probiert ALLE Aufteilungen der sechs Relikt-Plätze (nur geteilte Sorten) und
  der drei Schmiede-Plätze (auch exklusive) auf die sechs Produkt-Terme durch —
  462 × 56 = 25 872 Fälle in Millisekunden. Ein Greedy hätte hier nicht gereicht:
  Die Plätze sind ungleich (nur die Schmiede darf „Sequin-Crit" ziehen), und für
  ungleiche Einheiten ist Greedy nicht beweisbar optimal. Ergebnis, als Test
  eingefroren und in Abschnitt 11 gedruckt:
  · **Einzel-Term ×1.7500** (Richtwert ×2) — der Deckel greift.
  · **Leistungs-Produkt ×1.4298** (Richtwert ×1.5), Terme wie bei 2a:
  Klick × Crew-DPS × BP × Krit-EV × Truhen-Luck.
  · **Boss-Term ×1.7500, GETRENNT** (A2): Boss-Schaden läuft gegen die
  30-s-Gates, nicht gegen die Farm-Geschwindigkeit — ihn ins Produkt zu rechnen
  hieße, zwei Dinge zu multiplizieren, die nie zusammen wirken. Einordnung: Der
  Tyrann-Skin zahlt auf Lv 50 allein +600 % Boss-Schaden, und der Bot modelliert
  Boss-Mults per dokumentiertem Ausschluss gar nicht — die Anker messen also
  weiterhin die langsamere Wahrheit.
  · **Offline ×1.3600**, eigener Pfad wie bei 2a (dort ×1.35).
- **Die skin-exklusiven Affixe liegen BEWUSST außerhalb des Produkts — und das
  war eine Messung, keine Meinung.** Die erste Fassung gab Robo ein „Servo-Takt"
  auf Crew-DPS (doppelte Basis). Weil alle drei Schmiede-Slots demselben Skin
  gehören, stapelte der Budget-Rechner dort +24 % DPS und landete bei **×1.58** —
  über dem Richtwert. Jetzt zahlt Servo-Takt auf `coachCps` (Robos eigener
  Stern-Stat), Glut-DoT auf Boss-Schaden und Sequin-Crit auf Krit-Chance: alle
  drei auf Termen, die das Standard-Produkt nicht oder nur mit kleinem Hebel
  enthält. Ein Test friert die Regel ein.
- **Krit-Schaden war falsch angeschrieben — und das fiel erst durch die Affixe
  auf.** Das Spiel ADDIERT `critMultBonus` auf `CRIT_MULT` (5), es sind
  MULTIPLIKATOR-PUNKTE. Das Gear-Panel schrieb 0.06 aber als „+6 % Krit-Schaden"
  an (in Wahrheit ×5 → ×5.06, also +1,2 %). Mit einem Affix daneben hätten zwei
  Kacheln („+4 % Klick" vs. „+20 % Krit-Schaden") die Größenordnung glatt
  verdreht. Die Term-Tabelle ist deshalb aus dem Gear-Panel nach `ui/affix-text.ts`
  gewandert (eine Sprache für alle Buff-Zahlen), und `critMult` heißt jetzt
  überall **„Krit-Multiplikator"** und wird als Punkt-Zahl gezeigt. Der Sim-Term
  wurde in derselben Runde korrigiert (er multiplizierte, statt zu addieren).
- **Die Drop-Regel: FRONTIER-Gates statt Farm-Gates — aus drei Gründen.** Ein
  Relikt fällt nur an einem Boss-Gate, das tiefer liegt als jedes je gewürfelte
  (`relics.deepestGate`). (1) **Gegen den Farm-Exploit**: Das Spiel erlaubt
  `travelTo` auf jede geclerte Bühne und `challengeBoss` direkt am Gate — ohne
  Highwater könnte man Bühne 50 endlos wiederholen und alle 30 Sekunden würfeln.
  (2) **Gegen die Prestige-Wäsche**: Der Zähler fällt bei KEINEM der drei Resets,
  sonst zahlte jede Transzendenz die Leiter 50…∞ neu aus. (3) **Weil der Bot dann
  dieselbe Zahl misst wie das Spiel** — die Sim gattert ihren Loot ohnehin auf den
  Frontier, mit derselben Regel im Spiel ist die gemessene Kurve keine
  Untergrenze mehr, sondern die Wahrheit. Beides ist headless nachgewiesen (siehe
  `1c3a-d4`).
- **Rate + Pity, gemessen.** 25 % je neuem Gate, Garantie spätestens am 4. (die
  Zahl von `PITY_DIAMOND` — wer die Truhen-Garantie kennt, muss die Relikt-
  Garantie nicht neu lernen). Erwartung: **ein Relikt je 2,73 Gates = je ~14
  Bühnen Vorstoß**. Gemessen (`SIM_ACTIVE`, Seeds 1/7/12345):
  · **45 min: 0 Relikte** — die Wand steht bei Bühne 25, Gate 50 ist außer Reichweite.
  · **3 h: 1,3** (tiefstes Gate 70, also 5,0 berechtigte Gates).
  · **12 h: 1,3** · **24 h: 1,7** (Gate 72).
  Zwischen Stunde 3 und Stunde 24 bewegt sich fast nichts — und das ist KEIN
  Fehler der Drop-Rate, sondern die M9-Wand des Kettenlaufs (er hängt bei Bühne
  ~73). Die Gegenprobe mit vollem Prestige-Stack (E2-Treiber) endet bei Bühne 80,
  6 Gates, 1–2 Relikten. Relikte hängen an der TIEFE, nicht an der Spielzeit —
  hochgerechnet: Bühne 100 ⇒ 10 Gates ⇒ ~4 Relikte, Bühne 150 ⇒ ~7, Bühne 300 ⇒
  ~18. Die drei Trage-Slots sind damit um Bühne ~90 gefüllt, alles danach ist
  Verbesserung statt Erstausstattung. Genau das meint „Endgame-Loot oberhalb der
  Mythos-Truhen": Das System startet, wo die Truhen-Leiter aufhört.
- **Die Glut-Ökonomie: Duplikate zahlen ZUSÄTZLICH, nicht stattdessen.** Das
  Ideen-Dokument nennt Duplikate „heute wertlos" — sie waren es nicht (§6.3.2
  zahlt 5/20/60/200 🧩), aber sie waren auch nie mehr als ein Splitter-Häppchen.
  `resolveDuplicate` bleibt deshalb **unangetastet** (die 🧩 sind zugesagt und
  tragen die in 3b geeichte Umschul-Leiter), und die Glut kommt obendrauf:
  **2 / 5 / 12 / 30 🔥** je Truhen-Stufe. Das Einschmelzen passiert automatisch —
  ein Duplikat-Fach wäre eine Schachtel um eine Zahl. Dazu zwei kleinere
  Quellen: der **Splitter-Umtausch 20 🧩 → 1 🔥** (bewusst ungünstig: bei den in
  3b gemessenen ~140 🧩/h ergibt ein VOLLSTÄNDIGER Umtausch 7 🔥/h, nicht einmal
  ein Slot-2-Reforge je Stunde — ein Überlauf-Ventil, kein Haupt-Faucet) und das
  **Einschmelzen überzähliger Relikte** (2 … 16 🔥), das den Kreis zwischen 1c
  und 3a schließt.
- **Reforge-Kosten 12 / 24 / 48 🔥 je Slot, Lock ×3 — und warum genau 3.** Der
  Pool eines Schmiede-Slots hat 10 Sorten. Wer eine BESTIMMTE Sorte in besserer
  Qualität will, trifft ohne Lock mit 1/10 · P(bessere Qualität), mit Lock mit
  P(bessere Qualität) — der Lock ist also exakt eine **Verzehnfachung** der
  Trefferquote. ×10 zu verlangen wäre erwartungswert-neutral und damit sinnlos
  (niemand würde je locken); ×3 macht daraus ein klares Geschäft, für das man
  trotzdem echte Währung liegen lässt. Bezahlt wird der Verzicht auf das
  Gegenteil: Ein freier Roll kann eine ANDERE, für den Build bessere Sorte
  bringen. **Keine Roll-Eskalation wie bei 3b** — dort war sie nötig, weil
  Splitter im Überfluss fließen; Glut ist die knappe Währung dieses Systems, die
  Knappheit IST die Bremse, und ein zweiter Zähler darüber bestrafte nur die
  Spieler, die sie ohnehin spüren.
- **Das Qualitäts-Pity, exakt.** Jeder Schmiede-Slot führt einen Trocken-Zähler:
  Ein bezahlter Roll, dessen ANGEBOT eine echt höhere Qualität hat als das
  getragene Affix, setzt ihn auf 0 — unabhängig davon, ob der Spieler annimmt
  (bezahlt wurde der Roll, und der Wurf WAR eine Verbesserung). Jeder andere
  zählt +1. Die Mindest-Qualität des nächsten Rolls ist `min(3, ⌊dry / 5⌋)`. Also:
  nach 5 trockenen Rolls nichts unter „Solide", nach 10 nichts unter „Fein", nach
  15 ist „Makellos" **garantiert** — spätestens der 16. Roll trifft. Ein leerer
  Slot zählt als Qualität −1, der erste Roll darauf ist also immer eine
  Verbesserung. Die Trockenstrecke steht im Dialog als Klartext („noch 3 bis zur
  nächsten Stufe"), damit niemand raten muss.
- **Die Schmiede-Slots sind teuer — und DAS ist die eigentliche Balance.** Sie
  hängen an `gear.skinLevels` (10/25/40, wie das Ideen-Dokument vorgibt), und
  `shardCost` wächst mit ×1.25/Level. Kumuliert gemessen: **Slot 1 = 370 🧩**
  (~2,6 h), **Slot 2 = 10 660 🧩** (~76 h), **Slot 3 = 301 060 🧩** (~2 150 h).
  Der rechnerische Höchstfall des Budgets beschreibt also einen Spielstand, den
  fast niemand je hält — die Leitplanke misst absichtlich diesen Extremfall.
  Zweite Bremse: Die Slots eines NICHT ausgerüsteten Skins falten ×1 (exakt wie
  `gearBonus` nur den aktiven Skin liest). Man schmiedet an EINEM Lieblings-
  Charakter, nicht an zehn parallel — genau deshalb dürfen die exklusiven Affixe
  überhaupt die doppelte Basis tragen.
- **Sim: Relikte in JEDEM Profil, Schmiede als eigenes.** Relikte fallen passiv
  aus Boss-Gates, ohne jede Kauf-Entscheidung — wie der Ruf (1b) trägt sie also
  zwangsläufig jeder echte Spielstand, ein Bot ohne sie verschwiege einen
  Machtterm. Sie sind deshalb bewusst NICHT an `econOn` gehängt (sie sind kein
  Loot-Beschleuniger im Sinne der §4.8-Kalibrierung, sondern eine Progressions-
  Schicht), und der Bot trägt automatisch die drei bestgerollten
  (`equipBestRelics` — eine build-blinde Zahl, kein Macht-Optimierer). Die
  Schmiede dagegen bekommt das Profil **`SIM_FORGE`** („Schmiede voll", drei
  makellose Slots); der Normal-Bot schmiedet NIE — dieselbe dokumentierte
  Untergrenze wie bei 3b und 2a.
- **Gemessener Anker-Shift** (`npm run balance`, Seeds 1/7/12345, gegen die in
  Schritt 5 protokollierten Zahlen):
  · **Pacing im ersten Sitting UNVERÄNDERT** — t10 1.7 min, t25 32.4 min, Wand
  ⌀ Bühne 25.0, byte-gleich. Kein Lauf dieser Länge erreicht Bühne 50, es gibt
  dort schlicht kein Relikt.
  · **Erste Himmelfahrt** (0.7 cps, ohne Loot — der empfindlichste Anker):
  16.63 → **16.74 h** (+0,7 %, Rauschen). Der Lauf endet bei Bühne 75, sieht also
  nur die Gates 50…75.
  · **Kumuliert t75**: 3.17 → **3.13 h**.
  · **E2** unverändert 15 Stufen je Seed, schlimmstes Verhältnis 1.85.
  · **E3** +50 %-Stufen 47/51/58 → **53/55/59**, größte Lücke 30.7 → **16.1 min**
  — die Relikte machen die Kurve LEBENDIGER, nicht schneller: mehr kleine
  Sprünge, kürzere Durststrecken.
  · **E4-Vorsprung** unverändert ⌀ +13.3 Bühnen, kleinster 5.
  · **Ruf (1b) nach 24 h Kette**: stärkstes Theme 16 218 → **18 196** (+12 %,
  Stufe unverändert 8) — Relikte heben die Kills/h ein wenig, also auch den Ruf.
  · **Schmiede-Profil A/B** (t25, Kalibrier-Bedingungen): ×1.18 / ×1.15 / ×1.18 —
  deutlich unter dem Produkt-Budget ×1.4298, weil drei Slots nur ein Drittel des
  Höchstfalls sind.
  Kein Anker musste aufgerissen werden.
- **Save v17 mit ZWEI gegensätzlichen Migrations-Entscheidungen im selben
  Schritt.** Die **Schmiede startet komplett leer**: Glut entsteht aus
  Duplikat-Jackpots und getauschten Splittern, und beides hat das Spiel nie
  gezählt; ein geschmiedetes Affix wäre vollends erfunden (es hätte eine gerollte
  Qualität, die niemand gerollt hat). Der **Relikt-Gate-Highwater wird dagegen
  ZWINGEND gesät** — auf das tiefste bereits geclerte Gate, gerechnet mit
  derselben Regel wie `bossFirstKillZones` (`clearedGateFor`, inklusive des
  Himmelfahrt-festen `gear.zoneEver`). Ohne die Saat bekäme ein Alt-Save auf
  Bühne 200 beim nächsten Rückweg dreißig Gates geschenkt, die er längst hinter
  sich hat. Das ist der Gegenfall zu 1b („bewusst leer"): Dort war jede Herleitung
  eine Erfindung, hier wäre das WEGLASSEN eine Schenkung. Die Sammlung selbst
  startet trotzdem leer, und ein Alt-Save rechnet nach dem Update bit-gleich
  weiter (leeres Loadout faltet überall ×1).
- **Die X7-Matrix hat den Bump sofort rot gemeldet.** Ihr neues Paar prüft den
  gesunden v17-Save (fünf Relikte in drei Formen, zwei getragen, Gate-Highwater
  55; Schmiede mit skin-exklusivem Slot, einem Trocken-Zähler von 7 und einem
  verwaisten Slot, den sein Level nicht mehr deckt) und den kaputten (doppelte
  Relikt-Id, Müll-Affix, zwei Affixe derselben Sorte, Id ≤ 0, gelogene `nextId`,
  Slots die dreimal auf dasselbe Relikt zeigen, negative Glut, Phantom-Skin) —
  übrig bleiben genau die zwei legalen Relikte, ein Slot, `nextId` nach OBEN
  korrigiert und ein Skin-Fach.
- **Platz: der 🎁 Truhen-Tab für die Relikte, die Skin-KARTE für die Schmiede.**
  Ein zehnter Reiter bleibt verboten (headless bei 390 × 844 nachgemessen: neun
  Reiter à 44 px = **396 px** gegen **387 px** verfügbare Breite — schon heute
  9 px drüber). Tab-Höhen bei 390 px NACH der Änderung: Ruhm 901 · **Truhen
  1 322** (davon 666 px die neue Relikt-Sektion, vorher also ~656 px) · Crew
  1 877 · **Skins 2 147** · Ziele 2 665. Der Truhen-Tab ist damit weiterhin der
  zweitkürzeste — und der thematisch richtige: Er IST der Loot-Tab, über den
  Relikten steht das Truhen-Inventar, darunter die Drop-Tabellen. Die
  Schmiede-Slots sitzen dagegen an der Skin-Karte, weil ein Slot ANTEIL dieses
  Skins ist: Sein Level schaltet ihn frei, er wirkt nur solange dieser Skin
  getragen wird, und er verschwindet aus der Rechnung, sobald man wechselt. Eine
  zweite Liste woanders müsste all das noch einmal erklären. Der Reforge selbst
  bekommt einen eigenen Dialog (Vorbild `retrain-dialog`).
- **Eine Qualitäts-Farbskala für beide Systeme.** Grau → Grün → Blau → Gold, in
  Relikt-Kacheln, Trage-Slots, Schmiede-Chips und Dialog-Karten dieselbe. Ein
  „makelloser Hüftschwung" sieht überall gleich aus, sonst lernt man die Skala
  zweimal. In den DREI schmalen Trage-Slots steht eine KOMPAKTE Kachel (Glyph +
  Wert, Name im `title`): Der erste Headless-Lauf zeigte, dass „Gate-Brecher"
  bei drei Spalten den Wert aus der Karte schob — die Namen stehen ausgeschrieben
  in der Sammlung darunter.
- **Zwei Test-Dateien statt einer — gemessen, nicht aus Ordnungsliebe.** Mit den
  neuen Ankern lief `sim.test.ts` **65 s CPU am Stück**, und Vitest bricht einen
  Worker, der so lange nicht auf `onTaskUpdate` antwortet, mit einem RPC-Timeout
  ab: **jeder Test grün, der Lauf trotzdem rot** (Exit 1). Am Basis-Commit lief
  dieselbe Datei in 46 s ohne Fehler — die Schranke liegt dazwischen. Die
  Loot-Anker sind deshalb nach `sim-loot.test.ts` gewandert; zwei Dateien laufen
  in zwei Workern parallel, keiner reißt die Schranke, und die Gesamtlaufzeit der
  Suite sank sogar (57,6 s bei 1 085 Tests). Die Bot-PROFILE bleiben die geteilte
  Quelle aus `sim.ts`. Zweite Lehre derselben Runde: Ketten dürfen nicht im
  `describe`-Körper laufen — dort fallen sie in die Collect-Phase, in der der
  Worker erst recht nicht antwortet (Collect 7,1 s → 0,5 s nach der Umstellung
  auf eine gemerkte, faul gezogene Kette).
- **Das Balance-Ritual bleibt im Budget.** Abschnitt 11 („Relikte & Schmiede":
  Drop-Kurve über die geteilten Ketten, die Gegenprobe mit vollem Prestige-Stack,
  Glut-Quellen und -Senken, die Splitter-Kosten der Slot-Leiter, die vier
  Budget-Zahlen und das A/B des Schmiede-Profils) nutzt dieselbe `chains`-Map wie
  die Abschnitte 6/7/10. Laufzeit **32,4 s** (von 60 s Budget, vorher 24,9 s).
- **Headless-Beweis** (Chromium/SwiftShader, Port 4188, präparierter v17-Save):
  `1c3a-a-relikte-tab.png` + `1c3a-a2-relikte-zoom.png` (drei gefüllte
  Trage-Slots, fünf Relikte in der Sammlung, Qualitäts-Rahmen, Einschmelz-Werte
  12/8/6/4/2 🔥), `1c3a-b-schmiede-slots.png` + `1c3a-b2-schmiede-zoom.png`
  (Disco Lv 27 ⇒ Slot 1 belegt/Slot 2 leer/Slot 3 „🔒 Lv 40"; Klassiker Lv 12 ⇒
  genau ein Slot; Robo Lv 4 ⇒ „Schmiede ab Lv 10"),
  `1c3a-c1-dialog-vorschau(-zoom).png` / `1c3a-c2-dialog-lock.png` (12 🔥 → 36 🔥,
  Schalter kippt von 🔓 auf 🔒) / `1c3a-c3-pity-vorschau.png` („Mindest-Qualität:
  Solide · 7 Roll(s) ohne Verbesserung, noch 3 bis zur nächsten Stufe") /
  `1c3a-c4-dialog-angebot(-zoom).png` (Alt und Neu nebeneinander, „Übernehmen" /
  „Verwerfen"; Glut 180 → 156 BEVOR gewürfelt wurde, Slot noch leer) /
  `1c3a-c5-nach-uebernahme.png` + `1c3a-c5b-karte-nachher.png` (Toast
  „Geschmiedet! · Slot 2: Langer Atem (Fein)", die Kachel trägt es),
  `1c3a-d1-relikt-drop.png` + `1c3a-d2-drop-toast-zoom.png` (ein ECHTER Drop im
  laufenden Spiel: Gate 55 fällt nach 9,1 s, Toast „💎 Relikt gefunden! Bühne 55 ·
  Nachtschwärmer", Highwater 50 → 55, Pity 3 → 0) + `1c3a-d3-sammlung-nach-drop.png`
  (das neue Relikt füllt den ersten LEEREN Slot) + **`1c3a-d4-kein-zweites-relikt.png`**
  (die Gegenprobe: per Zonen-Strip zurück auf Bühne 55 gereist, Boss erneut
  herausgefordert, Gate nach 30,4 s ein ZWEITES Mal gefallen — Toast „Boss
  besiegt!", aber KEIN zweites Relikt, die Sammlung zeigt weiter genau eines),
  `1c3a-e1-permanenz-vorher.png` + `1c3a-e2-permanenz-nachher.png` (eine echte
  TRANSZENDENZ im Spiel: Bühne 62 → 1, Seelen 900 → 0, HPF 900 → 0, TE 0 → 5 —
  fünf Relikte, dieselben Slots [1,3,2], Gate-Highwater 60, 180 Glut und das
  geschmiedete „Sequin-Crit" stehen unverändert da), `1c3a-f1-duplikat-glut.png` +
  `1c3a-f2-duplikat-toast-zoom.png` (Mythos-Duplikat: Glut 180 → 210 UND Splitter
  740 → 940 — beide Wege zahlen), sowie `1c3a-m-{portrait,schmal,landscape}-{relikte,schmiede,dialog}.png`
  (390×844, 320×640, 740×380 — `documentElement.scrollWidth` == `innerWidth` in
  allen neun, und im Querformat scrollt der Dialog IN SICH: sichtbar 350 px bei
  447 px Inhalt). Bundle nach der Änderung: **884 KB JS** (Budget 1.5 MB).

## IDEEN-GAMEPLAY Schritt 5 — 1b Gebietsherrschaft

- **Eine Zahl je Theme, eine Gewinn-Regel, eine Wirkung.** `territory:
Record<theme, number>` ist die ganze Slice: vier monotone Lebenszeit-Zähler,
  gefüllt AUSSCHLIESSLICH über `addRep` im Kill-Pfad (Rivalin +1, Boss +10 — ein
  Gate ist zehn Rivalen wert, ein Theme-Zyklus zahlt also 50 + 10 = 60 Ruf).
  Gelesen wird die Tafel an genau zwei Stellen: `territoryGoldMult(t, zone)` für
  die Wirkung und `trophyTier(rank)` für die Optik. Die Theme-Zuordnung wird
  nirgends nachgebaut — `territory.ts` RE-EXPORTIERT `themeForZone` aus
  `boss-gimmicks.ts`, damit Kulisse, Zonen-Strip, Gimmick, Ruf, Bonus und Pokal
  garantiert dieselbe Grenze sehen.
- **Der Bonus ist BP — bewusst kein Schaden.** Das Ideen-Dokument nennt selbst
  „+5 % BP auf Club-Bühnen", und die Messung gibt ihm recht: Boss-Gates sind
  30-Sekunden-Schranken, und die A2-Kalibrierung hat gezeigt, wie empfindlich sie
  auf Wirkungs-Prozente reagieren (das ungedämpfte Gimmick-Paket verschob damals
  die Wand um ganze Bühnen). Ein BP-Term läuft dagegen in die ×1.075-Kostenleiter
  der Crew, die jeden Einkommens-Zuwachs logarithmisch einebnet: mehr BP heißt
  „ein paar Level früher", nie „ein Gate, das sonst zu wäre". Genau so liest sich
  auch der gemessene Anker-Shift (unten): Das erste Sitting bewegt sich um NULL,
  nur die Langhorizont-Läufe werden ein paar Prozent schneller.
- **Das Budget: ×1.15 — und warum das auch bei VOLL-Ausbau aller vier Leisten
  gilt.** +1,5 pp BP je Stufe × 10 Stufen = +15 %. Der Deckel bleibt ×1.15, ganz
  gleich wie viele Leisten voll sind, weil ein Kill immer genau EINER Bühne
  gehört und nur deren Theme zählt — es gibt hier kein Produkt über vier Leisten
  (Club-Ruf ist auf einer Space-Bühne exakt ×1.00). Das ist die operative Lesart
  von „kein Global-Creep", `territoryPowerBudget()` rechnet sie aus, und ein Test
  friert sie ein — inklusive der Gegenprobe „alle vier auf Stufe 10, über 40
  Bühnen geprüft: immer ×1.150" (Vorbild `constellationPowerBudget`).
- **Die Kurve ist GEMESSEN, in zwei Durchgängen.** Der Bot rotiert wie jeder
  Spieler durch alle vier Themen (`themeForZone` wechselt alle fünf Bühnen), also
  liefert er die Ruf-Rate direkt. Erster Durchgang, Wirkung noch neutral
  (`SIM_ACTIVE`, 3 cps + Juice, volle Loot-Ökonomie, Seeds 1/7/12345, jeweils das
  STÄRKSTE Theme): 45 min → 273 Ruf (364/h) · 3 h → 1 457 (486/h) · 12 h → 6 504
  (542/h) · 24 h → 12 701 (529/h). Die Rate ist nach der ersten Stunde KONSTANT
  (~530 Ruf/h), denn Ruf hängt am Kill, nicht an der Bühnen-Tiefe — jede Tour
  klettert dieselbe Strecke neu. Daraus die geometrische Leiter **250 × 1.8^(n−1)**
  = 250 · 450 · 810 · 1 458 · 2 624 · 4 724 · 8 503 · 15 306 · 27 550 · **49 590**;
  Stufe 10 also ~94 h aktives Spiel AUF DIESEM Theme. Die Alternativen wurden
  mitgerechnet: 1.75 ⇒ 73 h („Wochen" schrumpfte zu einem langen Monat), 1.85 ⇒
  120 h. 1.8 trifft die Größenordnung, die das Spiel schon kennt (Meisterschafts-
  Legende ~100 h). Zweiter Durchgang MIT gefalteter Wirkung (die Rückkopplung
  hebt die Rate, weil mehr BP etwas tiefer tragen): 273 (364/h) · 1 454 (485/h) ·
  7 716 (643/h) · 16 218 (676/h) ⇒ Stufe 10 nach ~73 h. Die Leiter steht gegen die
  KONSERVATIVE Zahl und liest sich mit Rückkopplung nur schneller.
- **Der Ruf verteilt sich NICHT gleichmäßig — und das ist der Inhalt von 1b.**
  Nach 24 h Kette: Club 7 676 · Synth 7 847 · **Beach 16 218** · Space 7 872. Der
  Bot hängt an seiner Wand und farmt, was darunter liegt; in der langen Kette ist
  das meist das Beach-Fünftel (11–15 / 31–35). Ein Anker friert das ein
  (stärkstes/schwächstes Theme > 1.3). Genau diese Schieflage ist die zweite
  Entscheidungs-Ebene, die das Ideen-Dokument wollte: WO man farmt, zählt.
- **Start bei NULL — und warum das hier zwingend ist (Gegenstück zu 2a).** Die
  Migration v15 → v16 sät leer. Beim Sternenstaub (v14→v15) war die Rückwirkung
  möglich UND richtig, weil sich der Anspruch aus lauter Highwatern RECHNEN ließ,
  die im Save stehen. Ruf entsteht dagegen aus Kills PRO THEME, und diese Zählung
  hat das Spiel nie geführt: `stats.bossKills` kennt kein Theme, `lifetimeMaxZone`
  keine Wiederholungen, `stageStars` kein WIE OFT. Jede Herleitung wäre eine
  Erfindung — und eine erfundene Ruf-Zahl verschenkt echte Macht (BP-Prozente) für
  einen Nachweis, den niemand erbracht hat. Dasselbe Muster wie die Bühnen-Sterne
  in v10→v11 („bewusst leer"), hier zusätzlich mit dem Balance-Argument: Die
  Leiste ist eine Wochen-Kurve; ein Startguthaben wären nicht ein paar Prozent,
  sondern die ersten Stufen geschenkt. Ein Alt-Save rechnet nach dem Update
  deshalb bit-gleich weiter (`territoryGoldMult` faltet auf jeder Bühne ×1), bis
  er den ersten Kill macht.
- **Der Bot MUSSTE falten — anders als bei 3b/2a gibt es hier keine
  Untergrenzen-Ausrede.** Umschulung und Konstellation kann man liegen lassen;
  Ruf entsteht ohne jede Entscheidung. Ein Bot ohne die Faltung hätte eine
  Einkommens-Kurve gemessen, die kein echter Spielstand je hat. Gemessener
  Anker-Shift (`npm run balance`, Seeds 1/7/12345, vorher → nachher):
  · **Pacing im ersten Sitting UNVERÄNDERT** — t10 1.7 min, t25 32.4 min, Wand
  ⌀ Bühne 25.0, alle drei Seeds byte-gleich. In 45 min steht die stärkste Leiste
  gerade auf Stufe 1 (+1,5 % BP auf einem Fünftel der Bühnen), und das erst zum
  Schluss.
  · **Erste Himmelfahrt** (0.7 cps, ohne Loot — der empfindlichste Anker):
  17.27/18.79/17.10 → 15.87/18.05/15.98 h, Mittel 17.72 → 16.63 h (−6,2 %).
  Fenster [11.6 h, 19.4 h] hält mit Abstand.
  · **Kumuliert t75** (1 cps, mit Loot): Mittel 3.16 → 3.17 h (Rauschen).
  · **E2** unverändert 15 Stufen je Seed, schlimmstes Verhältnis 1.86 → 1.85.
  · **E3** +50 %-Stufen 47/50/58 → 47/51/58, größte Lücke 48.7 → 30.7 min.
  · **E4-Vorsprung** ⌀ +12.3 → +13.3 Bühnen, kleinster unverändert 5.
  Kein Anker musste aufgerissen werden; die Verschiebung steht im Kopf von
  `sim.test.ts`, damit sie beim nächsten Schritt nicht als Rauschen gilt.
- **Das Balance-Ritual wurde dabei SCHNELLER, nicht langsamer.** Abschnitt 10
  („Gebietsherrschaft": Ruf/h je Theme, Stufen-Leiter mit Zeitangaben, Budget)
  braucht dieselben 1/4/16/32-Ketten wie Abschnitt 6 (Meisterschaft) und 7
  (Splitter). Naiv dazugebaut lief das Ritual 49.0 s (von 60 s Budget); die drei
  Abschnitte teilen sich die Ketten jetzt (`chains`-Map, einmal fahren, dreimal
  lesen) und das GANZE Ritual läuft in **24.8 s** — schneller als die 36.3 s
  vorher, bei bit-gleichen Zahlen.
- **Platz: der ✨ Ruhm-Tab, gemessen statt geraten.** Ein zehnter Reiter bleibt
  verboten (headless bei 390 × 844 nachgemessen: 9 Reiter à 44 px = 396 px gegen
  387 px verfügbare Breite — schon heute 9 px drüber). Von den bestehenden
  Reitern kam nur einer in Frage; `scrollHeight` der Tab-Bodys bei 390 px: Ziele
  **2 665 px** · Crew **1 877 px** · Ruhm **901 px** (inklusive der 513 px, die die
  neue Sektion selbst misst, vorher also ~390 px). Im Ziele-Tab — dem Ort der
  Konstellation — wären die vier Leisten auf ~3 180 px und damit in die vierte
  Bildschirmhöhe gerutscht. Der Ruhm-Tab ist zudem der thematisch richtige: Direkt
  ÜBER den Leisten steht der Knopf, der die ganze Tour einkassiert („was du hier
  einheimst, kostet dich alles; was darunter steht, kann dir niemand nehmen").
- **Die Leiste ist in zehn Segmente geteilt, nicht ein glatter Balken.** Die
  Ruf-STUFE ist die Zahl, die zahlt; zehn Kästchen kann man zählen, ohne die
  Beschriftung zu lesen. Das laufende Segment füllt sich anteilig, damit auch
  zwischen zwei Stufen sichtbar etwas passiert, und ab Trophäen-Stufe 2/3 wechselt
  die Füllfarbe auf Silber/Gold — dieselbe Sprache wie der Pokal auf der Insel.
  Die Leiste des Themes, auf dem man GERADE steht, trägt einen grünen Rahmen plus
  „du stehst hier".
- **Die Insel-Trophäe sitzt im G3-Ambient-Slot und hält dessen Regeln.** EIN
  gebackenes Mesh (Sockel + Schaft + Kelch + Rand + zwei Henkel über
  `island.bake`) plus dessen Ink-Hülle, kein Licht, keine Per-Frame-Allokation,
  an der `islandGroup` (fährt beim G1-Wechsel mit). Drei Stufen statt zehn
  (Bronze ab Ruf-Stufe 3, Silber ab 6, Gold bei 10), weil ein Pokal am Inselrand
  nur wenige Dutzend Pixel misst. `World.setTrophy(tier, rebuild)` spiegelt
  `setAmbientLife`: Ändert sich die Stufe, wird die laufende Bühne EINMAL neu
  gebaut — mit `rebuild: false`, wenn die Glue ohnehin gleich die Kulisse
  wechselt, sonst baute man erst die alte Bühne mit dem neuen Pokal und eine
  Zeile später die neue. Zwei Fallen sind dabei aufgeschlagen: (1) `mergeGeometries`
  scheitert STILL, wenn indizierte (Cylinder/Torus) und nicht-indizierte
  (RoundedBox) Geometrien gemischt werden — der erste Headless-Lauf zeigte einen
  leeren Pokal und eine Konsolen-Warnung; jetzt wird alles vorher entindiziert.
  (2) Der erste Standort (hinterer rechter Rand) lag im Bild hinter der HUD-Karte;
  er sitzt jetzt am VORDEREN LINKEN Rand, dem einzigen größeren freien Sand-Bogen
  (Tanzfläche Mitte, Rivale hinten links, Publikum im +z-Bogen).
- **Der Pokal folgt der BÜHNE, nicht der angezeigten Kulisse.** Wer die Kulisse
  manuell festgepinnt hat (§5.5), sieht auf Bühne 12 trotzdem den Beach-Pokal —
  weil er dort Beach-Ruf verdient und den Beach-Bonus bekommt. Ruf, Bonus und
  Pokal lesen alle drei `themeForZone(combat.zone)`; alles andere wäre eine
  zweite Wahrheit.
- **Headless-Beweis** (Chromium/SwiftShader, Port 4188, präparierter v16-Save
  mit gestaffelten Ständen: Club 3 200 = Stufe 5 · Synth 1 000 = Stufe 3 · Beach
  130 = ohne Rang · Space 52 000 = Stufe 10): `1b-a-ruf-leisten.png` +
  `1b-a2-leisten-zoom.png` (alle vier Zustände gleichzeitig, „du stehst hier" auf
  Club, Gold-Segmente bei Space), `1b-b-insel-ohne-trophaee(-zoom).png` /
  `1b-c2-insel-bronze-trophaee(-zoom).png` / `1b-c-insel-gold-trophaee(-zoom).png`
  (dieselbe Beach-Bühne 12, dieselbe Kamera — kein Pokal / Bronze-Pokal /
  Gold-Pokal) plus `1b-c3-insel-club-gold(-zoom).png` als Gegenprobe auf der
  DUNKELSTEN Insel (Club, Bühne 2: der Pokal steht auch dort gegen den Boden),
  `1b-d1-permanenz-vorher.png` + `1b-d2-permanenz-nachher.png` (eine
  echte TRANSZENDENZ im Spiel: Bühne 62 → 1, Seelen 900 → 0, HPF 30 → 0,
  RS-Lebenszeit 5.00M → 0, TE 0 → 3 — die vier Leisten stehen unverändert da,
  Save-Vergleich im Log), `1b-e-rangaufstieg-toast.png` (Ruf 245 → 250 im
  laufenden Spiel ⇒ Toast „🏆 Beach-Gast — Ruf-Stufe 1 · Sunset Beach: +1,5 % BP
  auf diesen Bühnen") + `1b-e3-leisten-nach-aufstieg.png` (Beach danach auf Stufe
  1 mit 295 Ruf, und weil der Lauf inzwischen auf Bühne 16 steht, ist der
  „du stehst hier"-Rahmen zu Deep Space gewandert),
  sowie `1b-m-portrait.png` / `1b-m-schmal.png`
  / `1b-m-landscape.png` (390×844, 320×640, 740×380 — `documentElement.scrollWidth`
  == `innerWidth` in allen dreien, kein horizontaler Überlauf). Bundle nach der
  Änderung: **865 KB JS** (Budget 1.5 MB).

## IDEEN-GAMEPLAY Schritt 4 — 2a Legenden-Konstellation

- **Eine Währung, EINE Formel — und deshalb keine „schon ausgezahlt"-Zähler.**
  Sternenstaub entsteht ausschließlich aus drei Quellen, die im Spiel allesamt
  Lebenszeit-Highwater sind: Bühnen-Sterne-Meilensteine (`totalStars`, +5 je 15),
  Erfolge (+3 je Stück) und Erst-Kills der Boss-Gates ab Bühne 25
  (lifetimeMaxZone-getrieben, +2 je Gate). Weil jede der drei Zahlen nur wachsen
  kann, ist auch der daraus gerechnete ANSPRUCH (`dustEntitlement`) monoton — und
  damit ist `syncDust` kein Gutschreiben, sondern ein Angleichen:
  `earned = max(earned, Anspruch)`. Ein Reload, ein Import, ein Reset, hundert
  Aufrufe im selben Tick: immer dieselbe Zahl. Der Kontrast zu `starsAwarded`
  (dem Meilenstein-Highwater der Truhen) ist Absicht — DORT wird eine Truhe
  gebucht, ein echtes Ereignis, das ohne Zähler doppelt fiele. Hier wird nichts
  gebucht, hier wird gerechnet. `spent` ist die zweite Zahl des Paares
  („verbaut"), `dustHeld = earned − spent` das, was man ausgeben kann.
- **Saison-Abschlüsse: bewusst WEGGELASSEN.** Das Ideen-Dokument nennt sie als
  vierte Quelle. Die X4-„Saisons" sind clientseitig aber nur ein
  Bestenlisten-KALENDER (`weekly.boardSeasonFor`): Der Client weiß, welche Saison
  läuft, aber nie, ob jemand sie „abgeschlossen" hat — Platzierung und Teilnahme
  leben serverseitig, und das Leaderboard-API ist optional (Default aus). Eine
  Quelle, die ohne Server nicht existiert, darf keine permanente Währung drucken;
  sie hinge sonst an einem Feature-Flag.
- **Streng lineare Ketten statt eines Graphen — und was das für den Save spart.**
  Jede der drei Konstellationen ist eine Linie (Knoten n braucht n−1). Damit ist
  der GANZE Baum drei Zahlen: `nodes: { aufbruch: 4, tempo: 2, ausdauer: 0 }`. Es
  gibt keine Lücke, die man darstellen müsste, und ein hand-editierter Save kann
  keine unmögliche Form behaupten (`repairConstellation` klemmt nur auf 0…8).
  `spent` wird beim Laden aus den Ketten NEU gerechnet (`constellationSpend`)
  statt gelesen — zwei Quellen für dieselbe Zahl driften irgendwann —, und
  `earned` wird bei Bedarf nach OBEN auf `spent` korrigiert (dieselbe Richtung wie
  `repairTranscend`: was gekauft ist, war offenbar bezahlt; Knoten wegzunehmen
  wäre das Nuken echten Fortschritts).
- **Kein Respec — und deshalb ein Arm-Knopf.** Der Himmelsbaum hat einen Respec,
  weil er Exklusiv-PAARE trägt (eine Wahl, die man bereuen kann). Hier gibt es
  keine Wahl innerhalb einer Linie, nur die Reihenfolge zwischen den Linien — und
  am Ende kauft man ohnehin alles. Ein Respec wäre also nur ein Umsortier-Knopf.
  Dafür bestätigt das Panel JEDEN Kauf (arm → „Sicher? Sternenstaub gibt es nicht
  zurück"), weil die Währung endlich ist.
- **Das Budget: ×1.304, gerechnet statt behauptet.** Voll ausgebaut zahlt der Baum
  Klick ×1.08 (4 × +2 %) · Crew-DPS ×1.06 (3 × +2 %) · BP ×1.04 (2 × +2 %) ·
  Krit-EV ×1.033 (3 × +0,5 pp, gegen `CRIT_CHANCE`/`CRIT_MULT` gerechnet) ·
  Truhen-Chance ×1.06 (2 × +3 %). Das PRODUKT — die konservative Lesart, denn
  Klick und Crew-DPS multiplizieren sich nie miteinander — ist **×1.3041**, unter
  dem ×1.5-Deckel des Ideen-Dokuments. `constellationPowerBudget()` rechnet genau
  das aus dem Katalog, ein Test friert es ein, und `npm run balance` druckt die
  Tabelle (Abschnitt 9). Das Combo-Fenster (2 × +0,2 s) zählt bewusst ×1.00: Es
  hebt weder `COMBO_CAP` noch `comboMult`, nur die Gnadenfrist — bei durchgehendem
  Klicken ist sein Beitrag exakt 0. Der Offline-Pfad hat ein EIGENES Budget
  (Rate ×1.08 × Cap ×1.25 = **×1.35**), weil Offline-Ertrag nichts an der
  Live-Rechnung multipliziert — und weil der Himmelsbaum dort mit 8 h → 24 h
  längst ein Vielfaches vergibt.
- **Der Lebens-Vorrat: 210 💫 = Abschluss um Bühne 130–150.** Kostenleiter je
  Linie 2 · 3 · 5 · 7 · 9 · 12 · 14 · 18 = 70 💫, dreimal = 210. Dagegen der
  Vorrat (Sterne konservativ mit 2 je Bühne plus Timeout-Stern je Gate geschätzt,
  28 Erfolge im Katalog): Bühne 50 → 105 💫 · Bühne 100 → 181 · Bühne 150 → 244 ·
  Bühne 200 → 299. Der erste Stern jeder Linie kostet bewusst nur 2 💫, sodass die
  ersten zwei Erfolge sofort ALLE DREI Linien anreißen („probier alles an"), und
  der Identitäts-Stern mit 18 💫 ist die eigentliche Sparstrecke. Ergebnis: ein
  Lebenswerk MIT Ende — danach ist die Währung wertlos, genau der „Boden", den das
  Ideen-Dokument für permanente Schichten verlangt.
- **Startkapital: 700 BP waren falsch, 100 BP sind richtig — der Bot hat es
  gezeigt.** Die erste Fassung der drei „Aufbruch"-Knoten gab 50/150/500 BP. Der
  Anker-Bot fiel damit von t10 = 104 s auf 18 s (×5.8): Ein FLACHER BP-Betrag ist
  auf Bühne 1 alles und auf Bühne 60 nichts. Jetzt 10/30/60 = 100 BP ≈ 15 s
  Ertrag auf Bühne 1 — ein spürbarer Anschub (der erste Crew-Kauf ist geschenkt),
  keine übersprungene Bühne.
- **Sim-Profil „Konstellation komplett" (`SIM_CONSTELLATION`) — und warum der
  NORMALE Bot den Baum links liegen lässt.** Ohne `config.constellation` faltet
  jeder Getter ×1; alle Alt-Anker dieser Datei stehen deshalb byte-gleich da wie
  vor 2a. Das ist die dokumentierte Untergrenze: Ein Spieler, der den Baum baut,
  kann nur schneller sein. Das neue Profil misst den Deckel — voll ausgebauter
  Baum gegen Basis:
  · **t25** (45 min, Kalibrier-Bedingungen ohne Loot): ⌀ 1942 s → 1407 s =
  **×1.38 schneller**. Über dem reinen Leistungs-Produkt (×1.304), weil dieser
  Lauf bei NULL Meta startet — der „Warm-up-Start" verdoppelt dort die erste von
  45 Minuten. Ein echter Besitzer des vollen Baums steht bei Bühne 130+; für ihn
  ist das Rauschen. Der Anker misst also den GÜNSTIGSTEN denkbaren Fall.
  · **Erste Himmelfahrt** (0.7 cps, ohne Loot, 7 Seeds): ⌀ 18.24 h → 14.82 h =
  **×1.23**, Einzelwerte 1.15 … 1.36.
  · **Kettenlauf** (6 × 45 min, volle Loot-Ökonomie): t75 ⌀ 6198 s → 5714 s =
  **×1.09** — mit Truhen/Token ist der Baum fast unsichtbar.
  Alles unter ×1.5, wie das Ideen-Dokument erwartet („gemessen deutlich kleiner …
  weil additiv-klein").
- **„Zweiter Wind" ist im Bot BEWUSST nicht gefaltet — mit Messung statt
  Behauptung.** Der Knoten erstattet nach einem Boss-Timeout 3 von 10 Rivalen der
  Rückfall-Bühne (`combat.tickBoss(state, dt, refundKills)` — pur und
  unit-getestet, im Spiel voll verdrahtet). Faltet man ihn in den Bot, wird der
  0.7-cps-Anker um das **2,5-fache LANGSAMER** (Seed 12345: 17,1 h → 42,9 h),
  während JEDER andere Knoten ihn beschleunigt (isoliert gemessen: startGold 0.98 ·
  warmup 0.99 · click 0.98 · dps 0.92 · gold 0.94 · luck 1.00). Der Grund ist eine
  Eigenschaft der BOT-STRATEGIE, nicht des Knotens: Der Bot fordert den Boss nach
  einem Fail sofort wieder heraus (`challengeBoss`) und überspringt dabei die
  Rivalen-Welle der Boss-Bühne — drei erstattete Kills auf der Rückfall-Bühne
  werden für ihn deshalb zu 30 % weniger Farm je Anlauf bei gleichbleibenden 30 s
  Boss-Uhr pro Fehlversuch. Ein Mensch kehrt drei Kills früher ans Gate zurück und
  farmt dann die REICHERE Boss-Bühne. Der Ausschluss steht damit in derselben
  Tradition wie Twerk-Ekstase und die Boss-Schadens-Mults (Modul-Kopf `sim.ts`),
  nur mit umgekehrtem Vorzeichen — und die Messung dazu ist im Anker-Test
  festgeschrieben, damit niemand ihn „aus Versehen" wieder einschaltet.
- **Platz: eigener Abschnitt im 📋 Ziele-Tab, KEIN zehnter Reiter.** Zwei Gründe.
  (1) X6-Rechnung, headless nachgemessen: Neun Reiter × 44 px Mindestbreite =
  396 px, verfügbar sind auf einem 390-px-Telefon 387 px (Bottom-Sheet minus
  Safe-Area) — die Leiste steht also schon HEUTE 9 px über der Kante. Ein zehnter
  Reiter machte 440 px und schöbe „Mehr" 53 px weit hinter ein Seitwärts-Scroll
  OHNE Balken (`scrollbar-width: none`), also genau in den Fehler zurück, den X6
  behoben hat.
  (2) Thematisch: Die Währung entsteht ausschließlich aus dem, was DIESER Tab
  ohnehin zeigt — Bühnen-Sterne-Meilensteine und Erfolge. Die Sektion steht direkt
  über der Erfolgs-Wand: Quelle und Senke untereinander, und der Panel-Kopf kann
  die Herkunft jedes Staubkorns mit Live-Zahlen erklären statt auf einen anderen
  Reiter zu verweisen.
- **Optik: der eine Ort im Spiel, der nicht nach Pergament aussieht.** Drei
  dunkle Himmelsausschnitte, Verbindungslinien als `<line>`, Sterne als
  vierzackige `<path>`-Blenden — alles Inline-SVG in der bestehenden
  Stroke-Sprache, keine neue Dependency, keine Bild-Assets. Ein Linien-SEGMENT
  leuchtet nur, wenn BEIDE seiner Sterne stehen, sodass das Sternbild Strich für
  Strich wächst; der nächste kaufbare Stern pulsiert (das einzige, was man
  anklicken kann). Vier Zacken statt fünf, weil eine 5-Zack-Silhouette bei 3 px
  Radius zu Matsch wird.
- **Der Warm-up-Buff leiht sich den Kobold, statt einen vierten Buff zu
  erfinden.** „Warm-up-Start" setzt `goblin.buffUntil` auf `now + 60 s` — dieselbe
  ×2-Klick-Zahl, derselbe Rechenpfad im Klick-Term, keine zweite Anzeige und kein
  neues Feld. Größenordnung zur Einordnung: Der reguläre Kobold zahlt über einen
  45-min-Lauf ~7 × 10 s ×2; der Warm-up legt einmalig 60 s dazu und schiebt sie
  dorthin, wo eine frische Tour sie braucht.

## IDEEN-GAMEPLAY Schritt 3 — 3b Crew-Umschulung

- **Eine Override-Map, EINE Lesekette.** `crewRetrain: Record<crewId,
Record<tierIndex, AbilityKind>>` (leer = Stock-Sorte) wird ausschließlich in
  `abilityKind(cfg, tier, retrain)` gelesen — und alles, was je nach der Sorte
  eines Slots fragt, geht durch genau diese Funktion: die Crew-Card (Kachel,
  Badge, Tooltip), der Kauf-Tipp (`advisor.bestPurchaseHint`), die
  Wand-Telemetrie (`bossDamageMult`) und vor allem die Faltung
  `crewSpecialBonuses`. Die faltete vorher `cfg.special` direkt; jetzt zählt sie
  für ein Mitglied MIT Einträgen Stufe für Stufe über `abilityKind` und behält
  für jedes Mitglied OHNE Einträge den alten O(1)-Pfad (`specialTiers`). Damit
  rechnet ein Save ohne Umschulung — also jeder Sim-Lauf — bitgleich und
  gleich schnell wie vor 3b, und ein umgeschulter Slot wirkt überall exakt wie
  ein von Haus aus so geborener. Zweitpfade gibt es keine.
- **Der Rhythmus ist unantastbar, nur die SORTE rollt.** `abilityKind` prüft
  ZUERST das Muster (`TIER_PATTERNS`): Auf einer Power-Stufe wird jeder Override
  ignoriert, `retrainSlotOrdinal` liefert dort 0 und die UI zeigt gar keinen
  Knopf. `repairCrewRetrain` wirft beim Laden zusätzlich jeden Eintrag weg, der
  auf einer Power-Stufe sitzt — ein handgeschriebener Save kann das 2P+2S-
  Verhältnis also nicht kippen (die eine Leitplanke des Ideen-Dokuments).
- **Kosten gemessen, nicht geraten: 40 · 2^(Slot−1).** `npm run balance` druckt
  die Splitter-Kurve jetzt als eigenen Abschnitt 7 — Truhen-🧩 aus der
  Sim-Ökonomie plus der Boss-Faucet `bossShardReward`, den das Spiel pro
  Boss-Kill zahlt und den der Bot nicht modelliert (er wird aus der gemessenen
  Bühnen-Kurve rekonstruiert: jeder Lauf clert die Boss-Bühnen 5, 10, … bis zu
  seiner Wand). Gemessen (`SIM_ACTIVE`, 3 cps + Juice, Seeds 1/7/12345):
  45 min → 12 + 36 = **48 🧩** (64/h) · 3 h → 52 + 323 = **375** (125/h) ·
  12 h → 78 + 1 579 = **1 656** (138/h) · 24 h → 121 + 3 253 = **3 375**
  (141/h). Der Beharrungszustand liegt also bei ~140 🧩/h — und der Boss-Faucet
  trägt 96 % davon, die Truhen sind nur die Würze. Daraus die Leiter: **Slot 1
  40 🧩** (die erste Umschulung fällt am ersten Abend, ≈ 20 min Spielzeit),
  Slot 2 80, Slot 3 160, Slot 4 320 (≈ 2.3 h), Slot 5 640. Die Verdopplung je
  Slot spiegelt bewusst den bestehenden Splitter-Sink (Skin-Level `shardCost`,
  ×1.25/Level ⇒ Lv 10 = 100 🧩, Lv 20 = 870, Lv 25 = 2 650): Beide Leitern
  wachsen geometrisch und konkurrieren über die ganze Spielzeit um dieselben
  Splitter, statt dass eine die andere ab Stunde 3 trivialisiert. Zwei Anker in
  `sim.test.ts` frieren die Messung ein (erste Umschulung im ersten Sitting
  bezahlbar, Slot 3 dort noch nicht; 100–200 🧩/h im Beharrungszustand).
- **Währungs-Eskalation statt Echtzeit-Abklingzeit — bewusst gegen die Skizze.**
  Das Ideen-Dokument schrieb „Splitter + Abklingzeit". Ein 24-h-Cooldown
  bestraft aber genau die Spielweise, für die dieses Spiel gebaut ist: Wer
  abends 20 Minuten spielt, sieht seinen zweiten Roll frühestens am nächsten
  Abend und muss sich dafür einen Timer merken. Stattdessen kostet **jeder
  weitere Roll am SELBEN Mitglied in derselben Aszension ×2** (`retrainRolls`,
  Run-Zustand: Alle drei Resets setzen ihn auf 0 zurück). Dieselbe Bremse gegen
  Roll-Spam, aber sie löst sich durch WEITERSPIELEN statt durch Warten — und sie
  ist selbstbegrenzend, weil nach einem Reset ohnehin erst wieder Level und
  Slots gekauft werden müssen, bevor überhaupt etwas zu rollen ist.
- **Zwei Lebensdauern, zwei Felder.** `crewRetrain` ist PERMANENT (überlebt
  Aszension, Himmelfahrt, Transzendenz — wie Vergoldungen und Meisterschaft);
  sonst wäre der Splitter-Einsatz nach der nächsten Aszension verpufft, denn die
  Slots selbst fallen mit `crewUp`. `retrainRolls` ist RUN-Zustand und fällt
  überall mit. Genau deshalb sind es zwei Felder und nicht ein verschachteltes:
  Wer verschiedene Lebensdauern in eine Slice packt, muss sie in jedem
  Reset-Pfad wieder auseinanderklauben.
- **Angebot statt Blind-Roll — und die Ziehung sitzt HINTER der Bezahlung.**
  `retrainOffers(current, r1, r2)` zieht aus dem Pool ohne die aktuelle Sorte,
  entfernt die erste Ziehung vor der zweiten: zwei Angebote, garantiert
  voneinander und von der aktuellen verschieden. Beide Floats kommen aus dem
  persistierten Spiel-Strom (`rng.next()`) — derselben Quelle wie Krits, Truhen
  und Vergoldungen. Gewürfelt wird ERST beim Druck auf „Für X 🧩 umschulen",
  nicht beim Öffnen des Dialogs: Sonst könnte man das Angebot gratis ansehen,
  den Dialog schließen und mit verschobenem Cursor neu würfeln — Save-Scumming
  ohne Save. Bezahlt wird der ROLL, nicht das Ergebnis; „behalten" ist deshalb
  immer erlaubt und macht den Kauf nie schlechter als vorher.
- **UI: der Knopf sitzt an der Kachel, der Dialog gehört dem Charakter.** Jeder
  GEKAUFTE Spezial-Slot trägt unten links ein 16-px-Werkzeug (Schraubenschlüssel
  in der Stroke-Sprache, kein Emoji) — die anderen drei Ecken sind vergeben
  (Haken oben rechts, Sorten-Badge unten rechts). Optisch 16 px, TREFFERFLÄCHE
  28 px über ein `::after`-Inset; nach links wächst die nur in die 9-px-Lücke
  der Slot-Reihe und höchstens auf eine bereits gekaufte (nicht klickbare)
  Nachbarkachel — der Kauf-Knopf steht in der Reihe immer rechts von allen
  gekauften Kacheln. Im delegierten Klick-Handler wird `.ab-rt` ZUERST geprüft
  und beendet den Handler (sonst kaufte derselbe Klick zusätzlich die
  Level-Zeile darunter — die Lektion aus dem Ability-Kauf-Bugfix). Der Dialog
  zeigt das Portrait GROSS (72 px, `av-xl`, auf flachen Geräten 52 px), darunter
  „Aktuell" und — nach der Bezahlung — „Angebot — wähle eine" mit beiden Karten
  UNTEREINANDER: nebeneinander brachen Namen wie „Ekstase-Ladung" mitten im
  Wort. `.btn.ghost` ist für die dunkle HUD gebaut und wäre auf Pergament fast
  unlesbar, also bekommt der Dialog dieselbe Form in Pergament-Tinte; bei
  92 vh scrollt er in sich, statt im Querformat aus dem Bild zu laufen.
- **Der Bot schult NIE um — dokumentierte Untergrenze.** Der Sim hält keine
  Override-Map, seine Läufe sind damit zahlengleich zu einem Save ohne jede
  Umschulung; die Anker bleiben unverändert (nachgemessen: t10 1.7 min, t25
  32.4 min, Wand Bühne 25, erste Himmelfahrt 17.72 h, E2 15 Stufen bei
  Verhältnis ≤ 1.86, E4-Vorsprung ⌀ +12.3, Meisterschafts-Kennlinie identisch).
  Das ist Absicht: Umschulen kostet nur Splitter, die der Bot ohnehin bankt, und
  kann die Sorten-Verteilung im Zweifel nur VERBESSERN — ein optimal
  umschulender Bot wäre schneller als jeder Spieler, und die Anker müssen die
  langsamere Wahrheit messen. Die FALTUNG kann es trotzdem: Ein präparierter
  Zustand mit Override ändert `crewSpecialBonuses`, `dpsOf` und `goldMult` genau
  um den erwarteten Faktor (Tests in `heroes.test.ts`/`ch-state.test.ts`).
- **Save-Schema v14 + X7-Fixture-Paar.** Die Migration v13 → v14 sät bewusst
  LEER: Wer nie Splitter bezahlt hat, trägt überall die Stock-Sorte — genau das
  sagt die leere Map, die Migration ist also verlustfrei UND rückwirkungsfrei
  (anders als bei 1a gibt es hier nichts zu rekonstruieren). Die Matrix hat den
  Bump wie vorgesehen sofort rot gemeldet; ihr neues Paar prüft den gesunden
  v14-Save (zwei umgeschulte Slots + Eskalator-Stand) und den kaputten
  (Override auf einer Power-Stufe, `power` als Sorte, Nicht-Normalform-Schlüssel
  „04", Müll-Id) — übrig bleibt genau der eine legale Eintrag.
- **Headless-Beweis** (Chromium/SwiftShader, Port 4188, präparierter v14-Save
  mit 500 🧩 und gekauften Spezial-Slots): `3b-a-knopf-am-slot.png` +
  `3b-zoom-slots.png` (Werkzeug NUR an den Spezial-Slots — gemessen
  `boss#2, boss#4, hype#3, hype#4, dj#2, dj#3`, also exakt die Rhythmus-Slots),
  `3b-b1-dialog-vorschau.png` (Portrait groß, aktuelle Sorte, „Für 40 🧩
  umschulen"), `3b-b2-dialog-angebote.png` (zwei Angebote: beat + ekstase,
  Splitter 500 → 460), `3b-c1-nach-roll-toast.png` (Toast „Umgeschult! ·
  Stufe 2: Beat-Fenster") + `3b-zoom-slots-nachher.png` (das Badge der Kachel
  ist von Krit-Schaden auf die Beat-Note gewechselt), `3b-d-eskalation.png`
  (zweiter Roll am selben Mitglied: „Für 80 🧩 umschulen · 1. Umschulung dieser
  Aszension"; ein anderes Mitglied kostet weiter 40), `3b-e-klick-regression.png`
  (ein Klick auf den Umschul-Knopf lässt Level UND Kontostand unberührt; EIN
  Klick auf den Kauf-Slot kauft die Stufe (dj 3 → 4), EIN Klick auf die Zeile
  ein Level (Türsteher 150 → 151)) sowie `3b-m-portrait/-schmal/-landscape.png`
  (390×844, 320×640, 740×380 — kein horizontaler Überlauf, im Querformat
  scrollt der Dialog in sich). Bundle nach der Änderung: **846 KB JS**
  (Budget 1.5 MB).

## IDEEN-GAMEPLAY Schritt 2 — 1a Crew-Meisterschaft

- **Einsatz-XP sind gekaufte LEVEL, nicht gehaltene.** `crewMastery` ist ein
  reiner Highwater je Mitglied: `Crew.buy` bucht jeden gekauften Level (auch
  ×10/Max, auch das „Anheuern"), und KEIN Reset fasst ihn an — `ascendState`,
  `himmelfahrtState` und `transcendState` tragen ihn alle drei weiter, während
  Level und Fähigkeits-Ledger fallen. Geschenkte Level (Himmelsbaum-
  „Frühstarter", Mythos-„Frühstart") zahlen bewusst NICHTS ein: Meisterschaft
  soll Einsatz messen, nicht Ausstattung. Deshalb klemmt `repairCrewMastery` die
  Zahl auch in KEINE Richtung an `crew` — nach jedem Reset steht das Level auf 0
  und die Lebenszeit-Zahl hoch (das ist der ganze Sinn), und ein Level aus einer
  Geschenk-Quelle hat nie XP gezahlt. Ein Highwater darf ohnehin nur wachsen.
- **Die Schwellen sind gemessen, nicht geraten — und deutlich höher als die
  Skizze.** Der Bot zählt die Einsatz-XP jetzt mit (`sim.ts` → `RunResult.mastery`),
  `npm run balance` druckt die Kennlinie als eigenen Abschnitt 6. Gemessen
  (Profil `SIM_ACTIVE`, 3 cps + Juice, volle Loot-Ökonomie, Seeds 1/7/12345, das
  jeweils STÄRKSTE Mitglied): 45 min → 167/234/167 · 3 h → 1 448 · 12 h → 6 951 ·
  24 h → 14 345 · 72 h → 43 487. Nach den ersten Stunden wächst der Zähler fast
  linear mit ~450 Level je 45-min-Lauf (die ×1.075-Kostenleiter frisst jeden
  Meta-Zuwachs logarithmisch wieder auf). Daraus: **Bronze 150** (fällt in der
  ersten Sitzung, aber nur für das Mitglied, an dem man hängt — Platz 2 lag bei
  138, Platz 3 bei 116), **Silber 1 200** (~3 h), **Gold 8 000** (~13 h),
  **Legende 60 000** (~100 h aktives Spiel ⇒ bei einer Stunde am Abend die
  „vielen Wochen" aus dem Ideen-Dokument). Die skizzierten 100/500/2 500/10 000
  hätten Legende an EINEM Wochenende ausgeliefert; die Leiter ist deshalb bewusst
  über-linear gespreizt. Zwei Anker in `sim.test.ts` frieren die Messung ein
  (Bronze nach einem Sitting, Silber nach vier Läufen — Gold noch nicht).
- **Drei Ränge zahlen Prozente, der vierte zahlt einen SLOT.** +2 % Eigen-Output
  je Rang, gedeckelt bei drei Rängen ⇒ exakt die +6 % der Leitplanke (das
  Ideen-Dokument erlaubte ≤ +8 %). Legende zahlt bewusst keinen vierten
  Prozentpunkt, sondern die Gratis-Erststufe: Permanenz, die man SIEHT (der Slot
  steht nach jedem Reset sofort da), statt einer weiteren stillen Zahl im
  DPS-Produkt. Der Faktor hängt in genau EINER Multiplikation
  (`heroDps`/`heroClick`), also lesen Spiel, Sim-Bot, Kauf-Tipp und Crew-Card
  dieselbe Zahl; beim Klick-Mitglied trifft er folgerichtig den Klick.
- **Der Gratis-Slot ist eine pure Funktion, kein Sonderfall im Kauf-Code.**
  `grantFreeMasteryTiers(levels, ups, mastery)` liefert einen neuen Ledger plus
  die frisch beschenkten Ids (und bei „nichts zu tun" den IDENTISCHEN Ledger
  zurück, damit der Aufrufer gratis prüfen kann). Die Glue ruft sie an vier
  Stellen: Boot, nach jedem Crew-Level-Kauf, nach jedem der drei Resets und nach
  einem Save-Import; der Bot an einer (nach `buyCrewGreedy`). Damit fällt der
  Slot in der Sekunde, in der Lv 25 steht — nicht erst beim nächsten Reset — und
  ist trotzdem idempotent (zweimal aufgerufen schenkt er kein zweites Mal).
  Headless verifiziert: frisch aszendiert, 3× ×10 auf den Booty-Boss ⇒ Lv 30,
  `crewUp.boss = 1`, Kontostand 5 000 000 → 4 999 485 BP (= exakt die 515 BP
  Level-Kosten, die 274 BP der Fähigkeits-Stufe wurden NICHT abgebucht).
- **`--av-frame` war schon der Haken — es ändert sich kein Selektor.** Schritt 4b
  hatte die Rahmenfarbe als PER-ZEILE-Variable angelegt; `portraitTile` bekommt
  nur einen optionalen `frame`-Parameter, und die Crew-Card schickt Kupfer/
  Silber/Gold hinein. Der Legenden-Regenbogen läuft NICHT über die Variable,
  sondern über die Klasse `mr4` mit einer `border-color`-Keyframe-Animation: Eine
  CSS-Animation schlägt in der Kaskade auch die Inline-Deklaration, die Variable
  bleibt also der Fallback. Die Fortschritts-Zeile („Meisterschaft: Silber ·
  1.450/8.000") steht unter der Beschreibung — mit `fmtInt` (deutsche
  Tausenderpunkte, kein `toLocaleString`: in jsdom/Node ist auf ICU kein Verlass),
  weil `fmt` daraus „1.45K/8.00K" gemacht hätte, was als Fortschrittsanzeige
  unbrauchbar ist.
- **Schema v13 statt v12 — die Wochen-Bestzone hatte v12 schon verbraucht.** Die
  Migration v12→v13 sät die Meisterschaft aus dem AKTUELLEN `crew`-Stand: Die
  Level, die ein Spieler gerade hält, hat er nachweislich einmal gekauft. Bei 0
  zu starten wäre die genauso falsche Behauptung „du hast nie ein Level gekauft"
  und träfe ausgerechnet die treuesten Spielstände; alles davor ist aus einem
  Alt-Save nicht rekonstruierbar. Ein frisch aszendierter Alt-Save startet
  folgerichtig leer. Die X7-Matrix hat den Bump wie vorgesehen sofort rot
  gemeldet und ihr Fixture-Paar erzwungen (v13-Tafel bewusst ÜBER dem Crew-Stand,
  weil der Save schon aszendiert hat).
- **Balance-Snapshot vorher/nachher (`npm run balance`, Seeds 1/7/12345).**
  Pacing im ersten Sitting UNVERÄNDERT (t10 1.7 min, t25 32.4 min, Wand ⌀ Bühne
  25.0) — in 45 min erreicht nur EIN Mitglied Bronze, das sind +2 % auf eine
  Linie ≈ +0.5 % Gesamtleistung. Erste Himmelfahrt 17.86 h → 17.72 h (−0.8 %).
  E2: unverändert 15 Stufen je Seed, schlimmstes Verhältnis 0.93/0.84/1.86 →
  0.93/0.83/1.86 (Anker ≤ 2.00), Aszensionen 15/15/13 → 14/13/13. E4-Vorsprung
  über fünf Seeds IDENTISCH (+7/+25/+5/+10/+14). t75 (1 cps, mit Loot) im Mittel
  3.41 h → 3.16 h; der BINDENDE Wert ändert sich dabei nicht (schnellster Seed
  3.13 h vorher wie nachher — Seed 1 rutscht von 3.90 h ins Feld), Anker-Fenster
  [3 h, 7.5 h] hält.
- **Die einzige auffällige Zahl — E3 „größte Lücke" — ist ein Wand-Effekt, kein
  Einbruch.** Über acht Seeds gemessen: +50-%-Stufen 52.8 → 55.1 im Mittel (also
  MEHR Machtsprünge), größte Lücke aber 17.5 min → 48.7 min im schlimmsten Seed.
  Nachgemessen, wo die Lücke sitzt: bei Seed 7 zwischen Stufe 49 und 50, bei 11
  zwischen 46 und 47, bei 12345 zwischen 57 und 58 — IMMER die allerletzte, also
  im Plateau NACH dem Erreichen der z75-Wand, nie im Aufstieg. Der Bot kommt mit
  der Meisterschaft früher an die Wand und sitzt den Rest seiner 20 Aszensionen
  dort; während des Kletterns bleiben die Lücken bei ≤ 6.5 min. Anker (≤ 90 min)
  behält damit 1.8× Luft, E3 bleibt grün, keine Nachjustierung nötig.
- **Der ROI-Greedy sieht den Perk — bewusst.** `bestCrewBuy` bekommt die Tafel
  als optionalen Parameter (fehlt ⇒ ×1, jeder Alt-Aufrufer bleibt zahlengleich).
  Der Meisterschafts-Faktor kürzt sich im Grenznutzen NICHT heraus, er hebt die
  Rangfolge eines gemeisterten Mitglieds um genau seine 2–6 %. Bot und
  in-game-Kauf-Tipp (`advisor.ts`) lesen weiter dieselbe eine Funktion; die
  Tipp-Cache-Signatur braucht die Tafel nicht, weil sie sich nur ZUSAMMEN mit
  einem Level-Kauf ändern kann, der schon drinsteht.
- **Headless-Beweis** (Chromium/SwiftShader, Port 4188, präparierter v13-Save mit
  gestaffelten Rängen): `1a-a-crew-raenge.png` (alle vier Rahmen gleichzeitig —
  Legende/Gold/Silber/Bronze plus ein rangloses Mitglied mit „96/150 → Bronze"),
  `1a-b-card-fortschritt.png` + `1a-b2-card-legende.png` (Card-Nahaufnahmen),
  `1a-c-rangaufstieg-toast.png` (ein Kauf über die Silber-Schwelle ⇒ Toast
  „Meisterschaft: Silber — DJ Wumms — +4 % Eigen-Leistung"),
  `1a-d-legende-gratisslot.png` (frisch aszendiert, Slot geschenkt + Toast
  „Legenden-Bonus"). Bundle nach der Änderung: **839 KB JS** (Budget 1.5 MB).

## IDEEN-GAMEPLAY Schritt 1 — 4a+4b Avatar-System

- **Ein `<symbol>`-Sprite, zwei Knoten pro Zeile — die 0.25-s-Regel diktiert die
  Architektur.** Die Crew-Liste wird im Idle-Tick komplett neu aus einem
  HTML-String gebaut. Ein Portrait als eigenes SVG-Geflecht wäre pro Zeile ~15
  Knoten gewesen, also bei 15 Mitgliedern × (1 Karte + n Fähigkeits-Kacheln)
  mehrere hundert Knoten, die viermal pro Sekunde entstehen und sterben.
  `mountAvatarSprite()` hängt die GEOMETRIE deshalb genau einmal beim Start in
  den Body (50 Symbole = 25 Charaktere × 2 Posen); jede Zeile trägt nur noch
  `<svg><use href="#av-dj"/></svg>`. Ein Test zählt die `<`-Zeichen im
  Zeilen-Markup (genau 3) und verbietet dort jedes `<path`/`<circle` — dieser
  Guardrail kann nicht still verrutschen.
- **Die Tinte erbt sich, die Palette wird gebacken.** Innerhalb eines Symbols
  sind alle Striche `currentColor` — dasselbe Prinzip wie die Tab-Ikonen. Das
  Portrait ist damit auf der Pergament-Karte braun, auf einer gekauften
  Fähigkeits-Kachel grün und auf der pulsenden Kauf-Kachel gold-tinten, ohne dass
  irgendwer eine Farbe setzt. Die MITGLIEDS-Palette (Haar, Accessoire) steht
  dagegen als Literal im Symbol, weil sie pro Charakter fix ist; nur die
  Rahmenfarbe reist als `--av-frame` mit der Zeile mit. Ein `color`-Fallback auf
  `--parch-ink` steht auf `.av` selbst — ohne ihn erbte die Crew-Card die HELLE
  Body-Textfarbe (im ersten Beweis-Screenshot waren die 48-px-Portraits blass;
  die Ahnen-Zeilen sahen richtig aus, weil sie in `.nm` liegen, das die
  Pergament-Tinte schon setzte).
- **Die Power-Pose ist reine Silhouette — Fäuste wurden zu „oIo".** Der erste
  Entwurf gab der Power-Variante zwei geballte Fäuste links und rechts eines
  Brustbeins. Im Portrait-Sheet las sich das als Buchstabenfolge, nicht als
  Muskel. Der zweite Entwurf mit Funken in den Ecken schied ebenso aus: genau
  dort sitzen bei der Hälfte des Kaders die Signaturen (Klemmbrett, Dreizack,
  Solarpanel, Mischpult). Was trägt: kurzer Hals, breitere kantige Schultern,
  Trapez-Falten, Brustbogen — plus Strichdicke 1.75 statt 1.4 und ein
  Power-Gesicht (gesenkte Brauen, Schrei-Mund). Der Unterschied ist auf 32 px
  sofort lesbar, ohne einen einzigen Pixel in den Accessoire-Zonen.
- **Kopfform + Frisur variieren, damit das Accessoire nicht allein trägt.** 8
  Kopfformen × 10 Frisuren, handgesetzt in `AVATAR_TABLE` — zwei Portraits
  unterscheiden sich nie NUR über ihr Signatur-Objekt. Unbekannte Ids fallen auf
  einen FNV-1a-Hash der Id zurück (ein künftig erfundenes Mitglied hat sofort ein
  stabiles Gesicht statt gar keins); ein Test hält mit `hasHandSetPortrait` fest,
  dass kein BESTEHENDES Mitglied still in diesen Fallback rutscht.
- **Die 10 Skins bekommen echte Renders, keinen Baukasten — und dafür eigene
  Thumbnails.** `models/renders/character-*.jpg` sind 576×576-Ganzkörper-Posen
  und liegen NICHT im Vite-`public/`. Statt sie zu kopieren (10 × ~19 KB, und für
  eine 42-px-Karte 13× zu groß) erzeugt ein einmaliger PIL-Lauf 96×120-Büsten:
  Motiv-Bounding-Box gegen die einheitliche Hintergrundfarbe, Kopfmitte aus dem
  obersten Fünftel, obere 52 % der Figur als 4:5-Ausschnitt, JPEG q80.
  Ergebnis: `apps/game/public/avatars/skin-*.jpg`, **21.6 KB für alle zehn**
  (1.7–2.5 KB je Bild). Erzeugt mit
  `python3 <scratchpad>/make-skin-thumbs.py` (Skript im DECISIONS-Text
  dokumentiert, nicht im Repo — es läuft einmal pro Render-Neuexport). Keine
  neue Dependency, kein Build-Schritt: die Thumbnails sind eingecheckte Assets.
  Bundle nach der Änderung: **836 KB JS** (Budget 1.5 MB), `dist` gesamt 945 KB.
- **Der Tier-Rahmen sagt WIE TIEF, die Sorten-Tönung WAS, das Portrait WER.** Die
  Fähigkeits-Kachel hatte bisher nur die Sorten-Farbe. Jetzt kommen drei
  unabhängige Kanäle zusammen, ohne sich zu überlagern: Rahmenfarbe je zwei
  Stufen eine Klasse höher (Kupfer→Silber→Gold→Platin→Prisma, gedeckelt), die
  bestehende `k-*`-Füllung, und Portrait + Pose. Die gekaufte Kachel trägt
  zusätzlich den Haken oben rechts — der Sorten-Badge unten rechts bleibt, damit
  auch bezahlte Stufen noch verraten, was sie waren (vorher: nur ein Haken).
- **Die Kauf-Fläche wurde GRÖSSER, nicht kleiner.** Die Kachel wächst von 28 auf
  32 px, der Zeilen-Abstand von 5 auf 9 px (Badge und Haken ragen über den Rand)
  und `.ab-slots` darf jetzt umbrechen. Jeder Portrait-Knoten steht auf
  `pointer-events: none`, damit `closest('.ab.ready')` bzw. `closest('.item')`
  weiter die Kauf-Fläche selbst sieht — die Delegations-Klicklogik in `crew.ts`
  und der `pointerHeld`-Aufschub blieben unangetastet. Nachgewiesen headless:
  ein 320-ms-Press EXAKT auf die Portrait-Grafik im Kauf-Button kauft beim
  ERSTEN Mal, ein Klick exakt auf das 48-px-Karten-Portrait kauft ein Level, und
  der alte `verify-abilityclick`-Lauf (10 Schnellklicks) zählt weiter alle zehn.
- **Himmelsbaum und Mythos bleiben gesichtslos — bewusst.** Ihre Knoten sind
  Konzepte, keine Personen (Grenze aus IDEEN-GAMEPLAY 4b). Ahnen dagegen sind
  benannte Charaktere und bekommen denselben Baukasten mit eigener
  Signatur-Zeile: Twerkules Lorbeer + Bart, Poposeidon Dreizack + Wellenbart,
  Cheeksana Sturmauge, Glutaeus Gladiatorenhelm, Chronilla Sanduhr, Peachiel
  Heiligenschein + Flügel, Wackelias Anker, Beatrix Taktstock + Note, Truhilda
  Schlüssel, Ekstasius Flammenkrone.

## ROADMAP-V2 Nachzügler — G5 Gesichter leben

- **Verstecken heißt `scale ≈ 0`, nicht `visible = false` — sonst frisst der
  Export die neuen Meshes.** Lider und O-Mund ruhen 99 % der Zeit unsichtbar;
  der naheliegende Weg wäre `visible = false` gewesen. Der `models/`-Export
  (`dev/export-models.ts`) fährt aber `GLTFExporter` mit dessen Vorgabewert
  `onlyVisible: true` — unsichtbare Knoten wären STILL aus den 22 .glb-Dateien
  gefallen, und niemand hätte es gemerkt, weil der Export weiter „✓" meldet.
  Also bleiben die Meshes sichtbar und ruhen auf `REST_SCALE = 0.001`
  (sub-pixel im Bild, vollwertiger Knoten in der Datei). Nachgewiesen im
  exportierten `character-classic.glb`: die Knoten `lidL`/`lidR`/`mouth-o`
  stehen mit Matrix (Skalierung 0.001) und Material-Index in der glTF-JSON.
- **Das Lid fällt von OBEN, weil die Geometrie versetzt ist — nicht der Pivot.**
  Ein Lid, das aus der Augenmitte heraus wächst, sieht aus wie ein Zwinkern,
  nicht wie ein Blinzeln. Statt dafür eine Zwischen-Group (und damit einen
  Quasi-Bone) einzuziehen, wird die Kugel-Geometrie einmalig um ihre halbe Höhe
  nach unten verschoben (`geometry.translate`): der Objekt-Ursprung sitzt damit
  am oberen Lidrand, `scale.y` fährt das Lid herunter wie ein echtes Lid. Kein
  neuer Bone, kein neuer Knoten im Skelett — der Physik-Kontrakt bleibt
  wortgleich (`stepPhysics`/`applyPose`/`renderCheeks` schreiben nur Bones,
  G5 nur deren Kind-Meshes, und zwar NACH dem Physik-Schritt).
- **Bei geschlossenem Lid verschwindet die Pupille — Tiefen-Sortierung ist hier
  kein Verlass.** Das Lid steht bei z = 0.30 vor der Pupillen-Kuppe (0.349),
  aber Kopf-Neigung, Kamera-Winkel und die Cel-Outline machen aus zwei
  Millimetern schnell einen sichtbaren Durchstich. Ab `lidClose ≥ 0.6` fährt
  die Pupille deshalb auf `REST_SCALE` — der billigste mögliche Anti-Glitch,
  und weil das Lid dann ohnehin fast zu ist, sieht es niemand verschwinden.
- **Die Pupillen tracken eine RICHTUNG, keinen Punkt.** `aimPupils` rechnet die
  Weltposition des Rivalen per `worldToLocal` in den Kopf und normiert sie; erst
  daraus wird der Versatz (`× 0.06`, geklemmt auf ±0.02). Damit ist der Blick
  unabhängig von der Entfernung (Boss steht weiter hinten, Rivale näher) und
  kann bei einer 360°-Drehung nicht überschießen. Gezielt wird auf
  `entity.root` + 2.2 (`RIVAL_AIM_UP`) — der Wurzelpunkt des Rivalen steht auf
  dem BODEN, ohne den Aufschlag starrte die Tänzerin ihm auf die Füße.
  Nachgezogen wird exponentiell (6/s), das ist der ganze Laufzeit-Aufwand.
- **Grimasse schlägt Ekstase.** Beide wollen den Mund. Ein Boss-Timeout wirft
  einen aus dem Kampf zurück — dass das ×10-Fenster technisch noch offen ist,
  interessiert im Gesicht niemanden. `faceView` entscheidet in dieser
  Reihenfolge, ein Test hält sie fest.
- **Die gedrehte Mundkurve muss auch FALLEN — das hat erst der Beweis-Lauf
  gezeigt.** „Torus um 180° drehen" allein ergibt eine Grimasse, die aussieht
  wie ein Schnurrbart: der Halb-Torus wölbt sich um seinen eigenen Radius nach
  OBEN und legt sich um die Nase. Die Grimasse senkt den Bogen deshalb
  zusätzlich um genau diesen Radius (`frownY = smileY − grin`) — dann liegen die
  herabgezogenen Mundwinkel dort, wo vorher die Lächel-Enden saßen. Ohne den
  Screenshot wäre das nie aufgefallen; die Zahlen (Rotation gedreht, Timer
  läuft) waren die ganze Zeit korrekt.
- **Alles wird ABSOLUT aus der Ruhelage geschrieben, nie inkrementell.**
  Brauen-Rotation = `baseZ + side · GRIMACE_BROW · brow`, Mund-Drehung/-Höhe =
  `smileZ`/`smileY` bzw. `frownZ`/`frownY`, Pupille = `base + Versatz`. Nach der Grimasse steht die Braue damit BYTE-gleich
  wieder auf ihrem Bau-Wert (im Test mit `toBe`, nicht `toBeCloseTo`, geprüft) —
  ein additiver Effekt hätte über Stunden gedriftet, weil hier — anders als bei
  den Klick-Akzenten — kein Physik-Schritt hinterherräumt.
- **Robo und Ninja haben kein Gesicht — und bekommen auch keins.** Beide bauen
  `face()` gar nicht auf (Visor bzw. Maskenschlitz). Die `FaceRig`-Listen
  bleiben dort leer, `applyFace` ist ein No-op. EINE Ausnahme, weil sie zwei
  Zeilen kostet: der Robo registriert seine zwei Visor-Pixel und fährt sie im
  Blinzel-Takt auf 15 % Höhe zusammen — ein Maschinen-Blinken. Der Ninja bleibt
  bewusst starr; glühende Maskenaugen, die blinzeln, sähen aus wie ein Wackel-
  kontakt.
- **Kein Quality-Schalter, bewusst.** Die Guardrail „jeder neue Effekt hängt an
  `engine/quality.ts`" zielt auf Kosten; G5 hat keine: die Meshes entstehen mit
  dem Kopf (zwei Lider + ein Ring, dieselben Materialien wie das übrige Gesicht,
  also KEIN zusätzlicher Draw-Call-Batch), und pro Frame laufen ein Timer, ein
  Lerp und ~8 Schreibvorgänge auf `scale`/`position`/`rotation`. Das Abfragen
  eines Presets wäre teurer als der Effekt. Auch `low` blinzelt und trackt.
- **Der wichtigste BEFUND des Pakets steht nicht im Code: die Tänzerin zeigt der
  Kamera fast immer den Rücken.** Das Rig schaut in +z, die Diorama-Kamera steht
  bei −z — das ist Absicht (die Kernanimation ist das Twerken). Ihr GESICHT
  sieht man nur im Show-Spin: alle 12 s dreht sich die Figur 0.9 s lang einmal
  um sich selbst. G5 ist damit ein Effekt für diesen Moment (und für die
  models/-Exporte, die die Gesichter frontal zeigen) — die Beweis-Serie musste
  entsprechend AUF den Spin getimt werden. Wer mehr Gesicht will, braucht einen
  eigenen Anlass (z. B. Zuwenden bei Boss-Auftritt/Kill), nicht mehr
  Gesichts-Zustände.
- **Beweis-Handwerk: Screencast statt Einzelbild, und `chFace` misst statt
  rät.** Unter SwiftShader läuft das Spiel ~0.5 fps, die Spielzeit ist über den
  `dt`-Deckel (0.05 s) an die FRAMES gekoppelt: ein 0.9-s-Spin besteht aus genau
  ~18 Frames, und `Page.captureScreenshot` kostet je ~5 davon — jedes Einzelbild
  rutschte am frontalen Moment vorbei. Also: `Page.startScreencast` schneidet
  das ganze Fenster mit, eine Zustands-Spur (`window.chFace.state()`) läuft
  parallel, und jeder Frame trägt seine gemessenen Zahlen (Lid-Schluss,
  Pupillen-Versatz, Mund) im Dateinamen. Gewartet wird im 260-px-Viewport
  (schnelle Frames ⇒ die Spielzeit rast), aufgenommen im großen — das ändert
  nichts am Spiel, nur an der Füllrate. `Emulation.setVirtualTimePolicy` taugt
  dabei NUR als Standbild-Taste: `pause` friert das Spiel sauber ein (der
  Screenshot zeigt dann garantiert den Zustand, den `chFace` gemeldet hat — so
  entstand das Bild mit geschlossenen Lidern), aber ein Budget-Vorlauf erzeugt
  KEINE neuen rAF-Frames (die hängen am Compositor). Frame für Frame durch den
  Spin steppen geht damit nicht.
- **Gemessen, nicht behauptet.** Boss-Timeout auf dem ECHTEN Weg (kein
  Debug-Hook): bei Spielzeit 30.1 s meldet `tickBoss` den Fehlschlag, das Spiel
  wirft auf Bühne 4 zurück, der Toast „⏱ Zeit um!" steht, `chFace` liest
  `mouth: frown`, Rest-Grimasse 1.35 s — und 1.5 s Spielzeit später wieder
  `smile`. Pupillen über einen ganzen Spin: +0.020 → −0.014 → +0.019, die
  Klemme ±0.02 wird nie verletzt. Handle-Abdeckung über alle zehn Skins:
  7 × zwei Lider, Pirat 1 (Augenklappe!), Robo + Gyrator 0 Lider und je zwei
  Visor-Pixel, Neon (Ninja) 0/0.

## ROADMAP-V2 Schritt 11 — X6 Mobile-QA + P5 Balance-Ritual

- **Der schlimmste Mobil-Befund war kein Telefon im Hochformat, sondern das
  QUERformat.** Portrait (402×850) hatte lauter kleine Wunden — Touch-Ziele
  zwischen 20 und 37 px, die Hinweiszeile unter dem Mute-Knopf, 4 px Crew-Knopf
  in der HUD-Karte, ein neunter Reiter hinter einem Seitwärts-Scroll _ohne
  Balken_. Eine kleine Landscape (740×360) dagegen war ein Trümmerhaufen: die
  Ekstase-Leiste lag zu 280 × 42 px auf der Rivalen-Karte, der Crew-Knopf zu
  33 × 33 px auf dem Zonen-Strip, der Mute-Knopf auf Karte und Boss-Knopf, und
  die Rivalen-Karte endete 26 px UNTER der Falz. Ursache: über 640 px Breite
  greift das 50/50-Layout (Bühne rechts, Overlay-Spalte auf 75 %) — es fragt
  aber nur nach BREITE. Ein Landscape-Telefon ist breit und flach, also bekam es
  die Desktop-Maße auf 360 px Höhe. Lehre für die Zukunft: jede Layout-Abfrage
  in diesem Projekt, die eine Spalte stapelt, braucht ihr Höhen-Gegenstück.
- **Die Reparatur ist eine `max-height`-Abfrage, keine zweite Breiten-Abfrage.**
  `@media (max-height: 480px)` schnürt die Kopf-Spalte zusammen (BP 40 → 24 px,
  Karten-Polster halbiert, Strip-Kacheln 46 → 40 px = exakt die Touch-Grenze)
  und legt Ekstase + Mute an den unteren Rand; ein zweiter Block
  `(min-width: 641px) and (max-height: 480px)` verschiebt NUR die horizontale
  Hälfte (Overlay-Spalte 75 % → 66 %, am Crew-Knopf vorbei). Getrennt, weil ein
  640 × 360-Gerät die Höhen-Kur braucht, aber weiter das Bottom-Sheet-Layout
  fährt. Der Block steht am ENDE des Stylesheets — `.zs`/`.zonestrip` werden
  weiter oben definiert, und Media-Queries erben keine Spezifität.
- **Die Tutorial-Zeile verschwindet auf flachen Viewports ganz.** Sie lag quer
  über der Rivalen-Karte, und auf 360 px Höhe ist eine Zeile, die sich nach 26 s
  ohnehin wegblendet, kein Platz wert. Sie ist die EINZIGE Sache, die X6
  ausblendet — alles andere schrumpft nur.
- **44 px statt 40 px, wo Platz ist.** Die Messlatte des Pakets war „≥ 40 px",
  die Portrait-Fixes gehen auf 44 (Kauf-Mengen, Kulissen, Skin-Knöpfe,
  Boss-Knopf, Board-Wechsler); in der flachen Landscape, wo jede Zeile zählt,
  bleibt es bei 40. Die Reiter gehen auf 44 px Mindestbreite: neun Reiter à 56 px
  ergaben 448 px auf einem 399 px breiten Blatt, „⚙️ Mehr" war praktisch
  unerreichbar. Mit 44 px passen alle neun nebeneinander, und „Himmel" (die
  längste Beschriftung, 9.5 px) passt weiterhin hinein.
- **Der Zonen-Strip war schon in Ordnung — gemessen, nicht geraten.** Sieben
  Slots (fünf Bühnen + „…"-Lücke + Frontier) belegen im Portrait 320 px in einer
  370 px breiten Karte, jede Kachel 46 × 51 px inkl. Mod-Abzeichen und
  Stern-Pips. Der Lücken-Slot ist mit 20 × 19 px klein, aber er ist ein
  Trennzeichen und kein Knopf — er wurde bewusst NICHT aufgeblasen. Ebenfalls
  gemessen und bewusst gelassen: `scrollWidth` des Strips liegt 4 px über der
  Box, weil die aktive Kachel um 1.16 skaliert; die Karte hat 22 px Polster,
  es wird nichts abgeschnitten.
- **fps: SwiftShader taugt nur als RELATIV-Maß — und sagt hier etwas
  Unerwartetes.** Über je 5 s gemessen (rAF-Delta, Bühne 12, Preset-Vorgabe
  „high"): Portrait 402 × 850 → 1350 ms/Frame (0.7 fps), Landscape 740 × 360 →
  536 ms/Frame (1.9 fps). Die Gerätepixel-Dichte ist dabei fast egal (DPR 2 → 1
  bringt nur −5 % bzw. −9 %), also ist der Software-Rasterizer NICHT
  füllraten-, sondern pass-gebunden. Draw-Calls: Portrait 179, Landscape und
  Desktop je 236 — beide unter dem 250er-Budget, und das Hochformat hat sogar
  WENIGER. Der Portrait-Rückstand ist damit eine Eigenschaft des
  Software-Rasterizers über einem hohen, schmalen Puffer, keine Spiel-Eigenschaft
  — die X6-Änderungen sind ohnehin reines CSS und bewegen ihn nicht.
- **Offen und ehrlich benannt: das Mobil-Preset wählt sich nicht selbst.**
  `settings.quality` steht per Vorgabe auf `high` (Pixel-Ratio-Deckel 2, Schatten,
  Bloom, volle Ambient-Dichte); eine Geräte-Erkennung gibt es nicht. Die
  Roadmap-Latte „60/30 fps Desktop/Mobil-Preset" hängt also an einer manuellen
  Einstellung. Das zu drehen ist Logik, nicht Layout — X6 war ausdrücklich eine
  CSS-Runde, also bleibt es hier als benannte Restschuld stehen statt als stille
  Änderung.
- **P5: `npm run balance` läuft über node + esbuild, nicht über den
  Test-Runner.** Zwei Wege standen zur Wahl: ein `balance.report.test.ts`, das
  eine Tabelle druckt und immer grün ist, oder ein Skript, das die TS-Module
  bündelt und abtastet. Der Test-Runner-Weg hätte die Tabelle bei JEDEM
  `npm test` mitlaufen lassen (+15 s) und einen Test erfunden, der nichts
  behauptet. Das Skript folgt stattdessen dem Muster, das schon
  `tools/blender/dump_poses.mjs` vorgibt: esbuild (über Vite ohnehin im Baum,
  also keine neue Dependency) bündelt `game/sim.ts` + `game/weekly.ts` nach ESM,
  node importiert und misst. Laufzeit 9.8 s gegen ein 60-s-Budget; das Skript
  bricht selbst ab, wenn es das Budget reißt.
- **Keine Zweitimplementierung — die Bot-Profile sind jetzt geteilt.**
  `SIM_ACTIVE`, `SIM_ACTIVE_CAL`, `SIM_RUN_S` und `SIM_SEEDS_HEAVY` standen als
  lokale Konstanten in `sim.test.ts` und wären im Skript ein zweites Mal
  getippt worden — das driftet irgendwann. Sie stehen jetzt in `sim.ts`, und
  BEIDE Seiten importieren sie; ein Test pinnt ihre Werte, damit eine Änderung
  laut wird statt still jede Kennlinie zu verschieben. Die Zahlen selbst kommen
  ausschließlich aus `simulateSingleRun`/`simulateRunChain`/
  `simulateAscensionEra`/`simulateContinuous` — denselben Funktionen wie die
  Anker, mit denselben Optionen.
- **Die Tabelle nennt neben jedem Block seinen Anker.** Sie ist kein Gate (rot
  wird nur `npm test`), sondern der Kontostand daneben: „t25 32.4 min · Anker
  ~30 min ±25 %" liest man in zwei Sekunden, „E2-Verhältnis 1.86 · Anker ≤ 2.00"
  auch. So sieht man eine Verschiebung, BEVOR ein Anker reißt — genau der Zweck,
  den P5 der Roadmap versprochen hat.

### Balance-Snapshot (2026-07-27, Seeds 1/7/12345 — `npm run balance`)

```
── 1 · Pacing im ersten Sitting · Bot 3 cps + Juice, OHNE Loot (§4.8-Kalibrierung)
Seed    t10 [min]   t20 [min]   t25 [min]   t30 [min]   Wand-Bühne
────────────────────────────────────────────────────────────────────
1             1.7        13.7        35.8       n. e.           25
7             1.7        13.9        33.9       n. e.           25
12345         1.7        13.4        27.4       n. e.           25
   Anker: t10 ~1.75 min ±25 % · t25 ~30 min ±25 % (+5) · Bühne 30 NICHT im ersten Sitting
   Mittel: t10 1.7 min · t25 32.4 min · Wand ⌀ Bühne 25.0

── 2 · Kumulierter Marsch · Bot 1 cps ohne Juice, MIT Loot (14 × 45 min)
Seed    t50 [h]   t75 [h]   Beste Bühne   Seelen-Bank
───────────────────────────────────────────────────────
1          2.84      3.90            75          1295
7          2.72      3.13            75          1295
12345      2.29      3.20            75          1295
   Anker: t75 in [3 h, 7.5 h] · Mittel t75 3.41 h

── 3 · Erste Himmelfahrt · Bot 0.7 cps ohne Juice, OHNE Loot (RS-Lebenszeit ≥ 1000)
Seed    Himmelfahrt [h]   Durststrecke [min]   +50 %-Stufen   Aszensionen   Tiefste Bühne
───────────────────────────────────────────────────────────────────────────────────────────
1                 17.36                 93.7             74             8              75
7                 19.06                 98.1             71            10              75
12345             17.17                 98.2             73             8              75
   Anker: Himmelfahrt in [11.6 h, 19.4 h] · Durststrecke ≤ 105 min
   Mittel: 17.86 h · längste Durststrecke 98.2 min

── 4 · E2 weiche Wand · adaptive Aszension + Ahnen + Himmelfahrt + Baum
Seed    +5-Stufen   schlimmstes Verhältnis   Aszensionen   Himmelfahrten   HPF   Baum-Stufen   Beste Bühne
────────────────────────────────────────────────────────────────────────────────────────────────────────────
1              15                     0.93            15               1     1             0            75
7              15                     0.84            15               1     1             0            75
12345          15                     1.86            13               1     1             0            75
   Anker: ≥ 14 Stufen · Verhältnis ≤ 2.00 · ≥ 1 Himmelfahrt über ≥ 8 Aszensionen

── 5 · E3 Lebendigkeit (20 Aszensionen) + E4 Klick-Vorsprung (45 min)
Seed    E3 +50 %-Stufen   E3 größte Lücke [min]   aktiv   gemächlich   E4-Vorsprung
─────────────────────────────────────────────────────────────────────────────────────
1                    55                     6.0      30           23             +7
7                    49                     5.5      45           20            +25
12345                58                     4.6      35           30             +5
   Anker: ≥ 10 Stufen · Lücke ≤ 90 min · E4-Vorsprung ≥ 4 Bühnen
   Mittel: E4-Vorsprung +12.3 Bühnen · kleinster 5

── 6 · Wochen-Anker · Bühne der Woche + Board-Saison (ISO-Kalender, A5/X4)
Woche                 ISO   Bühne                         Regeln           Saison   Board-Schlüssel
─────────────────────────────────────────────────────────────────────────────────────────────────────
2952 ◀ jetzt   KW 31/2026      44       Beat-Nacht + Peach-Party   7 (Woche 5/13)       weekly-2952
2953           KW 32/2026      51   Konfetti-Regen + Peach-Party   7 (Woche 6/13)       weekly-2953
2954           KW 33/2026      58   Konfetti-Regen + Peach-Party   7 (Woche 7/13)       weekly-2954
2955           KW 34/2026      66        Zähe Menge + Beat-Nacht   7 (Woche 8/13)       weekly-2955
2956           KW 35/2026      72          Goldrausch + Marathon   7 (Woche 9/13)       weekly-2956
   Streuung über 52 Wochen: 43 verschiedene Bühnen (21…79), Schrittweite 7

═══ fertig in 9.8 s (Budget < 60 s) ══════════════════════════════
```

Alle Werte decken sich mit den Anker-Tests (807 + 1 = 808 grün) — P5 hat keine
Balance-Zahl bewegt, es macht sie nur sichtbar.

## ROADMAP-V2 Schritt 10 — A5 Bühne der Woche + X4 Leaderboard-UI

- **2026-07-27 — A5 landete regulär (Commit „Buehne der Woche"), X4 wurde vom
  Reviewer geborgen.** Der Coding-Agent starb nach fertigem X4-Code (Client,
  UI, additive Worker-Erweiterung inkl. Tests), aber vor Commit/Beweis — der
  Reviewer (Fable) hat den Stand abgenommen: 807 Game-Tests + 29 API-Tests
  grün, Build sauber, Headless-Beweis über den Ziele-Tab (Wochen-Karte mit
  gestapelten Wochen-Mods, gesperrtem Reise-Button unterhalb der Frontier
  und Wochen-Bestzone; Saison-Zeile/Board-Wechsler/Fehler-Retry per
  gemockter API, die echte D1-API läuft headless nicht). Wochen-Regel: auf
  der Wochen-Bühne ERSETZEN die zwei welt-einheitlichen Wochen-Mods (Seed =
  ISO-Woche, nicht der Spieler-Seed) den A1-Mod — nie drei Regeln
  gleichzeitig. Prozess-Lehre: Agenten-Läufe brauchen einen
  Fallback-Check-in des Reviewers; ein still gestorbener Agent kostete hier
  Stunden Wartezeit, die Arbeit selbst war unversehrt im Working Tree.

## ROADMAP-V2 Schritt 9 — P4 Himmelsbaum-Ausbau

- **Drei Äste, 18 Knoten — und die fünf alten bleiben byte-gleich.** Twerk-Coach,
  Frühstarter, Nachtschicht, Ekstase-Ausdauer und Truhen-Magnet behalten Id,
  Kostenliste und Wirkung; sie wurden nur einem Ast zugeordnet (Coach +
  Ekstase-Ausdauer → 🕺 Ritual, Nachtschicht + Truhen-Magnet → 💰 Ökonomie,
  Frühstarter → ⚔️ Kampf: er ist der einzige Knoten, der einen RE-CLIMB direkt
  stärkt, und Re-Climb ist Kampf, nicht Buchhaltung). Damit verliert kein Alt-Save
  eine einzige gekaufte Stufe, und die neuen Knoten füllen jeden Ast auf 4 normale
  - 1 Exklusiv-Paar auf.
- **Kein Schema-Bump — und unbekannte Baum-Ids ÜBERLEBEN das Laden.** `heaven.tree`
  ist seit v5 ein offenes `Record<string, number>`; `repairHeaven` filtert nur auf
  „positive ganze Zahl", nicht auf bekannte Ids. Neue Knoten brauchen also keine
  Migration. Die offene Frage war, ob unbekannte Ids beim Laden geprunt werden
  sollten — Entscheidung: **überleben lassen**. Wer mit einem neueren Build spielt,
  dort einen neuen Knoten kauft und danach eine ältere Version öffnet (Itch-Build,
  zweites Gerät), bekäme beim Prunen seine HPF _nicht_ zurück, sondern verlöre sie
  ersatzlos. Gefährlich ist das Überleben nicht, weil `treeLevel` jetzt die EINZIGE
  Effekt-Quelle ist und jede Stufe auf das Max-Level des Knotens deckelt — eine
  unbekannte Id hat Max-Level 0 und ist damit von Natur aus wirkungslos (derselbe
  Deckel neutralisiert nebenbei ein hand-editiertes `coach: 999`). Aufgeräumt
  werden die Fremd-Ids beim Respec, also genau dann, wenn der Spieler ohnehin
  „alles auf Anfang" sagt — erstattet wird für sie nichts, weil kein Preis bekannt ist.
- **Exklusiv-Paare statt einer weiteren Einkaufsliste.** Pro Ast schließen sich zwei
  Knoten gegenseitig aus (Truhen- vs. Pfirsich-Fokus · Klick- vs. Crew-Doktrin ·
  Ekstase- vs. Combo-Doktrin). Die Sperre hängt an EINEM Feld (`exclusiveWith`,
  beidseitig gesetzt) und wird an genau einer Stelle ausgewertet
  (`treeNodeBlockedBy` → `canBuyTreeNode`), damit UI, Sim und Save dieselbe Regel
  lesen. Warum ausgerechnet diese Paare: jedes stellt eine echte Spielweise gegen
  eine andere (Truhen-Ökonomie vs. BP-Tempo, aktiv vs. idle, Burst vs. Dauerfeuer)
  — ein Paar aus „+20 % X" und „+20 % Y" wäre eine Rechenaufgabe, keine Entscheidung.
- **Der Preis der Wahl ist doppelt — und das ist der Punkt.** Gehaltene HPF geben
  +2 % globalen Schaden UND verstärken jede Seele. Ein 35-HPF-Doktrin-Kauf nimmt
  also 70 % globalen Schaden mit. Im Headless-Beweis sieht man das direkt: der Kauf
  der Crew-Doktrin (+25 % Crew-DPS) hebt die DPS von 734K auf 745K, senkt den
  Klick-Schaden aber von 154K auf 125K — weil 35 gehaltene HPF fehlen. Genau
  deshalb ist der Baum eine Reihe von Entscheidungen und keine Checkliste.
- **Exklusiv-Knoten kosten einheitlich 35 HPF.** Teurer als jeder normale
  Einzel-Knoten (8–25), aber unter den tiefen Stufen (75/100). Einheitlich, damit
  die Wahl eine Build- und keine Preisfrage ist — ein Test hält beide Eigenschaften
  fest. Die restliche Kurve setzt die bestehende fort (×2.5 je Stufe).
- **Respec: 1 HPF Gebühr, kein neues Save-Feld.** `respecTree` erstattet die Summe
  aller bezahlten Stufen, behält 1 HPF ein und leert `tree` — mehr braucht es nicht,
  der Vorgang ist „Baum leeren + Konto erhöhen". `hpfLifetime` bleibt unangetastet
  (ein Highwater, kein Konto), und das Ergebnis wird auf `hpfLifetime` gedeckelt,
  damit die Kern-Invariante „gehalten ≤ jemals verdient" auch ein frisiertes Save
  überlebt. Die Gebühr ist bewusst winzig: sie soll das Experimentieren nicht
  bestrafen, sondern verhindern, dass man vor jedem Bosskampf umskillt.
- **Bestätigung per Arm-Knopf statt `confirm()`.** Derselbe Zwei-Klick-Pfad, den
  Himmelfahrt und Transzendieren schon benutzen (`armed`-Klasse, 4-s-Timeout,
  „Sicher? Alle Knoten fallen"). Ein natives `confirm()` gibt es im Repo nirgends —
  es blockiert den Loop, sieht auf dem Handy fremd aus und ließe sich nicht
  headless fotografieren.
- **Gestapelte Ast-Sektionen statt echter Spalten.** Das Panel lebt im
  Bottom-Sheet, das im Portrait ~50 % der Höhe misst; drei Spalten à sechs Karten
  wären dort unlesbar schmal. Die Äste sind stattdessen als eigene Blöcke mit
  Kopfzeile (Icon + Name + ein Satz) gerahmt, die Exklusiv-Paare stehen in einem
  eigenen gestrichelten Kasten mit „ODER"-Steg dazwischen. Portrait-Kontrolle:
  Ast-Breite 385 px, kein horizontaler Scroll.
- **Jeder Knoten hängt in einem echten Rechenpfad — kein toter Effekt.** Goldene
  Hände → `goldMult` (also live UND offline), Pfirsich-Reife → `activateBoost`,
  Truhen-Fokus → `rivalChestChance`-Roll, Pfirsich-Fokus → `rollNextPeachAt`-Pause
  (multipliziert sich mit dem Mythos-Knoten „Pfirsich-Magnet"), Schwerer Bass +
  Crew-Doktrin → `dpsOf`, Klick-Doktrin → `clickDamageOf`, Präzisions-Shake →
  `critMultFactor` (derselbe Griff wie die Krit-Token), Gate-Crasher →
  `withBossTimerBonus`, Beat-Gefühl → derselbe `beatBonusMs`-Term wie Beatrix/Gear
  (weitet damit auch das A2-Schild-Fenster), Combo-Gedächtnis → derselbe
  Reduktions-Term wie die Showmaster-Sterne, Ekstase-Doktrin → `frenzyMult`,
  Combo-Doktrin → `comboMult`-Schritt. Drei pure Module bekamen dafür einen
  optionalen Parameter mit unverändertem Default (`comboMult(combo, step)`,
  `frenzyMult(state, now, mult)`, `activateBoost(now, extraMs)`) — kein Aufrufer
  außerhalb ändert dadurch sein Verhalten.
- **Nebenbefund mitgenommen: der Retry-Boss bekam nie einen Uhr-Bonus.** „Boss
  herausfordern" spawnte über `challengeBoss` ohne `withBossTimerBonus`, also fielen
  Chronilla und der Gear-Bonus dort still unter den Tisch. Mit dem Gate-Crasher
  wäre das ein sichtbar kaputter Knoten geworden; jetzt läuft der Retry-Boss über
  denselben Pfad wie jeder reguläre Spawn.
- **Sim: der Bot kauft NUR, was er auch rechnet.** `SIM_TREE_PRIORITY` listet die
  elf Knoten, deren Wirkung im Bot ankommt (Klick/Crew/Krit/Combo/BP/Truhen/
  Pfirsich). Die Utility-Knoten fehlen bewusst: der Bot geht nie offline, zündet
  keine Ekstase, klickt ungetaktet und modelliert Boss-Uhr-Boni nirgends — ein Kauf
  würde ihm dort nur den +2 %/HPF-Globalmult nehmen und die Anker künstlich
  pessimistisch machen. Das ist dieselbe Untergrenzen-Logik, mit der schon
  Twerk-Ekstase und die Boss-Schadens-Mults draußen bleiben. Beide Seiten jedes
  Exklusiv-Paares stehen in der Liste, die DPS-lastige zuerst — weil alle sechs
  gleich viel kosten, entscheidet bei `cheapestTreeBuy` die Reihenfolge, und der
  Bot fährt reproduzierbar Crew-/Combo-/Truhen-Fokus.
- **E2-Anker-Lauf: kein einziger Wert bewegt sich — und das ist gemessen, nicht
  gehofft.** Mit leerem Baum liefert jeder neue Getter exakt seinen neutralen Wert,
  also sind alle Anker bit-identisch (722 Alt-Tests grün ohne eine einzige
  Anpassung). Gemessen mit den E2-Parametern (stallSeconds 1500, 400 k s,
  fullPrestige, seeds 1/7/12345): 15/15/15 Verbesserungen, worstRatio
  0.93/0.84/1.86, 1 Himmelfahrt, 15/15/13 Aszensionen — Wert für Wert wie vor P4.
  Grund: der Bot bankt an der z75-Wand genau **1 HPF** (das dokumentierte
  F7-Residual), und der billigste gelistete Knoten kostet 12. Statt das als
  Kommentar stehen zu lassen, gibt `ContinuousResult` jetzt `hpfHeld` +
  `treeLevels` heraus, und der E2-Test prüft die Aussage („1 HPF gebankt, 0 Stufen
  gekauft") als echte Messung. Die Kauf-Strategie selbst ist separat getestet
  (`greedyTreeSpend` mit 200 und 500 HPF), damit „der Bot versteht die neuen Knoten"
  nicht von einem minutenlangen Lauf abhängt.
- **Warum die Kosten NICHT gesenkt wurden, damit der Bot etwas kauft.** Verlockend
  wäre gewesen, den Einstiegsknoten auf ≤ 1 HPF zu drücken, damit der E2-Lauf den
  Baum anfasst. Das hätte aber die Balance für den BOT gebaut statt für den
  Spieler: 1 HPF ist der Stand nach der allerersten Himmelfahrt (~15 h), und ein
  dauerhafter Prestige-Knoten für den Gegenwert von 2 % globalem Schaden wäre
  geschenkt. Die Anker bleiben damit ehrliche Untergrenzen, und der Baum bleibt
  das, was die Roadmap will: die Entscheidungs-Dichte für die LANGE Strecke
  zwischen erster Himmelfahrt und Transzendenz.

## ROADMAP-V2 Schritt 8 — G4 Prestige-Zeremonien + G6 UI-Zahlen-Leben + X5 Audio-Lücken

- **Die Zeremonie ist REIN OPTISCH — die Gutschrift läuft immer vorher.** Alle
  drei Reset-Handler buchen, setzen zurück, refreshen die Panels und
  persistieren exakt wie bisher; `playCeremony` ist die LETZTE Zeile. Damit ist
  der Skip-Tap gefahrlos (es gibt nichts zu überspringen außer Pixeln), das
  Overlay darf seine Zeiger selbst schlucken (kein Klick rutscht auf die Bühne
  durch), und ein Absturz mitten in der Blende kostet nichts. Der Zahlen-
  Aufzähler bekommt die DIFFERENZ als fertigen Wert gereicht (`souls − vorher`)
  — er rechnet nichts, er zeigt nur.
- **DOM statt Three für die Zeremonie-Partikel.** Die Blende läuft in genau der
  Sekunde, in der die Bühne ohnehin komplett neu gebaut wird (Rivale, Kulisse,
  Crew-Liste, Modifikator-Karte). Ein paar Dutzend absolut positionierte Spans
  mit einer CSS-Keyframe kosten dort nichts, während zusätzliche Three-Sprites
  neue Geometrie im teuersten Frame des Spiels bräuchten. Der einzige rAF ist
  der Aufzähler, und auch der lebt nur für die Dauer der Blende.
- **✨/🍑/🔮 statt des Roadmap-👻 als Zeremonie-Glyph.** Die Roadmap skizziert
  „Seelen-Regen 👻 · +N 👻". Genommen wurden die Glyphen, die das Spiel für
  diese drei Währungen ÜBERALL schon benutzt (HUD-Seelenzeile, Ahnen-Kosten,
  Prestige-Toasts, Himmel-/Mythos-Panel). Ein 👻 wäre ein zweites Symbol für
  eine bestehende Währung — genau der Stil-Bruch, den das G6-Konsistenz-Audit
  eigentlich einsammeln soll. Unterschieden werden die drei ohnehin dreifach:
  Glyph, Farbe/Bewegung (Regen vs. Implosion) und Dauer (1.5 s vs. 2 s).
- **Der „Neustart"-Sweep liegt IM Overlay, nicht in der G1-Insel-Animation.**
  Die drei Reset-Pfade rufen `updateBackground(true)` — ein bewusster Hard-Swap,
  weil der Wechsel dort Teil eines Resets ist und nicht einer Bühnen-Reise (G1
  friert für seine 1.2 s den Kampf ein und verschluckt Klicks; das mitten in
  einen Prestige-Reset zu legen wäre eine Verhaltensänderung an G1). Der Sweep
  ist deshalb ein CSS-Band, das am Ende der Blende einmal durchs Bild fährt —
  derselbe „frischer Lauf"-Beat, ohne einen abgenommenen Pfad anzufassen.
- **Preset-Pflicht ohne neues Preset-Feld.** Die Blende hängt an
  `preset.cinematics` (aus für low ⇒ es bleibt beim Toast von früher), die
  Sprite-Dichte an `preset.confetti` — dieselben zwei Regler, die schon den
  G2-Boss-Auftritt und den Sieg-Wurf steuern. Ein drittes Feld hätte dieselbe
  Information ein drittes Mal gespeichert. Der AUDIO-Stinger hängt bewusst an
  KEINEM Preset: er kostet keine Bildrate, und im low-Preset ist er der einzige
  Moment, der den Reset überhaupt markiert (gleiche Logik wie beim
  G2-Boss-Stinger, der auch in low bleibt).
- **G6: `fmt` bleibt die Anzeige-Quelle, getweent wird nur der WERT.** Der
  Zähler rendert weiter `fmt(v)` — der Tween liefert nur das `v` dazwischen.
  Ein neuer Kontostand bricht den laufenden Tween ab und startet beim GEZEIGTEN
  Wert (sonst zuckt die Zahl bei jedem Idle-Tick zurück), und `shouldTween`
  schluckt Sprünge unter 0.1 %: ein Idle-Tick von 1 000 000 auf 1 000 050 sähe
  als Tween identisch aus und kostete nur einen rAF. Der rAF läuft
  ausschließlich während echter Bewegung — im Ruhezustand ist der Zähler
  exakt so teuer wie vorher.
- **Kauf-Effekte leben in einer Overlay-Schicht, nicht im Panel.** Der
  0.25-s-Idle-Tick rendert den offenen Tab neu, sobald sich Gold ändert (also
  praktisch immer) — ein Konfetti-Partikel IM Crew-Markup wäre nach maximal
  250 ms mitten im Flug weg, und der frisch gekaufte Fähigkeits-Slot wird beim
  Rebuild ohnehin durch ein neues Element ersetzt. Die fixe, klick-durchlässige
  Schicht `#fxLayer` überlebt jeden Rebuild; der Slot-Stempel merkt sich die
  Position VOR dem Kauf. Nebeneffekt: das Panel-HTML bleibt frei von
  Effekt-Markup, und `crew.ts` meldet mit `buy`/`buyAbility` jetzt ehrlich
  zurück, ob wirklich gekauft wurde (gefeiert wird nur ein echter Kauf).
- **Tab-Wechsel blendet nur EIN.** Die Bodies werden per `display` geschaltet;
  ein Ausblenden bräuchte einen zweiten, verzögerten Schritt und ließe beide
  Panels kurz übereinander liegen (Layout-Sprung im Bottom-Sheet). Die
  120-ms-Keyframe rührt nur `opacity`/`transform` an.
- **Leerzustände: Stroke-Icons, keine Emojis — und sie ERSETZEN nichts.** Die
  Icons sind dieselben Pfade wie in der Tab-Leiste (eine Icon-Sprache); Emojis
  tragen im Spiel Bedeutung (Truhen-Stufen, Sterne, Währungen) und wären hier
  eine zweite Bedeutungsebene für reines Chrome. Die Karte steht ÜBER der Liste,
  statt sie zu verdrängen: die gesperrten Knoten sind das Versprechen, der
  Leerzustand sagt nur, wie man es einlöst. Beim Ruhm-Tab wurde die Bedingung
  bewusst auf „nie aszendiert" (`rsLifetime === 0`) gelockert statt „nichts zu
  holen" — sonst wäre sie unerreichbar, weil der Tab genau dann erscheint, wenn
  sich eine Aszension lohnt.
- **Konsistenz-Audit (Alt-Phase U): bewusst NICHTS angefasst.** Die
  Rest-Emojis in HUD und Toasts sind Absicht — Truhen-Stufen (🪵🥈🥇💎🌌),
  Sterne, Währungen (✨🍑🔮🔑🧩) und Event-Marken (👑👺⏱) sind dort Inhalt,
  nicht Dekor. Gefunden wurde kein Stil-Bruch, der eine Änderung rechtfertigt;
  neu dazu kam mit den Leerzuständen ausschließlich Stroke-Ikonografie.
- **X5: die Ekstase-Lage hängt am FENSTER, nicht an der Intensitätsstufe.**
  `intensityFor` liefert 3 sowohl bei Ekstase als auch bei Combo-Tier 4 — die
  vorhandene Stufe-3-Schicht (Lead + Filter-Sweep) bleibt genau so. Die neue
  zweite Instrumenten-Lage bekommt deshalb einen eigenen Schalter
  (`setEkstase`), damit das Fenster hörbar sein eigenes Signal hat und nicht mit
  einer heißen Combo verschwimmt. Sie hängt am selben `out`-Bus wie die übrige
  Musik, wird also vom Mute-Schalter und vom gestoppten Loop automatisch
  miterfasst.
- **`swell` als zweiter Ton-Helfer.** Der bestehende `tone` schlägt in 6 ms an —
  richtig für Klicks und Stiche, falsch für eine Zeremonie, die tragen soll.
  `swell` ergänzt weiches Anschwellen plus optionales Frequenz-Gleiten (der
  Transzendenz-Sog von 110 auf 55 Hz); `tone` bleibt unangetastet, damit kein
  bestehender SFX seinen Charakter ändert.
- **Klang wird MESSBAR bewiesen, nicht behauptet.** Headless gibt es kein
  Audio-Foto, also bekam die Engine `debug` (Kontext-Status + effektive
  Master-Lautstärke) und `main.ts` die Beweis-Oberfläche `window.chAudio` —
  gleicher Geist wie `chLoot`/`chGob`. Der Smoke misst damit den Mute-Vertrag
  (Master exakt 0) und zählt `createOscillator`-Aufrufe pro 2 s mit und ohne
  laufende Ekstase (club 10 → 26, synth 10 → 36, beach 8 → 17, space 6 → 15).
  Bewusst gegen eine echte Ekstase (Taste F) gemessen statt gegen den Schalter:
  der Loop schreibt `setEkstase(frenzy)` jeden Frame und überschriebe jede
  Fernsteuerung — dieselbe Falle hätte einen falsch-negativen Beweis erzeugt.

## ROADMAP-V2 Schritt 7 — A1 Bühnen-Modifikatoren + A4 Choreo-Sets + A3 Truhen-Kobold

- **Der Modifikator-SEED reist im `CombatState`, nicht der fertige Faktor — und
  deshalb bleibt `monsterHp` unangetastet.** Drei Wege standen zur Wahl: (a) ein
  Hook in `monsterHp` (tabu: Advisor, Offline-Ertrag und der Float-Guard lesen
  dieselbe Kurve und dürfen keinen Seed kennen), (b) ein Faktor an der Stelle,
  wo die Ausdauer VERBRAUCHT wird (also im Schadenspfad, wie es P2 beim
  „Boss-Brecher" gemacht hat), oder (c) `spawnFor` bekommt den Seed. Gewählt:
  **(c)**. Grund ist `hit`/`tickBoss`/`travelTo`: die spawnen das NÄCHSTE Ziel
  selbst, ein nur von außen gereichter Faktor wäre beim ersten Kill wieder weg.
  Getragen wird der Seed (nicht der Faktor), weil der Modifikator an der BÜHNE
  hängt und die mit jedem Spawn wechselt. Der Gewinn gegenüber (b): **eine
  Quelle** — Spiel, HUD und Bot lesen dieselbe `hpMax`, der Balken zeigt die
  echte Zahl, und die Sim musste für die HP-Seite gar nichts nachbauen.
  `REMIX_OFF` (0) ist der Default der Signatur, also rechnen alle Alt-Tests und
  `simulateFloatGuard` byte-gleich weiter.
- **Kein Save-Bump — der Remix-Seed wird abgeleitet, nicht gespeichert.**
  `remixSeedFor(rng.seed, stats.ascensions)`: beide Felder liegen seit Langem im
  Save und überleben jede Prestige-Schicht. Die Aszensions-Zahl wird durch einen
  splitmix-Mixer gedreht statt addiert — eine Addition hätte die Karte nur um
  Bühnen VERSCHOBEN (Bühne 12 bekäme, was eben Bühne 11 hatte); der Roadmap-Satz
  „Aszension remixt" verlangt eine neue Karte, kein Karussell. Save bleibt bei
  **v11**, keine Migration, keine neue Fixture. Auch der Kobold (A3) und die
  Choreo-Sets (A4) sind reine Laufzeit: der Kobold-Zustand lebt wie der
  A2-`GimmickRuntime` nur in der Glue, ein Reload würfelt seine nächste Runde neu.
- **Boss-Bühnen tragen NIE einen Modifikator.** Das ist die direkte Lehre aus
  A2: ein Gate ist eine 30-s-Klippe, kein Regler — dort kostete schon ein
  Zehntel Wirkungsverlust ganze Bühnen. Die Gates tragen außerdem seit A2 bereits
  eine eigene Regel-Ebene (Theme-Gimmick); ein zweiter Würfel obendrauf wäre
  unlesbar. A1 wirkt deshalb ausschließlich auf der Farm-Strecke — und genau
  dort, wo die Rückreise stattfindet, die es strategisch machen soll.
- **Zwei Parameter gegenüber der Roadmap gezähmt — vom empfindlichsten Anker
  entschieden.** Mit den Roadmap-Rohwerten („Zähe Menge" +30 % Ausdauer, „Nebel"
  −20 % Crew-DPS) lief der 0.7-cps-Bot auf seed 7 mit **20.35 h** aus dem
  Himmelfahrts-Fenster (Obergrenze 19.38 h) — derselbe idle-dominierte Anker,
  der schon die A2-Spotlight-Dauer diktiert hat. Mit **+20 %** bzw. **−15 %**
  landet er bei 19.06 h. Alles andere blieb wie in der Roadmap skizziert.
- **Was der Bot faltet und was bewusst neutral bleibt.** Gefaltet: `gold`
  (Kill-BP), `hp` (über `spawnFor`), `click`/`dps` getrennt über
  `stageDamageFactor` (der Bot rechnet mit EINEM Sekundenbetrag, „Nebel" trifft
  aber beide Anteile gegenläufig), `crit` im gedeckelten Krit-Stack und `chest`.
  Neutral: `beat` (der Bot klickt ungetaktet und holt den On-Beat-Bonus nie ab),
  `ekstase` (im Bot ohnehin nicht modelliert) und `peachGap` (der Bot reist nicht
  zum Farmen). Alle drei können den ECHTEN Spieler nur beschleunigen — die Anker
  bleiben damit Untergrenzen, wie schon bei Ekstase und den Boss-Schadens-Mults.
- **Anker-Lauf (seeds 1/7/12345, vorher → nachher).** t10 104 → 104 s (Bühne 10
  liegt unter `MOD_MIN_ZONE`, per Konstruktion gleich); t25 2032/2044/2033 →
  2147/2035/1643 s (Mittel −4.6 %), Bühne 30 bleibt außer Reichweite; erste
  Himmelfahrt 18.44/18.27/18.32 → 17.36/19.06/17.17 h (Mittel 18.34 → 17.86 h,
  −2.6 %); kumuliert t75 1.66/2.32/2.36 → 1.61/1.73/1.59 h; E2/E3/E4, Gear-E4 und
  der Float-Guard unverändert. **Die Streuung je Seed wächst auf ± 10 % (vorher
  ± 3 %) — das ist die Mechanik, nicht ihr Fehler**: jeder Lauf würfelt eine
  andere Karte, jede Aszension würfelt neu. Der MITTELWERT bewegt sich kaum, also
  wandert keine Wand; ein neuer Test pinnt genau das fest (Σ Tiefe über fünf
  Seeds, mods an gegen mods aus, Grenze 15 %). Kein Fenster musste aufgerissen
  werden; der Token-Zeugen-Seed wandert 7 → 5 (dieselbe Sorte Zeugen-Tausch wie
  bei A2 — die Modifikatoren verschieben, welche Truhen-Lose in 45 min gezogen
  werden).
- **Der Kobold zieht im BOT aus einem Seiten-Strom.** Im Spiel hängt er am
  gemeinsamen persistierten `rng` (wie der Pfirsich). Im Bot bekäme dadurch jede
  Truhen-/Krit-/Gild-Ziehung aller Alt-Seeds einen Versatz — zwei Anker fielen
  allein daran, ohne dass sich die Balance geändert hätte. `sim.goblinRng` ist
  aus demselben Seed abgeleitet: gleiche Verteilung, gleiche Kadenz, aber die
  Alt-Anker messen weiter Balance statt Strom-Versatz. Ertrag im Bot: eine
  Holztruhe je Fang bei **80 % Fangquote** (`GOBLIN_SIM_CATCH` — 5 Klicks in 8 s
  sind trivial, die Quote bildet ab, dass man ihn übersieht); der 10-s-×2-Klick-
  Buff bleibt UNMODELLIERT (≈ +3 % Klick im Mittel, dieselbe Untergrenzen-Logik).
- **Der Kobold-Buff ist NICHT das Ekstase-System.** `ability.ts` trägt EIN
  ×10-Fenster mit Ladebalken, HUD-Ring und Ton. Den Kobold dort einzuhängen hätte
  entweder den Ring falsch angezeigt oder die Ekstase-Dauer heimlich verlängert.
  Stattdessen ein eigener, winziger Zeit-Buff (`goblinBuffMult`) als eigener
  Faktor im `extraMult` — zwei Buffs, zwei Zustände, ein Klick-Pfad.
- **A4 fasst `moves.ts`-Mathematik nicht an.** Neu ist nur eine Auswahl-Ebene:
  `Choreographer.useSet(indices)` + `advance()`. Die Intensitäts-Tabelle
  (`MOVE_INTENSITY`) ist paarweise verschieden, damit „die zwei intensivsten"
  ohne Gleichstands-Regel eindeutig sind; ein Test pinnt sie gegen die echten
  `MOVES`-Namen, damit ein neuer Move nicht stumm als Intensität 0 durchrutscht.
  Der Sieges-Diva-Turn ist ein FLAG (`victoryDance`), kein direkter `setMove`:
  derselbe Kill stellt unmittelbar danach das Set der neuen Bühne, der Sieges-Move
  muss also zuletzt kommen. Dass er „einmalig" ist, fällt ohne Extra-Zustand
  heraus — `advance()` von einem Move AUSSERHALB des Sets springt auf dessen
  ersten Eintrag.
- **Beweis (Headless, Port 4188, Save v11, seed 424242).**
  `a1-a-strip-und-card.png` — Bühne 11 mit 🎉-Abzeichen im Strip-Slot und der
  Card-Zeile „Konfetti-Regen · Die Twerk-Ekstase lädt 50 % schneller auf.";
  Slot 9 (< 11) und die Slots 10/40 (Boss-Gates) tragen bewusst KEIN Abzeichen.
  `a1-b-andere-buehne-anderer-mod.png` — Bühne 12, 💰 „Goldrausch", anderer Satz.
  `a3-c-kobold-auf-der-buehne.png` — der Kobold hoppelt mit Rest-Klick-Zähler
  über die Insel. `a3-d-kobold-gefangen.png` — nach fünf ECHTEN Button-Klicks
  (der Beweis nimmt den Spieler-Pfad, nicht die Logik): Holztruhen-Bestand 6 → 7
  und der Toast „Kobold gefangen! · 🪵 Holztruhe · ×2 Klick-Schaden für 10
  Sekunden". `a3-e-mini-frenzy-badge.png` — nach dem Toast steht das
  „×2 Klick · 5s"-Badge allein über dem Ekstase-Knopf.
  `a4-e-buehne13-BootySlam.png` / `a4-f-buehne18-DivaTurn.png` /
  `a4-g-boss15-Twerk.png` — drei klar verschiedene Silhouetten mit den Sets
  [Booty-Slam · Bounce · Hip Circles] / [Diva-Turn · Welle · Drop It Low] /
  [Twerk · Drop It Low] (Boss ⇒ nur die zwei intensivsten, und keine Mod-Card).
- **Drei Dinge fielen erst im Bild auf und wurden nachgezogen.** (1) Das
  Strip-Abzeichen saß außerhalb des Slots (`top: -6px`) und wurde auf der um 1.16
  skalierten AKTIVEN Bühne vom Panel-Rand abgeschnitten ⇒ nach innen gerückt.
  (2) Der Kobold hoppelte über die volle Fensterbreite, im 50/50-Layout also
  quer über die Crew-Liste ⇒ auf die Bühnen-Hälfte und die untere Bildhälfte
  begrenzt (er soll über die INSEL laufen und keine Knöpfe verdecken). (3) Das
  ×2-Badge lag zuerst oben auf dem Zonen-Strip ⇒ über den Ekstase-Knopf gesetzt,
  wo der Klick-Buff hingehört. Kobold und Badge können sich nie überlappen — mit
  dem Fang verschwindet er.

## ROADMAP-V2 Schritt 6 — P2 Transzendenz-Teaser + TE-Sink

- **`mythos` war seit M14 ein leerer Slot — genau dafür gebaut, also KEIN
  Schema-Bump.** Der L3-Slice führt `mythos: Record<string, number>` als
  „spent-TE ledger" mit Kommentar „der Katalog ist absichtlich leer, das hier ist
  nur der Platz"; `repairTranscend` schickt ihn seit v9 durch `repairCountMap`,
  die X7-Matrix deckt ihn ab (`{ diamantBooty: 2.7, bad: -1, junk: 'x' }` ⇒
  `{ diamantBooty: 2 }`). Der Mythos-Shop schreibt nur `id → 1` in genau diese
  Map. Save bleibt bei **v11**, keine Migration, keine neuen Fixtures — ein Bump
  ohne neues Feld wäre reine Zeremonie gewesen.
- **Die Kostenkurve folgt der TE-Einkommenskurve, nicht dem Bauchgefühl.**
  `teForHpfLifetime = ⌊log10(HPF_life)⌋` startet am 100-HPF-Gate bei **2** und
  gibt je Größenordnung +1. Der realistische Lebensvorrat liegt also bei **2–4
  TE**, nicht bei Dutzenden. Die in der Roadmap skizzierte 1/2/3/5-Kurve (11 TE)
  entspräche 10¹¹ Lebenszeit-HPF — der Shop wäre Deko gewesen. Gewählt:
  **1/1/2/2**, Board-Summe 6. Damit finanziert die erste Transzendenz (2 TE)
  genau EINE Entscheidung: ×9 behalten, oder ein 1-TE-Knoten + ×3, oder zwei
  billige Knoten und gar kein Boost. Das volle Board (10⁶ HPF) ist **absichtlich**
  unerreichbar — P2 wollte eine Auswahl, keine Checkliste.
- **Der Preis ist der Boost selbst, und das bleibt so.** `transcendGlobalMult`
  rechnet auf dem GEHALTENEN TE; jeder Kauf kostet also zusätzlich ×3 globalen
  Schaden. Der Scaffold-Kommentar erlaubt ausdrücklich, stattdessen `teLifetime`
  zu füttern (Boost immun gegen Ausgeben) — verworfen: dann wäre der Shop gratis
  und die „Entscheidung" aus P2 verschwunden. Die Card nennt deshalb VOR dem
  Klick beides, Kosten und Boost danach („2 🔮 · danach Boost ×27").
- **Boss-Brecher als Schadens-Faktor, nicht als HP-Abzug — wegen der geteilten
  Kurve.** `bossHp(zone)` lesen Combat, HUD, Advisor UND die Sim. Ein Eingriff
  dort hätte einen Zustands-Parameter durch `spawnFor`/`hit`/`tickBoss`/
  `travelTo` und die Sim schleifen müssen. Stattdessen hängt `1/(1−0.1)` im
  Boss-Schadens-Stack — wirkungsgleich (der Boss fällt bei 90 % der Ausdauer),
  aber an EINER Stelle im Spielpfad (`applyHit`) und gespiegelt in
  `advisor.bossDamageMult`. Diese Spiegelung ist Pflicht, nicht Kosmetik: sonst
  unterschätzte die P3-Wand-Telemetrie den Spieler nach dem Kauf dauerhaft.
- **Sim-Ehrlichkeit ohne Anker-Verschiebung.** Alle Anker fahren `te = 0`, kein
  Knoten gekauft; jeder Effekt-Getter liefert dann exakt den Identitätswert
  (×1 / +0 s / unveränderte Crew). `rollNextPeachAt` bekam `gapMult = 1` als
  Default, damit der Zufallszug byte-gleich bleibt und die Sim (die ohne Faktor
  aufruft) dieselbe Kurve sieht. Ergebnis: 651 Tests grün, E2/E3/E4 und das
  Himmelfahrts-Fenster **unverändert** — nichts musste re-ankert werden.
- **Käufe sind permanent, es gibt keinen Respec — konsistent mit `mythos`.**
  `transcendState` nimmt den ganzen L3-Slice inklusive Ledger mit, `teSpent`
  (= `teLifetime − te`) bleibt über jede weitere Transzendenz stabil. Deshalb
  ist jeder Knoten einstufig: eine Kaufkurve, die nie zurückgedreht werden
  kann, muss klein und lesbar sein.
- **Frühstart greift nach ALLEN drei Resets, nicht nur nach der Aszension.** Der
  Himmelsbaum-„Frühstarter" ist aszensions-gebunden und prozentual — nach einer
  Transzendenz ist er weg, weil L2 mitgewiped wird. Genau dort ist der TE-Knoten
  am meisten wert, also hängt er in `onAscend`, `onHimmelfahrt` UND
  `onTranscend`. Er hebt nur an (Max-Regel), kassiert also nie einen höheren
  Stand des Himmelsbaum-Knotens ein.
- **Der 🌈-Tab öffnet jetzt mit der ersten Aszension — sonst hätte der Teaser ein
  Zeitfenster von Minuten.** Bisher: `hpfLifetime > 0 || canHimmelfahrt(…)`, also
  erst ab 1 000 Lebenszeit-RS — dem Moment, in dem die Himmelfahrt ohnehin
  bereitsteht. Der 🔮-Teaser darin wäre praktisch nie zu sehen gewesen, weil der
  echte 🔮-Tab eine Sekunde später erscheint. Die Öffnung folgt exakt der
  Begründung, die schon über dem 'transcend'-Case steht („eine Schicht, die man
  erst sieht, wenn sie offen ist, kann kein Ziel sein"); das Panel zeigt vor dem
  Gate ehrlich „Lebenszeit-RS X / 1 000 (30 %)". Reine Anzeige — `canHimmelfahrt`
  bleibt das einzige echte Gate, und die 'transcend'-Regel ist **unangetastet**.
- **Beweis (Headless, Port 4188, Save v11).**
  `p2-a-himmel-teaser.png` — Save nach erster Aszension (`hpfLifetime 0`):
  🌈-Tab sichtbar, 🔮-Tab **nicht**, unten der gesperrte Knoten „🔮 ??? 🔒" mit
  `cursor: default` (kein Klick-Handler). `p2-b-shop-kaufbar.png` — 5 TE, alle
  vier Knoten mit Kosten + „danach Boost ×N". `p2-c-shop-gekauft.png` — nach
  zwei Käufen: Haken, Gold-Rand, Kontostand 5 → 1 🔮, Boost ×243 → ×3, Save
  trägt `mythos: { nachtschwarmer: 1, bossbrecher: 1 }`.
  `p2-c-offline-cap-crop.png` — X3-Card mit Cap **8 h → 12 h**.

## ROADMAP-V2 Schritt 5 — A2 Boss-Gimmicks

- **2026-07-26 — Der entscheidende Befund: ein Boss-Gate ist kein Regler,
  sondern eine Klippe.** Der erste Wurf setzte die Gimmicks 1:1 nach Roadmap um
  (Club 2×5 s ohne Crew, Synth nur im Beat-Fenster, Beach 5 %/10 s, Space
  Combo ×1.5) — und riss die Balance-Anker komplett auf: die kumulierte
  Bühne-75-Messung und die erste Himmelfahrt wurden von den Bots **gar nicht
  mehr erreicht** (statt 4.75/6.94 h bzw. 18.3 h), E2 fiel von 15 auf 6
  Verbesserungen, E3 von Bühne 75 auf 10. Ursache: Ein Gate ist eine
  30-s-Zeitschranke. Wer 10 % Wirkung verliert, verliert nicht 10 % Tempo — er
  verliert das Gate, fällt auf die Vor-Bühne, farmt bei gedeckeltem Einkommen
  und wächst nur noch logarithmisch. Isoliert gemessen: die MILDESTE Variante
  (nur Beach, +15 % nötiger Schaden) kostete allein +62 % auf t75; Spotlight
  und Schild sperrten die casual-Anker jeweils für sich aus.
- **Konsequenz: das Gimmick verteilt Schwierigkeit um, statt sie zu addieren
  (`GIMMICK_HP_SCALE`).** Ein Gimmick-Boss trägt weniger Ausdauer — ziemlich
  genau um den Anteil, den sein Trick dem Durchschnitts-Build kostet
  (Spotlight ×0.78, Schild ×0.57, Welle ×0.87, Gravitation ×1.00). Die Wand
  verlangt damit dieselbe Gesamt-Power wie vorher, aber eine ANDERE Verteilung:
  ein Idle-Build zahlt am Spotlight-Gate voll (Ausgleich dort ± 0), ein
  Klick-Build kommt ~13 % leichter durch; wer im Takt trifft, nimmt dem
  Schild-Gate ~30 % ab; wer den Kampf in die Länge zieht, zahlt an der Welle
  echte Prozente. Genau die Lese-Tiefe, die A2 wollte — ohne die Progression zu
  verbiegen. Alternative „Gimmicks einfach zahnlos machen" wurde verworfen:
  bei ≤ 4 % Wirkung wären sie Deko gewesen.
- **Gravitation bekommt KEINEN Ausdauer-Aufschlag (×1.00), obwohl sie hilft.**
  Erster Ansatz war ×1.05 als Gegengewicht zum Combo-Bonus. Gemessen: der
  0.7-cps-Anker-Bot spielt ohne Combo (`juice: false`), bekommt den Bonus also
  gar nicht — und blieb mit dem Aufschlag an Bühne 40 hängen (Himmelfahrt nie
  erreicht). Ein Ausgleich für einen Bonus, den nicht jeder bekommt, ist eine
  Strafe für alle anderen. Gravitation ist jetzt reine Belohnung fürs
  Combo-Halten.
- **Das Schild-Fenster steht in PHASEN-Einheiten, nicht in Millisekunden.**
  `isOnBeat` misst den Zeitabstand zum nächsten Beat, aber die Beats laufen mit
  dem Klick-„drive" schneller: bei vollem Drive (6) liegt der maximale Abstand
  zum nächsten Onset bei ~82 ms — komplett innerhalb des ±100-ms-On-Beat-
  Fensters. Ein in ms fixiertes Schild stünde für jeden hart klickenden Spieler
  DAUERHAFT offen, die Mechanik wäre ein Placebo. In Phasen-Einheiten
  (`SHIELD_WINDOW_PHASE` = ±100 ms × 1.4 bei ruhender Choreo) ist es
  drive-invariant und lässt konstant **55.4 %** der Zeit durch. Die
  Beat-Fenster-Boni aus Ahnen/Gear/Fähigkeiten weiten es weiterhin — der Hebel,
  mit dem man sich gezielt gegen die Mechanik rüstet.
- **Spotlight 2×4 s statt 2×5 s — vom Anker entschieden.** Mit vollem
  Ausdauer-Ausgleich schob 2×5 s die erste Himmelfahrt auf 19.7 h und damit aus
  ihrem ±25-%-Fenster (Obergrenze 19.4 h); 2×4 s landet bei 18.3 h. Der
  0.7-cps-Bot ist der empfindlichste Anker des Pakets (idle-dominiert, lebt an
  der Gate-Kante) und hat die Parameterwahl praktisch diktiert.
- **Sim-Modellierung: `stepSecond` kennt jetzt Klick- und Idle-Schaden
  getrennt.** `powerSplit` liefert beide Terme, der Boss-Schaden einer Sekunde
  läuft durch `gimmickBossDamage` (Club: `click + idle·(1−Phasenanteil)`,
  Synth: `(click+idle)·0.554`, Beach: unverändert + HP-Regen, Space:
  Klick-Term auf `spaceComboBonus` gehoben). Der resultierende Faktor `k` wird
  über die ganze Sekunde angewandt; nach einem Boss-Kill wird der Rest-Schaden
  **zeit-proportional** zurückgerechnet (`hp/k` = wirklich verbrauchter Anteil
  der Sekunde), damit der Übertrag auf die nächsten Rivalen ehrlich bleibt.
  Dokumentierte Annahme: **der Bot klickt ungetaktet** (er hat keine
  Choreo-Phase), trifft am Schild also mit derselben Fenster-Wahrscheinlichkeit
  wie die Crew — bewusst pessimistisch, damit die Anker untere Schranken
  bleiben. Einzige optimistische Stelle: der doppelte Combo-Verfall greift beim
  Bot nicht (er klickt ≥ 1×/s und bleibt im 1.5-s-Gnadenfenster); gedeckelt auf
  +8.3 % Klick-Schaden am Combo-Cap.
- **Anker-Lauf (seeds 1/7/12345, vorher → nachher).** t10 105 → 104 s ·
  t20 824 → 823 s · t25 2133/2144 → 2032/2044 s (−4.7 %) · Bühne 30 bleibt
  unerreichbar · kumuliert t75 4.75/6.94 → 4.99/6.96 h · erste Himmelfahrt
  18.26/18.81/18.19 → 18.44/18.27/18.32 h (± 3 %) · E2 15 Verbesserungen +
  1 Himmelfahrt (unverändert) · E3 ≥ 41 Meilensteine, längste Durststrecke
  ≤ 42 min (Anker 90) · E4 8–15 → 10–15 Bühnen Vorsprung · Gear-E4 10 → 10/11.
  **Kein Anker musste aufgerissen werden.** Einzige Nachführung: der
  🧩-Zeugen-Seed für „Splitter → Gear-Level" wandert 12345 → 4711 (die Gimmicks
  verschieben, welche Bosse in ein 45-min-Fenster fallen, und damit die seeded
  Truhen-Züge; seed 12345 bankt jetzt 7 statt 10+ 🧩). Behauptung unverändert.
- **Der Kampf-Zustand bleibt AUSSERHALB des `CombatState`.** Spotlight-Phasen
  und Wellen-Uhr gehören zu EINEM Kampf und überleben keinen Reload — sie
  stehen als `GimmickRuntime` in der Glue (main.ts) bzw. im Sim-State. Kein
  Schema-Bump, keine Migration, keine Fixture. Ein Save mitten im Boss-Kampf
  spawnt den Boss ohnehin frisch; ein frischer Kampf ist der korrekte Zustand.
- **Die Theme-Rotation hatte drei Kopien — jetzt eine.** `bgForZone` (main.ts),
  `stripTheme` (ch-hud.ts) und das Gimmick brauchen dasselbe Theme;
  `themeForZone` in `boss-gimmicks.ts` ist die einzige Quelle. `ZONES_PER_THEME`
  steht dort bewusst LOKAL statt aus `combat.ts` importiert, damit `combat.ts`
  seinerseits `bossHpScale` holen kann, ohne einen Import-Zyklus zu bauen; ein
  Test pinnt `ZONES_PER_THEME === BOSS_EVERY` fest.
- **Kein Preset-Gate für die Gimmick-Optik.** Balken-Look, Plaketten-Puls und
  die „🛡 Klirr!"-Pop sind reines CSS/DOM auf dem bestehenden Pop-Pool — kein
  Draw-Call, keine Partikel. Sie tragen wie das G2-Banner INFORMATION (welche
  Regel gerade gilt), gehören also auch im low-Preset auf den Schirm. Der
  Plaketten-Puls respektiert `prefers-reduced-motion`.
- **Headless-Beweis (angesehen, nicht nur gelaufen).** Je Theme Banner +
  Plakette (Bühnen 5/10/15/20, `chVs().gim` stimmt mit dem Katalog überein);
  Club-Spotlight live gemessen: HP-Verlust IN der Phase 0.00 %, in einem gleich
  langen Fenster DANACH 4.70 % (0.8 Sim-s, keine Klicks) — der Idle-Stopp ist
  echt; Synth-Abpraller sichtbar, 13 von 60 Klicks prallten ab (untere
  Schranke), die Ausdauer sinkt trotzdem von 89.8 % auf 24.5 % (das Schild
  lässt im Takt durch); Beach-Welle 61.10 % → 65.90 % Rest-HP (+4.81 pp) mit
  Puls-Klasse. Gemessen wird an der Sim-Uhr `chVs().t0`, weil SwiftShader
  ~0.2× Echtzeit läuft — Wanduhr-Fenster wären hier die falsche Achse.

## ROADMAP-V2 Schritt 4 — X2+X3+G3 Ekstase-Fenster, Offline-Rückkehr, Idle-Leben

- **2026-07-26 — Review-Befund (Fable): der Phase-L-Bloom lief NIE.**
  `post.enabled` wurde nirgends gesetzt (bei einem Refactor verloren) — der
  Composer war toter Code, alle Abnahmen liefen ohne Bloom. Beim Review-
  Aktivieren zeigte die Kette eine uniforme Aufhellung des gesamten Bildes
  (mutmaßlich doppelte sRGB-Konvertierung im Composer-Pfad); Threshold-
  Korrektur (0.82 → 1.05, linearer HDR-Raum — für sich genommen richtig und
  behalten) ändert daran nichts. Entscheid: Bloom bleibt explizit AUS
  (`post.enabled = false` mit Known-Issue-Kommentar), denn das Spiel ist in
  seinem bloomlosen Look abgenommen — ein stilles Aktivieren eines nie
  validierten Effekts wäre eine Verschlechterung. Die Farb-Pipeline-Reparatur
  ist ein eigenes künftiges Paket.

- **2026-07-26 — X2: Der Balken zeigt jetzt IMMER die Ladung, der Ring die
  Laufzeit.** Vorher trug `#ekstaseFill` beide Bedeutungen: außerhalb der
  Ekstase die Ladung, innerhalb die Restzeit. Das las sich im Fenster wie eine
  Ladung, die rückwärts läuft — und verbarg, wie weit die NÄCHSTE Ekstase schon
  ist (im ×10-Fenster klickt man am meisten, die Ladung steigt also am
  schnellsten). Jetzt sind es zwei Kanäle: Balken = Ladung (durchgehend), Ring
  am linken Pillen-Ende = Restlaufzeit mit den Sekunden im Kern. Headless
  gegengeprüft: bei offener Ekstase Ring 85 % / 51 s bei Ladung 0 %, nach 14
  Klicks Ring 77 % / 46 s bei Ladung 8 % — beides gleichzeitig lesbar.
- **Der Ring misst sein Fenster selbst, weil der Save die Dauer nicht kennt.**
  Persistiert ist nur `frenzyUntil`; `frenzyFraction` rechnet gegen die
  BASIS-Dauer (12 s) und pegelt deshalb bei einer per Ekstase-Ausdauer/Gear
  verlängerten Ekstase (30 s sind erreichbar) über eine Minute lang auf 100 %.
  `trackFrenzyWindow` misst die Länge beim ERSTEN Frame des Fensters und führt
  sie mit — pur, getestet, ohne Schema-Bump. Ein Reload mitten in der Ekstase
  startet den Ring bei 100 % der REST-Zeit: die verlorene Vorgeschichte ist
  nicht rekonstruierbar, und ein zu voller Ring ist ehrlicher als ein
  springender.
- **Der Deck-Puls moduliert das geteilte `floorMat`, statt Geometrie zu
  bauen.** Ein zweites Emissive-Deck (Overlay-Disc) hätte einen Draw-Call und
  Z-Fighting gekostet. `World.setEkstase(active, beatV)` lerpt stattdessen das
  Theme-Emissive Richtung Ekstase-Pink und hebt die Intensität — mit demselben
  `beatV`, den die Kulissen-Anims bekommen, also im Takt der Neonkanten. Die
  Ruhelage wird bei jedem `rebuild` frisch gemerkt, ein G1-Bühnenwechsel
  MITTEN im Fenster reißt den Puls daher nicht ab; beim Fenster-Ende wird genau
  einmal zurückgestellt. `low` schaltet ihn per `preset.ekstaseDeck` ab
  (headless gemessen: high 1.60…1.87 Intensität + wechselnde Farbe, low
  konstant 1.00/Schwarz).
- **X3: Der Offline-Verdienst wird gepuffert — aber trotzdem MITGESPEICHERT.**
  „Erst beim Einsacken gutschreiben" und „niemals Verlust" widersprechen sich,
  sobald der Tab hart wegbricht (Crash/Task-Kill, kein `beforeunload`). Gelöst
  ohne Kompromiss: `state.gold` bleibt bis zum Klick unberührt (die Card darf
  den Moment inszenieren), aber `persist()` schreibt `withPendingOffline(state)`
  — den Kontostand INKLUSIVE Puffer. Ein Reload findet das Gold als Kontostand
  vor, die Abwesenheit ist dann ~0, also keine zweite Card und keine
  Doppelbuchung. Zusätzlich sackt JEDER Schließ-Pfad ein (Button, Backdrop-
  Klick, Escape) — „Überspringen" ist kein Verzicht. Headless: HUD vor dem Klick
  500.01K, danach 1.18M, im Save lag der Betrag schon vorher.
- **Die Card rechnet nicht selbst — sie ruft `offlineGold` auf.** Ein zweiter
  Rechenweg für die Anzeige wäre die klassische Quelle für „zeigt X, bucht Y".
  `welcomeBackData(dps, zone, elapsed, opts)` ist die EINZIGE Quelle: sie ruft
  `offlineGold` mit denselben Argumenten und gibt den Betrag zurück, den
  `main.ts` dann gutschreibt. Der Unit-Test prüft genau das über sieben
  Parameter-Kombinationen (Coach, Gold-Mult, Rate-Bonus, ausgebauter Cap).
  Schwelle: > 10 min (exakt 10 min noch nicht) — darunter bleibt es die stille
  Gutschrift von vorher, auch beim Tab-Rückkehr-Pfad.
- **Der Cap-Hinweis erscheint nur, wenn der Cap gegriffen hat.** `capped` ist
  `elapsed > capS`, nicht „Cap existiert" — ein Hinweis ohne Anlass wäre eine
  Drohung. Der angezeigte Cap ist der WIRKSAME (Nachtschicht/Beach-Gear heben
  ihn), nicht die 8-h-Konstante, sonst würde die Card den eigenen Ausbau
  verschweigen.
- **G3: Ambient-Leben kostet EINEN Draw-Call pro Sorte, egal wie viele
  Stücke.** Glühwürmchen = ein `Points`, Sternschnuppen/Kometen/Möwen/Publikum =
  je ein `InstancedMesh` mit einem Material. Die Preset-Dichte
  (`ambientLife`: low 0.5) skaliert damit die STÜCKZAHL, nicht die Batches —
  low spart Füllrate, nicht Draw-Calls. Der Beach-Schaumpuls kostet gar nichts:
  er animiert den Kantenring, den `world/island.ts` ohnehin baut.
- **Das Publikum hängt an der `islandGroup`, das Flugzeug-Zeug an der
  `propGroup`.** Beide fahren beim G1-Wechsel mit, aber die Kulisse nur mit
  `PROP_PARALLAX` (0.55). Was AUF der Bühne steht (Publikum, Glühwürmchen) muss
  1:1 mitfahren, sonst löst es sich beim Absturz von der Insel; was am Himmel
  fliegt, darf zurückbleiben. Der Bogen liegt im +z-Halbraum — von der
  Diorama-Kamera aus hinter dem Duo, nie davor.
- **Draw-Call-Budget: die Bühnen waren schon VOR G3 drüber.** Erste Messung
  (`renderer.info.render.calls`, high): club 269, synth 298, beach 316, space
  237 — das Budget der Roadmap ist 250. Das war kein G3-Schaden, sondern die
  alten Props: eine Palme trug 6 Wedel- und 2 Nuss-Meshes MIT je eigener
  Ink-Hülle (18 Draw-Calls pro Baum, bei 6 Palmen 108), der Synth-Bergring 12
  Kegel + 12 Hüllen + 12 Drahtgitter (36), die Tanzfläche 25 Kacheln mit je
  EIGENEM Material. Behoben durch reines Batching bei gleichem Bild: alles
  Statische gleichen Materials wird in EINE Geometrie gebacken (`bake` in
  `world/island.ts`, `mergeGeometries` mit dem Transform in den Vertices) —
  Palmwedel/Nüsse, Bergring, Sand-Zapfen, Seestern, Schirm, Puffwolken,
  Club-Zapfen/Blöcke, Mini-Inseln, Landelichter, Weltraum-Kristalle und
  -Trümmer; die Kacheln sind ein `InstancedMesh` mit `instanceColor`. Was sich
  EINZELN bewegt (die vier drehenden Amethyste, die Synth-Shards), bleibt ein
  eigenes Objekt. Ergebnis MIT dem neuen Ambient-Leben: club 237, synth 229,
  beach 239, space 219 — und 242 im G2-Boss-Punch-In, der durch die Kamerafahrt
  mehr Kulisse ins Frustum zieht (vor dem zweiten Batching-Durchgang lag genau
  dieser Moment mit 251 noch drüber). Die Kacheln verloren dabei ihren
  Standard-Material-Anteil aus den vier Club-Spots; das ×1.12 im Farb-Term
  gleicht die Helligkeit aus.
- **Streifen sind ein Kreuz aus zwei Dreiecken, Möwen stehen ohne Yaw.** Ein
  einzelnes flaches Dreieck, das in die Flugrichtung gedreht wird, steht je nach
  Bahn kantenständig zur Kamera — also unsichtbar. Das Kreuz kostet ein Dreieck
  mehr und keinen Draw-Call. Die Möwen-Silhouetten drehen aus demselben Grund
  gar nicht mit ihrer Ellipse mit: sie stehen wie ein Sprite zur Diorama-Kamera.
  Beide fliegen bewusst TIEF — der obere Himmel liegt hinter dem HUD-Streifen.

## ROADMAP-V2 Schritt 3 — P1+P3 Bühnen-Sterne & Wand-Telemetrie

- **2026-07-26 — Stern 2 gibt es nur an Boss-Gates; Nicht-Boss-Bühnen tragen
  zwei Sterne.** Die Roadmap schreibt „3 ⭐ pro Bühne", aber zwei der drei
  Kriterien hängen am Gate: „ohne Timeout" setzt einen Timer voraus, den eine
  normale Bühne nicht hat. Die Alternativen wären ein erfundenes Ersatzkriterium
  („keine Rivalin überlebt 60 s") oder ein für immer unerreichbarer Slot —
  beides schlechter als die ehrliche Variante: `starBitsFor(zone)` liefert die
  BITS, die eine Bühne überhaupt tragen kann, die Pips zeigen genau so viele
  Slots (Boss 3, sonst 2), und `totalStars` zählt nur, was die Regeln hergeben.
  Ein gebastelter Save mit „7" auf einer Nicht-Boss-Bühne wird beim Laden auf 5
  maskiert, kann die Meilenstein-Truhen also nicht erschleichen.
- **Combo-Schwelle ×1.1 = 25 Stacks = Tier „Heiß".** Die Roadmap sprach von
  „≥ ×3-Combo" — diese Skala existiert seit dem v12-Nerf nicht mehr:
  `comboMult = 1 + min(stacks, 50)·0,004` deckelt bei ×1.2. ×1.1 ist damit exakt
  die halbe Strecke zum Cap und fällt mit der Tier-2-Grenze zusammen: bei ~5
  Klicks/s in gut fünf Sekunden erreicht, aber sofort weg, wenn man die Combo im
  Shop verfallen lässt. `STAR_COMBO_STACKS` wird aus der echten Kurve abgeleitet
  (Schleife über `comboMult`), nie als zweite Zahl gepflegt — ändert sich die
  Balance, wandert die Grenze automatisch mit. Der Stern zählt nur bei
  KLICK-Kills: Idle-DPS zieht weder Combo noch Krit (P1), ein Crew-Tick, der
  zufällig in ein heißes Fenster fällt, hat ihn nicht verdient.
- **Der Fehlversuch ist EIN Skalar, kein Set.** „Ohne Timeout" heißt: zwischen
  dem ersten Boss-Spawn dieses Anlaufs und dem Kill lag kein Timeout. Man kämpft
  immer nur an einem Gate, also reicht `bossFoulZone` (0 = sauber). Gesetzt beim
  Timeout, gelöscht beim Kill DIESES Gates — und verworfen, sobald ein Boss auf
  einer anderen Bühne spawnt: nach einer Aszension ist der Anlauf auf Bühne 10
  ein neuer, kein ewig verdorbener. Persistiert (Run-Zustand, überlebt kein
  Prestige), damit ein Reload mitten im Retry den Fehlversuch nicht vergisst;
  ohne Persistenz wäre F5 der billigste Stern-Exploit des Spiels.
- **Save v10 → v11 vergibt bewusst NICHTS rückwirkend.** `lifetimeMaxZone`
  würde verraten, welche Bühnen ein Alt-Save geclert hat — „ohne Timeout" und
  „Combo" lassen sich aber nicht rekonstruieren. Eine halb gefüllte Sammlung
  (jede Bühne genau ein Stern) wäre irreführender als eine frische, und weil die
  Sterne rein kosmetisch sind, geht dabei keine Macht verloren. Neu im Schema:
  `stageStars` (Zone → 3-Bit-Maske), `starsAwarded` (Meilenstein-Highwater) und
  `bossFoulZone`; die Sterne überleben alle drei Prestige-Schichten (Sammlung
  wie Achievements), der Fehlversuch nicht. Die X7-Matrix ist um v11 gewachsen
  (gesundes + kaputtes Fixture) — genau die Bremse, die X7 dafür gebaut hat.
- **Meilenstein gegen einen Highwater, nicht gegen einen Zähler.** Alle 15
  Sterne fällt eine Holztruhe. Ein „schon ausgezahlt"-Flag pro Block wäre
  fragil; stattdessen speichert `starsAwarded` die Sterne, die bereits gezahlt
  haben (immer ein Vielfaches von 15), und `milestoneChests(total, awarded)`
  rechnet die Differenz aus. Ein Reload zahlt damit nie doppelt, ein Import mit
  46 Sternen zahlt alle drei offenen Truhen auf einmal.
- **P3: Die Greedy-ROI-Rangfolge zieht in `heroes.ts` um — eine Quelle für Bot
  und Tipp.** `sim.buyCrewGreedy` trug die Rangfolge (nächstes Level vs. nächste
  Fähigkeit, Special-Stufen als KLAMMER zur folgenden Power-Stufe gepreist) als
  private Schleife. Für den Spiel-Tipp wäre eine Kopie das Schlimmste gewesen:
  Bot und Ratschlag würden lautlos auseinanderlaufen. Jetzt ist es
  `heroes.bestCrewBuy(levels, ups, gilds, budget)` — pur, getestet, vom Sim mit
  `budget = gold` und vom Advisor mit `budget = 3 × gold` aufgerufen. Die
  Sim-Anker (E1–E4, Himmelfahrts-Fenster, Pacing-Tabelle) sind unverändert grün,
  die Extraktion ist verhaltensgleich.
- **Das ×3-Budget des Tipps ist Absicht.** Genau an der Wand ist oft NICHTS
  bezahlbar; ein „spar auf Türsteher Lv 121" ist dort die nützlichere Antwort
  als Schweigen. Weiter als das Dreifache greift der Tipp nie (Invariante im
  Test: `cost ≤ 3 × gold`), sonst empfiehlt er Träume statt des nächsten
  Schritts. `affordable` unterscheidet in der Zeile „jetzt kaufen" von „(sparen)".
- **Burst-Annahmen: konservativ und benannt.** 30-s-Fenster (`BOSS_TIME_S`, ohne
  Chronilla/Gear-Verlängerung), 5 Klicks/s als realistische Dauerrate (der
  Balance-Bot rechnet mit 3/s), Combo-Mittel ×1.1 (halbe Strecke zum Cap — bei 5
  Klicks/s stünde man nach ~10 s am Cap, aber Anlauf und Shop-Griffe drücken den
  Schnitt), Krit-EV ×1.8 aus den BASIS-Konstanten (dieselbe Annahme, mit der
  §4.8 kalibriert ist). VOLL eingerechnet wird nur der Boss-Schadens-Stack
  (Glutaeus, Tyrann-Gear, `boss`-Specials) — Macht, die sicher da ist und nur im
  Bosskampf zählt. Draußen bleiben On-Beat ×1.5, Ekstase ×10 und der Coach: alles
  davon macht den echten Burst nur größer, die Schätzung bleibt eine Untergrenze
  und der Tipp verspricht nie zu viel. Schwelle für die Zeile: Lücke > 20 %
  (`bossGap < 0.8`) — knappe Kämpfe sind der spannende Normalfall und brauchen
  keinen Ratschlag.
- **Throttle: rechnen im 0.25-s-Tick, verstecken sofort.** `hud.advise` läuft
  nur aus dem gedrosselten Tick (die Kauf-Rangfolge scannt die ganze Crew und
  hat im Klick-Pfad nichts verloren) und hinter einer Cache-Signatur aus
  Gold/Leveln/Fähigkeiten. Das VERSCHWINDEN hängt dagegen an der
  Change-Detection von `hud.update`: Sichtbarkeit teilt sich die Bedingung mit
  dem „Boss herausfordern"-Button (`atFrontierGate`), also ist die Zeile in dem
  Moment weg, in dem der Boss die Bühne betritt — ohne auf den Tick zu warten.

## ROADMAP-V2 Schritt 2 — G1+G2 Bühnen-Wechsel & Boss-Auftritt

- **2026-07-26 — Aus zwei Cuts werden zwei Momente.** G1: `World.setBackground`
  bekam ein drittes Argument `{ animate }`. Damit fährt die ALTE `islandGroup`
  in 0.5 s mit Cubic-Ease-In und leichtem Tilt 17 Einheiten nach unten aus dem
  Bild (die Kulisse mit 0.55-Parallaxe hinterher), wird ERST DANN entsorgt und
  neu gebaut, und die neue Bühne schwebt in 0.7 s mit Ease-Out + kleinem
  Überschwinger (~0.35 Einheiten) herein. Kamera bleibt ruhig; getickt wird in
  `world.update(dt)` aus dem bestehenden Render-Loop. Drei Entscheidungen, die
  nicht offensichtlich waren:
  (1) **Palette überblendet stetig über beide Phasen.** Sky/Fog/Deck-Ton und
  das Licht-Rig werden nicht am Umschaltpunkt gesetzt, sondern von der alten
  zur neuen Palette gelerpt (`paletteFor`/`snapshotPalette`/`applyPalette`) —
  sonst hätte mitten im Wechsel der Himmel hart umgeschlagen, also genau der
  Hard-Cut, den G1 beseitigen soll. Diskret bleiben nur Dinge, die es sein
  müssen (Deck-Map/Emissive-Map brauchen einen Programm-Rebuild) — die passieren
  unter dem Bildrand.
  (2) **Duo + Kontaktschatten fahren NICHT mit, sie treten ab.** Der naive Weg
  (Spieler-Wrapper und Rivale am Insel-Versatz mitziehen) zerreißt die
  Cheek-Physik: die Federn (k = 190, c = 7) laufen in WELTkoordinaten, ihr
  stationärer Nachlauf ist c·v/k, und bei Spitzengeschwindigkeit ~100 u/s wären
  das ~3.7 Einheiten Gummiband quer über die Bühne. Kompensieren hieße den
  Physik-Zustand von außen anfassen — verboten. Also: ab −0.35 Einheiten
  Deck-Versatz werden Duo und Kontaktschatten unsichtbar (16 px Bewegung, der
  Wechsel hat sichtbar begonnen) und kommen mit der neuen Bühne zurück. Dafür
  gibt `createScene` den Kontaktschatten jetzt heraus.
  (3) **Klicks werden IGNORIERT, nicht gepuffert**, und Idle-DPS/Coach/Boss-Timer
  pausieren für die 1.2 s. Puffern hätte einen Klick-Schwall auf einen Rivalen
  losgelassen, der gar nicht auf der Bühne steht, und Combo-Fenster/On-Beat/
  Ekstase-Ladung verfälscht. Nebeneffekt, der zählt: kein Idle-Kill kann mitten
  im Wechsel den nächsten Wechsel auslösen (der Fall ist zusätzlich abgesichert
  — ein `animate`-Aufruf während eines laufenden Übergangs tauscht das ZIEL,
  statt hart umzuschalten).
- **G2 — der Boss-Auftritt.** Beide Spawn-Pfade (25/25 auf der Boss-Bühne und
  der „Boss herausfordern"-Button) laufen jetzt durch EIN `bossEntrance()`:
  CSS-Banner „👑 <Bossname>" rollt oben in die `.topui`-Spalte ein (Name aus
  `rivalName` — dieselbe Quelle wie das HUD, damit beide nie auseinanderlaufen),
  0.8 s Licht-Moment und ein Bass-Drop-Stinger (`audio.bossIntro()`: Rausch-
  Riser 0.45 s → Sub-Sinus 110→32 Hz → Sägezahn-Grollen + Klatsch, alles im
  bestehenden WebAudio-Graph, keine Samples). Der Licht-Moment senkt Key/Fill/
  Hemi **und** `renderer.toneMappingExposure`; das war die eigentliche Erkenntnis:
  ein reines Rig-Dim ist auf der Bühne kaum zu sehen, weil das Rig dort gar nicht
  die dominante Lichtquelle ist (die Club-Spots stehen auf Intensität 90, halbe
  Kulissen leuchten emissiv). Die Belichtung senkt alles gleichmäßig, das Rig-Dim
  gibt dem Moment die Form. Dazu ein Kamera-Punch-In über das FOV (−14 %) statt
  über die Position, damit die Kamera ruhig bleibt — dieselbe „kurz zupacken,
  weich lösen"-Hüllkurve wie der Screen-Shake. `resize()` stellt den Punch
  vorher zurück, sonst würde `frameCamera` die Distanz aus dem gepunchten FOV
  rechnen und die Bühne dauerhaft falsch rahmen.
- **G2 — der Sieg-Beat.** Boss-Kill: Konfetti aus dem bestehenden Partikel-Pool
  (fünf Abschusspunkte quer über die Insel statt eines zentralen Klumpens),
  `audio.bossWin()` bekam einen Schluss-Akkord + Jubel-Klatsch statt abzureißen,
  Truhen-Toast unverändert. Zonen-Clear ohne Boss-Gate: zwei kurze, leisere Töne
  (`audio.zoneClear()`), damit der Boss der lautere Moment bleibt. Reihenfolge in
  `onKillProgress` gedreht — erst Sieg-Beat (Toast/Fanfare/Konfetti) auf der
  alten Bühne, DANN `updateBackground()`; vorher wäre der Wechsel losgelaufen,
  bevor der Sieg überhaupt zu sehen war.
- **Preset-Pflicht**: `QualityPreset` trägt jetzt `stageTransition`, `cinematics`
  und `confetti`. low = Hard-Swap wie vor G1, keine Regie, kein Konfetti;
  medium/high animieren, high wirft doppelt so viel Konfetti. 557 → 559 Tests.
- **Headless-Beweis** (SwiftShader läuft ~0.2× Echtzeit und EIN Screenshot
  kostet ~0.3 Simulationssekunden — eine Frame-Serie aus EINEM 1.2-s-Übergang
  wäre zwangsläufig grobkörnig): der gleiche Übergang wird sechsmal gefahren und
  je Durchlauf EIN Frame an einer festen Position der Fahrt geschossen, getriggert
  über den echten Insel-Versatz (`window.chVs()` liefert dafür jetzt zusätzlich
  `stageY`/`swapping`, read-only wie der Rest des Hooks). Belegt: 6-Frame-Serie
  Synthwave → Neon-Club ohne Hard-Cut, Boss-Auftritt mit Banner + sichtbarem Dim +
  Punch, Boss-Kill mit Konfetti und anschließendem Wechsel, low-Preset ohne jede
  Bewegung. 0 Page-Errors.

## ROADMAP-V2 Schritt 1 — X7 Save-Migrations-Matrix

- **2026-07-19 — Jeder historische Save-Stand hat jetzt ein Fixture-Paar.**
  P1 (Sterne), A1 (Modifikator-Seeds) und P4 (Baum) bumpen als Nächstes das
  CH-Schema; vorher bekam die Ladekette ihr Netz. `ch-store-matrix.test.ts`
  zieht JEDEN Stand v1 … v10 durch `loadCh` → `migrateCh` → `isChSave` →
  `stateFromSave`. Aufbau: EIN Spielstand (Bühne 55, 12 345 Gold, Crew
  boss 80 / hype 30 / legend 6, 130 RS), pro Version in der Sprache seiner
  Ära ausgedrückt — jede Slice erscheint genau ab der Version, die sie
  eingeführt hat. Geprüft werden beide Richtungen: Kernfelder + Ära-Slices
  verlustfrei nach oben, jüngere Slices exakt auf ihrem dokumentierten
  Default nach unten (`createGear`/`createChests`/`createMeta`/
  `createTranscend`/…). Dazu pro Version EIN kaputter Alt-Save an genau den
  Feldern DIESER Ära (fehlende Slices, Prototyp-Keys wie `skin: "toString"`,
  negative/gebrochene Zähler, NaN-Timer): repariert wird slice-isoliert, der
  Kern bleibt unangetastet. Und die Gegenprobe — ist ein GATE-Feld hin (gold
  NaN, zone 0, crew-Level negativ, lastSeen weg, roh-`NaN` im JSON), fällt
  die Kette sauber auf `null` = Frischstart und wirft NIE. Zwei Extras: ein
  Fixpunkt-Test (Re-Save/Reload des migrierten Standes driftet kein Feld) und
  eine Bremse für den nächsten v-Bump — `VERSIONS` wird gegen `CH_SCHEMA`
  geprüft, ein Bump ohne neues Fixture-Paar färbt die Matrix rot. 515 → 556
  Tests, KEINE Produktions-Änderung nötig. Eine Beobachtung fürs Protokoll:
  `migrateChV4toV5` überschreibt ein vorhandenes `rsLifetime` mit den
  gebankten Seelen, statt `max(rsLifetime, souls)` zu nehmen — die einzige
  Stelle der Kette, die einen Highwater SENKEN kann. Für echte v4-Saves
  folgenlos (bis v4 gab es keine Seelen-Senke, verdient == gehalten; auch der
  Legacy-Import hebt `rsLifetime` immer auf ≥ `souls`). Review-Entscheid
  (Fable): trotzdem gehärtet — `max(prior, souls)`, ein Highwater darf durch
  die Kette NIE sinken, auch nicht für Hand-Edits; ein Monotonie-Testfall
  pinnt das (556 → 557 Tests).

## Bühnen-Rücknavigation + Boss-Fallback

- **2026-07-19 — „Zurück zur Vor-Bühne farmen" als echter Loop.** Drei Teile:
  (1) Der Zonen-Strip zeigt NUR erreichte Bühnen (keine Zukunfts-Spoiler)
  und ist wieder klickbar — `travelTo` (Kern, war nie weg) bekam seine UI
  zurück; reist man weit zurück, bleibt die Frontier als „… N"-Slot immer
  erreichbar (sonst käme man nicht mehr zum Boss-Gate). (2) Boss-Timeout
  wirft jetzt auf die VOR-Bühne zurück (`tickBoss` → zone−1, Frontier
  bleibt) statt die Boss-Bühne neu zu bevölkern — dort BP farmen, Upgrades
  kaufen. (3) „👑 Boss herausfordern"-Button (nur an der unbesiegten
  Frontier-Boss-Bühne): `challengeBoss` überspringt die Rivalen-Welle —
  der Retry kostet Farm-Zeit, aber kein Neu-Grinden. Der Sim-Bot modelliert
  exakt das (`retryBossZone`: Welle nur beim ERSTEN Anlauf, Retry per
  Button), damit die v12-Kalibrierung vergleichbar bleibt; einzige ehrliche
  Verschiebung: die längste Power-Durststrecke wächst durch die
  Fallback-Detours von ≤ 90 auf ~95–98 min (Anker neu: 105 min).
  Stolperfalle im CSS: `.boss-challenge { display:block }` stand später im
  Sheet als `.hidden` (gleiche Spezifität) und überschrieb das Verstecken —
  `.boss-challenge.hidden` explizit ergänzt; Overlay brauchte zudem
  `pointer-events:auto`. Headless bewiesen: Strip 4–8 ohne Zukunft,
  Rückreise + Theme-Wechsel, Frontier-Rücksprung, Button-Sichtbarkeit in
  allen drei Zuständen, 0 Page-Errors.

## Web-Assets für ALLE 10 Playermodels (Goal)

- **2026-07-19 — Pipeline generalisiert, ein Draco-glb pro Skin.**
  `web_asset.py` nimmt jetzt Stem-Parameter (`models/web/<skin>.glb`) und
  zieht bei Boss-Rigs den root.scale-Faktor 1.12 auf die Bone-Offsets nach
  (`ROOT_SCALE` — Hüft-Sway lebt in Weltmaß; die Empties erben den Faktor
  über die Hierarchie, Pose-Bones nicht). Alle 10 Skins durchgelaufen:
  86–99 KB pro glb, jede Budget-Zeile BESTANDEN, Deformations-Gates als
  JPEG (PNG→JPEG: 5,8 MB → 320 KB Repo-Gewicht). Demo bekam eine
  Skin-Leiste (Emoji-Buttons, `?m=<skin>` für Deep-Links); Headless-Sweep
  über alle 10: Idle+Twerk laden und wechseln, 2 Draw Calls, 75–163 ms
  Load, null Konsolen-Fehler. Das Einzel-Asset `character-web.glb` ist
  durch das 10er-Set ersetzt.

## Web-Asset-Pipeline — Pirat als animiertes Draco-glTF (97 KB)

- **2026-07-19 — 10-Stufen-Auftrag headless umgesetzt, Look bleibt 1:1.**
  `tools/blender/web_asset.py` verdichtet den Roh-Export des Piraten (25 100
  Tris, 66 Segmente) auf EIN skinned Mesh mit EINEM Material: Vertex-Colors
  statt Textur (baseColorFactor × Map-Mittelwert — null Texturbytes),
  sublineare Tri-Budget-Verteilung (t^0.7, Floor 72: Kugeln geben ab,
  Zylinder behalten Form — der erste linear verteilte Versuch erzeugte
  „Windrad"-Kappen an Brust/Bündchen), manuelles 18-Bone-Armature auf den
  Physik-Kontrakt-Namen (alle Bones +Y/Roll 0 ⇒ Rest-Matrizen = Identity ⇒
  Spiel-Posen laufen WERTGLEICH auf Pose-Bones, exakt die render_anim-
  Konjugation). Zwei bewusste Abweichungen vom interaktiven Stufenplan:
  starres Skinning statt Automatic Weights + Gelenk-Loops (das Spiel animiert
  starre Segmente — Rigid-Binding repliziert den Look fehlerfrei, Candy-
  Wrapper unmöglich, headless deterministisch) und KEIN globales Merge-by-
  Distance (würde Vertices benachbarter Bones verschweißen → Risse).
  Actions „Idle" (Hip Circles @0.85) + „Twerk" (@1.15) mit exakt
  geschlossenen Loops (Frequenz-GCD je Move ⇒ Periode 2π/f_base), Cheek-
  Jiggle aus der echten Feder-Sim (Welt→pelvis-lokal via invertierter
  Pose-Matrix), NLA-Strips → zwei glTF-Clips. Budgets ALLE unterboten:
  5 988/10 000 Tris · 1/2 Slots · 18/40 Bones · 97/800 KB · 1 Draw Call.
  `models/web/index.html`: three.js + GLTFLoader + DRACOLoader (lokaler
  Decoder-Pfad, kein CDN), Hemisphäre + 2 Directionals statt HDRI. Headless
  verifiziert: 230 ms Load, beide Clips spielen/wechseln, 0 Konsolen-Fehler;
  vendor/-Fremdcode auf den Lint/Prettier-Ignorelisten.

## Cartoon-Real-Rigs — echte Hände/Füße/Haare + Proportionen (Goal)

- **2026-07-19 — Realismus im Cartoon-Rahmen, ohne die Physik anzufassen.**
  Alle Verfeinerungen hängen als MESHES unter den unveränderten Bone-Pivots
  (`stepPhysics`/`applyPose`/`renderCheeks` bleiben byte-gleich): Kopf-Bone
  1.18 → 1.06 (≈1:6-Proportionen; Physik schreibt nur head.rotation, Skalieren
  ist silhouette-sicher), Ohren an jedem unverdeckten Kopf, Deltoide,
  Handgelenke und Waden für alle Human-Stile. Hände: Handflächen-Sphäre mit
  IN DIE GEOMETRIE gebackener Skalierung (`geometry.scale()` statt
  `mesh.scale`, sonst würden die Kind-Finger verzerrt), vier gekrümmte
  Capsule-Finger + opponierbarer Daumen; der Robo bekommt segmentierte
  Mech-Greifer. Schuhwerk pro Stil mit Sohlen-Unterkante exakt auf dem alten
  Boden-Plant (knee-lokal −1.075): Schnür-Sneaker mit Socke+Zunge,
  Derby+Absatzblock (Host), Panzerstiefel mit Goldkappe+Manschettenring
  (Boss), Split-Toe-Tabi (Ninja), Lederstiefel mit Umschlag + dunkler Sohle
  (Pirat), Glutnaht (Lava), Mech-Boot mit Heck-Thruster (Robo). Haar pro
  Skin echt geschichtet: Swoosh+Koteletten+Strähne (Klassiker),
  Puff-Wolken-Afro statt Helm-Kugel (Disco), Zwei-Lappen-Pompadour (Host),
  Unter-Kronen-Haar + Kinnbart (Boss), Bandana-Zopf + Ohrring AM Ohr
  (Pirat). Alles trägt Maps (Pore/Brushed/Weave/Leder=Pore). Headless
  verifiziert: alle 10 Skins in-game (0 Page-Errors) + Blender-Renders;
  Coverage-Gate 276/276 lit (100 %). models/ 58 → 66 MB (mehr Meshes —
  beobachten, ggf. Segment-Counts senken).

## Senior-Textur-Pass in Blender — 100 % Material-Abdeckung (Goal)

- **2026-07-19 — Warum ein Blender-seitiger Pass nötig war.** Der
  Three.js-GLTFExporter exportiert `bumpMap` NICHT (glTF kennt nur
  `normalTexture`) — alle In-Game-Reliefs (Planken, Pailletten, Sandkorn,
  Samt) kamen flach in Blender an, und zig Principled-Materialien
  (Accessoires, Enrich-Props, Dioramen-Böden) hatten gar keine Map.
  `tools/blender/textures_bpy.py` schließt beide Lücken pro Modell: (1) aus
  jeder Farb-Map wird per numpy-Sobel über die Luminanz eine echte
  **Normal-Map abgeleitet** (dunkle Fugen = Rillen, 128 px, Strength 2.2)
  und im glTF-Muster `TexImage → Normal Map → Principled.Normal` verdrahtet;
  (2) jedes lit Material OHNE Farb-Map bekommt eine near-white
  **Grain-Map** (256 px Wolken-Rauschen, Seed aus dem Datei-Stem) im
  Exportmuster `Mix(MULTIPLY, TexImage, Farbe)` — der Exporter erkennt das
  und schreibt die Farbe als `baseColorFactor` — plus die Grain-Normal.
  Unlit-Materialien (Ink-Linien, Augen) bleiben bewusst flach. Der Pass
  hängt in `refine_models.py` NACH dem Enrich (auch Props/Böden werden
  vervollständigt); `verify_models.py` hat jetzt ein hartes Coverage-Gate:
  jedes lit Material ohne Textur ⇒ Exit 1. Spiel-seitig bekamen die letzten
  flachen Materialien Maps (Gelenke gebürstet, Schuhe Webstoff,
  Rivalen-Bauch Punkte), damit Roh-Export und Refine dieselbe Sprache
  sprechen.

## Roadmap-Phasen T + L — Textur-Vollausbau, Licht & Bloom

- **2026-07-19 — T1–T5 in-game.** Prozedurale Maps rendern jetzt mit 512²
  (Maler bleiben im 256er-Koordinatenraum, `SCALE`-Transform), Anisotropie
  folgt dem Quality-Preset (1/4/8, GPU-gedeckelt, retroaktiv auf den Cache).
  Relief via `bumpMap` = dieselbe near-white Muster-Map (dunkle Fugen lesen
  als Rillen) auf allen Insel-Materialien + Deck (`deck.bump`). Charaktere:
  pro Skin-Stil eigener Stoff (Robo gebürstet, Disco Pailletten mit
  Emissive-Funkeln, Ninja Carbon, Showmaster Nadelstreifen, Boss Samt inkl.
  Cape), Haar-Strähnen, Poren-Grain; Rivalen pro Theme (Konfetti/Scanlines/
  Schalen-Bump/Glow-Flecken). Props: Palmen-Rinde, Speaker-Tolex,
  Discokugel-Facetten, Berg-Korn, Planeten-Bänder, Krater-Mond, Wolken-
  Wattierung. T5: Kanten-AO-Ring (transparenter Radial-Grime) erdet jedes
  Deck. Alles weiter prozedural + near-white — Paletten/Hue-Laps tinten.
- **2026-07-19 — Phase L.** Licht-Rig (`SceneLights`) wandert mit der Kulisse:
  pro Theme eigenes Key/Fill/Hemi/Rim-Set (Beach goldene Stunde, Synth
  rosé/cyan, Space hart-kalt); Schatten-Frustum auf das Insel-Zentrum
  (1.4/1.7) statt Welt-Ursprung. `engine/post.ts`: RenderPass →
  UnrealBloomPass (Threshold 0.82 — nur echte Emissives) → OutputPass,
  aktiv NUR im high-Preset; low/medium rendern direkt ohne Composer-Kosten.
  Bundle 702 → 726 KB. T6: Modell-Kette neu gelaufen — Maps in den glbs,
  22/22 verifiziert (Samt-Cape im Boss-Render sichtbar).

## v12 — Progression massiv verlangsamt + Combo-Nerf (Goal)

- **2026-07-19 — Goal „a lot slower, scales too fast with everything".** Sechs
  Schrauben, simulationsgetrieben abgestimmt: Combo-Multiplikator ×2 → ×1.2
  (COMBO_STEP 0.02 → 0.004 — „nur ein bisschen mehr Schaden"; Combo-TIERS und
  ihre Perks unverändert), DPS_TUNE 2 → 1.5, HERO_COST_GROWTH 1.07 → 1.075,
  GOLD_DIVISOR 15 → 20, ABILITY_COST_MULT 6 → 9, Pfirsich-Boost ×3 → ×2 samt
  halbierter Truhen-BP-Fenster (2/7/25/90 min statt 5/15/60/240) — die Messung
  zeigte, dass die LOOT-ECONOMY der dominante Beschleuniger war. Verworfen:
  SOUL_BONUS-Nerf (0.1 → 0.07 brickte den Casual komplett — das
  Seelen-Compounding ist die Lebensader; `rsLifetime` ist ein Highwater, wer
  auf derselben Max-Zone re-aszendiert, bekommt NICHTS Neues) und DPS_TUNE 1.4
  (No-Econ-Casual flat bei z20).
- **2026-07-19 — Neue Pacing-Envelope (±25 %).** t10 0.93 → 1.75 min; erste
  Wand z30–39 → z25 (t25 ≈ 31 min; z30 im ersten 45-min-Sitting bewusst
  unerreichbar); Frontier-Kette z75 in Run 3–4 statt 2; realistischer
  Econ-Spieler t75 ≈ 3.9–5.4 h (Anker-Bot jetzt MIT Economy — ohne sie wallt
  der 1-cps-Bot bei z25, der Loot-Layer ist Teil des echten Spiels); erste
  Himmelfahrt 5.4–5.7 h → 15.3–15.5 h. E2 braucht Spieler-Geduld statt
  Reflex-Bot (stallSeconds 240 → 1500, Budget 400k s): 15 Verbesserungen bis
  z75, Himmelfahrt feuert, Worst-Ratio 0.88 < 2 — die Wand bleibt WEICH. E4
  („Klick ist König") hält auf jedem Seed, aber der Combo-Nerf drückt den
  Vorsprung bewusst: Floor 8 → 4 Zonen (gemessen 5–15). Economy-Witness auf
  zwei Seeds gesplittet (Token+Shards / Shards→Gear-Level).

## v11.1 — Klick-Verlust-Bugfix + Tier-Rhythmen (Goal)

- **2026-07-19 — „Fähigkeit kaufen braucht Doppelklick" = DOM-Swap unterm
  Finger.** Der 0.25-s-Idle-Tick rendert den offenen Shop-Tab per
  `innerHTML` neu; da Idle-Gold die Anzeige fast jeden Tick ändert, wurde der
  DOM bis zu 4×/s getauscht. Lag ein Mousedown auf dem alten Button und der
  Swap vor dem Mouseup, feuerte der Click auf einen gemeinsamen Vorfahren —
  Kauf verloren (oder schlimmer: der Zeilen-Handler levelte statt der
  Fähigkeit). Dreifach-Fix in `crew.ts`: (1) EIN delegierter Click-Handler auf
  dem persistenten Container statt Listener pro Zeile, (2) Render-Aufschub,
  solange ein Pointer in der Liste gedrückt ist (Flush per `setTimeout(0)`
  NACH dem Click-Dispatch), (3) Signatur-Skip identischer Rebuilds. Headless
  bewiesen: 350-ms-Press kauft beim ersten Mal, 10 Schnellklicks zählen alle.
- **2026-07-19 — Tier-Rhythmen + Groove-Special (Abwechslung).** Statt überall
  striktem Power/Special-Wechsel folgt jedes Mitglied einem von drei
  TIER-RHYTHMEN (`TIER_PATTERNS`: P-S-P-S, P-P-S-S „Kraft-Rush", P-S-S-P
  „Utility-Klammer") — alle mit 2 P + 2 S pro 4er-Zyklus (Langzeit-Balance
  identisch, nur die Reihenfolge liest sich pro Heldenkarte anders) und alle
  mit Power auf Tier 1 (schützt die frühe Pacing-Wand). Neue Special-Art
  `idle` („Groove", +20 % Crew-DPS, nur Idle-Seite — P1-schonend wie das
  Idle-Gear) für Musik-Produzent + KI-Choreo-Cluster. Sim: das Special-Bundle
  scannt jetzt durch BIS ZU ZWEI Specials in Folge zum nächsten Power-Tier
  (sonst Deadlock der Kauf-Lane bei P-P-S-S/P-S-S-P); `gold`/`crit`/`idle`
  folden real in Income/EV/DPS. Envelope hält ohne Neuverankerung (512 Tests).

## Auto-Bühnen, Halbraum-Zentrierung, Themen-Inseln + Texturen (Goal)

- **2026-07-19 — Bühnen nicht mehr wählbar, Wechsel nur nach Boss.** Zonen-Strip
  ist reine Anzeige (Buttons → Spans), Travel-Pfeile entfernt (`travelTo` bleibt
  pure/Sim-genutzt). Theme-Rotation alle 5 Bühnen: weil `BOSS_EVERY = 5`, liegt
  JEDER Theme-Wechsel exakt hinter einem gewonnenen Bosskampf (5→6, 10→11, …).
  Recolour-Lap folgt der kürzeren Tour (20 Zonen), Rivalen-Namen sind jetzt
  themengebunden statt generisch rotierend.
- **2026-07-19 — Insel im 50-%-Halbraum zentriert via `setViewOffset`.** Statt
  Aim-Offset (Ziel seitlich verschieben ⇒ perspektivischer Skew am Bildrand)
  rendert die Kamera eine 1.5×-breite virtuelle Ansicht, deren Zentrum bei 75 %
  der Fensterbreite liegt — die Kamera schaut GERADE auf die Insel, die
  Projektion setzt sie in die Mitte der rechten Fensterhälfte. Distanz
  aspect-abhängig aus der Insel-Ausdehnung (ganze Bühne sichtbar), Nebel auf
  die größere Distanz nachjustiert (0.022 → 0.012).
- **2026-07-19 — Jede Bühne eine EIGENE Insel + prozedurale Texturen.** Die
  geteilte Erd-Insel (scene.ts) wurde durch vier Themen-Bauwerke ersetzt
  (`world/island.ts`, von der World mit der Kulisse gebaut/disposed): Club =
  Stein-Plattform mit pulsierender Neonkante + Amethyst-Zapfen, Synth =
  Chrom-Deck mit doppelter Neonkante über Neon-Drahtgitter-Kiel (+ das Grid ist
  jetzt scrollende EMISSIVE-MAP über die GANZE Fläche — der alte GridHelper
  deckte nur 9 von 12.8 Einheiten), Beach = Sandbank mit Sandstein-Strata +
  Schaumkante, Space = vernietetes Metall-Deck auf Krater-Asteroid mit
  Landelichtern. Auch die Hintergrund-Füllung ist themengebunden (Blöcke/
  Portale/Mini-Inseln/Asteroiden). Texturen sind prozedurale Canvas-Maps
  (`engine/textures.ts`, gecacht inkl. Repeat-Klone — Material-`dispose()`
  fasst Texturen nie an), NEAR-WHITE gezeichnet, damit Materialfarbe +
  Hue-Lap-Shift weiter tinten. Modelle: Shorts/Cheeks tragen ein Gewebe-,
  Rivalen ein Punkt-Raster. Spielfläche (Radius/Zentrum/Höhe) unverändert —
  Physik/Kamera/Klick-Logik unberührt.

## Choreografie komplett + Blender-Animations-Renders (Goal)

- **2026-07-19 — Moves vervollständigt + Klick→Tanz-Akzente.** Die 5 Prototyp-
  Moves artikulieren jetzt den ganzen Körper (Arm-Pumps, Kopf-Bobs, Knie-Pulse
  auf zuvor eingefrorenen Kanälen), plus 3 neue Routinen (Welle, Booty-Slam,
  Diva-Turn). Klick-Interaktion als ADDITIVE Akzent-Ebene
  (`character/accents.ts`) NACH `stepPhysics`: Hip-Pop pro Klick (Combo-Tier-
  skaliert, On-Beat-Bonus, Krit = Arm-Flare, Ekstase = Dauer-Shimmy) — der
  unantastbare Physik-Kontrakt schreibt absolute Werte und resettet die
  Offsets damit jeden Step von selbst; ein Guard verhindert Doppel-Anwendung
  auf Frames ohne Physik-Step.
- **2026-07-19 — Animations-Renders IN Blender, ohne Choreo-Duplikation.**
  `dump_poses.mjs` bündelt das echte `choreo/moves.ts` per esbuild und samplet
  Pose-Frames (12 fps, Phase-Rate 2.2 wie das Spiel); `render_anim.py`
  keyframt sie mit dem exakten `applyPose`-Mapping auf die (neu benannten)
  Rig-Nodes des Charakter-glb. Stolperfallen dokumentiert: der glTF-Importer
  konvertiert JEDEN Node nach Z-up ((x,y,z)→(x,−z,y)); Rotationen per
  Konjugation mit Rx(+90°); three-Euler 'XYZ' ≠ Blender 'XYZ' — deshalb die
  exakte three.js-Quaternion-Formel statt Euler-Moduswahl. Die Po-Backen
  laufen durch die Spiel-Federphysik (k 190/c 7/GRAV 3.2, 120-Hz-Substeps,
  1 s Warm-up) statt handanimiert. Ergebnis: 8 Loop-GIFs (Cycles + Denoise,
  Studio-Rig + Holzboden) in `models/renders/anim/`.

## v11 — Themen-Specials statt uniform „+100 % DPS" (Goal)

- **2026-07-19 — Gerade Ability-Tiers = Themen-Special des Mitglieds.** Spieler-
  Feedback: „langweilig, dass alle Abilitys immer +100 % DPS sind." Neu: ungerade
  Tiers (1, 3, 5, …) bleiben die klassische Verstärkung (+100 % Eigen-Output,
  mult = 1 + n_power), jedes GERADE Tier gewährt das crew-weite Themen-Special
  des Mitglieds — DJ Wumms/KI-Cluster +12 ms Beat-Fenster, Hype-Girl/Viral-Team
  +0,2 s Combo-Fenster, Türsteher/Orbital-Station +25 % Boss-Schaden,
  Influencerin/Produzent/Tycoon +25 % BP, Choreograph/Hologramm +1,5 %
  Krit-Chance, Booty-Boss/A-Promi +0,5× Krit-Schaden, Legende/Kosmische Entität
  −5 % Ekstase-Ladung. Die Specials folden in exakt dieselben Glue-Hooks wie die
  Twerk-Ahnen (`crewSpecialBonuses` in `recompute` gecacht); Combo/Beat sind
  gedeckelt (+3 s / +60 ms), Krit-Chance behält den 40-%-Cap, Ekstase teilt den
  90-%-Clamp. Der `crewUp`-Zähler-Save bleibt unverändert gültig (Kind ist reine
  Funktion von (Mitglied, Tier)) — **keine Schema-Migration**.
- **2026-07-19 — Sim-Bot: Bundle-Bewertung statt Special-Deadlock.** Abilitys
  kaufen strikt in Reihenfolge; ein Special hat für den Output-greedy Bot
  Grenzwert 0 und würde die Lane des Mitglieds für immer blockieren. Der Bot
  bewertet ein Special daher als TOR zum nächsten Power-Tier (Bundle-ROI über
  beide Kosten); `gold` foldet real in `goldMultiplierNow`, `crit`/`critdmg` in
  `critFactor` — `boss`/`combo`/`beat`/`ekstase` bleiben unmodelliert
  (Lower-Bound-Prinzip wie die Boss-Mults). Envelope-Neuverankerung: Bank-Ramp
  508→1295→2074 (v10: 508→2074, ×3-Assertion → ×2), z75 weiter in Run 2,
  t10 0,93 min unverändert, t30 12,9/16,3 min (in ±25-%-Toleranz).

## Blender-Refine-Pass — Modelle final, Szenerie als Dioramen (Goal)

- **2026-07-18 — `tools/blender/refine_models.py`: Veredelung IN Blender, reproduzierbar.**
  Spieler-Goal: „work in render and refine all the models; scenery is very important;
  do everything in blender; no further refining needed afterwards." Statt die .glb
  einmalig von Hand anzufassen, ist der Refine ein **deterministischer Pipeline-
  Schritt** (export_all → refine_models → verify_models), damit „fertig" auch nach
  jeder Regeneration fertig bleibt:
  - **Mesh-Hygiene:** Merge-by-Distance 1e-4 (Primitive-Nähte), Normals konsistent
    nach außen, Shade-Smooth-by-Angle 60° — Rundungen glatt, Kanten hart.
  - **Material-Politur:** Roughness-Floor 0,65 (glTF-Defaults rendern sonst
    plastikglänzend; das Spiel re-skinnt eh mit `toonMat`).
  - **Szenerie = Dioramen:** jede Bühne bekommt einen thematisch materialisierten
    Boden-Zylinder (Club glossy-dunkel, Synth violett-emissiv, Strand-Sand,
    Weltraum-Asphalt), Radius aus der Prop-Bounding-Box — aus der losen Prop-Wolke
    wird ein in sich geschlossenes Asset.
  - **Render-Nachweis:** jedes Modell wird mit Studio-Rig (3-Punkt-Sun-Setup,
    Auto-Framing-Kamera über die BBox, Cycles + OIDN-Denoise) nach
    `models/renders/*.jpg` gerendert; das Rig wird NICht exportiert (Export vor
    Rig-Aufbau). Stolperfalle dokumentiert: der glTF-Importer konvertiert nach
    **Z-up** — Boden/Kamera-Mathe muss in Blender-Koordinaten rechnen, exportiert
    wird wieder Y-up (`export_yup`).

## v10 — Kaufbare Crew-Fähigkeiten & langsamere Progression (Goal-Rebalance)

- **2026-07-18 — Slot 1 = Klick-Linie, Rest = DPS; Meilensteine werden KAUFBAR.**
  Explizites Spieler-Goal: „progression slower; upgrade 1 is click damage, every
  upgrade after that is dps; every 25–50 levels a buyable ability (e.g. +100 % dps);
  careful not to make it too fast." Umsetzung (`heroes.ts`, CH-Save **v10**):
  - **Booty-Boss (`click: true`)** gibt pro Level **Klick-Schaden** (baseDps 1/Lv),
    nie DPS; alle 14 weiteren Mitglieder sind reine DPS-Linien. Klick =
    `CLICK_BASE + Boss-Linie + 0,2 × Gesamt-DPS` — P1 bleibt strukturell erhalten
    (E4 unverändert grün, alle 5 Seeds).
  - **Fähigkeiten statt Gratis-Meilensteine:** Das alte automatische ×2 bei
    10/25/50/… ist ERSATZLOS gestrichen. Stattdessen: kaufbare Fähigkeit-Tiers ab
    **Lv 25, dann alle 50 Level** (25/75/125/…, endlos — im geforderten
    25–50-Fenster), je **+100 % Basis-Output additiv** (Mult = 1+n), Preis =
    Level-Kosten am Unlock-Level × `ABILITY_COST_MULT = 6`. Additiv statt
    exponentiell ⇒ Langzeit-DPS(Level) bleibt in der M9-Anti-Plateau-Klasse
    (~Level²), aber mit ~8× flacherer Konstante — UND jede Stufe kostet Gold.
  - **`DPS_TUNE = 2` (Idle-Rückgabe).** Die reine Umstellung über-nerfte die
    Idle-Seite (~×8 Multiplikator-Verlust): der realistische 1-cps-Bot war nach
    12 h bei Bühne 20 gebrickt, E2-Bot loopte flache Aszensionen. ×2 auf die
    DPS-Basen (nur DPS-Linien, nicht die Boss-Klick-Linie) stellt die Idle-Route
    wieder her; Aktive spüren davon nur den 20-%-Share.
  - **Gemessene neue Envelope** (Sim, kalibrierte Bedingungen): t10 ≈ 0,93 min
    (Klick-Linie macht den Start knackig), **erste Wand Bühne 30** t30 ≈ 12–15 min,
    Single-Run-Best 35–39 (Bühne 35 in einer 45-min-Sitzung bewusst nicht mehr
    sicher erreichbar), realistischer kumulativer Marsch **t75 ≈ 4,6 h** (alt: t80
    3–5 h ⇒ klar langsamer; Bühne 80+ braucht jetzt echt den Prestige-Stack),
    erste Himmelfahrt 8,2–8,8 h (altes Fenster hält), E2 16 Marks/z80 mit
    ≥ 1 Himmelfahrt. **Test-Re-Kalibrierung dokumentiert im sim.test:** Tabelle
    neu verankert (t10/t30, t75-kumuliert), E2-`stallSeconds` 90→240
    (Spieler-Geduld-Modell folgt dem langsameren Takt) + ×2-Bound erst nach
    4-Gap-Warm-up (der eine ~×3-Spike ist exakt die designte erste Wand vor der
    ersten Aszension), Loot-Witness-Seed 1→7 (Chest-RNG-Strom verschoben).
  - **Save v10:** `crewUp`-Ledger (gekaufte Tiers je Mitglied), Migration v9→v10
    (leeres Ledger — alte Gratis-Mults werden NICHT nachgeschenkt, das ist die
    Verlangsamung), Repair klemmt gekaufte Tiers auf `abilityTiersUnlocked(level)`.
    `crewUp` lebt und stirbt mit `crew` (jeder Prestige-Reset leert beides).
  - **UI (`crew.ts`):** Boss-Zeile zeigt „Klick" statt DPS; pro Mitglied
    Gold-Button „Fähigkeit: +100 % … · Preis" sobald freigeschaltet
    (stopPropagation gegen den Row-Kauf-Handler), sonst Fortschrittsbalken
    „Fähigkeit n ab Lv X"; Level-Badge zeigt gekauften Mult (`Lv 80 · ×3`).

## M15 — Transzendenz LIVE (Schicht 3, §4.5.3)

- **2026-07-18 (Part 2) — UI, Glue, Sim & Docs für die volle Transzendenz-Schicht.**
  Part 1 (`8ea3c81`) hat die Live-Verrohrung geliefert (CH-State-`transcend`-Slice,
  CH-Save **v9** inkl. Migration v8→v9 + `repairTranscend`, `×3^TE` gefaltet in `dpsOf`
  **und** `clickDamageOf`, `transcendState`-Reset-Glue, `TRANSCEND_ENABLED = true`,
  Diamant-Booty ab `transcendences ≥ 1`). Part 2 macht die Schicht spielbar:
  - **🔮-Tab (`ui/transcend-panel.ts`).** Spiegelt das 🌈-Himmel-Panel: Arm→Bestätigen-
    „Transzendieren"-Button (zwei Klicks, 4-s-Fenster) — **disabled außer**
    `canTranscend(state.transcend, state.heaven.hpfLifetime)`. Zeigt gehaltene/Lebenszeit-TE,
    die Transzendenzen-Zahl, den `×3^TE`-Boost, die +TE-Vorschau und — vor der ersten
    Transzendenz — den Gate-Fortschritt `hpfLifetime / 100` mit klarem „🔒 gesperrt"-Hinweis,
    dass eine Transzendenz L1 **und** L2 wipet. **Gate-Metrik = `state.heaven.hpfLifetime`**
    (Lebenszeit-HPF), NICHT gehaltene HPF.
  - **Tab-Reihenfolge:** 🔮 sitzt **direkt hinter 🌈 Himmel** (vor 🎁 Truhen) — das hält die
    Prestige-Leiter ✨ Ruhm → 🌈 Himmel → 🔮 Transzendenz zusammenhängend und in Reihenfolge,
    was am besten liest. Neun Tabs; die Tab-Leiste scrollt seit M13 horizontal (nichts clippt).
  - **Mythos = bewusst minimaler Platzhalter.** Der Spent-TE-Content-Baum ist im M15-Scaffold
    leer (§11 offene Frage #5 „bewusst dünn"). Das Panel rendert einen sauberen
    „Mythos-Skins — bald"-Platzhalter; **keine** Balance erfunden, kein realer TE-Sink
    gebaut. Absichtlich, damit die Held-TE der einzige (P1-neutrale) Effekt bleibt.
  - **L2-Wipe-Gefahr im Handler (`main.ts`).** `transcendState` setzt `heaven =
createHeaven()` — ein **strikt tieferer** Reset als eine Himmelfahrt. Der `onTranscend`-
    Handler repliziert daher **exakt** die Post-Himmelfahrt-Re-Seeds, damit kein Timer/State
    an der alten (weggewischten) Heaven hängt: `syncMaxZones()` **zuerst** (faltet
    Combat-Maxzonen + **RNG-Cursor** + Combo in den State, bevor der Reset greift) → `combat =
withBossTimerBonus(spawnFor(1,0,1))` (Zonen/Front-Travel auf Bühne 1) → `comboState =
createCombo(state.combo.stacks)` → `comboT3KeyAwardedThisRun = false` → `lastShakeTier = 0`
    → `recompute()` → `updateBackground(true)` → Panel-Refreshes `crew/ancients/prestige/
heaven/gear/meta` (**inkl. `heaven.refresh()`** — anders als der Himmelfahrt-Handler, weil
    L2 hier resettet wird) → `hud.update(...)` (malt das 🔮-Badge) → `abilityBar.update(...)`
    → Toast → `checkAchievements()` → `audio.unlockJingle()` → `persist()`. **Peach
    `nextPeachAt` und Sugar `nextSugarAt` brauchen KEINEN Re-Seed** — `transcendState`
    bewahrt `peach`/`gear` (wie die Himmelfahrt), die Zeitstempel bleiben gültige Zukunft;
    der Boot-Glue re-seedet sie nur bei `≤ 0`/absurder Zukunft. Der Live-`rng` wird NICHT neu
    erzeugt (nur der Import-Handler tut das) — Cursor-Kontinuität via `syncMaxZones`.
  - **HUD-Badge.** `ch-hud.ts` hängt `· 🔮 ×N` (`transcendGlobalMult(te)`) an die
    change-detektierte Seelen-Zeile (`#souls`), sobald `transcendences > 0` — analog zum
    `🍑 HPF`-Badge und wie dieses **außerhalb** des Klick-Hot-Path-`innerHTML`. Zeigt auch bei
    0 Seelen/HPF (der Mult überlebt den L1+L2-Wipe): z. B. `✨ 0 Seelen · +0% Schaden · 🔮 ×9`.
  - **Achievement `transcend-1` („Transzendent", 🔮).** Erste Transzendenz; `AchievementCtx`
    um `transcendences` erweitert (`state.transcend?.transcendences ?? 0`), mit Test.
  - **Flag-Respekt.** `isTranscendEnabled()` gated die Panel-Instanz + den Tab; bei
    `VITE_TRANSCEND=0` blendet der Handler die 🔮-Tab **und** ihren Body sauber aus.
  - **F7 aufgelöst (E2 durch den vollen v2-Prestige-Stack).** `simulateContinuous` bekam ein
    `fullPrestige`-Flag: der Bot kauft nach jeder Aszension **Twerk-Ahnen** greedy **und**
    führt beim Seelen-Plateau eine **echte Himmelfahrt** (`bankHimmelfahrt` + L1-Reset) aus.
    E2 fährt jetzt darüber und asserted (a) die ×2-Soft-Wall-Schranke, (b) ≥ 16 produktive
    +5-Verbesserungen (hoch von ≥ 12), (c) `himmelfahrten ≥ 1` über ≥ 8 Ahnen-kaufende
    Aszensionen — der volle Stack ist nachweislich exerziert (`himmelfahrten = 1`,
    `ascensions ≈ 10–12`, worst ratio ≈ 1,89, ~0,2 s/Seed).
    **RESIDUAL (dokumentiert, nicht erzwungen):** die erreichbare Decke bleibt im
    < 1-s-Budget bei ~Bühne 80 / 16 Verbesserungen, **nicht** den „ersten ~30" der Spec. Die
    erste Himmelfahrt an der Bühne-80-Seelen-Wand bankt nur `⌊√(2074/1000)⌋ = 1` HPF (+2 %
    global) — viel zu wenig, um Bühne 80 zu brechen; eine 2. HPF bräuchte `rsLife ≥ 4000`
    (≈ Bühne 88), was 1 HPF nicht erreicht: eine echte Henne-Ei-Soft-Wall, die nur der
    beabsichtigte Multi-HPF-Grind über Tage (§4.5.2/§4.8-Pacing) löst. 30 Verbesserungen
    bräuchten eine minutenlange Sim — also asserten wir die ehrliche Decke + die Tatsache,
    dass die Ahnen-+-Himmelfahrt-Codepfade wirklich laufen. **Keine bestehende Assertion
    gelockert.** `sim.test.ts` bleibt grün (39 Tests, ~7 s < 10 s).
  - **F10(a)/F10(b)/F10(c) — in Part 1 aufgelöst.** F10a: `gear.ts` gated Diamant-Booty auf
    die reale `ctx.transcendences` (via `gearUnlockCtx`), keine zweite Wahrheitsquelle mehr.
    F10b: `transcendGlobalMult` liest bewusst gehaltenes `te` (Spending auf Mythos handelt
    Global-Power gegen Content — konsistent mit Souls/HPF). F10c: `ch-state.test.ts` hat den
    echten P1-Neutralitäts-Assert (TE skaliert `clickDamageOf` UND `dpsOf` um exakt `3^3`,
    Klick:Idle-Verhältnis invariant, an den realen Pipelines).
  - **Headless-Smoke (Wegwerf, nicht committet).** `scratchpad/smoke-m15.mjs` über `vite
preview :4188` + Playwright-Chromium: 14/14 Checks grün — 🔮-Tab existiert/öffnet; ein
    v9-Save mit `hpfLifetime ≥ 100` zeigt „Transzendieren" enabled (+2 TE), Arm→Bestätigen
    bankt TE (te = 2, persistiert), resettet Seelen/Zone/HPF auf frisch und lässt `🔮 ×9` im
    HUD; ein Save unter dem Gate (50 HPF) zeigt „gesperrt"; null Seitenfehler (der bekannte
    `navigator.vibrate`-Headless-Hinweis gefiltert). Staging via `addInitScript`, weil der
    App-`beforeunload`-`persist()` sonst einen gecrafteten Save mit dem alten In-Memory-State
    überschreibt.

## M14 — Endless-QA, Transzendenz-Gerüst & Release 2.0

- **2026-07-18 (Review) — Review-Pass-Fixes (Ehrlichkeit & billige Korrektheit).**
  - **Nicht-endliches TE-Gate:** `teForHpfLifetime(Infinity)` gab `Infinity` zurück,
    obwohl der JSDoc „Non-finite ⇒ 0" versprach. Guard auf
    `!Number.isFinite(hpfLifetime) || hpfLifetime < TRANSCEND_MIN_HPF_LIFETIME` gezogen
    (Threshold-Semantik unverändert), Test `teForHpfLifetime(+∞) === 0` ergänzt.
  - **§9.3 Präzisions-Assert (§9.5 Assert #3, Teil AC4):** `simulateFloatGuard` trackt
    jetzt `minGainRatio` = min(Gold-Zuwachs/Gold-Total, Schaden/Ziel-HP-Max) und der
    AC4-Test asserted `> 2^-50` (additiver Stall-Guard — kein Per-Tick-Zuwachs
    unterläuft seinen Akkumulator). `FloatGuardResult` um das Feld erweitert.
  - **Ehrliche Sim-Kommentare:** die §4.8-„weit früher/optimal-vs-real"-Zitate (ein Satz
    ohne Spec-Entsprechung) in beiden Bühne-80/Himmelfahrt-Blöcken auf eine ehrliche
    Modellierungs-Begründung umformuliert (player-facing Tabelle vs. realistischer Bot),
    ohne Logikänderung. Modul-Header von `sim.ts` entschärft: statt „folds _every_
    power-affecting system" jetzt „folds the crew/gild/soul/ancient/heaven/gear/loot
    terms; see exclusions below" + explizite Ausschlussliste (**Heaven-Layer inert** —
    kein Treiber bankt eine Himmelfahrt, also `sim.heaven` hpf 0 und alle
    Heaven/Truhen-Magnet/Coach-Mults ×1 — plus Twerk-Ekstase, Boss-Schadens-Mults,
    Chronilla-Timer, `travelTo`-Farming; jeder nur beschleunigend ⇒ E1–E4 bleiben
    ehrliche Untergrenzen). `stepSecond`-Doc auf die tatsächliche Frontier-Gatung des
    Rival-Truhen-Rolls korrigiert (nicht „jeder Rival-Kill").
  - **Krit-Chance im Sim gedeckelt:** `critFactor` deckelt die Chance jetzt auf
    `CRIT_CHANCE_CAP` (0,4) wie die echte Klick-Pipeline (`click.critChance`), damit ein
    fetter Token-Pool die EV nicht über das Spiel hebt.
  - **Schärfere Sim-Asserts:** E1 prüft wieder run2 ≥ run1 (nicht-strikt, Loot-RNG darf
    gleichziehen); der Float-Guard-Tiefen-Assert von `> 1e40` auf `> 1e58` gezogen
    (reale `bossHp(300)` ≈ 1,3e63) und der stale „~1e58"-Kommentar auf ~1e63 korrigiert.
  - **N4-Nachzug:** `ui/hud.ts`, `ui/settings.ts`, `ui/shop.ts` entfernt (0 Importeure,
    repo-weit gegrept inkl. Tests) — beweisbar tot nach N4s eigenem Kriterium. Kein Test
    betraf sie ⇒ Game-Testzahl bleibt 480; Bundle unverändert (nie im Entry-Graph). Der
    frühere N4-Eintrag (falsche Erbe-Pfad-Begründung) ist oben korrigiert.
  - **`flags.ts`-Kommentar:** „production builds inline the constants" war irreführend —
    der `import.meta.env[`VITE_${key}`]`-Zugriff per **berechnetem** Key wird von Vite
    **nicht** statisch ersetzt; Kommentar auf „Laufzeit-Auflösung, in Prod `undefined`,
    FLAGS-Default gewinnt" korrigiert (null Laufzeitrisiko: kein Live-Importeur).
  - **`TESTPLAN.md` §5.1:** die Referenz auf `scratchpad/perf.mjs` (nicht im Repo)
    als Wegwerf-Messskript markiert — analog zum AC3-Capture, damit kein Doc auf eine
    nicht-existente Repo-Datei verweist.

- **M15-TODO (im Review-Pass bewusst NICHT gefixt, für M15 vorgemerkt) — ALLE in M15
  aufgelöst (siehe M15-Sektion oben):**
  - **F7 — E2 durch eine Ära-Sim mit Ahnen + Himmelfahrt** fahren (näher an den
    „ersten 30" Verbesserungen); aktuell validiert E2 unter der Kalibrier-Baseline mit
    ~12–16 Verbesserungen als ehrliche Decke. — **✅ M15 Part 2:** `simulateContinuous`
    hat jetzt `fullPrestige` (Ahnen-Käufe + echte Himmelfahrt); E2 asserted ≥ 16
    Verbesserungen + `himmelfahrten ≥ 1`. Residual (~Bühne-80-Decke, nicht 30) dokumentiert.
  - **F10(a) — `gear.ts` (~Z. 485) `case 'transcend': return false`** ist eine ZWEITE
    Wahrheitsquelle unabhängig von `flags.ts`. M15 muss das umlegen (oder `gear.ts` das
    Flag lesen lassen), wenn `TRANSCEND_ENABLED` gekippt wird. — **✅ M15 Part 1:**
    `skinUnlocked` gated Diamant-Booty auf die reale `ctx.transcendences`.
  - **F10(b) — `transcendGlobalMult`:** festzurren, ob der Faktor gehaltenes `te` oder
    `teLifetime` liest (aktuell held `te`, spending-empfindlich) — Design-Entscheid M15.
    — **✅ M15 Part 1:** bleibt gehaltenes `te` (Spending handelt Global-Power gegen Mythos).
  - **F10(c) — echter P1-Neutralitäts-Beweis:** ein expliziter M15-Akzeptanztest, dass
    der `×3^TE`-Mult **identisch** in `clickDamageOf` UND `dpsOf` gefaltet wird und das
    Klick:Idle-Verhältnis invariant bleibt (heute nur im `transcend.test.ts` an
    entkoppelten Basiswerten gezeigt, nicht an den realen Pipelines). — **✅ M15 Part 1:**
    `ch-state.test.ts` `P1-neutrality`-Test an den realen Pipelines (`3^3`, Ratio invariant).

- **2026-07-18 — Performance-Pass: gemessen, nicht geschätzt; Hot-Path unverändert
  (AC2 + §9.6).** Headless über `vite preview` + das vorinstallierte Chromium
  (SwiftShader/ANGLE) gemessen (Wegwerf-Messskript, **nicht committet** — wie das
  AC3-Capture): **Draw Calls
  114/Frame** (< 150 ✓, per Wrapping von `drawArrays`/`drawElements` gezählt — die
  Zahl ist renderer-getrieben und damit hardware-unabhängig), **Partikel-Integration
  ~0,002 ms/Frame** bei voller 200-Slot-Belegung (Mess-AC „< 1 ms" ✓, der flache
  Float-Loop in `engine/particles.ts`), **Popup-Pool exakt bei 24 Nodes gekappt**
  (nie überschritten, `POP_POOL_MAX`), **12-cps-Stress** (60 Klicks/5 s): mittlere
  Klick-Hot-Path-Zeit ~1,6 ms, p50 ~1,3 ms, ein Ausreißer ~9–13 ms (der gedrosselte
  0,25-s-Voll-HUD-Tick), **keine** Konsolenfehler, Gold zählt hoch. Ergebnis des
  Hot-Path-Audits: **sauber, keine Änderung nötig.** Der Klick-Pfad (`doShake` →
  `applyHit` → `pops.damage` → `ChHud.update`) baut **kein** `innerHTML` neu —
  `ChHud` ist change-detected (`setText` schreibt nur bei echter Wertänderung),
  `Pops` recycelt gepoolte Nodes per `textContent`/`style` (kein `createElement`
  nach Warmup, kein `innerHTML`); alle `innerHTML`-Stellen liegen ausschließlich in
  Tab-Render-Funktionen (on-demand, nicht pro Klick). **Lighthouse ehrlich:** ein
  echter Lighthouse-Lauf ist headless unter SwiftShader (Software-GL) nicht als
  60-fps-Laptop-Referenz belastbar — statt eine Zahl zu erfinden, dokumentieren wir
  Bundle-Größe + die obigen hardware-unabhängigen Kennzahlen als 60-fps-Referenz.
  **Bundle:** `dist` = **652,3 KB JS** (gzip 174,5 KB) + 25,0 KB CSS + 6,1 KB HTML
  ≈ 0,68 MB — weit unter dem 5-MB-Budget (§9.6). Die N4-Entfernung ließ das Bundle
  unverändert (toter Code war nie im Entry-Graph → Tree-Shaking hatte ihn längst
  gedroppt).

- **2026-07-18 — N4-Legacy-Entfernung (§11 #7, Default-Zeitpunkt M14): drei
  komplett tote Ketten entfernt, konservativ verifiziert.** Der Erbe-Import ist
  verschifft (M7), damit greift der N4-Entscheid. Vor jeder Löschung den ganzen
  `apps/`-Baum (ts/html/js) gegrept. Entfernt (Modul + Test + toter einziger
  Importeur):
  - `game/events.ts` + `events.test.ts` — **null** Referenzen irgendwo.
  - `game/boss.ts` + `boss.test.ts` + `ui/boss.ts` — `game/boss.ts` wurde **nur**
    von `ui/boss.ts` importiert, und `ui/boss.ts` von **niemandem** (kein `main.ts`,
    kein Test, kein Barrel, kein `index.html`).
  - `game/achievements.ts` + `achievements.test.ts` + `ui/achievements.ts` — analog:
    `game/achievements.ts` (das M4-Legacy-Set über `GameState`) nur von
    `ui/achievements.ts` importiert, das selbst tot ist. Ersetzt durch
    `ch-achievements.ts` (M13, CH-natives Set) — siehe M13-Eintrag.

  Alle drei Ketten sind vom einzigen Entry (`/src/main.ts`) und von **jedem** Test
  aus unerreichbar → beweisbar tot. Bewusste Auslegung von „referenced anywhere
  **live**": ein Verweis aus totem Quellcode (`ui/boss.ts`/`ui/achievements.ts`,
  selbst 0 Importeure) ist **kein** lebender Verweis; um `game/boss.ts` bzw.
  `game/achievements.ts` sauber zu entfernen, MUSS der tote UI-Importeur mit weg
  (sonst bricht `tsc --noEmit` über den ganzen Baum). **Nicht** angefasst: alles,
  was der CH-Modus lebt (combat/economy/state/ability/settings/heroes/gild/ancients/
  ascension/heaven/gear/chests/peach/quests/season/ch-\* …) und der legacy Save-Layer
  (`save/store.ts`, `save/migrate.ts`, `save/schema.ts`) samt `game/state.ts` — der lebt,
  weil die aktive Erbe/Lese-Kette `main.ts → save/store.ts → save/migrate.ts →
save/schema.ts` ihn (über `save/store.ts`, das `createGameState`/`GameState` importiert)
  noch konstruiert und liest. **Korrektur eines früheren Fehl-Eintrags:** die alte
  Begründung nannte `ui/hud.ts` als von „`legacy-import.ts` / dem Erbe-Pfad" gelesen —
  das ist falsch. `legacy-import.ts` importiert nur `ch-state`/`save/schema`, und **kein**
  Modul importiert `ui/hud.ts`, `ui/settings.ts` oder `ui/shop.ts` (repo-weit gegrept,
  Tests inklusive). Diese drei sind nach N4s eigenem Kriterium beweisbar tot und wurden im
  Review-Pass unten mit-entfernt. Netto (ursprüngliche N4-Löschung): **8 Dateien**,
  Game-Testzahl **500 → 480** (−20 Tests / −3 Testdateien), erwartet; Suite bleibt grün,
  **keine** Verhaltensänderung an bleibendem Legacy-Code.

- **2026-07-18 — AC3 dokumentierter Playthrough (frischer Save → 3 Aszensionen → 1
  Himmelfahrt) mit ECHTEN Zahlen aus den echten Modulen.** Getrieben durch
  `simulateAscensionEra` (echte Ökonomie: ROI-Crew, Loot-Faucets, Ahnen-Kauf) +
  die realen Prestige-Formeln (`soulsForMaxZone`, `hpfForRsLifetime`), Seed 7, aus
  einem Wegwerf-Vitest-Capture (nicht committet). Beobachtet: Aszension 1 → Bühne
  **60** / RS-Lifetime **320**; Aszension 2 → Bühne **75** / RS **1 295** (das
  1 000-RS-Himmelfahrt-Gate wird hier überschritten, `firstHimmelfahrtT` ≈ 1 145 s
  Sim-Zeit); Aszension 3 → Bühne **80** / RS **2 074**, MaxPower ≈ 2,1e16 DPS (alles
  endlich, weit unter dem Float-Ceiling). Erste Himmelfahrt bankt
  `hpfForRsLifetime(2074) = ⌊√2,074⌋ = 1` HPF und setzt L1 zurück, während HPF (+2 %
  global + Seelen-Verstärker), Vergoldungen und der Himmelsbaum bleiben. Tabelle in
  `TESTPLAN.md` §11. Ehrlich: die Zahlen sind Sim-getrieben (nicht echte Wanduhr-
  Stunden) — der Zweck von AC3 ist der funktionale Nachweis, dass die Prestige-Kette
  korrekt verkettet und reale Zahlen erzeugt.

- **2026-07-18 — Transzendenz-Gerüst (Schicht 3, §4.5.3) landet als reine,
  getestete Formeln HINTER einem Flag (§11 #5).** `game/transcend.ts` spiegelt
  `ascension.ts`/`heaven.ts`: `TE_earned = ⌊log10(HPF_life)⌋` mit 100-HPF-Gate,
  `×3^TE` **globaler** (P1-neutraler) Multiplikator, held-vs-spent-Buchhaltung und
  ein dokumentierter L1+L2-Reset/Preserve-Vertrag für M15. `game/flags.ts` hält
  `TRANSCEND_ENABLED = false` als einzige Wahrheitsquelle; ein Guard-Test sichert,
  dass die Konstante `false` ist, damit die halbfertige Schicht **nie** versehentlich
  in einen Build leckt. Bewusst dünn (§11 #5): kein `ChState`-Slice, kein Save-Feld,
  keine UI — M15 flippt das Flag und verdrahtet State/Save/UI, **ohne eine Formel
  anzufassen**. Der `×3^TE`-Faktor ist ein Global-Multiplikator (gleich auf Klick
  UND Idle) und daher per Konstruktion P1-neutral (E4/§4.8: „aktiv bleibt König").

- **2026-07-18 — `simulateEndless` voll ausgebaut als CI-Pflicht (E1–E4 +
  Float-Guard, ganze Ökonomie im Bot, §9.5/AC1+AC4).** Der Balancing-Bot fährt jetzt
  die **komplette** M12-Loot-Ökonomie über die echten Module (Golden-Peach ×3 +
  🔑-Chance, Boss/Rival-Truhen, gieriges Truhen-Öffnen → Permanent-Token, 🧩-Shards →
  Gear-Level über die reale `shardCost`-Kurve, Keys aus Boss/Peach). Vollständige
  E1–E4-Suite asserted (E1 kein Hard-Cap, E2 beschränkte Soft-Wall, E3 +50 % Power
  ≤ 90 min, E4 „click is king" — der Abstand wächst mit eingeschalteter Ökonomie —
  plus Best-in-Slot-Gear-P1-Guard). **Float-Guard bis Bühne 300** (AC4, HP ~1e63):
  `simulateFloatGuard` treibt die reale Combat-Frontier via ehrlichem analytischem
  Fast-Forward auf ≥ 300 und auditiert jede getrackte Größe (Monster/Boss-HP, Gold,
  Seelen, Power, Shards/Keys) als endlich und < 1e300. §4.8-Pacing-Tabelle (±25 %)
  bleibt unter den dokumentierten no-loot-Kalibrierbedingungen gültig. Ganze Suite
  grün in ~6 s (**39 Tests**, `npm run test:sim`).

## M13 — Review-Fixes (Meta & Retention)

- **2026-07-18 (Review) — Zukunfts-Tage werden beim Boot GEKLEMMT (`repairFutureDays`),
  analog zu Peach/Sugar (§9.2.2).** `meta.day`/`meta.lastLoginDay` sind monotone
  High-Water-Marks — ein Save, der unter einer weit vorgestellten Uhr geschrieben wurde
  (BIOS-Reset, Test, Cheese), fror damit Dailies/Quests/Logins ein, bis die echte Uhr
  aufholt (im Extremfall Jahre). Neu: pure `repairFutureDays(meta, day)` (quests.ts,
  getestet) klemmt beide Marks in `maybeNewDay` auf HEUTE — neutral (heute wird nichts
  erneut gewährt oder neu gerollt, morgen läuft alles normal weiter). Kein neuer Exploit:
  Vorstell-Farming war laut AC1-Entscheid schon immer möglich („Vorstellen advanced nur
  den Tag") und bleibt davon unberührt.

- **2026-07-18 (Review) — `advanceQuests` ist jetzt auch NACH dem Clamp ein echter No-op.**
  Vorher allozierte jeder Shake zwei Objekte, sobald eine passende Quest ihr Ziel erreicht
  hatte (`min(target, target+1)` schrieb denselben Wert in eine neue Kopie) — die
  DECISIONS-Begründung „no-op-günstig pro Shake" galt also nur bis zur Zielerreichung.
  Jetzt wird erst kopiert, wenn sich mindestens ein Wert wirklich ändert (Referenz-Test in
  quests.test.ts), womit `advanceMeta('clicks')` im Klick-Hot-Path dauerhaft allokationsfrei
  bleibt.

- **2026-07-18 (Review) — AKZEPTIERT: die 5-RS-Quest-Belohnung wird bei Nicht-Ausgebern
  von der nächsten Aszension „zurückverrechnet".** `syncMaxZones` hält `rsLifetime ≥ souls`
  (Highwater), und `applyAscension` zahlt `soulsForMaxZone(deepest) − rsLifetime` aus — wer
  seine Seelen nie in Ahnen steckt (souls == rsLifetime), bekommt die +5 also faktisch nur
  als Vorschuss auf die nächste Aszension; wer je ≥ 5 RS ausgegeben hat (praktisch jeder ab
  dem ersten Ahnen), erhält sie voll. Bewusst NICHT „gefixt": die saubere Trennung
  (Zonen-Gutschrift vs. Lifetime-Einnahmen) bräuchte ein neues Save-Feld (v8 ist
  eingefroren) und Umbauten an der M9/M10-Aszensionsmathematik — für ±5 RS gegenüber
  `1,10^z`-Wachstum unverhältnismäßig. Fehlerrichtung ist deflationär (P1-sicher).

## M13 — Meta, Retention & Leaderboard v2 (Teil 2: UI + Wiring + Docs)

- **2026-07-18 — Event-Increments zentral über einen `earnKeys(n)`-Helfer.** Jeder
  🔑-Faucet (Boss-Kill, Combo-Tier-3, Goldener Pfirsich, Truhen-Reward, Daily-Login,
  Quest-Reward) läuft über eine einzige Funktion, die `chests.keys` **und** den Lifetime-Zähler
  `stats.keysEarned` gemeinsam hochzählt — so wird kein Faucet doppelt oder gar nicht gezählt.
  Schlüssel **ausgeben** (Truhe öffnen) berührt den Lifetime-Zähler nie. Analog werden
  `stats.bossKills` (bereits vorhanden) NICHT verdoppelt — Teil 2 ergänzt nur die fehlenden
  `bossStreak`/`maxBossStreak` + `advanceMeta`-Aufrufe an denselben Sites.

- **2026-07-18 — Achievement- & Tageswechsel-Checks laufen auf dem gedrosselten 0,25-s-Tick,
  nicht im Klick-Hot-Path.** `checkAchievements` (≈ 30 reine Prädikate) und `maybeNewDay`
  (Tag-Roll + Login) sind billig und werden pro Tick + bei diskreten Events (Ascension,
  Himmelfahrt, Truhe öffnen, Boot) aufgerufen. So erscheinen Toasts binnen ≤ 250 ms, ohne pro
  Klick zu allozieren. `advanceMeta` selbst ist no-op-günstig: ohne passende aktive Quest gibt
  `advanceQuests` dieselbe Referenz zurück (keine Allokation) — daher darf `advanceMeta('clicks')`
  pro Shake laufen.

- **2026-07-18 — Combo-Tier-3-Quest auf der steigenden Flanke.** `comboTier3` wird nur
  gefeuert, wenn der Tier von < 3 auf ≥ 3 wechselt (`lastShakeTier`-Tracker), statt bei jedem
  Klick auf Tier ≥ 3 — vermeidet Dauer-Allokation bei gehaltenem Feuer. `maxCombo` wird per
  billiger `Math.max`-Zuweisung jeden Klick aktualisiert (keine Allokation).

- **2026-07-18 — Submit-Prompt-Throttle in separatem `localStorage`-Key, nicht im CH-Save.**
  Die zuletzt angebotene Bestzone liegt unter `bootyclicker.lb` (`{ prompted }`), damit das
  **v8-Save-Schema unverändert** bleibt (Teil 1 hat v8 committet). Der Prompt erscheint **nur
  bei einer neuen Bestzone > prompted** (überspringen bleibt gemerkt) und ausschließlich vom
  Tick — nie aus dem Klick-Pfad, nie erneut, während der Dialog offen ist. Ohne
  `VITE_API_BASE` ist `leaderboard.enabled` falsch ⇒ der Auto-Prompt ist ein No-op (kein Modal
  im Headless-/Offline-Fall, AC4).

- **2026-07-18 — `promptSubmit` (Auto) vs. `openSubmit` (manuell) getrennt.** Der Auto-Pfad
  (neue Bestzone) zeigt den Dialog **nur bei aktiver API** (kein störendes Modal offline). Der
  manuelle 📋-Knopf „Eintragen" zeigt den Dialog **immer** und blendet offline einen
  Offline-Hinweis ein + deaktiviert „Absenden" — so gibt es klares Feedback statt eines toten
  Buttons (AC4). Beide teilen `showSubmit`.

- **2026-07-18 — 8-Tab-Leiste: horizontales Scrollen statt Umbruch.** Mit der neuen 📋-Ziele-
  Tab sind es acht Emoji-Tabs. `.tabs` bekommt `overflow-x: auto` (Scrollbar versteckt) und
  jede `.tab` eine **Mindest-Touchbreite** (`flex: 1 0 auto; min-width: 38px`): bei ≥ 320 px
  passen alle acht in eine Zeile, darunter scrollt die Leiste — keine Tab schrumpft unter eine
  klickbare Größe. (Umbruch auf zwei Zeilen wäre die Alternative gewesen; Scrollen hält die
  Kopfhöhe konstant und stört das Bottom-Sheet-Layout nicht.)

- **2026-07-18 — Meta-Panel change-detected wie die anderen Panels; Claim per Event-Delegation.**
  `ui/meta-panel.ts` baut ein stabiles Skelett einmal und rendert die dynamischen Abschnitte
  (Season/Daily/Quests/Erfolge) nur bei geänderter Signatur neu (Tick + Tab-Open, **nie** im
  Klick-Hot-Path). Claim-Klicks laufen über **einen** delegierten Listener auf `#metaQuests`,
  damit ein Rebuild nie einen Handler verliert; Reroll/Leaderboard-Buttons liegen im stabilen
  Skelett (einmal verdrahtet).

- **2026-07-18 — 📊 Statistik im ⚙️-Tab, gerendert vom Tick (nicht im Konstruktor).** Der
  `ChSettings.render()`-Aufruf läuft über `renderActiveTab('set')`, weil `getState()` in
  `main.ts` `syncMaxZones()` triggert, das die erst später deklarierte `comboState`/`rng`
  referenziert — ein Konstruktor-Aufruf liefe in die temporale Todeszone. Zur Laufzeit (Tab
  offen) sind alle Bindungen initialisiert. On-Beat-Quote wird als %, Spielzeit als h/min/s
  formatiert, alles andere über `ui/format.ts`.

- **2026-07-18 — Saison-Events als winziges reines `game/season.ts` (datumsbasiert).**
  `seasonFor(date)` mappt Monat → optionalen Banner (Oktober „Spooky Booty" 🎃, Dezember
  „Frost-Twerk" ❄️), sonst `null`. Total, DOM-frei, unit-getestet (P6). Wirkung: nur ein
  Banner im 📋-Tab + ein Boot-Toast — **kein** Gameplay-Hardlock, kein Server, Monat in
  **Lokalzeit** gelesen (kosmetisch, daher unabhängig von der UTC-Quest-Uhr; §11.10 akzeptiert
  Zeitzonen-/Datum-Cheese).

## M13 — Meta, Retention & Leaderboard v2 (Teil 1: pure Logik + CH-Save v8 + Client)

- **2026-07-18 — CH-Achievements liegen in `game/ch-achievements.ts`, nicht in
  `game/achievements.ts`.** Das legacy M4-Set (`achievements.ts`, über
  `GameState`/`UpgradeState`) bleibt eingefrorenes Archiv mit grünen Tests (N4). Das
  frische CH-native Set (Bühnen/Boss/Combo/Krit/Aszension/HPF …) bekommt einen eigenen
  Modulnamen analog zur `ch-state`/`ch-store`-Konvention, statt das Archiv zu überschreiben.

- **2026-07-18 — Tagesgrenze = UTC (`floor(now/86.4e6)`).** `dayNumber` zählt Tage seit
  der Unix-Epoche an der **UTC-Mitternachtsgrenze** — timezone-stabil und deterministisch
  (§7.1). Spieler nahe Mitternacht rollen ggf. ein paar Stunden neben lokaler Mitternacht
  über; akzeptiert (§11.10).

- **2026-07-18 — Uhr-Manipulations-Neutralität via monotone High-Water-Marks.** `meta.day`
  und `meta.lastLoginDay` steigen nur (`rollDay`/`dailyLogin` reagieren ausschließlich auf
  `day > gespeichert`). Uhr zurückstellen ⇒ kein Reset, kein erneuter Login-Grant, kein
  erneutes Claimen bereits geclaimter Quests (AC1); Vorstellen advanced nur den Tag (§11.10).
  Wöchentlicher Streak-Schutz ist an die **Kalenderwoche des Login-Tags** gebunden
  (`weekNumber(day)`), deckt genau **einen** verpassten Tag (Gap = 2), Gap ≥ 3 bricht immer.

- **2026-07-18 — Leaderboard-Client v2: injizierbares `fetch`/`base` statt Env-Mutation.**
  `submitScore`/`fetchTop` nehmen ein optionales `{ base, fetchImpl, timeoutMs }`, sodass
  Erfolg/Fehler/Timeout/deaktiviert deterministisch mit einem Fake getestet werden (M5-Disziplin,
  ohne `import.meta.env` zu verbiegen). Default-aus bleibt an `VITE_API_BASE` (leer ⇒ `null`
  ohne Netz-Call). Die M5-`ui/leaderboard.ts` (nicht am CH-Loop verdrahtet) wurde minimal auf
  die v2-Signatur (`ScorePayload`, `maxZone`) gezogen, damit `tsc` grün bleibt — echte
  Prompt-Verdrahtung ist Teil 2.

- **2026-07-18 — Lifetime-Zähler auf `ChStats` ergänzt; Aszensions-Zähler wird von Teil 2
  inkrementiert.** Neu in `ChStats`: `ascensions`, `chestsOpened`, `maxCombo`, `bossStreak`,
  `maxBossStreak`, `keysEarned` (alle 0-Default, via `repairStats` migrationssicher). `stats`
  wird von `ascendState`/`himmelfahrtState` unverändert weitergereicht ⇒ automatisch monoton
  über beide Prestige-Schichten (AC5). `himmelfahrten` wird aus `heaven.ascensions2` abgeleitet
  (keine Dublette), `gilds` aus `totalGilds`. `stats.ascensions` wird bewusst NICHT im puren
  `ascendState` hochgezählt (Event-Increment = Teil 2), damit die Reducer verhaltensgleich bleiben.

## M12 — Review-Fixes (Pfirsich-Truhen & Loot)

- **2026-07-18 (Review) — Boost-Fenster wird beim Boot GEKLEMMT, nie gelöscht
  (`clampBoostUntil`, 24-h-Decke).** Der alte Boot-Guard löschte jedes
  `peach.boostUntil > now + 60 s` — aber Truhen-`boost`-Rewards verlängern das Fenster
  legitim um 10–160 min (§6.2 „stackt Dauer"), d. h. ein Reload nach einer Boost-Truhe
  vernichtete den bereits gutgeschriebenen Reward. Jetzt: pure `clampBoostUntil(until, now)`
  (`peach.ts`, `BOOST_MAX_AHEAD_MS = 24 h`) klemmt beim Boot UND beim Gutschreiben
  (`creditReward`), sodass (a) jedes legitime Stack-Fenster den Reload überlebt und (b) der
  Vor-Uhr-Stellen-Exploit weiter auf ≤ 24 h ×3 begrenzt bleibt. Duration-Stacking hat damit
  eine dokumentierte 24-h-Fenster-Decke. Tests in `peach.test.ts`.

- **2026-07-18 (Review) — Boost-Zeilen werben mit dem GELIEFERTEN Faktor: `boostMult: 3`.**
  Die Tabellen deklarierten ×2, aber die Glue schreibt nur DAUER auf das eine
  ×3-Einkommensfenster (Peach) gut — geliefert wurde also immer ×3. Statt einer zweiten
  Multiplikator-Verwaltung (Architektur) wurden die Daten auf die Wahrheit gezogen
  (`boostMult: 3`, alle vier Tiers; Null-Verhaltensänderung — `creditReward` liest `mult`
  nicht). Loot-Viewer, Reward-Caption und „×3 Boost"-Badge sagen jetzt dasselbe wie die
  Auszahlung (§6.3.5 Transparenz); Test erzwingt `boostMult === PEACH_BOOST`. Zudem
  Kommentar-Fix: Truhen-Magnet ist laut §4.5.2-Knotentabelle der **Key-Drop**-Knoten
  (+25 %, `keyDropMult`), nicht Teil der Luck-Fraktion — die §6.3.4-Aufzählung im Spec ist
  dort inkonsistent; implementiert ist die konkrete Knotendefinition.

## M12 — Pfirsich-Truhen & Loot (Teil 3: 🎁 Truhen-Tab + 🍑-Button + Doku)

- **2026-07-18 — 🎁 als 7. Emoji-Tab; Tab-Reihe auf `font-size: 15.5px` verengt.** Die
  Tab-Zeile hat jetzt sieben Tabs (🕺 🎽 🌀 ✨ 🌈 🎁 ⚙️). Statt eines Umbruchs bleiben sie
  einreihig (`flex: 1`, Emoji-only, Titel per Hover) — die M11-Regel wurde von 17 px auf
  15,5 px + `min-width: 0` gezogen, damit alle sieben auch bei 320 px Panel-Breite passen.

- **2026-07-18 — Öffnen-Animation im Panel gescopt, nicht Vollbild — bewusst.** Der
  `.chest-anim`-Overlay ist `position: fixed; inset: 0`, aber `.shop` trägt `backdrop-filter`,
  das für fixed-Nachfahren einen **Containing-Block** bildet ⇒ der Overlay deckt das Shop-Panel
  (nicht den ganzen Viewport). Das ist gewollt: die ~1,2-s-Animation (wackeln → aufspringen →
  Reward-Cards) stört die Spielszene links nicht und wirkt als sauberes Modal im Panel. Sie ist
  **per Tipp überspringbar** (erster Tipp → sofort Reward-Cards, zweiter → schließen; AC3).

- **2026-07-18 — Overlay als stabiles Kind, Change-Detection via `sig`-Guard.** `#chestAnim`
  liegt als **fixes** Kind neben den neu-gerenderten `#chestHead`/`#chestInv`, damit ein
  0,25-s-Tick-`render()` die laufende Animation nicht wegreißt. `render()` baut die Loot-Tabellen
  **einmal** und rebaut Header+Inventar nur, wenn ein getrackter Wert (Keys, Inventar, Token,
  Skins, Pity) sich ändert — kein `innerHTML`-Rebuild im Klick-Hot-Path (P6/B7).

- **2026-07-18 — Kein Kauf-Pfad: harte Review-Garantie (§6.3.3/P5).** Das 🎁-Panel enthält
  **nichts**, was 🔑/Truhen für Geld kauft oder das impliziert — nur Öffnen (kostet 🔑, die man
  erspielt). Ein Header-Hinweis „ausschließlich erspielbar — kein Kauf, nie" macht es explizit;
  der Headless-Smoke asserted zusätzlich, dass **keine** Kauf-/Echtgeld-Wörter im Tab-Text
  vorkommen. Es gibt spielweit keinen Netzwerk-/Echtgeld-Loot-Pfad (Bestenliste ist die einzige
  optionale Netz-Funktion und trägt kein Loot).

- **2026-07-18 — 🍑-Spawn-Position via `Math.random` (Kosmetik), Clamp/Despawn im Loop (B13c).**
  Der Pfirsich-**Zeitplan** + 🔑-Roll sind seedbar (Teil 1/2); die reine **Bildschirm-Position**
  ist Kosmetik ohne Gameplay-Relevanz und darf `Math.random` nutzen. Der Button wird pro Spawn
  einmal zufällig, aber **geklemmt** platziert (Rand 16 px, Top-Safe 76 px unter HUD/Notch) und
  bei `resize` in den Viewport zurückgeklemmt. Auf schmalen Screens (≤ 640 px) wird er
  **despawnt, solange das Bottom-Sheet offen ist** (`isNarrow && shopOpen`), damit er nie
  darunter feststeckt. Position wird per Loop/`resize`-Handler in `main.ts` gesetzt (kein neuer
  State — der 8-s-Sicht-Zustand leitet sich aus `peach.nextPeachAt` ab).

- **2026-07-18 — Panel liest den geteilten `state`-Ref; Öffnen geht durch die Teil-2-Glue.**
  `Chests` bekommt nur `{ state, open }`. `open` ist `openChestFromInventory` (Teil 2), das schon
  Keys+Truhe abzieht, Rewards gutschreibt, `recompute`/HUD/`persist` macht — das Panel rendert
  danach neu aus dem (in-place mutierten) `state`. Kein Doppel-Buchen, keine UI-eigene Ökonomie.

## M12 — Pfirsich-Truhen & Loot (Teil 2: Save v7 + Ökonomie-Wiring)

- **2026-07-18 — CH-Save v7: `chests { keys, inventory, pity, skins }` · `permTokens` ·
  `peach { nextPeachAt, boostUntil }`.** Migration `v6→v7` verlustfrei (nur Defaults),
  Validator-Muster wie gehabt: Kern streng geprüft, Loot-Slices in `stateFromSave`
  feld-isoliert repariert (Counts = non-neg-Ints, Pity via `normalizePity`, Tokens =
  positive Ints, Peach-Timestamps finite ≥ 0). Ein korruptes Loot-Teilobjekt fällt auf
  Default, nie auf Fresh-Start — echter Fortschritt anderer Slices bleibt.

- **2026-07-18 — Truhen-Skins als Kollektiv-Set in `chests.skins`, KEINE 3D-Rigs.**
  §9.2.1 listet für v7 nur `chests {keys,inventory,pity}`; der Duplikat-Schutz (§6.3.2)
  braucht aber einen persistenten Besitz-Set. Statt eines neuen Top-Level-Felds erweitert
  `chests` um `skins: string[]` (Collectibles) — Duplikat → 🧩 via `resolveDuplicate`
  gegen `ownedChestSkins()`. Bewusst kein neues Rig (Scope-Vermeidung).

- **2026-07-18 — Ein einziges ×3-Einkommensfenster (Peach); Truhen-Boosts stacken DAUER.**
  Der State hält nur `peach.boostUntil` (kein Multiplikator-Feld). Der Chest-`boost`-Reward
  (×2) verlängert dieses Fenster (`base = max(boostUntil, now); boostUntil = base + durMs`),
  vereinheitlicht auf den Peach-×3 — die spec-Regel „stackt Dauer, nicht Faktor" (§6.2)
  wörtlich. Der Boost multipliziert das GOLD pro Kill (in `onKillProgress`, einmal), also
  alle Einkommensströme (Klick + Idle + Coach) gleichmäßig; NICHT den Roh-DPS-Schaden
  (keine HP-Wall-/Boss-Pacing-Verzerrung). Offline lässt den 60-s-Boost bewusst weg
  (irrelevant über Stunden, stale `boostUntil` wäre falsch).

- **2026-07-18 — Permanent-Tokens folden an denselben Sites wie Ahnen/Gear, genau einmal.**
  `permTokenDpsMult` in `dpsOf` (empty ⇒ ×1, Sim unberührt); `permTokenGoldMult` in den
  aggregierten `goldMult(state)` (Kills + Offline); `permTokenCritChance` in die Krit-Chance
  (nach der 40 %-Kappe summiert); der Krit-Schaden-Token als neuer `critMultFactor` in
  `effectiveClick` (skaliert den GANZEN Krit-Multiplikator, additiv-rückwärtskompatibel).

- **2026-07-18 — Truhen-Luck & Key-Drop-Quellen als pure `ch-state`-Helfer.** `chestLuck`
  (Gear-Chest-Luck inkl. Tyrann-Sterne + Truhilda) → `ctx.luck` für `openChest`;
  `keyDropMult = 1 + Gear-keyDrop + Truhen-Magnet`. Der Truhen-Magnet-Knoten (§4.5.2) landet
  jetzt in `heaven.ts` (15 HPF, +25 % Key-Drops, `truhenMagnetBonus`). Boss-Key nutzt
  `keyDropAmount(1, keyDropMult, rng)`: ganzer Teil garantiert („1 garantiert"), Bruchteil =
  geseedete Bonus-Chance ⇒ Truhen-Magnet hebt die Drops messbar.

- **2026-07-18 — Drop-Hooks an den bestehenden Kill/Combo/Session-Sites in `main.ts`.**
  Boss-Kill: +1 🔑 (× keyDropMult) + Truhe `chestTierForBoss(bossZone)`; der provisorische
  🧩-Faucet (M11) bleibt als sanfte Frühgame-Brücke bestehen. Rivalen-Kill: `rivalChestChance(
chestLuck)` (3 % × Luck) → Holztruhe. Combo-Tier 3: 1 🔑, einmal pro Run (Laufzeit-Flag,
  Reset bei Aszension/Himmelfahrt/Import). Session-Drip: alle ~500 Klicks 1 Holztruhe,
  ~3/Tag via leichtem In-Session-Day-Stamp (Laufzeit; das volle Daily ist M13, §7.1) —
  ein Reload setzt Drip/Combo-Flag zurück (dokumentiert, marginal).

- **2026-07-18 — Golden-Peach kehrt als Event zurück; Schedule/Boost persistiert.** Boot
  seedet/klemmt `nextPeachAt` (unseeded/absurde Zukunft ⇒ re-roll, wie der Sugar-Timer);
  die Loop despawnt/reschedult via `updatePeachSchedule`. `catchPeach()` (Glue für Teil 3)
  aktiviert ×3/60 s + `peachKeyRoll` (25 % → 🔑). `openChestFromInventory(tier)` (Glue für
  Teil 3) konsumiert 🔑 + Truhe, öffnet über das pure `openChest`, duplikat-schützt Jackpots,
  creditet jeden Reward, schreibt Pity + RNG-Cursor zurück und persistiert (save-scum-fest).
  Beides plus ein `snapshot()` liegt unter `window.chLoot` für das 🎁-UI (Teil 3) + Smoke.

## M11 — Skins als Gear

- **2026-07-18 (Review) — Katalog-Rebalance: Klick-Gear IST das stärkste Gear (P1),
  per Daten erzwungen.** Die §5.3-Tabelle (Klassiker +4 %/Lv Klick, Robo-Twerk +8 %/Lv
  Crew-DPS) widersprach §5.1 („die stärksten Buffs sind Klick-Buffs"): ein maxed
  Idle-Skin (×5) überholte den maxed Klick-Skin (×3,5). Der Review löst den
  Spec-internen Konflikt zugunsten des Prinzips (P1 ist Design-Pfeiler §1.2, die
  Tabelle nur Balancing-Daten): **Klassiker +8 %/Lv** (Lv 50 + 5★ ⇒ ×5,5 Klick — der
  stärkste Multiplikator im Katalog), **Robo-Twerk +6 %/Lv** (Lv 50 + Space ⇒ ×4,05 —
  stark, aber strikt darunter). Reine `SKINS`-Datenänderung. Der AC5-Sim leitet die
  Best-in-Slot-Multiplikatoren jetzt **aus dem Live-Katalog ab** (jeder Skin × jede
  Kulisse bei Max-Level/Sternen durch den echten `gearBonus`-Fold) und asserted
  zusätzlich den Katalog-P1-Guard `maxKlick > maxIdle` — ein künftiger Daten-Flip
  fällt in CI durch. Beobachteter E4-mit-Gear-Gap ≈ 22 Zonen (vorher ≈ 10). Die
  wörtliche Lesart „nackter Aktiver ≥ 8 vor Idle-Gear-Casual" bleibt unerreichbar
  (Gap ≈ −3 selbst nach dem Rebalance), ohne Idle-Gear komplett zu entkernen — die
  ehrliche, geschützte Invariante ist „beide Seiten mit ihrem besten Gear".
  (Level bleiben 0-basiert gespeichert: 50 Käufe à `shardCost(0..49)`, Max-Buff =
  perLevel·50 wie im Katalog; ein frisch ausgerüsteter Skin wirkt ab dem ersten
  Level-Kauf.)

- **2026-07-18 (Review) — `gear.zoneEver`: Skin-Unlocks sind Einbahnstraßen, auch
  über eine Himmelfahrt.** Die Himmelfahrt setzt `lifetimeMaxZone` bewusst auf 1
  (RS-Buchhaltung, M10) — dadurch verriegelten sich Zonen-/Boss-Skins
  (Robo/Showmaster/Tyrann/Lava) wieder, obwohl §5.3 „Bühne X erreicht" und
  „Erst-Kill" einmalige Erwerbe sind (und investierte 🧩/🍬 unbedienbar wurden).
  Fix: das Gear-Slice (überlebt jede Prestige-Schicht) trägt ein nie-resetendes
  `zoneEver`-Hochwasser; `gearUnlockCtx`/`bossFirstKillZones` gaten auf
  `max(lifetimeMaxZone, zoneEver)`. Gelatcht in `ascendState`/`himmelfahrtState`
  (pur) + `syncMaxZones` (Glue). Wie `crafted[]` ein Reparatur-beim-Laden-Feld
  **innerhalb** v6 (fehlend ⇒ 1; der Kontext-Floor macht Alt-Saves verlustfrei) —
  kein Schema-Bump.

- **2026-07-18 (Review) — Live-Coach zählt Gear-cps mit.** Die Robo-Sterne
  (+0,2 cps/⭐) flossen nur in die Offline-Akkrual (`offlineOpts`), nicht in den
  Live-Loop — der Coach klickte online langsamer als offline. Der Loop nutzt jetzt
  dieselbe Summe `coachCps(heaven) + coachCpsBonus(gear)` wie der Offline-Pfad.

- **2026-07-18 — Skins sind Gear, kein Kostüm: ein einziger puren `GearBonus`-Fold.**
  Der aktive Skin (Buff·Level + Stern·Sterne), der Kulissen-Mini-Buff und die aktiven
  Set-Boni falten in `game/gear.ts` zu **einem** `GearBonus` (eine Summe je `BuffStat`).
  Diamant-Bootys „+X % ALLES" (`allPct`) wird am Ende über **jede** Prozent-Statistik
  verteilt, die Absolut-Stats (Fenster in s/ms, Offline-Cap-Sekunden, Coach-cps, flat
  Ekstase-Sekunden) bleiben unberührt. Kleine Helfer (`clickGearMult`/`dpsGearMult`/…)
  spiegeln das Ahnen-/Heaven-Muster: `dpsOf`/`clickDamageOf` multiplizieren Klick-/DPS-Mult
  direkt ein, der Rest (Krit/Gold/Boss/Combo-/Beat-Fenster/Ekstase/Offline) reicht der Glue
  an genau **einer** Stelle je Faktor durch. Balancing liegt komplett in Daten (`SKINS`-
  Katalog + `KULISSE_BUFFS` + `SET_BONUSES`), nie im Code. **P1:** die stärksten Buffs sind
  Klick-Buffs — deshalb ist der Start-Skin (Klassiker) ein Klick-Skin.

- **2026-07-18 — CH-Save v6: `gear`-Slice + `legacyTyrann`-Latch, feld-isolierte Reparatur.**
  `repairGear` validiert jedes Unterfeld **einzeln** und fällt bei Korruption auf den
  `createGear`-Default zurück — ein kaputter `skin`/`bg`/`crafted`-Key (mit `Object.hasOwn`-
  Disziplin, damit `"toString"` nicht durchrutscht), ein Nicht-Boolean `bgAuto`, Junk-Level/
  Stern-Maps oder ein NaN-`nextSugarAt` reparieren sich **isoliert**, sodass echter
  Fortschritt (gültige Level/Sterne) nie mit-genukt wird. Die v5→v6-Migration füllt nur ein
  frisches `createGear()`; `legacyTyrann` ist ein von `stateFromSave` defaulteter Meta-Bool
  (kein eigener Migrationsschritt). Das später ergänzte `crafted[]` ist ein **Reparatur-beim-
  Laden**-Feld _innerhalb_ v6 (rückwärtskompatibel: ein v6-Save ohne `crafted` wird zu `[]`),
  also kein neuer Schema-Bump.

- **2026-07-18 — Kulissen-Wahl kehrt zurück; „Auto (Tour)" bleibt Default; `gear.bg` = die
  sichtbare Kulisse.** `gearBonus` ist rein über `gear` allein, liest also `gear.bg` für den
  Kulissen-Mini-Buff + die Set-Erkennung. Damit Buff und Bild immer übereinstimmen, ist
  `gear.bg` **stets die auf dem Schirm aktive Kulisse**: im Tour-Modus (`bgAuto`) synct die
  Haupt-Loop `gear.bg` bei jedem Zonen-Tier-Wechsel auf die Rotation (+`recompute`, sodass
  z. B. Space +5 % Crew-DPS mitzieht); bei manueller Wahl rotiert die Loop **nie** von der
  fixen Kulisse weg. So bleibt der Fold deterministisch, ohne dass die Buffs von einem
  UI-Zustand außerhalb `gear` abhängen.

- **2026-07-18 — Provisorischer 🧩-Faucet + `crafted[]`-Latch schon vor M12.** Splitter
  fallen vorläufig aus Boss-Kills (`bossShardReward`), bis M12 die Pfirsich-Truhen als echte
  Quelle liefert — sonst wäre die Level-Ökonomie unspielbar. Damit die Deliverable-Craft-
  Buttons (Neon-Ninja/Pfirsich-Pirat) auch **wirken**, latcht `craftSkin` die gecrafteten
  IDs in ein persistiertes `gear.crafted[]`; `gearUnlockCtx` fädelt das in das (in Teil 2
  noch leere) `crafted`-Set von `skinUnlocked` ein. `gearUnlockCtx` bekam dafür ein
  **optionales** `gear`-Argument, damit ältere Aufrufer (Tests) weiter ein leeres Set sehen.

- **2026-07-18 — E4-mit-Gear misst Klick-Gear vs. Idle-Gear, NICHT „nackt vs. Idle-Gear".**
  Erste, naive Lesart von AC5: der nackte Aktiv-Bot bleibt ≥ 8 Zonen vor einem Casual mit
  Best-in-Slot-Idle-Gear. Der Sim widerlegt das **hart**: ein maxed `dpsPct`-Skin (Robo-Twerk
  Lv 50 ⇒ ×5 Crew-DPS) **dreht** die Reihenfolge im Fresh-Single-Run-Modell (Idler überholt,
  Gap ≈ −10). Das ist kein Bug, sondern die reale Balance: starkes Idle-Gear allein kippt P1.
  Die Invariante, die das Gear-System tatsächlich garantiert (§5.1: die stärksten Buffs sind
  Klick-Buffs), ist deshalb: der **aktive Twerker mit Best-in-Slot-Klick-Gear** (Klassiker
  Lv 50 + 5★ ⇒ ×3,5 Klick) bleibt ≥ 8 Zonen vor dem **Idler mit Best-in-Slot-Idle-Gear**
  (×5). Dafür bekam `SimConfig` je einen `clickGearMult`/`idleGearMult` (nur Klick- bzw.
  nur Idle-Term). Beobachteter Gap ≈ 10 über alle Seeds — P1 intakt, weil Klick-Gear das
  stärkste Gear ist und der aktive Spieler es trägt. (Der 🍬-Reifungstest + die ≥ 2-Set-Tests
  aus Teil 1 bleiben unverändert grün.) **Superseded (Review, oben):** die Zahlen
  (×3,5 vs ×5) verletzten §5.1 wörtlich; der Katalog wurde auf ×5,5 Klick vs ×4,05 Idle
  rebalanciert und der Sim leitet die Multiplikatoren seither aus dem Katalog ab.

## M10 — Ahnen & Ruhmes-Himmelfahrt (Schicht 2)

- **2026-07-18 — Seelen: held-balance + additive-earn statt lifetime-gepinnt.** Vor
  M10 war `souls` eine an die tiefste Bühne gepinnte Bank (`max(current,
soulsForMaxZone)`). Da Ahnen jetzt Seelen **ausgeben**, darf die Aszension das
  Ausgegebene nicht zurückerstatten. Neues Modell: `rsLifetime` = jemals **verdiente**
  Seelen (monoton), `souls` = **gehaltener** Saldo = `rsLifetime − Σ(Ahnen-Ausgaben)`.
  `applyAscension(runMax, lifetime, souls, rsLifetime)` bankt nur den **neuen** Gewinn
  (`max(0, soulsForMaxZone(deepest) − rsLifetime)`) auf den gehaltenen Saldo; gehaltene
  Seelen überleben die Aszension (nur eine Himmelfahrt setzt sie zurück). Eine erste
  Aszension „from scratch" ergibt exakt die alten Zahlen (Bühne 50 ⇒ 129), sodass die
  §4.8-Pacing-Tabellen stehen bleiben. `pendingSouls`/`canAscend` gaten gegen
  `rsLifetime` (Ausgegebenes ist nie re-farmbar). `soulMult(souls, bonusPerSoul)` nimmt
  den Per-Seele-Bonus als Argument, damit der HPF-Verstärker am Call-Site einfließt und
  `ascension.ts` frei von jedem L2-Import bleibt.

- **2026-07-18 — v4→v5-Migration setzt verdiente RS = gebankte Seelen (NICHT
  zonen-basiert).** Naheliegend wäre, `rsLifetime` auf `soulsForMaxZone(lifetimeMaxZone)`
  zu heben. Das ist falsch: `lifetimeMaxZone` wächst live beim Erreichen neuer Tiefen,
  aber verdient (gebankt) wird erst bei der Aszension. Ein Pre-M10-Spieler, der Bühne 60
  erreicht, aber bei Bühne 50 aszendiert hat, hat 129 Seelen (nicht 320). Ein Lift auf
  `soulsForMaxZone(60)` würde die noch **ausstehenden** Seelen (191) beim Laden löschen.
  Pre-M10 wurde nichts ausgegeben ⇒ verdient == gehalten == `souls`, also
  `rsLifetime = souls`. `stateFromSave` hebt danach nur noch `rsLifetime ≥ souls` (kein
  Zonen-Lift), damit auch v5-Saves mit Ausgaben ihren Saldo/Preview behalten.

- **2026-07-18 — Ahnen als Daten; Effekte als pure Aggregat-Modifikatoren.** `ancients.ts`
  hält die 10 Ahnen als Config (id/Name/Flavor/`effect`/`perLevel`/`cap`/`label`); Kosten
  `level+1` RS (Summe n(n+1)/2). `buyAncient` ist rein und durch Seelen **und** Cap
  gegated; Caps nur wo Unbegrenztheit degeneriert (Krit-Chance/Fenster/Timer), die
  Prozent-Ahnen bleiben uncapped (endloser Sink). Die Wirkung fließt über kleine
  Aggregatoren (`ancientClickMult`, `ancientDpsMult`, `ancientCritChanceBonus`, …) in die
  abgeleiteten Pipelines — `dpsOf`/`clickDamageOf` falten Click-/DPS-Mult direkt ein, der
  Rest (Krit/Gold/Boss-Schaden/Boss-Timer/Combo-/Beat-Fenster/Ekstase-Ladebedarf) wird im
  Glue (`main.ts`) an genau einer Stelle je Faktor durchgereicht. So bleibt Balancing
  reine Datenänderung.

- **2026-07-18 — HPF: gleiches held-balance-Modell; Doppelwirkung MULTIPLIZIERT.**
  `hpfForRsLifetime = ⌊√(RS_life/1000)⌋` (erste Himmelfahrt bei 1 000 RS; `HPF(1e6)=31`).
  `heaven = { hpf (gehalten), hpfLifetime (verdient), ascensions2, tree }`. Gehaltene HPF
  wirken doppelt: `heavenGlobalMult = 1 + 0,02·HPF` **und** der Seelen-Verstärker
  `soulBonusEff = 0,10 + 0,002·HPF`. Beide fließen multiplikativ in `dpsOf`/`clickDamageOf`
  — L1 (mehr Seelen) und L2 (fettere Seelen) compounden, statt sich zu addieren.

- **2026-07-18 — Himmelfahrts-Reset-Scope nach AC2 (Vergoldungen bleiben).** Die §4.5-
  Tabelle listet Vergoldungen nicht explizit in L2-„Bleibt", aber das M10-AC2 (Spec §10 +
  Auftrag) sagt ausdrücklich: **RS (souls + rsLifetime) und Ahnen fallen; Vergoldungen,
  HPF, Himmelsbaum und Lifetime-Stats bleiben.** `himmelfahrtState` implementiert das als
  puren Reducer (`{...createChState(), heaven: bankHimmelfahrt(...), gilds, totalClicks,
rng, stats, legacyImported}`) mit exaktem Snapshot-Test. `lifetimeMaxZone` fällt bewusst
  auf 1 (sonst wäre der RS-Reset via pending sofort wieder verdient).

- **2026-07-18 — Himmelsbaum: nur die aktiven Grundknoten, Kampf-/Loot-Knoten nach M12.**
  `TREE_NODES` enthält Coach I–IV, Frühstarter, Nachtschicht I–II, Ekstase-Ausdauer I–III
  (Kosten-Listen pro Level, HPF ausgegeben = permanent). Beat-Drop/Pfirsichregen/
  Truhen-Magnet/Bühnen-Sprinter sind **weggelassen** (statt gekauft-aber-wirkungslos),
  bis M11/M12 ihre Effekte liefern — kein HPF-Verschwendungs-Fallstrick.

- **2026-07-18 — Coach als geglätteter Idle-Schaden + Offline-Anteil.** Der Twerk-Coach
  „klickt 1×/s mit 25 % Klickwert" ist im Loop als `coachDps(clickDmg, cps)·dt`
  (wie Idle-DPS, ohne Krit/Beat, P1) modelliert — deterministisch und identisch zur
  Offline-Formel. `offlineGold` bekommt optionale `{clickDmg, coachCps, capS}`: der
  effektive Durchsatz ist `dps + coachCps·0,25·clickDmg`, gedeckelt per Nachtschicht.
  Reine Klick-/Crew-lose Builds verdienen so offline (Rest von B11). Alte 3-Arg-Aufrufe
  bleiben grün (Opts default leer).

- **2026-07-18 — Sim E3: robustes Kriterium + realistischer Himmelfahrts-Pace.**
  `simulateAscensionEra` (adaptive Aszension, ROI-greedy Crew, power-greedy Ahnen-Kauf
  nach jeder Aszension, held-balance) misst zwei Dinge: **E3** = „+50 % Gesamtmacht
  (effektive DPS+Klick) höchstens alle 90 min über die ersten 20 Aszensionen" (aktiver
  Bot, beobachtet ~6 min ≪ 90 min), und die **erste Himmelfahrt** (RS_life ≥ 1000) im
  Fenster **5–9 h ±25 %** = [3,75 h; 11,25 h]. Wichtig: der optimale 3-cps-Juice-Bot
  erreicht 1 000 RS in ~0,6–1 h — dieselbe Optimal-vs-Real-Lücke, die schon die
  M9-Pacing-Tabelle dokumentiert. Der Himmelfahrts-Pace wird darum mit einem
  **realistischen Spielermodell** (0,7 cps, ohne Juice, ~45-min-Runs) gemessen und landet
  reproduzierbar bei ~5,4–5,7 h. Ein Bug im Era-Bot (Stall-Timer nur bei neuem Lifetime-
  Rekord statt bei jedem Frontier-Vorstoß) hätte ihn bei Bühne 35 plateauen lassen —
  behoben, indem der Timer beim Re-Climb jeder geräumten Bühne zurückgesetzt wird.

## M9 — Endless-Skalierung (Anti-Plateau)

- **2026-07-18 — RS_v2 ist rein additiv, deshalb migrationsfrei.** `soulsForMaxZone`
  bekommt den „Legendäre Auftritte"-Term: `⌊z^1.6/40⌋ + ⌊1.10^z − 1⌋` (§4.5.1). Der
  bestehende `applyAscension`-`Math.max`-Boden (Bank schrumpft nie) macht den Retune
  **ohne Save-Migration** sicher — eine bestehende Bank wird nie kleiner, nur die neue,
  steilere Kurve gilt ab dem nächsten Rekord. Der exponentielle Term (Basis 1,10)
  sorgt dafür, dass jede neue Bestzone die Bank **vervielfacht** statt inkrementiert
  (Tabelle §4.5.1 exakt getroffen: z40→53, z50→129, z100→13818); Property-Test:
  +5 Bestzone ⇒ ≥ ×1,3 für z ≥ 40.

- **2026-07-18 — Endlose Meilensteine per Integer-Verdopplung (float-sicher).**
  `milestoneCount(level)` zählt die 7 festen Schwellen plus jede weitere Verdopplung
  ab 1600 in einer Integer-Schleife (`t *= 2`, exakt bis 2^53) statt via `log2` — so
  gibt es keine Rundungskante an einer Schwelle. `milestoneMult(1600)=2⁸`,
  `(3200)=2⁹`. `nextMilestone` liefert dadurch **immer** eine nächste Klammer (nie
  mehr `null`), was die Crew-Fortschrittsbalken endlos macht (der tote
  „alle Meilensteine erreicht"-Zweig entfällt).

- **2026-07-18 — Gild-Multiplikator lebt in `heroes.ts`, Bookkeeping in `gild.ts`
  (keine Zirkularität).** `gild.ts` braucht `CREW` (Ziel-Wahl) → importiert aus
  `heroes.ts`. Die ×1,25-DPS-Faltung (`gildMult`/`heroDps(cfg,level,gild)`) liegt
  dagegen in `heroes.ts`, damit die DPS **eine** Quelle hat und `heroes` nicht auf
  `gild` zeigt. `totalRawDps`/`clickDamageRaw` nehmen ein optionales `gilds`-Argument
  (Default `{}`) — alte Aufrufer/Tests bleiben unverändert grün.

- **2026-07-18 — Gild-Award über einen Lifetime-Highwater, nicht pro Zone-Flag.**
  `awardGildOnZone(gilds, zone, alreadyGilded, rng)` vergibt genau dann, wenn `zone`
  eine 10er-Bühne ist und noch nicht vergoldet. Der Glue (`main.ts`) leitet
  `alreadyGilded` aus `lifetimeMaxZone` ab: die geräumte 10er-Bühne (`combat.zone−1`)
  bekommt ihr Gild nur, wenn die Front einen **neuen Lifetime-Rekord** setzt — ein
  Re-Clear nach Ascension vergoldet also nie doppelt, und Migration (`gilds={}`) gibt
  keine rückwirkenden Gilds. Ziel-Wahl über den seedbaren RNG ⇒ deterministisch &
  save-scum-fest; das ×1,25 ist permanent und überlebt die Ascension (`ascendState`
  trägt `gilds` mit — Anti-Plateau P3: auch ein „+0-Seelen-Run" hinterlässt Macht).

- **2026-07-18 — CH-Save v4: Guard streng auf Kern, Repair auf `gilds`/`rsLifetime`.**
  Wie schon rng/stats/ability/combo werden die neuen Felder **nicht** in `isChSave`
  gegatet, sondern in `stateFromSave` repariert (`repairGilds` verwirft Nicht-
  Ganzzahl-/Negativ-Einträge, `repairRsLifetime` klemmt auf ≥ 0). `migrateChV3toV4`
  füllt `gilds={}` und seedt `rsLifetime` aus den aktuellen Seelen; die
  Invarianten-Reparatur hebt `rsLifetime` zusätzlich auf `soulsForMaxZone(lifetime)`.
  `rsLifetime` ist der nie schrumpfende Lifetime-RS-Highwater für das spätere
  Himmelfahrts-Gate (§4.5.2), schon jetzt verdrahtet.

- **2026-07-18 — Travel-UI treibt das pure `travelTo`; Klick-Hot-Path bleibt sauber.**
  Der Stepper (`◀ Bühne ▶` + `⏫ Front`) ruft nur `travelTo(state, zone)` (clamped
  1..maxZone) und rendert danach einmalig; die Button-Disabled-Zustände + der
  Farm-Indikator laufen über die change-detected `hud.update`, nie pro Frame. Farmen
  unter der Front lässt `maxZone` (die Frontier) unangetastet — nichts geht verloren.

- **2026-07-18 — `simulateEndless` ersetzt `simulatePlaythrough` als Balancing-Gate.**
  Deterministischer Bot über die echten Module (combat/heroes/ascension/click/gild),
  1-s-Schritte, EV-basiertes Klicken (Combo ×2 + Krit-EV ×1,8 aktiv; nichts casual),
  ROI-greedy-Crew, Boss-Whittling über den Timer, adaptive/fixe Ascension. Reproduziert
  §4.8 Messung 3 (Bank 53→810→2074, Plateau ~Bühne 80). **E2 als „weiche Wand" über
  einen Running-Max robustifiziert:** kein +5-Schritt darf mehr als das Doppelte des
  bisher schlechtesten Schritts kosten (der rohe Nachbarschafts-Quotient ist fragil,
  weil Sub-Sekunden-Re-Climb-Bursts winzige Nenner erzeugen). Beobachtet ≈ 1,9 < 2
  über alle Seeds und ~16 Verbesserungen — die vollen „ersten 30" landen mit den
  compoundenden Ahnen/HPF aus M10 (die den linearen-Mult-Plateau ~Bühne 80 anheben);
  bis dahin sind die erreichbaren Verbesserungen die ehrliche Decke. Läuft in CI als
  eigener Schritt (`npm run test:sim`) und ist Teil von `npm test`.

## M8 — Klick-Juice 2.0 (der Star zuerst)

- **2026-07-18 — Combo-Tiers als absolute (nicht kumulative) Daten-Perks.** Die
  Tier-Tabelle (§4.2.2) listet pro Tier einen „Zusatz-Perk"; implementiert sind die
  Perks als **absolute Werte am jeweiligen Tier**: `tierCritChanceBonus(2)=0.03`,
  `(3)=0.06`, Tier 4 behält +6 % Chance und ergänzt +25 % Crit-Mult & +40 ms
  Beat-Fenster. So bleibt `critChance(CRIT_CHANCE + bonus)` (hart bei 40 % gedeckelt)
  eine einzige, deterministisch testbare Faltung; der rohe Combo-Mult bleibt bei
  ×2-Cap (die §4.8-Balance steht darauf). Tier-Config lebt in `game/combo.ts` als Daten.

- **2026-07-18 — Soft-Decay kontinuierlich modelliert (frame-rate-unabhängig).**
  Statt „−20 % pro diskreter Sekunde" ist `decay(stacks, seconds)` als
  stückweise geschlossene Lösung implementiert: exponentiell mit Basis `1−0.2 = 0.8`
  solange der 20-%-Verlust über dem Boden liegt (Stacks > 5), darunter linear −1/s,
  Boden bei 0. `decay(100,1)=80`, `decay(100,2)=64` exakt; nie ein Hard-Reset (N6).
  Das transiente Fenster (`window`) lebt in `ComboState` als Runtime-Feld — nur
  `stacks` wird persistiert (CH-Save v3).

- **2026-07-18 — On-Beat rein über Phase-Injektion, ohne game→audio-Kern-Kopplung.**
  `isOnBeat(phase, phasePerSecond, windowMs)` rechnet die Zeit-Distanz zum nächsten
  Beat-Onset (Onsets = ganzzahlige Vielfache von `BEAT_PERIOD_PHASE = 1/CLAPS_PER_PHASE`)
  und vergleicht mit ±100 ms (Tier 4: +40 ms). Die Phasen-Geschwindigkeit
  (`phaseVelocity(drive)`) spiegelt `physics.stepPhysics` als benannte Daten, damit
  Beat-Timing eine einzige Quelle hat. `CLAPS_PER_PHASE` wird aus `audio/beat.ts`
  importiert (pures, DOM-freies Modul) — eine numerische Konstante, kein Glue.

- **2026-07-18 — Ekstase-Fenster als Epoch-ms, nicht als Countdown.** `activate`
  setzt `frenzyUntil = now + 12 000`; `frenzyMult(state, now)` = 10 solange
  `now < frenzyUntil`, sonst 1. Damit überlebt ein laufendes Fenster einen Reload
  ohne Tick-Buchführung (CH-Save v3 speichert `charge/frenzyUntil/cooldowns`).
  `cooldowns` ist leer, aber jetzt schon im Schema, damit Beat-Drop/Pfirsichregen
  (M10) keinen weiteren Bump brauchen.

- **2026-07-18 — CH-Save v3: Guard streng auf Kern, Repair auf Juice.** `ability`
  und `combo` werden — wie schon `rng/stats` (M7) — **nicht** in `isChSave` gegatet,
  sondern in `stateFromSave` repariert (`repairAbility` klemmt Charge 0..100, wirft
  nicht-numerische Cooldowns weg; `repairCombo` ⇒ `stacks ≥ 0`). Korruptes Teilobjekt
  ⇒ Default, nie Crash und nie Fortschrittsverlust. `migrateChV2toV3` füllt die
  M8-Defaults; v2→v3 ist verlustfrei getestet.

- **2026-07-18 — Popup-Pool + Batcher als pure, node-testbare Kerne.** `ui/pops.ts`
  trennt die pure Logik (`PopBatcher` = 1 Pop/80 ms + `+Σ ×n`-Aggregat; `NodePool` =
  Ringpuffer mit ≤ 24 nie überschrittenen Nodes) vom dünnen DOM-Renderer (`Pops`).
  So ist die ≤-24-Invariante (§8-AC2) eine reine Zähler-Eigenschaft ohne jsdom
  (Vitest läuft im node-Env). Recycelte Nodes starten die CSS-`rise`-Animation via
  `animation:none` → reflow → `''` neu.

- **2026-07-18 — HUD-Drossel per Change-Detection, nicht per Blockade.** `ChHud`
  cached jeden geschriebenen Wert und fasst das DOM nur bei echter Änderung an;
  bewegliche Teile (HP-Balken, Boss-Timer) laufen über das leichte `frame()` pro
  Frame, der volle Text-Refresh nur auf dem 0,25-s-Tick + diskreten Events. Kein
  `innerHTML` im Klick-Hot-Path.

- **2026-07-18 — Shake-/Partikel-Tuning als Daten (`game/juice.ts`).** Shake-Tiers
  (T2 0,2 · T3 0,35 · T4/Ekstase 0,5 · Boss-Kill 0,6) und die Burst-Formel
  `8 + Tier·6` sind exportierte, getestete Konstanten statt Inline-Literale im Glue.
  Burst(4)=32 bleibt weit unter dem 200er-Partikel-Pool — keine Pool-Vergrößerung nötig.

- **2026-07-18 — Musik-Intensität additiv 0..3, lazy & muteable.**
  `AudioEngine.setIntensity` schaltet im 16-Step-Loop zusätzliche Voices frei
  (T2 Kick-Perkussion, T3 Lead-Arp +1 Oktave, Ekstase Filter-Sweep), alle unter dem
  Music-Bus/Master — Mute und „kein Autoplay" gelten unverändert.

- **2026-07-18 — Mobile Bottom-Sheet rein per CSS.** Unter 640 px wird `#shop` zum
  Bottom-Sheet (55 vh, Slide über `translateY`); Figur + Rivale bleiben im oberen
  Drittel sichtbar (headless per Screenshot verifiziert, §8-AC5). Der Shop-Toggle
  (oben links, z-index 25) bleibt über dem Sheet erreichbar.

## M7 — MVP-Härtung & Kern-Hygiene

- **2026-07-17 — Klick-Mathe zieht in ein pures `game/click.ts` (N2).** Die
  Krit-/Combo-Konstanten (`CRIT_CHANCE=0.2`, `CRIT_MULT=5`, `COMBO_STEP=0.02`,
  `COMBO_CAP=50`, `COMBO_WINDOW_S=1.5`) und die Funktionen `comboMult`,
  `rollCrit`, `effectiveClick` sind jetzt Daten + reine Funktionen mit Tests;
  `main.ts` ruft nur noch auf. `effectiveClick({baseClick,combo,crit,extraMult=1})`
  ist bewusst als erweiterbare Pipeline geschnitten — Beat/Frenzy/Gear/Event
  (M8/M11/M12) multiplizieren später über `extraMult` ein, ohne die Call-Site zu
  ändern. Die Werte 20 %/×5 (EV ×1,8) sind die Spec-Baseline (§4.2.1); die
  Pacing-Tabellen (§4.8) sind darauf kalibriert, deshalb unverändert übernommen.

- **2026-07-17 — Seedbarer RNG: splitmix32 counter-based statt mulberry32.** Die
  Spec (§9.4) skizziert mulberry32; gewählt wurde stattdessen ein
  **counter-basierter splitmix32-Finalizer**: die n-te Ziehung ist
  `hash32((seed + cursor) | 0)`, danach `cursor++`. Grund: aus dem persistierten
  `{seed, cursor}` lässt sich der Strom in **O(1)** exakt fortsetzen — kein
  Replay-Loop über `cursor` Schritte (den mulberry32 als stateful Generator
  bräuchte). splitmix ist genau für gut verteilte Ausgaben aufeinanderfolgender
  Counter-Werte gebaut, also ideal für diesen Zugriff. `Math.random`/`Date.now`
  sind nur in `randomSeed()` erlaubt (Seed-Erzeugung = einzige Nicht-Determinik);
  alle spielrelevanten Rolls (Krit jetzt, Loot/Quests später) ziehen aus `Rng`.
  Kosmetik (Partikel, Kamera-Shake) darf weiter `Math.random` nutzen.

- **2026-07-17 — CH-Save v2 (`bootyclicker.ch`).** Neue Felder auf `ChState`
  (Runtime-State, nicht abgeleitet): `rng: {seed,cursor}`,
  `stats: {crits,onBeatClicks,bossKills,bossTimeouts,goldLifetime,playTimeS}`,
  `legacyImported: boolean`. `onBeatClicks` bleibt bis M8 bei 0. Migration
  `migrateChV1toV2` nach dem Registry-Muster von `save/migrate.ts` (never-throw,
  Zukunfts-/Unsinns-Version ⇒ null ⇒ Fresh-Start): füllt frischen RNG-Seed,
  genullte Stats, `legacyImported=false`. Abgeleitete Kampfwerte werden wie
  gehabt **nicht** persistiert.

- **2026-07-17 — Guard streng auf Kern, Repair auf Meta.** `isChSave` (v2-Guard)
  prüft die spielkritischen Felder strikt (korrupt ⇒ Save verworfen ⇒
  Fresh-Start). Die Meta-Felder (`rng`/`stats`/`legacyImported`) werden **nicht**
  vom Guard verworfen, sondern in `stateFromSave` repariert (korruptes/fehlendes
  `rng` ⇒ frischer Seed; negative/fehlende Stats ⇒ 0) — gleiche „reparieren statt
  Fortschritt vernichten"-Haltung wie die `runMaxZone`-Invariante. Ein kaputtes
  RNG-Feld kostet also nie die Crew/Bühne des Spielers.

- **2026-07-17 — „Erbe der alten Tour" (§9.2.3, einmalig, idempotent).**
  `applyLegacyInheritance(ch, loadGame())` gewährt beim ersten CH-Boot mit
  vorhandenem Legacy-Save `souls += 7 · rebirths` und setzt danach **immer**
  `legacyImported=true` (kein Doppel-Bonus, kein Re-Check ohne Legacy-Save). Boot
  persistiert sofort, damit ein Reload vor dem ersten Autosave nicht erneut
  gewährt. Der Legacy-Key (`bootyclicker.save`) wird **nicht** gelöscht (Archiv).
  Die §9.2.3-Vormerkungen **Tyrann-Skin** (`bossDefeated`) und **Goldtruhe**
  (`maxBp ≥ 50 000`) zielen auf die M11/M12-Systeme (Gear/Truhen), die es noch
  nicht gibt — bewusst **keine** spekulativen Save-Felder dafür; sie werden mit
  M11/M12 verdrahtet. In M7-Scope liegen nur der RS-Grant + das Idempotenz-Flag.

- **2026-07-17 — Tab-Rückkehr-Grant (B5).** `visibilitychange → hidden` merkt
  sich `Date.now()`; bei `→ visible` wird die Weg-Zeit über dieselbe pure
  `offlineGold(dps, zone, elapsed)` gutgeschrieben (Welcome-Back-Dialog erst ab
  mehr als 60 s Abwesenheit), dann persistiert. So verdient auch ein pausierter
  Tab, dessen rAF-Loop stand, seine Idle-Zeit — der 0,05-s-`dt`-Clamp schluckte
  die Wegzeit vorher.

- **2026-07-17 — B4 als pure Predicate testbar.** `shouldShakeOnKey(code,repeat)`
  (`= code==='Space' && !repeat`) kapselt die Leertaste-Repeat-Sperre, damit
  „gehaltene Leertaste = genau 1 Shake" ohne DOM unit-getestet ist.

- **2026-07-17 — Safe-Area (B13b).** `viewport-fit=cover` war gesetzt; jetzt
  bekommen alle fixed-Elemente (`.hud`/`.toggleShop`/`.muteBtn`/`.shop`/
  `.hintbar`/`.rival`) `env(safe-area-inset-*)`-Offsets mit `0px`-Fallback per
  Progressive-Enhancement (Basis-Regel bleibt als Fallback stehen, `calc(...+env)`
  überschreibt in unterstützenden Browsern).

## CH-MVP — Umbau auf Clicker-Heroes-Loop (endlos)

- **2026-07-17 — Produkt-Pivot auf einen Clicker-Heroes-Kern.** Auf Wunsch
  („komplette MVP für Clicker Heroes, auf Booty Clicker umgestellt") wurde das
  flache AdCap-artige Klickspiel zu einem endlosen Zonen-/DPS-Loop umgebaut:
  Twerk-Klick = Schaden am Rivalen, Crew = Idle-DPS, 10 Rivalen/Zone, Boss alle 5
  Zonen mit Timer, Ascension → Ruhm-Seelen. „Hauptinhalt = Klicken" wird durch
  Crits (×5 @ 20 %) + Combo-Multiplikator und die Kopplung Klick-Schaden ∝ DPS
  umgesetzt; „nie durchspielbar" durch exponentielle Zonen-HP + seelenbasierte,
  an die Lifetime-Zone gepinnte Prestige-Skalierung.

- **2026-07-17 — Eigener Save-Key statt Migration der v4-Kette.** Der CH-Modus
  persistiert unter `bootyclicker.ch` (eigenes v1-Schema, never-throw, injizierbar),
  statt das alte `SCHEMA_VERSION`/`migrate`-Layer (62 Tests) umzubauen. So bleibt
  die Legacy-Save-Schicht grün und der neue Loop entkoppelt.

- **2026-07-17 — Reiner, testbarer Kern für die neue Ökonomie.** `combat.ts`,
  `heroes.ts`, `ascension.ts`, `ch-state.ts`, `ch-store.ts` sind DOM-frei und
  deterministisch (40 neue Unit-Tests): HP/Gold-Formeln, Reducer `hit/tickBoss`,
  Kostenreihen (`bulkCost`/`maxAffordable`), Seelen-Formel + Exploit-Schutz
  (`Math.max`-Boden, Pinning an Lifetime-Zone), Offline-Gold (8 h/50 %).

- **2026-07-17 — Idle-Schaden: ein Treffer pro Frame.** Der Loop wendet
  `dps·dt` als einen `hit()` pro Frame an (kein Damage-Carry-over). Am Frontier-Wall
  (DPS < Rivalen-HP) irrelevant; nur beim Über-Farmen weit unter Level würde Schaden
  „verpuffen" — dort ist Clearing ohnehin trivial. Hält die Boss-Timer-Logik simpel.
  (Offline nutzt die geschlossene Formel `dps/HP·Gold`, also frameraten-unabhängig.)

- **2026-07-17 — Legacy-Module bleiben liegen, tree-shaken aber raus.** Die
  M0–M6-UI/Ökonomie (shop/hud/boss/settings/leaderboard/economy/progression/…)
  wird von `main.ts` nicht mehr importiert; ihre Tests bleiben grün, der Bundle
  fällt auf ~566 KB. Aufräumen/Entfernen ist eine spätere Aufgabe.

- **2026-07-17 — Bug B4 (v2-Spec) mitgefixt:** `keydown` mit `e.repeat` twerkt nicht
  mehr — gehaltene Leertaste ist kein Gratis-Autoclicker mehr.

## M6 — UX, Polish & Release

- **2026-07-17 — Settings extended in place, not a new schema.** `quality`
  (low/medium/high), `fpsCap` (0/30/60) and `onboarded` join screen-shake/particles
  in the same `bootyclicker.settings` key — still pure, injectable and never-throw,
  with per-field validation (`asQuality`/`asFpsCap`) so a corrupt value falls back
  to its default. No game-save migration is involved (client settings ≠ progress).

- **2026-07-17 — Graphics knobs are a pure preset + a thin renderer apply.**
  `engine/quality.ts` maps a preset to `{ pixelRatioCap, shadows }` and clamps the
  effective pixel ratio (unit-tested, no THREE import); `main.applyQuality` is the
  only place that touches `renderer.setPixelRatio` / `shadowMap.enabled` and forces
  a one-shot material recompile when shadows toggle. FPS-cap pacing is the pure
  `frameDue(now,last,cap)` gate (0 = uncapped) at the top of the render loop, so
  frame-skips never corrupt the fixed-timestep physics (dt still comes from the clock).

- **2026-07-17 — Mobile input unified on pointer events + a pure tap test.**
  Replaced the desktop `click` handler with `pointerdown`/`pointerup` and
  `isTap(distancePx, durationMs)` (≤10 px, ≤500 ms) so a quick touch/click shakes
  while an OrbitControls drag does not — one code path for mouse and touch. Verified
  by the M6 smoke test (tap increases BP, drag does not).

- **2026-07-17 — Onboarding is three non-blocking coach marks, shown once.**
  The card floats above the HUD but only it captures pointer events, so the player
  can already shake / open the shop underneath. It highlights the target control per
  step and, on finish, sets the persisted `onboarded` flag — never shown again.

- **2026-07-17 — itch export = `base:'./'` + zip the dist _contents_.** `build:itch`
  builds then runs `scripts/pack-itch.mjs`, which zips the contents of `dist/` (so
  `index.html` is at the archive root, an itch requirement) via the `zip` CLI into
  `release/booty-clicker-itch.zip` (git-ignored). Verified end-to-end: extracted and
  served over a plain static server with zero failed requests and working gameplay.

- **2026-07-17 — Cloudflare Pages deploy is opt-in, never breaks CI.** A `main`-only
  `deploy-pages` job checks for `CLOUDFLARE_API_TOKEN` and _skips_ (green `::notice::`)
  when secrets are absent, so forks and unconfigured repos still pass CI. Release QA
  and the ~40 min playthrough timing are documented in `TESTPLAN.md`.

## M5 — Leaderboard (Worker + D1)

- **2026-07-17 — Storage + rate-limit behind interfaces → testable without
  wrangler.** The Hono app is built by `createApp(makeRepo, makeLimiter)`; D1 and
  KV are thin adapters, and tests drive the real request logic via `app.request()`
  with in-memory fakes (9 tests: nickname filter, 1-based rank, 5/min rate-limit,
  top ordering + limit clamp). This satisfies "lokal testbar" more robustly than a
  manual `wrangler dev`, which stays available via `npx wrangler dev`.

- **2026-07-17 — The client is fail-silent and off by default.** Every call
  returns `null` on timeout (3 s), network error, or when `VITE_API_BASE` is unset,
  so the game is fully playable with no reachable API (spec §4.4, AC). The
  post-boss submit dialog only appears when a leaderboard is configured; the ⚙️-tab
  "Top 50" view shows an offline message otherwise.

- **2026-07-17 — Nickname is the only stored field, validated on both ends.**
  `[a-zA-Z0-9_ ]{2,16}` (trimmed) client-side and server-side, plus a D1 `CHECK`
  constraint — no PII (spec §2, §4.5). Server-returned nicknames are additionally
  HTML-escaped before rendering the top list (defense in depth).

- **2026-07-17 — Rank = "how many stored times beat you, + 1".** Lower boss-kill
  time is better; `SELECT COUNT(*) WHERE best_time_s < ?` keeps it a single indexed
  query. `wrangler.toml` + `schema.sql` are deploy-ready with placeholder ids.

## M4 — Game Feel & Content

- **2026-07-17 — Achievements are data-driven pure predicates.** 18 achievements
  each carry a `check(ctx)` over an `AchievementCtx` snapshot (maxBp, totalClicks,
  maxCombo, levels, rebirths, …), so the whole set is unit-testable without a DOM.
  `checkAchievements()` runs on every shake and on discrete events (buy, boss win,
  rebirth, peach), plus a throttled loop pass — unlocking is immediate and
  persistence-backed rather than relying on the render loop.

- **2026-07-17 — Schema v4** adds `achievements`, `totalClicks`, `maxCombo`,
  `peachesClicked`, `nextPeachAt`, `boostUntil`; `migrate v3→v4` defaults them.
  Event timing persists as epoch ms so the peach schedule and the ×3 boost survive
  a reload (spec AC). Same never-throw validation discipline.

- **2026-07-17 — Golden-Peach timing is pure; the DOM peach is glue.** `events.ts`
  exposes `rollNextPeachAt`/`activateBoost`/`incomeMultiplier` (unit-tested); the
  clickable 🍑 button + 8 s visibility window live in `main.ts`. The ×3 boost is a
  multiplier applied to both click and passive income, gated on `boostUntil`.

- **2026-07-17 — Particles: one THREE.Points + fade shader, 200-slot pool.**
  Round-robin reuse, CPU integration is a flat 200-iteration loop (≪ 1 ms/frame by
  construction — a few thousand float ops); dead slots have life 0 and are
  `discard`ed in the fragment shader. Toggleable via effect settings.

- **2026-07-17 — Effect toggles in their own localStorage key.** Screen-shake and
  particles persist under `bootyclicker.settings` (pure + injectable, like audio
  prefs) — no save-schema coupling. Screen-shake offsets the camera only for the
  render call and restores it, so OrbitControls' internal state never drifts.

- **2026-07-17 — 4 endgame upgrades keep the M2 curve intact.** All four have base
  cost > `REBIRTH_BP` (100k), so the optimal-buy simulator never affords them
  before the boss/rebirth gates — the balancing acceptance test is unchanged.
  Effect values (`val`) are new ids, so the `deriveStats` economy tests still pass.

## M3 — Audio

- **2026-07-17 — All audio is synthesised, not sourced files.** The spec asks for
  "1 CC0 Loop-Track pro Kulisse". Instead of downloading audio (network-policy
  dependent, and 4 tracks + SFX would eat into the < 5 MB budget), every sound is
  generated at runtime via the Web Audio API — oscillators + filtered noise for
  SFX, and a per-background generative bass/arp/hi-hat loop. It is original code,
  so it is licence-free (effectively CC0); documented in `public/CREDITS.md`.

- **2026-07-17 — Audio prefs live in a separate localStorage key.** Mute/volume
  settings persist under `bootyclicker.audio`, not in the game save, so audio
  settings never force a save-schema migration. Same never-throw + injectable-
  storage discipline as the save layer, so `prefs.ts` is unit-tested in node.

- **2026-07-17 — Lazy AudioContext on first gesture (no autoplay).** The context
  is created and resumed only in `unlock()`, called from the first pointerdown /
  keydown / mute click — so browsers never raise an autoplay warning (spec AC).
  Music (re)starts only when the context is running and not muted.

- **2026-07-17 — Testable core vs. audio glue.** Beat detection (`beat.ts`),
  prefs (`prefs.ts`) and track configs (`tracks.ts`) are pure and unit-tested;
  the AudioContext-touching `engine.ts` is thin glue verified by the headless
  smoke test (no autoplay error, mute toggles + persists). `BeatTracker` turns
  the choreography `phase` into discrete clap onsets that speed up with drive.

## M2 — Progression & Boss-Finale

- **2026-07-17 — Balancing = base-cost scale, not new mechanics.** Optimal play
  raced to 50k BP in ~14 min with the ported economy. The upgrade **effect** values
  (`val`/`type`) are the prototype's originals (shop text unchanged); only the
  **costs** (`base` ×3) are the tuning knob. `economy.test.ts` asserts effect values
  and the cost _formula_ (with literals), so retuning `base` breaks nothing. `gr`
  barely moves the ROI-greedy curve — base scale dominates — so growth rates stay
  as-is. Canonical cadence for the AC is ~3 clicks/s → boss at ~40 min.

- **2026-07-17 — Pure optimal-buy simulator backs the balancing AC.**
  `simulatePlaythrough` (game/progression.ts) is a deterministic, DOM-free
  ROI-greedy playthrough; the test asserts the 50k-BP boss unlock lands in the
  30–50 min window at clickRate 3 and 4. An optional `upgrades` override let me
  calibrate tunings without editing `economy.ts` iteratively.

- **2026-07-17 — Boss HP is fixed (75k), not scaled to the player.** Click damage
  scales with `perClick·mult` (spec), so a fixed pool makes perClick investment
  matter: at the expected unlock build (perClick·mult ≈ 260) it's a close fight at a
  brisk cadence; a click-neglecting or slow player loses. Each loss eases the next
  attempt's HP by 25% (`0.75^attempt`), so it is always eventually winnable.

- **2026-07-17 — Rebirth = additive +100% folded into the multiplier.**
  `prestigeMult = 1 + rebirths`; on load and after each rebirth, derived stats are
  rebuilt via `deriveStats(upgrades, { mult: prestigeMult })`, so the running
  incremental `state.mult *= val` on purchases keeps prestige baked in. Cosmetic
  unlocks, `bossDefeated` and `maxBp` survive a rebirth; BP and levels reset.

- **2026-07-17 — Schema v3.** Added `maxBp`, `prestigeMult`, `rebirths`,
  `bossDefeated`; `migrate v2→v3` defaults them (maxBp seeded from bp). Kept the M1
  never-throw + `Object.hasOwn` validation discipline; the migration loop still
  can't infinite-loop and rejects future/invalid versions to a clean fresh start.

- **2026-07-17 — Content-gates are sticky via persisted `maxBp`.** Skins/backgrounds
  reveal once the _highest-ever_ BP passes `revealAt`, so spending BP never re-hides
  an item. `Shop.syncReveals()` recomputes a reveal signature each throttled tick and
  re-renders only when a milestone is crossed.

- **2026-07-17 — Boss/rebirth UI placement.** Boss fight is a top HP-bar/timer banner
  plus a win/lose result dialog (reusing the M1 `.overlay`/`.dialog` language);
  clicks route to boss damage while engaged and passive income pauses. Rebirth lives
  in the ⚙️ tab with the same armed double-confirm as Reset; NG+ badge in the HUD.

- **2026-07-17 — Shop/boss buttons moved to top-left.** A headless end-to-end smoke
  test surfaced that the 🛒 and 👑 buttons overlapped the shop tab row (real click
  interception). Both moved to the left edge, clear of the right-hand shop panel.

## M1 — Persistenz

- **2026-07-16 — `suppressSave` guard on reset.** `reset()` wipes the save and
  reloads the page; without a guard, the 10 s autosave interval or a
  `visibilitychange`/`beforeunload` firing between the wipe and the reload
  could resurrect the just-deleted save. `suppressSave` is flipped before
  `resetSave()` runs so `persist()` becomes a no-op for the remainder of that
  page's lifetime.

- **2026-07-16 — Armed-button double-confirm instead of `window.confirm`.**
  The reset button arms on first click (visual state + 4 s auto-revert) and
  only fires on a second click while armed. Keeps the destructive action
  in-page and stylable, matching the game's UI language, rather than a native
  browser dialog.

- **2026-07-16 — Settings folded into the shop as a 4th tab.** No new panel
  chrome, no extra toggle — reuses `Shop`'s existing tab/tabbody plumbing
  (generalized from a hard-coded 3-way switch to a `data-t` → element map) so
  Export/Import/Reset live where players already look for game controls.

- **2026-07-16 — UTF-8-safe base64 via `TextEncoder`/`TextDecoder`.** Plain
  `btoa(JSON.stringify(...))` breaks on multi-byte characters (skin/BG names
  contain emoji). Encoding routes bytes through `TextEncoder` before `btoa`
  and reverses via `atob` + `TextDecoder`, so export/import codes survive
  round-tripping any save content.

- **2026-07-16 — `SaveStorage` injected behind a 3-method interface.** Vitest
  runs in the `node` environment (no jsdom, per project convention) with no
  `localStorage`. Every persistence function takes an optional `SaveStorage`
  (defaulting to `globalThis.localStorage` wrapped in a try/catch) so tests
  inject an in-memory `Map`-backed fake and the whole save layer is
  unit-testable without a DOM.

- **2026-07-16 — Derived stats (`perClick`/`perSec`/`mult`) are never
  persisted or trusted from disk.** The save stores only `bp` and upgrade
  _levels_ keyed by id; on load, levels are applied to a fresh
  `createUpgrades()` and stats are rebuilt via the existing pure
  `deriveStats`. A tampered or stale stored multiplier can never leak into a
  loaded game — it's simply never read.

- **2026-07-16 — v1 schema defined retroactively.** M0 never shipped a save
  format, so `SaveDataV1` (positional upgrade array, derived stats stored
  directly, no `lastSeen`) is a reconstruction of "what the naive M0
  serialization would have looked like," giving the migration registry
  (`MIGRATIONS[1] = migrateV1toV2`) a real predecessor to prove the upgrade
  path against instead of starting the chain at v2 only.

## M0 — Scaffold & Port

- **2026-07-16 — Spec kept as `booty-clicker-spec.md`, `AGENTS.md` is a pointer.**
  Spec §3 lists `AGENTS.md` as "dieses Dokument". Rather than rename the file the
  task explicitly references, we keep the full spec under its original name and add
  a short `AGENTS.md` operating guide that links to it. Both requirements satisfied,
  nothing the user pointed at disappears.

- **2026-07-16 — npm workspaces monorepo (`apps/game`, `apps/api`).**
  Matches spec §3 layout. Shared dev tooling (ESLint, Prettier, TypeScript) is
  hoisted to the root; runtime deps (Three.js, Vite) live in `apps/game`.

- **2026-07-16 — Three.js via npm, `OrbitControls` from `three/examples`.**
  The prototype loaded Three r128 from cdnjs and hand-rolled an orbit camera. Per
  spec §5 M0 we depend on the `three` npm package (`^0.180`) and replace the custom
  camera with `OrbitControls` (zoom limits 5–24). No CDN dependency remains.

- **2026-07-16 — Vite `base: './'` (relative paths).**
  Required so the production build runs from a file path / itch.io ZIP (spec §5 M6),
  set up early to avoid a late-stage path rewrite.

- **2026-07-16 — `economy.ts` extracted as pure, data-driven module first.**
  The cost formula `floor(base·gr^lv)`, combo bonus (+5%/stack) and multiplicative
  mult-stacking are ported verbatim from the prototype into pure functions with a
  typed `UPGRADES` config array, covered by 3+ Vitest unit tests. `deriveStats`
  folds upgrade levels so stats can be reconstructed from a save (needed for M1).

- **2026-07-16 — M0 delivered in two commits:** (1) scaffold + toolchain + economy
  tests, (2) full behavioural port of the prototype into modules.
  Keeps each commit independently green and reviewable.

- **2026-07-16 — `noUncheckedIndexedAccess` disabled.** It is not part of `strict`
  and added heavy friction across the ported Three.js code (palette lookups, pose
  channels, geometry attributes). `strict` plus `noUnusedLocals/Parameters`,
  `noImplicitReturns` and `noFallthroughCasesInSwitch` stay on.

- **2026-07-16 — Port structure.** The 646-line prototype was split by spec §3
  directory: `engine/` (scene, renderer, lights, env, OrbitControls camera,
  material helpers), `character/` (rig, physics, skins), `choreo/` (moves +
  `Choreographer`), `world/` (backgrounds + `World`), `game/` (economy, state),
  `ui/` (hud, shop, format), wired in `main.ts`. Transient runtime signals
  (combo, drive) live outside the serializable `GameState`. Three r128 deprecations
  updated: `outputEncoding`→`outputColorSpace`, texture `.encoding`→`.colorSpace`,
  `physicallyCorrectLights` dropped (physical lighting is the r0.180 default).

- **2026-07-16 — M0 verified.** Headless Chromium smoke test: no page/console
  errors, WebGL context created, HUD/shop render (7 upgrades), clicking increments
  BP with the combo bonus. `npm run build` → dist 552 KB (< 5 MB budget); `npm test`
  9 green; lint + format clean.
