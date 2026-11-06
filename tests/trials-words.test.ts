// milestone 6's test: a creature can be taught to come when called, and to solve a friend's Trial.
import { describe, expect, it } from 'vitest';
import { parseCreature, saveCreature } from '../src/sim/creature-file.ts';
import { newPart } from '../src/sim/parts.ts';
import type { Part, PartKind } from '../src/sim/parts.ts';
import { parseTrial, saveTrial } from '../src/sim/trial-file.ts';
import { initPhysics, ROOM, TICKS_PER_SECOND, World } from '../src/sim/world.ts';
import type { Thing, ThingSpec } from '../src/sim/world.ts';

await initPhysics();

const MIDDLE = ROOM.width / 2;
const FLOOR = ROOM.floor;

function part(world: World, kind: PartKind, settings: Partial<Part> = {}, x = 300, y = 300, extra: Partial<ThingSpec> = {}): Thing {
  const spec = newPart(kind, x, y);
  return world.add({ ...spec, part: { ...spec.part, ...settings }, ...extra });
}

function reachedVoice(world: World, word: string, seconds: number): boolean {
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) {
    world.step();
    if (world.takeEvents().some((e) => e.type === 'touched' && e.name === word)) return true;
  }
  return false;
}

// calls it, and pets it when it gets there. nothing else
function teachToCome(world: World, word: string, times: number): void {
  for (let i = 0; i < times; i++) {
    const x = world.creature.x + (i % 2 ? 260 : -260);
    world.say(word, Math.max(60, Math.min(ROOM.width - 60, x)), FLOOR - 40);
    if (reachedVoice(world, word, 8)) {
      world.step();
      world.pet();
    }
    for (let w = 0; w < 30; w++) world.step();
    world.takeEvents();
  }
}

