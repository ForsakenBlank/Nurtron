import './style.css';
import { ACTIONS } from '../sim/brain.ts';
import type { Action, Decision, Link } from '../sim/brain.ts';
import { parseCreature, saveCreature } from '../sim/creature-file.ts';
import type { CreatureData } from '../sim/creature-file.ts';
import { COUNTER, HUNGER, WIRED_FRUIT } from '../sim/examples.ts';
import { DEFAULT_STATS, STAT_INFO, STATS } from '../sim/examples.ts';
import type { StatId } from '../sim/examples.ts';
import { babyName, rollGenes } from '../sim/family.ts';
import { PALETTES } from '../sim/look.ts';
import type { Look } from '../sim/look.ts';
import { formatValue, PART_GROUPS, PART_INFO, PART_KINDS } from '../sim/parts.ts';
import type { PartKind } from '../sim/parts.ts';
import { parseTool, saveTool, toolPlace } from '../sim/packager.ts';
import type { PackagedTool } from '../sim/packager.ts';
import { parseRoom, saveRoom } from '../sim/room-file.ts';
import { Rng } from '../sim/rng.ts';
import { COLOURS as COLOUR_NAMES, describe } from '../sim/senses.ts';
import { FRUIT, initPhysics, MOST_CREATURES, needOf, ROCK, ROOM, SIZE_RANGE, TICKS_PER_SECOND, World } from '../sim/world.ts';
import type { Creature, Drive, RoomData, Thing, ThingSpec } from '../sim/world.ts';
import { parseTrial, saveTrial } from '../sim/trial-file.ts';
import { openWorld, parseWorld, saveWorld } from '../sim/world-file.ts';
import { BrainView } from './brain-view.ts';
import type { BrainSpot } from './brain-view.ts';
import { CustomisePanel } from './customise.ts';
import { Editor } from './editor.ts';
import { FamilyPanel } from './family-panel.ts';
import { ago, doingNow, ThoughtLog } from './thoughts.ts';
import type { Tool } from './editor.ts';
import { runEnvCheck } from './env-check.ts';
import { PackagePanel } from './package-panel.ts';
import { readPicture } from './pictures.ts';
import { PropertiesPanel } from './properties.ts';
import { COLOURS, Scene } from './scene.ts';
import { compareVersions, FIRST_WITH_INSTALLER, fetchReleases, installer, safePage, updateWords, verbFor } from './updates.ts';
import type { Release } from './updates.ts';
import { summarise } from './world-preview.ts';
import { indexedStore, WorldStore } from './worlds.ts';
import { Minimap } from './minimap.ts';
import { Guide } from './guide.ts';
import { DEFAULT_SCENE_OPTIONS } from './scene.ts';
import type { WorldEntry } from './worlds.ts';

const SAVE_KEY = 'nurtron.world';
const TOOLS_KEY = 'nurtron.tools';
const PANEL_KEY = 'nurtron.panel';
const PREFS_KEY = 'nurtron.prefs';
const SIZES = [
  { name: 'Small', width: 2000, height: 1000 },
  { name: 'Medium', width: 6000, height: 2000 },
  { name: 'Large', width: 12000, height: 3000 },
  { name: 'Huge', width: 24000, height: 5000 },
];
const NEW_WORLD_SIZE = SIZES[1];
const CURRENT_SAVE = 10;
const ROOM_STEP = { across: 1000, up: 500 };
const SPEEDS = [0, 1, 4, 16];

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

const svg = (body: string): string => `<svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor" aria-hidden="true">${body}</svg>`;
const TOOL_BUTTONS: { tool: Tool; label: string; key: string; icon: string }[] = [
  { tool: 'hand', label: 'Hand', key: 'V', icon: svg('<path d="M4 2l11 9-5 .6L13 18l-2.4 1-2.9-6.5L4 16z"/>') },
  { tool: 'wire', label: 'Wire', key: 'W', icon: svg('<circle cx="4" cy="15" r="2.6"/><circle cx="16" cy="5" r="2.6"/><path d="M4 15C10 15 10 5 16 5" fill="none" stroke="currentColor" stroke-width="2"/>') },
  { tool: 'circle', label: 'Circle', key: 'C', icon: svg('<circle cx="10" cy="10" r="7"/>') },
  { tool: 'box', label: 'Square', key: 'B', icon: svg('<rect x="3.5" y="3.5" width="13" height="13" rx="1.5"/>') },
  { tool: 'triangle', label: 'Triangle', key: 'T', icon: svg('<path d="M10 3l7.5 14h-15z"/>') },
  { tool: 'hexagon', label: 'Hexagon', key: 'H', icon: svg('<path d="M2.5 10l3.8-6.5h7.4L17.5 10l-3.8 6.5H6.3z"/>') },
  { tool: 'plank', label: 'Plank', key: 'P', icon: svg('<rect x="1" y="8" width="18" height="4" rx="1" transform="rotate(-25 10 10)"/>') },
];

// tells apart a save that's unreadable from there being no save. a broken one is kept, never overwritten.
function loadOrCreate(): { world: World; notice: string } {
  let text: string | null = null;
  try {
    text = localStorage.getItem(SAVE_KEY);
    if (text) {
      const world = World.load(text);
      // opening an old save changes it for good, so the old one is kept once, just in case
      const version = (JSON.parse(text) as { version?: number }).version;
      if (version !== undefined && version < CURRENT_SAVE) localStorage.setItem(`${SAVE_KEY}.before-v${CURRENT_SAVE}`, text);
      return { world, notice: '' };
    }
  } catch (err) {
    console.error('Could not load the saved creature', err);
    try {
      if (text) localStorage.setItem(`${SAVE_KEY}.broken.${Date.now()}`, text);
    } catch {
      // storage itself is unavailable, nothing more can be done
    }
    return { world: newGame(), notice: "Your saved creature couldn't be read, so this is a new egg. The old save was kept." };
  }
  return { world: newGame(), notice: '' };
}

const newSeed = (): number => Math.floor(Math.random() * 2 ** 31);

// every new creature with no parents is a bit different from the last
const newGenes = (): ReturnType<typeof rollGenes> => rollGenes(new Rng(newSeed()));

function newGame(): World {
  return new World({ seed: newSeed(), egg: true, genes: newGenes(), size: NEW_WORLD_SIZE });
}

// false only when there's no world open, like after deleting the one you were in. a placeholder is never kept
let saving = true;

// false if it couldn't be written, which the player needs to hear about
function save(world: World): boolean {
  if (!saving) return true;
  try {
    localStorage.setItem(SAVE_KEY, world.save());
    return true;
  } catch (err) {
    console.error('Could not save', err);
    return false;
  }
}

