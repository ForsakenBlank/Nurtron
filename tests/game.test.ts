// what makes a world into a game: build areas, items, chests, Storage, health, enemies, Abilities, Effects, Choices,
// Movers, Chance, Combine and decorations
import { describe, expect, it } from 'vitest';
import { DECOR, newDecor } from '../src/sim/decor.ts';
import { DEFAULT_ENEMY } from '../src/sim/game.ts';
import { newPart } from '../src/sim/parts.ts';
import type { Part, PartKind } from '../src/sim/parts.ts';
import { parseRoom, saveRoom } from '../src/sim/room-file.ts';
import { AREA_MIDDLE, initPhysics, poseAt, ROOM, TICKS_PER_SECOND, World } from '../src/sim/world.ts';
import type { Thing, ThingSpec } from '../src/sim/world.ts';

await initPhysics();

const FLOOR = ROOM.floor;

function part(world: World, kind: PartKind, settings: Partial<Part> = {}, x = 300, y = 300, extra: Partial<ThingSpec> = {}): Thing {
  const spec = newPart(kind, x, y);
  return world.add({ ...spec, part: { ...spec.part, ...settings }, ...extra });
}

function box(world: World, x: number, extra: Partial<ThingSpec> = {}): Thing {
  return world.add({ name: 'Box', form: 'box', colour: 'red', hw: 16, hh: 16, x, ...extra });
}

function emptyRoom(seed: number, away = true): World {
  const world = new World({ seed, things: [], body: 'blank' });
  world.setCreaturesAway(away);
  return world;
}

// a creature that only has Health, standing still, so what happens to it is down to what's being tested
function withHealth(seed: number): World {
  const world = new World({ seed, things: [], stats: ['health'] });
  world.creature.hatching = 0;
  return world;
}

const health = (world: World): number => Number(world.circuit.labelNamed('Health')?.live?.value ?? 0);

function run(world: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) world.step();
}

// counts the pulses coming out of a port, by wiring it to a Storage
function counter(world: World, from: Thing, port: string, name: string): () => number {
  const store = part(world, 'storage', { start: 0 }, 1500, 200, { name, inBody: from.inBody });
  world.connect(from.id, port, store.id, 'add');
  return () => world.stores[name.toLowerCase()] ?? 0;
}

describe('chance and combine', () => {
  it('Chance gives each output about as often as it says, and none the rest of the time', () => {
    const world = emptyRoom(9600);
    const button = part(world, 'button');
    const chance = part(world, 'chance', { chances: [10, 30], pick: 'one' });
    world.connect(button.id, 'pressed', chance.id, 'roll');
    const ten = counter(world, chance, 'o1', 'Ten');
    const thirty = counter(world, chance, 'o2', 'Thirty');
    const none = counter(world, chance, 'none', 'None');
    for (let i = 0; i < 2000; i++) {
      world.pressButton(button.id);
      world.step();
    }
    expect(ten() + thirty() + none()).toBe(2000);
    expect(ten() / 2000).toBeGreaterThan(0.07);
    expect(ten() / 2000).toBeLessThan(0.13);
    expect(thirty() / 2000).toBeGreaterThan(0.26);
    expect(thirty() / 2000).toBeLessThan(0.34);
    world.dispose();
  });

  it('a tiny chance hardly ever comes up, and Each can give several at once', () => {
    const world = emptyRoom(9601);
    const button = part(world, 'button');
    const tiny = part(world, 'chance', { chances: [0.0001], pick: 'one' });
    const each = part(world, 'chance', { chances: [100, 100], pick: 'each' });
    world.connect(button.id, 'pressed', tiny.id, 'roll');
    world.connect(button.id, 'pressed', each.id, 'roll');
    const rare = counter(world, tiny, 'o1', 'Rare');
    const a = counter(world, each, 'o1', 'A');
    const b = counter(world, each, 'o2', 'B');
    for (let i = 0; i < 300; i++) {
      world.pressButton(button.id);
      world.step();
    }
    expect(rare()).toBe(0);
    expect(a()).toBe(300);
    expect(b()).toBe(300);
    world.dispose();
  });

  it('Combine adds values together and says when every pulse has come in', () => {
    const world = emptyRoom(9602);
    const combine = part(world, 'combine', { op: 'add' });
    for (const [port, base] of [['a', 2], ['b', 3], ['c', 5]] as const) world.connect(part(world, 'data', { base }).id, 'value', combine.id, port);
    const one = part(world, 'button');
    const two = part(world, 'button');
    world.connect(one.id, 'pressed', combine.id, 'p1');
    world.connect(two.id, 'pressed', combine.id, 'p2');
    const all = counter(world, combine, 'all', 'All');
    const any = counter(world, combine, 'any', 'Any');
    world.step();
    expect(world.circuit.peek(combine.id, 'result')).toBe(10);
    world.pressButton(one.id);
    run(world, 2);
    expect(all()).toBe(0);
    world.pressButton(two.id);
    run(world, 2);
    expect(all()).toBe(1);
    expect(any()).toBe(2);
    world.dispose();
  });
});

