// milestone 5: several creatures in one world, each with its own insides, and babies you can tell apart by how they act.
import { describe, expect, it } from 'vitest';
import { ACTIONS } from '../src/sim/brain.ts';
import type { Genes } from '../src/sim/brain.ts';
import { parseCreature, saveCreature } from '../src/sim/creature-file.ts';
import { cleanGenes, geneRange, mixGenes, rollGenes, STAGES, stageOf, temperament } from '../src/sim/family.ts';
import { newPart } from '../src/sim/parts.ts';
import { Rng } from '../src/sim/rng.ts';
import { initPhysics, MOST_CREATURES, ROOM, TICKS_PER_SECOND, World } from '../src/sim/world.ts';
import type { Creature, Thing } from '../src/sim/world.ts';
import { openWorld, parseWorld, saveWorld } from '../src/sim/world-file.ts';

await initPhysics();

const MIDDLE = ROOM.width / 2;

function run(world: World, seconds: number): void {
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) world.step();
  world.takeEvents();
}

function grownUp(world: World, c: Creature): void {
  c.bornTick = world.tick - STAGES.adult;
}

function twoAdults(seed: number): { world: World; a: Creature; b: Creature } {
  const world = new World({ seed, things: [], genes: rollGenes(new Rng(seed)), name: 'A' });
  const a = world.creature;
  const b = world.newEgg({ name: 'B', genes: rollGenes(new Rng(seed + 1)) }) as Creature;
  b.hatching = 0;
  grownUp(world, a);
  grownUp(world, b);
  return { world, a, b };
}

