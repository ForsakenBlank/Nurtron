// the parts that turn Nurtron into something you could build a whole game with. nothing here needs a creature.
import { describe, expect, it } from 'vitest';
import { newPart } from '../src/sim/parts.ts';
import type { Part, PartKind } from '../src/sim/parts.ts';
import { parseRoom } from '../src/sim/room-file.ts';
import { initPhysics, ROOM, TICKS_PER_SECOND, World } from '../src/sim/world.ts';
import type { Thing, ThingSpec } from '../src/sim/world.ts';

await initPhysics();

const FLOOR = ROOM.floor;

function part(world: World, kind: PartKind, settings: Partial<Part> = {}, x = 300, y = 300, extra: Partial<ThingSpec> = {}): Thing {
  const spec = newPart(kind, x, y);
  return world.add({ ...spec, part: { ...spec.part, ...settings }, ...extra });
}

function ball(world: World, x = 1000, y = 500, extra: Partial<ThingSpec> = {}): Thing {
  return world.add({ name: 'Ball', form: 'circle', colour: 'blue', hw: 14, hh: 14, x, y, ...extra });
}

function emptyRoom(seed: number): World {
  const world = new World({ seed, things: [], body: 'blank' });
  world.setCreaturesAway(true);
  return world;
}

function run(world: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) world.step();
}

