// the customise panel: which skin your creature wears and what colours it comes in. nothing here touches its brain.
import { DEFAULT_LOOK, PALETTES, SKIN_NAMES, SKINS } from '../sim/look.ts';
import type { Look, Skin } from '../sim/look.ts';

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

const COLOUR_ROWS: { key: 'body' | 'belly' | 'accent' | 'eyes'; label: string; help: string }[] = [
  { key: 'body', label: 'Body', help: 'Its main colour' },
  { key: 'belly', label: 'Belly', help: 'Its tummy, inner ears and the bulb on its head' },
  { key: 'accent', label: 'Markings', help: 'Spots, stripes, feet and the stem on its head' },
  { key: 'eyes', label: 'Eyes', help: 'Its pupils and mouth' },
];

export class CustomisePanel {
  private el: HTMLElement;
  private getLook: () => Look;
  private setLook: (look: Look) => void;
  private picture: (look: Look) => HTMLCanvasElement;
  private cards = new Map<Skin, HTMLButtonElement>();
  private pictures = new Map<Skin, HTMLElement>();
  private inputs = new Map<string, HTMLInputElement>();
  private waiting = false;

  constructor(el: HTMLElement, getLook: () => Look, setLook: (look: Look) => void, picture: (look: Look) => HTMLCanvasElement) {
    this.el = el;
    this.getLook = getLook;
    this.setLook = setLook;
    this.picture = picture;
    // clicks and keys in here belong to the panel, not the room behind it
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') this.close();
    });
    this.build();
  }

  get isOpen(): boolean {
    return this.el.style.display === 'block';
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    this.el.style.display = 'block';
    this.sync();
  }

  close(): void {
    this.el.style.display = 'none';
  }

  private change(patch: Partial<Look>): void {
    this.setLook({ ...this.getLook(), ...patch });
    this.sync();
  }

  private build(): void {
    const el = this.el;
    const head = document.createElement('div');
    head.className = 'prop-head';
    const title = document.createElement('b');
    title.textContent = 'Customise';
    const close = document.createElement('button');
    close.className = 'prop-close';
    close.textContent = '✕';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => this.close());
    head.append(title, close);

    const grid = document.createElement('div');
    grid.className = 'skin-grid';
    for (const skin of SKINS) {
      const card = document.createElement('button');
      card.className = 'skin-card';
      const picture = document.createElement('span');
      picture.className = 'skin-picture';
      const name = document.createElement('span');
      name.textContent = SKIN_NAMES[skin];
      card.append(picture, name);
      card.addEventListener('click', () => this.change({ skin }));
      grid.appendChild(card);
      this.cards.set(skin, card);
      this.pictures.set(skin, picture);
    }

    const paletteHead = document.createElement('div');
    paletteHead.className = 'prop-heading';
    paletteHead.textContent = 'Colours';
    const palettes = document.createElement('div');
    palettes.className = 'swatches palette-row';
    for (const p of PALETTES) {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.style.background = `linear-gradient(135deg, ${hex(p.body)} 55%, ${hex(p.belly)} 55%)`;
      b.title = p.name;
      b.setAttribute('aria-label', p.name);
      b.addEventListener('click', () => this.change({ body: p.body, belly: p.belly, accent: p.accent }));
      palettes.appendChild(b);
    }

    const rows = document.createElement('div');
    rows.className = 'colour-rows';
    for (const row of COLOUR_ROWS) {
      const label = document.createElement('label');
      label.className = 'colour-row';
      label.title = row.help;
      const name = document.createElement('span');
      name.textContent = row.label;
      const input = document.createElement('input');
      input.type = 'color';
      input.addEventListener('input', () => this.change({ [row.key]: Number.parseInt(input.value.slice(1), 16) }));
      label.append(name, input);
      rows.appendChild(label);
      this.inputs.set(row.key, input);
    }

    const actions = document.createElement('div');
    actions.className = 'prop-actions';
    const surprise = document.createElement('button');
    surprise.textContent = 'Surprise me';
    surprise.addEventListener('click', () => this.surprise());
    const reset = document.createElement('button');
    reset.textContent = 'Reset';
    reset.addEventListener('click', () => this.change({ ...DEFAULT_LOOK }));
    actions.append(surprise, reset);

    const note = document.createElement('div');
    note.className = 'muted customise-note';
    note.textContent = "It can't see itself, so this changes nothing about how it thinks.";

    el.append(head, grid, paletteHead, palettes, rows, actions, note);
  }

  // decoration uses the screen's own randomness, so it can never change how a seeded world plays out
  private surprise(): void {
    const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
    this.change({ skin: SKINS[Math.floor(Math.random() * SKINS.length)], body: palette.body, belly: palette.belly, accent: palette.accent });
  }

  // dragging around a colour picker changes the look many times a second, so the pictures catch up once a frame
  private sync(): void {
    if (this.waiting) return;
    this.waiting = true;
    requestAnimationFrame(() => {
      this.waiting = false;
      const look = this.getLook();
      for (const skin of SKINS) {
        this.cards.get(skin)?.classList.toggle('on', look.skin === skin);
        this.pictures.get(skin)?.replaceChildren(this.picture({ ...look, skin }));
      }
      for (const row of COLOUR_ROWS) {
        const input = this.inputs.get(row.key);
        if (input && document.activeElement !== input) input.value = hex(look[row.key]);
      }
    });
  }
}
