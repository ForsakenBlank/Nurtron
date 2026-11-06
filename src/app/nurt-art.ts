// draws a creature in any skin. it's kept apart from the room so the customise panel can draw the same creature.
import type { Graphics } from 'pixi.js';
import type { Look } from '../sim/look.ts';

const R = 26;

export interface NurtPose {
  x: number;
  feetY: number;
  facing: number;
  time: number;
  walking: boolean;
  resting: boolean;
  stunned: boolean;
  dragged: boolean;
  calling: boolean;
  lookX: number;
  lookY: number;
  blinking: boolean;
  hungry: boolean;
  delighted: boolean;
  mood: number;
  thinkGlow: number;
}

// a creature standing still and looking at you, for pictures of it
export const STILL_POSE: NurtPose = { x: 0, feetY: 0, facing: 1, time: 0, walking: false, resting: false, stunned: false, dragged: false, calling: false, lookX: 1, lookY: 0, blinking: false, hungry: false, delighted: false, mood: 0.4, thinkGlow: 0 };

function shade(colour: number, by: number): number {
  const r = Math.min(255, ((colour >> 16) & 255) * by);
  const g = Math.min(255, ((colour >> 8) & 255) * by);
  const b = Math.min(255, (colour & 255) * by);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

function brightness(colour: number): number {
  return (0.3 * ((colour >> 16) & 255) + 0.59 * ((colour >> 8) & 255) + 0.11 * (colour & 255)) / 255;
}

// pixi can't turn an ellipse, and ears need to lean
function leaningEllipse(g: Graphics, cx: number, cy: number, rx: number, ry: number, angle: number): void {
  const points: number[] = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const px = Math.cos(a) * rx;
    const py = Math.sin(a) * ry;
    points.push(cx + px * Math.cos(angle) - py * Math.sin(angle), cy + px * Math.sin(angle) + py * Math.cos(angle));
  }
  g.poly(points);
}

