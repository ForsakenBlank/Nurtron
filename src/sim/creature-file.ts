// .nurt files: one creature, ready to send to a friend. it holds its brain, its body circuit, its look and its age.
// as with every file, this is only data, so a stranger's creature can't do anything except be a creature.
import { ACTIONS, needsTarget } from './brain.ts';
import type { Brain, Concept, Effect } from './brain.ts';
import { cleanFamily, cleanGenes } from './family.ts';
import type { Kin } from './family.ts';
import { cleanLook } from './look.ts';
import type { Look } from './look.ts';
import { cleanRoom, number, parseFile } from './room-file.ts';
import { COLOURS, NEARNESS, SHAPES, SIZES } from './senses.ts';
import type { Colour, Nearness, Percept, Shape, Size } from './senses.ts';
import type { Creature, RoomData, World } from './world.ts';

const FILE_TYPE = 'nurtron-creature';
const FILE_VERSION = 1;
const MOST_CHANNELS = 24;
const MOST_CONCEPTS = 256;
const MOST_NAME = 40;
const MOST_EFFECTS = 48;

export type SavedBrain = ReturnType<Brain['save']>;

export interface CreatureData {
  name: string;
  look: Look;
  hatching: number; // ticks until it hatches
  age: number; // ticks since it hatched or was laid
  brain: SavedBrain;
  body: RoomData;
  uid: string;
  parents: string[];
  generation: number;
  family: Kin[]; // everyone it came from
  dead: boolean;
  deaths: number;
  lastDeath: string | null;
}

// short-term memories are left out: they say "what i did a moment ago", and a moment ago it was somewhere else.
// so are the places it likes and dislikes, which are spots in this room, and the recent moments it goes over while
// resting. what makes what appear goes with it, since that's about kinds of things, not where they were.
// when it last used a concept is kept as how long ago, since a tick only means something inside one world.
export function creatureData(world: World, c: Creature = world.creature): CreatureData {
  const brain = c.brain.save();
  return {
    name: c.name,
    look: c.look,
    hatching: c.hatching,
    age: world.tick - c.bornTick,
    brain: { ...brain, traces: [], episodes: [], places: [], concepts: brain.concepts.map((concept) => ({ ...concept, lastUsed: world.tick - concept.lastUsed })) },
    body: world.bodyData(c),
    uid: c.uid,
    parents: world.family[c.uid]?.parents ?? [],
    generation: world.family[c.uid]?.generation ?? 0,
    family: world.familyOf(c),
    dead: c.dead,
    deaths: c.deaths,
    lastDeath: c.lastDeath,
  };
}

export function saveCreature(world: World, c: Creature = world.creature): string {
  return JSON.stringify({ type: FILE_TYPE, version: FILE_VERSION, ...creatureData(world, c) });
}

export function parseCreature(text: string): CreatureData {
  return cleanCreature(parseFile(text, FILE_TYPE, FILE_VERSION, 'creature'));
}

// throws an Error with a message fit to show the player if it can't be made into a working creature
export function cleanCreature(raw: unknown): CreatureData {
  const file = (raw ?? {}) as Record<string, unknown>;
  const name = typeof file.name === 'string' && file.name.trim() ? file.name.slice(0, MOST_NAME) : 'Nurt';
  return {
    name,
    look: cleanLook(file.look),
    hatching: number(file.hatching, 0, 0, 3600),
    age: number(file.age, 0, 0, 1e12),
    brain: cleanBrain(file.brain),
    body: cleanRoom(file.body, 'body'),
    uid: typeof file.uid === 'string' ? file.uid.slice(0, 40) : '',
    parents: (Array.isArray(file.parents) ? file.parents : []).filter((p): p is string => typeof p === 'string' && p.length <= 40).slice(0, 2),
    generation: Math.round(number(file.generation, 0, 0, 1e6)),
    family: cleanFamily(file.family),
    dead: file.dead === true,
    deaths: Math.round(number(file.deaths, 0, 0, 1e9)),
    lastDeath: typeof file.lastDeath === 'string' ? file.lastDeath.slice(0, 300) : null,
  };
}

