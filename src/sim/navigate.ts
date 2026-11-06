// how a creature works out how to get up to something it can't reach on foot. everything solid that can be stood on is a
// ledge, and it hops from ledge to ledge. this is a skill, like walking: which thing it wants is still up to its brain.
import { closestPoint } from './shapes.ts';
import type { Form } from './shapes.ts';

export const JUMP_RISE = 150; // how far up it can jump
export const JUMP_SPAN = 240; // how wide a gap it can jump
export const LEAP_SPEED = 260; // how fast it goes through the air
const STANDING = 30; // the middle of its body is this far above its feet
const REACH = 54;
const SIDE = 36; // how far out from a ledge above it has to start, so it doesn't bang its head
const MOST_LEDGES = 300;
const BODY_WIDTH = 24;
const BODY_HEIGHT = 60;

export interface Ledge {
  id: number; // -1 is the floor
  left: number;
  right: number;
  top: number;
  bottom: number;
  climbable: boolean;
  solid: boolean;
  fixed: boolean; // it can't be shoved out of the way, so walking into it gets nowhere
  zone: boolean; // somewhere with no gravity, where it can go anywhere once it's in
}

export type RouteStep =
  | { kind: 'walk'; x: number }
  | { kind: 'jump'; launchX: number; landX: number; top: number; rise: number; gap: number; left: number; right: number }
  | { kind: 'climb'; ledge: Ledge };

// the first step of the shortest way from one ledge to any of the others
export function firstStep(ledges: Ledge[], from: Ledge, fromX: number, goals: Set<number>): RouteStep | null {
  const seen = new Set<number>([from.id]);
  let frontier: { ledge: Ledge; x: number; first: RouteStep | null }[] = [{ ledge: from, x: fromX, first: null }];
  while (frontier.length > 0) {
    const next: typeof frontier = [];
    for (const { ledge, x, first } of frontier) {
      for (const other of ledges) {
        if (seen.has(other.id)) continue;
        const step = stepBetween(ledge, other, x);
        if (!step) continue;
        // it has to be able to walk along this ledge to where that starts from
        if (!clearWalk(ledges, ledge, x, step.kind === 'jump' ? step.launchX : step.kind === 'walk' ? Math.max(ledge.left, Math.min(ledge.right, step.x)) : x)) continue;
        if (goals.has(other.id)) return first ?? step;
        seen.add(other.id);
        const landed = step.kind === 'jump' ? step.landX : step.kind === 'walk' ? step.x : (other.left + other.right) / 2;
        next.push({ ledge: other, x: landed, first: first ?? step });
      }
    }
    frontier = next;
  }
  return null;
}

// nothing solid at head height in between, or it would just push against it for ever
function clearWalk(ledges: Ledge[], on: Ledge, fromX: number, toX: number): boolean {
  const left = Math.min(fromX, toX) - BODY_WIDTH;
  const right = Math.max(fromX, toX) + BODY_WIDTH;
  for (const other of ledges) {
    if (other.id === on.id || !other.solid || !other.fixed || other.zone) continue;
    if (other.right < left || other.left > right) continue;
    if (other.bottom > on.top - BODY_HEIGHT && other.top < on.top - 8) return false;
  }
  return true;
}

function stepBetween(a: Ledge, b: Ledge, fromX: number): RouteStep | null {
  const gap = Math.max(0, b.left - a.right, a.left - b.right);
  const rise = a.top - b.top;
  if (b.climbable && gap <= 30 && rise > 0) return { kind: 'climb', ledge: b };
  // down is easy: it just walks off the edge. the same height and touching is the same as walking.
  if (rise <= 2 && (rise < -2 || gap <= 8)) return { kind: 'walk', x: b.left > a.right ? b.left + 10 : b.right < a.left ? b.right - 10 : (b.left + b.right) / 2 };
  if (rise > JUMP_RISE || gap > JUMP_SPAN) return null;
  const midB = (b.left + b.right) / 2;
  if (gap > 0) {
    const rightwards = b.left > a.right;
    return { kind: 'jump', launchX: rightwards ? a.right - 6 : a.left + 6, landX: rightwards ? Math.min(midB, b.left + 34) : Math.max(midB, b.right - 34), top: b.top, rise, gap, left: b.left, right: b.right };
  }
  // a zone has no solid sides, so it can go straight up into one
  if (b.zone) {
    const x = Math.max(a.left, b.left) + Math.min(a.right - a.left, b.right - b.left) / 2;
    return { kind: 'jump', launchX: x, landX: x, top: b.top, rise, gap: 0, left: b.left, right: b.left };
  }
  // right overhead, so it has to go up beside it and then across
  const fitsLeft = b.left - SIDE >= a.left;
  const fitsRight = b.right + SIDE <= a.right;
  if (!fitsLeft && !fitsRight) return null;
  // whichever side is nearer, since the other could have this very ledge in the way
  const onLeft = fitsLeft && (!fitsRight || Math.abs(fromX - (b.left - SIDE)) <= Math.abs(fromX - (b.right + SIDE)));
  return { kind: 'jump', launchX: onLeft ? b.left - SIDE : b.right + SIDE, landX: onLeft ? Math.min(midB, b.left + 34) : Math.max(midB, b.right - 34), top: b.top, rise, gap: SIDE, left: b.left, right: b.right };
}

type Shape = { form: Form; hw: number; hh: number; x: number; y: number; angle: number };

// null means walking there is fine, or there's no way, so it should carry on as it would have
export function planRoute(ledges: Ledge[], feetX: number, feetY: number, target: Shape, insideZone: (ledge: Ledge) => boolean): RouteStep | null {
  const standing = ledges.filter((l) => !l.zone && feetX >= l.left - 8 && feetX <= l.right + 8 && Math.abs(feetY - l.top) < 12);
  if (standing.length === 0) return null;
  const from = standing.reduce((best, l) => (l.top < best.top ? l : best));
  const reachable = (l: Ledge): boolean => {
    if (l.zone) return insideZone(l);
    const x = Math.max(l.left, Math.min(l.right, target.x));
    const near = closestPoint(target, x, l.top - STANDING);
    return Math.hypot(near.x - x, near.y - (l.top - STANDING)) <= REACH;
  };
  if (reachable(from)) {
    // it could stand here and reach it, if there's nothing fixed in the way. if there is, it goes up and over
    const toX = Math.max(from.left, Math.min(from.right, target.x));
    if (clearWalk(ledges, from, feetX, toX)) return null;
    const direction = Math.sign(toX - feetX);
    const blockers = ledges
      .filter((l) => l.id !== from.id && l.solid && l.fixed && !l.zone && !clearWalk([l], from, feetX, toX))
      .sort((a, b) => direction * (a.left - b.left));
    const over = blockers[0] && stepBetween(from, blockers[0], feetX);
    return over?.kind === 'jump' || over?.kind === 'climb' ? over : null;
  }
  const goals = new Set(ledges.filter(reachable).map((l) => l.id));
  if (goals.size === 0) return null;
  const step = firstStep(ledges.slice(0, MOST_LEDGES), from, feetX, goals);
  return step?.kind === 'walk' ? null : step;
}
