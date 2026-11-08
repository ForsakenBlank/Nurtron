// the room and everything in it. nothing here knows about graphics, so it can run with no window,
// thousands of times faster than real time.
import { ACTIONS, Brain, needsTarget } from './brain.ts';
import type { Action, Decision, Genes, PlanStep } from './brain.ts';
import { Circuit } from './circuit.ts';
import type { CreatureData } from './creature-file.ts';
import type { Live, Wire } from './circuit.ts';
import { STAT_INFO, STATS, statBlock, statSpot, starterBody } from './examples.ts';
import type { StatId } from './examples.ts';
import { ancestors, babyName, cleanFamily, mixGenes, mixLooks, stageOf } from './family.ts';
import type { Kin } from './family.ts';
import { cleanLook, DEFAULT_LOOK } from './look.ts';
import type { Look } from './look.ts';
import { isSocket, mayHaveSockets, toNumber } from './parts.ts';
import type { Part, Value, Wants } from './parts.ts';
import { JUMP_RISE, LEAP_SPEED, planRoute } from './navigate.ts';
import type { Ledge, RouteStep } from './navigate.ts';
import { BODY, GRAVITY, Physics } from './physics.ts';
import { Rng } from './rng.ts';
import { colourFamily, nearnessOf, sizeOf } from './senses.ts';
import type { Colour, Percept, Shape } from './senses.ts';
import { areaOf, boundingRadius, closestPoint, containsPoint } from './shapes.ts';
import type { Form } from './shapes.ts';
import { MOST_TEXTURE_TEXT, textureId, usableTexture } from './textures.ts';

export { initPhysics } from './physics.ts';

export const TICKS_PER_SECOND = 30;
export const ROOM = { width: 2000, height: 1000, floor: 940 };
const CENTRE = ROOM.width / 2;
// a world can be any size in here. ROOM stays the size of the inside of a creature, and what brains get tested in.
export const SIZE_RANGE = { minWidth: 1000, maxWidth: 40000, minHeight: 600, maxHeight: 10000 };
const FLOOR_DEPTH = ROOM.height - ROOM.floor;
export interface RoomSize {
  width: number;
  height: number;
  floor: number;
}
function roomSize(want?: { width: number; height: number }): RoomSize {
  const width = Math.round(Math.max(SIZE_RANGE.minWidth, Math.min(SIZE_RANGE.maxWidth, want?.width ?? ROOM.width)));
  const height = Math.round(Math.max(SIZE_RANGE.minHeight, Math.min(SIZE_RANGE.maxHeight, want?.height ?? ROOM.height)));
  return { width, height, floor: height - FLOOR_DEPTH };
}
const DT = 1 / TICKS_PER_SECOND;
const WALK_SPEED = 130;
const SAVE_VERSION = 10;
export const MOST_CREATURES = 20;
const BABY_REST = 5 * 60 * TICKS_PER_SECOND; // a parent has to wait this long before having another
const HATCH_SECONDS = 4;
const SENSE_RANGE = 900;
const MOST_THINGS_NOTICED = 12;
const REACH = 54; // how far from the middle of its body it can touch
const CARRY_SIZE = 46; // anything bigger than this is too big to pick up
const CARRY_MASS = 15; // and anything heavier than this is too heavy
const FORGET_BLOCKED_AFTER = 15 * TICKS_PER_SECOND;
const VOICE_TICKS = 8 * TICKS_PER_SECOND; // how long a word hangs in the air
const HEARING_TICKS = 8 * TICKS_PER_SECOND; // and how long it stays on its mind
const EARSHOT = 2000;
const MOST_CHANNELS_WITH_WORDS = 48;
const ROUTE_EVERY = 12; // ticks between working out the way again
const WALL_MARGIN = 120; // this close to the edge of the room, wandering turns back

// a drive only teaches when something changed it by more than this during an action. the slow tick down of
// hunger is left out completely: it says nothing about what the creature just did, and counting it
// taught creatures that long walks are bad, so they stopped looking for food and starved.
const DRIVE_NOISE_FLOOR = 0.04;
const DRIVE_REWARD_GAIN = 3;

// everything that describes a thing and can be saved to a file. only name, form, colour, size and x are required
export interface ThingSpec {
  name: string;
  form: Form;
  colour: Colour;
  hw: number;
  hh: number;
  x: number;
  y?: number;
  angle?: number;
  gravity?: boolean; // falls by itself
  fixed?: boolean; // stays where it is, whatever hits it
  solid?: boolean; // other things bump into it
  bounce?: number;
  friction?: number;
  weight?: number;
  give?: { drive: string; amount: number }; // the Give element: touching it changes that drive
  eaten?: boolean; // goes away when touched
  respawnSeconds?: number; // comes back this long after being eaten
  tags?: string[]; // words a sensor can look for
  part?: Part; // it's a circuit part, not just a shape
  inBody?: boolean; // it's inside a creature rather than out in the room
  owner?: number; // which creature it's inside
  stat?: string; // which ready-made stat this is part of, so it can be taken out again as one
  climbable?: boolean; // a creature can climb up it, like a ladder or a wall with handholds
  hidden?: boolean; // not drawn, though it's still there
  voice?: boolean; // a word someone just said, hanging in the air
  expires?: number; // the tick it goes away by itself
  spawned?: number; // made by this spawner, so it's not part of what gets saved to a file
  texture?: string; // the id of a picture drawn on it, which is only for the player: the creature goes by its colour
}

export interface Thing extends ThingSpec {
  id: number;
  y: number;
  angle: number;
  gravity: boolean;
  fixed: boolean;
  solid: boolean;
  bounce: number;
  friction: number;
  weight: number;
  vx: number;
  vy: number;
  spin: number;
  heldBy: boolean;
  dragged: boolean;
  home: number; // the x it comes back near after being eaten
  live?: Live; // what a circuit part is up to right now
  inner?: { things: Thing[]; wires: Wire[] }; // a tool: the real parts sealed inside it, running like any others
}

// a set of things and the wires between them, for room files, copy and paste. wires go by position in the list,
// because ids only mean something inside one world.
export interface RoomData {
  things: ThingSpec[];
  wires: { from: number; out: string; to: number; in: string }[];
  textures?: Record<string, string>; // any pictures its things use, so they travel with it
  size?: { width: number; height: number }; // how big the room was, in a room file
  gravity?: Gravity; // and its gravity
}

// how things fall. strength 1 is normal and 0 is none, and direction is degrees, where 90 is down
export interface Gravity {
  strength: number;
  direction: number;
}

// something a wire set off that changes what's in the room
export type Effect =
  | { kind: 'spawn'; spawner: number; template: number; x: number | null; y: number | null }
  | { kind: 'destroy'; id: number }
  | { kind: 'teleport'; id: number; x: number; y: number }
  | { kind: 'say'; word: string; x: number; y: number; by: number | null }
  | { kind: 'solved'; who: number | null };

export interface TrialState {
  name: string;
  about: string;
  room: RoomData;
  backup: RoomData; // the room you had before, which comes back when you leave
  startTick: number;
  solvedAt: number | null;
  solved: number;
  attempts: number;
}

export interface Respawn {
  spec: ThingSpec;
  at: number;
  id?: number; // the same thing comes back, with the wires it had
  wires?: Wire[];
}

export const PROPERTY_DEFAULTS = { angle: 0, gravity: true, fixed: false, solid: true, bounce: 0.2, friction: 0.6, weight: 1 };

// a socket on the brain, and what's plugged into it right now
export interface Drive {
  name: string;
  kind: 'drive' | 'nerve';
  socket: number; // the part it comes from
  channel: number; // where it goes in the brain
  wired: boolean;
  value: number;
  wants: Wants;
  aim: number;
  scale: number;
}

// something you've told it to do. it does these in order, before going back to deciding for itself
export interface Order {
  action: Action;
  targetId: number | null;
  remember: boolean; // it learns from this as if it had been its own good idea
}

export interface Doing {
  told?: boolean;
  remember?: boolean;
  action: Action;
  targetId: number | null;
  start: number;
  until: number;
  needStart: number[]; // how much it needed each thing when it started, not counting what changed by itself since
}

// partway through getting to a ledge, which it finishes before thinking about the next one
export interface Leap {
  kind: 'jump' | 'climb';
  landX: number;
  top: number;
  left: number;
  right: number;
  solid: boolean;
  startedAt: number;
}

export interface Creature {
  id: number; // only means something inside this world
  uid: string; // who it is, for its family tree, wherever it goes
  lastBaby: number | null; // the tick it last had one
  orders: Order[];
  dead: boolean;
  deaths: number;
  lastDeath: string | null; // what it thinks went wrong, in its own words
  name: string;
  look: Look;
  hatching: number; // ticks until it comes out of its egg
  x: number;
  y: number; // where its feet are
  facing: number;
  heading: number; // which way it goes when wandering
  headingY: number; // and up or down, if it's floating
  walking: boolean;
  dragged: boolean;
  wantVx: number | null;
  hop: boolean;
  stuck: number;
  lastX: number;
  cantReach: Record<number, number>; // things it couldn't get to, and when it'll try again
  blockedAt: Record<number, { x: number; y: number }>; // where each of those was, so it tries again once one has moved
  bornTick: number;
  hearing: Record<string, number>; // words it heard just now, and when it stops thinking about them
  wantVy: number;
  floating: boolean;
  climbing: boolean;
  hopSpeed: number;
  leap: Leap | null;
  hiddenAway: boolean;
  field: { x: number; y: number } | null;
  drives: Drive[];
  doing: Doing | null;
  pause: number;
  stunned: number;
  shoved?: number; // ticks left being knocked along by someone else's push
  holding: number | null;
  brain: Brain;
}

export type WorldEvent =
  | { type: 'touched'; who: number; thingId: number; name: string; ate: boolean; fatal: boolean; cuddle?: boolean }
  | { type: 'petted'; who: number }
  | { type: 'slapped'; who: number }
  | { type: 'called'; who: number }
  | { type: 'decided'; who: number; decision: Decision; told: boolean }
  | { type: 'gaveUp'; who: number; action: Action; name: string }
  | { type: 'taught'; who: number; action: Action; name: string }
  | { type: 'pulse'; wireId: number }
  | { type: 'loop' }
  | { type: 'hatched'; who: number }
  | { type: 'said'; word: string; x: number; y: number; by: number | null }
  | { type: 'sound'; pitch: number; seconds: number }
  | { type: 'burst'; x: number; y: number; colour: Colour }
  | { type: 'solved'; who: number | null; seconds: number; name: string }
  | { type: 'died'; who: number; lesson: string }
  | { type: 'revived'; who: number }
  | { type: 'laid'; who: number }
  | { type: 'watched'; who: number; other: number; what: 'ate' | 'hurt' | 'petted' | 'slapped'; action: Action; name: string }
  | { type: 'replayed'; who: number; moments: number }
  | { type: 'noticed'; who: number; name: string; after: Action; cause: string }
  | { type: 'planned'; who: number; steps: PlanStep[] }
  | { type: 'cuddled'; who: number; other: number };

export interface WorldOptions {
  seed: number;
  things?: ThingSpec[];
  room?: RoomData; // a whole room with wires, instead of things
  genes?: Partial<Genes>;
  name?: string;
  look?: Look;
  size?: { width: number; height: number }; // how big the room is
  gravity?: Gravity; // how things fall, unless a zone says otherwise
  body?: 'starter' | 'blank'; // ready-made hunger and sleep, or nothing at all to wire up yourself
  stats?: StatId[]; // which ready-made stats it has, instead of the usual ones
  egg?: boolean; // starts inside an egg
}

export function needOf(drive: Drive): number {
  if (!drive.wired) return 0;
  const v = Math.max(0, Math.min(1, drive.value / drive.scale));
  if (drive.kind === 'nerve') return v;
  if (drive.wants === 'near') return Math.min(1, Math.abs(drive.value - drive.aim) / drive.scale);
  return drive.wants === 'high' ? 1 - v : v;
}