describe('several creatures in one world', () => {
  it('each has its own stomach', () => {
    const { world, a, b } = twoAdults(8001);
    world.setDrive('Hunger', 60, a);
    world.setDrive('Hunger', 30, b);
    expect(world.drive('Hunger', a)?.value).toBe(60);
    expect(world.drive('Hunger', b)?.value).toBe(30);
    world.giveTo('Hunger', -10, a);
    world.step();
    expect(world.drive('Hunger', a)?.value).toBeLessThanOrEqual(51);
    expect(world.drive('Hunger', b)?.value).toBeGreaterThanOrEqual(30);
    run(world, 30);
    expect(world.drive('Hunger', a)?.value).toBeGreaterThan(50);
    world.dispose();
  });

  it('a fruit feeds whoever touched it, and only they learn from it', () => {
    const { world, a, b } = twoAdults(8002);
    world.setDrive('Hunger', 80, a);
    world.setDrive('Hunger', 80, b);
    world.placeCreature(MIDDLE, a);
    world.placeCreature(MIDDLE + 800, b);
    b.pause = 1e9; // standing still
    const fruit = world.add({ name: 'Fruit', form: 'circle', colour: 'red', hw: 14, hh: 14, x: MIDDLE + 60, eaten: true, respawnSeconds: 12 });
    const give = world.add({ ...newPart('give', 500, 300), part: { kind: 'give', target: 'Hunger', amount: -25 } });
    world.connect(fruit.id, 'touched', give.id, 'give');
    let ate = false;
    for (let i = 0; i < 120 * TICKS_PER_SECOND && !ate; i++) {
      world.step();
      ate = world.takeEvents().some((e) => e.type === 'touched' && e.who === a.id && e.ate);
    }
    expect(ate).toBe(true);
    expect(world.drive('Hunger', a)?.value).toBeLessThan(70);
    expect(world.drive('Hunger', b)?.value).toBeGreaterThanOrEqual(80);
    expect(b.brain.strongestLinks(5)).toEqual([]);
    world.dispose();
  });

  it('a pet lands on the one you petted', () => {
    const { world, a, b } = twoAdults(8003);
    const events: string[] = [];
    world.pet(b);
    for (const e of world.takeEvents()) if (e.type === 'petted') events.push(String(e.who));
    expect(events).toEqual([String(b.id)]);
    expect(b.brain.mood).toBeGreaterThan(0);
    expect(a.brain.mood).toBe(0);
    world.dispose();
  });

  it("wires can't cross between two creatures, and each body stays its own", () => {
    const { world, a, b } = twoAdults(8004);
    const inA = world.things.find((t) => t.owner === a.id && t.part?.kind === 'label') as Thing;
    const inB = world.things.find((t) => t.owner === b.id && t.part?.kind === 'drive') as Thing;
    expect(world.whyNotConnect(inA.id, 'value', inB.id, 'value')).toMatch(/two different creatures/);
    expect(world.things.filter((t) => t.owner === a.id).length).toBe(world.things.filter((t) => t.owner === b.id).length);
    world.dispose();
  });

  it('all of them come back from a save, and a world file', () => {
    const { world, a, b } = twoAdults(8005);
    world.setDrive('Hunger', 67, a);
    world.setDrive('Hunger', 34, b);
    const copy = World.load(world.save());
    expect(copy.creatures.map((c) => c.name)).toEqual(['A', 'B']);
    expect(copy.drive('Hunger', copy.creatureById(a.id))?.value).toBe(67);
    expect(copy.drive('Hunger', copy.creatureById(b.id))?.value).toBe(34);
    run(copy, 10);
    const opened = openWorld(parseWorld(saveWorld(world)), 8006);
    expect(opened.creatures.map((c) => c.name)).toEqual(['A', 'B']);
    expect(opened.creatures.map((c) => opened.drive('Hunger', c)?.value)).toEqual([67, 34]);
    run(opened, 10);
    world.dispose();
    copy.dispose();
    opened.dispose();
  });

  it('a creature can be sent away, but not the last one, and it never goes over the limit', () => {
    const { world, a, b } = twoAdults(8007);
    expect(world.removeCreature(b.id)).toBe(true);
    expect(world.things.some((t) => t.owner === b.id)).toBe(false);
    expect(world.removeCreature(a.id)).toBe(false);
    while (world.creatures.length < MOST_CREATURES) world.newEgg({});
    expect(world.newEgg({})).toBeNull();
    run(world, 2);
    world.dispose();
  });

  it('twenty creatures can live together for a while', () => {
    const world = new World({ seed: 8008, genes: rollGenes(new Rng(8008)) });
    for (let i = 1; i < 20; i++) world.newEgg({ genes: rollGenes(new Rng(8008 + i)) });
    run(world, 60);
    expect(world.creatures.every((c) => c.hatching === 0)).toBe(true);
    world.dispose();
  });
});

describe('genes', () => {
  it('a new egg varies, and stays in range however many generations go by', () => {
    const rng = new Rng(8100);
    let genes = rollGenes(rng);
    const other = rollGenes(rng);
    expect(genes).not.toEqual(other);
    for (let i = 0; i < 500; i++) genes = mixGenes(genes, other, rng);
    for (const key of Object.keys(genes) as (keyof Genes)[]) {
      expect(genes[key]).toBeGreaterThanOrEqual(geneRange(key).min);
      expect(genes[key]).toBeLessThanOrEqual(geneRange(key).max);
    }
  });

  it('a file cannot give a creature impossible genes', () => {
    const clean = cleanGenes({ pace: 1e9, restful: -1e9, learningRate: 'fast' });
    expect(clean.pace).toBe(geneRange('pace').max);
    expect(clean.restful).toBe(geneRange('restful').min);
    expect(clean.learningRate).toBe(0.6);
  });

  it('can be put in plain words', () => {
    expect(temperament({ ...cleanGenes({}), pace: 1.4, chatty: 0.15 })).toEqual(expect.arrayContaining(['quick on its feet', 'chatty']));
    expect(temperament(cleanGenes({}))).toEqual(['nothing out of the ordinary']);
  });
});

