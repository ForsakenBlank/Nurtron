// draws circuit parts and the wires between them. it only reads the world, the same as the rest of the drawing.
import { BitmapText, Container, Graphics } from 'pixi.js';
import type { Wire } from '../sim/circuit.ts';
import { formatValue, percent, portKind, portsOf, portWorld, toNumber, toTruth } from '../sim/parts.ts';
import type { Part, PortKind } from '../sim/parts.ts';
import type { Colour } from '../sim/senses.ts';
import { needOf } from '../sim/world.ts';
import type { Thing, World, WorldEvent } from '../sim/world.ts';

export const WIRE_COLOURS: Record<PortKind, number> = { value: 0x4fd6c3, pulse: 0xffc24d, body: 0xe8eaf3 };
const TROUBLE = 0xff4d4d;
const PULSE_SECONDS = 0.32;
const MOST_DOTS = 160;
const SYMBOLS: Record<string, string> = { add: '+', subtract: '-', multiply: '×', divide: '÷', min: 'min', max: 'max', bigger: '>', smaller: '<', equal: '=' };

type Pose = { x: number; y: number; angle: number };
type PoseOf = (t: Thing) => Pose;

export const restingPose: PoseOf = (t) => t;

export interface Wiring {
  thingId: number;
  port: string;
  dir: 'in' | 'out';
  kind: PortKind;
  x: number;
  y: number;
}

export interface WireOverlay {
  wiring: Wiring | null;
  hoverWire: number | null;
  hoverPort: { thingId: number; port: string; dir: 'in' | 'out' } | null;
  showPorts: boolean;
  shapePorts: ReadonlySet<number>; // shapes showing their Touched output right now
  inBody: boolean; // looking inside a creature rather than at the room
  owner: number; // which creature, if so
  area: number | null; // whose build area, when looking at one
  playing: boolean; // in Play mode, the only circuitry left showing is what a player would see
}

// whether this is on the canvas being looked at. a thing is on its own build area's canvas too, in the middle
export function showing(t: Thing | undefined, overlay: { inBody: boolean; owner: number; area: number | null }): boolean {
  if (!t) return false;
  if (overlay.area !== null) return t.area === overlay.area || t.id === overlay.area;
  return !!t.inBody === overlay.inBody && t.area === undefined && (!overlay.inBody || t.owner === overlay.owner);
}

// a wire shows when both its ends are on this canvas
const wireShowing = (world: World, wire: Wire, overlay: WireOverlay): boolean => showing(world.thing(wire.from), overlay) && showing(world.thing(wire.to), overlay);

const curve = (a: { x: number; y: number; dx: number; dy: number }, b: { x: number; y: number; dx: number; dy: number }): { x: number; y: number }[] => {
  const handle = Math.max(24, Math.min(150, Math.hypot(b.x - a.x, b.y - a.y) * 0.45));
  const c1x = a.x + a.dx * handle;
  const c1y = a.y + a.dy * handle;
  const c2x = b.x + b.dx * handle;
  const c2y = b.y + b.dy * handle;
  const points: { x: number; y: number }[] = [];
  const steps = 22;
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const m = 1 - s;
    points.push({
      x: m * m * m * a.x + 3 * m * m * s * c1x + 3 * m * s * s * c2x + s * s * s * b.x,
      y: m * m * m * a.y + 3 * m * m * s * c1y + 3 * m * s * s * c2y + s * s * s * b.y,
    });
  }
  return points;
};

// the line a wire follows, or nothing if either end is gone
export function wirePoints(world: World, wire: Wire, poseOf: PoseOf = restingPose): { x: number; y: number }[] {
  const from = world.thing(wire.from);
  const to = world.thing(wire.to);
  if (!from || !to) return [];
  const out = portsOf(from).find((p) => p.dir === 'out' && p.name === wire.out);
  if (!out) return [];
  const a = portWorld(poseOf(from), out);
  if (wire.in === 'body') {
    const pose = poseOf(to);
    return curve(a, { x: pose.x, y: pose.y, dx: 0, dy: 0 });
  }
  const into = portsOf(to).find((p) => p.dir === 'in' && p.name === wire.in);
  return into ? curve(a, portWorld(poseOf(to), into)) : [];
}

interface ChipVisual {
  root: Container;
  g: Graphics;
  title: BitmapText;
  readout: BitmapText;
  ports: BitmapText[];
  portsKey: string; // which ports it had when it was made, since a Chance or Choice can change how many it has
  drawn: string;
}

