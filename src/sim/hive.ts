// one brain shared between a creature and its ghosts in other dimensions. each ghost learns on its own for a few
// seconds, then everything every ghost learned since last time is added to the real brain, and everyone gets a copy.
// it's how one network gets trained on lots of machines at once.
//
// learning in the brain saturates, so a link creeps towards 1 but never gets there. lessons are added up in a space
// where that doesn't happen (atanh), then squashed back, so ten ghosts that each learned a little add up to a lot,
// but nothing ever goes past what one creature could learn by itself in a very long life.
import type { Brain, Concept, Effect, Place } from './brain.ts';
import { similarity } from './senses.ts';
import type { Percept } from './senses.ts';

const SAME = 0.999; // a concept is the same one if it's about exactly the same kind of thing
const LIKE = 0.875; // close enough to count as the same, for one that two dimensions met separately
const PLACE_SAME = 120;
const EFFECT_SAME = 0.8;
const MOST_PLACES = 16;
const MOST_EFFECTS = 48;
const EDGE = 0.999;

export interface Knowledge {
  driveNames: string[];
  concepts: Concept[];
  places: Place[];
  effects: Effect[];
  decisions: number;
  tick: number; // the tick in the world it came from, so "last used" can be moved into another world's time
}

const open = (w: number): number => Math.atanh(Math.max(-EDGE, Math.min(EDGE, w)));
const shut = (u: number): number => Math.tanh(u);

export function knowledgeOf(brain: Brain, tick: number): Knowledge {
  return structuredClone({ driveNames: brain.driveNames, concepts: brain.concepts, places: brain.places, effects: brain.effects, decisions: brain.decisions, tick });
}

// gives a brain this knowledge, keeping its own memories of what just happened and its mood, which are its own
export function applyKnowledge(brain: Brain, k: Knowledge, tick: number): boolean {
  if (k.driveNames.join('\u0000') !== brain.driveNames.join('\u0000')) return false;
  const shift = tick - k.tick;
  brain.concepts = structuredClone(k.concepts).map((c) => ({ ...c, lastUsed: c.lastUsed + shift }));
  brain.places = structuredClone(k.places);
  brain.effects = structuredClone(k.effects);
  brain.decisions = k.decisions;
  // what it was in the middle of may point at concepts that have moved, so it starts fresh
  brain.traces = brain.traces.filter((t) => t.firing.every((f) => f.c < brain.concepts.length));
  return true;
}

const samePercept = (a: Percept | null, b: Percept | null): boolean => (a === null || b === null ? a === b : similarity(a, b) >= SAME);

function closestConcept(list: Concept[], percept: Percept | null, threshold: number): number {
  if (percept === null) return list[0]?.percept === null ? 0 : -1;
  let best = -1;
  let bestSim = threshold;
  for (let i = 1; i < list.length; i++) {
    const p = list[i].percept;
    if (!p) continue;
    const s = similarity(p, percept);
    if (s >= bestSim) {
      bestSim = s;
      best = i;
    }
  }
  return best;
}

export interface MergeResult {
  merged: number; // ghosts whose learning went in
  skipped: number; // ghosts that couldn't be, because the creature's body changed
  change: number; // how much the brain changed, all added up
  newConcepts: number;
  perGhost: number[]; // how much each ghost added, in the order given, for seeing who's learning most
}

