// the ready-made stats a creature can be given, and turning old creatures' Food into Hunger
import { describe, expect, it } from 'vitest';
import { parseCreature, saveCreature } from '../src/sim/creature-file.ts';
import { DEFAULT_STATS, STATS } from '../src/sim/examples.ts';
import { initPhysics, TICKS_PER_SECOND, World } from '../src/sim/world.ts';
import type { Creature, Thing } from '../src/sim/world.ts';

await initPhysics();

function run(world: World, seconds: number): void {
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) world.step();
}

function value(world: World, name: string): number {
  return world.drive(name)?.value as number;
}

// a save from before Hunger, the way it really looked, with a body whose Food went down
function oldSave(food: number): string {
  const world = new World({ seed: 9910, things: [] });
  run(world, 5);
  const saved = JSON.parse(world.save());
  const brain = saved.creatures[0].brain;
  brain.driveNames = brain.driveNames.map((n: string) => (n === 'Hunger' ? 'Food' : n));
  brain.whens = brain.whens.map((w: string, i: number) => (brain.driveNames[i] === 'Food' ? 'low' : w));
  for (const t of saved.things) {
    delete t.stat;
    if (t.owner === undefined) continue;
    if (t.name === 'Hunger') t.name = 'Food';
    if (t.name === 'Food' && t.part.kind === 'label') {
      t.part.value = food;
      t.live.value = food;
    }
    if (t.name === 'Food' && t.part.kind === 'drive') t.part.wants = 'high';
    if (t.name === 'How much' && t.part.base === 1) t.part.base = -1;
  }
  saved.version = 8;
  world.dispose();
  return JSON.stringify(saved);
}

describe('hunger', () => {
  it('100 is starving: it goes up by itself, eating brings it down', () => {
    const world = new World({ seed: 9900, things: [] });
    expect(world.creature.brain.driveNames).toContain('Hunger');
    const start = value(world, 'Hunger');
    run(world, 30);
    expect(value(world, 'Hunger')).toBeGreaterThan(start);
    world.setDrive('Hunger', 100);
    expect(world.worstNeed()).toBe(1);
    world.setDrive('Hunger', 0);
    world.setDrive('Energy', 100);
    expect(world.worstNeed()).toBe(0);
    world.setDrive('Hunger', 80);
    world.giveTo('Hunger', -25);
    world.step();
    expect(value(world, 'Hunger')).toBe(55);
    world.dispose();
  });
});

describe('an old creature with Food', () => {
  it('turns into Hunger the first time it opens, with the same need and what it learned', () => {
    const copy = World.load(oldSave(30));
    const c = copy.creature;
    expect(c.brain.driveNames).toContain('Hunger');
    expect(c.brain.driveNames).not.toContain('Food');
    expect(value(copy, 'Hunger')).toBe(70);
    expect(copy.worstNeed()).toBeCloseTo(0.7);
    expect(c.brain.whens[c.brain.driveNames.indexOf('Hunger')]).toBe('high');
    const start = value(copy, 'Hunger');
    run(copy, 30);
    expect(value(copy, 'Hunger')).toBeGreaterThan(start);
    copy.dispose();
  });

  it('a body you rewired yourself is left exactly as you made it, and food still feeds it', () => {
    const saved = JSON.parse(oldSave(30));
    const food = saved.things.find((t: Thing) => t.name === 'Food' && t.part?.kind === 'label');
    food.part.max = 500;
    const copy = World.load(JSON.stringify(saved));
    expect(copy.creature.brain.driveNames).toContain('Food');
    expect(value(copy, 'Food')).toBe(30);
    // a fruit made for Hunger takes Hunger down, which for this one means Food goes up
    copy.giveTo('Hunger', -20);
    copy.step();
    expect(value(copy, 'Food')).toBeGreaterThanOrEqual(49);
    copy.dispose();
  });
});

