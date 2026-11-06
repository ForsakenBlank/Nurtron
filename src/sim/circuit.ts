// runs the wires. the rule that makes loops safe, from the plan: a label with a pulse wired to it only changes when
// that pulse arrives. everything else passes along instantly within one tick. someone can still build a true
// endless loop, so it gets cut off and the wires involved flash red, rather than freezing the game.
import { portKind, toNumber, toTruth } from './parts.ts';
import type { CompareOp, LogicOp, MathOp, MotorMode, Value } from './parts.ts';
import { sample } from './rng.ts';
import type { Rng } from './rng.ts';
import { closestPoint, containsPoint } from './shapes.ts';
import type { Creature, Effect, Thing, WorldEvent } from './world.ts';

const MOST_ON_A_WIRE = 32; // no sensible circuit sends a wire this many pulses in one tick
const MOST_PULSES = 4000;
const TROUBLE_TICKS = 24;
const PRESSED_TICKS = 9;
const SHORTEST_TIMER = 1; // ticks
const CREATURE_RADIUS = 20;
const MOST_NUMBER = 1e12;

export interface Wire {
  id: number;
  from: number;
  out: string;
  to: number;
  in: string;
}

// what a part is up to right now, as opposed to how it's set up
export interface Live {
  value?: Value; // label
  roll?: number; // data
  nextAt?: number | null; // timer: the tick it fires on
  on?: boolean; // button that stays on
  until?: number; // button: looks pressed until this tick
  inside?: number[]; // sensor: ids of what's in it, and creatures have ids too
  was?: boolean; // compare, logic, keyboard, mouse, collision: what it gave last tick
  pending?: number[]; // delay: the ticks its pulses come out on
  kids?: number[]; // spawner: the copies it has made
}

export interface MotorOrder {
  thingId: number;
  mode: MotorMode;
  power: number;
  direction: number;
  kick: boolean;
}

export interface CircuitHost {
  tick: number;
  rng: Rng;
  things: Thing[];
  creatures: Pick<Creature, 'id' | 'x' | 'y' | 'doing' | 'dead'>[];
  creature: Pick<Creature, 'id'>; // the one the player is looking at
  events: WorldEvent[];
  dieFromWire(owner: number, caused: boolean): void;
  effect(effect: Effect): void;
  touching(t: Thing, tag: string): number[];
  keysDown: Set<string>;
  keysTapped: Set<string>;
  pointer: { x: number; y: number; down: boolean };
  thing(id: number | null): Thing | undefined;
}

const key = (id: number, port: string): string => `${id}:${port}`;

export class Circuit {
  wires: Wire[] = [];
  nextWireId = 1;
  private host: CircuitHost;
  private parts: Thing[] = [];
  private byId = new Map<number, Thing>();
  private into = new Map<string, Wire[]>();
  private outOf = new Map<string, Wire[]>();
  // who is the creature that set this off, by touching something or doing something. what happens to its drives because
  // of that is what it learns from. if timers ticking away taught it, it would learn that walking makes it hungry, stop
  // looking for food and starve. null means nobody did.
  private queue: { id: number; port: string; who: number | null }[] = [];
  private causedBy = new Set<number>();
  private lastToucher: number | null = null; // who a room's Give goes to when no creature set it off
  private memo = new Map<string, Value | null>();
  private reading = new Map<string, number>(); // what's being worked out, and how long the trail was when it started
  private trail: Wire[] = [];
  private rolling = false; // a pulse is using values right now, so random ones pick again
  private peeking = false; // the screen is looking, which must never change anything
  private kicks: number[] = [];
  private trouble = new Map<number, number>();
  private warnedAt = -Infinity;

  constructor(host: CircuitHost) {
    this.host = host;
  }

  // ---- what's connected ----

  // everything that runs, including what's sealed inside tools
  get allParts(): readonly Thing[] {
    return this.parts;
  }

  sync(): void {
    this.parts = this.host.things.flatMap((t) => (t.part ? [t, ...(t.inner?.things ?? [])] : []));
    this.byId = new Map(this.parts.map((t) => [t.id, t]));
    this.index();
  }

