// milestone 3's real test is the plan's "first 10 minutes", so this plays through it step by step, the way a person
// would, on creatures never used for tuning. nothing here reaches inside: it only builds with wires, pets and slaps.
import { describe, expect, it } from 'vitest';
import { WIRED_FRUIT } from '../src/sim/examples.ts';
import { newPart } from '../src/sim/parts.ts';
import type { Part, PartKind } from '../src/sim/parts.ts';
import { parseRoom, saveRoom } from '../src/sim/room-file.ts';
import { initPhysics, ROOM, TICKS_PER_SECOND, World } from '../src/sim/world.ts';
import type { Thing, ThingSpec } from '../src/sim/world.ts';

await initPhysics();

const SEEDS = Array.from({ length: 20 }, (_, i) => 5001 + i);
const MIDDLE = ROOM.width / 2;

function part(world: World, kind: PartKind, settings: Partial<Part>, x: number, y: number, extra: Partial<ThingSpec> = {}): Thing {
  const spec = newPart(kind, x, y);
  return world.add({ ...spec, part: { ...spec.part, ...settings }, ...extra });
}

function redCircle(world: World, x: number, extra: Partial<ThingSpec> = {}): Thing {
  return world.add({ name: 'Red circle', form: 'circle', colour: 'red', hw: 14, hh: 14, x, ...extra });
}

// a red circle wired to a Give, exactly as the plan's first 10 minutes has you build it
function buildFruit(world: World, x: number): { fruit: Thing; give: Thing } {
  const fruit = redCircle(world, x, { eaten: true, respawnSeconds: 12 });
  const give = part(world, 'give', { target: 'Hunger', amount: -20 }, x, 300);
  expect(world.connect(fruit.id, 'touched', give.id, 'give')).not.toBeNull();
  return { fruit, give };
}

// runs until something happens, and says when
function until(world: World, seconds: number, happened: (event: ReturnType<World['takeEvents']>[number]) => boolean): boolean {
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) {
    world.step();
    if (world.takeEvents().some(happened)) return true;
  }
  return false;
}

