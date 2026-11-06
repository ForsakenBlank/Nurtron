// trials: a room built to test a creature, with a Goal part that says when it's solved. send one to a friend and they drop
// their creature in. nothing is scripted, so every solution really is learned.
import { cleanRoom, parseFile } from './room-file.ts';
import type { RoomData, World } from './world.ts';

const FILE_TYPE = 'nurtron-trial';
const FILE_VERSION = 1;

export interface TrialData {
  name: string;
  about: string;
  room: RoomData;
}

export function saveTrial(world: World, name: string, about: string): string {
  return JSON.stringify({ type: FILE_TYPE, version: FILE_VERSION, name: name.slice(0, 40), about: about.slice(0, 200), room: world.roomForFile() });
}

export function parseTrial(text: string): TrialData {
  const file = parseFile(text, FILE_TYPE, FILE_VERSION, 'Trial');
  const room = cleanRoom(file.room, 'room');
  if (room.things.length === 0) throw new Error('That Trial has nothing in it.');
  return { name: typeof file.name === 'string' && file.name.trim() ? file.name.slice(0, 40) : 'A Trial', about: typeof file.about === 'string' ? file.about.slice(0, 200) : '', room };
}