// adds what each ghost learned since `base` into `main`. main has already learned its own share since base.
export function mergeInto(main: Brain, base: Knowledge, ghosts: Knowledge[], mainTick: number): MergeResult {
  const result: MergeResult = { merged: 0, skipped: 0, change: 0, newConcepts: 0, perGhost: [] };
  const key = base.driveNames.join('\u0000');
  if (main.driveNames.join('\u0000') !== key) {
    result.skipped = ghosts.length;
    result.perGhost = ghosts.map(() => 0);
    return result;
  }
  for (const ghost of ghosts) {
    if (ghost.driveNames.join('\u0000') !== key) {
      result.skipped++;
      result.perGhost.push(0);
      continue;
    }
    result.merged++;
    let change = 0;
    ghost.concepts.forEach((gc, gi) => {
      const was = gi < base.concepts.length && samePercept(gc.percept, base.concepts[gi].percept) ? base.concepts[gi] : null;
      const usedLately = gc.uses > (was?.uses ?? 0);
      if (was) {
        // a concept everyone already had: add what this ghost learned about it
        let mi = main.concepts[gi] && samePercept(main.concepts[gi].percept, was.percept) ? gi : closestConcept(main.concepts, was.percept, LIKE);
        if (mi < 0) {
          main.concepts.push(structuredClone(gc));
          mi = main.concepts.length - 1;
          result.newConcepts++;
        } else {
          const mc = main.concepts[mi];
          for (let i = 0; i < mc.w.length && i < gc.w.length; i++) {
            const d = open(gc.w[i]) - open(was.w[i]);
            if (d === 0) continue;
            const before = mc.w[i];
            mc.w[i] = shut(open(before) + d);
            change += Math.abs(mc.w[i] - before);
          }
          for (let a = 0; a < mc.tries.length; a++) mc.tries[a] = Math.max(0, mc.tries[a] + (gc.tries[a] ?? 0) - (was.tries[a] ?? 0));
          mc.uses += Math.max(0, gc.uses - was.uses);
        }
        if (usedLately) main.concepts[mi].lastUsed = mainTick;
        return;
      }
      // something this ghost met that wasn't known before
      const mi = closestConcept(main.concepts, gc.percept, LIKE);
      if (mi >= 0) {
        // the real one, or another ghost, met it too
        const mc = main.concepts[mi];
        for (let i = 0; i < mc.w.length && i < gc.w.length; i++) {
          const before = mc.w[i];
          // where they disagree, the stronger lesson wins, since neither knows what the other started from
          if (Math.abs(gc.w[i]) > Math.abs(before)) mc.w[i] = gc.w[i];
          change += Math.abs(mc.w[i] - before);
        }
        for (let a = 0; a < mc.tries.length; a++) mc.tries[a] = Math.max(mc.tries[a], gc.tries[a] ?? 0);
        mc.uses = Math.max(mc.uses, gc.uses);
        mc.lastUsed = mainTick;
        return;
      }
      const fresh = { ...structuredClone(gc), lastUsed: mainTick };
      if (main.concepts.length < main.genes.maxConcepts) main.concepts.push(fresh);
      else {
        let oldest = 1;
        for (let c = 2; c < main.concepts.length; c++) if (main.concepts[c].lastUsed < main.concepts[oldest].lastUsed) oldest = c;
        main.concepts[oldest] = fresh;
      }
      for (const v of gc.w) change += Math.abs(v);
      result.newConcepts++;
    });

    // places it came to like or dislike
    for (const gp of ghost.places) {
      const bp = base.places.find((p) => Math.hypot(p.x - gp.x, p.y - gp.y) < PLACE_SAME);
      const d = open(gp.value) - open(bp?.value ?? 0);
      if (Math.abs(d) < 1e-6) continue;
      let mp = main.places.find((p) => Math.hypot(p.x - gp.x, p.y - gp.y) < PLACE_SAME);
      if (!mp) {
        if (main.places.length >= MOST_PLACES) {
          let weakest = 0;
          for (let i = 1; i < main.places.length; i++) if (Math.abs(main.places[i].value) < Math.abs(main.places[weakest].value)) weakest = i;
          if (Math.abs(main.places[weakest].value) > Math.abs(gp.value)) continue;
          main.places.splice(weakest, 1);
        }
        mp = { x: gp.x, y: gp.y, value: 0 };
        main.places.push(mp);
      }
      const before = mp.value;
      mp.value = shut(open(before) + d);
      change += Math.abs(mp.value - before);
    }

    // what makes what happen
    for (const ge of ghost.effects) {
      const match = (e: Effect): boolean => e.action === ge.action && similarity(e.cause, ge.cause) >= EFFECT_SAME && similarity(e.effect, ge.effect) >= EFFECT_SAME;
      const be = base.effects.find(match);
      const d = open(ge.strength) - open(be?.strength ?? 0);
      if (Math.abs(d) < 1e-6) continue;
      let me = main.effects.find(match);
      if (!me) {
        if (main.effects.length >= MOST_EFFECTS) {
          let weakest = 0;
          for (let i = 1; i < main.effects.length; i++) if (main.effects[i].strength < main.effects[weakest].strength) weakest = i;
          if (main.effects[weakest].strength > ge.strength) continue;
          main.effects.splice(weakest, 1);
        }
        me = { ...structuredClone(ge), strength: 0 };
        main.effects.push(me);
      }
      const before = me.strength;
      me.strength = Math.max(0, shut(open(before) + d));
      change += Math.abs(me.strength - before);
    }
    main.decisions += Math.max(0, ghost.decisions - base.decisions);
    result.change += change;
    result.perGhost.push(change);
  }
  return result;
}