const portsKeyOf = (t: Thing): string => portsOf(t).map((p) => `${p.dir}${p.name}:${p.label ?? ''}`).join('|');

const text = (size: number, colour = 0xffffff): BitmapText => {
  const t = new BitmapText({ text: '', style: { fontFamily: 'Arial', fontSize: size, fill: 0xffffff } });
  t.tint = colour;
  return t;
};

function clip(s: string, most: number): string {
  return s.length > most ? `${s.slice(0, most - 1)}…` : s;
}

export class CircuitView {
  chips = new Container();
  wires = new Graphics();
  moving = new Graphics(); // pulses, and the wire being dragged out
  private visuals = new Map<number, ChipVisual>();
  private dots: { wireId: number; age: number }[] = [];
  private colours: Record<Colour, number>;
  private frame = 0;
  private wiresDrawn = '';
  private alive = new Map<number, boolean>();
  private paths = new Map<number, { x: number; y: number }[]>();

  constructor(colours: Record<Colour, number>) {
    this.colours = colours;
  }

  handle(events: WorldEvent[]): void {
    for (const event of events) {
      if (event.type !== 'pulse') continue;
      if (this.dots.length >= MOST_DOTS) this.dots.shift();
      this.dots.push({ wireId: event.wireId, age: 0 });
    }
  }

  draw(world: World, zoom: number, dt: number, poseOf: PoseOf, overlay: WireOverlay): void {
    this.frame++;
    this.drawChips(world, poseOf, overlay);
    this.drawWires(world, zoom, dt, poseOf, overlay);
  }

  // ---- parts ----

  private drawChips(world: World, poseOf: PoseOf, overlay: WireOverlay): void {
    const seen = new Set<number>();
    for (const t of world.things) {
      if (!t.part) continue;
      seen.add(t.id);
      const visual = this.visualFor(t);
      visual.root.visible = showing(t, overlay) && (!overlay.playing || t.part.kind === 'label' || t.part.kind === 'button');
      if (!visual.root.visible) continue;
      const pose = poseOf(t);
      visual.root.position.set(pose.x, pose.y);
      visual.root.rotation = pose.angle;
      // reading a circuit takes a moment, so a few each frame is plenty for numbers on a screen
      if ((t.id + this.frame) % 3 === 0 || visual.drawn === '') this.refresh(world, t, visual);
    }
    for (const [id, visual] of this.visuals) {
      if (seen.has(id)) continue;
      visual.root.destroy({ children: true });
      this.visuals.delete(id);
    }
  }

  private visualFor(t: Thing): ChipVisual {
    let visual = this.visuals.get(t.id);
    if (visual && (t.part?.kind !== 'chance' && t.part?.kind !== 'choice' || visual.portsKey === portsKeyOf(t))) return visual;
    if (visual) {
      visual.root.destroy({ children: true });
      this.visuals.delete(t.id);
    }
    const root = new Container();
    const g = new Graphics();
    const title = text(11);
    const readout = text(t.part?.kind === 'label' ? 16 : 11);
    root.addChild(g, title, readout);
    const ports = portsOf(t).map((p) => {
      const label = text(10, 0xb4bad0);
      label.text = p.label ? clip(p.label, 12) : p.name;
      root.addChild(label);
      return label;
    });
    // the big boxes go behind everything, so the parts inside them stay on top
    if (t.part?.kind === 'frame' || t.part?.kind === 'zone' || t.part?.kind === 'sensor') this.chips.addChildAt(root, 0);
    else this.chips.addChild(root);
    visual = { root, g, title, readout, ports, portsKey: portsKeyOf(t), drawn: '' };
    this.visuals.set(t.id, visual);
    return visual;
  }

