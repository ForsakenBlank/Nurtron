import { describe, expect, it } from 'vitest';
import { Brain } from '../src/sim/brain.ts';
import { Rng, sample } from '../src/sim/rng.ts';
import { similarity } from '../src/sim/senses.ts';
import type { Percept } from '../src/sim/senses.ts';
import { FRUIT, initPhysics, ROCK, ROOM, TICKS_PER_SECOND, World } from '../src/sim/world.ts';

await initPhysics();

const redCircle: Percept = { shape: 'circle', colour: 'red', size: 'small', moving: false, near: 'nearby' };

function run(world: World, seconds: number): void {
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) world.step();
}

describe('Data', () => {
  it('base 10 spread 1 only ever gives 9, 10 or 11', () => {
    const rng = new Rng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(sample({ base: 10, spread: 1 }, rng));
    expect([...seen].sort((a, b) => a - b)).toEqual([9, 10, 11]);
  });
});

describe('senses', () => {
  it('rates things that look alike above things that do not', () => {
    const redSquare: Percept = { ...redCircle, shape: 'square' };
    const blueSquare: Percept = { ...redCircle, shape: 'square', colour: 'blue' };
    expect(similarity(redCircle, redCircle)).toBeCloseTo(1);
    expect(similarity(redCircle, redSquare)).toBeGreaterThan(similarity(redCircle, blueSquare));
  });

  it('sees a long thin box as a bar and a chunky one as a square', () => {
    const world = new World({ seed: 1, things: [] });
    const plank = world.add({ name: 'Plank', form: 'box', colour: 'grey', hw: 120, hh: 10, x: 900 });
    const block = world.add({ name: 'Block', form: 'box', colour: 'grey', hw: 20, hh: 20, x: 1100 });
    expect(world.perceive(plank).shape).toBe('bar');
    expect(world.perceive(block).shape).toBe('square');
    world.dispose();
  });
});

describe('brain', () => {
  it('recruits one concept per different thing and reuses it when seen again', () => {
    const brain = new Brain(['Food']);
    brain.fire(redCircle);
    brain.fire(redCircle);
    brain.fire({ ...redCircle, near: 'close' });
    expect(brain.concepts.length).toBe(2); // itself, plus the circle
    brain.fire({ ...redCircle, colour: 'blue', shape: 'square' });
    expect(brain.concepts.length).toBe(3);
  });

  it('never grows past its maximum', () => {
    const brain = new Brain(['Food'], { learningRate: 0.6, curiosity: 0.3, temperature: 0.1, memorySeconds: 2.5, maxConcepts: 4 });
    for (const colour of ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'grey'] as const) {
      brain.fire({ ...redCircle, colour });
    }
    expect(brain.concepts.length).toBe(4);
    expect(brain.concepts[0].percept).toBeNull();
  });

  it('keeps every link between -1 and 1 however much it is rewarded', () => {
    const world = new World({ seed: 3 });
    run(world, 30);
    for (let i = 0; i < 300; i++) {
      run(world, 0.2);
      if (i % 2) world.pet();
      else world.slap();
    }
    for (const concept of world.creature.brain.concepts) {
      for (const w of concept.w) expect(Math.abs(w)).toBeLessThanOrEqual(1);
    }
    world.dispose();
  });

  it("doesn't blame what it's doing for hunger ticking down by itself", () => {
    const world = new World({ seed: 4, things: [] });
    run(world, 300);
    for (const link of world.creature.brain.strongestLinks(50, 0.01)) {
      if (link.channel === 1) expect(link.strength).toBeGreaterThan(-0.05);
    }
    world.dispose();
  });
});

describe('world', () => {
  it('is exactly repeatable from a seed', () => {
    const a = new World({ seed: 42 });
    const b = new World({ seed: 42 });
    run(a, 120);
    run(b, 120);
    expect(a.save()).toBe(b.save());
    const c = new World({ seed: 43 });
    run(c, 120);
    expect(c.save()).not.toBe(a.save());
    for (const w of [a, b, c]) w.dispose();
  });

  it('loads a save with everything in the same place, and carries on', () => {
    const original = new World({ seed: 7 });
    run(original, 60);
    const text = original.save();
    const loaded = World.load(text);
    expect(loaded.save()).toBe(text);
    expect(loaded.creature.brain.concepts).toEqual(original.creature.brain.concepts);
    run(loaded, 60);
    expect(loaded.tick).toBe(original.tick + 60 * TICKS_PER_SECOND);
    original.dispose();
    loaded.dispose();
  });

  it('refuses a save from a version it cannot read', () => {
    expect(() => World.load(JSON.stringify({ version: 999 }))).toThrow(/version 999/);
  });

  it('feeds it when it touches food, removes the food and brings it back later', () => {
    const world = new World({ seed: 1, things: [{ ...FRUIT, x: ROOM.width / 2 + 150, respawnSeconds: 2 }] });
    world.setDrive('Hunger', 60);
    let ate = false;
    for (let i = 0; i < 300 * TICKS_PER_SECOND && !ate; i++) {
      world.step();
      ate = world.takeEvents().some((e) => e.type === 'touched' && e.ate);
    }
    expect(ate).toBe(true);
    expect(world.drive('Hunger')!.value).toBeLessThan(45);
    const inRoom = (): number => world.things.filter((t) => !t.inBody).length;
    expect(inRoom()).toBe(0);
    run(world, 3);
    expect(inRoom()).toBe(1);
    world.dispose();
  });

  it('keeps the creature and everything else inside the room', () => {
    const world = new World({ seed: 9, things: [FRUIT, ROCK, { ...ROCK, x: 1980 }, { ...FRUIT, x: 20, y: 40 }] });
    for (let i = 0; i < 600 * TICKS_PER_SECOND; i++) {
      world.step();
      world.takeEvents();
      expect(world.creature.x).toBeGreaterThanOrEqual(0);
      expect(world.creature.x).toBeLessThanOrEqual(ROOM.width);
      expect(world.creature.y).toBeLessThanOrEqual(ROOM.floor + 5); // landing can sink in by a pixel or two
    }
    for (const t of world.things) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThanOrEqual(ROOM.width);
      expect(t.y).toBeLessThanOrEqual(ROOM.floor);
      expect(Number.isFinite(t.y)).toBe(true);
    }
    world.dispose();
  });

  it('copes with its target being removed while walking to it', () => {
    const world = new World({ seed: 5, things: [ROCK, FRUIT] });
    for (let i = 0; i < 200; i++) {
      run(world, 1);
      const doing = world.creature.doing;
      if (doing?.targetId != null) world.remove(doing.targetId);
      if (world.things.length === 0) world.add(ROCK);
      world.takeEvents();
    }
    expect(world.creature.doing === null || typeof world.creature.doing.action === 'string').toBe(true);
    world.dispose();
  });
});
