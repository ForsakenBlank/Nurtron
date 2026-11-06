// `npm run dev`: the desktop app with instant reloading while you change the code
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const root = path.join(import.meta.dirname, '..');
const server = await createServer({ root });
await server.listen();
const url = server.resolvedUrls.local[0];
const app = spawn(require('electron'), [root], { env: { ...process.env, NURTRON_DEV_URL: url }, stdio: 'inherit' });
app.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
