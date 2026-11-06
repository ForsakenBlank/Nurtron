// milestone 4's test: a creature moved to another PC still goes for the red fruit, and still has its own working stomach.
// everything crosses over as text, the way a file does, into a world that has never seen any of its things.
import { describe, expect, it } from 'vitest';
import { parseCreature, saveCreature } from '../src/sim/creature-file.ts';
import { COUNTER, HUNGER, WIRED_FRUIT } from '../src/sim/examples.ts';
import { packageTool, parseTool, portChoices, saveTool, toolPlace } from '../src/sim/packager.ts';
import { newPart } from '../src/sim/parts.ts';
import type { Part, PartKind } from '../src/sim/parts.ts';
import { parseRoom, saveRoom } from '../src/sim/room-file.ts';
import { colourFamily, mostlyColour } from '../src/sim/senses.ts';
import { textureId, usableTexture } from '../src/sim/textures.ts';
import { initPhysics, ROOM, TICKS_PER_SECOND, World } from '../src/sim/world.ts';
import type { Thing, ThingSpec } from '../src/sim/world.ts';
import { openWorld, parseWorld, saveWorld } from '../src/sim/world-file.ts';

await initPhysics();

const SEEDS = Array.from({ length: 80 }, (_, i) => 6001 + i); // 20 turned out to swing by 15% on luck alone
const MIDDLE = ROOM.width / 2;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

function part(world: World, kind: PartKind, settings: Partial<Part>, x: number, y: number, extra: Partial<ThingSpec> = {}): Thing {
  const spec = newPart(kind, x, y);
  return world.add({ ...spec, part: { ...spec.part, ...settings }, ...extra });
}

function buildFruit(world: World, x: number): Thing {
  const fruit = world.add({ name: 'Red circle', form: 'circle', colour: 'red', hw: 14, hh: 14, x, eaten: true, respawnSeconds: 12 });
  const give = part(world, 'give', { target: 'Hunger', amount: -20 }, x, 300);
  world.connect(fruit.id, 'touched', give.id, 'give');
  return fruit;
}

function run(world: World, seconds: number): void {
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) world.step();
  world.takeEvents();
}

function until(world: World, seconds: number, happened: (event: ReturnType<World['takeEvents']>[number]) => boolean): boolean {
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) {
    world.step();
    if (world.takeEvents().some(happened)) return true;
  }
  return false;
}

// raised the way the plan says: a few meals from a fruit it built itself, in a room of its own
function raised(seed: number): World {
  const world = new World({ seed, things: [], name: 'Pip' });
  buildFruit(world, MIDDLE + 170);
  for (let meal = 0; meal < 4; meal++) {
    world.setDrive('Hunger', 65);
    until(world, 120, (e) => e.type === 'touched' && e.ate);
  }
  return world;
}

// the file arrives on another PC: another world, other numbers, and none of the same things
function arrives(text: string, seed: number): World {
  const friend = new World({ seed, things: [] });
  friend.adoptCreature(parseCreature(text), friend.creature);
  return friend;
}

