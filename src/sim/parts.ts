// the circuit parts: what each one is called, which ports it has and how it's laid out. no behaviour here, that's
// circuit.ts, and no graphics. a part is an ordinary thing in the room with this on top, so everything that works
// on a shape (moving, rotating, undo, gravity if you want it) works on a part as well.
import { ACTIONS } from './brain.ts';
import type { Action } from './brain.ts';
import { COLOURS } from './senses.ts';
import type { Colour } from './senses.ts';
import { corners } from './shapes.ts';
import type { Form } from './shapes.ts';
import type { RoomData, ThingSpec } from './world.ts';

// the parts you can pick from the toolbar. a tool is a part too, but you make those with the Packager.
export const PART_KINDS = ['label', 'data', 'button', 'timer', 'math', 'compare', 'switch', 'sensor', 'motor', 'give', 'drive', 'nerve', 'action', 'feel', 'die', 'logic', 'random', 'delay', 'zone', 'spawner', 'destroy', 'teleport', 'where', 'hit', 'show', 'paint', 'keyboard', 'mouse', 'camera', 'sound', 'burst', 'say', 'hear', 'goal', 'start', 'combine', 'chance', 'frame', 'storage', 'items', 'mover', 'hurt', 'choice', 'effect', 'ability'] as const;
export type PartKind = (typeof PART_KINDS)[number] | 'tool';

export type Value = number | string | boolean;

// value wires always carry the latest value, pulse wires carry a single moment, and a body wire is a motor holding on to something
export type PortKind = 'value' | 'pulse' | 'body';

export const MATH_OPS = ['add', 'subtract', 'multiply', 'divide', 'min', 'max', 'remainder', 'power'] as const;
export const LOGIC_OPS = ['and', 'or', 'not', 'xor'] as const;
export const COMPARE_OPS = ['bigger', 'smaller', 'equal'] as const;
export const MOTOR_MODES = ['push', 'spin', 'move'] as const;
export const COMBINE_OPS = ['add', 'average', 'min', 'max', 'all', 'any', 'count', 'join'] as const;
export const CHANCE_PICKS = ['one', 'each'] as const; // one of them at most, or each one rolled on its own
export const LOOPS = ['once', 'loop', 'bounce'] as const;
export const EFFECT_STATS = ['speed', 'jump', 'attack', 'defence', 'magnet'] as const;
export const ABILITY_STYLES = ['shoot', 'nova', 'aura'] as const;
export const WANTS = ['high', 'low', 'near'] as const;
export type MathOp = (typeof MATH_OPS)[number];
export type LogicOp = (typeof LOGIC_OPS)[number];
export type CompareOp = (typeof COMPARE_OPS)[number];
export type MotorMode = (typeof MOTOR_MODES)[number];
export type Wants = (typeof WANTS)[number];
export type CombineOp = (typeof COMBINE_OPS)[number];
export type ChancePick = (typeof CHANCE_PICKS)[number];
export type Loop = (typeof LOOPS)[number];
export type EffectStat = (typeof EFFECT_STATS)[number];
export type AbilityStyle = (typeof ABILITY_STYLES)[number];

// one step of a Mover's animation: where it is by then, from where it started, and how long it takes to get there
export interface Key {
  x: number;
  y: number;
  turn: number; // degrees
  seconds: number;
}

export const MOST_CHANCES = 8;
export const MOST_OPTIONS = 4;
export const MOST_KEYS = 24;

export interface Part {
  kind: PartKind;
  value?: Value; // label: what it holds
  locked?: boolean; // label: can't be typed into
  min?: number; // label: never goes below this
  max?: number; // label: never goes above this
  base?: number; // data
  spread?: number; // data: base 10, spread 1 gives 9, 10 or 11
  seconds?: number; // timer
  op?: MathOp | CompareOp | LogicOp | CombineOp; // math, compare, logic and combine
  a?: number; // math and compare: used when nothing is wired in
  b?: number;
  latch?: boolean; // button: stays on until pressed again
  tag?: string; // sensor: only notices things with this tag
  mode?: MotorMode; // motor
  direction?: number; // motor: degrees, 0 is right and -90 is up
  power?: number; // motor
  target?: string; // give: the name of the label inside the creature that it changes
  amount?: number; // give
  wants?: Wants; // drive socket: what feels good
  aim?: number; // drive socket: the number it wants to be near
  scale?: number; // drive and nerve sockets: what counts as all the way
  action?: Action; // action part: which action it watches
  tool?: ToolInside; // tool: what's sealed inside it
  pull?: number; // gravity zone: how strong, where 1 is normal and 0 is none
  word?: string; // say and hear
  key?: string; // keyboard: which key, as the browser names it, like "ArrowLeft" or " "
  most?: number; // spawner: how many it keeps at once
  removes?: boolean; // collision: whatever it hits is removed
  tint?: Colour; // paint
  pitch?: number; // sound: how high, in hertz
  zoom?: number; // camera
  chances?: number[]; // chance: percent for each output, which can be as small as you like
  pick?: ChancePick; // chance
  start?: number; // storage: what it holds to begin with
  shown?: boolean; // storage: shows in the corner while playing
  item?: string; // items: which kind of thing it counts
  keys?: Key[]; // mover
  origin?: { x: number; y: number; angle: number }; // mover: where its thing was when you started recording keyframes
  loop?: Loop; // mover
  options?: string[]; // choice: what the creature picks between
  stat?: EffectStat; // effect
  style?: AbilityStyle; // ability
  damage?: number; // ability and hurt
  count?: number; // ability: how many at once
  speed?: number; // ability: how fast they fly
  range?: number; // ability: how far it reaches
}

// one of the sockets on the outside of a tool, and where inside it really goes
export interface ToolPort extends PortDef {
  thing: number; // its position in things
  port: string;
}

// the wires go by position in the list, the same as in a room file
export interface ToolInside {
  things: ThingSpec[];
  wires: RoomData['wires'];
  ins: ToolPort[];
  outs: ToolPort[];
}

interface PortDef {
  name: string;
  kind: PortKind;
  help: string;
  label?: string; // what to show on the part, when that isn't the name. the name is what wires go by, so it never changes
}

export const PART_GROUPS = ['Values', 'Logic', 'World', 'Things', 'Creature', 'Game', 'Player', 'Effects'] as const;
export type PartGroup = (typeof PART_GROUPS)[number];

