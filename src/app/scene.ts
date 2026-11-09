// draws the room and the creature with pixi. it only ever reads the world, it never changes it.
import { Application, Container, Graphics, Rectangle, Text, Texture } from 'pixi.js';
import type { Look } from '../sim/look.ts';
import type { Colour } from '../sim/senses.ts';
import { boundingRadius, corners, localCorners } from '../sim/shapes.ts';
import type { Form } from '../sim/shapes.ts';
import { stageSize } from '../sim/family.ts';
import { AREA, AREA_MIDDLE, BODY_ROOM, ROOM } from '../sim/world.ts';
import type { Creature, Thing, World, WorldEvent } from '../sim/world.ts';
import { CircuitView } from './circuit-view.ts';
import { DECOR_ART, pixiPen } from './decor-art.ts';
import type { WireOverlay } from './circuit-view.ts';
import { drawEgg, drawNurt, STILL_POSE } from './nurt-art.ts';

export const COLOURS: Record<Colour, number> = {
  red: 0xf0524d,
  orange: 0xf2933a,
  yellow: 0xf5d547,
  green: 0x5ccb6d,
  blue: 0x4f9bf0,
  purple: 0xa97bf2,
  grey: 0x8a90a3,
};

const SELECT = 0x4fd6c3;
const MAX_ZOOM = 10;
const ZOOM_OUT_PAST_FIT = 0.5; // you can go on zooming out a bit after the whole room fits
const GROUND_REACH = 200000; // the ground and walls carry on past the room this far, so you never see where it stops
const LARGEST_PICTURE = 1024; // ours are never this big, so one claiming to be came from somewhere else
const SKY_TOP = 0x0b0e1a;
const SKY_LOW = 0x1e2438;
const HILL_FAR = 0x1a2034;
const HILL_NEAR = 0x1f2740;
const GRASS = 0x5f9a72;
const GRASS_DARK = 0x3d6b54;

// what can be switched off in Settings, for slower computers or anyone who'd rather things were calmer
export interface SceneOptions {
  scenery: boolean; // sky, stars, hills and grass, instead of a plain grid
  particles: boolean; // hearts, crumbs, dust and stars
  shake: boolean; // the view shakes when you slap
  intent: boolean; // a little bubble showing what it's going for, when that's far off
}
export const DEFAULT_SCENE_OPTIONS: SceneOptions = { scenery: true, particles: true, shake: true, intent: true };

// how one creature is looking right now, which is only for drawing
interface Face {
  head: { x: number; y: number };
  blinkAt: number;
  thinkGlow: number;
  happy: number;
  hurt: number;
}

interface Particle {
  kind: 'heart' | 'star' | 'crumb' | 'ring' | 'zzz' | 'puff';
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  colour: number;
  text?: string; // what a 'zzz' says, which is also used for a ? or a !
}

export interface Ghost {
  form: Form;
  hw: number;
  hh: number;
  x: number;
  y: number;
  angle: number;
  colour: Colour;
}

export interface Gizmo {
  x: number;
  y: number;
  radius: number;
  angle: number;
  active: boolean;
}

// what the editor wants drawn on top of the room
export interface Overlay {
  selected: ReadonlySet<number>;
  ghost: Ghost | null;
  box: { x1: number; y1: number; x2: number; y2: number } | null;
  gizmo: Gizmo | null;
  handles: { x: number; y: number }[]; // the corners you drag to change a thing's size
  wires: WireOverlay;
}

export type View = 'room' | 'body' | 'area';