export const FRUIT: ThingSpec = { name: 'Fruit', form: 'circle', colour: 'red', hw: 14, hh: 14, x: CENTRE + 170, give: { drive: 'Hunger', amount: -25 }, eaten: true, respawnSeconds: 12 };
export const ROCK: ThingSpec = { name: 'Rock', form: 'box', colour: 'grey', hw: 26, hh: 26, x: CENTRE - 210, weight: 3 };

// just the parts of a thing that describe it, without what it's doing right now
export function specOf(t: Thing): ThingSpec {
  const { id: _id, vx: _vx, vy: _vy, spin: _spin, heldBy: _heldBy, dragged: _dragged, home: _home, live, inner, ...spec } = t;
  // what a label holds right now is part of it, so a copy or a saved room keeps its count
  if (spec.part?.kind === 'label' && live?.value !== undefined) spec.part = { ...spec.part, value: live.value };
  if (inner && spec.part?.tool) {
    const position = new Map(inner.things.map((x, i) => [x.id, i]));
    const wires = inner.wires.map((w) => ({ from: position.get(w.from) as number, out: w.out, to: position.get(w.to) as number, in: w.in }));
    spec.part = { ...spec.part, tool: { ...spec.part.tool, things: inner.things.map(specOf), wires } };
  }
  return spec;
}

export class World {
  tick = 0;
  rng: Rng;
  size: RoomSize;
  gravity: Gravity = { strength: 1, direction: 90 };
  keysDown = new Set<string>(); // what the player is holding, which the window keeps up to date
  keysTapped = new Set<string>(); // pressed since the last tick, so a quick tap between ticks still counts
  pointer = { x: 0, y: 0, down: false };
  trial: TrialState | null = null;
  private zones: Thing[] = [];
  private routes = new Map<number, { at: number; step: RouteStep | null }>();
  private visible = new Set<number>(); // what could be seen last tick, so something new coming into view gets noticed
  private returned = new Set<number>(); // eaten things coming back this tick, which nothing did on purpose
  private effects: Effect[] = [];
  things: Thing[] = [];
  creatures: Creature[] = [];
  focusId = 0; // the one the player is looking at. everything that doesn't say which creature means this one
  family: Record<string, Kin> = {}; // everyone anyone here is related to, including those who have gone
  respawns: Respawn[] = [];
  textures: Record<string, string> = {}; // pictures by id, which things refer to. undo needs old ones, so they stay until saved
  events: WorldEvent[] = [];
  // where everything was one tick ago, so drawing can glide between ticks. never saved.
  previous = new Map<number, { x: number; y: number; angle: number }>();
  previousCreatures = new Map<number, { x: number; y: number }>();
  circuit: Circuit;
  private nextId = 1;
  private physics: Physics;
  private index = new Map<number, Thing>();
  private uidSalt: string;

  constructor(options: WorldOptions) {
    this.rng = new Rng(options.seed);
    this.uidSalt = (options.seed >>> 0).toString(36);
    this.size = roomSize(options.size);
    this.physics = new Physics(this.size);
    this.circuit = new Circuit(this);
    if (options.gravity) this.setGravity(options.gravity);
    this.addCreature(options);
    if (options.stats) for (const stat of options.stats) this.addStat(stat);
    else if ((options.body ?? 'starter') === 'starter') this.addRoom(starterBody());
    if (options.room) this.addRoom(options.room);
    // the ready-made fruit and rock go either side of the middle, wherever that is
    else if (options.things) for (const spec of options.things) this.add(spec);
    else for (const spec of [FRUIT, ROCK]) this.add({ ...spec, x: spec.x + this.size.width / 2 - CENTRE });
  }

  // the one the player is looking at
  get creature(): Creature {
    return this.creatures.find((c) => c.id === this.focusId) ?? this.creatures[0];
  }

  creatureById(id: number): Creature | undefined {
    return this.creatures.find((c) => c.id === id);
  }

  focusOn(id: number): void {
    if (this.creatureById(id)) this.focusId = id;
  }

  private newUid(): string {
    return `${this.uidSalt}-${(this.nextId++).toString(36)}`;
  }

  // a new creature with nothing inside it yet, which takes the focus so that what gets added next goes inside it
  private addCreature(options: Pick<WorldOptions, 'name' | 'look' | 'egg' | 'genes'>, x = this.size.width / 2, parents: string[] = [], generation = 0): Creature {
    const c = this.makeCreature(options, x);
    this.creatures.push(c);
    this.physics.addCreature(c.id, x, this.size.floor);
    this.previousCreatures.set(c.id, { x, y: this.size.floor });
    this.focusId = c.id;
    this.family[c.uid] = { uid: c.uid, name: c.name, look: c.look, parents, generation };
    return c;
  }

  private makeCreature(options: Pick<WorldOptions, 'name' | 'look' | 'egg' | 'genes'>, x: number): Creature {
    return {
      id: this.nextId++,
      uid: this.newUid(),
      lastBaby: null,
      hearing: {},
      wantVy: 0,
      floating: false,
      climbing: false,
      hopSpeed: 430,
      leap: null,
      hiddenAway: false,
      field: null,
      orders: [],
      dead: false,
      deaths: 0,
      lastDeath: null,
      name: options.name ?? 'Nurt',
      look: options.look ?? { ...DEFAULT_LOOK },
      hatching: options.egg ? HATCH_SECONDS * TICKS_PER_SECOND : 0,
      x,
      y: this.size.floor,
      facing: 1,
      heading: this.rng.next() < 0.5 ? -1 : 1,
      headingY: 0,
      walking: false,
      dragged: false,
      wantVx: 0,
      hop: false,
      stuck: 0,
      lastX: x,
      cantReach: {},
      blockedAt: {},
      bornTick: this.tick,
      drives: [],
      doing: null,
      pause: TICKS_PER_SECOND,
      stunned: 0,
      holding: null,
      brain: new Brain([], options.genes ?? {}),
    };
  }

  // a new egg, alongside whoever is already here. null if the room is full.
  newEgg(options: Pick<WorldOptions, 'name' | 'look' | 'genes' | 'body' | 'stats'>): Creature | null {
    if (this.creatures.length >= MOST_CREATURES) return null;
    const c = this.addCreature({ ...options, egg: true }, this.rng.range(this.size.width / 2 - 300, this.size.width / 2 + 300));
    if (options.stats) for (const stat of options.stats) this.addStat(stat);
    else if ((options.body ?? 'starter') === 'starter') this.addRoom(starterBody());
    this.syncSockets();
    return c;
  }

  statsOf(c = this.creature): StatId[] {
    const has = new Set(this.things.filter((t) => t.owner === c.id).map((t) => t.stat));
    return STATS.filter((stat) => has.has(stat));
  }

  // gives it a ready-made stat, as real wires in its body. false if it has one already
  addStat(stat: StatId, c = this.creature): boolean {
    if (this.statsOf(c).includes(stat)) return false;
    const needs = STAT_INFO[stat].needs;
    if (needs) this.addStat(needs, c);
    const inside = this.things.filter((t) => t.owner === c.id);
    const used = new Set(inside.filter((t) => t.stat).map((t) => (t.x >= 1000 ? 1 : 0) + Math.floor((t.y - 120) / 300) * 2));
    let slot = 0;
    while (used.has(slot) && slot < 6) slot++;
    // dying goes right under the Health it reads, so there's a place for every stat at once
    const health = stat === 'mortal' ? inside.find((t) => t.stat === 'health') : undefined;
    if (health) slot = (health.x >= 1000 ? 1 : 0) + Math.floor((health.y - 120) / 300) * 2;
    const under = health ? 235 : 0;
    const block = statBlock(stat);
    const keep = this.focusId;
    this.focusId = c.id;
    const ids = block.things.map((spec) => this.add({ ...spec, ...statSpot(slot, { x: spec.x, y: (spec.y ?? 0) + under }), inBody: true, stat }).id);
    for (const w of block.wires) this.connect(ids[w.from], w.out, ids[w.to], w.in);
    this.focusId = keep;
    // dying at 0 Health needs to read the Health it just made sure was there
    if (stat === 'mortal') {
      const health = this.circuit.labelNamed('Health', c.id);
      if (health) this.connect(health.id, 'value', ids[0], 'a');
    }
    this.syncSockets();
    return true;
  }

  // takes one out again, along with anything that can't work without it. what it learned stays, in case it comes back
  removeStat(stat: StatId, c = this.creature): void {
    for (const other of STATS) if (STAT_INFO[other].needs === stat) this.removeStat(other, c);
    for (const t of this.things.filter((thing) => thing.owner === c.id && thing.stat === stat)) this.remove(t.id);
    this.syncSockets();
  }

  // creatures from before Hunger had Food, where 100 was full. the wires get turned round so 100 is starving, and what it
  // learned still holds, because how much it needs food at any moment hasn't changed. a body wired differently is left alone.
  private modernise(c: Creature): void {
    const inside = this.circuit.allParts.filter((t) => t.owner === c.id);
    const label = inside.find((t) => t.name === 'Food' && t.part?.kind === 'label');
    const socket = inside.find((t) => t.name === 'Food' && t.part?.kind === 'drive' && t.part.wants === 'high');
    const step = inside.find((t) => t.name === 'How much' && t.part?.kind === 'data' && t.part.base === -1 && t.y < 400);
    if (!label?.part || !label.live || !socket?.part || !step?.part) return;
    if (label.part.min !== 0 || label.part.max !== 100 || inside.some((t) => t.name === 'Hunger')) return;
    const flip = (v: Value | undefined): number => 100 - toNumber(v ?? 0);
    label.live.value = flip(label.live.value);
    label.part = { ...label.part, value: flip(label.part.value) };
    label.name = 'Hunger';
    step.part = { ...step.part, base: 1 };
    delete step.live?.roll;
    socket.part = { ...socket.part, wants: 'low' };
    socket.name = 'Hunger';
    for (const t of inside) t.stat = t.y < 400 ? 'hunger' : 'energy';
    const channel = c.brain.driveNames.indexOf('Food');
    c.brain.renameChannel('Food', 'Hunger');
    if (channel >= 0) c.brain.whens[channel] = 'high';
    this.syncSockets();
  }

  // a Loneliness from before cuddles only went down when petted. if it's still wired the way it came, cuddling helps too
  private learnToCuddle(c: Creature): void {
    const inside = this.circuit.allParts.filter((t) => t.owner === c.id && t.stat === 'loneliness');
    const feel = inside.find((t) => t.part?.kind === 'feel');
    const comfort = inside.find((t) => t.part?.kind === 'give' && t.name === 'Comforted');
    if (!feel || !comfort) return;
    const wired = (port: string): boolean => this.wires.some((w) => w.from === feel.id && w.out === port && w.to === comfort.id);
    if (wired('petted') && !this.wires.some((w) => w.from === feel.id && w.out === 'cuddled')) this.connect(feel.id, 'cuddled', comfort.id, 'give');
  }

  // why these two can't have a baby right now, or null if they can
  whyNoBaby(a: Creature, b: Creature): string | null {
    if (a.id === b.id) return 'It takes two.';
    for (const c of [a, b]) {
      if (c.dead) return `${c.name} is dead.`;
      if (stageOf(this.tick - c.bornTick) !== 'adult') return `${c.name} isn't grown up yet.`;
      if (c.hatching > 0) return `${c.name} hasn't hatched yet.`;
      if (c.lastBaby !== null && this.tick - c.lastBaby < BABY_REST) return `${c.name} needs a rest first.`;
    }
    if (this.creatures.length >= MOST_CREATURES) return `The room is full, at ${MOST_CREATURES} creatures.`;
    return null;
  }

