// `npm run life`: lets one creature live alone for a while with no window and prints how it spent its time.
// passing the learning bar doesn't prove it behaves sensibly over a long stretch, so this shows that.
import { ACTIONS } from '../src/sim/brain.ts';
import { initPhysics, TICKS_PER_SECOND, World } from '../src/sim/world.ts';

await initPhysics();

const seed = Number(process.argv[2] ?? 1);
const minutes = Number(process.argv[3] ?? 60);
const blockMinutes = Number(process.argv[4] ?? 10);
const world = new World({ seed });

console.log(`Seed ${seed}, ${minutes} minutes alone with a fruit and a rock. % of decisions per ${blockMinutes} min block.\n`);
console.log(`  min  food  energy  meals  ideas  ${ACTIONS.map((a) => a.slice(0, 5).padStart(6)).join('')}`);
let counts = new Array(ACTIONS.length).fill(0);
let meals = 0;
let lowFood = 100;
while (world.tick < minutes * 60 * TICKS_PER_SECOND) {
  world.step();
  lowFood = Math.min(lowFood, 100 - world.drive('Hunger')!.value);
  for (const event of world.takeEvents()) {
    if (event.type === 'decided') counts[ACTIONS.indexOf(event.decision.action)]++;
    if (event.type === 'touched' && event.ate) meals++;
  }
  if (world.tick % (blockMinutes * 60 * TICKS_PER_SECOND) === 0) {
    const total = counts.reduce((s, v) => s + v, 0) || 1;
    const row = counts.map((c) => `${Math.round((c / total) * 100)}%`.padStart(6)).join('');
    const c = world.creature;
    console.log(`${String(world.tick / TICKS_PER_SECOND / 60).padStart(5)}  ${String(c.drives[0].value).padStart(4)}  ${String(c.drives[1].value).padStart(6)}  ${String(meals).padStart(5)}  ${String(c.brain.concepts.length).padStart(5)}  ${row}`);
    counts = new Array(ACTIONS.length).fill(0);
    meals = 0;
  }
}
console.log(`\nHungriest it got: ${100 - lowFood}. What it knows:`);
for (const link of world.creature.brain.strongestLinks(10)) console.log(`  ${link.strength.toFixed(2).padStart(5)}  ${link.words}`);
console.log(`\nSave size: ${(world.save().length / 1024).toFixed(1)} KB`);
