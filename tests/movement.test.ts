// jumping over gaps, climbing, and gravity that changes from place to place
import { describe, expect, it } from 'vitest';
import { newPart } from '../src/sim/parts.ts';
import type { Part } from '../src/sim/parts.ts';
import { parseRoom, saveRoom } from '../src/sim/room-file.ts';
import { initPhysics, ROOM, TICKS_PER_SECOND, World } from '../src/sim/world.ts';
import type { Thing, ThingSpec } from '../src/sim/world.ts';

await initPhysics();

const MIDDLE = ROOM.width / 2;
const FLOOR = ROOM.floor;

function block(world: World, x: number, top: number, hw = 70, extra: Partial<ThingSpec> = {}): Thing {
  return world.add({ name: 'Block', form: 'box', colour: 'grey', hw, hh: 20, x, y: top + 20, fixed: true, ...extra });
}

function zone(world: World, x: number, y: number, hw: number, hh: number, settings: Partial<Part> = {}): Thing {
  const spec = newPart('zone', x, y);
  return world.add({ ...spec, hw, hh, part: { ...spec.part, ...settings } });
}

function touchedWithin(world: World, target: Thing, seconds: number): boolean {
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) {
    world.step();
    if (world.takeEvents().some((e) => e.type === 'touched' && e.thingId === target.id)) return true;
  }
  return false;
}

function stays(world: World, seconds: number): void {
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) world.step();
  world.takeEvents();
}

describe('jumping', () => {
  it('gets across block, gap, block to something on the far one', () => {
    let got = 0;
    for (let seed = 9200; seed < 9220; seed++) {
      const world = new World({ seed, things: [] });
      world.placeCreature(MIDDLE - 300);
      // steps up from the floor, then a gap
      block(world, MIDDLE - 180, FLOOR - 90);
      block(world, MIDDLE + 40, FLOOR - 90);
      const prize = world.add({ name: 'Prize', form: 'circle', colour: 'red', hw: 14, hh: 14, x: MIDDLE + 40, y: FLOOR - 104, fixed: true });
      world.tell('touch', prize.id);
      if (touchedWithin(world, prize, 40)) got++;
      world.dispose();
    }
    expect(got).toBeGreaterThanOrEqual(18);
  });

  it('crosses several gaps in a row, high up', () => {
    const world = new World({ seed: 9221, things: [] });
    world.placeCreature(MIDDLE - 500);
    block(world, MIDDLE - 400, FLOOR - 100);
    block(world, MIDDLE - 210, FLOOR - 200);
    block(world, MIDDLE - 10, FLOOR - 300);
    block(world, MIDDLE + 210, FLOOR - 300);
    const prize = world.add({ name: 'Prize', form: 'circle', colour: 'red', hw: 14, hh: 14, x: MIDDLE + 210, y: FLOOR - 314, fixed: true });
    world.tell('touch', prize.id);
    expect(touchedWithin(world, prize, 60)).toBe(true);
    world.dispose();
  });

  it('left to itself, a creature that wants food on a block goes and gets it', () => {
    // not every one of them notices it, because nothing makes them. most do
    let got = 0;
    for (let seed = 9700; seed < 9716; seed++) {
      const world = new World({ seed, things: [] });
      world.setDrive('Hunger', 80);
      const fruit = world.add({ name: 'Fruit', form: 'circle', colour: 'red', hw: 14, hh: 14, x: MIDDLE + 230, y: FLOOR - 124, fixed: true, give: { drive: 'Hunger', amount: -25 } });
      block(world, MIDDLE + 230, FLOOR - 110);
      if (touchedWithin(world, fruit, 180)) got++;
      world.dispose();
    }
    expect(got).toBeGreaterThanOrEqual(11);
  }, 60000);

  it('a fixed block too low to walk under, too tall to hop: it goes up and over', () => {
    let got = 0;
    for (let seed = 9224; seed < 9234; seed++) {
      const world = new World({ seed, things: [] });
      world.placeCreature(MIDDLE - 300);
      block(world, MIDDLE, FLOOR - 110, 80, { hh: 55, y: FLOOR - 55 });
      const prize = world.add({ name: 'Prize', form: 'circle', colour: 'red', hw: 14, hh: 14, x: MIDDLE + 300, fixed: true });
      world.tell('touch', prize.id);
      if (touchedWithin(world, prize, 25)) got++;
      world.dispose();
    }
    expect(got).toBeGreaterThanOrEqual(9);
  });

  it('a block hanging over its path to a zone: it gets there anyway', () => {
    const world = new World({ seed: 9235, things: [] });
    zone(world, MIDDLE - 400, 500, 200, 440);
    block(world, MIDDLE - 80, FLOOR - 90);
    world.placeCreature(MIDDLE + 100);
    const star = world.add({ name: 'Star', form: 'hexagon', colour: 'yellow', hw: 18, hh: 18, x: MIDDLE - 400, y: 200, fixed: true });
    world.tell('touch', star.id);
    expect(touchedWithin(world, star, 40)).toBe(true);
    world.dispose();
  });

  it("won't try what it can't possibly do, and says so", () => {
    const world = new World({ seed: 9223, things: [] });
    const far = block(world, MIDDLE + 500, FLOOR - 600);
    world.placeCreature(MIDDLE);
    const prize = world.add({ name: 'Prize', form: 'circle', colour: 'red', hw: 14, hh: 14, x: far.x, y: far.y - 34, fixed: true });
    world.tell('touch', prize.id);
    let gaveUp = false;
    for (let i = 0; i < 60 * TICKS_PER_SECOND && !gaveUp; i++) {
      world.step();
      gaveUp = world.takeEvents().some((e) => e.type === 'gaveUp');
    }
    expect(gaveUp).toBe(true);
    world.dispose();
  });
});