  // an egg with their genes mixed and slightly changed, and the body of one of them. nothing they've learned goes with it.
  haveBaby(a: Creature, b: Creature): Creature | null {
    if (this.whyNoBaby(a, b) !== null) return null;
    const keepFocus = this.focusId;
    const genes = mixGenes(a.brain.genes, b.brain.genes, this.rng);
    const look = mixLooks(a.look, b.look, this.rng);
    const bodyFrom = this.rng.next() < 0.5 ? a : b;
    const body = this.bodyData(bodyFrom);
    const generation = 1 + Math.max(this.family[a.uid]?.generation ?? 0, this.family[b.uid]?.generation ?? 0);
    const x = Math.max(60, Math.min(this.size.width - 60, (a.x + b.x) / 2));
    const baby = this.addCreature({ name: babyName(this.rng), look, genes, egg: true }, x, [a.uid, b.uid], generation);
    this.addRoom(body);
    this.syncSockets();
    a.lastBaby = b.lastBaby = this.tick;
    this.focusId = keepFocus;
    this.events.push({ type: 'laid', who: baby.id });
    return baby;
  }

  // what's inside a creature, ready to go inside another one
  bodyData(c: Creature): RoomData {
    const room = this.roomData(this.things.filter((t) => t.owner === c.id).map((t) => t.id));
    return { ...room, things: room.things.map(({ owner: _owner, ...t }) => t) };
  }

  // keeps the family tree up with any new names and looks
  familyOf(c: Creature): Kin[] {
    this.syncFamily();
    return ancestors(c.uid, this.family);
  }

  syncFamily(): void {
    for (const c of this.creatures) {
      const kin = this.family[c.uid];
      if (kin) Object.assign(kin, { name: c.name, look: c.look });
    }
  }

  // sends one away for good. there always has to be someone here, so the last one can't go.
  removeCreature(id: number): boolean {
    const c = this.creatureById(id);
    if (!c || this.creatures.length < 2) return false;
    c.doing = null;
    if (c.holding !== null) this.dropHeld(c);
    for (const other of this.creatures) if (other.id !== id && other.doing?.targetId === id) this.endAction(true, other);
    for (const t of this.things.filter((thing) => thing.owner === id)) this.remove(t.id);
    this.creatures = this.creatures.filter((other) => other.id !== id);
    this.physics.removeCreature(id);
    this.previousCreatures.delete(id);
    if (this.family[c.uid]) this.family[c.uid].gone = true;
    if (this.focusId === id) this.focusId = this.creatures[0].id;
    this.syncSockets();
    return true;
  }

  // id is only given when bringing something back with undo
  add(spec: ThingSpec, id?: number): Thing {
    const thing = this.makeThing(spec, id);
    if (thing.part?.kind === 'tool') this.sealInside(thing);
    this.things.push(thing);
    this.index.set(thing.id, thing);
    this.physics.add(thing);
    if (thing.part) {
      this.circuit.sync();
      if (mayHaveSockets(thing.part)) this.syncSockets();
      if (thing.part.kind === 'zone') this.syncZones();
    }
    return thing;
  }

  private makeThing(spec: ThingSpec, id?: number): Thing {
    const thing: Thing = {
      ...PROPERTY_DEFAULTS,
      ...spec,
      owner: spec.inBody ? (spec.owner ?? this.focusId) : undefined,
      id: id ?? this.nextId++,
      y: spec.y ?? this.size.floor - spec.hh,
      vx: 0,
      vy: 0,
      spin: 0,
      heldBy: false,
      dragged: false,
      home: spec.x,
    };
    if (spec.part) thing.live = spec.part.kind === 'label' ? { value: spec.part.value ?? 0 } : {};
    if (id !== undefined) this.nextId = Math.max(this.nextId, id + 1);
    return thing;
  }

  // what's inside a tool is real parts, with nowhere in the room to be and nothing that can reach them except its sockets
  private sealInside(box: Thing): void {
    const tool = box.part?.tool;
    if (!tool) return;
    const things = tool.things.map((spec) => this.makeThing({ ...spec, inBody: box.inBody, owner: box.owner }));
    const wires: Wire[] = [];
    for (const w of tool.wires) {
      if (this.circuit.whyNot(things[w.from], w.out, things[w.to], w.in) === null) wires.push({ id: this.circuit.nextWireId++, from: things[w.from].id, out: w.out, to: things[w.to].id, in: w.in });
    }
    box.inner = { things, wires };
    // what it holds from here on is whatever's in there. specOf() writes it back out when it's asked for
    box.part = { ...box.part, kind: 'tool', tool: { ...tool, things: [], wires: [] } };
  }

  // a picture for things to use. null if it isn't a picture we accept, or the world already holds too many
  addTexture(data: unknown): string | null {
    if (!usableTexture(data)) return null;
    const id = textureId(data);
    if (this.textures[id]) return id;
    let total = data.length;
    for (const held of Object.values(this.textures)) total += held.length;
    if (total > MOST_TEXTURE_TEXT) return null;
    this.textures[id] = data;
    return id;
  }

  private texturesFor(specs: ThingSpec[]): Record<string, string> {
    const used: Record<string, string> = {};
    for (const spec of specs) if (spec.texture && this.textures[spec.texture]) used[spec.texture] = this.textures[spec.texture];
    return used;
  }

  remove(id: number): void {
    for (const c of this.creatures) {
      if (c.holding === id) c.holding = null;
      if (c.doing?.targetId === id) this.endAction(true, c);
    }
    const part = this.thing(id)?.part;
    this.things = this.things.filter((t) => t.id !== id);
    this.index.delete(id);
    this.previous.delete(id);
    this.physics.remove(id);
    this.circuit.disconnectThing(id);
    if (part) {
      this.circuit.sync();
      if (mayHaveSockets(part)) this.syncSockets();
      if (part.kind === 'zone') this.syncZones();
    }
  }

  private syncZones(): void {
    this.zones = this.things.filter((t) => t.part?.kind === 'zone' && this.circuit.inputValue(t.id, 'on') !== false);
  }

  clearThings(): void {
    // only what's in the room. what's inside the creature isn't going anywhere
    for (const t of this.things.filter((thing) => !thing.inBody)) this.remove(t.id);
    this.respawns = [];
  }

  // changes how a thing is set up, like its size or whether it has gravity
  update(id: number, patch: Partial<ThingSpec>): void {
    const t = this.thing(id);
    if (!t) return;
    const was = t.part;
    const oldName = t.name;
    Object.assign(t, patch);
    if (patch.part && was) this.updatePart(t, was, patch.part);
    if (isSocket(t.part)) {
      // a socket out in the room feeds everyone, and one inside a creature only feeds that creature
      if (t.name !== oldName) for (const c of this.creatures) if (t.owner === undefined || t.owner === c.id) c.brain.renameChannel(oldName, t.name);
      this.syncSockets();
    }
    if (patch.x !== undefined || patch.y !== undefined || patch.angle !== undefined) {
      this.previous.delete(id);
      t.vx = t.vy = t.spin = 0;
    }
    if (patch.x !== undefined) t.home = patch.x;
    if (patch.fixed) t.vx = t.vy = t.spin = 0;
    this.physics.rebuild(t);
  }

  private updatePart(t: Thing, was: Part, patch: Part): void {
    t.part = { ...was, ...patch };
    if (!t.live) return;
    if (patch.value !== undefined) t.live.value = patch.value;
    // a new setting starts it again, rather than finishing a wait that no longer applies
    if (t.part.seconds !== was.seconds) t.live.nextAt = null;
    if (t.part.base !== was.base || t.part.spread !== was.spread) delete t.live.roll;
  }

  thing(id: number | null): Thing | undefined {
    return id === null ? undefined : this.index.get(id);
  }

  // ---- wires ----

  get wires(): Wire[] {
    return this.circuit.wires;
  }

  connect(from: number, out: string, to: number, inPort: string): Wire | null {
    return this.circuit.connect(this.thing(from), out, this.thing(to), inPort);
  }

  whyNotConnect(from: number, out: string, to: number, inPort: string): string | null {
    return this.circuit.whyNot(this.thing(from), out, this.thing(to), inPort);
  }

  disconnect(wireId: number): void {
    this.circuit.disconnect(wireId);
  }

  // clicked by you or touched by a creature, it's the same press
  pressButton(id: number): void {
    this.circuit.press(id);
  }

  // ---- sockets on the brain ----

  // works out what's plugged into each brain, whenever a socket comes or goes or changes
  private syncSockets(): void {
    for (const c of this.creatures) {
      const drives: Drive[] = [];
      for (const t of this.circuit.allParts) {
        if (!t.part || !isSocket(t.part)) continue;
        if (t.owner !== undefined && t.owner !== c.id) continue;
        const kind = t.part.kind === 'nerve' ? 'nerve' : 'drive';
        const wants = t.part.wants ?? 'high';
        const channel = c.brain.channel(t.name, kind, kind === 'nerve' ? 'on' : wants === 'high' ? 'low' : wants === 'low' ? 'high' : 'off');
        if (channel < 0 || drives.some((d) => d.channel === channel)) continue;
        drives.push({ name: t.name, kind, socket: t.id, channel, wired: false, value: 0, wants, aim: t.part.aim ?? 50, scale: t.part.scale ?? 100 });
      }
      c.drives = drives;
      this.readDrives(c, true);
    }
  }

  // reads the sockets. anything that changed by itself shouldn't count for or against what it's doing right now.
  private readDrives(c: Creature, caused: boolean): void {
    for (const drive of c.drives) {
      const before = needOf(drive);
      const value = this.circuit.inputValue(drive.socket, 'value');
      drive.wired = value !== null;
      drive.value = toNumber(value);
      if (caused || !c.doing) continue;
      const start = c.doing.needStart[drive.channel];
      if (start !== undefined && start !== null) c.doing.needStart[drive.channel] = start + needOf(drive) - before;
    }
  }

  // changes a named value inside a creature. false if it doesn't have one by that name
  giveTo(name: string, amount: number, c = this.creature): boolean {
    return this.circuit.giveTo(name, amount, c.id);
  }

  // sets something inside it directly, for tests that set up a situation
  setDrive(name: string, value: number, c = this.creature): void {
    const label = this.circuit.labelNamed(name, c.id);
    if (!label) return;
    this.setLabel(label.id, value);
    this.readDrives(c, false);
  }

  // typed into a label
  setLabel(id: number, value: Value): void {
    const t = this.circuit.allParts.find((p) => p.id === id);
    if (t?.part?.kind !== 'label' || !t.live) return;
    t.part = { ...t.part, value };
    t.live.value = value;
  }

  // these things, or everything in the room, along with the wires that stay inside the set
  roomData(ids?: Iterable<number>): RoomData {
    const wanted = ids ? new Set(ids) : null;
    const picked = wanted ? this.things.filter((t) => wanted.has(t.id) && !t.voice && !t.spawned) : this.things.filter(belongsInFile);
    const position = new Map(picked.map((t, i) => [t.id, i]));
    const wires: RoomData['wires'] = [];
    for (const w of this.wires) {
      const from = position.get(w.from);
      const to = position.get(w.to);
      if (from !== undefined && to !== undefined) wires.push({ from, out: w.out, to, in: w.in });
    }
    const things = picked.map(specOf);
    return { things, wires, textures: this.texturesFor(things) };
  }

  // the whole room for a file, including anything that has been eaten and hasn't come back yet, or it would be lost
  roomForFile(): RoomData {
    const room = this.roomData();
    const position = new Map(this.things.filter(belongsInFile).map((t, i) => [t.id, i]));
    const waiting = this.respawns.filter((r) => r.id !== undefined);
    for (const r of this.respawns) {
      if (r.id !== undefined) position.set(r.id, room.things.length);
      room.things.push(r.spec);
    }
    const seen = new Set<number>();
    for (const r of waiting) {
      for (const w of r.wires ?? []) {
        const from = position.get(w.from);
        const to = position.get(w.to);
        if (seen.has(w.id) || from === undefined || to === undefined) continue;
        seen.add(w.id);
        room.wires.push({ from, out: w.out, to, in: w.in });
      }
    }
    room.textures = this.texturesFor(room.things);
    room.size = { width: this.size.width, height: this.size.height };
    room.gravity = this.gravity;
    return room;
  }

