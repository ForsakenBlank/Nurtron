// the Packager's panel: name your tool and choose which sockets go on the outside.
import { packageTool, portChoices } from '../sim/packager.ts';
import type { PackagedTool, PortChoice } from '../sim/packager.ts';
import type { World } from '../sim/world.ts';

export class PackagePanel {
  private el: HTMLElement;
  private getWorld: () => World;
  private made: (tool: PackagedTool) => void;
  private ids: number[] = [];

  constructor(el: HTMLElement, getWorld: () => World, made: (tool: PackagedTool) => void) {
    this.el = el;
    this.getWorld = getWorld;
    this.made = made;
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') this.close();
    });
  }

  close(): void {
    this.el.style.display = 'none';
  }

  open(ids: number[]): void {
    this.ids = ids;
    const world = this.getWorld();
    const things = ids.map((id) => world.thing(id));
    const choices = portChoices(world, ids);
    const sealedCount = new Set(choices.map((c) => c.thingId)).size;
    const left = things.length - sealedCount;
    const el = this.el;
    el.replaceChildren();

    const head = document.createElement('div');
    head.className = 'prop-head';
    const title = document.createElement('b');
    title.textContent = 'Package as a tool';
    const x = document.createElement('button');
    x.className = 'prop-close';
    x.textContent = '✕';
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', () => this.close());
    head.append(title, x);
    el.appendChild(head);

    const name = document.createElement('input');
    name.className = 'prop-name';
    name.value = 'My tool';
    name.maxLength = 30;
    name.setAttribute('aria-label', 'Tool name');
    el.appendChild(name);

    const about = document.createElement('div');
    about.className = 'prop-help';
    about.textContent = sealedCount
      ? `${sealedCount} part${sealedCount === 1 ? '' : 's'} go inside one box.${left ? ` ${left} shape${left === 1 ? '' : 's'}, Button${left === 1 ? '' : 's'} or Sensor${left === 1 ? '' : 's'} stay out where they can be touched.` : ''} Tick what should be on the outside.`
      : 'Nothing here needs a box, so this tool will just place these things, wired up as they are.';
    el.appendChild(about);

    for (const dir of ['in', 'out'] as const) this.list(choices, dir);

    const actions = document.createElement('div');
    actions.className = 'prop-actions';
    const make = document.createElement('button');
    make.id = 'package-make';
    make.textContent = 'Make tool';
    make.addEventListener('click', () => {
      const tool = packageTool(this.getWorld(), this.ids, name.value.trim() || 'My tool', choices);
      this.close();
      if (tool) this.made(tool);
    });
    actions.appendChild(make);
    el.appendChild(actions);

    el.style.display = 'block';
    name.focus();
    name.select();
  }

  private list(choices: PortChoice[], dir: 'in' | 'out'): void {
    const side = choices.filter((c) => c.dir === dir);
    if (side.length === 0) return;
    const heading = document.createElement('div');
    heading.className = 'prop-heading';
    heading.textContent = dir === 'in' ? 'Inputs' : 'Outputs';
    this.el.appendChild(heading);
    const world = this.getWorld();
    for (const choice of side) {
      const row = document.createElement('label');
      row.className = 'package-row';
      row.title = choice.needed ? `${choice.help}. Something staying outside is wired to this, so it has to be there.` : choice.help;
      const tick = document.createElement('input');
      tick.type = 'checkbox';
      tick.checked = choice.wanted || choice.needed;
      tick.disabled = choice.needed;
      tick.addEventListener('change', () => {
        choice.wanted = tick.checked;
      });
      const mark = document.createElement('i');
      mark.className = `port-mark ${choice.kind}`;
      const words = document.createElement('input');
      words.type = 'text';
      words.value = choice.name;
      words.maxLength = 20;
      words.setAttribute('aria-label', 'Name on the outside');
      words.addEventListener('change', () => {
        const typed = words.value.trim();
        // two sockets on the same side can't share a name, because wires find them by it
        if (typed && !choices.some((c) => c !== choice && c.dir === dir && c.name === typed)) choice.name = typed;
        words.value = choice.name;
      });
      const from = document.createElement('span');
      from.className = 'muted';
      from.textContent = world.thing(choice.thingId)?.name ?? '';
      row.append(tick, mark, words, from);
      this.el.appendChild(row);
    }
  }
}