export class Scene {
  app = new Application();
  private root = new Container();
  private sky = new Graphics();
  private hillsFar = new Graphics(); // these two drift slower than the room as you look around, so it has some depth
  private hillsNear = new Graphics();
  private backdrop = new Graphics();
  private bodyBackdrop = new Graphics();
  private areaBackdrop = new Graphics();
  private areaLayer = new Graphics(); // the thing whose build area this is, standing in the middle
  private areaTitle = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 22, fontWeight: 'bold', fill: 0x8fe3d6 } });
  private labels = new Map<number, Text>();
  private pictureLayer = new Container();
  private worldLayer = new Graphics();
  private painted = new Map<number, { g: Graphics; drawn: string }>();
  private pictures = new Map<string, Texture | 'loading' | 'bad'>();
  private creatureLayer = new Graphics();
  private fxLayer = new Graphics();
  private overlayLayer = new Graphics();
  private textLayer = new Container();
  private circuits = new CircuitView(COLOURS);
  private angleLabel = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 14, fontWeight: 'bold', fill: 0xffffff } });
  private zPool: Text[] = [];
  private particles: Particle[] = [];
  playing = false; // the editor is out of the way, and this is a game now
  options: SceneOptions = { ...DEFAULT_SCENE_OPTIONS };
  private voices = new Map<number, Text>();
  private faces = new Map<number, Face>();
  private tags = new Map<number, Text>();
  private time = 0;
  private still = false;
  private shake = 0;
  private roomSize: { width: number; height: number; floor: number } = ROOM;
  private drawnSize = '';
  private camera = { x: 0, y: 0, zoom: 1 };
  private cameras = new Map<string, { x: number; y: number; zoom: number }>(); // wherever each view was left
  view: View = 'room';
  area: number | null = null; // whose build area, when looking at one
  private lastSize = { w: 0, h: 0 };

  async start(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: host,
      background: '#0d0f16',
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    host.prepend(this.app.canvas);
    // the host can change size without the window changing, like when the toolbar wraps onto a second line
    new ResizeObserver(() => this.app.resize()).observe(host);
    // parts hang on the wall behind everything, but wires go over the top so you can always see and click them
    this.root.addChild(this.sky, this.hillsFar, this.hillsNear, this.backdrop, this.bodyBackdrop, this.areaBackdrop, this.areaLayer, this.circuits.chips, this.pictureLayer, this.worldLayer, this.creatureLayer, this.circuits.wires, this.circuits.moving, this.fxLayer, this.overlayLayer, this.textLayer);
    this.textLayer.addChild(this.angleLabel, this.areaTitle);
    this.areaTitle.anchor.set(0.5, 1);
    this.app.stage.addChild(this.root);
    this.drawBackdrop();
  }

  // looking inside the creature, or at a thing's build area, is the same kind of canvas as the room, somewhere else
  setView(view: View, area: number | null = null): void {
    if (view === this.view && area === this.area) return;
    this.cameras.set(this.viewKey, this.camera);
    this.view = view;
    this.area = view === 'area' ? area : null;
    for (const layer of [this.sky, this.hillsFar, this.hillsNear, this.backdrop]) layer.visible = view === 'room';
    this.bodyBackdrop.visible = view === 'body';
    this.areaBackdrop.visible = this.areaLayer.visible = this.areaTitle.visible = view === 'area';
    for (const layer of [this.pictureLayer, this.worldLayer, this.creatureLayer]) layer.visible = view === 'room';
    const kept = this.cameras.get(this.viewKey);
    if (kept) {
      this.camera = kept;
    } else {
      // close enough to fill the window, with the starter body, or the thing, in the middle
      this.camera = { x: 0, y: 0, zoom: Math.max(this.app.screen.width / 1000, this.app.screen.height / ROOM.height) * (view === 'area' ? 1.5 : 1) };
      this.clampCamera();
      if (view === 'area') this.lookAt(AREA_MIDDLE.x, AREA_MIDDLE.y);
      else this.centreOn(850, 620);
    }
    this.clampCamera();
  }

  // each build area keeps its own view, the same as the room and the inside of a creature
  private get viewKey(): string {
    return this.view === 'area' ? `area:${this.area}` : this.view;
  }

  get zoom(): number {
    return this.camera.zoom;
  }

  // the canvas being looked at. the inside of a creature is the same size whatever the room is
  private get bounds(): { width: number; height: number; floor: number } {
    return this.view === 'body' ? BODY_ROOM : this.view === 'area' ? AREA : this.roomSize;
  }

  // the Settings changed. the backdrop is drawn once, so it's drawn again if it should look different
  setOptions(options: SceneOptions): void {
    const redraw = options.scenery !== this.options.scenery;
    this.options = { ...options };
    if (!options.particles) this.particles = this.particles.filter((p) => p.kind === 'zzz');
    if (redraw) this.drawBackdrop();
  }

  // the room can change size, which means a new backdrop and new limits on where the camera can go
  syncSize(world: World): void {
    const sizeKey = `${world.size.width}x${world.size.height}`;
    if (sizeKey === this.drawnSize) return;
    this.drawnSize = sizeKey;
    this.roomSize = world.size;
    this.drawBackdrop();
    this.clampCamera();
  }

  // the room grew on one side and everything's numbers changed, so the view moves with them and nothing seems to jump
  shiftCamera(dx: number, dy: number): void {
    this.camera.x += dx;
    this.camera.y += dy;
    this.clampCamera();
  }

  // zooms in or out on the middle of the window
  zoomBy(factor: number): void {
    this.zoomAt(this.app.screen.width / 2, this.app.screen.height / 2, factor);
  }

  // the whole canvas in the window
  fitAll(): void {
    const c = this.camera;
    c.zoom = this.fitZoom();
    c.x = (this.bounds.width - this.app.screen.width / c.zoom) / 2;
    c.y = (this.bounds.height - this.app.screen.height / c.zoom) / 2;
    this.clampCamera();
  }

  toWorld(screenX: number, screenY: number): { x: number; y: number } {
    return { x: screenX / this.camera.zoom + this.camera.x, y: screenY / this.camera.zoom + this.camera.y };
  }

  toScreen(worldX: number, worldY: number): { x: number; y: number } {
    return { x: (worldX - this.camera.x) * this.camera.zoom, y: (worldY - this.camera.y) * this.camera.zoom };
  }

  // a picture of a creature with this look, for the customise panel
  picture(look: Look): HTMLCanvasElement {
    const g = new Graphics();
    drawNurt(g, STILL_POSE, look);
    const canvas = this.app.renderer.extract.canvas({ target: g, frame: new Rectangle(-44, -100, 88, 104), resolution: 1.5 }) as HTMLCanvasElement;
    g.destroy();
    return canvas;
  }

  private fitZoom(): number {
    return Math.min(this.app.screen.width / this.bounds.width, this.app.screen.height / this.bounds.height);
  }

  private clampCamera(): void {
    const c = this.camera;
    c.zoom = Math.max(this.fitZoom() * ZOOM_OUT_PAST_FIT, Math.min(MAX_ZOOM, c.zoom));
    const viewW = this.app.screen.width / c.zoom;
    const viewH = this.app.screen.height / c.zoom;
    const { width, height } = this.bounds;
    // any corner of the room can come to the middle of the window, at any zoom, so there's nothing you can't get to
    c.x = Math.max(-viewW / 2, Math.min(width - viewW / 2, c.x));
    c.y = Math.max(-viewH / 2, Math.min(height - viewH / 2, c.y));
  }

  zoomAt(screenX: number, screenY: number, factor: number): void {
    const before = this.toWorld(screenX, screenY);
    this.camera.zoom *= factor;
    this.clampCamera();
    const c = this.camera;
    c.x = before.x - screenX / c.zoom;
    c.y = before.y - screenY / c.zoom;
    this.clampCamera();
  }

  // the part of the room in the window right now
  viewRect(): { x: number; y: number; width: number; height: number } {
    return { x: this.camera.x, y: this.camera.y, width: this.app.screen.width / this.camera.zoom, height: this.app.screen.height / this.camera.zoom };
  }

  // puts this spot right in the middle of the window
  lookAt(x: number, y: number): void {
    this.camera.x = x - this.app.screen.width / this.camera.zoom / 2;
    this.camera.y = y - this.app.screen.height / this.camera.zoom / 2;
    this.clampCamera();
  }

  pans = 0; // goes up each time you move the view yourself, so following a creature knows to stop

  pan(screenDx: number, screenDy: number): void {
    this.pans++;
    this.camera.x -= screenDx / this.camera.zoom;
    this.camera.y -= screenDy / this.camera.zoom;
    this.clampCamera();
  }

  // shows that spot, sitting low in the view so there's room to build above
  centreOn(x: number, y: number): void {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    this.camera.x = x - w / this.camera.zoom / 2;
    this.camera.y = y - (h / this.camera.zoom) * 0.75;
    this.clampCamera();
  }

  private fit(world: World): void {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    if (w === this.lastSize.w && h === this.lastSize.h) return;
    const first = this.lastSize.w === 0;
    this.lastSize = { w, h };
    if (first) {
      // starts close enough that the room fills the window. scrolling out still shows all of it.
      this.camera.zoom = Math.max(w / 1000, h / ROOM.height);
      this.clampCamera();
      this.centreOn(world.creature.x, world.size.floor);
    } else {
      this.clampCamera();
    }
  }

  private drawBackdrop(): void {
    const { width, height, floor } = this.roomSize;
    const fancy = this.options.scenery;
    // the sky: deep at the top, a little lighter down by the ground, drawn as bands since it's only drawn once
    const sky = this.sky.clear();
    const top = Math.min(0, floor - 4000);
    const bands = 32;
    for (let i = 0; i < bands; i++) {
      const y0 = top + ((floor - top) * i) / bands;
      sky.rect(-GROUND_REACH, y0, GROUND_REACH * 2 + width, (floor - top) / bands + 1).fill(fancy ? mix(SKY_TOP, SKY_LOW, (i / (bands - 1)) ** 1.6) : 0x171a26);
    }
    if (fancy) {
      // a few stars, the same ones every time for a room this size
      const random = seeded(width * 7919 + height);
      const stars = Math.min(1600, Math.round((width * height) / 9000));
      for (let i = 0; i < stars; i++) {
        const x = random() * width;
        const y = random() * (floor - 120);
        const glow = 0.15 + random() * 0.45 * (1 - y / floor);
        sky.circle(x, y, random() < 0.08 ? 1.8 : 1).fill({ color: random() < 0.15 ? 0xcfe0ff : 0xffffff, alpha: glow });
      }
    }

    // hills far away, past where the room ends on both sides, so moving them never shows an edge
    this.hillsFar.clear();
    this.hillsNear.clear();
    if (fancy) {
      hills(this.hillsFar, -width - 3000, width * 2 + 3000, floor, 260, 0.0021, HILL_FAR, seeded(width + 31));
      hills(this.hillsNear, -width - 3000, width * 2 + 3000, floor, 150, 0.0042, HILL_NEAR, seeded(width + 97));
    }

    // in a really big room, fine lines only add up to a grey blur
    const step = width > 8000 || height > 4000 ? 200 : 40;
    const g = this.backdrop.clear();
    if (!fancy) g.rect(0, 0, width, floor).fill(0x171a26);
    for (let x = 0; x <= width; x += step) g.moveTo(x, 0).lineTo(x, floor);
    for (let y = floor % step; y <= floor; y += step) g.moveTo(0, y).lineTo(width, y);
    g.stroke({ width: step === 40 ? 1 : 2, color: fancy ? 0x2e3550 : 0x232738, alpha: fancy ? 0.35 : 0.7 });
    // the ground goes on for ever, below and to both sides
    g.rect(-GROUND_REACH, floor, GROUND_REACH * 2 + width, GROUND_REACH).fill(0x262b3e);
    if (fancy) {
      // layers of earth, getting darker further down
      for (let i = 1; i <= 4; i++) g.rect(-GROUND_REACH, floor + 10 + i * 14, GROUND_REACH * 2 + width, GROUND_REACH).fill({ color: 0x141724, alpha: 0.18 });
      // little stones in the dirt, and tufts of grass along the top, only where the room is
      const random = seeded(width * 13 + 5);
      for (let x = -400; x < width + 400; x += 26 + random() * 40) {
        const y = floor + 14 + random() * 44;
        g.ellipse(x, y, 2 + random() * 3, 1.5 + random() * 2).fill({ color: 0x3a4160, alpha: 0.6 });
      }
      for (let x = -400; x < width + 400; x += 9 + random() * 16) {
        const tall = 3 + random() * 7;
        const lean = (random() - 0.5) * 5;
        g.poly([x - 2.5, floor + 1, x + lean, floor - tall, x + 2.5, floor + 1]).fill(random() < 0.5 ? GRASS : GRASS_DARK);
      }
      g.rect(-GROUND_REACH, floor, GROUND_REACH * 2 + width, 4).fill(GRASS_DARK);
      g.rect(-GROUND_REACH, floor, GROUND_REACH * 2 + width, 1.5).fill(GRASS);
    } else {
      g.rect(-GROUND_REACH, floor, GROUND_REACH * 2 + width, 3).fill(0x3a4160);
    }
    // and the walls of the room show where it ends
    g.rect(-3, 0, 3, floor).fill(0x3a4160);
    g.rect(width, 0, 3, floor).fill(0x3a4160);
    g.rect(0, -3, width, 3).fill(0x3a4160);

    const b = this.bodyBackdrop.clear();
    b.rect(0, 0, BODY_ROOM.width, BODY_ROOM.height).fill(0x241822);
    for (let x = 0; x <= BODY_ROOM.width; x += 40) b.moveTo(x, 0).lineTo(x, BODY_ROOM.height);
    for (let y = 0; y <= BODY_ROOM.height; y += 40) b.moveTo(0, y).lineTo(BODY_ROOM.width, y);
    b.stroke({ width: 1, color: 0x3a2636, alpha: 0.7 });
    // soft glows, like the inside of something alive
    for (const [x, y, r] of [[420, 300, 360], [1500, 640, 420], [1050, 140, 260], [3200, 1400, 700], [5600, 900, 600], [2400, 3400, 800], [6200, 3600, 700]]) {
      for (let i = 4; i >= 1; i--) b.circle(x, y, (r * i) / 4).fill({ color: 0x5a2a4a, alpha: 0.05 });
    }
    this.bodyBackdrop.visible = this.view === 'body';

    // a build area: a workbench, with rings round the middle where the thing stands
    const a = this.areaBackdrop.clear();
    a.rect(0, 0, AREA.width, AREA.height).fill(0x12221f);
    for (let x = 0; x <= AREA.width; x += 40) a.moveTo(x, 0).lineTo(x, AREA.height);
    for (let y = 0; y <= AREA.height; y += 40) a.moveTo(0, y).lineTo(AREA.width, y);
    a.stroke({ width: 1, color: 0x1f3a35, alpha: 0.8 });
    for (let i = 5; i >= 1; i--) a.circle(AREA_MIDDLE.x, AREA_MIDDLE.y, i * 90).fill({ color: 0x2a5a50, alpha: 0.05 });
    a.circle(AREA_MIDDLE.x, AREA_MIDDLE.y, 180).stroke({ width: 2, color: 0x4fd6c3, alpha: 0.25 });
    this.areaBackdrop.visible = this.view === 'area';
  }

  private faceOf(c: Creature): Face {
    let face = this.faces.get(c.id);
    if (!face) {
      face = { head: { x: c.x, y: c.y }, blinkAt: this.time + rand(1, 4), thinkGlow: 0, happy: 0, hurt: 0 };
      this.faces.set(c.id, face);
    }
    return face;
  }

  handle(events: WorldEvent[], world: World): void {
    this.circuits.handle(events);
    for (const event of events) {
      if (event.type === 'burst') {
        for (let i = 0; i < 18; i++) this.spawn('crumb', event.x, event.y, rand(-200, 200), rand(-260, 60), 0.7, rand(2.5, 5.5), COLOURS[event.colour]);
        continue;
      }
      if (event.type === 'hurt') {
        this.spawn('zzz', event.x + rand(-8, 8), event.y - 6, rand(-20, 20), -60, 0.9, 15, event.amount > 0 ? 0xff6b6b : 0x6be3a1, `${event.amount > 0 ? '-' : '+'}${Math.round(Math.abs(event.amount) * 10) / 10}`);
        continue;
      }
      if (event.type === 'killed') {
        for (let i = 0; i < 16; i++) this.spawn('crumb', event.x, event.y, rand(-220, 220), rand(-280, 40), 0.7, rand(3, 6), COLOURS[event.colour]);
        this.spawn('ring', event.x, event.y, 0, 0, 0.5, 30, 0xffffff);
        continue;
      }
      if (event.type === 'fired') {
        if (event.style === 'aura') this.spawn('ring', event.x, event.y, 0, 0, 0.45, event.range, COLOURS[event.colour]);
        continue;
      }
      if (event.type === 'picked' || event.type === 'looted') {
        for (let i = 0; i < 8; i++) this.spawn('star', event.x, event.y, rand(-90, 90), rand(-160, -40), 0.6, rand(3, 6), 0xffe27a);
        continue;
      }
      if (event.type === 'pulse' || event.type === 'loop' || event.type === 'said' || event.type === 'sound' || event.type === 'solved' || event.type === 'choosing' || event.type === 'chose') continue;
      const c = world.creatureById(event.who);
      if (!c) continue;
      const face = this.faceOf(c);
      const headX = face.head.x;
      const headY = face.head.y - 62;
      if (event.type === 'petted') {
        face.happy = 1;
        for (let i = 0; i < 6; i++) this.spawn('heart', headX + rand(-22, 22), headY, rand(-30, 30), rand(-90, -40), 1.1, rand(7, 12), 0xff7aa2);
      } else if (event.type === 'slapped') {
        face.hurt = 1;
        if (c.id === world.focusId) this.shake = 1;
        for (let i = 0; i < 9; i++) this.spawn('star', headX, headY + 26, rand(-180, 180), rand(-180, 40), 0.5, rand(4, 8), 0xffd34d);
      } else if (event.type === 'hatched') {
        face.happy = 1;
        for (let i = 0; i < 16; i++) this.spawn('crumb', headX, headY + 40, rand(-170, 170), rand(-260, -60), 0.8, rand(2.5, 5), c.look.belly);
      } else if (event.type === 'called') {
        for (let i = 0; i < 3; i++) this.spawn('ring', headX + c.facing * 16, headY + 26, 0, 0, 0.7 + i * 0.2, 8 + i * 8, c.look.belly);
      } else if (event.type === 'cuddled') {
        face.happy = 1;
        const other = world.creatureById(event.other);
        if (other) this.faceOf(other).happy = 1;
        const midX = other ? (headX + this.faceOf(other).head.x) / 2 : headX;
        for (let i = 0; i < 5; i++) this.spawn('heart', midX + rand(-14, 14), headY + 10, rand(-25, 25), rand(-80, -40), 1.2, rand(6, 10), 0xff9cc0);
      } else if (event.type === 'touched') {
        if (event.ate && !event.cuddle) {
          face.happy = Math.max(face.happy, 0.7);
          for (let i = 0; i < 10; i++) this.spawn('crumb', headX + c.facing * 22, headY + 34, rand(-90, 90), rand(-150, -30), 0.5, rand(2, 4), COLOURS.red);
        }
      } else if (event.type === 'died') {
        for (let i = 0; i < 12; i++) this.spawn('ring', headX, headY + 30, rand(-20, 20), rand(-70, -20), 1.2, rand(3, 7), 0xc8d2ff);
      } else if (event.type === 'revived') {
        face.happy = 1;
        for (let i = 0; i < 14; i++) this.spawn('star', headX, headY + 40, rand(-140, 140), rand(-220, -60), 0.8, rand(3, 6), 0xffffff);
      } else if (event.type === 'decided') {
        face.thinkGlow = 1;
      } else if (event.type === 'gaveUp') {
        // a puzzled look, when it couldn't get to something
        if (event.name) this.spawn('zzz', headX + c.facing * 18, headY - 6, 0, -26, 1.3, 20, 0xffd34d, '?');
      } else if (event.type === 'noticed') {
        this.spawn('zzz', headX - c.facing * 18, headY - 6, 0, -30, 1.2, 20, 0x8fe3ff, '!');
      }
    }
  }

  private spawn(kind: Particle['kind'], x: number, y: number, vx: number, vy: number, life: number, size: number, colour: number, text?: string): void {
    if (!this.options.particles && kind !== 'zzz') return;
    if (this.particles.length > 150) this.particles.shift();
    this.particles.push({ kind, x, y, vx, vy, age: 0, life, size, colour, text });
  }

  // alpha is how far through the current tick we are, so things glide smoothly at any frame rate
  draw(world: World, dt: number, speed: number, alpha: number, overlay: Overlay): void {
    this.syncSize(world);
    this.fit(world);
    // paused, dt is 0, so legs, blinks, sparkles and pulses all hold where they are
    this.still = dt === 0;
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 4);

    const glide = speed > 4 ? 1 : alpha;
    for (const c of world.creatures) {
      const face = this.faceOf(c);
      face.thinkGlow = Math.max(0, face.thinkGlow - dt * 1.6);
      face.happy = Math.max(0, face.happy - dt * 0.6);
      face.hurt = Math.max(0, face.hurt - dt * 1.2);
      const before = world.previousCreatures.get(c.id) ?? c;
      face.head = { x: before.x + (c.x - before.x) * glide, y: before.y + (c.y - before.y) * glide };
    }

    const cam = this.camera;
    this.root.scale.set(cam.zoom);
    this.root.position.set(-cam.x * cam.zoom + Math.sin(this.time * 70) * 6 * this.shake * (this.options.shake ? 1 : 0), -cam.y * cam.zoom);
    // further away things move less as you look around
    const middle = cam.x + this.app.screen.width / cam.zoom / 2 - this.roomSize.width / 2;
    this.hillsFar.position.x = middle * 0.6;
    this.hillsNear.position.x = middle * 0.3;

    this.drawThings(world, glide, overlay);
    this.drawCreatures(world);
    const poseOf = (t: Thing): { x: number; y: number; angle: number } => {
      // in its build area, a thing stands still in the middle, wherever it really is
      if (this.view === 'area' && t.id === this.area) return { ...AREA_MIDDLE, angle: 0 };
      const was = world.previous.get(t.id);
      return was ? { x: was.x + (t.x - was.x) * glide, y: was.y + (t.y - was.y) * glide, angle: was.angle + (t.angle - was.angle) * glide } : t;
    };
    this.drawAreaOwner(world);
    this.circuits.draw(world, cam.zoom, dt, poseOf, overlay.wires);
    this.drawParticles(dt);
    this.drawOverlay(overlay, world);
  }

  // the thing whose build area this is, in the middle, so you can wire straight to it
  private drawAreaOwner(world: World): void {
    const g = this.areaLayer.clear();
    const t = this.view === 'area' ? world.thing(this.area) : undefined;
    if (!t) {
      this.areaTitle.visible = false;
      return;
    }
    const { x, y } = AREA_MIDDLE;
    const picture = t.decor ? null : this.pictureFor(world, t);
    if (picture) {
      this.shapePath(g, t.form, t.hw, t.hh, x, y, 0);
      g.fill({ texture: picture, textureSpace: 'local', color: 0xffffff });
    }
    this.drawThing(g, t, x, y, 0, !!picture);
    this.areaTitle.visible = true;
    this.areaTitle.text = `${t.name}'s build area`;
    this.areaTitle.position.set(x, y - boundingRadius(t) - 28);
  }

  private drawThings(world: World, glide: number, overlay: Overlay): void {
    const g = this.worldLayer.clear();
    const doing = world.creature.doing;
    // soft shadows on the floor under anything near it, drawn first so everything stands on them
    const floor = this.roomSize.floor;
    for (const t of world.things) {
      if (t.inBody || t.voice || t.part || t.bullet || (t.hidden && this.playing)) continue;
      const reach = boundingRadius(t);
      const gap = floor - (t.y + reach);
      if (gap > 160 || gap < -reach) continue;
      const strength = Math.max(0, 1 - Math.max(0, gap) / 160) * (t.solid ? 0.32 : 0.15) * (t.hidden ? 0.4 : 1);
      g.ellipse(t.x, floor + 2, Math.max(6, (t.form === 'circle' ? t.hw : Math.max(t.hw, t.hh)) * (1 - Math.max(0, gap) / 400)), 4).fill({ color: 0x000000, alpha: strength });
    }
    const stillPainted = new Set<number>();
    const stillVoices = new Set<number>();
    const stillLabels = new Set<number>();
    for (const t of world.things) {
      if (t.inBody || t.area !== undefined) continue;
      if (t.bullet) {
        // a spark from an Ability
        g.circle(t.x, t.y, t.hw * 2).fill({ color: COLOURS[t.colour], alpha: 0.25 });
        g.circle(t.x, t.y, t.hw).fill(COLOURS[t.colour]);
        g.circle(t.x, t.y, t.hw * 0.5).fill(0xffffff);
        continue;
      }
      const was = world.previous.get(t.id);
      const pose = was ? { x: was.x + (t.x - was.x) * glide, y: was.y + (t.y - was.y) * glide, angle: was.angle + (t.angle - was.angle) * glide } : t;
      if (t.voice) {
        stillVoices.add(t.id);
        this.drawVoice(g, t, world);
        continue;
      }
      if (t.hidden && this.playing) continue;
      if (!t.part) {
        const picture = this.pictureFor(world, t);
        if (picture) {
          stillPainted.add(t.id);
          this.paint(t, picture, pose.x, pose.y, pose.angle);
        }
        this.drawThing(g, t, pose.x, pose.y, pose.angle, !!picture);
        this.drawGameBits(g, t, pose.x, pose.y);
      }
      if (t.label && !(t.hidden && this.playing)) {
        stillLabels.add(t.id);
        this.drawLabel(t, pose.x, pose.y);
      }
      if (doing?.targetId === t.id) this.drawAttention(g, t, pose.x, pose.y);
      if (overlay.selected.has(t.id)) this.outline(g, t, pose.x, pose.y, pose.angle, SELECT, 2.5);
    }
    for (const [id, words] of this.labels) {
      if (stillLabels.has(id)) continue;
      words.destroy();
      this.labels.delete(id);
    }
    for (const [id, words] of this.voices) {
      if (stillVoices.has(id)) continue;
      words.destroy();
      this.voices.delete(id);
    }
    for (const [id, one] of this.painted) {
      if (stillPainted.has(id)) continue;
      one.g.destroy();
      this.painted.delete(id);
    }
  }

  // words over a thing, for the player
  private drawLabel(t: Thing, x: number, y: number): void {
    let words = this.labels.get(t.id);
    if (!words) {
      words = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 14, fontWeight: 'bold', fill: 0xffffff, stroke: { color: 0x0d0f16, width: 4 } } });
      words.anchor.set(0.5, 1);
      this.labels.set(t.id, words);
      this.textLayer.addChild(words);
    }
    if (words.text !== t.label) words.text = t.label ?? '';
    words.position.set(x, y - boundingRadius(t) - (t.health !== undefined ? 14 : 6));
    words.visible = this.view === 'room';
  }

  // a health bar once it's been hurt, and while building, small marks for what else it's set up as
  private drawGameBits(g: Graphics, t: Thing, x: number, y: number): void {
    const top = y - boundingRadius(t) - 8;
    if (t.health !== undefined && t.hp !== undefined && t.health < t.hp) {
      const w = Math.max(24, Math.min(90, t.hw * 2));
      const left = Math.max(0, t.health / t.hp);
      g.roundRect(x - w / 2 - 1, top - 1, w + 2, 6, 3).fill({ color: 0x0d0f16, alpha: 0.75 });
      g.roundRect(x - w / 2, top, w * left, 4, 2).fill(left > 0.5 ? 0x6be3a1 : left > 0.25 ? 0xffc24d : 0xff5a5a);
    }
    // a plain shape that's an enemy gets a scowl, so you can tell
    if (t.enemy && !t.decor && !t.texture) {
      const dir = Math.sign(t.vx) || 1;
      const s = Math.max(2.5, Math.min(t.hw, t.hh) * 0.18);
      for (const dx of [-s * 1.4, s * 1.4]) {
        g.circle(x + dx + dir * s, y - s, s).fill(0xffffff);
        g.circle(x + dx + dir * s * 1.4, y - s * 0.8, s * 0.5).fill(0x14161f);
      }
      g.moveTo(x - s * 2.6 + dir * s, y - s * 2.6).lineTo(x - s * 0.4 + dir * s, y - s * 1.8).stroke({ width: s * 0.5, color: 0x14161f });
      g.moveTo(x + s * 2.6 + dir * s, y - s * 2.6).lineTo(x + s * 0.4 + dir * s, y - s * 1.8).stroke({ width: s * 0.5, color: 0x14161f });
    }
    if (this.playing) return;
    if (t.ignored) {
      // a crossed-out circle: creatures leave this alone
      const r = 5;
      g.circle(x + t.hw * 0.6, y - t.hh * 0.6, r).stroke({ width: 1.5, color: 0xff8a8a, alpha: 0.9 });
      g.moveTo(x + t.hw * 0.6 - r * 0.7, y - t.hh * 0.6 - r * 0.7).lineTo(x + t.hw * 0.6 + r * 0.7, y - t.hh * 0.6 + r * 0.7).stroke({ width: 1.5, color: 0xff8a8a, alpha: 0.9 });
    }
  }

  // a word hanging in the air, which fades as it goes
  private drawVoice(g: Graphics, t: Thing, world: World): void {
    let words = this.voices.get(t.id);
    if (!words) {
      words = new Text({ text: `"${t.name}"`, style: { fontFamily: 'sans-serif', fontSize: 15, fontWeight: 'bold', fill: 0x14202a } });
      words.anchor.set(0.5);
      this.voices.set(t.id, words);
      this.textLayer.addChild(words);
    }
    const fade = Math.min(1, ((t.expires ?? world.tick) - world.tick) / 45);
    const hw = words.width / 2 + 12;
    g.roundRect(t.x - hw, t.y - 16, hw * 2, 32, 12).fill({ color: 0xfff3cf, alpha: fade });
    g.poly([t.x - 8, t.y + 15, t.x + 8, t.y + 15, t.x, t.y + 27]).fill({ color: 0xfff3cf, alpha: fade });
    words.position.set(t.x, t.y);
    words.alpha = fade;
    words.visible = this.view === 'room';
  }

  // the view keeps up with something, in Play mode
  follow(x: number, y: number, zoom: number, dt: number): void {
    const c = this.camera;
    c.zoom += (zoom - c.zoom) * Math.min(1, dt * 4);
    const wantX = x - this.app.screen.width / c.zoom / 2;
    const wantY = y - this.app.screen.height / c.zoom / 2;
    c.x += (wantX - c.x) * Math.min(1, dt * 6);
    c.y += (wantY - c.y) * Math.min(1, dt * 6);
    this.clampCamera();
  }

  // the picture on a thing, if it has one and it has finished loading. until then, or if it's no good, it's just its colour.
  private pictureFor(world: World, t: Thing): Texture | null {
    if (!t.texture) return null;
    const known = this.pictures.get(t.texture);
    if (known) return known === 'loading' || known === 'bad' ? null : known;
    const data = world.textures[t.texture];
    if (!data) return null;
    const id = t.texture;
    this.pictures.set(id, 'loading');
    const image = new Image();
    image.onload = () => {
      this.pictures.set(id, image.naturalWidth > LARGEST_PICTURE || image.naturalHeight > LARGEST_PICTURE ? 'bad' : Texture.from(image));
    };
    image.onerror = () => this.pictures.set(id, 'bad');
    image.src = data;
    return null;
  }

  // each picture gets a little drawing of its own that moves as a whole, so it turns with the shape it's on
  private paint(t: Thing, picture: Texture, x: number, y: number, angle: number): void {
    let one = this.painted.get(t.id);
    if (!one) {
      one = { g: new Graphics(), drawn: '' };
      this.painted.set(t.id, one);
      this.pictureLayer.addChild(one.g);
    }
    const drawn = `${t.texture}|${t.form}|${t.hw}|${t.hh}`;
    if (one.drawn !== drawn) {
      one.drawn = drawn;
      one.g.clear();
      this.shapePath(one.g, t.form, t.hw, t.hh, 0, 0, 0);
      one.g.fill({ texture: picture, textureSpace: 'local', color: 0xffffff });
    }
    one.g.position.set(x, y);
    one.g.rotation = angle;
    one.g.alpha = t.solid ? 1 : 0.45;
  }

  private shapePath(g: Graphics, form: Form, hw: number, hh: number, x: number, y: number, angle: number): void {
    if (form === 'circle') {
      g.circle(x, y, hw);
    } else {
      const points = corners({ form, hw, hh, x, y, angle });
      g.poly(points.flatMap((p) => [p.x, p.y]));
    }
  }

  private drawThing(g: Graphics, t: Thing, x: number, y: number, angle: number, painted: boolean): void {
    const colour = COLOURS[t.colour];
    // see-through means other things pass through it, and hidden things only show at all while you're building
    const fade = t.hidden ? 0.2 : t.solid ? 1 : 0.45;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const art = t.decor && !painted ? DECOR_ART[t.decor] : undefined;
    if (art) {
      // a decoration is drawn as itself, and doesn't fade when you can walk through it, since that's what scenery is for
      art(pixiPen(g, x, y, t.hw, t.hh, angle, this.still ? 0 : this.time, t.hidden ? 0.25 : 1));
      return;
    }
    if (!painted) {
      this.shapePath(g, t.form, t.hw, t.hh, x, y, angle);
      g.fill({ color: colour, alpha: fade });
      // a darker edge, so things stand out against the room and each other
      if (Math.min(t.hw, t.hh) >= 5) g.stroke({ width: 2, color: darker(colour), alpha: 0.85 * fade, alignment: 1 });
      const spotX = -t.hw * 0.35;
      const spotY = -Math.min(t.hh, t.hw) * 0.35;
      const shine = Math.max(2, Math.min(t.hw, t.hh) * 0.26);
      g.circle(x + spotX * cos - spotY * sin, y + spotX * sin + spotY * cos, shine).fill({ color: 0xffffff, alpha: 0.3 * fade });
    }
    if (t.fixed) {
      // a pin in the middle means it's staying put
      g.circle(x, y, 3.5).fill({ color: 0x14202a, alpha: 0.75 });
      g.circle(x, y, 1.5).fill({ color: 0xffffff, alpha: 0.85 });
    } else if (!t.gravity) {
      // a little ring means it floats
      g.circle(x, y, 5).stroke({ width: 1.5, color: 0xffffff, alpha: 0.7 });
    }
    if (t.give && feeds(t.give) > 0) {
      // anything edible has a stem and a leaf, which is only for the player: the creature can't see them
      const tipX = x + t.hh * sin;
      const tipY = y - t.hh * cos;
      g.moveTo(tipX, tipY).lineTo(tipX + 7 * sin + 2 * cos, tipY - 7 * cos + 2 * sin).stroke({ width: 2, color: 0x6e4a2a });
      g.ellipse(tipX + 6 * sin + 7 * cos, tipY - 6 * cos + 7 * sin, 6, 3).fill(0x5ccb6d);
    }
  }

  private outline(g: Graphics, t: { form: Form; hw: number; hh: number }, x: number, y: number, angle: number, colour: number, width: number): void {
    this.shapePath(g, t.form, t.hw + 2, t.hh + 2, x, y, angle);
    g.stroke({ width: width / this.camera.zoom, color: colour });
  }

  // the glow around whatever it's thinking about
  private drawAttention(g: Graphics, t: Thing, x: number, y: number): void {
    const r = (t.form === 'circle' ? t.hw : Math.max(...localCorners(t.form, t.hw, t.hh).map((p) => Math.hypot(p.x, p.y)))) + 10;
    const dashes = 14;
    for (let i = 0; i < dashes; i++) {
      const a = (i / dashes) * Math.PI * 2 + this.time * 0.9;
      g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      g.arc(x, y, r, a, a + (Math.PI / dashes) * 0.9);
    }
    g.stroke({ width: 2, color: SELECT, alpha: 0.6 });
  }

  private drawOverlay(overlay: Overlay, world: World): void {
    const g = this.overlayLayer.clear();
    const px = 1 / this.camera.zoom;
    this.angleLabel.visible = false;

    // the room's things show being selected on their own layer, which is hidden while looking inside
    if (this.view !== 'room') {
      for (const id of overlay.selected) {
        const t = world.thing(id);
        if (t && id === this.area) this.outline(g, t, AREA_MIDDLE.x, AREA_MIDDLE.y, 0, SELECT, 2.5);
        else if (t) this.outline(g, t, t.x, t.y, t.angle, SELECT, 2.5);
      }
    }

    if (overlay.ghost) {
      const s = overlay.ghost;
      this.shapePath(g, s.form, s.hw, s.hh, s.x, s.y, s.angle);
      g.fill({ color: COLOURS[s.colour], alpha: 0.5 });
      this.outline(g, s, s.x, s.y, s.angle, 0xffffff, 1.5);
    }

    for (const h of overlay.handles) {
      g.rect(h.x - 5 * px, h.y - 5 * px, 10 * px, 10 * px).fill(0xffffff);
      g.rect(h.x - 5 * px, h.y - 5 * px, 10 * px, 10 * px).stroke({ width: 1.5 * px, color: SELECT });
    }

    if (overlay.box) {
      const b = overlay.box;
      g.rect(Math.min(b.x1, b.x2), Math.min(b.y1, b.y2), Math.abs(b.x2 - b.x1), Math.abs(b.y2 - b.y1));
      g.fill({ color: SELECT, alpha: 0.12 });
      g.stroke({ width: 1.5 * px, color: SELECT, alpha: 0.9 });
    }

    if (overlay.gizmo) {
      // the rotation circle, with gridlines around the edge that the angle snaps to
      const { x, y, radius, angle, active } = overlay.gizmo;
      g.circle(x, y, radius).stroke({ width: (active ? 2.5 : 2) * px, color: SELECT, alpha: active ? 1 : 0.8 });
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const major = i % 6 === 0;
        const inner = radius - (major ? 14 : i % 3 === 0 ? 10 : 6) * px;
        g.moveTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner).lineTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
      }
      g.stroke({ width: 1.5 * px, color: SELECT, alpha: 0.9 });
      const handleX = x + Math.cos(angle) * radius;
      const handleY = y + Math.sin(angle) * radius;
      g.moveTo(x, y).lineTo(handleX, handleY).stroke({ width: 1.5 * px, color: 0xffffff, alpha: 0.4 });
      g.circle(handleX, handleY, 7 * px).fill(0xffffff);
      g.circle(handleX, handleY, 4 * px).fill(SELECT);

      let degrees = Math.round((angle * 180) / Math.PI) % 360;
      if (degrees < 0) degrees += 360;
      this.angleLabel.text = `${degrees}°`;
      this.angleLabel.visible = true;
      this.angleLabel.scale.set(px);
      this.angleLabel.position.set(x + radius + 12 * px, y - 8 * px);
    }
  }

  private drawCreatures(world: World): void {
    const g = this.creatureLayer.clear();
    for (const c of world.creatures) if (!c.hiddenAway) this.drawCreature(g, world, c);
    // who the one you're looking at is going for, when it's another creature
    const focused = world.creature;
    const after = focused.doing ? world.creatureById(focused.doing.targetId ?? -1) : undefined;
    if (after && !after.hiddenAway && this.view === 'room') {
      const face = this.faceOf(after);
      this.drawAttention(g, { form: 'circle', hw: 34, hh: 34 } as Thing, face.head.x, face.head.y - 30);
    }
    // once there's more than one, you need to know who's who
    const many = world.creatures.length > 1 && this.view === 'room';
    const px = 1 / this.camera.zoom;
    for (const c of world.creatures) {
      let tag = this.tags.get(c.id);
      if (!tag) {
        tag = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 13, fontWeight: 'bold', fill: 0xffffff } });
        tag.anchor.set(0.5, 1);
        this.tags.set(c.id, tag);
        this.textLayer.addChild(tag);
      }
      tag.visible = many && !c.hiddenAway;
      if (!tag.visible) continue;
      const face = this.faceOf(c);
      const top = face.head.y - 84 * stageSize(world.tick - c.bornTick);
      const words = c.dead ? `${c.name} (dead)` : c.name;
      if (tag.text !== words) tag.text = words;
      tag.scale.set(px);
      tag.position.set(face.head.x, top);
      const focused = c.id === world.focusId;
      tag.alpha = focused ? 1 : 0.6;
      if (focused) g.poly([face.head.x - 6 * px, top + 3 * px, face.head.x + 6 * px, top + 3 * px, face.head.x, top + 11 * px]).fill(SELECT);
    }
    for (const [id, tag] of this.tags) {
      if (world.creatureById(id)) continue;
      tag.destroy();
      this.tags.delete(id);
      this.faces.delete(id);
    }
  }

  private drawCreature(g: Graphics, world: World, c: Creature): void {
    const face = this.faceOf(c);
    const x = face.head.x;
    const feetY = face.head.y;
    const t = this.time;
    const action = c.doing?.action;
    const resting = action === 'rest';
    const stunned = c.stunned > 0;

    if (c.hatching > 0) {
      g.ellipse(x, feetY + 3, 22, 4).fill({ color: 0x000000, alpha: 0.3 });
      drawEgg(g, x, feetY, t, 1 - c.hatching / 120, c.look);
      return;
    }

    const size = stageSize(world.tick - c.bornTick);
    const floor = this.roomSize.floor;
    if (feetY > floor - 8) g.ellipse(x, floor + 3, (25 - (c.walking ? Math.abs(Math.sin(t * 11)) * 5 : 0)) * size, 4).fill({ color: 0x000000, alpha: 0.3 });

    const target = world.targetOf(c.doing?.targetId ?? null);
    const lookX = target ? Math.sign(target.x - x) || c.facing : c.facing;
    const lookY = target ? Math.max(-1, Math.min(1, (target.y - (feetY - 34)) / 120)) : 0;

    if (t > face.blinkAt + 0.13) face.blinkAt = t + rand(1.6, 5);
    const hungry = !c.dead && world.worstNeed(c) > 0.65;

    // a baby is drawn smaller, standing on the same spot. someone dead lies on their side, with the colour gone out of them
    g.save();
    g.scaleTransform(size, size); // each of these applies after the last, so the scale has to come first
    if (c.dead) {
      g.rotateTransform(c.facing * Math.PI / 2);
      g.translateTransform(0, -24 * size);
    }
    g.translateTransform(x, feetY);
    drawNurt(
      g,
      {
        x: 0,
        feetY: 0,
        facing: c.facing,
        time: t,
        walking: c.walking,
        resting,
        stunned,
        dragged: c.dragged,
        calling: action === 'call',
        lookX,
        lookY,
        blinking: c.dead || t > face.blinkAt,
        hungry,
        delighted: !c.dead && face.happy > 0.15,
        mood: c.dead ? -1 : Math.max(-1, Math.min(1, c.brain.mood + face.happy - face.hurt - (hungry ? 0.5 : 0))),
        thinkGlow: c.dead ? 0 : face.thinkGlow,
      },
      c.dead ? { ...c.look, body: faded(c.look.body), belly: faded(c.look.belly), accent: faded(c.look.accent) } : c.look,
    );
    g.restore();

    // zzz, using pooled text so they don't get rebuilt
    if (resting && !this.still && Math.random() < 0.02) this.spawn('zzz', x + 24, feetY - 60, 12, -22, 1.8, 15, 0xc8d2ff);
    // a little dust kicked up by its feet
    if (c.walking && !c.floating && !c.climbing && !this.still && feetY > floor - 4 && Math.random() < 0.06 * (c.brain.genes.pace || 1)) {
      this.spawn('puff', x - c.facing * 14, floor - 3, -c.facing * rand(10, 30), rand(-18, -6), 0.55, rand(3, 5), 0x8a90a3);
    }
    if (this.options.intent && !c.dead && !c.dragged && c.id === world.focusId) this.drawIntent(g, world, c, x, feetY - 84 * size);
  }

  // a thought bubble with a little picture of what it's going for, once that's far enough off to lose track of
  private drawIntent(g: Graphics, world: World, c: Creature, x: number, top: number): void {
    const doing = c.doing;
    if (!doing || doing.targetId === null || doing.action === 'avoid') return;
    const target = world.targetOf(doing.targetId);
    if (!target || Math.hypot(target.x - c.x, target.y - c.y) < 260) return;
    const other = world.creatureById(target.id);
    const bx = x + 26;
    const by = top - 14;
    g.circle(x + 8, top + 4, 2.5).fill({ color: 0xffffff, alpha: 0.75 });
    g.circle(x + 15, top - 3, 4).fill({ color: 0xffffff, alpha: 0.85 });
    g.roundRect(bx - 18, by - 16, 36, 30, 12).fill({ color: 0xffffff, alpha: 0.92 });
    if (other) {
      // a heart for a cuddle, and a creature's own colour for anything else
      const s = 6;
      const hx = bx;
      const hy = by - 2;
      g.moveTo(hx, hy + s * 0.9)
        .bezierCurveTo(hx - s * 1.4, hy - s * 0.1, hx - s * 0.6, hy - s * 1.1, hx, hy - s * 0.35)
        .bezierCurveTo(hx + s * 0.6, hy - s * 1.1, hx + s * 1.4, hy - s * 0.1, hx, hy + s * 0.9)
        .fill(doing.action === 'touch' ? 0xff7aa2 : other.look.body);
      return;
    }
    const scale = 9 / Math.max(target.hw, target.hh, 1);
    this.shapePath(g, target.form, target.hw * scale, target.hh * scale, bx, by - 1, target.angle);
    g.fill(COLOURS[target.colour]).stroke({ width: 1.2, color: darker(COLOURS[target.colour]) });
  }

  private drawParticles(dt: number): void {
    const g = this.fxLayer.clear();
    for (const z of this.zPool) z.visible = false;
    let zUsed = 0;
    this.particles = this.particles.filter((p) => (p.age += dt) < p.life);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const left = 1 - p.age / p.life;
      if (p.kind === 'crumb' || p.kind === 'star') p.vy += 500 * dt;
      if (p.kind === 'puff') {
        g.circle(p.x, p.y, p.size * (1 + p.age * 3)).fill({ color: p.colour, alpha: left * 0.35 });
        continue;
      }
      if (p.kind === 'heart') {
        const s = p.size;
        g.moveTo(p.x, p.y + s * 0.7)
          .bezierCurveTo(p.x - s * 1.3, p.y - s * 0.2, p.x - s * 0.5, p.y - s, p.x, p.y - s * 0.3)
          .bezierCurveTo(p.x + s * 0.5, p.y - s, p.x + s * 1.3, p.y - s * 0.2, p.x, p.y + s * 0.7)
          .fill({ color: p.colour, alpha: left });
      } else if (p.kind === 'ring') {
        g.circle(p.x, p.y, p.size + p.age * 60).stroke({ width: 2, color: p.colour, alpha: left * 0.8 });
      } else if (p.kind === 'zzz') {
        let label = this.zPool[zUsed];
        if (!label) {
          label = new Text({ text: 'z', style: { fontFamily: 'sans-serif', fontSize: 16, fontWeight: 'bold', fill: 0xffffff } });
          this.zPool.push(label);
          this.textLayer.addChild(label);
        }
        zUsed++;
        const words = p.text ?? 'z';
        if (label.text !== words) label.text = words;
        label.scale.set(p.size / 16);
        label.visible = true;
        label.position.set(p.x, p.y);
        label.alpha = left;
        label.tint = p.colour;
      } else {
        g.circle(p.x, p.y, p.size).fill({ color: p.colour, alpha: left });
      }
    }
  }
}

