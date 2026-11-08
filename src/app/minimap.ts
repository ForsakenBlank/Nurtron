// a little map of the whole room in the corner, for finding your way about a big one. click or drag on it to look there.
import type { World } from '../sim/world.ts';
import type { Scene } from './scene.ts';
import { COLOURS } from './scene.ts';

const WIDTH = 200;
const MOST_HEIGHT = 120;
const LEAST_HEIGHT = 36;

export class Minimap {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D | null;
  private scene: Scene;
  private getWorld: () => World;
  private scale = { x: 1, y: 1 };
  moved = false; // you looked somewhere with it, so anything following the creature should stop

  constructor(canvas: HTMLCanvasElement, scene: Scene, getWorld: () => World) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.scene = scene;
    this.getWorld = getWorld;
    canvas.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      canvas.setPointerCapture(e.pointerId);
      this.lookAt(e);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (canvas.hasPointerCapture(e.pointerId)) this.lookAt(e);
    });
    canvas.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  }

  private lookAt(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this.scale.x;
    const y = (e.clientY - rect.top) / this.scale.y;
    this.scene.lookAt(x, y);
    this.moved = true;
    this.draw();
  }

  draw(): void {
    const g = this.context;
    if (!g) return;
    const world = this.getWorld();
    const { width, height, floor } = world.size;
    const tall = Math.round(Math.max(LEAST_HEIGHT, Math.min(MOST_HEIGHT, (WIDTH * height) / width)));
    const ratio = window.devicePixelRatio || 1;
    if (this.canvas.width !== WIDTH * ratio || this.canvas.height !== tall * ratio) {
      this.canvas.width = WIDTH * ratio;
      this.canvas.height = tall * ratio;
      this.canvas.style.width = `${WIDTH}px`;
      this.canvas.style.height = `${tall}px`;
    }
    this.scale = { x: WIDTH / width, y: tall / height };
    const sx = this.scale.x;
    const sy = this.scale.y;
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.clearRect(0, 0, WIDTH, tall);
    g.fillStyle = 'rgba(14, 17, 28, 0.88)';
    g.fillRect(0, 0, WIDTH, tall);
    g.fillStyle = '#262b3e';
    g.fillRect(0, floor * sy, WIDTH, tall - floor * sy);
    g.fillStyle = '#3d6b54';
    g.fillRect(0, floor * sy - 1, WIDTH, 1.5);

    for (const t of world.things) {
      if (t.inBody || t.voice || t.part || t.hidden) continue;
      g.fillStyle = hex(COLOURS[t.colour]);
      const w = Math.max(2, t.hw * 2 * sx);
      const h = Math.max(2, t.hh * 2 * sy);
      g.fillRect(t.x * sx - w / 2, t.y * sy - h / 2, w, h);
    }
    for (const t of world.things) {
      // parts show as faint marks, so you can see where you've been building
      if (t.inBody || !t.part || t.hidden) continue;
      g.fillStyle = 'rgba(144, 150, 173, 0.45)';
      g.fillRect(t.x * sx - 1.5, t.y * sy - 1.5, 3, 3);
    }
    for (const c of world.creatures) {
      if (c.hiddenAway) continue;
      const x = c.x * sx;
      const y = Math.min(tall - 3, (c.y - 30) * sy);
      g.beginPath();
      g.arc(x, y, c.id === world.focusId ? 4 : 3, 0, Math.PI * 2);
      g.fillStyle = c.dead ? '#6b7088' : hex(c.look.body);
      g.fill();
      if (c.id === world.focusId) {
        g.lineWidth = 1.5;
        g.strokeStyle = '#ffffff';
        g.stroke();
      }
    }

    if (this.scene.view === 'room') {
      const view = this.scene.viewRect();
      g.strokeStyle = 'rgba(79, 214, 195, 0.9)';
      g.lineWidth = 1.5;
      g.strokeRect(view.x * sx, view.y * sy, view.width * sx, view.height * sy);
    }
  }
}

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
