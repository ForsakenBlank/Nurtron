// undo and redo for building. each edit remembers how the things it touched looked before and after, and
// nothing else, so undoing a move doesn't teleport everything else in a room that's still running, or wind a
// counter back to what it said then. the creature and its brain are never part of this: undo changes the room,
// not what it has learned.
import type { Wire } from './circuit.ts';
import type { Part, Value } from './parts.ts';
import { specOf } from './world.ts';
import type { ThingSpec, World } from './world.ts';

const MOST_EDITS = 200;

export interface Snapshot {
  things: Map<number, ThingSpec | null>;
  wires: Wire[];
}

interface Edit {
  label: string;
  before: Snapshot;
  after: Snapshot;
  typed?: { id: number; was: Value; now: Value }; // a value typed into a label, which is the one time undo should change one
}

export class History {
  private done: Edit[] = [];
  private undone: Edit[] = [];
  onCommit: ((label: string) => void) | null = null; // told about each new edit, for the first steps guide

  get canUndo(): boolean {
    return this.done.length > 0;
  }

  get canRedo(): boolean {
    return this.undone.length > 0;
  }

  // call this before changing things. ids that don't exist yet are remembered as not existing
  capture(world: World, ids: Iterable<number>): Snapshot {
    const things = new Map<number, ThingSpec | null>();
    for (const id of ids) {
      const thing = world.thing(id);
      things.set(id, thing ? specOf(thing) : null);
    }
    return { things, wires: [...world.wires] };
  }

  // call this after changing them. extraIds is for anything the edit made that the snapshot couldn't know about
  commit(label: string, world: World, before: Snapshot, extraIds: Iterable<number> = []): void {
    for (const id of extraIds) if (!before.things.has(id)) before.things.set(id, null);
    const after = this.capture(world, before.things.keys());
    let changed = !sameWires(before, after);
    for (const [id, was] of before.things) if (JSON.stringify(settings(was)) !== JSON.stringify(settings(after.things.get(id) ?? null))) changed = true;
    if (!changed) return;
    this.push({ label, before, after });
  }

  commitTyped(label: string, world: World, id: number, was: Value, now: Value): void {
    const state = this.capture(world, []);
    this.push({ label, before: state, after: state, typed: { id, was, now } });
  }

  private push(edit: Edit): void {
    this.done.push(edit);
    if (this.done.length > MOST_EDITS) this.done.shift();
    this.undone = [];
    this.onCommit?.(edit.label);
  }

  undo(world: World): string | null {
    const edit = this.done.pop();
    if (!edit) return null;
    apply(world, edit.before, edit.after);
    if (edit.typed) world.setLabel(edit.typed.id, edit.typed.was);
    this.undone.push(edit);
    return edit.label;
  }

  redo(world: World): string | null {
    const edit = this.undone.pop();
    if (!edit) return null;
    apply(world, edit.after, edit.before);
    if (edit.typed) world.setLabel(edit.typed.id, edit.typed.now);
    this.done.push(edit);
    return edit.label;
  }

  clear(): void {
    this.done = [];
    this.undone = [];
  }
}

function sameWires(a: Snapshot, b: Snapshot): boolean {
  return JSON.stringify(a.wires) === JSON.stringify(b.wires);
}

function withoutValue(part: Part): Part {
  const { value: _value, ...rest } = part;
  return rest as Part;
}

// how a thing is set up, leaving out what a label happens to hold right now
function settings(spec: ThingSpec | null): ThingSpec | null {
  return spec?.part ? { ...spec, part: withoutValue(spec.part) } : spec;
}

function apply(world: World, state: Snapshot, other: Snapshot): void {
  for (const [id, spec] of state.things) {
    if (spec === null) {
      world.remove(id);
    } else if (world.thing(id)) {
      // optional properties have to be cleared by name, or ones the old state didn't have would stay
      world.update(id, { give: undefined, eaten: undefined, respawnSeconds: undefined, tags: undefined, texture: undefined, climbable: undefined, hidden: undefined, ignored: undefined, label: undefined, decor: undefined, item: undefined, hp: undefined, enemy: undefined, holds: undefined, ...settings(spec) });
    } else {
      world.add(spec, id);
    }
  }
  if (!sameWires(state, other)) world.circuit.setWires(state.wires);
}
