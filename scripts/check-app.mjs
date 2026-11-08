// builds the page and opens the real desktop app for a few seconds, to prove graphics, physics and the game work there.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.join(import.meta.dirname, '..');
execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], { cwd: root, stdio: 'inherit' });

const out = path.join(mkdtempSync(path.join(tmpdir(), 'nurtron-check-')), 'check.json');
const electron = require('electron');
// electron won't start as root unless it's told to go without its sandbox, which only matters on a throwaway machine
const asRoot = process.getuid?.() === 0;
const run = spawnSync(electron, asRoot ? ['--no-sandbox', root] : [root], {
  env: { ...process.env, NURTRON_CHECK_OUT: out },
  encoding: 'utf8',
  timeout: 60000,
});

let report;
try {
  report = JSON.parse(readFileSync(out, 'utf8'));
} catch {
  console.error('FAIL the desktop app did not report back');
  console.error(run.stderr);
  process.exit(1);
}
console.log(`${report.ok ? 'ok  ' : 'FAIL'} Desktop app: Electron ${report.electron}, Chrome ${report.chrome}`);
console.log(`${report.renderer ? 'ok  ' : 'FAIL'} Graphics in the app: PixiJS using ${report.renderer}`);
console.log(`${report.rapierLandedY ? 'ok  ' : 'FAIL'} Physics in the app: ball landed at y=${report.rapierLandedY}`);
if (report.error) console.error(report.error);
console.log(`${report.game?.running && report.game.tick > 0 ? 'ok  ' : 'FAIL'} The game itself runs in the app: ${report.game?.tick ?? 0} simulation ticks in 5 seconds`);
console.log(`${report.survives ? 'ok  ' : 'FAIL'} The creature is still there after reopening`);
console.log(`${report.savesRooms ? 'ok  ' : 'FAIL'} The save button writes a real room file`);
console.log(`${report.parts?.count === 1 ? 'ok  ' : 'FAIL'} Wires in the app: ${report.parts?.wires ?? 0} wires, and pressing a button counted ${report.parts?.count ?? 0}`);
console.log(`${report.parts?.skins === 10 ? 'ok  ' : 'FAIL'} Skins in the app: ${report.parts?.skins ?? 0} of 10 drew a picture`);
console.log(`${report.parts?.drives === 2 ? 'ok  ' : 'FAIL'} The creature's body in the app: ${report.parts?.drives ?? 0} drives wired up`);
console.log(`${report.shared?.drives === 2 ? 'ok  ' : 'FAIL'} A creature file goes out and comes back in: ${report.shared?.drives ?? 0} drives wired up afterwards`);
console.log(`${report.shared?.creatures === 2 ? 'ok  ' : 'FAIL'} Two creatures at once, each with its own stomach: ${report.shared?.stomachs?.join(' and ')}`);
console.log(`${report.shared?.picture ? 'ok  ' : 'FAIL'} A picture dropped on a shape sticks to it`);
console.log(`Pictures of the window: ${report.picture}, ${report.gamePicture}, ${report.partsPicture}, ${report.bodyPicture} and ${report.picturePicture}`);
process.exit(report.ok ? 0 : 1);
