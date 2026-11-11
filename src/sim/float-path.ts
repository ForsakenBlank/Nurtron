// finding a way through the air. with no gravity a creature can go anywhere, but flying straight at something gets it
// stuck on whatever is in between. this lays a grid over the space, marks every cell its body can't fit in, and searches
// it for the shortest way, then straightens that out so it flies in straight lines wherever it can.
import { boundingRadius, closestPoint } from './shapes.ts';
import type { Shaped } from './shapes.ts';

export const CLEARANCE = 32; // how far the middle of its body has to stay from anything solid
const MOST_CELLS = 220; // across or down, however big the room is, so it never takes long to work out
const SMALLEST_CELL = 16;
const MARGIN = 360; // how far beyond itself and its target it will look for a way round
const MOST_EXPANDED = 60_000;

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface FloatGrid {
  left: number;
  top: number;
  cell: number;
  cols: number;
  rows: number;
  blocked: Uint8Array;
}

// everything in the way, with a little room around it for its body, laid out on a grid over the space between
export function buildGrid(obstacles: Shaped[], room: Bounds, from: Point, to: Point): FloatGrid {
  const left = Math.max(room.left, Math.min(from.x, to.x) - MARGIN);
  const right = Math.min(room.right, Math.max(from.x, to.x) + MARGIN);
  const top = Math.max(room.top, Math.min(from.y, to.y) - MARGIN);
  const bottom = Math.min(room.bottom, Math.max(from.y, to.y) + MARGIN);
  const cell = Math.max(SMALLEST_CELL, Math.ceil(Math.max(right - left, bottom - top) / MOST_CELLS));
  const cols = Math.max(1, Math.ceil((right - left) / cell));
  const rows = Math.max(1, Math.ceil((bottom - top) / cell));
  const blocked = new Uint8Array(cols * rows);
  // the walls, floor and ceiling of the room
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = left + (col + 0.5) * cell;
      const y = top + (r + 0.5) * cell;
      if (x < room.left + CLEARANCE || x > room.right - CLEARANCE || y < room.top + CLEARANCE || y > room.bottom - CLEARANCE) blocked[r * cols + col] = 1;
    }
  }
  for (const o of obstacles) {
    const reach = boundingRadius(o) + CLEARANCE;
    const c0 = Math.max(0, Math.floor((o.x - reach - left) / cell));
    const c1 = Math.min(cols - 1, Math.floor((o.x + reach - left) / cell));
    const r0 = Math.max(0, Math.floor((o.y - reach - top) / cell));
    const r1 = Math.min(rows - 1, Math.floor((o.y + reach - top) / cell));
    for (let r = r0; r <= r1; r++) {
      for (let col = c0; col <= c1; col++) {
        const i = r * cols + col;
        if (blocked[i]) continue;
        const x = left + (col + 0.5) * cell;
        const y = top + (r + 0.5) * cell;
        const near = closestPoint(o, x, y);
        if (Math.hypot(near.x - x, near.y - y) < CLEARANCE) blocked[i] = 1;
      }
    }
  }
  return { left, top, cell, cols, rows, blocked };
}

const centreOf = (g: FloatGrid, i: number): Point => ({ x: g.left + ((i % g.cols) + 0.5) * g.cell, y: g.top + (Math.floor(i / g.cols) + 0.5) * g.cell });

function cellAt(g: FloatGrid, p: Point): number {
  const col = Math.floor((p.x - g.left) / g.cell);
  const r = Math.floor((p.y - g.top) / g.cell);
  if (col < 0 || r < 0 || col >= g.cols || r >= g.rows) return -1;
  return r * g.cols + col;
}

