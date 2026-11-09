// room files: everything built in a room, without the creature, so opening one never costs you your creature.
// files come from other people, so a file is only ever data, and everything in it is checked before use.
import { cleanColour, cleanPart, PART_INFO, portKind, toolSize, whereOf } from './parts.ts';
import type { Part, PartKind, ToolPort } from './parts.ts';
import { cleanEnemy, cleanHolds } from './game.ts';
import { DECOR_IDS } from './decor.ts';
import { FORMS } from './shapes.ts';
import type { Form } from './shapes.ts';
import { textureId, usableTexture } from './textures.ts';
import { PROPERTY_DEFAULTS, ROOM, SIZE_RANGE } from './world.ts';
import type { RoomData, ThingSpec, World } from './world.ts';

const FILE_TYPE = 'nurtron-room';
const FILE_VERSION = 3; // version 1 had no wires, and version 2 had no tools or pictures
const MOST_THINGS = 2000;
const MOST_WIRES = 8000;
const MOST_TAGS = 12;
const MOST_INSIDE_A_TOOL = 200;
const MOST_TOOL_PORTS = 24;
const MOST_TEXTURES = 200;
export const MOST_FILE_TEXT = 40_000_000; // nothing real comes close to this, and it stops a giant file before it's read
// half a thing's width or height. big enough for a whole floor or wall in one piece
export const SIZE_LIMITS = { min: 2, max: 20000 };

// which side of the wall something belongs on: out in the room, or inside a creature
export type Place = 'room' | 'body';

// what can be sealed inside a tool. anything you need to see or get at, like a shape or a button, has to stay out here
export const SEALABLE: ReadonlySet<PartKind> = new Set<PartKind>(['label', 'data', 'timer', 'math', 'compare', 'switch', 'motor', 'give', 'drive', 'nerve', 'action', 'feel', 'die', 'logic', 'random', 'delay', 'spawner', 'destroy', 'teleport', 'where', 'hit', 'show', 'paint', 'keyboard', 'mouse', 'camera', 'sound', 'hear', 'goal', 'combine', 'chance', 'storage', 'items', 'mover', 'hurt', 'choice', 'effect', 'ability']);

export function saveRoom(world: World): string {
  return JSON.stringify({ type: FILE_TYPE, version: FILE_VERSION, ...world.roomForFile() }, null, 1);
}

// throws an Error with a message fit to show the player if the file isn't usable
export function parseRoom(text: string): RoomData {
  const file = parseFile(text, FILE_TYPE, FILE_VERSION, 'room');
  if (!Array.isArray(file.things)) throw new Error("That file isn't a Nurtron room.");
  return cleanRoom(file, 'room');
}

// the checks every kind of Nurtron file starts with. anything can come in, and only an object of the right type gets out
export function parseFile(text: string, type: string, version: number, what: string): Record<string, unknown> {
  const wrong = `That file isn't a Nurtron ${what}.`;
  if (text.length > MOST_FILE_TEXT) throw new Error(`That ${what} file is too big to open.`);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(wrong);
  }
  const file = data as Record<string, unknown> | null;
  if (!file || typeof file !== 'object' || file.type !== type) throw new Error(wrong);
  if (typeof file.version !== 'number' || file.version > version) throw new Error(`That ${what} was made with a newer version of Nurtron.`);
  return file;
}

// a set of things and wires from a file. anything that can't go in this place gets dropped, with the wires kept straight
export function cleanRoom(raw: unknown, place: Place): RoomData {
  const file = (raw ?? {}) as { things?: unknown; wires?: unknown; textures?: unknown; size?: unknown; gravity?: unknown };
  const list = Array.isArray(file.things) ? file.things : [];
  if (list.length > MOST_THINGS) throw new Error(`That has more than ${MOST_THINGS} things in it.`);
  const wires = Array.isArray(file.wires) ? file.wires : [];
  if (wires.length > MOST_WIRES) throw new Error(`That has more than ${MOST_WIRES} wires in it.`);
  const moved = new Map<number, number>();
  const things: ThingSpec[] = [];
  let total = 0;
  list.forEach((one, i) => {
    const spec = cleanThing(one, place);
    if (!spec) return;
    moved.set(i, things.length);
    things.push(spec);
    total += 1 + (spec.part?.tool?.things.length ?? 0);
  });
  if (total > MOST_THINGS) throw new Error(`That has more than ${MOST_THINGS} things in it, counting what's inside its tools.`);
  // a build area belongs to a thing by position, so it follows anything that got dropped. one whose thing isn't there,
  // or isn't a plain thing out in the room, comes out into the room instead
  for (const spec of things) {
    if (spec.area === undefined) continue;
    const at = moved.get(spec.area);
    if (at === undefined || things[at].area !== undefined || things[at].part || !spec.part) delete spec.area;
    else spec.area = at;
  }
  const room: RoomData = { things, wires: keepWires(wires, moved), textures: cleanTextures(file.textures) };
  const size = file.size as { width?: unknown; height?: unknown } | undefined;
  if (size && typeof size === 'object') {
    room.size = { width: number(size.width, ROOM.width, SIZE_RANGE.minWidth, SIZE_RANGE.maxWidth), height: number(size.height, ROOM.height, SIZE_RANGE.minHeight, SIZE_RANGE.maxHeight) };
  }
  const gravity = file.gravity as { strength?: unknown; direction?: unknown } | undefined;
  if (gravity && typeof gravity === 'object') room.gravity = { strength: number(gravity.strength, 1, -5, 5), direction: number(gravity.direction, 90, -360, 360) };
  return room;
}