interface PartInfo {
  group: PartGroup;
  title: string;
  colour: Colour;
  help: string;
  where: 'both' | 'room' | 'body'; // whether it makes sense out in the room, inside a creature, or both
  form: Form;
  hw: number;
  ins: PortDef[];
  outs: PortDef[];
  defaults: Part;
}

export const PART_INFO: Record<PartKind, PartInfo> = {
  label: {
    group: 'Values',
    title: 'Label',
    colour: 'blue',
    where: 'both',
    help: 'Holds a number or some text. If a pulse is wired to Update, it only changes when that pulse arrives.',
    form: 'box',
    hw: 76,
    ins: [
      { name: 'set', kind: 'value', help: 'The new value' },
      { name: 'update', kind: 'pulse', help: 'Takes the new value when a pulse arrives' },
    ],
    outs: [{ name: 'value', kind: 'value', help: 'What it holds' }],
    defaults: { kind: 'label', value: 0, locked: false },
  },
  data: {
    group: 'Values',
    title: 'Data',
    colour: 'green',
    where: 'both',
    help: 'A fixed number with optional randomness. It picks again each time a pulse uses it.',
    form: 'box',
    hw: 56,
    ins: [],
    outs: [{ name: 'value', kind: 'value', help: 'The number' }],
    defaults: { kind: 'data', base: 10, spread: 0 },
  },
  button: {
    group: 'Player',
    title: 'Button',
    colour: 'red',
    where: 'both',
    help: 'Sends a pulse when you click it, or when a creature touches it.',
    form: 'circle',
    hw: 22,
    ins: [],
    outs: [
      { name: 'pressed', kind: 'pulse', help: 'A pulse each time it is pressed' },
      { name: 'on', kind: 'value', help: 'True just after a press, or until the next press if it stays on' },
    ],
    defaults: { kind: 'button', latch: false },
  },
  timer: {
    group: 'Logic',
    title: 'Timer',
    colour: 'orange',
    where: 'both',
    help: 'Sends a pulse every so many seconds.',
    form: 'box',
    hw: 66,
    ins: [
      { name: 'seconds', kind: 'value', help: 'How long between pulses, checked each time it starts waiting' },
      { name: 'on', kind: 'value', help: 'It only runs while this is true. Not wired, it always runs' },
      { name: 'reset', kind: 'pulse', help: 'Starts the wait again' },
    ],
    outs: [{ name: 'tick', kind: 'pulse', help: 'A pulse each time the wait is over' }],
    defaults: { kind: 'timer', seconds: 1 },
  },
  math: {
    group: 'Values',
    title: 'Math',
    colour: 'purple',
    where: 'both',
    help: 'Does a sum with two numbers.',
    form: 'box',
    hw: 62,
    ins: [
      { name: 'a', kind: 'value', help: 'The first number' },
      { name: 'b', kind: 'value', help: 'The second number' },
    ],
    outs: [{ name: 'result', kind: 'value', help: 'The answer' }],
    defaults: { kind: 'math', op: 'add', a: 0, b: 1 },
  },
  compare: {
    group: 'Logic',
    title: 'Compare',
    colour: 'purple',
    where: 'both',
    help: 'Compares two numbers and gives true or false.',
    form: 'box',
    hw: 66,
    ins: [
      { name: 'a', kind: 'value', help: 'The first number' },
      { name: 'b', kind: 'value', help: 'The number to compare it with' },
    ],
    outs: [
      { name: 'result', kind: 'value', help: 'True or false' },
      { name: 'became', kind: 'pulse', help: 'A pulse the moment the result turns true' },
    ],
    defaults: { kind: 'compare', op: 'bigger', a: 0, b: 0 },
  },
  switch: {
    group: 'Logic',
    title: 'Switch',
    colour: 'yellow',
    where: 'both',
    help: 'Lets values and pulses through only while its Open input is true.',
    form: 'box',
    hw: 62,
    ins: [
      { name: 'open', kind: 'value', help: 'True lets things through' },
      { name: 'value', kind: 'value', help: 'A value to let through' },
      { name: 'pulse', kind: 'pulse', help: 'A pulse to let through' },
    ],
    outs: [
      { name: 'value', kind: 'value', help: 'The value, while open' },
      { name: 'pulse', kind: 'pulse', help: 'The pulse, while open' },
    ],
    defaults: { kind: 'switch' },
  },
  sensor: {
    group: 'World',
    title: 'Sensor',
    colour: 'green',
    where: 'room',
    help: 'An area that notices things going in and out of it. Grab it by its header.',
    form: 'box',
    hw: 90,
    ins: [],
    outs: [
      { name: 'entered', kind: 'pulse', help: 'A pulse when something goes in' },
      { name: 'left', kind: 'pulse', help: 'A pulse when something comes out' },
      { name: 'inside', kind: 'value', help: 'True while anything is in it' },
      { name: 'count', kind: 'value', help: 'How many things are in it' },
    ],
    defaults: { kind: 'sensor', tag: '' },
  },
  motor: {
    group: 'Things',
    title: 'Motor',
    colour: 'orange',
    where: 'room',
    help: 'Pushes, spins or moves whatever you wire it to. With nothing wired to On or Kick, it just runs.',
    form: 'box',
    hw: 66,
    ins: [
      { name: 'on', kind: 'value', help: 'It only runs while this is true' },
      { name: 'power', kind: 'value', help: 'How strong. Below zero goes the other way' },
      { name: 'kick', kind: 'pulse', help: 'One hard shove' },
    ],
    outs: [{ name: 'drives', kind: 'body', help: 'Drag this onto any shape to attach it' }],
    defaults: { kind: 'motor', mode: 'push', direction: -90, power: 50 },
  },
  give: {
    group: 'Creature',
    title: 'Give',
    colour: 'green',
    where: 'both',
    help: 'When a pulse arrives, changes a named Label inside the creature, like Hunger -20.',
    form: 'box',
    hw: 72,
    ins: [
      { name: 'give', kind: 'pulse', help: 'Gives it now. Wire a shape\'s Touched here' },
      { name: 'amount', kind: 'value', help: 'How much. Not wired, it uses its setting' },
    ],
    outs: [],
    defaults: { kind: 'give', target: 'Hunger', amount: -20 },
  },
  drive: {
    group: 'Creature',
    title: 'Drive socket',
    colour: 'red',
    where: 'body',
    help: 'Plug in any value and it now cares about it. Getting what it wants feels good, and it learns from that.',
    form: 'box',
    hw: 72,
    ins: [{ name: 'value', kind: 'value', help: 'The value it cares about' }],
    outs: [],
    defaults: { kind: 'drive', wants: 'high', aim: 50, scale: 100 },
  },
  nerve: {
    group: 'Creature',
    title: 'Nerve socket',
    colour: 'blue',
    where: 'both',
    help: 'Plug in any value as plain information. It feels neither good nor bad, but it can learn what to do when it\'s on.',
    form: 'box',
    hw: 72,
    ins: [{ name: 'value', kind: 'value', help: 'What it should know about' }],
    outs: [],
    defaults: { kind: 'nerve', scale: 1 },
  },
  action: {
    group: 'Creature',
    title: 'Action',
    colour: 'yellow',
    where: 'body',
    help: 'Tells the body what the creature is doing, like resting.',
    form: 'box',
    hw: 62,
    ins: [],
    outs: [
      { name: 'doing', kind: 'value', help: 'True while it does this' },
      { name: 'started', kind: 'pulse', help: 'A pulse each time it starts' },
    ],
    defaults: { kind: 'action', action: 'rest' },
  },
  tool: {
    group: 'Values',
    title: 'Tool',
    colour: 'purple',
    where: 'both',
    help: 'A tool you packaged. It works just like the parts sealed inside it. Unpack it to see them.',
    form: 'box',
    hw: 72,
    ins: [],
    outs: [],
    defaults: { kind: 'tool' },
  },
  logic: {
    group: 'Logic',
    title: 'Logic',
    colour: 'purple',
    where: 'both',
    help: 'And, or, not, or either-but-not-both, for true and false.',
    form: 'box',
    hw: 62,
    ins: [
      { name: 'a', kind: 'value', help: 'The first true or false' },
      { name: 'b', kind: 'value', help: 'The second, not used by Not' },
    ],
    outs: [
      { name: 'result', kind: 'value', help: 'True or false' },
      { name: 'became', kind: 'pulse', help: 'A pulse the moment the result turns true' },
    ],
    defaults: { kind: 'logic', op: 'and' },
  },
  random: {
    group: 'Values',
    title: 'Random',
    colour: 'green',
    where: 'both',
    help: 'A random number between two others, which only picks again when a pulse tells it to.',
    form: 'box',
    hw: 62,
    ins: [{ name: 'roll', kind: 'pulse', help: 'Picks a new number' }],
    outs: [{ name: 'value', kind: 'value', help: 'The number' }],
    defaults: { kind: 'random', a: 0, b: 100 },
  },
  delay: {
    group: 'Logic',
    title: 'Delay',
    colour: 'orange',
    where: 'both',
    help: 'Passes a pulse along after waiting. Several can be on their way at once.',
    form: 'box',
    hw: 62,
    ins: [
      { name: 'go', kind: 'pulse', help: 'Starts a wait' },
      { name: 'seconds', kind: 'value', help: 'How long. Not wired, it uses its setting' },
    ],
    outs: [{ name: 'done', kind: 'pulse', help: 'A pulse when the wait is over' }],
    defaults: { kind: 'delay', seconds: 1 },
  },
  zone: {
    group: 'World',
    title: 'Gravity zone',
    colour: 'yellow',
    where: 'room',
    help: 'An area with its own gravity. With none, creatures float-walk across the background and things drift. Grab it by its header, so building inside it is easy.',
    form: 'box',
    hw: 160,
    ins: [{ name: 'on', kind: 'value', help: 'It only works while this is true. Not wired, it always works' }],
    outs: [
      { name: 'entered', kind: 'pulse', help: 'A pulse when something goes in' },
      { name: 'left', kind: 'pulse', help: 'A pulse when something comes out' },
      { name: 'count', kind: 'value', help: 'How many things are in it' },
    ],
    defaults: { kind: 'zone', pull: 0, direction: 90, tag: '' },
  },
  spawner: {
    group: 'Things',
    title: 'Spawner',
    colour: 'green',
    where: 'room',
    help: 'Makes a copy of whatever shape you attach, still wired up the same. This is how you make a fruit dispenser.',
    form: 'box',
    hw: 66,
    ins: [
      { name: 'spawn', kind: 'pulse', help: 'Makes one' },
      { name: 'x', kind: 'value', help: 'Where. Not wired, where the shape is' },
      { name: 'y', kind: 'value', help: 'Where. Not wired, where the shape is' },
    ],
    outs: [
      { name: 'drives', kind: 'body', help: 'Drag this onto the shape to copy' },
      { name: 'made', kind: 'pulse', help: 'A pulse each time it makes one' },
      { name: 'count', kind: 'value', help: 'How many of its copies are around' },
    ],
    defaults: { kind: 'spawner', most: 20 },
  },
  destroy: {
    group: 'Things',
    title: 'Destroy',
    colour: 'red',
    where: 'room',
    help: 'Removes whatever you attach when a pulse arrives.',
    form: 'box',
    hw: 58,
    ins: [{ name: 'destroy', kind: 'pulse', help: 'Removes it now' }],
    outs: [{ name: 'drives', kind: 'body', help: 'Drag this onto a shape' }],
    defaults: { kind: 'destroy' },
  },
  teleport: {
    group: 'Things',
    title: 'Teleport',
    colour: 'purple',
    where: 'room',
    help: 'Moves whatever you attach to a spot when a pulse arrives.',
    form: 'box',
    hw: 60,
    ins: [
      { name: 'go', kind: 'pulse', help: 'Moves it now' },
      { name: 'x', kind: 'value', help: 'Across' },
      { name: 'y', kind: 'value', help: 'Down' },
    ],
    outs: [{ name: 'drives', kind: 'body', help: 'Drag this onto a shape' }],
    defaults: { kind: 'teleport', a: 100, b: 100 },
  },
  where: {
    group: 'Things',
    title: 'Where',
    colour: 'green',
    where: 'room',
    help: 'Says where whatever you attach is, and how fast it is going.',
    form: 'box',
    hw: 56,
    ins: [],
    outs: [
      { name: 'drives', kind: 'body', help: 'Drag this onto a shape' },
      { name: 'x', kind: 'value', help: 'How far across' },
      { name: 'y', kind: 'value', help: 'How far down' },
      { name: 'speed', kind: 'value', help: 'How fast' },
    ],
    defaults: { kind: 'where' },
  },
  hit: {
    group: 'Things',
    title: 'Collision',
    colour: 'orange',
    where: 'room',
    help: 'Notices whatever you attach touching something, by tag if you like. It can remove what it hits, for things like bullets and coins.',
    form: 'box',
    hw: 62,
    ins: [],
    outs: [
      { name: 'drives', kind: 'body', help: 'Drag this onto a shape' },
      { name: 'hit', kind: 'pulse', help: 'A pulse when it starts touching something' },
      { name: 'touching', kind: 'value', help: 'True while it is touching something' },
    ],
    defaults: { kind: 'hit', tag: '', removes: false },
  },
  show: {
    group: 'Things',
    title: 'Show/hide',
    colour: 'yellow',
    where: 'room',
    help: 'Makes whatever you attach invisible, or visible again. It is still there either way.',
    form: 'box',
    hw: 58,
    ins: [
      { name: 'show', kind: 'pulse', help: 'Shows it' },
      { name: 'hide', kind: 'pulse', help: 'Hides it' },
    ],
    outs: [{ name: 'drives', kind: 'body', help: 'Drag this onto a shape' }],
    defaults: { kind: 'show' },
  },
  paint: {
    group: 'Things',
    title: 'Paint',
    colour: 'yellow',
    where: 'room',
    help: 'Changes the colour of whatever you attach. Creatures see the new colour too.',
    form: 'box',
    hw: 56,
    ins: [{ name: 'paint', kind: 'pulse', help: 'Paints it now' }],
    outs: [{ name: 'drives', kind: 'body', help: 'Drag this onto a shape' }],
    defaults: { kind: 'paint', tint: 'red' },
  },
  keyboard: {
    group: 'Player',
    title: 'Keyboard',
    colour: 'blue',
    where: 'both',
    help: 'Tells you about one key on the keyboard. Wire it to a Motor and you have something you can steer.',
    form: 'box',
    hw: 62,
    ins: [],
    outs: [
      { name: 'down', kind: 'value', help: 'True while it is held' },
      { name: 'pressed', kind: 'pulse', help: 'A pulse when it goes down' },
      { name: 'released', kind: 'pulse', help: 'A pulse when it comes up' },
    ],
    defaults: { kind: 'keyboard', key: 'ArrowRight' },
  },
  mouse: {
    group: 'Player',
    title: 'Mouse',
    colour: 'blue',
    where: 'both',
    help: 'Where the mouse is in the room, and whether its button is down.',
    form: 'box',
    hw: 56,
    ins: [],
    outs: [
      { name: 'x', kind: 'value', help: 'How far across' },
      { name: 'y', kind: 'value', help: 'How far down' },
      { name: 'down', kind: 'value', help: 'True while the button is held' },
      { name: 'clicked', kind: 'pulse', help: 'A pulse when the button goes down' },
    ],
    defaults: { kind: 'mouse' },
  },
  camera: {
    group: 'Player',
    title: 'Camera',
    colour: 'blue',
    where: 'room',
    help: 'In Play mode, the view follows whatever you attach.',
    form: 'box',
    hw: 58,
    ins: [{ name: 'on', kind: 'value', help: 'It only follows while this is true. Not wired, it always does' }],
    outs: [{ name: 'drives', kind: 'body', help: 'Drag this onto a shape' }],
    defaults: { kind: 'camera', zoom: 1 },
  },
  sound: {
    group: 'Effects',
    title: 'Sound',
    colour: 'orange',
    where: 'both',
    help: 'Plays a note when a pulse arrives.',
    form: 'box',
    hw: 58,
    ins: [
      { name: 'play', kind: 'pulse', help: 'Plays it now' },
      { name: 'pitch', kind: 'value', help: 'How high, in hertz. Not wired, it uses its setting' },
    ],
    outs: [],
    defaults: { kind: 'sound', pitch: 440, seconds: 0.2 },
  },
  burst: {
    group: 'Effects',
    title: 'Burst',
    colour: 'orange',
    where: 'room',
    help: 'A puff of sparks when a pulse arrives, where the part is or on what you attach.',
    form: 'box',
    hw: 56,
    ins: [{ name: 'go', kind: 'pulse', help: 'Makes the sparks' }],
    outs: [{ name: 'drives', kind: 'body', help: 'Drag this onto a shape, or leave it to burst here' }],
    defaults: { kind: 'burst', tint: 'yellow' },
  },
  say: {
    group: 'Creature',
    title: 'Say',
    colour: 'yellow',
    where: 'both',
    help: 'Says a word out loud when a pulse arrives. Creatures can learn what it means.',
    form: 'box',
    hw: 60,
    ins: [{ name: 'say', kind: 'pulse', help: 'Says it now' }],
    outs: [],
    defaults: { kind: 'say', word: 'hello' },
  },
  hear: {
    group: 'Creature',
    title: 'Hear',
    colour: 'yellow',
    where: 'both',
    help: 'Sends a pulse when anyone says this word, including a creature.',
    form: 'box',
    hw: 60,
    ins: [],
    outs: [{ name: 'heard', kind: 'pulse', help: 'A pulse when the word is said' }],
    defaults: { kind: 'hear', word: 'hello' },
  },
  goal: {
    group: 'World',
    title: 'Goal',
    colour: 'green',
    where: 'room',
    help: 'When a pulse arrives, a Trial is solved. Wire up what counts as winning.',
    form: 'box',
    hw: 54,
    ins: [{ name: 'reached', kind: 'pulse', help: 'The Trial is solved' }],
    outs: [],
    defaults: { kind: 'goal' },
  },
  start: {
    group: 'World',
    title: 'Start',
    colour: 'green',
    where: 'room',
    help: 'Where creatures begin when a Trial starts.',
    form: 'box',
    hw: 42,
    ins: [],
    outs: [],
    defaults: { kind: 'start' },
  },
  feel: {
    group: 'Creature',
    title: 'Feel',
    colour: 'yellow',
    where: 'body',
    help: 'Sends a pulse when you pet or slap it, or another creature cuddles up to it. Good for building something like loneliness.',
    form: 'box',
    hw: 58,
    ins: [],
    outs: [
      { name: 'petted', kind: 'pulse', help: 'A pulse when you pet it' },
      { name: 'slapped', kind: 'pulse', help: 'A pulse when you slap it' },
      { name: 'died', kind: 'pulse', help: 'A pulse when it dies' },
      { name: 'revived', kind: 'pulse', help: 'A pulse when it comes back' },
      { name: 'cuddled', kind: 'pulse', help: 'A pulse when it touches another creature, or another creature touches it' },
    ],
    defaults: { kind: 'feel' },
  },
  die: {
    group: 'Creature',
    title: 'Die',
    colour: 'grey',
    where: 'both',
    help: 'When a pulse arrives, the creature dies. Inside a creature, that creature. Out in the room, whichever creature set it off. You can bring it back, and it remembers.',
    form: 'box',
    hw: 50,
    ins: [{ name: 'die', kind: 'pulse', help: 'Dies now. Wire a Compare\'s Became here, or a shape\'s Touched for poison' }],
    outs: [],
    defaults: { kind: 'die' },
  },
  combine: {
    group: 'Logic',
    title: 'Combine',
    colour: 'purple',
    where: 'both',
    help: 'Brings up to four values together into one, and up to four pulses into one. Wire several things in and one thing out.',
    form: 'box',
    hw: 70,
    ins: [
      { name: 'a', kind: 'value', help: 'A value' },
      { name: 'b', kind: 'value', help: 'A value' },
      { name: 'c', kind: 'value', help: 'A value' },
      { name: 'd', kind: 'value', help: 'A value' },
      { name: 'p1', kind: 'pulse', help: 'A pulse' },
      { name: 'p2', kind: 'pulse', help: 'A pulse' },
      { name: 'p3', kind: 'pulse', help: 'A pulse' },
      { name: 'p4', kind: 'pulse', help: 'A pulse' },
    ],
    outs: [
      { name: 'result', kind: 'value', help: 'The values put together' },
      { name: 'any', kind: 'pulse', help: 'A pulse whenever any pulse comes in' },
      { name: 'all', kind: 'pulse', help: 'A pulse once every wired pulse has come in, then it waits for them all again' },
    ],
    defaults: { kind: 'combine', op: 'add' },
  },
  chance: {
    group: 'Values',
    title: 'Chance',
    colour: 'green',
    where: 'both',
    help: 'When a pulse arrives, each output has its own chance, like 10% or 0.0001%. Pick one gives at most one of them, Each rolls every one by itself.',
    form: 'box',
    hw: 70,
    ins: [{ name: 'roll', kind: 'pulse', help: 'Rolls the dice' }],
    outs: [],
    defaults: { kind: 'chance', chances: [10, 20, 70], pick: 'one' },
  },
  frame: {
    group: 'Logic',
    title: 'Group box',
    colour: 'grey',
    where: 'both',
    help: 'A box to keep parts together. Dragging it by its header drags everything inside it too. Name it to say what they do.',
    form: 'box',
    hw: 200,
    ins: [],
    outs: [],
    defaults: { kind: 'frame' },
  },
  storage: {
    group: 'Game',
    title: 'Storage',
    colour: 'yellow',
    where: 'both',
    help: 'A number the whole world shares, by its name, like Cash, Rubies or Score. Every Storage with the same name is the same number, wherever it is, even inside a creature.',
    form: 'box',
    hw: 72,
    ins: [
      { name: 'add', kind: 'pulse', help: 'Adds the amount' },
      { name: 'take', kind: 'pulse', help: 'Takes the amount away' },
      { name: 'set', kind: 'pulse', help: 'Sets it to the amount' },
      { name: 'amount', kind: 'value', help: 'How much. Not wired, 1' },
    ],
    outs: [
      { name: 'value', kind: 'value', help: 'What it holds' },
      { name: 'changed', kind: 'pulse', help: 'A pulse each time it changes' },
    ],
    defaults: { kind: 'storage', start: 0, shown: true },
  },
  items: {
    group: 'Game',
    title: 'Inventory',
    colour: 'orange',
    where: 'both',
    help: 'Counts one kind of item a creature is carrying, and can give or take some. Attach it to a shape and it works on what that shape holds instead, like a chest.',
    form: 'box',
    hw: 72,
    ins: [
      { name: 'give', kind: 'pulse', help: 'Adds the amount of this item' },
      { name: 'take', kind: 'pulse', help: 'Takes the amount away, if there is that much' },
      { name: 'amount', kind: 'value', help: 'How many. Not wired, 1' },
    ],
    outs: [
      { name: 'drives', kind: 'body', help: 'Drag onto a shape to make it work on what that shape holds, like a chest' },
      { name: 'count', kind: 'value', help: 'How many there are' },
      { name: 'has', kind: 'value', help: 'True if there is at least one' },
      { name: 'gained', kind: 'pulse', help: 'A pulse when the count goes up' },
      { name: 'lacked', kind: 'pulse', help: 'A pulse when Take was asked for more than there was' },
    ],
    defaults: { kind: 'items', item: 'Coin' },
  },
  mover: {
    group: 'Things',
    title: 'Mover',
    colour: 'blue',
    where: 'room',
    help: 'Moves and turns whatever you attach through keyframes when a pulse arrives, like a door sliding open or a moving platform. Record keyframes by moving the shape and pressing Add keyframe.',
    form: 'box',
    hw: 76,
    ins: [
      { name: 'play', kind: 'pulse', help: 'Plays it from where it is' },
      { name: 'back', kind: 'pulse', help: 'Plays it backwards, back to the start' },
      { name: 'stop', kind: 'pulse', help: 'Stops where it is' },
    ],
    outs: [
      { name: 'drives', kind: 'body', help: 'Drag this onto a shape' },
      { name: 'done', kind: 'pulse', help: 'A pulse when it gets to the end' },
      { name: 'moving', kind: 'value', help: 'True while it is moving' },
    ],
    defaults: { kind: 'mover', keys: [{ x: 0, y: 0, turn: 0, seconds: 0 }, { x: 0, y: -120, turn: 0, seconds: 1 }], loop: 'once' },
  },
  hurt: {
    group: 'Game',
    title: 'Health',
    colour: 'red',
    where: 'room',
    help: 'Hurts or heals whatever you attach. A shape with Health set in its properties can be hurt by creatures and Abilities, and goes when it reaches 0.',
    form: 'box',
    hw: 60,
    ins: [
      { name: 'hurt', kind: 'pulse', help: 'Takes the amount away' },
      { name: 'heal', kind: 'pulse', help: 'Gives the amount back' },
      { name: 'amount', kind: 'value', help: 'How much. Not wired, its setting' },
    ],
    outs: [
      { name: 'drives', kind: 'body', help: 'Drag this onto a shape with health' },
      { name: 'hp', kind: 'value', help: 'How much health it has left' },
    ],
    defaults: { kind: 'hurt', damage: 10 },
  },
  choice: {
    group: 'Game',
    title: 'Choice',
    colour: 'purple',
    where: 'both',
    help: 'When a pulse arrives, everything stops except the creature, who thinks it over and picks one, like a power-up. It learns which picks turn out well.',
    form: 'box',
    hw: 80,
    ins: [{ name: 'ask', kind: 'pulse', help: 'Stops everything and asks it to pick' }],
    outs: [],
    defaults: { kind: 'choice', options: ['Faster', 'Stronger', 'Heal'], seconds: 2 },
  },
  effect: {
    group: 'Game',
    title: 'Effect',
    colour: 'yellow',
    where: 'both',
    help: 'Makes a creature faster, jump higher, hit harder, take less damage or pull items in from further away, for a while or for good. They stack.',
    form: 'box',
    hw: 66,
    ins: [
      { name: 'apply', kind: 'pulse', help: 'Gives it one more' },
      { name: 'clear', kind: 'pulse', help: 'Takes them all away' },
    ],
    outs: [
      { name: 'active', kind: 'value', help: 'True while it has any' },
      { name: 'stacks', kind: 'value', help: 'How many it has' },
    ],
    defaults: { kind: 'effect', stat: 'speed', amount: 0.2, seconds: 0, most: 10 },
  },
  ability: {
    group: 'Game',
    title: 'Ability',
    colour: 'orange',
    where: 'both',
    help: 'Attacks things with Health. Inside a creature it comes from that creature. Out in the room it comes from what you attach, like a turret. With nothing wired to Fire, it fires by itself every so often.',
    form: 'box',
    hw: 70,
    ins: [
      { name: 'fire', kind: 'pulse', help: 'Fires now' },
      { name: 'on', kind: 'value', help: 'It only fires while this is true' },
      { name: 'damage', kind: 'value', help: 'How much it hurts. Not wired, its setting' },
    ],
    outs: [
      { name: 'drives', kind: 'body', help: 'Drag this onto a shape to fire from there' },
      { name: 'fired', kind: 'pulse', help: 'A pulse each time it fires' },
      { name: 'hit', kind: 'pulse', help: 'A pulse each time it hurts something' },
      { name: 'killed', kind: 'pulse', help: 'A pulse each time something it hurt goes' },
    ],
    defaults: { kind: 'ability', style: 'shoot', damage: 10, seconds: 1, count: 1, speed: 500, range: 600, tag: 'enemy', tint: 'yellow' },
  },
};

