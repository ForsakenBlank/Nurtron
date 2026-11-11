// how a creature sees the world. it never sees names or pixels, only what a thing is like,
// which is why what it learns still works on things and in rooms it has never met.

// a creature is a shape of its own to another creature, since nothing else looks like one
// a button is a shape of its own too, so a red button and a red fruit never get mixed up
export const SHAPES = ['circle', 'square', 'triangle', 'hexagon', 'bar', 'creature', 'button'] as const;
export const COLOURS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'grey'] as const;
export const SIZES = ['small', 'medium', 'big'] as const;
export const NEARNESS = ['close', 'nearby', 'far'] as const;

export type Shape = (typeof SHAPES)[number];
export type Colour = (typeof COLOURS)[number];
export type Size = (typeof SIZES)[number];
export type Nearness = (typeof NEARNESS)[number];

export interface Percept {
  shape: Shape;
  colour: Colour;
  size: Size;
  moving: boolean;
  near: Nearness;
}

// how much each sense counts when deciding if two things are alike
const WEIGHT = { shape: 0.35, colour: 0.35, size: 0.2, moving: 0.05, near: 0.05 };

function ladder<T>(list: readonly T[], a: T, b: T): number {
  const gap = Math.abs(list.indexOf(a) - list.indexOf(b));
  return gap === 0 ? 1 : gap === 1 ? 0.5 : 0;
}

// 1 means the same in every way, 0 means nothing in common
export function similarity(a: Percept, b: Percept): number {
  return (
    (a.shape === b.shape ? WEIGHT.shape : 0) +
    (a.colour === b.colour ? WEIGHT.colour : 0) +
    WEIGHT.size * ladder(SIZES, a.size, b.size) +
    (a.moving === b.moving ? WEIGHT.moving : 0) +
    WEIGHT.near * ladder(NEARNESS, a.near, b.near)
  );
}

// the colour family closest to some red, green and blue from 0 to 255. this is how a picture on a shape gets seen:
// a creature can't see pixels, but it can tell a mostly red thing from a mostly blue one.
export function colourFamily(r: number, g: number, b: number): Colour {
  const top = Math.max(r, g, b);
  const spread = top - Math.min(r, g, b);
  if (top === 0 || spread / top < 0.2) return 'grey';
  const hue = top === r ? ((g - b) / spread + 6) % 6 : top === g ? (b - r) / spread + 2 : (r - g) / spread + 4;
  const degrees = hue * 60;
  if (degrees < 18 || degrees >= 330) return 'red';
  if (degrees < 45) return 'orange';
  if (degrees < 70) return 'yellow';
  if (degrees < 170) return 'green';
  if (degrees < 255) return 'blue';
  return 'purple';
}

// the colour a picture mostly is, from its pixels as red, green, blue, alpha. grey only wins if there's nothing
// else to go on, since a red fruit on a white background is a red thing.
export function mostlyColour(pixels: ArrayLike<number>): Colour {
  const tally = new Map<Colour, number>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const colour = colourFamily(pixels[i], pixels[i + 1], pixels[i + 2]);
    tally.set(colour, (tally.get(colour) ?? 0) + (colour === 'grey' ? 0.2 : 1));
  }
  let best: Colour = 'grey';
  let most = 0;
  for (const [colour, count] of tally) {
    if (count > most) {
      best = colour;
      most = count;
    }
  }
  return best;
}

// goes by how much of it there is, so a long thin plank and a chunky block can both be big
export function sizeOf(area: number): Size {
  const radius = Math.sqrt(area / Math.PI);
  return radius < 18 ? 'small' : radius < 30 ? 'medium' : 'big';
}

export function nearnessOf(distance: number): Nearness {
  return distance < 90 ? 'close' : distance < 300 ? 'nearby' : 'far';
}

// plain words for the brain view, e.g. "small red circle"
export function describe(p: Percept | null): string {
  return p ? `${p.size} ${p.colour} ${p.shape}` : 'itself';
}