  setGravity(gravity: Gravity): void {
    this.gravity = { strength: Math.max(-5, Math.min(5, gravity.strength)), direction: gravity.direction };
    const a = (this.gravity.direction * Math.PI) / 180;
    // written out so normal gravity stays exactly what it always was
    const normal = this.gravity.strength === 1 && this.gravity.direction === 90;
    this.physics.setGravity(normal ? 0 : Math.cos(a) * GRAVITY * this.gravity.strength, normal ? GRAVITY : Math.sin(a) * GRAVITY * this.gravity.strength);
  }

  // the gravity right here. a zone on top wins over one underneath, and any zone wins over the world's
  private zoneAt(x: number, y: number): Thing | null {
    for (let i = this.zones.length - 1; i >= 0; i--) if (containsPoint(this.zones[i], x, y)) return this.zones[i];
    return null;
  }

  private pullOf(zone: Thing): { x: number; y: number } {
    const a = ((zone.part?.direction ?? 90) * Math.PI) / 180;
    const pull = (zone.part?.pull ?? 0) * GRAVITY;
    return { x: Math.cos(a) * pull, y: Math.sin(a) * pull };
  }

  // whether a creature here has nothing pulling on it
  private weightless(x: number, y: number): boolean {
    const zone = this.zoneAt(x, y);
    return zone ? (zone.part?.pull ?? 0) === 0 : this.gravity.strength === 0;
  }

  // ---- things the wires set off, which happen between ticks so nothing changes while the circuit is running ----

  private runEffects(): void {
    const list = this.effects;
    if (list.length === 0) return;
    this.effects = [];
    for (const effect of list) {
      if (effect.kind === 'spawn') this.spawnFrom(effect.spawner, effect.template, effect.x, effect.y);
      else if (effect.kind === 'destroy') {
        if (this.thing(effect.id)) this.remove(effect.id);
      } else if (effect.kind === 'teleport') {
        const t = this.thing(effect.id);
        if (t) this.update(t.id, { x: Math.max(0, Math.min(this.size.width, effect.x)), y: Math.max(0, Math.min(this.size.floor, effect.y)) });
      } else if (effect.kind === 'say') {
        this.say(effect.word, effect.x, effect.y, effect.by);
      } else if (effect.kind === 'solved') {
        this.solveTrial(effect.who);
      }
    }
  }

  private spawnFrom(spawner: number, template: number, x: number | null, y: number | null): void {
    const from = this.thing(spawner);
    const shape = this.thing(template);
    if (!from?.live || !shape) return;
    const kids = (from.live.kids ?? []).filter((id) => this.thing(id));
    if (kids.length >= (from.part?.most ?? 20)) {
      from.live.kids = kids;
      return;
    }
    const { spawned: _spawned, ...spec } = specOf(shape);
    // a hidden shape is only a pattern, wherever you've parked it, so what comes out of it is a real thing that falls
    const free = shape.hidden ? { fixed: false, gravity: true } : {};
    const copy = this.add({ ...spec, ...free, x: x ?? shape.x, y: y ?? shape.y, hidden: false, spawned: spawner });
    // a copy is wired up the way its original is, so a copy of a fruit still feeds
    for (const w of this.wires.filter((wire) => wire.from === template && wire.out === 'touched')) this.connect(copy.id, w.out, w.to, w.in);
    kids.push(copy.id);
    from.live.kids = kids;
    this.circuit.pulseOut(spawner, 'made');
  }

  // ---- words ----

  // said out loud, by you, a part or a creature. it hangs in the air where it was said, which is something a creature
  // can go to, and for a few seconds it's on the mind of everyone in earshot, which is what lets it learn what it means.
  say(word: string, x: number, y: number, by: number | null = null): void {
    const clean = word.trim().toLowerCase().slice(0, 24);
    if (!clean) return;
    this.events.push({ type: 'said', word: clean, x, y, by });
    this.add({ name: clean, form: 'circle', colour: 'yellow', hw: 16, hh: 16, x: Math.max(0, Math.min(this.size.width, x)), y: Math.max(16, Math.min(this.size.floor - 16, y)), fixed: true, gravity: false, solid: false, voice: true, expires: this.tick + VOICE_TICKS });
    this.circuit.heard(clean);
    for (const c of this.creatures) {
      if (c.id === by || c.dead || c.hatching > 0 || c.hiddenAway) continue;
      if (Math.hypot(c.x - x, c.y - y) > EARSHOT) continue;
      if (c.brain.channel(wordChannel(clean), 'nerve', `I hear "${clean}"`, MOST_CHANNELS_WITH_WORDS) < 0) continue;
      c.hearing[wordChannel(clean)] = this.tick + HEARING_TICKS;
      // it stops to think, unless it's busy doing what it was told
      if (by === null && c.doing && !c.doing.told) {
        const last = c.brain.traces[c.brain.traces.length - 1];
        if (last && last.end === null) last.end = this.tick;
        c.doing = null;
        c.pause = 1;
      }
    }
  }

  // ---- trials ----

  // a friend's room to try out on your creatures. your own room is kept safe and comes back afterwards.
  startTrial(trial: { name: string; about: string; room: RoomData }): void {
    const backup = this.trial?.backup ?? { ...this.roomForFile(), gravity: this.gravity };
    this.clearThings();
    if (trial.room.size) this.resize(trial.room.size.width, trial.room.size.height);
    this.setGravity(trial.room.gravity ?? { strength: 1, direction: 90 });
    this.addRoom(trial.room);
    this.trial = { name: trial.name, about: trial.about, room: trial.room, backup, startTick: this.tick, solved: this.trial?.name === trial.name ? this.trial.solved : 0, attempts: (this.trial?.name === trial.name ? this.trial.attempts : 0) + 1, solvedAt: null };
    this.sendToStart();
  }

  // a clean try at the same Trial, with everything it just learned still in its head
  retryTrial(): void {
    if (this.trial) this.startTrial(this.trial);
  }

  leaveTrial(): void {
    const backup = this.trial?.backup;
    if (!backup) return;
    this.trial = null;
    this.clearThings();
    if (backup.size) this.resize(backup.size.width, backup.size.height);
    this.setGravity(backup.gravity ?? { strength: 1, direction: 90 });
    this.addRoom(backup);
  }

  private sendToStart(): void {
    const start = this.things.find((t) => t.part?.kind === 'start');
    for (const c of this.creatures) {
      c.doing = null;
      c.orders = [];
      c.leap = null;
      c.pause = TICKS_PER_SECOND;
      c.cantReach = {};
      if (start) {
        c.x = start.x;
        c.y = start.y;
        this.physics.placeCreature(c.id, c.x, Math.min(c.y, this.size.floor));
      } else {
        this.placeCreature(Math.min(120, this.size.width / 2), c);
      }
    }
  }

  private solveTrial(who: number | null): void {
    const trial = this.trial;
    if (!trial || trial.solvedAt !== null) return;
    trial.solvedAt = this.tick;
    trial.solved++;
    this.events.push({ type: 'solved', who, seconds: (this.tick - trial.startTick) / TICKS_PER_SECOND, name: trial.name });
  }

  // ---- things the circuit asks of the world ----

  effect(effect: Effect): void {
    this.effects.push(effect);
  }

  // what's touching this right now. creatures count, and so does anything with the tag you asked for
  touching(t: Thing, tag: string): number[] {
    const found: number[] = [];
    for (const other of this.things) {
      if (other.id === t.id || other.part || other.inBody || other.voice || other.heldBy || other.hidden) continue;
      if (tag !== '' && !other.tags?.includes(tag)) continue;
      const near = closestPoint(other, t.x, t.y);
      if (containsPoint(t, near.x, near.y, 3)) found.push(other.id);
    }
    if (tag === '' || tag === 'creature') {
      for (const c of this.creatures) {
        if (c.hiddenAway) continue;
        const near = closestPoint(t, c.x, c.y - BODY.centreAboveFeet);
        if (Math.hypot(near.x - c.x, near.y - (c.y - BODY.centreAboveFeet)) <= BODY.radius + 6) found.push(c.id);
      }
    }
    return found;
  }

  // the thing a Camera wants the player to look at, and how close
  cameraTarget(): { x: number; y: number; zoom: number } | null {
    for (const t of this.things) {
      if (t.part?.kind !== 'camera') continue;
      const value = this.circuit.inputValue(t.id, 'on');
      if (value !== null && value === false) continue;
      const wire = this.wires.find((w) => w.from === t.id && w.out === 'drives');
      const target = wire && this.thing(wire.to);
      if (target) return { x: target.x, y: target.y, zoom: t.part.zoom ?? 1 };
    }
    return null;
  }

  // the creatures step aside, so what you've built can be a game with nobody in it
  setCreaturesAway(away: boolean): void {
    for (const c of this.creatures) {
      c.hiddenAway = away;
      if (away) {
        c.doing = null;
        c.orders = [];
      }
    }
  }

  // what's in the room stays centred and on the floor. making it smaller pushes anything past the edge back in.
  resize(width: number, height: number): void {
    const next = roomSize({ width, height });
    this.reshape(next, (next.width - this.size.width) / 2, next.floor - this.size.floor);
  }

  // more room on one side, with everything staying exactly where it is relative to the rest. going left or up means
  // everything's numbers change, because the corner of the room is where they're measured from, so this says by how much.
  expand(side: 'left' | 'right' | 'up' | 'down', amount: number): { dx: number; dy: number } {
    const was = this.size;
    const sideways = side === 'left' || side === 'right';
    const next = roomSize({ width: was.width + (sideways ? amount : 0), height: was.height + (sideways ? 0 : amount) });
    const dx = side === 'left' ? next.width - was.width : 0;
    const dy = side === 'up' ? next.height - was.height : 0;
    this.reshape(next, dx, dy);
    return { dx, dy };
  }

  private reshape(next: RoomSize, shiftX: number, shiftY: number): void {
    this.size = next;
    this.physics.setRoom(this.size);
    const insideX = (x: number, margin: number): number => Math.max(margin, Math.min(this.size.width - margin, x + shiftX));
    for (const t of this.things) {
      if (t.inBody) continue;
      t.x = insideX(t.x, Math.min(t.hw, this.size.width / 2));
      t.y = Math.max(0, t.y + shiftY);
      t.home = insideX(t.home, 60);
      this.physics.rebuild(t);
    }
    for (const r of this.respawns) r.spec = { ...r.spec, x: insideX(r.spec.x, 60), y: undefined };
    for (const c of this.creatures) {
      for (const p of c.brain.places) {
        p.x += shiftX;
        p.y += shiftY;
      }
      c.x = insideX(c.x, BODY.radius);
      c.y = Math.max(BODY.centreAboveFeet * 2, c.y + shiftY);
      c.lastX = c.x;
      this.physics.placeCreature(c.id, c.x, c.y);
    }
    this.previous.clear();
    this.previousCreatures.clear();
  }

  // lets out what's sealed inside a tool, still wired up the same, and throws the box away. gives back the new ids
  unpack(id: number): number[] {
    const box = this.thing(id);
    const tool = box?.part?.tool;
    if (!box || !tool || !box.inner) return [];
    const spec = specOf(box).part?.tool as NonNullable<typeof tool>;
    const added = this.addRoom({ things: spec.things.map((s) => ({ ...s, inBody: box.inBody })), wires: spec.wires }, box.x, box.y);
    for (const w of this.wires.filter((wire) => wire.from === id || wire.to === id)) {
      const from = w.from === id ? tool.outs.find((p) => p.name === w.out) : null;
      const to = w.to === id ? tool.ins.find((p) => p.name === w.in) : null;
      this.connect(from ? added[from.thing] : w.from, from ? from.port : w.out, to ? added[to.thing] : w.to, to ? to.port : w.in);
    }
    this.remove(id);
    return added;
  }

  addRoom(room: RoomData, dx = 0, dy = 0): number[] {
    for (const data of Object.values(room.textures ?? {})) this.addTexture(data);
    const added = room.things.map((spec) => {
      const edge = spec.inBody ? ROOM : this.size;
      const y = spec.y === undefined ? undefined : Math.max(0, Math.min(edge.floor, spec.y + dy));
      return this.add({ ...spec, x: Math.max(0, Math.min(edge.width, spec.x + dx)), y }).id;
    });
    for (const w of room.wires) {
      if (added[w.from] !== undefined && added[w.to] !== undefined) this.connect(added[w.from], w.out, added[w.to], w.in);
    }
    return added;
  }

