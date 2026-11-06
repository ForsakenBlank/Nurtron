// world files: a room and whoever lives in it, all in one file, so you can hand someone the whole thing.
import { cleanCreature, creatureData } from './creature-file.ts';
import type { CreatureData } from './creature-file.ts';
import { cleanRoom, parseFile } from './room-file.ts';
import { MOST_CREATURES, World } from './world.ts';
import type { RoomData } from './world.ts';

const FILE_TYPE = 'nurtron-world';
const FILE_VERSION = 1;

export interface WorldData {
  room: RoomData;
  creatures: CreatureData[];
}

export function saveWorld(world: World): string {
  return JSON.stringify({ type: FILE_TYPE, version: FILE_VERSION, room: world.roomForFile(), creatures: world.creatures.map((c) => creatureData(world, c)) });
}

export function parseWorld(text: string): WorldData {
  const file = parseFile(text, FILE_TYPE, FILE_VERSION, 'world');
  const list = Array.isArray(file.creatures) ? file.creatures.slice(0, MOST_CREATURES) : [];
  if (list.length === 0) throw new Error('That world has nobody in it.');
  return { room: cleanRoom(file.room, 'room'), creatures: list.map(cleanCreature) };
}

// the whole world from a file, with only who the file says is in it
export function openWorld(data: WorldData, seed: number): World {
  const world = new World({ seed, room: data.room, size: data.room.size, things: [], body: 'blank' });
  const placeholder = world.creature;
  data.creatures.forEach((creature, i) => world.adoptCreature(creature, i === 0 ? placeholder : undefined));
  world.focusOn(world.creatures[0].id);
  return world;
}
