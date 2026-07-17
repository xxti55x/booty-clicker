# Booty Clicker v2 — „Endless Twerk" · Design- & Implementation-Spec (M7+)

> Zielgruppe dieses Dokuments: autonome Coding-Agents (z. B. Claude Code) **und** menschliche Reviewer.
> Es baut auf `booty-clicker-spec.md` (M0–M6, alle grün: 141 Unit-Tests, Build ~578 KB) auf und ersetzt
> dessen Produktziel „30–60 min Playtime" durch ein neues: **ein endloses Spiel, das nie „durchgespielt" ist**.
> Arbeite die Milestones **strikt in Reihenfolge** ab (M7 → …). Ein Milestone gilt erst als fertig,
> wenn alle Akzeptanzkriterien erfüllt sind und `npm run build` + `npm test` grün sind.
> Bei Unklarheiten: konservativ entscheiden, Entscheidung in `DECISIONS.md` dokumentieren.
> Die Architektur-Regeln aus Spec §4 (pure testbare Kernmodule, Daten statt Code, versioniertes Save-Schema,
> fail-silent Netcode, keine echten Personen, < 5 MB) gelten **unverändert weiter**.

---

## §1 Vision & Design-Pfeiler

### 1.1 Die Fantasie

Du bist Manager:in des größten Twerk-Phänomens der Galaxis. Jeder Klick ist ein Hüftschwung,
jeder Hüftschwung verdient Booty Points (BP), und mit BP kaufst du dir eine immer absurdere
Entourage — vom Hüftschwung-Training bis zum Booty-Blackhole. Ton: überdreht, humorvoll,
technisch sauber. Keine echten Personen, kein Echtgeld, kein Account-Zwang.

### 1.2 Die HARTE REGEL (vom Product Owner gesetzt)

> **Der Hauptinhalt ist das KLICKEN/TWERKEN selbst.** Jedes System — Generatoren, Prestige,
> Skins, Truhen, Events — muss in den aktiven Klick zurückfüttern und ihn lohnender,
> saftiger und spektakulärer machen. Idle-Einkommen ist willkommen (damit Fortschritt
> auch über Nacht passiert), aber es ist **immer zweitrangig** gegenüber dem, was eine
> aktive Session an Payoff liefert.

Konkretisierung als Balancing-Invariante (testbar, siehe §9.5):

