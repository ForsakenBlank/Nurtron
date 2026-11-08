// the undo history says whether there's anything to undo or redo, and tells whoever's listening about each new edit,
// which is how the Undo and Redo buttons grey out and the first steps guide ticks off building
import { describe, expect, it } from 'vitest';
import { History } from '../src/sim/edits.ts';
import { initPhysics, World } from '../src/sim/world.ts';

await initPhysics();

describe('the undo history', () => {
  it('knows when there is something to undo or redo, and says what each edit was', () => {
    const world = new World({ seed: 1, things: [] });
    const history = new History();
    const heard: string[] = [];
    history.onCommit = (label) => heard.push(label);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    const before = history.capture(world, []);
    const ball = world.add({ name: 'Circle', form: 'circle', colour: 'blue', hw: 20, hh: 20, x: 400 });
    history.commit('Add circle', world, before, [ball.id]);
    expect(heard).toEqual(['Add circle']);
    expect(history.canUndo).toBe(true);
    history.undo(world);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);
    // an edit that changed nothing isn't an edit
    history.commit('Move', world, history.capture(world, []));
    expect(heard).toEqual(['Add circle']);
    world.dispose();
  });
});
