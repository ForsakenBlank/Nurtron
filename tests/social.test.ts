// creatures that notice each other: another creature is something it can see, go to, back away from, push or cuddle
// up to. cuddling is felt by both, through a Feel part's Cuddled output, which is how Loneliness comes down.
import { describe, expect, it } from 'vitest';
import { Brain } from '../src/sim/brain.ts';
import { Rng } from '../src/sim/rng.ts';
import { initPhysics, ROOM, TICKS_PER_SECOND, World } from '../src/sim/world.ts';
import type { Creature } from '../src/sim/world.ts';

await initPhysics();

const MIDDLE = ROOM.width / 2;

function run(world: World, seconds: number): void {
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) world.step();
  world.takeEvents();
}

function pair(seed: number, stats: ('loneliness' | 'energy' | 'hunger')[] = ['loneliness', 'energy']): { world: World; a: Creature; b: Creature } {
  const world = new World({ seed, things: [], stats, name: 'A' });
  const a = world.creature;
  const b = world.newEgg({ name: 'B', stats, look: { ...a.look, body: 0xf2776b } }) as Creature;
  b.hatching = 0;
  world.focusOn(a.id);
  world.placeCreature(MIDDLE - 150, a);
  world.placeCreature(MIDDLE + 150, b);
  return { world, a, b };
}

// does what it's told and waits until it's done
function obey(world: World, c: Creature, action: 'touch' | 'push' | 'approach', target: number, remember = false): void {
  world.tell(action, target, remember, c);
  for (let i = 0; i < 20 * TICKS_PER_SECOND && (c.orders.length || c.doing?.told); i++) world.step();
}

