# BUGS.md — Stresstest-Befunde Booty Clicker v2

**Rolle:** Beta-Tester (extern) · **Datum:** 2026-08-15 · **Build:** Prod
(main/bc5c680) · **Methode:** Playwright-Stresstest gegen den Preview-Build:
Klick-Sturm (450 Inputs), Max-Kauf-Spam (40×), Tab-Spam (40×),
Skin-Equip-Toggle (20×), Reise-Spam in/aus der Boss-Arena (24×),
Sheet-/Resize-Spam, Save-Fuzzing (8 Varianten), Konami, Heap-/fps-Messung.
Jede Sitzung lief mit `pageerror`-/Console-Error-Sammlern; jeder Befund hier
ist reproduziert, nichts ist aus dem Code „vermutet".

**Schwere:** P1 = gehört zeitnah gefixt · P2 = real, aber eingegrenzt ·
P3 = kosmetisch/irreführend.

---

## B-01 · Ink-Outline-Shader kompiliert nicht auf Materialien mit Nebel (P1)

**Symptom:** Ab dem ersten Frame flutet die Konsole mit
`THREE.WebGLProgram: Shader Error … 'mvPosition': undeclared identifier` in
`vFogDepth = -mvPosition.z` (MeshBasicMaterial, `USE_FOG`). Die betroffenen
Ink-Hüllen rendern nicht (fehlende Konturen), und die Fehlermeldung wiederholt
sich pro betroffenem Programm.
**Repro:** Frischstart im Club-Theme, DevTools-Konsole offen — Fehler erscheinen
sofort und bei jedem Kulissen-Wechsel erneut.
**Ursache (verifiziert in `engine/materials.ts`):** Die Outline-Injektion
ersetzt den kompletten `#include <project_vertex>`-Chunk durch eigenen Code mit
`inkMv` — und deklariert die Standard-Variable `mvPosition` nicht mehr. Threes
`fog_vertex`-Chunk (läuft bei `fog: true` direkt danach) referenziert genau
diese Variable → Compile-Fehler. Getarnt blieb das, weil die meisten
Szenerie-Hüllen `noFog`-Materialien klonen — es trifft nur Outlines auf
Materialien, die den Nebel behalten.
**Fix-Vorschlag:** Im Ersatz-Chunk `vec4 mvPosition = inkMv;` ergänzen (oder die
Variable gleich `mvPosition` nennen) — eine Zeile, stellt die Chunk-Verträge
von three.js wieder her.

## B-02 · Spieluhr verliert Zeit unter 20 fps (dt-Klemme ohne Aufholen) (P2)

**Symptom:** Auf einem langsamen Gerät (gemessen headless mit Software-GPU,
~2 fps) vergehen für 32 reale Sekunden nur ~4 Sekunden Boss-Uhr; Ekstase-Ladung,
Combo-Fenster und Idle-DPS laufen im selben Maß in Zeitlupe. Auch der
0.25-s-UI-Tick (HUD/Toasts/Panels) hängt an der Spieluhr und aktualisiert dann
nur noch alle paar Realsekunden — daher wirken Kontostand/HP kurzzeitig
„eingefroren", obwohl das Spiel korrekt rechnet.
**Repro:** Arena mit schwacher Crew laden, Framerate drosseln (Headless-
SwiftShader oder CPU-Throttle ×20), 30 s warten — die Uhr steht bei ~26 s.
**Ursache (verifiziert):** `const dt = Math.min(clock.getDelta(), 0.05)` in
`main.ts` — ein 500-ms-Frame zählt als 50 ms, die Restzeit verfällt ersatzlos.
**Einordnung:** Auf 60-fps-Geräten unsichtbar; auf Low-End-Hardware und in
gedrosselten Hintergrund-Tabs realer Spieler-VORTEIL beim Boss-Timer (Uhr läuft
real länger) und NACHTEIL beim Idle-Einkommen — beides inkonsistent zur
Offline-Rechnung, die nach Wanduhr zahlt.
**Fix-Vorschlag:** Verlorene Zeit akkumulieren und in gedeckelten Sub-Steps
(z. B. max. 4 × 50 ms je Frame) nachziehen — mindestens für Boss-Uhr und
Ability-Timer; alternativ diese beiden auf Wanduhr-Basis rechnen.