describe('words', () => {
  it('a word is heard for a while and then fades, and hangs in the air where it was said', () => {
    const world = new World({ seed: 9400, things: [] });
    world.say('Fruit', 500, 500);
    const heard = world.creature.brain.driveNames.indexOf('"fruit"');
    expect(heard).toBeGreaterThanOrEqual(0);
    expect(world.needs()[heard]).toBe(1);
    expect(world.things.some((t) => t.voice && t.name === 'fruit')).toBe(true);
    for (let i = 0; i < 9 * TICKS_PER_SECOND; i++) world.step();
    expect(world.needs()[heard]).toBe(0);
    expect(world.things.some((t) => t.voice)).toBe(false);
    world.dispose();
  });

  it("it doesn't count as feeling anything, and doesn't go in files", () => {
    const world = new World({ seed: 9401, things: [] });
    world.setDrive('Hunger', 10);
    world.setDrive('Energy', 90);
    world.step();
    const before = world.worstNeed();
    world.say('hello', 500, 500);
    expect(world.worstNeed()).toBe(before);
    expect(world.roomForFile().things).toHaveLength(0);
    world.dispose();
  });

  it('can be taught to come when called', () => {
    let taughtCame = 0;
    let otherWordCame = 0;
    let untaughtCame = 0;
    const seeds = Array.from({ length: 20 }, (_, i) => 9410 + i);
    for (const seed of seeds) {
      const world = new World({ seed, things: [{ name: 'Rock', form: 'box', colour: 'grey', hw: 26, hh: 26, x: MIDDLE - 400, weight: 3 }] });
      teachToCome(world, 'pip', 8);
      const test = (w: World, word: string): boolean => {
        const copy = World.load(w.save());
        copy.creature.brain.learning = false;
        copy.interrupt();
        copy.placeCreature(MIDDLE);
        copy.say(word, MIDDLE + 500, FLOOR - 40);
        const came = reachedVoice(copy, word, 8);
        copy.dispose();
        return came;
      };
      if (test(world, 'pip')) taughtCame++;
      if (test(world, 'zebra')) otherWordCame++;
      const never = new World({ seed: seed + 500, things: [{ name: 'Rock', form: 'box', colour: 'grey', hw: 26, hh: 26, x: MIDDLE - 400, weight: 3 }] });
      if (test(never, 'pip')) untaughtCame++;
      world.dispose();
      never.dispose();
    }
    console.log(`Came when called: taught ${taughtCame}/20, a word it never learned ${otherWordCame}/20, never taught ${untaughtCame}/20`);
    expect(taughtCame / seeds.length).toBeGreaterThanOrEqual(0.8);
    expect(taughtCame).toBeGreaterThan(untaughtCame + 4);
  }, 120000);

  it('what it knows about a word goes with it to another PC', () => {
    const world = new World({ seed: 9440, things: [] });
    teachToCome(world, 'pip', 6);
    const friend = new World({ seed: 9441, things: [] });
    friend.adoptCreature(parseCreature(saveCreature(world)), friend.creature);
    expect(friend.creature.brain.driveNames).toContain('"pip"');
    world.dispose();
    friend.dispose();
  });

  it('it can say a word back, once it connects one with what it did', () => {
    const world = new World({ seed: 9442, things: [] });
    const fruit = world.add({ name: 'Fruit', form: 'circle', colour: 'red', hw: 14, hh: 14, x: MIDDLE + 150, give: { drive: 'Hunger', amount: -25 } });
    // says "fruit" every time it eats, until touching and that word go together
    for (let i = 0; i < 6; i++) {
      world.setDrive('Hunger', 75);
      world.say('fruit', fruit.x, fruit.y - 60);
      world.tell('touch', fruit.id);
      for (let t = 0; t < 12 * TICKS_PER_SECOND && (world.creature.doing?.told || world.creature.orders.length); t++) world.step();
      world.takeEvents();
    }
    world.tell('touch', fruit.id);
    world.tell('call', null);
    let said = '';
    for (let i = 0; i < 20 * TICKS_PER_SECOND && !said; i++) {
      world.step();
      for (const e of world.takeEvents()) if (e.type === 'said' && e.by === world.creature.id) said = e.word;
    }
    expect(said).toBe('fruit');
    world.dispose();
  });

  it('Say and Hear let wires talk and listen, including to a creature', () => {
    const world = new World({ seed: 9443, things: [] });
    const button = part(world, 'button');
    const say = part(world, 'say', { word: 'Dinner' }, 500, 500);
    const hear = part(world, 'hear', { word: 'dinner' });
    const count = part(world, 'label', { value: 0 });
    const add = part(world, 'math', { op: 'add', b: 1 });
    world.connect(button.id, 'pressed', say.id, 'say');
    world.connect(hear.id, 'heard', count.id, 'update');
    world.connect(count.id, 'value', add.id, 'a');
    world.connect(add.id, 'result', count.id, 'set');
    world.pressButton(button.id);
    for (let i = 0; i < 4; i++) world.step();
    expect(count.live?.value).toBe(1);
    expect(world.creature.brain.driveNames).toContain('"dinner"');
    world.dispose();
  });

  it('there is room for plenty of words, and a limit', () => {
    const world = new World({ seed: 9444, things: [] });
    for (let i = 0; i < 80; i++) world.say(`word${i}`, 500, 500);
    expect(world.creature.brain.driveNames.length).toBeLessThanOrEqual(48);
    for (let i = 0; i < 60; i++) world.step();
    world.dispose();
  });
});

// a friend's Trial: a fruit up on a block, across a gap, with a Goal that goes off when it's eaten
function friendsTrial(): string {
  const maker = new World({ seed: 9500, things: [] });
  part(maker, 'start', {}, MIDDLE - 400, FLOOR - 40);
  maker.add({ name: 'Block', form: 'box', colour: 'grey', hw: 70, hh: 20, x: MIDDLE - 180, y: FLOOR - 70, fixed: true });
  maker.add({ name: 'Block', form: 'box', colour: 'grey', hw: 70, hh: 20, x: MIDDLE + 40, y: FLOOR - 70, fixed: true });
  const fruit = maker.add({ name: 'Fruit', form: 'circle', colour: 'red', hw: 14, hh: 14, x: MIDDLE + 40, y: FLOOR - 104, fixed: true });
  const give = part(maker, 'give', { target: 'Hunger', amount: -25 });
  const goal = part(maker, 'goal');
  maker.connect(fruit.id, 'touched', give.id, 'give');
  maker.connect(fruit.id, 'touched', goal.id, 'reached');
  maker.add({ name: 'Rock', form: 'box', colour: 'grey', hw: 26, hh: 26, x: MIDDLE - 500, weight: 3 });
  const text = saveTrial(maker, 'Over the gap', 'Get the food across the gap.');
  maker.dispose();
  return text;
}