// wires go by position, so they have to follow anything that got dropped. only their shape is checked here:
// whether one joins two real ports gets checked when it's connected.
function keepWires(raw: unknown[], moved: Map<number, number>): RoomData['wires'] {
  const wires: RoomData['wires'] = [];
  for (const one of raw) {
    const w = cleanWire(one);
    if (!w) continue;
    const from = moved.get(w.from);
    const to = moved.get(w.to);
    if (from !== undefined && to !== undefined) wires.push({ ...w, from, to });
  }
  return wires;
}

// only pictures that really are pictures get through, filed under what's actually in them
export function cleanTextures(raw: unknown): Record<string, string> {
  const clean: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return clean;
  for (const data of Object.values(raw).slice(0, MOST_TEXTURES)) if (usableTexture(data)) clean[textureId(data)] = data;
  return clean;
}

export function number(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, n));
}

function cleanWire(raw: unknown): RoomData['wires'][number] | null {
  const w = (raw ?? {}) as Record<string, unknown>;
  if (!Number.isInteger(w.from) || !Number.isInteger(w.to) || typeof w.out !== 'string' || typeof w.in !== 'string') return null;
  return { from: w.from as number, out: w.out.slice(0, 20), to: w.to as number, in: w.in.slice(0, 20) };
}

// whatever a tool says about itself gets worked out again from what's really inside it
function cleanTool(raw: Record<string, unknown>, place: Place): Part | undefined {
  const tool = (raw.tool ?? {}) as Record<string, unknown>;
  const list = Array.isArray(tool.things) ? tool.things : [];
  if (list.length > MOST_INSIDE_A_TOOL) throw new Error(`That has a tool with more than ${MOST_INSIDE_A_TOOL} parts inside it.`);
  const moved = new Map<number, number>();
  const things: ThingSpec[] = [];
  list.forEach((one, i) => {
    const part = (one as { part?: { kind?: unknown } } | null)?.part;
    if (!SEALABLE.has(part?.kind as PartKind)) return;
    const spec = cleanThing(one, place);
    if (!spec?.part) return; // it had to go, because it doesn't belong in this place
    delete spec.area;
    moved.set(i, things.length);
    things.push(spec);
  });
  if (things.length === 0) return undefined;
  const ports = (rawPorts: unknown, dir: 'in' | 'out'): ToolPort[] => {
    const clean: ToolPort[] = [];
    for (const one of (Array.isArray(rawPorts) ? rawPorts : []).slice(0, MOST_TOOL_PORTS)) {
      const p = (one ?? {}) as Record<string, unknown>;
      const thing = moved.get(p.thing as number);
      const name = typeof p.name === 'string' ? p.name.trim().slice(0, 20) : '';
      if (thing === undefined || !name || typeof p.port !== 'string' || clean.some((c) => c.name === name)) continue;
      const kind = portKind(things[thing], dir, p.port);
      if (kind) clean.push({ name, kind, help: typeof p.help === 'string' ? p.help.slice(0, 120) : name, thing, port: p.port });
    }
    return clean;
  };
  return { kind: 'tool', tool: { things, wires: keepWires(Array.isArray(tool.wires) ? tool.wires : [], moved), ins: ports(tool.ins, 'in'), outs: ports(tool.outs, 'out') } };
}

