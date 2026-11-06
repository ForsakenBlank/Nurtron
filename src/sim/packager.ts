// the Packager: turns a selection into your own tool, with the inputs and outputs you choose. the parts get sealed
// inside one box. shapes, buttons and sensors stay out where they can be seen and touched, wired to the box.
import { newPart, portsOf, toolSize, whereOf } from './parts.ts';
import type { PortKind, ToolPort } from './parts.ts';
import { cleanRoom, parseFile, SEALABLE } from './room-file.ts';
import type { Place } from './room-file.ts';
import type { RoomData, Thing, ThingSpec, World } from './world.ts';

const FILE_TYPE = 'nurtron-tool';
const FILE_VERSION = 1;
const MOST_NAME = 30;

export interface PackagedTool {
  name: string;
  room: RoomData;
}

// a socket the player could put on the outside of the tool
export interface PortChoice {
  thingId: number;
  port: string;
  dir: 'in' | 'out';
  kind: PortKind;
  name: string;
  help: string;
  needed: boolean; // something staying outside the box is wired to it, so it has to be there
  wanted: boolean; // ticked to begin with
}

const sealed = (t: Thing): boolean => !!t.part && SEALABLE.has(t.part.kind);

// all the sockets it could have, with sensible ones already ticked
export function portChoices(world: World, ids: Iterable<number>): PortChoice[] {
  const picked = new Set(ids);
  const things = world.things.filter((t) => picked.has(t.id));
  const inside = new Set(things.filter(sealed).map((t) => t.id));
  const choices: PortChoice[] = [];
  for (const t of things) {
    if (!inside.has(t.id)) continue;
    for (const port of portsOf(t)) {
      const wires = world.wires.filter((w) => (port.dir === 'in' ? w.to === t.id && w.in === port.name : w.from === t.id && w.out === port.name));
      const others = wires.map((w) => (port.dir === 'in' ? w.from : w.to));
      const fromInside = others.some((id) => inside.has(id));
      // a value input only takes one wire, so one already wired up inside has no room for another
      if (port.dir === 'in' && port.kind === 'value' && fromInside) continue;
      const needed = others.some((id) => picked.has(id) && !inside.has(id));
      const wiredElsewhere = others.some((id) => !picked.has(id));
      // what a label holds is usually the whole point, even if it's used inside as well
      const unused = (wires.length === 0 && (port.dir === 'out' || port.kind === 'pulse')) || (t.part?.kind === 'label' && port.dir === 'out');
      choices.push({ thingId: t.id, port: port.name, dir: port.dir, kind: port.kind, name: port.name, help: port.help, needed, wanted: needed || wiredElsewhere || unused });
    }
  }
  // names on the same side have to differ, and "value" means nothing when there are five of them
  for (const dir of ['in', 'out'] as const) {
    const side = choices.filter((c) => c.dir === dir);
    for (const choice of side) {
      if (side.filter((c) => c.port === choice.port).length < 2) continue;
      const owner = things.find((t) => t.id === choice.thingId) as Thing;
      choice.name = `${owner.name} ${choice.port}`.slice(0, 20);
    }
    const seen = new Set<string>();
    for (const choice of side) {
      let name = choice.name;
      for (let i = 2; seen.has(name); i++) name = `${choice.name.slice(0, 17)} ${i}`;
      choice.name = name;
      seen.add(name);
    }
  }
  return choices;
}