function raised(seed: number): World {
  const world = new World({ seed, things: [], name: 'Pip' });
  const fruit = world.add({ name: 'Fruit', form: 'circle', colour: 'red', hw: 14, hh: 14, x: MIDDLE + 170, eaten: true, respawnSeconds: 12 });
  const give = part(world, 'give', { target: 'Hunger', amount: -20 });
  world.connect(fruit.id, 'touched', give.id, 'give');
  for (let meal = 0; meal < 4; meal++) {
    world.setDrive('Hunger', 65);
    for (let i = 0; i < 120 * TICKS_PER_SECOND; i++) {
      world.step();
      if (world.takeEvents().some((e) => e.type === 'touched' && e.ate)) break;
    }
  }
  return world;
}

describe('trials', () => {
  it('a creature raised somewhere else solves a friend\'s Trial, by itself', () => {
    const trial = parseTrial(friendsTrial());
    expect(trial.name).toBe('Over the gap');
    let solved = 0;
    const seeds = Array.from({ length: 20 }, (_, i) => 9510 + i);
    for (const seed of seeds) {
      const world = raised(seed);
      world.startTrial(trial);
      world.setDrive('Hunger', 75);
      let done = false;
      for (let i = 0; i < 120 * TICKS_PER_SECOND && !done; i++) {
        world.step();
        done = world.takeEvents().some((e) => e.type === 'solved');
      }
      if (done) solved++;
      world.dispose();
    }
    console.log(`Solved a friend's Trial: ${solved}/20`);
    expect(solved / seeds.length).toBeGreaterThanOrEqual(0.8);
  }, 120000);

  it('you get your own room back afterwards, and it counts tries', () => {
    const world = new World({ seed: 9540, things: [] });
    const mine = world.add({ name: 'Mine', form: 'box', colour: 'blue', hw: 30, hh: 30, x: 700 });
    const trial = parseTrial(friendsTrial());
    world.startTrial(trial);
    expect(world.things.some((t) => t.name === 'Mine')).toBe(false);
    expect(world.things.some((t) => t.part?.kind === 'goal')).toBe(true);
    expect(world.creature.x).toBeCloseTo(MIDDLE - 400, 0);
    world.retryTrial();
    expect(world.trial?.attempts).toBe(2);
    const copy = World.load(world.save());
    expect(copy.trial?.name).toBe('Over the gap');
    copy.leaveTrial();
    expect(copy.things.some((t) => t.name === 'Mine')).toBe(true);
    expect(copy.trial).toBeNull();
    world.leaveTrial();
    expect(world.things.find((t) => t.name === 'Mine')?.x).toBeCloseTo(mine.x, 0);
    world.dispose();
    copy.dispose();
  });

  it('a Trial with nothing in it is turned away, and a stranger can\'t reach past the checks', () => {
    expect(() => parseTrial(JSON.stringify({ type: 'nurtron-trial', version: 1, room: { things: [] } }))).toThrow(/nothing in it/);
    expect(() => parseTrial('nonsense')).toThrow(/isn't a Nurtron Trial/);
    expect(() => parseTrial(JSON.stringify({ type: 'nurtron-trial', version: 99 }))).toThrow(/newer version/);
    const clean = parseTrial(JSON.stringify({ type: 'nurtron-trial', version: 1, name: 'x'.repeat(999), about: 'y'.repeat(999), room: { things: [{ form: 'box', part: { kind: 'drive' } }] } }));
    expect(clean.name.length).toBeLessThanOrEqual(40);
    expect(clean.about.length).toBeLessThanOrEqual(200);
    expect(clean.room.things[0].part).toBeUndefined();
  });
});
