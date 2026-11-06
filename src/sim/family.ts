// genes, babies and family trees. a baby gets its parents' genes mixed and slightly changed, and none of what they
// learned, so every generation still needs raising.
import { defaultGenes } from './brain.ts';
import type { Genes } from './brain.ts';
import { cleanLook } from './look.ts';
import type { Look } from './look.ts';
import type { Rng } from './rng.ts';

// the range a gene can be in, and how far a new egg's can stray from the middle. default genes are what the
// learning bar was tuned on. everything outside this is what makes one creature different from the next.
const GENES: Record<keyof Genes, { min: number; max: number; spread: number }> = {
  learningRate: { min: 0.2, max: 1, spread: 0.2 },
  curiosity: { min: 0.08, max: 0.8, spread: 0.14 },
  temperature: { min: 0.03, max: 0.16, spread: 0.02 },
  memorySeconds: { min: 1, max: 5, spread: 0.8 },
  maxConcepts: { min: 48, max: 256, spread: 40 },
  restful: { min: -0.08, max: 0.16, spread: 0.08 },
  chatty: { min: -0.08, max: 0.18, spread: 0.09 },
  roaming: { min: -0.08, max: 0.16, spread: 0.08 },
  handsy: { min: -0.08, max: 0.16, spread: 0.08 },
  pace: { min: 0.65, max: 1.45, spread: 0.25 },
};
const GENE_NAMES = Object.keys(GENES) as (keyof Genes)[];
const MUTATION = 0.55; // how far a baby's gene can stray, compared with a new egg's

export function geneRange(gene: keyof Genes): { min: number; max: number } {
  return GENES[gene];
}

function keep(gene: keyof Genes, value: number): number {
  const v = Math.max(GENES[gene].min, Math.min(GENES[gene].max, value));
  return gene === 'maxConcepts' ? Math.round(v) : v;
}

// two dice added together: mostly near the middle, sometimes further out
const bell = (rng: Rng): number => rng.next() + rng.next() - 1;

// a new egg with nobody before it
export function rollGenes(rng: Rng): Genes {
  const middle = defaultGenes();
  const genes = { ...middle };
  for (const gene of GENE_NAMES) genes[gene] = keep(gene, middle[gene] + bell(rng) * GENES[gene].spread);
  return genes;
}

// each gene comes whole from one parent or the other, then changes a little
export function mixGenes(a: Genes, b: Genes, rng: Rng): Genes {
  const genes = { ...a };
  for (const gene of GENE_NAMES) {
    const from = rng.next() < 0.5 ? a[gene] : b[gene];
    genes[gene] = keep(gene, from + bell(rng) * GENES[gene].spread * MUTATION);
  }
  return genes;
}

// files come from other people, so a gene can't be anything a real one couldn't be
export function cleanGenes(raw: unknown): Genes {
  const g = (raw ?? {}) as Record<string, unknown>;
  const genes = defaultGenes();
  for (const gene of GENE_NAMES) {
    const v = g[gene];
    if (typeof v === 'number' && Number.isFinite(v)) genes[gene] = keep(gene, v);
  }
  return genes;
}

// a baby takes its skin from one parent and its colours from either, nudged a little so it isn't an exact copy
export function mixLooks(a: Look, b: Look, rng: Rng): Look {
  const from = rng.next() < 0.5 ? a : b;
  const nudge = (colour: number): number => {
    const shift = (at: number): number => Math.max(0, Math.min(255, ((colour >> at) & 255) + rng.int(-14, 14))) << at;
    return shift(16) | shift(8) | shift(0);
  };
  return { skin: rng.next() < 0.5 ? a.skin : b.skin, body: nudge(from.body), belly: nudge(from.belly), accent: nudge(from.accent), eyes: from.eyes };
}