// null if there's nothing to package. everything comes out measured from its own top left corner, ready to be placed anywhere.
export function packageTool(world: World, ids: Iterable<number>, name: string, choices: PortChoice[]): PackagedTool | null {
  const picked = new Set(ids);
  const things = world.things.filter((t) => picked.has(t.id));
  if (things.length === 0) return null;
  const room = world.roomData(picked);
  const inside = things.map(sealed);
  const insideCount = inside.filter(Boolean).length;
  const outside = room.things.filter((_, i) => !inside[i]);
  const outsideAt = new Map<number, number>();
  const insideAt = new Map<number, number>();
  things.forEach((t, i) => (inside[i] ? insideAt.set(t.id, insideAt.size) : outsideAt.set(t.id, outsideAt.size)));
  const idAt = things.map((t) => t.id);

  const boxAt = outside.length;
  const wires: RoomData['wires'] = [];
  const innerWires: RoomData['wires'] = [];
  const ins: ToolPort[] = [];
  const outs: ToolPort[] = [];
  const chosen = choices.filter((c) => c.wanted || c.needed);
  for (const c of chosen) {
    const at = insideAt.get(c.thingId);
    if (at === undefined) continue;
    (c.dir === 'in' ? ins : outs).push({ name: c.name.trim().slice(0, 20) || c.port, kind: c.kind, help: c.help, thing: at, port: c.port });
  }
  const socketName = (thingId: number, port: string, dir: 'in' | 'out'): string | undefined => {
    const at = insideAt.get(thingId);
    return (dir === 'in' ? ins : outs).find((p) => p.thing === at && p.port === port)?.name;
  };
  for (const w of room.wires) {
    const fromId = idAt[w.from];
    const toId = idAt[w.to];
    const fromInside = insideAt.has(fromId);
    const toInside = insideAt.has(toId);
    if (fromInside && toInside) {
      innerWires.push({ from: insideAt.get(fromId) as number, out: w.out, to: insideAt.get(toId) as number, in: w.in });
      continue;
    }
    const out = fromInside ? socketName(fromId, w.out, 'out') : w.out;
    const into = toInside ? socketName(toId, w.in, 'in') : w.in;
    if (out !== undefined && into !== undefined) wires.push({ from: fromInside ? boxAt : (outsideAt.get(fromId) as number), out, to: toInside ? boxAt : (outsideAt.get(toId) as number), in: into });
  }

  const final = [...outside];
  if (insideCount > 0) {
    const members = room.things.filter((_, i) => inside[i]);
    const middleX = members.reduce((s, t) => s + t.x, 0) / members.length;
    const middleY = members.reduce((s, t) => s + (t.y ?? 0), 0) / members.length;
    const tool = {
      things: members.map((t) => ({ ...t, x: t.x - middleX, y: (t.y ?? 0) - middleY })),
      wires: innerWires,
      ins,
      outs,
    };
    const box: ThingSpec = { ...newPart('tool', middleX, middleY), name: name.slice(0, MOST_NAME), ...toolSize(tool), part: { kind: 'tool', tool }, inBody: things[0].inBody };
    final.push(box);
  }

  const left = Math.min(...final.map((t) => t.x - t.hw));
  const top = Math.min(...final.map((t) => (t.y ?? 0) - t.hh));
  return {
    name: name.slice(0, MOST_NAME),
    room: { things: final.map((t) => ({ ...t, x: t.x - left, y: (t.y ?? 0) - top })), wires, textures: room.textures },
  };
}

// where a tool can be placed: anything that isn't a part needs a room to be in
export function toolPlace(tool: PackagedTool): Place | 'both' {
  let place: Place | 'both' = 'both';
  for (const t of tool.room.things) {
    const here = t.part ? whereOf(t.part) : 'room';
    if (here !== 'both') place = here;
  }
  return place;
}

export function saveTool(tool: PackagedTool): string {
  return JSON.stringify({ type: FILE_TYPE, version: FILE_VERSION, name: tool.name, place: toolPlace(tool), room: tool.room });
}

export function parseTool(text: string): PackagedTool {
  const file = parseFile(text, FILE_TYPE, FILE_VERSION, 'tool');
  const name = typeof file.name === 'string' && file.name.trim() ? file.name.trim().slice(0, MOST_NAME) : 'Tool';
  // a tool made inside a creature can have sockets in it, which a room file could never bring in. it says which it is,
  // but that only decides what's let through: nothing in it can do more than the same parts placed by hand.
  const room = cleanRoom(file.room, file.place === 'body' ? 'body' : 'room');
  if (room.things.length === 0) throw new Error("That tool has nothing in it.");
  return { name, room: { ...room, things: room.things.map(({ inBody: _inBody, ...t }) => t) } };
}

