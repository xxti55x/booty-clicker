# DESIGN-REVIEW.md — Grafik-/UI-Audit Booty Clicker v2

**Rolle:** Senior Graphic Designer (extern) · **Datum:** 2026-08-14
**Methode:** Live-Audit des Prod-Builds (`vite preview`, Chromium headless).
Geprüfte Screens: Spielansicht in allen vier Themes (Club/Synth/Beach/Space),
Boss-Arena (Bühne 10), Tabs Crew · Skins · Ruhm · Ziele · Truhen, Tutorial-Coach
(alle 3 Schritte), Desktop 1280×800 und Mobile 390×844. Alle Befunde sind mit
Screenshots belegt; DOM-/Pixel-Messungen, wo angegeben, per Playwright erhoben.
**Nicht geprüft** (außerhalb dieses Audits): Tastatur-Fokusreihenfolge,
Screenreader-Semantik, Farbfehlsichtigkeits-Simulation — als eigenes Audit
empfohlen.

**Schweregrade:** P0 = blockiert das Kernerlebnis · P1 = deutlicher Mangel,
zeitnah beheben · P2 = Politur.

---

## A · Layout & Komposition

### M-01 · Mobile: Die Bühne ist unsichtbar (P0)

**Befund:** Auf 390×844 belegen Zonen-Strip + HUD-Karte die oberen ~27 %, das
Shop-Sheet die unteren ~55 %, dazwischen stapeln Rival-Karte und
Bühnen-Regel-Karte. Vom eigentlichen Spiel — Insel, Charakter, Rivale — sind
nur schmale Farbstreifen an den Rändern sichtbar. Das Produkt versteckt auf
Mobile sein eigenes Zentrum.
**Fix:** (1) HUD-Karte auf Mobile zu einer Zeile kollabieren (Bühne + BP,
Details per Tap). (2) Shop-Sheet default auf Peek-Höhe (~35 %), erst auf
Interaktion voll. (3) Rival-Karte als schmale Pill (Name + HP-Bar, eine Zeile).
(4) Bühnen-Regel-Karte nach 4 s zu einem Icon-Chip einklappen.

### M-02 · Footer-Hinweis wird überlappt und bricht um (P1)

