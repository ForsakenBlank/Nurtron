// creatures only die if you wire it up, with the Die part. nothing here is built in except what dying does.
import { describe, expect, it } from 'vitest';
import { ACTIONS } from '../src/sim/brain.ts';
import { parseCreature, saveCreature } from '../src/sim/creature-file.ts';
import { newPart } from '../src/sim/parts.ts';
import type { Part, PartKind } from '../src/sim/parts.ts';
import { parseRoom } from '../src/sim/room-file.ts';
import { initPhysics, ROOM, TICKS_PER_SECOND, World } from '../src/sim/world.ts';
import type { Thing, ThingSpec } from '../src/sim/world.ts';

await initPhysics();

const MIDDLE = ROOM.width / 2;
const TOUCH = ACTIONS.indexOf('touch');

function part(world: World, kind: PartKind, settings: Partial<Part>, x: number, y: number, extra: Partial<ThingSpec> = {}): Thing {
  const spec = newPart(kind, x, y);
  return world.add({ ...spec, part: { ...spec.part, ...settings }, ...extra });
}

function run(world: World, seconds: number): void {
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) world.step();
}

// exactly as it was described: an Age that goes up, a random number from 70 to 90, and when they're equal, it dies
function oldAge(world: World): { age: Thing } {
  const inside = { inBody: true };
  const age = part(world, 'label', { value: 0 }, 300, 100, { ...inside, name: 'Age' });
  const timer = part(world, 'timer', { seconds: 0.1 }, 100, 100, inside);
  const add = part(world, 'math', { op: 'add', b: 1 }, 300, 200, inside);
  const lifespan = part(world, 'data', { base: 80, spread: 10 }, 100, 300, inside);
  const same = part(world, 'compare', { op: 'equal' }, 500, 300, inside);
  const die = part(world, 'die', {}, 700, 300, inside);
  world.connect(timer.id, 'tick', age.id, 'update');
  world.connect(age.id, 'value', add.id, 'a');
  world.connect(add.id, 'result', age.id, 'set');
  world.connect(age.id, 'value', same.id, 'a');
  world.connect(lifespan.id, 'value', same.id, 'b');
  world.connect(same.id, 'became', die.id, 'die');
  return { age };
}

function untilDead(world: World, seconds: number): boolean {
  for (let i = 0; i < seconds * TICKS_PER_SECOND && !world.creature.dead; i++) world.step();
  return world.creature.dead;
}