describe('climbing', () => {
  it('climbs a tall wall marked climbable, up to what is on top', () => {
    let got = 0;
    for (let seed = 9240; seed < 9250; seed++) {
      const world = new World({ seed, things: [] });
      world.placeCreature(MIDDLE - 200);
      const wall = world.add({ name: 'Wall', form: 'box', colour: 'grey', hw: 50, hh: 200, x: MIDDLE, y: FLOOR - 200, fixed: true, climbable: true });
      const prize = world.add({ name: 'Prize', form: 'circle', colour: 'red', hw: 14, hh: 14, x: wall.x, y: wall.y - wall.hh - 14, fixed: true });
      world.tell('touch', prize.id);
      if (touchedWithin(world, prize, 30)) got++;
      world.dispose();
    }
    expect(got).toBeGreaterThanOrEqual(9);
  });

  it('climbs a ladder it can pass through', () => {
    const world = new World({ seed: 9251, things: [] });
    world.placeCreature(MIDDLE - 200);
    world.add({ name: 'Ladder', form: 'box', colour: 'orange', hw: 20, hh: 170, x: MIDDLE, y: FLOOR - 170, fixed: true, solid: false, climbable: true });
    block(world, MIDDLE + 70, FLOOR - 340, 60);
    const prize = world.add({ name: 'Prize', form: 'circle', colour: 'red', hw: 14, hh: 14, x: MIDDLE + 90, y: FLOOR - 354, fixed: true });
    world.tell('touch', prize.id);
    expect(touchedWithin(world, prize, 30)).toBe(true);
    world.dispose();
  });

  it('the same wall, not marked climbable, stops it', () => {
    const world = new World({ seed: 9252, things: [] });
    world.placeCreature(MIDDLE - 200);
    const wall = world.add({ name: 'Wall', form: 'box', colour: 'grey', hw: 50, hh: 200, x: MIDDLE, y: FLOOR - 200, fixed: true });
    const prize = world.add({ name: 'Prize', form: 'circle', colour: 'red', hw: 14, hh: 14, x: wall.x, y: wall.y - wall.hh - 14, fixed: true });
    world.tell('touch', prize.id);
    expect(touchedWithin(world, prize, 20)).toBe(false);
    world.dispose();
  });
});

