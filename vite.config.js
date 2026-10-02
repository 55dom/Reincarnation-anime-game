import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500, target: 'es2020' },
  server: { host: true },
});
