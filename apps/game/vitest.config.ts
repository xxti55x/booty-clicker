import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    /**
     * Der Vitest-Default sind 5 s je Test — zu knapp für die Balance-Anker.
     * Die schwersten von ihnen simulieren 24 Spielstunden am Stück
     * (`simulateRunChain(..., 32, 2700)`); lokal dauert das rund 3,4 s, auf dem
     * langsameren CI-Runner mehr als fünf. Das ist ein latenter Flake gewesen,
     * kein kaputter Test: Der Lauf brach mit „Test timed out in 5000ms" ab und
     * riss den Worker gleich mit in einen `onTaskUpdate`-RPC-Timeout.
     *
     * 30 s sind großzügig für die Sims und bleiben trotzdem eine echte Grenze
     * gegen Endlosschleifen — der gesamte Lauf misst rund 45 s.
     */
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.{test,spec}.ts', 'src/main.ts'],
    },
  },
});
