// the make-or-break test from the plan: can a brain really learn? it raises many creatures with no window,
// teaches them the way a person would (reacting a moment late), then checks what they do.
// every probe runs on a saved and reloaded copy with learning off, so probing never changes the creature,
// and anything that only works before a save would fail here.
import { Rng } from './rng.ts';
import { FRUIT, ROCK, ROOM, TICKS_PER_SECOND, World } from './world.ts';
import type { ThingSpec, WorldEvent } from './world.ts';

const SPOTS = 10; // probes per creature
const TOY: ThingSpec = { name: 'Ball', form: 'circle', colour: 'blue', hw: 22, hh: 22, x: ROOM.width / 2 - 210 };
const BIG_RED_BALL: ThingSpec = { name: 'Big red ball', form: 'circle', colour: 'red', hw: 34, hh: 34, x: 0 };
const RED_TRIANGLE: ThingSpec = { name: 'Red triangle', form: 'triangle', colour: 'red', hw: 14, hh: 14, x: 0 };
const BLUE_BLOCK: ThingSpec = { name: 'Blue block', form: 'box', colour: 'blue', hw: 34, hh: 34, x: 0, weight: 3 };
const GREEN_BLOCK: ThingSpec = { name: 'Green block', form: 'box', colour: 'green', hw: 14, hh: 14, x: 0, weight: 3 };

export interface Raised {
  world: World;
  firstEat: number | null; // seconds
  fifthEat: number | null;
}

function setDrives(world: World, food: number, energy: number): void {
  world.setDrive('Hunger', 100 - food);
  world.setDrive('Energy', energy);
}

// lets a creature live with a fruit and a rock until it has eaten 5 times, praising it a moment after
// each meal if asked. hunger is topped back up so training doesn't take ten real minutes per creature.
export function raise(seed: number, praise: boolean): Raised {
  const world = new World({ seed, things: [FRUIT, ROCK] });
  const teacher = new Rng(seed ^ 0x5eed);
  let eats = 0;
  let firstEat: number | null = null;
  let fifthEat: number | null = null;
  let petAt = -1;
  const limit = 900 * TICKS_PER_SECOND;
  while (world.tick < limit && eats < 5) {
    world.step();
    for (const event of world.takeEvents()) {
      if (event.type !== 'touched' || !event.ate) continue;
      eats++;
      if (eats === 1) firstEat = world.tick / TICKS_PER_SECOND;
      if (eats === 5) fifthEat = world.tick / TICKS_PER_SECOND;
      if (praise) petAt = world.tick + Math.round(teacher.range(0.3, 1.5) * TICKS_PER_SECOND);
      if (world.drive('Hunger')!.value < 30) world.setDrive('Hunger', 55);
    }
    if (world.tick === petAt) world.pet();
  }
  // let the last praise land before testing
  while (world.tick < petAt) {
    world.step();
    if (world.tick === petAt) world.pet();
  }
  world.takeEvents();
  return { world, firstEat, fifthEat };
}

function copyForProbe(world: World, seed: number): World {
  const copy = World.load(world.save());
  copy.rng = new Rng(seed);
  copy.creature.brain.learning = false;
  copy.interrupt();
  copy.takeEvents();
  return copy;
}

// puts two things the same distance away on opposite sides and sees which it touches first
function firstChoice(world: World, a: ThingSpec, b: ThingSpec, seed: number, food = 30, seconds = 30): 'a' | 'b' | null {
  const copy = copyForProbe(world, seed);
  copy.clearThings();
  copy.placeCreature(ROOM.width / 2);
  setDrives(copy, food, 90);
  const side = copy.rng.next() < 0.5 ? -1 : 1;
  const thingA = copy.add({ ...a, x: ROOM.width / 2 + side * 220, respawnSeconds: undefined });
  const thingB = copy.add({ ...b, x: ROOM.width / 2 - side * 220, respawnSeconds: undefined });
  let choice: 'a' | 'b' | null = null;
  for (let i = 0; i < seconds * TICKS_PER_SECOND && !choice; i++) {
    copy.step();
    for (const event of copy.takeEvents()) {
      if (event.type !== 'touched') continue;
      if (event.thingId === thingA.id) choice = 'a';
      else if (event.thingId === thingB.id) choice = 'b';
    }
  }
  copy.dispose();
  return choice;
}

function choiceRate(world: World, a: ThingSpec, b: ThingSpec, seed: number): number {
  let wins = 0;
  for (let i = 0; i < SPOTS; i++) if (firstChoice(world, a, b, seed * 1000 + i) === 'a') wins++;
  return wins / SPOTS;
}

// how often its very next decision is to go and touch the fruit
function touchesFruit(world: World, food: number, seed: number): number {
  let touches = 0;
  for (let i = 0; i < SPOTS; i++) {
    const copy = copyForProbe(world, seed * 1000 + i);
    copy.clearThings();
    setDrives(copy, food, 90);
    copy.placeCreature(ROOM.width / 2);
    const fruit = copy.add({ ...FRUIT, x: ROOM.width / 2 + 200, respawnSeconds: undefined });
    copy.add({ ...ROCK, x: ROOM.width / 2 - 200 });
    copy.step();
    copy.step();
    const decision = copy.creature.brain.last;
    if (decision && decision.action === 'touch' && decision.chosen.thingId === fruit.id) touches++;
    copy.dispose();
  }
  return touches / SPOTS;
}

