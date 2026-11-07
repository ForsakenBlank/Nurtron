// milestone 8: learning by watching, going over things while resting, liked and disliked places, and working out
// chains several steps long. each one is measured on the same creatures with it switched on and switched off.
// seeds start at 30001 and were never used for tuning (tuning used 20001 and up, via MIND_SEEDS).
import { afterEach, describe, expect, it } from 'vitest';
import { ACTIONS, Brain, PLAN_STEPS } from '../src/sim/brain.ts';
import type { Abilities } from '../src/sim/brain.ts';
import { parseCreature, saveCreature } from '../src/sim/creature-file.ts';
import { newPart } from '../src/sim/parts.ts';
import type { Part, PartKind } from '../src/sim/parts.ts';
import { Rng } from '../src/sim/rng.ts';
import type { Percept } from '../src/sim/senses.ts';
import { initPhysics, ROOM, TICKS_PER_SECOND, World } from '../src/sim/world.ts';
import type { Creature, Thing, ThingSpec } from '../src/sim/world.ts';

await initPhysics();

const BASE = Number(process.env.MIND_SEEDS ?? 30001);
const MIDDLE = ROOM.width / 2;
const ON: Abilities = { watching: true, replay: true, places: true, planSteps: PLAN_STEPS };

afterEach(() => {
  Brain.defaults = { ...ON };
});

function withAbilities<T>(change: Partial<Abilities>, run: () => T): T {
  Brain.defaults = { ...ON, ...change };
  try {
    return run();
  } finally {
    Brain.defaults = { ...ON };
  }
}

function run(world: World, seconds: number): void {
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) world.step();
  world.takeEvents();
}

function part(world: World, kind: PartKind, settings: Partial<Part> = {}, x = 300, y = 300, extra: Partial<ThingSpec> = {}): Thing {
  const spec = newPart(kind, x, y);
  return world.add({ ...spec, part: { ...spec.part, ...settings }, ...extra });
}

// does what it's told and waits until it's done
function obey(world: World, c: Creature, action: (typeof ACTIONS)[number], target: number | null, seconds = 25): void {
  world.tell(action, target, false, c);
  for (let i = 0; i < seconds * TICKS_PER_SECOND && (c.orders.length || c.doing?.told); i++) world.step();
  world.takeEvents();
}

// which of two things a copy of the creature touches first, with learning off so asking doesn't change it
function firstTouch(world: World, c: Creature, a: ThingSpec, b: ThingSpec, seed: number, hunger: number, ax?: number, bx?: number): 'a' | 'b' | null {
  const copy = World.load(world.save());
  copy.focusOn(c.id);
  for (const other of [...copy.creatures]) if (other.id !== c.id) copy.removeCreature(other.id);
  copy.rng = new Rng(seed);
  copy.creature.brain.learning = false;
  copy.interrupt();
  copy.clearThings();
  copy.placeCreature(MIDDLE);
  copy.setDrive('Hunger', hunger);
  copy.setDrive('Energy', 90);
  const side = copy.rng.next() < 0.5 ? -1 : 1;
  const thingA = copy.add({ ...a, x: ax ?? MIDDLE + side * 220 });
  const thingB = copy.add({ ...b, x: bx ?? MIDDLE - side * 220 });
  copy.takeEvents();
  let choice: 'a' | 'b' | null = null;
  for (let i = 0; i < 30 * TICKS_PER_SECOND && !choice; i++) {
    copy.step();
    for (const e of copy.takeEvents()) {
      if (e.type !== 'touched') continue;
      if (e.thingId === thingA.id) choice = 'a';
      else if (e.thingId === thingB.id) choice = 'b';
    }
  }
  copy.dispose();
  return choice;
}

function choiceRate(worlds: { world: World; c: Creature; seed: number }[], a: ThingSpec, b: ThingSpec, hunger: number, ax?: number, bx?: number): number {
  let wins = 0;
  let total = 0;
  for (const { world, c, seed } of worlds) {
    for (let i = 0; i < 4; i++) {
      if (firstTouch(world, c, a, b, seed * 100 + i, hunger, ax, bx) === 'a') wins++;
      total++;
    }
  }
  return wins / total;
}

