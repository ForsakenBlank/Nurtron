import { describe, expect, it } from 'vitest';
import { History } from '../src/sim/edits.ts';
import { parseRoom, saveRoom, SIZE_LIMITS } from '../src/sim/room-file.ts';
import { closestPoint, containsPoint, corners } from '../src/sim/shapes.ts';
import { FRUIT, initPhysics, ROCK, ROOM, TICKS_PER_SECOND, World } from '../src/sim/world.ts';
import type { ThingSpec } from '../src/sim/world.ts';

await initPhysics();

const FLOOR = ROOM.floor;
const ball = (x: number, y: number, extra: Partial<ThingSpec> = {}): ThingSpec => ({ name: 'Ball', form: 'circle', colour: 'blue', hw: 16, hh: 16, x, y, ...extra });
const plank = (x: number, y: number, angle: number, extra: Partial<ThingSpec> = {}): ThingSpec => ({ name: 'Plank', form: 'box', colour: 'grey', hw: 200, hh: 8, x, y, angle, fixed: true, ...extra });

function run(world: World, seconds: number): void {
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) {
    world.step();
    world.takeEvents();
  }
}

// a room with just these things and a creature parked far away, asleep on the job, so it can't interfere
function room(...things: ThingSpec[]): World {
  const world = new World({ seed: 1, things, body: 'blank' });
  world.placeCreature(100);
  world.creature.pause = 1e9;
  return world;
}

describe('shapes', () => {
  it('knows what is inside a rotated plank', () => {
    const p = { form: 'box' as const, hw: 100, hh: 10, x: 500, y: 500, angle: Math.PI / 2 };
    expect(containsPoint(p, 500, 580)).toBe(true); // along it, now it stands upright
    expect(containsPoint(p, 580, 500)).toBe(false); // where it would be if it were flat
  });

  it('finds the nearest point of a plank rather than its middle', () => {
    const p = { form: 'box' as const, hw: 100, hh: 10, x: 500, y: 500, angle: 0 };
    const near = closestPoint(p, 700, 500);
    expect(near.x).toBeCloseTo(600);
    expect(near.y).toBeCloseTo(500);
  });

  it('treats every form properly for clicks', () => {
    for (const form of ['circle', 'box', 'triangle', 'hexagon'] as const) {
      const t = { form, hw: 30, hh: 30, x: 100, y: 100, angle: 0.7 };
      expect(containsPoint(t, 100, 105)).toBe(true);
      expect(containsPoint(t, 200, 200)).toBe(false);
    }
    expect(corners({ form: 'hexagon', hw: 30, hh: 30, x: 0, y: 0, angle: 0 }).length).toBe(6);
  });
});

