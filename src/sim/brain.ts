// the brain. it makes two choices over and over: what to pay attention to, then what to do with it.
//
// in between sit concept neurons, recruited when it meets something new. each one links to every action
// on several channels: one per drive ("touching this helps when i'm hungry") and one direct ("touching
// this got me praised or slapped"). drive links only count as much as that drive is felt right now, so
// one lesson about food holds at every level of hunger, and a full creature loses interest by itself.
//
// learning is reward-modulated hebbian: a good or bad feeling strengthens or weakens the links that fired
// in the last few seconds. no backprop, so it can learn from a handful of experiences and be drawn on screen.
import type { Rng } from './rng.ts';
import { describe, similarity } from './senses.ts';
import type { Percept } from './senses.ts';

export const ACTIONS = ['approach', 'avoid', 'touch', 'grab', 'drop', 'push', 'rest', 'call', 'wander'] as const;
export type Action = (typeof ACTIONS)[number];

const TARGETED: ReadonlySet<Action> = new Set<Action>(['approach', 'avoid', 'touch', 'grab', 'push']);
export const needsTarget = (a: Action): boolean => TARGETED.has(a);

export interface Genes {
  learningRate: number;
  curiosity: number;
  temperature: number;
  memorySeconds: number;
  maxConcepts: number;
  // what it tends to do when nothing much is going on. these add to its habits, so 0 is what the learning bar was tuned on
  restful: number;
  chatty: number;
  roaming: number;
  handsy: number;
  pace: number; // how fast it walks, as a share of normal
}

export const defaultGenes = (): Genes => ({
  learningRate: 0.6,
  curiosity: 0.32,
  temperature: 0.065,
  memorySeconds: 2.5,
  maxConcepts: 128,
  restful: 0,
  chatty: 0,
  roaming: 0,
  handsy: 0,
  pace: 1,
});

// inborn habits: how much a baby wants to try each action on something it hasn't tried it on yet
const PLAYFUL: Record<Action, number> = {
  approach: 0.35,
  avoid: 0.05,
  touch: 1,
  grab: 0.4,
  drop: 0.35,
  push: 0.45,
  rest: 0.05,
  call: 0.25,
  wander: 0.3,
};

// what it leans towards when nothing is wrong and nothing is new, so a content creature potters about
// and sits down instead of flitting between all nine actions at random
const HABIT: Record<Action, number> = {
  approach: 0,
  avoid: -0.08,
  touch: 0,
  grab: -0.03,
  drop: 0,
  push: -0.01,
  rest: 0.04,
  call: -0.05,
  wander: 0.09,
};

const RESTLESS = 0.5; // how strongly a need it can see no answer to sends it off looking
const SLAP = 0.6; // how much a slap hurts. it should take a slap or two, not always just one
const TAUGHT = 0.22; // how much one "do this and remember it" counts. a bit less than a pet, since you did the deciding
const WORD_KNOWN = 0.15; // how strongly it has to link a word to something before it will say it
const DEATH = 1; // the worst thing there is. anything it did to cause it should only need learning once
const DEATH_NEED = 0.5; // this much in need of something when it died, and it blames that
const DEATH_REMEDY = 0.35; // how much it comes to value whatever would have helped
const CHAIN_CREDIT = 0.15; // how much of a drive's reward leaks to what it did just before the action that helped

const RECRUIT_BELOW = 0.875; // less alike than this to anything known, and it gets its own concept
const IGNORE_BELOW = 0.35; // less alike than this and a concept doesn't fire at all
const SHARPEN = 6; // how much the closest match dominates
const FEAR_SPREAD = 0.3; // a slap makes it wary of the whole thing, not just the action
const FADE_PER_DECISION = 0.0004; // connections slowly fade
const DISAPPOINT = 0.08; // how much a link weakens when it was felt but delivered nothing
const MOST_CHANNELS = 24; // room files can bring nerve sockets with them, so this can't grow forever

export interface Concept {
  percept: Percept | null; // null is the concept of itself, used for actions with no target
  w: number[]; // actions x channels. channel 0 is direct, then one per drive
  tries: number[]; // per action, how much it has already tried this
  uses: number;
  lastUsed: number;
}

export interface Firing {
  c: number;
  a: number;
}

export interface Option {
  thingId: number | null;
  percept: Percept | null;
  score: number;
  firing: Firing[];
}

export interface Decision {
  options: Option[];
  chosen: Option;
  actionScores: number[];
  action: Action;
}