  // the hand picking something up. while held it pushes other things around but nothing moves it.
  hold(id: number): void {
    const t = this.thing(id);
    if (!t || t.dragged) return;
    if (t.heldBy) {
      t.heldBy = false;
      for (const c of this.creatures) if (c.holding === id) c.holding = null;
    }
    t.dragged = true;
    t.vx = t.vy = t.spin = 0;
    this.physics.rebuild(t);
  }

  // only moves the thing. the physics follows on the next tick, so this also works while paused
  moveHeld(id: number, x: number, y: number, angle?: number): void {
    const t = this.thing(id);
    if (!t) return;
    const edge = t.inBody ? ROOM : this.size;
    t.x = Math.max(0, Math.min(edge.width, x));
    t.y = Math.max(0, Math.min(edge.floor, y));
    if (angle !== undefined) t.angle = angle;
    this.previous.delete(id);
  }

  release(id: number, vx = 0, vy = 0): void {
    const t = this.thing(id);
    if (!t || !t.dragged) return;
    t.dragged = false;
    t.home = t.x;
    const moves = !t.fixed;
    t.vx = moves ? vx : 0;
    t.vy = moves ? vy : 0;
    this.physics.rebuild(t);
  }

  holdCreature(c = this.creature): void {
    this.endAction(true, c);
    c.dragged = true;
  }

  moveHeldCreature(x: number, y: number, c = this.creature): void {
    c.x = Math.max(BODY.radius, Math.min(this.size.width - BODY.radius, x));
    c.y = Math.max(BODY.centreAboveFeet * 2, Math.min(this.size.floor, y));
    this.previousCreatures.set(c.id, { x: c.x, y: c.y });
  }

  releaseCreature(c = this.creature): void {
    c.dragged = false;
    c.pause = TICKS_PER_SECOND;
  }

  // puts it somewhere without it learning anything, for tests
  placeCreature(x: number, c = this.creature): void {
    c.x = x;
    c.y = this.size.floor;
    this.physics.placeCreature(c.id, x, this.size.floor);
    this.previousCreatures.set(c.id, { x, y: c.y });
  }

  // one for every channel in its brain, in order. a channel with no socket any more isn't felt
  needs(c = this.creature): number[] {
    const needs = new Array<number>(c.brain.driveNames.length).fill(0);
    for (const drive of c.drives) needs[drive.channel] = needOf(drive);
    for (const name in c.hearing) {
      const channel = c.brain.driveNames.indexOf(name);
      if (channel >= 0) needs[channel] = 1;
    }
    return needs;
  }

  // how much the thing it needs most matters. nerves are only information, so they don't count
  worstNeed(c = this.creature): number {
    let worst = 0;
    for (const drive of c.drives) if (drive.kind === 'drive') worst = Math.max(worst, needOf(drive));
    return worst;
  }

  drive(name: string, c = this.creature): Drive | undefined {
    return c.drives.find((d) => d.name === name);
  }

  perceive(thing: Thing, c = this.creature): Percept {
    const other = this.index.has(thing.id) ? undefined : this.creatureById(thing.id);
    if (other) return this.perceiveCreature(other, c);
    const here = closestPoint(thing, c.x, c.y - BODY.centreAboveFeet);
    return {
      shape: this.shapeOf(thing),
      colour: thing.colour,
      size: sizeOf(areaOf(thing.form, thing.hw, thing.hh)),
      moving: Math.abs(thing.vx) > 8 || Math.abs(thing.vy) > 8 || thing.dragged,
      near: nearnessOf(Math.hypot(here.x - c.x, here.y - (c.y - BODY.centreAboveFeet))),
    };
  }

  // another creature looks like a creature of its colour. it never sees its name, only what it looks like, so two
  // creatures the same colour are the same to it until it gets to know them
  perceiveCreature(other: Creature, c = this.creature): Percept {
    const body = other.look.body;
    return {
      shape: 'creature',
      colour: colourFamily((body >> 16) & 255, (body >> 8) & 255, body & 255),
      size: 'medium',
      moving: other.walking || other.dragged,
      near: nearnessOf(Math.max(0, Math.hypot(other.x - c.x, other.y - c.y) - BODY.radius)),
    };
  }

  // something it can go to: a thing, or another creature it can see. a creature is stood in for by a circle where
  // its body is, so walking, jumping and reaching all work the same way
  targetOf(id: number | null): Thing | undefined {
    const thing = this.thing(id);
    if (thing || id === null) return thing;
    const other = this.creatureById(id);
    if (!other || other.dead || other.hatching > 0 || other.hiddenAway) return undefined;
    return { ...PROPERTY_DEFAULTS, id: other.id, name: other.name, form: 'circle', colour: 'grey', hw: BODY.radius, hh: BODY.radius, x: other.x, y: other.y - BODY.centreAboveFeet, vx: 0, vy: 0, spin: 0, heldBy: false, dragged: other.dragged, home: other.x };
  }

  // other creatures it could see from here, for deciding what to do
  private othersInSight(c: Creature): Creature[] {
    if (c.brain.abilities.social === false) return [];
    return this.creatures.filter((o) => o.id !== c.id && !o.dead && o.hatching === 0 && !o.hiddenAway && !o.dragged && Math.hypot(o.x - c.x, o.y - c.y) <= SENSE_RANGE);
  }

  private shapeOf(thing: Thing): Shape {
    if (thing.form !== 'box') return thing.form;
    const long = Math.max(thing.hw, thing.hh);
    const short = Math.min(thing.hw, thing.hh);
    return long / short >= 2.5 ? 'bar' : 'square';
  }

  // tells it to do something. it drops what it was doing if it was only following its own ideas, and works through
  // orders in the order you gave them. says why not if this can never work.
  tell(action: Action, targetId: number | null, remember = true, c = this.creature): string | null {
    if (c.dead) return `${c.name} is dead. Bring them back first.`;
    if (needsTarget(action) && !this.targetOf(targetId)) return 'That needs something to do it to.';
    if (action === 'grab' && this.creatureById(targetId ?? -1)) return "It can't carry another creature.";
    if (!needsTarget(action)) targetId = null;
    c.orders.push({ action, targetId, remember });
    if (c.doing && !c.doing.told) {
      const last = c.brain.traces[c.brain.traces.length - 1];
      if (last && last.end === null) last.end = this.tick;
      c.doing = null;
      c.pause = 1;
    }
    return null;
  }

  clearOrders(c = this.creature): void {
    c.orders = [];
  }

  // starts the next order that can still be done. false if there's nothing left to do
  private nextOrder(c: Creature): boolean {
    while (c.orders.length > 0) {
      const order = c.orders.shift() as Order;
      const target = this.targetOf(order.targetId);
      if (needsTarget(order.action) && !target) continue;
      const percept = target ? this.perceive(target, c) : null;
      if (!c.brain.allowed(order.action, percept, c.holding !== null)) continue;
      const decision = c.brain.obey(order.targetId, percept, order.action, this.needs(c), this.tick);
      this.events.push({ type: 'decided', who: c.id, decision, told: true });
      this.start(c, order.action, order.targetId, order);
      return true;
    }
    return false;
  }

  dieFromWire(owner: number, caused: boolean): void {
    const c = this.creatureById(owner);
    if (c) this.die(c, caused);
  }

  // it stays where it fell until it's brought back. caused means something it did set this off, so it knows who to blame
  die(c = this.creature, caused = false): void {
    if (c.dead || c.hatching > 0) return;
    this.readDrives(c, true);
    const lesson = c.brain.died(caused, this.needs(c), this.tick, TICKS_PER_SECOND);
    const last = c.brain.traces[c.brain.traces.length - 1];
    if (last && last.end === null) last.end = this.tick;
    c.doing = null;
    c.orders = [];
    if (c.holding !== null) this.dropHeld(c);
    c.dead = true;
    c.deaths++;
    c.lastDeath = lesson;
    this.circuit.feel('died', c.id);
    this.events.push({ type: 'died', who: c.id, lesson });
  }

  // back again, with everything it has learned, including how it died. its body starts over, so whatever killed it
  // isn't still true the moment it wakes up. a Feel's Revived output is there for anything that should go differently.
  revive(c = this.creature): void {
    if (!c.dead) return;
    c.dead = false;
    c.pause = TICKS_PER_SECOND;
    c.stunned = 0;
    this.circuit.restart(c.id);
    this.circuit.feel('revived', c.id);
    this.readDrives(c, true);
    this.events.push({ type: 'revived', who: c.id });
  }

  // the hand. praise or a slap land on whatever it has been doing for the last few seconds
  pet(c = this.creature): void {
    if (c.dead) return;
    c.brain.pet(this.tick, TICKS_PER_SECOND);
    c.brain.notePlace(c.x, c.y - BODY.centreAboveFeet, 0.8);
    this.othersSee(c, true);
    this.circuit.feel('petted', c.id);
    this.events.push({ type: 'petted', who: c.id });
  }

  slap(c = this.creature): void {
    if (c.dead) return;
    c.brain.slap(this.tick, TICKS_PER_SECOND);
    c.brain.notePlace(c.x, c.y - BODY.centreAboveFeet, -1);
    this.othersSee(c, false);
    this.circuit.feel('slapped', c.id);
    this.events.push({ type: 'slapped', who: c.id });
    c.orders = []; // a slap means stop
    this.endAction(true, c);
    c.stunned = Math.round(0.8 * TICKS_PER_SECOND);
    if (!c.dragged) this.physics.knockCreature(c.id, -c.facing * 120, -170);
  }

  // a pet or slap seen by others teaches them about whatever this one had been doing
  private othersSee(c: Creature, petted: boolean): void {
    for (const w of this.watchers(c)) {
      const channelOf = (theirs: number): number => w.brain.driveNames.indexOf(c.brain.driveNames[theirs]);
      const seen = w.brain.watchedHand(c.brain, petted, channelOf, this.tick, TICKS_PER_SECOND);
      for (const one of seen) w.brain.watched(this.seenBy(w, c, one.seen), one.action, one.lessons);
      const newest = seen[seen.length - 1];
      if (newest && w.brain.learning && w.brain.abilities.watching) {
        this.events.push({ type: 'watched', who: w.id, other: c.id, what: petted ? 'petted' : 'slapped', action: ACTIONS[newest.action], name: newest.seen ? describeSeen(newest.seen) : '' });
      }
    }
  }

  step(): void {
    this.tick++;
    this.previous.clear();
    for (const t of this.things) if (!t.dragged) this.previous.set(t.id, { x: t.x, y: t.y, angle: t.angle });
    for (const c of this.creatures) this.previousCreatures.set(c.id, { x: c.x, y: c.y });

    for (const order of this.circuit.step()) {
      const t = this.thing(order.thingId);
      if (t) this.physics.drive(t, order);
    }
    this.runEffects();
    if (this.zones.length > 0 || this.things.some((t) => t.part?.kind === 'zone')) this.syncZones();
    for (const c of this.creatures) this.readDrives(c, this.circuit.takeCaused(c.id));
    for (const c of this.creatures) {
      if (c.hiddenAway) continue;
      this.feelGravity(c);
      this.stepCreature(c);
      this.carryHeld(c);
    }
    this.physics.step(this.things, this.creatures, this.zones.length > 0 ? (x, y) => {
      const zone = this.zoneAt(x, y);
      return zone ? this.pullOf(zone) : null;
    } : null);
    this.stepRespawns();
    this.stepVoices();
    this.noticeNew();
    this.keysTapped.clear();
    if (this.tick % TICKS_PER_SECOND === 0) for (const c of this.creatures) c.brain.drift(1);
  }