  // a wire to a tool's socket really goes to the part inside it, so this is the one place that needs to know about
  // tools. it's filed under both, because the screen asks about the socket and the circuit about the part.
  private index(): void {
    this.into.clear();
    this.outOf.clear();
    const file = (map: Map<string, Wire[]>, at: string, w: Wire): void => {
      if (!map.has(at)) map.set(at, []);
      (map.get(at) as Wire[]).push(w);
    };
    for (const w of this.wires) {
      const from = this.throughTool(w.from, w.out, 'out');
      const to = this.throughTool(w.to, w.in, 'in');
      if (!from || !to) continue;
      const real: Wire = { id: w.id, from: from.id, out: from.port, to: to.id, in: to.port };
      file(this.into, key(real.to, real.in), real);
      file(this.outOf, key(real.from, real.out), real);
      if (to.id !== w.to) file(this.into, key(w.to, w.in), real);
      if (from.id !== w.from) file(this.outOf, key(w.from, w.out), real);
    }
    for (const t of this.parts) {
      for (const w of t.inner?.wires ?? []) {
        file(this.into, key(w.to, w.in), w);
        file(this.outOf, key(w.from, w.out), w);
      }
    }
  }

  // where this end of a wire really is. null if it's a socket the tool doesn't have.
  private throughTool(id: number, port: string, dir: 'in' | 'out'): { id: number; port: string } | null {
    const t = this.byId.get(id);
    if (!t?.inner || !t.part?.tool) return { id, port };
    const socket = (dir === 'in' ? t.part.tool.ins : t.part.tool.outs).find((p) => p.name === port);
    const inside = socket && t.inner.things[socket.thing];
    return socket && inside ? { id: inside.id, port: socket.port } : null;
  }

  // why a wire can't be connected, or null if it can
  whyNot(from: Thing | undefined, out: string, to: Thing | undefined, inPort: string): string | null {
    if (!from || !to) return 'That end has nothing to connect to.';
    const a = portKind(from, 'out', out);
    const b = portKind(to, 'in', inPort);
    if (!a || !b) return "That part doesn't have that connection.";
    if (!!from.inBody !== !!to.inBody) return "A wire can't go between the room and the inside of a creature.";
    if (from.owner !== to.owner) return "A wire can't go between two different creatures.";
    if (a !== b) {
      if (a === 'body' || b === 'body') return 'A motor can only be attached to a shape.';
      return a === 'pulse' ? "That's a pulse going into a value." : "That's a value going into a pulse.";
    }
    if (from.id === to.id && a === 'body') return "A motor can't be attached to itself.";
    return null;
  }

  // a value input can only listen to one wire, so a new one replaces the old. pulses just add up, so two buttons can
  // press the same counter, and many motors can hold the same thing.
  connect(from: Thing | undefined, out: string, to: Thing | undefined, inPort: string): Wire | null {
    if (this.whyNot(from, out, to, inPort) !== null || !from || !to) return null;
    const single = portKind(to, 'in', inPort) === 'value';
    const replaced = (w: Wire): boolean => w.to === to.id && w.in === inPort && (single || (w.from === from.id && w.out === out));
    this.wires = this.wires.filter((w) => !replaced(w));
    const wire: Wire = { id: this.nextWireId++, from: from.id, out, to: to.id, in: inPort };
    this.wires.push(wire);
    this.index();
    return wire;
  }

  disconnect(id: number): void {
    this.wires = this.wires.filter((w) => w.id !== id);
    this.index();
  }

  disconnectThing(id: number): void {
    if (!this.wires.some((w) => w.from === id || w.to === id)) return;
    this.wires = this.wires.filter((w) => w.from !== id && w.to !== id);
    this.index();
  }

  // puts back wires from a save or an undo. any whose ends aren't there any more are dropped.
  setWires(wires: Wire[]): void {
    const has = (id: number): Thing | undefined => this.host.things.find((t) => t.id === id);
    this.wires = wires.filter((w) => this.whyNot(has(w.from), w.out, has(w.to), w.in) === null);
    for (const w of this.wires) this.nextWireId = Math.max(this.nextWireId, w.id + 1);
    this.index();
  }

