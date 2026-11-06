# Milestone 1: the sandbox

**Status: everything on the list is built and tested. Whether building a contraption "feels nice" is the plan's real test, and only a person playing can answer that.**

## What's in

- **Real physics** with Rapier: things roll, tip over, stack and bounce.
- **Shape tool:** circle, square, triangle, hexagon and plank. Click to place, drag to choose the size. Drag a plank from one end to the other to make a ramp, with Shift to snap the slope.
- **Select and move:** click, Shift+click, drag a box around things, Ctrl+A. Dragging pushes other things along, and something still moving when you let go gets thrown. Shift snaps to the grid.
- **R rotation:** a circle around what's selected, with gridlines around the edge that it snaps to every 15 degrees, and Shift for free rotation. Works on a group too.
- **Right-click properties:** name, colour, gravity, fixed, solid, size, rotation, bounce, grip, weight, plus what happens when a creature touches it (feeds, used up, comes back). Works on a whole selection.
- **Undo and redo** for every edit, with copy, paste, duplicate and delete. Undo only touches what the edit changed, and never the creature's brain.
- **Room files:** Save room and Open room. A room file has no creature in it, so opening one can't cost you yours. Files are checked piece by piece, so a broken or hostile one can't break the game.
- **Also added because building needed it:** a room over twice as wide, zoom, panning, and carrying the creature by dragging it.

## Controls

| Input | What it does |
|---|---|
| Click creature / right-click creature / drag creature | Pet / slap / carry |
| Click thing, drag | Select, move |
| Right-click thing | Properties |
| R | Rotation circle |
| V, C, B, T, H, P | Hand, circle, square, triangle, hexagon, plank |
| Delete, Ctrl+C, Ctrl+V, Ctrl+D, Ctrl+A | Delete, copy, paste, duplicate, select all |
| Ctrl+Z, Ctrl+Y | Undo, redo |
| Scroll, middle-drag, arrows, F | Zoom, look around, find your creature |
| Space, 1, 2, 3 | Pause, speeds |
| Esc | Leave whatever you're doing |

## What real physics did to the creatures

The learning bar still passed on physics straight away, but a new test of creatures living alone for half an hour showed they could starve beside working food. There were several causes, and the fixes changed how it behaves:

- **Learned helplessness:** hunger ticking down during long walks taught it that walking was bad, so it stopped looking for food. Background changes in a drive now don't count as being caused by what it was doing.
- **Losing faith in food:** failing to reach food (a rock in the way) counted as evidence that food doesn't help. Now it doesn't, and it remembers for 15 seconds that it couldn't reach something and tries something else.
- **Bulldozing:** walking used to force its speed, so it shoved heavy rocks around and wedged them against walls. Walking now has limited strength, so heavy things stop it and it hops to try getting over them.
- **Carrying rocks:** it can now only pick up small, light things.
- **Giving up on food out of sight:** it now gets restless when it needs something and nothing in view looks useful or worth trying. It goes further and hurries the worse it feels, and wandering keeps a heading.

## Results

100 creatures from seeds 1001 to 1100, never used for tuning (`npm run bar -- 100 1001`):

| Test | Result | Target |
|---|---|---|
| Hungry, picks the fruit over the rock (untaught: 51%) | 94% | at least 80% |
| Same, with no praise at all, only food going up | 100% | at least 80% |
| Very hungry, next decision is to eat | 69% | at least 60% |
| Full, next decision is to eat | 6% | at most 20% |
| Slapped 3 times or fewer for touching a ball, leaves it for a full minute | 100% | at least 80% |
| Slapped 3 times or fewer for calling, stays quiet for a full minute | 100% | at least 80% |
| Picks a new big red ball over a new blue block (untaught: 51%) | 94% | at least 65% |
| Alone for 30 minutes, keeps itself fed (new, 30 creatures) | 100% | at least 90% |

## Things worth knowing

- **Existing creatures carry over.** Saves went to version 2, and a Milestone 0 creature keeps its name, age, drives and memories. Its room gets centred in the bigger one. There's a test for this using the old format.
- **Saves don't use Rapier's own format.** They store each thing's position and settings and rebuild the physics when loading, so a Rapier update can't lose anyone's creature. The cost is that a loaded world doesn't carry on *exactly* as the original would have, because resting contacts get worked out again. A world without a save/load is still exactly repeatable from its seed.
- **Physics costs speed.** The learning bar went from under a second to about a minute.
- **No pathfinding.** A creature walks straight at things and hops at obstacles. It can climb a ramp if it happens to be on the correct side, but it won't work out that it has to walk around to reach it.

## Not done yet, on purpose

- **Tags** from the plan's property list aren't in the panel, since nothing can use them until Sensors arrive in Milestone 2.
- **Text input on labels:** there are no labels until Milestone 2.
- **Resize handles:** sizes are set by dragging when placing or by sliders in the panel, not by dragging corners.
- **The simulation still runs on the main thread.**

## Not checked

- The save dialog itself. The check confirms the button writes a real file in the desktop app, but a dialog needs a person to answer it. The same goes for the open-file dialog; the code behind it was tested by feeding it files directly.
- Windows, as before.
- How it feels with a long session of real building.