  private refresh(world: World, t: Thing, v: ChipVisual): void {
    const part = t.part as Part;
    const words = this.readoutOf(world, t);
    if (v.readout.text !== words) v.readout.text = words;
    const name = clip(t.name, part.kind === 'button' ? 16 : Math.max(8, Math.floor(t.hw / 3.2)));
    if (v.title.text !== name) v.title.text = name;

    const round = part.kind === 'button';
    v.title.anchor.set(round ? 0.5 : 0, round ? 0 : 0.5);
    v.title.position.set(round ? 0 : -t.hw + 8, round ? t.hh + 6 : -t.hh + 10);
    v.readout.anchor.set(0.5, 0.5);
    const middle = -t.hh + 20 + (t.hh * 2 - 24) / 2;
    v.readout.position.set(part.kind === 'sensor' || part.kind === 'zone' ? 0 : -2, part.kind === 'sensor' ? 0 : part.kind === 'zone' ? -t.hh + 10 : middle);
    if (part.kind === 'frame') v.title.style.fontSize = 13;

    portsOf(t).forEach((p, i) => {
      const label = v.ports[i];
      if (!label) return;
      label.anchor.set(p.dir === 'in' ? 0 : 1, 0.5);
      label.position.set(round ? p.x + 22 : p.x + (p.dir === 'in' ? 8 : -8), p.y);
      if (round) label.anchor.set(0, 0.5);
    });

    const state = this.stateOf(world, t);
    const drawn = `${t.hw}|${t.hh}|${t.colour}|${t.solid}|${part.pull}|${state}`;
    if (drawn === v.drawn) return;
    v.drawn = drawn;
    this.drawChip(v.g, t, state);
  }

  private readoutOf(world: World, t: Thing): string {
    const part = t.part as Part;
    const live = t.live ?? {};
    const circuit = world.circuit;
    switch (part.kind) {
      case 'label':
        return clip(formatValue(circuit.peek(t.id, 'value')), 11);
      case 'data':
        return part.spread ? `${part.base} ±${part.spread}` : String(part.base);
      case 'timer': {
        if (live.nextAt === null || live.nextAt === undefined) return 'off';
        return `${(Math.max(0, live.nextAt - world.tick) / 30).toFixed(1)}s`;
      }
      case 'math':
        return `${SYMBOLS[part.op ?? 'add']} = ${clip(formatValue(circuit.peek(t.id, 'result')), 7)}`;
      case 'compare':
        return `${SYMBOLS[part.op ?? 'bigger']} ${circuit.peek(t.id, 'result') ? 'yes' : 'no'}`;
      case 'switch':
        return toTruth(circuit.hasInput(t.id, 'open') ? this.inputOf(world, t, 'open') : false) ? 'open' : 'closed';
      case 'sensor':
        return String(live.inside?.length ?? 0);
      case 'motor':
        return part.mode ?? 'push';
      case 'give': {
        const amount = toNumber(this.inputOf(world, t, 'amount'), part.amount ?? 0);
        const words = `${clip(part.target ?? '', 7)} ${amount > 0 ? '+' : ''}${formatValue(amount)}`;
        return circuit.labelNamed(part.target ?? '') ? words : `no ${clip(part.target ?? '', 7)}`;
      }
      case 'drive': {
        const drive = world.creatureById(t.owner ?? -1)?.drives.find((d) => d.socket === t.id);
        if (!drive) return 'name taken';
        return drive.wired ? `needs ${Math.round(needOf(drive) * 100)}%` : 'not wired';
      }
      case 'nerve': {
        const drive = world.creature.drives.find((d) => d.socket === t.id);
        if (!drive) return 'name taken';
        return drive.wired ? `${Math.round(needOf(drive) * 100)}% on` : 'not wired';
      }
      case 'action':
        return part.action ?? '';
      case 'zone':
        return part.pull === 0 ? 'No gravity' : `Gravity ${part.pull}x`;
      case 'logic':
        return `${part.op} ${circuit.peek(t.id, 'result') ? 'yes' : 'no'}`;
      case 'random':
        return formatValue(circuit.peek(t.id, 'value'));
      case 'delay':
        return `${part.seconds ?? 0}s`;
      case 'spawner':
        return `${formatValue(circuit.peek(t.id, 'count'))} of ${part.most}`;
      case 'where':
        return `${Math.round(toNumber(circuit.peek(t.id, 'x')))}, ${Math.round(toNumber(circuit.peek(t.id, 'y')))}`;
      case 'hit':
        return part.tag || 'anything';
      case 'keyboard':
        return part.key === ' ' ? 'Space' : clip(part.key ?? '', 11);
      case 'paint':
      case 'burst':
        return part.tint ?? '';
      case 'sound':
        return `${part.pitch} Hz`;
      case 'say':
      case 'hear':
        return `"${clip(part.word ?? '', 9)}"`;
      case 'tool': {
        const count = t.inner?.things.length ?? 0;
        return `${count} part${count === 1 ? '' : 's'}`;
      }
      case 'combine':
        return `${part.op} = ${clip(formatValue(circuit.peek(t.id, 'result')), 7)}`;
      case 'chance':
        return part.pick === 'each' ? 'each rolls' : 'pick one';
      case 'storage':
        return clip(formatValue(circuit.peek(t.id, 'value')), 10);
      case 'items':
        return `${clip(part.item ?? '', 8)}: ${formatValue(circuit.peek(t.id, 'count'))}`;
      case 'mover':
        return live.anim?.playing ? 'moving' : `${Math.max(0, (part.keys?.length ?? 1) - 1)} keys`;
      case 'hurt':
        return `${part.damage} · hp ${Math.round(toNumber(circuit.peek(t.id, 'hp')))}`;
      case 'choice':
        return live.chose ? clip(live.chose, 11) : `${part.options?.length ?? 0} options`;
      case 'effect': {
        const amount = part.amount ?? 0;
        return `${part.stat} ${amount >= 0 ? '+' : ''}${percent(Math.round(amount * 1000) / 10)}`;
      }
      case 'ability':
        return `${part.style} ${part.damage}`;
      default:
        return '';
    }
  }