// the nearest cell it fits in, for when it's pressed up against something and its own cell counts as blocked
function nearestFree(g: FloatGrid, p: Point, most = 4): number {
  const col = Math.max(0, Math.min(g.cols - 1, Math.floor((p.x - g.left) / g.cell)));
  const r = Math.max(0, Math.min(g.rows - 1, Math.floor((p.y - g.top) / g.cell)));
  for (let ring = 0; ring <= most; ring++) {
    let best = -1;
    let bestD = Infinity;
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        const rr = r + dr;
        const cc = col + dc;
        if (rr < 0 || cc < 0 || rr >= g.rows || cc >= g.cols) continue;
        const i = rr * g.cols + cc;
        if (g.blocked[i]) continue;
        const c = centreOf(g, i);
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

// a straight line between two points that never goes through a blocked cell
export function clearLine(g: FloatGrid, a: Point, b: Point): boolean {
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(distance / (g.cell * 0.4)));
  for (let s = 0; s <= steps; s++) {
    const i = cellAt(g, { x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps });
    if (i >= 0 && g.blocked[i]) return false;
  }
  return true;
}

// a small binary heap, so the search stays quick even on a big grid
class Heap {
  private items: number[] = [];
  private keys: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: number, key: number): void {
    this.items.push(item);
    this.keys.push(key);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const top = this.items[0];
    const lastItem = this.items.pop() as number;
    const lastKey = this.keys.pop() as number;
    if (this.items.length) {
      this.items[0] = lastItem;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.keys[l] < this.keys[m]) m = l;
        if (r < this.items.length && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
  }
}

// the way from one point to anywhere close enough to the goal, as a few points to fly between. null if there's no way.
// `near` says whether a spot is close enough to count as being there.
export function findPath(g: FloatGrid, from: Point, goal: Point, near: (p: Point) => boolean): Point[] | null {
  const start = cellAt(g, from) >= 0 && !g.blocked[cellAt(g, from)] ? cellAt(g, from) : nearestFree(g, from);
  if (start < 0) return null;
  const total = g.cols * g.rows;
  const cost = new Float32Array(total).fill(Infinity);
  const came = new Int32Array(total).fill(-1);
  const done = new Uint8Array(total);
  const open = new Heap();
  const guess = (i: number): number => {
    const c = centreOf(g, i);
    const dx = Math.abs(c.x - goal.x);
    const dy = Math.abs(c.y - goal.y);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  cost[start] = 0;
  open.push(start, guess(start));
  let expanded = 0;
  let found = -1;
  while (open.size > 0 && expanded < MOST_EXPANDED) {
    const i = open.pop();
    if (done[i]) continue;
    done[i] = 1;
    expanded++;
    if (near(centreOf(g, i))) {
      found = i;
      break;
    }
    const col = i % g.cols;
    const r = Math.floor(i / g.cols);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr;
        const cc = col + dc;
        if (rr < 0 || cc < 0 || rr >= g.rows || cc >= g.cols) continue;
        const j = rr * g.cols + cc;
        if (g.blocked[j] || done[j]) continue;
        // no cutting corners, or it would scrape along whatever is there
        if (dr && dc && (g.blocked[r * g.cols + cc] || g.blocked[rr * g.cols + col])) continue;
        const next = cost[i] + (dr && dc ? Math.SQRT2 : 1) * g.cell;
        if (next >= cost[j]) continue;
        cost[j] = next;
        came[j] = i;
        open.push(j, next + guess(j));
      }
    }
  }
  if (found < 0) return null;
  const cells: Point[] = [];
  for (let i = found; i >= 0; i = came[i]) cells.push(centreOf(g, i));
  cells.reverse();
  // straighten it out: from each point, go to the furthest one it can see
  const path: Point[] = [];
  let at: Point = from;
  let k = 0;
  while (k < cells.length) {
    let furthest = k;
    for (let j = cells.length - 1; j > k; j--) {
      if (clearLine(g, at, cells[j])) {
        furthest = j;
        break;
      }
    }
    path.push(cells[furthest]);
    at = cells[furthest];
    k = furthest + 1;
  }
  return path;
}
