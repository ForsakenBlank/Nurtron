// the pieces of a game you can put on any shape: being an enemy, having health, being an item, being a chest.
// files come from other people, so anything here is checked before it's used, the same as parts.

export const ENEMY_MODES = ['chase', 'guard', 'patrol', 'wander', 'flee'] as const;
export type EnemyMode = (typeof ENEMY_MODES)[number];

// how an enemy gets about. it goes for creatures, or anything with the tag you give it
export interface Enemy {
  mode: EnemyMode;
  speed: number; // how fast it goes
  sight: number; // how far away it notices what it's after
  jump: number; // how hard it jumps over things in its way, 0 never
  flies: boolean; // goes straight there through the air
  keep: number; // stops this far away, for something that shoots rather than bites
  damage: number; // taken off a creature's Health each time it touches one
  every: number; // seconds before it can hurt the same creature again
  target: string; // 'creature', or a tag
  ledges: boolean; // turns back at an edge instead of walking off it
  width: number; // how far from home it patrols, wanders or guards
}

export const DEFAULT_ENEMY: Enemy = { mode: 'chase', speed: 90, sight: 700, jump: 380, flies: false, keep: 0, damage: 10, every: 1, target: 'creature', ledges: false, width: 300 };

// something an Ability flung. it isn't part of the physics, so it goes straight however fast it's going
export interface Bullet {
  vx: number;
  vy: number;
  damage: number;
  ability: number; // the part that fired it
  tag: string; // what it hurts
  from: number | null; // the shape it came from, which it never hurts
  until: number; // the tick it gives up
}

// how an Ability's sparks look
export const BULLET_SIZE = 7;

const MOST_HOLD = 1e9;
const MOST_KINDS = 40;

function number(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, n));
}

export function cleanEnemy(raw: unknown): Enemy | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const e = raw as Record<string, unknown>;
  const d = DEFAULT_ENEMY;
  return {
    mode: ENEMY_MODES.includes(e.mode as EnemyMode) ? (e.mode as EnemyMode) : d.mode,
    speed: number(e.speed, d.speed, 0, 2000),
    sight: number(e.sight, d.sight, 0, 20000),
    jump: number(e.jump, d.jump, 0, 2000),
    flies: e.flies === true,
    keep: number(e.keep, d.keep, 0, 5000),
    damage: number(e.damage, d.damage, -1e6, 1e6),
    every: number(e.every, d.every, 0.05, 600),
    target: typeof e.target === 'string' && e.target.trim() ? e.target.trim().slice(0, 40) : d.target,
    ledges: e.ledges === true,
    width: number(e.width, d.width, 0, 40000),
  };
}

// what a chest or a creature is carrying: names and how many of each
export function cleanHolds(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const clean: Record<string, number> = {};
  for (const [name, count] of Object.entries(raw).slice(0, MOST_KINDS)) {
    const n = Math.round(number(count, 0, 0, MOST_HOLD));
    if (name.trim() && n > 0) clean[name.trim().slice(0, 40)] = n;
  }
  return clean;
}

// "Gold x5, Sword" is five gold and a sword
export function readHolds(text: string): Record<string, number> {
  const holds: Record<string, number> = {};
  for (const piece of text.split(',').slice(0, MOST_KINDS)) {
    const match = piece.trim().match(/^(.*?)(?:\s*[x×*]\s*(\d+))?$/i);
    const name = match?.[1]?.trim().slice(0, 40);
    if (!name) continue;
    holds[name] = Math.min(MOST_HOLD, (holds[name] ?? 0) + Number(match?.[2] ?? 1));
  }
  return holds;
}

export function writeHolds(holds: Record<string, number> | undefined): string {
  return Object.entries(holds ?? {})
    .filter(([, n]) => n > 0)
    .map(([name, n]) => (n === 1 ? name : `${name} x${n}`))
    .join(', ');
}