describe('babies', () => {
  it('only grown-ups can have one, and they need a rest afterwards', () => {
    const { world, a, b } = twoAdults(8200);
    expect(world.whyNoBaby(a, a)).toMatch(/takes two/);
    b.bornTick = world.tick;
    expect(world.whyNoBaby(a, b)).toMatch(/isn't grown up/);
    grownUp(world, b);
    const baby = world.haveBaby(a, b) as Creature;
    expect(baby.hatching).toBeGreaterThan(0);
    expect(world.whyNoBaby(a, b)).toMatch(/rest/);
    expect(stageOf(world.tick - baby.bornTick)).toBe('baby');
    world.dispose();
  });

  it("gets its parents' genes and a body of its own, and none of what they learned", () => {
    const { world, a, b } = twoAdults(8201);
    a.brain.concepts[0].w[0] = 0.9;
    a.brain.fire({ shape: 'circle', colour: 'red', size: 'small', moving: false, near: 'close' });
    const baby = world.haveBaby(a, b) as Creature;
    expect(baby.brain.concepts.length).toBe(1);
    expect(baby.brain.concepts[0].w.every((w) => w === 0)).toBe(true);
    expect(world.drive('Hunger', baby)).toBeDefined();
    world.setDrive('Hunger', 88, baby);
    expect(world.drive('Hunger', a)?.value).not.toBe(88);
    run(world, 10);
    expect(baby.hatching).toBe(0);
    expect(baby.brain.genes).not.toEqual(a.brain.genes);
    world.dispose();
  });

  it('inherits a body wired by hand, so a need you built passes down', () => {
    const { world, a, b } = twoAdults(8202);
    for (const c of [a, b]) {
      world.focusOn(c.id);
      const disco = world.add({ ...newPart('label', 800, 100), name: 'Disco', inBody: true, part: { kind: 'label', value: 9 } });
      const socket = world.add({ ...newPart('drive', 1000, 100), name: 'Disco', inBody: true });
      world.connect(disco.id, 'value', socket.id, 'value');
    }
    const baby = world.haveBaby(a, b) as Creature;
    world.step();
    expect(world.drive('Disco', baby)?.value).toBe(9);
    world.dispose();
  });

  it('keeps a family tree that goes with it to another PC', () => {
    const { world, a, b } = twoAdults(8203);
    const baby = world.haveBaby(a, b) as Creature;
    baby.hatching = 0;
    grownUp(world, baby);
    const c = world.newEgg({ name: 'C' }) as Creature;
    c.hatching = 0;
    grownUp(world, c);
    const grandchild = world.haveBaby(baby, c) as Creature;
    expect(world.family[grandchild.uid].generation).toBe(2);
    expect(world.familyOf(grandchild).map((k) => k.name)).toEqual(expect.arrayContaining(['A', 'B', 'C', baby.name, grandchild.name]));

    const friend = new World({ seed: 8204, things: [] });
    const arrived = friend.adoptCreature(parseCreature(saveCreature(world, grandchild))) as Creature;
    expect(arrived.uid).toBe(grandchild.uid);
    expect(friend.familyOf(arrived).map((k) => k.name)).toEqual(expect.arrayContaining(['A', 'B', 'C']));
    const twin = friend.adoptCreature(parseCreature(saveCreature(world, grandchild))) as Creature;
    expect(twin.uid).not.toBe(arrived.uid);
    expect(friend.family[twin.uid].parents).toEqual(friend.family[arrived.uid].parents);
    world.dispose();
    friend.dispose();
  });

  it('being sent away leaves them in the family tree', () => {
    const { world, a, b } = twoAdults(8205);
    const baby = world.haveBaby(a, b) as Creature;
    world.removeCreature(a.id);
    expect(world.family[a.uid].gone).toBe(true);
    expect(world.familyOf(baby).map((k) => k.name)).toContain('A');
    world.dispose();
  });
});

// the plan's test: you can tell siblings apart by how they act, not just how they look.
describe('telling siblings apart', () => {
  // what share of its time goes on what, in the same room, over ten minutes
  function habits(genes: Genes, seed: number): number[] {
    const world = new World({ seed, genes });
    const counts = new Array(ACTIONS.length + 1).fill(0);
    let walked = 0;
    let lastX = world.creature.x;
    for (let i = 0; i < 600 * TICKS_PER_SECOND; i++) {
      world.step();
      walked += Math.abs(world.creature.x - lastX);
      lastX = world.creature.x;
      for (const e of world.takeEvents()) if (e.type === 'decided') counts[ACTIONS.indexOf(e.decision.action)]++;
    }
    world.dispose();
    const total = counts.reduce((s, v) => s + v, 0) || 1;
    const shares = counts.map((v) => v / total);
    shares[ACTIONS.length] = walked / 40000;
    return shares;
  }

  const distance = (a: number[], b: number[]): number => Math.hypot(...a.map((v, i) => v - b[i]));

  it('a sibling acts more like itself on another day than like its brothers and sisters', () => {
    let right = 0;
    let tries = 0;
    for (let family = 0; family < 10; family++) {
      const rng = new Rng(9300 + family);
      const mum = rollGenes(rng);
      const dad = rollGenes(rng);
      const siblings = Array.from({ length: 4 }, () => mixGenes(mum, dad, rng));
      const seen = siblings.map((genes, i) => habits(genes, 9400 + family * 10 + i));
      siblings.forEach((genes, i) => {
        const again = habits(genes, 9600 + family * 10 + i);
        let best = 0;
        for (let j = 1; j < seen.length; j++) if (distance(again, seen[j]) < distance(again, seen[best])) best = j;
        tries++;
        if (best === i) right++;
      });
    }
    console.log(`Told siblings apart by behaviour: ${right} of ${tries} (guessing gets 25%)`);
    expect(right / tries).toBeGreaterThanOrEqual(0.6);
  }, 120000);

  it('creatures with varied genes can still learn and stay fed', () => {
    let fed = 0;
    const seeds = Array.from({ length: 20 }, (_, i) => 8600 + i);
    for (const seed of seeds) {
      const world = new World({ seed, genes: rollGenes(new Rng(seed)) });
      let hungriest = 0;
      for (let i = 0; i < 600 * TICKS_PER_SECOND; i++) {
        world.step();
        world.takeEvents();
        hungriest = Math.max(hungriest, world.drive('Hunger')?.value ?? 100);
      }
      if (hungriest <= 90) fed++;
      world.dispose();
    }
    expect(fed / seeds.length).toBeGreaterThanOrEqual(0.8);
  }, 120000);
});

describe('map sizes', () => {
  it('a world can be huge, and a creature still walks on its floor', () => {
    const world = new World({ seed: 8700, size: { width: 20000, height: 4000 } });
    expect(world.size.floor).toBe(3940);
    expect(world.creature.x).toBe(10000);
    run(world, 20);
    expect(world.creature.y).toBeGreaterThan(3900);
    expect(world.things.find((t) => t.name === 'Rock')?.y).toBeGreaterThan(3800);
    const copy = World.load(world.save());
    expect(copy.size.width).toBe(20000);
    run(copy, 5);
    expect(copy.creature.y).toBeGreaterThan(3900);
    world.dispose();
    copy.dispose();
  });

  it('sizes stay in range', () => {
    const world = new World({ seed: 8701, size: { width: 1e9, height: 1 } });
    expect(world.size.width).toBe(40000);
    expect(world.size.height).toBe(600);
    world.dispose();
  });

  it('resizing keeps everything on the floor, and stays inside when it shrinks', () => {
    const world = new World({ seed: 8702, size: { width: 6000, height: 2000 } });
    run(world, 5);
    const rock = world.things.find((t) => t.name === 'Rock') as Thing;
    const gap = world.size.floor - rock.y;
    world.resize(12000, 3000);
    run(world, 5);
    expect(Math.abs(world.size.floor - rock.y - gap)).toBeLessThan(3);
    expect(world.creature.y).toBeGreaterThan(world.size.floor - 5);
    world.resize(1000, 600);
    run(world, 5);
    for (const t of world.things) if (!t.inBody) expect(t.x).toBeLessThanOrEqual(1000);
    expect(world.creature.x).toBeLessThanOrEqual(1000);
    expect(world.creature.y).toBeLessThanOrEqual(world.size.floor + 1);
    world.dispose();
  });

  it('a world file keeps its size', () => {
    const world = new World({ seed: 8703, size: { width: 9000, height: 3000 } });
    const opened = openWorld(parseWorld(saveWorld(world)), 8704);
    expect(opened.size.width).toBe(9000);
    expect(opened.size.height).toBe(3000);
    world.dispose();
    opened.dispose();
  });

  it('old saves keep the size they had', () => {
    const world = new World({ seed: 8705 });
    const saved = JSON.parse(world.save());
    saved.version = 6;
    delete saved.size;
    expect(World.load(JSON.stringify(saved)).size.width).toBe(ROOM.width);
    world.dispose();
  });
});

function buildFood(world: World): void {
  world.add({ name: 'Fruit', form: 'circle', colour: 'red', hw: 14, hh: 14, x: MIDDLE + 170, give: { drive: 'Hunger', amount: -25 }, eaten: true, respawnSeconds: 12 });
}

describe('telling it what to do', () => {
  function roomWithHexagon(seed: number): { world: World; hexagon: Thing; rock: Thing } {
    const world = new World({ seed, things: [] });
    const hexagon = world.add({ name: 'Hexagon', form: 'hexagon', colour: 'blue', hw: 22, hh: 22, x: MIDDLE + 400 });
    const rock = world.add({ name: 'Rock', form: 'box', colour: 'grey', hw: 26, hh: 26, x: MIDDLE - 400, weight: 3 });
    return { world, hexagon, rock };
  }

  it('it goes and does it, however far, and in the order you said', () => {
    const { world, hexagon, rock } = roomWithHexagon(8800);
    expect(world.tell('touch', hexagon.id)).toBeNull();
    expect(world.tell('touch', rock.id)).toBeNull();
    expect(world.tell('rest', null)).toBeNull();
    const done: string[] = [];
    for (let i = 0; i < 60 * TICKS_PER_SECOND && done.length < 3; i++) {
      world.step();
      for (const e of world.takeEvents()) {
        if (e.type === 'touched') done.push(e.name);
        if (e.type === 'decided' && e.told && e.decision.action === 'rest') done.push('rest');
      }
    }
    expect(done).toEqual(['Hexagon', 'Rock', 'rest']);
    world.dispose();
  });

  it('a long walk in a huge room still gets there', () => {
    const world = new World({ seed: 8801, things: [], size: { width: 20000, height: 2000 } });
    const far = world.add({ name: 'Far', form: 'circle', colour: 'blue', hw: 20, hh: 20, x: 15000, fixed: true });
    world.tell('touch', far.id);
    let got = false;
    for (let i = 0; i < 120 * TICKS_PER_SECOND && !got; i++) {
      world.step();
      got = world.takeEvents().some((e) => e.type === 'touched' && e.thingId === far.id);
    }
    expect(got).toBe(true);
    world.dispose();
  });

  it('makes it learn: told a few times, it goes back by itself far more than one never told', () => {
    let taughtTotal = 0;
    let plainTotal = 0;
    for (let n = 0; n < 16; n++) {
      const seed = 8820 + n;
      const count = (teach: boolean): number => {
        const { world, hexagon } = roomWithHexagon(seed);
        if (teach) {
          for (let i = 0; i < 3; i++) world.tell('touch', hexagon.id);
          for (let i = 0; i < 40 * TICKS_PER_SECOND && world.creature.orders.length + (world.creature.doing?.told ? 1 : 0) > 0; i++) world.step();
          world.takeEvents();
        }
        let touches = 0;
        for (let i = 0; i < 180 * TICKS_PER_SECOND; i++) {
          world.step();
          for (const e of world.takeEvents()) if (e.type === 'touched' && e.thingId === hexagon.id) touches++;
        }
        world.dispose();
        return touches;
      };
      taughtTotal += count(true);
      plainTotal += count(false);
    }
    console.log(`Touches of the hexagon in 3 minutes: taught ${taughtTotal / 16}, never told ${plainTotal / 16}`);
    expect(taughtTotal).toBeGreaterThan(plainTotal * 2);
    expect(taughtTotal / 16).toBeLessThan(40); // it should like it, not do nothing else
  }, 60000);

  it("being told doesn't turn into an obsession: it still looks after itself", () => {
    let fed = 0;
    for (let n = 0; n < 12; n++) {
      const { world, hexagon } = roomWithHexagon(8860 + n);
      buildFood(world);
      for (let i = 0; i < 5; i++) world.tell('touch', hexagon.id);
      let hungriest = 0;
      for (let i = 0; i < 600 * TICKS_PER_SECOND; i++) {
        world.step();
        world.takeEvents();
        hungriest = Math.max(hungriest, world.drive('Hunger')?.value ?? 100);
      }
      if (hungriest <= 90) fed++;
      world.dispose();
    }
    expect(fed).toBeGreaterThanOrEqual(10);
  }, 60000);

  it('without remembering, it does it but learns nothing from being told', () => {
    const { world, hexagon } = roomWithHexagon(8802);
    world.tell('touch', hexagon.id, false);
    let touched = false;
    for (let i = 0; i < 30 * TICKS_PER_SECOND && !touched; i++) {
      world.step();
      touched = world.takeEvents().some((e) => e.type === 'touched');
    }
    expect(touched).toBe(true);
    expect(world.creature.brain.strongestLinks(5, 0.1)).toEqual([]);
    world.dispose();
  });

  it('a real reward still teaches on top, a slap cancels, and something gone is skipped', () => {
    const { world, hexagon, rock } = roomWithHexagon(8803);
    world.tell('touch', hexagon.id);
    world.tell('touch', rock.id);
    world.step();
    world.slap();
    expect(world.creature.orders).toEqual([]);
    world.tell('touch', hexagon.id);
    world.tell('call', null);
    world.remove(hexagon.id);
    const seen: string[] = [];
    for (let i = 0; i < 5 * TICKS_PER_SECOND; i++) {
      world.step();
      for (const e of world.takeEvents()) if (e.type === 'decided' && e.told) seen.push(e.decision.action);
    }
    expect(seen).toEqual(['call']);
    expect(world.tell('touch', 99999)).toMatch(/needs something/);
    world.dispose();
  });

  it('a creature that cannot get there gives up and says so, and drops the rest', () => {
    const world = new World({ seed: 8804, things: [] });
    const high = world.add({ name: 'High', form: 'circle', colour: 'red', hw: 14, hh: 14, x: MIDDLE, y: 200, fixed: true, gravity: false });
    world.tell('touch', high.id);
    world.tell('rest', null);
    let gaveUp = false;
    for (let i = 0; i < 60 * TICKS_PER_SECOND && !gaveUp; i++) {
      world.step();
      gaveUp = world.takeEvents().some((e) => e.type === 'gaveUp' && e.name === 'High');
    }
    expect(gaveUp).toBe(true);
    expect(world.creature.orders).toEqual([]);
    world.dispose();
  });

  it('orders survive a save', () => {
    const { world, hexagon } = roomWithHexagon(8805);
    world.tell('touch', hexagon.id);
    const copy = World.load(world.save());
    expect(copy.creature.orders).toHaveLength(1);
    world.dispose();
    copy.dispose();
  });
});
