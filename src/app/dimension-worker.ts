// one dimension, running in a thread of its own so it uses another core instead of slowing the window down.
// it only ever gets data from the main window: a saved world, a speed, and the shared brain.
import { cleanSpeed } from '../sim/clock.ts';
import { Dimension } from '../sim/dimension.ts';
import type { DimensionOptions, DimensionStats, KnowledgeByUid } from '../sim/dimension.ts';
import { initPhysics } from '../sim/world.ts';

export type ToWorker =
  | { type: 'start'; save: string; options: DimensionOptions; speed: number | 'max'; paused: boolean; stats?: DimensionStats }
  | { type: 'speed'; speed: number | 'max' }
  | { type: 'pause'; paused: boolean }
  | { type: 'pull'; ask: number }
  | { type: 'push'; shared: KnowledgeByUid }
  | { type: 'refresh'; save: string }
  | { type: 'save'; ask: number };

export type FromWorker =
  | { type: 'ready' }
  | { type: 'stats'; stats: DimensionStats }
  | { type: 'knowledge'; ask: number; knowledge: KnowledgeByUid; uids: string[] }
  | { type: 'learned'; ok: boolean }
  | { type: 'saved'; ask: number; save: string; stats: DimensionStats }
  | { type: 'error'; message: string };

const BUDGET_MS = 30; // a slice of work before it checks its messages again
const STATS_EVERY = 400;

const scope = self as unknown as { postMessage(m: FromWorker): void; onmessage: ((e: MessageEvent<ToWorker>) => void) | null };
let dimension: Dimension | null = null;
let paused = false;
let waiting = false; // sent its learning off, so it holds still until the shared brain comes back
let waitingSince = 0;
let last = performance.now();
let lastStats = 0;
let looping = false;
const ready = initPhysics();

// a way to carry on straight away, without setTimeout's minimum wait
const channel = new MessageChannel();
channel.port1.onmessage = () => loop();
const soon = (): void => channel.port2.postMessage(0);

function loop(): void {
  looping = false;
  const now = performance.now();
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (dimension) {
    // the main window has gone quiet, so it doesn't wait for ever
    if (waiting && now - waitingSince > 3000) waiting = false;
    if (!paused && !waiting) {
      try {
        dimension.run(dt, BUDGET_MS);
      } catch (err) {
        scope.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
        paused = true;
      }
    } else dimension.stats.speed = 0;
    if (now - lastStats > STATS_EVERY) {
      lastStats = now;
      scope.postMessage({ type: 'stats', stats: dimension.snapshot() });
    }
  }
  schedule();
}

function schedule(): void {
  if (looping) return;
  looping = true;
  // flat out, it goes again straight away. otherwise it rests a little between slices
  if (dimension && !paused && !waiting && dimension.clock.speed === 'max') soon();
  else setTimeout(loop, 8);
}

scope.onmessage = async (e) => {
  const m = e.data;
  await ready;
  try {
    if (m.type === 'start') {
      dimension?.dispose();
      dimension = new Dimension(m.save, m.options, m.stats);
      dimension.setSpeed(cleanSpeed(m.speed));
      paused = m.paused;
      last = performance.now();
      scope.postMessage({ type: 'ready' });
      schedule();
    } else if (!dimension) {
      return;
    } else if (m.type === 'speed') dimension.setSpeed(cleanSpeed(m.speed));
    else if (m.type === 'pause') paused = m.paused;
    else if (m.type === 'pull') {
      waiting = true;
      waitingSince = performance.now();
      scope.postMessage({ type: 'knowledge', ask: m.ask, knowledge: dimension.knowledge(), uids: dimension.uids() });
    } else if (m.type === 'push') {
      const ok = dimension.learn(m.shared);
      waiting = false;
      scope.postMessage({ type: 'learned', ok });
    } else if (m.type === 'refresh') {
      dimension.refresh(m.save);
      waiting = false;
    } else if (m.type === 'save') {
      scope.postMessage({ type: 'saved', ask: m.ask, save: dimension.world.save(), stats: dimension.snapshot() });
    }
  } catch (err) {
    scope.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
