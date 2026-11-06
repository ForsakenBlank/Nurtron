// the family panel: who this creature is, what its genes make it like, who it's related to, and having babies.
import { STAT_INFO, STATS } from '../sim/examples.ts';
import { stageOf, temperament } from '../sim/family.ts';
import type { Kin } from '../sim/family.ts';
import { TICKS_PER_SECOND } from '../sim/world.ts';
import type { World } from '../sim/world.ts';

export interface FamilyAsks {
  focus(id: number): void;
  sendAway(): void;
  born(name: string): void;
  message(words: string): void;
  statsChanged(): void;
}

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
const STAGE_WORDS = { baby: 'Baby', child: 'Child', adult: 'Grown up' };

export class FamilyPanel {
  private el: HTMLElement;
  private getWorld: () => World;
  private asks: FamilyAsks;
  private drawn = '';
  private partner: number | null = null;

  constructor(el: HTMLElement, getWorld: () => World, asks: FamilyAsks) {
    this.el = el;
    this.getWorld = getWorld;
    this.asks = asks;
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  get isOpen(): boolean {
    return this.el.style.display === 'block';
  }

  toggle(): void {
    this.el.style.display = this.isOpen ? 'none' : 'block';
    this.drawn = '';
    this.refresh();
  }

  // only rebuilt when something in it has changed, so its buttons stay clickable
  refresh(): void {
    if (!this.isOpen) return;
    const world = this.getWorld();
    const c = world.creature;
    const age = world.tick - c.bornTick;
    const key = `${c.id}|${world.statsOf(c).join()}|${stageOf(age)}|${world.creatures.map((o) => `${o.id}:${o.name}:${o.lastBaby}`).join()}|${Object.keys(world.family).length}|${this.partner}|${world.whyNoBaby(c, world.creatureById(this.partner ?? -1) ?? c)}`;
    if (key === this.drawn) return;
    this.drawn = key;
    this.render();
  }

  private render(): void {
    const world = this.getWorld();
    const c = world.creature;
    const el = this.el;
    world.syncFamily();
    el.replaceChildren();

    const head = document.createElement('div');
    head.className = 'prop-head';
    const title = document.createElement('b');
    title.textContent = c.name;
    const x = document.createElement('button');
    x.className = 'prop-close';
    x.textContent = '✕';
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', () => this.toggle());
    head.append(title, x);
    el.appendChild(head);

    const kin = world.family[c.uid];
    const seconds = Math.floor((world.tick - c.bornTick) / TICKS_PER_SECOND);
    const facts = document.createElement('div');
    facts.className = 'prop-help';
    facts.textContent = `${STAGE_WORDS[stageOf(world.tick - c.bornTick)]}, ${Math.floor(seconds / 60)} minutes old. Generation ${(kin?.generation ?? 0) + 1}.${c.deaths ? ` Has died ${c.deaths === 1 ? 'once' : `${c.deaths} times`}.` : ''}`;
    el.appendChild(facts);

    this.heading('What it is like');
    const like = document.createElement('div');
    like.className = 'family-like';
    like.textContent = temperament(c.brain.genes).join(', ');
    el.appendChild(like);

    if (kin) {
      const everyone = Object.values(world.family);
      const parents = kin.parents.map((p) => world.family[p]).filter((k): k is Kin => !!k);
      const grand = parents.flatMap((p) => p.parents.map((g) => world.family[g])).filter((k): k is Kin => !!k);
      const siblings = everyone.filter((k) => k.uid !== kin.uid && kin.parents.length > 0 && k.parents.some((p) => kin.parents.includes(p)));
      const children = everyone.filter((k) => k.parents.includes(kin.uid));
      this.people('Grandparents', grand);
      this.people('Parents', parents);
      this.people('Brothers and sisters', siblings);
      this.people('Children', children);
      if (!parents.length && !children.length) {
        const none = document.createElement('div');
        none.className = 'muted';
        none.textContent = 'No family yet.';
        el.appendChild(none);
      }
    }

    this.heading('Its stats');
    const stats = document.createElement('div');
    stats.className = 'family-stats';
    const has = world.statsOf(c);
    for (const stat of STATS) {
      const row = document.createElement('label');
      row.className = 'stat-row';
      row.title = STAT_INFO[stat].help;
      const tick = document.createElement('input');
      tick.type = 'checkbox';
      tick.checked = has.includes(stat);
      tick.addEventListener('change', () => {
        if (tick.checked) world.addStat(stat, c);
        else world.removeStat(stat, c);
        this.asks.statsChanged();
        this.refresh();
      });
      const words = document.createElement('span');
      words.textContent = STAT_INFO[stat].title;
      row.append(tick, words);
      stats.appendChild(row);
    }
    el.appendChild(stats);

    this.heading('Have a baby');
    const others = world.creatures.filter((o) => o.id !== c.id);
    if (others.length === 0) {
      const none = document.createElement('div');
      none.className = 'muted';
      none.textContent = 'It takes two. Use New egg to bring in someone else, or open a friend\'s creature.';
      el.appendChild(none);
    } else {
      if (!others.some((o) => o.id === this.partner)) this.partner = others[0].id;
      const select = document.createElement('select');
      select.setAttribute('aria-label', 'Who with');
      for (const other of others) {
        const option = document.createElement('option');
        option.value = String(other.id);
        option.textContent = other.name;
        select.appendChild(option);
      }
      select.value = String(this.partner);
      select.addEventListener('change', () => {
        this.partner = Number(select.value);
        this.refresh();
      });
      const partner = world.creatureById(this.partner as number);
      const why = partner ? world.whyNoBaby(c, partner) : 'It takes two.';
      const go = document.createElement('button');
      go.id = 'have-baby';
      go.textContent = 'Have a baby';
      go.disabled = why !== null;
      go.title = why ?? "An egg with their genes mixed and slightly changed. It won't know anything they've learned.";
      go.addEventListener('click', () => {
        const baby = partner && world.haveBaby(c, partner);
        if (baby) this.asks.born(baby.name);
      });
      const row = document.createElement('div');
      row.className = 'prop-actions';
      row.append(select, go);
      el.appendChild(row);
      if (why) {
        const note = document.createElement('div');
        note.className = 'muted';
        note.textContent = why;
        el.appendChild(note);
      }
    }

    const actions = document.createElement('div');
    actions.className = 'prop-actions prop-section';
    const away = document.createElement('button');
    away.id = 'send-away';
    away.textContent = `Send ${c.name} away`;
    away.disabled = world.creatures.length < 2;
    away.title = world.creatures.length < 2 ? "There has to be someone here, so the last one can't go." : 'Gone for good, unless you save them first. They stay in the family tree.';
    away.addEventListener('click', () => this.asks.sendAway());
    actions.appendChild(away);
    el.appendChild(actions);
  }

  private heading(words: string): void {
    const h = document.createElement('div');
    h.className = 'prop-heading';
    h.textContent = words;
    this.el.appendChild(h);
  }

  private people(words: string, list: Kin[]): void {
    if (list.length === 0) return;
    this.heading(words);
    const world = this.getWorld();
    const row = document.createElement('div');
    row.className = 'family-row';
    for (const kin of list) {
      const here = world.creatures.find((o) => o.uid === kin.uid);
      const b = document.createElement('button');
      b.className = 'family-person';
      b.disabled = !here;
      b.title = here ? 'Look at them' : 'Not here any more';
      const dot = document.createElement('i');
      dot.style.background = hex(kin.look.body);
      b.append(dot, kin.name);
      if (here) b.addEventListener('click', () => this.asks.focus(here.id));
      row.appendChild(b);
    }
    this.el.appendChild(row);
  }
}
