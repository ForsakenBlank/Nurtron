// all the dimensions, from the main window's side: making and deleting them, their speeds, sharing one brain between
// every ghost and the real creature, and keeping count of how it's all going.
import type { Speed } from '../sim/clock.ts';
import { Dimension, emptyStats } from '../sim/dimension.ts';
import type { DimensionOptions, DimensionStats, KnowledgeByUid } from '../sim/dimension.ts';
import { knowledgeOf, mergeInto } from '../sim/hive.ts';
import type { Knowledge } from '../sim/hive.ts';
import type { World, WorldEvent } from '../sim/world.ts';
import type { FromWorker, ToWorker } from './dimension-worker.ts';

export const MOST_DIMENSIONS = 32;
const PULL_TIMEOUT = 2500;
const SETTINGS_KEY = 'nurtron.dimensions';

// one dimension's thread, or the main window standing in for one
interface Backend {
  readonly kind: 'thread' | 'here';
  stats: DimensionStats;
  setSpeed(speed: Speed): void;
  setPaused(paused: boolean): void;
  pull(): Promise<{ knowledge: KnowledgeByUid; uids: string[] } | null>;
  push(shared: KnowledgeByUid): void;
  refresh(save: string): void;
  takeSave(): Promise<{ save: string; stats: DimensionStats } | null>;
  stop(): void;
}

let asks = 0;

class ThreadBackend implements Backend {
  readonly kind = 'thread';
  stats = emptyStats();
  failed: string | null = null;
  private worker: Worker;
  private waiting = new Map<number, (m: FromWorker) => void>();

  constructor(save: string, options: DimensionOptions, speed: Speed, paused: boolean, stats?: DimensionStats) {
    this.worker = new Worker(new URL('./dimension-worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.type === 'stats') this.stats = m.stats;
      else if (m.type === 'error') this.failed = m.message;
      else if ((m.type === 'knowledge' || m.type === 'saved') && this.waiting.has(m.ask)) {
        this.waiting.get(m.ask)?.(m);
        this.waiting.delete(m.ask);
      }
    };
    this.worker.onerror = (e) => {
      this.failed = e.message || 'The thread stopped working.';
      for (const done of this.waiting.values()) done({ type: 'error', message: this.failed });
      this.waiting.clear();
    };
    if (stats) this.stats = stats;
    this.send({ type: 'start', save, options, speed, paused, stats });
  }

  private send(m: ToWorker): void {
    this.worker.postMessage(m);
  }

  private ask<T extends FromWorker>(m: ToWorker & { ask: number }): Promise<T | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiting.delete(m.ask);
        resolve(null);
      }, PULL_TIMEOUT);
      this.waiting.set(m.ask, (reply) => {
        clearTimeout(timer);
        resolve(reply.type === 'error' ? null : (reply as T));
      });
      this.send(m);
    });
  }

  setSpeed(speed: Speed): void {
    this.send({ type: 'speed', speed });
  }
  setPaused(paused: boolean): void {
    this.send({ type: 'pause', paused });
  }
  async pull(): Promise<{ knowledge: KnowledgeByUid; uids: string[] } | null> {
    const reply = await this.ask<Extract<FromWorker, { type: 'knowledge' }>>({ type: 'pull', ask: ++asks });
    return reply ? { knowledge: reply.knowledge, uids: reply.uids } : null;
  }
  push(shared: KnowledgeByUid): void {
    this.send({ type: 'push', shared });
  }
  refresh(save: string): void {
    this.send({ type: 'refresh', save });
  }
  async takeSave(): Promise<{ save: string; stats: DimensionStats } | null> {
    const reply = await this.ask<Extract<FromWorker, { type: 'saved' }>>({ type: 'save', ask: ++asks });
    return reply ? { save: reply.save, stats: reply.stats } : null;
  }
  stop(): void {
    this.worker.terminate();
  }
}

// run by the main window itself: when threads aren't available, and while you're looking into a dimension
class HereBackend implements Backend {
  readonly kind = 'here';
  dimension: Dimension;
  paused: boolean;

  constructor(save: string, options: DimensionOptions, speed: Speed, paused: boolean, stats?: DimensionStats) {
    this.dimension = new Dimension(save, options, stats);
    this.dimension.setSpeed(speed);
    this.paused = paused;
  }
  get stats(): DimensionStats {
    return this.dimension.snapshot();
  }
  run(dt: number, budgetMs: number): void {
    if (this.paused) {
      this.dimension.stats.speed = 0;
      return;
    }
    this.dimension.run(dt, budgetMs);
  }
  setSpeed(speed: Speed): void {
    this.dimension.setSpeed(speed);
  }
  setPaused(paused: boolean): void {
    this.paused = paused;
  }
  async pull(): Promise<{ knowledge: KnowledgeByUid; uids: string[] }> {
    return { knowledge: this.dimension.knowledge(), uids: this.dimension.uids() };
  }
  push(shared: KnowledgeByUid): void {
    this.dimension.learn(shared);
  }
  refresh(save: string): void {
    this.dimension.refresh(save);
  }
  async takeSave(): Promise<{ save: string; stats: DimensionStats }> {
    return { save: this.dimension.world.save(), stats: this.dimension.snapshot() };
  }
  stop(): void {
    this.dimension.dispose();
  }
}