export const isSocket = (part?: Part): boolean => part?.kind === 'drive' || part?.kind === 'nerve';

// a tool can have sockets sealed inside it, so taking one out can change what's plugged into the brain
export const mayHaveSockets = (part?: Part): boolean => isSocket(part) || part?.kind === 'tool';

// whether this can go in the room, inside a creature, or both. a tool goes wherever everything inside it can.
export function whereOf(part: Part): 'both' | 'room' | 'body' {
  if (part.kind !== 'tool') return PART_INFO[part.kind].where;
  let where: 'both' | 'room' | 'body' = 'both';
  for (const inner of part.tool?.things ?? []) {
    const here = inner.part ? whereOf(inner.part) : 'room';
    if (here !== 'both') where = here;
  }
  return where;
}

// a percent written short, however small it is
export function percent(n: number): string {
  if (n >= 1 || n === 0) return `${Math.round(n * 100) / 100}%`;
  return `${Number(n.toPrecision(3))}%`;
}

// a Chance and a Choice have as many outputs as you give them, named by position so wires stay put when one changes
function portsIn(part: Part, dir: 'in' | 'out'): PortDef[] {
  if (part.kind === 'tool') return (dir === 'in' ? part.tool?.ins : part.tool?.outs) ?? [];
  if (part.kind === 'chance' && dir === 'out') {
    const outs: PortDef[] = (part.chances ?? []).map((c, i) => ({ name: `o${i + 1}`, label: percent(c), kind: 'pulse', help: `A pulse ${percent(c)} of the time` }));
    return [...outs, { name: 'none', kind: 'pulse', help: 'A pulse when none of them came up' }];
  }
  if (part.kind === 'choice' && dir === 'out') {
    const outs: PortDef[] = (part.options ?? []).map((o, i) => ({ name: `o${i + 1}`, label: o, kind: 'pulse', help: `A pulse when it picks ${o}` }));
    return [...outs, { name: 'chose', kind: 'value', help: 'The name of what it picked last' }];
  }
  return dir === 'in' ? PART_INFO[part.kind].ins : PART_INFO[part.kind].outs;
}