function cleanThing(raw: unknown, place: Place): ThingSpec | null {
  const t = (raw ?? {}) as Record<string, unknown>;
  const rawPart = t.part as Record<string, unknown> | undefined;
  const part = rawPart?.kind === 'tool' ? cleanTool(rawPart, place) : cleanPart(t.part);
  // only parts make sense inside a creature, since nothing in there has a place in the room
  if (place === 'body' && !part) return null;
  const hw = number(t.hw, part ? PART_INFO[part.kind].hw : 20, SIZE_LIMITS.min, SIZE_LIMITS.max);
  const spec: ThingSpec = {
    name: typeof t.name === 'string' ? t.name.slice(0, 40) : 'Shape',
    form: FORMS.includes(t.form as Form) ? (t.form as Form) : 'box',
    colour: cleanColour(t.colour, 'grey'),
    hw,
    hh: number(t.hh, hw, SIZE_LIMITS.min, SIZE_LIMITS.max),
    x: number(t.x, ROOM.width / 2, -SIZE_RANGE.maxWidth, SIZE_RANGE.maxWidth),
    y: typeof t.y === 'number' ? number(t.y, 0, -SIZE_RANGE.maxHeight, SIZE_RANGE.maxHeight) : undefined,
    angle: number(t.angle, PROPERTY_DEFAULTS.angle, -Math.PI * 4, Math.PI * 4),
    gravity: typeof t.gravity === 'boolean' ? t.gravity : PROPERTY_DEFAULTS.gravity,
    fixed: typeof t.fixed === 'boolean' ? t.fixed : PROPERTY_DEFAULTS.fixed,
    solid: typeof t.solid === 'boolean' ? t.solid : PROPERTY_DEFAULTS.solid,
    bounce: number(t.bounce, PROPERTY_DEFAULTS.bounce, 0, 1),
    friction: number(t.friction, PROPERTY_DEFAULTS.friction, 0, 1),
    weight: number(t.weight, PROPERTY_DEFAULTS.weight, 0.1, 10),
  };
  if (spec.form === 'circle') spec.hh = spec.hw;
  const give = t.give as { drive?: unknown; amount?: unknown } | undefined;
  if (give && typeof give.drive === 'string') {
    spec.give = { drive: give.drive.slice(0, 40), amount: number(give.amount, 0, -100, 100) };
  }
  if (t.eaten === true) spec.eaten = true;
  if (t.climbable === true) spec.climbable = true;
  if (typeof t.stat === 'string') spec.stat = t.stat.slice(0, 20);
  if (t.hidden === true) spec.hidden = true;
  if (typeof t.respawnSeconds === 'number') spec.respawnSeconds = number(t.respawnSeconds, 10, 1, 600);
  if (Array.isArray(t.tags)) {
    const tags = t.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, MOST_TAGS).map((tag) => tag.slice(0, 40));
    if (tags.length) spec.tags = tags;
  }
  if (typeof t.texture === 'string' && /^t[a-z0-9]{1,20}$/.test(t.texture)) spec.texture = t.texture;
  if (t.ignored === true) spec.ignored = true;
  if (typeof t.label === 'string' && t.label.trim()) spec.label = t.label.slice(0, 60);
  if (typeof t.decor === 'string' && DECOR_IDS.has(t.decor)) spec.decor = t.decor;
  if (place !== 'body') {
    if (t.item === true) spec.item = true;
    if (typeof t.hp === 'number' && Number.isFinite(t.hp)) spec.hp = number(t.hp, 100, 1, 1e9);
    const enemy = cleanEnemy(t.enemy);
    if (enemy) spec.enemy = enemy;
    const holds = cleanHolds(t.holds);
    if (holds) spec.holds = holds;
    // a build area goes by position in the file, which gets checked once everything is in
    if (Number.isInteger(t.area) && (t.area as number) >= 0) spec.area = t.area as number;
  }
  // what belongs inside a creature can't come in from a room file, and a room file can't say what's inside one.
  // the same goes the other way, for things that only work out in the room.
  if (part) {
    const where = whereOf(part);
    if (where === 'both' || where === place) spec.part = part;
    else if (place === 'body') return null;
  }
  if (spec.part?.kind === 'tool' && spec.part.tool) {
    const { hw: toolW, hh: toolH } = toolSize(spec.part.tool);
    spec.hw = toolW;
    spec.hh = toolH;
    spec.form = 'box';
  }
  // the room says what's inside the creature only when a creature file asks it to
  if (place === 'body') spec.inBody = true;
  return spec;
}