const seeds = (n: number, offset: number): number[] => Array.from({ length: n }, (_, i) => BASE + offset + i);
const SNACK: ThingSpec = { name: 'Snack', form: 'triangle', colour: 'purple', hw: 16, hh: 16, x: 0, give: { drive: 'Hunger', amount: -25 }, eaten: true, respawnSeconds: 1 };
const PEBBLE: ThingSpec = { name: 'Pebble', form: 'box', colour: 'orange', hw: 16, hh: 16, x: 0, weight: 3 };
const BALL: ThingSpec = { name: 'Ball', form: 'circle', colour: 'green', hw: 16, hh: 16, x: 0 };

describe('learning by watching', () => {
  // one creature eats a new kind of snack three times while another, held still, watches from close by
  function watcher(seed: number): { world: World; c: Creature; seed: number } {
    const world = new World({ seed, things: [], name: 'Eater' });
    const eater = world.creature;
    const watching = world.newEgg({ name: 'Watcher' }) as Creature;
    watching.hatching = 0;
    world.placeCreature(MIDDLE - 120, watching);
    world.placeCreature(MIDDLE, eater);
    for (let meal = 0; meal < 3; meal++) {
      const snack = world.add({ ...SNACK, x: MIDDLE + 150, respawnSeconds: undefined });
      world.setDrive('Hunger', 75, eater);
      watching.stunned = 1e6; // it only watches. it does nothing itself, so anything it learns came from watching
      obey(world, eater, 'touch', snack.id);
      world.placeCreature(MIDDLE, eater);
    }
    watching.stunned = 0;
    return { world, c: watching, seed };
  }

  it('a creature that watched another eat something goes for it when hungry, more than one that could not learn from watching', () => {
    const on = seeds(12, 0).map(watcher);
    const off = withAbilities({ watching: false }, () => seeds(12, 0).map(watcher));
    const rateOn = choiceRate(on, SNACK, PEBBLE, 75);
    const rateOff = withAbilities({ watching: false }, () => choiceRate(off, SNACK, PEBBLE, 75));
    console.log(`watching: picks the snack it saw eaten ${Math.round(rateOn * 100)}%, switched off ${Math.round(rateOff * 100)}%`);
    expect(rateOn).toBeGreaterThanOrEqual(0.7);
    expect(rateOn - rateOff).toBeGreaterThanOrEqual(0.15);
    for (const w of [...on, ...off]) w.world.dispose();
  }, 120000);

  it('it learns more weakly from watching than from doing', () => {
    const { world, c } = watcher(BASE + 50);
    const eater = world.creatures.find((x) => x.name === 'Eater') as Creature;
    const strength = (who: Creature): number => {
      const concept = who.brain.closest({ shape: 'triangle', colour: 'purple', size: 'small', moving: false, near: 'nearby' });
      return concept === null ? 0 : who.brain.link(concept, ACTIONS.indexOf('touch'), who.brain.driveNames.indexOf('Hunger') + 1);
    };
    expect(strength(c)).toBeGreaterThan(0.05);
    expect(strength(c)).toBeLessThan(strength(eater));
    world.dispose();
  });
});

describe('going over things while resting', () => {
  // one small snack, which on its own only teaches a little, then a rest
  const TASTE: ThingSpec = { ...SNACK, name: 'Taste', give: { drive: 'Hunger', amount: -20 } };
  function tastedOnce(seed: number): { world: World; c: Creature; seed: number } {
    const world = new World({ seed, things: [] });
    const c = world.creature;
    const snack = world.add({ ...TASTE, x: MIDDLE + 150, respawnSeconds: undefined });
    world.setDrive('Hunger', 70);
    obey(world, c, 'touch', snack.id);
    obey(world, c, 'rest', null);
    return { world, c, seed };
  }

  it('after one small taste and a rest, it goes back for that food more than one that did not go over it', () => {
    const on = seeds(16, 100).map(tastedOnce);
    const off = withAbilities({ replay: false }, () => seeds(16, 100).map(tastedOnce));
    const rateOn = choiceRate(on, TASTE, PEBBLE, 70);
    const rateOff = withAbilities({ replay: false }, () => choiceRate(off, TASTE, PEBBLE, 70));
    console.log(`replay: picks the food it tasted once ${Math.round(rateOn * 100)}%, switched off ${Math.round(rateOff * 100)}%`);
    expect(rateOn - rateOff).toBeGreaterThanOrEqual(0.1);
    for (const w of [...on, ...off]) w.world.dispose();
  }, 120000);

  it('each moment is only gone over twice, so it cannot keep growing by itself', () => {
    const { world, c } = tastedOnce(BASE + 150);
    expect(c.brain.episodes.some((e) => e.replays === 1)).toBe(true);
    c.brain.replay(world.tick, TICKS_PER_SECOND);
    expect(c.brain.replay(world.tick, TICKS_PER_SECOND)).toBe(0);
    world.dispose();
  });
});

