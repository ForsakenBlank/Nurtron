// any speed, without ever freezing the window
import { describe, expect, it } from 'vitest';
import { cleanSpeed, Clock, speedWords } from '../src/sim/clock.ts';

// a pretend clock where every tick takes `ms`
function fake(ms: number): { now: () => number; step: () => void; ticks: () => number } {
  let t = 0;
  let n = 0;
  return { now: () => t, step: () => ((t += ms), n++), ticks: () => n };
}

describe('the clock', () => {
  it('runs exactly as many ticks as the speed says when there is time', () => {
    const clock = new Clock();
    clock.speed = 2;
    const f = fake(0.01);
    let total = 0;
    for (let i = 0; i < 60; i++) total += clock.frame(1 / 60, 30, f.step, 12, f.now);
    expect(total).toBe(60); // two seconds of ticks in one second
  });

  it('goes slower than 1 for slow motion', () => {
    const clock = new Clock();
    clock.speed = 0.25;
    const f = fake(0.01);
    let total = 0;
    for (let i = 0; i < 60; i++) total += clock.frame(1 / 60, 30, f.step, 12, f.now);
    expect(total).toBeGreaterThanOrEqual(7);
    expect(total).toBeLessThanOrEqual(8);
  });

  it('never goes over its budget, however fast it is asked to go', () => {
    const clock = new Clock();
    clock.speed = 1000;
    const f = fake(1); // a slow computer: a millisecond a tick
    const ran = clock.frame(1 / 60, 30, f.step, 10, f.now);
    expect(ran).toBeLessThanOrEqual(11);
    expect(clock.behind).toBe(true);
    // and it doesn't save up what it missed
    expect(clock.carry).toBeLessThanOrEqual(1);
  });

  it('Max uses the whole budget', () => {
    const clock = new Clock();
    clock.speed = 'max';
    const f = fake(0.1);
    clock.frame(1 / 60, 30, f.step, 10, f.now);
    const ran = clock.frame(1 / 60, 30, f.step, 10, f.now);
    expect(ran).toBeGreaterThanOrEqual(95);
    expect(clock.achieved).toBeGreaterThan(100);
  });

  it('paused runs nothing', () => {
    const clock = new Clock();
    clock.speed = 0;
    const f = fake(0.1);
    expect(clock.frame(1 / 60, 30, f.step, 10, f.now)).toBe(0);
  });

  it('cleans speeds from anywhere', () => {
    expect(cleanSpeed('max')).toBe('max');
    expect(cleanSpeed(5000)).toBe(1000);
    expect(cleanSpeed(0.001)).toBe(0.05);
    expect(cleanSpeed('nonsense')).toBe(0);
    expect(cleanSpeed(-3)).toBe(0);
    expect(speedWords(37.4)).toBe('37x');
    expect(speedWords(0.25)).toBe('0.25x');
    expect(speedWords('max')).toBe('Max');
  });
});
