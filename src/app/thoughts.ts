// what each creature has been thinking and doing lately, in plain words. it's only for the player, so it isn't saved.
import { describe } from '../sim/senses.ts';
import { TICKS_PER_SECOND } from '../sim/world.ts';
import type { Creature, WorldEvent } from '../sim/world.ts';

const MOST_THOUGHTS = 40;

export type ThoughtKind = 'decide' | 'told' | 'good' | 'bad' | 'plain';

export interface Thought {
  tick: number;
  words: string;
  kind: ThoughtKind;
}

const DOING = {
  approach: 'walk over to',
  avoid: 'back away from',
  touch: 'touch',
  grab: 'grab',
  drop: 'drop what it was holding',
  push: 'push',
  rest: 'have a rest',
  call: 'call out',
  wander: 'wander off',
} as const;

const DOING_NOW = {
  approach: 'Walking over to',
  avoid: 'Backing away from',
  touch: 'Going to touch',
  grab: 'Going to grab',
  drop: 'Dropping what it was holding',
  push: 'Going to push',
  rest: 'Having a rest',
  call: 'Calling out',
  wander: 'Wandering off to look around',
} as const;

// what it's up to this very moment, in words
export function doingNow(c: Creature, targetName: string | null): string {
  if (c.dead) return 'Dead';
  if (c.hatching > 0) return 'Hatching';
  if (c.dragged) return 'Being carried about';
  if (c.stunned > 0) return 'Recovering from that slap';
  if (!c.doing) return 'Working out what to do next';
  const words = DOING_NOW[c.doing.action];
  return targetName ? `${words} the ${targetName}` : words;
}

export class ThoughtLog {
  private byCreature = new Map<number, Thought[]>();

  of(id: number): Thought[] {
    return this.byCreature.get(id) ?? [];
  }

  private add(id: number, tick: number, words: string, kind: ThoughtKind): void {
    const list = this.byCreature.get(id) ?? [];
    list.unshift({ tick, words, kind });
    if (list.length > MOST_THOUGHTS) list.pop();
    this.byCreature.set(id, list);
  }