describe('storage, items and chests', () => {
  it('every Storage with the same name is the same number, wherever it is', () => {
    const world = emptyRoom(9610);
    const button = part(world, 'button');
    const here = part(world, 'storage', { start: 5 }, 300, 300, { name: 'Cash' });
    const there = part(world, 'storage', { start: 5 }, 900, 300, { name: 'cash' });
    const ten = part(world, 'data', { base: 10 });
    world.connect(ten.id, 'value', here.id, 'amount');
    world.connect(button.id, 'pressed', here.id, 'add');
    world.pressButton(button.id);
    run(world, 2);
    expect(world.circuit.peek(there.id, 'value')).toBe(15);
    const copy = World.load(world.save());
    expect(copy.stores.cash).toBe(15);
    world.dispose();
    copy.dispose();
  });

  it('a creature picks up an item it walks into, and an Inventory counts it', () => {
    const world = withHealth(9611);
    const c = world.creature;
    const coin = world.add({ ...newDecor(DECOR.find((d) => d.id === 'coin') as (typeof DECOR)[number], c.x + 2), y: FLOOR - 30 });
    const bag = part(world, 'items', { item: 'Coin' });
    run(world, 20);
    expect(world.thing(coin.id)).toBeUndefined();
    expect(c.inventory.Coin).toBe(1);
    expect(world.circuit.peek(bag.id, 'count')).toBe(1);
    world.dispose();
  });

  it('opening a chest takes what is inside, and an Inventory can fill it again', () => {
    const world = withHealth(9612);
    const c = world.creature;
    const chest = box(world, c.x + 120, { holds: { Gold: 5, Sword: 1 }, fixed: true });
    world.tell('touch', chest.id);
    run(world, 6 * TICKS_PER_SECOND);
    expect(c.inventory).toMatchObject({ Gold: 5, Sword: 1 });
    expect(chest.holds).toEqual({});
    const button = part(world, 'button');
    const fill = part(world, 'items', { item: 'Gold' });
    world.connect(fill.id, 'drives', chest.id, 'body');
    world.connect(button.id, 'pressed', fill.id, 'give');
    world.pressButton(button.id);
    run(world, 2);
    expect(chest.holds).toEqual({ Gold: 1 });
    expect(world.circuit.peek(fill.id, 'count')).toBe(1);
    world.dispose();
  });

  it('things with all of this survive a room file', () => {
    const world = emptyRoom(9613);
    box(world, 500, { hp: 40, enemy: { ...DEFAULT_ENEMY, mode: 'patrol' }, holds: { Gold: 2 }, label: 'Grumpy', ignored: true });
    box(world, 700, { item: true, decor: 'ruby' });
    const room = parseRoom(saveRoom(world));
    expect(room.things[0]).toMatchObject({ hp: 40, enemy: { mode: 'patrol' }, holds: { Gold: 2 }, label: 'Grumpy', ignored: true });
    expect(room.things[1]).toMatchObject({ item: true, decor: 'ruby' });
    world.dispose();
  });
});