describe('more room', () => {
  it('grows on any side, and everything stays put relative to everything else', () => {
    const world = new World({ seed: 9800, size: { width: 3000, height: 1200 } });
    stays(world, 5);
    const rock = world.things.find((t) => t.name === 'Rock') as Thing;
    const c = world.creature;
    world.endAction(true, c);
    c.pause = 1e9; // standing still, so it can't walk off and change the sums
    const gapX = rock.x - c.x;
    const aboveFloor = world.size.floor - rock.y;
    const body = world.things.find((t) => t.inBody) as Thing;
    const bodyAt = { x: body.x, y: body.y };

    expect(world.expand('left', 1000)).toEqual({ dx: 1000, dy: 0 });
    expect(world.size.width).toBe(4000);
    expect(rock.x - c.x).toBeCloseTo(gapX, 0);
    expect(world.expand('up', 500)).toEqual({ dx: 0, dy: 500 });
    expect(world.size.height).toBe(1700);
    expect(world.size.floor - rock.y).toBeCloseTo(aboveFloor, 0);
    expect(world.expand('right', 1000)).toEqual({ dx: 0, dy: 0 });
    expect(world.size.width).toBe(5000);
    stays(world, 3);
    expect(rock.x - c.x).toBeCloseTo(gapX, -1);
    expect(world.size.floor - rock.y).toBeCloseTo(aboveFloor, 0);
    expect(c.y).toBeCloseTo(world.size.floor, 0);
    // what's inside a creature isn't anywhere in the room
    expect(body.x).toBe(bodyAt.x);
    expect(body.y).toBe(bodyAt.y);
    world.dispose();
  });

  it('more room below means the floor drops, and what is loose falls to it', () => {
    const world = new World({ seed: 9801, things: [], size: { width: 3000, height: 1200 } });
    const ball = world.add({ name: 'Ball', form: 'circle', colour: 'blue', hw: 14, hh: 14, x: 500 });
    const shelf = block(world, 1500, 500);
    stays(world, 2);
    const shelfY = shelf.y;
    expect(world.expand('down', 800)).toEqual({ dx: 0, dy: 0 });
    stays(world, 3);
    expect(ball.y).toBeGreaterThan(world.size.floor - 20);
    expect(world.creature.y).toBeGreaterThan(world.size.floor - 5);
    expect(shelf.y).toBe(shelfY);
    world.dispose();
  });

  it('stops at the biggest a room can be', () => {
    const world = new World({ seed: 9802, things: [], size: { width: 39500, height: 2000 } });
    world.expand('right', 5000);
    expect(world.size.width).toBe(40000);
    expect(world.expand('left', 5000)).toEqual({ dx: 0, dy: 0 });
    world.dispose();
  });
});