describe('liked and disliked places', () => {
  const LEFT = MIDDLE - 300;
  const RIGHT = MIDDLE + 300;

  // petted a few times on the left and slapped twice on the right, with nothing around, so the only thing it can
  // connect those with is where it was
  function placed(seed: number, pet: boolean, slap: boolean): { world: World; c: Creature; seed: number } {
    const world = new World({ seed, things: [] });
    for (let i = 0; i < 4; i++) {
      if (pet) {
        world.placeCreature(LEFT);
        run(world, 2);
        world.placeCreature(LEFT);
        world.pet();
      }
      if (slap && i < 2) {
        world.placeCreature(RIGHT);
        run(world, 2);
        world.placeCreature(RIGHT);
        world.slap();
      }
      run(world, 3);
    }
    return { world, c: world.creature, seed };
  }

  it('it goes for a ball where it was petted over the same ball somewhere else', () => {
    const on = seeds(12, 200).map((s) => placed(s, true, false));
    const off = withAbilities({ places: false }, () => seeds(12, 200).map((s) => placed(s, true, false)));
    const rateOn = choiceRate(on, BALL, BALL, 20, LEFT, RIGHT);
    const rateOff = withAbilities({ places: false }, () => choiceRate(off, BALL, BALL, 20, LEFT, RIGHT));
    console.log(`places: picks the ball where it was petted ${Math.round(rateOn * 100)}%, switched off ${Math.round(rateOff * 100)}%`);
    expect(rateOn).toBeGreaterThanOrEqual(0.65);
    expect(rateOn - rateOff).toBeGreaterThanOrEqual(0.15);
    for (const w of [...on, ...off]) w.world.dispose();
  }, 120000);

  it('it steers clear of a ball where it was slapped', () => {
    const on = seeds(12, 300).map((s) => placed(s, false, true));
    const off = withAbilities({ places: false }, () => seeds(12, 300).map((s) => placed(s, false, true)));
    const rateOn = choiceRate(on, BALL, BALL, 20, LEFT, RIGHT);
    const rateOff = withAbilities({ places: false }, () => choiceRate(off, BALL, BALL, 20, LEFT, RIGHT));
    console.log(`places: picks the ball away from where it was slapped ${Math.round(rateOn * 100)}%, switched off ${Math.round(rateOff * 100)}%`);
    expect(rateOn).toBeGreaterThanOrEqual(0.65);
    expect(rateOn - rateOff).toBeGreaterThanOrEqual(0.15);
    for (const w of [...on, ...off]) w.world.dispose();
  }, 120000);

  it('places stay in their room: a creature file leaves them out, and a save keeps them', () => {
    const { world, c } = placed(BASE + 399, true, true);
    expect(c.brain.places.length).toBeGreaterThan(0);
    expect(World.load(world.save()).creature.brain.places.length).toBe(c.brain.places.length);
    expect(parseCreature(saveCreature(world)).brain.places).toEqual([]);
    world.dispose();
  });
});