  private inputOf(world: World, t: Thing, port: string): ReturnType<World['circuit']['peek']> {
    const wire = world.wires.find((w) => w.to === t.id && w.in === port);
    return wire ? world.circuit.peek(wire.from, wire.out) : null;
  }

  // anything that changes how the part is drawn, as opposed to just its words
  private stateOf(world: World, t: Thing): string {
    const part = t.part as Part;
    const live = t.live ?? {};
    switch (part.kind) {
      case 'button':
        return `${world.tick < (live.until ?? -1)}|${!!live.on}`;
      case 'timer': {
        if (live.nextAt === null || live.nextAt === undefined) return 'off';
        return String(Math.round(Math.max(0, live.nextAt - world.tick) / 3));
      }
      case 'compare':
        return String(!!live.was);
      case 'switch':
        return String(toTruth(this.inputOf(world, t, 'open')));
      case 'sensor':
      case 'zone':
        return String((live.inside?.length ?? 0) > 0);
      case 'motor':
        return `${this.motorRunning(world, t)}|${part.mode}|${part.direction}`;
      case 'action':
        return String(world.creatureById(t.owner ?? -1)?.doing?.action === part.action);
      case 'drive':
      case 'nerve': {
        const drive = (world.creatureById(t.owner ?? -1) ?? world.creature).drives.find((d) => d.socket === t.id);
        return drive?.wired ? String(Math.round(needOf(drive) * 24)) : 'off';
      }
      default:
        return '';
    }
  }

  private motorRunning(world: World, t: Thing): boolean {
    const circuit = world.circuit;
    if (circuit.hasInput(t.id, 'on')) return toTruth(this.inputOf(world, t, 'on'));
    return !circuit.hasInput(t.id, 'kick');
  }

