// decorations: ready-made things with a proper look, from blocks to build with to trees, torches, chests and items.
// they're ordinary things underneath, so a creature sees each one by its shape and colour like anything else, and
// everything you can set on a shape you can set on these. how they're drawn is in app/decor-art.ts.
import { DEFAULT_ENEMY } from './game.ts';
import type { Enemy } from './game.ts';
import type { Colour } from './senses.ts';
import type { Form } from './shapes.ts';
import type { ThingSpec } from './world.ts';

export const DECOR_GROUPS = ['Blocks', 'Nature', 'Dungeon', 'Home', 'Treasure', 'Food', 'Enemies', 'Sky', 'Fun'] as const;
export type DecorGroup = (typeof DECOR_GROUPS)[number];

export interface Decor {
  id: string;
  name: string;
  group: DecorGroup;
  form: Form;
  colour: Colour; // what a creature sees it as
  hw: number;
  hh: number;
  solid: boolean; // things bump into it
  fixed: boolean; // stays where it's put
  gravity: boolean; // falls if it isn't fixed
  extra?: Partial<ThingSpec>; // anything else it starts out as, like an item or a chest
}

type Look = [id: string, name: string, colour: Colour, hw: number, hh: number, form?: Form];

// a solid block you build with, that stays put
const block = ([id, name, colour, hw, hh, form]: Look): Decor => ({ id, name, group: 'Blocks', form: form ?? 'box', colour, hw, hh, solid: true, fixed: true, gravity: true });
// something to look at that you walk past, rather than into
const scenery = (group: DecorGroup) => ([id, name, colour, hw, hh, form]: Look, solid = false): Decor => ({ id, name, group, form: form ?? 'box', colour, hw, hh, solid, fixed: true, gravity: true });
// something a creature picks up when it touches it
const item = ([id, name, colour, hw, hh, form]: Look): Decor => ({ id, name, group: 'Treasure', form: form ?? 'circle', colour, hw, hh, solid: true, fixed: false, gravity: true, extra: { item: true } });
// something a creature eats
const food = ([id, name, colour, hw, hh, form]: Look, feeds: number): Decor => ({ id, name, group: 'Food', form: form ?? 'circle', colour, hw, hh, solid: true, fixed: false, gravity: true, extra: { give: { drive: 'Hunger', amount: -feeds }, eaten: true, respawnSeconds: 15 } });
// something that comes after creatures, with health so it can be fought
const foe = ([id, name, colour, hw, hh, form]: Look, hp: number, enemy: Partial<Enemy>): Decor => ({ id, name, group: 'Enemies', form: form ?? 'box', colour, hw, hh, solid: true, fixed: false, gravity: !enemy.flies, extra: { hp, enemy: { ...DEFAULT_ENEMY, ...enemy }, tags: ['enemy'] } });
const sky = scenery('Sky');
const nature = scenery('Nature');
const dungeon = scenery('Dungeon');
const home = scenery('Home');
const fun = scenery('Fun');