// a memory of something it recently did, which is what a reward gets credited to
export interface Trace {
  action: number;
  firing: Firing[];
  needs: number[];
  start: number;
  end: number | null;
  rewarded: boolean;
}

export interface Link {
  concept: number;
  action: Action;
  channel: number;
  strength: number;
  words: string;
}

// a link that just changed, so the brain view can light it up
export interface Change {
  c: number;
  a: number;
  amount: number;
}

// how strongly a need is felt. a small need isn't felt at all, so it doesn't snack when it's nearly full.
export const urge = (need: number): number => (Math.max(0, need - 0.2) / 0.8) ** 2;

export class Brain {
  genes: Genes;
  driveNames: string[]; // one for every socket it has ever had. one that's been removed just isn't felt any more
  kinds: ('drive' | 'nerve')[];
  whens: string[]; // the words for when this one matters, like "low" for food
  channels: number;
  concepts: Concept[] = [];
  traces: Trace[] = [];
  decisions = 0;
  boredom = 0;
  mood = 0; // -1 awful to 1 great, drawn on its face
  learning = true; // tests switch this off to watch without changing anything
  last: Decision | null = null;
  changes: Change[] = [];
  private restless = 0;

  constructor(driveNames: string[], genes: Partial<Genes> = {}) {
    this.genes = { ...defaultGenes(), ...genes };
    this.driveNames = [...driveNames];
    this.kinds = driveNames.map(() => 'drive');
    this.whens = driveNames.map(() => 'low');
    this.channels = driveNames.length + 1;
    this.concepts.push(this.blankConcept(null));
  }

  private blankConcept(percept: Percept | null): Concept {
    return {
      percept,
      w: new Array(ACTIONS.length * this.channels).fill(0),
      tries: new Array(ACTIONS.length).fill(0),
      uses: 0,
      lastUsed: 0,
    };
  }

  // finds or makes the channel for a socket. links are kept by name, so taking a socket out and putting it back, or
  // undoing, doesn't lose what it learned. -1 if there's no room for any more.
  channel(name: string, kind: 'drive' | 'nerve', when: string, most = MOST_CHANNELS): number {
    let d = this.driveNames.indexOf(name);
    if (d < 0) {
      if (this.driveNames.length >= most) return -1;
      d = this.driveNames.length;
      this.driveNames.push(name);
      this.kinds.push(kind);
      this.whens.push(when);
      const old = this.channels;
      this.channels++;
      for (const concept of this.concepts) {
        const w: number[] = [];
        for (let a = 0; a < ACTIONS.length; a++) {
          for (let ch = 0; ch < old; ch++) w.push(concept.w[a * old + ch]);
          w.push(0);
        }
        concept.w = w;
      }
    }
    this.kinds[d] = kind;
    this.whens[d] = when;
    return d;
  }

  renameChannel(from: string, to: string): void {
    const d = this.driveNames.indexOf(from);
    if (d >= 0 && !this.driveNames.includes(to)) this.driveNames[d] = to;
  }

  // a nerve counts for exactly what it says. a drive isn't felt at all until it matters.
  private felt(d: number, need: number): number {
    return this.kinds[d] === 'nerve' ? need : urge(need);
  }

  // works out which concepts fire for what it's looking at, recruiting a new one if nothing fits
  fire(percept: Percept | null): Firing[] {
    if (!percept) return [{ c: 0, a: 1 }];
    const near: Firing[] = [];
    let best = 0;
    for (let c = 1; c < this.concepts.length; c++) {
      const s = similarity(this.concepts[c].percept as Percept, percept);
      if (s >= IGNORE_BELOW) near.push({ c, a: s });
      if (s > best) best = s;
    }
    if (best < RECRUIT_BELOW) near.push({ c: this.recruit(percept, near, best), a: 1 });
    let total = 0;
    for (const f of near) total += (f.a = Math.pow(f.a, SHARPEN));
    for (const f of near) f.a /= total;
    return near;
  }

  // a new concept starts out assuming it's a bit like the most similar things it knows.
  // this is why it will try other red round things once it has learned about one.
  private recruit(percept: Percept, near: Firing[], best: number): number {
    const fresh = this.blankConcept(percept);
    const inherit = best * best;
    let total = 0;
    for (const f of near) total += Math.pow(f.a, SHARPEN);
    for (const f of near) {
      const share = (Math.pow(f.a, SHARPEN) / total) * inherit;
      const from = this.concepts[f.c];
      for (let i = 0; i < fresh.w.length; i++) fresh.w[i] += from.w[i] * share;
    }
    if (this.concepts.length < this.genes.maxConcepts) {
      this.concepts.push(fresh);
      return this.concepts.length - 1;
    }
    // memory is full, so the least used thing it knows gets forgotten
    let oldest = 1;
    for (let c = 2; c < this.concepts.length; c++) {
      if (this.concepts[c].lastUsed < this.concepts[oldest].lastUsed) oldest = c;
    }
    this.concepts[oldest] = fresh;
    for (let i = near.length - 1; i >= 0; i--) if (near[i].c === oldest) near.splice(i, 1);
    return oldest;
  }