describe('logic', () => {
  it('Logic does and, or, not and either-but-not-both', () => {
    const world = emptyRoom(9300);
    const yes = part(world, 'button', { latch: true });
    world.pressButton(yes.id);
    world.step();
    const no = part(world, 'button', { latch: true });
    const answer = (op: Part['op'], a: Thing, b: Thing): unknown => {
      const gate = part(world, 'logic', { op });
      world.connect(a.id, 'on', gate.id, 'a');
      world.connect(b.id, 'on', gate.id, 'b');
      world.step();
      return world.circuit.peek(gate.id, 'result');
    };
    expect(answer('and', yes, yes)).toBe(true);
    expect(answer('and', yes, no)).toBe(false);
    expect(answer('or', yes, no)).toBe(true);
    expect(answer('not', no, no)).toBe(true);
    expect(answer('xor', yes, yes)).toBe(false);
    world.dispose();
  });

  it('Math does remainders and powers', () => {
    const world = emptyRoom(9301);
    const mod = part(world, 'math', { op: 'remainder', a: 7, b: 3 });
    const pow = part(world, 'math', { op: 'power', a: 2, b: 10 });
    world.step();
    expect(world.circuit.peek(mod.id, 'result')).toBe(1);
    expect(world.circuit.peek(pow.id, 'result')).toBe(1024);
    world.dispose();
  });

  it('Random only changes when told to, and stays in range', () => {
    const world = emptyRoom(9302);
    const random = part(world, 'random', { a: 1, b: 6 });
    const button = part(world, 'button');
    world.connect(button.id, 'pressed', random.id, 'roll');
    const seen = new Set<unknown>();
    for (let i = 0; i < 60; i++) {
      world.pressButton(button.id);
      world.step();
      const before = world.circuit.peek(random.id, 'value');
      seen.add(before);
      world.step();
      expect(world.circuit.peek(random.id, 'value')).toBe(before);
    }
    expect([...seen].every((v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 6)).toBe(true);
    expect(seen.size).toBeGreaterThan(3);
    world.dispose();
  });

  it('Delay passes a pulse along later, even several at once', () => {
    const world = emptyRoom(9303);
    const button = part(world, 'button');
    const delay = part(world, 'delay', { seconds: 1 });
    const count = part(world, 'label', { value: 0 });
    const add = part(world, 'math', { op: 'add', b: 1 });
    world.connect(button.id, 'pressed', delay.id, 'go');
    world.connect(delay.id, 'done', count.id, 'update');
    world.connect(count.id, 'value', add.id, 'a');
    world.connect(add.id, 'result', count.id, 'set');
    world.pressButton(button.id);
    run(world, 5);
    world.pressButton(button.id);
    run(world, 10);
    expect(count.live?.value).toBe(0);
    run(world, 40);
    expect(count.live?.value).toBe(2);
    world.dispose();
  });
});

describe('things', () => {
  it('a Spawner makes copies, wired up the same, up to its limit, which is a fruit dispenser', () => {
    const world = new World({ seed: 9310, things: [] });
    const fruit = ball(world, 1000, 300, { colour: 'red', eaten: true });
    const give = part(world, 'give', { target: 'Hunger', amount: -20 });
    world.connect(fruit.id, 'touched', give.id, 'give');
    const spawner = part(world, 'spawner', { most: 3 });
    const button = part(world, 'button');
    world.connect(spawner.id, 'drives', fruit.id, 'body');
    world.connect(button.id, 'pressed', spawner.id, 'spawn');
    for (let i = 0; i < 5; i++) {
      world.pressButton(button.id);
      run(world, 3);
    }
    const copies = world.things.filter((t) => t.spawned === spawner.id);
    expect(copies).toHaveLength(3);
    expect(world.circuit.peek(spawner.id, 'count')).toBe(3);
    expect(world.wires.filter((w) => w.to === give.id)).toHaveLength(4);
    // a dispenser that keeps working: what's used up leaves room for more
    world.remove(copies[0].id);
    world.pressButton(button.id);
    run(world, 3);
    expect(world.things.filter((t) => t.spawned === spawner.id)).toHaveLength(3);
    // what it made isn't part of what you built
    expect(world.roomForFile().things.some((t) => t.spawned)).toBe(false);
    world.dispose();
  });

  it('a creature can learn to work a dispenser, again and again', () => {
    let learned = 0;
    for (let seed = 9311; seed < 9321; seed++) {
      const world = new World({ seed, things: [] });
      const fruit = world.add({ name: 'Fruit', form: 'circle', colour: 'red', hw: 14, hh: 14, x: 1250, y: 100, eaten: true, hidden: true, fixed: true, gravity: false, solid: false });
      const give = part(world, 'give', { target: 'Hunger', amount: -25 });
      world.connect(fruit.id, 'touched', give.id, 'give');
      const spawner = part(world, 'spawner', { most: 2 });
      world.connect(spawner.id, 'drives', fruit.id, 'body');
      const button = part(world, 'button', {}, 1100, FLOOR - 30, { fixed: true, solid: true });
      world.connect(button.id, 'pressed', spawner.id, 'spawn');
      let meals = 0;
      for (let i = 0; i < 300 * TICKS_PER_SECOND && meals < 3; i++) {
        if (i % 300 === 0) world.setDrive('Hunger', 70);
        world.step();
        for (const e of world.takeEvents()) if (e.type === 'touched' && e.name === 'Fruit' && e.ate) meals++;
      }
      if (meals >= 3) learned++;
      world.dispose();
    }
    expect(learned).toBeGreaterThanOrEqual(7);
  }, 60000);

  it('Destroy, Teleport, Show/hide and Paint all do what they say', () => {
    const world = emptyRoom(9322);
    const target = ball(world, 1000, 500, { fixed: true });
    const button = part(world, 'button');
    const teleport = part(world, 'teleport', { a: 700, b: 200 });
    const hide = part(world, 'show');
    const paint = part(world, 'paint', { tint: 'green' });
    for (const p of [teleport, hide, paint]) world.connect(p.id, 'drives', target.id, 'body');
    world.connect(button.id, 'pressed', teleport.id, 'go');
    world.connect(button.id, 'pressed', hide.id, 'hide');
    world.connect(button.id, 'pressed', paint.id, 'paint');
    world.pressButton(button.id);
    run(world, 3);
    expect(target.x).toBe(700);
    expect(target.y).toBe(200);
    expect(target.hidden).toBe(true);
    expect(target.colour).toBe('green');
    const destroy = part(world, 'destroy');
    world.connect(destroy.id, 'drives', target.id, 'body');
    world.connect(button.id, 'pressed', destroy.id, 'destroy');
    world.pressButton(button.id);
    run(world, 3);
    expect(world.thing(target.id)).toBeUndefined();
    world.dispose();
  });

  it('Where reads position and speed', () => {
    const world = emptyRoom(9323);
    const target = ball(world, 1000, 200);
    const where = part(world, 'where');
    world.connect(where.id, 'drives', target.id, 'body');
    run(world, 10);
    expect(world.circuit.peek(where.id, 'x')).toBeCloseTo(1000, 0);
    expect(world.circuit.peek(where.id, 'y') as number).toBeGreaterThan(200);
    expect(world.circuit.peek(where.id, 'speed') as number).toBeGreaterThan(50);
    world.dispose();
  });

  it('Collision notices a touch by tag, and can remove what it hits, like a coin or a bullet', () => {
    const world = emptyRoom(9324);
    const hitter = ball(world, 1000, 700);
    const coin = ball(world, 1000, FLOOR - 14, { fixed: true, solid: false, tags: ['coin'] });
    const other = ball(world, 1200, FLOOR - 14, { fixed: true });
    const hit = part(world, 'hit', { tag: 'coin', removes: true });
    const score = part(world, 'label', { value: 0 });
    const add = part(world, 'math', { op: 'add', b: 1 });
    world.connect(hit.id, 'drives', hitter.id, 'body');
    world.connect(hit.id, 'hit', score.id, 'update');
    world.connect(score.id, 'value', add.id, 'a');
    world.connect(add.id, 'result', score.id, 'set');
    run(world, 60);
    expect(world.thing(coin.id)).toBeUndefined();
    expect(world.thing(other.id)).toBeDefined();
    expect(score.live?.value).toBe(1);
    world.dispose();
  });
});

describe('player input', () => {
  it('Keyboard steers a shape through a Motor: a thing you control, with no creature in it', () => {
    const world = emptyRoom(9330);
    const player = ball(world, 500, FLOOR - 14, { name: 'Player' });
    const key = part(world, 'keyboard', { key: 'ArrowRight' });
    const motor = part(world, 'motor', { mode: 'move', direction: 0, power: 50 });
    world.connect(motor.id, 'drives', player.id, 'body');
    world.connect(key.id, 'down', motor.id, 'on');
    run(world, 30);
    expect(player.x).toBeLessThan(520);
    world.keysDown.add('ArrowRight');
    run(world, 30);
    expect(player.x).toBeGreaterThan(600);
    world.dispose();
  });

  it('Keyboard sends one pulse per press, and Mouse knows where it is', () => {
    const world = emptyRoom(9331);
    const key = part(world, 'keyboard', { key: ' ' });
    const count = part(world, 'label', { value: 0 });
    const add = part(world, 'math', { op: 'add', b: 1 });
    world.connect(key.id, 'pressed', count.id, 'update');
    world.connect(count.id, 'value', add.id, 'a');
    world.connect(add.id, 'result', count.id, 'set');
    world.keysDown.add(' ');
    run(world, 20);
    expect(count.live?.value).toBe(1);
    // a tap that's over between two ticks still counts
    world.keysDown.delete(' ');
    run(world, 2);
    world.keysTapped.add(' ');
    run(world, 2);
    expect(count.live?.value).toBe(2);
    const mouse = part(world, 'mouse');
    world.pointer = { x: 123, y: 456, down: true };
    world.step();
    expect(world.circuit.peek(mouse.id, 'x')).toBe(123);
    expect(world.circuit.peek(mouse.id, 'down')).toBe(true);
    world.dispose();
  });

  it('Camera follows what it is told to, while it is on', () => {
    const world = emptyRoom(9332);
    const target = ball(world, 700, 400, { fixed: true });
    expect(world.cameraTarget()).toBeNull();
    const camera = part(world, 'camera', { zoom: 2 });
    world.connect(camera.id, 'drives', target.id, 'body');
    world.step();
    expect(world.cameraTarget()).toEqual({ x: 700, y: 400, zoom: 2 });
    world.dispose();
  });

  it('with the creatures away, nothing bumps into them and they do nothing', () => {
    const world = emptyRoom(9333);
    const c = world.creature;
    const decided = (): boolean => world.takeEvents().some((e) => e.type === 'decided');
    run(world, 120);
    expect(decided()).toBe(false);
    world.setCreaturesAway(false);
    run(world, 120);
    expect(decided()).toBe(true);
    expect(c.hiddenAway).toBe(false);
    world.dispose();
  });
});

describe('effects', () => {
  it('Sound and Burst say what should happen, for the window to play and draw', () => {
    const world = emptyRoom(9340);
    const button = part(world, 'button');
    const sound = part(world, 'sound', { pitch: 880 });
    const burst = part(world, 'burst', { tint: 'red' }, 500, 500);
    world.connect(button.id, 'pressed', sound.id, 'play');
    world.connect(button.id, 'pressed', burst.id, 'go');
    world.takeEvents();
    world.pressButton(button.id);
    world.step();
    const events = world.takeEvents();
    expect(events.find((e) => e.type === 'sound')).toMatchObject({ pitch: 880 });
    expect(events.find((e) => e.type === 'burst')).toMatchObject({ x: 500, y: 500, colour: 'red' });
    world.dispose();
  });
});

describe('a whole small game, built only from parts', () => {
  it('catch the falling coins: you steer a paddle, coins drop at random, you score, and it ends', () => {
    const world = emptyRoom(9350);
    const paddle = world.add({ name: 'Paddle', form: 'box', colour: 'blue', hw: 200, hh: 12, x: 1000, y: FLOOR - 12, gravity: false, tags: ['paddle'] });
    const left = part(world, 'keyboard', { key: 'ArrowLeft' });
    const right = part(world, 'keyboard', { key: 'ArrowRight' });
    const goLeft = part(world, 'motor', { mode: 'move', direction: 180, power: 80 });
    const goRight = part(world, 'motor', { mode: 'move', direction: 0, power: 80 });
    world.connect(goLeft.id, 'drives', paddle.id, 'body');
    world.connect(goRight.id, 'drives', paddle.id, 'body');
    world.connect(left.id, 'down', goLeft.id, 'on');
    world.connect(right.id, 'down', goRight.id, 'on');
    const coin = world.add({ name: 'Coin', form: 'circle', colour: 'yellow', hw: 12, hh: 12, x: 1000, y: 60, tags: ['coin'], hidden: true, fixed: true });
    const clock = part(world, 'timer', { seconds: 1 });
    const where = part(world, 'random', { a: 800, b: 1200 });
    const spawner = part(world, 'spawner', { most: 10 });
    const y = part(world, 'data', { base: 60 });
    world.connect(clock.id, 'tick', where.id, 'roll');
    world.connect(clock.id, 'tick', spawner.id, 'spawn');
    world.connect(where.id, 'value', spawner.id, 'x');
    world.connect(y.id, 'value', spawner.id, 'y');
    world.connect(spawner.id, 'drives', coin.id, 'body');
    const catches = part(world, 'hit', { tag: 'coin', removes: true });
    const score = part(world, 'label', { value: 0 });
    const add = part(world, 'math', { op: 'add', b: 1 });
    world.connect(catches.id, 'drives', paddle.id, 'body');
    world.connect(catches.id, 'hit', score.id, 'update');
    world.connect(score.id, 'value', add.id, 'a');
    world.connect(add.id, 'result', score.id, 'set');
    const enough = part(world, 'compare', { op: 'bigger', b: 2 });
    const goal = part(world, 'goal');
    world.connect(score.id, 'value', enough.id, 'a');
    world.connect(enough.id, 'became', goal.id, 'reached');
    world.startTrial({ name: 'Catch', about: '', room: world.roomForFile() });
    expect(world.trial?.name).toBe('Catch');
    // a copy of everything is what's running now, so find it again
    const liveScore = () => world.things.find((t) => t.name === 'Label');
    let solved = false;
    for (let i = 0; i < 60 * TICKS_PER_SECOND && !solved; i++) {
      world.step();
      solved = world.takeEvents().some((e) => e.type === 'solved');
    }
    expect(solved).toBe(true);
    expect(liveScore()?.live?.value as number).toBeGreaterThanOrEqual(3);
    world.dispose();
  });
});

describe('from a stranger', () => {
  it('new parts get checked like everything else', () => {
    const room = parseRoom(JSON.stringify({
      type: 'nurtron-room',
      version: 3,
      gravity: { strength: 1e9, direction: 'down' },
      things: [
        { form: 'box', part: { kind: 'zone', pull: 1e9, direction: 'up' } },
        { form: 'box', part: { kind: 'spawner', most: 1e9 } },
        { form: 'box', part: { kind: 'sound', pitch: 1e9, seconds: -3 } },
        { form: 'box', part: { kind: 'keyboard', key: 'x'.repeat(5000) } },
        { form: 'box', part: { kind: 'logic', op: 'evil' } },
        { form: 'box', climbable: 'yes', hidden: 1, voice: true, expires: 0, spawned: 3 },
      ],
    }));
    expect(room.gravity?.strength).toBe(5);
    expect(room.things[0].part?.pull).toBe(5);
    expect(room.things[1].part?.most).toBe(200);
    expect(room.things[2].part?.pitch).toBe(8000);
    expect(room.things[3].part?.key?.length).toBe(20);
    expect(room.things[4].part?.op).toBe('and');
    const shape = room.things[5];
    expect(shape.climbable).toBeUndefined();
    expect(shape.voice).toBeUndefined();
    expect(shape.expires).toBeUndefined();
    expect(shape.spawned).toBeUndefined();
  });
});