// the extra outputs a plain shape gets from what you've set it up as
const SHAPE_OUTS: { name: string; help: string; has: (t: ShapeFlags) => boolean }[] = [
  { name: 'touched', help: 'A pulse whenever a creature touches this', has: () => true },
  { name: 'died', help: 'A pulse when its health runs out', has: (t) => t.hp !== undefined },
  { name: 'hit', help: 'A pulse when, as an enemy, it hurts a creature', has: (t) => !!t.enemy },
  { name: 'opened', help: 'A pulse when a creature opens it and takes what is inside', has: (t) => t.holds !== undefined },
  { name: 'picked', help: 'A pulse when a creature picks it up', has: (t) => !!t.item },
];
interface ShapeFlags {
  hp?: number;
  enemy?: unknown;
  holds?: unknown;
  item?: boolean;
}

const HEADER = 20;
const ROW = 18;
const PADDING = 4;
const LETTER = 5.6; // about how wide a letter is in a port's name

// wide enough for the names on both sides, and tall enough for the longer side
export function toolSize(tool: { ins: PortDef[]; outs: PortDef[] }): { hw: number; hh: number } {
  const longest = (list: PortDef[]): number => Math.max(0, ...list.map((p) => p.name.length));
  const hw = Math.max(62, (LETTER * (longest(tool.ins) + longest(tool.outs)) + 96) / 2); // with room between them to say what's inside
  return { hw, hh: (HEADER + Math.max(1, tool.ins.length, tool.outs.length) * ROW + PADDING) / 2 };
}