function cleanPercept(raw: unknown): Percept | null {
  const p = (raw ?? {}) as Record<string, unknown>;
  if (!SHAPES.includes(p.shape as Shape) || !COLOURS.includes(p.colour as Colour) || !SIZES.includes(p.size as Size) || !NEARNESS.includes(p.near as Nearness)) return null;
  return { shape: p.shape as Shape, colour: p.colour as Colour, size: p.size as Size, moving: p.moving === true, near: p.near as Nearness };
}

const DAMAGED = "That creature's brain is damaged, so it can't be opened.";

function numbers(raw: unknown, length: number, min: number, max: number): number[] {
  if (!Array.isArray(raw) || raw.length !== length) throw new Error(DAMAGED);
  return raw.map((v) => number(v, 0, min, max));
}

function cleanBrain(raw: unknown): SavedBrain {
  const b = (raw ?? {}) as Record<string, unknown>;
  if (!Array.isArray(b.driveNames) || !Array.isArray(b.concepts) || b.concepts.length === 0) throw new Error(DAMAGED);
  if (b.driveNames.length > MOST_CHANNELS || b.concepts.length > MOST_CONCEPTS) throw new Error(DAMAGED);
  const driveNames = b.driveNames.map((n) => (typeof n === 'string' ? n.slice(0, MOST_NAME) : ''));
  // the channels are found again by name, so two of the same name would leave one that can never be reached
  if (driveNames.some((n) => !n) || new Set(driveNames).size !== driveNames.length) throw new Error(DAMAGED);
  const channels = driveNames.length + 1;
  const concepts: Concept[] = b.concepts.map((one, i) => {
    const c = (one ?? {}) as Record<string, unknown>;
    // the first one is always the concept of itself, and every other one is about something it has seen
    const percept = i === 0 ? null : cleanPercept(c.percept);
    if (i > 0 && !percept) throw new Error(DAMAGED);
    return {
      percept,
      w: numbers(c.w, ACTIONS.length * channels, -1, 1),
      tries: numbers(c.tries, ACTIONS.length, 0, 1e9),
      uses: number(c.uses, 0, 0, 1e12),
      lastUsed: number(c.lastUsed, 0, 0, 1e12),
    };
  });
  const list = (rawList: unknown, fallback: (i: number) => string): string[] =>
    driveNames.map((_, i) => {
      const v = Array.isArray(rawList) ? rawList[i] : null;
      return typeof v === 'string' ? v.slice(0, MOST_NAME) : fallback(i);
    });
  return {
    genes: cleanGenes(b.genes),
    driveNames,
    kinds: list(b.kinds, () => 'drive').map((k) => (k === 'nerve' ? 'nerve' : 'drive')),
    whens: list(b.whens, () => 'low'),
    concepts,
    traces: [],
    decisions: number(b.decisions, 0, 0, 1e12),
    boredom: number(b.boredom, 0, 0, 1),
    mood: number(b.mood, 0, -1, 1),
    episodes: [],
    places: [],
    effects: cleanEffects(b.effects),
  };
}

// anything that isn't a whole, sensible link between two kinds of thing is left out, rather than the creature refused,
// since a creature from before milestone 8 has none at all
function cleanEffects(raw: unknown): Effect[] {
  if (!Array.isArray(raw)) return [];
  const effects: Effect[] = [];
  for (const one of raw.slice(0, MOST_EFFECTS)) {
    const e = (one ?? {}) as Record<string, unknown>;
    const cause = cleanPercept(e.cause);
    const effect = cleanPercept(e.effect);
    const action = e.action;
    if (!cause || !effect || typeof action !== 'number' || !Number.isInteger(action) || !ACTIONS[action] || !needsTarget(ACTIONS[action])) continue;
    effects.push({ cause, action, effect, strength: number(e.strength, 0, 0, 1) });
  }
  return effects;
}