interface SlapResult {
  slaps: number;
  stopped: boolean; // went a full minute without doing it again, using at most 3 slaps
  meals: number; // meals during that quiet minute
}

// slaps it a moment after every time it does something. it passes by going a full minute without doing
// it again. a 4th time means it failed, since the plan says 3 slaps or fewer should be enough.
function slapUntilStopped(world: World, seed: number, didIt: (event: WorldEvent) => boolean): SlapResult {
  const teacher = new Rng(seed);
  const quiet = 60 * TICKS_PER_SECOND;
  const limit = 900 * TICKS_PER_SECOND;
  let slaps = 0;
  let slapAt = -1;
  let lastSlap = -1;
  let meals = 0;
  while (world.tick < limit) {
    world.step();
    for (const event of world.takeEvents()) {
      if (event.type === 'touched' && event.ate) meals++;
      if (!didIt(event)) continue;
      if (slaps >= 3) return { slaps, stopped: false, meals };
      if (slapAt < 0) slapAt = world.tick + Math.round(teacher.range(0.2, 0.8) * TICKS_PER_SECOND);
    }
    if (world.tick === slapAt) {
      world.slap();
      slaps++;
      slapAt = -1;
      lastSlap = world.tick;
      meals = 0;
    }
    if (slaps > 0 && slapAt < 0 && world.tick - lastSlap >= quiet) return { slaps, stopped: true, meals };
    if (world.drive('Hunger')!.value < 30) world.setDrive('Hunger', 55);
  }
  return { slaps, stopped: false, meals };
}

function slapBallTest(seed: number): SlapResult {
  const world = new World({ seed, things: [FRUIT, TOY] });
  const ball = world.things.find((t) => t.name === 'Ball')!;
  const result = slapUntilStopped(world, seed ^ 0xbad, (event) => event.type === 'touched' && event.thingId === ball.id);
  world.dispose();
  return result;
}

// checks a slap works on something it does by itself, not only on something it does to an object
function slapCallTest(seed: number): SlapResult {
  const world = new World({ seed, things: [FRUIT, ROCK] });
  const result = slapUntilStopped(world, seed ^ 0xca11, (event) => event.type === 'called');
  world.dispose();
  return result;
}

// a trick with nothing to gain but praise: well fed, pet every time it calls out, 5 times
function trickTest(seed: number): { reached: boolean; before: number; after: number } {
  const world = new World({ seed, things: [ROCK] });
  const teacher = new Rng(seed ^ 0x7ac);
  const callRate = (w: World, salt: number): number => {
    let calls = 0;
    let total = 0;
    for (let i = 0; i < SPOTS; i++) {
      const copy = copyForProbe(w, salt * 1000 + i);
      setDrives(copy, 100, 100);
      for (let t = 0; t < 60 * TICKS_PER_SECOND; t++) {
        copy.step();
        for (const event of copy.takeEvents()) {
          if (event.type === 'decided') total++;
          if (event.type === 'called') calls++;
        }
      }
      copy.dispose();
    }
    return total ? calls / total : 0;
  };
  // let the newness wear off first, so "before" isn't just a baby trying everything once
  while (world.tick < 120 * TICKS_PER_SECOND) {
    world.step();
    world.takeEvents();
    setDrives(world, 100, 100);
  }
  const before = callRate(world, seed);
  let pets = 0;
  let petAt = -1;
  const limit = world.tick + 900 * TICKS_PER_SECOND;
  while (world.tick < limit && pets < 5) {
    world.step();
    setDrives(world, 100, 100);
    for (const event of world.takeEvents()) {
      if (event.type === 'called' && petAt < 0) petAt = world.tick + Math.round(teacher.range(0.2, 0.9) * TICKS_PER_SECOND);
    }
    if (world.tick === petAt) {
      world.pet();
      pets++;
      petAt = -1;
    }
  }
  const reached = pets >= 5;
  const after = reached ? callRate(world, seed + 1) : before;
  world.dispose();
  return { reached, before, after };
}

// lives alone for half an hour with nobody helping. physics can trap food or shove it out of reach, so
// this is what catches a creature starving next to a working fruit supply.
function survives(seed: number): { lowest: number; meals: number } {
  const world = new World({ seed });
  let lowest = 100;
  let meals = 0;
  const end = 30 * 60 * TICKS_PER_SECOND;
  while (world.tick < end) {
    world.step();
    lowest = Math.min(lowest, 100 - world.drive('Hunger')!.value);
    for (const event of world.takeEvents()) if (event.type === 'touched' && event.ate) meals++;
  }
  world.dispose();
  return { lowest, meals };
}

const mean = (list: number[]): number => (list.length ? list.reduce((s, v) => s + v, 0) / list.length : 0);
const median = (list: number[]): number => (list.length ? [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)] : NaN);

