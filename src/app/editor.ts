// everything the player's mouse and keyboard do to the room: the hand, the shape and part tools, wiring, selecting,
// moving, the R rotation circle, copy and paste, undo. it only changes the world through the world's own methods.
import { History } from '../sim/edits.ts';
import type { Snapshot } from '../sim/edits.ts';
import { formatValue, isPartKind, newPart, PART_INFO, parseValue, portsOf, portWorld, whereOf } from '../sim/parts.ts';
import type { PartKind, Port } from '../sim/parts.ts';
import { SIZE_LIMITS } from '../sim/room-file.ts';
import type { Colour } from '../sim/senses.ts';
import { boundingRadius, containsPoint } from '../sim/shapes.ts';
import type { Form } from '../sim/shapes.ts';
import { ROOM } from '../sim/world.ts';
import type { Creature, RoomData, Thing, ThingSpec, World } from '../sim/world.ts';
import { kindOf, wirePoints } from './circuit-view.ts';
import type { Wiring } from './circuit-view.ts';
import type { Ghost, Gizmo, Overlay, Scene } from './scene.ts';

const SHAPE_TOOLS = ['circle', 'box', 'triangle', 'hexagon', 'plank'] as const;
type ShapeTool = (typeof SHAPE_TOOLS)[number];
export type Tool = 'hand' | 'wire' | ShapeTool | PartKind;
const isShapeTool = (tool: Tool): tool is ShapeTool => SHAPE_TOOLS.includes(tool as ShapeTool);

const SNAP_ANGLE = Math.PI / 12; // 15 degrees, where the gridlines are on the rotation circle
const SNAP_GRID = 20;
const CLICK_DISTANCE = 4; // screen pixels the mouse can move and it still counts as a click
const GIZMO_PADDING = 34;
const DOUBLE_CLICK_MS = 350;

const NEW_SHAPES: Record<ShapeTool, { name: string; form: Form; hw: number; hh: number; fixed: boolean }> = {
  circle: { name: 'Circle', form: 'circle', hw: 20, hh: 20, fixed: false },
  box: { name: 'Square', form: 'box', hw: 24, hh: 24, fixed: false },
  triangle: { name: 'Triangle', form: 'triangle', hw: 26, hh: 26, fixed: false },
  hexagon: { name: 'Hexagon', form: 'hexagon', hw: 26, hh: 26, fixed: false },
  // a plank is usually a ramp or a shelf, so it starts out staying where it's put
  plank: { name: 'Plank', form: 'box', hw: 120, hh: 8, fixed: true },
};

type Press =
  | { kind: 'none' }
  | { kind: 'pan'; lastX: number; lastY: number; startX: number; startY: number; moved: boolean }
  | { kind: 'creature'; id: number; startX: number; startY: number; moved: boolean }
  | { kind: 'thing'; id: number; startX: number; startY: number; toggle: boolean; wasSelected: boolean; moved: boolean; grabX: number; grabY: number; offsets: Map<number, { x: number; y: number }>; before: Snapshot | null; vx: number; vy: number; lastX: number; lastY: number; lastT: number }
  | { kind: 'box'; x1: number; y1: number; x2: number; y2: number; add: boolean }
  | { kind: 'wire'; wiring: Wiring }
  | { kind: 'place'; x1: number; y1: number; x2: number; y2: number; moved: boolean }
  | { kind: 'rotate'; centreX: number; centreY: number; start: number; turn: number; before: Snapshot; bases: Map<number, { x: number; y: number; angle: number }> };

export interface EditorEvents {
  changed(): void; // what's selected or which tool changed, so buttons and hints can update
  openProperties(ids: number[], screenX: number, screenY: number): void;
  closeProperties(): void;
  hover(e: PointerEvent, thing: Thing | null, onCreature: Creature | null): void;
  hoverNote(e: PointerEvent, title: string, words: string): void;
  editLabel(id: number): void;
  packageSelected(): void;
  viewChanged(): void;
  stopPlaying(): void;
  message(text: string): void;
}

export class Editor {
  tool: Tool = 'hand';
  colour: Colour = 'blue';
  newFixed = false;
  selected = new Set<number>();
  gizmoOn = false;
  playing = false; // the game is running, so the mouse and keyboard belong to it
  lastSpot: { x: number; y: number } | null = null; // where the mouse was last in the room
  history = new History();
  private press: Press = { kind: 'none' };
  private hoverSpot: { x: number; y: number } | null = null;
  private clipboard: RoomData | null = null;
  private hoverWire: number | null = null;
  private hoverPort: { thingId: number; port: string; dir: 'in' | 'out' } | null = null;
  private lastClick = { id: -1, at: 0 };
  private lastPet = 0;
  private getWorld: () => World;
  private scene: Scene;
  private events: EditorEvents;
  private canvas: HTMLCanvasElement;