  hasInput(id: number, port: string): boolean {
    return this.into.has(key(id, port));
  }

  isTroubled(wireId: number): boolean {
    return (this.trouble.get(wireId) ?? -1) > this.host.tick;
  }

  // ---- things that happen from outside ----

  // when a creature does it, everything happens at once, so whatever it causes counts for the action it's finishing
  press(id: number, who: number | null = null): void {
    const t = this.byId.get(id);
    if (t?.part?.kind !== 'button' || !t.live) return;
    t.live.until = this.host.tick + PRESSED_TICKS;
    if (t.part.latch) t.live.on = !t.live.on;
    if (who !== null) this.lastToucher = who;
    this.queue.push({ id, port: 'pressed', who });
    if (who !== null) this.drain();
  }

  touch(id: number, who: number): void {
    this.lastToucher = who;
    if (!this.outOf.has(key(id, 'touched'))) return;
    this.queue.push({ id, port: 'touched', who });
    this.drain();
  }

  feel(port: 'petted' | 'slapped' | 'died' | 'revived', who: number): void {
    for (const t of this.parts) if (t.part?.kind === 'feel' && t.owner === who) this.queue.push({ id: t.id, port, who });
  }

  actionStarted(action: string, who: number): void {
    for (const t of this.parts) if (t.part?.kind === 'action' && t.owner === who && t.part.action === action) this.queue.push({ id: t.id, port: 'started', who });
  }

  // changes a named value inside a creature. false if it has no such value
  giveTo(name: string, amount: number, owner = this.host.creature.id): boolean {
    let t = this.labelNamed(name, owner);
    // a fruit made for a creature with Food still feeds one with Hunger, and the other way round, since they're opposites
    const other = { food: 'Hunger', hunger: 'Food' }[name.trim().toLowerCase()];
    if (!t && other) {
      t = this.labelNamed(other, owner);
      amount = -amount;
    }
    if (!t?.live) return false;
    t.live.value = this.clamped(t, toNumber(t.live.value ?? 0) + amount);
    return true;
  }

  labelNamed(name: string, owner = this.host.creature.id): Thing | undefined {
    const wanted = name.trim().toLowerCase();
    return this.parts.find((t) => t.owner === owner && t.part?.kind === 'label' && t.name.trim().toLowerCase() === wanted);
  }

  labelNames(owner = this.host.creature.id): string[] {
    return this.parts.filter((t) => t.owner === owner && t.part?.kind === 'label').map((t) => t.name);
  }

  private clamped(t: Thing, value: Value): Value {
    if (typeof value !== 'number') return value;
    const { min, max } = t.part ?? {};
    return Math.max(min ?? -Infinity, Math.min(max ?? Infinity, value));
  }

  // back to how it was set up: labels hold what they started with, timers wait again, and a random Data picks again
  restart(owner: number): void {
    for (const t of this.parts) {
      if (t.owner !== owner || !t.live || !t.part) continue;
      if (t.part.kind === 'label') t.live.value = t.part.value ?? 0;
      else if (t.part.kind === 'timer') t.live.nextAt = null;
      else if (t.part.kind === 'compare') t.live.was = false;
      else if (t.part.kind === 'data') delete t.live.roll;
    }
  }

  // did this creature cause anything since last asked?
  takeCaused(who: number): boolean {
    return this.causedBy.delete(who);
  }

  // what's wired into a port right now, or null if nothing is
  inputValue(id: number, port: string): Value | null {
    const wire = this.into.get(key(id, port))?.[0];
    return wire ? this.peek(wire.from, wire.out) : null;
  }

  // what's on a port right now, for the screen to show. it changes nothing.
  peek(id: number, port: string): Value | null {
    this.peeking = true;
    this.memo.clear();
    const value = this.read(id, port);
    this.peeking = false;
    this.memo.clear();
    return value;
  }

  // ---- each tick ----

  step(): MotorOrder[] {
    if (this.parts.length === 0) return [];
    this.memo.clear();
    this.stepTimers();
    this.stepSensors();
    this.stepInputs();
    this.drain();
    this.followValues();
    this.drain();
    return this.motorOrders();
  }