export const DECOR: Decor[] = [
  // blocks to build with
  block(['grass', 'Grass block', 'green', 24, 24]),
  block(['dirt', 'Dirt', 'orange', 24, 24]),
  block(['stone', 'Stone', 'grey', 24, 24]),
  block(['cobble', 'Cobblestone', 'grey', 24, 24]),
  block(['mossy', 'Mossy stone', 'green', 24, 24]),
  block(['stonebrick', 'Stone bricks', 'grey', 24, 24]),
  block(['brick', 'Red bricks', 'red', 24, 24]),
  block(['sandstone', 'Sandstone', 'yellow', 24, 24]),
  block(['sand', 'Sand', 'yellow', 24, 24]),
  block(['snow', 'Snow', 'grey', 24, 24]),
  block(['ice', 'Ice', 'blue', 24, 24]),
  block(['planks', 'Wooden planks', 'orange', 24, 24]),
  block(['darkplanks', 'Dark planks', 'orange', 24, 24]),
  block(['birchplanks', 'Birch planks', 'yellow', 24, 24]),
  block(['log', 'Log', 'orange', 24, 24]),
  block(['leaves', 'Leaves', 'green', 24, 24]),
  block(['glass', 'Glass', 'blue', 24, 24]),
  block(['obsidian', 'Obsidian', 'purple', 24, 24]),
  block(['goldblock', 'Gold block', 'yellow', 24, 24]),
  block(['crystalblock', 'Crystal block', 'purple', 24, 24]),
  block(['metal', 'Metal plate', 'grey', 24, 24]),
  block(['tiles', 'Dungeon tiles', 'grey', 24, 24]),
  block(['checker', 'Checker tiles', 'grey', 24, 24]),
  block(['hay', 'Hay bale', 'yellow', 24, 24]),
  block(['goldore', 'Gold ore', 'grey', 24, 24]),
  block(['ironore', 'Iron ore', 'grey', 24, 24]),
  block(['rubyore', 'Ruby ore', 'red', 24, 24]),
  block(['diamondore', 'Diamond ore', 'blue', 24, 24]),
  block(['emeraldore', 'Emerald ore', 'green', 24, 24]),
  block(['platform', 'Stone ledge', 'grey', 72, 10]),
  block(['woodplatform', 'Wooden ledge', 'orange', 72, 8]),
  { ...scenery('Blocks')(['lava', 'Lava', 'red', 24, 24]), extra: { tags: ['lava'] } },
  scenery('Blocks')(['water', 'Water', 'blue', 24, 24]),

  // nature
  nature(['oak', 'Oak tree', 'green', 56, 96]),
  nature(['pine', 'Pine tree', 'green', 44, 100]),
  nature(['birch', 'Birch tree', 'green', 44, 96]),
  nature(['palm', 'Palm tree', 'green', 56, 100]),
  nature(['autumn', 'Autumn tree', 'orange', 56, 96]),
  nature(['cherry', 'Blossom tree', 'red', 56, 96]),
  nature(['deadtree', 'Dead tree', 'grey', 44, 90]),
  nature(['bush', 'Bush', 'green', 34, 22]),
  nature(['berrybush', 'Berry bush', 'green', 34, 22]),
  nature(['tallgrass', 'Tall grass', 'green', 22, 16]),
  nature(['fern', 'Fern', 'green', 22, 20]),
  nature(['reeds', 'Reeds', 'green', 18, 30]),
  nature(['redflower', 'Red flower', 'red', 10, 18]),
  nature(['yellowflower', 'Yellow flower', 'yellow', 10, 18]),
  nature(['blueflower', 'Blue flower', 'blue', 10, 18]),
  nature(['purpleflower', 'Purple flower', 'purple', 10, 18]),
  nature(['tulip', 'Tulip', 'red', 10, 20]),
  nature(['sunflower', 'Sunflower', 'yellow', 16, 40]),
  nature(['redmushroom', 'Red mushroom', 'red', 16, 16]),
  nature(['brownmushroom', 'Brown mushroom', 'orange', 16, 14]),
  nature(['glowmushroom', 'Glow mushroom', 'blue', 16, 16]),
  nature(['cactus', 'Cactus', 'green', 18, 40], true),
  nature(['pebble', 'Pebbles', 'grey', 18, 8]),
  nature(['rock', 'Rock', 'grey', 26, 20], true),
  nature(['boulder', 'Boulder', 'grey', 48, 40], true),
  nature(['mossyrock', 'Mossy rock', 'green', 30, 22], true),
  nature(['vine', 'Hanging vine', 'green', 12, 50]),
  nature(['lilypad', 'Lily pad', 'green', 20, 5]),
  nature(['stump', 'Tree stump', 'orange', 22, 16], true),

  // dungeon
  dungeon(['torch', 'Torch', 'orange', 8, 26]),
  dungeon(['lantern', 'Lantern', 'yellow', 12, 18]),
  dungeon(['candle', 'Candles', 'yellow', 14, 14]),
  dungeon(['skull', 'Skull', 'grey', 14, 13]),
  dungeon(['bones', 'Bones', 'grey', 22, 8]),
  dungeon(['spikes', 'Spikes', 'grey', 24, 12], true),
  dungeon(['cobweb', 'Cobweb', 'grey', 26, 26]),
  dungeon(['chain', 'Chain', 'grey', 6, 40]),
  dungeon(['bars', 'Iron bars', 'grey', 24, 36], true),
  dungeon(['door', 'Wooden door', 'orange', 22, 40], true),
  dungeon(['irondoor', 'Iron door', 'grey', 22, 40], true),
  dungeon(['pillar', 'Stone pillar', 'grey', 18, 60], true),
  dungeon(['redbanner', 'Red banner', 'red', 18, 36]),
  dungeon(['bluebanner', 'Blue banner', 'blue', 18, 36]),
  dungeon(['greenbanner', 'Green banner', 'green', 18, 36]),
  dungeon(['purplebanner', 'Purple banner', 'purple', 18, 36]),
  dungeon(['tombstone', 'Tombstone', 'grey', 18, 22], true),
  dungeon(['altar', 'Altar', 'purple', 34, 20], true),
  dungeon(['cauldron', 'Cauldron', 'grey', 24, 20], true),
  dungeon(['campfire', 'Campfire', 'orange', 22, 16]),
  dungeon(['portal', 'Portal', 'purple', 34, 50]),
  dungeon(['statue', 'Statue', 'grey', 22, 46], true),
  dungeon(['throne', 'Throne', 'red', 24, 36], true),
  dungeon(['cage', 'Cage', 'grey', 26, 32]),
  { ...dungeon(['chest', 'Treasure chest', 'orange', 24, 18], true), fixed: false, extra: { holds: { Gold: 5 } } },
  { ...dungeon(['goldchest', 'Golden chest', 'yellow', 26, 20], true), fixed: false, extra: { holds: { Gold: 20, Ruby: 1 } } },

  // home
  home(['table', 'Table', 'orange', 34, 18], true),
  home(['chair', 'Chair', 'orange', 14, 22]),
  home(['bed', 'Bed', 'red', 40, 16], true),
  { ...home(['barrel', 'Barrel', 'orange', 18, 22], true), fixed: false },
  { ...home(['crate', 'Crate', 'orange', 22, 22], true), fixed: false },
  home(['vase', 'Vase', 'orange', 12, 18], true),
  home(['rug', 'Rug', 'red', 48, 4]),
  home(['window', 'Window', 'blue', 22, 22]),
  home(['fence', 'Fence', 'orange', 30, 18], true),
  { ...home(['ladder', 'Ladder', 'orange', 16, 50]), extra: { climbable: true } },
  home(['sign', 'Sign', 'orange', 22, 22]),
  home(['bookshelf', 'Bookshelf', 'orange', 26, 34], true),
  home(['well', 'Well', 'grey', 30, 34], true),
  home(['lamppost', 'Lamp post', 'grey', 12, 56]),
  home(['anvil', 'Anvil', 'grey', 22, 14], true),
  home(['fountain', 'Fountain', 'blue', 40, 30], true),
  home(['pot', 'Plant pot', 'green', 14, 20], true),

  // treasure: all of these are items, so a creature picks them up when it touches them
  item(['coin', 'Coin', 'yellow', 9, 9]),
  item(['gold', 'Gold', 'yellow', 13, 9, 'box']),
  item(['ruby', 'Ruby', 'red', 10, 11, 'hexagon']),
  item(['sapphire', 'Sapphire', 'blue', 10, 11, 'hexagon']),
  item(['emerald', 'Emerald', 'green', 10, 11, 'hexagon']),
  item(['amethyst', 'Amethyst', 'purple', 10, 11, 'hexagon']),
  item(['diamond', 'Diamond', 'blue', 11, 11, 'triangle']),
  item(['xp', 'XP orb', 'green', 7, 7]),
  item(['key', 'Key', 'yellow', 13, 7, 'box']),
  item(['heart', 'Heart', 'red', 11, 10]),
  item(['redpotion', 'Red potion', 'red', 9, 13, 'box']),
  item(['bluepotion', 'Blue potion', 'blue', 9, 13, 'box']),
  item(['greenpotion', 'Green potion', 'green', 9, 13, 'box']),
  item(['sword', 'Sword', 'grey', 6, 22, 'box']),
  item(['shield', 'Shield', 'blue', 14, 16, 'box']),
  item(['bow', 'Bow', 'orange', 10, 20, 'box']),
  item(['axe', 'Axe', 'grey', 12, 20, 'box']),
  item(['pickaxe', 'Pickaxe', 'grey', 16, 18, 'box']),
  item(['wand', 'Magic wand', 'purple', 5, 20, 'box']),
  item(['scroll', 'Scroll', 'yellow', 12, 10, 'box']),
  item(['crown', 'Crown', 'yellow', 16, 11, 'box']),
  item(['ring', 'Ring', 'yellow', 8, 8]),
  item(['bomb', 'Bomb', 'grey', 12, 12]),

  // food: eaten when touched, and comes back after a while
  food(['apple', 'Apple', 'red', 12, 12], 20),
  food(['pear', 'Pear', 'green', 11, 14], 20),
  food(['banana', 'Banana', 'yellow', 15, 7, 'box'], 20),
  food(['cherries', 'Cherries', 'red', 11, 11], 10),
  food(['grapes', 'Grapes', 'purple', 11, 14], 15),
  food(['bread', 'Bread', 'orange', 16, 9, 'box'], 30),
  food(['cheese', 'Cheese', 'yellow', 14, 10, 'triangle'], 25),
  food(['meat', 'Meat', 'red', 15, 10, 'box'], 40),
  food(['carrot', 'Carrot', 'orange', 6, 15, 'triangle'], 15),
  food(['cake', 'Cake', 'purple', 16, 13, 'box'], 50),

  // enemies: they come after creatures, and have health so they can be fought
  foe(['slime', 'Slime', 'green', 20, 14], 30, { speed: 70, damage: 5, jump: 320 }),
  foe(['bigslime', 'Big slime', 'green', 36, 26], 120, { speed: 45, damage: 15, jump: 300 }),
  foe(['bat', 'Bat', 'purple', 18, 10], 15, { flies: true, speed: 120, damage: 4 }),
  foe(['ghost', 'Ghost', 'grey', 20, 24], 25, { flies: true, speed: 60, damage: 8 }),
  foe(['skeleton', 'Skeleton', 'grey', 16, 30], 50, { mode: 'patrol', speed: 80, damage: 10 }),
  foe(['zombie', 'Zombie', 'green', 16, 30], 70, { speed: 40, damage: 12 }),
  foe(['goblin', 'Goblin', 'green', 15, 22], 40, { speed: 110, damage: 6, jump: 420 }),
  foe(['spider', 'Spider', 'purple', 22, 12], 30, { speed: 130, damage: 6, ledges: true }),
  foe(['robot', 'Robot', 'grey', 18, 28], 90, { mode: 'guard', speed: 70, damage: 10 }),
  foe(['eyeball', 'Floating eye', 'red', 16, 16, 'circle'], 20, { flies: true, speed: 80, damage: 5, keep: 0 }),
  foe(['boss', 'Boss', 'red', 50, 50], 600, { speed: 50, damage: 25, jump: 350 }),

  // sky
  { ...sky(['cloud', 'Cloud', 'grey', 60, 24]), gravity: false },
  { ...sky(['sun', 'Sun', 'yellow', 40, 40, 'circle']), gravity: false },
  { ...sky(['moon', 'Moon', 'yellow', 30, 30, 'circle']), gravity: false },
  { ...sky(['star', 'Star', 'yellow', 14, 14]), gravity: false },
  { ...sky(['rainbow', 'Rainbow', 'purple', 80, 40]), gravity: false },
  { ...sky(['bird', 'Bird', 'grey', 14, 8]), gravity: false },
  { ...sky(['balloon', 'Balloon', 'red', 16, 30]), gravity: false },

  // fun
  fun(['flag', 'Flag', 'red', 20, 40]),
  fun(['arrowsign', 'Arrow sign', 'orange', 24, 30]),
  { ...fun(['bouncer', 'Bouncy pad', 'red', 26, 8], true), extra: { bounce: 1 } },
  fun(['pipe', 'Pipe', 'green', 24, 40], true),
  fun(['gear', 'Gear', 'grey', 24, 24, 'circle']),
  fun(['target', 'Target', 'red', 24, 24, 'circle']),
  fun(['trophy', 'Trophy', 'yellow', 16, 20]),
  fun(['present', 'Present', 'purple', 18, 18], true),
  fun(['snowman', 'Snowman', 'grey', 20, 34], true),
  fun(['mailbox', 'Mailbox', 'blue', 12, 26]),
];

export const DECOR_BY_ID = new Map(DECOR.map((d) => [d.id, d]));
export const DECOR_IDS: ReadonlySet<string> = new Set(DECOR.map((d) => d.id));

// a new one, ready to add to the world
export function newDecor(d: Decor, x: number, y?: number): ThingSpec {
  return { name: d.name, form: d.form, colour: d.colour, hw: d.hw, hh: d.hh, x, y, solid: d.solid, fixed: d.fixed, gravity: d.gravity, decor: d.id, ...structuredClone(d.extra ?? {}) };
}
