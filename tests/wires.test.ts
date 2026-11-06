import { describe, expect, it } from 'vitest';
import { History } from '../src/sim/edits.ts';
import { COUNTER, HUNGER } from '../src/sim/examples.ts';
import { cleanLook, DEFAULT_LOOK, SKINS } from '../src/sim/look.ts';
import { newPart, portsOf } from '../src/sim/parts.ts';
import type { Part, PartKind } from '../src/sim/parts.ts';
import { parseRoom, saveRoom } from '../src/sim/room-file.ts';
import { initPhysics, ROOM, TICKS_PER_SECOND, World } from '../src/sim/world.ts';
import type { Thing, ThingSpec } from '../src/sim/world.ts';

await initPhysics();

function run(world: World, seconds: number): void {
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) {
    world.step();
    world.takeEvents();
  }
}

// a creature parked far away and asleep, so it can't interfere
function room(seed = 1): World {
  const world = new World({ seed, things: [], body: 'blank' });
  world.placeCreature(60);
  world.creature.pause = 1e9;
  return world;
}

function part(world: World, kind: PartKind, settings: Partial<Part> = {}, x = 1000, y = 300): Thing {
  const spec = newPart(kind, x, y);
  return world.add({ ...spec, part: { ...spec.part, ...settings } });
}

const ball = (x: number, y: number, extra: Partial<ThingSpec> = {}): ThingSpec => ({ name: 'Ball', form: 'circle', colour: 'blue', hw: 16, hh: 16, x, y, ...extra });
const held = (world: World, name: string): Thing => world.things.find((t) => t.name === name) as Thing;
const value = (t: Thing): unknown => t.live?.value;

describe('the two circuits the milestone has to run', () => {
  it('a button-powered counter counts presses', () => {
    const world = room();
    world.addRoom(COUNTER, 900, 300);
    const button = held(world, 'Press me');
    const count = held(world, 'Count');
    expect(world.wires).toHaveLength(3);
    for (let i = 1; i <= 5; i++) {
      world.pressButton(button.id);
      run(world, 0.2);
      expect(value(count)).toBe(i);
    }
    run(world, 3);
    expect(value(count)).toBe(5); // it doesn't creep up by itself, even though it's wired in a circle
  });

  it('the hunger circuit adds 1 every 9, 10 or 11 seconds', () => {
    const world = room();
    world.addRoom(HUNGER, 800, 300);
    const food = held(world, 'Hunger');
    const gaps: number[] = [];
    let last = value(food);
    let lastTick = world.tick;
    for (let i = 0; i < 300 * TICKS_PER_SECOND; i++) {
      world.step();
      world.takeEvents();
      if (value(food) !== last) {
        expect(value(food)).toBe((last as number) + 1);
        gaps.push(world.tick - lastTick);
        last = value(food);
        lastTick = world.tick;
      }
    }
    expect(gaps.length).toBeGreaterThanOrEqual(26);
    // the first gap starts from nothing, so only the ones after it are a whole timer
    const seen = new Set(gaps.slice(1).map((g) => Math.round(g / TICKS_PER_SECOND)));
    expect(seen).toEqual(new Set([9, 10, 11]));
  });
});

