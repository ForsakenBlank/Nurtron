// the speed buttons in the top bar: the usual few, Max, and one that opens a box for any speed at all
import { cleanSpeed, FASTEST, SLOWEST, speedWords } from '../sim/clock.ts';
import type { Speed } from '../sim/clock.ts';

const PRESETS: Speed[] = [0, 1, 4, 16, 'max'];
const MORE: number[] = [0.1, 0.25, 0.5, 2, 8, 32, 64, 128, 256, 500, 1000];

// the slider goes from slowest to fastest evenly by how many times it doubles, not in a straight line
const toSlider = (s: number): number => Math.round((Math.log(s / SLOWEST) / Math.log(FASTEST / SLOWEST)) * 1000);
const fromSlider = (v: number): number => {
  const s = SLOWEST * (FASTEST / SLOWEST) ** (v / 1000);
  return s < 1 ? Math.round(s * 100) / 100 : s < 10 ? Math.round(s * 10) / 10 : Math.round(s);
};

export interface SpeedControl {
  set(speed: Speed): void;
  showReal(achieved: number, behind: boolean, wanted: Speed): void;
}

export function speedControl(box: HTMLElement, choose: (speed: Speed) => void, step: () => void): SpeedControl {
  const buttons = PRESETS.map((s) => {
    const b = document.createElement('button');
    b.textContent = s === 0 ? 'Pause' : speedWords(s);
    b.title = s === 'max' ? 'As fast as your computer can go (4)' : s === 0 ? 'Pause (Space)' : `${speedWords(s)} speed`;
    b.addEventListener('click', () => choose(s));
    box.appendChild(b);
    return b;
  });
  const holder = document.createElement('div');
  holder.className = 'egg-box';
  const more = document.createElement('button');
  more.id = 'speed-more';
  more.title = 'Any speed you like, slow motion, and stepping one tick at a time';
  more.textContent = '⋯';
  holder.appendChild(more);
  const pop = document.createElement('div');
  pop.className = 'pop-menu speed-pop';
  pop.setAttribute('role', 'dialog');
  pop.innerHTML = `
    <b>Any speed</b>
    <div class="speed-row">
      <input type="range" id="speed-slider" min="0" max="1000" aria-label="Speed" />
      <input type="number" id="speed-number" min="${SLOWEST}" max="${FASTEST}" step="any" aria-label="Speed, as times normal" /><span class="muted">x</span>
    </div>
    <div class="speed-chips"></div>
    <div class="speed-row">
      <button id="speed-step" title="Move time on by one tick (N)">Step one tick</button>
      <span class="muted" id="speed-real"></span>
    </div>
    <div class="muted size-note">Faster than your computer can manage, it goes as fast as it can without freezing up. Max always does.</div>`;
  holder.appendChild(pop);
  box.appendChild(holder);
  const slider = pop.querySelector('#speed-slider') as HTMLInputElement;
  const number = pop.querySelector('#speed-number') as HTMLInputElement;
  const real = pop.querySelector('#speed-real') as HTMLElement;
  const chips = pop.querySelector('.speed-chips') as HTMLElement;
  for (const s of MORE) {
    const chip = document.createElement('button');
    chip.textContent = speedWords(s);
    chip.addEventListener('click', () => choose(s));
    chips.appendChild(chip);
  }
  pop.addEventListener('pointerdown', (e) => e.stopPropagation());
  pop.addEventListener('keydown', (e) => e.stopPropagation());
  more.addEventListener('click', (e) => {
    e.stopPropagation();
    pop.style.display = pop.style.display === 'flex' ? 'none' : 'flex';
  });
  window.addEventListener('pointerdown', () => (pop.style.display = 'none'));
  slider.addEventListener('input', () => choose(fromSlider(Number(slider.value))));
  number.addEventListener('change', () => {
    const s = cleanSpeed(Number(number.value));
    if (s !== 0) choose(s);
  });
  pop.querySelector('#speed-step')?.addEventListener('click', step);

  return {
    set(speed: Speed): void {
      buttons.forEach((b, i) => b.classList.toggle('on', PRESETS[i] === speed));
      const custom = !PRESETS.includes(speed);
      more.classList.toggle('on', custom);
      more.textContent = custom ? speedWords(speed) : '⋯';
      if (typeof speed === 'number' && speed > 0) {
        slider.value = String(toSlider(speed));
        if (document.activeElement !== number) number.value = String(speed);
      }
    },
    showReal(achieved: number, behind: boolean, wanted: Speed): void {
      if (pop.style.display !== 'flex') return;
      real.textContent = wanted === 0 ? 'Paused' : `Really going ${speedWords(Math.max(SLOWEST, achieved))}${behind ? ', as fast as it can' : ''}`;
    },
  };
}
