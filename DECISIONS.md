# DECISIONS.md

Log of non-obvious engineering decisions, newest first. Each milestone appends
here (spec §7).

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
