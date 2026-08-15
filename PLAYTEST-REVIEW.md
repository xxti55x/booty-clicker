# PLAYTEST-REVIEW.md — Beta-Testbericht Booty Clicker v2

**Rolle:** Beta-Tester (extern) · **Datum:** 2026-08-15 · **Build:** Prod
(`vite preview`, Commit-Stand main/bc5c680)
**Methode:** Drei echte Spielsitzungen (headless Chromium, gedrosselte
Software-GPU — Zeit-Beobachtungen entsprechend vorsichtig gelesen):
**A** Frischstart als sehr aktiver Spieler (~15 Klicks/s, gierige Käufe),
**B** Boss-Arena-Vorstoß mit starker Crew + Timeout-Pfad mit schwacher Crew,
**C** Midgame (Bühne 23): Boss-Farmen, Truhe öffnen, Skins, Aszension, Konami.
Alle Aussagen sind gespielte Beobachtungen, keine Code-Lektüre; Zahlen aus den
Session-Logs. Gefundene Fehler stehen separat in **BUGS.md**.

---

## Protokoll-Auszug (was tatsächlich passierte)

- **A (Frischstart):** Erster Crew-Kauf nach ~3 Loop-Sekunden, Bühne 2 nach ~5,
  Bühne 3 nach ~8, erste Crew-Fähigkeit nach ~31; nach ~150 Loop-Sekunden stand
  ich auf **Bühne 14** — das erste Boss-Gate (10) fiel einem Dauerklicker im
  Vorbeigehen.
- **B (Arena):** 9/10 → 10/10 → Schnitt auf die Arena: Banner „👑 Bass-Baron —
  🔦 Nur Klicks!", ⏱ 30 s, Gold-HP-Bar. Boss fiel, Bühne 11, sauberer
  Sieg-Toast. Schwache Crew: Uhr läuft ab → Rückwurf, „👑 Zum Boss reisen"
  bringt einen mit einem Klick zurück in die Arena (Guard verhindert
  Doppel-Klicks im laufenden Kampf).