  link(c: number, action: number, channel: number): number {
    return this.concepts[c].w[action * this.channels + channel];
  }

  // what it has learned about doing this, given how it feels right now
  value(firing: Firing[], action: number, needs: number[]): number {
    let v = 0;
    for (const f of firing) {
      let links = this.link(f.c, action, 0);
      for (let d = 0; d < needs.length; d++) links += this.felt(d, needs[d]) * this.link(f.c, action, d + 1);
      v += f.a * links;
    }
    return v;
  }

  // how much it just wants to find out what happens
  wonder(firing: Firing[], action: number): number {
    let v = 0;
    for (const f of firing) v += (f.a * this.genes.curiosity * PLAYFUL[ACTIONS[action]]) / (1 + this.concepts[f.c].tries[action]);
    return v;
  }

  allowed(action: Action, percept: Percept | null, holding: boolean): boolean {
    if (needsTarget(action) !== (percept !== null)) return false;
    if (action === 'grab' && holding) return false;
    if (action === 'drop' && !holding) return false;
    return true;
  }

  private actionScore(a: number, firing: Firing[], needs: number[], tiredness: number): number {
    let score = this.value(firing, a, needs) + this.wonder(firing, a) + HABIT[ACTIONS[a]] + this.leaning(ACTIONS[a]);
    if (ACTIONS[a] === 'rest') score += 0.6 * tiredness * tiredness;
    if (ACTIONS[a] === 'wander') score += this.restless;
    return score;
  }

  // what its genes make it lean towards
  private leaning(action: Action): number {
    const g = this.genes;
    if (action === 'rest') return g.restful;
    if (action === 'call') return g.chatty;
    if (action === 'wander') return g.roaming;
    if (action === 'grab' || action === 'push') return g.handsy;
    return 0;
  }