function loadTools(): PackagedTool[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(TOOLS_KEY) ?? '[]');
    if (!Array.isArray(saved)) return [];
    return saved.flatMap((text) => {
      try {
        return [parseTool(String(text))];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

// a file to keep, or send to a friend
function download(name: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

// a name that's safe to use for a file, whatever someone called their creature
const fileName = (name: string, extension: string): string => `${name.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 40) || 'nurtron'}${extension}`;

async function boot(): Promise<void> {
  await initPhysics();
  document.body.innerHTML = `
    <div id="app">
      <header>
        <button id="menu-open" title="Your worlds, settings and app updates">Menu</button>
        <span class="logo">Nurtron</span>
        <input id="name" aria-label="Creature name" maxlength="20" spellcheck="false" />
        <button id="customise-open" title="Change your creature's skin and colours">Customise</button>
        <button id="body-open" class="room-only" title="Look inside your creature at the wires that make it work. You can also double-click it.">Inside it</button>
        <button id="family-open" title="Who it is, what it's like, its family, and having babies">Family</button>
        <span id="age" class="muted"></span>
        <span class="spacer"></span>
        <div class="egg-box">
          <button id="files-open" title="Save and open creatures, rooms and worlds. You can also drag a file onto the window.">Files</button>
          <div id="files-menu" class="pop-menu" role="menu">
            <b>Your creature</b>
            <button id="save-creature" title="Save this creature to a .nurt file, with everything it has learned, to keep or send to a friend.">Save creature</button>
            <button id="open-creature" title="Open a .nurt file. It joins whoever is already here.">Open creature</button>
            <b>This room</b>
            <button id="save-room" title="Save everything in this room to a file. Your creature stays out of it.">Save room</button>
            <button id="open-room" title="Open a room file. Your creature stays with you.">Open room</button>
            <button id="clear-room" title="Empty the room. You can undo this.">Clear room</button>
            <b>Everything</b>
            <button id="save-world" title="Save the room and your creature together in one file.">Save world</button>
            <button id="open-world" title="Open a world file as a new world. The one you're in is kept on the main menu.">Open world</button>
            <button id="size-open" title="This world's size and gravity, or start a new one">World settings</button>
            <button id="save-picture" title="Save what's in the window right now as a picture">Save a picture</button>
            <b>Trials</b>
            <button id="save-trial" title="Save this room as a Trial for a friend's creature to try. A Goal part says what counts as solving it, and a Start part says where creatures begin.">Save as Trial</button>
            <button id="open-trial" title="Try a friend's Trial. Your own room comes back afterwards.">Open Trial</button>
            <b>Nurtron</b>
            <button id="updates-open" title="See if there's a newer version of Nurtron">App updates</button>
          </div>
        </div>
        <button id="play" title="Run what you've built as a game, with the editor out of the way. Everything goes back when you stop.">Play</button>
        <button id="brain-toggle" title="Show or hide what your creature is thinking (Tab)">Mind</button>
        <button id="help-open" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">?</button>
        <span class="muted" id="speed-label">Speed</span>
        <div class="group" id="speeds"></div>
        <div class="egg-box">
          <button id="new-egg" title="Add a new egg, with nobody before it, to the room.">New egg</button>
          <div id="egg-menu" class="pop-menu" role="menu">
            <b>A new egg, with these stats</b>
            <div id="egg-stats"></div>
            <button id="egg-make" title="Each stat is real wires inside it, which you can open up and change">Add this egg</button>
            <button id="egg-cancel">Never mind</button>
          </div>
        </div>
      </header>
      <main>
        <section id="stage">
          <div id="hud">
            <div class="mood" id="mood"></div>
            <div id="bars"></div>
          </div>
          <div id="roster"></div>
          <div id="expand-box" class="group room-only" title="Add more room on any side, whatever you've already built. Shift+click adds five times as much.">
            <span class="muted">Room</span>
            <button data-grow="left" aria-label="More room to the left">←</button>
            <button data-grow="up" aria-label="More room above">↑</button>
            <button data-grow="down" aria-label="More room below">↓</button>
            <button data-grow="right" aria-label="More room to the right">→</button>
          </div>
          <canvas id="minimap" class="room-only" title="The whole room. Click or drag to look somewhere. M hides it."></canvas>
          <div id="guide" hidden></div>
          <div id="paused-badge">Paused · Space carries on</div>
          <div id="zoom-box" class="group">
            <button id="follow" class="room-only" title="Keep your creature in view as it moves (L)">Follow</button>
            <button id="zoom-out" title="Zoom out (-)" aria-label="Zoom out">−</button>
            <button id="zoom-fit" title="Show the whole room (0)">Fit</button>
            <button id="zoom-in" title="Zoom in (+)" aria-label="Zoom in">+</button>
          </div>
          <div id="toasts" role="status"></div>
          <div id="trial-banner">
            <div><b id="trial-name"></b> <span id="trial-time" class="muted"></span></div>
            <div id="trial-about" class="muted"></div>
            <div class="prop-actions"><button id="trial-retry">Try again</button><button id="trial-leave">Back to my room</button></div>
          </div>
          <div id="play-banner">Playing. Esc to stop. <label class="muted"><input type="checkbox" id="play-empty" /> Without creatures</label></div>
          <div id="body-banner">
            <b id="body-title"></b>
            <button id="body-close">Back to the room</button>
          </div>
        </section>
        <aside id="brain-panel">
          <div id="panel-resize" title="Drag to change the size"></div>
          <div class="panel-head">
            <h2 id="panel-title">Its mind</h2>
            <button id="brain-close" class="prop-close" aria-label="Close" title="Hide this (Tab)">✕</button>
          </div>
          <div id="panel-scroll">
            <section id="now">
              <div class="now-label">Right now</div>
              <div id="now-doing"></div>
              <div id="now-why"></div>
              <div id="now-feeling" class="muted"></div>
              <div id="now-considered" class="muted"></div>
              <div id="now-orders"></div>
              <div id="now-death">
                <div id="now-lesson"></div>
                <button id="revive" class="danger">Revive</button>
              </div>
            </section>
            <section id="tell">
              <div class="now-label">Tell it what to do</div>
              <div class="muted tell-help">Right-click anything in the room to send it there. Give several and it does them in order.</div>
              <div class="prop-actions tell-row">
                <button data-order="rest">Rest</button>
                <button data-order="call">Call out</button>
                <button data-order="wander">Wander</button>
                <button data-order="drop">Drop it</button>
              </div>
              <form id="say-box">
                <input id="say-word" maxlength="24" spellcheck="false" placeholder="Say a word" aria-label="Say a word" />
                <button type="submit" title="It's said wherever the mouse last was in the room. Do this while it does something, and pet it, and it learns what the word means.">Say</button>
              </form>
              <label class="prop-toggle" title="It learns from doing what you told it, as if it had been its own good idea. Off, it just does it."><input type="checkbox" id="tell-remember" checked /> <span>Make it remember</span></label>
            </section>
            <details id="recent-box" open>
              <summary>Recent thoughts</summary>
              <ol id="thought-list"></ol>
            </details>
            <details id="brain-box" open>
              <summary>Its brain</summary>
              <div id="brain-wrap"><canvas id="brain-canvas"></canvas></div>
            </details>
            <details id="learned-box" open>
              <summary>What it has learned</summary>
              <div id="learned"></div>
            </details>
          </div>
        </aside>
      </main>
      <footer>
        <div class="group" id="tools"></div>
        <div class="group swatches room-only" id="tool-colours"></div>
        <label class="fixed-toggle room-only" title="New shapes stay where you put them instead of falling"><input type="checkbox" id="new-fixed" /> Fixed</label>
        <span class="divider room-only"></span>
        <span class="muted room-only">Add</span>
        <div class="group room-only" id="add"></div>
        <span class="divider"></span>
        <span class="muted">Parts</span>
        <div class="group" id="parts"></div>
        <span class="divider"></span>
        <button id="package" title="Turn what's selected into your own reusable tool (G)">Package</button>
        <div class="group" id="my-tools"></div>
        <span class="spacer"></span>
        <div class="group">
          <button id="undo" title="Undo (Ctrl+Z)">Undo</button>
          <button id="redo" title="Redo (Ctrl+Y)">Redo</button>
        </div>
        <div class="muted" id="hint"></div>
      </footer>
    </div>
    <div id="properties" role="dialog" aria-label="Properties"></div>
    <div id="customise" role="dialog" aria-label="Customise your creature"></div>
    <input id="label-input" aria-label="Label value" maxlength="200" spellcheck="false" />
    <div id="tooltip"></div>
    <div id="packager" role="dialog" aria-label="Package as a tool"></div>
    <div id="family" role="dialog" aria-label="Family"></div>
    <div id="part-menu" class="pop-menu" role="menu"></div>
    <div id="trial-panel" role="dialog" aria-label="Save as Trial">
      <div class="prop-head"><b>Save as Trial</b><button id="trial-close" class="prop-close" aria-label="Close">✕</button></div>
      <div class="prop-help">A friend drops their creature in, and nothing is scripted. Wire a Goal part to whatever counts as solving it, and put down a Start part for where creatures begin.</div>
      <input id="trial-title" class="prop-name" maxlength="40" placeholder="Name it" aria-label="Trial name" />
      <input id="trial-text" class="prop-name" maxlength="200" placeholder="What's it testing?" aria-label="What the Trial tests" />
      <div class="prop-actions"><button id="trial-save">Save Trial</button></div>
    </div>
    <div id="size-panel" role="dialog" aria-label="Room size">
      <div class="prop-head"><b>World settings</b><button id="size-close" class="prop-close" aria-label="Close">✕</button></div>
      <div class="prop-help" id="size-now"></div>
      <div class="prop-actions" id="size-presets"></div>
      <div class="size-custom">
        <label>Width <input type="number" id="size-width" step="100" /></label>
        <label>Height <input type="number" id="size-height" step="100" /></label>
      </div>
      <div class="prop-heading">Gravity everywhere, unless a zone says otherwise</div>
      <div class="size-custom">
        <label>Strength <input type="number" id="gravity-strength" step="0.1" min="-5" max="5" /></label>
        <label>Direction <select id="gravity-direction"><option value="90">Down</option><option value="-90">Up</option><option value="0">Right</option><option value="180">Left</option></select></label>
      </div>
      <div class="muted size-note">Strength 1 is normal, and 0 is none, where creatures float-walk anywhere.</div>
      <div class="prop-actions"><button id="size-apply">Apply to this world</button><button id="size-new" title="This one is kept on the main menu">Start a new world</button></div>
      <div class="muted size-note"></div>
    </div>
    <div id="menu" role="dialog" aria-label="Main menu">
      <div class="menu-card">
        <div class="menu-top">
          <div>
            <div class="menu-title">Nurtron</div>
            <div class="muted" id="menu-version"></div>
          </div>
          <div class="menu-nav">
            <button id="menu-tab-worlds" class="on">Worlds</button>
            <button id="menu-tab-settings">Settings</button>
            <button id="menu-quit" hidden>Quit</button>
            <button id="menu-close" class="prop-close" aria-label="Back to the world" title="Back to the world">✕</button>
          </div>
        </div>
        <section id="menu-worlds">
          <div class="menu-row">
            <button id="menu-continue" class="accent">Continue</button>
            <button id="menu-new">New world</button>
            <button id="menu-open-file" title="A .nworld file, added as a new world">Open a world file</button>
          </div>
          <div id="menu-new-form" hidden>
            <input id="new-world-name" class="prop-name" maxlength="40" placeholder="Name it" aria-label="World name" />
            <div class="prop-actions" id="new-world-sizes"></div>
            <div class="muted size-note">It starts with a new egg. You can make it bigger later from inside.</div>
            <div class="prop-actions"><button id="new-world-make" class="accent">Make it</button><button id="new-world-cancel">Never mind</button></div>
          </div>
          <div id="world-grid"></div>
        </section>
        <section id="menu-settings" hidden>
          <div class="settings-group">
            <div class="prop-heading">Starting up</div>
            <label class="update-auto"><input type="checkbox" id="pref-menu-start" /> Open this menu when Nurtron starts</label>
          </div>
          <div class="settings-group">
            <div class="prop-heading">How it looks</div>
            <label class="update-auto"><input type="checkbox" id="pref-scenery" /> Sky, hills and grass, instead of a plain grid</label>
            <label class="update-auto"><input type="checkbox" id="pref-particles" /> Hearts, crumbs, dust and sparkles</label>
            <label class="update-auto"><input type="checkbox" id="pref-shake" /> Shake the view when you slap</label>
            <label class="update-auto"><input type="checkbox" id="pref-intent" /> A thought bubble showing what your creature is going for</label>
            <label class="update-auto"><input type="checkbox" id="pref-minimap" /> The map of the whole room in the corner (M)</label>
            <div class="prop-actions"><button id="pref-guide">Show the first steps again</button></div>
          </div>
          <div class="settings-group" id="update-panel">
            <div class="prop-heading">App updates</div>
            <div class="update-row">
              <span id="update-version"></span>
              <span class="update-actions">
                <button id="update-check">Check for updates</button>
                <button id="update-get" class="accent" hidden>Update now</button>
              </span>
            </div>
            <div class="muted update-status" id="update-status"></div>
            <div id="update-list"></div>
            <label class="update-auto"><input type="checkbox" id="update-auto" /> Check when Nurtron starts</label>
            <div class="muted size-note" id="update-note">This asks GitHub which versions there are. Nothing is downloaded or installed until you press a version's button and say yes.</div>
          </div>
        </section>
      </div>
    </div>
    <div id="tool-menu" class="pop-menu" role="menu"></div>
    <div id="help" role="dialog" aria-label="Keyboard shortcuts">
      <div class="prop-head"><b>Keyboard shortcuts</b><button id="help-close" class="prop-close" aria-label="Close">✕</button></div>
      <div class="help-grid">
        <div class="prop-heading">Time and looking around</div>
        <span class="keys"><kbd>Space</kbd></span><span>Pause, or carry on</span>
        <span class="keys"><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></span><span>Normal speed, 4 times, 16 times</span>
        <span class="keys"><kbd>F</kbd></span><span>Find your creature</span>
        <span class="keys"><kbd>L</kbd></span><span>Follow your creature as it moves</span>
        <span class="keys"><kbd>[</kbd> <kbd>]</kbd></span><span>Look at the previous or next creature</span>
        <span class="keys"><kbd>0</kbd></span><span>See the whole room</span>
        <span class="keys"><kbd>+</kbd> <kbd>−</kbd></span><span>Zoom in or out. Scrolling does too</span>
        <span class="keys"><kbd>Arrows</kbd></span><span>Look around. Dragging empty space does too</span>
        <span class="keys"><kbd>M</kbd></span><span>Show or hide the map of the room</span>
        <span class="keys"><kbd>Tab</kbd></span><span>Show or hide its mind</span>
        <div class="prop-heading">Your creature</div>
        <span class="keys"><kbd>Click</kbd></span><span>Pet it</span>
        <span class="keys"><kbd>Right-click</kbd></span><span>Slap it, or send it to whatever you right-clicked</span>
        <span class="keys"><kbd>Double-click</kbd></span><span>Look inside it</span>
        <div class="prop-heading">Building</div>
        <span class="keys"><kbd>V</kbd> <kbd>W</kbd></span><span>The hand, and the wire tool</span>
        <span class="keys"><kbd>C</kbd> <kbd>B</kbd> <kbd>T</kbd> <kbd>H</kbd> <kbd>P</kbd></span><span>Circle, square, triangle, hexagon, plank</span>
        <span class="keys"><kbd>R</kbd></span><span>Rotate what's selected</span>
        <span class="keys"><kbd>G</kbd></span><span>Package what's selected as a tool</span>
        <span class="keys"><kbd>Delete</kbd></span><span>Remove what's selected</span>
        <span class="keys"><kbd>Shift</kbd>+drag</span><span>Select several</span>
        <span class="keys"><kbd>Ctrl</kbd>+<kbd>Z</kbd> <kbd>Y</kbd></span><span>Undo, redo</span>
        <span class="keys"><kbd>Ctrl</kbd>+<kbd>C</kbd> <kbd>V</kbd> <kbd>D</kbd></span><span>Copy, paste, duplicate</span>
        <span class="keys"><kbd>Ctrl</kbd>+<kbd>A</kbd></span><span>Select everything</span>
        <span class="keys"><kbd>Esc</kbd></span><span>Put the tool down, let go, or stop playing</span>
        <span class="keys"><kbd>?</kbd></span><span>This list</span>
      </div>
    </div>
    <div id="ask" role="alertdialog">
      <div id="ask-words"></div>
      <div class="prop-actions">
        <button id="ask-save">Save them first</button>
        <button id="ask-yes" class="danger"></button>
        <button id="ask-no">Never mind</button>
      </div>
    </div>
    <div id="drop-note">Drop it anywhere to open it, or a picture on a shape</div>
    <input type="file" id="any-file" accept=".nurt,.nroom,.nworld,.ntool,.ntrial,application/json" hidden />
    <input type="file" id="picture-file" accept="image/png,image/jpeg,image/webp" hidden />`;

  const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
  const stage = $('stage');
  const tooltip = $('tooltip');
  const scene = new Scene();
  await scene.start(stage);
  const brainView = new BrainView($<HTMLCanvasElement>('brain-canvas'));

  // the worlds on the main menu. someone from before worlds keeps theirs, as their first one
  const store = new WorldStore(localStorage, indexedStore(), SAVE_KEY);
  const loaded = store.activeId || !store.list().length ? loadOrCreate() : { world: newGame(), notice: '' };
  let world = loaded.world;
  if (loaded.notice) window.setTimeout(() => toast(loaded.notice), 500);
  if (!store.list().length) {
    try {
      const first = await store.add('My world', world.save(), summarise(world));
      store.setActive(first.id);
    } catch (err) {
      console.error('Could not make the first world', err);
    }
  }
  // with no world open, what's on screen is only a stand-in until one is chosen, and is never saved
  saving = store.activeId !== null;
  let inMenu = false;
  let speed = 1;
  let carry = 0;
  let lastDecision: Decision | null = null;
    let shownFocus = world.focusId;
  const thoughts = new ThoughtLog();
  let learnedKey = '';
  // messages stack up for a moment instead of replacing each other, so two at once can both be read
  const toasts = new Map<string, { el: HTMLElement; timer: number }>();
  function toast(text: string): void {
    const box = $('toasts');
    const seen = toasts.get(text);
    if (seen) {
      // the same thing again just stays up a bit longer
      clearTimeout(seen.timer);
      seen.timer = window.setTimeout(() => dismissToast(text), toastTime(text));
      return;
    }
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));
    toasts.set(text, { el, timer: window.setTimeout(() => dismissToast(text), toastTime(text)) });
    while (toasts.size > 3) dismissToast(toasts.keys().next().value as string);
  }
  // longer messages get longer to read
  const toastTime = (text: string): number => Math.min(7000, 2200 + text.length * 35);
  function dismissToast(text: string): void {
    const one = toasts.get(text);
    if (!one) return;
    toasts.delete(text);
    clearTimeout(one.timer);
    one.el.classList.remove('on');
    window.setTimeout(() => one.el.remove(), 250);
  }

  // showing and hiding its mind, and how wide it is. this belongs to you, not the world, so it stays whatever you open.
  const panel = $('brain-panel');
  const panelState = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PANEL_KEY) ?? '{}') as { open?: unknown; width?: unknown };
      return { open: saved.open !== false, width: typeof saved.width === 'number' ? saved.width : 400 };
    } catch {
      return { open: true, width: 400 };
    }
  })();
  function syncPanel(): void {
    panel.style.display = panelState.open ? '' : 'none';
    panel.style.width = `${panelState.width}px`; // the stylesheet keeps it to a sensible size for the window
    $('brain-toggle').classList.toggle('on', panelState.open);
    try {
      localStorage.setItem(PANEL_KEY, JSON.stringify(panelState));
    } catch {
      // it just won't be remembered
    }
  }
  const togglePanel = (): void => {
    panelState.open = !panelState.open;
    syncPanel();
  };
  $('brain-close').addEventListener('click', togglePanel);
  $('brain-toggle').addEventListener('click', togglePanel);
  const resizer = $('panel-resize');
  resizer.addEventListener('pointerdown', (e) => {
    resizer.setPointerCapture(e.pointerId);
    resizer.classList.add('on');
  });
  resizer.addEventListener('pointermove', (e) => {
    if (!resizer.hasPointerCapture(e.pointerId)) return;
    panelState.width = Math.max(260, Math.min(window.innerWidth * 0.75, window.innerWidth - e.clientX));
    syncPanel();
  });
  resizer.addEventListener('pointerup', () => resizer.classList.remove('on'));
  syncPanel();

  document.querySelectorAll<HTMLButtonElement>('[data-grow]').forEach((b) => {
    b.addEventListener('click', (e) => {
      const side = b.dataset.grow as 'left' | 'right' | 'up' | 'down';
      const was = `${world.size.width}x${world.size.height}`;
      const { dx, dy } = world.expand(side, (side === 'left' || side === 'right' ? ROOM_STEP.across : ROOM_STEP.up) * (e.shiftKey ? 5 : 1));
      scene.syncSize(world);
      scene.shiftCamera(dx, dy);
      // what undo remembers is measured from the old corner, so it wouldn't put things back in the right place
      if (dx !== 0 || dy !== 0) editor.history.clear();
      save(world);
      toast(was === `${world.size.width}x${world.size.height}` ? "The room can't get any bigger that way." : `The room is now ${world.size.width} by ${world.size.height}.`);
    });
  });

  $('zoom-in').addEventListener('click', () => scene.zoomBy(1.4));
  $('zoom-out').addEventListener('click', () => scene.zoomBy(1 / 1.4));
  $('zoom-fit').addEventListener('click', () => scene.fitAll());

  const editor: Editor = new Editor(() => world, scene, {
    changed: syncToolbar,
    openProperties: (ids, x, y) => {
      tooltip.style.display = 'none';
      properties.open(ids, x, y);
    },
    closeProperties: () => properties.close(),
    hover: showHover,
    hoverNote: (e, title, words) => showTooltip(e, `<b>${escapeHtml(title)}</b>${escapeHtml(words)}`),
    editLabel: startEditingLabel,
    packageSelected: () => packager.open([...editor.selected]),
    stopPlaying: () => setPlaying(false),
    viewChanged: syncView,
    message: toast,
  });
  const rememberBox = (): HTMLInputElement => $<HTMLInputElement>('tell-remember');
  function tell(action: Action, id: number | null): void {
    const why = world.tell(action, id, rememberBox().checked);
    if (why) return toast(why);
    const target = world.thing(id);
    toast(`Told ${world.creature.name} to ${action}${target ? ` the ${target.name}` : ''}. Tell it more and it does them in order.`);
    renderNow();
  }
  const properties = new PropertiesPanel($('properties'), () => world, editor, {
    tell: (action, id) => tell(action, id),
    choosePicture: (ids) => {
      pictureFor = ids;
      pictureFile.click();
    },
    packageThese: (ids) => packager.open(ids),
  });
  const packager = new PackagePanel($('packager'), () => world, (tool) => {
    tools.push(tool);
    keepTools();
    renderTools();
    toast(`${tool.name} is on your tool shelf, ready to place.`);
  });

  const customise = new CustomisePanel(
    $('customise'),
    () => world.creature.look,
    (look: Look) => {
      world.creature.look = look;
    },
    (look: Look) => scene.picture(look),
  );
  $('customise-open').addEventListener('click', () => customise.toggle());

  const family = new FamilyPanel($('family'), () => world, {
    focus: (id) => editor.focusOn(id),
    message: toast,
    // what undo remembers may no longer be there
    statsChanged: () => editor.history.clear(),
    born: (name) => toast(`A new egg! ${name} takes after both of them, and knows nothing yet.`),
    sendAway: () => {
      const leaving = world.creature;
      confirmReplace(`Send ${leaving.name} away? They're gone for good unless you save them first. They'll stay in the family tree.`, `Send ${leaving.name} away`, () => {
        editor.setView('room');
        world.removeCreature(leaving.id);
        editor.newWorld();
        toast(`${leaving.name} has gone.`);
      });
    },
  });
  $('family-open').addEventListener('click', () => family.toggle());

  // looking inside the creature
  $('body-open').addEventListener('click', () => editor.setView('body'));
  $('body-close').addEventListener('click', () => editor.setView('room'));
  function syncView(): void {
    $('app').classList.toggle('in-body', editor.inBody);
    $('body-title').textContent = `Inside ${world.creature.name}`;
    $('panel-title').textContent = `${world.creature.name}'s mind`;
  }

  // typing straight into a label, right where it is on the wall
  const labelInput = $<HTMLInputElement>('label-input');
  let editingLabel: number | null = null;
  function startEditingLabel(id: number): void {
    const t = world.thing(id);
    if (!t) return;
    const rect = scene.app.canvas.getBoundingClientRect();
    const at = scene.toScreen(t.x, t.y);
    editingLabel = id;
    labelInput.value = formatValue(t.live?.value ?? 0);
    labelInput.style.display = 'block';
    labelInput.style.left = `${rect.left + at.x - 60}px`;
    labelInput.style.top = `${rect.top + at.y - 8}px`;
    labelInput.focus();
    labelInput.select();
  }
  function stopEditingLabel(keep: boolean): void {
    if (editingLabel === null) return;
    const id = editingLabel;
    editingLabel = null;
    labelInput.style.display = 'none';
    if (keep) editor.setLabel(id, labelInput.value);
  }
  labelInput.addEventListener('blur', () => stopEditingLabel(true));
  labelInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') stopEditingLabel(true);
    if (e.key === 'Escape') stopEditingLabel(false);
  });

  const nameBox = $<HTMLInputElement>('name');
  const syncName = (): void => {
    nameBox.value = world.creature.name;
  };
  syncName();
  nameBox.addEventListener('input', () => {
    world.creature.name = nameBox.value || 'Nurt';
    syncView();
  });
  nameBox.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') nameBox.blur();
  });

  // speed buttons
  const speedBox = $('speeds');
  const speedButtons = SPEEDS.map((s) => {
    const b = document.createElement('button');
    b.textContent = s === 0 ? 'Pause' : `${s}x`;
    b.addEventListener('click', () => setSpeed(s));
    speedBox.appendChild(b);
    return b;
  });
  function setSpeed(s: number): void {
    speed = s;
    speedButtons.forEach((b, i) => b.classList.toggle('on', SPEEDS[i] === s));
  }
  setSpeed(1);

  // tools
  const toolBox = $('tools');
  const toolButtons = new Map<Tool, HTMLButtonElement>();
  for (const t of TOOL_BUTTONS) {
    const b = document.createElement('button');
    b.className = 'tool';
    b.innerHTML = t.icon;
    b.title = `${t.label} (${t.key})`;
    b.setAttribute('aria-label', t.label);
    b.addEventListener('click', () => editor.setTool(t.tool));
    if (t.tool !== 'hand' && t.tool !== 'wire') b.classList.add('room-only');
    toolBox.appendChild(b);
    toolButtons.set(t.tool, b);
  }
  // there are a lot of parts now, so they're kept in groups that open when you click them
  const partBox = $('parts');
  const partMenu = $('part-menu');
  const groupButtons = new Map<string, HTMLButtonElement>();
  const closePartMenu = (): void => {
    partMenu.style.display = 'none';
    partMenu.dataset.group = '';
  };
  for (const group of PART_GROUPS) {
    const b = document.createElement('button');
    b.className = 'part-tool';
    b.textContent = group;
    b.addEventListener('click', () => {
      if (partMenu.dataset.group === group) return closePartMenu();
      partMenu.dataset.group = group;
      partMenu.replaceChildren();
      for (const kind of PART_KINDS) {
        if (PART_INFO[kind].group !== group || !editor.allows(kind)) continue;
        const item = document.createElement('button');
        item.textContent = PART_INFO[kind].title;
        item.title = PART_INFO[kind].help;
        item.dataset.part = kind;
        item.addEventListener('click', () => {
          closePartMenu();
          editor.setTool(kind);
        });
        partMenu.appendChild(item);
      }
      const at = b.getBoundingClientRect();
      partMenu.style.display = 'grid';
      partMenu.style.left = `${Math.max(8, Math.min(window.innerWidth - 228, at.left))}px`;
      partMenu.style.top = `${Math.max(8, at.top - partMenu.getBoundingClientRect().height - 6)}px`;
    });
    partBox.appendChild(b);
    groupButtons.set(group, b);
  }
  const colourBox = $('tool-colours');
  const colourButtons = COLOUR_NAMES.map((colour) => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = hex(COLOURS[colour]);
    b.title = `New shapes are ${colour}`;
    b.setAttribute('aria-label', colour);
    b.addEventListener('click', () => {
      editor.colour = colour;
      syncToolbar();
    });
    colourBox.appendChild(b);
    return { colour, b };
  });
  const fixedBox = $<HTMLInputElement>('new-fixed');
  fixedBox.addEventListener('change', () => {
    editor.newFixed = fixedBox.checked;
  });
  let toolsReady = false;
  function syncToolbar(): void {
    for (const [tool, b] of toolButtons) {
      b.classList.toggle('on', editor.tool === tool);
      b.hidden = !editor.allows(tool);
    }
    for (const { colour, b } of colourButtons) b.classList.toggle('on', editor.colour === colour);
    fixedBox.checked = editor.newFixed;
    for (const [group, b] of groupButtons) {
      b.classList.toggle('on', editor.tool !== 'hand' && editor.tool !== 'wire' && (PART_INFO[editor.tool as PartKind]?.group === group));
      b.hidden = !PART_KINDS.some((kind) => PART_INFO[kind].group === group && editor.allows(kind));
    }
    $<HTMLButtonElement>('package').disabled = editor.selected.size === 0;
    $('hint').textContent = editor.hint();
    if (toolsReady) renderTools();
  }
  syncToolbar();
  syncView();

  // quick things to add, which fall in from above where you're looking
  const addBox = $('add');
  const ADDABLE: { label: string; spec: ThingSpec }[] = [
    { label: 'Fruit', spec: FRUIT },
    { label: 'Rock', spec: ROCK },
  ];
  for (const item of ADDABLE) {
    const b = document.createElement('button');
    b.textContent = item.label;
    b.addEventListener('click', () => {
      const rect = scene.app.canvas.getBoundingClientRect();
      const left = scene.toWorld(0, 0);
      const right = scene.toWorld(rect.width, 0);
      const x = world.rng.range(left.x + 60, right.x - 60);
      editor.addThing({ ...item.spec, x, y: Math.max(40, left.y + 40) });
    });
    addBox.appendChild(b);
  }
  // ready-made circuits to learn from, which land where you're looking and can be pulled apart like anything else
  const CIRCUITS = [
    { label: 'Wired fruit', room: WIRED_FRUIT, width: 120, height: 70 },
    { label: 'Counter', room: COUNTER, width: 240, height: 140 },
    { label: 'Hunger', room: HUNGER, width: 450, height: 160 },
  ];
  for (const item of CIRCUITS) {
    const b = document.createElement('button');
    b.textContent = item.label;
    b.title = `A ready-made ${item.label.toLowerCase()} circuit`;
    b.addEventListener('click', () => placeCircuit(item.label, item.room, item.width, item.height));
    addBox.appendChild(b);
  }
  function placeCircuit(label: string, room: RoomData, width: number, height: number): void {
    const rect = scene.app.canvas.getBoundingClientRect();
    const middle = scene.toWorld(rect.width / 2, rect.height / 2);
    let x = Math.max(60, middle.x - width / 2);
    const edge = editor.inBody ? ROOM : world.size;
    let y = Math.max(60, Math.min(middle.y - height / 2, edge.floor - height - 40));
    // it goes somewhere clear, so a second one doesn't land on top of the first
    const clear = (): boolean => !world.things.some((t) => t.part && !!t.inBody === editor.inBody && t.x > x - 100 && t.x < x + width + 100 && t.y > y - 60 && t.y < y + height + 60);
    for (let tries = 0; tries < 40 && !clear(); tries++) {
      y += height + 60;
      if (y > edge.floor - height - 40) {
        y = 60;
        x = x + width + 120 > edge.width - width ? 60 : x + width + 120;
      }
    }
    editor.addCircuit(label, room, x, y);
  }

  // your own tools, which stay with you whatever room or creature you have
  const tools = loadTools();
  const shelf = $('my-tools');
  const toolMenu = $('tool-menu');
  function keepTools(): void {
    try {
      localStorage.setItem(TOOLS_KEY, JSON.stringify(tools.map(saveTool)));
    } catch {
      toast("Your tool shelf is full, so that tool won't be remembered. Save it to a file to keep it.");
    }
  }
  function placeTool(tool: PackagedTool): void {
    const width = Math.max(...tool.room.things.map((t) => t.x + t.hw));
    const height = Math.max(...tool.room.things.map((t) => (t.y ?? 0) + t.hh));
    placeCircuit(tool.name, tool.room, width, height);
  }
  function renderTools(): void {
    const key = `${tools.map((t) => t.name).join('|')}:${editor.inBody}`;
    if (shelf.dataset.drawn === key) return;
    shelf.dataset.drawn = key;
    shelf.replaceChildren();
    tools.forEach((tool) => {
      const place = toolPlace(tool);
      if (place !== 'both' && place !== (editor.inBody ? 'body' : 'room')) return;
      const b = document.createElement('button');
      b.className = 'part-tool my-tool';
      b.textContent = tool.name;
      b.title = 'Click to place. Right-click to save it to a file or forget it.';
      b.addEventListener('click', () => placeTool(tool));
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openToolMenu(tool, e.clientX, e.clientY);
      });
      shelf.appendChild(b);
    });
  }
  function openToolMenu(tool: PackagedTool, x: number, y: number): void {
    toolMenu.replaceChildren();
    const item = (words: string, act: () => void): void => {
      const b = document.createElement('button');
      b.textContent = words;
      b.addEventListener('click', () => {
        toolMenu.style.display = 'none';
        act();
      });
      toolMenu.appendChild(b);
    };
    item('Save to a file', () => {
      download(fileName(tool.name, '.ntool'), saveTool(tool));
      toast(`${tool.name} saved. Send the file to a friend, or drag it back in any time.`);
    });
    item('Forget it', () => {
      tools.splice(tools.indexOf(tool), 1);
      keepTools();
      renderTools();
    });
    toolMenu.style.left = `${Math.min(window.innerWidth - 180, x)}px`;
    toolMenu.style.display = 'grid';
    toolMenu.style.top = `${Math.max(8, y - toolMenu.getBoundingClientRect().height - 6)}px`;
  }
  $('package').addEventListener('click', () => packager.open([...editor.selected]));
  toolsReady = true;
  renderTools();

  $('undo').addEventListener('click', () => editor.undo());
  $('redo').addEventListener('click', () => editor.redo());

  // files. they all go through the same door, and each says what it is, so it doesn't matter which button or where you drop it
  const filesMenu = $('files-menu');
  const closeFiles = (): void => {
    filesMenu.style.display = 'none';
  };
  $('files-open').addEventListener('click', () => {
    const button = $('files-open').getBoundingClientRect();
    filesMenu.style.left = `${Math.max(8, Math.min(window.innerWidth - 208, button.left))}px`;
    filesMenu.style.top = `${button.bottom + 8}px`;
    filesMenu.style.display = filesMenu.style.display === 'grid' ? 'none' : 'grid';
  });
  filesMenu.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('button')) closeFiles();
  });
  $('save-room').addEventListener('click', () => {
    download('room.nroom', saveRoom(world));
    toast('Room saved.');
  });
  $('save-creature').addEventListener('click', () => {
    download(fileName(world.creature.name, '.nurt'), saveCreature(world));
    toast(`${world.creature.name} saved. Send the file to a friend and it will still know what you taught it.`);
  });
  $('open-trial').addEventListener('click', () => anyFile.click());
  const trialPanel = $('trial-panel');
  trialPanel.addEventListener('pointerdown', (e) => e.stopPropagation());
  trialPanel.addEventListener('keydown', (e) => e.stopPropagation());
  $('save-trial').addEventListener('click', () => {
    if (!world.things.some((t) => t.part?.kind === 'goal')) toast("There's no Goal part yet, so nobody could solve it. You can still save it.");
    trialPanel.style.display = 'block';
    $<HTMLInputElement>('trial-title').focus();
  });
  $('trial-close').addEventListener('click', () => {
    trialPanel.style.display = 'none';
  });
  $('trial-save').addEventListener('click', () => {
    const name = $<HTMLInputElement>('trial-title').value.trim() || 'A Trial';
    download(fileName(name, '.ntrial'), saveTrial(world, name, $<HTMLInputElement>('trial-text').value.trim()));
    trialPanel.style.display = 'none';
    toast(`${name} saved. Send it to a friend.`);
  });

  // a friend's Trial. your own room comes back afterwards, and your creature keeps what it learned there
  function enterTrial(trial: { name: string; about: string; room: RoomData }): void {
    editor.setView('room');
    world.startTrial(trial);
    afterRoomChange();
    toast(`${trial.name}. Nothing is scripted, so it's up to your creature now.`);
  }
  function afterRoomChange(): void {
    editor.newWorld();
    scene.syncSize(world);
    scene.centreOn(world.creature.x, world.creature.y);
  }
  $('trial-retry').addEventListener('click', () => {
    world.retryTrial();
    afterRoomChange();
  });
  $('trial-leave').addEventListener('click', () => {
    world.leaveTrial();
    afterRoomChange();
    toast('Back in your own room.');
  });
  function renderTrial(): void {
    const banner = $('trial-banner');
    const trial = world.trial;
    banner.style.display = trial ? 'block' : 'none';
    if (!trial) return;
    setText('trial-name', trial.name);
    setText('trial-about', trial.about);
    const seconds = Math.floor(((trial.solvedAt ?? world.tick) - trial.startTick) / TICKS_PER_SECOND);
    setText('trial-time', trial.solvedAt !== null ? `Solved in ${seconds}s. Solved ${trial.solved} of ${trial.attempts} tries.` : `${seconds}s. Try ${trial.attempts}.`);
  }

  // saying something, wherever the mouse last was, or the middle of the view
  $<HTMLFormElement>('say-box').addEventListener('submit', (e) => {
    e.preventDefault();
    const box = $<HTMLInputElement>('say-word');
    const word = box.value.trim();
    if (!word) return;
    const rect = scene.app.canvas.getBoundingClientRect();
    const spot = editor.lastSpot ?? scene.toWorld(rect.width / 2, rect.height / 2);
    world.say(word, spot.x, Math.min(spot.y, world.size.floor - 40));
    box.value = '';
  });

  // Play mode: the editor gets out of the way and this is a game. what you built goes back the way it was afterwards
  let playingFrom: { room: RoomData; away: boolean } | null = null;
  function setPlaying(on: boolean): void {
    if (on === !!playingFrom) return;
    if (on) {
      editor.setView('room');
      editor.setTool('hand');
      playingFrom = { room: world.roomForFile(), away: false };
      if ($<HTMLInputElement>('play-empty').checked) world.setCreaturesAway(true);
      if (speed === 0) setSpeed(1);
    } else {
      const room = playingFrom?.room;
      playingFrom = null;
      world.setCreaturesAway(false);
      world.keysDown.clear();
      if (room) {
        world.clearThings();
        world.addRoom(room);
      }
      editor.newWorld();
    }
    editor.playing = on;
    scene.playing = on;
    $('app').classList.toggle('playing', on);
    $('play').classList.toggle('on', on);
    (document.activeElement as HTMLElement | null)?.blur();
    if (on) toast('Playing. Esc stops, and puts everything back.');
  }
  $('play').addEventListener('click', () => setPlaying(!playingFrom));
  $<HTMLInputElement>('play-empty').addEventListener('change', (e) => world.setCreaturesAway((e.target as HTMLInputElement).checked));

  // the keyboard belongs to whatever you've wired up to it, unless you're typing
  const typing = (e: Event): boolean => {
    const tag = (e.target as HTMLElement).tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  };
  window.addEventListener('keydown', (e) => {
    if (typing(e) || e.ctrlKey || e.metaKey) return;
    world.keysDown.add(e.key);
    world.keysTapped.add(e.key);
    if (playingFrom && e.key !== 'Escape') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => world.keysDown.delete(e.key));
  window.addEventListener('blur', () => world.keysDown.clear());

  // notes, for the Sound part
  let audio: AudioContext | null = null;
  let notesThisFrame = 0;
  function playNote(pitch: number, seconds: number): void {
    if (notesThisFrame++ > 6) return;
    try {
      audio ??= new AudioContext();
      const note = audio.createOscillator();
      const volume = audio.createGain();
      note.type = 'triangle';
      note.frequency.value = Math.max(20, Math.min(8000, pitch));
      volume.gain.setValueAtTime(0.18, audio.currentTime);
      volume.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + seconds);
      note.connect(volume).connect(audio.destination);
      note.start();
      note.stop(audio.currentTime + seconds);
    } catch {
      // no sound on this machine, and nothing depends on it
    }
  }

  $('save-world').addEventListener('click', () => {
    download('world.nworld', saveWorld(world));
    toast('World saved, with your room and your creature in it.');
  });
  const anyFile = $<HTMLInputElement>('any-file');
  for (const id of ['open-room', 'open-creature', 'open-world']) $(id).addEventListener('click', () => anyFile.click());
  anyFile.addEventListener('change', async () => {
    const file = anyFile.files?.[0];
    anyFile.value = '';
    if (file) await openFile(file);
  });

  async function openFile(file: File): Promise<void> {
    try {
      if (file.type.startsWith('image/')) return toast('To use a picture, drop it on a shape.');
      const text = await file.text();
      const type = sniffType(text);
      if (type === 'nurtron-creature') {
        welcome(parseCreature(text));
      } else if (type === 'nurtron-room') {
        editor.replaceRoom('Open room', parseRoom(text));
        toast(`Opened ${file.name}. Ctrl+Z puts your old room back.`);
      } else if (type === 'nurtron-world') {
        const data = parseWorld(text);
        const next = openWorld(data, newSeed());
        await addWorld(file.name.replace(/\.[^.]+$/, '') || 'A world', next);
        toast(`Welcome to ${file.name}. The world you were in is on the main menu.`);
      } else if (type === 'nurtron-trial') {
        enterTrial(parseTrial(text));
      } else if (type === 'nurtron-tool') {
        const tool = parseTool(text);
        tools.push(tool);
        keepTools();
        shelf.dataset.drawn = '';
        renderTools();
        toast(`${tool.name} is on your tool shelf.`);
      } else {
        toast("That isn't a Nurtron file.");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "That file couldn't be opened.");
    }
  }

  function welcome(data: CreatureData): void {
    if (editor.inBody) editor.setView('room');
    if (!world.adoptCreature(data)) return toast(`The room is full, at ${MOST_CREATURES} creatures. Send someone away first.`);
    syncFocus();
    save(world);
    toast(`${data.name} has joined you.`);
  }

  // asks before anything that can't be undone, and offers the way out of it
  function confirmReplace(words: string, yes: string, act: () => void, offerSave = true): void {
    const box = $('ask');
    $('ask-save').style.display = offerSave ? '' : 'none';
    $('ask-words').textContent = words;
    $('ask-yes').textContent = yes;
    box.style.display = 'block';
    const close = (): void => {
      box.style.display = 'none';
    };
    $('ask-yes').onclick = () => {
      close();
      act();
    };
    $('ask-no').onclick = close;
    // a whole world goes to one file, and one creature to its own
    $('ask-save').onclick = () => download(fileName(world.creature.name, '.nurt'), saveCreature(world));
  }

  // whoever we're looking at changed, so everything about them on screen has to follow
  function syncFocus(): void {
    shownFocus = world.focusId;
    lastDecision = null;
    learnedKey = '';
    thoughtKey = '';
    brainView.reset();
    syncName();
    syncView();
    renderNow();
    renderRoster();
    family.refresh();
  }

  function swapWorld(next: World): void {
    editor.setView('room');
    const old = world;
    world = next;
    old.dispose();
    editor.newWorld();
    scene.syncSize(world);
    syncFocus();
    scene.centreOn(world.creature.x, world.creature.y);
    save(world);
  }

  // pictures, from the properties panel or dropped straight onto a shape
  const pictureFile = $<HTMLInputElement>('picture-file');
  let pictureFor: number[] = [];
  pictureFile.addEventListener('change', async () => {
    const file = pictureFile.files?.[0];
    pictureFile.value = '';
    if (file) await putPicture(file, pictureFor);
  });
  async function putPicture(file: File, ids: number[]): Promise<void> {
    try {
      const { data, colour } = await readPicture(file);
      if (!editor.setPicture(ids, data, colour)) return toast('This world is holding too many pictures for another one.');
      toast(`It looks ${colour} to your creature now. Ctrl+Z takes the picture off.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "That picture couldn't be used.");
    }
  }

  // dragging a file onto the window
  const dropNote = $('drop-note');
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropNote.style.display = 'block';
  });
  window.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget) dropNote.style.display = 'none';
  });
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropNote.style.display = 'none';
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return openFile(file);
    const thing = editor.thingAtScreen(e.clientX, e.clientY);
    if (thing && !thing.part) await putPicture(file, editor.selected.has(thing.id) ? [...editor.selected].filter((id) => !world.thing(id)?.part) : [thing.id]);
    else toast('Drop a picture on a shape to use it.');
  });

  $('clear-room').addEventListener('click', () => {
    editor.replaceRoom('Clear room', { things: [], wires: [] });
    toast('Room cleared. Ctrl+Z brings it back.');
  });

  // a new egg replaces the creature for good, so it asks first. what you've built stays.
  const eggMenu = $('egg-menu');
  const closeEggMenu = (): void => {
    eggMenu.style.display = 'none';
  };
  $('new-egg').addEventListener('click', () => {
    const button = $('new-egg').getBoundingClientRect();
    eggMenu.style.left = `${Math.max(8, Math.min(window.innerWidth - 228, button.right - 220))}px`;
    eggMenu.style.top = `${button.bottom + 8}px`;
    eggMenu.style.display = eggMenu.style.display === 'grid' ? 'none' : 'grid';
  });
  $('egg-cancel').addEventListener('click', closeEggMenu);
  // which ready-made stats the next egg gets. none at all is a blank body, for building everything yourself
  const eggStats = new Set<StatId>(DEFAULT_STATS);
  function renderEggStats(): void {
    const box = $('egg-stats');
    box.replaceChildren();
    for (const stat of STATS) {
      const row = document.createElement('label');
      row.className = 'stat-row';
      row.title = STAT_INFO[stat].help;
      const tick = document.createElement('input');
      tick.type = 'checkbox';
      tick.checked = eggStats.has(stat);
      tick.addEventListener('change', () => {
        if (tick.checked) {
          eggStats.add(stat);
          const needs = STAT_INFO[stat].needs;
          if (needs) eggStats.add(needs);
        } else {
          eggStats.delete(stat);
          for (const other of STATS) if (STAT_INFO[other].needs === stat) eggStats.delete(other);
        }
        renderEggStats();
      });
      const words = document.createElement('span');
      words.textContent = STAT_INFO[stat].title;
      row.append(tick, words);
      box.appendChild(row);
    }
  }
  renderEggStats();

  function hatchNew(stats: StatId[]): void {
    closeEggMenu();
    editor.setView('room');
    // its own name and colours, so you can tell who's who straight away
    const rng = new Rng(newSeed());
    const colours = PALETTES[rng.int(0, PALETTES.length - 1)];
    const look = { ...world.creature.look, body: colours.body, belly: colours.belly, accent: colours.accent };
    const egg = world.newEgg({ stats, look, genes: newGenes(), name: babyName(rng) });
    if (!egg) return toast(`The room is full, at ${MOST_CREATURES} creatures.`);
    syncFocus();
    save(world);
    toast(`${egg.name} is on the way. Customise changes how they look.`);
  }
  $('egg-make').addEventListener('click', () => hatchNew(STATS.filter((stat) => eggStats.has(stat))));

  // buttons shouldn't keep the keyboard, or pressing Space to pause would press them again
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    // a button that puts the keyboard in a box, like New world or Rename, keeps it there
    if (target.closest('button') && document.activeElement?.tagName === 'BUTTON') (document.activeElement as HTMLElement).blur();
  });

  function showTooltip(e: { clientX: number; clientY: number }, html: string): void {
    tooltip.innerHTML = html;
    tooltip.style.display = 'block';
    tooltip.style.left = `${Math.min(window.innerWidth - 310, e.clientX + 14)}px`;
    tooltip.style.top = `${Math.min(window.innerHeight - 110, e.clientY + 14)}px`;
  }

  function showHover(e: PointerEvent, thing: Thing | null, onCreature: Creature | null): void {
    if (properties.isOpen) return;
    const brain = world.creature.brain;
    if (thing?.part && thing.part.kind !== 'button') {
      const how = thing.part.kind === 'label' ? ' Double-click to type into it.' : ' Double-click for settings.';
      showTooltip(e, `<b>${escapeHtml(thing.name)}</b>${escapeHtml(PART_INFO[thing.part.kind].help + how)}`);
    } else if (thing) {
      const percept = world.perceive(thing);
      const c = brain.closest(percept);
      const links = c === null ? [] : brain.linksOf(c).slice(0, 3);
      const known = links.length ? links.map((l) => escapeHtml(l.words)).join('<br>') : "It hasn't learned anything about this yet.";
      showTooltip(e, `<b>${escapeHtml(thing.name)}</b>${known}`);
    } else if (onCreature) {
      const doing = escapeHtml(doingNow(onCreature, world.targetOf(onCreature.doing?.targetId ?? null)?.name ?? null));
      // what the one you're looking at has learned about creatures that look like this one
      let thinks = '';
      if (onCreature.id !== world.focusId) {
        const c = brain.closest(world.perceiveCreature(onCreature, world.creature));
        const links = c === null ? [] : brain.linksOf(c).slice(0, 2);
        thinks = `<br>${links.length ? `${escapeHtml(world.creature.name)} has learned: ${links.map((l) => escapeHtml(l.words)).join('; ')}` : `${escapeHtml(world.creature.name)} hasn't learned anything about them yet.`}`;
      }
      showTooltip(e, `<b>${escapeHtml(onCreature.name)}</b>${doing}.${thinks}<br><span class="muted">Click to pet, right-click to slap, drag to carry. A pet or a slap teaches it about what it just did.</span>`);
    } else {
      tooltip.style.display = 'none';
    }
  }

  const brainCanvas = $<HTMLCanvasElement>('brain-canvas');
  const brainSpot = (e: PointerEvent): BrainSpot | null => {
    const rect = brainCanvas.getBoundingClientRect();
    return brainView.at(e.clientX - rect.left, e.clientY - rect.top);
  };
  brainCanvas.addEventListener('pointermove', (e) => {
    const spot = brainSpot(e);
    brainView.hover = spot;
    brainCanvas.style.cursor = spot?.kind === 'concept' ? 'pointer' : 'default';
    if (!spot) {
      tooltip.style.display = 'none';
      return;
    }
    const brain = world.creature.brain;
    const list = (links: Link[], none: string): string => (links.length ? links.map((l) => `${escapeHtml(l.words)} (${l.strength.toFixed(2)})`).join('<br>') : none);
    if (spot.kind === 'concept') {
      showTooltip(e, `<b>${escapeHtml(describe(brain.concepts[spot.c].percept))}</b>${list(brain.linksOf(spot.c, 0.1).slice(0, 5), 'Nothing learned yet.')}<br><span class="muted">Click to keep this picked.</span>`);
    } else if (spot.kind === 'action') {
      const links = brain.strongestLinks(1000, 0.1).filter((l) => l.action === ACTIONS[spot.a]).slice(0, 5);
      showTooltip(e, `<b>${ACTIONS[spot.a]}</b>${list(links, "It hasn't learned anything about doing this yet.")}`);
    } else {
      const d = brain.driveNames.indexOf(spot.name);
      const drive = world.drive(spot.name);
      const links = brain.strongestLinks(1000, 0.1).filter((l) => l.channel === d + 1).slice(0, 5);
      const level = drive ? `${drive.kind === 'nerve' ? 'On' : 'Needs it'} ${Math.round(needOf(drive) * 100)}%.<br>` : '';
      showTooltip(e, `<b>${escapeHtml(spot.name)}</b>${level}${list(links, "It hasn't connected this to anything yet.")}`);
    }
  });
  brainCanvas.addEventListener('pointerleave', () => {
    brainView.hover = null;
    tooltip.style.display = 'none';
  });
  brainCanvas.addEventListener('click', (e) => {
    const spot = brainSpot(e as PointerEvent);
    brainView.pinned = spot?.kind === 'concept' && spot.c !== brainView.pinned ? spot.c : null;
    learnedKey = '';
  });

  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Tab') {
      e.preventDefault();
      togglePanel();
    }
    if (e.code === 'Space') {
      e.preventDefault();
      setSpeed(speed === 0 ? 1 : 0);
    }
    const index = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
    if (index >= 0) setSpeed(SPEEDS[index + 1]);
    if (playingFrom) return;
    if (e.key === '?') toggleHelp();
    else if (e.key === 'Escape' && helpBox.style.display === 'block') toggleHelp();
    else if (e.code === 'KeyL' && !editor.inBody) setFollowing(!following);
    else if (e.code === 'KeyM') {
      prefs.minimap = !prefs.minimap;
      savePrefs();
      applyPrefs();
      toast(prefs.minimap ? 'The map is back. M hides it.' : 'Map hidden. M brings it back.');
    } else if (e.code === 'BracketLeft' || e.code === 'BracketRight') cycleCreature(e.code === 'BracketRight' ? 1 : -1);
  });

  // the next or previous creature, in the order they're in on the roster
  function cycleCreature(by: number): void {
    const list = world.creatures.filter((c) => !c.hiddenAway);
    if (list.length < 2) return toast('There is only one creature here.');
    const at = list.findIndex((c) => c.id === world.focusId);
    const next = list[(at + by + list.length) % list.length];
    editor.focusOn(next.id);
    if (!editor.inBody && !following) scene.centreOn(next.x, next.y);
  }

  // the list of keys
  const helpBox = $('help');
  helpBox.addEventListener('pointerdown', (e) => e.stopPropagation());
  function toggleHelp(): void {
    helpBox.style.display = helpBox.style.display === 'block' ? 'none' : 'block';
  }
  $('help-open').addEventListener('click', toggleHelp);
  $('help-close').addEventListener('click', toggleHelp);

  // the view keeps up with your creature until you look somewhere else yourself
  let following = false;
  let pansWhenFollowing = 0;
  function setFollowing(on: boolean): void {
    following = on;
    pansWhenFollowing = scene.pans;
    minimap.moved = false;
    $('follow').classList.toggle('on', on);
    if (on) toast(`Following ${world.creature.name}. Move the view yourself to stop.`);
  }
  $('follow').addEventListener('click', () => setFollowing(!following));

  // the map of the whole room
  const minimap = new Minimap($<HTMLCanvasElement>('minimap'), scene, () => world);

  // the first steps, which tick themselves off
  const guide = new Guide($('guide'), localStorage, toast);
  editor.history.onCommit = (label) => {
    if (/^Add (circle|square|triangle|hexagon|plank)$/.test(label)) guide.mark('shape');
    else if (label === 'Connect wire') guide.mark('wire');
  };

  // a picture of whatever's in the window, to keep or show someone
  $('save-picture').addEventListener('click', async () => {
    try {
      const canvas = scene.app.renderer.extract.canvas(scene.app.stage) as HTMLCanvasElement;
      const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/png'));
      if (!blob) throw new Error('no picture');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = fileName(`${world.creature.name} ${new Date().toISOString().slice(0, 10)}`, '.png');
      link.click();
      URL.revokeObjectURL(link.href);
      toast('Picture saved.');
    } catch {
      toast("The picture couldn't be made.");
    }
  });

  // what shows on screen
  const barsBox = $('bars');
  const barRows = new Map<string, { el: HTMLElement; fill: HTMLElement; value: HTMLElement; trend: HTMLElement; samples: { tick: number; need: number; value: number }[] }>();
  function renderHud(): void {
    const c = world.creature;
    const shown = c.drives.filter((d) => d.kind === 'drive' && d.wired);
    if (barsBox.dataset.who !== String(c.id)) {
      barsBox.dataset.who = String(c.id);
      for (const row of barRows.values()) row.samples.length = 0;
    }
    for (const [name, row] of barRows) {
      if (shown.some((d) => d.name === name)) continue;
      row.el.remove();
      barRows.delete(name);
    }
    for (const drive of shown) {
      let row = barRows.get(drive.name);
      if (!row) {
        const el = document.createElement('div');
        el.className = 'bar-row';
        el.innerHTML = `<span>${escapeHtml(drive.name)}</span><div class="bar"><i></i></div><span></span><b class="trend"></b>`;
        barsBox.appendChild(el);
        row = { el, fill: el.querySelector('i') as HTMLElement, value: el.children[2] as HTMLElement, trend: el.lastElementChild as HTMLElement, samples: [] };
        barRows.set(drive.name, row);
      }
      // which way it's heading over the last few seconds of its life, whatever speed the world is going
      const samples = row.samples;
      if (!samples.length || samples[samples.length - 1].tick !== world.tick) samples.push({ tick: world.tick, need: needOf(drive), value: drive.value / drive.scale });
      while (samples.length > 2 && world.tick - samples[1].tick > 3 * TICKS_PER_SECOND) samples.shift();
      if (samples.length && samples[0].tick > world.tick) samples.length = 0; // a different creature, or a different world
      // the arrow goes the way the bar is going, and its colour says whether that's good
      const first = samples[0];
      const last = samples[samples.length - 1];
      const moved = samples.length > 1 ? last.value - first.value : 0;
      const arrow = Math.abs(moved) < 0.015 ? '' : moved > 0 ? '▲' : '▼';
      const worse = samples.length > 1 && last.need > first.need;
      if (row.trend.textContent !== arrow || row.trend.classList.contains('worse') !== worse) {
        row.trend.textContent = arrow;
        row.trend.className = `trend ${worse ? 'worse' : 'better'}`;
      }
      const level = Math.max(0, Math.min(1, drive.value / drive.scale));
      const need = needOf(drive);
      row.fill.style.width = `${Math.round(level * 100)}%`;
      row.fill.style.background = need > 0.7 ? 'var(--bad)' : need > 0.45 ? 'var(--warm)' : 'var(--good)';
      row.value.textContent = String(Math.round(drive.value));
    }
    $('mood').textContent = moodWords(world);
    const seconds = Math.floor((world.tick - c.bornTick) / TICKS_PER_SECOND);
    $('age').textContent = `${Math.floor(seconds / 60)}m ${seconds % 60}s old`;
  }

  // what it's up to this moment, why, and what it's going to do next
  function renderNow(): void {
    const c = world.creature;
    const decision = lastDecision;
    const target = world.targetOf(c.doing?.targetId ?? null);
    const seen = decision?.chosen.percept && c.doing && decision.chosen.thingId === c.doing.targetId ? describe(decision.chosen.percept) : (target?.name ?? null);
    setText('now-doing', doingNow(c, seen));

    let why = '';
    let whyClass = 'habit';
    if (c.doing?.told) {
      why = 'You told it to';
      whyClass = 'told';
    } else if (c.doing && decision) {
      const reason = c.brain.reason(decision, world.needs());
      why = { learned: 'It learned this works', planned: 'It worked out what this leads to', curious: 'Just curious', habit: 'Out of habit' }[reason];
      whyClass = reason;
    }
    const whyBox = $('now-why');
    if (whyBox.textContent !== why) whyBox.textContent = why;
    whyBox.className = why ? `why ${whyClass}` : '';

    setText('now-feeling', c.dead ? '' : `Feeling ${feelingWords(world)}.`);
    const others = (decision?.options ?? [])
      .filter((o) => o.percept && o !== decision?.chosen)
      .sort((x, y) => y.score - x.score)
      .slice(0, 3)
      .map((o) => `the ${describe(o.percept)}`);
    setText('now-considered', c.doing && !c.doing.told && others.length ? `It also considered ${others.join(', ')}.` : '');

    // what it thinks went wrong, and the way back, which stays in view after it has come back too
    const deathBox = $('now-death');
    deathBox.style.display = c.dead || c.lastDeath ? 'block' : 'none';
    deathBox.classList.toggle('dead', c.dead);
    setText('now-lesson', c.lastDeath ? `${c.dead ? '' : 'Last time it died: '}${c.lastDeath}${c.deaths > 1 ? ` It has died ${c.deaths} times.` : ''}` : '');
    $('revive').style.display = c.dead ? 'block' : 'none';

    const ordersBox = $('now-orders');
    const orderWords = c.orders.map((o) => {
      const name = world.thing(o.targetId)?.name;
      return name ? `${o.action} the ${name}` : o.action;
    });
    const key = orderWords.join('|');
    if (ordersBox.dataset.drawn !== key) {
      ordersBox.dataset.drawn = key;
      ordersBox.replaceChildren();
      if (orderWords.length) {
        const words = document.createElement('span');
        words.textContent = `Next: ${orderWords.join(', then ')}. `;
        words.title = words.textContent;
        const clear = document.createElement('button');
        clear.textContent = 'Forget these';
        clear.addEventListener('click', () => {
          world.clearOrders();
          renderNow();
        });
        ordersBox.append(words, clear);
      }
    }
  }

  // long lines get cut off to keep the panel still, so the full words show when you hover
  function setText(id: string, words: string): void {
    const el = $(id);
    if (el.textContent === words) return;
    el.textContent = words;
    el.title = words;
  }

  let thoughtKey = '';
  function renderThoughts(): void {
    if (!($('recent-box') as HTMLDetailsElement).open) return;
    const list = thoughts.of(world.focusId);
    // the "how long ago" changes all the time, so this is only rebuilt every so often, unless something new happened
    const key = `${list[0]?.tick ?? 0}:${list.length}:${Math.floor(world.tick / 150)}`;
    if (key === thoughtKey) return;
    thoughtKey = key;
    const box = $('thought-list');
    box.replaceChildren();
    if (list.length === 0) {
      const none = document.createElement('li');
      none.className = 'muted';
      none.textContent = 'Nothing yet. This fills up as it does things.';
      box.appendChild(none);
    }
    for (const thought of list.slice(0, 20)) {
      const li = document.createElement('li');
      li.className = `thought ${thought.kind}`;
      const words = document.createElement('span');
      words.textContent = thought.words;
      const when = document.createElement('small');
      when.textContent = ago(thought.tick, world.tick);
      li.append(words, when);
      box.appendChild(li);
    }
  }

  // who's here, once there's more than one
  const rosterBox = $('roster');
  function renderRoster(): void {
    const key = world.creatures.length < 2 ? '' : `${world.focusId}|${world.creatures.map((c) => `${c.id}:${c.name}:${c.look.body}:${c.hatching > 0}:${c.dead}:${world.worstNeed(c) > 0.65}`).join()}`;
    if (rosterBox.dataset.drawn === key) return;
    rosterBox.dataset.drawn = key;
    rosterBox.replaceChildren();
    if (!key) return;
    for (const c of world.creatures) {
      const b = document.createElement('button');
      b.className = `roster-chip${c.id === world.focusId ? ' on' : ''}`;
      b.title = `Look at ${c.name}. Click again to find them.`;
      const dot = document.createElement('i');
      dot.style.background = hex(c.look.body);
      const label = document.createElement('span');
      label.textContent = c.dead ? `${c.name} (dead)` : c.hatching > 0 ? `${c.name} (egg)` : world.worstNeed(c) > 0.65 ? `${c.name} !` : c.name;
      b.append(dot, label);
      b.addEventListener('click', () => {
        if (c.id === world.focusId && !editor.inBody) scene.centreOn(c.x, c.y);
        editor.focusOn(c.id);
      });
      rosterBox.appendChild(b);
    }
  }

  // room size
  const sizePanel = $('size-panel');
  const widthBox = $<HTMLInputElement>('size-width');
  const heightBox = $<HTMLInputElement>('size-height');
  widthBox.min = String(SIZE_RANGE.minWidth);
  widthBox.max = String(SIZE_RANGE.maxWidth);
  heightBox.min = String(SIZE_RANGE.minHeight);
  heightBox.max = String(SIZE_RANGE.maxHeight);
  (sizePanel.querySelector('.size-note') as HTMLElement).textContent = `Width ${SIZE_RANGE.minWidth} to ${SIZE_RANGE.maxWidth}, height ${SIZE_RANGE.minHeight} to ${SIZE_RANGE.maxHeight}. Creatures only notice things within about 900, so in a big room they may need to wander to find what you've built. Changing the size clears undo.`;
  for (const preset of SIZES) {
    const b = document.createElement('button');
    b.textContent = preset.name;
    b.title = `${preset.width} by ${preset.height}`;
    b.addEventListener('click', () => {
      widthBox.value = String(preset.width);
      heightBox.value = String(preset.height);
    });
    $('size-presets').appendChild(b);
  }
  sizePanel.addEventListener('pointerdown', (e) => e.stopPropagation());
  sizePanel.addEventListener('keydown', (e) => e.stopPropagation());
  $('size-open').addEventListener('click', () => {
    widthBox.value = String(world.size.width);
    heightBox.value = String(world.size.height);
    $<HTMLInputElement>('gravity-strength').value = String(world.gravity.strength);
    $<HTMLSelectElement>('gravity-direction').value = String(world.gravity.direction);
    $('size-now').textContent = `Right now it's ${world.size.width} by ${world.size.height}.`;
    sizePanel.style.display = 'block';
  });
  $('size-close').addEventListener('click', () => {
    sizePanel.style.display = 'none';
  });
  $('size-apply').addEventListener('click', () => {
    const width = Number(widthBox.value);
    const height = Number(heightBox.value);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return toast('Those sizes need to be numbers.');
    editor.setView('room');
    world.resize(width, height);
    world.setGravity(chosenGravity());
    editor.newWorld();
    sizePanel.style.display = 'none';
    scene.syncSize(world);
    scene.centreOn(world.creature.x, world.creature.y);
    save(world);
    toast(`The room is now ${world.size.width} by ${world.size.height}. F finds your creature, 0 shows the whole room.`);
  });
  const chosenGravity = (): { strength: number; direction: number } => ({
    strength: Number($<HTMLInputElement>('gravity-strength').value) || 0,
    direction: Number($<HTMLSelectElement>('gravity-direction').value),
  });
  $('size-new').addEventListener('click', async () => {
    const size = { width: Number(widthBox.value), height: Number(heightBox.value) };
    const gravity = chosenGravity();
    sizePanel.style.display = 'none';
    await addWorld(`World ${store.list().length + 1}`, new World({ seed: newSeed(), egg: true, genes: newGenes(), size, gravity }));
    toast('A new world, with a new egg. The one you were in is on the main menu.');
  });

  // app updates, like the ones in Prism: a check, every version with what changed, and a quiet check once a day
  const UPDATE_KEY = 'nurtron.updates';
  const updatePanel = $('update-panel');
  const updatePrefs = ((): { auto: boolean; lastCheck: number } => {
    try {
      const saved = JSON.parse(localStorage.getItem(UPDATE_KEY) ?? '{}') as { auto?: unknown; lastCheck?: unknown };
      return { auto: saved.auto !== false, lastCheck: typeof saved.lastCheck === 'number' ? saved.lastCheck : 0 };
    } catch {
      return { auto: true, lastCheck: 0 };
    }
  })();
  const saveUpdatePrefs = (): void => {
    try {
      localStorage.setItem(UPDATE_KEY, JSON.stringify(updatePrefs));
    } catch {
      // nowhere to keep it, so it just checks again next time
    }
  };
  let updateBusy = false;
  let updateNewer: Release | null = null;
  let updateReleases: Release[] = [];
  const install = installer();
  // what this copy can do: the desktop app says its own version and whether it can install, a browser can't
  let updateInfo: { current: string; asset: string | null; cantInstall: string | null } = { current: __APP_VERSION__, asset: null, cantInstall: 'Installing works in the desktop app. In a browser, the pages below have the downloads.' };
  const openPage = (url: string): void => {
    window.open(safePage(url), '_blank', 'noopener');
  };
  const canInstall = (r: Release): boolean => !!install && !updateInfo.cantInstall && !!updateInfo.asset && r.builds.includes(updateInfo.asset);
  function setUpdateBusy(busy: boolean): void {
    updateBusy = busy;
    for (const b of updatePanel.querySelectorAll<HTMLButtonElement>('#update-check, #update-get, [data-install]')) b.disabled = busy;
  }
  function renderReleases(releases: Release[]): void {
    const list = $('update-list');
    list.replaceChildren();
    releases.slice(0, 15).forEach((r, i) => {
      const box = document.createElement('div');
      box.className = 'update-release';
      const head = document.createElement('div');
      head.className = 'update-release-head';
      const name = document.createElement('strong');
      name.textContent = r.tag;
      const date = document.createElement('span');
      date.className = 'muted';
      date.textContent = r.date;
      head.append(name, date);
      const badge = (words: string): void => {
        const b = document.createElement('span');
        b.className = 'update-badge';
        b.textContent = words;
        head.appendChild(b);
      };
      if (i === 0) badge('NEWEST');
      if (compareVersions(r.version, updateInfo.current) === 0) badge('INSTALLED');
      const notes = document.createElement('div');
      notes.className = 'update-notes';
      notes.hidden = true;
      notes.textContent = r.notes.replace(/\*\*/g, '') || 'No notes.';
      const toggle = document.createElement('button');
      toggle.textContent = 'What changed';
      toggle.addEventListener('click', () => {
        notes.hidden = !notes.hidden;
        toggle.textContent = notes.hidden ? 'What changed' : 'Hide';
      });
      head.appendChild(toggle);
      if (canInstall(r)) {
        const verb = verbFor(r.version, updateInfo.current);
        const go = document.createElement('button');
        go.textContent = verb;
        go.dataset.install = r.version;
        if (verb === 'Update') go.className = 'accent';
        go.addEventListener('click', () => askToInstall(r));
        head.appendChild(go);
      } else {
        const page = document.createElement('button');
        page.textContent = 'Download page';
        page.addEventListener('click', () => openPage(r.page));
        head.appendChild(page);
      }
      box.append(head, notes);
      list.appendChild(box);
    });
  }
  // nothing is downloaded until the player has said yes to exactly this version
  function askToInstall(r: Release): void {
    if (updateBusy || !install) return;
    const verb = verbFor(r.version, updateInfo.current);
    const back = verb === 'Downgrade';
    const oneWay = back && compareVersions(r.version, FIRST_WITH_INSTALLER) < 0 ? ` ${r.version} can't install versions itself, so coming back means downloading from GitHub.` : '';
    const words = back
      ? `Go back to Nurtron ${r.version}? It downloads it, closes, and opens again. Worlds made with newer versions might not open in an older one, so save your creatures to files first.${oneWay}`
      : `${verb === 'Update' ? 'Update to' : 'Reinstall'} Nurtron ${r.version}? It downloads it, closes, and opens again. Your creatures and worlds are kept.`;
    confirmReplace(words, back ? 'Go back' : verb, () => installVersion(r));
  }
  async function installVersion(r: Release): Promise<void> {
    if (!install || updateBusy) return;
    save(world);
    setUpdateBusy(true);
    const status = $('update-status');
    status.textContent = `Getting ${r.version}…`;
    const off = install.onProgress((p) => {
      status.textContent = p.stage === 'download' ? `Downloading ${r.version}… ${p.percent}%` : `Installing ${r.version}…`;
    });
    try {
      await install.install(r.version);
      status.textContent = 'Restarting…';
    } catch (err) {
      status.textContent = `It didn't work, and nothing was changed: ${updateError(err)}`;
      setUpdateBusy(false);
    } finally {
      off();
    }
  }
  const updateError = (err: unknown): string => String((err as Error)?.message ?? err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  async function checkForUpdates(quiet: boolean): Promise<void> {
    if (updateBusy) return;
    setUpdateBusy(true);
    if (!quiet) $('update-status').textContent = 'Asking GitHub…';
    try {
      if (install) updateInfo = await install.info();
      $('update-version').textContent = `Nurtron ${updateInfo.current}`;
      updateReleases = await fetchReleases();
      updatePrefs.lastCheck = Date.now();
      saveUpdatePrefs();
      const { words, newer } = updateWords(updateReleases, updateInfo.current);
      updateNewer = newer;
      $('update-status').textContent = `${words}${updateInfo.cantInstall ? ` ${updateInfo.cantInstall}` : ''}`;
      $('update-get').hidden = !newer;
      $('update-get').textContent = newer && canInstall(newer) ? 'Update now' : 'Open download page';
      renderReleases(updateReleases);
      if (quiet && newer) toast(`Nurtron ${newer.version} is available. Files, then App updates.`);
    } catch (err) {
      if (!quiet) $('update-status').textContent = `Couldn't check: ${updateError(err)}`;
    } finally {
      setUpdateBusy(false);
    }
  }
  $('update-version').textContent = `Nurtron ${__APP_VERSION__}`;
  $<HTMLInputElement>('update-auto').checked = updatePrefs.auto;
  $<HTMLInputElement>('update-auto').addEventListener('change', (e) => {
    updatePrefs.auto = (e.target as HTMLInputElement).checked;
    saveUpdatePrefs();
  });
  $('updates-open').addEventListener('click', () => openMenu('settings'));
  $('update-check').addEventListener('click', () => checkForUpdates(false));
  $('update-get').addEventListener('click', () => {
    if (!updateNewer) return;
    if (canInstall(updateNewer)) askToInstall(updateNewer);
    else openPage(updateNewer.page);
  });
  if (updatePrefs.auto && Date.now() - updatePrefs.lastCheck > 20 * 3600 * 1000) window.setTimeout(() => checkForUpdates(true), 8000);

  // ---- the main menu: worlds, and settings ----
  // everything here is on unless it was switched off, so a new setting starts on for everyone
  const PREF_NAMES = ['menuAtStart', 'scenery', 'particles', 'shake', 'intent', 'minimap'] as const;
  type Prefs = Record<(typeof PREF_NAMES)[number], boolean>;
  const prefs = ((): Prefs => {
    const all = Object.fromEntries(PREF_NAMES.map((name) => [name, true])) as Prefs;
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Record<string, unknown>;
      for (const name of PREF_NAMES) all[name] = saved[name] !== false;
    } catch {
      // all on, then
    }
    return all;
  })();
  const savePrefs = (): void => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // it just opens the menu again next time
    }
  };
  const menu = $('menu');
  let menuBusy = false;
  $('menu-version').textContent = `Version ${__APP_VERSION__}`;
  menu.addEventListener('pointerdown', (e) => e.stopPropagation());
  menu.addEventListener('keydown', (e) => e.stopPropagation());

  function showTab(tab: 'worlds' | 'settings'): void {
    $('menu-worlds').hidden = tab !== 'worlds';
    $('menu-settings').hidden = tab !== 'settings';
    $('menu-tab-worlds').classList.toggle('on', tab === 'worlds');
    $('menu-tab-settings').classList.toggle('on', tab === 'settings');
    if (tab === 'settings' && !$('update-list').childElementCount) checkForUpdates(false);
  }

  // the world stops while the menu is up, and gets a fresh picture for its card
  function openMenu(tab: 'worlds' | 'settings' = 'worlds'): void {
    if (playingFrom) setPlaying(false);
    inMenu = true;
    menu.style.display = 'flex';
    showTab(tab);
    renderWorlds();
    const id = store.activeId;
    if (id) {
      save(world);
      store.keep(id, world.save(), summarise(world)).then(renderWorlds, (err) => console.error('Could not keep the world', err));
    }
  }
  // the window says which world you're in
  function syncTitle(): void {
    const name = store.list().find((entry) => entry.id === store.activeId)?.name;
    document.title = name ? `${name} · Nurtron` : 'Nurtron';
  }

  function closeMenu(): void {
    if (!store.activeId) return toast('Choose a world, or make a new one, first.');
    syncTitle();
    inMenu = false;
    menu.style.display = 'none';
    $('menu-new-form').hidden = true;
  }

  // leaves the world you're in, kept safe, and goes into this one
  async function switchTo(id: string, next: World): Promise<void> {
    const was = store.activeId;
    if (was && saving) await store.keep(was, world.save(), summarise(world));
    store.setActive(id);
    saving = true;
    swapWorld(next);
    closeMenu();
  }

  async function addWorld(name: string, next: World): Promise<void> {
    if (menuBusy) return;
    menuBusy = true;
    try {
      const entry = await store.add(name, next.save(), summarise(next));
      await switchTo(entry.id, next);
    } catch (err) {
      next.dispose();
      toast(err instanceof Error ? err.message : "That world couldn't be made.");
    } finally {
      menuBusy = false;
    }
  }

  async function enterWorld(entry: WorldEntry): Promise<void> {
    if (entry.id === store.activeId) return closeMenu();
    if (menuBusy) return;
    menuBusy = true;
    try {
      const text = await store.text(entry.id);
      if (!text) throw new Error(`${entry.name} couldn't be found.`);
      let next: World;
      try {
        next = World.load(text);
      } catch {
        throw new Error(`${entry.name} couldn't be opened. It's still kept, in case a newer version can read it.`);
      }
      await switchTo(entry.id, next);
      toast(`Welcome back to ${entry.name}.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "That world couldn't be opened.");
    } finally {
      menuBusy = false;
    }
  }

  const agoWords = (when: number): string => {
    const minutes = Math.round((Date.now() - when) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
  };

  function renderWorlds(): void {
    syncTitle();
    const grid = $('world-grid');
    grid.replaceChildren();
    $('menu-continue').hidden = !store.activeId;
    $('menu-close').hidden = !store.activeId;
    for (const entry of store.list()) {
      const card = document.createElement('div');
      card.className = 'world-card';
      card.classList.toggle('open', entry.id === store.activeId);
      const picture = document.createElement('button');
      picture.className = 'world-picture';
      picture.title = `Go into ${entry.name}`;
      if (entry.preview) {
        const img = document.createElement('img');
        img.src = entry.preview;
        img.alt = `The map of ${entry.name}`;
        picture.appendChild(img);
      } else picture.textContent = 'No picture yet';
      picture.addEventListener('click', () => enterWorld(entry));
      const name = document.createElement('div');
      name.className = 'world-name';
      name.textContent = entry.name;
      if (entry.id === store.activeId) {
        const badge = document.createElement('span');
        badge.className = 'update-badge';
        badge.textContent = 'OPEN NOW';
        name.appendChild(badge);
      }
      const about = document.createElement('div');
      about.className = 'muted world-about';
      const who = entry.creatures.length ? (entry.creatures.length > 3 ? `${entry.creatures.slice(0, 3).join(', ')} and ${entry.creatures.length - 3} more` : entry.creatures.join(', ')) : '';
      about.textContent = [who, entry.width ? `${entry.width} by ${entry.height}` : '', `played ${agoWords(entry.played)}`].filter(Boolean).join(' · ');
      about.title = about.textContent;
      const actions = document.createElement('div');
      actions.className = 'world-actions';
      const go = document.createElement('button');
      go.className = 'accent';
      go.textContent = entry.id === store.activeId ? 'Back in' : 'Play';
      go.addEventListener('click', () => enterWorld(entry));
      const rename = document.createElement('button');
      rename.textContent = 'Rename';
      rename.addEventListener('click', () => {
        const box = document.createElement('input');
        box.className = 'prop-name';
        box.maxLength = 40;
        box.value = entry.name;
        name.replaceWith(box);
        box.focus();
        box.select();
        const done = (): void => {
          store.rename(entry.id, box.value);
          renderWorlds();
        };
        box.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') done();
          if (e.key === 'Escape') renderWorlds();
        });
        box.addEventListener('blur', done);
      });
      const remove = document.createElement('button');
      remove.className = 'danger';
      remove.textContent = 'Delete';
      remove.addEventListener('click', () => {
        const open = entry.id === store.activeId;
        confirmReplace(
          `Delete ${entry.name}${who ? `, with ${who} in it` : ''}? This can't be undone. Save World from Files first if you might want it back.`,
          'Delete it',
          async () => {
            await store.remove(entry.id);
            if (open) saving = false;
            renderWorlds();
            toast(`${entry.name} was deleted.`);
          },
          false,
        );
      });
      actions.append(go, rename, remove);
      card.append(picture, name, about, actions);
      grid.appendChild(card);
    }
    if (!store.list().length) {
      const none = document.createElement('div');
      none.className = 'muted';
      none.textContent = 'No worlds yet. Make a new one to start.';
      grid.appendChild(none);
    }
  }

  let newSize = NEW_WORLD_SIZE;
  for (const preset of SIZES) {
    const b = document.createElement('button');
    b.textContent = preset.name;
    b.title = `${preset.width} by ${preset.height}`;
    b.classList.toggle('on', preset === newSize);
    b.addEventListener('click', () => {
      newSize = preset;
      for (const other of $('new-world-sizes').children) other.classList.toggle('on', other === b);
    });
    $('new-world-sizes').appendChild(b);
  }
  $('menu-new').addEventListener('click', () => {
    if (store.full) return toast('That\'s as many worlds as there\'s room for. Delete one first.');
    $('menu-new-form').hidden = false;
    const box = $<HTMLInputElement>('new-world-name');
    box.value = `World ${store.list().length + 1}`;
    box.focus();
    box.select();
  });
  $('new-world-cancel').addEventListener('click', () => {
    $('menu-new-form').hidden = true;
  });
  const makeWorld = (): void => {
    const name = $<HTMLInputElement>('new-world-name').value;
    $('menu-new-form').hidden = true;
    addWorld(name, new World({ seed: newSeed(), egg: true, genes: newGenes(), size: newSize })).then(() => toast('A new world, with a new egg.'));
  };
  $('new-world-make').addEventListener('click', makeWorld);
  $<HTMLInputElement>('new-world-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') makeWorld();
  });
  $('menu-open-file').addEventListener('click', () => anyFile.click());
  $('menu-continue').addEventListener('click', closeMenu);
  $('menu-close').addEventListener('click', closeMenu);
  $('menu-open').addEventListener('click', () => openMenu());
  $('menu-tab-worlds').addEventListener('click', () => showTab('worlds'));
  $('menu-tab-settings').addEventListener('click', () => showTab('settings'));
  function applyPrefs(): void {
    scene.setOptions({ ...DEFAULT_SCENE_OPTIONS, scenery: prefs.scenery, particles: prefs.particles, shake: prefs.shake, intent: prefs.intent });
    $('app').classList.toggle('no-minimap', !prefs.minimap);
    for (const name of PREF_NAMES) {
      const box = $<HTMLInputElement>(name === 'menuAtStart' ? 'pref-menu-start' : `pref-${name}`);
      box.checked = prefs[name];
    }
  }
  for (const name of PREF_NAMES) {
    $<HTMLInputElement>(name === 'menuAtStart' ? 'pref-menu-start' : `pref-${name}`).addEventListener('change', (e) => {
      prefs[name] = (e.target as HTMLInputElement).checked;
      savePrefs();
      applyPrefs();
    });
  }
  applyPrefs();
  $('pref-guide').addEventListener('click', () => {
    guide.restart();
    toast('The first steps are back, in the corner of the room.');
  });
  // only the desktop app has a window of its own to close
  if (installer()) {
    $('menu-quit').hidden = false;
    $('menu-quit').addEventListener('click', () => {
      save(world);
      window.close();
    });
  }
  if (prefs.menuAtStart || !store.activeId) openMenu();

  $('revive').addEventListener('click', () => {
    world.revive();
    renderNow();
    toast(`${world.creature.name} is back, and remembers.`);
  });

  document.querySelectorAll<HTMLButtonElement>('[data-order]').forEach((b) => {
    b.addEventListener('click', () => tell(b.dataset.order as Action, null));
  });

  function renderLearned(): void {
    const brain = world.creature.brain;
    const pinned = brainView.pinned !== null && brain.concepts[brainView.pinned] ? brainView.pinned : null;
    const links = pinned === null ? brain.strongestLinks(6) : brain.linksOf(pinned, 0.05).slice(0, 6);
    const key = `${pinned}:${links.map((l) => `${l.concept}/${l.action}/${l.channel}/${l.strength.toFixed(2)}`).join('|')}`;
    if (key === learnedKey) return;
    learnedKey = key;
    $('learned').innerHTML =
      `<h3>${pinned === null ? 'What it has learned' : `What it knows about ${escapeHtml(describe(brain.concepts[pinned].percept))}`}</h3>` +
      (links.length
        ? links
            .map(
              (l) =>
                `<div class="learned-row"><span>${escapeHtml(l.words)}</span><div class="bar"><i class="${l.strength < 0 ? 'neg' : ''}" style="width:${Math.round(Math.abs(l.strength) * 100)}%"></i></div></div>`,
            )
            .join('')
        : `<div class="muted">Nothing yet. Let it explore, and pet it when it does something good.</div>`);
  }

  let sinceSave = 0;
  let warnedSave = false;
  let sinceText = 0;
  scene.app.ticker.add((ticker) => {
    const dt = Math.min(0.1, ticker.deltaMS / 1000);
    // paused, or in the menu, nothing moves at all, so nothing should look like it's moving either
    const still = inMenu || speed === 0;
    const moving = still ? 0 : dt;
    carry += moving * speed * TICKS_PER_SECOND;
    const steps = Math.min(64, Math.floor(carry));
    carry -= Math.floor(carry);
    for (let i = 0; i < steps; i++) world.step();
    const events = world.takeEvents();
    for (const event of events) {
      if (event.type === 'petted') guide.mark('pet');
      else if (event.type === 'touched' && event.ate && !event.cuddle) guide.mark('eat');
      else if (event.type === 'decided' && event.told && event.decision.chosen.percept) guide.mark('tell');
      if (event.type === 'died') {
        const c = world.creatureById(event.who);
        if (c) toast(`${c.name} has died. ${event.who === world.focusId ? event.lesson : 'Click them to see what went wrong.'}`);
      } else if (event.type === 'decided' && event.who === world.focusId) {
        lastDecision = event.decision;
        brainView.onDecision(event.decision);
      } else if (event.type === 'loop') {
        toast('A loop was stopped: the wires in red never settle. A pulse wired to a Label fixes that.');
      }
    }
    thoughts.take(events, world.tick, world.creatures.map((c) => c.id), new Map(world.creatures.map((c) => [c.id, c.name])));
    notesThisFrame = 0;
    for (const event of events) {
      if (event.type === 'sound') playNote(event.pitch, event.seconds);
      else if (event.type === 'solved') toast(`${event.name} solved in ${Math.round(event.seconds)} seconds!`);
    }
    if (playingFrom) {
      const target = world.cameraTarget();
      if (target) scene.follow(target.x, target.y, target.zoom, dt);
    } else if (following && !editor.inBody) {
      // looking somewhere else yourself means you've stopped following
      if (scene.pans !== pansWhenFollowing || minimap.moved) setFollowing(false);
      // a little low in the view, the way F shows it, so there's room above to see what it's going for
      else if (!world.creature.hiddenAway) scene.follow(world.creature.x, world.creature.y - scene.viewRect().height * 0.22, scene.zoom, dt);
    }
    if (world.focusId !== shownFocus) syncFocus();
    scene.handle(events, world);
    scene.draw(world, moving, speed, carry, editor.overlay());
    // no point working out a picture of something nobody can see
    if (panelState.open && ($('brain-box') as HTMLDetailsElement).open) brainView.draw(world.creature.brain, world.needs(), world.creature.drives, moving);

    sinceText += dt;
    if (sinceText > 0.15) {
      sinceText = 0;
      renderHud();
      renderRoster();
      family.refresh();
      renderTrial();
      if (prefs.minimap && !editor.inBody && !playingFrom) minimap.draw();
      $('paused-badge').classList.toggle('on', speed === 0 && !inMenu && !playingFrom);
      $<HTMLButtonElement>('undo').disabled = !editor.history.canUndo;
      $<HTMLButtonElement>('redo').disabled = !editor.history.canRedo;
      if (editor.inBody) guide.mark('inside');
      if (speed > 1) guide.mark('speed');
      if (panelState.open) {
        renderNow();
        renderThoughts();
        renderLearned();
      }
    }
    sinceSave += dt;
    if (sinceSave > 10 && !inMenu) {
      sinceSave = 0;
      if (!save(world) && !warnedSave) {
        warnedSave = true;
        toast("Couldn't save. Use Files to save your world, so you don't lose anything.");
      }
    }
  });
  window.addEventListener('beforeunload', () => save(world));

  renderHud();
  renderLearned();
  renderNow();
  renderThoughts();
  renderRoster();

  // for checking the running game from the console and from tests
  Object.assign(window, {
    nurtron: { getWorld: () => world, getDecision: () => lastDecision, setSpeed, editor, scene, ROOM, store, openMenu, closeMenu },
  });
}