describe('parts', () => {
  it('math does all six sums, and dividing by zero gives 0', () => {
    const world = room();
    const answers: Record<string, number> = { add: 9, subtract: 3, multiply: 18, divide: 2, min: 3, max: 6 };
    for (const [op, answer] of Object.entries(answers)) {
      const math = part(world, 'math', { op: op as Part['op'], a: 6, b: 3 });
      expect(world.circuit.peek(math.id, 'result')).toBe(answer);
    }
    const zero = part(world, 'math', { op: 'divide', a: 6, b: 0 });
    expect(world.circuit.peek(zero.id, 'result')).toBe(0);
  });

  it('a label with no pulse follows its value straight away', () => {
    const world = room();
    const data = part(world, 'data', { base: 7 });
    const label = part(world, 'label');
    world.connect(data.id, 'value', label.id, 'set');
    run(world, 0.1);
    expect(value(label)).toBe(7);
  });

  it('a label with a pulse waits for it', () => {
    const world = room();
    const data = part(world, 'data', { base: 7 });
    const label = part(world, 'label', { value: 1 });
    const button = part(world, 'button');
    world.connect(data.id, 'value', label.id, 'set');
    world.connect(button.id, 'pressed', label.id, 'update');
    run(world, 1);
    expect(value(label)).toBe(1);
    world.pressButton(button.id);
    run(world, 0.1);
    expect(value(label)).toBe(7);
  });

  it('a compare says true or false, and pulses the moment it turns true', () => {
    const world = room();
    const label = part(world, 'label', { value: 1 });
    const compare = part(world, 'compare', { op: 'bigger', b: 5 });
    const count = part(world, 'label', { value: 0 });
    const math = part(world, 'math', { op: 'add', b: 1 });
    world.connect(label.id, 'value', compare.id, 'a');
    world.connect(compare.id, 'became', count.id, 'update');
    world.connect(count.id, 'value', math.id, 'a');
    world.connect(math.id, 'result', count.id, 'set');
    run(world, 0.5);
    expect(world.circuit.peek(compare.id, 'result')).toBe(false);
    expect(value(count)).toBe(0);
    world.setLabel(label.id, 9);
    run(world, 1);
    expect(world.circuit.peek(compare.id, 'result')).toBe(true);
    expect(value(count)).toBe(1); // once, not once a tick
  });

  it('a switch only lets pulses through while it is open', () => {
    const world = room();
    const open = part(world, 'label', { value: false });
    const gate = part(world, 'switch');
    const button = part(world, 'button');
    const data = part(world, 'data', { base: 3 });
    const label = part(world, 'label', { value: 0 });
    world.connect(open.id, 'value', gate.id, 'open');
    world.connect(button.id, 'pressed', gate.id, 'pulse');
    world.connect(gate.id, 'pulse', label.id, 'update');
    world.connect(data.id, 'value', label.id, 'set');
    world.pressButton(button.id);
    run(world, 0.1);
    expect(value(label)).toBe(0);
    world.setLabel(open.id, true);
    world.pressButton(button.id);
    run(world, 0.1);
    expect(value(label)).toBe(3);
  });

  it('a closed switch gives nothing, so what it feeds keeps its value', () => {
    const world = room();
    const open = part(world, 'label', { value: true });
    const gate = part(world, 'switch');
    const data = part(world, 'data', { base: 3 });
    const label = part(world, 'label', { value: 0 });
    world.connect(open.id, 'value', gate.id, 'open');
    world.connect(data.id, 'value', gate.id, 'value');
    world.connect(gate.id, 'value', label.id, 'set');
    run(world, 0.1);
    expect(value(label)).toBe(3);
    world.setLabel(open.id, false);
    world.update(data.id, { part: { kind: 'data', base: 8 } });
    run(world, 0.1);
    expect(value(label)).toBe(3);
  });

  it('a timer only runs while it is on, and can be reset', () => {
    const world = room();
    const on = part(world, 'label', { value: false });
    const timer = part(world, 'timer', { seconds: 1 });
    const count = part(world, 'label', { value: 0 });
    const math = part(world, 'math', { op: 'add', b: 1 });
    world.connect(on.id, 'value', timer.id, 'on');
    world.connect(timer.id, 'tick', count.id, 'update');
    world.connect(count.id, 'value', math.id, 'a');
    world.connect(math.id, 'result', count.id, 'set');
    run(world, 3);
    expect(value(count)).toBe(0);
    world.setLabel(on.id, true);
    run(world, 3.5);
    expect(value(count)).toBe(3);
  });

  it('a sensor notices the creature and tagged things coming and going', () => {
    const world = room();
    const sensor = world.add({ ...newPart('sensor', 1000, 800), hw: 100, hh: 200, part: { kind: 'sensor', tag: 'fruit' } });
    const everything = world.add({ ...newPart('sensor', 60, ROOM.floor - 60), hw: 80, hh: 80 });
    const counted = part(world, 'label', { value: 0 }, 1400);
    const math = part(world, 'math', { op: 'add', b: 1 }, 1400, 400);
    world.connect(sensor.id, 'entered', counted.id, 'update');
    world.connect(counted.id, 'value', math.id, 'a');
    world.connect(math.id, 'result', counted.id, 'set');

    run(world, 0.1);
    expect(world.circuit.peek(everything.id, 'count')).toBe(1); // the creature is parked in it
    expect(world.circuit.peek(sensor.id, 'inside')).toBe(false);

    world.add(ball(1000, 700)); // no tag, so this sensor doesn't care
    run(world, 0.1);
    expect(world.circuit.peek(sensor.id, 'count')).toBe(0);

    const tagged = world.add(ball(1000, 700, { tags: ['fruit'] }));
    run(world, 0.1);
    expect(world.circuit.peek(sensor.id, 'inside')).toBe(true);
    expect(value(counted)).toBe(1);

    world.remove(tagged.id);
    run(world, 0.1);
    expect(world.circuit.peek(sensor.id, 'inside')).toBe(false);
  });

  it('a motor pushes a ball up, and stops when told', () => {
    const world = room();
    const target = world.add(ball(1000, ROOM.floor - 16));
    const motor = part(world, 'motor', { mode: 'push', direction: -90, power: 60 });
    world.connect(motor.id, 'drives', target.id, 'body');
    run(world, 1);
    expect(target.y).toBeLessThan(ROOM.floor - 100);
    const on = part(world, 'label', { value: false });
    world.connect(on.id, 'value', motor.id, 'on');
    run(world, 3);
    expect(target.y).toBeGreaterThan(ROOM.floor - 20);
  });

  it('a motor spins a fixed plank in place, like a windmill, and it stays where it stopped', () => {
    const world = room();
    const plank = world.add({ name: 'Plank', form: 'box', colour: 'grey', hw: 100, hh: 8, x: 1000, y: 500, fixed: true });
    const motor = part(world, 'motor', { mode: 'spin', power: 10 });
    const wire = world.connect(motor.id, 'drives', plank.id, 'body');
    run(world, 1);
    expect(Math.abs(plank.angle)).toBeGreaterThan(0.5);
    expect(plank.x).toBeCloseTo(1000, 3);
    world.disconnect(wire?.id as number);
    run(world, 0.1);
    const stopped = plank.angle;
    run(world, 1);
    expect(plank.angle).toBeCloseTo(stopped, 5);
  });

  it('a moving fixed plank stops at the floor rather than going through it', () => {
    const world = room();
    const plank = world.add({ name: 'Lift', form: 'box', colour: 'grey', hw: 60, hh: 8, x: 1000, y: 800, fixed: true });
    const motor = part(world, 'motor', { mode: 'move', direction: 90, power: 100 });
    world.connect(motor.id, 'drives', plank.id, 'body');
    run(world, 4);
    expect(plank.y).toBeLessThanOrEqual(ROOM.floor);
    expect(plank.x).toBeCloseTo(1000, 3);
  });

  it('a kick is one shove, not a push that keeps going', () => {
    const world = room();
    const target = world.add(ball(1000, ROOM.floor - 16));
    const motor = part(world, 'motor', { mode: 'push', direction: 0, power: 50 });
    const button = part(world, 'button');
    world.connect(motor.id, 'drives', target.id, 'body');
    world.connect(button.id, 'pressed', motor.id, 'kick');
    run(world, 1);
    expect(target.x).toBeCloseTo(1000, 0); // it waits to be told
    world.pressButton(button.id);
    run(world, 0.2);
    expect(target.x).toBeGreaterThan(1020);
  });
});

