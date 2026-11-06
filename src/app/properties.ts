// the right-click properties panel. it works on one thing or a whole selection, and every change can be undone.
import type { Snapshot } from '../sim/edits.ts';
import { SIZE_LIMITS } from '../sim/room-file.ts';
import { ACTIONS } from '../sim/brain.ts';
import type { Action } from '../sim/brain.ts';
import { COMPARE_OPS, LOGIC_OPS, MATH_OPS, MOTOR_MODES, PART_INFO, WANTS } from '../sim/parts.ts';
import type { Part } from '../sim/parts.ts';
import { COLOURS as COLOUR_NAMES } from '../sim/senses.ts';
import type { Thing, ThingSpec, World } from '../sim/world.ts';
import type { Editor } from './editor.ts';
import { COLOURS, feeds } from './scene.ts';

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
const toDegrees = (r: number): number => {
  let d = Math.round((r * 180) / Math.PI) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
};

// things the panel can't do by itself
export interface PanelAsks {
  choosePicture(ids: number[]): void;
  packageThese(ids: number[]): void;
  tell(action: Action, id: number): void;
}

export class PropertiesPanel {
  private el: HTMLElement;
  private ids: number[] = [];
  private getWorld: () => World;
  private editor: Editor;
  private dragBefore: Snapshot | null = null;
  private asks: PanelAsks;