  private softmax(scores: number[], rng: Rng): number {
    const temperature = this.genes.temperature * (1 + this.boredom);
    let top = -Infinity;
    for (const s of scores) if (s > top) top = s;
    let total = 0;
    const weights = scores.map((s) => {
      const w = s === -Infinity ? 0 : Math.exp((s - top) / temperature);
      total += w;
      return w;
    });
    let roll = rng.next() * total;
    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i];
      if (roll <= 0 && weights[i] > 0) return i;
    }
    return scores.findIndex((s) => s === top);
  }

  // things are { id, percept, distance from 0 to 1 }. tiredness is the need of whichever drive is "rest"
  decide(
    things: { id: number; percept: Percept; distance: number }[],
    needs: number[],
    tiredness: number,
    holding: boolean,
    tick: number,
    rng: Rng,
  ): Decision {
    const options: Option[] = [{ thingId: null, percept: null, score: 0, firing: this.fire(null) }];
    for (const t of things) options.push({ thingId: t.id, percept: t.percept, score: -0.03 * t.distance, firing: this.fire(t.percept) });

    // an inborn restlessness: when it needs something and nothing in sight looks like it would help,
    // or is even worth trying, it goes looking
    let hope = 0;
    for (const o of options) {
      if (!o.percept) continue;
      for (let a = 0; a < ACTIONS.length; a++) {
        if (this.allowed(ACTIONS[a], o.percept, holding)) hope = Math.max(hope, this.value(o.firing, a, needs) + this.wonder(o.firing, a));
      }
    }
    let worst = 0;
    for (let d = 0; d < needs.length; d++) if (this.kinds[d] === 'drive') worst = Math.max(worst, needs[d]);
    this.restless = RESTLESS * Math.max(0, urge(worst) - hope);

    for (const o of options) {
      let best = -Infinity;
      for (let a = 0; a < ACTIONS.length; a++) {
        if (!this.allowed(ACTIONS[a], o.percept, holding)) continue;
        best = Math.max(best, this.actionScore(a, o.firing, needs, tiredness));
      }
      o.score += best;
    }
    const chosen = options[this.softmax(options.map((o) => o.score), rng)];

    const actionScores = ACTIONS.map((name, a) =>
      this.allowed(name, chosen.percept, holding) ? this.actionScore(a, chosen.firing, needs, tiredness) : -Infinity,
    );
    const action = this.softmax(actionScores, rng);

    for (const f of chosen.firing) {
      const concept = this.concepts[f.c];
      concept.uses += f.a;
      concept.lastUsed = tick;
    }
    this.traces.push({ action, firing: chosen.firing, needs: [...needs], start: tick, end: null, rewarded: false });
    if (this.traces.length > 8) this.traces.shift();

    this.decisions++;
    if (this.learning) {
      for (const c of this.concepts) for (let i = 0; i < c.w.length; i++) c.w[i] *= 1 - FADE_PER_DECISION;
    }
    this.last = { options, chosen, actionScores, action: ACTIONS[action] };
    return this.last;
  }

  // told what to do instead of deciding. it's remembered the same way as anything it chose, so whatever comes of it teaches as usual
  obey(thingId: number | null, percept: Percept | null, action: Action, needs: number[], tick: number): Decision {
    const firing = this.fire(percept);
    const chosen: Option = { thingId, percept, score: 0, firing };
    const a = ACTIONS.indexOf(action);
    for (const f of firing) {
      const concept = this.concepts[f.c];
      concept.uses += f.a;
      concept.lastUsed = tick;
    }
    this.traces.push({ action: a, firing, needs: [...needs], start: tick, end: null, rewarded: false });
    if (this.traces.length > 8) this.traces.shift();
    this.decisions++;
    const actionScores = ACTIONS.map((_, i) => (i === a ? 1 : -Infinity));
    this.last = { options: [chosen], chosen, actionScores, action };
    return this.last;
  }

  // being made to learn what it was just told to do. half of it is liking it for its own sake, and half is
  // tied to how it feels right now, so it also comes back to this when it feels that way again.
  teach(): void {
    const trace = this.traces[this.traces.length - 1];
    if (!trace || !this.learning) return;
    trace.rewarded = true;
    let felt = 0;
    for (const n of trace.needs) felt += n * n;
    for (const f of trace.firing) {
      this.strengthen(f.c, trace.action, 0, (felt > 0 ? TAUGHT / 2 : TAUGHT) * f.a);
      if (felt === 0) continue;
      for (let d = 0; d < trace.needs.length; d++) {
        const share = (trace.needs[d] * trace.needs[d]) / felt;
        if (share > 0) this.strengthen(f.c, trace.action, d + 1, (TAUGHT / 2) * share * f.a);
      }
    }
  }

  // the word it most connects with what it did just before this, if it knows one. a word is a channel with a name in quotes.
  wordFor(): string | null {
    const before = this.traces[this.traces.length - 2];
    if (!before) return null;
    let best: string | null = null;
    let strongest = WORD_KNOWN;
    for (let d = 0; d < this.driveNames.length; d++) {
      const name = this.driveNames[d];
      if (!name.startsWith('"')) continue;
      for (const f of before.firing) {
        const strength = this.link(f.c, before.action, d + 1) * f.a;
        if (strength > strongest) {
          strongest = strength;
          best = name.slice(1, -1);
        }
      }
    }
    return best;
  }

  // how much a reward counts for a memory. the action it's in the middle of counts fully once it has
  // been going for a moment. a praise landing just after a new action started belongs to the one before.
  private credit(trace: Trace, tick: number, ticksPerSecond: number): number {
    const tau = this.genes.memorySeconds * ticksPerSecond;
    if (trace.end === null) return Math.min(1, (tick - trace.start) / (0.6 * ticksPerSecond));
    return Math.exp(-(tick - trace.end) / tau);
  }

  private strengthen(c: number, action: number, channel: number, amount: number): void {
    const concept = this.concepts[c];
    const i = action * this.channels + channel;
    const w = concept.w[i];
    concept.w[i] = w + this.genes.learningRate * amount * (amount > 0 ? 1 - w : 1 + w);
    if (this.changes.length < 64) this.changes.push({ c, a: action, amount });
  }

  // a drive just changed. amount is positive when that felt good
  rewardDrive(drive: number, amount: number, tick: number, ticksPerSecond: number): void {
    this.feel(amount);
    if (!this.learning) return;
    const newest = this.traces[this.traces.length - 1];
    for (const trace of this.traces) {
      // this is called just as the action that caused it ends, so that one is certain and gets it all.
      // earlier actions helped set it up at most, and giving them more breeds superstitions.
      const credit = trace === newest ? 1 : this.credit(trace, tick, ticksPerSecond) * CHAIN_CREDIT;
      if (credit < 0.02) continue;
      if (amount > 0 && trace === newest) trace.rewarded = true;
      for (const f of trace.firing) this.strengthen(f.c, trace.action, drive + 1, amount * f.a * credit);
    }
  }

  // praise is remembered along with what it felt at the time. praised while hungry, it learns
  // "this is good when hungry". praised with no needs at all, it just learns "this is good".
  pet(tick: number, ticksPerSecond: number): void {
    this.feel(0.8);
    if (!this.learning) return;
    for (const trace of this.traces) {
      const credit = this.credit(trace, tick, ticksPerSecond);
      if (credit < 0.02) continue;
      trace.rewarded = true;
      const amount = 0.8 * credit;
      let felt = 0;
      for (const n of trace.needs) felt += n * n;
      const direct = Math.max(0, 1 - felt * 8);
      for (const f of trace.firing) {
        if (direct > 0) this.strengthen(f.c, trace.action, 0, amount * direct * f.a);
        for (let d = 0; d < trace.needs.length && felt > 0; d++) {
          const share = ((1 - direct) * trace.needs[d] * trace.needs[d]) / felt;
          if (share > 0) this.strengthen(f.c, trace.action, d + 1, amount * share * f.a);
        }
      }
    }
  }

  // pain doesn't depend on how it feels: a slap is bad whether it's hungry or not
  slap(tick: number, ticksPerSecond: number): void {
    this.feel(-1);
    this.boredom *= 0.5;
    if (!this.learning) return;
    for (const trace of this.traces) {
      const credit = this.credit(trace, tick, ticksPerSecond) * SLAP;
      if (credit < 0.02) continue;
      for (const f of trace.firing) {
        this.strengthen(f.c, trace.action, 0, -credit * f.a);
        if (this.concepts[f.c].percept === null) continue;
        for (let a = 0; a < ACTIONS.length; a++) {
          if (a !== trace.action) this.strengthen(f.c, a, 0, -credit * f.a * FEAR_SPREAD);
        }
      }
    }
  }

  // working out what went wrong, as well as it can. if something it did set it off, it blames that. if it died badly in
  // need of something, what it was doing instead wasn't helping, and whatever it knows would help matters much more now.
  // otherwise, like dying of old age, it has nothing to blame, and learning something anyway would only be a superstition.
  died(caused: boolean, needs: number[], tick: number, ticksPerSecond: number): string {
    this.mood = -1;
    const newest = this.traces[this.traces.length - 1];
    const did = (trace: Trace): string => {
      const percept = trace.firing.length ? this.concepts[trace.firing[0].c].percept : null;
      return percept ? `${ACTIONS[trace.action]} the ${describe(percept)}` : ACTIONS[trace.action];
    };
    if (caused && newest) {
      if (this.learning) {
        for (const trace of this.traces) {
          const credit = trace === newest ? 1 : this.credit(trace, tick, ticksPerSecond) * DEATH;
          if (credit < 0.02) continue;
          for (const f of trace.firing) {
            this.strengthen(f.c, trace.action, 0, -credit * DEATH * f.a);
            if (this.concepts[f.c].percept === null) continue;
            for (let a = 0; a < ACTIONS.length; a++) if (a !== trace.action) this.strengthen(f.c, a, 0, -credit * DEATH * f.a * FEAR_SPREAD);
          }
        }
      }
      return `It thinks it died because it tried to ${did(newest)}.`;
    }
    let worst = -1;
    for (let d = 0; d < needs.length; d++) if (this.kinds[d] === 'drive' && needs[d] >= DEATH_NEED && (worst < 0 || needs[d] > needs[worst])) worst = d;
    if (worst < 0) return "It doesn't know why it died. Nothing it did seemed to cause it, and nothing was wrong.";
    if (this.learning) {
      for (const concept of this.concepts) {
        for (let a = 0; a < ACTIONS.length; a++) {
          const i = a * this.channels + worst + 1;
          if (concept.w[i] > 0) concept.w[i] += DEATH_REMEDY * (1 - concept.w[i]);
        }
      }
      for (const trace of this.traces) {
        const credit = trace === newest ? 1 : this.credit(trace, tick, ticksPerSecond);
        if (credit < 0.02 || trace.rewarded) continue;
        for (const f of trace.firing) this.strengthen(f.c, trace.action, worst + 1, -0.3 * credit * f.a);
      }
    }
    const was = newest ? ` It was trying to ${did(newest)} at the time, which wasn't helping.` : '';
    return `It died needing ${this.driveNames[worst]}, so ${this.driveNames[worst]} matters much more to it now.${was}`;
  }

  private feel(amount: number): void {
    this.mood = Math.max(-1, Math.min(1, this.mood + amount * 0.6));
    if (amount > 0) this.boredom *= 0.3;
  }

  // called when an action finishes. if it was hoping this would help a need and nothing came of it,
  // that link weakens, and either way the action is a little less of a mystery now. if it never got there
  // that says nothing about the thing itself, so it mustn't lose faith in food just because a rock was in the way.
  finishAction(tick: number, completed = true): void {
    const trace = this.traces[this.traces.length - 1];
    if (!trace || trace.end !== null) return;
    trace.end = tick;
    if (!this.learning || !completed) return;
    for (const f of trace.firing) {
      const concept = this.concepts[f.c];
      concept.tries[trace.action] += f.a;
      if (trace.rewarded) continue;
      for (let d = 0; d < trace.needs.length; d++) {
        const i = trace.action * this.channels + d + 1;
        if (concept.w[i] > 0) concept.w[i] -= DISAPPOINT * f.a * trace.needs[d] * concept.w[i];
      }
    }
  }

  drift(seconds: number): void {
    this.mood *= Math.exp(-seconds / 12);
    this.boredom = Math.min(1, this.boredom + seconds * 0.008);
  }

  // why it chose what it did, in plain words
  reason(decision: Decision, needs: number[]): 'learned' | 'curious' | 'habit' {
    const a = ACTIONS.indexOf(decision.action);
    const learned = this.value(decision.chosen.firing, a, needs);
    const curious = this.wonder(decision.chosen.firing, a);
    if (learned > 0.1 && learned >= curious) return 'learned';
    return curious > 0.03 ? 'curious' : 'habit';
  }

  // the concept that best fits something, without recruiting one. for hovering over things.
  closest(percept: Percept): number | null {
    let best: number | null = null;
    let bestSim = IGNORE_BELOW;
    for (let c = 1; c < this.concepts.length; c++) {
      const s = similarity(this.concepts[c].percept as Percept, percept);
      if (s >= bestSim) {
        bestSim = s;
        best = c;
      }
    }
    return best;
  }

  linksOf(concept: number, threshold = 0.2): Link[] {
    return this.strongestLinks(this.concepts.length * ACTIONS.length * this.channels, threshold).filter((l) => l.concept === concept);
  }

  // the strongest things it has learned, in plain words, for the brain view
  strongestLinks(count: number, threshold = 0.25): Link[] {
    const links: Link[] = [];
    this.concepts.forEach((concept, c) => {
      for (let a = 0; a < ACTIONS.length; a++) {
        for (let ch = 0; ch < this.channels; ch++) {
          const strength = concept.w[a * this.channels + ch];
          if (Math.abs(strength) < threshold) continue;
          const what = ACTIONS[a] + (concept.percept ? ` ${describe(concept.percept)}` : '');
          const name = this.driveNames[ch - 1];
          const low = name?.startsWith('"') ? `when I hear ${name}` : `when ${name} is ${this.whens[ch - 1]}`;
          const why = ch === 0 ? (strength > 0 ? 'I like doing this' : 'bad, it went badly for me') : strength > 0 ? `good ${low}` : `bad ${low}`;
          links.push({ concept: c, action: ACTIONS[a], channel: ch, strength, words: `${what}: ${why}` });
        }
      }
    });
    return links.sort((x, y) => Math.abs(y.strength) - Math.abs(x.strength)).slice(0, count);
  }

  save() {
    return {
      genes: this.genes,
      driveNames: this.driveNames,
      kinds: this.kinds,
      whens: this.whens,
      concepts: this.concepts,
      traces: this.traces,
      decisions: this.decisions,
      boredom: this.boredom,
      mood: this.mood,
    };
  }

  static load(saved: ReturnType<Brain['save']>): Brain {
    const brain = new Brain(saved.driveNames, saved.genes);
    // these arrived with drive sockets, so an older save won't have them
    if (saved.kinds) brain.kinds = saved.kinds;
    if (saved.whens) brain.whens = saved.whens;
    brain.concepts = saved.concepts;
    brain.traces = saved.traces;
    brain.decisions = saved.decisions;
    brain.boredom = saved.boredom;
    brain.mood = saved.mood;
    return brain;
  }
}
