// the live picture of its brain: what it feels and sees, the concepts firing, and the links to its actions.
// thick green links are things it has learned help right now, red ones are things it has learned to avoid.
// faint dashed ones are things it knows but doesn't care about right now, like food when it's full.
// a link flashes the moment it learns something. hover over anything to ask about it, click a concept to keep it picked.
import { ACTIONS } from '../sim/brain.ts';
import type { Brain, Decision } from '../sim/brain.ts';
import type { Drive } from '../sim/world.ts';
import { describe } from '../sim/senses.ts';

const COLOUR = {
  node: '#2b3044',
  nodeLine: '#3a4160',
  text: '#c9cde0',
  muted: '#7f8499',
  firing: '#ffe28a',
  good: '#6be3a1',
  bad: '#ff6b6b',
  need: '#ffb454',
  nerve: '#6fb4ff',
  chosen: '#4fd6c3',
};

const FLASH_SECONDS = 1.6;
const ROW = 27; // how much height a concept takes up

export type BrainSpot = { kind: 'concept'; c: number } | { kind: 'action'; a: number } | { kind: 'sense'; name: string };

interface Spot {
  x: number;
  y: number;
}

export class BrainView {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private decision: Decision | null = null;
  private decidedAt = 0;
  private time = 0;
  private spots = new Map<number, Spot>();
  private actionSpots = new Map<number, Spot>();
  private senseSpots = new Map<string, Spot>();
  private flashes = new Map<string, { c: number; a: number; good: boolean; age: number }>();
  pinned: number | null = null;
  hover: BrainSpot | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  }

  onDecision(decision: Decision): void {
    this.decision = decision;
    this.decidedAt = this.time;
  }

  // starting over with a new creature
  reset(): void {
    this.pinned = null;
    this.hover = null;
    this.decision = null;
    this.flashes.clear();
  }

  // what's under the mouse, so the page can explain it
  at(x: number, y: number): BrainSpot | null {
    for (const [c, spot] of this.spots) if (Math.abs(x - spot.x) < 62 && Math.abs(y - spot.y) < 13) return { kind: 'concept', c };
    for (const [a, spot] of this.actionSpots) if (Math.abs(x - spot.x) < 56 && Math.abs(y - spot.y) < 13) return { kind: 'action', a };
    for (const [name, spot] of this.senseSpots) if (Math.abs(x - spot.x) < 36 && Math.abs(y - spot.y) < 13) return { kind: 'sense', name };
    return null;
  }

  // the most it has learned about this concept, however it feels right now
  private learned(brain: Brain, c: number): number {
    let most = 0;
    for (const w of brain.concepts[c].w) most = Math.max(most, Math.abs(w));
    return most;
  }

  // what it's thinking about comes first, then what it has learned most about, so a lesson never scrolls out of view
  private shownConcepts(brain: Brain, room: number): number[] {
    const firing = new Set(this.decision?.chosen.firing.map((f) => f.c) ?? []);
    const score = (c: number): number => (c === this.pinned ? 1e4 : 0) + (firing.has(c) ? 1e3 : 0) + this.learned(brain, c) * 10 + Math.min(1, brain.concepts[c].uses * 0.02);
    const order = brain.concepts.map((_, c) => c).sort((a, b) => score(b) - score(a));
    return order.slice(0, room).sort((a, b) => a - b);
  }

  draw(brain: Brain, needs: number[], drives: Drive[], dt: number): void {
    this.time += dt;
    for (const change of brain.changes) {
      if (Math.abs(change.amount) < 0.01) continue;
      this.flashes.set(`${change.c}/${change.a}`, { c: change.c, a: change.a, good: change.amount > 0, age: 0 });
    }
    brain.changes.length = 0;
    for (const [key, flash] of this.flashes) if ((flash.age += dt) > FLASH_SECONDS) this.flashes.delete(key);
    const ratio = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(w * ratio) || this.canvas.height !== Math.round(h * ratio)) {
      this.canvas.width = Math.round(w * ratio);
      this.canvas.height = Math.round(h * ratio);
    }
    const g = this.ctx;
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.clearRect(0, 0, w, h);
    g.font = '11px ui-rounded, Nunito, "Segoe UI", system-ui, sans-serif';
    g.textBaseline = 'middle';

    const top = 24;
    const bottom = h - 8;
    const col = { senses: Math.max(52, w * 0.13), concepts: w * 0.47, actions: w - 62 };

    this.header(g, 'Feels and sees', col.senses, 10);
    this.header(g, 'Concepts', col.concepts, 10);
    this.header(g, 'Actions', col.actions, 10);

    const decision = this.decision;
    const chosen = decision?.chosen;
    const percept = chosen?.percept ?? null;
    const senses: { label: string; level: number; kind: 'need' | 'nerve' | 'sight' }[] = drives
      .filter((d) => d.wired)
      .map((d) => ({ label: d.name, level: needs[d.channel] ?? 0, kind: d.kind === 'nerve' ? 'nerve' : 'need' }));
    if (percept) {
      for (const label of [percept.shape, percept.colour, percept.size]) senses.push({ label, level: 1, kind: 'sight' });
    }

    const fanOut = <T,>(list: T[], gapMax: number): { item: T; y: number }[] => {
      const gap = Math.min(gapMax, (bottom - top) / Math.max(1, list.length));
      const start = top + ((bottom - top) - gap * (list.length - 1)) / 2;
      return list.map((item, i) => ({ item, y: start + i * gap }));
    };

    const shown = this.shownConcepts(brain, Math.max(4, Math.floor((bottom - top) / ROW)));
    const conceptSpots = fanOut(shown, 42);
    this.spots.clear();
    for (const s of conceptSpots) this.spots.set(s.item, { x: col.concepts, y: s.y });
    const actionSpots = fanOut(ACTIONS.map((_, a) => a), 30);
    const senseSpots = fanOut(senses, 34);
    this.actionSpots.clear();
    for (const a of actionSpots) this.actionSpots.set(a.item, { x: col.actions, y: a.y });
    this.senseSpots.clear();
    for (const sense of senseSpots) this.senseSpots.set(sense.item.label, { x: col.senses, y: sense.y });

    // whatever you've picked or are pointing at stands out, and everything else steps back
    const hover = this.hover;
    const focusConcept = hover?.kind === 'concept' ? hover.c : this.pinned;
    const focusAction = hover?.kind === 'action' ? hover.a : null;
    const lit = (c: number, a: number): number => {
      if (focusAction !== null) return a === focusAction ? 1 : 0.15;
      if (focusConcept !== null) return c === focusConcept ? 1 : 0.15;
      return 1;
    };

    const firing = new Map((chosen?.firing ?? []).map((f) => [f.c, f.a]));
    const chosenAction = decision ? ACTIONS.indexOf(decision.action) : -1;
    const since = this.time - this.decidedAt;

    // links from concepts to actions
    for (const s of conceptSpots) {
      for (const a of actionSpots) {
        const v = brain.value([{ c: s.item, a: 1 }], a.item, needs);
        const live = firing.has(s.item);
        if (Math.abs(v) < 0.015) {
          // it knows this, but it doesn't matter to it right now
          let known = 0;
          for (let ch = 0; ch < brain.channels; ch++) {
            const w = brain.link(s.item, a.item, ch);
            if (Math.abs(w) > Math.abs(known)) known = w;
          }
          if (Math.abs(known) < 0.12) continue;
          g.strokeStyle = known > 0 ? COLOUR.good : COLOUR.bad;
          g.globalAlpha = 0.28 * lit(s.item, a.item);
          g.lineWidth = 1;
          g.setLineDash([3, 4]);
          this.curve(g, col.concepts + 58, s.y, col.actions - 54, a.y);
          g.setLineDash([]);
          continue;
        }
        g.strokeStyle = v > 0 ? COLOUR.good : COLOUR.bad;
        g.globalAlpha = (live ? 0.9 : 0.3) * lit(s.item, a.item);
        g.lineWidth = 0.6 + Math.min(1, Math.abs(v) * 1.6) * 5;
        this.curve(g, col.concepts + 58, s.y, col.actions - 54, a.y);
      }
    }
    g.globalAlpha = 1;

    // a link that has just learned something flashes
    for (const flash of this.flashes.values()) {
      const from = this.spots.get(flash.c);
      const to = this.actionSpots.get(flash.a);
      if (!from || !to) continue;
      const left = 1 - flash.age / FLASH_SECONDS;
      g.strokeStyle = flash.good ? COLOUR.good : COLOUR.bad;
      g.globalAlpha = left * 0.55;
      g.lineWidth = 3 + left * 8;
      this.curve(g, col.concepts + 58, from.y, col.actions - 54, to.y);
      g.globalAlpha = left;
      g.lineWidth = 2;
      this.curve(g, col.concepts + 58, from.y, col.actions - 54, to.y);
    }
    g.globalAlpha = 1;

    // links from what it feels and sees to the concepts that fire
    for (const sense of senseSpots) {
      for (const s of conceptSpots) {
        const a = firing.get(s.item);
        if (!a) continue;
        const inside = sense.item.kind !== 'sight';
        if (inside && s.item !== 0 && a < 0.2) continue;
        g.strokeStyle = sense.item.kind === 'need' ? COLOUR.need : sense.item.kind === 'nerve' ? COLOUR.nerve : COLOUR.firing;
        g.globalAlpha = 0.18 + a * 0.45 * (inside ? sense.item.level : 1);
        g.lineWidth = 1 + a * 1.4;
        this.curve(g, col.senses + 34, sense.y, col.concepts - 58, s.y);
      }
    }
    g.globalAlpha = 1;

    // the pulse that runs down the wires each time it decides
    if (decision && since < 0.75) {
      const t = since / 0.75;
      for (const s of conceptSpots) {
        if (!firing.has(s.item)) continue;
        const a = actionSpots[chosenAction];
        if (t < 0.5) {
          for (const sense of senseSpots) this.pulse(g, col.senses + 34, sense.y, col.concepts - 58, s.y, t * 2);
        } else {
          this.pulse(g, col.concepts + 58, s.y, col.actions - 54, a.y, (t - 0.5) * 2);
        }
      }
    }

    // nodes: what it feels and sees
    for (const s of senseSpots) {
      const inside = s.item.kind !== 'sight';
      this.pill(g, col.senses, s.y, 34, inside ? COLOUR.node : '#3b3a2c', inside ? COLOUR.nodeLine : COLOUR.firing);
      if (inside) {
        g.fillStyle = s.item.kind === 'nerve' ? COLOUR.nerve : COLOUR.need;
        g.globalAlpha = 0.55;
        g.fillRect(col.senses - 32, s.y - 9, 64 * s.item.level, 18);
        g.globalAlpha = 1;
      }
      this.label(g, s.item.label, col.senses, s.y, COLOUR.text, 62);
    }

    // nodes: concepts
    for (const s of conceptSpots) {
      const live = firing.get(s.item);
      const concept = brain.concepts[s.item];
      const picked = s.item === this.pinned;
      this.pill(g, col.concepts, s.y, 58, live ? '#46402a' : COLOUR.node, picked ? COLOUR.chosen : live ? COLOUR.firing : COLOUR.nodeLine);
      this.label(g, describe(concept.percept), col.concepts, s.y, live ? '#fff4cf' : COLOUR.text, 112);
    }

    // nodes: actions, with a bar for how much it wanted each one last time it decided
    let topScore = 0.0001;
    for (const score of decision?.actionScores ?? []) if (score > topScore) topScore = score;
    for (const a of actionSpots) {
      const name = ACTIONS[a.item];
      const isChosen = a.item === chosenAction;
      const score = decision?.actionScores[a.item] ?? -Infinity;
      const possible = score !== -Infinity;
      this.pill(g, col.actions, a.y, 54, isChosen ? '#1d4a44' : COLOUR.node, isChosen ? COLOUR.chosen : COLOUR.nodeLine);
      if (possible && score > 0) {
        g.fillStyle = isChosen ? COLOUR.chosen : COLOUR.muted;
        g.globalAlpha = 0.28;
        g.fillRect(col.actions - 50, a.y + 5, 100 * (score / topScore), 3);
        g.globalAlpha = 1;
      }
      this.label(g, name, col.actions, a.y - 0.5, possible ? (isChosen ? '#d7fff8' : COLOUR.text) : COLOUR.muted);
    }
  }

  private header(g: CanvasRenderingContext2D, text: string, x: number, y: number): void {
    g.fillStyle = COLOUR.muted;
    g.textAlign = 'center';
    g.fillText(text, x, y);
  }

  private curve(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
    const mid = (x1 + x2) / 2;
    g.beginPath();
    g.moveTo(x1, y1);
    g.bezierCurveTo(mid, y1, mid, y2, x2, y2);
    g.stroke();
  }

  private pulse(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, t: number): void {
    const mid = (x1 + x2) / 2;
    const u = 1 - t;
    const x = u * u * u * x1 + 3 * u * u * t * mid + 3 * u * t * t * mid + t * t * t * x2;
    const y = u * u * u * y1 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y2;
    g.fillStyle = COLOUR.firing;
    g.beginPath();
    g.arc(x, y, 3.2, 0, Math.PI * 2);
    g.fill();
  }

  private pill(g: CanvasRenderingContext2D, x: number, y: number, halfWidth: number, fill: string, line: string): void {
    g.beginPath();
    g.roundRect(x - halfWidth, y - 11, halfWidth * 2, 22, 7);
    g.fillStyle = fill;
    g.fill();
    g.strokeStyle = line;
    g.lineWidth = 1;
    g.stroke();
  }

  private label(g: CanvasRenderingContext2D, text: string, x: number, y: number, colour: string, maxWidth?: number): void {
    g.fillStyle = colour;
    g.textAlign = 'center';
    g.fillText(text, x, y, maxWidth);
  }
}