describe('working out chains', () => {
  const p = (shape: Percept['shape'], colour: Percept['colour']): Percept => ({ shape, colour, size: 'small', moving: false, near: 'nearby' });
  const LEVER = p('bar', 'green');
  const BUTTON = p('square', 'yellow');
  const PLATE = p('hexagon', 'blue');
  const FOOD = p('circle', 'red');
  const touch = ACTIONS.indexOf('touch');

  // a brain that knows red circles are good to touch when hungry, and that each thing in the chain makes the next appear
  function brainWithChain(chain: Percept[]): { brain: Brain; needs: number[] } {
    const brain = new Brain(['Hunger']);
    brain.kinds[0] = 'drive';
    const food = brain.fire(FOOD)[0].c;
    brain.concepts[food].w[touch * brain.channels + 1] = 0.8;
    for (let i = 0; i + 1 < chain.length; i++) brain.effects.push({ cause: chain[i], action: touch, effect: chain[i + 1], strength: 0.9 });
    return { brain, needs: [0.9] };
  }

  it('it values the first step of a chain only if it can look that many steps ahead', () => {
    const { brain, needs } = brainWithChain([LEVER, BUTTON, FOOD]); // three actions: lever, button, food
    brain.abilities.planSteps = 2;
    expect(brain.plan(LEVER, touch, needs)).toBe(0);
    expect(brain.plan(BUTTON, touch, needs)).toBeGreaterThan(0.3);
    brain.abilities.planSteps = 3;
    expect(brain.plan(LEVER, touch, needs)).toBeGreaterThan(0.25);

    const long = brainWithChain([LEVER, PLATE, BUTTON, FOOD]); // four actions
    long.brain.abilities.planSteps = 3;
    expect(long.brain.plan(LEVER, touch, long.needs)).toBe(0);
    long.brain.abilities.planSteps = PLAN_STEPS;
    const first = long.brain.plan(LEVER, touch, long.needs);
    expect(first).toBeGreaterThan(0.15);
    // a good thing further off counts for a bit less
    expect(first).toBeLessThan(long.brain.plan(PLATE, touch, long.needs));
    expect(long.brain.planSteps(LEVER, touch, long.needs).map((s) => s.percept.colour)).toEqual(['blue', 'yellow', 'red']);
  });

  it('a chain is only worth following when it wants what is at the end', () => {
    const { brain } = brainWithChain([LEVER, BUTTON, FOOD]);
    expect(brain.plan(LEVER, touch, [0])).toBe(0);
  });

  it('a chain that loops back on itself does not run for ever', () => {
    const { brain, needs } = brainWithChain([LEVER, BUTTON, LEVER, BUTTON, FOOD]);
    expect(Number.isFinite(brain.plan(LEVER, touch, needs))).toBe(true);
  });

  // a real room: a green lever shows a hidden yellow block, touching the block makes a fruit drop, and eating it
  // hides the block again. nothing is wired straight from the lever to the food.
  function leverRoom(seed: number): { world: World; lever: Thing; block: Thing } {
    const world = new World({ seed, things: [] });
    const lever = world.add({ name: 'Lever', form: 'box', colour: 'green', hw: 40, hh: 8, x: MIDDLE - 250, fixed: true });
    const block = world.add({ name: 'Block', form: 'box', colour: 'yellow', hw: 18, hh: 18, x: MIDDLE + 250, fixed: true, hidden: true });
    const fruit = world.add({ name: 'Fruit', form: 'circle', colour: 'red', hw: 14, hh: 14, x: MIDDLE + 330, y: 500, eaten: true, hidden: true, fixed: true, gravity: false, solid: false });
    const show = part(world, 'show', {}, 200, 200);
    const spawner = part(world, 'spawner', { most: 1 }, 200, 300);
    const give = part(world, 'give', { target: 'Hunger', amount: -30 }, 200, 400);
    world.connect(lever.id, 'touched', show.id, 'show');
    world.connect(show.id, 'drives', block.id, 'body');
    world.connect(block.id, 'touched', spawner.id, 'spawn');
    world.connect(spawner.id, 'drives', fruit.id, 'body');
    world.connect(fruit.id, 'touched', give.id, 'give');
    world.connect(fruit.id, 'touched', show.id, 'hide');
    return { world, lever, block };
  }

  // shown the whole thing four times while full, so the food itself teaches nothing about the lever, then
  // separately learns that red circles are food
  function taught(seed: number): { world: World; lever: Thing; block: Thing } {
    const room = leverRoom(seed);
    const { world, lever, block } = room;
    const c = world.creature;
    for (let i = 0; i < 4; i++) {
      world.setDrive('Hunger', 5);
      obey(world, c, 'touch', lever.id);
      run(world, 0.5);
      obey(world, c, 'touch', block.id);
      run(world, 1.5);
      const fruit = world.things.find((t) => t.name === 'Fruit' && !t.hidden);
      if (fruit) obey(world, c, 'touch', fruit.id);
    }
    for (let i = 0; i < 3; i++) {
      const snack = world.add({ name: 'Apple', form: 'circle', colour: 'red', hw: 14, hh: 14, x: c.x + 120, eaten: true, give: { drive: 'Hunger', amount: -30 } });
      world.setDrive('Hunger', 80);
      obey(world, c, 'touch', snack.id);
    }
    return room;
  }

  // hungry, with only the lever and a rock in sight: does it go and work the lever, and get fed, within 40 seconds?
  function fedFromLever(seed: number, planSteps: number): { first: boolean; fed: boolean } {
    const { world, lever } = taught(seed);
    const copy = World.load(world.save());
    world.dispose();
    copy.creature.brain.abilities.planSteps = planSteps;
    copy.rng = new Rng(seed * 7);
    copy.interrupt();
    copy.add({ name: 'Rock', form: 'box', colour: 'grey', hw: 22, hh: 22, x: MIDDLE + 40, weight: 3 });
    copy.placeCreature(MIDDLE);
    copy.setDrive('Hunger', 85);
    copy.takeEvents();
    let first: number | null = null;
    let fed = false;
    for (let i = 0; i < 40 * TICKS_PER_SECOND && !fed; i++) {
      copy.step();
      for (const e of copy.takeEvents()) {
        if (e.type === 'touched' && first === null) first = e.thingId;
        if (e.type === 'touched' && e.name === 'Fruit' && e.ate) fed = true;
      }
    }
    copy.dispose();
    return { first: first === lever.id, fed };
  }

  it('hungry, it works a lever that leads to a block that leads to food, more than when it can only look two steps ahead', () => {
    const list = seeds(12, 400);
    const results = (steps: number) => list.map((s) => fedFromLever(s, steps));
    const four = results(PLAN_STEPS);
    const two = results(2);
    const none = results(0);
    const share = (r: { first: boolean; fed: boolean }[], key: 'first' | 'fed'): number => r.filter((x) => x[key]).length / r.length;
    console.log(`chains: goes to the lever first ${Math.round(share(four, 'first') * 100)}% looking ${PLAN_STEPS} steps ahead, ${Math.round(share(two, 'first') * 100)}% two steps, ${Math.round(share(none, 'first') * 100)}% none. fed within 40s: ${Math.round(share(four, 'fed') * 100)}%, ${Math.round(share(two, 'fed') * 100)}%, ${Math.round(share(none, 'fed') * 100)}%`);
    expect(share(four, 'first')).toBeGreaterThanOrEqual(0.6);
    expect(share(four, 'first') - share(two, 'first')).toBeGreaterThanOrEqual(0.2);
    expect(share(four, 'fed')).toBeGreaterThan(share(two, 'fed'));
  }, 180000);

  it('what makes what appear travels in a creature file, and a damaged link is left out', () => {
    const { world } = taught(BASE + 499);
    const brain = world.creature.brain;
    expect(brain.effects.length).toBeGreaterThan(0);
    const file = JSON.parse(saveCreature(world));
    expect(parseCreature(JSON.stringify(file)).brain.effects.length).toBe(brain.effects.length);
    file.brain.effects.push({ cause: { shape: 'blob' }, action: 99, effect: null, strength: 'lots' }, { cause: LEVER, action: ACTIONS.indexOf('rest'), effect: FOOD, strength: 1 });
    expect(parseCreature(JSON.stringify(file)).brain.effects.length).toBe(brain.effects.length);
    world.dispose();
  });
});

describe('older saves', () => {
  it('a version 9 save opens, and its creature starts with no places, moments or chains', () => {
    const world = new World({ seed: BASE + 900 });
    run(world, 5);
    const saved = JSON.parse(world.save());
    saved.version = 9;
    for (const c of saved.creatures) {
      delete c.brain.places;
      delete c.brain.episodes;
      delete c.brain.effects;
    }
    const opened = World.load(JSON.stringify(saved));
    expect(opened.creature.brain.places).toEqual([]);
    expect(opened.creature.brain.effects).toEqual([]);
    run(opened, 5);
    world.dispose();
    opened.dispose();
  });
});
