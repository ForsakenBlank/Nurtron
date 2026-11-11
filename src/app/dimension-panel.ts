// the Dimensions panel: make ghost copies of your world, set how fast each goes, look into them, delete them, and see
// how much faster your creature is learning, with a benchmark that finds the best setup for this computer.
import { cleanSpeed, speedWords } from '../sim/clock.ts';
import type { Speed } from '../sim/clock.ts';
import { TICKS_PER_SECOND } from '../sim/world.ts';
import { bestSetup, MOST_DIMENSIONS } from './dimensions.ts';
import type { BenchResult, Dimensions } from './dimensions.ts';

export interface DimensionPanelDeps {
  dims: Dimensions;
  toast: (text: string) => void;
  enter: (id: number) => void;
  mainSpeed: () => number; // how fast the real world is really going
}

const esc = (text: string): string => text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);

// a length of game time, in the biggest units that make sense
export function lifeWords(ticks: number): string {
  const s = ticks / TICKS_PER_SECOND;
  if (s < 90) return `${Math.round(s)}s`;
  if (s < 5400) return `${Math.round(s / 60)}m`;
  if (s < 86400 * 2) return `${(s / 3600).toFixed(1)}h`;
  return `${(s / 86400).toFixed(1)} days`;
}

const big = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n)));

function readSpeed(text: string): Speed | null {
  const t = text.trim().toLowerCase().replace(/x$/, '');
  if (t === 'max') return 'max';
  const s = cleanSpeed(Number(t));
  return s === 0 ? null : s;
}

