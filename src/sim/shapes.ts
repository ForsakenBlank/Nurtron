// the geometry of a thing, shared by physics, drawing, the hand and the creature's reach.
// hw and hh are half its width and height. a circle's radius is its hw.

export const FORMS = ['circle', 'box', 'triangle', 'hexagon'] as const;
export type Form = (typeof FORMS)[number];

export interface Shaped {
  form: Form;
  hw: number;
  hh: number;
  x: number;
  y: number;
  angle: number;
}

// corners around the thing's own centre, unrotated. a circle has none
export function localCorners(form: Form, hw: number, hh: number): { x: number; y: number }[] {
  if (form === 'box') {
    return [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh },
    ];
  }
  if (form === 'triangle') {
    return [
      { x: 0, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh },
    ];
  }
  if (form === 'hexagon') {
    return Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i;
      return { x: Math.cos(a) * hw, y: Math.sin(a) * hh };
    });
  }
  return [];
}

export function corners(t: Shaped): { x: number; y: number }[] {
  const cos = Math.cos(t.angle);
  const sin = Math.sin(t.angle);
  return localCorners(t.form, t.hw, t.hh).map((p) => ({ x: t.x + p.x * cos - p.y * sin, y: t.y + p.x * sin + p.y * cos }));
}

export function areaOf(form: Form, hw: number, hh: number): number {
  if (form === 'circle') return Math.PI * hw * hw;
  if (form === 'box') return 4 * hw * hh;
  if (form === 'triangle') return 2 * hw * hh;
  return 3 * Math.sqrt(3) * 0.5 * hw * hh; // a regular hexagon, stretched
}

export function boundingRadius(t: Shaped): number {
  if (t.form === 'circle') return t.hw;
  return Math.max(...localCorners(t.form, t.hw, t.hh).map((p) => Math.hypot(p.x, p.y)));
}

function toLocal(t: Shaped, px: number, py: number): { x: number; y: number } {
  const cos = Math.cos(-t.angle);
  const sin = Math.sin(-t.angle);
  const dx = px - t.x;
  const dy = py - t.y;
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

function insideConvex(points: { x: number; y: number }[], x: number, y: number): boolean {
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < 0) return false;
  }
  return true;
}

export function containsPoint(t: Shaped, px: number, py: number, margin = 0): boolean {
  if (t.form === 'circle') return Math.hypot(px - t.x, py - t.y) <= t.hw + margin;
  const local = toLocal(t, px, py);
  const grow = margin ? 1 + margin / Math.max(1, Math.min(t.hw, t.hh)) : 1;
  return insideConvex(localCorners(t.form, t.hw * grow, t.hh * grow), local.x, local.y);
}

// the nearest point of the thing to somewhere, which for a long plank can be far from its centre
export function closestPoint(t: Shaped, px: number, py: number): { x: number; y: number } {
  if (t.form === 'circle') {
    const d = Math.hypot(px - t.x, py - t.y);
    if (d <= t.hw) return { x: px, y: py };
    return { x: t.x + ((px - t.x) / d) * t.hw, y: t.y + ((py - t.y) / d) * t.hw };
  }
  const points = corners(t);
  if (insideConvex(points, px, py)) return { x: px, y: py };
  let best = points[0];
  let bestDistance = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const along = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy || 1)));
    const x = a.x + dx * along;
    const y = a.y + dy * along;
    const distance = Math.hypot(px - x, py - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { x, y };
    }
  }
  return best;
}