  private drawChip(g: Graphics, t: Thing, state: string): void {
    g.clear();
    const part = t.part as Part;
    const colour = this.colours[t.colour];
    const { hw, hh } = t;
    if (part.kind === 'button') {
      const [pressed, on] = state.split('|').map((s) => s === 'true');
      g.circle(0, 2, hw + 2).fill(0x0d0f16);
      if (on) g.circle(0, 0, hw + 7).fill({ color: colour, alpha: 0.3 });
      g.circle(0, pressed ? 2 : 0, hw - (pressed ? 2 : 0)).fill(pressed || on ? blend(colour, 0xffffff, 0.3) : colour);
      g.circle(-hw * 0.3, -hw * 0.32 + (pressed ? 2 : 0), hw * 0.26).fill({ color: 0xffffff, alpha: 0.35 });
    } else if (part.kind === 'zone') {
      // its header is what you right-click to say what gravity it has
      const noGravity = part.pull === 0;
      g.rect(-hw, -hh, hw * 2, hh * 2).fill({ color: colour, alpha: noGravity ? 0.1 : 0.16 });
      g.rect(-hw, -hh, hw * 2, 20).fill({ color: colour, alpha: 0.7 });
      dashedRect(g, hw, hh, 12);
      g.stroke({ width: 1.5, color: colour, alpha: state === 'true' ? 1 : 0.65 });
    } else if (part.kind === 'frame') {
      // a box to keep parts together, grabbed by its header
      g.roundRect(-hw, -hh, hw * 2, hh * 2, 10).fill({ color: colour, alpha: 0.06 });
      g.roundRect(-hw, -hh, hw * 2, 20, 10).fill({ color: colour, alpha: 0.45 });
      g.rect(-hw, -hh + 10, hw * 2, 10).fill({ color: colour, alpha: 0.45 });
      g.roundRect(-hw, -hh, hw * 2, hh * 2, 10).stroke({ width: 1.5, color: colour, alpha: 0.7 });
    } else if (part.kind === 'sensor') {
      const occupied = state === 'true';
      g.rect(-hw, -hh, hw * 2, hh * 2).fill({ color: colour, alpha: occupied ? 0.2 : 0.07 });
      dashedRect(g, hw, hh, 12);
      g.stroke({ width: 1.5, color: colour, alpha: occupied ? 1 : 0.65 });
    } else {
      g.roundRect(-hw, -hh, hw * 2, hh * 2, 7).fill(0x1c2030);
      const header = blend(0x1c2030, colour, 0.34);
      g.roundRect(-hw, -hh, hw * 2, 20, 7).fill(header);
      g.rect(-hw, -hh + 13, hw * 2, 7).fill(header);
      g.roundRect(-hw, -hh, hw * 2, hh * 2, 7).stroke({ width: 1.2, color: colour, alpha: 0.85 });
      if (part.kind === 'timer' && state !== 'off') {
        const wait = Math.max(1, (part.seconds ?? 1) * 10);
        const left = Math.min(1, Number(state) / wait);
        g.rect(-hw + 2, hh - 4, (hw * 2 - 4) * left, 2).fill({ color: colour, alpha: 0.9 });
      }
      if (part.kind === 'compare' && state === 'true') g.circle(hw - 12, -hh + 10, 4).fill(0x6be3a1);
      if ((part.kind === 'switch' || part.kind === 'action') && state === 'true') g.circle(hw - 12, -hh + 10, 4).fill(0x6be3a1);
      if ((part.kind === 'drive' || part.kind === 'nerve') && state !== 'off') {
        // how much it needs this right now, along the bottom
        g.rect(-hw + 2, hh - 4, (hw * 2 - 4) * (Number(state) / 24), 2).fill(part.kind === 'drive' ? 0xffb454 : colour);
      }
      if (part.kind === 'motor') this.motorMark(g, t, state);
      if (part.kind === 'tool') {
        // a little box, to say there's more in here
        g.roundRect(hw - 19, -hh + 5, 11, 10, 2).stroke({ width: 1.4, color: 0xffffff, alpha: 0.75 });
        g.moveTo(hw - 19, -hh + 9).lineTo(hw - 8, -hh + 9).stroke({ width: 1.4, color: 0xffffff, alpha: 0.75 });
      }
    }
    for (const p of portsOf(t)) drawPort(g, p.kind, p.x, p.y);
  }

  private motorMark(g: Graphics, t: Thing, state: string): void {
    const part = t.part as Part;
    const running = state.startsWith('true');
    const cx = t.hw - 14;
    const cy = -t.hh + 10;
    const colour = running ? 0x6be3a1 : 0x8a90a3;
    if (part.mode === 'spin') {
      g.arc(cx, cy, 5, -2.4, 1.6).stroke({ width: 1.6, color: colour });
    } else {
      const a = ((part.direction ?? 0) * Math.PI) / 180;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      g.moveTo(cx - dx * 6, cy - dy * 6).lineTo(cx + dx * 6, cy + dy * 6).stroke({ width: 1.6, color: colour });
      g.poly([cx + dx * 7, cy + dy * 7, cx + dx * 2 - dy * 4, cy + dy * 2 + dx * 4, cx + dx * 2 + dy * 4, cy + dy * 2 - dx * 4]).fill(colour);
    }
  }

  // ---- wires ----