- **C (Midgame):** Rückreise zur Arena 20 (Synth: „🛡 Im Takt treffen!"),
  Truhen-Badge „1" am Tab, Goldtruhe für 1 🔑 geöffnet (Erfolg + Sternenstaub),
  Robo-Twerk ausgerüstet (Charakterwechsel sofort, kein Doppel-Körper),
  Aszension mit Zwei-Klick-Bestätigung → Bühne 1, +10 Seelen (+100 %),
  Konami-Code → Zeremonie, Erfolg „Cheat-Code der Ahnen", +240 BP
  (zonenskaliert — auf Bühne 1 bewusst klein).

---

## 👍 Gefällt mir

1. **Die ersten 60 Sekunden sitzen.** Klick → Zahl → Kill → Kauf → nächste
   Bühne, ohne Leerlauf; der erste Kauf kommt, bevor man sich langweilen kann,
   und der Coach erklärt in drei Karten genau genug.
2. **Die Boss-Arena ist ein MOMENT.** Der Schnitt von der Welle in die Arena —
   Banner mit Namen, Gimmick-Ansage, tickende Uhr, goldene HP-Bar — fühlt sich
   nach Ereignis an, nicht nach „elfter Rivale mit mehr HP". Dass jedes Gate
   das Finale seines Themes ist, gibt der Tour einen Takt.
3. **Scheitern ist fair verpackt.** Timeout wirft einen EINE Bühne zurück, der
   Toast sagt wörtlich, was zu tun ist (farmen, kaufen, wiederkommen), und der
   „Zum Boss reisen"-Knopf macht den Rückweg zu einem Klick. Kein Soft-Lock,
   kein Suchen.
4. **Gimmick-Lesbarkeit.** Das Kurz-Label klebt dauerhaft an der HP-Bar
   („🛡 Im Takt treffen!") — ich wusste im Kampf immer, WARUM nichts durchkam.
5. **Fortschritt regnet sichtbar.** Erfolge, Sternenstaub-Gutschriften,
   Truhen-Badge am Tab, Sieg-Toasts mit konkreten Zahlen — jede Aktion quittiert.
6. **Aszension mit Netz.** Der Zwei-Klick-„Sicher?"-Ablauf hat mich einmal vor
   einem Fehlklick gerettet; danach ist der Neustart mit +100 % spürbar anders.
7. **Kein einziger Absturz** in drei Sitzungen normalen Spielens (die
   Konsolen-Funde stehen in BUGS.md).
8. **Details, die man erst beim Spielen merkt:** ganze Crew-Karte als
   Kauffläche, Münzen-Fly zum Konto, Konami-Zeremonie, Zonen-Strip als echte
   Reise-Navigation mit Stern-Pips.

## 👎 Gefällt mir nicht

1. **Die Ekstase-Ladung ist stumm.** Ich habe in zwei Sitzungen hunderte Male
   geklickt und wusste nie, wie weit die Leiste ist oder was sie füllt — kein
   Zahlenwert, kein „x/y", kein Tooltip. Als der Balken endlich voll war
   (Session S2), hatte ich aufgehört, darauf zu achten. Vorschlag: Ladung als
   Prozent/Tooltip + kurzer Glow beim Voll-Werden.
2. **Combo ×897 bedeutet … nichts?** Die Stack-Zahl läuft ungebremst hoch
   („Combo ×897 · Inferno"), aber der Schadens-Multiplikator ist längst
   gedeckelt. Die Zahl verspricht Skalierung, die es nicht gibt. Entweder die
   Anzeige am Cap einfrieren („×max") oder den Bonus dahinter zeigen.
3. **Gesperrte Käufe erklären sich nicht.** Der Skin-Level-Knopf zeigt grau
   „⬆ 10 🧩" — dass mir Splitter fehlen (und woher sie kommen), muss man
   raten. Ein Tooltip „dir fehlen 7 🧩 — aus Truhen & Boss-Arenen" würde reichen.
4. **„Noch kein neuer Ruhm — stoß tiefer vor" sagt nicht, WIE tief.** Mit 20
   Lebenszeit-Seelen und Bühne 23 blieb der Knopf zu Recht gesperrt — aber die
   Mechanik (neue Seelen erst jenseits der bisherigen Lebenszeit-Ernte) ist
   unsichtbar. Zeigt die Zielbühne: „Neue Seelen ab Bühne 26".
5. **Boss-Farmen ist unsichtbar motiviert.** Die Rückreise in eine alte Arena
   zahlt Ruf + Pfad, aber keine Truhen/Relikte (Highwater) — das ist gutes
   Design, wird aber nirgends gesagt; ich habe es nur durch Ausprobieren
   gemerkt.

## 😡 Frust-Momente („hated")

1. **Das Schild-Gate als reiner Klicker.** An Arena 20 kloppte ich ~18 Sekunden
   ungetaktet gegen „Im Takt treffen!" und sah die HP-Bar kaum wandern
   (26.8K/247.6K). Der Twist ist fair UND erklärt — aber ohne hörbaren/fühlbaren
   Beat-Anker im Kampf (Metronom-Blitz an der HP-Bar?) fühlt sich das Fenster
   wie Glückssache an. Genau hier braucht der Kampf das stärkste Taktsignal
   des Spiels, nicht das schwächste.
2. **Konsolen-Flut ab Sekunde 1** (Shader-Fehler, siehe BUGS B-01): als Tester
   mit offenen DevTools begräbt sie alles andere.

## Fazit

Der Kern-Loop trägt: klicken fühlt sich gut an, die Arenen geben dem Endless
einen Rhythmus, und das Spiel quittiert jeden Fortschritt. Die Schwächen sind
fast alle **Erklärbarkeits**-Lücken (Ekstase, Combo-Cap, Ruhm-Schwelle,
gesperrte Käufe) — die Systeme sind gut, sie reden nur nicht. Mit den Funden
aus BUGS.md und einem Feedback-Pass auf die vier stummen Stellen ist das ein
Browser-Idle, das ich freiwillig weiterspielen würde. **8 / 10.**