  take(events: WorldEvent[], tick: number, everyone: number[], names: Map<number, string> = new Map()): void {
    for (const event of events) {
      if (event.type === 'said') {
        if (event.by !== null) this.add(event.by, tick, `Said "${event.word}"`, 'good');
        for (const id of everyone) if (id !== event.by) this.add(id, tick, `Heard "${event.word}"`, 'plain');
        continue;
      }
      if (event.type === 'pulse' || event.type === 'loop' || event.type === 'sound' || event.type === 'burst' || event.type === 'solved' || event.type === 'killed' || event.type === 'fired') continue;
      if (event.type === 'hurt') {
        if (event.who !== null && event.thingId === null && event.amount > 0) this.add(event.who, tick, `Got hurt, and lost ${Math.round(event.amount * 10) / 10} Health`, 'bad');
        continue;
      }
      const who = event.who;
      if (event.type === 'picked') {
        this.add(who, tick, `Picked up the ${event.name}`, 'good');
        continue;
      } else if (event.type === 'looted') {
        this.add(who, tick, `Opened a chest and took ${Object.entries(event.holds).map(([name, n]) => (n === 1 ? name : `${n} ${name}`)).join(', ')}`, 'good');
        continue;
      } else if (event.type === 'choosing') {
        this.add(who, tick, `Stopped to choose between ${event.options.join(', ')}`, 'decide');
        continue;
      } else if (event.type === 'chose') {
        this.add(who, tick, `Chose ${event.options[event.picked]}`, 'decide');
        continue;
      }
      if (event.type === 'decided') {
        const what = event.decision.chosen.percept ? ` the ${describe(event.decision.chosen.percept)}` : '';
        const verb = DOING[event.decision.action];
        this.add(who, tick, event.told ? `You told it to ${verb}${what}` : `Decided to ${verb}${what}`, event.told ? 'told' : 'decide');
      } else if (event.type === 'touched') {
        if (event.fatal || event.cuddle) continue; // the line about dying, or cuddling, already says so
        if (event.pressed) this.add(who, tick, event.ate ? `Pressed the ${event.name} button, and that helped` : `Pressed the ${event.name} button`, event.ate ? 'good' : 'plain');
        else this.add(who, tick, event.ate ? `Touched the ${event.name}, and that helped` : `Touched the ${event.name}. Nothing much happened`, event.ate ? 'good' : 'plain');
      } else if (event.type === 'did') {
        const words = {
          looked: `Went up to the ${event.name} to look at it. It didn't touch or press it`,
          pushed: `Pushed the ${event.name}`,
          budged: `Pushed the ${event.name}, but it's fixed in place so it didn't move`,
          picked: `Picked up the ${event.name}`,
          tooBig: `Tried to pick up the ${event.name}, but it's too big, too heavy or fixed in place`,
        }[event.how];
        this.add(who, tick, words, event.how === 'picked' || event.how === 'pushed' ? 'good' : 'plain');
      } else if (event.type === 'shutIn') {
        this.add(who, tick, "Seems to be shut in. It can't get to anything", 'bad');
      } else if (event.type === 'cuddled') {
        this.add(who, tick, `Cuddled up to ${names.get(event.other) ?? 'another creature'}`, 'good');
        this.add(event.other, tick, `${names.get(who) ?? 'Another creature'} cuddled up to it`, 'good');
      } else if (event.type === 'petted') {
        this.add(who, tick, 'You petted it', 'good');
      } else if (event.type === 'slapped') {
        this.add(who, tick, 'You slapped it', 'bad');
      } else if (event.type === 'called') {
        this.add(who, tick, 'Called out', 'plain');
      } else if (event.type === 'hatched') {
        this.add(who, tick, 'Hatched', 'good');
      } else if (event.type === 'laid') {
        this.add(who, tick, 'Was laid as an egg', 'good');
      } else if (event.type === 'died') {
        this.add(who, tick, `Died. ${event.lesson}`, 'bad');
      } else if (event.type === 'revived') {
        this.add(who, tick, 'Came back, and remembers dying', 'good');
      } else if (event.type === 'gaveUp') {
        this.add(who, tick, event.name ? `Couldn't get to the ${event.name}, so it gave up` : 'Gave up', 'bad');
      } else if (event.type === 'taught') {
        this.add(who, tick, `Remembered doing that${event.name ? ` to the ${event.name}` : ''}`, 'good');
      } else if (event.type === 'watched') {
        const what = event.name ? ` the ${event.name}` : '';
        const words = {
          ate: `Saw another creature ${DOING[event.action]}${what}, and it helped them`,
          hurt: `Saw another creature ${DOING[event.action]}${what}, and it went badly for them`,
          petted: `Saw another creature get petted for trying to ${DOING[event.action]}${what}`,
          slapped: `Saw another creature get slapped for trying to ${DOING[event.action]}${what}`,
        }[event.what];
        this.add(who, tick, words, event.what === 'ate' || event.what === 'petted' ? 'good' : 'bad');
      } else if (event.type === 'replayed') {
        this.add(who, tick, `Went over ${event.moments === 1 ? 'something' : `${event.moments} things`} that happened lately while resting`, 'plain');
      } else if (event.type === 'noticed') {
        this.add(who, tick, `Noticed the ${event.name} appear just after it tried to ${DOING[event.after]} the ${event.cause}`, 'plain');
      } else if (event.type === 'spoke') {
        this.add(who, tick, `Said "${event.text}"`, 'bad');
      } else if (event.type === 'planned') {
        const then = event.steps.map((step) => `${DOING[step.action]} the ${describe(step.percept)}`).join(', then ');
        this.add(who, tick, `Worked out what this leads to: after it, it could ${then}`, 'decide');
      }
    }
  }
}

export function ago(fromTick: number, nowTick: number): string {
  const seconds = Math.max(0, Math.round((nowTick - fromTick) / TICKS_PER_SECOND));
  if (seconds < 2) return 'just now';
  return seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`;
}