// how tall a part needs to be for its ports. a Chance or Choice grows and shrinks with how many outputs it has
export function partHeight(part: Part): number {
  const kind = part.kind;
  if (kind === 'button') return PART_INFO.button.hw;
  if (kind === 'sensor') return 70;
  if (kind === 'zone') return 120;
  if (kind === 'frame') return 140;
  return (HEADER + Math.max(portsIn(part, 'in').length, portsIn(part, 'out').length) * ROW + PADDING) / 2;
}

// parts you draw out to the size you want, rather than ones that are as big as their ports need
export const sizedPart = (kind: PartKind | undefined): boolean => kind === 'sensor' || kind === 'zone' || kind === 'frame' || kind === 'button';

// big see-through areas, which you grab by the header so you can build inside them
export const areaPart = (kind: PartKind | undefined): boolean => kind === 'sensor' || kind === 'zone' || kind === 'frame';

// a new part, ready to add to the world. parts hang on the wall by default: they stay put and nothing bumps into them
export function newPart(kind: PartKind, x: number, y: number) {
  const info = PART_INFO[kind];
  return {
    name: info.title,
    form: info.form,
    colour: info.colour,
    hw: info.hw,
    hh: partHeight(info.defaults),
    x,
    y,
    fixed: true,
    solid: false,
    gravity: false,
    part: structuredClone(info.defaults),
  };
}