## B-03 · Absurde Bühnen-Tiefe im Save wirft eine unbehandelte Exception (P2)

**Symptom:** Ein Save mit `zone/runMaxZone/lifetimeMaxZone = 1e9` erzeugt beim
Laden `Uncaught RangeError: Set maximum size exceeded`; das Spiel fällt danach
auf einen kompletten Frischstart zurück (Bühne 1, Gold 0) — der Save wird
verworfen, obwohl er reparierbar gewesen wäre (Werte klemmen statt crashen).
**Repro:** `localStorage.bootyclicker.ch` mit o. g. Zonen setzen, laden.
**Vermutete Ursache:** `bossFirstKillZones` (Gear-Unlock-Kontext) baut ein Set
über ALLE Gates bis zur tiefsten Bühne (`for z = 10; z < deepest; z += 10`) —
bei 1e9 sind das 1e8 Einträge, weit über dem V8-Set-Limit. Die übrigen
Fuzzing-Fälle (Müll-JSON, NaN, negative Werte, 1e308-Gold) fallen dagegen
sauber zurück.
**Fix-Vorschlag:** Das Set nur über die tatsächlich RELEVANTEN Zonen bauen (die
Boss-Unlock-Zonen aus `SKIN_UNLOCKS` sind endlich: 10 und 50) — oder die Tiefe
in der Save-Reparatur auf ein sinnvolles Maximum klemmen.

## B-04 · Combo-Anzeige zählt weit über den wirksamen Deckel hinaus (P3)

**Symptom:** Nach dem Klick-Sturm stand „Combo ×897 · Inferno" im HUD — der
Schadens-Multiplikator ist aber weit vorher gedeckelt. Die Zahl suggeriert
Skalierung, die nicht existiert (und wächst beliebig weiter).
**Repro:** ~450 schnelle Inputs am Stück, Combo-Zeile beobachten.
**Fix-Vorschlag:** Stacks in der ANZEIGE am wirksamen Cap einfrieren
(„Combo ×max · Inferno") oder statt der Stack-Zahl den echten Bonus zeigen.

---

## Geprüft und sauber (keine Befunde)

| Test                                         | Ergebnis                                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| Skin-Equip-Toggle ×20 (Duplikat-Regression)  | genau EIN Charakter im Bild, kein Fehler                                         |
| Max-Kauf-Spam ×40                            | kein Negativ-Gold, keine Doppelkäufe, keine Exception                            |
| Reise-Spam Arena↔Farm ×24                    | endet konsistent (Arena, korrekter Boss, Uhr frisch), kein Zombie-Zustand        |
| Tab-Spam ×40 + Sheet-Griff ×16 + Resize ×8   | kein Layout-Bruch, keine Exception                                               |
| Save-Fuzzing: Müll-String / falsches Schema  | stiller Frischstart, kein Fehler                                                 |
| Save-Fuzzing: negatives Gold / NaN-Zone      | stiller Frischstart, kein Fehler                                                 |
| Save-Fuzzing: Gold 1e308                     | lädt, HUD formatiert „1.00e308", keine Exception                                 |
| Save-Fuzzing: `lastSeen` +1 Jahr / seit 1970 | lädt ohne Fehler (Offline-Gutschrift wartet korrekt im „Einsacken"-Dialog)       |
| Heap über Klick-/UI-Spam                     | 11.2 → 10.4 MB (kein Leak)                                                       |
| Konami-Code                                  | Zeremonie + Erfolg + zonenskalierter Jackpot, idempotent                         |
| Aszensions-Reset                             | Bühne 1, Seelen gutgeschrieben, Konami-Jackpot bewies Konto = 0 (kein Rest-Gold) |

**Hinweis zur Messumgebung:** Headless-SwiftShader lief mit ~1.7 fps — alle
Zeit-Anomalien wurden gegen B-02 geprüft, bevor sie als eigene Bugs gelistet
wurden (zwei Verdachtsfälle — „Gold-Anzeige klemmt nach Aszension/Kauf" —
lösten sich dabei als Folge der Zeitlupe + UI-Tick-Kopplung auf und stehen
deshalb NICHT als eigene Bugs in dieser Liste; sie verschwinden mit dem
B-02-Fix).