  private drawWires(world: World, zoom: number, dt: number, poseOf: PoseOf, overlay: WireOverlay): void {
    this.wires.visible = this.moving.visible = !overlay.playing;
    if (overlay.playing) return;
    const px = 1 / zoom;
    const width = Math.max(1.6 * px, 1.8);
    const circuit = world.circuit;

    // laying out hundreds of lines is the slowest part of drawing, and mostly nothing has changed, so they're only
    // laid out again when something has moved or changed how a wire looks
    let look = `${zoom.toFixed(3)}|${overlay.hoverWire}|${overlay.showPorts}|${overlay.inBody}|${overlay.owner}|${overlay.area}`;
    for (const wire of world.wires) {
      if (!wireShowing(world, wire, overlay)) continue;
      // reading a circuit takes a moment, so a few each frame is plenty for how bright a wire is
      if ((wire.id + this.frame) % 3 === 0 || !this.alive.has(wire.id)) this.alive.set(wire.id, toTruth(circuit.peek(wire.from, wire.out)));
      const from = world.thing(wire.from);
      const to = world.thing(wire.to);
      if (!from || !to) continue;
      const a = poseOf(from);
      const b = poseOf(to);
      const troubled = circuit.isTroubled(wire.id);
      look += `|${wire.id},${a.x.toFixed(1)},${a.y.toFixed(1)},${a.angle.toFixed(3)},${b.x.toFixed(1)},${b.y.toFixed(1)},${b.angle.toFixed(3)},${this.alive.get(wire.id)},${troubled ? Math.floor(performance.now() / 45) : ''}`;
    }
    if (look !== this.wiresDrawn) {
      this.wiresDrawn = look;
      this.layOutWires(world, width, poseOf, overlay);
    }

    // everything from here on changes all the time anyway
    const g = this.moving.clear();
    this.dots = this.dots.filter((d) => (d.age += dt) < PULSE_SECONDS && this.paths.has(d.wireId));
    for (const dot of this.dots) {
      const points = this.paths.get(dot.wireId) as { x: number; y: number }[];
      const along = (dot.age / PULSE_SECONDS) * (points.length - 1);
      const i = Math.min(points.length - 2, Math.floor(along));
      const f = along - i;
      const x = points[i].x + (points[i + 1].x - points[i].x) * f;
      const y = points[i].y + (points[i + 1].y - points[i].y) * f;
      g.circle(x, y, 8).fill({ color: WIRE_COLOURS.pulse, alpha: 0.3 });
      g.circle(x, y, 3.8).fill(0xfff3cf);
    }

    // shapes only show their Touched output when it's wanted, since most of them never need it
    for (const id of overlay.shapePorts) {
      const t = world.thing(id);
      if (!t) continue;
      const port = portsOf(t)[0];
      const pose = poseOf(t);
      const at = portWorld(pose, port);
      g.moveTo(at.x - 13, at.y).lineTo(at.x, at.y).stroke({ width: 1.5, color: WIRE_COLOURS.pulse, alpha: 0.7 });
      drawPort(g, 'pulse', at.x, at.y);
    }

    if (overlay.wiring) this.drawWiring(g, world, overlay.wiring, width, poseOf, overlay);
    if (overlay.hoverPort) {
      const t = world.thing(overlay.hoverPort.thingId);
      const port = t && portsOf(t).find((p) => p.name === overlay.hoverPort?.port && p.dir === overlay.hoverPort.dir);
      if (t && port) {
        const at = portWorld(poseOf(t), port);
        g.circle(at.x, at.y, 8).stroke({ width: 2 * px, color: WIRE_COLOURS[port.kind] });
      }
    }
  }

  private layOutWires(world: World, width: number, poseOf: PoseOf, overlay: WireOverlay): void {
    const g = this.wires.clear();
    this.paths.clear();
    for (const wire of world.wires) {
      if (!wireShowing(world, wire, overlay)) continue;
      const points = wirePoints(world, wire, poseOf);
      if (points.length === 0) continue;
      this.paths.set(wire.id, points);
      const kind = kindOf(world, wire);
      const troubled = world.circuit.isTroubled(wire.id);
      const hovered = overlay.hoverWire === wire.id;
      const colour = troubled ? TROUBLE : WIRE_COLOURS[kind];
      let alpha = hovered ? 1 : overlay.showPorts ? 0.9 : 0.72;
      if (troubled) alpha = 0.55 + Math.sin(performance.now() / 45) * 0.45;
      const thick = hovered ? width * 1.7 : width;
      if (kind === 'value') {
        // a value that's currently false or empty looks less alive
        if (!troubled && !hovered && !this.alive.get(wire.id)) alpha *= 0.55;
        polyline(g, points);
        g.stroke({ width: thick, color: colour, alpha });
      } else {
        dashed(g, points, kind === 'pulse' ? 9 : 4, 6);
        g.stroke({ width: kind === 'pulse' ? thick : thick * 1.15, color: colour, alpha });
      }
    }
  }