export interface DimensionInfo {
  id: number;
  name: string;
  speed: Speed;
  paused: boolean;
  backend: Backend;
  made: number; // performance.now() when it was made
  learned: number; // how much it has added to the shared brain, all added up
  learnedLately: number; // and at the last sync
  options: DimensionOptions;
}

export interface Totals {
  dimensions: number;
  threads: number;
  speed: number; // the speed of every dimension added up
  lifePerSecond: number; // seconds of life lived by every ghost, every real second
  ticks: number;
  decisions: number;
  ate: number;
  deaths: number;
  gaveUp: number;
  syncs: number;
  lastSyncMs: number;
  learningPerMinute: number; // how much the shared brain changed in the last minute
  cores: number;
  ghosts: number;
}

export interface HistoryPoint {
  at: number; // seconds since the page opened
  speed: number;
  learning: number;
}

export interface BenchResult {
  count: number;
  speed: number; // every dimension's speed added up, at Max
  each: number;
}

export class Dimensions {
  list: DimensionInfo[] = [];
  syncSeconds = 5;
  refreshMinutes = 0; // 0 for never
  scatter = true;
  revive = true;
  threads = typeof Worker !== 'undefined';
  history: HistoryPoint[] = [];
  syncs = 0;
  lastSyncMs = 0;
  onChange: () => void = () => {};
  onMessage: (text: string) => void = () => {};
  viewing: number | null = null;
  benchmarking = false;
  private bases: Record<string, Knowledge> = {};
  private nextId = 1;
  private sinceSync = 0;
  private sinceRefresh = 0;
  private sinceHistory = 0;
  private syncing = false;
  private changes: { at: number; amount: number }[] = [];
  private mainUids = '';

  private getMain: () => World;