export interface Port extends PortDef {
  dir: 'in' | 'out';
  x: number; // where it is on the part, before rotating
  y: number;
  upright?: boolean; // stays to the right however the thing has rolled
}

// every shape has a Touched output, which sits just outside it so it never gets in the way of dragging the shape
export function portsOf(t: { part?: Part; form: Form; hw: number; hh: number; angle: number } & ShapeFlags): Port[] {
  if (!t.part) {
    const right = t.form === 'circle' ? t.hw : Math.max(...corners({ form: t.form, hw: t.hw, hh: t.hh, x: 0, y: 0, angle: t.angle }).map((p) => p.x));
    const outs = SHAPE_OUTS.filter((o) => o.has(t));
    return outs.map((o, i) => ({ name: o.name, kind: 'pulse', help: o.help, dir: 'out', x: right + 13, y: (i - (outs.length - 1) / 2) * 18, upright: true }));
  }
  const info = PART_INFO[t.part.kind];
  const ins = portsIn(t.part, 'in');
  const outs = portsIn(t.part, 'out');
  if (info.form === 'circle') {
    // around the right side of the button
    return outs.map((p, i) => {
      const a = (i - (outs.length - 1) / 2) * 0.9;
      return { ...p, dir: 'out', x: Math.cos(a) * t.hw, y: Math.sin(a) * t.hw };
    });
  }
  const place = (list: PortDef[], dir: 'in' | 'out'): Port[] =>
    list.map((p, i) => ({ ...p, dir, x: dir === 'in' ? -t.hw : t.hw, y: -t.hh + HEADER + ROW * (i + 0.5) }));
  return [...place(ins, 'in'), ...place(outs, 'out')];
}

