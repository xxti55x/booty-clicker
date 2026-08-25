import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Die Konfiguration des UNIT-Laufs (`npm test`).
 *
 * Die schweren Simulations-Anker (`src/game/sim*.test.ts`) laufen hier bewusst
 * NICHT mit; sie haben eine eigene Konfiguration und einen eigenen CI-Schritt
 * (`npm run test:sim`). Der Grund steht dort — er ist kein Geschmacksurteil,
 * sondern eine gemessene Notwendigkeit.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: [...configDefaults.exclude, 'src/game/sim*.test.ts'],
    /**
     * Der Vitest-Default sind 5 s je Test — zu knapp für die Balance-Anker.
     * Die schwersten von ihnen simulieren 24 Spielstunden am Stück
     * (`simulateRunChain(..., 32, 2700)`); lokal dauert das rund 3,4 s, auf dem
     * langsameren CI-Runner mehr als fünf. Das ist ein latenter Flake gewesen,
     * kein kaputter Test: Der Lauf brach mit „Test timed out in 5000ms" ab und
     * riss den Worker gleich mit in einen `onTaskUpdate`-RPC-Timeout.
     *
     * 30 s sind großzügig für die Sims und bleiben trotzdem eine echte Grenze
     * gegen Endlosschleifen.
     */
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.{test,spec}.ts', 'src/main.ts'],
    },
  },
});