describe('the first 10 minutes', () => {
  it('1 and 2: an egg hatches, and its Food bar drops by itself, through real wires', () => {
    const world = new World({ seed: 5001, things: [], egg: true });
    expect(world.creature.hatching).toBeGreaterThan(0);
    const startX = world.creature.x;
    expect(until(world, 10, (e) => e.type === 'hatched')).toBe(true);
    expect(world.creature.x).toBe(startX); // it didn't go anywhere from inside the egg

    const before = world.drive('Hunger')?.value as number;
    for (let i = 0; i < 20 * TICKS_PER_SECOND; i++) world.step();
    expect(world.drive('Hunger')?.value).toBeGreaterThan(before);
    world.dispose();
  });

  it('3 to 5: a wired fruit feeds it, it gets praised, and it walks straight to the next one', () => {
    let bumped = 0;
    let learned = 0;
    let hungry = 0;
    for (const seed of SEEDS) {
      const world = new World({ seed, things: [], egg: false });
      world.setDrive('Hunger', 70);
      const { give } = buildFruit(world, MIDDLE + 170);
      // it bumps into it by accident before long, and that alone feeds it. you pet it a moment later.
      const ate = until(world, 120, (e) => e.type === 'touched' && e.ate);
      if (ate) bumped++;
      const food = world.drive('Hunger')?.value as number;
      expect(food).toBeGreaterThan(30);
      for (let i = 0; i < 20; i++) world.step();
      world.pet();

      // a few more meals, the way the plan goes, then a fresh fruit on the far side and a rock on the near one
      for (let meal = 0; meal < 3; meal++) {
        world.setDrive('Hunger', 65);
        until(world, 120, (e) => e.type === 'touched' && e.ate);
      }
      world.remove(give.id);
      world.clearThings();
      world.setDrive('Hunger', 75);
      hungry++;
      const copy = World.load(world.save());
      copy.interrupt();
      copy.placeCreature(MIDDLE);
      const next = buildFruit(copy, MIDDLE + 300);
      const rock = copy.add({ name: 'Rock', form: 'box', colour: 'grey', hw: 26, hh: 26, x: MIDDLE - 300, weight: 3 });
      let chose: 'fruit' | 'rock' | null = null;
      for (let i = 0; i < 30 * TICKS_PER_SECOND && !chose; i++) {
        copy.step();
        for (const event of copy.takeEvents()) {
          if (event.type !== 'touched') continue;
          if (event.thingId === next.fruit.id) chose = 'fruit';
          if (event.thingId === rock.id) chose = 'rock';
        }
      }
      if (chose === 'fruit') learned++;
      world.dispose();
      copy.dispose();
    }
    expect(bumped).toBe(SEEDS.length);
    expect(learned / hungry).toBeGreaterThanOrEqual(0.8);
  });

  it('the fruit comes back still wired up, however many times it gets eaten', () => {
    const world = new World({ seed: 5002, things: [] });
    const { fruit } = buildFruit(world, MIDDLE + 120);
    let meals = 0;
    for (let i = 0; i < 180 * TICKS_PER_SECOND && meals < 4; i++) {
      world.setDrive('Hunger', 80);
      world.step();
      for (const event of world.takeEvents()) if (event.type === 'touched' && event.thingId === fruit.id && event.ate) meals++;
    }
    expect(meals).toBe(4);
    world.dispose();
  });

  it('6: it tries a red ball because it looks like food, and a slap stops it', () => {
    let tried = 0;
    let stopped = 0;
    for (const seed of SEEDS) {
      const world = new World({ seed, things: [] });
      buildFruit(world, MIDDLE + 170);
      for (let meal = 0; meal < 4; meal++) {
        world.setDrive('Hunger', 65);
        until(world, 120, (e) => e.type === 'touched' && e.ate);
      }
      const ball = world.add({ name: 'Red ball', form: 'circle', colour: 'red', hw: 26, hh: 26, x: MIDDLE - 170 });
      world.setDrive('Hunger', 65);
      if (!until(world, 120, (e) => e.type === 'touched' && e.thingId === ball.id)) continue;
      tried++;
      let slaps = 0;
      let left = false;
      while (slaps < 3 && !left) {
        for (let i = 0; i < 12; i++) world.step();
        world.slap();
        slaps++;
        world.setDrive('Hunger', 40);
        left = !until(world, 60, (e) => e.type === 'touched' && e.thingId === ball.id);
      }
      if (left) stopped++;
      world.dispose();
    }
    expect(tried).toBeGreaterThanOrEqual(SEEDS.length * 0.8);
    expect(stopped / tried).toBeGreaterThanOrEqual(0.8);
  });

  it('7: a Button can drop a fruit from a shelf with a Motor', () => {
    const world = new World({ seed: 5003, things: [] });
    world.placeCreature(200);
    world.creature.pause = 1e9;
    const shelf = world.add({ name: 'Shelf', form: 'box', colour: 'grey', hw: 40, hh: 8, x: 1000, y: 500, fixed: true });
    const fruit = redCircle(world, 1000, { y: 480 });
    const motor = part(world, 'motor', { mode: 'push', direction: 0, power: 50 }, 1200, 300);
    const button = part(world, 'button', {}, 1400, 300);
    world.connect(motor.id, 'drives', fruit.id, 'body');
    world.connect(button.id, 'pressed', motor.id, 'kick');
    for (let i = 0; i < 60; i++) world.step();
    expect(fruit.y).toBeLessThan(shelf.y);
    world.pressButton(button.id);
    for (let i = 0; i < 90; i++) world.step();
    expect(fruit.y).toBeGreaterThan(ROOM.floor - 30);
    world.dispose();
  });
});

describe('using what you build', () => {
  it('learns to press a Button that feeds it', () => {
    let learned = 0;
    for (const seed of SEEDS) {
      const world = new World({ seed, things: [{ name: 'Rock', form: 'box', colour: 'grey', hw: 26, hh: 26, x: MIDDLE - 170, weight: 3 }] });
      const button = part(world, 'button', {}, MIDDLE + 170, ROOM.floor - 30);
      const give = part(world, 'give', { target: 'Hunger', amount: -25 }, MIDDLE + 170, 300);
      world.connect(button.id, 'pressed', give.id, 'give');
      for (let i = 0; i < 4; i++) {
        world.setDrive('Hunger', 65);
        until(world, 120, (e) => e.type === 'touched' && e.thingId === button.id);
      }
      const copy = World.load(world.save());
      copy.creature.brain.learning = false;
      copy.interrupt();
      copy.setDrive('Hunger', 75);
      copy.placeCreature(MIDDLE);
      copy.update(button.id, { x: MIDDLE + 300 });
      copy.update(copy.things.find((t) => t.name === 'Rock')?.id as number, { x: MIDDLE - 300 });
      let chose = '';
      for (let i = 0; i < 30 * TICKS_PER_SECOND && !chose; i++) {
        copy.step();
        for (const event of copy.takeEvents()) if (event.type === 'touched' && !chose) chose = event.name;
      }
      if (chose === 'Button') learned++;
      world.dispose();
      copy.dispose();
    }
    expect(learned / SEEDS.length).toBeGreaterThanOrEqual(0.8);
  });
});