const STARTS = ['Bo', 'Pip', 'Mo', 'Tu', 'Ki', 'Lu', 'No', 'Fen', 'Wim', 'Oz', 'Dab', 'Ru', 'Sy', 'Gub', 'Tal', 'Mip'];
const ENDS = ['bo', 'ble', 'pa', 'ni', 'lo', 'mi', 'ty', 'zel', 'ko', 'wen', 'rin', 'dle', 'sy', 'moo'];

export function babyName(rng: Rng): string {
  return STARTS[rng.int(0, STARTS.length - 1)] + ENDS[rng.int(0, ENDS.length - 1)];
}

// how it's getting on. this is by age alone, so it never depends on how fast you've been running the world.
export const STAGES = { child: 10 * 60 * 30, adult: 30 * 60 * 30 }; // in ticks: 10 and 30 minutes
export type Stage = 'baby' | 'child' | 'adult';

export function stageOf(age: number): Stage {
  return age < STAGES.child ? 'baby' : age < STAGES.adult ? 'child' : 'adult';
}

// how big it's drawn. it only looks smaller: its body in the room stays the same, so a baby can reach what a grown-up can
export function stageSize(age: number): number {
  const stage = stageOf(age);
  if (stage === 'adult') return 1;
  if (stage === 'child') return 0.8 + (0.2 * (age - STAGES.child)) / (STAGES.adult - STAGES.child);
  return 0.62 + (0.18 * age) / STAGES.child;
}

// one line in the family tree, which stays after they've gone
export interface Kin {
  uid: string;
  name: string;
  look: Look;
  parents: string[];
  generation: number;
  gone?: boolean; // sent away
}

const MOST_KIN = 400;

export function cleanKin(raw: unknown): Kin | null {
  const k = (raw ?? {}) as Record<string, unknown>;
  if (typeof k.uid !== 'string' || !k.uid || k.uid.length > 40) return null;
  const parents = (Array.isArray(k.parents) ? k.parents : []).filter((p): p is string => typeof p === 'string' && p.length <= 40).slice(0, 2);
  const generation = typeof k.generation === 'number' && Number.isFinite(k.generation) ? Math.max(0, Math.min(1e6, Math.round(k.generation))) : 0;
  return { uid: k.uid, name: typeof k.name === 'string' ? k.name.slice(0, 40) : 'Nurt', look: cleanLook(k.look), parents, generation };
}

export function cleanFamily(raw: unknown): Kin[] {
  const list = Array.isArray(raw) ? raw.slice(0, MOST_KIN) : [];
  return list.map(cleanKin).filter((k): k is Kin => k !== null);
}

// everyone this one came from, so the tree goes along with it
export function ancestors(uid: string, family: Record<string, Kin>): Kin[] {
  const found = new Map<string, Kin>();
  const walk = (id: string): void => {
    const kin = family[id];
    if (!kin || found.has(id) || found.size >= MOST_KIN) return;
    found.set(id, kin);
    for (const parent of kin.parents) walk(parent);
  };
  walk(uid);
  return [...found.values()];
}

// what its genes make it like, in plain words, compared with the middle
export function temperament(genes: Genes): string[] {
  const middle = defaultGenes();
  const words: string[] = [];
  const side = (gene: keyof Genes, high: string, low: string): void => {
    const by = (genes[gene] - middle[gene]) / GENES[gene].spread;
    if (by > 0.3) words.push(high);
    else if (by < -0.3) words.push(low);
  };
  side('pace', 'quick on its feet', 'slow and steady');
  side('restful', 'loves a nap', 'hardly ever rests');
  side('chatty', 'chatty', 'quiet');
  side('roaming', 'a wanderer', 'a homebody');
  side('handsy', 'grabs at everything', 'careful with its hands');
  side('curiosity', 'very curious', 'not easily interested');
  side('learningRate', 'learns fast', 'takes a while to learn');
  side('memorySeconds', 'links things that are far apart', 'lives in the moment');
  return words.length ? words : ['nothing out of the ordinary'];
}