export function dimensionPanel(deps: DimensionPanelDeps): { toggle(): void; open(): void; render(): void; isOpen(): boolean } {
  const { dims, toast } = deps;
  const box = document.createElement('div');
  box.id = 'dims';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Dimensions');
  box.innerHTML = `
    <div class="prop-head"><b>Dimensions</b><button class="prop-close" id="dims-close" aria-label="Close">✕</button></div>
    <div class="muted dims-about">Copies of your world, each with ghosts of your creatures. They all share one brain: every few seconds, what every ghost learned goes into your real creature. More dimensions, or faster ones, means it learns faster.</div>
    <div class="dims-add">
      <label>Make <input type="number" id="dims-count" min="1" max="${MOST_DIMENSIONS}" value="4" /></label>
      <label>at <input type="text" id="dims-speed" value="16" title="Any speed, like 4, 64 or 0.5, or Max" /></label>
      <button id="dims-make" class="primary">Make</button>
      <span class="spacer"></span>
      <button id="dims-clear" class="danger" title="Delete every dimension. What they already taught your creature stays.">Delete all</button>
    </div>
    <div class="dims-options">
      <label title="Ghosts start in different places, so they don't all do the same thing"><input type="checkbox" id="dims-scatter" /> Start ghosts in different places</label>
      <label title="A ghost that dies learns what went wrong, then comes straight back"><input type="checkbox" id="dims-revive" /> Ghosts come back when they die</label>
      <label>Share learning every <input type="number" id="dims-sync" min="1" max="120" /> s</label>
      <label title="Each dimension starts again from your world every so often, so changes you make reach the ghosts. 0 is never.">Refresh from your world every <input type="number" id="dims-refresh" min="0" max="120" /> min</label>
      <span class="dims-buttons"><button id="dims-sync-now">Share now</button><button id="dims-refresh-now" title="Every dimension starts again from your world as it is now, with the shared brain">Refresh all</button></span>
    </div>
    <div class="dims-totals" id="dims-totals"></div>
    <canvas id="dims-graph" height="70"></canvas>
    <div class="dims-legend muted"><span class="key speed"></span>Total speed <span class="key learn"></span>Learning per minute</div>
    <div class="dims-bench">
      <button id="dims-bench" title="Tries different numbers of dimensions at Max for a few seconds each, to see what this computer does best">Find the best setup</button>
      <span class="muted" id="dims-bench-note">Tries a few setups at Max on this computer. Takes about half a minute.</span>
      <div id="dims-bench-results"></div>
    </div>
    <div class="dims-list" id="dims-list"></div>`;
  document.body.appendChild(box);
  box.addEventListener('pointerdown', (e) => e.stopPropagation());
  box.addEventListener('keydown', (e) => e.stopPropagation());
  box.addEventListener('wheel', (e) => e.stopPropagation());
  const $ = <T extends HTMLElement>(id: string): T => box.querySelector(`#${id}`) as T;

  const scatter = $<HTMLInputElement>('dims-scatter');
  const revive = $<HTMLInputElement>('dims-revive');
  const sync = $<HTMLInputElement>('dims-sync');
  const refresh = $<HTMLInputElement>('dims-refresh');
  const syncOptions = (): void => {
    scatter.checked = dims.scatter;
    revive.checked = dims.revive;
    sync.value = String(dims.syncSeconds);
    refresh.value = String(dims.refreshMinutes);
  };
  syncOptions();
  scatter.addEventListener('change', () => {
    dims.scatter = scatter.checked;
    dims.saveSettings();
  });
  revive.addEventListener('change', () => {
    dims.revive = revive.checked;
    dims.saveSettings();
  });
  sync.addEventListener('change', () => {
    dims.syncSeconds = Math.max(1, Math.min(120, Number(sync.value) || 5));
    dims.saveSettings();
  });
  refresh.addEventListener('change', () => {
    dims.refreshMinutes = Math.max(0, Math.min(120, Number(refresh.value) || 0));
    dims.saveSettings();
  });

  $('dims-close').addEventListener('click', () => toggle());
  $('dims-make').addEventListener('click', async () => {
    const speed = readSpeed($<HTMLInputElement>('dims-speed').value);
    if (!speed) return toast('That speed should be a number, like 16, or Max.');
    const count = Math.max(1, Math.min(MOST_DIMENSIONS, Math.round(Number($<HTMLInputElement>('dims-count').value) || 1)));
    const made = await dims.add(count, speed);
    if (!made) toast(`That's as many dimensions as there can be (${MOST_DIMENSIONS}).`);
    else toast(`${made === 1 ? 'A new dimension is' : `${made} new dimensions are`} running at ${speedWords(speed)}. Your creature learns from every ghost.`);
  });
  $('dims-clear').addEventListener('click', () => {
    if (!dims.count) return;
    if (!confirm(`Delete all ${dims.count} dimensions? What they already taught your creature stays.`)) return;
    dims.clear();
    toast('Every dimension is gone. What they taught stays.');
  });
  $('dims-sync-now').addEventListener('click', () => void dims.sync());
  $('dims-refresh-now').addEventListener('click', () => void dims.sync(true));

  let bench: BenchResult[] = [];
  $('dims-bench').addEventListener('click', async () => {
    const cores = navigator.hardwareConcurrency || 4;
    const counts = [1, 2, 4, 6, 8, 12, 16, 24].filter((n) => n <= Math.max(2, Math.min(MOST_DIMENSIONS, cores * 2)));
    const button = $<HTMLButtonElement>('dims-bench');
    button.disabled = true;
    bench = await dims.benchmark(counts, 3, (text) => ($('dims-bench-note').textContent = text));
    button.disabled = false;
    $('dims-bench-note').textContent = 'Done. The numbers are how many times normal speed every dimension adds up to, at Max.';
    renderBench();
  });

  function renderBench(): void {
    const best = bestSetup(bench);
    const top = Math.max(1, ...bench.map((r) => r.speed));
    const one = bench.find((r) => r.count === 1);
    const rows = bench
      .map((r) => `<div class="bench-row${r === best ? ' best' : ''}"><span>${r.count} at Max</span><div class="bar"><i style="width:${Math.round((r.speed / top) * 100)}%"></i></div><span>${big(r.speed)}x total</span><span class="muted">${big(r.each)}x each</span></div>`)
      .join('');
    const words = best
      ? `<p><b>Best here: ${best.count} dimension${best.count === 1 ? '' : 's'} at Max</b>, about ${big(best.speed)}x normal speed in all${one && best.count > 1 ? `, ${(best.speed / Math.max(1, one.speed)).toFixed(1)} times what one fast dimension gives` : ''}. More than that and they start to slow each other down.</p>
         <button id="dims-use-best">Use this setup</button>`
      : '';
    $('dims-bench-results').innerHTML = rows + words;
    box.querySelector('#dims-use-best')?.addEventListener('click', async () => {
      if (!best) return;
      dims.clear();
      await dims.add(best.count, 'max');
      toast(`${best.count} dimension${best.count === 1 ? '' : 's'} running at Max.`);
    });
  }

  function drawGraph(): void {
    const canvas = $<HTMLCanvasElement>('dims-graph');
    const width = canvas.clientWidth || 500;
    if (canvas.width !== width) canvas.width = width;
    const g = canvas.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, canvas.width, canvas.height);
    const points = dims.history;
    if (points.length < 2) {
      g.fillStyle = '#9096ad';
      g.font = '12px sans-serif';
      g.fillText(dims.count ? 'Gathering numbers...' : 'Make some dimensions to see them here.', 8, 38);
      return;
    }
    const line = (values: number[], colour: string): void => {
      const top = Math.max(1e-6, ...values);
      g.strokeStyle = colour;
      g.lineWidth = 2;
      g.beginPath();
      values.forEach((v, i) => {
        const x = (i / (values.length - 1)) * (canvas.width - 4) + 2;
        const y = canvas.height - 4 - (v / top) * (canvas.height - 10);
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.stroke();
    };
    line(points.map((p) => p.speed), '#4fd6c3');
    line(points.map((p) => p.learning), '#ffb454');
  }

  function render(): void {
    if (box.style.display !== 'block') return;
    const t = dims.totals();
    const main = deps.mainSpeed();
    const all = t.speed + main;
    const tile = (label: string, value: string, hint: string): string => `<div class="tile" title="${esc(hint)}"><span class="muted">${label}</span><b>${value}</b></div>`;
    $('dims-totals').innerHTML = [
      tile('Dimensions', `${t.dimensions}`, `${t.threads} running in threads of their own`),
      tile('Ghosts', `${t.ghosts}`, 'Creatures in every dimension, all learning for the real ones'),
      tile('Total speed', `${speedWords(Math.round(all * 10) / 10 || 0)}`, `Every dimension's real speed added up, plus your world's (${speedWords(Math.round(main * 10) / 10 || 0)})`),
      tile('Learning faster by', `${main > 0.05 ? `${(all / main).toFixed(1)}x` : '-'}`, 'How much more life the shared brain gets than your world alone gives it, at the speed it is going'),
      tile('Life lived', lifeWords(t.ticks), 'Game time every dimension has run for, added up'),
      tile('Learning / min', t.learningPerMinute.toFixed(2), 'How much the shared brain changed in the last minute, from what the ghosts learned'),
      tile('Decisions', big(t.decisions), 'Choices every ghost has made'),
      tile('Food eaten', big(t.ate), 'Times a ghost ate something that helped'),
      tile('Deaths', big(t.deaths), 'Ghosts that died, and learned from it, so yours does not have to'),
      tile('Gave up', big(t.gaveUp), "Times a ghost couldn't get to something"),
      tile('Shares', `${t.syncs}`, `Times every ghost's learning has been added up. The last took ${t.lastSyncMs.toFixed(0)} ms`),
      tile('Cores', `${t.cores}`, 'How many things this computer can do at once. Dimensions in threads spread over them'),
    ].join('');
    if (!dims.threads && dims.count) $('dims-totals').innerHTML += `<div class="muted dims-warn">Threads aren't available here, so dimensions share the window's time and are slower.</div>`;
    drawGraph();
    renderList();
  }

  // rows are kept and updated in place, so a button is never swapped out from under the mouse mid-click
  const rows = new Map<number, HTMLElement>();
  function renderList(): void {
    const list = $('dims-list');
    const totalLearned = dims.list.reduce((sum, d) => sum + d.learned, 0) || 1;
    let head = list.querySelector('.head');
    let empty = list.querySelector<HTMLElement>('.dims-empty');
    if (!head) {
      list.innerHTML = `<div class="dim-row head muted"><span>Name</span><span>Speed</span><span>Really</span><span>Lived</span><span>Ate</span><span>Died</span><span>Share</span><span></span></div><div class="muted dims-empty">No dimensions yet. Make a few to give your creature more life to learn from.</div>`;
      head = list.querySelector('.head');
      empty = list.querySelector<HTMLElement>('.dims-empty');
    }
    (head as HTMLElement).hidden = !dims.list.length;
    if (empty) empty.hidden = dims.list.length > 0;
    for (const [id, row] of rows) {
      if (dims.get(id)) continue;
      row.remove();
      rows.delete(id);
    }
    for (const d of dims.list) {
      let row = rows.get(d.id);
      if (!row) {
        row = document.createElement('div');
        row.className = 'dim-row';
        row.dataset.id = String(d.id);
        row.innerHTML = `<input class="dim-name" aria-label="Name" />
          <input class="dim-speed" title="Any speed, or Max" aria-label="Speed" />
          <span class="c-really"></span><span class="c-lived"></span><span class="c-ate"></span><span class="c-died"></span>
          <span title="Its share of everything the ghosts have taught"><div class="bar"><i class="c-share"></i></div></span>
          <span class="dim-actions">
            <button data-act="pause"></button>
            <button data-act="view" title="Look into this dimension">Look</button>
            <button data-act="delete" class="danger" title="Delete this dimension" aria-label="Delete">✕</button>
          </span>`;
        list.appendChild(row);
        rows.set(d.id, row);
      }
      const s = d.backend.stats;
      const set = (cls: string, text: string): void => {
        const el = row.querySelector(`.${cls}`) as HTMLElement;
        if (el.textContent !== text) el.textContent = text;
      };
      row.classList.toggle('viewing', dims.viewing === d.id);
      const name = row.querySelector('.dim-name') as HTMLInputElement;
      const speed = row.querySelector('.dim-speed') as HTMLInputElement;
      if (document.activeElement !== name) name.value = d.name;
      if (document.activeElement !== speed) speed.value = speedWords(d.speed).replace(/x$/, '');
      set('c-really', d.paused ? 'paused' : speedWords(Math.round(s.speed * 10) / 10 || 0));
      set('c-lived', lifeWords(s.ticks));
      set('c-ate', big(s.ate));
      set('c-died', big(s.deaths));
      (row.querySelector('.c-share') as HTMLElement).style.width = `${Math.round((d.learned / totalLearned) * 100)}%`;
      const pause = row.querySelector('[data-act="pause"]') as HTMLButtonElement;
      pause.textContent = d.paused ? '▶' : '❚❚';
      pause.title = d.paused ? 'Carry on' : 'Pause this dimension';
    }
  }

  // the list is redrawn often, so typing into it is handled once, here
  const list = $('dims-list');
  list.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest('button');
    const row = (e.target as HTMLElement).closest<HTMLElement>('.dim-row');
    if (!button || !row) return;
    const id = Number(row.dataset.id);
    const d = dims.get(id);
    if (!d) return;
    if (button.dataset.act === 'pause') dims.setPaused(id, !d.paused);
    else if (button.dataset.act === 'view') {
      toggle();
      deps.enter(id);
    } else if (button.dataset.act === 'delete') dims.remove(id);
  });
  list.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    const row = input.closest<HTMLElement>('.dim-row');
    if (!row) return;
    const id = Number(row.dataset.id);
    if (input.classList.contains('dim-name')) dims.rename(id, input.value);
    else if (input.classList.contains('dim-speed')) {
      const speed = readSpeed(input.value);
      if (speed) dims.setSpeed(id, speed);
      else toast('That speed should be a number, like 16, or Max.');
    }
  });
  // nothing gets redrawn under you while you're typing in it
  let typing = false;
  list.addEventListener('focusin', () => (typing = true));
  list.addEventListener('focusout', () => (typing = false));
  window.setInterval(() => {
    if (!typing) render();
  }, 500);
  dims.onChange = () => {
    if (!typing) render();
  };

  function toggle(): void {
    box.style.display = box.style.display === 'block' ? 'none' : 'block';
    syncOptions();
    render();
  }
  return { toggle, open: () => box.style.display !== 'block' && toggle(), render, isOpen: () => box.style.display === 'block' };
}
