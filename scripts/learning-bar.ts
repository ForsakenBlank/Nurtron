// `npm run bar`: raises 100 creatures with no window and prints whether their brains really learn.
// `npm run bar -- 20` runs fewer, for quick tuning.
import { pct, runLearningBar } from '../src/sim/learning-bar.ts';
import { initPhysics } from '../src/sim/world.ts';

await initPhysics();

const runs = Number(process.argv[2] ?? 100);
const firstSeed = Number(process.argv[3] ?? 1);
const started = performance.now();
const report = runLearningBar(runs, firstSeed);

console.log(`\nNurtron learning bar: ${report.runs} creatures\n`);
for (const line of report.lines) {
  console.log(`${line.pass ? 'PASS' : 'FAIL'}  ${pct(line.result).padStart(4)}  ${line.name} (target: ${line.target})`);
  console.log(`            ${line.note}`);
}
console.log('');
for (const extra of report.extras) console.log(`  - ${extra}`);
console.log(`\n${report.pass ? 'All passed.' : 'Not there yet.'} Took ${((performance.now() - started) / 1000).toFixed(1)}s.\n`);
process.exit(report.pass ? 0 : 1);
