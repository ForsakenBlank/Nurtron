// little ready-made circuits. these two are also milestone 2's own test: if they work, wires work.
import { newPart } from './parts.ts';
import type { Part, PartKind } from './parts.ts';
import type { RoomData, ThingSpec } from './world.ts';

function part(kind: PartKind, x: number, y: number, name: string, settings: Partial<Part> = {}): ThingSpec {
  const spec = newPart(kind, x, y);
  return { ...spec, name, part: { ...spec.part, ...settings } };
}

// a fruit you've made yourself: a red circle whose Touched output is wired to a Give
export const WIRED_FRUIT: RoomData = {
  things: [
    { name: 'Fruit', form: 'circle', colour: 'red', hw: 14, hh: 14, x: 0, y: 0, eaten: true, respawnSeconds: 12 },
    { ...part('give', 90, -60, 'Give food', { target: 'Hunger', amount: -25 }) },
  ],
  wires: [{ from: 0, out: 'touched', to: 1, in: 'give' }],
};

// ready-made stats a creature can be given, each a little block of real wires you can open up and change.
export const STATS = ['hunger', 'energy', 'thirst', 'health', 'mortal', 'happiness', 'loneliness'] as const;
export type StatId = (typeof STATS)[number];
export const DEFAULT_STATS: StatId[] = ['hunger', 'energy'];

export const STAT_INFO: Record<StatId, { title: string; help: string; needs?: StatId }> = {
  hunger: { title: 'Hunger', help: 'Goes up by itself. 100 is starving, and eating brings it down.' },
  energy: { title: 'Energy', help: 'Goes down by itself. 0 is exhausted, and resting brings it back.' },
  thirst: { title: 'Thirst', help: "Goes up by itself. 100 is parched. Nothing brings it down until you make something that does, with a Give part." },
  health: { title: 'Health', help: 'Slaps hurt it, and it slowly heals. By itself, nothing happens at 0.' },
  mortal: { title: 'Dies at 0 Health', help: 'It dies when Health reaches 0, and you can revive it.', needs: 'health' },
  happiness: { title: 'Happiness', help: 'Pets raise it, slaps lower it, and it slowly fades.' },
  loneliness: { title: 'Loneliness', help: 'Goes up by itself, and a pet brings it down.' },
};

// a value that climbs by itself, or falls if step is below zero, and a socket that makes the creature care about it
function ticking(name: string, thing: string, value: number, wants: 'high' | 'low', step: number, every: number): RoomData {
  return {
    things: [
      part('data', 0, 0, 'How often', { base: every, spread: 1 }),
      part('timer', 170, 0, thing, { seconds: every }),
      part('label', 370, 0, name, { value, min: 0, max: 100 }),
      part('drive', 590, 0, name, { wants }),
      part('data', 170, 105, 'How much', { base: step }),
      part('math', 370, 105, 'Change', { op: 'add' }),
    ],
    wires: [
      { from: 0, out: 'value', to: 1, in: 'seconds' },
      { from: 1, out: 'tick', to: 2, in: 'update' },
      { from: 2, out: 'value', to: 5, in: 'a' },
      { from: 4, out: 'value', to: 5, in: 'b' },
      { from: 5, out: 'result', to: 2, in: 'set' },
      { from: 2, out: 'value', to: 3, in: 'value' },
    ],
  };
}

