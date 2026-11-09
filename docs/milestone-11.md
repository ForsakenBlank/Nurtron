# Milestone 11: making real games

**Status: built on the `game-maker-update` branch. Everything in the sim has automated tests, and the new screens were tried in a browser. Nothing was tried on Windows or in the packaged desktop app.**

The aim was to be able to build two kinds of game properly: an RPG dungeon where your creature fights enemies, and something like a survivors game, with waves of enemies, abilities that fire by themselves and power-ups to choose between.

## Building is less annoying

- **The inside of a creature is much bigger**: 8000 by 5000, up from 2000 by 1000.
- **Build areas.** Right-click any shape and press **Build area** at the top. You go into a space of its own with just that thing in the middle, and the parts that make it work go in there instead of cluttering the room. Wire straight from its outputs, like Touched. A part in a build area that isn't attached to anything works on the thing in the middle, so a Mover in a door's build area moves the door. Esc or **Back to the room** comes out. A build area is copied, deleted, saved and turned into an asset along with its thing.
- **Creatures can use it**, at the top of the right-click panel. Off, creatures can't see it, go to it, touch it or press it. A small crossed-out circle shows on it while you build.
- **No size limit worth speaking of.** Things can be up to 40000 across. Drag any corner of a selected thing to resize it (Shift keeps its shape), or type an exact Width and Height in its properties.
- **Gravity zones are yellow**, and you grab them, Sensors and Group boxes by their header only. Clicking inside one goes straight through to whatever is in there.
- **Group box** (Logic): a box to keep parts together, with a name. Dragging it by its header carries everything inside.
- **Combine** (Logic): up to four values into one (add, average, min, max, all, any, count, join), and up to four pulses into one. Its All output fires once every wired pulse has come in.
- **Labels** on anything: words shown over it, only for you.
- **My assets**: right-click anything and **Save as asset**. It keeps its pictures, wires and build area, and you can put it down in any world from **My assets** in the bottom bar.

## Decorations

**Decor** in the bottom bar has 166 decorations with proper drawings, in groups: Blocks (bricks, stone, ores, planks, glass, lava and more), Nature (trees, flowers, mushrooms, rocks), Dungeon (torches, banners, spikes, doors, chests, a portal), Home, Treasure, Food, Enemies, Sky and Fun. Blocks paint into a grid as you drag. Anything else you click to put down, or drag to make bigger. Each is an ordinary thing underneath, so a creature sees it by its shape and colour, and everything else you can set on a shape works on it.

Treasure decorations are items, Food is eaten, chests hold gold, and Enemies come ready to fight.

## The game parts

Everything a thing can be in a game is under **In a game** in its properties:

- **Item**: a creature that touches it, or walks right past it, picks it up and carries it under the thing's name.
- **Chest**: a creature that touches it takes everything inside, typed like `Gold x5, Sword`.
- **Health**: it can be hurt by a creature touching or pushing it, and by Abilities, and goes when it runs out. A bar shows over it once it's hurt, and damage floats up.
- **Enemy**: it goes for creatures (or anything with a tag you name) by itself, and takes Health off a creature it touches. Its pathfinding settings: Chase, Guard (stays home until something comes near), Patrol, Wander or Flee; speed, how far it sees, how hard it jumps over what's in its way, flying, keeping its distance, turning back at edges, how far it roams, damage and how often.

Shapes get new outputs to go with these: **Died**, **Hit** (an enemy hurt a creature), **Opened** and **Picked**. A Spawner's copies keep all of their wires now, so a spawned enemy still says when it dies.

New parts, mostly in the new **Game** group:

- **Storage**: a number the whole world shares by its name, like Cash, Rubies or Score. Every Storage with the same name is the same number, even inside a creature. Ticked to show, it appears at the top of the screen.
- **Inventory**: counts one item a creature is carrying, and gives or takes some. Attached to a shape, it works on what that shape holds, like filling a chest.
- **Chance** (Values): one output per chance, like 10% and 20%, as small as 0.0001%. Pick one gives at most one of them and None the rest of the time. Each rolls every output by itself.
- **Mover** (Things): moves and turns what it's attached to through keyframes, when a pulse arrives, then can play backwards. Once, loop or bounce. Press Start here, move the shape, press Add keyframe, and so on. Things on top of a moving platform get carried.
- **Health**: hurts or heals what it's attached to.
- **Ability**: attacks things with health. Shoot fires sparks at the nearest, Nova fires them all round, Aura hurts everything near at once. Inside a creature it fires from that creature, by itself every so often if nothing is wired to Fire.
- **Effect**: makes a creature faster, jump higher, hit harder, take less damage, or pull items in from further away (Magnet), for a while or for good. They stack, up to a number you choose.
- **Choice**: when a pulse arrives, everything stops except the creature, which thinks it over and picks one of up to four options, like a power-up. You watch it make up its mind. It learns which picks turn out well, from whether it's better or worse off a while later, and from being petted or slapped just after.

Play mode puts Storage, inventories and Effects back the way they were when you stop, like the rest of the room.

## Results

- **297 automated tests pass**, 20 of them new, in `tests/game.test.ts`.
- **The learning bar** still passes.
- In a browser: decorations, the Decor menu, the right-click panel, build areas, enemies chasing and being shot, the game HUD and the choice overlay were all looked at.

## Not checked

- Anything on Windows, or in the packaged app.
- Lots of enemies and sparks at once on a slow computer. Decorations are drawn shape by shape every frame.
- A wire between a build area and something else out in the room can't be made by hand, since you can't see both at once. Storage, Say and Hear get messages between them.
- Whether creatures learn to fight well. They can hurt things by touching and pushing them, and learn from that like anything else, but nobody has raised one in a dungeon for long.