  constructor(getMain: () => World) {
    this.getMain = getMain;
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Record<string, unknown>;
      if (typeof saved.syncSeconds === 'number') this.syncSeconds = Math.max(1, Math.min(120, saved.syncSeconds));
      if (typeof saved.refreshMinutes === 'number') this.refreshMinutes = Math.max(0, Math.min(120, saved.refreshMinutes));
      if (typeof saved.scatter === 'boolean') this.scatter = saved.scatter;
      if (typeof saved.revive === 'boolean') this.revive = saved.revive;
    } catch {
      // the usual settings, then
    }
  }

  // how you like them set up stays, whichever world you're in
  saveSettings(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ syncSeconds: this.syncSeconds, refreshMinutes: this.refreshMinutes, scatter: this.scatter, revive: this.revive }));
    } catch {
      // they're just the usual ones next time
    }
  }

  get count(): number {
    return this.list.length;
  }

  private makeBackend(save: string, options: DimensionOptions, speed: Speed, paused: boolean, stats?: DimensionStats, here = false): Backend {
    if (this.threads && !here) {
      try {
        return new ThreadBackend(save, options, speed, paused, stats);
      } catch (err) {
        console.warn('Threads unavailable, running dimensions in the window instead', err);
        this.threads = false;
      }
    }
    return new HereBackend(save, options, speed, paused, stats);
  }

  // new dimensions, copies of the world as it is now, with the shared brain as it is now
  async add(count: number, speed: Speed): Promise<number> {
    const room = MOST_DIMENSIONS - this.list.length;
    const making = Math.max(0, Math.min(room, count));
    if (!making) return 0;
    // everyone gets in step first, so the new ones start from exactly what the shared brain knows
    await this.sync();
    const main = this.getMain();
    main.finishRespawns();
    const save = main.save();
    this.resetBases(main);
    for (let i = 0; i < making; i++) {
      const id = this.nextId++;
      const options: DimensionOptions = { seed: (Math.random() * 2 ** 32) >>> 0, scatter: this.scatter, revive: this.revive };
      this.list.push({ id, name: `Dimension ${id}`, speed, paused: false, backend: this.makeBackend(save, options, speed, false), made: performance.now(), learned: 0, learnedLately: 0, options });
    }
    this.onChange();
    return making;
  }

  remove(id: number): void {
    const i = this.list.findIndex((d) => d.id === id);
    if (i < 0) return;
    this.list[i].backend.stop();
    this.list.splice(i, 1);
    if (this.viewing === id) this.viewing = null;
    this.onChange();
  }

  clear(): void {
    for (const d of this.list) d.backend.stop();
    this.list = [];
    this.viewing = null;
    this.bases = {};
    this.changes = [];
    this.onChange();
  }

  get(id: number): DimensionInfo | undefined {
    return this.list.find((d) => d.id === id);
  }

  setSpeed(id: number | 'all', speed: Speed): void {
    for (const d of this.list) {
      if (id !== 'all' && d.id !== id) continue;
      d.speed = speed;
      d.backend.setSpeed(speed);
    }
    this.onChange();
  }

  setPaused(id: number | 'all', paused: boolean): void {
    for (const d of this.list) {
      if (id !== 'all' && d.id !== id) continue;
      d.paused = paused;
      d.backend.setPaused(paused);
    }
    this.onChange();
  }

  rename(id: number, name: string): void {
    const d = this.get(id);
    if (d && name.trim()) d.name = name.trim().slice(0, 30);
    this.onChange();
  }

  private resetBases(main: World): void {
    this.bases = Object.fromEntries(main.creatures.map((c) => [c.uid, knowledgeOf(c.brain, main.tick)]));
    this.mainUids = main.creatures.map((c) => c.uid).sort().join(',');
  }

  // everything every ghost learned goes into the real brains, then everyone gets a copy.
  // refreshing ones also get the room as it is now.
  async sync(refreshAll = false): Promise<void> {
    if (this.syncing || !this.list.length) {
      if (!this.list.length) this.resetBases(this.getMain());
      return;
    }
    this.syncing = true;
    const started = performance.now();
    try {
      const dims = [...this.list];
      const pulled = await Promise.all(dims.map((d) => d.backend.pull()));
      const main = this.getMain();
      const uidsNow = main.creatures.map((c) => c.uid).sort().join(',');
      // someone new hatched or left in the real world, so every dimension needs the new line-up
      const lineUpChanged = uidsNow !== this.mainUids;
      let total = 0;
      for (const c of main.creatures) {
        const base = this.bases[c.uid];
        if (!base) continue;
        const ghosts: Knowledge[] = [];
        const who: DimensionInfo[] = [];
        dims.forEach((d, i) => {
          const k = pulled[i]?.knowledge[c.uid];
          if (k) {
            ghosts.push(k);
            who.push(d);
          }
        });
        const result = mergeInto(c.brain, base, ghosts, main.tick);
        result.perGhost.forEach((amount, i) => {
          who[i].learned += amount;
          who[i].learnedLately = amount;
        });
        total += result.change;
      }
      this.changes.push({ at: performance.now(), amount: total });
      this.resetBases(main);
      const shared: KnowledgeByUid = this.bases;
      const refresh = refreshAll || lineUpChanged;
      let save: string | null = null;
      for (const d of dims) {
        if (!this.list.includes(d)) continue;
        if (refresh) {
          main.finishRespawns();
          save ??= main.save();
          d.backend.refresh(save);
        } else d.backend.push(shared);
      }
      this.syncs++;
      this.lastSyncMs = performance.now() - started;
    } finally {
      this.syncing = false;
      this.onChange();
    }
  }

  // called every frame from the main window
  update(dt: number, budgetMs: number): void {
    // the ones the window runs itself share what time there is
    const here = this.list.filter((d) => d.backend.kind === 'here');
    for (const d of here) (d.backend as HereBackend).run(dt, budgetMs / here.length);
    if (!this.list.length || this.benchmarking) return;
    this.sinceSync += dt;
    this.sinceRefresh += dt;
    this.sinceHistory += dt;
    if (this.sinceSync >= this.syncSeconds) {
      this.sinceSync = 0;
      const refresh = this.refreshMinutes > 0 && this.sinceRefresh >= this.refreshMinutes * 60;
      if (refresh) this.sinceRefresh = 0;
      void this.sync(refresh);
    }
    if (this.sinceHistory >= 2) {
      this.sinceHistory = 0;
      const t = this.totals();
      this.history.push({ at: performance.now() / 1000, speed: t.speed, learning: t.learningPerMinute });
      if (this.history.length > 150) this.history.shift();
    }
    for (const d of this.list) {
      const failed = (d.backend as ThreadBackend).failed;
      if (!failed) continue;
      d.backend.stop();
      if (d.backend.stats.ticks === 0) {
        // threads don't work here at all, so the window runs this one, and any others, itself
        console.warn('A dimension thread could not start, so dimensions run in the window instead', failed);
        this.threads = false;
        const main = this.getMain();
        main.finishRespawns();
        d.backend = new HereBackend(main.save(), d.options, d.speed, d.paused);
        this.onMessage("Dimensions can't use threads on this computer, so they share the window's time instead.");
      } else {
        this.onMessage(`${d.name} stopped: ${failed}`);
        this.remove(d.id);
      }
      break;
    }
  }

  totals(): Totals {
    const t: Totals = { dimensions: this.list.length, threads: 0, speed: 0, lifePerSecond: 0, ticks: 0, decisions: 0, ate: 0, deaths: 0, gaveUp: 0, syncs: this.syncs, lastSyncMs: this.lastSyncMs, learningPerMinute: 0, cores: navigator.hardwareConcurrency || 1, ghosts: 0 };
    for (const d of this.list) {
      const s = d.backend.stats;
      if (d.backend.kind === 'thread') t.threads++;
      t.speed += s.speed;
      t.lifePerSecond += s.speed * Math.max(1, s.creatures);
      t.ticks += s.ticks;
      t.decisions += s.decisions;
      t.ate += s.ate;
      t.deaths += s.deaths;
      t.gaveUp += s.gaveUp;
      t.ghosts += s.creatures;
    }
    const now = performance.now();
    this.changes = this.changes.filter((c) => now - c.at < 60_000);
    t.learningPerMinute = this.changes.reduce((sum, c) => sum + c.amount, 0);
    return t;
  }

  // a dimension moves into the window so you can watch it. it's handed back to a thread when you leave
  async enter(id: number): Promise<World | null> {
    const d = this.get(id);
    if (!d) return null;
    if (d.backend.kind === 'thread') {
      await this.sync();
      const taken = await d.backend.takeSave();
      if (!taken || !this.list.includes(d)) return null;
      d.backend.stop();
      d.backend = new HereBackend(taken.save, d.options, d.speed, d.paused, taken.stats);
    }
    this.viewing = id;
    this.onChange();
    return (d.backend as HereBackend).dimension.world;
  }

  // what happened in the dimension being watched since last time, for drawing
  takeViewEvents(): WorldEvent[] {
    const d = this.viewing === null ? undefined : this.get(this.viewing);
    if (!d || d.backend.kind !== 'here') return [];
    const dim = (d.backend as HereBackend).dimension;
    dim.keepEvents = true;
    return dim.kept.splice(0);
  }

  // how far through a tick the watched dimension is, so it glides smoothly
  viewCarry(): number {
    const d = this.viewing === null ? undefined : this.get(this.viewing);
    return d && d.backend.kind === 'here' ? (d.backend as HereBackend).dimension.clock.carry % 1 : 0;
  }

  async leave(): Promise<void> {
    const d = this.viewing === null ? undefined : this.get(this.viewing);
    this.viewing = null;
    if (d && d.backend.kind === 'here' && this.threads) {
      await this.sync();
      const taken = await d.backend.takeSave();
      if (taken && this.list.includes(d)) {
        d.backend.stop();
        d.backend = this.makeBackend(taken.save, d.options, d.speed, d.paused, taken.stats);
      }
    }
    this.onChange();
  }

  // tries different numbers of dimensions at Max and measures how much life each gives, on this computer
  async benchmark(counts: number[], seconds: number, progress: (text: string) => void): Promise<BenchResult[]> {
    if (this.benchmarking) return [];
    this.benchmarking = true;
    const wasPaused = this.list.map((d) => d.paused);
    this.setPaused('all', true);
    const main = this.getMain();
    main.finishRespawns();
    const save = main.save();
    const results: BenchResult[] = [];
    try {
      for (const count of counts) {
        progress(`Trying ${count} at Max...`);
        const trial = Array.from({ length: count }, (_, i) => this.makeBackend(save, { seed: 1000 + i, scatter: true, revive: true }, 'max', false));
        const runHere = trial.filter((b) => b.kind === 'here') as HereBackend[];
        const until = performance.now() + seconds * 1000;
        let samples = 0;
        let sum = 0;
        let last = performance.now();
        while (performance.now() < until) {
          const now = performance.now();
          const dt = Math.max(0.001, (now - last) / 1000);
          last = now;
          if (runHere.length) for (const b of runHere) b.run(dt, 40 / runHere.length);
          await new Promise((r) => setTimeout(r, runHere.length ? 0 : 250));
          // the first second is for starting up
          if (performance.now() > until - (seconds - 1) * 1000) {
            sum += trial.reduce((s, b) => s + b.stats.speed, 0);
            samples++;
          }
        }
        for (const b of trial) b.stop();
        const speed = samples ? sum / samples : 0;
        results.push({ count, speed, each: speed / count });
      }
    } finally {
      this.list.forEach((d, i) => this.setPaused(d.id, wasPaused[i] ?? false));
      this.benchmarking = false;
      this.onChange();
    }
    return results;
  }
}

// which setup is best from what the benchmark found: the most life per second, unless a smaller setup is nearly as good
export function bestSetup(results: BenchResult[]): BenchResult | null {
  if (!results.length) return null;
  const top = results.reduce((a, b) => (b.speed > a.speed ? b : a));
  return results.find((r) => r.speed >= top.speed * 0.92) ?? top;
}