describe('connecting wires', () => {
  it('refuses a pulse going into a value, and the other way round', () => {
    const world = room();
    const button = part(world, 'button');
    const label = part(world, 'label');
    const motor = part(world, 'motor');
    expect(world.connect(button.id, 'pressed', label.id, 'set')).toBeNull();
    expect(world.connect(button.id, 'on', label.id, 'update')).toBeNull();
    expect(world.connect(button.id, 'pressed', label.id, 'nonsense')).toBeNull();
    expect(world.connect(motor.id, 'drives', motor.id, 'body')).toBeNull();
    expect(world.wires).toHaveLength(0);
  });

  it('a value input only listens to one wire, so a new one replaces the old', () => {
    const world = room();
    const a = part(world, 'data', { base: 1 });
    const b = part(world, 'data', { base: 2 });
    const label = part(world, 'label');
    world.connect(a.id, 'value', label.id, 'set');
    world.connect(b.id, 'value', label.id, 'set');
    expect(world.wires).toHaveLength(1);
    run(world, 0.1);
    expect(value(label)).toBe(2);
  });

  it('two buttons can press the same counter, but the same wire twice is only one wire', () => {
    const world = room();
    const a = part(world, 'button');
    const b = part(world, 'button');
    const label = part(world, 'label');
    world.connect(a.id, 'pressed', label.id, 'update');
    world.connect(b.id, 'pressed', label.id, 'update');
    world.connect(b.id, 'pressed', label.id, 'update');
    expect(world.wires).toHaveLength(2);
  });

  it('a thing can be held by several motors, and an output can feed many inputs', () => {
    const world = room();
    const target = world.add(ball(1000, 500));
    const a = part(world, 'motor');
    const b = part(world, 'motor');
    world.connect(a.id, 'drives', target.id, 'body');
    world.connect(b.id, 'drives', target.id, 'body');
    expect(world.wires).toHaveLength(2);
  });

  it('removing a part takes its wires with it', () => {
    const world = room();
    world.addRoom(COUNTER, 900, 300);
    world.remove(held(world, 'Add one').id);
    expect(world.wires).toHaveLength(1);
    run(world, 0.5);
  });

  it('every part has its ports where they can be reached', () => {
    const world = room();
    const label = part(world, 'label');
    const names = portsOf(label).map((p) => `${p.dir}:${p.name}`);
    expect(names).toEqual(['in:set', 'in:update', 'out:value']);
  });
});