  // anything that has just come into view, like something a button made or a shape that was hidden being shown. each
  // creature that can see it wonders whether what it just did caused it. a word in the air or an eaten fruit coming back
  // by itself aren't things anyone did, so they're left out.
  private noticeNew(): void {
    const now = new Set<number>();
    for (const t of this.things) if (!t.inBody && !t.voice && canSee(t)) now.add(t.id);
    for (const id of now) {
      if (this.visible.has(id) || this.returned.has(id)) continue;
      const t = this.thing(id) as Thing;
      for (const c of this.creatures) {
        if (c.dead || c.hatching > 0 || c.hiddenAway) continue;
        const near = closestPoint(t, c.x, c.y - BODY.centreAboveFeet);
        if (Math.hypot(near.x - c.x, near.y - (c.y - BODY.centreAboveFeet)) > SENSE_RANGE) continue;
        const cause = c.brain.noticeAppeared(this.perceive(t, c), this.tick, TICKS_PER_SECOND);
        if (cause?.seen) this.events.push({ type: 'noticed', who: c.id, name: t.name, after: ACTIONS[cause.action], cause: describeSeen(cause.seen) });
      }
    }
    this.visible = now;
    this.returned.clear();
  }

  // other creatures close enough to see this one, who can learn from what happens to it
  private watchers(actor: Creature): Creature[] {
    if (actor.hiddenAway) return [];
    return this.creatures.filter((w) => w.id !== actor.id && !w.dead && w.hatching === 0 && !w.hiddenAway && !w.dragged && Math.hypot(w.x - actor.x, w.y - actor.y) <= SENSE_RANGE);
  }

  // what the watcher saw the other one doing it to, as it looks from where the watcher is
  private seenBy(w: Creature, actor: Creature, seen: Percept | null | undefined): Percept | null {
    return seen ? { ...seen, near: nearnessOf(Math.hypot(w.x - actor.x, w.y - actor.y)) } : null;
  }

  private feelGravity(c: Creature): void {
    const bodyY = c.y - BODY.centreAboveFeet;
    c.floating = !c.dragged && this.weightless(c.x, bodyY);
    const zone = this.zones.length > 0 ? this.zoneAt(c.x, bodyY) : null;
    c.field = zone && !c.floating ? this.pullOf(zone) : null;
  }

  // words fade, from the air and from its mind
  private stepVoices(): void {
    for (let i = this.things.length - 1; i >= 0; i--) {
      const t = this.things[i];
      if (t.expires !== undefined && this.tick >= t.expires) this.remove(t.id);
    }
    for (const c of this.creatures) for (const name in c.hearing) if (c.hearing[name] <= this.tick) delete c.hearing[name];
  }

  private carryHeld(c: Creature): void {
    const held = this.thing(c.holding);
    if (!held) return;
    held.x = c.x + c.facing * 6;
    held.y = c.y - BODY.centreAboveFeet * 2 - held.hh - 8;
    held.angle = 0;
    this.previous.delete(held.id);
  }