describe('wiring up old age', () => {
  it('dies when Age reaches a random number from 70 to 90, and it differs from one creature to the next', () => {
    const ages = new Set<number>();
    for (let seed = 9001; seed < 9021; seed++) {
      const world = new World({ seed, things: [] });
      const { age } = oldAge(world);
      expect(untilDead(world, 30)).toBe(true);
      const at = age.live?.value as number;
      expect(at).toBeGreaterThanOrEqual(70);
      expect(at).toBeLessThanOrEqual(90);
      ages.add(at);
      world.dispose();
    }
    expect(ages.size).toBeGreaterThan(4);
  });

  it('a creature with nothing wired never dies, however long or hungry', () => {
    const world = new World({ seed: 9030, things: [] });
    world.setDrive('Hunger', 100);
    run(world, 300);
    expect(world.creature.dead).toBe(false);
    world.dispose();
  });

  it('dying of old age teaches it nothing, because nothing it did caused it', () => {
    const world = new World({ seed: 9031, things: [] });
    oldAge(world);
    for (let i = 0; i < 100 && !world.creature.doing; i++) world.step();
    const before = JSON.stringify(world.creature.brain.concepts.map((c) => c.w));
    world.setDrive('Hunger', 10);
    world.setDrive('Energy', 90);
    world.creature.brain.learning = true;
    const c = world.creature;
    world.die(c, false);
    expect(c.lastDeath).toMatch(/doesn't know why/);
    expect(JSON.stringify(c.brain.concepts.map((x) => x.w))).toBe(before);
    world.dispose();
  });
});

describe('being dead', () => {
  it('stops doing anything, and nothing ticks inside it', () => {
    const world = new World({ seed: 9040, things: [] });
    run(world, 5);
    world.setDrive('Hunger', 40);
    world.die();
    const decided = (): number => world.takeEvents().filter((e) => e.type === 'decided').length;
    decided();
    run(world, 30);
    expect(decided()).toBe(0);
    expect(world.creature.doing).toBeNull();
    expect(world.drive('Hunger')?.value).toBe(40);
    world.pet();
    world.slap();
    expect(world.tell('rest', null)).toMatch(/dead/);
    world.dispose();
  });

  it('only that one dies, and the others carry on', () => {
    const world = new World({ seed: 9041, things: [] });
    const first = world.creature;
    const second = world.newEgg({}) as NonNullable<ReturnType<World['newEgg']>>;
    second.hatching = 0;
    world.die(first);
    world.takeEvents();
    run(world, 20);
    expect(first.dead).toBe(true);
    expect(second.dead).toBe(false);
    expect(world.takeEvents().some((e) => e.type === 'decided' && e.who === second.id)).toBe(true);
    world.dispose();
  });

  it("an egg can't die, and a button clicked out in the room can't kill anyone", () => {
    const world = new World({ seed: 9042, things: [], egg: true });
    world.die();
    expect(world.creature.dead).toBe(false);
    world.creature.hatching = 0;
    const button = part(world, 'button', {}, 500, 300);
    const die = part(world, 'die', {}, 700, 300);
    world.connect(button.id, 'pressed', die.id, 'die');
    world.pressButton(button.id);
    world.step();
    expect(world.creature.dead).toBe(false);
    world.dispose();
  });
});

describe('coming back', () => {
  it('its body starts over, it picks a new death age, and it can die again', () => {
    const world = new World({ seed: 9050, things: [] });
    const { age } = oldAge(world);
    world.setDrive('Hunger', 40);
    expect(untilDead(world, 30)).toBe(true);
    const c = world.creature;
    const lived = c.brain.concepts.length;
    world.revive();
    expect(c.dead).toBe(false);
    expect(age.live?.value).toBe(0);
    expect(world.drive('Hunger')?.value).toBe(40);
    expect(c.brain.concepts.length).toBeGreaterThanOrEqual(lived);
    run(world, 3);
    expect(world.takeEvents().some((e) => e.type === 'decided')).toBe(true);
    expect(untilDead(world, 30)).toBe(true);
    expect(c.deaths).toBe(2);
    world.dispose();
  });

  it('a Feel part can tell the body it died and came back', () => {
    const world = new World({ seed: 9051, things: [] });
    const inside = { inBody: true };
    const feel = part(world, 'feel', {}, 100, 100, inside);
    const count = part(world, 'label', { value: 0 }, 300, 100, { ...inside, name: 'Lives lost' });
    const give = part(world, 'give', { target: 'Lives lost', amount: 1 }, 300, 200, inside);
    world.connect(feel.id, 'revived', give.id, 'give');
    world.step();
    world.die();
    world.revive();
    world.step();
    expect(count.live?.value).toBe(1);
    world.dispose();
  });

  it('comes through a save and a file, dead or alive', () => {
    const world = new World({ seed: 9052, things: [] });
    world.die();
    const copy = World.load(world.save());
    expect(copy.creature.dead).toBe(true);
    expect(copy.creature.lastDeath).toBe(world.creature.lastDeath);
    copy.revive();
    expect(copy.creature.dead).toBe(false);
    const friend = new World({ seed: 9053, things: [] });
    friend.adoptCreature(parseCreature(saveCreature(world)), friend.creature);
    expect(friend.creature.dead).toBe(true);
    expect(friend.creature.deaths).toBe(1);
    friend.revive();
    run(friend, 5);
    world.dispose();
    copy.dispose();
    friend.dispose();
  });

  it('a tool can hold a Die part, and a file can bring one in', () => {
    const room = parseRoom(JSON.stringify({ type: 'nurtron-room', version: 3, things: [{ name: 'Die', form: 'box', part: { kind: 'die' } }] }));
    expect(room.things[0].part?.kind).toBe('die');
  });
});

describe('what it learns from dying', () => {
  function poisonRoom(seed: number): { world: World; poison: Thing; rock: Thing } {
    const world = new World({ seed, things: [] });
    const poison = world.add({ name: 'Poison', form: 'hexagon', colour: 'purple', hw: 22, hh: 22, x: MIDDLE + 150 });
    const rock = world.add({ name: 'Rock', form: 'box', colour: 'grey', hw: 26, hh: 26, x: MIDDLE - 150, weight: 3 });
    const die = part(world, 'die', {}, 400, 300);
    world.connect(poison.id, 'touched', die.id, 'die');
    return { world, poison, rock };
  }

  it('killed by touching something, it blames that, and stays away once it comes back', () => {
    let learned = 0;
    let died = 0;
    for (let seed = 9100; seed < 9120; seed++) {
      const { world, poison } = poisonRoom(seed);
      if (!untilDead(world, 180)) {
        world.dispose();
        continue;
      }
      died++;
      expect(world.creature.lastDeath).toMatch(/touch the .*purple hexagon/);
      expect(world.creature.lastDeath).toMatch(/thinks it died because/);
      world.revive();
      world.creature.brain.boredom = 0;
      world.takeEvents();
      let again = false;
      for (let i = 0; i < 90 * TICKS_PER_SECOND && !again; i++) {
        world.step();
        again = world.takeEvents().some((e) => e.type === 'touched' && e.thingId === poison.id);
      }
      if (!again) learned++;
      world.dispose();
    }
    expect(died).toBeGreaterThanOrEqual(16);
    expect(learned / died).toBeGreaterThanOrEqual(0.8);
  });

  it('starved, it blames what it was doing and cares more about what would have helped', () => {
    const world = new World({ seed: 9130 });
    for (let i = 0; i < 200; i++) {
      world.setDrive('Hunger', 70);
      world.step();
    }
    const brain = world.creature.brain;
    const food = brain.driveNames.indexOf('Hunger') + 1;
    brain.fire({ shape: 'circle', colour: 'red', size: 'small', moving: false, near: 'close' });
    const redCircle = brain.concepts.length - 1;
    brain.concepts[redCircle].w[TOUCH * brain.channels + food] = 0.3;
    const inside = { inBody: true };
    const label = world.circuit.labelNamed('Hunger') as Thing;
    const low = part(world, 'compare', { op: 'bigger', b: 99 }, 100, 100, inside);
    const die = part(world, 'die', {}, 300, 100, inside);
    world.connect(label.id, 'value', low.id, 'a');
    world.connect(low.id, 'became', die.id, 'die');
    world.step();
    const before = brain.concepts[redCircle].w[TOUCH * brain.channels + food];
    world.setDrive('Hunger', 100);
    world.step();
    world.step();
    expect(world.creature.dead).toBe(true);
    expect(world.creature.lastDeath).toMatch(/needing Hunger/);
    expect(brain.concepts[redCircle].w[TOUCH * brain.channels + food]).toBeGreaterThan(before + 0.1);
    world.dispose();
  });
});