describe('choosing stats', () => {
  it('a new creature gets the ones you pick, and nothing else', () => {
    const world = new World({ seed: 9920, things: [], stats: ['energy', 'health'] });
    expect(world.statsOf()).toEqual(['energy', 'health']);
    expect(world.drive('Hunger')).toBeUndefined();
    expect(value(world, 'Health')).toBe(100);
    world.step();
    world.dispose();
    const plain = new World({ seed: 9921, things: [] });
    expect(plain.statsOf()).toEqual(DEFAULT_STATS);
    plain.dispose();
    const egg = new World({ seed: 9922, things: [] }).newEgg({ stats: ['loneliness'] }) as Creature;
    expect(egg.drives.map((d) => d.name)).toEqual(['Loneliness']);
  });

  it('every stat can go on together without their wires overlapping or breaking', () => {
    const world = new World({ seed: 9923, things: [], stats: [...STATS] });
    expect(world.statsOf()).toEqual([...STATS]);
    expect(world.wires.every((w) => world.thing(w.from) && world.thing(w.to))).toBe(true);
    const spots = new Set(world.things.filter((t) => t.inBody).map((t) => `${t.x},${t.y}`));
    expect(spots.size).toBe(world.things.filter((t) => t.inBody).length);
    run(world, 60);
    world.takeEvents();
    world.dispose();
  });

  it('Health: slaps hurt, it heals, and at 0 nothing happens unless you chose dying', () => {
    const world = new World({ seed: 9924, things: [], stats: ['health'] });
    world.slap();
    run(world, 1);
    expect(value(world, 'Health')).toBeLessThan(100);
    const hurt = value(world, 'Health');
    run(world, 12);
    expect(value(world, 'Health')).toBeGreaterThan(hurt);
    world.setDrive('Health', 0);
    run(world, 2);
    expect(world.creature.dead).toBe(false);
    world.dispose();
  });

  it('Dies at 0 Health brings Health with it, dies, and can be revived', () => {
    const world = new World({ seed: 9925, things: [], stats: ['mortal'] });
    expect(world.statsOf()).toEqual(['health', 'mortal']);
    for (let i = 0; i < 8 && !world.creature.dead; i++) {
      world.slap();
      run(world, 1);
    }
    expect(world.creature.dead).toBe(true);
    world.revive();
    expect(value(world, 'Health')).toBe(100);
    run(world, 2);
    expect(world.creature.dead).toBe(false);
    world.dispose();
  });

  it('Happiness and Loneliness answer to pets and slaps', () => {
    const world = new World({ seed: 9926, things: [], stats: ['happiness', 'loneliness'] });
    world.pet();
    run(world, 1);
    expect(value(world, 'Happiness')).toBeGreaterThan(60);
    expect(value(world, 'Loneliness')).toBeLessThan(40);
    world.slap();
    run(world, 1);
    expect(value(world, 'Happiness')).toBeLessThan(70);
    world.dispose();
  });

  it('can be added to a creature you already have and taken away, keeping what it learned', () => {
    const world = new World({ seed: 9927, things: [] });
    run(world, 5);
    const brain = world.creature.brain;
    brain.concepts[0].w[0] = 0.5;
    expect(world.addStat('thirst')).toBe(true);
    expect(world.addStat('thirst')).toBe(false);
    expect(world.drive('Thirst')).toBeDefined();
    expect(brain.concepts[0].w[0]).toBe(0.5);
    world.removeStat('thirst');
    expect(world.drive('Thirst')).toBeUndefined();
    expect(world.things.some((t) => t.stat === 'thirst')).toBe(false);
    expect(brain.driveNames).toContain('Thirst');
    world.addStat('mortal');
    world.removeStat('health');
    expect(world.statsOf()).toEqual(['hunger', 'energy']);
    world.dispose();
  });

  it('stats belong to one creature, and travel with it and to its babies', () => {
    const world = new World({ seed: 9928, things: [] });
    const first = world.creature;
    const second = world.newEgg({ stats: ['health'] }) as Creature;
    expect(world.statsOf(first)).toEqual(['hunger', 'energy']);
    expect(world.statsOf(second)).toEqual(['health']);
    const friend = new World({ seed: 9929, things: [] });
    friend.adoptCreature(parseCreature(saveCreature(world, second)), friend.creature);
    expect(friend.statsOf()).toEqual(['health']);
    world.dispose();
    friend.dispose();
  });
});