  private stepTimers(): void {
    for (const t of this.parts) {
      if (t.part?.kind !== 'timer' || !t.live) continue;
      // nothing ticks inside a dead creature, so it doesn't come back starving
      if (t.owner !== undefined && this.host.creatures.find((c) => c.id === t.owner)?.dead) continue;
      if (!toTruth(this.input(t, 'on'), true)) {
        t.live.nextAt = null;
        continue;
      }
      if (t.live.nextAt === null || t.live.nextAt === undefined) {
        this.arm(t);
      } else if (this.host.tick >= t.live.nextAt) {
        // a timer that only runs because of what the creature is doing, like resting, counts as the creature's doing
        const gate = this.into.get(key(t.id, 'on'))?.[0];
        const who = gate && this.byId.get(gate.from)?.part?.kind === 'action' ? (t.owner ?? null) : null;
        this.queue.push({ id: t.id, port: 'tick', who });
        this.arm(t);
      }
    }
  }

  private arm(t: Thing): void {
    this.memo.clear();
    this.rolling = true;
    const seconds = toNumber(this.input(t, 'seconds'), t.part?.seconds ?? 1);
    this.rolling = false;
    this.memo.clear();
    (t.live as Live).nextAt = this.host.tick + Math.max(SHORTEST_TIMER, Math.round(seconds * 30));
  }

  private stepSensors(): void {
    for (const t of this.parts) {
      if ((t.part?.kind !== 'sensor' && t.part?.kind !== 'zone') || !t.live) continue;
      const was = t.live.inside ?? [];
      const now = this.whatsInside(t);
      const creature = (id: number): number | null => (this.host.creatures.some((c) => c.id === id) ? id : null);
      for (const id of now) if (!was.includes(id)) this.queue.push({ id: t.id, port: 'entered', who: creature(id) });
      for (const id of was) if (!now.includes(id)) this.queue.push({ id: t.id, port: 'left', who: creature(id) });
      t.live.inside = now;
    }
  }

  // the player's hands, delays coming due and things bumping into each other
  private stepInputs(): void {
    for (const t of this.parts) {
      const kind = t.part?.kind;
      if (!kind || !t.live) continue;
      if (kind === 'keyboard') {
        const down = this.host.keysDown.has(t.part?.key ?? '') || this.host.keysTapped.has(t.part?.key ?? '');
        if (down && !t.live.was) this.queue.push({ id: t.id, port: 'pressed', who: null });
        if (!down && t.live.was) this.queue.push({ id: t.id, port: 'released', who: null });
        t.live.was = down;
      } else if (kind === 'mouse') {
        const down = this.host.pointer.down;
        if (down && !t.live.was) this.queue.push({ id: t.id, port: 'clicked', who: null });
        t.live.was = down;
      } else if (kind === 'delay' && t.live.pending?.length) {
        const due = t.live.pending.filter((at) => at <= this.host.tick).length;
        if (due > 0) t.live.pending = t.live.pending.filter((at) => at > this.host.tick);
        for (let i = 0; i < due; i++) this.queue.push({ id: t.id, port: 'done', who: null });
      } else if (kind === 'hit') {
        const shape = this.attached(t)[0];
        const touching = shape ? this.host.touching(shape, t.part?.tag ?? '') : [];
        const now = touching.length > 0;
        if (now && !t.live.was) this.queue.push({ id: t.id, port: 'hit', who: null });
        t.live.was = now;
        if (t.part?.removes) for (const id of touching) if (this.host.thing(id)) this.host.effect({ kind: 'destroy', id });
      }
    }
  }

  // whatever a part's body wire is holding on to
  private attached(t: Thing): Thing[] {
    return (this.outOf.get(key(t.id, 'drives')) ?? []).map((w) => this.host.thing(w.to)).filter((x): x is Thing => !!x);
  }

  // a part has something to say that didn't come in on a wire
  pulseOut(id: number, port: string): void {
    this.queue.push({ id, port, who: null });
  }

