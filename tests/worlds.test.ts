// the worlds on the main menu: making, keeping, opening and deleting them, and nobody losing the world they had before
import { describe, expect, it } from 'vitest';
import { MOST_WORLDS, WorldStore } from '../src/app/worlds.ts';
import type { BigStore, SmallStore } from '../src/app/worlds.ts';

const SAVE = 'nurtron.world';
const summary = { preview: 'data:image/png;base64,AAAA', creatures: ['Nurt'], width: 6000, height: 2000 };

function stores(): { small: SmallStore & { data: Map<string, string> }; big: BigStore & { data: Map<string, string> } } {
  const smallData = new Map<string, string>();
  const bigData = new Map<string, string>();
  return {
    small: { data: smallData, getItem: (k) => smallData.get(k) ?? null, setItem: (k, v) => void smallData.set(k, v), removeItem: (k) => void smallData.delete(k) },
    big: { data: bigData, get: async (id) => bigData.get(id) ?? null, put: async (id, t) => void bigData.set(id, t), remove: async (id) => void bigData.delete(id) },
  };
}

describe('worlds', () => {
  it('someone from before worlds keeps the world they were playing, as their first one', async () => {
    const { small, big } = stores();
    small.setItem(SAVE, '{"the":"old world"}');
    const store = new WorldStore(small, big, SAVE);
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0].name).toBe('My world');
    expect(store.activeId).toBe(store.list()[0].id);
    expect(await store.text(store.activeId as string)).toBe('{"the":"old world"}');
    // and that only happens once
    expect(new WorldStore(small, big, SAVE).list()).toHaveLength(1);
  });

  it('a brand new player starts with no worlds, for the game to make the first', () => {
    const { small, big } = stores();
    const store = new WorldStore(small, big, SAVE);
    expect(store.list()).toEqual([]);
    expect(store.activeId).toBeNull();
  });

  it('keeps several worlds, and the one you are in is read from where it is saved as you play', async () => {
    const { small, big } = stores();
    const store = new WorldStore(small, big, SAVE);
    const a = await store.add('Garden', 'A', summary);
    const b = await store.add('Cave', 'B', summary);
    store.setActive(a.id);
    small.setItem(SAVE, 'A, played some more');
    expect(await store.text(a.id)).toBe('A, played some more');
    expect(await store.text(b.id)).toBe('B');
    await store.keep(a.id, 'A, left', { ...summary, creatures: ['Nurt', 'Pip'] });
    store.setActive(b.id);
    small.setItem(SAVE, 'B');
    expect(await store.text(a.id)).toBe('A, left');
    expect(store.entry(a.id)?.creatures).toEqual(['Nurt', 'Pip']);
    expect(store.list()[0].id).toBe(b.id);
    // and it all comes back after closing
    const again = new WorldStore(small, big, SAVE);
    expect(again.list().map((e) => e.name).sort()).toEqual(['Cave', 'Garden']);
    expect(again.activeId).toBe(b.id);
  });

  it('renames and deletes, and deleting the one you are in leaves no world open', async () => {
    const { small, big } = stores();
    const store = new WorldStore(small, big, SAVE);
    const a = await store.add('Garden', 'A', summary);
    store.setActive(a.id);
    small.setItem(SAVE, 'A');
    store.rename(a.id, '  Big garden  ');
    expect(store.entry(a.id)?.name).toBe('Big garden');
    store.rename(a.id, '   ');
    expect(store.entry(a.id)?.name).toBe('Big garden');
    await store.remove(a.id);
    expect(store.list()).toEqual([]);
    expect(store.activeId).toBeNull();
    expect(small.getItem(SAVE)).toBeNull();
    expect(big.data.size).toBe(0);
  });

  it('a damaged list is cleaned up rather than breaking the menu', () => {
    const { small, big } = stores();
    small.setItem('nurtron.worlds', JSON.stringify([{ id: 'wok1', name: 'Fine', preview: 'javascript:alert(1)' }, { id: '../../etc', name: 'Bad' }, { id: 'wok1', name: 'Twin' }, 7, null]));
    small.setItem('nurtron.worlds.active', 'wnope');
    const store = new WorldStore(small, big, SAVE);
    expect(store.list().map((e) => e.name)).toEqual(['Fine']);
    expect(store.list()[0].preview).toBe('');
    expect(store.activeId).toBeNull();
  });

  it('stops at a limit', async () => {
    const { small, big } = stores();
    const store = new WorldStore(small, big, SAVE);
    for (let i = 0; i < MOST_WORLDS; i++) await store.add(`W${i}`, 'x', summary);
    await expect(store.add('One more', 'x', summary)).rejects.toThrow();
  });
});
