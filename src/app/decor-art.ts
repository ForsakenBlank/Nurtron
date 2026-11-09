// how each decoration looks. every drawing is made in a square from -1 to 1 each way, which gets stretched to the
// thing's size and turned with it, so a decoration can be any size you like. the same drawings make the little
// pictures in the Decor menu, through a canvas instead of pixi.
import type { Graphics } from 'pixi.js';

// a pen that draws in the -1 to 1 square. sizes like a circle's radius or a line's width go by the shorter side
export interface Pen {
  r(x: number, y: number, w: number, h: number, colour: number, alpha?: number): void;
  rr(x: number, y: number, w: number, h: number, round: number, colour: number, alpha?: number): void;
  c(x: number, y: number, radius: number, colour: number, alpha?: number): void;
  e(x: number, y: number, rx: number, ry: number, colour: number, alpha?: number): void;
  p(points: number[], colour: number, alpha?: number): void;
  l(x1: number, y1: number, x2: number, y2: number, width: number, colour: number, alpha?: number): void;
  readonly time: number; // seconds, for things that flicker or bob
}

// lighter above 0, darker below
export function shade(colour: number, by: number): number {
  const mix = (shift: number): number => {
    const v = (colour >> shift) & 255;
    return Math.round(by >= 0 ? v + (255 - v) * by : v * (1 + by));
  };
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

type Draw = (p: Pen) => void;

// ---- pieces many of them share ----

// specks in a block, always in the same places so it doesn't shimmer
const SPECKS = [
  [-0.62, -0.55, 0.12], [0.3, -0.7, 0.1], [0.65, -0.2, 0.13], [-0.2, -0.1, 0.11], [-0.7, 0.35, 0.12],
  [0.15, 0.4, 0.14], [0.6, 0.65, 0.1], [-0.35, 0.72, 0.09], [0.45, 0.1, 0.08], [-0.05, -0.5, 0.07],
];
function specks(p: Pen, colour: number, alpha = 1, scale = 1, count = SPECKS.length): void {
  for (const [x, y, r] of SPECKS.slice(0, count)) p.c(x, y, r * scale, colour, alpha);
}

// a block with a lighter top edge and darker bottom edge, so it looks solid
function slab(p: Pen, base: number): void {
  p.r(-1, -1, 2, 2, base);
  p.r(-1, -1, 2, 0.12, shade(base, 0.25));
  p.r(-1, 0.88, 2, 0.12, shade(base, -0.3));
  p.r(-1, -1, 0.1, 2, shade(base, 0.12));
  p.r(0.9, -1, 0.1, 2, shade(base, -0.2));
}

function bricks(p: Pen, brick: number, mortar: number, rows = 4): void {
  p.r(-1, -1, 2, 2, mortar);
  const h = 2 / rows;
  for (let row = 0; row < rows; row++) {
    const y = -1 + row * h;
    const offset = row % 2 ? -0.5 : 0;
    for (let x = -1 + offset; x < 1; x += 1) {
      const left = Math.max(-1, x + 0.05);
      const right = Math.min(1, x + 0.95);
      if (right <= left) continue;
      const tone = shade(brick, ((row * 3 + Math.round(x * 2)) % 3) * 0.06 - 0.04);
      p.r(left, y + 0.06, right - left, h - 0.12, tone);
      p.r(left, y + 0.06, right - left, 0.08, shade(tone, 0.2));
    }
  }
}

function planks(p: Pen, wood: number): void {
  p.r(-1, -1, 2, 2, shade(wood, -0.35));
  for (let i = 0; i < 4; i++) {
    const y = -1 + i * 0.5;
    p.r(-1, y + 0.04, 2, 0.42, shade(wood, (i % 2) * 0.08));
    p.l(-0.6 + i * 0.3, y + 0.15, -0.1 + i * 0.3, y + 0.15, 0.04, shade(wood, -0.2), 0.7);
    p.c(i % 2 ? 0.75 : -0.75, y + 0.25, 0.05, shade(wood, -0.45));
  }
}

function ore(p: Pen, gem: number): void {
  slab(p, 0x7c8293);
  specks(p, shade(0x7c8293, -0.2), 1, 1, 5);
  for (const [x, y] of [[-0.5, -0.4], [0.35, -0.55], [0.5, 0.35], [-0.3, 0.45], [0.05, -0.05]]) {
    p.p([x, y - 0.18, x + 0.16, y, x, y + 0.18, x - 0.16, y], gem);
    p.c(x - 0.04, y - 0.05, 0.05, shade(gem, 0.6));
  }
}

// a tree's trunk, from the ground up to where its leaves start
function trunk(p: Pen, wood: number, top: number, width = 0.22): void {
  p.p([-width, 1, width, 1, width * 0.7, top, -width * 0.7, top], wood);
  p.p([-width, 1, -width * 0.3, 1, -width * 0.25, top, -width * 0.7, top], shade(wood, -0.25));
}

function canopy(p: Pen, leaf: number, blobs: number[][]): void {
  for (const [x, y, rx, ry] of blobs) p.e(x, y + 0.04, rx, ry, shade(leaf, -0.3));
  for (const [x, y, rx, ry] of blobs) p.e(x, y, rx, ry, leaf);
  for (const [x, y, rx, ry] of blobs) p.e(x - rx * 0.3, y - ry * 0.35, rx * 0.4, ry * 0.3, shade(leaf, 0.25), 0.6);
}

function flower(p: Pen, petal: number): void {
  p.l(0, 1, 0, -0.2, 0.18, 0x3f8a4d);
  p.e(0.35, 0.35, 0.35, 0.12, 0x56b065);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    p.c(Math.cos(a) * 0.38, -0.45 + Math.sin(a) * 0.22, 0.42, petal);
  }
  p.c(0, -0.45, 0.32, 0xffd34d);
}

function mushroom(p: Pen, cap: number, dots: number): void {
  p.rr(-0.3, -0.1, 0.6, 1.1, 0.2, 0xf1e6d2);
  p.e(0, -0.25, 1, 0.65, shade(cap, -0.25));
  p.e(0, -0.32, 0.95, 0.6, cap);
  p.r(-1, -0.15, 2, 0.4, 0xf1e6d2, 0);
  for (const [x, y, r] of [[-0.45, -0.45, 0.18], [0.35, -0.55, 0.15], [0, -0.25, 0.14]]) p.c(x, y, r, dots);
}

function banner(p: Pen, cloth: number): void {
  p.r(-1, -1, 2, 0.12, 0x8a6a45);
  p.p([-0.8, -0.9, 0.8, -0.9, 0.8, 1, 0, 0.6, -0.8, 1], cloth);
  p.p([-0.8, -0.9, -0.5, -0.9, -0.5, 0.78, -0.8, 1], shade(cloth, -0.2));
  p.c(0, -0.1, 0.35, shade(cloth, 0.45));
  p.p([0, -0.4, 0.2, -0.1, 0, 0.2, -0.2, -0.1], shade(cloth, -0.3));
}

function gem(p: Pen, colour: number): void {
  p.p([0, -1, 0.9, -0.45, 0.9, 0.45, 0, 1, -0.9, 0.45, -0.9, -0.45], shade(colour, -0.25));
  p.p([0, -0.75, 0.65, -0.35, 0.65, 0.35, 0, 0.75, -0.65, 0.35, -0.65, -0.35], colour);
  p.p([0, -0.75, 0.65, -0.35, 0, -0.1, -0.65, -0.35], shade(colour, 0.35));
  p.c(-0.3, -0.35, 0.14, 0xffffff, 0.8);
}

function potion(p: Pen, colour: number): void {
  p.r(-0.25, -1, 0.5, 0.18, 0x8a6a45);
  p.r(-0.2, -0.82, 0.4, 0.3, 0xd8e6f0, 0.8);
  p.e(0, 0.3, 0.95, 0.7, 0xd8e6f0, 0.85);
  p.e(0, 0.42, 0.82, 0.52, colour);
  p.e(-0.35, 0.05, 0.16, 0.24, 0xffffff, 0.6);
}

// a face for an enemy, looking towards the right
function eyes(p: Pen, x: number, y: number, size: number, angry = true): void {
  for (const dx of [-size * 1.6, size * 1.6]) {
    p.c(x + dx, y, size, 0xffffff);
    p.c(x + dx + size * 0.3, y + size * 0.1, size * 0.5, 0x14161f);
  }
  if (angry) {
    p.l(x - size * 2.6, y - size * 1.5, x - size * 0.6, y - size * 0.8, size * 0.5, 0x14161f);
    p.l(x + size * 2.6, y - size * 1.5, x + size * 0.6, y - size * 0.8, size * 0.5, 0x14161f);
  }
}

const flicker = (p: Pen, speed = 9): number => 0.85 + Math.sin(p.time * speed) * 0.08 + Math.sin(p.time * speed * 2.3) * 0.05;

function flame(p: Pen, x: number, y: number, size: number): void {
  const f = flicker(p);
  p.e(x, y - size * 0.4, size * 1.8, size * 1.8, 0xffb454, 0.18);
  p.p([x - size * 0.6, y, x, y - size * 1.6 * f, x + size * 0.6, y], 0xff7a3d);
  p.p([x - size * 0.35, y, x, y - size * 1.1 * f, x + size * 0.35, y], 0xffd34d);
}

// ---- every decoration ----