describe('loops', () => {
  it('values chasing their own tail get cut off and flagged, and the game keeps going', () => {
    const world = room();
    const label = part(world, 'label', { value: 1 });
    const math = part(world, 'math', { op: 'add', b: 1 });
    const a = world.connect(label.id, 'value', math.id, 'a');
    const b = world.connect(math.id, 'result', label.id, 'set');
    let warned = false;
    for (let i = 0; i < 30; i++) {
      world.step();
      for (const event of world.takeEvents()) if (event.type === 'loop') warned = true;
    }
    expect(warned).toBe(true);
    expect(world.circuit.isTroubled(a?.id as number)).toBe(true);
    expect(world.circuit.isTroubled(b?.id as number)).toBe(true);
    expect(value(label)).toBeLessThan(1000);
  });

  it('a pulse going round forever gets cut off and flagged', () => {
    const world = room();
    const open = part(world, 'label', { value: true });
    const a = part(world, 'switch');
    const b = part(world, 'switch');
    const button = part(world, 'button');
    world.connect(open.id, 'value', a.id, 'open');
    world.connect(open.id, 'value', b.id, 'open');
    world.connect(button.id, 'pressed', a.id, 'pulse');
    const ab = world.connect(a.id, 'pulse', b.id, 'pulse');
    world.connect(b.id, 'pulse', a.id, 'pulse');
    world.pressButton(button.id);
    world.step();
    expect(world.circuit.isTroubled(ab?.id as number)).toBe(true);
    run(world, 2);
    expect(world.circuit.isTroubled(ab?.id as number)).toBe(false); // and it recovers once it has stopped
  });
});

describe('the creature and parts', () => {
  it('pays no attention to a wall full of circuitry', () => {
    const world = new World({ seed: 3, things: [], body: 'blank' });
    const timer = part(world, 'timer', {}, world.creature.x + 40, ROOM.floor - 40);
    let looked = false;
    for (let i = 0; i < 40 * TICKS_PER_SECOND; i++) {
      world.step();
      for (const event of world.takeEvents()) if (event.type === 'decided' && event.decision.chosen.thingId === timer.id) looked = true;
    }
    expect(looked).toBe(false);
  });

  it('presses a button by touching it, which sets off whatever is wired to it', () => {
    const world = new World({ seed: 3, things: [], body: 'blank' });
    world.addRoom(COUNTER, world.creature.x + 100, ROOM.floor - 60);
    const button = held(world, 'Press me');
    const count = held(world, 'Count');
    let touched = 0;
    for (let i = 0; i < 300 * TICKS_PER_SECOND && touched < 3; i++) {
      world.step();
      for (const event of world.takeEvents()) if (event.type === 'touched' && event.thingId === button.id) touched++;
    }
    expect(touched).toBeGreaterThan(0);
    world.step();
    expect(value(count)).toBeGreaterThan(0);
  });
});

