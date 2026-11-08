// a little picture of a world's map for the main menu: the floor, what's been built, and who lives there.
// it frames whatever is in the room rather than the whole room, so a huge world isn't just a thin line of specks.
import type { World } from '../sim/world.ts';
import type { WorldSummary } from './worlds.ts';
import { COLOURS } from './scene.ts';

const W = 320;
const H = 160;
const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

// the part of the room worth showing: everything in it, with some space round it, at the picture's shape
export function frameOf(world: World): { x: number; y: number; w: number; h: number } {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  const take = (x: number, y: number, r: number): void => {
    left = Math.min(left, x - r);
    right = Math.max(right, x + r);
    top = Math.min(top, y - r);
  };
  for (const t of world.things) if (!t.inBody && !t.hidden && !t.voice) take(t.x, t.y, Math.max(t.hw, t.hh));
  for (const c of world.creatures) if (!c.hiddenAway) take(c.x, c.y - 30, 40);
  const floor = world.size.floor;
  if (!Number.isFinite(left)) {
    left = world.size.width / 2 - 600;
    right = world.size.width / 2 + 600;
    top = floor - 300;
  }
  let w = Math.max(800, right - left + 240);
  let h = Math.max(w / 2, floor + 60 - Math.min(top, floor - 150) + 60);
  w = Math.max(w, h * 2);
  h = w / 2;
  w = Math.min(w, world.size.width);
  h = Math.min(w / 2, world.size.height);
  const middle = (left + right) / 2;
  const x = Math.max(0, Math.min(world.size.width - w, middle - w / 2));
  const y = Math.max(0, Math.min(world.size.height - h, floor + 60 - h));
  return { x, y, w, h };
}

export function drawPreview(world: World): string {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) return '';
  const frame = frameOf(world);
  const s = Math.min(W / frame.w, H / frame.h);
  const sx = (x: number): number => (x - frame.x) * s + (W - frame.w * s) / 2;
  const sy = (y: number): number => (y - frame.y) * s + (H - frame.h * s) / 2;

  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#1a1e2c');
  sky.addColorStop(1, '#12141d');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  const floor = sy(world.size.floor);
  g.fillStyle = '#262b3d';
  g.fillRect(0, floor, W, H - floor);
  g.fillStyle = '#3a4058';
  g.fillRect(0, floor, W, Math.max(1, 2 * s));

  for (const t of world.things) {
    if (t.inBody || t.hidden || t.voice) continue;
    g.save();
    g.translate(sx(t.x), sy(t.y));
    g.rotate(t.angle);
    g.fillStyle = hex(COLOURS[t.colour]);
    g.globalAlpha = t.part && t.part.kind !== 'button' ? 0.45 : 1;
    const hw = Math.max(1, t.hw * s);
    const hh = Math.max(1, t.hh * s);
    g.beginPath();
    if (t.form === 'circle') g.arc(0, 0, hw, 0, Math.PI * 2);
    else if (t.form === 'triangle') {
      g.moveTo(0, -hh);
      g.lineTo(hw, hh);
      g.lineTo(-hw, hh);
    } else if (t.form === 'hexagon') {
      for (let i = 0; i < 6; i++) g.lineTo(Math.cos((i * Math.PI) / 3) * hw, Math.sin((i * Math.PI) / 3) * hh);
    } else g.rect(-hw, -hh, hw * 2, hh * 2);
    g.fill();
    g.restore();
  }

  // each creature as a little blob in its own colours, with eyes
  for (const c of world.creatures) {
    if (c.hiddenAway) continue;
    const r = Math.max(3, 26 * s);
    const x = sx(c.x);
    const y = sy(c.y) - r;
    g.fillStyle = hex(c.dead ? 0x6b7083 : c.look.body);
    g.beginPath();
    if (c.hatching > 0) g.ellipse(x, y, r * 0.8, r, 0, 0, Math.PI * 2);
    else g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    if (c.hatching > 0 || r < 4) continue;
    g.fillStyle = hex(c.look.eyes);
    for (const side of [-1, 1]) {
      g.beginPath();
      g.arc(x + side * r * 0.35 + c.facing * r * 0.15, y - r * 0.15, Math.max(0.8, r * 0.14), 0, Math.PI * 2);
      g.fill();
    }
  }
  try {
    const webp = canvas.toDataURL('image/webp', 0.8);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

export function summarise(world: World): WorldSummary {
  return { preview: drawPreview(world), creatures: world.creatures.map((c) => c.name), width: world.size.width, height: world.size.height };
}