export const DECOR_ART: Record<string, Draw> = {
  grass: (p) => {
    slab(p, 0x8a5a36);
    specks(p, 0x6e4528, 1, 1, 6);
    p.r(-1, -1, 2, 0.5, 0x5fb46a);
    for (let x = -0.9; x < 1; x += 0.3) p.p([x - 0.1, -0.5, x + 0.05, -0.5, x, -0.28], 0x5fb46a);
    p.r(-1, -1, 2, 0.1, 0x86d98e);
  },
  dirt: (p) => {
    slab(p, 0x8a5a36);
    specks(p, 0x6e4528);
    specks(p, 0xa87451, 0.6, 0.5, 6);
  },
  stone: (p) => {
    slab(p, 0x8a90a3);
    specks(p, 0x747a8c, 1, 1.4, 7);
    p.l(-0.6, -0.2, -0.1, 0.1, 0.06, 0x666b7c);
    p.l(0.2, 0.5, 0.7, 0.3, 0.06, 0x666b7c);
  },
  cobble: (p) => {
    p.r(-1, -1, 2, 2, 0x5d6272);
    for (const [x, y, rx, ry] of [[-0.55, -0.55, 0.42, 0.38], [0.4, -0.6, 0.5, 0.34], [-0.1, 0.0, 0.45, 0.32], [0.65, 0.1, 0.3, 0.38], [-0.65, 0.35, 0.32, 0.4], [0.2, 0.6, 0.55, 0.35]]) {
      p.e(x, y, rx, ry, 0x9097aa);
      p.e(x - rx * 0.25, y - ry * 0.3, rx * 0.5, ry * 0.35, 0xaab0c2, 0.7);
    }
  },
  mossy: (p) => {
    DECOR_ART.cobble(p);
    for (const [x, y, r] of [[-0.6, -0.8, 0.35], [0.1, -0.85, 0.3], [0.7, -0.75, 0.3], [-0.8, 0.3, 0.25], [0.5, 0.5, 0.22]]) p.c(x, y, r, 0x5fa85a, 0.9);
  },
  stonebrick: (p) => bricks(p, 0x9097aa, 0x5d6272, 3),
  brick: (p) => bricks(p, 0xb65a45, 0xd8cbb8, 4),
  sandstone: (p) => {
    slab(p, 0xe2c27a);
    p.r(-1, -0.35, 2, 0.08, 0xc9a560);
    p.r(-1, 0.4, 2, 0.08, 0xc9a560);
    specks(p, 0xf0d896, 0.7, 0.5, 6);
  },
  sand: (p) => {
    slab(p, 0xecd28c);
    specks(p, 0xd4b46b, 1, 0.5);
    specks(p, 0xfff0bf, 0.8, 0.35, 5);
  },
  snow: (p) => {
    slab(p, 0xe8eef7);
    specks(p, 0xc9d6e8, 0.8, 0.6, 6);
    p.r(-1, -1, 2, 0.2, 0xffffff);
  },
  ice: (p) => {
    slab(p, 0x8fd1f5);
    p.l(-0.7, -0.6, -0.2, -0.1, 0.08, 0xd9f2ff);
    p.l(0.1, 0.3, 0.6, 0.7, 0.06, 0xd9f2ff);
    p.l(0.3, -0.7, 0.6, -0.4, 0.05, 0xd9f2ff, 0.8);
  },
  planks: (p) => planks(p, 0xb47a45),
  darkplanks: (p) => planks(p, 0x6e4a2e),
  birchplanks: (p) => planks(p, 0xe2cd94),
  log: (p) => {
    p.r(-1, -1, 2, 2, 0x6e4a2e);
    for (let x = -0.9; x < 1; x += 0.35) p.l(x, -1, x + 0.05, 1, 0.08, 0x553820);
    p.r(-1, -1, 2, 0.12, 0x8a6a45);
  },
  leaves: (p) => {
    p.r(-1, -1, 2, 2, 0x3f8a4d);
    for (const [x, y] of SPECKS) p.e(x, y, 0.28, 0.2, 0x5fb46a);
    specks(p, 0x86d98e, 0.8, 0.5, 5);
  },
  glass: (p) => {
    p.r(-1, -1, 2, 2, 0xb8e4ff, 0.35);
    p.r(-1, -1, 2, 0.1, 0xd9f2ff);
    p.r(-1, 0.9, 2, 0.1, 0xd9f2ff);
    p.r(-1, -1, 0.1, 2, 0xd9f2ff);
    p.r(0.9, -1, 0.1, 2, 0xd9f2ff);
    p.l(-0.6, 0.2, 0.1, -0.5, 0.1, 0xffffff, 0.7);
    p.l(-0.3, 0.5, 0.4, -0.2, 0.06, 0xffffff, 0.5);
  },
  obsidian: (p) => {
    slab(p, 0x2a1d3d);
    for (const [x, y] of SPECKS.slice(0, 6)) p.p([x, y - 0.2, x + 0.15, y, x, y + 0.2, x - 0.15, y], 0x5b3f85);
  },
  goldblock: (p) => {
    slab(p, 0xf2c43a);
    p.r(-0.8, -0.8, 1.6, 1.6, 0xffd96a);
    p.r(-0.8, -0.8, 1.6, 0.15, 0xfff0a8);
    p.l(-0.5, 0.4, 0.4, -0.5, 0.12, 0xfff7cf, 0.7);
  },
  crystalblock: (p) => {
    slab(p, 0x7a4fb5);
    p.p([-0.6, 0.8, -0.3, -0.7, 0, 0.8], 0xc49cff);
    p.p([0, 0.8, 0.35, -0.4, 0.7, 0.8], 0xb07ef2);
    p.p([-0.3, -0.7, -0.15, -0.2, -0.45, 0.2], 0xffffff, 0.4);
  },
  metal: (p) => {
    slab(p, 0x9aa3b5);
    p.l(-1, 0, 1, 0, 0.06, 0x7a8294);
    p.l(0, -1, 0, 1, 0.06, 0x7a8294);
    for (const [x, y] of [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]]) {
      p.c(x, y, 0.1, 0x6e7586);
      p.c(x - 0.03, y - 0.03, 0.04, 0xd8dde8);
    }
  },
  tiles: (p) => {
    p.r(-1, -1, 2, 2, 0x3d4252);
    for (const [x, y] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      p.r(x + 0.05, y + 0.05, 0.9, 0.9, 0x6a7080);
      p.r(x + 0.05, y + 0.05, 0.9, 0.1, 0x80869a);
    }
    p.l(0.2, 0.3, 0.6, 0.7, 0.05, 0x3d4252);
  },
  checker: (p) => {
    for (const [x, y, light] of [[-1, -1, 1], [0, -1, 0], [-1, 0, 0], [0, 0, 1]]) p.r(x, y, 1, 1, light ? 0xd8dde8 : 0x2e3240);
  },
  hay: (p) => {
    slab(p, 0xe2bf4a);
    for (let y = -0.8; y < 1; y += 0.25) p.l(-1, y, 1, y + 0.05, 0.05, 0xc29a2e, 0.8);
    p.r(-1, -0.45, 2, 0.14, 0x9c4e2e);
    p.r(-1, 0.35, 2, 0.14, 0x9c4e2e);
  },
  goldore: (p) => ore(p, 0xffd34d),
  ironore: (p) => ore(p, 0xd8b49a),
  rubyore: (p) => ore(p, 0xf0524d),
  diamondore: (p) => ore(p, 0x7ee8f5),
  emeraldore: (p) => ore(p, 0x5ccb6d),
  platform: (p) => {
    p.r(-1, -1, 2, 2, 0x7c8293);
    for (let x = -1; x < 1; x += 0.25) p.l(x, -1, x, 1, 0.12, 0x5d6272);
    p.r(-1, -1, 2, 0.4, 0xaab0c2);
  },
  woodplatform: (p) => {
    p.r(-1, -1, 2, 2, 0xb47a45);
    p.r(-1, -1, 2, 0.45, 0xcf9a62);
    for (let x = -0.9; x < 1; x += 0.3) p.c(x, 0.1, 0.25, 0x6e4a2e);
  },
  lava: (p) => {
    p.r(-1, -1, 2, 2, 0xd13b2a);
    const t = p.time;
    for (let i = 0; i < 5; i++) p.e(-0.7 + i * 0.35, -0.2 + Math.sin(t * 2 + i) * 0.3, 0.25, 0.18, 0xffa13d, 0.9);
    p.r(-1, -1, 2, 0.2, 0xffd34d, 0.8);
  },
  water: (p) => {
    p.r(-1, -1, 2, 2, 0x2f7fd8, 0.75);
    const t = p.time;
    for (let i = 0; i < 4; i++) p.l(-0.9 + i * 0.5, -0.5 + Math.sin(t * 1.5 + i) * 0.1, -0.6 + i * 0.5, -0.5 + Math.sin(t * 1.5 + i + 1) * 0.1, 0.08, 0x9fd4ff, 0.7);
    p.r(-1, -1, 2, 0.12, 0x9fd4ff, 0.8);
  },

  oak: (p) => {
    trunk(p, 0x7a5232, -0.2);
    canopy(p, 0x4fa35a, [[-0.45, -0.35, 0.5, 0.32], [0.45, -0.38, 0.5, 0.32], [0, -0.62, 0.62, 0.36], [0, -0.2, 0.55, 0.28]]);
  },
  pine: (p) => {
    trunk(p, 0x6e4a2e, 0.55, 0.18);
    for (const [y, w] of [[0.6, 1], [0.15, 0.82], [-0.3, 0.62], [-0.7, 0.4]]) {
      p.p([-w, y, 0, y - 0.62, w, y], 0x2f6e48);
      p.p([0, y - 0.62, w, y, w * 0.2, y], 0x245a3a);
    }
    p.c(0, -1, 0.1, 0xffd34d, 0);
  },
  birch: (p) => {
    p.p([-0.18, 1, 0.18, 1, 0.12, -0.3, -0.12, -0.3], 0xf1ede2);
    for (let y = -0.2; y < 1; y += 0.25) p.r(-0.15, y, 0.14, 0.05, 0x2e3240);
    canopy(p, 0x8ccf6a, [[-0.35, -0.45, 0.45, 0.3], [0.35, -0.5, 0.45, 0.3], [0, -0.72, 0.5, 0.28]]);
  },
  palm: (p) => {
    for (let i = 0; i < 6; i++) p.e(0.05 * i, 1 - i * 0.3, 0.16, 0.16, i % 2 ? 0xa87451 : 0x8a5a36);
    for (const [dx, dy] of [[-1, -0.55], [1, -0.55], [-0.75, -0.95], [0.75, -0.95], [0, -1]]) p.p([0.25, -0.7, 0.25 + dx * 0.9, -0.7 + (dy + 0.7) * 0.6 + 0.05, 0.25 + dx * 0.95, -0.55 + (dy + 0.7) * 0.6], 0x3f9a4f);
    p.c(0.2, -0.62, 0.1, 0x6e4a2e);
    p.c(0.32, -0.6, 0.1, 0x6e4a2e);
  },
  autumn: (p) => {
    trunk(p, 0x6e4a2e, -0.2);
    canopy(p, 0xe98a3a, [[-0.45, -0.35, 0.5, 0.32], [0.45, -0.38, 0.5, 0.32], [0, -0.62, 0.62, 0.36]]);
    for (const [x, y] of [[-0.3, -0.5], [0.4, -0.3], [0.1, -0.75]]) p.c(x, y, 0.08, 0xffc24d);
  },
  cherry: (p) => {
    trunk(p, 0x5a3a2a, -0.2);
    canopy(p, 0xf5a3c7, [[-0.45, -0.35, 0.5, 0.32], [0.45, -0.38, 0.5, 0.32], [0, -0.62, 0.62, 0.36]]);
    for (const [x, y] of [[-0.5, -0.3], [0.3, -0.5], [0.0, -0.75], [0.6, -0.2]]) p.c(x, y, 0.06, 0xffffff);
  },
  deadtree: (p) => {
    trunk(p, 0x6b6157, -0.3, 0.2);
    p.l(0, -0.2, -0.6, -0.7, 0.12, 0x6b6157);
    p.l(0, -0.3, 0.5, -0.85, 0.12, 0x6b6157);
    p.l(-0.35, -0.48, -0.55, -0.95, 0.08, 0x6b6157);
    p.l(0.3, -0.55, 0.75, -0.6, 0.08, 0x6b6157);
  },
  bush: (p) => canopy(p, 0x4f9a52, [[-0.5, 0.25, 0.5, 0.7], [0.5, 0.25, 0.5, 0.7], [0, -0.1, 0.6, 0.85]]),
  berrybush: (p) => {
    DECOR_ART.bush(p);
    for (const [x, y] of [[-0.5, 0], [0.3, -0.3], [0.6, 0.3], [-0.1, 0.4], [0, -0.6]]) p.c(x, y, 0.13, 0xd8344f);
  },
  tallgrass: (p) => {
    for (let i = 0; i < 7; i++) {
      const x = -0.85 + i * 0.28;
      p.p([x - 0.1, 1, x + 0.1, 1, x + Math.sin(p.time * 2 + i) * 0.08 + (i % 2 ? 0.2 : -0.15), -0.9 + (i % 3) * 0.3], i % 2 ? 0x5fb46a : 0x3f8a4d);
    }
  },
  fern: (p) => {
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) p.e(side * (0.3 + i * 0.15), 0.6 - i * 0.4, 0.45, 0.14, i % 2 ? 0x4fa35a : 0x3f8a4d);
    p.l(0, 1, 0, -0.9, 0.12, 0x3f8a4d);
  },
  reeds: (p) => {
    for (const [x, top] of [[-0.6, -0.5], [-0.1, -0.9], [0.5, -0.6]]) {
      p.l(x, 1, x, top, 0.18, 0x6c9a4a);
      p.rr(x - 0.15, top - 0.05, 0.3, 0.45, 0.1, 0x7a5232);
    }
  },
  redflower: (p) => flower(p, 0xf0524d),
  yellowflower: (p) => flower(p, 0xf5d547),
  blueflower: (p) => flower(p, 0x4f9bf0),
  purpleflower: (p) => flower(p, 0xa97bf2),
  tulip: (p) => {
    p.l(0, 1, 0, -0.2, 0.18, 0x3f8a4d);
    p.e(-0.35, 0.4, 0.35, 0.12, 0x56b065);
    p.p([-0.65, -0.3, -0.65, -0.9, -0.3, -0.6, 0, -1, 0.3, -0.6, 0.65, -0.9, 0.65, -0.3, 0, 0], 0xf0524d);
  },
  sunflower: (p) => {
    p.l(0, 1, 0, -0.5, 0.2, 0x3f8a4d);
    p.e(0.4, 0.3, 0.4, 0.1, 0x56b065);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      p.e(Math.cos(a) * 0.6, -0.6 + Math.sin(a) * 0.25, 0.35, 0.15, 0xffd34d);
    }
    p.e(0, -0.6, 0.45, 0.2, 0x6e4a2e);
  },
  redmushroom: (p) => mushroom(p, 0xd8344f, 0xffffff),
  brownmushroom: (p) => mushroom(p, 0xa06a42, 0xc99a70),
  glowmushroom: (p) => {
    p.e(0, -0.3, 1.2, 0.9, 0x6fd6ff, 0.15 + Math.sin(p.time * 2) * 0.05);
    mushroom(p, 0x4fb0f0, 0xbff0ff);
  },
  cactus: (p) => {
    p.rr(-0.35, -1, 0.7, 2, 0.35, 0x4f9a52);
    p.rr(-0.9, -0.3, 0.35, 0.6, 0.17, 0x4f9a52);
    p.r(-0.9, 0.1, 0.6, 0.2, 0x4f9a52);
    p.rr(0.55, -0.6, 0.35, 0.55, 0.17, 0x4f9a52);
    p.r(0.3, -0.25, 0.6, 0.2, 0x4f9a52);
    p.l(0, -0.9, 0, 1, 0.06, 0x3a7a3e);
    for (const [x, y] of [[-0.2, -0.6], [0.2, -0.2], [-0.2, 0.3], [0.2, 0.7]]) p.c(x, y, 0.04, 0xf1ede2);
  },
  pebble: (p) => {
    for (const [x, y, rx, ry] of [[-0.6, 0.4, 0.35, 0.55], [0.1, 0.5, 0.3, 0.45], [0.65, 0.3, 0.32, 0.65]]) {
      p.e(x, y, rx, ry, 0x8a90a3);
      p.e(x - 0.08, y - 0.15, rx * 0.5, ry * 0.4, 0xb0b6c6);
    }
  },
  rock: (p) => {
    p.p([-1, 1, -0.85, -0.2, -0.3, -0.9, 0.5, -0.8, 0.95, 0, 1, 1], 0x7c8293);
    p.p([-0.85, -0.2, -0.3, -0.9, 0.5, -0.8, 0.2, -0.2], 0x9aa1b4);
    p.l(-0.2, 0.2, 0.4, 0.6, 0.06, 0x5d6272);
  },
  boulder: (p) => {
    p.e(0, 0.1, 1, 0.9, 0x6e7586);
    p.e(-0.25, -0.2, 0.6, 0.5, 0x8a90a3);
    p.e(-0.4, -0.4, 0.2, 0.15, 0xaab0c2);
    p.l(0.2, 0.2, 0.6, 0.5, 0.06, 0x4f5464);
  },
  mossyrock: (p) => {
    DECOR_ART.rock(p);
    p.e(-0.3, -0.6, 0.55, 0.3, 0x5fa85a);
    p.e(0.4, -0.55, 0.4, 0.22, 0x4f9a52);
  },
  vine: (p) => {
    p.l(0, -1, 0.1, 1, 0.3, 0x3f8a4d);
    for (let y = -0.8; y < 1; y += 0.3) p.e(y * 10 % 2 > 1 ? 0.5 : -0.4, y, 0.5, 0.12, 0x5fb46a);
  },
  lilypad: (p) => {
    p.p([0, 0, 1, -0.3, 0.95, 0.5, 0, 1, -0.95, 0.5, -1, -0.3], 0x4fa35a);
    p.c(0.4, -0.4, 0.4, 0xf5a3c7);
  },
  stump: (p) => {
    p.r(-0.8, -0.4, 1.6, 1.4, 0x7a5232);
    p.e(0, -0.4, 0.8, 0.45, 0xc99a70);
    p.e(0, -0.4, 0.45, 0.25, 0xa87451);
    p.e(0, -0.4, 0.15, 0.08, 0xc99a70);
  },

  torch: (p) => {
    p.p([-0.4, -0.3, 0.4, -0.3, 0.2, 1, -0.2, 1], 0x7a5232);
    p.r(-0.55, -0.45, 1.1, 0.2, 0x5d6272);
    flame(p, 0, -0.45, 0.45);
  },
  lantern: (p) => {
    p.l(0, -1, 0, -0.75, 0.15, 0x3d4252);
    p.rr(-0.7, -0.75, 1.4, 1.65, 0.2, 0x3d4252);
    p.r(-0.5, -0.5, 1, 1.2, 0xffd34d, flicker(p) * 0.9);
    p.e(0, 0.1, 1.8, 1.4, 0xffd34d, 0.12);
    p.r(-0.85, 0.85, 1.7, 0.15, 0x3d4252);
  },
  candle: (p) => {
    for (const [x, h] of [[-0.55, 0.9], [0.05, 1.3], [0.6, 0.7]]) {
      p.r(x - 0.2, 1 - h, 0.4, h, 0xf1ede2);
      flame(p, x, 1 - h, 0.28);
    }
  },
  skull: (p) => {
    p.e(0, -0.2, 0.95, 0.8, 0xe8e2d2);
    p.rr(-0.55, 0.3, 1.1, 0.7, 0.2, 0xe8e2d2);
    p.e(-0.38, -0.15, 0.25, 0.28, 0x2e3240);
    p.e(0.38, -0.15, 0.25, 0.28, 0x2e3240);
    p.p([0, 0.15, 0.12, 0.38, -0.12, 0.38], 0x2e3240);
    for (const x of [-0.3, 0, 0.3]) p.r(x - 0.06, 0.6, 0.12, 0.3, 0x8a8478);
  },
  bones: (p) => {
    for (const [a, b, c, d] of [[-0.9, 0.5, 0.8, -0.4], [-0.7, -0.5, 0.9, 0.6]]) {
      p.l(a, b, c, d, 0.35, 0xe8e2d2);
      for (const [x, y] of [[a, b], [c, d]]) {
        p.c(x, y - 0.25, 0.28, 0xe8e2d2);
        p.c(x, y + 0.25, 0.28, 0xe8e2d2);
      }
    }
  },
  spikes: (p) => {
    p.r(-1, 0.6, 2, 0.4, 0x5d6272);
    for (let i = 0; i < 5; i++) {
      const x = -0.8 + i * 0.4;
      p.p([x - 0.2, 0.6, x, -1, x + 0.2, 0.6], 0xb0b6c6);
      p.p([x, -1, x + 0.2, 0.6, x + 0.05, 0.6], 0x7c8293);
    }
  },
  cobweb: (p) => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      p.l(0, 0, Math.cos(a), Math.sin(a), 0.04, 0xffffff, 0.6);
    }
    for (const r of [0.3, 0.6, 0.9]) {
      for (let i = 0; i < 6; i++) {
        const a1 = (i / 6) * Math.PI * 2;
        const a2 = ((i + 1) / 6) * Math.PI * 2;
        p.l(Math.cos(a1) * r, Math.sin(a1) * r, Math.cos(a2) * r, Math.sin(a2) * r, 0.03, 0xffffff, 0.5);
      }
    }
  },
  chain: (p) => {
    for (let y = -1; y < 1; y += 0.25) p.e(0, y + 0.12, 0.7, 0.14, (y * 4) % 2 ? 0x9aa1b4 : 0x6e7586);
  },
  bars: (p) => {
    p.r(-1, -1, 2, 0.12, 0x4f5464);
    p.r(-1, 0.88, 2, 0.12, 0x4f5464);
    p.r(-1, -0.1, 2, 0.08, 0x4f5464);
    for (let x = -0.8; x <= 0.85; x += 0.4) {
      p.r(x - 0.06, -1, 0.12, 2, 0x6e7586);
      p.r(x - 0.06, -1, 0.04, 2, 0x9aa1b4);
    }
  },
  door: (p) => {
    p.rr(-1, -1, 2, 2, 0.5, 0x5a3a24);
    p.rr(-0.85, -0.88, 1.7, 1.88, 0.45, 0x8a5a36);
    for (const x of [-0.45, 0, 0.45]) p.l(x, -0.85, x, 1, 0.04, 0x6e4528);
    p.r(-0.85, -0.3, 1.7, 0.08, 0x3d4252);
    p.r(-0.85, 0.5, 1.7, 0.08, 0x3d4252);
    p.c(0.6, 0.15, 0.1, 0xffd34d);
  },
  irondoor: (p) => {
    p.rr(-1, -1, 2, 2, 0.1, 0x4f5464);
    p.r(-0.85, -0.9, 1.7, 1.9, 0x8a90a3);
    for (const y of [-0.6, 0, 0.6]) for (const x of [-0.6, 0, 0.6]) p.c(x, y, 0.06, 0x5d6272);
    p.r(0.4, 0.05, 0.3, 0.12, 0x3d4252);
  },
  pillar: (p) => {
    p.r(-1, -1, 2, 0.12, 0xaab0c2);
    p.r(-1, 0.88, 2, 0.12, 0xaab0c2);
    p.r(-0.75, -0.88, 1.5, 1.76, 0x9097aa);
    for (const x of [-0.45, 0, 0.45]) p.r(x - 0.06, -0.88, 0.12, 1.76, 0x747a8c);
    p.r(-0.75, -0.88, 0.2, 1.76, 0xb0b6c6);
  },
  redbanner: (p) => banner(p, 0xd8344f),
  bluebanner: (p) => banner(p, 0x3f7fd8),
  greenbanner: (p) => banner(p, 0x3f9a4f),
  purplebanner: (p) => banner(p, 0x8a5ad8),
  tombstone: (p) => {
    p.rr(-0.85, -1, 1.7, 2, 0.8, 0x8a90a3);
    p.rr(-0.7, -0.85, 1.4, 1.8, 0.7, 0x9aa1b4);
    p.r(-0.08, -0.5, 0.16, 0.8, 0x6e7586);
    p.r(-0.35, -0.3, 0.7, 0.14, 0x6e7586);
    p.r(-1, 0.85, 2, 0.15, 0x5fa85a);
  },
  altar: (p) => {
    p.r(-1, -0.4, 2, 0.35, 0x5b3f85);
    p.r(-0.8, -0.05, 1.6, 1.05, 0x6e5299);
    p.r(-0.8, -0.05, 1.6, 0.15, 0x8a6abf);
    p.c(0, -0.65, 0.25, 0xc49cff, flicker(p, 3));
    p.e(0, -0.65, 0.6, 0.45, 0xc49cff, 0.15);
  },
  cauldron: (p) => {
    p.e(0, 0.15, 1, 0.8, 0x2e3240);
    p.e(0, -0.45, 0.9, 0.22, 0x5ccb6d);
    for (let i = 0; i < 3; i++) p.c(-0.4 + i * 0.4, -0.55 - ((p.time * 0.8 + i * 0.33) % 1) * 0.6, 0.12, 0x9ef0aa, 0.7);
    p.r(-0.7, 0.85, 0.2, 0.15, 0x2e3240);
    p.r(0.5, 0.85, 0.2, 0.15, 0x2e3240);
  },
  campfire: (p) => {
    p.l(-0.9, 0.85, 0.9, 0.55, 0.25, 0x6e4a2e);
    p.l(-0.9, 0.55, 0.9, 0.85, 0.25, 0x5a3a24);
    flame(p, 0, 0.5, 0.75);
    for (const [x, y] of [[-0.9, 0.95], [-0.5, 1], [0.5, 1], [0.9, 0.95]]) p.c(x, y, 0.12, 0x7c8293);
  },
  portal: (p) => {
    p.e(0, 0, 1, 1, 0x3d2a5a);
    for (let i = 0; i < 4; i++) p.e(0, 0, 0.85 - i * 0.18, 0.88 - i * 0.18, i % 2 ? 0xa97bf2 : 0x6e3fc2, 0.7 + Math.sin(p.time * 3 + i) * 0.2);
    p.e(0, 0, 0.18, 0.2, 0xffffff, 0.8);
  },
  statue: (p) => {
    p.r(-1, 0.65, 2, 0.35, 0x7c8293);
    p.c(0, -0.72, 0.28, 0xaab0c2);
    p.p([-0.55, 0.65, -0.4, -0.35, 0.4, -0.35, 0.55, 0.65], 0x9aa1b4);
    p.l(0.4, -0.25, 0.7, -0.75, 0.12, 0x9aa1b4);
    p.l(0.75, -0.95, 0.75, -0.3, 0.06, 0xd8dde8);
  },
  throne: (p) => {
    p.rr(-0.75, -1, 1.5, 1.4, 0.3, 0xa82e3a);
    p.r(-0.95, 0.2, 1.9, 0.35, 0xd8344f);
    p.r(-0.95, 0.55, 0.25, 0.45, 0xb8902e);
    p.r(0.7, 0.55, 0.25, 0.45, 0xb8902e);
    p.r(-0.95, 0.15, 1.9, 0.1, 0xf2c43a);
    for (const x of [-0.5, 0, 0.5]) p.p([x - 0.15, -0.95, x, -1.15, x + 0.15, -0.95], 0xf2c43a);
  },
  cage: (p) => {
    p.e(0, -0.75, 0.9, 0.3, 0x6e7586);
    p.r(-0.95, 0.85, 1.9, 0.15, 0x4f5464);
    for (let x = -0.85; x <= 0.9; x += 0.34) p.l(x, -0.65, x, 0.88, 0.07, 0x8a90a3);
    p.l(0, -1, 0, -1.05, 0.1, 0x6e7586);
  },
  chest: (p) => {
    p.rr(-1, -1, 2, 0.75, 0.4, 0x8a5a36);
    p.r(-1, -0.3, 2, 1.3, 0xa06a42);
    p.r(-1, -0.35, 2, 0.15, 0x5a3a24);
    for (const x of [-0.75, 0.6]) p.r(x, -1, 0.15, 2, 0xb8902e);
    p.rr(-0.18, -0.45, 0.36, 0.45, 0.08, 0xf2c43a);
    p.c(0, -0.2, 0.06, 0x2e3240);
  },
  goldchest: (p) => {
    p.rr(-1, -1, 2, 0.75, 0.4, 0xe2b032);
    p.r(-1, -0.3, 2, 1.3, 0xf2c43a);
    p.r(-1, -0.35, 2, 0.15, 0xb8902e);
    for (const x of [-0.75, 0.6]) p.r(x, -1, 0.15, 2, 0xfff0a8);
    p.rr(-0.2, -0.48, 0.4, 0.5, 0.08, 0xd8344f);
    p.c(0.5, 0.4, 0.12, 0xffffff, 0.7);
  },

  table: (p) => {
    p.r(-1, -1, 2, 0.35, 0xb47a45);
    p.r(-1, -0.7, 2, 0.08, 0x8a5a36);
    p.r(-0.85, -0.65, 0.2, 1.65, 0x8a5a36);
    p.r(0.65, -0.65, 0.2, 1.65, 0x8a5a36);
  },
  chair: (p) => {
    p.r(0.4, -1, 0.3, 2, 0x8a5a36);
    p.r(-0.7, 0, 1.4, 0.25, 0xb47a45);
    p.r(-0.7, 0.25, 0.25, 0.75, 0x8a5a36);
    p.r(0.45, -0.75, 0.25, 0.15, 0xb47a45);
  },
  bed: (p) => {
    p.r(-1, -1, 0.2, 2, 0x8a5a36);
    p.r(0.85, -0.4, 0.15, 1.4, 0x8a5a36);
    p.r(-0.8, -0.2, 1.65, 0.7, 0xd8344f);
    p.rr(-0.8, -0.5, 0.5, 0.4, 0.15, 0xf1ede2);
    p.r(-0.3, -0.2, 1.15, 0.2, 0xe85a6a);
    p.r(-1, 0.5, 2, 0.25, 0x6e4a2e);
  },
  barrel: (p) => {
    p.rr(-0.9, -1, 1.8, 2, 0.5, 0x9c6a3e);
    for (const x of [-0.45, 0, 0.45]) p.l(x, -0.95, x, 0.95, 0.04, 0x6e4a2e);
    for (const y of [-0.6, 0.55]) p.r(-0.92, y, 1.84, 0.14, 0x5d6272);
  },
  crate: (p) => {
    p.r(-1, -1, 2, 2, 0x8a5a36);
    p.r(-0.8, -0.8, 1.6, 1.6, 0xb47a45);
    p.l(-0.8, 0.8, 0.8, -0.8, 0.2, 0x8a5a36);
    p.l(-0.8, -0.8, 0.8, 0.8, 0.2, 0x8a5a36, 0.4);
  },
  vase: (p) => {
    p.p([-0.4, -1, 0.4, -1, 0.3, -0.7, 0.95, -0.1, 0.6, 0.85, 0.3, 1, -0.3, 1, -0.6, 0.85, -0.95, -0.1, -0.3, -0.7], 0xc9744a);
    p.r(-0.85, -0.2, 1.7, 0.18, 0x2e3240, 0.5);
    p.e(-0.4, 0.1, 0.12, 0.3, 0xffffff, 0.3);
  },
  rug: (p) => {
    p.r(-1, -1, 2, 2, 0xa82e3a);
    p.r(-0.9, -0.4, 1.8, 0.8, 0xd8344f);
    p.r(-0.6, -0.2, 1.2, 0.4, 0xf2c43a);
  },
  window: (p) => {
    p.r(-1, -1, 2, 2, 0x8a5a36);
    p.r(-0.85, -0.85, 1.7, 1.7, 0x9fd4ff);
    p.r(-0.85, -0.85, 1.7, 0.6, 0xc8e8ff);
    p.r(-0.06, -0.85, 0.12, 1.7, 0x8a5a36);
    p.r(-0.85, -0.06, 1.7, 0.12, 0x8a5a36);
  },
  fence: (p) => {
    for (const x of [-0.8, 0, 0.8]) p.p([x - 0.15, 1, x - 0.15, -0.8, x, -1, x + 0.15, -0.8, x + 0.15, 1], 0xb47a45);
    p.r(-1, -0.5, 2, 0.2, 0x9c6a3e);
    p.r(-1, 0.4, 2, 0.2, 0x9c6a3e);
  },
  ladder: (p) => {
    p.r(-0.9, -1, 0.25, 2, 0x8a5a36);
    p.r(0.65, -1, 0.25, 2, 0x8a5a36);
    for (let y = -0.85; y < 1; y += 0.3) p.r(-0.7, y, 1.4, 0.1, 0xb47a45);
  },
  sign: (p) => {
    p.r(-0.12, -0.2, 0.24, 1.2, 0x6e4a2e);
    p.rr(-1, -1, 2, 1, 0.1, 0xb47a45);
    p.r(-0.7, -0.75, 1.4, 0.08, 0x6e4a2e, 0.6);
    p.r(-0.7, -0.5, 1.1, 0.08, 0x6e4a2e, 0.6);
  },
  bookshelf: (p) => {
    p.r(-1, -1, 2, 2, 0x6e4a2e);
    const colours = [0xd8344f, 0x3f7fd8, 0x3f9a4f, 0xf2c43a, 0x8a5ad8, 0xe98a3a];
    for (let row = 0; row < 3; row++) {
      const y = -0.9 + row * 0.63;
      p.r(-0.9, y + 0.5, 1.8, 0.08, 0x8a5a36);
      for (let i = 0; i < 6; i++) p.r(-0.85 + i * 0.29, y + 0.05 + (i % 2) * 0.08, 0.22, 0.45 - (i % 2) * 0.08, colours[(i + row * 2) % colours.length]);
    }
  },
  well: (p) => {
    p.r(-0.8, -0.3, 0.12, 0.6, 0x6e4a2e);
    p.r(0.68, -0.3, 0.12, 0.6, 0x6e4a2e);
    p.p([-1, -0.3, 0, -1, 1, -0.3], 0xa82e3a);
    p.l(-0.7, -0.15, 0.7, -0.15, 0.06, 0x6e4a2e);
    p.r(-0.9, 0.3, 1.8, 0.7, 0x8a90a3);
    for (let x = -0.9; x < 0.9; x += 0.45) p.r(x + 0.03, 0.33, 0.39, 0.3, 0xaab0c2);
    p.r(-0.9, 0.65, 1.8, 0.05, 0x5d6272);
  },
  lamppost: (p) => {
    p.r(-0.15, -0.6, 0.3, 1.6, 0x3d4252);
    p.r(-0.5, 0.85, 1, 0.15, 0x3d4252);
    p.p([-0.7, -0.6, 0.7, -0.6, 0.5, -0.95, -0.5, -0.95], 0x3d4252);
    p.r(-0.45, -0.88, 0.9, 0.25, 0xffe27a, flicker(p, 2));
    p.e(0, -0.75, 1.6, 0.4, 0xffe27a, 0.12);
  },
  anvil: (p) => {
    p.p([-1, -1, 0.7, -1, 1, -0.6, 0.4, -0.4, 0.3, 0.3, 0.7, 1, -0.7, 1, -0.3, 0.3, -0.4, -0.4], 0x4f5464);
    p.r(-1, -1, 1.7, 0.2, 0x7c8293);
  },
  fountain: (p) => {
    p.e(0, 0.65, 1, 0.35, 0x8a90a3);
    p.e(0, 0.55, 0.85, 0.22, 0x4f9bf0);
    p.r(-0.12, -0.5, 0.24, 1.1, 0x9aa1b4);
    p.e(0, -0.5, 0.45, 0.12, 0x9aa1b4);
    for (let i = 0; i < 4; i++) {
      const t = (p.time * 1.3 + i * 0.25) % 1;
      p.c((i % 2 ? 1 : -1) * t * 0.6, -0.6 - Math.sin(t * Math.PI) * 0.4 + t * 0.9, 0.07, 0x9fd4ff, 1 - t * 0.5);
    }
  },
  pot: (p) => {
    p.p([-0.75, 0, 0.75, 0, 0.55, 1, -0.55, 1], 0xc9744a);
    p.r(-0.85, -0.1, 1.7, 0.2, 0xa85a3a);
    canopy(p, 0x4fa35a, [[-0.35, -0.45, 0.4, 0.4], [0.35, -0.5, 0.4, 0.4], [0, -0.75, 0.45, 0.35]]);
  },

  coin: (p) => {
    p.c(0, 0, 1, 0xc99a2e);
    p.c(0, 0, 0.82, 0xf5c84a);
    p.r(-0.12, -0.45, 0.24, 0.9, 0xc99a2e);
    p.c(-0.35, -0.35, 0.15, 0xfff0a8);
  },
  gold: (p) => {
    p.p([-1, 1, -0.7, -1, 0.7, -1, 1, 1], 0xc99a2e);
    p.p([-0.8, 0.8, -0.55, -0.8, 0.55, -0.8, 0.8, 0.8], 0xf5c84a);
    p.l(-0.4, -0.5, 0.3, -0.5, 0.15, 0xfff0a8);
  },
  ruby: (p) => gem(p, 0xf0524d),
  sapphire: (p) => gem(p, 0x4f7ff0),
  emerald: (p) => gem(p, 0x4fcf6d),
  amethyst: (p) => gem(p, 0xa97bf2),
  diamond: (p) => {
    p.p([-1, -0.4, -0.5, -1, 0.5, -1, 1, -0.4, 0, 1], 0x7ee8f5);
    p.p([-1, -0.4, 1, -0.4, 0, 1], 0x5cc8dd);
    p.p([-0.5, -1, 0, -0.4, 0.5, -1], 0xbff6ff);
    p.c(-0.4, -0.65, 0.1, 0xffffff);
  },
  xp: (p) => {
    p.c(0, 0, 1, 0x5ccb6d, 0.35 + Math.sin(p.time * 4) * 0.1);
    p.c(0, 0, 0.7, 0x5ccb6d);
    p.c(-0.25, -0.25, 0.25, 0xc8ffd0);
  },
  key: (p) => {
    p.c(-0.55, 0, 0.45, 0xf2c43a);
    p.c(-0.55, 0, 0.2, 0x14161f);
    p.r(-0.15, -0.15, 1.15, 0.3, 0xf2c43a);
    p.r(0.55, 0.15, 0.15, 0.45, 0xf2c43a);
    p.r(0.85, 0.15, 0.15, 0.35, 0xf2c43a);
  },
  heart: (p) => {
    p.c(-0.48, -0.35, 0.55, 0xe8344f);
    p.c(0.48, -0.35, 0.55, 0xe8344f);
    p.p([-1, -0.2, 1, -0.2, 0, 1], 0xe8344f);
    p.c(-0.5, -0.5, 0.18, 0xffffff, 0.7);
  },
  redpotion: (p) => potion(p, 0xe8344f),
  bluepotion: (p) => potion(p, 0x4f7ff0),
  greenpotion: (p) => potion(p, 0x5ccb6d),
  sword: (p) => {
    p.p([-0.45, 0.3, 0, -1, 0.45, 0.3], 0xd8dde8);
    p.p([0, -1, 0.45, 0.3, 0, 0.3], 0xaab0c2);
    p.r(-1, 0.3, 2, 0.15, 0xb8902e);
    p.r(-0.25, 0.45, 0.5, 0.4, 0x6e4a2e);
    p.c(0, 0.92, 0.25, 0xf2c43a);
  },
  shield: (p) => {
    p.p([-1, -1, 1, -1, 1, 0.1, 0, 1, -1, 0.1], 0x8a90a3);
    p.p([-0.8, -0.82, 0.8, -0.82, 0.8, 0.05, 0, 0.78, -0.8, 0.05], 0x3f7fd8);
    p.r(-0.1, -0.82, 0.2, 1.55, 0xf2c43a);
    p.r(-0.8, -0.3, 1.6, 0.2, 0xf2c43a);
  },
  bow: (p) => {
    for (let i = 0; i < 8; i++) {
      const a1 = -Math.PI / 2 + (i / 8) * Math.PI;
      const a2 = -Math.PI / 2 + ((i + 1) / 8) * Math.PI;
      p.l(-0.6 + Math.cos(a1) * 1.4, Math.sin(a1), -0.6 + Math.cos(a2) * 1.4, Math.sin(a2), 0.3, 0x9c6a3e);
    }
    p.l(-0.6, -1, -0.6, 1, 0.08, 0xf1ede2);
  },
  axe: (p) => {
    p.l(-0.2, 1, 0.1, -0.9, 0.28, 0x8a5a36);
    p.p([0, -0.95, 1, -0.7, 1, 0.1, 0.05, -0.15], 0xaab0c2);
    p.p([0.7, -0.75, 1, -0.7, 1, 0.1, 0.7, 0], 0xd8dde8);
  },
  pickaxe: (p) => {
    p.l(0, 1, 0, -0.75, 0.28, 0x8a5a36);
    for (let i = 0; i < 6; i++) {
      const a1 = Math.PI + (i / 6) * Math.PI;
      const a2 = Math.PI + ((i + 1) / 6) * Math.PI;
      p.l(Math.cos(a1), -0.3 + Math.sin(a1) * 0.6, Math.cos(a2), -0.3 + Math.sin(a2) * 0.6, 0.3, 0x8a90a3);
    }
  },
  wand: (p) => {
    p.l(0, 1, 0, -0.5, 0.6, 0x6e4a2e);
    p.p([0, -1, 0.3, -0.65, 0.95, -0.6, 0.45, -0.3, 0.6, 0.2, 0, -0.1, -0.6, 0.2, -0.45, -0.3, -0.95, -0.6, -0.3, -0.65], 0xc49cff);
    p.c(0, -0.45, 0.3, 0xffffff, 0.4 + Math.sin(p.time * 5) * 0.2);
  },
  scroll: (p) => {
    p.r(-0.75, -0.75, 1.5, 1.5, 0xf1e2b8);
    p.e(-0.8, 0, 0.25, 1, 0xd8c08a);
    p.e(0.8, 0, 0.25, 1, 0xd8c08a);
    for (const y of [-0.4, 0, 0.4]) p.r(-0.45, y, 0.9, 0.1, 0x8a6a45, 0.7);
    p.r(-0.1, -0.85, 0.2, 1.7, 0xd8344f);
  },
  crown: (p) => {
    p.p([-1, 1, -1, -0.6, -0.5, 0, 0, -1, 0.5, 0, 1, -0.6, 1, 1], 0xf2c43a);
    p.r(-1, 0.55, 2, 0.45, 0xe2b032);
    for (const x of [-0.5, 0, 0.5]) p.c(x, 0.78, 0.14, x === 0 ? 0xe8344f : 0x4f7ff0);
  },
  ring: (p) => {
    p.c(0, 0.2, 0.85, 0xf2c43a);
    p.c(0, 0.2, 0.55, 0x14161f, 0);
    p.c(0, 0.2, 0.55, 0x2a2e3e);
    p.p([0, -1, 0.35, -0.6, 0, -0.35, -0.35, -0.6], 0x7ee8f5);
  },
  bomb: (p) => {
    p.c(0, 0.15, 0.85, 0x2e3240);
    p.c(-0.3, -0.15, 0.2, 0x6e7586);
    p.r(0.2, -0.85, 0.3, 0.3, 0x5d6272);
    p.l(0.35, -0.85, 0.7, -1, 0.1, 0xb47a45);
    p.c(0.75, -1, 0.15, 0xffd34d, flicker(p, 14));
  },

  apple: (p) => {
    p.c(-0.35, 0.1, 0.65, 0xe8344f);
    p.c(0.35, 0.1, 0.65, 0xe8344f);
    p.c(-0.4, -0.15, 0.2, 0xffffff, 0.5);
    p.l(0, -0.45, 0.1, -0.95, 0.12, 0x6e4a2e);
    p.e(0.4, -0.75, 0.35, 0.15, 0x5ccb6d);
  },
  pear: (p) => {
    p.c(0, 0.35, 0.65, 0x9ccf4a);
    p.c(0, -0.25, 0.42, 0x9ccf4a);
    p.l(0, -0.6, 0.1, -1, 0.1, 0x6e4a2e);
    p.c(-0.25, 0.2, 0.15, 0xffffff, 0.4);
  },
  banana: (p) => {
    p.p([-1, -0.6, -0.6, 0.6, 0, 1, 0.6, 0.6, 1, -0.6, 0.6, 0.2, 0, 0.5, -0.6, 0.2], 0xf5d547);
    p.c(-1, -0.65, 0.12, 0x6e4a2e);
  },
  cherries: (p) => {
    p.l(-0.4, 0.2, 0.2, -0.9, 0.08, 0x3f8a4d);
    p.l(0.45, 0.3, 0.2, -0.9, 0.08, 0x3f8a4d);
    p.c(-0.45, 0.45, 0.45, 0xc8203a);
    p.c(0.45, 0.5, 0.45, 0xe8344f);
    p.c(-0.55, 0.3, 0.12, 0xffffff, 0.6);
  },
  grapes: (p) => {
    for (const [x, y] of [[-0.45, -0.4], [0, -0.45], [0.45, -0.4], [-0.25, 0.05], [0.25, 0.05], [0, 0.5]]) p.c(x, y, 0.32, 0x8a4fc2);
    for (const [x, y] of [[-0.5, -0.5], [0.15, 0]]) p.c(x, y, 0.09, 0xffffff, 0.5);
    p.l(0, -0.8, 0.1, -1, 0.1, 0x6e4a2e);
  },
  bread: (p) => {
    p.rr(-1, -0.7, 2, 1.7, 0.7, 0xc9884a);
    p.rr(-0.95, -0.75, 1.9, 1.1, 0.6, 0xe2a660);
    for (const x of [-0.45, 0, 0.45]) p.l(x - 0.15, -0.5, x + 0.15, -0.1, 0.08, 0xa86a35);
  },
  cheese: (p) => {
    p.p([-1, 1, 1, 1, 1, 0, -1, 1], 0xe8b830);
    p.p([-1, 1, 1, 0, 0, -1], 0xf5d547);
    for (const [x, y, r] of [[0.2, 0.2, 0.15], [0.55, 0.55, 0.1], [-0.2, 0.7, 0.1]]) p.c(x, y, r, 0xd89f20);
  },
  meat: (p) => {
    p.e(-0.15, 0, 0.85, 0.8, 0xb8443a);
    p.e(-0.2, -0.1, 0.6, 0.5, 0xd85a4a);
    p.l(0.5, 0.2, 1, 0.5, 0.25, 0xf1ede2);
    p.c(1, 0.35, 0.18, 0xf1ede2);
    p.c(1, 0.65, 0.18, 0xf1ede2);
  },
  carrot: (p) => {
    p.p([-0.8, -0.6, 0.8, -0.6, 0, 1], 0xf2933a);
    for (const y of [-0.2, 0.2]) p.l(-0.4, y, 0.1, y, 0.06, 0xc96a20);
    for (const dx of [-0.3, 0, 0.3]) p.l(dx * 0.5, -0.6, dx, -1, 0.15, 0x5ccb6d);
  },
  cake: (p) => {
    p.r(-1, -0.2, 2, 1.2, 0xf1d8c0);
    p.r(-1, 0.25, 2, 0.15, 0xe85a8a);
    p.rr(-1, -0.45, 2, 0.4, 0.15, 0xf5a3c7);
    for (const x of [-0.6, 0, 0.6]) p.c(x, -0.6, 0.15, 0xe8344f);
    p.r(-0.05, -1, 0.1, 0.4, 0x4f9bf0);
    flame(p, 0, -1, 0.15);
  },

  slime: (p) => {
    const squish = Math.sin(p.time * 5) * 0.06;
    p.p([-1, 1, -0.95, 0.1 + squish, -0.6, -0.6 - squish, 0, -0.85 - squish, 0.6, -0.6 - squish, 0.95, 0.1 + squish, 1, 1], 0x4fb85a);
    p.e(-0.4, -0.35, 0.25, 0.18, 0xb8f0be, 0.7);
    eyes(p, 0.15, -0.05, 0.16);
  },
  bigslime: (p) => {
    DECOR_ART.slime(p);
    p.c(-0.5, 0.5, 0.12, 0x2e7a38);
    p.c(0.5, 0.6, 0.1, 0x2e7a38);
  },
  bat: (p) => {
    const flap = Math.sin(p.time * 18) * 0.35;
    p.p([-0.3, 0, -1, -0.6 + flap, -0.75, 0.1, -0.5, 0, -0.4, 0.4], 0x5b3f85);
    p.p([0.3, 0, 1, -0.6 + flap, 0.75, 0.1, 0.5, 0, 0.4, 0.4], 0x5b3f85);
    p.e(0, 0.1, 0.4, 0.6, 0x6e5299);
    p.p([-0.3, -0.4, -0.2, -0.9, -0.05, -0.45], 0x6e5299);
    p.p([0.3, -0.4, 0.2, -0.9, 0.05, -0.45], 0x6e5299);
    p.c(-0.15, 0, 0.1, 0xff5a5a);
    p.c(0.15, 0, 0.1, 0xff5a5a);
  },
  ghost: (p) => {
    const bob = Math.sin(p.time * 3) * 0.08;
    p.p([-0.85, 1 + bob, -0.85, -0.3 + bob, -0.4, -0.95 + bob, 0.4, -0.95 + bob, 0.85, -0.3 + bob, 0.85, 1 + bob, 0.5, 0.75 + bob, 0.15, 1 + bob, -0.2, 0.75 + bob, -0.5, 1 + bob], 0xe8eef7, 0.88);
    p.e(-0.3, -0.25 + bob, 0.16, 0.24, 0x2e3240);
    p.e(0.3, -0.25 + bob, 0.16, 0.24, 0x2e3240);
    p.e(0, 0.25 + bob, 0.18, 0.14, 0x2e3240);
  },
  skeleton: (p) => {
    p.c(0, -0.72, 0.28, 0xe8e2d2);
    p.c(-0.1, -0.75, 0.07, 0x14161f);
    p.c(0.12, -0.75, 0.07, 0x14161f);
    p.l(0, -0.45, 0, 0.3, 0.12, 0xe8e2d2);
    for (const y of [-0.3, -0.15, 0]) p.l(-0.3, y, 0.3, y, 0.07, 0xe8e2d2);
    p.l(0, -0.35, -0.6, 0.1, 0.1, 0xe8e2d2);
    p.l(0, -0.35, 0.6, 0.1, 0.1, 0xe8e2d2);
    p.l(0, 0.3, -0.4, 1, 0.12, 0xe8e2d2);
    p.l(0, 0.3, 0.4, 1, 0.12, 0xe8e2d2);
    p.l(0.6, 0.1, 0.9, -0.6, 0.06, 0xaab0c2);
  },
  zombie: (p) => {
    p.rr(-0.45, -1, 0.9, 0.62, 0.15, 0x7fb06a);
    p.c(-0.15, -0.72, 0.08, 0x14161f);
    p.c(0.18, -0.7, 0.08, 0xff5a5a);
    p.r(-0.15, -0.5, 0.35, 0.06, 0x3a4a2e);
    p.r(-0.45, -0.38, 0.9, 0.75, 0x3f7fa8);
    p.r(0.35, -0.3, 0.65, 0.18, 0x7fb06a);
    p.r(0.25, -0.3, 0.2, 0.25, 0x3f7fa8);
    p.r(-0.4, 0.37, 0.35, 0.63, 0x4a3a6a);
    p.r(0.05, 0.37, 0.35, 0.63, 0x4a3a6a);
  },
  goblin: (p) => {
    p.p([-0.8, -0.65, -0.35, -0.5, -0.4, -0.25], 0x5fae4a);
    p.p([0.8, -0.65, 0.35, -0.5, 0.4, -0.25], 0x5fae4a);
    p.e(0, -0.45, 0.42, 0.45, 0x6fc25a);
    eyes(p, 0.05, -0.5, 0.1);
    p.r(-0.18, -0.2, 0.4, 0.06, 0x2e3a24);
    p.rr(-0.45, 0, 0.9, 0.6, 0.15, 0x8a5a36);
    p.r(-0.35, 0.6, 0.25, 0.4, 0x5fae4a);
    p.r(0.1, 0.6, 0.25, 0.4, 0x5fae4a);
    p.l(0.5, 0.2, 0.95, -0.3, 0.12, 0xaab0c2);
  },
  spider: (p) => {
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      const x = side * (0.3 + i * 0.05);
      const knee = side * (0.7 + i * 0.08);
      p.l(x, 0, knee, -0.6 + i * 0.25, 0.08, 0x2e2240);
      p.l(knee, -0.6 + i * 0.25, side * (0.85 + i * 0.05), 1, 0.08, 0x2e2240);
    }
    p.e(-0.3, 0.1, 0.55, 0.55, 0x4a3366);
    p.e(0.35, 0.2, 0.35, 0.35, 0x5b3f85);
    for (const [x, y] of [[0.3, 0.05], [0.5, 0.1], [0.38, 0.28]]) p.c(x, y, 0.07, 0xff5a5a);
  },
  robot: (p) => {
    p.l(0, -1, 0, -0.8, 0.06, 0x9aa1b4);
    p.c(0, -1, 0.08, 0xff5a5a, flicker(p, 6));
    p.rr(-0.55, -0.8, 1.1, 0.6, 0.12, 0x9aa1b4);
    p.r(-0.4, -0.62, 0.8, 0.25, 0x2e3240);
    p.c(-0.18, -0.5, 0.08, 0x6fd6ff);
    p.c(0.18, -0.5, 0.08, 0x6fd6ff);
    p.r(-0.65, -0.15, 1.3, 0.75, 0x7c8293);
    p.c(0, 0.2, 0.15, 0xf2c43a);
    p.r(-0.5, 0.6, 0.35, 0.4, 0x5d6272);
    p.r(0.15, 0.6, 0.35, 0.4, 0x5d6272);
  },
  eyeball: (p) => {
    p.c(0, 0, 1, 0xf1ede2);
    for (const [a, b, c, d] of [[-0.9, -0.2, -0.5, -0.1], [0.6, 0.6, 0.9, 0.3], [-0.5, 0.8, -0.2, 0.55]]) p.l(a, b, c, d, 0.06, 0xd8344f);
    p.c(0.2, 0, 0.5, 0xd8344f);
    p.c(0.3, 0, 0.25, 0x14161f);
    p.c(0.15, -0.15, 0.1, 0xffffff);
  },
  boss: (p) => {
    p.rr(-1, -0.7, 2, 1.7, 0.3, 0xa82e3a);
    p.p([-0.9, -0.7, -0.7, -1.1, -0.5, -0.7], 0xf1ede2);
    p.p([0.9, -0.7, 0.7, -1.1, 0.5, -0.7], 0xf1ede2);
    eyes(p, 0.1, -0.25, 0.14);
    p.r(-0.5, 0.25, 1.1, 0.3, 0x2e1416);
    for (let x = -0.4; x < 0.6; x += 0.2) p.p([x, 0.25, x + 0.1, 0.42, x + 0.2, 0.25], 0xf1ede2);
    p.r(-1, 0.7, 2, 0.3, 0x7a1e26);
  },

  cloud: (p) => {
    for (const [x, y, rx, ry] of [[-0.55, 0.25, 0.45, 0.55], [0.55, 0.3, 0.45, 0.5], [0, -0.1, 0.55, 0.85], [-0.2, 0.45, 0.7, 0.45], [0.3, 0.45, 0.6, 0.45]]) p.e(x, y, rx, ry, 0xf1f4fa, 0.95);
    p.e(0, 0.75, 0.9, 0.2, 0xc9d3e6, 0.7);
  },
  sun: (p) => {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + p.time * 0.3;
      p.p([Math.cos(a) * 0.6, Math.sin(a) * 0.6, Math.cos(a + 0.12) * 1, Math.sin(a + 0.12) * 1, Math.cos(a + 0.24) * 0.6, Math.sin(a + 0.24) * 0.6], 0xffc24d);
    }
    p.c(0, 0, 0.65, 0xffd34d);
    p.c(-0.2, -0.2, 0.2, 0xfff0a8);
  },
  moon: (p) => {
    p.c(0, 0, 1, 0xf5e6a8);
    p.c(0.45, -0.25, 0.85, 0x0b0e1a);
    p.c(-0.5, 0.2, 0.12, 0xd8c88a);
  },
  star: (p) => {
    const points: number[] = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const r = i % 2 ? 0.42 : 1;
      points.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    p.p(points, 0xffd34d);
    p.c(0, 0, 0.25, 0xfff0a8);
  },
  rainbow: (p) => {
    const colours = [0xf0524d, 0xf2933a, 0xf5d547, 0x5ccb6d, 0x4f9bf0, 0xa97bf2];
    colours.forEach((colour, i) => {
      const r = 1 - i * 0.1;
      for (let s = 0; s < 16; s++) {
        const a1 = Math.PI + (s / 16) * Math.PI;
        const a2 = Math.PI + ((s + 1) / 16) * Math.PI;
        p.l(Math.cos(a1) * r, 1 + Math.sin(a1) * 1.9 * r, Math.cos(a2) * r, 1 + Math.sin(a2) * 1.9 * r, 0.1, colour);
      }
    });
  },
  bird: (p) => {
    const flap = Math.sin(p.time * 10) * 0.5;
    p.l(-1, -0.3 + flap, 0, 0.3, 0.2, 0x2e3240);
    p.l(1, -0.3 + flap, 0, 0.3, 0.2, 0x2e3240);
  },
  balloon: (p) => {
    p.e(0, -0.35, 0.95, 0.65, 0xe8344f);
    p.p([-0.15, 0.3, 0.15, 0.3, 0, 0.42], 0xc8203a);
    p.l(0, 0.4, 0.1, 1, 0.04, 0xf1ede2);
    p.e(-0.35, -0.6, 0.2, 0.15, 0xffffff, 0.5);
  },

  flag: (p) => {
    p.r(-0.9, -1, 0.15, 2, 0x9aa1b4);
    const wave = Math.sin(p.time * 4) * 0.1;
    p.p([-0.75, -0.95, 1, -0.75 + wave, 0.85, -0.45, 1, -0.15 - wave, -0.75, 0], 0xe8344f);
    p.c(-0.82, -1, 0.15, 0xf2c43a);
  },
  arrowsign: (p) => {
    p.r(-0.12, -0.2, 0.24, 1.2, 0x6e4a2e);
    p.p([-1, -0.9, 0.5, -0.9, 1, -0.55, 0.5, -0.2, -1, -0.2], 0xb47a45);
    p.p([-0.5, -0.55, 0.3, -0.55], 0x14161f);
    p.l(-0.5, -0.55, 0.35, -0.55, 0.08, 0x6e4a2e);
  },
  bouncer: (p) => {
    p.r(-1, 0.3, 2, 0.7, 0x5d6272);
    for (let x = -0.7; x < 0.8; x += 0.35) p.l(x, 0.3, x + 0.15, -0.3, 0.08, 0xaab0c2);
    p.rr(-1, -1, 2, 0.7, 0.3, 0xe8344f);
    p.r(-0.8, -0.85, 1.6, 0.15, 0xff8a8a);
  },
  pipe: (p) => {
    p.r(-0.8, -0.6, 1.6, 1.6, 0x3f9a4f);
    p.r(-0.8, -0.6, 0.35, 1.6, 0x6fc27a);
    p.r(-1, -1, 2, 0.45, 0x3f9a4f);
    p.r(-1, -1, 0.4, 0.45, 0x6fc27a);
    p.r(-1, -0.6, 2, 0.06, 0x2e7a38);
  },
  gear: (p) => {
    const turn = p.time * 0.8;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + turn;
      p.p([Math.cos(a - 0.18) * 0.7, Math.sin(a - 0.18) * 0.7, Math.cos(a - 0.12) * 1, Math.sin(a - 0.12) * 1, Math.cos(a + 0.12) * 1, Math.sin(a + 0.12) * 1, Math.cos(a + 0.18) * 0.7, Math.sin(a + 0.18) * 0.7], 0x8a90a3);
    }
    p.c(0, 0, 0.75, 0x8a90a3);
    p.c(0, 0, 0.3, 0x3d4252);
  },
  target: (p) => {
    for (let i = 0; i < 5; i++) p.c(0, 0, 1 - i * 0.2, i % 2 ? 0xffffff : 0xe8344f);
  },
  trophy: (p) => {
    p.r(-0.5, 0.75, 1, 0.25, 0x6e4a2e);
    p.r(-0.12, 0.25, 0.24, 0.5, 0xe2b032);
    p.p([-0.75, -1, 0.75, -1, 0.5, 0.1, 0, 0.3, -0.5, 0.1], 0xf2c43a);
    p.e(-0.8, -0.55, 0.25, 0.3, 0xe2b032, 0.9);
    p.e(0.8, -0.55, 0.25, 0.3, 0xe2b032, 0.9);
    p.c(-0.3, -0.6, 0.12, 0xfff0a8);
  },
  present: (p) => {
    p.r(-1, -0.5, 2, 1.5, 0x8a5ad8);
    p.r(-1, -0.7, 2, 0.35, 0xa97bf2);
    p.r(-0.15, -0.7, 0.3, 1.7, 0xf5d547);
    p.e(-0.35, -0.85, 0.35, 0.2, 0xf5d547);
    p.e(0.35, -0.85, 0.35, 0.2, 0xf5d547);
  },
  snowman: (p) => {
    p.c(0, 0.5, 0.5, 0xf1f4fa);
    p.c(0, -0.15, 0.38, 0xf1f4fa);
    p.c(0, -0.68, 0.28, 0xf1f4fa);
    p.r(-0.3, -1, 0.6, 0.12, 0x2e3240);
    p.r(-0.2, -1.2, 0.4, 0.25, 0x2e3240);
    p.p([0, -0.68, 0.35, -0.62, 0, -0.6], 0xf2933a);
    for (const y of [-0.25, -0.05, 0.4]) p.c(0, y, 0.05, 0x2e3240);
  },
  mailbox: (p) => {
    p.r(-0.15, -0.2, 0.3, 1.2, 0x6e4a2e);
    p.rr(-1, -1, 2, 0.85, 0.4, 0x3f7fd8);
    p.r(0.6, -1, 0.12, 0.45, 0xe8344f);
    p.r(0.6, -1, 0.35, 0.15, 0xe8344f);
  },
};