export function drawNurt(g: Graphics, pose: NurtPose, look: Look): void {
  const { x, feetY, facing, time: t, walking, resting, stunned, dragged } = pose;
  const skin = look.skin;
  const floats = skin === 'ghost';
  const oozes = skin === 'slime';

  const bob = walking ? Math.abs(Math.sin(t * 11)) * (oozes ? 2 : 5) : Math.sin(t * 2.2) * 1;
  const squash = resting ? 0.8 : stunned ? 0.86 : 1 + (walking ? Math.sin(t * 22) * 0.03 : Math.sin(t * 2.2) * 0.012);
  const rx = R * (2 - squash) * 1.02;
  const ry = R * squash * 1.08;
  const hover = floats ? 6 + Math.sin(t * 2.4) * 3 : 0;
  const baseY = feetY - bob - hover;
  const cy = baseY - ry - 4;

  const dark = look.accent;
  const line = brightness(skin === 'cosmos' ? shade(look.body, 0.45) : look.body) < 0.32 ? 0xffffff : look.eyes;

  // ---- behind the body ----
  if (skin === 'cat') {
    // a tail that swishes
    const tailX = x - facing * rx * 0.85;
    const swish = Math.sin(t * 2.6) * 7;
    g.moveTo(tailX, cy + ry * 0.55).bezierCurveTo(tailX - facing * 26, cy + ry * 0.6, tailX - facing * 24, cy - 12, tailX - facing * 14 + swish, cy - 22).stroke({ width: 6, color: look.body, cap: 'round' });
  }
  if (skin === 'bunny') {
    const droop = resting ? 0.55 : Math.sin(t * 1.8) * 0.05;
    const earY = cy - ry - 13 + (resting ? 7 : 0);
    for (const side of [-1, 1]) {
      const a = side * (0.22 + droop);
      leaningEllipse(g, x + side * 11 + facing * 3, earY, 7.5, 21, a);
      g.fill(look.body);
      leaningEllipse(g, x + side * 11 + facing * 3, earY + 2, 3.8, 15, a);
      g.fill(look.belly);
    }
  }
  if (skin === 'cat') {
    for (const side of [-1, 1]) {
      const ex = x + side * rx * 0.58 + facing * 2;
      const ey = cy - ry * 0.68;
      g.poly([ex - 11, ey + 6, ex + side * 4, ey - 20, ex + 11, ey + 4]).fill(look.body);
      g.poly([ex - 5, ey + 3, ex + side * 3, ey - 11, ex + 6, ey + 2]).fill(look.belly);
    }
  }

  // ---- feet ----
  if (!floats && !oozes) {
    const step = walking ? Math.sin(t * 11) * 8 : 0;
    const dangle = dragged ? 5 : 0;
    const leftY = feetY - 2 + dangle - Math.max(0, Math.sin(t * 11)) * (walking ? 4 : 0);
    const rightY = feetY - 2 + dangle - Math.max(0, -Math.sin(t * 11)) * (walking ? 4 : 0);
    if (skin === 'robot') {
      g.roundRect(x - 19 + step, leftY - 4, 16, 8, 2).fill(dark);
      g.roundRect(x + 3 - step, rightY - 4, 16, 8, 2).fill(dark);
    } else {
      g.ellipse(x - 11 + step, leftY, 8, 4.5).fill(dark);
      g.ellipse(x + 11 - step, rightY, 8, 4.5).fill(dark);
    }
  }

  // ---- the thing on its head, whose bulb lights up each time it makes a decision ----
  const small = skin === 'bunny' || skin === 'cat';
  const stemX = x - facing * 3;
  const topY = cy - ry - (small ? 7 : 13) + (resting ? 5 : 0);
  const sway = skin === 'robot' ? 0 : Math.sin(t * 3) * 2 + (walking ? -facing * 4 : 0);
  g.moveTo(stemX, cy - ry + 2).quadraticCurveTo(stemX + sway * 0.5, cy - ry - 7, stemX + sway, topY).stroke({ width: skin === 'robot' ? 2.5 : 3, color: dark });
  if (pose.thinkGlow > 0) g.circle(stemX + sway, topY, 6 + pose.thinkGlow * 9).fill({ color: 0xffe28a, alpha: pose.thinkGlow * 0.35 });
  g.circle(stemX + sway, topY, small ? 3.5 : 5).fill(pose.thinkGlow > 0.05 ? 0xffe28a : look.belly);

  // ---- the body ----
  const bodyColour = skin === 'cosmos' ? shade(look.body, 0.45) : look.body;
  bodyPath(g, skin, x, cy, rx, ry, baseY, t);
  g.fill(floats ? { color: bodyColour, alpha: 0.9 } : bodyColour);

  markings(g, look, x, cy, rx, ry, t, facing);

  // ---- the belly ----
  if (skin === 'robot') {
    g.roundRect(x + facing * 3 - rx * 0.62, cy + ry * 0.12, rx * 1.24, ry * 0.68, 4).fill(look.belly);
    g.moveTo(x + facing * 3 - rx * 0.4, cy + ry * 0.46).lineTo(x + facing * 3 + rx * 0.4, cy + ry * 0.46).stroke({ width: 1.5, color: dark, alpha: 0.6 });
  } else if (skin === 'cosmos') {
    g.ellipse(x + facing * 4, cy + ry * 0.32, rx * 0.62, ry * 0.58).fill({ color: look.belly, alpha: 0.22 });
  } else if (skin !== 'slime') {
    g.ellipse(x + facing * 4, cy + ry * 0.32, rx * 0.62, ry * 0.58).fill(look.belly);
  }

  // ---- the face ----
  const eyeX = x + facing * 8;
  const eyeY = cy - ry * 0.22;
  const eyes = [eyeX - 10, eyeX + 10];
  for (const ex of eyes) {
    if (stunned) {
      g.moveTo(ex - 4, eyeY - 4).lineTo(ex + 4, eyeY + 4).moveTo(ex + 4, eyeY - 4).lineTo(ex - 4, eyeY + 4).stroke({ width: 2.5, color: line });
    } else if (resting) {
      g.moveTo(ex - 5, eyeY + 1).quadraticCurveTo(ex, eyeY + 4, ex + 5, eyeY + 1).stroke({ width: 2.5, color: line });
    } else if (pose.delighted) {
      g.moveTo(ex - 5, eyeY + 2).quadraticCurveTo(ex, eyeY - 5, ex + 5, eyeY + 2).stroke({ width: 2.5, color: line });
    } else if (pose.blinking) {
      g.moveTo(ex - 5, eyeY).lineTo(ex + 5, eyeY).stroke({ width: 2.5, color: line });
    } else if (skin === 'robot') {
      g.roundRect(ex - 6, eyeY - 5.5, 12, 11, 2).fill(0xffffff);
      g.rect(ex + pose.lookX * 2 - 2.5, eyeY + pose.lookY * 2 - 3, 5, 6).fill(look.eyes);
    } else {
      g.circle(ex, eyeY, 6.5).fill(0xffffff);
      g.circle(ex + pose.lookX * 2.4, eyeY + pose.lookY * 2.4, 3.4).fill(look.eyes);
      g.circle(ex + pose.lookX * 2.4 + 1, eyeY + pose.lookY * 2.4 - 1.2, 1).fill(0xffffff);
    }
  }
  if (pose.hungry && !resting && !stunned) {
    g.moveTo(eyes[0] - 6, eyeY - 8).lineTo(eyes[0] + 3, eyeY - 11).moveTo(eyes[1] - 3, eyeY - 11).lineTo(eyes[1] + 6, eyeY - 8).stroke({ width: 2, color: line });
  }

  const mouthX = x + facing * 9;
  const mouthY = cy + ry * 0.3;
  const mouthColour = skin === 'robot' || skin === 'slime' || skin === 'cosmos' ? line : look.eyes;
  if (pose.calling || dragged) {
    g.ellipse(mouthX, mouthY, 5, 6).fill(mouthColour);
  } else if (!resting) {
    g.moveTo(mouthX - 6, mouthY).quadraticCurveTo(mouthX, mouthY + pose.mood * 7, mouthX + 6, mouthY).stroke({ width: 2.2, color: mouthColour });
  }
  if (skin === 'cat' && !stunned) {
    for (const side of [-1, 1]) {
      g.moveTo(mouthX + side * 9, mouthY - 3).lineTo(mouthX + side * 20, mouthY - 6).moveTo(mouthX + side * 9, mouthY).lineTo(mouthX + side * 20, mouthY + 1);
    }
    g.stroke({ width: 1.2, color: line, alpha: 0.7 });
  }
}