  private stepRespawns(): void {
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      const r = this.respawns[i];
      if (this.tick < r.at) continue;
      this.respawns.splice(i, 1);
      const back = this.bringBack(r, Math.max(60, Math.min(this.size.width - 60, r.spec.x + this.rng.range(-130, 130))));
      this.returned.add(back.id);
    }
  }

  // it's the same thing coming back, not a new one, so it's still wired up
  private bringBack(r: Respawn, x: number): Thing {
    const fresh = this.add({ ...r.spec, x, y: this.size.floor - 340, angle: 0 }, r.id !== undefined && !this.thing(r.id) ? r.id : undefined);
    fresh.home = r.spec.x;
    for (const w of r.wires ?? []) {
      if (w.from === r.id) this.connect(fresh.id, w.out, w.to, w.in);
      else this.connect(w.from, w.out, fresh.id, w.in);
    }
    return fresh;
  }

  // anything eaten comes back now, for when a room is about to be saved or kept
  finishRespawns(): void {
    for (const r of this.respawns) this.returned.add(this.bringBack(r, r.spec.x).id);
    this.respawns = [];
  }

  private stepCreature(c: Creature): void {
    c.walking = false;
    c.wantVx = 0;
    c.wantVy = 0;
    c.climbing = false;
    if (c.hatching > 0) {
      if (--c.hatching === 0) {
        c.pause = TICKS_PER_SECOND;
        this.events.push({ type: 'hatched', who: c.id });
      }
      return;
    }
    if (c.dead || c.dragged) return;
    if (c.stunned > 0) {
      c.stunned--;
      c.wantVx = null; // leave it flying from the slap
      return;
    }
    if (c.shoved) {
      c.shoved--;
      c.wantVx = null; // and from a push, though it carries on with what it was doing once it lands
      return;
    }
    if (!c.doing) {
      if (--c.pause <= 0 && !this.nextOrder(c)) this.think(c);
      return;
    }
    this.act(c, c.doing);
  }

  private think(c: Creature): void {
    const bodyY = c.y - BODY.centreAboveFeet;
    c.blockedAt ??= {};
    for (const id in c.cantReach) {
      // something it couldn't get to that has since moved might be easy to get to now
      const was = c.blockedAt[id];
      const now = this.targetOf(Number(id));
      const moved = was && now && Math.hypot(now.x - was.x, now.y - was.y) > 120;
      if (c.cantReach[id] <= this.tick || moved) {
        delete c.cantReach[id];
        delete c.blockedAt[id];
      }
    }
    const others = this.othersInSight(c)
      .filter((o) => !c.cantReach[o.id])
      .map((o) => ({ id: o.id, percept: this.perceiveCreature(o, c), distance: Math.max(0, Math.hypot(o.x - c.x, o.y - c.y) - BODY.radius) / SENSE_RANGE, x: o.x, y: o.y - BODY.centreAboveFeet }));
    const things = this.things
      .filter((t) => !t.dragged && !c.cantReach[t.id] && canSee(t))
      .map((t) => {
        const near = closestPoint(t, c.x, bodyY);
        return { id: t.id, percept: this.perceive(t, c), distance: Math.hypot(near.x - c.x, near.y - bodyY) / SENSE_RANGE, x: t.x, y: t.y };
      })
      .concat(others)
      .filter((t) => t.distance <= 1)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, MOST_THINGS_NOTICED);
    const energy = this.drive('Energy', c);
    const needs = this.needs(c);
    const decision = c.brain.decide(things, needs, energy ? needOf(energy) : 0, c.holding !== null, this.tick, this.rng);
    this.events.push({ type: 'decided', who: c.id, decision, told: false });
    // if it's doing this for what it thinks will come of it, the chain it worked out goes in its thoughts
    if (decision.chosen.percept && c.brain.reason(decision, needs) === 'planned') {
      const steps = c.brain.planSteps(decision.chosen.percept, ACTIONS.indexOf(decision.action), needs);
      if (steps.length) this.events.push({ type: 'planned', who: c.id, steps });
    }
    this.start(c, decision.action, decision.chosen.thingId);
  }

  private secondsToReach(c: Creature, targetId: number | null): number {
    const target = this.targetOf(targetId);
    if (!target) return 3;
    return Math.min(20, Math.abs(target.x - c.x) / (WALK_SPEED * c.brain.genes.pace) + 3);
  }

  private start(c: Creature, action: Action, targetId: number | null, order?: Order): void {
    // left to itself it gives up on a long walk. told to go, it keeps going however far it is
    const target = this.targetOf(targetId);
    const walkTime = order && target ? Math.abs(target.x - c.x) / (WALK_SPEED * c.brain.genes.pace) + 5 : this.secondsToReach(c, targetId);
    // the worse it feels, the further it goes looking, so it can't starve just because the food is out of sight
    const roam = this.rng.range(1.5, 3) + this.worstNeed(c) * 7;
    const seconds = { approach: walkTime, avoid: 2, touch: walkTime, grab: walkTime, push: walkTime, drop: 0.3, rest: 3, call: 1, wander: roam }[action];
    // it keeps heading the same way when it wanders, which covers ground far better than turning at random. somewhere it
    // was hurt, it heads away. otherwise it often drifts back towards somewhere good things happened.
    if (action === 'wander') {
      const bodyY = c.y - BODY.centreAboveFeet;
      const bad = c.brain.placeValue(c.x, bodyY) < -0.15 ? c.brain.worstNear(c.x, bodyY) : null;
      const fav = bad ? null : c.brain.favourite();
      if (bad) c.heading = c.x >= bad.x ? 1 : -1;
      else if (fav && Math.abs(fav.x - c.x) > 150 && this.rng.next() < fav.value) c.heading = fav.x > c.x ? 1 : -1;
      else if (this.rng.next() < 0.2) c.heading *= -1;
      // there's nothing to find by walking into a wall, so near one it sets off the other way
      if (c.x < WALL_MARGIN && c.heading < 0) c.heading = 1;
      else if (c.x > this.size.width - WALL_MARGIN && c.heading > 0) c.heading = -1;
    }
    if (c.floating) c.headingY = action === 'wander' ? this.rng.range(-0.8, 0.8) : 0;
    c.doing = {
      action,
      targetId,
      start: this.tick,
      until: this.tick + Math.round(seconds * TICKS_PER_SECOND),
      needStart: this.needs(c),
      told: !!order,
      remember: order?.remember,
    };
    this.circuit.actionStarted(action, c.id);
    c.stuck = 0;
    c.lastX = c.x;
    if (action === 'call') {
      this.events.push({ type: 'called', who: c.id });
      // if it knows a word for what's on its mind, that's what comes out
      const word = c.brain.wordFor();
      if (word) this.say(word, c.x, c.y - 90, c.id);
    }
    if (action === 'drop') this.dropHeld(c);
  }

  private act(c: Creature, doing: Doing): void {
    if (needsTarget(doing.action)) {
      const target = this.targetOf(doing.targetId);
      // the only thing it can do to something it's carrying is touch it, which is how it eats it
      if (!target || (target.heldBy && doing.action !== 'touch')) return this.endAction(true, c);
      const bodyY = c.y - BODY.centreAboveFeet;
      const near = closestPoint(target, c.x, bodyY);
      const gap = near.x - c.x;
      const inReach = Math.hypot(gap, near.y - bodyY) <= REACH;
      if (c.floating) return this.actFloating(c, doing, target, near, inReach);
      if (doing.action !== 'avoid' && !inReach && this.takeRoute(c, doing, target)) {
        if (this.tick >= doing.until) this.endAction(false, c);
        return;
      }
      if (doing.action === 'avoid') {
        this.walk(c, target.x >= c.x ? -1 : 1, 1);
      } else if (doing.action === 'approach') {
        if (Math.abs(gap) <= REACH + 40) return this.endAction(true, c);
        this.walk(c, Math.sign(gap), 1);
      } else if (inReach) {
        c.facing = Math.sign(target.x - c.x) || c.facing;
        return this.reach(c, doing, target);
      } else {
        // right underneath something it can't get up to, so there's no point standing there
        if (Math.abs(gap) < 4) return this.endAction(false, c);
        this.walk(c, Math.sign(gap), 1);
      }
      if (this.gaveUp(c)) return this.endAction(false, c);
      if (this.tick >= doing.until) return this.endAction(doing.action === 'avoid', c);
      return;
    } else if (doing.action === 'wander') {
      // an easy stroll when all is well, hurrying when it needs something
      this.walk(c, c.heading, 0.7 + 0.5 * this.worstNeed(c));
      if (c.floating) c.wantVy = c.headingY * WALK_SPEED * c.brain.genes.pace;
      if (this.gaveUp(c)) {
        c.heading *= -1; // something's in the way, so go back the other way
        c.stuck = 0;
      }
    }
    if (this.tick >= doing.until) this.endAction(true, c);
  }

  // with nothing pulling on it, it just goes straight there, walking on the air
  private actFloating(c: Creature, doing: Doing, target: Thing, near: { x: number; y: number }, inReach: boolean): void {
    const dx = near.x - c.x;
    const dy = near.y - (c.y - BODY.centreAboveFeet);
    const distance = Math.hypot(dx, dy) || 1;
    if (doing.action === 'approach' && distance <= REACH + 40) return this.endAction(true, c);
    if (doing.action !== 'avoid' && doing.action !== 'approach' && inReach) {
      c.facing = Math.sign(target.x - c.x) || c.facing;
      return this.reach(c, doing, target);
    }
    const away = doing.action === 'avoid' ? -1 : 1;
    const speed = WALK_SPEED * c.brain.genes.pace;
    this.walk(c, Math.sign(dx * away) || c.facing, 0);
    c.wantVx = (dx / distance) * speed * away;
    c.wantVy = (dy / distance) * speed * away;
    if (this.tick >= doing.until) this.endAction(doing.action === 'avoid', c);
  }

  // everything that could be stood on, as it is right now
  private ledges(target: Thing): Ledge[] {
    const ledges: Ledge[] = [{ id: -1, left: 0, right: this.size.width, top: this.size.floor, bottom: this.size.height, climbable: false, solid: true, fixed: true, zone: false }];
    for (const t of this.things) {
      if (t.id === target.id || t.inBody || t.dragged || t.heldBy || t.voice || t.part?.kind === 'zone') continue;
      if (t.part && !t.solid) continue;
      if (!t.solid && !t.climbable) continue;
      if (!t.fixed && (Math.abs(t.vx) > 5 || Math.abs(t.vy) > 5)) continue;
      if (Math.abs(Math.sin(t.angle)) > 0.15 && !t.climbable) continue;
      if (t.hw < 12 && !t.climbable) continue;
      ledges.push({ id: t.id, left: t.x - t.hw, right: t.x + t.hw, top: t.y - t.hh, bottom: t.y + t.hh, climbable: !!t.climbable, solid: t.solid, fixed: t.fixed, zone: false });
    }
    for (const z of this.zones) if ((z.part?.pull ?? 0) === 0) ledges.push({ id: z.id, left: z.x - z.hw, right: z.x + z.hw, top: z.y + z.hh, bottom: z.y + z.hh, climbable: false, solid: false, fixed: false, zone: true });
    return ledges;
  }

  // true if it's getting there by jumping or climbing, instead of just walking
  private takeRoute(c: Creature, doing: Doing, target: Thing): boolean {
    if (c.leap) return this.carryOnLeap(c);
    let route = this.routes.get(c.id);
    if (!route || this.tick - route.at >= ROUTE_EVERY) {
      const step = planRoute(this.ledges(target), c.x, c.y, target, (zone) => target.x >= zone.left && target.x <= zone.right && target.y < zone.top);
      route = { at: this.tick, step };
      this.routes.set(c.id, route);
    }
    const step = route.step;
    if (!step || step.kind === 'walk') return false;
    // a route takes longer than it looks like it should, so it gets more time
    if (doing.until < this.tick + 3 * TICKS_PER_SECOND) doing.until = this.tick + 3 * TICKS_PER_SECOND;
    if (step.kind === 'jump') {
      if (Math.abs(c.x - step.launchX) > 8) {
        this.walk(c, Math.sign(step.launchX - c.x), 1);
      } else if (this.physics.creatureGrounded(c.id)) {
        // high enough to clear the edge, and long enough in the air to get across
        const up = Math.sqrt(2 * GRAVITY * (Math.max(0, step.rise) + 60));
        const across = (GRAVITY * (Math.max(step.gap, 20) + 40)) / LEAP_SPEED / 2;
        c.hopSpeed = Math.min(Math.sqrt(2 * GRAVITY * (JUMP_RISE + 70)), Math.max(up, across, 300));
        c.hop = true;
        c.leap = { kind: 'jump', landX: step.landX, top: step.top, left: step.left, right: step.right, solid: true, startedAt: this.tick };
        this.routes.delete(c.id);
      }
      return true;
    }
    const ledge = step.ledge;
    // up the side of it, or straight up if it's something it can pass through, like a ladder
    const spot = ledge.solid ? (c.x < ledge.left ? ledge.left - BODY.radius - 1 : c.x > ledge.right ? ledge.right + BODY.radius + 1 : c.x < (ledge.left + ledge.right) / 2 ? ledge.left - BODY.radius - 1 : ledge.right + BODY.radius + 1) : Math.max(ledge.left, Math.min(ledge.right, c.x));
    if (Math.abs(c.x - spot) > 6) {
      this.walk(c, Math.sign(spot - c.x), 1);
      return true;
    }
    // at the top of something solid it can step on. at the top of a ladder it steps off towards what it's after
    c.leap = { kind: 'climb', landX: ledge.solid ? (ledge.left + ledge.right) / 2 : target.x, top: ledge.top, left: ledge.left, right: ledge.right, solid: ledge.solid, startedAt: this.tick };
    this.routes.delete(c.id);
    return this.carryOnLeap(c);
  }

  private carryOnLeap(c: Creature): boolean {
    const leap = c.leap as Leap;
    const speed = WALK_SPEED * c.brain.genes.pace;
    const aboveIt = c.y <= leap.top + 2;
    if (leap.kind === 'climb') {
      c.climbing = true;
      c.walking = true;
      if (!aboveIt) {
        c.wantVy = -speed;
        c.wantVx = leap.solid ? Math.sign(leap.landX - c.x) * 20 : 0;
      } else {
        c.wantVy = -8;
        c.wantVx = Math.sign(leap.landX - c.x) * speed;
        const onTop = leap.solid && c.x > leap.left + BODY.radius && c.x < leap.right - BODY.radius;
        const offTheLadder = !leap.solid && (c.x < leap.left - BODY.radius * 2 || c.x > leap.right + BODY.radius * 2);
        if (onTop || offTheLadder) {
          c.climbing = false;
          c.leap = null;
        }
      }
      if (this.tick - leap.startedAt > 12 * TICKS_PER_SECOND) c.leap = null;
      return true;
    }
    const inTheAir = this.tick - leap.startedAt > 4 && !this.physics.creatureGrounded(c.id);
    const landed = this.tick - leap.startedAt > 4 && !inTheAir;
    if (landed || this.tick - leap.startedAt > 5 * TICKS_PER_SECOND) {
      c.leap = null;
      return true;
    }
    // it can't go across while it's still below the edge, or it just bangs into the side
    const atTheSide = c.y > leap.top + 10 && c.x + BODY.radius > leap.left && c.x - BODY.radius < leap.right;
    c.wantVx = atTheSide ? 0 : Math.sign(leap.landX - c.x) * (Math.abs(leap.landX - c.x) < 6 ? 0 : LEAP_SPEED);
    c.facing = Math.sign(leap.landX - c.x) || c.facing;
    return true;
  }

  // blocked by something: hop to try getting over it, then give up if that doesn't work
  private gaveUp(c: Creature): boolean {
    if (Math.abs(c.x - c.lastX) < WALK_SPEED * c.brain.genes.pace * DT * 0.25) c.stuck++;
    else c.stuck = 0;
    c.lastX = c.x;
    if (c.stuck === 8 && this.physics.creatureGrounded(c.id)) {
      c.hopSpeed = 430;
      c.hop = true;
    }
    return c.stuck > 40;
  }

  private reach(c: Creature, doing: Doing, target: Thing): void {
    const other = this.index.has(target.id) ? undefined : this.creatureById(target.id);
    if (other) {
      if (doing.action === 'touch') this.cuddle(c, other);
      else if (doing.action === 'push' && !other.dragged) {
        this.physics.knockCreature(other.id, c.facing * 220, -150);
        other.shoved = Math.round(0.4 * TICKS_PER_SECOND);
      }
      return this.endAction(true, c);
    }
    if (doing.action === 'touch') {
      this.touched(c, target);
    } else if (doing.action === 'push') {
      if (!target.fixed) {
        // heavy things barely budge
        const strength = Math.min(1, 12 / Math.max(1, this.physics.massOf(target.id)));
        target.vx = c.facing * 330 * strength;
        target.vy = -120 * strength;
        this.physics.setVelocity(target.id, target.vx, target.vy);
      }
    } else if (doing.action === 'grab') {
      if (!target.fixed && boundingRadius(target) <= CARRY_SIZE && this.physics.massOf(target.id) <= CARRY_MASS) {
        c.holding = target.id;
        target.heldBy = true;
        target.vx = target.vy = target.spin = 0;
        this.physics.rebuild(target);
      }
    }
    this.endAction(true, c);
  }

  // touching another creature is a cuddle, which both of them can feel. it happens right now, like any touch, so
  // whatever it does for this one counts for the action that's just finishing
  private cuddle(c: Creature, other: Creature): void {
    const before = this.needs(c);
    this.circuit.feel('cuddled', other.id);
    this.circuit.feelNow('cuddled', c.id);
    this.circuit.takeCaused(c.id);
    this.readDrives(c, true);
    let helped = false;
    for (const drive of c.drives) if (drive.kind === 'drive' && needOf(drive) < before[drive.channel]) helped = true;
    c.facing = Math.sign(other.x - c.x) || c.facing;
    if (!other.doing && !other.dragged) other.facing = Math.sign(c.x - other.x) || other.facing;
    this.events.push({ type: 'touched', who: c.id, thingId: other.id, name: other.name, ate: helped, fatal: c.dead, cuddle: true });
    this.events.push({ type: 'cuddled', who: c.id, other: other.id });
  }

  // everything a touch sets off happens right now, so it counts for the action that's just finishing
  private touched(c: Creature, target: Thing): void {
    const before = this.needs(c);
    let ate = false;
    if (target.give) ate = this.giveTo(target.give.drive, target.give.amount, c);
    if (target.part?.kind === 'button') this.circuit.press(target.id, c.id);
    else this.circuit.touch(target.id, c.id);
    this.circuit.takeCaused(c.id);
    this.readDrives(c, true);
    for (const drive of c.drives) if (drive.kind === 'drive' && needOf(drive) < before[drive.channel]) ate = true;
    this.events.push({ type: 'touched', who: c.id, thingId: target.id, name: target.name, ate, fatal: c.dead });
    if (target.eaten) {
      const doing = c.doing;
      if (doing) doing.targetId = null; // so removing it doesn't end the action before it has learned from it
      if (target.respawnSeconds) {
        const wires = this.wires.filter((w) => w.from === target.id || w.to === target.id);
        this.respawns.push({ spec: { ...specOf(target), x: target.home }, at: this.tick + Math.round(target.respawnSeconds * TICKS_PER_SECOND), id: target.id, wires });
      }
      this.remove(target.id);
    }
  }

  private walk(c: Creature, dir: number, pace: number): void {
    c.facing = dir;
    c.walking = true;
    c.wantVx = dir * WALK_SPEED * pace * c.brain.genes.pace;
  }

  private dropHeld(c: Creature): void {
    const held = this.thing(c.holding);
    c.holding = null;
    if (held) {
      held.heldBy = false;
      held.vx = c.facing * 40;
      this.physics.rebuild(held);
    }
  }

  // ends whatever it's doing and learns from anything that happened to its drives along the way
  endAction(completed = true, c = this.creature): void {
    const doing = c.doing;
    if (!doing) return;
    c.doing = null;
    c.leap = null;
    // it remembers it couldn't get there, so it tries something else instead of walking into the same wall
    const what = this.targetOf(doing.targetId);
    if (!completed && doing.targetId !== null) {
      c.cantReach[doing.targetId] = this.tick + FORGET_BLOCKED_AFTER;
      if (what) (c.blockedAt ??= {})[doing.targetId] = { x: what.x, y: what.y };
    }
    if (!completed) {
      this.events.push({ type: 'gaveUp', who: c.id, action: doing.action, name: what?.name ?? '' });
      // the rest of what you told it probably depended on this
      if (doing.told) c.orders = [];
    }
    c.pause = Math.round(0.4 * TICKS_PER_SECOND);
    const felt: { drive: string; amount: number }[] = [];
    for (const drive of c.drives) {
      const start = doing.needStart[drive.channel];
      if (drive.kind === 'nerve' || !drive.wired || start === undefined || start === null) continue;
      const change = start - needOf(drive);
      if (Math.abs(change) >= DRIVE_NOISE_FLOOR) {
        c.brain.rewardDrive(drive.channel, change * DRIVE_REWARD_GAIN, this.tick, TICKS_PER_SECOND);
        c.brain.notePlace(c.x, c.y - BODY.centreAboveFeet, change * DRIVE_REWARD_GAIN);
        felt.push({ drive: drive.name, amount: change * DRIVE_REWARD_GAIN });
        // whatever it was just hearing goes along with what happened, which is how a word comes to mean something
        for (const name in c.hearing) {
          const word = c.brain.driveNames.indexOf(name);
          if (word >= 0) c.brain.rewardDrive(word, change * DRIVE_REWARD_GAIN * 0.6, this.tick, TICKS_PER_SECOND);
        }
      }
    }
    if (felt.length) this.othersSeeFelt(c, felt);
    if (completed && doing.told && doing.remember) {
      c.brain.teach();
      this.events.push({ type: 'taught', who: c.id, action: doing.action, name: what?.name ?? '' });
    }
    c.brain.finishAction(this.tick, completed);
    // a rest is when it goes over what happened lately
    if (completed && doing.action === 'rest') {
      const moments = c.brain.replay(this.tick, TICKS_PER_SECOND);
      if (moments > 0) this.events.push({ type: 'replayed', who: c.id, moments });
    }
  }

  // others nearby saw what doing that did for this one, like eating, and learn a little about it too
  private othersSeeFelt(c: Creature, felt: { drive: string; amount: number }[]): void {
    const trace = c.brain.traces[c.brain.traces.length - 1];
    if (!trace) return;
    for (const w of this.watchers(c)) {
      const lessons: { channel: number; amount: number }[] = [];
      for (const f of felt) {
        const channel = w.brain.driveNames.indexOf(f.drive);
        if (channel >= 0 && w.brain.kinds[channel] === 'drive') lessons.push({ channel: channel + 1, amount: f.amount });
      }
      if (!lessons.length) continue;
      w.brain.watched(this.seenBy(w, c, trace.seen), trace.action, lessons);
      if (w.brain.learning && w.brain.abilities.watching) {
        const good = lessons.reduce((sum, l) => sum + l.amount, 0) > 0;
        this.events.push({ type: 'watched', who: w.id, other: c.id, what: good ? 'ate' : 'hurt', action: ACTIONS[trace.action], name: trace.seen ? describeSeen(trace.seen) : '' });
      }
    }
  }

  // stops what it's doing without it learning anything, for tests that set up a situation
  interrupt(c = this.creature): void {
    c.doing = null;
    c.pause = 1;
    c.stunned = 0;
    this.dropHeld(c);
    const last = c.brain.traces[c.brain.traces.length - 1];
    if (last && last.end === null) last.end = this.tick;
  }

  takeEvents(): WorldEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  save(): string {
    this.syncFamily();
    return JSON.stringify({
      version: SAVE_VERSION,
      tick: this.tick,
      rng: this.rng.state,
      nextId: this.nextId,
      things: this.things,
      wires: this.wires,
      nextWireId: this.circuit.nextWireId,
      respawns: this.respawns,
      textures: this.textures,
      creatures: this.creatures.map((c) => ({ ...c, brain: c.brain.save() })),
      focusId: this.focusId,
      family: this.family,
      uidSalt: this.uidSalt,
      size: this.size,
      gravity: this.gravity,
      trial: this.trial,
    });
  }

  static load(text: string): World {
    const saved = migrate(JSON.parse(text));
    const world = new World({ seed: 0, things: [], body: 'blank', size: saved.size, gravity: saved.gravity });
    world.trial = saved.trial ?? null;
    world.tick = saved.tick;
    world.rng.state = saved.rng;
    world.nextId = saved.nextId;
    world.respawns = saved.respawns;
    world.textures = saved.textures;
    for (const t of saved.things as Thing[]) {
      // nobody is holding anything the moment a save is opened
      t.dragged = false;
      world.things.push(t);
      world.index.set(t.id, t);
      world.physics.add(t);
    }
    world.circuit.sync();
    world.circuit.nextWireId = saved.nextWireId;
    world.circuit.setWires(saved.wires);
    world.family = saved.family;
    world.uidSalt = saved.uidSalt;
    world.physics.removeCreature(world.creatures[0].id);
    world.creatures = [];
    world.previousCreatures.clear();
    // cantReach and heading arrived partway through an old version, so a save may not have them yet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of saved.creatures as any[]) {
      const creature: Creature = { ...c, look: cleanLook(c.look), hatching: c.hatching ?? 0, cantReach: c.cantReach ?? {}, blockedAt: c.blockedAt ?? {}, heading: c.heading ?? 1, orders: c.orders ?? [], hearing: c.hearing ?? {}, wantVy: 0, floating: false, climbing: false, hopSpeed: 430, leap: null, hiddenAway: false, field: null, headingY: 0, dead: c.dead ?? false, deaths: c.deaths ?? 0, lastDeath: c.lastDeath ?? null, dragged: false, brain: Brain.load(c.brain) };
      world.creatures.push(creature);
      world.physics.addCreature(creature.id, creature.x, creature.y);
      world.physics.placeCreature(creature.id, creature.x, creature.y);
      world.previousCreatures.set(creature.id, { x: creature.x, y: creature.y });
      world.family[creature.uid] ??= { uid: creature.uid, name: creature.name, look: creature.look, parents: [], generation: 0 };
    }
    world.focusId = saved.focusId;
    // a creature from before bodies were wires gets the same body, as real wires, with its hunger as it was
    if (saved.starterValues) world.addRoom(starterBody(100 - saved.starterValues.food, saved.starterValues.energy));
    world.syncSockets();
    world.syncZones();
    for (const c of world.creatures) {
      world.modernise(c);
      world.learnToCuddle(c);
    }
    return world;
  }

  // a creature from a file joins the room, with its own insides and its family tree. if this replaces someone, they go.
  // null if the room is full.
  adoptCreature(data: CreatureData, replacing?: Creature): Creature | null {
    if (!replacing && this.creatures.length >= MOST_CREATURES) return null;
    for (const kin of cleanFamily(data.family)) this.family[kin.uid] ??= kin;
    // the same creature opened twice is a twin, with the same parents but a tree position of its own
    const twin = !data.uid || this.creatures.some((c) => c.uid === data.uid);
    const c = this.addCreature({ name: data.name, look: data.look }, this.rng.range(this.size.width / 2 - 200, this.size.width / 2 + 200), data.parents, data.generation);
    if (!twin && data.uid) {
      delete this.family[c.uid];
      c.uid = data.uid;
      this.family[c.uid] = { uid: c.uid, name: c.name, look: c.look, parents: data.parents, generation: data.generation };
    }
    c.lastBaby = null;
    c.dead = data.dead;
    c.deaths = data.deaths;
    c.lastDeath = data.lastDeath;
    c.hatching = data.hatching;
    c.bornTick = this.tick - data.age;
    c.brain = Brain.load({ ...data.brain, concepts: data.brain.concepts.map((concept) => ({ ...concept, lastUsed: this.tick - concept.lastUsed })) });
    this.addRoom(data.body);
    this.syncSockets();
    this.modernise(c);
    this.learnToCuddle(c);
    if (replacing) this.removeCreature(replacing.id);
    this.focusId = c.id;
    this.physics.wakeAll();
    return c;
  }

  // physics lives outside javascript's memory, so a world has to be let go of when finished with
  dispose(): void {
    this.physics.dispose();
  }
}