describe('a creature moved to another PC', () => {
  it('still goes for the red fruit over a rock, in a room it has never seen', () => {
    let chosen = 0;
    for (const seed of SEEDS) {
      const home = raised(seed);
      const text = saveCreature(home);
      home.dispose();
      const friend = arrives(text, seed + 1000);
      friend.setDrive('Hunger', 75);
      friend.placeCreature(MIDDLE);
      const fruit = buildFruit(friend, MIDDLE + 300);
      const rock = friend.add({ name: 'Rock', form: 'box', colour: 'grey', hw: 26, hh: 26, x: MIDDLE - 300, weight: 3 });
      let chose: 'fruit' | 'rock' | null = null;
      for (let i = 0; i < 30 * TICKS_PER_SECOND && !chose; i++) {
        friend.step();
        for (const event of friend.takeEvents()) {
          if (event.type !== 'touched') continue;
          if (event.thingId === fruit.id) chose = 'fruit';
          if (event.thingId === rock.id) chose = 'rock';
        }
      }
      if (chose === 'fruit') chosen++;
      friend.dispose();
    }
    expect(chosen / SEEDS.length).toBeGreaterThanOrEqual(0.8);
  }, 60000);

  it('still has its own working stomach: it arrives as hungry as it left, gets hungrier, and food helps', () => {
    const home = raised(6101);
    home.setDrive('Hunger', 60);
    const text = saveCreature(home);
    const friend = arrives(text, 7101);
    expect(friend.creature.name).toBe('Pip');
    expect(friend.drive('Hunger')?.value).toBe(60);
    run(friend, 30);
    const hungrier = friend.drive('Hunger')?.value as number;
    expect(hungrier).toBeGreaterThan(60);
    expect(friend.giveTo('Hunger', -20)).toBe(true);
    friend.step();
    expect(friend.drive('Hunger')?.value).toBeLessThan(hungrier);

    // it really is its own: nothing that happens to one touches the other
    home.setDrive('Hunger', 23);
    expect(friend.drive('Hunger')?.value).not.toBe(23);
    home.dispose();
    friend.dispose();
  });

  it('keeps a body it was given by hand, however strange', () => {
    const home = new World({ seed: 6102, things: [], body: 'blank', name: 'Disco' });
    const disco = part(home, 'label', { value: 12 }, 800, 300, { inBody: true, name: 'Disco' });
    const socket = part(home, 'drive', { wants: 'high' }, 1000, 300, { inBody: true, name: 'Disco' });
    home.connect(disco.id, 'value', socket.id, 'value');
    const friend = arrives(saveCreature(home), 7102);
    expect(friend.drive('Disco')?.value).toBe(12);
    expect(friend.drive('Hunger')).toBeUndefined();
    expect(friend.circuit.labelNames()).toEqual(['Disco']);
    home.dispose();
    friend.dispose();
  });

  it('keeps its look, age and what it learned, and forgets only the last few seconds', () => {
    const home = raised(6103);
    home.creature.look.body = 0x123456;
    const age = home.tick;
    const friend = arrives(saveCreature(home), 7103);
    expect(friend.creature.look.body).toBe(0x123456);
    expect(friend.tick - friend.creature.bornTick).toBe(age);
    expect(friend.creature.brain.concepts.length).toBe(home.creature.brain.concepts.length);
    expect(friend.creature.brain.concepts.map((c) => c.w)).toEqual(home.creature.brain.concepts.map((c) => c.w));
    expect(friend.creature.brain.traces).toEqual([]);
    home.dispose();
    friend.dispose();
  });

  it('an egg is still an egg', () => {
    const home = new World({ seed: 6104, things: [], egg: true });
    run(home, 1);
    const friend = arrives(saveCreature(home), 7104);
    expect(friend.creature.hatching).toBeGreaterThan(0);
    expect(until(friend, 10, (e) => e.type === 'hatched')).toBe(true);
    home.dispose();
    friend.dispose();
  });

  it('survives being saved again on the other side, and carries on from there', () => {
    const home = raised(6105);
    const friend = arrives(saveCreature(home), 7105);
    run(friend, 20);
    const copy = World.load(friend.save());
    const back = arrives(saveCreature(copy), 7106);
    expect(back.drive('Hunger')?.value).toBe(copy.drive('Hunger')?.value);
    run(back, 20);
    home.dispose();
    friend.dispose();
    copy.dispose();
    back.dispose();
  });
});