  constructor(el: HTMLElement, getWorld: () => World, editor: Editor, asks: PanelAsks) {
    this.el = el;
    this.getWorld = getWorld;
    this.editor = editor;
    this.asks = asks;
    // clicks and keys in here belong to the panel, not the room behind it
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('wheel', (e) => e.stopPropagation());
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') this.close();
    });
  }

  get isOpen(): boolean {
    return this.el.style.display === 'block';
  }

  open(ids: number[], screenX: number, screenY: number): void {
    this.ids = ids;
    this.render();
    this.el.style.display = 'block';
    const box = this.el.getBoundingClientRect();
    this.el.style.left = `${Math.max(8, Math.min(window.innerWidth - box.width - 8, screenX + 12))}px`;
    this.el.style.top = `${Math.max(8, Math.min(window.innerHeight - box.height - 8, screenY - 40))}px`;
  }

  close(): void {
    this.commitDrag();
    this.el.style.display = 'none';
  }

  private things(): Thing[] {
    return this.ids.map((id) => this.getWorld().thing(id)).filter((t): t is Thing => !!t);
  }

  // one whole change, like ticking a box
  private change(label: string, patch: (t: Thing) => Partial<ThingSpec>): void {
    const world = this.getWorld();
    const before = this.editor.history.capture(world, this.ids);
    for (const t of this.things()) world.update(t.id, patch(t));
    this.editor.history.commit(label, world, before);
  }

  // dragging a slider applies straight away so you can watch it, but only counts as one change for undo
  private slide(patch: (t: Thing) => Partial<ThingSpec>): void {
    const world = this.getWorld();
    this.dragBefore ??= this.editor.history.capture(world, this.ids);
    for (const t of this.things()) world.update(t.id, patch(t));
  }

  private commitDrag(label = 'Change'): void {
    if (!this.dragBefore) return;
    this.editor.history.commit(label, this.getWorld(), this.dragBefore);
    this.dragBefore = null;
  }

  private slider(parent: HTMLElement, label: string, value: number, min: number, max: number, step: number, show: (v: number) => string, patch: (v: number) => (t: Thing) => Partial<ThingSpec>): void {
    const row = document.createElement('label');
    row.className = 'prop-row';
    const name = document.createElement('span');
    name.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.setAttribute('aria-label', label);
    const readout = document.createElement('span');
    readout.className = 'prop-value';
    readout.textContent = show(value);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      readout.textContent = show(v);
      this.slide(patch(v));
    });
    input.addEventListener('change', () => this.commitDrag(`Change ${label.toLowerCase()}`));
    row.append(name, input, readout);
    parent.appendChild(row);
  }

  private toggle(parent: HTMLElement, label: string, help: string, value: boolean, patch: (v: boolean) => Partial<ThingSpec>): void {
    const row = document.createElement('label');
    row.className = 'prop-toggle';
    row.title = help;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    input.addEventListener('change', () => {
      this.change(`Change ${label.toLowerCase()}`, () => patch(input.checked));
      this.render();
    });
    const name = document.createElement('span');
    name.textContent = label;
    row.append(input, name);
    parent.appendChild(row);
  }

  private field(parent: HTMLElement, label: string, help: string, make: (row: HTMLElement) => void): void {
    const row = document.createElement('label');
    row.className = 'prop-field';
    row.title = help;
    const name = document.createElement('span');
    name.textContent = label;
    row.appendChild(name);
    make(row);
    parent.appendChild(row);
  }

  private numberField(parent: HTMLElement, label: string, help: string, value: number, min: number | null, commit: (v: number) => void): void {
    this.field(parent, label, help, (row) => {
      const input = document.createElement('input');
      input.type = 'number';
      input.value = String(value);
      input.step = 'any';
      if (min !== null) input.min = String(min);
      input.addEventListener('change', () => {
        const v = Number(input.value);
        if (input.value === '' || !Number.isFinite(v)) {
          input.value = String(value);
          return;
        }
        commit(min === null ? v : Math.max(min, v));
      });
      row.appendChild(input);
    });
  }

  private textField(parent: HTMLElement, label: string, help: string, value: string, placeholder: string, commit: (v: string) => void): void {
    this.field(parent, label, help, (row) => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = value;
      input.placeholder = placeholder;
      input.maxLength = 200;
      input.addEventListener('change', () => commit(input.value));
      row.appendChild(input);
    });
  }

  private choiceField(parent: HTMLElement, label: string, value: string, choices: readonly string[], commit: (v: string) => void): void {
    this.field(parent, label, '', (row) => {
      const select = document.createElement('select');
      for (const choice of choices) {
        const option = document.createElement('option');
        option.value = choice;
        option.textContent = choice;
        select.appendChild(option);
      }
      select.value = value;
      select.addEventListener('change', () => commit(select.value));
      row.appendChild(select);
    });
  }

  // a number that doesn't have to be there at all
  private optionalField(parent: HTMLElement, label: string, help: string, value: number | undefined, commit: (v: number | undefined) => void): void {
    this.textField(parent, label, help, value === undefined ? '' : String(value), 'none', (typed) => {
      const v = Number(typed);
      commit(typed.trim() === '' || !Number.isFinite(v) ? undefined : v);
    });
  }

  private partChange(label: string, patch: Partial<Part>): void {
    this.change(label, (t) => ({ part: { ...patch, kind: t.part?.kind ?? 'label' } }));
    this.render();
  }

  // the settings that make this part what it is
  private partSection(parent: HTMLElement, t: Thing): void {
    const part = t.part as Part;
    const box = document.createElement('div');
    box.className = 'prop-fields';
    const help = document.createElement('div');
    help.className = 'prop-help';
    help.textContent = PART_INFO[part.kind].help;
    box.appendChild(help);
    switch (part.kind) {
      case 'label':
        this.textField(box, 'Holds', 'A number or some text', String(t.live?.value ?? ''), '', (v) => {
          this.editor.setLabel(t.id, v);
          this.render();
        });
        this.toggle(box, 'Locked', "You can't type into it, though wires can still change it.", !!part.locked, (v) => ({ part: { kind: part.kind, locked: v } }));
        this.optionalField(box, 'Lowest', 'It never goes below this', part.min, (v) => this.partChange('Change label', { min: v }));
        this.optionalField(box, 'Highest', 'It never goes above this', part.max, (v) => this.partChange('Change label', { max: v }));
        break;
      case 'data':
        this.numberField(box, 'Number', 'What it gives', part.base ?? 0, null, (v) => this.partChange('Change data', { base: v }));
        this.numberField(box, 'Spread', 'Base 10 with spread 1 gives 9, 10 or 11', part.spread ?? 0, 0, (v) => this.partChange('Change data', { spread: v }));
        break;
      case 'button':
        this.toggle(box, 'Stays on', 'Its On output stays true until the next press.', !!part.latch, (v) => ({ part: { kind: part.kind, latch: v } }));
        break;
      case 'timer':
        this.numberField(box, 'Seconds', 'Used when nothing is wired to Seconds', part.seconds ?? 1, 0, (v) => this.partChange('Change timer', { seconds: v }));
        break;
      case 'math':
      case 'compare': {
        const ops: readonly string[] = part.kind === 'math' ? MATH_OPS : COMPARE_OPS;
        this.choiceField(box, part.kind === 'math' ? 'Sum' : 'Is A', part.op ?? ops[0], ops, (v) => this.partChange('Change sum', { op: v as Part['op'] }));
        this.numberField(box, 'A', 'Used when nothing is wired to A', part.a ?? 0, null, (v) => this.partChange('Change sum', { a: v }));
        this.numberField(box, 'B', 'Used when nothing is wired to B', part.b ?? 0, null, (v) => this.partChange('Change sum', { b: v }));
        break;
      }
      case 'zone': {
        const has = (part.pull ?? 0) !== 0;
        this.toggle(box, 'Has gravity', 'Off, things drift and creatures float-walk across the background. On, things fall the way you choose.', has, (v) => ({ part: { kind: part.kind, pull: v ? 1 : 0 } }));
        if (has) {
          this.slider(box, 'Strength', part.pull ?? 1, 0.1, 3, 0.1, (v) => `${v.toFixed(1)}x`, (v) => (th) => ({ part: { kind: th.part?.kind ?? 'zone', pull: v } }));
          this.slider(box, 'Direction', part.direction ?? 90, -180, 180, 15, (v) => (v === 90 ? 'down' : v === -90 ? 'up' : `${v}°`), (v) => (th) => ({ part: { kind: th.part?.kind ?? 'zone', direction: v } }));
        }
        break;
      }
      case 'logic':
        this.choiceField(box, 'Does', part.op ?? 'and', LOGIC_OPS, (v) => this.partChange('Change logic', { op: v as Part['op'] }));
        break;
      case 'random':
        this.numberField(box, 'From', 'The lowest it can be', part.a ?? 0, null, (v) => this.partChange('Change random', { a: v }));
        this.numberField(box, 'To', 'The highest it can be', part.b ?? 100, null, (v) => this.partChange('Change random', { b: v }));
        break;
      case 'delay':
        this.numberField(box, 'Seconds', 'Used when nothing is wired to Seconds', part.seconds ?? 1, 0, (v) => this.partChange('Change delay', { seconds: v }));
        break;
      case 'spawner':
        this.numberField(box, 'At most', 'How many of its copies can be around at once', part.most ?? 20, 1, (v) => this.partChange('Change spawner', { most: Math.min(200, Math.round(v)) }));
        break;
      case 'teleport':
        this.numberField(box, 'To x', 'Used when nothing is wired to X', part.a ?? 0, null, (v) => this.partChange('Change teleport', { a: v }));
        this.numberField(box, 'To y', 'Used when nothing is wired to Y', part.b ?? 0, null, (v) => this.partChange('Change teleport', { b: v }));
        break;
      case 'hit':
        this.textField(box, 'Only notice', 'A tag to look for. "creature" means creatures. Empty notices everything', part.tag ?? '', 'anything', (v) => this.partChange('Change collision', { tag: v.trim().slice(0, 40) }));
        this.toggle(box, 'Removes it', 'Whatever it hits disappears, like a coin or something a bullet hit.', !!part.removes, (v) => ({ part: { kind: part.kind, removes: v } }));
        break;
      case 'paint':
      case 'burst':
        this.choiceField(box, 'Colour', part.tint ?? 'red', COLOUR_NAMES, (v) => this.partChange('Change colour', { tint: v as Part['tint'] }));
        break;
      case 'keyboard':
        this.field(box, 'Key', 'Click here and press the key you want', (row) => {
          const input = document.createElement('input');
          input.type = 'text';
          input.readOnly = true;
          input.value = part.key === ' ' ? 'Space' : (part.key ?? '');
          input.addEventListener('keydown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.key === 'Escape' || e.key === 'Tab') return;
            this.partChange('Change key', { key: e.key.slice(0, 20) });
          });
          row.appendChild(input);
        });
        break;
      case 'camera':
        this.slider(box, 'Zoom', part.zoom ?? 1, 0.1, 4, 0.1, (v) => `${v.toFixed(1)}x`, (v) => (th) => ({ part: { kind: th.part?.kind ?? 'camera', zoom: v } }));
        break;
      case 'sound':
        this.numberField(box, 'Pitch', 'How high, in hertz. 440 is the A above middle C', part.pitch ?? 440, 20, (v) => this.partChange('Change sound', { pitch: Math.min(8000, v) }));
        this.numberField(box, 'Seconds', 'How long it plays', part.seconds ?? 0.2, 0.01, (v) => this.partChange('Change sound', { seconds: Math.min(5, v) }));
        break;
      case 'say':
      case 'hear':
        this.textField(box, 'Word', part.kind === 'say' ? 'What it says' : 'What it listens for', part.word ?? '', 'a word', (v) => this.partChange('Change word', { word: v.trim().slice(0, 24) }));
        break;
      case 'sensor':
        this.textField(box, 'Only notice', 'A tag to look for. "creature" means your creature. Empty notices everything', part.tag ?? '', 'anything', (v) => this.partChange('Change sensor', { tag: v.trim().slice(0, 40) }));
        break;
      case 'give': {
        const names = this.getWorld().circuit.labelNames();
        const target = part.target ?? '';
        this.choiceField(box, 'Changes', target, names.includes(target) ? [...new Set(names)] : [target, ...new Set(names)], (v) => this.partChange('Change give', { target: v }));
        this.numberField(box, 'By', 'How much to add. Below zero takes away', part.amount ?? 0, null, (v) => this.partChange('Change give', { amount: v }));
        break;
      }
      case 'drive': {
        const wants = part.wants ?? 'high';
        this.choiceField(box, 'Wants it', wants, WANTS, (v) => this.partChange('Change drive', { wants: v as Part['wants'] }));
        if (wants === 'near') this.numberField(box, 'Near', 'The number it wants to be close to', part.aim ?? 50, null, (v) => this.partChange('Change drive', { aim: v }));
        this.numberField(box, 'Full at', 'What counts as all the way up', part.scale ?? 100, 0.001, (v) => this.partChange('Change drive', { scale: v }));
        break;
      }
      case 'nerve':
        this.numberField(box, 'Full at', 'What counts as fully on', part.scale ?? 1, 0.001, (v) => this.partChange('Change nerve', { scale: v }));
        break;
      case 'action':
        this.choiceField(box, 'Watches', part.action ?? 'rest', ACTIONS, (v) => this.partChange('Change action', { action: v as Part['action'] }));
        break;
      case 'motor': {
        this.choiceField(box, 'Does', part.mode ?? 'push', MOTOR_MODES, (v) => this.partChange('Change motor', { mode: v as Part['mode'] }));
        if (part.mode !== 'spin') this.slider(box, 'Direction', part.direction ?? -90, -180, 180, 15, (v) => `${v}°`, (v) => (th) => ({ part: { kind: th.part?.kind ?? 'motor', direction: v } }));
        this.slider(box, 'Power', part.power ?? 50, -200, 200, 5, String, (v) => (th) => ({ part: { kind: th.part?.kind ?? 'motor', power: v } }));
        break;
      }
      default:
        break;
    }
    parent.appendChild(box);
  }

  private render(): void {
    const things = this.things();
    const el = this.el;
    el.replaceChildren();
    if (things.length === 0) {
      this.close();
      return;
    }
    const first = things[0];
    const one = things.length === 1;

    const head = document.createElement('div');
    head.className = 'prop-head';
    if (one) {
      const name = document.createElement('input');
      name.className = 'prop-name';
      name.value = first.name;
      name.maxLength = 40;
      name.setAttribute('aria-label', 'Name');
      name.addEventListener('change', () => this.change('Rename', () => ({ name: name.value || first.form })));
      head.appendChild(name);
    } else {
      const title = document.createElement('b');
      title.textContent = `${things.length} things`;
      head.appendChild(title);
    }
    const close = document.createElement('button');
    close.className = 'prop-close';
    close.textContent = '✕';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => this.close());
    head.appendChild(close);
    el.appendChild(head);

    const swatches = document.createElement('div');
    swatches.className = 'swatches';
    for (const colour of COLOUR_NAMES) {
      const b = document.createElement('button');
      b.className = `swatch${first.colour === colour ? ' on' : ''}`;
      b.style.background = hex(COLOURS[colour]);
      b.title = colour;
      b.setAttribute('aria-label', colour);
      b.addEventListener('click', () => {
        this.change('Change colour', () => ({ colour }));
        this.render();
      });
      swatches.appendChild(b);
    }
    el.appendChild(swatches);

    // a creature can only be sent to what it can see, which is shapes and buttons
    if (one && !first.inBody && (!first.part || first.part.kind === 'button')) {
      const told = document.createElement('div');
      told.className = 'prop-section';
      const heading = document.createElement('div');
      heading.className = 'prop-heading';
      heading.textContent = `Tell ${this.getWorld().creature.name} to`;
      told.appendChild(heading);
      const row = document.createElement('div');
      row.className = 'prop-actions tell-row';
      const ORDERS: [Action, string][] = [['approach', 'Go to it'], ['touch', 'Touch it'], ['grab', 'Grab it'], ['push', 'Push it'], ['avoid', 'Avoid it']];
      for (const [action, words] of ORDERS) {
        const b = document.createElement('button');
        b.textContent = words;
        b.title = 'Adds this to what it has been told to do. Click more to give it a list, like go here, then touch that.';
        b.addEventListener('click', () => this.asks.tell(action, first.id));
        row.appendChild(b);
      }
      told.appendChild(row);
      el.appendChild(told);
    }

    const onlyPart = one && !!first.part;
    if (onlyPart) this.partSection(el, first);

    const toggles = document.createElement('div');
    toggles.className = 'prop-toggles';
    // nothing inside a creature has anywhere to fall
    if (!first.inBody) this.toggle(toggles, 'Gravity', 'Falls by itself. Off, it floats where you leave it.', first.gravity, (v) => ({ gravity: v }));
    if (!first.inBody) this.toggle(toggles, 'Fixed', "Stays where it is, whatever hits it.", first.fixed, (v) => ({ fixed: v }));
    if (!first.inBody) this.toggle(toggles, 'Solid', "Other things bump into it. Off, they pass straight through.", first.solid, (v) => ({ solid: v }));
    if (!first.inBody && !first.part) this.toggle(toggles, 'Climbable', 'A creature can climb it, like a ladder or a wall with handholds.', !!first.climbable, (v) => ({ climbable: v || undefined }));
    if (!first.inBody && !first.part) this.toggle(toggles, 'Hidden', "Nobody can see it, including creatures. It shows faintly while you're building. A Spawner can use a hidden shape as its pattern.", !!first.hidden, (v) => ({ hidden: v || undefined }));
    el.appendChild(toggles);

    const sliders = document.createElement('div');
    sliders.className = 'prop-sliders';
    if (one) {
      const size = (v: number): string => String(Math.round(v));
      // most parts are a set size to fit their ports, but a sensor's area and a button are yours to choose
      const sizes = !first.part || first.part.kind === 'sensor' || first.part.kind === 'zone' || first.part.kind === 'button';
      if (!sizes) {
        // nothing to resize
      } else if (first.form === 'circle') {
        this.slider(sliders, 'Size', first.hw * 2, SIZE_LIMITS.min * 2, SIZE_LIMITS.max, 2, size, (v) => () => ({ hw: v / 2, hh: v / 2 }));
      } else {
        this.slider(sliders, 'Width', first.hw * 2, SIZE_LIMITS.min * 2, SIZE_LIMITS.max * 2, 2, size, (v) => () => ({ hw: v / 2 }));
        this.slider(sliders, 'Height', first.hh * 2, SIZE_LIMITS.min * 2, SIZE_LIMITS.max * 2, 2, size, (v) => () => ({ hh: v / 2 }));
      }
      this.slider(sliders, 'Rotation', toDegrees(first.angle), -180, 180, 1, (v) => `${v}°`, (v) => () => ({ angle: (v * Math.PI) / 180 }));
    }
    const percent = (v: number): string => `${Math.round(v * 100)}%`;
    // a part on the wall doesn't touch anything, so these would only be clutter until it's set loose
    const physical = !first.inBody && (!first.part || !first.fixed || first.solid);
    if (physical) this.slider(sliders, 'Bounce', first.bounce, 0, 1, 0.05, percent, (v) => () => ({ bounce: v }));
    if (physical) this.slider(sliders, 'Grip', first.friction, 0, 1, 0.05, percent, (v) => () => ({ friction: v }));
    if (physical) this.slider(sliders, 'Weight', first.weight, 0.1, 10, 0.1, (v) => v.toFixed(1), (v) => () => ({ weight: v }));
    el.appendChild(sliders);

    if (things.every((t) => !t.part)) {
      const pictures = document.createElement('div');
      pictures.className = 'prop-actions prop-section';
      const choose = document.createElement('button');
      choose.textContent = 'Picture';
      choose.title = 'Put a picture on it. You can also drag an image straight onto a shape. A creature sees the colour the picture mostly is.';
      choose.addEventListener('click', () => {
        this.asks.choosePicture(this.ids);
        this.close();
      });
      pictures.appendChild(choose);
      if (things.some((t) => t.texture)) {
        const plain = document.createElement('button');
        plain.textContent = 'Remove picture';
        plain.addEventListener('click', () => {
          this.editor.removePicture(this.ids);
          this.render();
        });
        pictures.appendChild(plain);
      }
      el.appendChild(pictures);
    }

    if (one && !first.part) {
      const tags = document.createElement('div');
      tags.className = 'prop-fields prop-section';
      this.textField(tags, 'Tags', 'Words a sensor can look for, split up with commas', (first.tags ?? []).join(', '), 'none', (v) => {
        const words = v.split(',').map((w) => w.trim().slice(0, 40)).filter(Boolean).slice(0, 12);
        this.change('Change tags', () => ({ tags: words.length ? words : undefined }));
      });
      el.appendChild(tags);
    }

    const touched = document.createElement('div');
    touched.className = 'prop-sliders prop-section';
    const heading = document.createElement('div');
    heading.className = 'prop-heading';
    heading.textContent = 'When touched by a creature';
    touched.appendChild(heading);
    this.slider(touched, 'Feeds', first.give ? feeds(first.give) : 0, -50, 50, 1, (v) => (v > 0 ? `+${v}` : String(v)), (v) => () => ({ give: v === 0 ? undefined : { drive: 'Hunger', amount: -v } }));
    const usedUp = document.createElement('div');
    usedUp.className = 'prop-toggles';
    this.toggle(usedUp, 'Used up', 'Disappears when touched.', !!first.eaten, (v) => ({ eaten: v || undefined, respawnSeconds: v ? first.respawnSeconds : undefined }));
    touched.appendChild(usedUp);
    if (first.eaten) {
      this.slider(touched, 'Comes back', first.respawnSeconds ?? 0, 0, 60, 1, (v) => (v === 0 ? 'never' : `${v}s`), (v) => () => ({ respawnSeconds: v === 0 ? undefined : v }));
    }
    if (!first.part || first.part.kind === 'button') el.appendChild(touched);

    const actions = document.createElement('div');
    actions.className = 'prop-actions';
    const duplicate = document.createElement('button');
    duplicate.textContent = 'Duplicate';
    duplicate.addEventListener('click', () => {
      this.editor.copy();
      this.editor.paste();
      this.close();
    });
    const remove = document.createElement('button');
    remove.textContent = 'Delete';
    remove.addEventListener('click', () => this.editor.deleteSelected());
    actions.append(duplicate, remove);
    if (first.part?.kind === 'tool' && one) {
      const unpack = document.createElement('button');
      unpack.textContent = 'Unpack';
      unpack.title = 'Let everything out of the box, wired up the same, so you can see and change it.';
      unpack.addEventListener('click', () => this.editor.unpack(first.id));
      actions.append(unpack);
    }
    const pack = document.createElement('button');
    pack.textContent = 'Package';
    pack.title = 'Turn this into your own reusable tool (G).';
    pack.addEventListener('click', () => {
      this.asks.packageThese(this.ids);
      this.close();
    });
    actions.append(pack);
    el.appendChild(actions);
  }
}