  // someone said a word. the same word in any case counts
  heard(word: string): void {
    for (const t of this.parts) if (t.part?.kind === 'hear' && (t.part.word ?? '').trim().toLowerCase() === word) this.queue.push({ id: t.id, port: 'heard', who: null });
  }

  private whatsInside(sensor: Thing): number[] {
    const tag = sensor.part?.tag ?? '';
    const found: number[] = [];
    if (tag === '' || tag === 'creature') for (const c of this.host.creatures) if (containsPoint(sensor, c.x, c.y - 30, CREATURE_RADIUS)) found.push(c.id);
    for (const t of this.host.things) {
      if (t.part || t.heldBy || t.voice || t.hidden) continue;
      if (tag !== '' && !t.tags?.includes(tag)) continue;
      const near = closestPoint(t, sensor.x, sensor.y);
      if (containsPoint(sensor, near.x, near.y)) found.push(t.id);
    }
    return found;
  }

  private drain(): void {
    const carried = new Map<number, number>();
    for (let head = 0; head < this.queue.length && head < MOST_PULSES; head++) {
      const { id, port, who } = this.queue[head];
      // one moment: a random value used twice by the same pulse is the same value
      this.memo.clear();
      this.rolling = true;
      for (const wire of this.outOf.get(key(id, port)) ?? []) {
        const count = (carried.get(wire.id) ?? 0) + 1;
        carried.set(wire.id, count);
        if (count > MOST_ON_A_WIRE) {
          this.flag(wire);
          continue;
        }
        if (count === 1) this.host.events.push({ type: 'pulse', wireId: wire.id });
        if (who !== null) this.causedBy.add(who);
        this.deliver(wire, who);
      }
      this.rolling = false;
    }
    this.queue.length = 0;
    this.memo.clear();
  }

  private deliver(wire: Wire, who: number | null): void {
    const t = this.byId.get(wire.to);
    if (!t?.part || !t.live) return;
    const kind = t.part.kind;
    if (kind === 'label' && wire.in === 'update') {
      const value = this.input(t, 'set');
      if (value !== null) t.live.value = this.clamped(t, value);
    } else if (kind === 'switch' && wire.in === 'pulse') {
      if (toTruth(this.input(t, 'open'))) this.queue.push({ id: t.id, port: 'pulse', who });
    } else if (kind === 'give' && wire.in === 'give') {
      // inside a creature it's that creature. out in the room it's whoever set it off, or failing that, whoever touched something last
      const owner = t.owner ?? who ?? this.lastToucher ?? this.host.creature.id;
      this.giveTo(t.part.target ?? '', toNumber(this.input(t, 'amount'), t.part.amount ?? 0), owner);
    } else if (kind === 'die' && wire.in === 'die') {
      // out in the room only someone who set it off can die of it, so a button you click can't kill whoever walked past last
      const owner = t.owner ?? who;
      if (owner !== null) this.host.dieFromWire(owner, who === owner);
    } else if (kind === 'random' && wire.in === 'roll') {
      const a = t.part.a ?? 0;
      const b = t.part.b ?? 100;
      // whole numbers if it was asked for whole numbers, because that's nearly always what's wanted
      t.live.roll = Number.isInteger(a) && Number.isInteger(b) ? this.host.rng.int(Math.min(a, b), Math.max(a, b)) : this.host.rng.range(a, b);
    } else if (kind === 'delay' && wire.in === 'go') {
      const seconds = toNumber(this.input(t, 'seconds'), t.part.seconds ?? 1);
      (t.live.pending ??= []).push(this.host.tick + Math.max(1, Math.round(seconds * 30)));
    } else if (kind === 'spawner' && wire.in === 'spawn') {
      const x = this.input(t, 'x');
      const y = this.input(t, 'y');
      for (const shape of this.attached(t)) this.host.effect({ kind: 'spawn', spawner: t.id, template: shape.id, x: x === null ? null : toNumber(x), y: y === null ? null : toNumber(y) });
    } else if (kind === 'destroy' && wire.in === 'destroy') {
      for (const shape of this.attached(t)) this.host.effect({ kind: 'destroy', id: shape.id });
    } else if (kind === 'teleport' && wire.in === 'go') {
      const x = toNumber(this.input(t, 'x'), t.part.a ?? 0);
      const y = toNumber(this.input(t, 'y'), t.part.b ?? 0);
      for (const shape of this.attached(t)) this.host.effect({ kind: 'teleport', id: shape.id, x, y });
    } else if (kind === 'show') {
      for (const shape of this.attached(t)) shape.hidden = wire.in === 'hide';
    } else if (kind === 'paint' && wire.in === 'paint') {
      for (const shape of this.attached(t)) shape.colour = t.part.tint ?? shape.colour;
    } else if (kind === 'sound' && wire.in === 'play') {
      this.host.events.push({ type: 'sound', pitch: toNumber(this.input(t, 'pitch'), t.part.pitch ?? 440), seconds: t.part.seconds ?? 0.2 });
    } else if (kind === 'burst' && wire.in === 'go') {
      const at = this.attached(t)[0] ?? t;
      this.host.events.push({ type: 'burst', x: at.x, y: at.y, colour: t.part.tint ?? 'yellow' });
    } else if (kind === 'say' && wire.in === 'say') {
      const owner = this.host.creatures.find((c) => c.id === t.owner);
      this.host.effect({ kind: 'say', word: t.part.word ?? '', x: owner ? owner.x : t.x, y: owner ? owner.y - 90 : t.y, by: owner ? owner.id : null });
    } else if (kind === 'goal' && wire.in === 'reached') {
      this.host.effect({ kind: 'solved', who });
    } else if (kind === 'timer' && wire.in === 'reset') {
      this.arm(t);
    } else if (kind === 'motor' && wire.in === 'kick') {
      this.kicks.push(t.id);
    }
  }

