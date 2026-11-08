// the first steps: a short list of things to try, which tick themselves off as you do them. it's only for the
// player, so it lives in the app's own storage and never in a world.
const KEY = 'nurtron.guide';

export const STEPS = [
  { id: 'pet', words: 'Click your creature to pet it' },
  { id: 'eat', words: 'Watch it eat something' },
  { id: 'shape', words: 'Pick a shape below, then click to place it' },
  { id: 'tell', words: 'Right-click a thing to send it there' },
  { id: 'inside', words: 'Double-click your creature to look inside' },
  { id: 'wire', words: 'Drag between two ports to wire them up' },
  { id: 'speed', words: 'Press 2 or 3 to speed time up' },
] as const;
export type StepId = (typeof STEPS)[number]['id'];

interface Saved {
  done: StepId[];
  hidden: boolean;
  folded?: boolean; // just the heading, so it takes up less of the room
}

function load(storage: Storage): Saved {
  try {
    const raw = JSON.parse(storage.getItem(KEY) ?? '{}') as { done?: unknown; hidden?: unknown };
    const done = Array.isArray(raw.done) ? raw.done.filter((id): id is StepId => STEPS.some((s) => s.id === id)) : [];
    return { done, hidden: raw.hidden === true, folded: (raw as { folded?: unknown }).folded === true };
  } catch {
    return { done: [], hidden: false };
  }
}

export class Guide {
  private box: HTMLElement;
  private storage: Storage;
  private state: Saved;
  private drawn = '';
  private message: (words: string) => void;

  constructor(box: HTMLElement, storage: Storage, message: (words: string) => void) {
    this.box = box;
    this.storage = storage;
    this.message = message;
    this.state = load(storage);
    this.render();
  }

  get finished(): boolean {
    return STEPS.every((s) => this.state.done.includes(s.id));
  }

  get hidden(): boolean {
    return this.state.hidden;
  }

  // ticks one off, once
  mark(id: StepId): void {
    if (this.state.done.includes(id)) return;
    this.state.done.push(id);
    this.keep();
    if (!this.state.hidden && this.finished) this.message("That's the first steps done. The rest is up to you and your creature.");
    this.render();
  }

  // back from Settings, from the start
  restart(): void {
    this.state = { done: [], hidden: false };
    this.keep();
    this.render();
  }

  hide(): void {
    this.state.hidden = true;
    this.keep();
    this.render();
  }

  private keep(): void {
    try {
      this.storage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      // it just starts again next time
    }
  }

  render(): void {
    const key = `${this.state.hidden}|${this.state.folded}|${this.state.done.join()}`;
    if (key === this.drawn) return;
    this.drawn = key;
    const show = !this.state.hidden && !this.finished;
    this.box.hidden = !show;
    if (!show) return;
    this.box.replaceChildren();
    const head = document.createElement('div');
    head.className = 'guide-head';
    const title = document.createElement('button');
    title.className = 'guide-title';
    title.textContent = `${this.state.folded ? '▸' : '▾'} First steps · ${this.state.done.length} of ${STEPS.length}`;
    title.title = this.state.folded ? 'Show the list' : 'Fold it away';
    title.addEventListener('click', () => {
      this.state.folded = !this.state.folded;
      this.keep();
      this.render();
    });
    const close = document.createElement('button');
    close.className = 'prop-close';
    close.textContent = '✕';
    close.title = 'Hide this. Settings can bring it back.';
    close.setAttribute('aria-label', 'Hide the first steps');
    close.addEventListener('click', () => this.hide());
    head.append(title, close);
    const list = document.createElement('ol');
    for (const step of STEPS) {
      const li = document.createElement('li');
      const done = this.state.done.includes(step.id);
      li.className = done ? 'done' : '';
      li.textContent = step.words;
      list.appendChild(li);
    }
    list.hidden = !!this.state.folded;
    this.box.classList.toggle('folded', !!this.state.folded);
    this.box.append(head, list);
  }
}