function bodyPath(g: Graphics, skin: Look['skin'], x: number, cy: number, rx: number, ry: number, baseY: number, t: number): void {
  if (skin === 'robot') {
    g.roundRect(x - rx * 0.96, cy - ry * 0.98, rx * 1.92, ry * 1.96, 10);
  } else if (skin === 'fluff') {
    // tufts of fur around the edge, which shiver very slightly
    const points: number[] = [];
    const tufts = 28;
    for (let i = 0; i < tufts; i++) {
      const a = (i / tufts) * Math.PI * 2;
      const out = i % 2 === 0 ? 1.14 + Math.sin(t * 5 + i) * 0.015 : 0.98;
      points.push(x + Math.cos(a) * rx * out, cy + Math.sin(a) * ry * out);
    }
    g.poly(points);
  } else if (skin === 'ghost') {
    // a dome on top and a wavy hem along the bottom
    const points: number[] = [];
    for (let i = 0; i <= 18; i++) {
      const a = Math.PI + (i / 18) * Math.PI;
      points.push(x + Math.cos(a) * rx, cy + Math.sin(a) * ry);
    }
    const hemY = cy + ry * 1.04;
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const along = i / steps;
      const hx = x + rx - along * rx * 2;
      const wave = Math.sin(along * Math.PI * 6 + t * 5) * 4;
      points.push(hx, hemY + wave);
    }
    g.poly(points);
  } else if (skin === 'slime') {
    // spreads out at the bottom like something that's melting
    const wobble = Math.sin(t * 3) * 2;
    const wide = rx * 1.26 + wobble;
    const floor = baseY + 3;
    g.moveTo(x - wide, floor)
      .bezierCurveTo(x - wide * 1.02, cy + ry * 0.2, x - rx * 0.86, cy - ry * 1.04, x, cy - ry)
      .bezierCurveTo(x + rx * 0.86, cy - ry * 1.04, x + wide * 1.02, cy + ry * 0.2, x + wide, floor)
      .closePath();
  } else {
    g.ellipse(x, cy, rx, ry);
  }
}