describe('wiring up a body of your own', () => {
  // "plug in any label and the creature now cares about it, even if you've named it Loneliness or Disco."
  function discoWorld(seed: number): { world: World; square: Thing } {
    const world = new World({ seed, things: [], body: 'blank' });
    const inBody = { inBody: true };
    const disco = part(world, 'label', { value: 20, min: 0, max: 100 }, 800, 300, { ...inBody, name: 'Disco' });
    const socket = part(world, 'drive', { wants: 'high' }, 1000, 300, { ...inBody, name: 'Disco' });
    world.connect(disco.id, 'value', socket.id, 'value');
    const square = world.add({ name: 'Disco ball', form: 'hexagon', colour: 'blue', hw: 22, hh: 22, x: MIDDLE + 170, fixed: false });
    const give = part(world, 'give', { target: 'Disco', amount: 40 }, 1300, 300);
    world.connect(square.id, 'touched', give.id, 'give');
    world.add({ name: 'Rock', form: 'box', colour: 'grey', hw: 26, hh: 26, x: MIDDLE - 170, weight: 3 });
    return { world, square };
  }

  it('a creature learns to want something it has never heard of', () => {
    let learned = 0;
    for (const seed of SEEDS) {
      const { world, square } = discoWorld(seed);
      expect(world.creature.brain.driveNames).toEqual(['Disco']);
      for (let i = 0; i < 4; i++) {
        world.setDrive('Disco', 20);
        until(world, 120, (e) => e.type === 'touched' && e.thingId === square.id);
      }
      world.setDrive('Disco', 15);
      const copy = World.load(world.save());
      copy.creature.brain.learning = false;
      copy.interrupt();
      copy.placeCreature(MIDDLE);
      const copySquare = copy.things.find((t) => t.name === 'Disco ball') as Thing;
      const copyRock = copy.things.find((t) => t.name === 'Rock') as Thing;
      copy.update(copySquare.id, { x: MIDDLE + 300 });
      copy.update(copyRock.id, { x: MIDDLE - 300 });
      let chose = '';
      for (let i = 0; i < 30 * TICKS_PER_SECOND && !chose; i++) {
        copy.step();
        for (const event of copy.takeEvents()) if (event.type === 'touched' && !chose) chose = event.name;
      }
      if (chose === 'Disco ball') learned++;
      world.dispose();
      copy.dispose();
    }
    expect(learned / SEEDS.length).toBeGreaterThanOrEqual(0.8);
  });

  it('with a blank body it has no needs at all, and is still curious', () => {
    const world = new World({ seed: 5004, body: 'blank' });
    expect(world.creature.drives).toEqual([]);
    expect(world.needs()).toEqual([]);
    expect(until(world, 120, (e) => e.type === 'touched')).toBe(true);
    world.dispose();
  });

  it('wanting something low works, and a pet can take it down', () => {
    const world = new World({ seed: 5005, things: [], body: 'blank' });
    const inBody = { inBody: true };
    const lonely = part(world, 'label', { value: 90, min: 0, max: 100 }, 800, 300, { ...inBody, name: 'Loneliness' });
    const socket = part(world, 'drive', { wants: 'low' }, 1000, 300, { ...inBody, name: 'Loneliness' });
    const feel = part(world, 'feel', {}, 600, 300, inBody);
    const give = part(world, 'give', { target: 'Loneliness', amount: -30 }, 800, 400, inBody);
    world.connect(lonely.id, 'value', socket.id, 'value');
    world.connect(feel.id, 'petted', give.id, 'give');
    world.step();
    expect(world.worstNeed()).toBeCloseTo(0.9);
    world.pet();
    world.step();
    world.step();
    expect(world.drive('Loneliness')?.value).toBe(60);
    expect(world.worstNeed()).toBeCloseTo(0.6);
    world.dispose();
  });

  it('wanting something near a number feels best right on it', () => {
    const world = new World({ seed: 5006, things: [], body: 'blank' });
    const inBody = { inBody: true };
    const warmth = part(world, 'label', { value: 50 }, 800, 300, { ...inBody, name: 'Warmth' });
    const socket = part(world, 'drive', { wants: 'near', aim: 50, scale: 100 }, 1000, 300, { ...inBody, name: 'Warmth' });
    world.connect(warmth.id, 'value', socket.id, 'value');
    world.step();
    expect(world.worstNeed()).toBeCloseTo(0);
    world.setDrive('Warmth', 90);
    expect(world.worstNeed()).toBeCloseTo(0.4);
    world.setDrive('Warmth', 10);
    expect(world.worstNeed()).toBeCloseTo(0.4);
    world.dispose();
  });

  it('a nerve is information: it feels nothing, but it can learn what to do when it is on', () => {
    const train = (seed: number): number => {
      const world = new World({ seed, things: [{ name: 'Rock', form: 'box', colour: 'grey', hw: 26, hh: 26, x: MIDDLE - 200, weight: 3 }], body: 'blank' });
      const light = part(world, 'label', { value: 1 }, 800, 300, { inBody: true, name: 'Light' });
      const socket = part(world, 'nerve', {}, 1000, 300, { inBody: true, name: 'Light' });
      world.connect(light.id, 'value', socket.id, 'value');
      world.step();
      expect(world.worstNeed()).toBe(0); // being on doesn't bother it
      // pet it for calling out, but only ever while the light is on
      let pets = 0;
      for (let i = 0; i < 900 * TICKS_PER_SECOND && pets < 8; i++) {
        world.step();
        if (world.takeEvents().some((e) => e.type === 'called')) {
          for (let w = 0; w < 10; w++) world.step();
          world.pet();
          pets++;
        }
      }
      const rate = (on: number): number => {
        const copy = World.load(world.save());
        copy.creature.brain.learning = false;
        copy.interrupt();
        copy.setDrive('Light', on);
        let calls = 0;
        let total = 0;
        for (let i = 0; i < 90 * TICKS_PER_SECOND; i++) {
          copy.step();
          for (const event of copy.takeEvents()) {
            if (event.type === 'decided') total++;
            if (event.type === 'called') calls++;
          }
        }
        copy.dispose();
        return total ? calls / total : 0;
      };
      const difference = rate(1) - rate(0);
      world.dispose();
      return difference;
    };
    const differences = SEEDS.slice(0, 8).map(train);
    const mean = differences.reduce((s, v) => s + v, 0) / differences.length;
    expect(mean).toBeGreaterThan(0.05);
  });

  it('removing a socket stops it mattering, and putting it back remembers what it learned', () => {
    const world = new World({ seed: 5007 });
    const socket = world.things.find((t) => t.part?.kind === 'drive' && t.name === 'Hunger') as Thing;
    const brain = world.creature.brain;
    brain.concepts[0].w[1] = 0.7; // channel 1 is Food
    const spec = { ...socket };
    world.setDrive('Hunger', 100);
    expect(world.worstNeed()).toBe(1);
    world.remove(socket.id);
    expect(world.drive('Hunger')).toBeUndefined();
    expect(world.needs()[0]).toBe(0);
    expect(brain.driveNames).toContain('Hunger');
    const back = world.add({ ...newPart('drive', spec.x, spec.y), part: { kind: 'drive', wants: 'low', scale: 100 }, name: 'Hunger', inBody: true });
    const label = world.circuit.labelNamed('Hunger') as Thing;
    world.connect(label.id, 'value', back.id, 'value');
    world.step();
    expect(world.worstNeed()).toBe(1);
    expect(brain.concepts[0].w[1]).toBe(0.7);
    world.dispose();
  });

  it('renaming a socket keeps what it learned under the new name', () => {
    const world = new World({ seed: 5008 });
    const socket = world.things.find((t) => t.part?.kind === 'drive' && t.name === 'Hunger') as Thing;
    world.update(socket.id, { name: 'Snacks' });
    expect(world.creature.brain.driveNames).toEqual(['Snacks', 'Energy']);
    expect(world.drive('Snacks')).toBeDefined();
    world.dispose();
  });

  it('a new socket added later grows the brain without disturbing what it knows', () => {
    const world = new World({ seed: 5009 });
    for (let i = 0; i < 60 * TICKS_PER_SECOND; i++) world.step();
    world.takeEvents();
    const brain = world.creature.brain;
    const before = brain.concepts.map((c) => brain.link(brain.concepts.indexOf(c), 2, 1));
    const label = part(world, 'label', { value: 10 }, 800, 100, { inBody: true, name: 'Disco' });
    const socket = part(world, 'drive', {}, 1000, 100, { inBody: true, name: 'Disco' });
    world.connect(label.id, 'value', socket.id, 'value');
    expect(brain.driveNames).toEqual(['Hunger', 'Energy', 'Disco']);
    const after = brain.concepts.map((c) => brain.link(brain.concepts.indexOf(c), 2, 1));
    expect(after).toEqual(before);
    for (let i = 0; i < 60 * TICKS_PER_SECOND; i++) world.step();
    const copy = World.load(world.save());
    expect(copy.creature.brain.channels).toBe(brain.channels);
    expect(copy.drive('Disco')?.value).toBe(10);
    copy.dispose();
    world.dispose();
  });
});