export interface BarLine {
  name: string;
  result: number;
  target: string;
  pass: boolean;
  note: string;
}

export interface BarReport {
  runs: number;
  lines: BarLine[];
  extras: string[];
  pass: boolean;
}

export function runLearningBar(runs = 100, firstSeed = 1): BarReport {
  const seeds = Array.from({ length: runs }, (_, i) => firstSeed + i);
  const taught = seeds.map((s) => raise(s, true));
  const natural = seeds.map((s) => raise(s, false));
  const unraised = seeds.map((s) => new World({ seed: s, things: [FRUIT, ROCK] }));

  const untaughtChoice = mean(unraised.map((r, i) => choiceRate(r, FRUIT, ROCK, seeds[i])));
  const fruitChoice = mean(taught.map((r, i) => choiceRate(r.world, FRUIT, ROCK, seeds[i])));
  const naturalChoice = mean(natural.map((r, i) => choiceRate(r.world, FRUIT, ROCK, seeds[i])));

  const hungryTouch = mean(taught.map((r, i) => touchesFruit(r.world, 30, seeds[i])));
  const fullTouch = mean(taught.map((r, i) => touchesFruit(r.world, 98, seeds[i])));

  const ballSlaps = seeds.map(slapBallTest);
  const leftAlone = ballSlaps.filter((s) => s.stopped).length / runs;
  const stillEats = ballSlaps.filter((s) => s.stopped && s.meals > 0).length / runs;
  const callSlaps = seeds.map(slapCallTest);
  const stoppedCalling = callSlaps.filter((s) => s.stopped).length / runs;

  const lookalike = mean(taught.map((r, i) => choiceRate(r.world, BIG_RED_BALL, BLUE_BLOCK, seeds[i])));
  const lookalikeUntaught = mean(unraised.map((r, i) => choiceRate(r, BIG_RED_BALL, BLUE_BLOCK, seeds[i])));
  const colourOnly = mean(taught.map((r, i) => choiceRate(r.world, RED_TRIANGLE, GREEN_BLOCK, seeds[i])));

  for (const r of [...taught, ...natural]) r.world.dispose();
  for (const w of unraised) w.dispose();

  const eatTimes = taught.map((r) => r.firstEat).filter((v): v is number => v !== null);
  const fifthTimes = taught.map((r) => r.fifthEat).filter((v): v is number => v !== null);

  const tricks = seeds.slice(0, Math.min(runs, 10)).map(trickTest).filter((t) => t.reached);
  const lives = seeds.slice(0, Math.min(runs, 30)).map(survives);
  const fed = lives.filter((l) => l.lowest > 10).length / lives.length;

  const line = (name: string, result: number, target: number, note: string, atMost = false): BarLine => ({
    name,
    result,
    target: `${atMost ? 'at most' : 'at least'} ${Math.round(target * 100)}%`,
    pass: atMost ? result <= target : result >= target,
    note,
  });

  const lines = [
    line('Hungry, picks the fruit over the rock', fruitChoice, 0.8, `after 5 meals with praise. untaught: ${pct(untaughtChoice)}`),
    line('Same, learning from food alone', naturalChoice, 0.8, 'no praise at all, only the food going up'),
    line('Very hungry, next decision is to eat', hungryTouch, 0.6, 'how often it goes straight for the food'),
    line('Full, next decision is to eat', fullTouch, 0.2, 'it should mostly leave food alone', true),
    line('Slapped 3 times or fewer for touching a ball, leaves it alone for a full minute', leftAlone, 0.8, `average ${mean(ballSlaps.map((s) => s.slaps)).toFixed(1)} slaps used`),
    line('Slapped 3 times or fewer for calling, stays quiet for a full minute', stoppedCalling, 0.8, `average ${mean(callSlaps.map((s) => s.slaps)).toFixed(1)} slaps used`),
    line('Picks a new big red ball over a new blue block', lookalike, 0.65, `it has never seen either. untaught: ${pct(lookalikeUntaught)}`),
    line('Alone for 30 minutes, keeps itself fed', fed, 0.9, `Hunger never above 90. average ${mean(lives.map((l) => l.meals)).toFixed(0)} meals, ${lives.length} creatures`),
  ];

  const extras = [
    `First meal after ${median(eatTimes).toFixed(0)}s (median), five meals after ${median(fifthTimes).toFixed(0)}s. ${eatTimes.length}/${runs} ate at all, ${fifthTimes.length}/${runs} got to five.`,
    `Colour alone: picks a new red triangle over a new green block ${pct(colourOnly)} of the time.`,
    `Slapped off the ball but still ate during its quiet minute: ${pct(stillEats)} of creatures.`,
    tricks.length
      ? `Praise-only trick: calling out goes from ${pct(mean(tricks.map((t) => t.before)))} to ${pct(mean(tricks.map((t) => t.after)))} of its decisions after 5 pets (${tricks.length} creatures).`
      : 'Praise-only trick: no creature called out enough to be taught.',
  ];

  return { runs, lines, extras, pass: lines.every((l) => l.pass) };
}

export const pct = (v: number): string => `${Math.round(v * 100)}%`;
