// seeded randomness, so any run can be replayed exactly. the state is one number, so it saves easily.
export class Rng {
  state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
}

// the Data element from the plan: a base value with optional randomness.
// base 10, spread 1 gives 9, 10 or 11.
export interface Data {
  base: number;
  spread: number;
}

export function sample(data: Data, rng: Rng): number {
  return data.spread ? data.base + rng.int(-data.spread, data.spread) : data.base;
}
