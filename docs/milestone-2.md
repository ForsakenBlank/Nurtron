# Milestone 2: wires

**Status: done. The plan's two tests both pass, in automated tests and by hand: the hunger circuit runs, and a button-powered counter works.** Skins and colours for the creature came along with it, by request.

## What's in

Every part is an ordinary thing in the room, so moving, R rotation, undo, copy and paste and even gravity all work on them. They hang on the wall by default, and your creature ignores everything except Buttons.

| Part | What it does | In | Out |
|---|---|---|---|
| **Label** | Holds a number or text. Double-click to type into it | set, update | value |
| **Data** | A fixed number. Base 10, spread 1 gives 9, 10 or 11 | | value |
| **Button** | A pulse when you click it or a creature touches it. Can stay on | | pressed, on |
| **Timer** | A pulse every so many seconds | seconds, on, reset | tick |
| **Math** | Add, subtract, multiply, divide, min, max | a, b | result |
| **Compare** | Bigger, smaller, equal | a, b | result, became |
| **Switch** | Lets values and pulses through while Open is true | open, value, pulse | value, pulse |
| **Sensor** | An area you draw, which notices things going in and out, by tag if you like | | entered, left, inside, count |
| **Motor** | Pushes, spins or moves what it's attached to, or one hard kick | on, power, kick | drives |

**Wire kinds look different:** round ports and solid teal lines carry values, diamonds and dashed gold lines carry pulses, with a glowing dot running down them. A motor's square port and dotted white line attach it to a shape.

## How to wire

| Input | What it does |
|---|---|
| Drag from any port | Starts a wire. Works from the Hand, so you rarely need to change tools |
| Let go on a port, or anywhere on a part | Connects it. On a part, it takes the first free socket that fits |
| Right-click a wire | Removes it |
| W | The Wire tool, where clicks only ever wire things |
| Hover a port or wire | Says what it is and what it's carrying |
| Double-click a part | Its settings, or typing if it's a Label |
| Add: Counter or Hunger | Ready-made circuits to play with and pull apart |

Copy and paste keeps the wires inside what you copied, undo covers wires, and Save room keeps them.

## The rules

- **A Label with a pulse wired to it only changes when that pulse arrives.** This is what makes the hunger circuit safe to wire in a circle.
- **A Data with spread picks again each time a pulse uses it**, and a single pulse sees the same number everywhere.
- **A value input takes one wire, so a new one replaces the old.** Pulse inputs take as many as you like, so two buttons can press the same counter.
- **A closed Switch gives nothing at all**, so whatever it feeds carries on as if it wasn't wired.
- **A true endless loop gets cut off.** The wires in it flash red and a message says so, and the game keeps running.

## Things added beyond the list

- **Compare's "became" pulse:** without it, nothing could turn a value into a moment, so "when Food drops below 20, do something" was impossible.
- **Motors can turn or move fixed things.** A fixed plank and a motor makes a windmill or a lift, and it stops at the edge of the room.
- **Tags** on shapes, as promised last milestone, for Sensors. "creature" means your creature.

## Skins and colours

The **Customise** button next to its name has ten skins (Sprout, Spots, Stripes, Fluff, Ghost, Robot, Slime, Bunny, Cat, Cosmos), nine ready-made colour sets, your own colours for body, belly, markings and eyes, and Surprise me.

It saves with your creature. A new egg keeps the look, and undo doesn't touch it. A test confirms a creature behaves exactly the same whatever it's wearing, because it can't see itself. When genes arrive in Milestone 5, colours and body shape are planned to become inherited, so this will need to fit in with that.

## Results

- **94 automated tests pass**, 39 of them new, including the hunger circuit and counter themselves.
- **The learning bar didn't change** on 100 creatures never used for tuning (seeds 1001 to 1100): fruit over rock 94%, food alone 100%, very hungry 69%, full 6%, both slap tests 100%, new red ball 94%, alone for 30 minutes 100%.
- **Tested with real mouse and keyboard:** placing each part, dragging wires, a refused wire, removing a wire, undo and redo, typing into a Label, the properties panel, drawing a sensor, a motor spinning a plank, and choosing skins.
- **The desktop app's own check** now covers wires and skins on its real graphics.
- **Old creatures carry over.** Saves went to version 3, and old room files still open. There are tests for both.
- **Speed:** 500 parts cost about 0.35ms per tick, so 16x uses about a sixth of each second. Drawing 216 parts at 16x took about 21ms a frame, but that was on a software renderer in a test pane, not a graphics card.

## Not done yet, on purpose

- **Wires can't feed your creature yet.** There's no Give part, no Touched output on shapes and no drive sockets, so the Food label in the Hunger circuit isn't its real hunger. Those are Milestone 3, which is what joins all of this together. A creature can press Buttons now, though.
- **It can't see tags.** Only Sensors can.
- **Texture and Packager** are Milestone 4.

## Worth knowing

- A thing that gets eaten and comes back is new as far as wires go, so a motor attached to one loses it.
- A Sensor goes by the nearest point of a thing, and by roughly the middle of the creature.
- Clicking a Button presses it rather than selecting it. Drag it, or Shift+click, to select it.
- A motor with nothing wired to On or Kick just runs, so you see something happen straight away.

## Not checked

- How it feels to wire something big by hand, which only a person playing can judge.
- Drawing speed with hundreds of parts on a real graphics card.
- Windows, as before.