export function portWorld(t: { x: number; y: number; angle: number }, port: { x: number; y: number; dir?: 'in' | 'out'; upright?: boolean }): { x: number; y: number; dx: number; dy: number } {
  const angle = port.upright ? 0 : t.angle;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const out = port.dir === 'in' ? -1 : 1;
  return { x: t.x + port.x * cos - port.y * sin, y: t.y + port.x * sin + port.y * cos, dx: out * cos, dy: out * sin };
}

// what kind of wire a port takes, or null if it has no such port. any thing at all can be held by a motor.
export function portKind(t: { part?: Part } & ShapeFlags, dir: 'in' | 'out', name: string): PortKind | null {
  if (dir === 'in' && name === 'body') return 'body';
  if (!t.part) return dir === 'out' && SHAPE_OUTS.some((o) => o.name === name && o.has(t)) ? 'pulse' : null;
  return portsIn(t.part, dir).find((p) => p.name === name)?.kind ?? null;
}

export function isPartKind(kind: unknown): kind is PartKind {
  return (PART_KINDS as readonly unknown[]).includes(kind);
}

export function toNumber(value: Value | null, fallback = 0): number {
  if (value === null) return fallback;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

export function toTruth(value: Value | null, fallback = false): boolean {
  if (value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return value !== '' && value.toLowerCase() !== 'false';
}

// what a player types is a number if it looks like one
export function parseValue(text: string): Value {
  const trimmed = text.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  const n = Number(trimmed);
  return trimmed !== '' && Number.isFinite(n) ? n : text;
}

export function formatValue(value: Value | null): string {
  if (value === null) return '-';
  if (typeof value === 'number') return String(Math.round(value * 100) / 100);
  return String(value);
}

const MOST_NUMBER = 1e12;
const MOST_TEXT = 200;

function number(value: unknown, fallback: number, min = -MOST_NUMBER, max = MOST_NUMBER): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, n));
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.slice(0, MOST_TEXT) : fallback;
}

