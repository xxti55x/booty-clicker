import { defineConfig } from 'vitest/config';

/**
 * Die Konfiguration des SIMULATIONS-Laufs (`npm run test:sim`).
 *
 * **Warum die Sims einen eigenen Lauf brauchen.** Vier Dateien
 * (`sim`, `sim-crew`, `sim-loot`, `sim-meta`) tragen 109 der 114 Sekunden
 * Testzeit — 96 %. Zusammen mit den übrigen 73 Dateien in EINEM Lauf sättigen
 * sie alle Kerne des CI-Runners so vollständig, dass der Vitest-Hauptprozess
 * keine Rechenzeit mehr für seine RPC-Antworten bekommt. birpc gibt ihm dafür
 * 60 Sekunden; reißt die Frist, bricht der ganze Lauf mit
 * „[vitest-worker]: Timeout calling \"onTaskUpdate\"" ab — bei 1324 grünen
 * Tests. Genau so ist die CI gefallen, und genau so ließ es sich lokal
 * nachstellen (vier Fremdlasten + `npm test` ⇒ derselbe Fehler).
 *
 * Getrennt gefahren bleibt der Unit-Lauf bei rund fünf Sekunden Testzeit, und
 * dieser Lauf hier hat den Hauptprozess für sich.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/game/sim*.test.ts'],
    /**
     * Ein Kern bleibt dem Hauptprozess.
     *
     * Mit einem Worker je Kern rechnen die Sims den Prozess tot, der ihre
     * Task-Updates entgegennehmen soll — dieselbe Sättigung, nur in kleinerem
     * Rahmen. Zwei Worker kosten ein paar Sekunden Wanduhr und nehmen dem
     * Fehler die Grundlage.
     */
    maxWorkers: 2,
    minWorkers: 1,
    /** Wie im Unit-Lauf: 30 s sind großzügig für die Sims und trotzdem eine Grenze. */
    testTimeout: 30_000,
  },
});