describe('physics', () => {
  it('drops things onto the floor by default', () => {
    const world = room(ball(1000, 300));
    run(world, 3);
    expect(world.things[0].y).toBeGreaterThan(FLOOR - 20);
    world.dispose();
  });

  it('leaves something floating when its gravity is off', () => {
    const world = room(ball(1000, 300, { gravity: false }));
    run(world, 3);
    expect(world.things[0].y).toBeCloseTo(300, 0);
    world.dispose();
  });

  it('never moves something fixed, even when hit', () => {
    const world = room({ ...ROCK, x: 1000, y: 700, fixed: true }, ball(1000, 300, { weight: 10 }));
    run(world, 3);
    expect(world.things[0].y).toBeCloseTo(700, 3);
    expect(world.things[1].y).toBeLessThan(700); // it's resting on top
    world.dispose();
  });

  it('lets things fall through something not solid, and still stops them at the floor', () => {
    const world = room(plank(1000, 700, 0), ball(1000, 300, { solid: false }));
    run(world, 3);
    expect(world.things[1].y).toBeGreaterThan(FLOOR - 20);
    expect(world.things[1].y).toBeLessThanOrEqual(FLOOR);
    world.dispose();
  });

  it('rolls a ball down a ramp and off the end', () => {
    // a ramp sloping down to the right
    const world = room(plank(1000, 700, 0.35), ball(860, 560));
    run(world, 4);
    const b = world.things[1];
    expect(b.x).toBeGreaterThan(1180);
    expect(b.y).toBeGreaterThan(FLOOR - 20);
    world.dispose();
  });

  it('wakes things up when what they are resting on is removed', () => {
    const world = room(plank(1000, 700, 0), ball(1000, 650));
    run(world, 5); // long enough to settle and go to sleep
    expect(world.things[1].y).toBeLessThan(700);
    world.remove(world.things[0].id);
    run(world, 2);
    expect(world.things[0].y).toBeGreaterThan(FLOOR - 20);
    world.dispose();
  });

  it('wakes things when what they rest on is dragged out from under them', () => {
    const world = room(plank(1000, 500, 0), ball(1000, 460));
    const [shelf, top] = world.things;
    run(world, 5);
    world.hold(shelf.id);
    run(world, 4); // held still for long enough that the ball on it goes to sleep
    world.moveHeld(shelf.id, 300, 200);
    run(world, 2);
    world.release(shelf.id);
    expect(top.y).toBeGreaterThan(FLOOR - 20);
    world.dispose();
  });

  it('wakes things when the creature they rest on is carried away', () => {
    const world = new World({ seed: 1, things: [] });
    const onTop = world.add(ball(world.creature.x, ROOM.floor - 100));
    run(world, 0.5);
    world.creature.pause = 1e9;
    run(world, 4);
    world.holdCreature();
    run(world, 4);
    world.moveHeldCreature(200, 500);
    run(world, 2);
    expect(onTop.y).toBeGreaterThan(FLOOR - 20);
    world.dispose();
  });

  it('does what a property change says straight away', () => {
    const world = room(ball(1000, 300, { gravity: false }));
    run(world, 1);
    world.update(world.things[0].id, { gravity: true });
    run(world, 2);
    expect(world.things[0].y).toBeGreaterThan(FLOOR - 20);
    world.dispose();
  });

  it('bounces more when told to', () => {
    const peak = (bounce: number): number => {
      const world = room(ball(1000, 500, { bounce }));
      let highest = FLOOR;
      let landed = false;
      for (let i = 0; i < 4 * TICKS_PER_SECOND; i++) {
        world.step();
        const y = world.things[0].y;
        if (y > FLOOR - 40) landed = true;
        if (landed) highest = Math.min(highest, y);
      }
      world.dispose();
      return highest;
    };
    expect(peak(0.9)).toBeLessThan(peak(0.1) - 100);
  });

  it('holds something still in the air while the hand has it, then lets it fall', () => {
    const world = room(ball(1000, 300));
    const id = world.things[0].id;
    world.hold(id);
    world.moveHeld(id, 1200, 400);
    run(world, 2);
    expect(world.things[0].x).toBeCloseTo(1200, 3);
    expect(world.things[0].y).toBeCloseTo(400, 3);
    world.release(id);
    run(world, 2);
    expect(world.things[0].y).toBeGreaterThan(FLOOR - 20);
    world.dispose();
  });

  it('can move something while paused, with nothing running, and it stays there', () => {
    const world = room(ball(1000, FLOOR - 16));
    const id = world.things[0].id;
    world.hold(id);
    world.moveHeld(id, 1500, 500);
    world.release(id);
    expect(world.things[0].x).toBe(1500);
    world.step();
    expect(Math.abs(world.things[0].x - 1500)).toBeLessThan(2);
    world.dispose();
  });

  it('pushes other things along when dragged into them', () => {
    const world = room(ball(1000, FLOOR - 16), ball(1100, FLOOR - 16));
    const [a, b] = world.things;
    world.hold(a.id);
    for (let i = 0; i < 40; i++) {
      world.moveHeld(a.id, 1000 + i * 8, FLOOR - 16);
      world.step();
    }
    expect(b.x).toBeGreaterThan(1150);
    world.dispose();
  });
});