**Befund:** Der Hotkey-Hinweis („Klick / Leertaste = Twerken & Schaden · Crew
macht Idle-DPS") sitzt unten mittig-rechts, bricht zweizeilig um und wird in
jedem geprüften Screen von Rival-Karte bzw. Coach teilverdeckt — ein dauerhaft
angeschnittenes UI-Element wirkt wie ein Rendering-Fehler.
**Fix:** In die freie linke untere Ecke verschieben, einzeilig halten, und nach
der ersten echten Interaktion ausblenden (der Hinweis hat dann seinen Job
getan).

### M-03 · Überladene Stapel-Ecke unten rechts + Coach blockt Eingaben (P1)

**Befund:** Rival-Karte, Tutorial-Coach, Toasts und Boss-Banner konkurrieren
alle um dieselbe rechte untere Ecke. Der Coach überdeckt dabei die Kampf-Karte
(HP-Bar halb verdeckt) und fängt nachweislich Pointer-Events über der Bühne ab
(per Playwright gemessen: Klicks auf Elemente hinter dem Coach werden vom
Coach-Container abgefangen).
**Fix:** Coach in die linke untere Ecke (dort ist durchgehend Leerraum);
Toast-Anker von der Rival-Karte entkoppeln (eigene Spalte oben rechts unter dem
Panel-Toggle).

### M-04 · Leerraum im linken Panel (P2)

**Befund:** Im Crew-Tab bleibt bei 800 px Höhe das untere ~Drittel des Panels
leer, während rechts alles stapelt (M-03) — unausgewogene Dichte-Verteilung.
**Fix:** Panel-Footer mit Sekundärnutzen: aktive Buffs, nächstes Ziel, letzte
Drops.

---

## B · Komponenten & Hierarchie

### M-05 · Kaufmengen-Umschalter sieht aus wie drei Primär-CTAs (P1)

**Befund:** ×1 / ×10 / Max sind drei volle, große Gold-Buttons — die visuell
schwersten Elemente des Panels, obwohl sie nur ein Modus-Schalter sind. Der
Selected-State (Orange vs. Gelb) ist auf einen Blick kaum zu unterscheiden.
**Fix:** Als Segmented Control umbauen: EINE flache Leiste, aktiver Slot mit
klar abgesetztem Fill + Ink-Kontur, halbe Höhe der jetzigen Buttons.

### M-06 · Skins-Karten: Informationsüberladung ohne Hierarchie (P1)

**Befund:** Jede Karte trägt 9+ Elemente: Thumbnail, Rarity-Badge, Effektzeilen,
Level, Sterne-Reihe, drei Schmiede-Lock-Chips (Lv 10/25/32), fünf
Pfad-Knoten-Pills, Pfad-Statuszeile, CTA. Die Lock-Chips und die Knoten-Pills
sind zwei fast identische Chip-Reihen direkt übereinander — ohne Label-Bindung
sind sie verwechselbar. Nichts führt das Auge; jede Zeile schreit gleich laut.
**Fix:** (1) Drei Ebenen definieren: Identität (Thumbnail, Name, Rarity) →
Zustand (Level, Sterne, CTA) → Fortschrittssysteme (Schmiede, Pfad) als
visuell gruppierte, beschriftete Blöcke mit Trennlinie. (2) Schmiede-Locks zu
EINER Zeile verdichten („🔒 Schmiede: nächster Slot ab Lv 10"). (3) Erwägung:
Fortschrittssysteme hinter ein Disclosure („Details") klappen.

### M-07 · Skin-Thumbnails: das Produkt ist am schlechtesten sichtbar (P2)

**Befund:** Die Skin-Vorschaubilder sind klein und dunkel vor dunklem
Kartenkopf — ausgerechnet der Skin selbst (das, was die Karte verkauft) hat den
geringsten Kontrast auf der Karte.
**Fix:** Spotlight-Gradient (Rarity-Farbe, 15–20 % Alpha) hinter die Figur,
Thumbnail 20 % größer.

### M-08 · Roter Disabled-Button im Ruhm-Tab (P1)

**Befund:** Der inaktive Aszensions-Button ist eine große ROTE Fläche („Noch
kein neuer Ruhm"). Rot ist im restlichen UI Signal-/Gefahrfarbe (Boss-Timer
„urgent") — hier kommuniziert es fälschlich einen Fehlerzustand statt „noch
nicht bereit".
**Fix:** Neutraler Disabled-Style (gedämpftes Braun, reduzierte Kontur) plus
Fortschritts-Mikrocopy: „Ruhm ab Bühne 10 — tiefste Bühne dieser Tour: 23".

### M-09 · Gebietsherrschaft: leere Mikro-Segmente + Mikrotext (P2)

**Befund:** Die Ruf-Leisten bestehen aus 10 winzigen grauen Segmenten; bei
0 Ruf wirkt die leere Kästchenreihe wie ein kaputtes Element. Die Nebentexte
(„noch 250 Ruf bis Stufe 1") liegen sichtbar unter komfortablem Lesekontrast.
**Fix:** Eine durchgehende Leiste mit Stufen-Ticks statt 10 Einzelkästen;
Nebentexte auf den helleren Sekundärton (siehe M-11).

### M-10 · Zonen-Strip: vier Info-Ebenen auf 46 px (P2)

**Befund:** Jeder Slot trägt Mod-Icon, Insel-SVG, Nummer und Sterne-Pips auf
46 px Breite. Die Pips (gefüllt vs. leer) sind auf Desktop grenzwertig, auf
Mobile nicht mehr lesbar.
**Fix:** Pips 30 % größer und mit stärkerem Gefüllt/Leer-Kontrast; alternativ
Kurzform „2★". Mod-Icon nur auf der aktiven Bühne einblenden.

---

## C · Farbe, Kontrast, Typografie

### M-11 · Sekundärtexte unter Lesekontrast (P1)

**Befund:** Wiederkehrendes Muster: der gedämpfte Sekundärton auf dunklem Braun
unterschreitet WCAG AA (4.5:1) an mehreren Stellen — „DPS … · Klick …" in der
HUD-Karte, Set-Boni-Zeile im Skins-Tab, „Schmiede ab Lv 10", Statistik-Labels,
Pfad-Statuszeilen.
**Fix:** Den Sekundär-Token EINMAL zentral aufhellen (Ziel ≥ 4.5:1 auf dem
dunkelsten verwendeten Karten-Braun) statt Einzelstellen zu flicken.

### M-12 · Disabled-Buttons fast unsichtbar (P2)

**Befund:** Outline-Buttons im Disabled-Zustand („Erreiche Bühne 58", „Neu
würfeln (1×/Tag)") fallen fast vollständig in den Hintergrund. Disabled darf
zurücktreten, muss aber als Element erkennbar bleiben (≥ 3:1 für die Kontur).
**Fix:** Disabled-Kontur und -Label auf mindestens 3:1 anheben.

### M-13 · Quest-Fortschrittsbalken bei 0 % unsichtbar (P2)

**Befund:** Der leere Balken-Track in den Tages-Quests ist vom Kartengrund
kaum zu trennen — bei 0 / 1 sieht die Karte aus, als fehle das Element.
**Fix:** Track mit sichtbarer Innenkante oder ~8 % Aufhellung gegen die Karte.

---

## D · Benennung & Informationsarchitektur

### M-14 · Panel-Toggle heißt „Crew", öffnet aber alles (P2)

**Befund:** Der Button oben rechts ist mit „Crew" beschriftet, öffnet aber das
gesamte Panel mit neun Systemen (Crew, Skins, Ruhm, Truhen, …). Wer Truhen
sucht, klickt nicht auf „Crew".
**Fix:** Label „Menü" (oder Icon-only mit Badge bei ungeöffneten Truhen /
fertigen Quests).

### M-15 · „Mehr"-Tab versteckt Kernsysteme (P2)

**Befund:** Die Top-Leiste zeigt Crew · Skins · Ruhm · Ziele · Mehr; unter
„Mehr" liegen u. a. die Truhen — ein Kern-Loop des Loot-Systems (jede
Boss-Arena zahlt zwei Truhen) hinter einem Sammel-Tab ohne Hinweis auf Inhalt.
**Fix:** Entweder Truhen in die Top-5 (Ziele → Mehr) oder ein Zähler-Badge auf
„Mehr", solange ungeöffnete Truhen liegen.

---

## E · Szene & Art

### M-16 · Beach: Mini-Inseln schweben vor dem gemalten Wasser (P2)

**Befund:** Die kleinen 3D-Archipel-Inseln hängen optisch VOR dem gemalten
Wasserband in der Luft (v. a. die Mini-Insel links); die gemalte Horizontlinie
schneidet sie, statt sie zu tragen.
**Fix:** Die Mini-Inseln 1–2 Einheiten absenken, sodass ihre Basis die gemalte
Wasserlinie berührt.

### M-17 · Club: Lautsprecher-Turm hart vom Frame-Rand geschnitten (P2)

**Befund:** Der Boxen-Turm oben links wird vom Bildrand angeschnitten; auf
1280 px wirkt das wie ein Versehen, nicht wie Framing.
**Fix:** Turm 5–8 % nach innen rücken oder bewusst weiter anschneiden (> 40 %),
damit der Anschnitt als Absicht lesbar wird.

### M-18 · Synth: Panorama-Grate noch einen Tick zu leise (P2)

**Befund:** Nach der Palette-Aufhellung sind die Chrom-Berge lesbar, aber die
Neon-Grate (Cyan/Magenta) gehen im Grid-Pink noch teilweise unter.
**Fix:** Nur die Grat-Strokes ~20 % heller/gesättigter; Flächen unverändert
(A/B-Screenshot vor Übernahme).

---

---

# Senior-Developer-Review

**Rolle:** Senior Developer (Maintainer) · **Datum:** 2026-08-14
Bewertung jedes Befunds: ✅ Akzeptiert · ⚠️ Teilweise akzeptiert · ❌ Abgelehnt —
mit Begründung gegen Code-Realität, Messungen und dokumentierte
Design-Entscheidungen (DECISIONS.md).

| #    | Verdikt | Kommentar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M-01 | ✅      | Berechtigt und der schwerste Punkt der Liste. Die Mobile-Layout-Schulden sind real: die Karten wurden desktop-first gebaut und einzeln nach unten „gestapelt" (siehe die `calc(55vh)`-Sonderregel für die Kampf-Karte in style.css — ein Symptom genau dieses Problems). Umsetzung als eigenes Paket in der vorgeschlagenen Reihenfolge (1)→(4); die Peek-Höhe des Sheets muss gegen die Tap-Ziele der Crew-Kauf-Buttons getestet werden.                                                                                         |
| M-02 | ✅      | Billiger CSS-Fix, klarer Gewinn. „Nach erster Interaktion ausblenden" ist sogar schon halb vorhanden (der Coach kennt Interaktions-Schritte) — der Hinweis hängt sich an denselben Zustand.                                                                                                                                                                                                                                                                                                                                       |
| M-03 | ✅      | Der Pointer-Block ist gemessen und hat uns im eigenen Headless-Test bereits einen Klick abgefangen — das ist kein Stil-, sondern ein Funktionsmangel. Coach wandert nach links unten; Toast-Anker entkoppeln wir dabei gleich mit, das ist eine Positions-Konstante.                                                                                                                                                                                                                                                              |
| M-04 | ❌      | Der Leerraum ist Atemraum, kein Defekt. Das Panel füllt sich progressionsgetrieben von selbst: acht Crew-Mitglieder plus Fähigkeits-Chips füllen die Spalte ab Mittelspiel vollständig. Ein Panel-Footer wäre ein neues UI-System (Datenquellen, Update-Pfad, Change-Detection) für eine Fläche, die nur in der ersten Stunde leer ist. Kosten/Nutzen spricht dagegen.                                                                                                                                                            |
| M-05 | ✅      | Korrekt beobachtet — der Umschalter ist visuell schwerer als die eigentlichen Kauf-CTAs, das invertiert die Hierarchie. Segmented Control ist reine CSS-/Markup-Arbeit am bestehenden `data-mult`-Mechanismus, kein Logik-Risiko.                                                                                                                                                                                                                                                                                                 |
| M-06 | ⚠️      | (1) und (2) akzeptiert: Gruppierung mit beschrifteten Blöcken + die Lock-Verdichtung auf „nächster Slot ab Lv X" sind reine Render-Änderungen in `gear-panel.ts` und beheben die Verwechselbarkeit der zwei Chip-Reihen. (3) Disclosure ABGELEHNT: ein Idle-Game lebt davon, dass Fortschrittsziele permanent sichtbar ticken — ein Aufklapp-Klick pro Karte × 10 Skins ist genau die Reibung, die das Genre nicht verträgt. Sichtbar lassen, aber leiser (kleinere Type, gedämpfter Ton — im Rahmen von M-11 ohnehin angefasst). |
| M-07 | ✅      | Guter Punkt: die Karte verkauft den Skin, zeigt ihn aber am schlechtesten. Rarity-Spotlight ist ein Gradient im bestehenden Thumbnail-Renderer — eine Zeile Canvas, kein neues Asset.                                                                                                                                                                                                                                                                                                                                             |
| M-08 | ✅      | Eindeutig: Rot ist bei uns die Boss-Timer-„urgent"-Farbe; sie für „noch nicht verfügbar" zu verwenden, unterläuft die eigene Signalsprache. Neutraler Disabled-Style + die vorgeschlagene Mikrocopy (die Zahl liegt mit `runMaxZone` bereits im State).                                                                                                                                                                                                                                                                           |
| M-09 | ⚠️      | Kontrast der Nebentexte: akzeptiert (fällt unter den zentralen Token-Fix M-11). Die 10 Segmente bleiben jedoch: ein Segment IST eine Ruf-Stufe — die Stufen sind das Produkt (Titel je Stufe, Trophäe ab 3), eine durchgehende Leiste würde genau diese Information wegglätten. Stattdessen: Segmente höher + sichtbarer Leer-Zustand (Kontur statt grauer Füllung), damit „leer" nicht „kaputt" liest.                                                                                                                           |
| M-10 | ⚠️      | Pips vergrößern/Kurzform: akzeptiert. „Mod-Icon nur auf aktiver Bühne": ABGELEHNT — das Icon ist die einzige Vorschau, WELCHE Hausregel auf einer Farm-Bühne liegt, bevor man hinreist; genau dafür wurde es eingeführt (A1). Auf Mobile gibt es kein Hover als Ersatz. Das Icon bleibt, bekommt aber im Zuge der Pip-Vergrößerung mehr Abstand zur Nummer.                                                                                                                                                                       |
| M-11 | ✅      | Akzeptiert, und explizit als TOKEN-Fix (eine Variable, alle Stellen) statt Einzelflicken — dieselbe Disziplin wie bei allen Balance-Konstanten: eine Quelle. Ziel 4.5:1 gegen das dunkelste Karten-Braun, einmal nachgemessen.                                                                                                                                                                                                                                                                                                    |
| M-12 | ✅      | Ja — disabled heißt „nicht jetzt", nicht „nicht existent". 3:1 für Kontur/Label ist der richtige Rahmen.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| M-13 | ✅      | Mit M-12 im selben CSS-Pass erledigt (gleiche Ursache: zu dunkle Ruhezustände auf dunklem Grund).                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| M-14 | ⚠️      | Umbenennung akzeptiert, aber nicht zu „Menü" (generisch, riecht nach Hamburger-Resignation), sondern Icon + dynamisches Label des aktiven Tabs — der Button sagt dann immer, was er öffnet. Badge-Logik für Truhen/Quests kommt mit M-15.                                                                                                                                                                                                                                                                                         |
| M-15 | ⚠️      | Umsortierung ABGELEHNT: die Top-5 sind progressionsgetrieben sortiert (Crew und Skins sind die ersten Systeme, die ein neuer Spieler braucht; Truhen zünden erst mit den ersten Schlüsseln), und Tab-Muskelgedächtnis ist bei einem Idle-Game, das man hunderte Male öffnet, real. Das Badge auf „Mehr" bei ungeöffneten Truhen: akzeptiert — es löst das eigentliche Problem (Auffindbarkeit bei Anlass) ohne die Ordnung zu kippen.                                                                                             |
| M-16 | ✅      | Berechtigt; die Mini-Inseln stammen aus der Zeit VOR dem gemalten Wasserband und wurden nie dagegen kalibriert. Zwei Positions-Konstanten in `backgrounds.ts`, Screenshot zur Abnahme — machen wir.                                                                                                                                                                                                                                                                                                                               |
| M-17 | ❌      | Der Anschnitt ist Absicht: der Turm ist ein Repoussoir — ein angeschnittenes Vordergrund-Element, das Tiefe erzeugt und den Blick zur Bühne rahmt (klassische Diorama-Bildsprache, konsistent in allen vier Themes vorhanden). Ihn „nach innen zu rücken" würde ein totes Objekt in der Bildmitte parken; ihn stärker anzuschneiden, kollidiert mit dem kalibrierten Kamera-Keil (der Turm sitzt exakt an dessen Rand — vermessen, siehe backgrounds.ts-Modulkopf). Bleibt wie er ist.                                            |
| M-18 | ⚠️      | Nur unter Messvorbehalt: Die Synth-Palette wurde in diesem Zyklus bereits einmal aufgehellt, per Screenshot abgenommen. Ein weiterer Feinschliff NUR an den Grat-Strokes ist okay, aber ausschließlich mit A/B-Screenshot-Vergleich — wir drehen nicht zweimal blind an derselben Schraube. Niedrigste Priorität der akzeptierten Punkte.                                                                                                                                                                                         |

**Zusammenfassung:** 10 × ✅ · 5 × ⚠️ (Kern akzeptiert, Detail begründet
abgelehnt) · 2 × ❌ (M-04 Leerraum, M-17 Anschnitt). Umsetzungsreihenfolge nach
Wirkung: **M-01 (Mobile)** → M-03/M-02 (Stapel-Ecke + Coach) → M-11/M-12/M-13
(ein Kontrast-Token-Pass) → M-05/M-08 (Komponenten) → M-06/M-07 (Skins-Karten)
→ M-09/M-10/M-14/M-15-Badge → M-16 → M-18. Kein Punkt berührt Spiellogik,
Save-Schema oder den Physik-Kontrakt; alles ist CSS/Markup/Panel-Renderer plus
zwei Szenen-Konstanten.
