// a dimension: a copy of the world running by itself, with ghosts of the real creatures in it. it knows nothing about
// threads or windows, so the same code runs in a worker, in the main window, and in tests.
import { Clock } from './clock.ts';
import type { Speed } from './clock.ts';
import { applyKnowledge, knowledgeOf } from './hive.ts';
import type { Knowledge } from './hive.ts';
import { TICKS_PER_SECOND, World } from './world.ts';
import type { WorldEvent } from './world.ts';

export interface DimensionOptions {
  seed: number; // its own luck, so its ghosts don't all do the same thing
  scatter: boolean; // start its creatures in different places
  revive: boolean; // a ghost that dies comes straight back
}

export interface DimensionStats {
  ticks: number;
  decisions: number;
  ate: number;
  deaths: number;
  gaveUp: number;
  cuddles: number;
  petted: number;
  speed: number; // how many times real time it's really going, lately
  msPerTick: number;
  refreshes: number;
  creatures: number;
  concepts: number;
}

export const emptyStats = (): DimensionStats => ({ ticks: 0, decisions: 0, ate: 0, deaths: 0, gaveUp: 0, cuddles: 0, petted: 0, speed: 0, msPerTick: 0, refreshes: 0, creatures: 0, concepts: 0 });

export type KnowledgeByUid = Record<string, Knowledge>;

export class Dimension {
  world: World;
  clock = new Clock();
  stats: DimensionStats = emptyStats();
  options: DimensionOptions;
  keepEvents = false; // someone is watching, so what happens is kept for them to draw
  kept: WorldEvent[] = [];

  constructor(save: string, options: DimensionOptions, stats?: DimensionStats) {
    this.options = options;
    this.world = this.open(save);
    if (stats) this.stats = stats;
  }

  private open(save: string): World {
    const world = World.load(save);
    // its own luck from here on
    world.rng.state = (this.options.seed >>> 0) || 1;
    for (const _ of Array(7)) world.rng.next();
    if (this.options.scatter) {
      for (const c of world.creatures) {
        if (c.dead || c.hiddenAway) continue;
        world.placeCreature(world.rng.range(80, world.size.width - 80), c);
      }
    }
    // a world saved mid-choice would sit waiting for someone to pick
    world.choosing = null;
    return world;
  }

  // the real world has changed, or this one has wandered off somewhere strange: start again from it
  refresh(save: string): void {
    this.world.dispose();
    this.options.seed = (this.options.seed * 1664525 + 1013904223) >>> 0;
    this.world = this.open(save);
    this.stats.refreshes++;
  }

  step(): void {
    this.world.step();
    const events = this.world.takeEvents();
    if (this.keepEvents && this.kept.length < 2000) this.kept.push(...events);
    for (const e of events) {
      if (e.type === 'decided') this.stats.decisions++;
      else if (e.type === 'touched' && e.ate && !e.cuddle) this.stats.ate++;
      else if (e.type === 'cuddled') this.stats.cuddles++;
      else if (e.type === 'gaveUp') this.stats.gaveUp++;
      else if (e.type === 'petted') this.stats.petted++;
      else if (e.type === 'died') {
        this.stats.deaths++;
        // it has learned what went wrong, which is the point. now it comes back and carries on
        const c = this.world.creatureById(e.who);
        if (c && this.options.revive) this.world.revive(c);
      }
    }
    this.stats.ticks++;
  }

  // runs one slice of time, as much as fits in the budget
  run(dt: number, budgetMs: number): number {
    const ran = this.clock.frame(dt, TICKS_PER_SECOND, () => this.step(), budgetMs);
    this.stats.speed = this.clock.achieved;
    this.stats.msPerTick = this.clock.msPerTick;
    return ran;
  }

  setSpeed(speed: Speed): void {
    this.clock.speed = speed;
  }

  // what every ghost here knows, by who it's a ghost of
  knowledge(): KnowledgeByUid {
    const out: KnowledgeByUid = {};
    for (const c of this.world.creatures) out[c.uid] = knowledgeOf(c.brain, this.world.tick);
    return out;
  }

  // the shared brain, after everyone's learning was added up. false if a ghost couldn't take it (its body changed)
  learn(shared: KnowledgeByUid): boolean {
    let all = true;
    for (const c of this.world.creatures) {
      const k = shared[c.uid];
      if (k && !applyKnowledge(c.brain, k, this.world.tick)) all = false;
    }
    return all;
  }

  uids(): string[] {
    return this.world.creatures.map((c) => c.uid).sort();
  }

  snapshot(): DimensionStats {
    this.stats.creatures = this.world.creatures.length;
    this.stats.concepts = this.world.creatures.reduce((n, c) => n + c.brain.concepts.length, 0);
    return { ...this.stats };
  }

  dispose(): void {
    this.world.dispose();
  }
}