  // values don't wait for anyone to read them: a label still shows the latest, and a compare still notices turning true
  private followValues(): void {
    for (const t of this.parts) {
      const kind = t.part?.kind;
      if (kind === 'label' && this.hasInput(t.id, 'set')) {
        this.read(t.id, 'value');
      } else if ((kind === 'compare' || kind === 'logic') && t.live) {
        const result = toTruth(this.read(t.id, 'result'));
        if (result && !t.live.was) this.queue.push({ id: t.id, port: 'became', who: null });
        t.live.was = result;
      }
    }
  }

  private motorOrders(): MotorOrder[] {
    const orders: MotorOrder[] = [];
    this.memo.clear();
    for (const t of this.parts) {
      if (t.part?.kind !== 'motor') continue;
      const wires = this.outOf.get(key(t.id, 'drives'));
      if (!wires) continue;
      const kicked = this.kicks.includes(t.id);
      // with nothing telling it when, it just runs, so you see something happen as soon as you attach it
      const told = this.hasInput(t.id, 'on') || this.hasInput(t.id, 'kick');
      const running = this.hasInput(t.id, 'on') ? toTruth(this.input(t, 'on')) : !told;
      if (!running && !kicked) continue;
      const power = Math.max(-200, Math.min(200, toNumber(this.input(t, 'power'), t.part.power ?? 50)));
      const order = { mode: t.part.mode ?? 'push', power, direction: t.part.direction ?? -90 };
      for (const wire of wires) {
        if (running) orders.push({ ...order, thingId: wire.to, kick: false });
        if (kicked) orders.push({ ...order, thingId: wire.to, kick: true });
      }
    }
    this.kicks.length = 0;
    return orders;
  }

  // ---- reading values ----

  private input(t: Thing, port: string): Value | null {
    const wire = this.into.get(key(t.id, port))?.[0];
    if (!wire) return null;
    this.trail.push(wire);
    const value = this.read(wire.from, wire.out);
    this.trail.pop();
    return value;
  }

  private read(id: number, port: string): Value | null {
    const at = key(id, port);
    const known = this.memo.get(at);
    if (known !== undefined) return known;
    if (this.reading.has(at)) {
      // values chasing their own tail, with no pulse to break it up
      if (!this.peeking) {
        for (const wire of this.trail.slice(this.reading.get(at))) this.flag(wire);
      }
      return null;
    }
    this.reading.set(at, this.trail.length);
    const value = this.compute(id, port);
    this.reading.delete(at);
    this.memo.set(at, value);
    return value;
  }