describe('fighting', () => {
  it('an enemy goes after a creature and hurts it when it gets there', () => {
    const world = withHealth(9620);
    const c = world.creature;
    c.pause = 1e9; // it just stands there
    const slime = box(world, c.x + 400, { hp: 30, enemy: { ...DEFAULT_ENEMY, speed: 150, damage: 10 } });
    const hits = counter(world, slime, 'hit', 'Hits');
    const before = health(world);
    run(world, 6 * TICKS_PER_SECOND);
    expect(Math.abs(slime.x - c.x)).toBeLessThan(120);
    expect(health(world)).toBeLessThan(before);
    expect(hits()).toBeGreaterThan(0);
    world.dispose();
  });

  it('an enemy that is set to flee runs away', () => {
    const world = withHealth(9621);
    const c = world.creature;
    c.pause = 1e9;
    const scared = box(world, c.x + 200, { enemy: { ...DEFAULT_ENEMY, mode: 'flee', speed: 150 } });
    run(world, 2 * TICKS_PER_SECOND);
    expect(scared.x - c.x).toBeGreaterThan(400);
    world.dispose();
  });

  it('an Ability inside a creature fires by itself, and kills enemies, which say so', () => {
    const world = withHealth(9622);
    const c = world.creature;
    c.pause = 1e9;
    const zap = part(world, 'ability', { style: 'shoot', damage: 10, seconds: 0.5, range: 800 }, 300, 300, { inBody: true });
    const target = box(world, c.x + 300, { hp: 20, enemy: { ...DEFAULT_ENEMY, speed: 0, damage: 0 } });
    const died = counter(world, target, 'died', 'Died');
    const killed = counter(world, zap, 'killed', 'Killed');
    run(world, 4 * TICKS_PER_SECOND);
    expect(world.thing(target.id)).toBeUndefined();
    expect(died()).toBe(1);
    expect(killed()).toBe(1);
    world.dispose();
  });

  it('a creature hurts what it touches or pushes, and an aura hurts everything near', () => {
    const world = withHealth(9623);
    const c = world.creature;
    const dummy = box(world, c.x + 100, { hp: 25, fixed: true });
    world.tell('push', dummy.id);
    world.takeEvents();
    run(world, 4 * TICKS_PER_SECOND);
    expect(world.takeEvents().some((e) => e.type === 'hurt' && e.thingId === dummy.id && e.who === c.id)).toBe(true);
    c.pause = 1e9;
    c.doing = null;
    const other = box(world, c.x + 150, { hp: 25, fixed: true });
    const aura = part(world, 'ability', { style: 'aura', damage: 50, range: 300, tag: '' });
    const button = part(world, 'button');
    world.connect(button.id, 'pressed', aura.id, 'fire');
    world.pressButton(button.id);
    run(world, 3);
    expect(world.thing(other.id)).toBeUndefined();
    world.dispose();
  });
});

describe('effects and choices', () => {
  it('an Effect makes a creature faster, stacks, and wears off', () => {
    const world = withHealth(9630);
    const c = world.creature;
    const fast = part(world, 'effect', { stat: 'speed', amount: 0.5, seconds: 2, most: 2 }, 300, 300, { inBody: true });
    const button = part(world, 'button', {}, 300, 400, { inBody: true });
    world.connect(button.id, 'pressed', fast.id, 'apply');
    for (let i = 0; i < 3; i++) {
      world.pressButton(button.id);
      run(world, 2);
    }
    expect(world.boost(c, 'speed')).toBe(1);
    expect(world.circuit.peek(fast.id, 'stacks')).toBe(2);
    run(world, 3 * TICKS_PER_SECOND);
    expect(world.boost(c, 'speed')).toBe(0);
    world.dispose();
  });

  it('a Choice stops everything else while the creature picks, then says what it picked', () => {
    const world = withHealth(9631);
    const ask = part(world, 'choice', { options: ['Faster', 'Stronger', 'Heal'], seconds: 1 });
    const button = part(world, 'button');
    world.connect(button.id, 'pressed', ask.id, 'ask');
    const picks = [0, 1, 2].map((i) => counter(world, ask, `o${i + 1}`, `Pick ${i}`));
    const falling = box(world, 1200, { y: 200 });
    world.pressButton(button.id);
    run(world, 2);
    expect(world.choosing).not.toBeNull();
    const tick = world.tick;
    const y = falling.y;
    run(world, TICKS_PER_SECOND / 2);
    expect(world.tick).toBe(tick);
    expect(falling.y).toBe(y);
    run(world, TICKS_PER_SECOND);
    expect(world.choosing).toBeNull();
    run(world, 2);
    expect(picks.reduce((sum, p) => sum + p(), 0)).toBe(1);
    expect(['Faster', 'Stronger', 'Heal']).toContain(world.circuit.peek(ask.id, 'chose'));
    world.dispose();
  });

  it('it comes to prefer a choice it was petted for', () => {
    const world = withHealth(9632);
    const ask = part(world, 'choice', { options: ['Left', 'Right'], seconds: 0.2 });
    const button = part(world, 'button');
    world.connect(button.id, 'pressed', ask.id, 'ask');
    for (let round = 0; round < 12; round++) {
      world.pressButton(button.id);
      run(world, 10);
      if (world.circuit.peek(ask.id, 'chose') === 'Right') world.pet();
      else world.slap();
      run(world, 3 * TICKS_PER_SECOND);
    }
    let rights = 0;
    for (let round = 0; round < 10; round++) {
      world.pressButton(button.id);
      run(world, 10);
      if (world.circuit.peek(ask.id, 'chose') === 'Right') rights++;
    }
    expect(rights).toBeGreaterThanOrEqual(8);
    world.dispose();
  });
});