describe('creature in the physics room', () => {
  it('walks up a gentle ramp to reach food at the top', () => {
    const food: ThingSpec = { ...FRUIT, x: 1320, y: FLOOR - 170, fixed: true, respawnSeconds: undefined };
    const world = new World({ seed: 4, things: [plank(1140, FLOOR - 70, -0.4, { hw: 200 }), { name: 'Shelf', form: 'box', colour: 'grey', hw: 60, hh: 8, x: 1360, y: FLOOR - 146, fixed: true }, food] });
    world.placeCreature(960);
    world.setDrive('Hunger', 70);
    let ate = false;
    for (let i = 0; i < 240 * TICKS_PER_SECOND && !ate; i++) {
      world.step();
      ate = world.takeEvents().some((e) => e.type === 'touched' && e.ate);
    }
    expect(ate).toBe(true);
    world.dispose();
  });

  it("can't shove a heavy rock around by walking into it", () => {
    const heavy = { ...ROCK, x: 1200, weight: 6 };
    const world = new World({ seed: 3, things: [heavy] });
    world.placeCreature(1000);
    const startX = world.things[0].x;
    run(world, 120);
    expect(Math.abs(world.things[0].x - startX)).toBeLessThan(60);
    world.dispose();
  });

  it("can't pick up anything heavy", () => {
    const world = new World({ seed: 6, things: [{ ...ROCK, weight: 3 }] });
    for (let i = 0; i < 300 * TICKS_PER_SECOND; i++) {
      world.step();
      world.takeEvents();
      expect(world.creature.holding).toBeNull();
    }
    world.dispose();
  });

  it('falls when let go, then gets on with things', () => {
    const world = new World({ seed: 7 });
    world.holdCreature();
    world.moveHeldCreature(600, 300);
    run(world, 1);
    expect(world.creature.x).toBeCloseTo(600, 3);
    expect(world.creature.y).toBeCloseTo(300, 3);
    world.releaseCreature();
    run(world, 2);
    expect(world.creature.y).toBeGreaterThan(FLOOR - 4);
    const decisions = world.creature.brain.decisions;
    run(world, 10);
    expect(world.creature.brain.decisions).toBeGreaterThan(decisions);
    world.dispose();
  });
});

describe('undo', () => {
  it('undoes and redoes adding something', () => {
    const world = room();
    const history = new History();
    const added = world.add(ball(1000, 500));
    history.commit('Add', world, history.capture(world, []), [added.id]);
    expect(history.undo(world)).toBe('Add');
    expect(world.things.length).toBe(0);
    expect(history.redo(world)).toBe('Add');
    expect(world.things.length).toBe(1);
    expect(world.things[0].id).toBe(added.id);
    world.dispose();
  });

  it('undoes removing something, bringing it back exactly', () => {
    const world = room(plank(1000, 500, 0.3, { colour: 'green', bounce: 0.8 }));
    const history = new History();
    const id = world.things[0].id;
    const before = history.capture(world, [id]);
    world.remove(id);
    history.commit('Delete', world, before);
    history.undo(world);
    const back = world.thing(id)!;
    expect(back.colour).toBe('green');
    expect(back.angle).toBeCloseTo(0.3);
    expect(back.bounce).toBe(0.8);
    expect(back.fixed).toBe(true);
    world.dispose();
  });

  it('undoes a property change, and clears properties it did not have before', () => {
    const world = room(ball(1000, 500, { gravity: false }));
    const history = new History();
    const id = world.things[0].id;
    const before = history.capture(world, [id]);
    world.update(id, { give: { drive: 'Hunger', amount: -20 }, colour: 'red' });
    history.commit('Change', world, before);
    history.undo(world);
    expect(world.thing(id)!.colour).toBe('blue');
    expect(world.thing(id)!.give).toBeUndefined();
    world.dispose();
  });

  it('only moves what the edit touched, not everything else in a running room', () => {
    const world = room(ball(600, 300), plank(1400, 500, 0));
    const history = new History();
    const [falling, fixed] = world.things;
    const before = history.capture(world, [fixed.id]);
    world.update(fixed.id, { x: 1500 });
    history.commit('Move', world, before);
    run(world, 2);
    const fallenTo = falling.y;
    history.undo(world);
    expect(world.thing(fixed.id)!.x).toBe(1400);
    expect(falling.y).toBe(fallenTo);
    world.dispose();
  });

  it("doesn't record an edit that changed nothing, and a new edit clears redo", () => {
    const world = room(ball(1000, 500, { fixed: true }));
    const history = new History();
    const id = world.things[0].id;
    history.commit('Nothing', world, history.capture(world, [id]));
    expect(history.undo(world)).toBeNull();
    const before = history.capture(world, [id]);
    world.update(id, { colour: 'red' });
    history.commit('A', world, before);
    history.undo(world);
    const before2 = history.capture(world, [id]);
    world.update(id, { colour: 'green' });
    history.commit('B', world, before2);
    expect(history.redo(world)).toBeNull();
    world.dispose();
  });

  it('copes with undoing an edit to something the creature has since eaten', () => {
    const world = room({ ...FRUIT, x: 1000 });
    const history = new History();
    const id = world.things[0].id;
    const before = history.capture(world, [id]);
    world.update(id, { x: 1100 });
    history.commit('Move', world, before);
    world.remove(id);
    expect(() => history.undo(world)).not.toThrow();
    expect(world.thing(id)!.x).toBe(1000);
    world.dispose();
  });
});