> **Klick-Invariante:** Eine aktiv klickende Spielerin (3 Klicks/s, Combo + Krits + Fähigkeiten
> genutzt) erzielt zu jedem Zeitpunkt der Progression **mindestens das 3-fache** des reinen
> Idle-Einkommens derselben Spielminute. Im Fähigkeits-Fenster („Twerk-Ekstase") das 10-fache+.

### 1.3 Endlosigkeit als Produktziel

Das Spiel darf **nie** einen Zustand erreichen, in dem es „fertig" ist:

1. **Endlose Zonen-Leiter** („Welttournee", §4.4) statt eines einmaligen Boss-Finales — es gibt
   immer eine nächste Wand.
2. **Gestapelte Prestige-Schichten** (§4.5): Rebirth → Aszension → Transzendenz. Jede Schicht
   resettet die darunterliegende und schaltet Wachstum frei, das die vorherige Schleife
   beschleunigt. Wenn Schicht n stagniert, lockt Schicht n+1.
3. **Kein „Content-Ende"**: Achievements, Skins, Ahnen und Quests werden datengetrieben erweitert;
   Kern-Systeme (Zonen, Truhen, Meilenstein-Multiplikatoren) sind formelbasiert und damit unendlich.

### 1.4 Design-Pfeiler

| # | Pfeiler | Bedeutung |
| - | ------- | --------- |
| P1 | **Click is King** | Der Klick ist die beste BP-Quelle, die beste Schadensquelle und der beste Show-Moment. Alles buff't den Klick. |
| P2 | **Immer eine nächste Wand** | Zonen-HP wächst exponentiell; wer stecken bleibt, hat immer eine sinnvolle Reset-Option. |
| P3 | **Jede Session hinterlässt Spuren** | Selbst 3 Minuten Spielen erzeugen permanenten Fortschritt (Seelen, Splitter, Schlüssel, Quests). |
| P4 | **Juice skaliert mit Leistung** | Combo-Tiers, Krits, Beat-Treffer eskalieren Partikel, Sound, Shake, Haptik. Gut spielen *fühlt* sich besser an. |
| P5 | **Offline-fähig & fair** | Kein Echtgeld, keine Accounts. Leaderboard bleibt optional & fail-silent. Alles ist erspielbar. |
| P6 | **Testbare Reinheit** | Jede neue Mechanik existiert zuerst als pures, deterministisch getestetes Modul; DOM/Three/Audio bleiben dünner Glue. |

---

## §2 Ist-Zustand (Audit M0–M6)

Stand: Commit `12a26d2`, 141 Tests grün (132 Game + 9 API, verifiziert per `npm test`),
Bundle ~578 KB JS / ~150 KB gzip (TESTPLAN §1).

### 2.1 Was tatsächlich geliefert ist

| Bereich | Inhalt | Dateien |
| ------- | ------ | ------- |
| Ökonomie | 11 Upgrades (7 Basis + 4 Endgame), Kostenformel `floor(base·gr^lv)`, Combo +5 %/Stack (Fenster 1,2 s), Mult-Stacking multiplikativ | `apps/game/src/game/economy.ts` |
| Progression | Boss-Unlock 50 000 BP, Rebirth 100 000 BP, `prestigeMult = 1 + rebirths` (additiv), ROI-greedy Bot `simulatePlaythrough` (Boss in 30–50 min bei 3 cps) | `apps/game/src/game/progression.ts`, `progression.test.ts` |
| Boss | Einzelner 90-s-Fight, fixe 75 000 HP, Retry-Easing ×0,75/Versuch, Klick-Schaden `perClick·mult` | `apps/game/src/game/boss.ts`, `ui/boss.ts` |
| Events | Genau 1 Random-Event: Goldener Pfirsich (alle 90–240 s, 8 s sichtbar, ×3 für 60 s), Timing persistiert | `apps/game/src/game/events.ts`, `main.ts:248–282` |
| Achievements | 18 Stück, pure Prädikate über Snapshot-Kontext, Toasts + 🏆-Tab | `apps/game/src/game/achievements.ts`, `ui/achievements.ts`, `ui/toasts.ts` |
| Kosmetik | 5 Skins, 4 Kulissen — **rein kosmetisch**, Content-Gates über `revealAt` × `maxBp` | `apps/game/src/character/skins.ts`, `world/backgrounds.ts`, `ui/shop.ts` |
| Persistenz | Schema v4, Migrationskette v1→v4, never-throw-Validierung mit `Object.hasOwn`, Export/Import Base64, Offline-Ertrag `min(elapsed, 2 h) × perSec·mult × 0,5` | `apps/game/src/save/{schema,migrate,store}.ts` |
| Settings | Separater Key `bootyclicker.settings` (Shake/Partikel/Qualität/FPS-Cap/Onboarded), Audio-Prefs unter `bootyclicker.audio` | `apps/game/src/game/settings.ts`, `audio/prefs.ts` |
| Rendering | Three r0.180, Fixed-Timestep 120 Hz (`DT = 1/120`), Feder-Dämpfer-Cheeks, 5 Moves, Partikel-Pool (200), Qualitäts-Presets, FPS-Cap via purem `frameDue` | `engine/`, `character/`, `choreo/` |
| Audio | Vollständig prozedural (kein Asset), generativer Loop pro Kulisse, Beat-Klatschen via `BeatTracker` über die Choreo-`phase` | `apps/game/src/audio/` |
| Leaderboard | Worker (Hono + D1 + KV), nur **Boss-Kill-Zeit**, Rate-Limit 5/min/IP, Client fail-silent & default-aus | `apps/api/src/index.ts`, `apps/game/src/net/leaderboard-client.ts` |
| UX | Onboarding (3 Coach-Marks), Loading-Screen, Mobile-Tap-Erkennung (`isTap`), itch-Export | `ui/onboarding.ts`, `game/input.ts`, `scripts/` |

### 2.2 Die aktuelle Progressions-Decke (warum das Spiel heute „endet")

Rechnung mit den Live-Daten aus `economy.ts` / `progression.ts`:

- **~40 min:** Boss-Unlock (50 k BP), Boss-Sieg → Tyrann-Skin. Der Boss-Button bleibt danach zwar
  sichtbar (`main.ts:226–228` prüft `bossDefeated` nicht), aber ein Re-Fight gibt **nichts Neues**
  — mit NG+-Stats ist er ein 1-Klick-Kill (siehe Bug B8).
- **~45–50 min:** Rebirth-Gate (100 k BP). Danach: dieselben 11 Upgrades, nur mit +100 % Start-Mult.
- **Endgame-Upgrades:** Nur 4 Stück (Reaktor/Mine/Singularität/Blackhole, base 250 k–5 M). Mit den
  Mult-Upgrades `disco` (gr 1,9), `god` (gr 2,2), `quantum` (gr 2,5) explodieren die Kosten so
  schnell, dass nach wenigen Käufen effektiv nichts mehr Kaufbares existiert.
- **Achievements:** Höchste Schwelle ist 1 M BP (`millionaire`) — nach ~1–2 h ist alles geholt.
- **Prestige:** Additiv (`1 + rebirths`) — der relative Gewinn pro Rebirth fällt von +50 % (NG+1)
  auf +0,99 % (NG+100). Der Loop verliert exponentiell an Wert (Bug B2).

**Fazit:** Nach ~2–3 h existiert kein Ziel mehr. Genau das behebt §4.

---

## §3 Bugs, Probleme & Tech-Debt

Alle Punkte wurden **im Code verifiziert** (Verhalten nachvollzogen bzw. per Node-Repro bestätigt).
Severity: 🔴 blockiert das Endless-Ziel / korrumpiert Kernloop · 🟠 deutlich spürbar · 🟡 Politur/Debt.

### 3.1 Befundliste

**B1 🔴 — Zahlenformatierung überläuft ab 10^21 („Qi"-Kappe).**
- **Symptom:** `fmt(1e21)` → `"1000.00Qi"`, `fmt(1e30)` → `"1000000000000.00Qi"` (13-stellige
  Ziffernkette), `fmt(1e60)` → `"9.999999999999999e+41Qi"` (E-Notation *plus* Suffix-Mischmasch).
  Verifiziert per Node-Repro gegen den Originalcode.
- **Ursache:** `apps/game/src/ui/format.ts:1–12` — `SUFFIXES = ['K','M','B','T','Qa','Qi']`, die
  while-Schleife stoppt bei `i < SUFFIXES.length - 1`, der Rest der Zahl bleibt undividiert.
- **Folge:** Ein endloses Spiel sprengt HUD, Shop-Preise, `document.title` und Popups.
- **Fix:** Erweiterte Suffix-Tabelle + wissenschaftliche Notation als Fallback (§9.3). Pure
  Funktion, unit-getestet inkl. Grenzwerte.

**B2 🔴 — Prestige ist additiv und stallt.**
- **Symptom:** Jeder Rebirth gibt pauschal +100 % (`prestigeMult = 1 + rebirths`,
  `apps/game/src/game/progression.ts:136–138`). Relativer Zugewinn: NG+1 = +50 %, NG+10 = +9 %,
  NG+100 = +0,99 % — der teuerste Klick des Spiels (kompletter Reset!) wird asymptotisch wertlos.
- **Vergleich Genre:** Clicker Heroes' Hero Souls geben +10 % DPS *pro Seele*, und die Seelen-
  **Anzahl** wächst superlinear mit der erreichten Zone → jeder Ascend lohnt mehr, nicht weniger.
- **Fix:** Rebirth 2.0 mit Seelen-Währung, Seelenertrag ∝ f(maxZone) superlinear (§4.5.1).
  Migration rechnet Bestands-Rebirths fair um (§9.2).

**B3 🔴 — Content ist endlich (Boss-Einbahnstraße, 4 Endgame-Upgrades).**
- **Symptom/Ursache:** Ein einziger Boss mit fixen 75 k HP (`game/boss.ts:14`), keine Zonen, keine
  skalierenden Gegner; nach dem Sieg gibt es kein neues Kampfziel. §2.2 beziffert die Decke.
- **Fix:** Endlose Welttournee-Leiter mit Zonen-HP-Formel + Boss-Timern (§4.4); der Tyrann wird
  Boss von Zone 10 (Kompatibilität: sein Skin-Unlock bleibt dort).

**B4 🔴 — Leertaste mit Key-Repeat = Gratis-Autoclicker.**
- **Symptom:** Leertaste gedrückt halten feuert `doShake()` mit OS-Key-Repeat-Rate (~30/s) —
  ohne einen einzigen bewussten Klick. Combo, Achievements („Klick-Maschine"), Boss-DPS und damit
  auch die Boss-Zeit-Bestenliste werden trivialisiert.
- **Ursache:** `apps/game/src/main.ts:335–341` — der `keydown`-Handler prüft `e.repeat` nicht.
- **Fix:** `if (e.repeat) return;` (Einzeiler). Test: simulierter Repeat-Event erhöht BP nicht.

**B5 🟠 — Hintergrund-Tab verdient nichts; Offline-Ertrag nur beim Seiten-Load.**
- **Symptom:** Tab 1 h im Hintergrund → praktisch 0 BP. Browser pausieren `requestAnimationFrame`;
  beim Refokus liefert `clock.getDelta()` die volle Wegzeit, aber `main.ts:372` klemmt sie auf
  `Math.min(dt, 0.05)` → 50 ms gutgeschrieben statt 1 h. Offline-Earnings werden ausschließlich
  im Bootstrap berechnet (`main.ts:52–57`), der `visibilitychange`-Handler (`main.ts:120–122`)
  speichert nur, schreibt aber nichts gut. Seite *schließen und neu laden* zahlt also besser aus
  als der Tab-Wechsel — absurd.
- **Fix:** Bei `visibilitychange → visible` Differenz seit dem letzten Tick als Offline-Ertrag
  (gleiche pure `computeOfflineEarnings`) gutschreiben; ab Schwelle (> 60 s) den Welcome-Back-Dialog
  zeigen. Test über injizierbare Clock.

**B6 🟠 — Shop-Affordability veraltet beim Idlen.**
- **Symptom:** Wer nur zusieht (passives Einkommen), sieht Upgrades dauerhaft ausgegraut/„locked",
  obwohl sie längst bezahlbar sind — bis zum nächsten Klick.
- **Ursache:** `renderUpgrades()` läuft nur im Konstruktor, bei Shake (`main.ts:313`), Kauf,
  Rebirth und Import. Der 0,25-s-Tick (`main.ts:399–408`) ruft nur `syncEndgameUi`/`checkAchievements`
  — nie die Kostenanzeige.
- **Fix:** Leichter `Shop.syncAffordability()` im Tick: nur CSS-Klassen togglen (kein
  innerHTML-Rebuild), Signatur-Vergleich wie bei `syncReveals()`.

**B7 🟠 — DOM-Churn pro Klick & pro Frame.**
- **Symptom/Ursache:** Jeder Shake rebuildet den kompletten Upgrade-Tab per `innerHTML`
  (`main.ts:313` → `shop.ts:88–111`, 11 Items, Event-Handler neu verdrahtet). `hud.update(state)`
  läuft ungedrosselt jeden Frame (`main.ts:396`) und schreibt 2–4 `textContent`s; `settings.refresh()`
  überschreibt den Rebirth-Abschnitt alle 250 ms (`main.ts:403` → `settings.ts:197–212`).
  Bei 10+ cps (Ziel von §4.2!) plus Krit-Popups wird das messbar.
- **Fix:** HUD nur bei Wertänderung (formatierter String-Vergleich) bzw. auf den 0,25-s-Tick;
  Upgrade-Kauf aktualisiert Zeilen in place; Popup-Batching (§8.5).

**B8 🟠 — Bestenlisten-Metrik ist kaputt (und spambar).**
- **Symptom:** (a) Ein NG+-Spieler one-shottet den 75-k-HP-Boss (`perClick·mult` wächst unbegrenzt,
  Boss-HP nicht) → Kill-Zeit „1 s" für alle; die Rangliste misst Prestige-Grind, nicht Skill.
  (b) Jeder Sieg erzeugt eine **neue Zeile** (`apps/api/src/index.ts:83–85`, unkonditionales
  `INSERT`) — dieselbe Person kann die Top 50 fluten; `rankFor` zählt eigene Duplikate mit.
- **Fix:** Leaderboard v2 mit Endless-Metrik `maxZone` (+ Tiebreaker Rebirth-Power) und
  Upsert-per-Nickname (§7.4, §9.7). Alte Tabelle bleibt als Legacy lesbar.

**B9 🟠 — Skins & Kulissen sind rein kosmetisch.**
- **Symptom:** `SkinConfig` (`character/skins.ts`, `types.ts:7–20`) kennt nur Farben/Kosten/Reveal;
  kein Gameplay-Feld. Nutzeranforderung: **Skins sollen Buffs geben.**
- **Fix:** Skins-als-Gear-System (§5) mit Buff-Feldern, Levels, Raritäten, Set-Boni.

**B10 🟠 — Nur ein Random-Event, keine Loot-Schleife.**
- **Symptom:** `events.ts` kennt genau den Goldenen Pfirsich; keine Truhen, keine Schlüssel,
  keine variablen Belohnungen — die stärkste Retention-Mechanik des Genres fehlt komplett.
- **Fix:** Truhen-/Loot-System (§6) mit seedbarem RNG (§9.4).

**B11 🟠 — Offline-Ertrag: 2-h-Deckel, halbe Rate, klick-blinder.**
- **Symptom:** `computeOfflineEarnings` (`save/store.ts:125–132`) deckelt bei 2 h × 50 % und
  rechnet **nur** `perSec` — eine Klick-fokussierte Build (P1!) bekommt offline exakt 0.
  Über Nacht (8 h) verfallen 75 % der Zeit ersatzlos; es gibt keinen Upgrade-Pfad für den Cap.
- **Fix:** Basis-Cap 8 h; Rate/Cap über Himmels-Upgrades & Skin-Buffs steigerbar; Offline-Basis =
  `perSec + 0,25 × perClick × 1 cps` („die Crew twerkt für dich mit halber Hingabe"), §4.3.4.

**B12 🟡 — Combo-System ist flach.**
- **Symptom:** Linear +5 %/Stack (`economy.ts:37–40`), hartes Voll-Reset nach 1,2 s
  (`main.ts:380–383`), keine Tiers, keine Interaktion mit irgendetwas. Kein Krit, kein Beat-Bonus,
  keine Fähigkeit — der aktive Layer hat genau einen Knopf.
- **Fix:** Combo 2.0 + Krits + On-Beat + Twerk-Ekstase (§4.2).

**B13 🟡 — Mobile-Layout-Schulden.**
- (a) Shop ist unter 640 px **vollflächig** (`style.css:733–737`) — die Figur (der Star!) ist beim
  Shoppen unsichtbar; Käufe geben null visuelles Feedback.
- (b) Kein Safe-Area-Handling: Viewport-Meta ohne `viewport-fit=cover` (`index.html:5–8`), kein
  `env(safe-area-inset-*)` im CSS — Buttons kleben auf Notch-Geräten unter der Kamera-Insel.
- (c) Pfirsich-Spawn (`main.ts:256–257`) rechnet mit `window.innerWidth/Height` zum Spawn-Zeitpunkt,
  wird bei Resize/Rotation nicht neu geklemmt und rendert mit z-index 35 **über** dem geöffneten
  Shop (z 20) — auf Mobile schwebt der Pfirsich über der Einkaufs-UI.
- **Fix:** Shop als Bottom-Sheet (~55 % Höhe) unter 640 px, Safe-Area-Padding, Pfirsich-Clamp bei
  Resize + Despawn bei geöffnetem Vollbild-Shop (§8.7).

**B14 🟡 — Boost-Inkonsequenzen.**
- ×3-Pfirsich-Boost wirkt nicht auf Boss-Schaden (`ui/boss.ts:69–74` nutzt nackt `perClick·mult`)
  und wird in der HUD-Ratenzeile (`ui/hud.ts:20`) nicht angezeigt — die Anzeige lügt während des
  Boosts. Ein zum Boss-Start sichtbarer Pfirsich bleibt zudem sichtbar (Gate nur beim Spawn,
  `main.ts:264–272`).
- **Fix:** `incomeMultiplier` in die eine zentrale „effektiver Klickwert"-Funktion falten (§4.2.6),
  HUD zeigt effektive Werte, Pfirsich despawnt bei Kampfbeginn.

**B15 🟡 — Float-Präzision als Zeitbombe.**
- `state.bp` ist ein `number`; sobald `bp / gain > 2^53` ist, verpuffen Klick-Gewinne komplett
  (`bp += gain` ändert nichts). Mit B1-Fix + Endless-Wachstum wird das real erreichbar.
- **Fix:** Kein BigNumber nötig (Begründung §9.3): Die Prestige-Schichten sind so getuned, dass
  Werte pro Schicht < 1e60 bleiben; zusätzlich Guard in der Sim (§9.5) der Stalls durch
  Präzisionsverlust erkennt.

**B16 🟡 — Doku-Drift.**
- `README.md:84` behauptet „Schema-Version 3", tatsächlich ist v4 live (`save/schema.ts:14`).
  Klein, aber genau die Art Drift, die Agents später fehlleitet.

**B17 🟡 — Kein Bulk-Buy.**
- Für ein Endless-Spiel mit hunderten Upgrade-Levels fehlen ×10/×25/×Max-Kauf (geschlossene
  Formel der geometrischen Reihe, §4.3.3). Reines QoL, aber ab M9 Pflicht.

### 3.2 Triage-Matrix (Severity × Aufwand)

| Bug | Severity | Aufwand | Milestone | Notiz |
| --- | -------- | ------- | --------- | ----- |
| B4 Space-Repeat | 🔴 | XS | M7 | Einzeiler + Test |
| B1 fmt()-Überlauf | 🔴 | S | M7 | Pure Funktion + Tests |
| B6 Idle-Affordability | 🟠 | S | M7 | Klassen-Toggle im Tick |
| B5 Hintergrund-Tab | 🟠 | S | M7 | visibilitychange-Gutschrift |
| B16 README-Drift | 🟡 | XS | M7 | Doku |
| B13b Safe-Area | 🟡 | XS | M7 | CSS + Meta |
| B7 DOM-Churn | 🟠 | M | M8 | HUD-Drossel + Popup-Batch |
| B12 Combo flach | 🟡 | M | M8 | Combo 2.0 + Krits |
| B14 Boost-Inkonsequenz | 🟡 | S | M8 | zentrale Klickwert-Funktion |
| B3 endlicher Content | 🔴 | L | M9 | Welttournee |
| B8 Leaderboard | 🟠 | M | M9 | v2-Metrik + Upsert |
| B2 Prestige additiv | 🔴 | M | M10 | Seelen + Migration |
| B11 Offline-Regeln | 🟠 | S | M10 | mit Prestige-Rework |
| B17 Bulk-Buy | 🟡 | S | M11 | mit Generatoren |
| B9 Skins kosmetisch | 🟠 | L | M12 | Gear-System |
| B10 kein Loot | 🟠 | L | M13 | Truhen |
| B13a/c Mobile-Shop/Pfirsich | 🟡 | M | M8/M13 | Sheet + Clamp |
| B15 Float-Präzision | 🟡 | S | M10/M16 | Sim-Guard |

---

## §4 Progression 2.0 — endlos, klick-zentriert („der Kern-Deliverable")

Explizit benannte Vorbilder und was wir von ihnen adaptieren:

| Vorbild | Entliehene Mechanik | Unsere Adaption |
| ------- | ------------------- | ---------------- |
| **Clicker Heroes** | Zonen-Leiter mit exponentiellem Gegner-HP, Boss-Timer, Ascension → Hero Souls (+10 % DPS je Seele, Ertrag superlinear zur Zone), Ancients-Skilltree, Transcendence als 2. Schicht | Welttournee (§4.4), Booty-Seelen (§4.5.1), Twerk-Ahnen (§4.6), Transzendenz (§4.5.3) |
| **AdVenture Capitalist** | Meilenstein-Multiplikatoren bei Besitz-Schwellen (×2 bei 25/50/100 …), Manager = Automation, Angel-Investor-Prestige | Generator-Meilensteine (§4.3.2), Twerk-Coaches (§4.3.4), Seelen-Formel-Anleihe |
| **Cookie Clicker** | Klick-Synergie mit Gebäuden („Thousand Fingers"), Golden Cookies, Click Frenzy, Heavenly Chips + Ascension-Baum, Sugar Lumps als Slow-Currency | Muskel-Gedächtnis (§4.2.5), Goldener Pfirsich bleibt + Varianten (§6.2), Twerk-Ekstase (§4.2.4), Himmelspfirsiche + Himmelsbaum (§4.5.2), Zuckerpfirsiche fürs Skin-Leveln (§5.4) |
| **Antimatter Dimensions / NGU Idle / Trimps / Realm Grinder** | Gestapelte Reset-Schichten, bei denen jede Schicht die Zeitkonstante der darunterliegenden drückt; „Herausforderungen" als Wiederspielwert | 3-Schichten-Prestige (§4.5), Challenge-Quests (§7.2), Pacing-Ziel „jede Schicht halbiert die Loop-Dauer der unteren" (§4.8) |

### 4.1 Der aktive Klick-Layer als Star

Eine einzige pure Funktion wird die **einzige** Quelle der Klick-Wahrheit (behebt B14):

```
effectiveClick(ctx) =
  perClick(ctx)                       // Basis + Upgrades + Synergie (§4.2.5)
  × mult(ctx)                         // Upgrade-Mults × Prestige (§4.5)
  × comboMult(ctx.comboTier)          // §4.2.2
  × critRoll(ctx.rng, ctx.critChance, ctx.critMult)   // §4.2.1
  × beatBonus(ctx.onBeat)             // §4.2.3
  × frenzyMult(ctx.frenzyActive)      // §4.2.4
  × eventMult(ctx.boostUntil, now)    // Pfirsich-Boost (bestehend)
```

Modul `game/click.ts`, deterministisch über injizierten RNG (§9.4), vollständig unit-getestet.
`doShake` in `main.ts` und der Tour-Schaden (§4.4) rufen **dieselbe** Funktion.

#### 4.2 Teilsysteme des Klick-Layers

**4.2.1 Twerk-Krits.**
- Basis: 2 % Chance, ×8 Schaden/BP. Skalierung über Ahnen (§4.6), Skins (§5) und Himmelsbaum.
- Harte Caps: Chance ≤ 50 %, Mult unbegrenzt (Mult ist der Endless-Skalierer, Chance nicht).
- Juice: eigener Sound-Layer (tieferer „Boom"), goldenes Popup in 1,6-facher Größe, Partikelring,
  Haptik 35 ms (§8).

**4.2.2 Combo 2.0 (ersetzt das flache +5 %-System, B12).**

| Tier | Stacks | Name | Klick-Bonus | Zusatz |
| ---- | ------ | ---- | ----------- | ------ |
| 0 | 0–9 | — | +2 %/Stack | — |
| 1 | 10 | „Warm" | +25 % | Partikel-Stufe 1 |
| 2 | 25 | „Heiß" | +60 % | Screen-Shake-Puls, Musik +Layer |
| 3 | 50 | „Feuer" | +120 % | +2 % Krit-Chance |
| 4 | 100 | „Inferno" | +250 % | +5 % Krit-Chance, Partikel-Stufe 3 |
| 5 | 250 | „Transzendent" | +500 % | Beat-Fenster +40 ms, HUD-Aura |

- **Sanfter Zerfall statt Hard-Reset:** Nach Ablauf des Fensters (Basis 1,2 s) verliert die Combo
  20 % ihrer Stacks pro Sekunde (mindestens 1 Stack/s), statt auf 0 zu fallen. Ein kurzer
  Griff zum Shop kostet also Momentum, nicht alles. Ahnen/Skins verlängern Fenster & senken Zerfall.
- Pure Engine in `game/combo.ts`: `comboStep(state, dtS)`, `comboOnClick(state)`, `comboMult(stacks)`.
  Bestehende Achievements (`combo10/50/100`) bleiben kompatibel (Stack-Zahl unverändert gezählt).

**4.2.3 On-Beat-Bonus (nutzt das vorhandene Beat-System).**
- Der existierende `BeatTracker` (`audio/beat.ts`) liefert Beat-Onsets. Ein Klick innerhalb
  ±100 ms um einen Onset gilt als „Im Takt!": ×1,5 auf diesen Klick, +1 Extra-Combo-Stack,
  goldener Blitz am HUD-Move-Badge.
- Da das Tempo mit `drive` steigt (schnelleres Klicken → schnellerer Beat → mehr Beat-Fenster),
  entsteht ein natürlicher Flow-Loop. Pure Prüfung `isOnBeat(phase, clickT)` in `game/click.ts`.

**4.2.4 Aktive Fähigkeit „Twerk-Ekstase" (à la Cookie Clickers Click Frenzy).**
- Lade-Meter 0–100: +1 pro Klick, +2 pro On-Beat-Klick. Voll → Button/Taste `F` aktivierbar.
- Effekt: **12 s lang ×10 Klick-BP und ×10 Klick-Schaden**, Musik schaltet einen Ekstase-Layer
  dazu, Kamera-FOV-Punch, Dauer-Partikel. Danach Meter leer.
- Später (Himmelsbaum, §4.5.2) freischaltbar: „Beat-Drop" (sofort 30 × effectiveClick als
  Flächenschaden auf den aktuellen Gegner, Cooldown 120 s) und „Pfirsichregen" (5 Mini-Pfirsiche
  regnen 6 s lang, je +60 s ×2-Boost-Verlängerung bei Fang).
- Persistiert: Meter-Stand, aktive Fenster als Epoch-ms (Schema v5, §9.2). Pure Logik in
  `game/ability.ts` (`chargeOnClick`, `activate`, `abilityMult(now)`).

**4.2.5 Klick-Synergie mit Generatoren (Cookie-Clicker-„Thousand Fingers"-Analog).**
- Neues Upgrade **„Muskel-Gedächtnis"** (`type: 'syn'`): pro Level fließen **+1 % von `perSec`
  in `perClick`** ein: `perClickEff = perClick + 0.01 · synLv · perSec`.
- Damit bleibt Klicken auch dann die Nr. 1, wenn die Idle-Ökonomie explodiert — Idle-Ausbau
  füttert direkt den Klick (Pfeiler P1). `deriveStats` wird um den `syn`-Typ erweitert
  (rein additiv im Fold, weiter pure).

**4.2.6 Klick-Invariante & Idle-Rolle.**
- Idle (perSec) läuft immer weiter (auch während der Tour, §4.4) — aber ohne Krit, Combo, Beat,
  Ekstase. Die Klick-Invariante aus §1.2 wird in der Balancing-Sim asserted (§9.5).

### 4.3 Generatoren & Meilenstein-Multiplikatoren (AdVenture Capitalist)

**4.3.1 Umwidmung.** Die vorhandenen `sec`-Upgrades (Auto-Twerker, Twerk-Squad, Twerk-Arena,
Pfirsich-Reaktor, Booty-Blackhole) heißen fortan **Generatoren** und bekommen zusätzlich je 3 neue
für die Endless-Kurve (Daten, kein Code): „Twerk-Tempel" (base 25 M), „Booty-Bootcamp-Planet"
(base 1 B), „Multiversum-Move-Fabrik" (base 100 B); Wachstum `gr` 1,17–1,25 wie gehabt.

**4.3.2 Meilenstein-Multiplikatoren.** Pro Generator verdoppelt sich sein Output bei
Level **25, 50, 100, 200, 400, 800, …** (jede Verdopplung der Schwelle → ×2):

```
milestoneMult(lv) = 2 ^ (Anzahl Schwellen ≤ lv),  Schwellen = 25 · 2^k
Beispiel: lv 130 → Schwellen 25, 50, 100 → ×8
```

Der Shop zeigt pro Generator einen Fortschrittsbalken zur nächsten Schwelle (das AdCap-Gefühl
„nur noch 3 Level bis ×2!"). Pure Funktion + Test in `game/economy.ts`.

**4.3.3 Bulk-Buy (B17).** Kauf-Modi ×1 / ×10 / ×Max über die geschlossene Summenformel

```
cost(lv → lv+n) = base · gr^lv · (gr^n − 1) / (gr − 1)
maxAffordable(bp) = floor( log_gr( bp·(gr−1)/(base·gr^lv) + 1 ) )
```

**4.3.4 Twerk-Coaches (Manager).** Über den Himmelsbaum (§4.5.2) freischaltbar: ein Coach
klickt 1×/s mit 25 % des effektiven Klickwerts (ohne Krit/Beat), upgradebar auf bis zu 4 cps.
Das ist die AdCap-„Manager"-Idee, umgemünzt: Automation imitiert *schwaches* aktives Spiel,
statt es zu ersetzen — echtes Klicken bleibt ≥ 3× besser (Invariante §1.2). Coaches speisen auch
den neuen Offline-Ertrag: `offlineBase = perSec + coachCps · 0.25 · perClickEff` (behebt B11,
Klick-Builds verdienen offline endlich mit).

### 4.4 Die Welttournee — endlose Zonen-Leiter (Clicker Heroes)

Ersetzt das One-Shot-Boss-Finale (B3). Immer aktiv, kein separater Modus: Der aktuelle
**Rivale** steht als zweites Rig gegenüber (Technik existiert: `spawnBossRig`, `main.ts:163–176`)
— jeder Shake verdient BP **und** trifft ihn zugleich.

**4.4.1 Struktur.**
- Zone `z` = Venue der Tour (Namen prozedural aus Listen: „Neon-Keller von Bottrop" →
  „Orbital-Arena Kepler-7b"). Pro Zone 8 Rivalen, jede 5. Zone ein **Boss** mit 30-s-Timer.
- Rivalen-HP und Kopfgeld:

```
HP(z)      = 12 · 1.55^(z−1)          (Boss: × 8)
bounty(z)  = HP(z) / 2 · 1/1.033^(z−1)   ⇔  bounty wächst mit ~1.5^z
```

  Das Verhältnis HP/bounty wächst mit ~1,033^z — **das** ist die eigentliche Wand: sie wächst
  langsam genug, dass ein Seelen-Multiplikator ×2,8 ≈ `ln(2.8)/ln(1.033)` ≈ **31 Zonen** weiter
  trägt (Kernrechnung hinter dem Pacing in §4.8).
- Schaden: Klick = `effectiveClick` (§4.1); Idle-DPS = `0.5 · perSec · mult` („die Crew tanzt mit",
  halbe Kraft — Klicken bleibt König). Boss-Timer-Fail ⇒ Zone bleibt, Boss-HP resettet (kein
  Easing mehr nötig — man farmt einfach tiefer und kommt stärker wieder).
- Kills droppen: BP-Kopfgeld, Combo +2 Stacks, Chance auf Schlüssel/Truhen (§6.1).
- **Zonen-Rücklauf:** Freiwillig zurückschalten (Farm-Modus) ist erlaubt (CH-Standard).
- **Kompatibilität:** Der Goldene Twerk-Tyrann ist der Boss von **Zone 10** (HP(10)·8 ≈ 8,1 k —
  bewusst früh und fett inszeniert); sein Erst-Kill schaltet wie bisher den Tyrann-Skin frei und
  setzt `bossDefeated` (Achievement `slayer` bleibt gültig).

**4.4.2 Persistenz & Purity.** `game/tour.ts`: `createTour()`, `tourHit(dmg)`, `tourTick(dt)`,
`hpFor(z, isBoss)`, `bountyFor(z)` — pure, kein DOM (Muster von `boss.ts` übernehmen und
verallgemeinern). Save v5: `{ zone, kills, highestZone }`.

**Akzeptanzkriterien §4.4:**
1. `hpFor`/`bountyFor` unit-getestet inkl. Wachstumsverhältnis (Property-Test: `HP(z)/bounty(z)`
   wächst monoton).
2. Zone-10-Boss-Erstkill schaltet Tyrann-Skin + `slayer` frei (Regressionstest).
3. Sim (§9.5): Bei Klick-Invariante 3 cps erreicht Run 1 Zone ≥ 20 in ≤ 45 min.
4. Ein Boss-Timer-Fail verliert nie Fortschritt (Zone/Kills unverändert, nur Boss-HP resettet).

### 4.5 Drei gestapelte Prestige-Schichten

| Schicht | Name | Währung | Gate (erstes Mal) | Resettet | Bleibt erhalten |
| ------- | ---- | ------- | ----------------- | -------- | ---------------- |
| L1 | **Rebirth** (Rework) | Booty-Seelen (BS) | Zone ≥ 15 | BP, Upgrades/Generatoren, Zone, Combo/Meter | Skins/Level, Kulissen, Achievements, BS, Ahnen, Schlüssel, Splitter, L2/L3 |
| L2 | **Aszension** | Himmelspfirsiche (HPF) | 2 000 BS lifetime | alles aus L1 **plus** BS & Ahnen-Level | Skins/Splitter, Achievements, HPF, Himmelsbaum, L3 |
| L3 | **Transzendenz** | Transzendente Essenz (TE) | 100 HPF lifetime | alles aus L2 **plus** HPF & Himmelsbaum | Mythos-Skins, TE, globaler TE-Exponent |

**4.5.1 Rebirth 2.0 — Booty-Seelen (behebt B2).**
- Ertrag beim Reset (superlinear zur Zone, Clicker-Heroes-Prinzip):

```
BS_gain(maxZone) = floor( (maxZone / 5) ^ 1.8 )
```

  Beispiele: z 15 → 7 · z 25 → 18 · z 50 → 63 · z 100 → 219 · z 150 → 456 · z 300 → 1 588.
- Wirkung: `soulMult = 1 + 0.10 · BS_gehalten` (jede Seele +10 % auf **alle** BP-Quellen,
  CH-Formel). Seelen sind zugleich **Skillpunkte** für Ahnen (§4.6) — ausgegebene Seelen
  buffen nicht mehr (klassischer CH-Tradeoff: Mult vs. Perk).
- Migration Bestandsspieler: `BS_start = 7 · rebirths_alt` (entspricht je einem Zone-15-Run —
  großzügig, niemand fühlt sich enteignet; dokumentieren in DECISIONS.md).
- UI: Der Rebirth-Dialog zeigt **vorab** „Rebirth jetzt: +X Seelen (+Y % Einkommen)" — der
  wichtigste einzelne UX-Fix am Prestige (heute steht dort nur Fließtext).

**4.5.2 Aszension — Himmelspfirsiche (Cookie-Clicker-Heavenly-Chips-Analog).**
- Ertrag: `HPF_gain = floor( (BS_lifetime / 100) ^ 0.6 )`, z. B. 2 000 BS → 6 HPF,
  20 000 → 24, 1 M → 251.
- Passiv: +2 % globales Einkommen pro HPF (additiv zum Seelen-Mult, multiplikativ gestapelt:
  `total = soulMult · (1 + 0.02·HPF) · …`).
- **Himmelsbaum** (ausgegebene HPF, permanent über alle Rebirths):

| Knoten | Kosten (HPF) | Effekt |
| ------ | ------------ | ------ |
| Twerk-Coach I–IV | 5 / 15 / 40 / 100 | Auto-Klicker 1→4 cps (§4.3.4) |
| Frühstarter | 8 | Start nach Rebirth mit Generator-Leveln = 10 % der vorherigen |
| Nachtschicht | 10 / 25 | Offline-Cap 8 h → 16 h → 24 h |
| Beat-Drop | 20 | Fähigkeit freischalten (§4.2.4) |
| Pfirsichregen | 30 | Fähigkeit freischalten (§4.2.4) |
| Ekstase-Ausdauer I–III | 12 / 30 / 75 | Ekstase-Dauer +3 s je Stufe |
| Truhen-Magnet | 15 | +25 % Schlüssel-Dropchance |
| Zonen-Sprinter | 25 | Nach Rebirth: Zonen < ⌊highestZone/3⌋ brauchen nur 3 Kills |

**4.5.3 Transzendenz (Skizze, bewusst später — M15+).**
- `TE_gain = floor( log10(HPF_lifetime) )`; Wirkung: globaler Multiplikator `×3^TE` **und**
  Zugang zu Mythos-Skins (§5.3) + 5. Kulisse „Astral-Klub". Details werden nach Live-Daten der
  ersten Schichten getuned (Open Question §11).

**Akzeptanzkriterien §4.5:**
1. `soulsFor(maxZone)`, `hpfFor(bsLifetime)` pure + unit-getestet (inkl. Superlinearität:
   `BS(2z) > 2·BS(z)` für z ≥ 10).
2. Reset-Scopes exakt wie Tabelle (Tests: je Schicht ein „was bleibt/was fällt"-Snapshot-Test).
3. Migration v4→v5 wandelt `rebirths` in Start-BS um; `prestigeMult` wird nie mehr gelesen
   (Feld bleibt im Save für Abwärtskompatibilität des Imports, wird beim Serialisieren als
   Legacy mitgeschrieben oder entfernt — Entscheidung in DECISIONS.md festhalten).
4. Rebirth-Dialog zeigt BS-Vorschau; Aszensions-Dialog zeigt HPF-Vorschau.

### 4.6 Twerk-Ahnen (Clicker-Heroes-Ancients, Skilltree für Seelen)

Kosten pro Level: `cost(lv) = lv + 1` Seelen (Summe: `n(n+1)/2` — früh billig, später echter Sink).
Datengetriebenes Config-Array `game/ancients.ts`, Effekte fließen als reine Modifikatoren in
`effectiveClick`/`deriveStats`:

| Ahn:in | Flavor | Effekt/Level | Cap |
| ------ | ------ | ------------ | --- |
| **Twerkules** | Held der 1000 Reps | +5 % Klick-BP | — |
| **Poposeidon** | Herr der Wellen | +15 % Idle-BP | — |
| **Cheeksana** | Auge des Sturms | +0,5 % Krit-Chance | 25 |
| **Glutaeus Maximus** | Gladiator | +10 % Schaden gegen Bosse | — |
| **Peachiel** | Erzengel des Goldes | +10 % Zonen-Kopfgeld | — |
| **Wackelias** | Der Unerschütterliche | +0,05 s Combo-Fenster | 10 |
| **Beatrix** | Taktgeberin | +10 ms On-Beat-Fenster | 8 |
| **Truhilda** | Schatzmeisterin | +2 % Truhen-Luck (§6.4) | 15 |
| **Ekstasius** | Der Entfesselte | −5 % Ekstase-Ladebedarf | 10 |

(Caps nur dort, wo Unbegrenztheit degenerieren würde — Chance/Fenster; Prozent-Output-Ahnen sind
bewusst endlos als Seelen-Sink.)

**Akzeptanzkriterien §4.6:** 1. Ahnen-Konfig ist Daten (Balancing ohne Logikänderung).
2. `ancientBonus(id, lv)` pure + getestet; Caps enforced im purem Kauf-Guard.
3. Ausgegebene Seelen reduzieren `soulMult` korrekt (Test: kaufen → Mult sinkt, Effekt steigt).

### 4.7 Währungs-Karte

| Kürzel | Name | Verdienen | Ausgeben | Reset-Scope |
| ------ | ---- | --------- | -------- | ----------- |
| BP | Booty Points | Klicks, Idle, Kopfgeld, Truhen, Offline | Upgrades, Generatoren, Skin-Erstkauf | L1 |
| BS | Booty-Seelen | Rebirth (`(z/5)^1.8`) | Ahnen; gehaltene = +10 %/Stk | L2 |
| HPF | Himmelspfirsiche | Aszension (`(BS/100)^0.6`) | Himmelsbaum; gehaltene = +2 %/Stk | L3 |
| TE | Transzendente Essenz | Transzendenz (`log10 HPF`) | ×3^TE global, Mythos-Content | nie |
| 🔑 | Truhenschlüssel | Bosse, Quests, Daily, Combo-Meilensteine, Pfirsich-Chance | Truhen öffnen (§6) | nie |
| 🧩 | Pfirsich-Splitter | Truhen, Duplikate, Quests | Skins leveln (§5.4) | nie |
| 🍬 | Zuckerpfirsich | 1×/24 h Echtzeit (reift wie Sugar Lumps) | Skin-Sterne (§5.4), Ekstase-Slot | nie |

### 4.8 Pacing-Kurve & Zahlenbeispiele (Tuning-Ziele für die Sim)

Herleitung der Loop-Beschleunigung: Der Seelen-Mult verschiebt die Wand um
`Δz ≈ ln(soulMult)/ln(1.033)` Zonen (§4.4.1). Damit:

| Loop | Zustand vorher | Ziel-Dauer | Ergebnis (BS kumuliert → Mult) |
| ---- | -------------- | ---------- | ------------------------------ |
| Run 1 (frisch) | — | 35–45 min bis Zone ~20–25 | +18 BS → ×2,8 |
| Run 2 | ×2,8 | ~20 min bis Zone ~50 | +63 → 81 BS → ×9,1 |
| Run 3 | ×9,1 | ~15 min bis Zone ~85 | +166 → 247 BS → ×25,7 |
| Run 4–8 | wachsend | je 10–20 min, +25–35 Zonen | … |
| Erste Aszension | ~2 000 BS lifetime | nach ~6–10 h Gesamtspielzeit | 6 HPF + Himmelsbaum-Start |
| Aszensions-Loop | — | erste ~2–3 h, fallend auf ~1 h | HPF wachsen superlinear |
| Erste Transzendenz | 100 HPF | Größenordnung 3–7 Tage | Design-Review vorher (§11) |

Ziel-Invarianten (asserted in `simulateEndless`, §9.5):
1. **Nie fertig:** Nach jedem Reset existiert eine erreichbare nächste Wand (Sim findet für
   jede getestete Seelen-Zahl eine Zone, an der DPS/HP < 1/30 s wird).
2. **Nie gestallt:** Zeit bis zur Wand ist endlich und ≤ 60 min für die ersten 20 Rebirths.
3. **Beschleunigung:** `Dauer(Run n+1 bis alte Bestzone) < Dauer(Run n)` für n ≤ 10.
4. **Klick-Invariante** (§1.2) hält an Messpunkten Zone 1/10/25/50/100.

---

## §5 Skins als Gear (Buffs statt Kosmetik — behebt B9)

### 5.1 Prinzip

Skins werden Ausrüstung: **1 aktiver Skin** (voller Buff) + Kulisse (Mini-Buff) + Set-Boni.
Kein Skin ist rein kosmetisch; der Twerk bleibt im Zentrum, weil die stärksten Buffs Klick-Buffs
sind. Erwerb wie bisher (BP + `revealAt`) **oder** via Truhen-Jackpot; Fortschritt über Level
(Splitter) und Sterne (Zuckerpfirsiche).

### 5.2 Datenmodell

`SkinConfig` wird erweitert (Daten, kein Code — Spec-§4.3-Disziplin):

```ts
interface SkinConfig {
  …bestehende Felder…
  rarity: 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
  buff: { stat: BuffStat; perLevel: number };   // linear pro Level
  star: { stat: BuffStat; perStar: number };    // Sterne 0–5, Zuckerpfirsiche
}
type BuffStat = 'clickPct' | 'idlePct' | 'critChance' | 'critMult' | 'comboWindow'
  | 'comboDecay' | 'chestLuck' | 'keyDrop' | 'bossDmg' | 'beatWindow' | 'offlineRate'
  | 'frenzyDur' | 'bounty';
```

`game/gear.ts` faltet aktive Skin-+Kulissen-+Set-Boni zu einem puren `GearBonus`-Objekt, das in
`effectiveClick`/`deriveStats` einfließt.

### 5.3 Starter-Katalog (bestehende 5 + 5 neue, alle prozedural baubar)

| Skin | Rarität | Buff pro Level | Stern-Bonus | Beschaffung |
| ---- | ------- | -------------- | ----------- | ----------- |
| 🕺 Klassiker | Common | +4 % Klick-BP | +10 % Klick-BP/⭐ | Start |
| 🪩 Disco-King | Rare | +0,4 % Krit-Chance (Cap-Anteil §4.2.1) | +5 % Krit-Mult/⭐ | Start |
| 🤖 Robo-Twerk 3000 | Rare | +8 % Idle-BP | Coach +0,2 cps/⭐ | 250 BP / reveal 300 |
| 🎤 Der Showmaster | Epic | +0,06 s Combo-Fenster | −4 % Combo-Zerfall/⭐ | 1 500 BP / reveal 4 000 |
| 👑 Goldener Twerk-Tyrann | Legendary | +12 % Boss-Schaden | +2 % Truhen-Luck/⭐ | Zone-10-Boss |
| 🥷 Neon-Ninja | Epic | +8 ms Beat-Fenster | On-Beat ×1,5 → ×1,6/⭐ | Truhen (Splitter-Craft 120) |
| 🏴‍☠️ Pfirsich-Pirat | Rare | +6 % Schlüssel-Drop | +5 % Kopfgeld/⭐ | Truhen (Splitter-Craft 80) |
| 🌋 Lava-Twerker | Epic | +6 % Krit-Mult | Ekstase +1 s/⭐ | Zone-50-Boss-Erstkill |
| 🛸 Galaktischer Gyrator | Legendary | +10 % Ekstase-Dauer | −8 % Ekstase-Ladebedarf/⭐ | Aszension #1 |
| 💎 Diamant-Booty | Mythic | +2 % ALLES (global) | +3 % ALLES/⭐ | Transzendenz |

### 5.4 Level & Sterne

- **Level 1–50:** Kosten `splitter(lv) = 10 · ceil(1.25^lv)`; lineare Buff-Skalierung.
- **Sterne 0–5:** je 1 Zuckerpfirsich × (Sterne+1); Zuckerpfirsich reift 1×/24 h Echtzeit
  (Sugar-Lump-Mechanik: langsame, nicht grindbare Meta-Währung — schafft den „Morgen wieder
  reinschauen"-Anker, §7.1).
- Duplikat aus Truhe → 25 Splitter (Common) … 400 (Legendary).

### 5.5 Set-Boni (Skin × Kulisse)

| Set | Kombination | Bonus |
| --- | ----------- | ----- |
| „Studio 54" | Disco-King + Neon-Club | +10 % Krit-Schaden |
| „Retrowelle" | Neon-Ninja + Synthwave | Beat-Fenster +20 ms |
| „Endless Summer" | Pfirsich-Pirat + Sunset Beach | Offline-Rate 50 % → 65 % |
| „Void-Funk" | Galaktischer Gyrator + Deep Space | +15 % Idle-BP |
| „Krönung" | Tyrann + beliebige Boss-Zone (z % 5 = 0) | +10 % Boss-Schaden |

Kulissen allein geben Mini-Buffs (Club +0,1 s Combo-Fenster, Synth +10 ms Beat-Fenster,
Beach +2 h Offline-Cap, Space +5 % Idle).

**Akzeptanzkriterien §5:**
1. `gearBonus(state)` pure; Test: Skin-Wechsel ändert `effectiveClick` deterministisch.
2. Set-Erkennung als Daten-Tabelle; Test für mind. 2 Sets.
3. Bestehende Saves: alle 5 Alt-Skins erscheinen als Level 1 / 0 Sterne, Unlocks bleiben (Migrationstest).
4. Shop-Skin-Karten zeigen Rarität (Rahmenfarbe), Buff-Text, Level, Splitter-Kosten; kein
   Skin ohne Buff-Anzeige.
5. Klick-Invariante bleibt mit Best-in-Slot-Idle-Gear erfüllt (Sim-Messpunkt).

---

## §6 Pfirsich-Truhen — Loot ohne Echtgeld (behebt B10)

### 6.1 Quellen von Truhen & Schlüsseln

| Quelle | Drop |
| ------ | ---- |
| Zonen-Boss-Kill | 1 🔑 garantiert; Truhe 100 % (Tier zonenabhängig, §6.2) |
| Rivalen-Kill | 3 % Chance Holztruhe (Truhen-Luck skaliert) |
| Combo-Meilenstein (Tier 3+ erstmals pro Run) | 1 🔑 |
| Goldener Pfirsich | 25 % Chance: droppt zusätzlich 1 🔑 |
| Daily-Login (§7.1) | 1 Goldtruhe |
| Quests (§7.2) | 🔑 / Truhen / Splitter laut Quest |
| 20 min aktive Spielzeit (Klicks > 500) | 1 Holztruhe (Session-Drip, max 3/Tag) |

Truhen landen in einem Inventar (Badge am neuen 🎁-Tab); Öffnen kostet 🔑 (Holz 0, Gold 1,
Diamant 3, Mythos 10) — Schlüssel sind der Taktgeber, Truhen der Dopamin-Moment.

### 6.2 Truhen-Tiers

| Truhe | Quelle (typisch) | Schlüssel | Inhalt-Budget |
| ----- | ---------------- | --------- | ------------- |
| 🪵 Holztruhe | Kills, Session-Drip | 0 | klein, meist BP/Boost |
| 🥇 Goldtruhe | Bosse z < 50, Daily | 1 | mittel, Splitter-Kern |
| 💠 Diamanttruhe | Bosse z ≥ 50, Quests | 3 | groß, Epic-Chance |
| 🌌 Mythostruhe | Bosse z ≥ 150, Events | 10 | Jackpot-Tier |

### 6.3 Beispiel-Loot-Tabellen (Gewichte; BP-Beträge skalieren mit aktuellem Einkommen)

**Goldtruhe (Gewichtssumme 100):**

| Gewicht | Belohnung |
| ------- | --------- |
| 30 | BP = 15 min aktuelles Gesamteinkommen |
| 25 | Temp-Boost ×2 für 10 min (stackt Dauer, nicht Faktor) |
| 22 | 3–8 Pfirsich-Splitter |
| 10 | +1 🔑 |
| 8 | Permanent-Token „+1 % Krit-Schaden" (unbegrenzt sammelbar, je +1 %) |
| 3 | Zuckerpfirsich |
| 2 | **Jackpot:** zufälliger Truhen-Skin (Neon-Ninja/Pirat-Pool); Duplikat → Splitter |

**Diamanttruhe:** wie Gold, aber Budget ×4, Splitter 10–25, Jackpot 5 % (inkl. Epic-Pool),
Permanent-Token-Pool erweitert (+0,1 % Krit-Chance / +1 % Kopfgeld / +1 % Idle).

### 6.4 Fairness-Regeln (Anti-Frust, kein Echtgeld — Pfeiler P5)

1. **Pity:** Spätestens jede 12. Gold-/4. Diamanttruhe enthält Splitter ≥ Maximum **oder** Jackpot;
   Zähler pro Tier persistiert.
2. **Duplikat-Schutz:** Skins doppelt → fester Splitter-Kurs (§5.4); nie „nichts".
3. **Kein Kauf:** Schlüssel/Truhen sind ausschließlich erspielbar. Keine Ausnahme, nie.
4. **Truhen-Luck** (Truhilda, Tyrann-Sterne, „Truhen-Magnet") verschiebt Gewichte von Zeile 1
   nach unten (pure Umgewichtung `applyLuck(table, luck)`, getestet).
5. **Transparenz:** Der 🎁-Tab zeigt die Loot-Tabelle der jeweiligen Truhe (Gewichte in %),
   Genre-Best-Practice gegen Gacha-Gefühl.

### 6.5 Determinismus

Alle Rolls über den seedbaren RNG (§9.4); `openChest(tier, state, rng)` ist pure und liefert
`{ rewards, newPity }`. Tests: Verteilungs-Test über 10 000 Seeds (χ²-Toleranz), Pity-Grenzfall,
Luck-Umgewichtung.

**Akzeptanzkriterien §6:**
1. `openChest` pure + deterministisch (gleicher Seed ⇒ gleicher Loot).
2. Pity greift exakt an der Grenze (Test: 11 Nieten ⇒ 12. ist Treffer).
3. UI: Truhen-Öffnung als 1,2-s-Animation (§8.6), skippbar per Klick.
4. Inventar/Keys/Pity überleben Reload (Schema v5, Migrationstest).
5. Kein Netzwerk, kein Echtgeld-Pfad, keine dark patterns (Review-Checkliste in TESTPLAN).

---

## §7 Meta & Retention (offline-freundlich, fail-silent)

### 7.1 Daily-Anker
- **Login-Belohnung:** 1 Goldtruhe/Tag; **Streak** (max 7): Tag 7 = Diamanttruhe + 2 🔑.
  Streak-Bruch setzt auf Tag 1 zurück (mild, kein FOMO-Terror: Streak-Schutz 1×/Woche gratis).
- **Zuckerpfirsich-Reifung** (§5.4): 24-h-Echtzeit-Timer, persistiert als Epoch-ms — der
  tägliche „kurz ernten"-Grund. Alles rein lokal (Date.now), kein Server.

### 7.2 Quests/Challenges (3 Slots, täglich rotierend, seedbar aus Datum)
Beispiele (Daten-Array `game/quests.ts`): „Erreiche Combo-Tier 3" (2 🔑), „Besiege 4 Bosse"
(Goldtruhe), „Fange 2 Goldene Pfirsiche" (20 Splitter), „500 On-Beat-Klicks" (Diamanttruhe),
„Rebirthe einmal" (5 BS). Fortschritt pure über denselben Event-Bus wie Achievements
(`buildAchievementCtx`-Erweiterung), Reroll 1×/Tag.

### 7.3 Saison-Events (client-seitig, datumsbasiert)
Oktober „Spooky Booty" (Kürbis-Partikel, Event-Skin via Splitter), Dezember „Frost-Twerk".
Rein lokal (Datum → Config), kein Server nötig; Event-Skins bleiben nach dem Event craftbar
(teurer) — kein FOMO-Hardlock.

### 7.4 Leaderboard v2 (behebt B8)
- **Metrik:** `maxZoneEver` (monoton, endless-tauglich, nicht durch Prestige gameable — Prestige
  *hilft* der Metrik, statt sie zu brechen) + Anzeigefelder `rebirths`, `ascensions`.
- **Upsert pro Nickname** (D1 `UNIQUE(nickname)` + `ON CONFLICT … UPDATE WHERE excluded.max_zone > max_zone`),
  Rate-Limit unverändert. API-Vertrag §9.7. Alte `scores`-Tabelle bleibt; die Boss-Zeit-Ansicht
  wird als „Klassik (Archiv)"-Tab angezeigt oder entfernt (Entscheidung → DECISIONS.md).
- Client bleibt komplett fail-silent & default-aus (`VITE_API_BASE`).

### 7.5 Statistik-Tab
Neuer 📊-Abschnitt im ⚙️-Tab: BP lifetime, Klicks, Krits, höchste Combo, On-Beat-Quote,
Bosse, höchste Zone, Rebirths/BS, Truhen geöffnet, Spielzeit. Alles aus Save-v5-Stats-Feldern
(Zähler-Increments an bestehenden Event-Punkten, pure Aggregation).

**Akzeptanzkriterien §7:**
1. Daily/Streak/Quests funktionieren vollständig offline; Systemuhr-Manipulation crasht nichts
   (never-throw: negative Deltas ⇒ Neutralverhalten, Test).
2. Quest-Rotation ist deterministisch aus dem Datum (Test: gleiches Datum ⇒ gleiche Quests).
3. Leaderboard v2: Upsert-Semantik getestet (in-memory Fakes wie M5); Spiel voll spielbar ohne API.
4. Statistik zählt korrekt über Rebirths hinweg (lifetime vs. run-scoped getrennt, Test).

---

## §8 UX / Juice / Feel — Klicken muss sich großartig anfühlen

Alle Effekte respektieren die bestehenden Toggles (`bootyclicker.settings`) und den
Performance-Budget-Rahmen (§9.6). Neue Toggles: Haptik, Popup-Dichte.

1. **Hit-Feedback-Basis:** Jeder Klick: Cheek-Impuls (existiert) + 60-ms-Skalen-Punch am
   Pelvis-Bone + Partikel-Mini-Burst. Krit: Ring-Burst + Gold-Blitz + tiefer Boom-Layer.
2. **Floating Numbers 2.0:** Krit-Popups 1,6×, goldene Farbe, leichte Rotation; On-Beat-Popups
   mit „♪"-Präfix.
3. **Popup-Batching (B7):** Max. 1 Popup pro 80 ms; dazwischen aggregiert ein Akkumulator die
   Summe („+12,4 K ×7"). Pool aus 24 wiederverwendeten DOM-Nodes statt create/remove
   (`ui/pops.ts`, pure Batcher-Logik `popBatcher(nowMs, amount)` getestet).
4. **Screen-Shake-Tiers:** an Combo-Tiers gekoppelt (Tier 2: 0,2 · Tier 4: 0,35 · Ekstase: 0,5,
   Boss-Kill: 0,6); weiterhin nur im Render angewendet, nie in OrbitControls-State (M4-Muster).
5. **Partikel skalieren mit Combo:** Burst-Count = `8 + comboTier · 6` (Pool bleibt 200, ggf.
   auf 400 erhöht — messen, Budget < 1 ms bleibt AC).
6. **Truhen-Animation:** Truhe als Sprite/Box im DOM-Overlay, 1,2 s: wackeln → aufspringen →
   Reward-Karten fliegen ein; skippbar; Sound: Ratsche + Jingle (prozedural, `audio/engine.ts`).
7. **Mobile:** Shop als **Bottom-Sheet** (55 % Höhe, Figur bleibt sichtbar — behebt B13a),
   `viewport-fit=cover` + `env(safe-area-inset-*)`-Padding auf allen fixed-Elementen (B13b),
   Pfirsich-Clamp bei Resize + Despawn bei offenem Sheet (B13c).
8. **Haptik:** `navigator.vibrate?.(8)` pro Klick (gedrosselt auf 1×/100 ms), 35 ms bei Krit,
   Muster `[20,30,60]` bei Boss-Kill/Truhen-Jackpot; Feature-Detection, Toggle, iOS-no-op.
9. **Ability-/Cooldown-Bar:** Unten mittig: Ekstase-Meter (füllt sichtbar pro Klick), daneben
   freigeschaltete Fähigkeits-Buttons mit radialem Cooldown; Tastatur `F`/`D`/`R`.
10. **Sound-Layering mit Beat:** Combo-Tier schaltet Musik-Layer zu (Tier 2: Perkussion-Spur,
    Tier 4: Lead-Arp +1 Oktave, Ekstase: alles + Filter-Sweep) — `MusicPlayer` bekommt
    `setIntensity(0..3)`, rein additiv zum bestehenden 16-Step-Pattern.
11. **HUD-Wahrheit:** Ratenzeile zeigt **effektive** Werte inkl. aktiver Boosts (behebt B14-Anzeige),
    plus Zonen-Widget (Zone, Gegner-HP-Balken, Boss-Timer) oben rechts.

**Akzeptanzkriterien §8:**
1. 12 cps + Krits + Partikel: Frame-Budget hält 60 fps auf Referenz-Laptop (gemessen, TESTPLAN).
2. Popup-DOM-Knoten ≤ 24 gleichzeitig (Pool-Test via Zähler).
3. Haptik feuert nie öfter als 10×/s und nie ohne Nutzer-Toggle an.
4. Alle neuen Effekte einzeln abschaltbar; „Effekte aus" ⇒ visuell M6-Niveau.
5. Bottom-Sheet-Shop: Figur während des Kaufens sichtbar; Kauf zeigt Partikel-Feedback am Rig.

---

## §9 Technisches Design & Architektur-Fit

### 9.1 Neue Module (alle pure, DOM-frei, unit-getestet — M0-Disziplin)

```
apps/game/src/game/click.ts      # effectiveClick, isOnBeat, Krit-Roll
apps/game/src/game/combo.ts      # Combo 2.0 (Tiers, Zerfall)
apps/game/src/game/ability.ts    # Ekstase/Beat-Drop/Pfirsichregen (Meter, Fenster)
apps/game/src/game/tour.ts       # Zonen, HP/Bounty, Boss-Timer (verallgemeinert boss.ts)
apps/game/src/game/souls.ts      # BS/HPF/TE-Formeln, Reset-Scopes
apps/game/src/game/ancients.ts   # Ahnen-Konfig + Boni
apps/game/src/game/gear.ts       # Skin/Kulissen/Set-Boni-Fold
apps/game/src/game/chests.ts     # Loot-Tabellen, openChest, Pity, Luck
apps/game/src/game/quests.ts     # Daily-Quests, Streak
apps/game/src/util/rng.ts        # mulberry32, seedbar (§9.4)
apps/game/src/ui/pops.ts         # Popup-Pool + Batcher
apps/game/src/ui/tour.ts, chest.ts, ability.ts, stats.ts   # dünner Glue
```

`main.ts` bleibt der einzige Ort mit Wiring; wächst er über ~600 Zeilen, wird nach
`bootstrap/`-Teilmodulen extrahiert (reine Verschiebung, kein Verhalten).

### 9.2 Save-Schema v5 (Migration v4→v5, never-throw, `Object.hasOwn`)

Neue Felder (alle mit Defaults in `migrateV4toV5`; Validator-Muster von `isSaveDataV4` fortgeführt —
pro Feld Typ-+Range-Check, unbekannte Keys ignorieren, nie werfen):

```ts
interface SaveDataV5 {
  schemaVersion: 5;
  …alle v4-Felder…                    // prestigeMult bleibt als Legacy-Feld erhalten
  tour: { zone: number; kills: number; highestZone: number };
  souls: { bs: number; bsLifetime: number; ancients: Record<string, number> };
  ascension: { hpf: number; hpfLifetime: number; count: number;
               heavenly: Record<string, number> };
  ability: { charge: number; frenzyUntil: number; cooldowns: Record<string, number> };
  gear: { skinLevels: Record<string, number>; skinStars: Record<string, number>;
          shards: number; sugarPeaches: number; nextSugarAt: number };
  chests: { keys: number; inventory: Record<ChestTier, number>;
            pity: Record<ChestTier, number> };
  rng: { seed: number; cursor: number };
  meta: { questDate: string; questProgress: Record<string, number>;
          questsClaimed: string[]; streak: number; lastLoginDay: string;
          permTokens: Record<string, number> };
  stats: { bpLifetime: number; crits: number; onBeatClicks: number;
           bossKills: number; chestsOpened: number; playTimeS: number };
}
```

Migrations-Sonderfälle (Tests Pflicht):
1. `rebirths ≥ 1` ⇒ `souls.bs = souls.bsLifetime = 7 · rebirths` (§4.5.1).
2. `bossDefeated === true` ⇒ `tour.highestZone = max(10, …)` (Tyrann galt als Zone-10-Boss).
3. `unlocked`-Skins ⇒ `skinLevels[k] = 1`.
4. Korruptes Teilobjekt (z. B. `tour: 5`) ⇒ Validator lehnt ab ⇒ sauberer Fresh-Start
   (bestehendes Verhalten, Test analog `migrate.test.ts`).

Client-Settings (`bootyclicker.settings`) erhalten `haptics: boolean` und
`popDensity: 'voll' | 'reduziert'` — per Feld-Fallback wie `asQuality` (kein Save-Schema betroffen,
M6-Entscheidungsmuster).

### 9.3 Erweiterter Number-Formatter (behebt B1) — Empfehlung: **Doubles, kein BigNumber**

```ts
const SUFFIXES = ['K','M','B','T','Qa','Qi','Sx','Sp','Oc','No','Dc'];
// benannt mindestens bis Dc (1e33); optional erweiterbar bis QiDc (1e51)
fmt(n):
  n < 1000            → floor-String (wie bisher)
  n < Suffix-Grenze   → Mantisse.toFixed(2) + Suffix (Schleife OHNE Kappungs-Bug)
  sonst               → wissenschaftlich: "3.14e87" (Mantisse 2 Nachkommastellen)
  !isFinite(n)        → "∞" (Guard; darf laut Sim nie erreicht werden)
  n < 0               → '-' + fmt(-n)
```

Abwägung BigNumber (z. B. `break_infinity.js`, ~25 KB min):

| | Doubles + e-Notation | BigNumber-Lib |
| - | ------------------- | ------------- |
| Bundle | ±0 KB | +25–30 KB (Budget-relevant, aber tragbar) |
| Umbau | keiner | **jede** Ökonomie-Funktion + alle 141 Tests + Save-Format |
| Grenze | 1,8e308 hart; Additions-Präzision ab Verhältnis 2^53 (B15) | praktisch unbegrenzt |
| Risiko | Stall, falls Tuning entgleist | großflächige Regression |

**Entscheidung:** Doubles. Die Prestige-Schichten sind explizit so getuned, dass BP pro Run
< 1e60 bleibt (Reset-Design ist unser „BigNumber"); `simulateEndless` enthält einen
Präzisions-Guard (Assert: kleinster relevanter Gewinn > `bp · 2^-50`). Erst wenn Transzendenz-
Tuning (M15+) das sprengt, wird `break_infinity` als eigener Milestone evaluiert →
Risiko-Eintrag §11.

### 9.4 Deterministische Zufälligkeit

`util/rng.ts`: mulberry32 (32-Bit-Seed, ~10 Zeilen, keine Dependency).
`{ seed, cursor }` im Save; jede Ziehung inkrementiert `cursor`; Reload setzt den Strom exakt
fort (Save-Scumming vor Truhen ist damit wirkungslos — Fairness + Testbarkeit in einem).
Alle Systeme (Krit, Loot, Pfirsich-Timing, Quest-Rotation) ziehen aus injizierten RNG-Funktionen;
`Math.random` bleibt nur für nicht-spielrelevante Optik (Partikelrichtungen) erlaubt.
Tests: gleicher Seed ⇒ identische Sequenz über Serialisierung hinweg.

### 9.5 Balancing-Simulation `simulateEndless` (erweitert `simulatePlaythrough`)

Deterministischer Bot über N Rebirths: klickt `clickRate` cps, nutzt Ekstase optimal, kauft
ROI-greedy (Generatoren inkl. Meilensteine), pusht Zonen bis DPS/HP-Wand, rebirtht bei
Grenznutzen < Schwelle, kauft Ahnen nach fixer Priorität. Asserted (CI-Pflicht):

1. Pacing-Tabelle §4.8 (Toleranz ±25 %).
2. „Nie gestallt": Zeit-bis-Wand ≤ 60 min für Rebirth 1–20.
3. Beschleunigungs-Invariante (Run n+1 schneller zur alten Bestzone).
4. Klick-Invariante ≥ 3× Idle an den Messpunkten.
5. Float-Guard (§9.3).
6. Laufzeit der Sim selbst < 10 s (grobe Zeitschritte 250 ms, wie bisher).

### 9.6 Performance-Budget (unverändert hart)

- Bundle < 5 MB (aktuell 578 KB; Schätzung neu: +80–120 KB reiner Code/Daten — kein Risiko;
  einziges Risiko-Flag: eine etwaige BigNumber-Lib, s. o.).
- 60 fps Mittelklasse-Laptop; Partikel < 1 ms/Frame (Messung bleibt AC); FPS-Cap/Qualitäts-Presets
  decken die neuen Effekte mit ab (Effekt-Intensität folgt `quality`).
- Draw Calls < 150: Rivalen-Rig ersetzt das Boss-Rig 1:1 (kein Zuwachs); Truhen-UI ist DOM.
- DOM: Popup-Pool ≤ 24 Nodes; Shop-Updates ohne innerHTML-Rebuild im Hot-Path (B7).

### 9.7 Leaderboard-API v2 (fix)

```
POST /api/v2/scores
  Body: { "nickname": string, "maxZone": number, "rebirths": number, "ascensions": number }
  201: { "rank": number }   400 | 429 wie gehabt
  Semantik: Upsert pro Nickname; Update nur wenn maxZone größer.
GET /api/v2/scores/top?limit=50
  200: [{ "nickname": string, "maxZone": number, "rebirths": number,
          "ascensions": number, "updatedAt": string }]
```

D1: neue Tabelle `scores_v2(nickname TEXT UNIQUE, max_zone INTEGER, rebirths INTEGER,
ascensions INTEGER, updated_at TEXT)` + Index auf `max_zone DESC`. Nickname-Regeln,
Rate-Limit, Fakes-basierte Tests: identisch zu M5.

---

## §10 Implementation-Roadmap (M7+, strikte Reihenfolge)

> Jeder Milestone ist eigenständig shippable, endet grün (`lint`/`test`/`build`) und mit
> Update von `README.md` + `DECISIONS.md` (DoD aus Spec §7). Balancing-Werte sind Daten.

### M7 — Hotfix & Fundament (Quick Wins)

- fmt()-Erweiterung inkl. e-Notation-Fallback (§9.3) + Grenzwert-Tests (B1).
- `e.repeat`-Guard für Leertaste (B4).
- `Shop.syncAffordability()` im 0,25-s-Tick — Klassen-Toggle statt Re-Render (B6).
- Offline-Gutschrift bei `visibilitychange → visible` inkl. Welcome-Back ab 60 s (B5).
- Safe-Area: `viewport-fit=cover` + `env()`-Padding (B13b); Pfirsich-Clamp bei Resize (B13c-Teil).
- `util/rng.ts` (mulberry32) als Fundament für M8+ (§9.4).
- README-Drift fixen (B16).
- **Akzeptanzkriterien:**
  1. `fmt(1e21) === '1.00Sx'`, `fmt(1e57)` in e-Notation, `fmt(Infinity) === '∞'` (Tests).
  2. Gehaltene Leertaste erzeugt genau 1 Shake (Test mit `repeat: true`-Event).
  3. Idle ohne Klicks: Upgrade wird binnen ≤ 0,5 s nach Erreichbarkeit als kaufbar markiert
     (Headless-Smoke).
  4. Tab 10 min hidden ⇒ beim Refokus Offline-Ertrag gutgeschrieben (injizierte Clock, Test).
  5. Alle 141 Bestandstests bleiben grün; Bundle-Delta < +10 KB.

### M8 — Klick-Layer 2.0 (der Star zuerst)

- `game/click.ts` (effectiveClick, Krits, On-Beat), `game/combo.ts` (Tiers + Zerfall),
  `game/ability.ts` (Twerk-Ekstase); zentrale Nutzung in `doShake` (behebt B14-Rechenpfad).
- Juice-Paket: Popup-Pool/-Batching, Krit-Optik, Screen-Shake-Tiers, Combo-Partikelskalierung,
  Haptik-Toggle, Ability-Bar, Musik-Layer `setIntensity` (§8.1–8.4, 8.8–8.10).
- Schema **v5-Teil 1** (ability-, rng-, stats-Felder) + Migration + Validator-Tests.
- HUD zeigt effektive Werte inkl. Boost (B14-Anzeige); `hud.update` gedrosselt (B7).
- **Akzeptanzkriterien:**
  1. `effectiveClick` deterministisch getestet (Krit via Seed, Combo-Tiers, Beat-Fenster,
     Ekstase-Fenster — je eigener Test).
  2. Combo zerfällt gestuft (Test: 1,2 s Pause ⇒ −20 %, kein Reset auf 0).
  3. Ekstase: Meter lädt +1/Klick, +2 on-beat; ×10 für 12 s; Zustand überlebt Reload.
  4. 12-cps-Stresstest hält 60 fps; Popup-Nodes ≤ 24 (gemessen, TESTPLAN-Eintrag).
  5. v4-Save lädt verlustfrei in v5 (Migrationstest).

### M9 — Welttournee (endloser Kampf-Layer)

- `game/tour.ts` + Zonen-HUD + Rivalen-Rig (verallgemeinert aus Boss-Code); Kills → Kopfgeld,
  Boss alle 5 Zonen mit 30-s-Timer; Tyrann = Zone-10-Boss inkl. Alt-Unlocks (B3).
- Alter One-Shot-Bossmodus + Boss-Button entfernt; Schema v5-Teil 2 (`tour`).
- Leaderboard v2 (Worker `scores_v2`, Upsert; Client-Metrik `highestZone`) — behebt B8;
  Boss-Zeit-UI wird Archiv/entfernt (DECISIONS.md).
- Bulk-Buy ×1/×10/×Max (B17) — nötig, sobald die Tour Upgrade-Druck erzeugt.
- **Akzeptanzkriterien:**
  1. HP-/Bounty-Formeln getestet (inkl. Monotonie des Verhältnisses).
  2. Sim: Run 1 erreicht Zone ≥ 20 in ≤ 45 min bei 3 cps.
  3. Tyrann-Erstkill (Zone 10) schaltet Skin + `slayer` frei; Bestands-Save mit
     `bossDefeated` startet mit `highestZone ≥ 10`.
  4. Worker-Tests: Upsert ersetzt nur bei größerer Zone; 9 M5-Tests bleiben grün oder werden
     bewusst migriert.
  5. Spiel voll spielbar ohne API (fail-silent, wie M5).

### M10 — Prestige 2.0 (Seelen statt Additiv)

- `game/souls.ts`: BS-Formel, Rebirth-Reset-Scope, `soulMult`; Migration `rebirths → 7·r BS` (B2).
- Rebirth-UI mit Seelen-Vorschau; Offline-Rework (Cap 8 h, Coach-Anteil — B11-Basis).
- `game/ancients.ts`: 9 Ahnen (Daten) + Kauf-UI im neuen 🌀-Tab.
- **Akzeptanzkriterien:**
  1. `soulsFor` superlinear getestet; `soulMult` fließt in `effectiveClick` & Idle.
  2. Reset-Scope-Snapshot-Test (Tabelle §4.5 exakt).
  3. Migrationstest: NG+3-v4-Save ⇒ 21 BS, Einkommen ≥ Altstand (niemand wird schwächer).
  4. Sim-Invarianten 1–3 aus §4.8 grün für Rebirth 1–10.
  5. Ahnen-Caps enforced; ausgegebene Seelen senken `soulMult` (Test).

### M11 — Generatoren, Meilensteine & Coaches

- 3 neue Generatoren (Daten); `milestoneMult` (§4.3.2) + Fortschrittsbalken im Shop.
- Synergie-Upgrade „Muskel-Gedächtnis" (`type: 'syn'`, `deriveStats`-Erweiterung).
- Twerk-Coaches (Himmelsbaum-Vorgriff: bis dahin via Ahnen-Platzhalter „Ekstasius"-Muster —
  Entscheidung dokumentieren) + Offline-Formel final (B11 komplett).
- **Akzeptanzkriterien:**
  1. `milestoneMult(24/25/130/800)` = 1/2/8/32 (Tests).
  2. Bulk-Buy-Formeln exakt (Vergleich gegen iterative Summe, Property-Test).
  3. Klick-Invariante hält trotz Generator-Ausbaus (Sim-Messpunkte).
  4. Shop zeigt Meilenstein-Fortschritt; Kauf aktualisiert in place (kein Full-Rebuild im Hot-Path).

### M12 — Skins als Gear

- `SkinConfig`-Erweiterung + 5 neue Skins (prozedurale Styles), `game/gear.ts`, Set-Boni,
  Level/Sterne + Splitter/Zuckerpfirsich-Ökonomie (§5, B9); Kulissen-Mini-Buffs.
- Schema v5-Teil 3 (`gear`); Shop-Skin-Karten mit Rarität/Buff/Level.
- **Akzeptanzkriterien:**
  1. `gearBonus` pure + getestet; Skin-Wechsel wirkt sofort auf `effectiveClick`.
  2. Mind. 2 Set-Boni per Test; Alt-Saves erhalten Level 1/0 Sterne (Migrationstest).
  3. Zuckerpfirsich reift 1×/24 h, Uhr-Rückstellung erzeugt keine Negativ-Timer (Test).
  4. Jeder Skin zeigt seinen Buff im Shop (kein „nur Kosmetik"-Pfad mehr).

### M13 — Pfirsich-Truhen & Loot

- `game/chests.ts` (Tiers, Tabellen, Pity, Luck), 🔑-Ökonomie, 🎁-Tab, Öffnungs-Animation,
  Drop-Quellen (Bosse/Kills/Combo/Pfirsich/Session-Drip) (§6, B10).
- Mobile-Feinschliff: Bottom-Sheet-Shop (B13a) + Pfirsich-Despawn bei offenem Sheet (B13c-Rest).
- **Akzeptanzkriterien:**
  1. `openChest` deterministisch (Seed-Test) + Verteilungstest 10 000 Ziehungen.
  2. Pity-Grenzfall exakt (11 Nieten ⇒ Treffer bei 12).
  3. Loot-Tabellen im UI einsehbar (Transparenz-AC).
  4. Bottom-Sheet: Figur bleibt beim Shoppen sichtbar (Screenshot-Nachweis TESTPLAN).
  5. Kein Echtgeld-/Netzwerk-Pfad (Code-Review-Checkliste).

### M14 — Aszension & Himmelsbaum

- `HPF`-Formel, Aszensions-Reset, Himmelsbaum-Knoten (Daten) inkl. Beat-Drop/Pfirsichregen,
  Coaches final an den Baum gehängt (§4.5.2).
- **Akzeptanzkriterien:**
  1. Reset-Scope-Test L2 (BS/Ahnen fallen, Gear/Keys bleiben).
  2. `hpfFor` getestet; Vorschau im Dialog.
  3. Sim: erste Aszension im 6–10-h-Fenster (±25 %), Aszensions-Loop beschleunigt Rebirth-Loop
     messbar (Invariante „jede Schicht drückt die Zeitkonstante der unteren").
  4. Beide neuen Fähigkeiten deterministisch getestet.

### M15 — Meta & Retention

- Daily-Streak, 3 Quest-Slots (datums-seedbar), Saison-Gerüst, Statistik-Tab (§7.1–7.3, 7.5);
  Transzendenz-Gerüst hinter Feature-Flag (Formeln drin, UI aus — Tuning nach §11-Entscheid).
- **Akzeptanzkriterien:**
  1. Quests deterministisch aus Datum; Reroll 1×/Tag (Tests).
  2. Streak-Schutz-Logik getestet (inkl. Uhr-Manipulation ⇒ neutral).
  3. Statistik über Rebirth/Aszension korrekt getrennt (lifetime vs. run).
  4. Alles offline; keine neuen Netzwerkpfade außer Leaderboard v2.

### M16 — Endless-QA & Release 2.0

- `simulateEndless` als CI-Gate mit allen Invarianten (§9.5) inkl. Float-Guard (B15).
- Performance-Pass (12-cps-Stress, Partikel-Messung, Lighthouse ≥ 85), TESTPLAN-v2
  (neue Matrix: Tour, Truhen, Prestige-Schichten, Mobile-Sheet), itch-/Pages-Release.
- **Akzeptanzkriterien:**
  1. CI enthält `simulateEndless`-Suite; alle §4.8-Invarianten grün.
  2. Bundle < 5 MB dokumentiert; 60 fps Referenzlauf dokumentiert.
  3. Kompletter dokumentierter Playthrough: frischer Save → 3 Rebirths → 1 Aszension.
  4. `README.md`/`DECISIONS.md`/`TESTPLAN.md` konsistent (kein B16-Rückfall).

---

## §11 Offene Fragen & Risiken (Entscheidungen für den Menschen)

1. **Tuning-Konstanten sind Startwerte.** 1,55 (HP-Wachstum), 1,033 (Wand-Verhältnis), `^1.8`
   (Seelen), `^0.6` (HPF), +10 %/Seele — alles über die Sim kalibrierbar, aber die *Zieltabelle*
   §4.8 (erste Aszension nach 6–10 h?) ist Geschmackssache. → Bitte Pacing-Fenster bestätigen.
2. **Rebirth-Migration:** 7 BS pro Alt-Rebirth ist großzügig geraten. Alternativ 3 (streng) oder
   `soulsFor(10·rebirths)` (sehr großzügig). → Entscheid vor M10.
3. **Boss-Zeit-Leaderboard:** archivieren (read-only Tab) oder komplett entfernen? D1-Daten
   existieren ggf. schon. → Entscheid vor M9.
4. **Transzendenz-Umfang** (L3): ×3^TE + Mythos-Content ist bewusst dünn spezifiziert; volle
   Ausgestaltung erst mit Spieldaten aus L1/L2. Risiko: Wer M15 erreicht, könnte auf eine dünne
   Schicht treffen. → Feature-Flag bis Tuning steht.
5. **Float-Grenze:** Sollte das Transzendenz-Tuning BP > 1e60 pro Run erfordern, wird
   `break_infinity.js` (+~25 KB, große Regression) ein eigener Milestone. Der Sim-Guard (§9.5)
   ist unser Frühwarnsystem. → Bewusst akzeptiertes Restrisiko.
6. **Scope-Risiko M12/M13** (Gear + Loot sind die dicksten Brocken): Beide sind bewusst *nach*
   dem spielbaren Endless-Kern (M8–M10) einsortiert — bei Zeitdruck ist das Spiel ab M10 bereits
   „endlos + klick-zentriert" shippable. → Bestätigen, dass M11–M15 einzeln verschiebbar sind.
7. **Haptik/Autoclicker-Ethik:** Coaches (Auto-Klick) verwässern P1 minimal; Alternative wäre
   „Coaches nur offline". → Geschmacksentscheidung, Default wie spezifiziert.
8. **Saison-Events** sind rein datumsbasiert (kein Server): Zeitzonen-Kanten und „Datum
   zurückstellen"-Cheese sind akzeptiert (Single-Player-Spaß > Wasserdichtheit). → Bestätigen.

---

*Ende der Spec. Nächster Schritt für Agents: M7 starten (Quick Wins), jede nicht-offensichtliche
Entscheidung in `DECISIONS.md` loggen, und `simulatePlaythrough` bei jedem Balancing-Touch
mitziehen, bis `simulateEndless` (M16) übernimmt.*