  constructor(getWorld: () => World, scene: Scene, events: EditorEvents) {
    this.getWorld = getWorld;
    this.scene = scene;
    this.events = events;
    this.canvas = scene.app.canvas;
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => this.down(e));
    c.addEventListener('pointermove', (e) => this.move(e));
    c.addEventListener('pointerup', (e) => this.up(e));
    c.addEventListener('pointercancel', (e) => this.up(e));
    c.addEventListener('pointerleave', () => {
      this.hoverSpot = null;
    });
    c.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this.key(e));
  }

  private get world(): World {
    return this.getWorld();
  }

  get inBody(): boolean {
    return this.scene.view === 'body';
  }

  // whether this is on the canvas being looked at
  private here(t: Thing): boolean {
    return !!t.inBody === this.inBody && (!this.inBody || t.owner === this.world.focusId);
  }

  // the bottom of the canvas being looked at
  private get floor(): number {
    return this.inBody ? ROOM.floor : this.world.size.floor;
  }

  // looking at a different creature
  focusOn(id: number): void {
    if (id === this.world.focusId) return;
    this.world.focusOn(id);
    if (this.inBody) this.select([]);
    this.events.viewChanged();
    this.events.changed();
  }

  // the room and the inside of the creature only have some tools in common
  allows(tool: Tool): boolean {
    if (tool === 'hand' || tool === 'wire') return true;
    if (isShapeTool(tool)) return !this.inBody;
    return PART_INFO[tool].where === 'both' || PART_INFO[tool].where === (this.inBody ? 'body' : 'room');
  }

  setView(view: 'room' | 'body'): void {
    this.press = { kind: 'none' };
    this.selected.clear();
    this.gizmoOn = false;
    this.tool = 'hand';
    this.hoverWire = null;
    this.hoverPort = null;
    this.events.closeProperties();
    this.scene.setView(view);
    this.syncCursor();
    this.events.viewChanged();
    this.events.changed();
  }

  // ---- selecting and picking tools ----

  setTool(tool: Tool): void {
    if (!this.allows(tool)) return;
    this.tool = tool;
    if (tool !== 'hand') {
      this.gizmoOn = false;
      if (isShapeTool(tool)) this.newFixed = NEW_SHAPES[tool].fixed;
      this.selected.clear();
      this.events.closeProperties();
    }
    this.syncCursor();
    this.events.changed();
  }

  private syncCursor(): void {
    this.canvas.style.cursor = this.tool === 'hand' ? 'default' : 'crosshair';
  }

  private select(ids: Iterable<number>): void {
    this.selected = new Set(ids);
    if (this.selected.size === 0) this.gizmoOn = false;
    this.events.changed();
  }

  // things can vanish by themselves when eaten, so the selection is checked every frame
  private pruneSelection(): void {
    let changed = false;
    for (const id of this.selected) {
      if (!this.world.thing(id)) {
        this.selected.delete(id);
        changed = true;
      }
    }
    if (changed) {
      if (this.selected.size === 0) this.gizmoOn = false;
      this.events.changed();
    }
  }

  newWorld(): void {
    this.history.clear();
    this.selected.clear();
    this.gizmoOn = false;
    this.press = { kind: 'none' };
    this.events.changed();
  }

  // ---- what to draw ----

  overlay(): Overlay {
    this.pruneSelection();
    return {
      selected: this.selected,
      ghost: this.ghost(),
      box: this.press.kind === 'box' ? this.press : null,
      gizmo: this.gizmo(),
      wires: {
        wiring: this.press.kind === 'wire' ? this.press.wiring : null,
        hoverWire: this.hoverWire,
        hoverPort: this.hoverPort,
        showPorts: this.tool === 'wire',
        shapePorts: this.shapePorts(),
        inBody: this.inBody,
        owner: this.world.focusId,
        playing: this.playing,
      },
    };
  }

  private shapeFromPress(tool: ShapeTool | PartKind, x1: number, y1: number, x2: number, y2: number, moved: boolean, snap: boolean): Ghost {
    const base = isShapeTool(tool) ? NEW_SHAPES[tool] : newPart(tool, 0, 0);
    const colour = isShapeTool(tool) ? this.colour : PART_INFO[tool].colour;
    // parts are a set size, apart from a sensor, which is an area you draw
    const sizes = isShapeTool(tool) || tool === 'sensor' || tool === 'zone';
    const clamp = (v: number): number => Math.max(SIZE_LIMITS.min, Math.min(SIZE_LIMITS.max, v));
    let { hw, hh } = base;
    let x = x2;
    let y = y2;
    let angle = 0;
    if (moved && sizes) {
      if (tool === 'circle') {
        hw = hh = clamp(Math.hypot(x2 - x1, y2 - y1));
        x = x1;
        y = y1;
      } else if (tool === 'plank') {
        // a plank is drawn from one end to the other, which is the easy way to make a ramp at any slope
        let dx = x2 - x1;
        let dy = y2 - y1;
        angle = Math.atan2(dy, dx);
        if (snap) angle = Math.round(angle / SNAP_ANGLE) * SNAP_ANGLE;
        const length = Math.hypot(dx, dy);
        dx = Math.cos(angle) * length;
        dy = Math.sin(angle) * length;
        hw = clamp(length / 2);
        // kept between -90 and 90 degrees so it looks the same however it was drawn
        if (angle > Math.PI / 2) angle -= Math.PI;
        if (angle < -Math.PI / 2) angle += Math.PI;
        x = x1 + dx / 2;
        y = y1 + dy / 2;
      } else {
        hw = clamp(Math.abs(x2 - x1) / 2);
        hh = snap ? hw : clamp(Math.abs(y2 - y1) / 2);
        x = (x1 + x2) / 2;
        y = (y1 + y2) / 2;
      }
    } else if (this.press.kind === 'place') {
      x = x1;
      y = y1;
    }
    return { form: base.form, hw, hh, x, y, angle, colour };
  }

  private ghost(): Ghost | null {
    if (this.tool === 'hand' || this.tool === 'wire') return null;
    if (this.press.kind === 'place') {
      const p = this.press;
      return this.shapeFromPress(this.tool, p.x1, p.y1, p.x2, p.y2, p.moved, this.shiftDown);
    }
    if (this.hoverSpot) return this.shapeFromPress(this.tool, 0, 0, this.hoverSpot.x, this.hoverSpot.y, false, false);
    return null;
  }

  private gizmo(): Gizmo | null {
    if (!this.gizmoOn || this.selected.size === 0) return null;
    const things = this.selectedThings();
    if (things.length === 0) return null;
    let x = 0;
    let y = 0;
    for (const t of things) {
      x += t.x;
      y += t.y;
    }
    x /= things.length;
    y /= things.length;
    let radius = 0;
    for (const t of things) radius = Math.max(radius, Math.hypot(t.x - x, t.y - y) + boundingRadius(t));
    const rotating = this.press.kind === 'rotate' ? this.press : null;
    const angle = things.length === 1 ? things[0].angle : (rotating?.turn ?? 0);
    return { x: rotating?.centreX ?? x, y: rotating?.centreY ?? y, radius: radius + GIZMO_PADDING / this.scene.zoom, angle, active: !!rotating };
  }

  // a shape shows its Touched output when you're wiring, or it's selected, or wired up already, or the mouse is close by
  private shapePorts(): Set<number> {
    const ids = new Set<number>();
    if (this.inBody || this.playing) return ids;
    const wiring = this.press.kind === 'wire' && this.press.wiring.kind === 'pulse' && this.press.wiring.dir === 'in';
    const spot = this.hoverSpot;
    for (const t of this.world.things) {
      if (t.part || t.inBody) continue;
      const near = spot && Math.hypot(spot.x - t.x, spot.y - t.y) < boundingRadius(t) + 34;
      if (this.tool === 'wire' || wiring || near || this.selected.has(t.id)) ids.add(t.id);
    }
    for (const w of this.world.wires) if (w.out === 'touched') ids.add(w.from);
    return ids;
  }

  private selectedThings(): Thing[] {
    return [...this.selected].map((id) => this.world.thing(id)).filter((t): t is Thing => !!t);
  }

  // ---- what's under the mouse ----

  private at(e: { clientX: number; clientY: number }): { x: number; y: number; sx: number; sy: number } {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    return { ...this.scene.toWorld(sx, sy), sx, sy };
  }

  thingAt(x: number, y: number): Thing | undefined {
    const margin = 4 / this.scene.zoom;
    const things = this.world.things;
    // whatever's actually in the room comes first, then parts on the wall, then the big see-through sensors
    const rank = (t: Thing): number => (!t.part ? 0 : t.part.kind === 'sensor' || t.part.kind === 'zone' ? 2 : 1);
    for (let want = 0; want <= 2; want++) {
      for (let i = things.length - 1; i >= 0; i--) if (this.here(things[i]) && rank(things[i]) === want && containsPoint(things[i], x, y, margin)) return things[i];
    }
    return undefined;
  }

  // the port under the mouse, with a bit of slack, because they're small
  private portAt(x: number, y: number, wiring = false): { thing: Thing; port: Port } | null {
    const reach = Math.max(7, Math.min(14, 11 / this.scene.zoom));
    let best: { thing: Thing; port: Port } | null = null;
    let bestDistance = reach;
    // a shape's port sits right beside it, so it mustn't get in the way of grabbing whatever's next to it
    const shapesCount = wiring || this.tool === 'wire' || !this.thingAt(x, y);
    const live = shapesCount ? this.shapePorts() : new Set<number>();
    for (const thing of this.world.things) {
      if (!this.here(thing)) continue;
      if (!thing.part && !wiring && !live.has(thing.id)) continue;
      for (const port of portsOf(thing)) {
        const at = portWorld(thing, port);
        const distance = Math.hypot(at.x - x, at.y - y);
        if (distance <= bestDistance) {
          best = { thing, port };
          bestDistance = distance;
        }
      }
    }
    return best;
  }

  private wireAt(x: number, y: number): number | null {
    const reach = Math.max(5, 7 / this.scene.zoom);
    let best: number | null = null;
    let bestDistance = reach;
    for (const wire of this.world.wires) {
      const from = this.world.thing(wire.from);
      if (!from || !this.here(from)) continue;
      const points = wirePoints(this.world, wire);
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const along = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
        const distance = Math.hypot(a.x + dx * along - x, a.y + dy * along - y);
        if (distance < bestDistance) {
          best = wire.id;
          bestDistance = distance;
        }
      }
    }
    return best;
  }

  // the one under the mouse. the one you're looking at wins if they're standing in the same place
  onCreature(x: number, y: number): Creature | null {
    if (this.inBody) return null;
    const hit = (c: Creature): boolean => Math.abs(x - c.x) <= 32 && y <= c.y + 4 && y >= c.y - 76;
    return hit(this.world.creature) ? this.world.creature : (this.world.creatures.find(hit) ?? null);
  }

  // ---- mouse ----

  private shiftDown = false;

  private down(e: PointerEvent): void {
    this.shiftDown = e.shiftKey;
    const p = this.at(e);
    this.canvas.setPointerCapture(e.pointerId);
    this.world.pointer = { x: p.x, y: p.y, down: true };
    if (this.playing) {
      // the only things to click on in a game are its buttons
      const thing = this.thingAt(p.x, p.y);
      if (thing?.part?.kind === 'button') this.world.pressButton(thing.id);
      return;
    }

    if (e.button === 1) {
      e.preventDefault();
      this.startPan(e);
      return;
    }
    this.events.closeProperties();
    this.events.hover(e, null, null); // the tooltip shouldn't hang around once you've started doing something

    if (e.button === 2) return this.rightClick(e, p);
    if (e.button !== 0) return;

    if (this.tool !== 'hand' && this.tool !== 'wire') {
      this.press = { kind: 'place', x1: p.x, y1: p.y, x2: p.x, y2: p.y, moved: false };
      return;
    }

    // a part's ports can be dragged straight from the hand, so there's no need to keep changing tools
    const hit = this.gizmoOn ? null : this.portAt(p.x, p.y);
    if (hit) {
      this.press = { kind: 'wire', wiring: { thingId: hit.thing.id, port: hit.port.name, dir: hit.port.dir, kind: hit.port.kind, x: p.x, y: p.y } };
      return;
    }
    if (this.tool === 'wire') return;

    // the rotation circle takes any press inside or close around it
    const gizmo = this.gizmo();
    if (gizmo) {
      if (Math.hypot(p.x - gizmo.x, p.y - gizmo.y) <= gizmo.radius + 26 / this.scene.zoom) return this.startRotate(p, gizmo);
      this.gizmoOn = false;
    }

    const creature = this.onCreature(p.x, p.y);
    if (creature) {
      this.focusOn(creature.id);
      this.press = { kind: 'creature', id: creature.id, startX: e.clientX, startY: e.clientY, moved: false };
      return;
    }

    const thing = this.thingAt(p.x, p.y);
    if (thing) {
      const wasSelected = this.selected.has(thing.id);
      // clicking a button presses it. it only gets selected if you go on to drag it
      const pressing = thing.part?.kind === 'button' && !e.shiftKey;
      if (!wasSelected && !pressing) this.select(e.shiftKey ? [...this.selected, thing.id] : [thing.id]);
      this.press = {
        kind: 'thing',
        id: thing.id,
        startX: e.clientX,
        startY: e.clientY,
        toggle: e.shiftKey,
        wasSelected,
        moved: false,
        grabX: p.x,
        grabY: p.y,
        offsets: new Map(),
        before: null,
        vx: 0,
        vy: 0,
        lastX: p.x,
        lastY: p.y,
        lastT: performance.now(),
      };
      return;
    }

    // dragging empty space moves the view, because that's what you nearly always want. holding shift draws a selection box
    if (e.shiftKey) {
      this.press = { kind: 'box', x1: p.x, y1: p.y, x2: p.x, y2: p.y, add: true };
      return;
    }
    this.select([]);
    this.startPan(e);
  }

  private startPan(e: PointerEvent): void {
    this.press = { kind: 'pan', lastX: e.clientX, lastY: e.clientY, startX: e.clientX, startY: e.clientY, moved: false };
    this.canvas.style.cursor = 'grabbing';
  }

  private rightClick(e: PointerEvent, p: { x: number; y: number }): void {
    if (this.tool !== 'hand' && this.tool !== 'wire') {
      this.setTool('hand');
      return;
    }
    const wire = this.wireAt(p.x, p.y);
    if (wire !== null) {
      this.removeWire(wire);
      return;
    }
    if (this.tool === 'wire') {
      this.setTool('hand');
      return;
    }
    const creature = this.onCreature(p.x, p.y);
    if (creature) {
      this.focusOn(creature.id);
      this.world.slap(creature);
      return;
    }
    const thing = this.thingAt(p.x, p.y);
    if (thing) {
      if (!this.selected.has(thing.id)) this.select([thing.id]);
      this.events.openProperties([...this.selected], e.clientX, e.clientY);
    } else {
      this.select([]);
      this.startPan(e);
    }
  }

  private move(e: PointerEvent): void {
    this.shiftDown = e.shiftKey;
    const p = this.at(e);
    this.hoverSpot = p;
    this.lastSpot = p;
    this.world.pointer.x = p.x;
    this.world.pointer.y = p.y;
    if (this.playing) return;
    const press = this.press;
    switch (press.kind) {
      case 'none':
        this.hovering(e, p);
        return;
      case 'pan':
        this.scene.pan(e.clientX - press.lastX, e.clientY - press.lastY);
        press.lastX = e.clientX;
        press.lastY = e.clientY;
        return;
      case 'creature':
        if (!press.moved && Math.hypot(e.clientX - press.startX, e.clientY - press.startY) > CLICK_DISTANCE) {
          press.moved = true;
          this.world.holdCreature(this.world.creatureById(press.id));
        }
        if (press.moved) this.world.moveHeldCreature(p.x, p.y + 30, this.world.creatureById(press.id));
        return;
      case 'thing':
        this.dragThings(press, e, p);
        return;
      case 'box':
        press.x2 = p.x;
        press.y2 = p.y;
        return;
      case 'wire':
        press.wiring.x = p.x;
        press.wiring.y = p.y;
        return;
      case 'place':
        press.x2 = p.x;
        press.y2 = p.y;
        if (Math.hypot(p.x - press.x1, p.y - press.y1) * this.scene.zoom > CLICK_DISTANCE * 2) press.moved = true;
        return;
      case 'rotate':
        this.rotate(press, p, e.shiftKey);
        return;
    }
  }

  private hovering(e: PointerEvent, p: { x: number; y: number }): void {
    this.hoverWire = null;
    this.hoverPort = null;
    if (this.tool !== 'hand' && this.tool !== 'wire') {
      this.events.hover(e, null, null);
      return;
    }
    const hit = this.gizmoOn ? null : this.portAt(p.x, p.y);
    if (hit) {
      this.hoverPort = { thingId: hit.thing.id, port: hit.port.name, dir: hit.port.dir };
      this.canvas.style.cursor = 'crosshair';
      const now = hit.port.kind === 'value' && hit.port.dir === 'out' ? ` It's ${formatValue(this.world.circuit.peek(hit.thing.id, hit.port.name))} right now.` : '';
      this.events.hoverNote(e, hit.port.name, `${hit.port.help}.${now} Drag to connect.`);
      return;
    }
    const wireId = this.gizmoOn ? null : this.wireAt(p.x, p.y);
    if (wireId !== null) {
      this.hoverWire = wireId;
      this.canvas.style.cursor = 'pointer';
      const wire = this.world.wires.find((w) => w.id === wireId);
      const kind = wire ? kindOf(this.world, wire) : 'value';
      const what = !wire ? '' : kind === 'value' ? `Carrying ${formatValue(this.world.circuit.peek(wire.from, wire.out))}. ` : kind === 'pulse' ? 'Carries pulses. ' : 'A motor holding on to this. ';
      this.events.hoverNote(e, kind === 'body' ? 'Motor attachment' : `${kind[0].toUpperCase()}${kind.slice(1)} wire`, `${what}Right-click to remove.`);
      return;
    }
    if (this.tool === 'wire') {
      this.canvas.style.cursor = 'crosshair';
      this.events.hover(e, null, null);
      return;
    }
    const creature = this.onCreature(p.x, p.y);
    const thing = creature ? undefined : this.thingAt(p.x, p.y);
    const gizmo = this.gizmo();
    if (gizmo && Math.hypot(p.x - gizmo.x, p.y - gizmo.y) <= gizmo.radius + 26 / this.scene.zoom) {
      this.canvas.style.cursor = 'grab';
      this.events.hover(e, null, null);
      return;
    }
    this.canvas.style.cursor = creature ? 'pointer' : thing ? 'grab' : 'default';
    this.events.hover(e, thing ?? null, creature);
  }

  private dragThings(press: Extract<Press, { kind: 'thing' }>, e: PointerEvent, p: { x: number; y: number }): void {
    if (!press.moved) {
      if (Math.hypot(e.clientX - press.startX, e.clientY - press.startY) <= CLICK_DISTANCE) return;
      press.moved = true;
      if (!this.selected.has(press.id)) this.select([press.id]);
      press.before = this.history.capture(this.world, this.selected);
      for (const t of this.selectedThings()) {
        press.offsets.set(t.id, { x: t.x - press.grabX, y: t.y - press.grabY });
        this.world.hold(t.id);
      }
      this.canvas.style.cursor = 'grabbing';
    }
    const now = performance.now();
    const gap = Math.max(1, now - press.lastT) / 1000;
    press.vx = (p.x - press.lastX) / gap;
    press.vy = (p.y - press.lastY) / gap;
    press.lastX = p.x;
    press.lastY = p.y;
    press.lastT = now;

    // holding shift snaps to the grid on the wall, going by the thing that was grabbed
    let dx = p.x - press.grabX;
    let dy = p.y - press.grabY;
    const lead = press.offsets.get(press.id);
    if (e.shiftKey && lead) {
      const x = press.grabX + dx + lead.x;
      const y = press.grabY + dy + lead.y;
      dx += Math.round(x / SNAP_GRID) * SNAP_GRID - x;
      dy += Math.round(y / SNAP_GRID) * SNAP_GRID - y;
    }
    for (const [id, offset] of press.offsets) {
      const t = this.world.thing(id);
      if (!t) continue;
      const hh = boundingRadius(t);
      this.world.moveHeld(id, press.grabX + dx + offset.x, Math.min(this.floor - hh * 0.5, press.grabY + dy + offset.y));
    }
  }

  private up(e: PointerEvent): void {
    const press = this.press;
    this.press = { kind: 'none' };
    this.world.pointer.down = false;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    switch (press.kind) {
      case 'pan':
        this.syncCursor();
        return;
      case 'creature':
        if (press.moved) {
          this.world.releaseCreature(this.world.creatureById(press.id));
        } else if (performance.now() - this.lastPet < DOUBLE_CLICK_MS) {
          this.setView('body');
        } else if (this.world.creatureById(press.id)?.dead) {
          this.events.message(`${this.world.creatureById(press.id)?.name} is dead. Press Revive in the mind panel to bring them back.`);
        } else {
          this.lastPet = performance.now();
          this.world.pet(this.world.creatureById(press.id));
        }
        return;
      case 'thing':
        this.finishDrag(press);
        return;
      case 'box':
        this.finishBox(press);
        return;
      case 'wire':
        this.finishWire(press.wiring);
        return;
      case 'place':
        this.finishPlace(press);
        return;
      case 'rotate':
        this.finishRotate(press);
        return;
    }
  }

  private finishDrag(press: Extract<Press, { kind: 'thing' }>): void {
    if (!press.moved) {
      const thing = this.world.thing(press.id);
      if (thing?.part && !press.toggle) {
        if (thing.part.kind === 'button') {
          this.world.pressButton(thing.id);
          return;
        }
        const now = performance.now();
        const twice = this.lastClick.id === thing.id && now - this.lastClick.at < DOUBLE_CLICK_MS;
        this.lastClick = { id: thing.id, at: now };
        if (twice) {
          this.select([thing.id]);
          if (thing.part.kind === 'label') {
            if (thing.part.locked) this.events.message('That label is locked. Right-click it to unlock it.');
            else this.events.editLabel(thing.id);
          } else {
            this.events.openProperties([thing.id], press.startX, press.startY);
          }
          return;
        }
      }
      if (press.toggle && press.wasSelected) {
        this.selected.delete(press.id);
        this.select(this.selected);
      } else if (!press.toggle) {
        this.select([press.id]);
      }
      return;
    }
    // one thing still moving when it's let go gets thrown. a group just drops.
    const moving = performance.now() - press.lastT < 80 && press.offsets.size === 1;
    const limit = 900;
    const vx = moving ? Math.max(-limit, Math.min(limit, press.vx)) : 0;
    const vy = moving ? Math.max(-limit, Math.min(limit, press.vy)) : 0;
    for (const id of press.offsets.keys()) this.world.release(id, vx, vy);
    if (press.before) this.history.commit('Move', this.world, press.before);
    this.syncCursor();
  }

  private finishBox(press: Extract<Press, { kind: 'box' }>): void {
    const left = Math.min(press.x1, press.x2);
    const right = Math.max(press.x1, press.x2);
    const top = Math.min(press.y1, press.y2);
    const bottom = Math.max(press.y1, press.y2);
    const inside = this.world.things.filter((t) => this.here(t) && t.x >= left && t.x <= right && t.y >= top && t.y <= bottom).map((t) => t.id);
    if (inside.length) this.select(press.add ? [...this.selected, ...inside] : inside);
  }

  private finishPlace(press: Extract<Press, { kind: 'place' }>): void {
    if (this.tool === 'hand' || this.tool === 'wire') return;
    const shape = this.shapeFromPress(this.tool, press.x1, press.y1, press.x2, press.y2, press.moved, this.shiftDown);
    // never start it stuck in the floor
    const y = Math.min(this.floor - Math.max(shape.hh, Math.abs(Math.sin(shape.angle)) * shape.hw) - 1, shape.y);
    if (isPartKind(this.tool)) {
      const part = this.tool;
      const made = newPart(part, shape.x, y);
      this.addThing({ ...made, name: this.freeName(made), hw: shape.hw, hh: shape.hh, inBody: this.inBody || undefined });
      // you nearly always want to wire it up next, and a part's ports only work with the hand
      this.setTool('hand');
      return;
    }
    const base = NEW_SHAPES[this.tool];
    this.addThing({ name: base.name, form: shape.form, colour: shape.colour, hw: shape.hw, hh: shape.hh, x: shape.x, y, angle: shape.angle, fixed: this.newFixed });
  }

  // sockets and labels go by their names, so a new one shouldn't share a name with one that's already there
  private freeName(made: { name: string; part: { kind: PartKind } }): string {
    const kind = made.part.kind;
    if (kind !== 'drive' && kind !== 'nerve' && kind !== 'label') return made.name;
    const taken = new Set(this.world.things.filter((t) => t.part?.kind === kind && this.here(t)).map((t) => t.name));
    let name = made.name;
    for (let i = 2; taken.has(name); i++) name = `${made.name} ${i}`;
    return name;
  }

  // let go on the wrong spot of the right part and it still finds the port you meant
  private finishWire(wiring: Wiring): void {
    const start = this.world.thing(wiring.thingId);
    if (!start) return;
    const hit = this.portAt(wiring.x, wiring.y, true);
    const want = wiring.dir === 'out' ? 'in' : 'out';
    let to: { thing: Thing; port: string } | null = hit && hit.port.dir === want ? { thing: hit.thing, port: hit.port.name } : null;
    if (!to) {
      const thing = this.thingAt(wiring.x, wiring.y);
      if (!thing) return;
      if (wiring.kind === 'body') {
        to = { thing, port: 'body' };
      } else {
        // the first one with nothing in it, which is what you'd go for when wiring up a Math. if they're all taken, the closest
        const ports = portsOf(thing).filter((port) => port.dir === want && port.kind === wiring.kind);
        const free = ports.find((port) => want === 'out' || port.kind === 'pulse' || !this.world.circuit.hasInput(thing.id, port.name));
        let bestDistance = Infinity;
        for (const port of free ? [free] : ports) {
          const at = portWorld(thing, port);
          const distance = Math.hypot(at.x - wiring.x, at.y - wiring.y);
          if (distance < bestDistance) {
            bestDistance = distance;
            to = { thing, port: port.name };
          }
        }
        if (!to) {
          this.events.message(thing.part ? `${thing.name} has nowhere to plug in a ${wiring.kind} wire from there.` : `A shape can only send out a pulse when it's touched, or be held by a motor.`);
          return;
        }
      }
    }
    const [fromId, out, toId, inPort] = wiring.dir === 'out' ? [start.id, wiring.port, to.thing.id, to.port] : [to.thing.id, to.port, start.id, wiring.port];
    const why = this.world.whyNotConnect(fromId, out, toId, inPort);
    if (why) {
      this.events.message(why);
      return;
    }
    const before = this.history.capture(this.world, []);
    this.world.connect(fromId, out, toId, inPort);
    this.history.commit('Connect wire', this.world, before);
  }

  private removeWire(id: number): void {
    const before = this.history.capture(this.world, []);
    this.world.disconnect(id);
    this.history.commit('Remove wire', this.world, before);
    this.hoverWire = null;
    this.events.message('Wire removed. Ctrl+Z puts it back.');
  }

  // what the player typed into a label
  setLabel(id: number, typed: string): void {
    const t = this.world.thing(id);
    if (t?.part?.kind !== 'label') return;
    const was = t.live?.value ?? 0;
    const now = parseValue(typed.slice(0, 200));
    if (was === now) return;
    this.world.setLabel(id, now);
    this.history.commitTyped('Change label', this.world, id, was, now);
    // a word typed into a label out in the room gets said, which is how creatures come to hear it
    if (typeof now === 'string' && !t.inBody) this.world.say(now, t.x, t.y - t.hh - 30);
  }

  private startRotate(p: { x: number; y: number }, gizmo: Gizmo): void {
    const before = this.history.capture(this.world, this.selected);
    const bases = new Map<number, { x: number; y: number; angle: number }>();
    for (const t of this.selectedThings()) {
      bases.set(t.id, { x: t.x, y: t.y, angle: t.angle });
      this.world.hold(t.id);
    }
    this.press = { kind: 'rotate', centreX: gizmo.x, centreY: gizmo.y, start: Math.atan2(p.y - gizmo.y, p.x - gizmo.x), turn: 0, before, bases };
    this.canvas.style.cursor = 'grabbing';
  }

  private rotate(press: Extract<Press, { kind: 'rotate' }>, p: { x: number; y: number }, free: boolean): void {
    let turn = Math.atan2(p.y - press.centreY, p.x - press.centreX) - press.start;
    if (press.bases.size === 1) {
      // on its own, it snaps to the lines around the circle
      const base = [...press.bases.values()][0].angle;
      if (!free) turn = Math.round((base + turn) / SNAP_ANGLE) * SNAP_ANGLE - base;
    } else if (!free) {
      turn = Math.round(turn / SNAP_ANGLE) * SNAP_ANGLE;
    }
    press.turn = turn;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    for (const [id, base] of press.bases) {
      const dx = base.x - press.centreX;
      const dy = base.y - press.centreY;
      this.world.moveHeld(id, press.centreX + dx * cos - dy * sin, press.centreY + dx * sin + dy * cos, base.angle + turn);
    }
  }

  private finishRotate(press: Extract<Press, { kind: 'rotate' }>): void {
    for (const id of press.bases.keys()) this.world.release(id);
    this.history.commit('Rotate', this.world, press.before);
    this.syncCursor();
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    const p = this.at(e);
    this.scene.zoomAt(p.sx, p.sy, Math.exp(-e.deltaY * 0.002));
  }

  // ---- keyboard ----

  private key(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    if (this.playing) {
      if (e.key === 'Escape') this.events.stopPlaying();
      return;
    }
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (ctrl) {
      if (key === 'z' && e.shiftKey) this.redo();
      else if (key === 'z') this.undo();
      else if (key === 'y') this.redo();
      else if (key === 'c') this.copy();
      else if (key === 'v') this.paste();
      else if (key === 'd') {
        this.copy();
        this.paste();
      } else if (key === 'a') this.select(this.world.things.filter((t) => this.here(t)).map((t) => t.id));
      else return;
      e.preventDefault();
      return;
    }

    if (e.altKey) return;
    const tools: Record<string, Tool> = { v: 'hand', w: 'wire', c: 'circle', b: 'box', t: 'triangle', h: 'hexagon', p: 'plank' };
    if (tools[key]) {
      this.setTool(tools[key]);
    } else if (key === 'r') {
      if (this.selected.size > 0) {
        this.gizmoOn = !this.gizmoOn;
        this.events.changed();
      } else {
        this.events.message('Select something first, then press R to rotate it.');
      }
    } else if (key === '+' || key === '=') {
      this.scene.zoomBy(1.4);
    } else if (key === '-' || key === '_') {
      this.scene.zoomBy(1 / 1.4);
    } else if (key === '0') {
      this.scene.fitAll();
    } else if (key === 'g') {
      if (this.selected.size > 0) this.events.packageSelected();
      else this.events.message('Select some parts first, then press G to package them as a tool.');
    } else if (key === 'f' && !this.inBody) {
      this.scene.centreOn(this.world.creature.x, this.world.creature.y);
    } else if (key === 'delete' || key === 'backspace') {
      this.deleteSelected();
    } else if (key === 'escape') {
      this.escape();
    } else if (key.startsWith('arrow')) {
      const step = 60;
      this.scene.pan(key === 'arrowleft' ? step : key === 'arrowright' ? -step : 0, key === 'arrowup' ? step : key === 'arrowdown' ? -step : 0);
      e.preventDefault();
    }
  }

  private escape(): void {
    if (this.gizmoOn) this.gizmoOn = false;
    else if (this.tool !== 'hand') this.setTool('hand');
    else if (this.selected.size === 0 && this.inBody) this.setView('room');
    else this.select([]);
    this.events.closeProperties();
    this.events.changed();
  }

  // ---- edits ----

  undo(): void {
    const label = this.history.undo(this.world);
    this.events.closeProperties();
    this.events.message(label ? `Undid: ${label}` : 'Nothing to undo.');
    this.pruneSelection();
  }

  redo(): void {
    const label = this.history.redo(this.world);
    this.events.closeProperties();
    this.events.message(label ? `Redid: ${label}` : 'Nothing to redo.');
    this.pruneSelection();
  }

  deleteSelected(): void {
    if (this.selected.size === 0) return;
    const before = this.history.capture(this.world, this.selected);
    for (const id of this.selected) this.world.remove(id);
    this.history.commit(this.selected.size > 1 ? 'Delete things' : 'Delete', this.world, before);
    this.select([]);
    this.events.closeProperties();
  }

  copy(): void {
    if (this.selected.size > 0) this.clipboard = this.world.roomData(this.selected);
  }

  paste(): void {
    if (!this.clipboard) return;
    const nudge = 40;
    const before = this.history.capture(this.world, []);
    const ids = this.world.addRoom(this.forHere(this.clipboard), nudge, -nudge);
    this.history.commit('Paste', this.world, before, ids);
    // the next paste lands a step further on, instead of exactly on top of this one
    this.clipboard = { ...this.clipboard, things: this.clipboard.things.map((s) => ({ ...s, x: Math.min((this.inBody ? ROOM.width : this.world.size.width) - 10, s.x + nudge), y: Math.max(10, (s.y ?? this.floor) - nudge) })) };
    this.select(ids);
    this.gizmoOn = false;
  }

  // what's been copied, leaving out what can't go on this canvas, and with the wires renumbered to match
  private forHere(room: RoomData): RoomData {
    const allowed = (t: ThingSpec): boolean => {
      if (!t.part) return !this.inBody;
      const where = whereOf(t.part);
      return where === 'both' || where === (this.inBody ? 'body' : 'room');
    };
    const moved = new Map<number, number>();
    const things: ThingSpec[] = [];
    room.things.forEach((t, i) => {
      if (!allowed(t)) return;
      moved.set(i, things.length);
      things.push({ ...t, inBody: this.inBody || undefined, owner: undefined });
    });
    const wires = room.wires.filter((w) => moved.has(w.from) && moved.has(w.to)).map((w) => ({ ...w, from: moved.get(w.from) as number, to: moved.get(w.to) as number }));
    return { things, wires, textures: room.textures };
  }

  addThing(spec: ThingSpec): void {
    const before = this.history.capture(this.world, []);
    const thing = this.world.add(spec);
    this.history.commit(`Add ${spec.name.toLowerCase()}`, this.world, before, [thing.id]);
  }

  // a whole little circuit, with its top left corner placed so it's in view
  addCircuit(label: string, room: RoomData, x: number, y: number): void {
    const before = this.history.capture(this.world, []);
    const ids = this.world.addRoom(this.forHere(room), x, y);
    this.history.commit(`Add ${label.toLowerCase()}`, this.world, before, ids);
    this.select(ids);
  }

  // what's at this spot on the screen, for dropping something onto it
  thingAtScreen(clientX: number, clientY: number): Thing | undefined {
    const p = this.at({ clientX, clientY });
    return this.thingAt(p.x, p.y);
  }

  // a picture on these things. a creature goes by colour, so they also take on the colour the picture mostly is.
  setPicture(ids: number[], data: string, colour: Colour): boolean {
    const texture = this.world.addTexture(data);
    if (!texture) return false;
    const before = this.history.capture(this.world, ids);
    for (const id of ids) this.world.update(id, { texture, colour });
    this.history.commit('Add picture', this.world, before);
    return true;
  }

  removePicture(ids: number[]): void {
    const before = this.history.capture(this.world, ids);
    for (const id of ids) this.world.update(id, { texture: undefined });
    this.history.commit('Remove picture', this.world, before);
  }

  // lets out what's sealed inside a tool
  unpack(id: number): void {
    const before = this.history.capture(this.world, [id]);
    const ids = this.world.unpack(id);
    this.history.commit('Unpack', this.world, before, ids);
    this.select(ids);
    this.events.closeProperties();
  }

  // replaces everything in the room in one undoable step
  replaceRoom(label: string, room: RoomData): void {
    const world = this.world;
    const before = this.history.capture(world, world.things.filter((t) => !t.inBody).map((t) => t.id));
    world.clearThings();
    if (room.size) world.resize(room.size.width, room.size.height);
    const ids = world.addRoom(room);
    this.history.commit(label, world, before, ids);
    this.select([]);
    this.events.closeProperties();
  }

  hint(): string {
    if (this.inBody && this.tool === 'hand') return "This is inside your creature, and it keeps running while you look. Plug any value into a Drive socket and it will care about it. Give parts change Labels in here by name. Esc goes back.";
    if (this.tool === 'wire') return 'Drag from one port to another to connect them. Round is a value, a diamond is a pulse. Right-click a wire to remove it. Esc when done.';
    if (isPartKind(this.tool)) return this.tool === 'sensor' || this.tool === 'zone' ? 'Click to place it, or drag to choose the area it covers. Right-click its header for its settings.' : `Click to place. ${PART_INFO[this.tool].help}`;
    if (this.tool !== 'hand') {
      return this.tool === 'plank'
        ? 'Click to place a plank, or drag from one end to the other to make a ramp. Hold Shift to snap the slope. Esc when done.'
        : 'Click to place, or drag to choose the size. Esc when done.';
    }
    if (this.gizmoOn) return 'Drag around the circle to rotate. It snaps to the lines, or hold Shift for free. R or Esc when done.';
    if (this.selected.size > 0) return 'Drag to move. R rotates, Delete removes, Ctrl+D duplicates, G packages it as a tool. Right-click for properties. Drag from a port to wire it up.';
    return 'Click your creature to pet, right-click to slap, drag to carry it, double-click to look inside. Click things to select. Drag empty space to look around, scroll to zoom, Shift+drag to select several. F finds your creature, 0 shows the whole room.';
  }
}
