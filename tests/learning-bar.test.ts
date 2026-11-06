// the milestone 0 pass mark. seeds here start at 1001 so they differ from the ones used for tuning
// (`npm run bar` uses 1 to 100), which keeps the brain from just being tuned to pass its own test.
import { describe, expect, it } from 'vitest';
import { runLearningBar } from '../src/sim/learning-bar.ts';
import { initPhysics } from '../src/sim/world.ts';

await initPhysics();

describe('learning bar', () => {
  const report = runLearningBar(100, 1001);
  for (const line of report.lines) {
    it(line.name, () => {
      expect(line.pass, `${Math.round(line.result * 100)}%, target ${line.target}. ${line.note}`).toBe(true);
    });
  }
});