// ---- the two pens: one for the room, one for the little pictures in the menu ----

// draws into one pixi Graphics with everything else, so it moves and turns itself, point by point
export function pixiPen(g: Graphics, x: number, y: number, hw: number, hh: number, angle: number, time: number, alpha = 1): Pen {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const small = Math.min(hw, hh);
  const at = (px: number, py: number): [number, number] => {
    const lx = px * hw;
    const ly = py * hh;
    return [x + lx * cos - ly * sin, y + lx * sin + ly * cos];
  };
  const polygon = (points: number[], colour: number, a: number): void => {
    const out: number[] = [];
    for (let i = 0; i < points.length; i += 2) out.push(...at(points[i], points[i + 1]));
    g.poly(out).fill({ color: colour, alpha: a * alpha });
  };
  const oval = (cx: number, cy: number, rx: number, ry: number, colour: number, a: number): void => {
    if (angle === 0) {
      const [sx, sy] = at(cx, cy);
      g.ellipse(sx, sy, Math.abs(rx), Math.abs(ry)).fill({ color: colour, alpha: a * alpha });
      return;
    }
    const steps = 18;
    const out: number[] = [];
    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      const lx = cx * hw + Math.cos(t) * rx;
      const ly = cy * hh + Math.sin(t) * ry;
      out.push(x + lx * cos - ly * sin, y + lx * sin + ly * cos);
    }
    g.poly(out).fill({ color: colour, alpha: a * alpha });
  };
  return {
    time,
    r: (rx, ry, w, h, colour, a = 1) => polygon([rx, ry, rx + w, ry, rx + w, ry + h, rx, ry + h], colour, a),
    rr: (rx, ry, w, h, _round, colour, a = 1) => polygon([rx, ry, rx + w, ry, rx + w, ry + h, rx, ry + h], colour, a),
    c: (cx, cy, radius, colour, a = 1) => oval(cx, cy, radius * small, radius * small, colour, a),
    e: (cx, cy, rx, ry, colour, a = 1) => oval(cx, cy, rx * hw, ry * hh, colour, a),
    p: (points, colour, a = 1) => polygon(points, colour, a),
    l: (x1, y1, x2, y2, width, colour, a = 1) => {
      const [ax, ay] = at(x1, y1);
      const [bx, by] = at(x2, y2);
      g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: Math.max(0.5, width * small), color: colour, alpha: a * alpha, cap: 'round' });
    },
  };
}