// the wires for one stat, measured from its own top left corner
export function statBlock(stat: StatId, hunger = 45, energy = 90): RoomData {
  switch (stat) {
    case 'hunger':
      return ticking('Hunger', 'Getting hungry', hunger, 'low', 1, 2);
    case 'thirst':
      return ticking('Thirst', 'Getting thirsty', 30, 'low', 1, 3);
    case 'energy': {
      const room = ticking('Energy', 'Getting tired', energy, 'high', -1, 5);
      room.things.push(part('action', 0, 210, 'Resting', { action: 'rest' }), part('timer', 170, 210, 'While resting', { seconds: 1 / 6 }), part('give', 370, 210, 'Rested', { target: 'Energy', amount: 1 }));
      room.wires.push({ from: 6, out: 'doing', to: 7, in: 'on' }, { from: 7, out: 'tick', to: 8, in: 'give' });
      return room;
    }
    case 'health':
      return {
        things: [
          part('label', 370, 0, 'Health', { value: 100, min: 0, max: 100 }),
          part('drive', 590, 0, 'Health', { wants: 'high' }),
          part('feel', 0, 0, 'Hurt by'),
          part('give', 170, 0, 'Hurts', { target: 'Health', amount: -15 }),
          part('timer', 0, 150, 'Healing', { seconds: 3 }),
          part('give', 170, 150, 'Heals', { target: 'Health', amount: 1 }),
        ],
        wires: [
          { from: 0, out: 'value', to: 1, in: 'value' },
          { from: 2, out: 'slapped', to: 3, in: 'give' },
          { from: 4, out: 'tick', to: 5, in: 'give' },
        ],
      };
    case 'mortal':
      return {
        things: [part('compare', 0, 0, 'No health left', { op: 'smaller', b: 1 }), part('die', 170, 0, 'Dies')],
        wires: [{ from: 0, out: 'became', to: 1, in: 'die' }],
      };
    case 'happiness':
      return {
        things: [
          part('label', 370, 0, 'Happiness', { value: 60, min: 0, max: 100 }),
          part('drive', 590, 0, 'Happiness', { wants: 'high' }),
          part('feel', 0, 0, 'Feels'),
          part('give', 170, 0, 'Cheered up', { target: 'Happiness', amount: 10 }),
          part('give', 170, 75, 'Upset', { target: 'Happiness', amount: -10 }),
          part('timer', 0, 170, 'Fading', { seconds: 6 }),
          part('give', 170, 170, 'Fades', { target: 'Happiness', amount: -1 }),
        ],
        wires: [
          { from: 0, out: 'value', to: 1, in: 'value' },
          { from: 2, out: 'petted', to: 3, in: 'give' },
          { from: 2, out: 'slapped', to: 4, in: 'give' },
          { from: 5, out: 'tick', to: 6, in: 'give' },
        ],
      };
    case 'loneliness':
      return {
        things: [
          part('label', 370, 0, 'Loneliness', { value: 40, min: 0, max: 100 }),
          part('drive', 590, 0, 'Loneliness', { wants: 'low' }),
          part('feel', 0, 0, 'Feels'),
          part('give', 170, 0, 'Comforted', { target: 'Loneliness', amount: -15 }),
          part('timer', 0, 150, 'Getting lonely', { seconds: 4 }),
          part('give', 170, 150, 'Lonelier', { target: 'Loneliness', amount: 1 }),
        ],
        wires: [
          { from: 0, out: 'value', to: 1, in: 'value' },
          { from: 2, out: 'petted', to: 3, in: 'give' },
          { from: 4, out: 'tick', to: 5, in: 'give' },
        ],
      };
  }
}

// the body a new creature comes with
export function starterBody(hunger = 45, energy = 90): RoomData {
  const things: ThingSpec[] = [];
  const wires: RoomData['wires'] = [];
  DEFAULT_STATS.forEach((stat, slot) => {
    const block = statBlock(stat, hunger, energy);
    const at = things.length;
    things.push(...block.things.map((t) => ({ ...t, ...statSpot(slot, t), inBody: true, stat })));
    wires.push(...block.wires.map((w) => ({ ...w, from: w.from + at, to: w.to + at })));
  });
  return { things, wires };
}

// stats go in a grid, so each has room for its wires
export function statSpot(slot: number, t: { x: number; y?: number }): { x: number; y: number } {
  return { x: 120 + (slot % 2) * 950 + t.x, y: 120 + (Math.floor(slot / 2) % 3) * 300 + (t.y ?? 0) };
}

// a button-powered counter: each press adds one
export const COUNTER: RoomData = {
  things: [
    part('button', 0, 0, 'Press me'),
    part('label', 160, 0, 'Count', { value: 0 }),
    part('math', 160, 90, 'Add one', { op: 'add', b: 1 }),
  ],
  wires: [
    { from: 0, out: 'pressed', to: 1, in: 'update' },
    { from: 1, out: 'value', to: 2, in: 'a' },
    { from: 2, out: 'result', to: 1, in: 'set' },
  ],
};

// the hunger circuit from the plan: every 9, 10 or 11 seconds, Hunger goes up by 1
export const HUNGER: RoomData = {
  things: [
    part('data', 0, 0, 'How often', { base: 10, spread: 1 }),
    part('timer', 170, 0, 'Hunger timer', { seconds: 10 }),
    part('label', 350, 0, 'Hunger', { value: 50 }),
    part('math', 350, 100, 'Change', { op: 'add' }),
    part('data', 170, 110, 'How much', { base: 1, spread: 0 }),
  ],
  wires: [
    { from: 0, out: 'value', to: 1, in: 'seconds' },
    { from: 1, out: 'tick', to: 2, in: 'update' },
    { from: 2, out: 'value', to: 3, in: 'a' },
    { from: 4, out: 'value', to: 3, in: 'b' },
    { from: 3, out: 'result', to: 2, in: 'set' },
  ],
};