describe('gravity', () => {
  it('a world can start with none: things stay put and it float-walks anywhere', () => {
    const world = new World({ seed: 9260, things: [], gravity: { strength: 0, direction: 90 } });
    const ball = world.add({ name: 'Ball', form: 'circle', colour: 'blue', hw: 14, hh: 14, x: MIDDLE, y: 300 });
    stays(world, 3);
    expect(ball.y).toBeCloseTo(300, 0);
    const up = world.add({ name: 'Up there', form: 'circle', colour: 'red', hw: 14, hh: 14, x: MIDDLE + 300, y: 200, fixed: true });
    world.tell('touch', up.id);
    expect(touchedWithin(world, up, 20)).toBe(true);
    expect(world.creature.y).toBeLessThan(ROOM.floor - 300);
    world.dispose();
  });

  it('or stronger, or sideways', () => {
    const fallTime = (strength: number): number => {
      const world = new World({ seed: 9261, things: [], gravity: { strength, direction: 90 } });
      const ball = world.add({ name: 'Ball', form: 'circle', colour: 'blue', hw: 14, hh: 14, x: MIDDLE + 500, y: 100 });
      let ticks = 0;
      while (ball.y < FLOOR - 40 && ticks < 900) {
        world.step();
        ticks++;
      }
      world.dispose();
      return ticks;
    };
    expect(fallTime(2)).toBeLessThan(fallTime(1));
    const world = new World({ seed: 9262, things: [], gravity: { strength: 1, direction: 0 } });
    const ball = world.add({ name: 'Ball', form: 'circle', colour: 'blue', hw: 14, hh: 14, x: MIDDLE, y: 300 });
    stays(world, 2);
    expect(ball.x).toBeGreaterThan(MIDDLE + 200);
    world.dispose();
  });

  it('things float in a zone with none, and fall again outside it', () => {
    const world = new World({ seed: 9263, things: [] });
    zone(world, 400, 400, 200, 300);
    const inside = world.add({ name: 'In', form: 'circle', colour: 'blue', hw: 14, hh: 14, x: 400, y: 300 });
    const outside = world.add({ name: 'Out', form: 'circle', colour: 'blue', hw: 14, hh: 14, x: 1500, y: 300 });
    stays(world, 3);
    expect(inside.y).toBeLessThan(320);
    expect(outside.y).toBeGreaterThan(FLOOR - 40);
    world.dispose();
  });

  it('in a world with none, a zone can have gravity', () => {
    const world = new World({ seed: 9264, things: [], gravity: { strength: 0, direction: 90 } });
    zone(world, 400, 500, 200, 440, { pull: 1 });
    const inside = world.add({ name: 'In', form: 'circle', colour: 'blue', hw: 14, hh: 14, x: 400, y: 200 });
    const outside = world.add({ name: 'Out', form: 'circle', colour: 'blue', hw: 14, hh: 14, x: 1500, y: 200 });
    stays(world, 3);
    expect(inside.y).toBeGreaterThan(FLOOR - 40);
    expect(outside.y).toBeLessThan(220);
    world.dispose();
  });

  it('a zone can pull any way, and be switched by a wire', () => {
    const world = new World({ seed: 9265, things: [] });
    const z = zone(world, 400, 500, 300, 400, { pull: 1, direction: -90 });
    const ball = world.add({ name: 'Ball', form: 'circle', colour: 'blue', hw: 14, hh: 14, x: 400, y: 600 });
    stays(world, 1);
    expect(ball.y).toBeLessThan(500); // falling upwards
    const off = world.add({ ...newPart('button', 900, 300), part: { kind: 'button', latch: true } });
    world.connect(off.id, 'on', z.id, 'on');
    stays(world, 3);
    expect(ball.y).toBeGreaterThan(FLOOR - 40); // the wire says it's off, so it falls
    world.dispose();
  });

  it('a creature walks into a zone, floats up, walks about on the air, and falls when it leaves', () => {
    const world = new World({ seed: 9266, things: [] });
    zone(world, MIDDLE, 500, 300, 440);
    world.placeCreature(MIDDLE - 500);
    const up = world.add({ name: 'Up there', form: 'circle', colour: 'red', hw: 14, hh: 14, x: MIDDLE, y: 200, fixed: true });
    world.tell('touch', up.id);
    expect(touchedWithin(world, up, 30)).toBe(true);
    const c = world.creature;
    expect(c.floating).toBe(true);
    expect(c.y).toBeLessThan(400);
    // it stays up there once it stops
    c.pause = 1e9;
    world.endAction(true, c);
    const height = c.y;
    stays(world, 3);
    expect(Math.abs(c.y - height)).toBeLessThan(20);
    world.placeCreature(MIDDLE - 800);
    c.y = 300;
    stays(world, 3);
    expect(c.y).toBeGreaterThan(FLOOR - 5);
    expect(c.floating).toBe(false);
    world.dispose();
  });

  it('a creature can wander in zero gravity, up and down as well as across', () => {
    const world = new World({ seed: 9267, things: [], gravity: { strength: 0, direction: 90 } });
    const heights = new Set<number>();
    for (let i = 0; i < 120 * TICKS_PER_SECOND; i++) {
      world.step();
      world.takeEvents();
      if (i % 60 === 0) heights.add(Math.round(world.creature.y / 100));
    }
    expect(heights.size).toBeGreaterThan(1);
    expect(world.creature.y).toBeGreaterThan(0);
    world.dispose();
  });

  it('it can reach something in a zone that starts above its head', () => {
    const world = new World({ seed: 9268, things: [] });
    zone(world, MIDDLE, 300, 200, 200); // its bottom edge is 440 above the floor, so it needs something to jump from
    block(world, MIDDLE - 330, FLOOR - 120);
    block(world, MIDDLE - 250, FLOOR - 240, 40);
    block(world, MIDDLE - 180, FLOOR - 370, 40);
    world.placeCreature(MIDDLE - 500);
    const up = world.add({ name: 'Up there', form: 'circle', colour: 'red', hw: 14, hh: 14, x: MIDDLE, y: 300, fixed: true });
    world.tell('touch', up.id);
    expect(touchedWithin(world, up, 60)).toBe(true);
    world.dispose();
  });

  it('files keep gravity, zones and what can be climbed', () => {
    const world = new World({ seed: 9269, things: [], gravity: { strength: 0.5, direction: 90 } });
    zone(world, 400, 400, 100, 100, { pull: 2, direction: 0 });
    world.add({ name: 'Wall', form: 'box', colour: 'grey', hw: 20, hh: 50, x: 900, climbable: true });
    const room = parseRoom(saveRoom(world));
    expect(room.gravity?.strength).toBe(0.5);
    expect(room.things.find((t) => t.part?.kind === 'zone')?.part?.pull).toBe(2);
    expect(room.things.find((t) => t.name === 'Wall')?.climbable).toBe(true);
    const copy = World.load(world.save());
    expect(copy.gravity.strength).toBe(0.5);
    world.dispose();
    copy.dispose();
  });
});
