import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  // relative paths so the built page also loads from a file inside the packaged app
  base: './',
  // the version the update checker compares with what's on GitHub
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: { outDir: 'dist', chunkSizeWarningLimit: 4000 },
  server: { port: 5183, strictPort: true },
  // dimensions run in threads of their own, which import the same modules as the window
  worker: { format: 'es' },
});