describe('movers and build areas', () => {
  it('keyframes glide from one to the next', () => {
    const keys = [{ x: 0, y: 0, turn: 0, seconds: 0 }, { x: 100, y: 0, turn: 0, seconds: 1 }, { x: 100, y: -50, turn: 90, seconds: 1 }];
    expect(poseAt(keys, 0)).toEqual({ x: 0, y: 0, turn: 0 });
    expect(poseAt(keys, 0.5).x).toBeCloseTo(50);
    expect(poseAt(keys, 2)).toEqual({ x: 100, y: -50, turn: 90 });
  });

  it('a Mover carries a shape through its keyframes, and back again', () => {
    const world = emptyRoom(9640);
    const door = box(world, 800, { fixed: true, y: FLOOR - 16 });
    const mover = part(world, 'mover', { keys: [{ x: 0, y: 0, turn: 0, seconds: 0 }, { x: 0, y: -200, turn: 0, seconds: 1 }] });
    world.connect(mover.id, 'drives', door.id, 'body');
    const play = part(world, 'button');
    const back = part(world, 'button');
    world.connect(play.id, 'pressed', mover.id, 'play');
    world.connect(back.id, 'pressed', mover.id, 'back');
    const done = counter(world, mover, 'done', 'Done');
    world.pressButton(play.id);
    run(world, 2 * TICKS_PER_SECOND);
    expect(door.y).toBeCloseTo(FLOOR - 216, 0);
    expect(done()).toBe(1);
    world.pressButton(back.id);
    run(world, 2 * TICKS_PER_SECOND);
    expect(door.y).toBeCloseTo(FLOOR - 16, 0);
    expect(door.fixed).toBe(true);
    world.dispose();
  });

  it("a part in a thing's build area works on that thing, and nobody in the room can see it", () => {
    const world = withHealth(9641);
    const crate = box(world, 1400, { fixed: true, y: FLOOR - 16 });
    const mover = part(world, 'mover', { keys: [{ x: 0, y: 0, turn: 0, seconds: 0 }, { x: 0, y: -100, turn: 0, seconds: 0.5 }] }, AREA_MIDDLE.x - 200, AREA_MIDDLE.y, { area: crate.id });
    world.connect(crate.id, 'touched', mover.id, 'play');
    expect(world.tell('touch', mover.id)).not.toBeNull();
    world.tell('touch', crate.id);
    run(world, 8 * TICKS_PER_SECOND);
    expect(crate.y).toBeLessThan(FLOOR - 100);
    world.dispose();
  });

  it('a build area goes with its thing in a room file and when copied', () => {
    const world = emptyRoom(9642);
    const crate = box(world, 600);
    const mover = part(world, 'mover', {}, AREA_MIDDLE.x - 300, AREA_MIDDLE.y, { area: crate.id });
    world.connect(crate.id, 'touched', mover.id, 'play');
    const room = parseRoom(saveRoom(world));
    expect(room.things[1].area).toBe(0);
    const copy = emptyRoom(9643);
    const ids = copy.addRoom(room);
    expect(copy.thing(ids[1])?.area).toBe(ids[0]);
    expect(copy.thing(ids[1])?.x).toBe(AREA_MIDDLE.x - 300);
    expect(copy.wires.some((w) => w.from === ids[0] && w.to === ids[1])).toBe(true);
    world.dispose();
    copy.dispose();
  });
});

describe('being left alone, and decorations', () => {
  it("a creature can't be told to go to something set so creatures leave it alone", () => {
    const world = withHealth(9650);
    const rock = box(world, 900, { ignored: true });
    expect(world.tell('approach', rock.id)).toMatch(/leave it alone/);
    world.dispose();
  });

  it('every decoration makes a thing that works and survives a room file', () => {
    const world = emptyRoom(9651);
    let x = 40;
    for (const d of DECOR) {
      world.add(newDecor(d, x, 300));
      x += 30;
    }
    run(world, 10);
    const room = parseRoom(saveRoom(world));
    expect(room.things.length).toBe(DECOR.length);
    expect(room.things.every((t) => t.decor)).toBe(true);
    expect(DECOR.length).toBeGreaterThanOrEqual(100);
    for (const t of world.things) expect(Number.isFinite(t.x) && Number.isFinite(t.y)).toBe(true);
    world.dispose();
  });
});