describe('undo', () => {
  it('brings back deleted parts along with their wires and their count', () => {
    const world = room();
    const history = new History();
    world.addRoom(COUNTER, 900, 300);
    const button = held(world, 'Press me');
    const count = held(world, 'Count');
    world.pressButton(button.id);
    run(world, 0.2);
    const ids = world.things.map((t) => t.id);
    const before = history.capture(world, ids);
    for (const id of ids) world.remove(id);
    history.commit('Delete', world, before);
    expect(world.things).toHaveLength(0);
    expect(world.wires).toHaveLength(0);

    history.undo(world);
    expect(world.wires).toHaveLength(3);
    expect(value(world.thing(count.id) as Thing)).toBe(1);
    world.pressButton(button.id);
    run(world, 0.2);
    expect(value(world.thing(count.id) as Thing)).toBe(2);

    history.redo(world);
    expect(world.things).toHaveLength(0);
  });

  it('can undo connecting and disconnecting a wire', () => {
    const world = room();
    const history = new History();
    const data = part(world, 'data');
    const label = part(world, 'label');
    let before = history.capture(world, []);
    const wire = world.connect(data.id, 'value', label.id, 'set');
    history.commit('Connect', world, before);
    history.undo(world);
    expect(world.wires).toHaveLength(0);
    history.redo(world);
    expect(world.wires).toHaveLength(1);

    before = history.capture(world, []);
    world.disconnect(wire?.id as number);
    history.commit('Disconnect', world, before);
    expect(world.wires).toHaveLength(0);
    history.undo(world);
    expect(world.wires).toHaveLength(1);
  });

  it("undoing a move doesn't wind a running counter back", () => {
    const world = room();
    const history = new History();
    const label = part(world, 'label', { value: 5 });
    const before = history.capture(world, [label.id]);
    world.update(label.id, { x: 1200 });
    history.commit('Move', world, before);
    world.setLabel(label.id, 99);
    history.undo(world);
    expect(label.x).toBe(1000);
    expect(value(label)).toBe(99);
  });

  it('typing into a label can be undone', () => {
    const world = room();
    const history = new History();
    const label = part(world, 'label', { value: 5 });
    world.setLabel(label.id, 'hello');
    history.commitTyped('Type', world, label.id, 5, 'hello');
    history.undo(world);
    expect(value(label)).toBe(5);
    history.redo(world);
    expect(value(label)).toBe('hello');
  });
});

