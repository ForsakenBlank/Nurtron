import { defineConfig } from 'vite';

export default defineConfig({
  // relative paths so the built page also loads from a file inside the packaged app
  base: './',
  build: { outDir: 'dist', chunkSizeWarningLimit: 4000 },
  server: { port: 5183, strictPort: true },
});