// the circuit behind a part isn't something it looks at. a button is, because pressing one is how it gets to use
// what you've built, and so is anything you've made solid, because it's in the way.
function canSee(t: Thing): boolean {
  if (t.hidden) return false; // what you can't see, it can't either
  return !t.part || t.part.kind === 'button' || t.solid;
}

// what goes in a file: only what you built, not words hanging in the air or things a spawner made
function belongsInFile(t: Thing): boolean {
  return !t.inBody && !t.voice && !t.spawned;
}

const wordChannel = (word: string): string => `"${word}"`;
const describeSeen = (p: Percept): string => `${p.size} ${p.colour} ${p.shape}`;

// old saves are brought up to date here, one version at a time, so nobody loses a creature to an update
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrate(saved: any): any {
  if (saved.version === 1) saved = migrateV1(saved);
  if (saved.version === 2) saved = { ...saved, version: 3, wires: [], nextWireId: 1 };
  if (saved.version === 3) saved = migrateV3(saved);
  if (saved.version === 4) saved = { ...saved, version: 5, textures: {} };
  if (saved.version === 5) saved = migrateV5(saved);
  if (saved.version === 6) saved = { ...saved, version: 7, size: ROOM };
  if (saved.version === 7) saved = { ...saved, version: 8, gravity: { strength: 1, direction: 90 } };
  if (saved.version === 8) saved = { ...saved, version: 9 }; // Food turns into Hunger when it's opened, once the wires are there to change
  if (saved.version === 9) saved = migrateV9(saved);
  if (saved.version !== SAVE_VERSION) throw new Error(`Save version ${saved.version} isn't one this build can read`);
  return saved;
}

// version 9 brains had no places, recent moments or idea of what makes what appear. they start with none, and fill
// them up from what happens next, like a baby would
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateV9(saved: any): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const creatures = saved.creatures.map((c: any) => ({ ...c, brain: { ...c.brain, episodes: [], places: [], effects: [] } }));
  return { ...saved, version: 10, creatures };
}

// version 5 only ever had one creature, so everything inside was its
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateV5(saved: any): any {
  const { creature, brain, ...rest } = saved;
  const id = saved.nextId;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const claim = (t: any): void => {
    if (t.inBody) t.owner = id;
    if (t.live?.inside) t.live.inside = t.live.inside.map((who: unknown) => (who === 'creature' ? id : who));
    t.inner?.things?.forEach(claim);
  };
  saved.things.forEach(claim);
  return { ...rest, version: 6, nextId: id + 1, focusId: id, family: {}, uidSalt: `old${(saved.rng >>> 0).toString(36)}`, creatures: [{ ...creature, id, uid: `old${(saved.rng >>> 0).toString(36)}-${id.toString(36)}`, lastBaby: null, brain }] };
}

// version 3 had food and energy built in. they're wires now, which it gets when it loads
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateV3(saved: any): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const value = (name: string, fallback: number): number => saved.creature.drives?.find((d: any) => d.name === name)?.value ?? fallback;
  const last = saved.brain.traces?.[saved.brain.traces.length - 1];
  if (last && last.end === null) last.end = saved.tick;
  return {
    ...saved,
    version: 4,
    starterValues: { food: value('Food', 55), energy: value('Energy', 90) },
    creature: { ...saved.creature, drives: [], doing: null, pause: TICKS_PER_SECOND },
  };
}

// version 1 was the milestone 0 room: 900 wide with the floor at 420, and every thing just had a radius
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateV1(saved: any): any {
  const OLD = { width: 900, floor: 420 };
  const shiftX = (ROOM.width - OLD.width) / 2;
  const shiftY = ROOM.floor - OLD.floor;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const convert = (t: any): any => {
    const { radius, shape, spin: _spin, ...rest } = t;
    return {
      ...PROPERTY_DEFAULTS,
      ...rest,
      form: shape === 'square' ? 'box' : shape,
      hw: radius,
      hh: radius,
      x: t.x + shiftX,
      y: t.y === undefined ? undefined : t.y + shiftY,
    };
  };
  return {
    ...saved,
    version: 2,
    things: saved.things.map((t: { x: number; id: number }) => ({
      ...convert(t),
      spin: 0,
      vx: 0,
      vy: 0,
      home: t.x + shiftX,
    })),
    respawns: saved.respawns.map((r: { spec: unknown; at: number }) => ({ spec: convert(r.spec), at: r.at })),
    creature: {
      ...saved.creature,
      x: saved.creature.x + shiftX,
      y: saved.creature.y + shiftY,
      doing: null,
      pause: TICKS_PER_SECOND,
      heading: 1,
      dragged: false,
      wantVx: 0,
      hop: false,
      stuck: 0,
      lastX: saved.creature.x + shiftX,
      cantReach: {},
    },
  };
}