// what's bothering it most, in words. food and energy have proper ones. anything else you've wired up gets named as it is.
function feelingWords(world: World): string {
  let worst: Drive | null = null;
  for (const drive of world.creature.drives) {
    if (drive.kind === 'drive' && (!worst || needOf(drive) > needOf(worst))) worst = drive;
  }
  if (!worst || needOf(worst) <= 0.4) return 'fine';
  const very = needOf(worst) > 0.65 ? 'very ' : '';
  if (worst.name === 'Hunger' || worst.name === 'Food') return `${very}hungry`;
  if (worst.name === 'Energy') return `${very}tired`;
  if (worst.wants === 'near') return `${very}unhappy about ${worst.name}`;
  return `${very}${worst.wants === 'high' ? 'short of' : 'fed up with'} ${worst.name}`;
}

function moodWords(world: World): string {
  const c = world.creature;
  if (c.dead) return 'Dead';
  if (c.hatching > 0) return 'Hatching';
  if (c.dragged) return 'Wheee!';
  if (c.stunned > 0) return 'Ow!';
  if (c.doing?.action === 'rest') return 'Resting';
  if (c.brain.mood > 0.3) return 'Happy';
  if (c.brain.mood < -0.3) return 'Upset';
  const feeling = feelingWords(world);
  return feeling === 'fine' ? 'Content' : feeling[0].toUpperCase() + feeling.slice(1);
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);
}

// what a file says it is, without trusting anything else about it yet
function sniffType(text: string): unknown {
  try {
    return (JSON.parse(text) as { type?: unknown } | null)?.type;
  } catch {
    return null;
  }
}

if (location.search.includes('envcheck')) {
  (window as unknown as { nurtronEnvCheck: unknown }).nurtronEnvCheck = runEnvCheck();
} else {
  boot();
}