// only ever inside the body, worked out from how wide it is at that height
function markings(g: Graphics, look: Look, x: number, cy: number, rx: number, ry: number, t: number, facing: number): void {
  const skin = look.skin;
  if (skin === 'spots') {
    const spots = [
      [-0.62, -0.42, 4.5],
      [-0.28, -0.72, 3.5],
      [0.42, -0.74, 3],
      [-0.72, 0.18, 3.5],
      [0.74, -0.08, 4],
      [-0.46, 0.66, 3],
      [0.62, 0.58, 3.5],
    ];
    for (const [sx, sy, r] of spots) g.circle(x + sx * rx * facing, cy + sy * ry, r).fill(look.accent);
  } else if (skin === 'stripes') {
    for (const sx of [-0.78, -0.46, -0.12, 0.22, 0.56, 0.84]) {
      const half = ry * Math.sqrt(Math.max(0, 1 - sx * sx)) * 0.96;
      const bx = x + sx * rx;
      g.moveTo(bx, cy - half).quadraticCurveTo(bx + 4.5, cy, bx, cy + half).quadraticCurveTo(bx - 4.5, cy, bx, cy - half).fill(look.accent);
    }
  } else if (skin === 'fluff') {
    for (const [sx, sy] of [[-0.6, -0.5], [0.55, -0.6], [-0.75, 0.15], [0.74, 0.2]]) {
      const fx = x + sx * rx;
      const fy = cy + sy * ry;
      g.moveTo(fx - 4, fy + 3).lineTo(fx, fy - 3).lineTo(fx + 4, fy + 3).stroke({ width: 1.6, color: look.accent });
    }
  } else if (skin === 'robot') {
    for (const [sx, sy] of [[-0.78, -0.74], [0.78, -0.74], [-0.78, 0.74], [0.78, 0.74]]) g.circle(x + sx * rx, cy + sy * ry, 2).fill(look.accent);
  } else if (skin === 'slime') {
    g.ellipse(x - facing * rx * 0.42, cy - ry * 0.56, rx * 0.2, ry * 0.13).fill({ color: 0xffffff, alpha: 0.55 });
    const drip = 3 + Math.sin(t * 1.7) * 2;
    g.ellipse(x - facing * rx * 0.86, cy + ry * 0.45, 3, 4 + drip).fill({ color: look.accent, alpha: 0.55 });
    g.ellipse(x - facing * rx * 0.5, cy + ry * 0.72, 2.5, 3 + drip * 0.6).fill({ color: look.accent, alpha: 0.55 });
  } else if (skin === 'cosmos') {
    const stars = [
      [-0.66, -0.42, 1.5, 0],
      [-0.28, -0.76, 1.1, 1.3],
      [0.5, -0.66, 1.6, 2.2],
      [0.8, 0, 1.1, 0.7],
      [-0.82, 0.12, 1.2, 3.1],
      [-0.5, 0.62, 1.4, 1.9],
      [0.58, 0.62, 1.2, 4],
      [0.05, 0.82, 1, 2.8],
    ];
    for (const [sx, sy, r, phase] of stars) {
      g.circle(x + sx * rx, cy + sy * ry, r).fill({ color: 0xffffff, alpha: 0.55 + Math.sin(t * 3 + phase) * 0.4 });
    }
    g.circle(x + rx * 0.3 * facing, cy - ry * 0.8, 2.4).fill({ color: look.accent, alpha: 0.9 });
  }
}

// an egg, wobbling more and cracking as it gets closer. how far along it is goes from 0 to 1.
export function drawEgg(g: Graphics, x: number, feetY: number, time: number, along: number, look: Look): void {
  const shake = along * along;
  const lean = Math.sin(time * (4 + shake * 16)) * (0.04 + shake * 0.22);
  const cy = feetY - 30;
  leaningEllipse(g, x, cy, 24, 30, lean);
  g.fill(look.belly);
  const spots = [
    [-10, -14, 4],
    [9, -6, 5],
    [-7, 8, 5],
    [10, 13, 3.5],
    [-1, -22, 3],
  ];
  for (const [sx, sy, r] of spots) {
    g.circle(x + sx * Math.cos(lean) - sy * Math.sin(lean), cy + sx * Math.sin(lean) + sy * Math.cos(lean), r).fill(look.body);
  }
  if (along > 0.45) {
    // the crack spreads across it
    const reach = Math.min(1, (along - 0.45) / 0.5);
    const zig = [-20, -7, -11, 2, 0, -6, 9, 2, 19, -7];
    g.moveTo(x + zig[0] * reach, cy - 6 + zig[1]);
    for (let i = 2; i < zig.length; i += 2) g.lineTo(x + zig[i] * reach, cy - 6 + zig[i + 1]);
    g.stroke({ width: 2, color: look.eyes, alpha: 0.75 });
  }
}