// how much this feeds a creature, whichever way round its numbers run
export function feeds(give: { drive: string; amount: number }): number {
  return give.drive.toLowerCase() === 'hunger' ? -give.amount : give.amount;
}

// the same colour, darker, for edges
function darker(colour: number): number {
  return mix(colour, 0x0b0e1a, 0.42);
}

// the same colour with most of the colour gone
function faded(colour: number): number {
  const r = (colour >> 16) & 255;
  const g = (colour >> 8) & 255;
  const b = colour & 255;
  const grey = (r + g + b) / 3;
  const mix = (v: number): number => Math.round((v * 0.25 + grey * 0.75) * 0.8);
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// the same numbers every time from the same seed, so scenery doesn't change each time it's drawn
function seeded(seed: number): () => number {
  let a = Math.floor(seed) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// partway from one colour to another
function mix(from: number, to: number, along: number): number {
  const part = (at: number): number => Math.round(((from >> at) & 255) + (((to >> at) & 255) - ((from >> at) & 255)) * along) << at;
  return part(16) | part(8) | part(0);
}

// a line of rolling hills standing on the floor, made of a few waves added together
function hills(g: Graphics, from: number, to: number, floor: number, tall: number, often: number, colour: number, random: () => number): void {
  const phases = [random() * 10, random() * 10, random() * 10];
  const points: number[] = [from, floor + 2];
  const step = Math.max(40, (to - from) / 2400);
  for (let x = from; x <= to; x += step) {
    const wave = Math.sin(x * often + phases[0]) * 0.5 + Math.sin(x * often * 2.3 + phases[1]) * 0.3 + Math.sin(x * often * 5.1 + phases[2]) * 0.2;
    points.push(x, floor - tall * (0.55 + 0.45 * wave));
  }
  points.push(to, floor + 2);
  g.poly(points).fill(colour);
}
