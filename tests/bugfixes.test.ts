// bugs found in a real world: buttons that seemed not to work, a creature scared of everything, one shut in a box
import { describe, expect, it } from 'vitest';
import { ACTIONS, Brain } from '../src/sim/brain.ts';
import { knowledgeOf, mergeInto } from '../src/sim/hive.ts';
import { newPart } from '../src/sim/parts.ts';
import type { Percept } from '../src/sim/senses.ts';
import { initPhysics, ROOM, TICKS_PER_SECOND, World } from '../src/sim/world.ts';
import type { WorldEvent } from '../src/sim/world.ts';

await initPhysics();

const MIDDLE = ROOM.width / 2;
const FLOOR = ROOM.floor;
const RED: Percept = { shape: 'circle', colour: 'red', size: 'small', moving: false, near: 'close' };

function until(world: World, seconds: number, match: (e: WorldEvent) => boolean): WorldEvent[] {
  const seen: WorldEvent[] = [];
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) {
    world.step();
    const events = world.takeEvents();
    seen.push(...events);
    if (events.some(match)) break;
  }
  return seen;
}

function buttonOnFloor(world: World, x: number) {
  return world.add({ ...newPart('button', x, FLOOR - 40), x, y: FLOOR - 40 });
}

describe('buttons', () => {
  it('pushing a button presses it, and says so', () => {
    const world = new World({ seed: 9401, things: [] });
    world.placeCreature(MIDDLE - 200);
    const button = buttonOnFloor(world, MIDDLE);
    world.tell('push', button.id);
    const seen = until(world, 15, (e) => e.type === 'touched');
    const touched = seen.find((e) => e.type === 'touched');
    expect(touched && touched.type === 'touched' && touched.pressed).toBe(true);
    world.dispose();
  });

  it('going up to a button only looks at it, and says that too', () => {
    const world = new World({ seed: 9402, things: [] });
    world.placeCreature(MIDDLE - 300);
    const button = buttonOnFloor(world, MIDDLE);
    world.tell('approach', button.id);
    const seen = until(world, 15, (e) => e.type === 'did');
    expect(seen.some((e) => e.type === 'did' && e.how === 'looked' && e.thingId === button.id)).toBe(true);
    expect(seen.some((e) => e.type === 'touched')).toBe(false);
    world.dispose();
  });
});

describe('fears', () => {
  function scared(): Brain {
    const b = new Brain(['Hunger']);
    b.fire(RED);
    for (let a = 0; a < ACTIONS.length; a++) b.concepts[1].w[a * b.channels] = -0.9;
    b.concepts[1].w[ACTIONS.indexOf('touch') * b.channels + 1] = 0.6; // it still knows red things help when hungry
    return b;
  }

  it('fade when nothing keeps them fresh, but what helps its needs stays', () => {
    const b = scared();
    for (let s = 0; s < 15 * 60; s++) b.drift(1);
    expect(b.concepts[1].w[0]).toBeGreaterThan(-0.4);
    expect(b.concepts[1].w[ACTIONS.indexOf('touch') * b.channels + 1]).toBeCloseTo(0.6, 5);
  });

  it('halve when you calm it down', () => {
    const b = scared();
    expect(b.fearfulness()).toBeGreaterThan(0.45);
    expect(b.soothe()).toBeGreaterThan(0);
    expect(b.concepts[1].w[0]).toBeCloseTo(-0.45, 5);
  });

  it("don't pile up from ghosts that keep dying", () => {
    const main = new Brain(['Hunger']);
    main.fire(RED);
    const base = knowledgeOf(main, 0);
    const ghosts = Array.from({ length: 8 }, () => {
      const g = new Brain(['Hunger']);
      g.fire(RED);
      g.concepts[1].w[0] = -0.5;
      return knowledgeOf(g, 0);
    });
    mergeInto(main, base, ghosts, 0);
    // eight ghosts each a bit scared make the real one a bit scared, not terrified
    expect(main.concepts[1].w[0]).toBeCloseTo(-0.5, 3);
  });
});

describe('shut in', () => {
  it('notices it is shut in when it keeps not getting anywhere', () => {
    const world = new World({ seed: 9403, things: [] });
    world.placeCreature(MIDDLE);
    // a box round it, too tall to jump out of
    for (const [x, y, hw, hh] of [
      [MIDDLE - 120, FLOOR - 200, 12, 200],
      [MIDDLE + 120, FLOOR - 200, 12, 200],
      [MIDDLE, FLOOR - 400, 132, 12],
    ]) world.add({ name: 'Wall', form: 'box', colour: 'grey', hw, hh, x, y, fixed: true });
    const foods = [-500, 500, 700, -700].map((dx) => world.add({ name: 'Food', form: 'circle', colour: 'red', hw: 14, hh: 14, x: MIDDLE + dx, y: FLOOR - 14, fixed: true }));
    let shutIn = false;
    for (let round = 0; round < 10 && !shutIn; round++) {
      const food = foods[round % foods.length];
      world.creature.cantReach = {};
      world.tell('touch', food.id);
      shutIn = until(world, 10, (e) => e.type === 'shutIn').some((e) => e.type === 'shutIn');
    }
    expect(shutIn).toBe(true);
    world.dispose();
  });
});
