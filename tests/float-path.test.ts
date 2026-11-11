// getting around in zero gravity: round walls instead of into them, and saying so when there's no way at all
import { describe, expect, it } from 'vitest';
import { buildGrid, findPath } from '../src/sim/float-path.ts';
import { CANT_GO, initPhysics, ROOM, TICKS_PER_SECOND, World } from '../src/sim/world.ts';
import type { Thing, WorldEvent } from '../src/sim/world.ts';

await initPhysics();

const MIDDLE = ROOM.width / 2;
const ROOM_BOUNDS = { left: 0, top: 0, right: ROOM.width, bottom: ROOM.floor };

function wall(world: World, x: number, y: number, hw: number, hh: number): Thing {
  return world.add({ name: 'Wall', form: 'box', colour: 'grey', hw, hh, x, y, fixed: true });
}

function run(world: World, seconds: number, until: (e: WorldEvent) => boolean): WorldEvent | null {
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) {
    world.step();
    const hit = world.takeEvents().find(until);
    if (hit) return hit;
  }
  return null;
}

describe('the grid search', () => {
  it('goes round a wall', () => {
    const wallShape = { form: 'box' as const, hw: 20, hh: 300, x: 500, y: 450, angle: 0 };
    const grid = buildGrid([wallShape], ROOM_BOUNDS, { x: 200, y: 450 }, { x: 800, y: 450 });
    const path = findPath(grid, { x: 200, y: 450 }, { x: 800, y: 450 }, (p) => Math.hypot(p.x - 800, p.y - 450) < 30);
    expect(path).not.toBeNull();
    // it has to go above or below the wall, so some point is past its top or bottom
    expect(path!.some((p) => p.y < 150 || p.y > 750)).toBe(true);
  });

  it('finds nothing when the goal is shut in', () => {
    const shapes = [
      { form: 'box' as const, hw: 120, hh: 10, x: 800, y: 330, angle: 0 },
      { form: 'box' as const, hw: 120, hh: 10, x: 800, y: 570, angle: 0 },
      { form: 'box' as const, hw: 10, hh: 120, x: 680, y: 450, angle: 0 },
      { form: 'box' as const, hw: 10, hh: 120, x: 920, y: 450, angle: 0 },
    ];
    const grid = buildGrid(shapes, ROOM_BOUNDS, { x: 200, y: 450 }, { x: 800, y: 450 });
    expect(findPath(grid, { x: 200, y: 450 }, { x: 800, y: 450 }, (p) => Math.hypot(p.x - 800, p.y - 450) < 30)).toBeNull();
  });
});

describe('floating creatures', () => {
  it('gets round a wall to food behind it', () => {
    let got = 0;
    for (let seed = 9300; seed < 9305; seed++) {
      const world = new World({ seed, things: [], gravity: { strength: 0, direction: 90 } });
      world.placeCreature(MIDDLE - 450);
      wall(world, MIDDLE, 520, 20, 330);
      const food = world.add({ name: 'Food', form: 'circle', colour: 'red', hw: 14, hh: 14, x: MIDDLE + 300, y: 520, fixed: true });
      world.tell('touch', food.id);
      if (run(world, 40, (e) => e.type === 'touched' && e.thingId === food.id)) got++;
      world.dispose();
    }
    expect(got).toBeGreaterThanOrEqual(4);
  });

  it('stops and says it cannot go there when the food is boxed in', () => {
    const world = new World({ seed: 9310, things: [], gravity: { strength: 0, direction: 90 } });
    world.placeCreature(MIDDLE - 450);
    const x = MIDDLE + 300;
    wall(world, x, 380, 120, 10);
    wall(world, x, 620, 120, 10);
    wall(world, x - 120, 500, 10, 130);
    wall(world, x + 120, 500, 10, 130);
    const food = world.add({ name: 'Food', form: 'circle', colour: 'red', hw: 14, hh: 14, x, y: 500, fixed: true });
    world.tell('touch', food.id);
    const spoke = run(world, 20, (e) => (e.type === 'spoke' && e.text === CANT_GO) || (e.type === 'touched' && e.thingId === food.id));
    expect(spoke?.type).toBe('spoke');
    world.dispose();
  });
});