describe('what counts as the creature doing something', () => {
  it("hunger ticking down doesn't teach it anything, however long the action", () => {
    const world = new World({ seed: 5010, things: [] });
    world.creature.brain.learning = true;
    const log: number[] = [];
    const brain = world.creature.brain;
    const real = brain.rewardDrive.bind(brain);
    brain.rewardDrive = (d, amount, tick, tps) => {
      log.push(amount);
      real(d, amount, tick, tps);
    };
    for (let i = 0; i < 300 * TICKS_PER_SECOND; i++) world.step();
    // the only rewards in an empty room come from resting, which is what brings energy back
    expect(log.every((amount) => amount > 0)).toBe(true);
    world.dispose();
  });

  it('a Give set off by touching counts for the touch, straight away', () => {
    const world = new World({ seed: 5011, things: [] });
    world.setDrive('Hunger', 80);
    buildFruit(world, MIDDLE + 120);
    const brain = world.creature.brain;
    const rewards: number[] = [];
    const real = brain.rewardDrive.bind(brain);
    brain.rewardDrive = (d, amount, tick, tps) => {
      if (d === 0) rewards.push(amount);
      real(d, amount, tick, tps);
    };
    until(world, 120, (e) => e.type === 'touched' && e.ate);
    expect(rewards.length).toBeGreaterThan(0);
    expect(rewards[0]).toBeGreaterThan(0);
    world.dispose();
  });

  it('a bad Give teaches it to stay away', () => {
    const world = new World({ seed: 5012, things: [] });
    const poison = redCircle(world, MIDDLE + 120, { name: 'Poison' });
    const give = part(world, 'give', { target: 'Hunger', amount: 30 }, MIDDLE, 300);
    world.connect(poison.id, 'touched', give.id, 'give');
    until(world, 120, (e) => e.type === 'touched');
    const c = world.creature.brain.closest(world.perceive(poison)) as number;
    expect(world.creature.brain.link(c, 2, 1)).toBeLessThan(0);
    world.dispose();
  });
});

