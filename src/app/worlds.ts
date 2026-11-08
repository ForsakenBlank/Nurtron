// your worlds, for the main menu. the one you're in lives where it always has, so it can be saved at any moment,
// even as the window closes. the others are kept whole in the browser's bigger store, since a few big worlds would
// soon fill the small one. the list itself, with a little picture of each, sits beside the one you're in.
const LIST_KEY = 'nurtron.worlds';
const ACTIVE_KEY = 'nurtron.worlds.active';
export const MOST_WORLDS = 60;
const MOST_NAME = 40;

export interface WorldEntry {
  id: string;
  name: string;
  created: number;
  played: number; // when it was last left or entered
  preview: string; // a little picture of the map, as an image link
  creatures: string[]; // who lives there
  width: number;
  height: number;
}

// what a world looks like from the outside, without opening it
export interface WorldSummary {
  preview: string;
  creatures: string[];
  width: number;
  height: number;
}

// the small store: only text, only ever read and written at once
export interface SmallStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// the big store: whole worlds by id
export interface BigStore {
  get(id: string): Promise<string | null>;
  put(id: string, text: string): Promise<void>;
  remove(id: string): Promise<void>;
}

const newId = (): string => `w${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

// the list as it was saved, with anything that doesn't make sense left out
function cleanList(raw: unknown): WorldEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: WorldEntry[] = [];
  for (const one of raw.slice(0, MOST_WORLDS)) {
    const e = (one ?? {}) as Record<string, unknown>;
    if (typeof e.id !== 'string' || !/^w[a-z0-9]{1,30}$/.test(e.id) || seen.has(e.id)) continue;
    seen.add(e.id);
    const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    out.push({
      id: e.id,
      name: typeof e.name === 'string' && e.name.trim() ? e.name.slice(0, MOST_NAME) : 'A world',
      created: num(e.created),
      played: num(e.played),
      preview: typeof e.preview === 'string' && e.preview.startsWith('data:image/') ? e.preview : '',
      creatures: Array.isArray(e.creatures) ? e.creatures.filter((n): n is string => typeof n === 'string').slice(0, 20).map((n) => n.slice(0, 40)) : [],
      width: num(e.width),
      height: num(e.height),
    });
  }
  return out;
}

export class WorldStore {
  private entries: WorldEntry[];
  private active: string | null;

  private small: SmallStore;
  private big: BigStore;
  private saveKey: string;

  // saveKey is where the world you're in is kept, which is where the only world lived before there were several
  constructor(small: SmallStore, big: BigStore, saveKey: string) {
    this.small = small;
    this.big = big;
    this.saveKey = saveKey;
    let raw: unknown = null;
    try {
      raw = JSON.parse(small.getItem(LIST_KEY) ?? 'null');
    } catch {
      raw = null;
    }
    this.entries = cleanList(raw);
    const active = small.getItem(ACTIVE_KEY);
    this.active = active && this.entries.some((e) => e.id === active) ? active : null;
    // someone coming from before worlds: the world they were playing becomes their first one
    if (raw === null && small.getItem(saveKey)) {
      const now = Date.now();
      const first: WorldEntry = { id: newId(), name: 'My world', created: now, played: now, preview: '', creatures: [], width: 0, height: 0 };
      this.entries = [first];
      this.active = first.id;
      this.write();
    }
  }

  // newest played first
  list(): WorldEntry[] {
    return [...this.entries].sort((a, b) => b.played - a.played);
  }

  get activeId(): string | null {
    return this.active;
  }

  entry(id: string): WorldEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  get full(): boolean {
    return this.entries.length >= MOST_WORLDS;
  }

  // always later than anything already in the list, so the one just played is first even within the same moment
  private stamp(): number {
    let latest = Date.now();
    for (const e of this.entries) latest = Math.max(latest, e.played + 1);
    return latest;
  }

  private write(): void {
    this.small.setItem(LIST_KEY, JSON.stringify(this.entries));
    if (this.active) this.small.setItem(ACTIVE_KEY, this.active);
    else this.small.removeItem(ACTIVE_KEY);
  }

  // keeps a copy of a world in the big store, and what it looks like in the list
  async keep(id: string, text: string, summary: WorldSummary): Promise<void> {
    const e = this.entry(id);
    if (!e) return;
    await this.big.put(id, text);
    Object.assign(e, summary, { played: this.stamp() });
    this.write();
  }

  // a new world in the list. it isn't the one you're in until you enter it
  async add(name: string, text: string, summary: WorldSummary): Promise<WorldEntry> {
    if (this.full) throw new Error(`You have ${MOST_WORLDS} worlds already. Delete one first.`);
    const now = this.stamp();
    const e: WorldEntry = { id: newId(), name: name.trim().slice(0, MOST_NAME) || 'A world', created: now, played: now, ...summary };
    await this.big.put(e.id, text);
    this.entries.push(e);
    this.write();
    return e;
  }

  // the saved text of a world. the one you're in is freshest where it's saved as you play
  async text(id: string): Promise<string | null> {
    if (id === this.active) {
      const live = this.small.getItem(this.saveKey);
      if (live) return live;
    }
    return this.big.get(id);
  }

  // the one you're in now. its text should already be where the game saves as it goes
  setActive(id: string | null): void {
    this.active = id && this.entry(id) ? id : null;
    const e = this.active ? this.entry(this.active) : undefined;
    if (e) e.played = this.stamp();
    this.write();
  }

  rename(id: string, name: string): void {
    const e = this.entry(id);
    if (!e || !name.trim()) return;
    e.name = name.trim().slice(0, MOST_NAME);
    this.write();
  }

  // gone for good. if it's the one you're in, there's no world open afterwards
  async remove(id: string): Promise<void> {
    this.entries = this.entries.filter((e) => e.id !== id);
    if (this.active === id) {
      this.active = null;
      this.small.removeItem(this.saveKey);
    }
    this.write();
    await this.big.remove(id);
  }
}

// the browser's bigger store, which can hold many whole worlds
export function indexedStore(): BigStore {
  let opened: Promise<IDBDatabase> | null = null;
  const db = (): Promise<IDBDatabase> =>
    (opened ??= new Promise((resolve, reject) => {
      const req = indexedDB.open('nurtron', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('worlds');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("The world store couldn't be opened."));
    }));
  const run = <T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest): Promise<T> =>
    db().then(
      (d) =>
        new Promise<T>((resolve, reject) => {
          const tx = d.transaction('worlds', mode);
          const req = work(tx.objectStore('worlds'));
          tx.oncomplete = () => resolve(req.result as T);
          tx.onerror = () => reject(tx.error ?? new Error("A world couldn't be saved."));
          tx.onabort = () => reject(tx.error ?? new Error("A world couldn't be saved."));
        }),
    );
  return {
    get: async (id) => {
      const v = await run<unknown>('readonly', (s) => s.get(id));
      return typeof v === 'string' ? v : null;
    },
    put: (id, text) => run<void>('readwrite', (s) => s.put(text, id)),
    remove: (id) => run<void>('readwrite', (s) => s.delete(id)),
  };
}
