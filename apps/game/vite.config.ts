import { defineConfig } from 'vite';

// Relative base so the production build also works from a file path / itch.io ZIP.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    open: false,
  },
});
