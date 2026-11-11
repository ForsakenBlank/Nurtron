// ghosts in other dimensions share one brain with the real creature
import { describe, expect, it } from 'vitest';
import { ACTIONS, Brain } from '../src/sim/brain.ts';
import { Dimension } from '../src/sim/dimension.ts';
import { applyKnowledge, knowledgeOf, mergeInto } from '../src/sim/hive.ts';
import type { Percept } from '../src/sim/senses.ts';
import { initPhysics, TICKS_PER_SECOND, World } from '../src/sim/world.ts';

await initPhysics();

const RED: Percept = { shape: 'circle', colour: 'red', size: 'small', moving: false, near: 'close' };
const BLUE: Percept = { shape: 'square', colour: 'blue', size: 'big', moving: false, near: 'close' };
const TOUCH = ACTIONS.indexOf('touch');

function brainKnowing(...percepts: Percept[]): Brain {
  const b = new Brain(['Hunger']);
  for (const p of percepts) b.fire(p);
  return b;
}

const linkOf = (b: Brain, c: number): number => b.link(c, TOUCH, 1);

describe('merging brains', () => {
  it('adds up what every ghost learned', () => {
    const main = brainKnowing(RED);
    const base = knowledgeOf(main, 0);
    const ghosts = [0, 1, 2].map(() => {
      const g = brainKnowing(RED);
      applyKnowledge(g, base, 0);
      g.concepts[1].w[TOUCH * g.channels + 1] = 0.3;
      g.concepts[1].uses += 2;
      return knowledgeOf(g, 50);
    });
    const result = mergeInto(main, base, ghosts, 100);
    expect(result.merged).toBe(3);
    // three lessons of 0.3 add up to more than one, but never past 1
    expect(linkOf(main, 1)).toBeGreaterThan(0.6);
    expect(linkOf(main, 1)).toBeLessThan(1);
    expect(result.change).toBeGreaterThan(0);
  });

  it('keeps what the real creature learned too', () => {
    const main = brainKnowing(RED);
    const base = knowledgeOf(main, 0);
    main.concepts[1].w[TOUCH * main.channels + 1] = 0.4;
    const g = brainKnowing(RED);
    applyKnowledge(g, base, 0);
    mergeInto(main, base, [knowledgeOf(g, 10)], 10);
    expect(linkOf(main, 1)).toBeCloseTo(0.4, 5);
  });

  it('brings in something only a ghost met', () => {
    const main = brainKnowing(RED);
    const base = knowledgeOf(main, 0);
    const g = brainKnowing(RED);
    applyKnowledge(g, base, 0);
    g.fire(BLUE);
    g.concepts[2].w[TOUCH * g.channels + 1] = -0.5;
    const result = mergeInto(main, base, [knowledgeOf(g, 10)], 10);
    expect(result.newConcepts).toBe(1);
    const blue = main.closest(BLUE);
    expect(blue).not.toBeNull();
    expect(linkOf(main, blue!)).toBeCloseTo(-0.5, 5);
  });

  it('adds up places it came to like', () => {
    const main = brainKnowing();
    const base = knowledgeOf(main, 0);
    const ghosts = [0, 1].map(() => {
      const g = brainKnowing();
      g.places = [{ x: 500, y: 500, value: 0.3 }];
      return knowledgeOf(g, 0);
    });
    mergeInto(main, base, ghosts, 0);
    expect(main.places).toHaveLength(1);
    expect(main.places[0].value).toBeGreaterThan(0.5);
  });

  it("leaves a ghost out when the creature's body has changed", () => {
    const main = brainKnowing(RED);
    const base = knowledgeOf(main, 0);
    const g = new Brain(['Hunger', 'Thirst']);
    const result = mergeInto(main, base, [knowledgeOf(g, 0)], 0);
    expect(result.skipped).toBe(1);
    expect(applyKnowledge(g, base, 0)).toBe(false);
  });
});

describe('dimensions', () => {
  // how much it has come to think touching red things helps when hungry
  function foodSense(world: World): number {
    const b = world.creature.brain;
    let best = 0;
    b.concepts.forEach((c, i) => {
      if (c.percept?.colour === 'red') best = Math.max(best, b.link(i, TOUCH, 1 + b.driveNames.indexOf('Hunger')));
    });
    return best;
  }

  function hungry(world: World): void {
    world.setDrive('Hunger', 70);
  }

  it('a copy of the world runs by itself, and a ghost that dies comes back', () => {
    const world = new World({ seed: 7001 });
    const d = new Dimension(world.save(), { seed: 5, scatter: true, revive: true });
    expect(d.uids()).toEqual([world.creature.uid]);
    for (let i = 0; i < 10 * TICKS_PER_SECOND; i++) d.step();
    expect(d.stats.ticks).toBe(10 * TICKS_PER_SECOND);
    d.world.die(d.world.creature);
    d.step();
    expect(d.world.creature.dead).toBe(false);
    expect(d.stats.deaths).toBe(1);
    d.dispose();
    world.dispose();
  });

  it('a creature with ghosts learns about food faster than one by itself', () => {
    let withGhosts = 0;
    let alone = 0;
    for (const seed of [7101, 7102, 7103]) {
      const solo = new World({ seed });
      const hive = new World({ seed });
      hungry(solo);
      hungry(hive);
      const dims = [1, 2, 3, 4].map((n) => new Dimension(hive.save(), { seed: seed * 10 + n, scatter: true, revive: true }));
      for (const d of dims) for (const c of d.world.creatures) d.world.setDrive('Hunger', 70, c);
      let base = Object.fromEntries(hive.creatures.map((c) => [c.uid, knowledgeOf(c.brain, hive.tick)]));
      for (let s = 0; s < 20; s++) {
        for (let i = 0; i < TICKS_PER_SECOND; i++) {
          solo.step();
          hive.step();
          for (const d of dims) d.step();
        }
        solo.takeEvents();
        hive.takeEvents();
        if (s % 5 === 4) {
          for (const c of hive.creatures) {
            mergeInto(c.brain, base[c.uid], dims.map((d) => d.knowledge()[c.uid]).filter(Boolean), hive.tick);
          }
          base = Object.fromEntries(hive.creatures.map((c) => [c.uid, knowledgeOf(c.brain, hive.tick)]));
          for (const d of dims) d.learn(base);
        }
      }
      withGhosts += foodSense(hive);
      alone += foodSense(solo);
      for (const d of dims) d.dispose();
      solo.dispose();
      hive.dispose();
    }
    expect(withGhosts).toBeGreaterThan(alone * 1.3);
  });
});