describe('creatures notice each other', () => {
  it('sees another creature as a creature of its colour, never its name', () => {
    const { world, a, b } = pair(9101);
    const seen = world.perceiveCreature(b, a);
    expect(seen.shape).toBe('creature');
    expect(seen.colour).toBe('red');
    expect(seen.size).toBe('medium');
    expect(seen.near).toBe('nearby');
    world.dispose();
  });

  it('a cuddle is felt by both, and brings Loneliness down for both', () => {
    const { world, a, b } = pair(9102);
    world.setDrive('Loneliness', 80, a);
    world.setDrive('Loneliness', 80, b);
    b.pause = 1e9; // standing still
    world.tell('touch', b.id, false, a);
    let cuddled = false;
    for (let i = 0; i < 20 * TICKS_PER_SECOND && !cuddled; i++) {
      world.step();
      cuddled = world.takeEvents().some((e) => e.type === 'cuddled' && e.who === a.id && e.other === b.id);
    }
    expect(cuddled).toBe(true);
    world.step();
    expect(world.drive('Loneliness', a)?.value).toBeLessThan(70);
    expect(world.drive('Loneliness', b)?.value).toBeLessThan(70);
    world.dispose();
  });

  it("can't be grabbed and carried off", () => {
    const { world, a, b } = pair(9103);
    expect(world.tell('grab', b.id, false, a)).toMatch(/carry/);
    expect(a.brain.allowed('grab', world.perceiveCreature(b, a), false)).toBe(false);
    world.dispose();
  });

  it('a push knocks the other one away', () => {
    const { world, a, b } = pair(9104);
    b.pause = 1e9;
    const before = b.x;
    obey(world, a, 'push', b.id);
    run(world, 1);
    expect(b.x).toBeGreaterThan(before + 10);
    world.dispose();
  });

  // how often a lonely creature goes for the other creature over a rock, after some cuddles or none
  function goesForCompany(cuddles: number): number {
    let picked = 0;
    let tries = 0;
    for (let seed = 9201; seed < 9213; seed++) {
      const { world, a, b } = pair(seed);
      b.pause = 1e9;
      // a few cuddles while lonely, which it learns from because they help
      for (let i = 0; i < cuddles; i++) {
        world.setDrive('Loneliness', 85, a);
        obey(world, a, 'touch', b.id);
        world.placeCreature(MIDDLE - 150, a);
      }
      // then a rock to choose instead, and it's lonely again
      world.add({ name: 'Rock', form: 'box', colour: 'grey', hw: 26, hh: 26, x: MIDDLE - 450, weight: 3 });
      a.brain.learning = false;
      world.rng = new Rng(seed);
      world.interrupt(a);
      world.setDrive('Loneliness', 85, a);
      world.setDrive('Energy', 90, a);
      world.takeEvents();
      let choice: 'creature' | 'rock' | null = null;
      for (let i = 0; i < 15 * TICKS_PER_SECOND && !choice; i++) {
        world.step();
        for (const e of world.takeEvents()) {
          if (e.type !== 'decided' || e.who !== a.id || !e.decision.chosen.percept) continue;
          choice = e.decision.chosen.percept.shape === 'creature' ? 'creature' : 'rock';
        }
      }
      tries++;
      if (choice === 'creature') picked++;
      world.dispose();
    }
    return picked / tries;
  }

  it('a lonely creature that has been comforted by cuddles goes looking for one', () => {
    const taught = goesForCompany(3);
    const not = goesForCompany(0);
    console.log(`social: a lonely creature goes for company ${Math.round(taught * 100)}% after 3 cuddles, ${Math.round(not * 100)}% with none`);
    expect(taught).toBeGreaterThanOrEqual(0.75);
    expect(taught).toBeGreaterThan(not + 0.2);
  });

  it('switched off, others are invisible to it', () => {
    Brain.defaults = { ...Brain.defaults, social: false };
    try {
      const { world, a } = pair(9105);
      world.takeEvents();
      let sawOne = false;
      for (let i = 0; i < 20 * TICKS_PER_SECOND; i++) {
        world.step();
        for (const e of world.takeEvents()) if (e.type === 'decided' && e.who === a.id && e.decision.options.some((o) => o.percept?.shape === 'creature')) sawOne = true;
      }
      expect(sawOne).toBe(false);
      world.dispose();
    } finally {
      Brain.defaults = { ...Brain.defaults, social: true };
    }
  });

  it('stops going to someone who has been sent away', () => {
    const { world, a, b } = pair(9106);
    b.pause = 1e9;
    world.placeCreature(MIDDLE + 600, b);
    world.tell('touch', b.id, false, a);
    run(world, 1);
    expect(a.doing?.targetId).toBe(b.id);
    world.removeCreature(b.id);
    expect(a.doing).toBeNull();
    run(world, 2);
    world.dispose();
  });

  it('an older Loneliness gets cuddles wired in when it opens', () => {
    const { world, a } = pair(9107);
    const feel = world.circuit.allParts.find((t) => t.owner === a.id && t.stat === 'loneliness' && t.part?.kind === 'feel');
    const wire = world.wires.find((w) => w.from === feel?.id && w.out === 'cuddled');
    expect(wire).toBeDefined();
    world.disconnect(wire!.id);
    const opened = World.load(world.save());
    const feelAgain = opened.circuit.allParts.find((t) => t.owner === a.id && t.stat === 'loneliness' && t.part?.kind === 'feel');
    expect(opened.wires.some((w) => w.from === feelAgain?.id && w.out === 'cuddled')).toBe(true);
    world.dispose();
    opened.dispose();
  });
});

describe('getting about', () => {
  it('turns back from the wall when wandering, instead of walking into it', () => {
    const world = new World({ seed: 9301, things: [], stats: ['energy'] });
    const c = world.creature;
    let near = 0;
    for (let round = 0; round < 6; round++) {
      world.placeCreature(60);
      c.heading = -1;
      world.tell('wander', null, false);
      run(world, 3);
      if (c.x < 70) near++;
    }
    expect(near).toBe(0);
    world.dispose();
  });

  it("tries again for something it couldn't reach once that has moved", () => {
    const world = new World({ seed: 9302, things: [], stats: ['energy'] });
    const c = world.creature;
    const ball = world.add({ name: 'Ball', form: 'circle', colour: 'blue', hw: 14, hh: 14, x: MIDDLE + 300 });
    c.cantReach[ball.id] = world.tick + 1e6;
    c.blockedAt[ball.id] = { x: ball.x, y: ball.y };
    run(world, 2);
    expect(c.cantReach[ball.id]).toBeDefined();
    world.update(ball.id, { x: MIDDLE - 300 });
    c.pause = 1;
    c.doing = null;
    run(world, 1);
    expect(c.cantReach[ball.id]).toBeUndefined();
    world.dispose();
  });
});