  private compute(id: number, port: string): Value | null {
    const t = this.byId.get(id);
    if (!t?.part || !t.live) return null;
    const part = t.part;
    const live = t.live;
    switch (part.kind) {
      case 'tool': {
        const inside = this.throughTool(id, port, 'out');
        return inside && inside.id !== id ? this.read(inside.id, inside.port) : null;
      }
      case 'label': {
        if (!this.hasInput(id, 'update')) {
          const incoming = this.input(t, 'set');
          if (incoming !== null) {
            const value = this.clamped(t, incoming);
            if (!this.peeking) live.value = value;
            return value;
          }
        }
        return live.value ?? 0;
      }
      case 'data': {
        const data = { base: part.base ?? 0, spread: part.spread ?? 0 };
        if (this.peeking) return live.roll ?? data.base;
        if (this.rolling || live.roll === undefined) live.roll = sample(data, this.host.rng);
        return live.roll;
      }
      case 'button':
        return part.latch ? !!live.on : this.host.tick < (live.until ?? -1);
      case 'math': {
        const a = toNumber(this.input(t, 'a'), part.a ?? 0);
        const b = toNumber(this.input(t, 'b'), part.b ?? 0);
        return calculate(part.op as MathOp, a, b);
      }
      case 'compare': {
        const a = this.input(t, 'a') ?? part.a ?? 0;
        const b = this.input(t, 'b') ?? part.b ?? 0;
        return comparison(part.op as CompareOp, a, b);
      }
      case 'switch':
        // a closed switch gives nothing at all, so whatever it feeds carries on as if it wasn't wired
        return port === 'value' && toTruth(this.input(t, 'open')) ? this.input(t, 'value') : null;
      case 'sensor':
        return port === 'count' ? (live.inside?.length ?? 0) : (live.inside?.length ?? 0) > 0;
      case 'zone':
        return live.inside?.length ?? 0;
      case 'logic': {
        const a = toTruth(this.input(t, 'a'));
        const b = toTruth(this.input(t, 'b'));
        return { and: a && b, or: a || b, not: !a, xor: a !== b }[part.op as LogicOp] ?? false;
      }
      case 'random':
        if (live.roll === undefined) live.roll = part.a ?? 0;
        return live.roll;
      case 'spawner':
        return (live.kids ?? []).filter((kid) => this.host.thing(kid)).length;
      case 'where': {
        const shape = this.attached(t)[0];
        if (!shape) return 0;
        return port === 'x' ? shape.x : port === 'y' ? shape.y : Math.hypot(shape.vx, shape.vy);
      }
      case 'hit':
        return !!live.was;
      case 'keyboard':
        return this.host.keysDown.has(part.key ?? '');
      case 'mouse':
        return port === 'x' ? this.host.pointer.x : port === 'y' ? this.host.pointer.y : this.host.pointer.down;
      case 'action':
        return this.host.creatures.find((c) => c.id === t.owner)?.doing?.action === part.action;
      default:
        return null;
    }
  }

  private flag(wire: Wire): void {
    this.trouble.set(wire.id, this.host.tick + TROUBLE_TICKS);
    if (this.host.tick - this.warnedAt > 90) {
      this.warnedAt = this.host.tick;
      this.host.events.push({ type: 'loop' });
    }
  }
}

function calculate(op: MathOp, a: number, b: number): number {
  const answer = { add: a + b, subtract: a - b, multiply: a * b, divide: b === 0 ? 0 : a / b, min: Math.min(a, b), max: Math.max(a, b), remainder: b === 0 ? 0 : a % b, power: a ** b }[op] ?? 0;
  return Number.isFinite(answer) ? Math.max(-MOST_NUMBER, Math.min(MOST_NUMBER, answer)) : 0;
}

function comparison(op: CompareOp, a: Value, b: Value): boolean {
  const x = toNumber(a, Number.NaN);
  const y = toNumber(b, Number.NaN);
  if (op === 'equal') return Number.isNaN(x) || Number.isNaN(y) ? String(a) === String(b) : x === y;
  return op === 'bigger' ? x > y : x < y;
}
