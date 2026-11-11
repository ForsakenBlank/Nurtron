// how fast time goes. any speed you like, or Max, which is as fast as the computer can go. either way it never runs more
// ticks than fit in the time it's given, so the window keeps drawing and answering however fast you ask it to go.
export const SLOWEST = 0.05;
export const FASTEST = 1000;
export type Speed = number | 'max';

export function cleanSpeed(value: unknown): Speed {
  if (value === 'max') return 'max';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(SLOWEST, Math.min(FASTEST, n));
}

// the way it's written on a button: 1x, 0.25x, 37x, Max
export function speedWords(speed: Speed): string {
  if (speed === 'max') return 'Max';
  if (speed === 0) return 'Paused';
  if (speed < 1) return `${Number(speed.toFixed(2))}x`;
  if (speed < 10) return `${Number(speed.toFixed(1))}x`;
  return `${Math.round(speed)}x`;
}

export class Clock {
  speed: Speed = 1;
  carry = 0; // part of a tick still to come, carried over to the next frame
  achieved = 0; // how many times real time it really went, lately
  msPerTick = 0.5; // how long one tick takes on this computer, lately
  behind = false; // it couldn't keep up with the speed asked for, lately
  ticks = 0; // every tick it has run

  // runs as many ticks as this frame should have, within the budget, and returns how many it ran
  frame(dt: number, ticksPerSecond: number, step: () => void, budgetMs: number, now: () => number = () => performance.now()): number {
    if (this.speed === 0 || dt <= 0) {
      this.achieved = 0;
      this.behind = false;
      return 0;
    }
    const started = now();
    let wanted: number;
    if (this.speed === 'max') {
      wanted = Infinity;
      this.carry = 0;
    } else {
      this.carry += dt * this.speed * ticksPerSecond;
      wanted = Math.floor(this.carry);
    }
    let ran = 0;
    let spent = 0;
    while (ran < wanted) {
      // at least one tick a frame, so a slow tick can't stop time altogether
      if (ran > 0 && spent + this.msPerTick > budgetMs) break;
      step();
      ran++;
      spent = now() - started;
    }
    if (ran > 0) this.msPerTick = this.msPerTick * 0.8 + (spent / ran) * 0.2;
    if (this.speed !== 'max') {
      this.carry -= ran;
      // whatever it couldn't fit in is dropped, not saved up, so it never has to rush to catch up later
      this.behind = this.carry >= 1;
      if (this.behind) this.carry = Math.min(this.carry, 1);
    } else this.behind = false;
    this.ticks += ran;
    const rate = ran / dt / ticksPerSecond;
    this.achieved = this.achieved === 0 ? rate : this.achieved * 0.9 + rate * 0.1;
    return ran;
  }
}