// draws a little picture on a canvas, for the menu
export function canvasPen(ctx: CanvasRenderingContext2D, size: number, hw: number, hh: number): Pen {
  // it fits the longer side, so tall things like trees aren't squashed
  const scale = (size / 2 - 3) / Math.max(hw, hh);
  const sx = hw * scale;
  const sy = hh * scale;
  const small = Math.min(sx, sy);
  const X = (v: number): number => size / 2 + v * sx;
  const Y = (v: number): number => size / 2 + v * sy;
  const colourOf = (c: number, a: number): string => `rgba(${(c >> 16) & 255}, ${(c >> 8) & 255}, ${c & 255}, ${a})`;
  return {
    time: 0,
    r: (x, y, w, h, c, a = 1) => {
      ctx.fillStyle = colourOf(c, a);
      ctx.fillRect(X(x), Y(y), w * sx, h * sy);
    },
    rr: (x, y, w, h, round, c, a = 1) => {
      ctx.fillStyle = colourOf(c, a);
      ctx.beginPath();
      ctx.roundRect(X(x), Y(y), w * sx, h * sy, round * small);
      ctx.fill();
    },
    c: (x, y, r, c, a = 1) => {
      ctx.fillStyle = colourOf(c, a);
      ctx.beginPath();
      ctx.arc(X(x), Y(y), Math.max(0.3, r * small), 0, Math.PI * 2);
      ctx.fill();
    },
    e: (x, y, rx, ry, c, a = 1) => {
      ctx.fillStyle = colourOf(c, a);
      ctx.beginPath();
      ctx.ellipse(X(x), Y(y), Math.max(0.3, Math.abs(rx * sx)), Math.max(0.3, Math.abs(ry * sy)), 0, 0, Math.PI * 2);
      ctx.fill();
    },
    p: (points, c, a = 1) => {
      ctx.fillStyle = colourOf(c, a);
      ctx.beginPath();
      for (let i = 0; i < points.length; i += 2) ctx.lineTo(X(points[i]), Y(points[i + 1]));
      ctx.closePath();
      ctx.fill();
    },
    l: (x1, y1, x2, y2, w, c, a = 1) => {
      ctx.strokeStyle = colourOf(c, a);
      ctx.lineWidth = Math.max(0.6, w * small);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(X(x1), Y(y1));
      ctx.lineTo(X(x2), Y(y2));
      ctx.stroke();
    },
  };
}