describe('room files', () => {
  it('saves and opens a room with every property intact', () => {
    const world = room(plank(1000, 500, 0.3, { colour: 'green', bounce: 0.8, friction: 0.1, weight: 4, solid: false, gravity: false }), { ...FRUIT, x: 700 });
    const specs = parseRoom(saveRoom(world)).things;
    expect(specs.length).toBe(2);
    expect(specs[0]).toMatchObject({ colour: 'green', angle: 0.3, bounce: 0.8, friction: 0.1, weight: 4, solid: false, gravity: false, fixed: true });
    expect(specs[1].give).toEqual({ drive: 'Hunger', amount: -25 });
    expect(specs[1].eaten).toBe(true);
    world.dispose();
  });

  it('keeps out the creature, so a room can never replace it', () => {
    const world = room();
    expect(saveRoom(world)).not.toContain('brain');
    world.dispose();
  });

  it('refuses anything that is not a room, with a readable message', () => {
    expect(() => parseRoom('not json')).toThrow(/isn't a Nurtron room/);
    expect(() => parseRoom('{"hello": 1}')).toThrow(/isn't a Nurtron room/);
    expect(() => parseRoom('null')).toThrow(/isn't a Nurtron room/);
    expect(() => parseRoom('{"type":"nurtron-room","version":999,"things":[]}')).toThrow(/newer version/);
  });

  it('cleans up anything nonsense in a file so it cannot break the game', () => {
    const { things: specs } = parseRoom(
      JSON.stringify({
        type: 'nurtron-room',
        version: 1,
        things: [{ form: 'dragon', colour: 'plaid', hw: 1e12, hh: -5, x: 'left', y: 1e9, bounce: 99, weight: 0, name: 'x'.repeat(500), script: 'evil()' }, null, 7],
      }),
    );
    const world = new World({ seed: 1, things: specs });
    expect(specs.length).toBe(3);
    expect(specs[0].form).toBe('box');
    expect(specs[0].colour).toBe('grey');
    expect(specs[0].hw).toBeLessThanOrEqual(SIZE_LIMITS.max);
    expect(specs[0].hh).toBeGreaterThanOrEqual(SIZE_LIMITS.min);
    expect(specs[0].name.length).toBeLessThanOrEqual(40);
    expect(specs[0]).not.toHaveProperty('script');
    run(world, 2);
    for (const t of world.things) expect(Number.isFinite(t.x) && Number.isFinite(t.y)).toBe(true);
    world.dispose();
  });

  it('refuses a room with too many things in it', () => {
    expect(() => parseRoom(JSON.stringify({ type: 'nurtron-room', version: 1, things: new Array(5000).fill({}) }))).toThrow(/more than/);
  });
});

describe('old saves', () => {
  // exactly what milestone 0 wrote to storage, so existing creatures survive this update
  const v1 = {
    version: 1,
    tick: 900,
    rng: 12345,
    nextId: 4,
    things: [
      { name: 'Fruit', shape: 'circle', colour: 'red', radius: 14, x: 620, y: 406, give: { drive: 'Hunger', amount: -25 }, eaten: true, respawnSeconds: 12, id: 2, vx: 0, vy: 0, spin: 0, angle: 0, heldBy: false, dragged: false },
      { name: 'Rock', shape: 'square', colour: 'grey', radius: 26, x: 240, y: 394, id: 3, vx: 0, vy: 0, spin: 0, angle: 0, heldBy: false, dragged: false },
    ],
    respawns: [{ spec: { name: 'Fruit', shape: 'circle', colour: 'red', radius: 14, x: 500, y: 406, give: { drive: 'Hunger', amount: -25 }, eaten: true, respawnSeconds: 12, angle: 0 }, at: 950 }],
    creature: {
      name: 'Blobby',
      x: 450,
      y: 420,
      facing: 1,
      walking: false,
      bornTick: 0,
      drives: [
        { name: 'Food', value: 61, wants: 'high', every: { base: 2, spread: 1 }, change: { base: -1, spread: 0 }, nextTick: 930 },
        { name: 'Energy', value: 80, wants: 'high', every: { base: 5, spread: 1 }, change: { base: -1, spread: 0 }, nextTick: 990 },
      ],
      doing: { action: 'wander', targetId: null, start: 880, until: 960, dir: 1, driveStart: [61, 80] },
      pause: 0,
      stunned: 0,
      holding: null,
    },
    brain: {
      genes: { learningRate: 0.6, curiosity: 0.32, temperature: 0.065, memorySeconds: 2.5, maxConcepts: 128 },
      driveNames: ['Hunger', 'Energy'],
      concepts: [
        { percept: null, w: new Array(27).fill(0), tries: new Array(9).fill(1), uses: 3, lastUsed: 800 },
        { percept: { shape: 'circle', colour: 'red', size: 'small', moving: false, near: 'nearby' }, w: Array.from({ length: 27 }, (_, i) => (i === 7 ? 0.9 : 0)), tries: new Array(9).fill(1), uses: 9, lastUsed: 870 },
      ],
      traces: [],
      decisions: 40,
      boredom: 0.1,
      mood: 0.2,
    },
  };

  it('brings a milestone 0 creature across with its name, age, drives and memories', () => {
    const world = World.load(JSON.stringify(v1));
    const c = world.creature;
    expect(c.name).toBe('Blobby');
    expect(world.tick).toBe(900);
    expect(world.drive('Hunger')!.value).toBe(39);
    expect(c.brain.strongestLinks(1)[0].strength).toBeCloseTo(0.9);
    expect(c.brain.strongestLinks(1)[0].words).toContain('touch small red circle');
    world.dispose();
  });

  it('moves the old room onto the new floor, in the middle of the new room', () => {
    const world = World.load(JSON.stringify(v1));
    const [fruit, rock] = world.things;
    expect(fruit.form).toBe('circle');
    expect(fruit.hw).toBe(14);
    expect(rock.form).toBe('box');
    expect(rock.hw).toBe(26);
    expect(rock.hh).toBe(26);
    expect(fruit.y).toBeCloseTo(FLOOR - 14);
    expect(rock.y).toBeCloseTo(FLOOR - 26);
    expect(world.creature.y).toBe(FLOOR);
    expect(world.creature.x).toBe(450 + (ROOM.width - 900) / 2);
    world.dispose();
  });

  it('carries on working after being brought across, and still knows about food', () => {
    const world = World.load(JSON.stringify(v1));
    world.setDrive('Hunger', 75);
    let ate = false;
    for (let i = 0; i < 120 * TICKS_PER_SECOND && !ate; i++) {
      world.step();
      ate = world.takeEvents().some((e) => e.type === 'touched' && e.ate);
    }
    expect(ate).toBe(true);
    const again = World.load(world.save());
    expect(again.creature.name).toBe('Blobby');
    again.dispose();
    world.dispose();
  });
});