// files come from other people, so only what's known and sensible gets through
export function cleanPart(raw: unknown): Part | undefined {
  const p = (raw ?? {}) as Record<string, unknown>;
  if (!isPartKind(p.kind)) return undefined;
  const kind = p.kind;
  const d = PART_INFO[kind].defaults;
  switch (kind) {
    case 'label': {
      const v = p.value;
      const value = typeof v === 'number' && Number.isFinite(v) ? number(v, 0) : typeof v === 'boolean' ? v : typeof v === 'string' ? v.slice(0, MOST_TEXT) : 0;
      const part: Part = { kind, value, locked: p.locked === true };
      if (typeof p.min === 'number' && Number.isFinite(p.min)) part.min = number(p.min, 0);
      if (typeof p.max === 'number' && Number.isFinite(p.max)) part.max = number(p.max, 0);
      return part;
    }
    case 'data':
      return { kind, base: number(p.base, d.base as number), spread: number(p.spread, 0, 0, 1e6) };
    case 'button':
      return { kind, latch: p.latch === true };
    case 'timer':
      return { kind, seconds: number(p.seconds, 1, 0, 86400) };
    case 'math':
      return { kind, op: MATH_OPS.includes(p.op as MathOp) ? (p.op as MathOp) : 'add', a: number(p.a, 0), b: number(p.b, 0) };
    case 'compare':
      return { kind, op: COMPARE_OPS.includes(p.op as CompareOp) ? (p.op as CompareOp) : 'bigger', a: number(p.a, 0), b: number(p.b, 0) };
    case 'switch':
      return { kind };
    case 'sensor':
      return { kind, tag: text(p.tag, '').slice(0, 40) };
    case 'motor':
      return {
        kind,
        mode: MOTOR_MODES.includes(p.mode as MotorMode) ? (p.mode as MotorMode) : 'push',
        direction: number(p.direction, -90, -360, 360),
        power: number(p.power, 50, -200, 200),
      };
    case 'give':
      return { kind, target: text(p.target, 'Hunger').slice(0, 40), amount: number(p.amount, -20, -1e6, 1e6) };
    case 'drive':
      return { kind, wants: WANTS.includes(p.wants as Wants) ? (p.wants as Wants) : 'high', aim: number(p.aim, 50), scale: number(p.scale, 100, 0.001, 1e9) };
    case 'nerve':
      return { kind, scale: number(p.scale, 1, 0.001, 1e9) };
    case 'action':
      return { kind, action: ACTIONS.includes(p.action as Action) ? (p.action as Action) : 'rest' };
    case 'feel':
      return { kind };
    case 'die':
    case 'where':
    case 'destroy':
    case 'show':
    case 'mouse':
    case 'goal':
    case 'start':
      return { kind };
    case 'logic':
      return { kind, op: LOGIC_OPS.includes(p.op as LogicOp) ? (p.op as LogicOp) : 'and' };
    case 'random':
      return { kind, a: number(p.a, 0), b: number(p.b, 100) };
    case 'delay':
      return { kind, seconds: number(p.seconds, 1, 0, 86400) };
    case 'zone':
      return { kind, pull: number(p.pull, 0, -5, 5), direction: number(p.direction, 90, -360, 360), tag: text(p.tag, '').slice(0, 40) };
    case 'spawner':
      return { kind, most: Math.round(number(p.most, 20, 1, 200)) };
    case 'teleport':
      return { kind, a: number(p.a, 100), b: number(p.b, 100) };
    case 'hit':
      return { kind, tag: text(p.tag, '').slice(0, 40), removes: p.removes === true };
    case 'paint':
    case 'burst':
      return { kind, tint: cleanColour(p.tint, kind === 'paint' ? 'red' : 'yellow') };
    case 'keyboard':
      return { kind, key: text(p.key, 'ArrowRight').slice(0, 20) };
    case 'camera':
      return { kind, zoom: number(p.zoom, 1, 0.05, 10) };
    case 'sound':
      return { kind, pitch: number(p.pitch, 440, 20, 8000), seconds: number(p.seconds, 0.2, 0.01, 5) };
    case 'say':
    case 'hear':
      return { kind, word: text(p.word, 'hello').slice(0, 24) };
    case 'combine':
      return { kind, op: COMBINE_OPS.includes(p.op as CombineOp) ? (p.op as CombineOp) : 'add' };
    case 'chance': {
      const list = Array.isArray(p.chances) ? p.chances.slice(0, MOST_CHANCES).map((c) => number(c, 0, 0, 100)) : [50];
      return { kind, chances: list.length ? list : [50], pick: CHANCE_PICKS.includes(p.pick as ChancePick) ? (p.pick as ChancePick) : 'one' };
    }
    case 'frame':
      return { kind };
    case 'storage':
      return { kind, start: number(p.start, 0), shown: p.shown !== false };
    case 'items':
      return { kind, item: text(p.item, 'Coin').slice(0, 40) };
    case 'mover': {
      const keys = Array.isArray(p.keys) ? p.keys.slice(0, MOST_KEYS).map(cleanKey) : [];
      const part: Part = { kind, keys: keys.length >= 2 ? keys : structuredClone(d.keys), loop: LOOPS.includes(p.loop as Loop) ? (p.loop as Loop) : 'once' };
      const o = p.origin as Record<string, unknown> | undefined;
      if (o && typeof o === 'object') part.origin = { x: number(o.x, 0), y: number(o.y, 0), angle: number(o.angle, 0, -100, 100) };
      return part;
    }
    case 'hurt':
      return { kind, damage: number(p.damage, 10, 0, 1e6) };
    case 'choice': {
      const options = Array.isArray(p.options) ? p.options.filter((o): o is string => typeof o === 'string').slice(0, MOST_OPTIONS).map((o) => o.slice(0, 24)) : [];
      return { kind, options: options.length >= 2 ? options : ['Left', 'Right'], seconds: number(p.seconds, 2, 0.2, 10) };
    }
    case 'effect':
      return { kind, stat: EFFECT_STATS.includes(p.stat as EffectStat) ? (p.stat as EffectStat) : 'speed', amount: number(p.amount, 0.2, -10, 10), seconds: number(p.seconds, 0, 0, 86400), most: Math.round(number(p.most, 10, 1, 999)) };
    case 'ability':
      return {
        kind,
        style: ABILITY_STYLES.includes(p.style as AbilityStyle) ? (p.style as AbilityStyle) : 'shoot',
        damage: number(p.damage, 10, 0, 1e6),
        seconds: number(p.seconds, 1, 0.05, 600),
        count: Math.round(number(p.count, 1, 1, 24)),
        speed: number(p.speed, 500, 20, 3000),
        range: number(p.range, 600, 20, 5000),
        tag: text(p.tag, 'enemy').slice(0, 40),
        tint: cleanColour(p.tint, 'yellow'),
      };
    case 'tool':
      return undefined; // what's inside one needs checking too, which room-file.ts does
  }
}

function cleanKey(raw: unknown): Key {
  const k = (raw ?? {}) as Record<string, unknown>;
  return { x: number(k.x, 0, -1e5, 1e5), y: number(k.y, 0, -1e5, 1e5), turn: number(k.turn, 0, -3600, 3600), seconds: number(k.seconds, 1, 0, 3600) };
}

export function cleanColour(value: unknown, fallback: Colour): Colour {
  return COLOURS.includes(value as Colour) ? (value as Colour) : fallback;
}