describe('a file from a stranger', () => {
  const good = (): Record<string, unknown> => {
    const world = new World({ seed: 6200, things: [] });
    run(world, 20);
    const file = JSON.parse(saveCreature(world));
    world.dispose();
    return file;
  };

  it('turns anything that is not a creature away with a message', () => {
    expect(() => parseCreature('not json')).toThrow(/isn't a Nurtron creature/);
    expect(() => parseCreature('null')).toThrow(/isn't a Nurtron creature/);
    expect(() => parseCreature('[]')).toThrow(/isn't a Nurtron creature/);
    expect(() => parseCreature(JSON.stringify({ type: 'nurtron-room', version: 3 }))).toThrow(/isn't a Nurtron creature/);
    expect(() => parseCreature(JSON.stringify({ ...good(), version: 99 }))).toThrow(/newer version/);
    expect(() => parseCreature(JSON.stringify({ ...good(), brain: null }))).toThrow(/damaged/);
    expect(() => parseRoom(' '.repeat(40_000_001))).toThrow(/too big/);
  });

  it('turns away a brain that would break the sums, rather than running it', () => {
    const wrongSize = good();
    (wrongSize.brain as { concepts: { w: number[] }[] }).concepts[0].w = [1, 2];
    expect(() => parseCreature(JSON.stringify(wrongSize))).toThrow(/damaged/);
    const sameName = good();
    (sameName.brain as { driveNames: string[] }).driveNames = ['Food', 'Food'];
    expect(() => parseCreature(JSON.stringify(sameName))).toThrow(/damaged/);
    const notSeen = good();
    const concepts = (notSeen.brain as { concepts: { percept: unknown }[] }).concepts;
    concepts.push({ ...concepts[0], percept: { shape: 'dragon', colour: 'red', size: 'small', near: 'far' } });
    expect(() => parseCreature(JSON.stringify(notSeen))).toThrow(/damaged/);
  });

  it('brings silly numbers back into line', () => {
    const file = good();
    const brain = file.brain as { genes: Record<string, unknown>; concepts: { w: unknown[]; tries: unknown[]; uses: unknown }[]; mood: unknown };
    brain.genes = { learningRate: 1e9, curiosity: -5, temperature: 'hot', memorySeconds: null, maxConcepts: 1e12 };
    brain.concepts[0].w[0] = 1e300;
    brain.concepts[0].tries[0] = -3;
    brain.mood = 999;
    file.name = 'x'.repeat(5000);
    file.look = { skin: 'virus', body: -1, belly: 1e20, accent: 'red', eyes: 0.5 };
    file.hatching = 1e30;
    const clean = parseCreature(JSON.stringify(file));
    expect(clean.brain.genes.learningRate).toBe(1);
    expect(clean.brain.genes.curiosity).toBe(0.08);
    expect(clean.brain.genes.maxConcepts).toBeLessThanOrEqual(256);
    expect(clean.brain.concepts[0].w[0]).toBe(1);
    expect(clean.brain.concepts[0].tries[0]).toBe(0);
    expect(clean.brain.mood).toBe(1);
    expect(clean.name.length).toBeLessThanOrEqual(40);
    expect(clean.look.skin).toBe('sprout');
    expect(clean.hatching).toBeLessThanOrEqual(3600);
    const world = new World({ seed: 6201, things: [] });
    world.adoptCreature(clean, world.creature);
    run(world, 20);
    world.dispose();
  });

  it('only lets parts into a body, and only ones that belong there', () => {
    const file = good();
    const body = file.body as { things: Record<string, unknown>[]; wires: unknown[] };
    const food = body.things.findIndex((t) => t.name === 'Hunger');
    body.things.unshift({ name: 'Sneaky shape', form: 'box', hw: 20 }, { name: 'Motor', form: 'box', hw: 20, part: { kind: 'motor' } });
    // the wires now point at the wrong things, unless they're moved along too
    body.wires = (body.wires as { from: number; to: number }[]).map((w) => ({ ...w, from: w.from + 2, to: w.to + 2 }));
    const clean = parseCreature(JSON.stringify(file));
    expect(clean.body.things.every((t) => t.part && t.inBody)).toBe(true);
    expect(clean.body.things.some((t) => t.part?.kind === 'motor')).toBe(false);
    const world = new World({ seed: 6202, things: [] });
    world.adoptCreature(clean, world.creature);
    expect(food).toBeGreaterThanOrEqual(0);
    expect(world.wires.filter((w) => world.thing(w.from)?.inBody).length).toBe((good().body as { wires: unknown[] }).wires.length);
    world.dispose();
  });

  it('a file cannot reach anything by naming it', () => {
    const text = saveCreature((() => {
      const world = new World({ seed: 6203, things: [] });
      return world;
    })()).replace('"name":"Nurt"', '"name":"Nurt","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}');
    const clean = parseCreature(text);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    expect((clean as unknown as { polluted?: boolean }).polluted).toBeUndefined();
  });
});

describe('world files', () => {
  it('bring back the room and the creature together, wired up', () => {
    const world = raised(6301);
    world.addRoom(COUNTER, 200, 200);
    world.setDrive('Hunger', 56);
    const data = parseWorld(saveWorld(world));
    const opened = openWorld(data, 6302);
    expect(opened.creature.name).toBe('Pip');
    expect(opened.drive('Hunger')?.value).toBe(56);
    const press = opened.things.find((t) => t.name === 'Press me') as Thing;
    opened.pressButton(press.id);
    opened.step();
    expect(opened.things.find((t) => t.name === 'Count')?.live?.value).toBe(1);
    world.dispose();
    opened.dispose();
  });

  it('keep a fruit that was eaten and has not come back yet, still wired', () => {
    const world = new World({ seed: 6303, things: [] });
    const fruit = buildFruit(world, MIDDLE + 60);
    world.setDrive('Hunger', 80);
    expect(until(world, 120, (e) => e.type === 'touched' && e.thingId === fruit.id)).toBe(true);
    expect(world.thing(fruit.id)).toBeUndefined();
    const room = parseRoom(saveRoom(world));
    const saved = room.things.findIndex((t) => t.name === 'Red circle');
    expect(saved).toBeGreaterThanOrEqual(0);
    expect(room.wires.some((w) => w.from === saved && w.out === 'touched')).toBe(true);
    world.dispose();
  });
});

describe('pictures', () => {
  it('only takes pictures that really are pictures', () => {
    expect(usableTexture(PNG)).toBe(true);
    expect(usableTexture('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBe(false);
    expect(usableTexture('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
    expect(usableTexture('data:image/png;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')).toBe(false); // says png, isn't one
    expect(usableTexture('https://example.com/a.png')).toBe(false);
    expect(usableTexture(`data:image/png;base64,${'A'.repeat(400000)}`)).toBe(false);
    expect(usableTexture(42)).toBe(false);
  });

  it('travel in files, and a mislabelled one gets filed under what it really is', () => {
    const world = new World({ seed: 6401, things: [] });
    const id = world.addTexture(PNG) as string;
    expect(id).toBe(textureId(PNG));
    world.add({ name: 'Painted', form: 'box', colour: 'blue', hw: 30, hh: 30, x: 500, texture: id });
    const room = parseRoom(saveRoom(world));
    expect(room.textures?.[id]).toBe(PNG);
    const forged = JSON.parse(saveRoom(world));
    forged.textures = { someone_elses_id: PNG, bad: 'data:text/html;base64,PHNjcmlwdD4=' };
    expect(parseRoom(JSON.stringify(forged)).textures).toEqual({ [id]: PNG });

    const other = new World({ seed: 6402, room, things: [] });
    expect(other.textures[id]).toBe(PNG);
    expect(other.things.find((t) => t.name === 'Painted')?.texture).toBe(id);
    expect(World.load(other.save()).textures[id]).toBe(PNG);
    world.dispose();
    other.dispose();
  });

  it('can only take up so much of a world', () => {
    const world = new World({ seed: 6403, things: [] });
    let refused = false;
    for (let i = 0; i < 40 && !refused; i++) {
      const big = `${PNG.slice(0, 60)}${String.fromCharCode(65 + (i % 26)).repeat(200000)}${String.fromCharCode(97 + (i % 26))}AAA`;
      refused = world.addTexture(big) === null;
    }
    expect(refused).toBe(true);
    world.dispose();
  });

  it('a creature goes by the colour, never the picture', () => {
    const world = new World({ seed: 6404, things: [] });
    const plain = world.add({ name: 'Plain', form: 'circle', colour: 'red', hw: 14, hh: 14, x: 500 });
    const painted = world.add({ name: 'Painted', form: 'circle', colour: 'red', hw: 14, hh: 14, x: 500, texture: world.addTexture(PNG) as string });
    expect(world.perceive(painted)).toEqual(world.perceive(plain));
    world.dispose();
  });

  it('a picture counts as the colour it mostly is', () => {
    expect(colourFamily(230, 40, 40)).toBe('red');
    expect(colourFamily(240, 140, 30)).toBe('orange');
    expect(colourFamily(240, 220, 40)).toBe('yellow');
    expect(colourFamily(40, 200, 80)).toBe('green');
    expect(colourFamily(40, 90, 230)).toBe('blue');
    expect(colourFamily(160, 60, 220)).toBe('purple');
    expect(colourFamily(120, 120, 125)).toBe('grey');
    expect(colourFamily(0, 0, 0)).toBe('grey');
    // a red fruit on a white background, with a see-through corner that doesn't count
    const white = [255, 255, 255, 255];
    const red = [230, 40, 40, 255];
    const clear = [40, 90, 230, 0];
    expect(mostlyColour([...white, ...white, ...red, ...clear, ...clear, ...clear])).toBe('red');
    expect(mostlyColour([...white, ...white])).toBe('grey');
    expect(mostlyColour([])).toBe('grey');
  });
});

describe('the Packager', () => {
  // a counter with its button left out where you can press it, and the rest sealed in a box
  function counterTool(world: World): { ids: number[]; tool: NonNullable<ReturnType<typeof packageTool>> } {
    const ids = world.addRoom(COUNTER, 500, 300);
    const choices = portChoices(world, ids);
    const tool = packageTool(world, ids, 'My counter', choices);
    expect(tool).not.toBeNull();
    return { ids, tool: tool as NonNullable<typeof tool> };
  }

  it('seals the parts in one box, leaves the button out, and it still counts', () => {
    const world = new World({ seed: 6501, things: [] });
    const { tool } = counterTool(world);
    expect(tool.room.things.map((t) => t.part?.kind)).toEqual(['button', 'tool']);
    const placed = world.addRoom(tool.room, 900, 400);
    const button = world.thing(placed[0]) as Thing;
    const box = world.thing(placed[1]) as Thing;
    const out = box.part?.tool?.outs.find((p) => p.port === 'value');
    expect(out).toBeDefined();
    for (let i = 0; i < 3; i++) {
      world.pressButton(button.id);
      world.step();
    }
    expect(world.circuit.peek(box.id, (out as { name: string }).name)).toBe(3);
    world.dispose();
  });

  it('what goes on the outside is your choice, and outside wires work both ways', () => {
    const world = new World({ seed: 6502, things: [] });
    const ids = world.addRoom(HUNGER, 500, 300);
    const food = world.things.find((t) => t.name === 'Hunger' && !t.inBody) as Thing;
    const timer = world.things.find((t) => t.name === 'Hunger timer') as Thing;
    const choices = portChoices(world, ids);
    for (const c of choices) c.wanted = (c.thingId === food.id && c.port === 'value') || (c.thingId === timer.id && c.port === 'reset');
    const tool = packageTool(world, ids, 'Hunger', choices) as NonNullable<ReturnType<typeof packageTool>>;
    expect(tool.room.things).toHaveLength(1);
    const inside = tool.room.things[0].part?.tool;
    expect(inside?.ins.map((p) => p.port)).toEqual(['reset']);
    expect(inside?.outs.map((p) => p.port)).toEqual(['value']);

    const [boxId] = world.addRoom(tool.room, 1000, 200);
    const shown = part(world, 'label', { value: -1 }, 1400, 300, { name: 'Shows' });
    const button = part(world, 'button', {}, 1400, 400);
    expect(world.connect(boxId, inside?.outs[0].name as string, shown.id, 'set')).not.toBeNull();
    expect(world.connect(button.id, 'pressed', boxId, inside?.ins[0].name as string)).not.toBeNull();
    world.step();
    expect(world.circuit.peek(shown.id, 'value')).toBe(50);
    for (let i = 0; i < 12 * TICKS_PER_SECOND; i++) world.step();
    expect(world.circuit.peek(shown.id, 'value')).toBeGreaterThan(50); // the sealed timer really runs
    world.dispose();
  });

  it('survives a save, undo-style removal, copying and a file', () => {
    const world = new World({ seed: 6503, things: [] });
    const { tool } = counterTool(world);
    const placed = world.addRoom(tool.room, 900, 400);
    const press = (w: World): void => {
      w.pressButton(w.things.filter((t) => t.part?.kind === 'button').at(-1)?.id as number);
      w.step();
    };
    press(world);
    press(world);
    const name = (world.thing(placed[1]) as Thing).part?.tool?.outs.find((p) => p.port === 'value')?.name as string;

    const reloaded = World.load(world.save());
    expect(reloaded.circuit.peek(placed[1], name)).toBe(2);
    press(reloaded);
    expect(reloaded.circuit.peek(placed[1], name)).toBe(3);

    // a copy carries its count, and is separate from then on
    const copy = world.addRoom(world.roomData(placed), 100, 100);
    expect(world.circuit.peek(copy[1], name)).toBe(2);
    press(world);
    expect(world.circuit.peek(copy[1], name)).toBe(3);
    expect(world.circuit.peek(placed[1], name)).toBe(2);

    const opened = parseRoom(saveRoom(world));
    const other = new World({ seed: 6504, room: opened, things: [] });
    expect(other.things.filter((t) => t.part?.kind === 'tool')).toHaveLength(world.things.filter((t) => t.part?.kind === 'tool').length);
    world.dispose();
    reloaded.dispose();
    other.dispose();
  });

  it('a tool file opens on another PC and works', () => {
    const world = new World({ seed: 6505, things: [] });
    const { tool } = counterTool(world);
    const file = parseTool(saveTool(tool));
    expect(file.name).toBe('My counter');
    const other = new World({ seed: 6506, things: [] });
    const placed = other.addRoom(file.room, 300, 300);
    other.pressButton(placed[0]);
    other.step();
    const box = other.thing(placed[1]) as Thing;
    const name = box.part?.tool?.outs.find((p) => p.port === 'value')?.name as string;
    expect(other.circuit.peek(box.id, name)).toBe(1);
    world.dispose();
    other.dispose();
  });

  it('unpacking lets it all back out, wired the same and counting from where it was', () => {
    const world = new World({ seed: 6507, things: [] });
    const { tool } = counterTool(world);
    const placed = world.addRoom(tool.room, 900, 400);
    world.pressButton(placed[0]);
    world.step();
    const boxId = placed[1];
    const name = (world.thing(boxId) as Thing).part?.tool?.outs.find((p) => p.port === 'value')?.name as string;
    const shown = part(world, 'label', { value: 0 }, 1500, 300, { name: 'Shows' });
    world.connect(boxId, name, shown.id, 'set');
    world.step();
    expect(world.circuit.peek(shown.id, 'value')).toBe(1);

    const out = world.unpack(boxId);
    expect(world.thing(boxId)).toBeUndefined();
    expect(out).toHaveLength(2);
    world.pressButton(placed[0]);
    world.step();
    expect(world.things.filter((t) => t.name === 'Count').at(-1)?.live?.value).toBe(2);
    world.step();
    expect(world.circuit.peek(shown.id, 'value')).toBe(2);
    world.dispose();
  });

  it('a wired fruit packaged up still feeds it, and the shape stays out where it can be eaten', () => {
    const world = new World({ seed: 6508, things: [] });
    world.setDrive('Hunger', 80);
    const ids = world.addRoom(WIRED_FRUIT, 300, 700);
    const tool = packageTool(world, ids, 'Fruit', portChoices(world, ids)) as NonNullable<ReturnType<typeof packageTool>>;
    for (const id of ids) world.remove(id);
    expect(tool.room.things.map((t) => t.part?.kind)).toEqual([undefined, 'tool']);
    const placed = world.addRoom(tool.room, MIDDLE + 100, 700);
    expect(until(world, 120, (e) => e.type === 'touched' && e.thingId === placed[0] && e.ate)).toBe(true);
    world.step();
    expect(world.drive('Hunger')?.value).toBeLessThan(80);
    world.dispose();
  });

  it('a body part can be packaged too, and its sockets and labels still count', () => {
    const world = new World({ seed: 6509, things: [], body: 'blank' });
    const inBody = { inBody: true };
    const disco = part(world, 'label', { value: 20, min: 0, max: 100 }, 800, 300, { ...inBody, name: 'Disco' });
    const socket = part(world, 'drive', { wants: 'high' }, 1000, 300, { ...inBody, name: 'Disco' });
    world.connect(disco.id, 'value', socket.id, 'value');
    const tool = packageTool(world, [disco.id, socket.id], 'Disco need', portChoices(world, [disco.id, socket.id])) as NonNullable<ReturnType<typeof packageTool>>;
    expect(toolPlace(tool)).toBe('body');
    world.remove(disco.id);
    world.remove(socket.id);
    expect(world.drive('Disco')).toBeUndefined();

    const file = parseTool(saveTool(tool));
    const friend = new World({ seed: 6510, things: [], body: 'blank' });
    friend.addRoom({ ...file.room, things: file.room.things.map((t) => ({ ...t, inBody: true })) }, 500, 300);
    friend.step();
    expect(friend.drive('Disco')?.value).toBe(20);
    expect(friend.giveTo('Disco', 5)).toBe(true);
    friend.step();
    expect(friend.drive('Disco')?.value).toBe(25);

    // and it crosses to another PC inside the creature
    const away = arrives(saveCreature(friend), 6511);
    expect(away.drive('Disco')?.value).toBe(25);
    world.dispose();
    friend.dispose();
    away.dispose();
  });

  it('a stranger cannot sneak anything into a tool', () => {
    const hostile = JSON.stringify({
      type: 'nurtron-room',
      version: 3,
      things: [{
        name: 'Box',
        form: 'box',
        hw: 400,
        part: {
          kind: 'tool',
          tool: {
            things: [
              { name: 'Hidden button', form: 'box', hw: 20, part: { kind: 'button' } },
              { name: 'Nested', form: 'box', hw: 20, part: { kind: 'tool', tool: { things: [] } } },
              { name: 'Drive', form: 'box', hw: 20, part: { kind: 'drive' } },
              { name: 'Shape', form: 'box', hw: 20 },
              { name: 'Count', form: 'box', hw: 20, part: { kind: 'label', value: 4 } },
            ],
            wires: [{ from: 0, out: 'pressed', to: 4, in: 'update' }],
            ins: [{ name: 'fake', kind: 'value', thing: 4, port: 'nonsense' }, { name: 'bad', thing: 99, port: 'set' }],
            outs: [{ name: 'real', kind: 'pulse', thing: 4, port: 'value' }, { name: 'real', kind: 'value', thing: 4, port: 'value' }],
          },
        },
      }],
    });
    const room = parseRoom(hostile);
    const tool = room.things[0].part?.tool;
    expect(tool?.things.map((t) => t.part?.kind)).toEqual(['label']);
    expect(tool?.wires).toEqual([]);
    expect(tool?.ins).toEqual([]);
    expect(tool?.outs.map((p) => [p.name, p.kind])).toEqual([['real', 'value']]);
    expect(room.things[0].hw).toBeLessThan(400);
    const world = new World({ seed: 6512, room, things: [] });
    world.step();
    expect(world.circuit.peek(world.things.at(-1)?.id as number, 'real')).toBe(4);
    world.dispose();

    const many = { type: 'nurtron-room', version: 3, things: Array.from({ length: 30 }, () => ({ form: 'box', part: { kind: 'tool', tool: { things: Array.from({ length: 150 }, () => ({ part: { kind: 'data' } })) } } })) };
    expect(() => parseRoom(JSON.stringify(many))).toThrow(/inside its tools/);
  });

  it('old room files still open', () => {
    const room = parseRoom(JSON.stringify({ type: 'nurtron-room', version: 2, things: [{ name: 'Old', form: 'box', hw: 20, hh: 20, x: 300, y: 300 }], wires: [] }));
    expect(room.things[0].name).toBe('Old');
  });
});