describe('saving', () => {
  it('a world keeps its circuit, its count and its creature look through a save', () => {
    const world = room();
    world.addRoom(COUNTER, 900, 300);
    world.creature.look = { ...DEFAULT_LOOK, skin: 'robot', body: 0x123456 };
    world.pressButton(held(world, 'Press me').id);
    run(world, 0.2);
    const copy = World.load(world.save());
    expect(copy.wires).toHaveLength(3);
    expect(copy.creature.look.skin).toBe('robot');
    expect(copy.creature.look.body).toBe(0x123456);
    copy.pressButton(held(copy, 'Press me').id);
    run(copy, 0.2);
    expect(value(held(copy, 'Count'))).toBe(2);
    const wire = copy.connect(held(copy, 'Press me').id, 'pressed', held(copy, 'Count').id, 'update');
    expect(copy.wires.filter((w) => w.id === wire?.id)).toHaveLength(1); // new wires don't reuse an old id
  });

  it('a creature from before wires came along keeps everything', () => {
    const world = new World({ seed: 5 });
    run(world, 20);
    world.pet();
    const saved = JSON.parse(world.save());
    // what a version 2 save looked like: no wires, no parts, no look, and food and energy built in
    saved.version = 2;
    delete saved.wires;
    delete saved.nextWireId;
    // and only ever one creature, with its brain kept separately
    const { brain, ...only } = saved.creatures[0];
    saved.creature = only;
    saved.brain = brain;
    delete saved.creatures;
    delete saved.family;
    delete saved.focusId;
    delete saved.uidSalt;
    delete saved.creature.look;
    saved.things = saved.things.filter((t: Thing) => !t.inBody);
    saved.creature.drives = [{ name: 'Food', value: 42, wants: 'high' }, { name: 'Energy', value: 77, wants: 'high' }];
    const copy = World.load(JSON.stringify(saved));
    expect(copy.drive('Hunger')?.value).toBe(58); // its hunger carries over onto real wires
    expect(copy.drive('Energy')?.value).toBe(77);
    expect(copy.creature.brain.driveNames).toEqual(['Hunger', 'Energy']);
    expect(copy.tick).toBe(world.tick);
    expect(copy.creature.name).toBe(world.creature.name);
    expect(copy.creature.brain.concepts.length).toBe(world.creature.brain.concepts.length);
    expect(copy.things.length).toBe(world.things.length);
    expect(copy.creature.look).toEqual(DEFAULT_LOOK);
    expect(copy.wires.length).toBe(world.wires.length); // the starter body's
    run(copy, 2);
    const wire = copy.connect(part(copy, 'data').id, 'value', part(copy, 'label').id, 'set');
    expect(wire).not.toBeNull();
  });

  it('a timer carries on from where it was', () => {
    const world = room();
    world.addRoom(HUNGER, 800, 300);
    run(world, 25);
    const copy = World.load(world.save());
    expect(held(copy, 'Hunger timer').live?.nextAt).toBe(held(world, 'Hunger timer').live?.nextAt);
  });

  it('runs the same way twice from the same seed, randomness included', () => {
    const go = (): unknown => {
      const world = room(9);
      world.addRoom(HUNGER, 800, 300);
      run(world, 120);
      return value(held(world, 'Hunger'));
    };
    expect(go()).toBe(go());
  });

  it('a room file keeps parts and wires, and a copy of it works', () => {
    const world = room();
    world.addRoom(COUNTER, 900, 300);
    world.pressButton(held(world, 'Press me').id);
    run(world, 0.2);
    const opened = room();
    opened.addRoom(parseRoom(saveRoom(world)));
    expect(opened.wires).toHaveLength(3);
    expect(value(held(opened, 'Count'))).toBe(1); // it keeps what it was showing
    opened.pressButton(held(opened, 'Press me').id);
    run(opened, 0.2);
    expect(value(held(opened, 'Count'))).toBe(2);
  });

  it('copying part of a circuit keeps the wires inside what was copied', () => {
    const world = room();
    world.addRoom(COUNTER, 900, 300);
    const inside = [held(world, 'Count').id, held(world, 'Add one').id];
    const piece = world.roomData(inside);
    expect(piece.things).toHaveLength(2);
    expect(piece.wires).toHaveLength(2);
  });

  it('opens an old room file with no wires in it', () => {
    const data = parseRoom(JSON.stringify({ type: 'nurtron-room', version: 1, things: [{ name: 'Old', form: 'circle', hw: 20 }] }));
    expect(data.things).toHaveLength(1);
    expect(data.wires).toEqual([]);
  });

  it('a hostile room file can only ever be data', () => {
    const data = parseRoom(
      JSON.stringify({
        type: 'nurtron-room',
        version: 2,
        things: [
          { form: 'box', hw: 30, part: { kind: 'timer', seconds: 'soon', evil: 'yes' } },
          { form: 'box', hw: 30, part: { kind: 'nonsense' } },
          { form: 'box', hw: 30, part: { kind: 'math', op: 'launch', a: 1e308, b: 'x' } },
          { form: 'box', hw: 30, part: { kind: 'label', value: { not: 'a value' } } },
          { form: 'box', hw: 30, part: { kind: 'motor', power: 1e9, direction: null, mode: 'explode' } },
        ],
        wires: [{ from: 0, out: 'tick', to: 99, in: 'update' }, { from: 'a' }, null, { from: 0, out: 'nope', to: 3, in: 'update' }, { from: 2, out: 'result', to: 2, in: 'a' }],
      }),
    );
    expect(data.things[0].part).toEqual({ kind: 'timer', seconds: 1 });
    expect(data.things[1].part).toBeUndefined();
    expect(data.things[2].part).toEqual({ kind: 'math', op: 'add', a: 1e12, b: 0 });
    expect(data.things[3].part?.value).toBe(0);
    expect(data.things[4].part).toEqual({ kind: 'motor', mode: 'push', direction: -90, power: 200 });

    const world = room();
    world.addRoom(data);
    expect(world.wires).toHaveLength(1); // only the real one, and it's a loop, which is safe
    run(world, 1);
  });

  it('refuses a room with a ridiculous number of wires', () => {
    expect(() => parseRoom(JSON.stringify({ type: 'nurtron-room', version: 2, things: [], wires: new Array(9000).fill({}) }))).toThrow(/more than/);
  });
});

describe('skins', () => {
  it('a broken look falls back to the default, and a good one is kept', () => {
    expect(cleanLook({ skin: 'nonsense', body: 'red', belly: -5, accent: 1e9 })).toEqual(DEFAULT_LOOK);
    expect(cleanLook(undefined)).toEqual(DEFAULT_LOOK);
    for (const skin of SKINS) expect(cleanLook({ ...DEFAULT_LOOK, skin }).skin).toBe(skin);
  });

  it("how it looks makes no difference to how it behaves", () => {
    const go = (look?: typeof DEFAULT_LOOK): number => {
      const world = new World({ seed: 12, look });
      run(world, 60);
      const x = world.creature.x;
      world.dispose();
      return x;
    };
    expect(go({ ...DEFAULT_LOOK, skin: 'ghost', body: 0xff0000 })).toBe(go());
  });
});