  // the wire being dragged out, and everywhere it could go
  private drawWiring(g: Graphics, world: World, wiring: Wiring, width: number, poseOf: PoseOf, overlay: WireOverlay): void {
    const t = world.thing(wiring.thingId);
    const port = t && portsOf(t).find((p) => p.name === wiring.port && p.dir === wiring.dir);
    if (!t || !port) return;
    const a = portWorld(poseOf(t), port);
    const points = curve(a, { x: wiring.x, y: wiring.y, dx: 0, dy: 0 });
    const colour = WIRE_COLOURS[wiring.kind];
    polyline(g, points);
    g.stroke({ width: width * 1.3, color: colour });
    g.circle(wiring.x, wiring.y, 4).fill(colour);

    const want = wiring.dir === 'out' ? 'in' : 'out';
    for (const other of world.things) {
      if (!showing(other, overlay)) continue;
      if (wiring.kind === 'body') {
        if (other.id === wiring.thingId) continue;
        const pose = poseOf(other);
        g.circle(pose.x, pose.y, 9).stroke({ width: 2, color: colour, alpha: 0.8 });
        continue;
      }
      for (const p of portsOf(other)) {
        if (p.dir !== want || p.kind !== wiring.kind) continue;
        const at = portWorld(poseOf(other), p);
        g.circle(at.x, at.y, 8).fill({ color: colour, alpha: 0.25 });
        g.circle(at.x, at.y, 8).stroke({ width: 1.5, color: colour });
      }
    }
  }
}

export function kindOf(world: World, wire: Wire): PortKind {
  if (wire.in === 'body') return 'body';
  const from = world.thing(wire.from);
  return (from && portKind(from, 'out', wire.out)) ?? 'value';
}

function drawPort(g: Graphics, kind: PortKind, x: number, y: number): void {
  const colour = WIRE_COLOURS[kind];
  if (kind === 'pulse') {
    g.poly([x, y - 5.5, x + 5.5, y, x, y + 5.5, x - 5.5, y]).fill(colour);
    g.poly([x, y - 5.5, x + 5.5, y, x, y + 5.5, x - 5.5, y]).stroke({ width: 1, color: 0x0d0f16 });
  } else if (kind === 'body') {
    g.rect(x - 4.5, y - 4.5, 9, 9).fill(colour);
    g.rect(x - 4.5, y - 4.5, 9, 9).stroke({ width: 1, color: 0x0d0f16 });
  } else {
    g.circle(x, y, 4.8).fill(colour);
    g.circle(x, y, 4.8).stroke({ width: 1, color: 0x0d0f16 });
  }
}

function polyline(g: Graphics, points: { x: number; y: number }[]): void {
  g.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
}

function dashed(g: Graphics, points: { x: number; y: number }[], on: number, off: number): void {
  let left = on;
  let drawing = true;
  g.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    let x = points[i - 1].x;
    let y = points[i - 1].y;
    let dx = points[i].x - x;
    let dy = points[i].y - y;
    let length = Math.hypot(dx, dy);
    if (length === 0) continue;
    dx /= length;
    dy /= length;
    while (length > left) {
      x += dx * left;
      y += dy * left;
      if (drawing) g.lineTo(x, y);
      else g.moveTo(x, y);
      length -= left;
      drawing = !drawing;
      left = drawing ? on : off;
    }
    x += dx * length;
    y += dy * length;
    if (drawing) g.lineTo(x, y);
    else g.moveTo(x, y);
    left -= length;
  }
}

function dashedRect(g: Graphics, hw: number, hh: number, dash: number): void {
  const edges = [
    [-hw, -hh, hw, -hh],
    [hw, -hh, hw, hh],
    [hw, hh, -hw, hh],
    [-hw, hh, -hw, -hh],
  ];
  for (const [x1, y1, x2, y2] of edges) {
    const length = Math.hypot(x2 - x1, y2 - y1);
    const dx = (x2 - x1) / length;
    const dy = (y2 - y1) / length;
    for (let s = 0; s < length; s += dash * 2) {
      const e = Math.min(length, s + dash);
      g.moveTo(x1 + dx * s, y1 + dy * s).lineTo(x1 + dx * e, y1 + dy * e);
    }
  }
}

function blend(a: number, b: number, by: number): number {
  const mix = (shift: number): number => Math.round(((a >> shift) & 255) * (1 - by) + ((b >> shift) & 255) * by);
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}