describe('saving a body', () => {
  it('its body circuit, hunger and egg all come back from a save', () => {
    const world = new World({ seed: 5013, egg: true });
    for (let i = 0; i < 30; i++) world.step();
    const copy = World.load(world.save());
    expect(copy.creature.hatching).toBe(world.creature.hatching);
    expect(copy.things.filter((t) => t.inBody).length).toBe(world.things.filter((t) => t.inBody).length);
    expect(copy.drive('Hunger')?.value).toBe(world.drive('Hunger')?.value);
    expect(copy.circuit.labelNames()).toEqual(['Hunger', 'Energy']);
    world.dispose();
    copy.dispose();
  });

  it("a room file never includes what's inside the creature, and can't put anything in there", () => {
    const world = new World({ seed: 5014, things: [] });
    world.addRoom(WIRED_FRUIT, 900, 500);
    const saved = saveRoom(world);
    expect(saved).not.toContain('Getting hungry');
    const parsed = parseRoom(saved);
    expect(parsed.things).toHaveLength(2);
    expect(parsed.wires).toHaveLength(1);

    const hostile = parseRoom(JSON.stringify({
      type: 'nurtron-room',
      version: 2,
      things: [
        { name: 'Sneaky', form: 'box', hw: 30, inBody: true, part: { kind: 'drive', wants: 'high' } },
        { name: 'Fake', form: 'box', hw: 30, part: { kind: 'action', action: 'rest' } },
        { name: 'Many', form: 'box', hw: 30, part: { kind: 'nerve' } },
      ],
    }));
    expect(hostile.things[0].inBody).toBeUndefined();
    expect(hostile.things[0].part).toBeUndefined();
    expect(hostile.things[1].part).toBeUndefined();
    expect(hostile.things[2].part?.kind).toBe('nerve');
    world.dispose();
  });

  it('a room full of nerve sockets can only grow the brain so far', () => {
    const world = new World({ seed: 5015, things: [] });
    for (let i = 0; i < 60; i++) world.add({ ...newPart('nerve', 100 + i, 100), name: `Nerve ${i}` });
    expect(world.creature.brain.driveNames.length).toBeLessThanOrEqual(24);
    for (let i = 0; i < 60; i++) world.step();
    world.dispose();
  });

  it('clearing the room leaves what is inside the creature alone', () => {
    const world = new World({ seed: 5016 });
    world.clearThings();
    expect(world.things.every((t) => t.inBody)).toBe(true);
    expect(world.drive('Hunger')).toBeDefined();
    world.dispose();
  });
});
