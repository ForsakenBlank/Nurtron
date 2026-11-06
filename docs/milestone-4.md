# Milestone 4: sharing and the Packager

**Status: done. The plan's test passes in automated tests and by hand: a creature moved to another PC still goes for the red fruit, and still has its own working stomach.** "Another PC" here means a separate save and room on this machine. A real second PC is still worth trying.

## What's in

- **`.nurt` creature files:** brain, body circuit, name, look, age, genes and family tree. Moving a creature keeps everything it learned.
- **`.nworld` world files:** a room and whoever lives in it, in one file.
- **`.nroom` room files** now carry tools and pictures, and they keep a fruit that was eaten and hadn't come back yet. That fruit used to get lost.
- **`.ntool` tool files:** send someone a thing you built.
- **Files**, at the top of the window, has all of this. You can also **drag any Nurtron file onto the window**.

## Pictures

- Drag a PNG, JPEG or WebP onto a shape, or right-click a shape and press **Picture**.
- Pictures are shrunk to 128 pixels so saves stay small, and they travel inside every kind of file.
- **A creature still can't see pixels, so a shape takes on the colour its picture mostly is.** Paint a rock with an apple and your creature sees a red thing, and it may well try to eat it. Ctrl+Z takes the picture off and puts the old colour back.

## The Packager

Select some parts and press **G** or **Package**. Name your tool and tick which sockets go on the outside. It lands on your tool shelf at the bottom of the window, where a click places a new one.

| | |
|---|---|
| **Goes inside the box** | Label, Data, Timer, Math, Compare, Switch, Motor, Give, sockets, Action, Feel |
| **Stays outside** | Shapes, Buttons, Sensors and other tools, because you need to see and touch them |
| **Right-click a tool on the shelf** | Save it to a file, or forget it |
| **Right-click a placed tool, then Unpack** | Lets everything out, wired up the same, and Ctrl+Z seals it back up |

What's inside isn't a recording. It's the same parts running the same wires, so a box keeps its count, its timers really tick, and you can copy it, save it or put one inside a creature. Tools made inside a creature can hold sockets, so you can share a whole need, like Loneliness, as one box.

## Files are only ever data

Every file has a version number and every field gets checked when it's opened. There are tests with hostile files for all of this:

- **A brain that would break the sums is refused:** wrong-sized links, two sockets with one name, or a thing it "saw" that can't exist.
- **Silly numbers are brought back into line,** like a learning rate of a billion or a memory limit of a trillion.
- **Only parts get into a body, and only ones that belong there.** A room file still can't reach inside a creature.
- **Pictures must really be pictures.** Files are checked by their first bytes, not by what they claim to be. SVG isn't allowed because it can hold scripts.
- **Tool sockets are worked out again from what's really inside,** so a tool can't lie about what it connects to.
- **There are size limits** on files, things, wires, tools and pictures.

## Results

- **Automated tests:** the moved-creature test runs on 80 creatures never used for tuning (seeds 6001 to 6080), each raised in one world and opened in another with different random numbers and none of the same objects. 82% go for the fruit, against a target of 80%. See [milestone 5](milestone-5.md) for how that number was checked.
- **The learning bar didn't change** (seeds 1001 to 1100). Fruit over rock, slaps, the new red ball and alone for 30 minutes all still pass.
- **Tested in the game with real mouse clicks:**
  - Packaging a counter, placing it, pressing its button twice and getting 2.
  - Unpacking it, then undoing that.
  - Saving a creature from the Files menu.
- **Tested by dropping files in with code,** because a real drag from the file manager can't be done by a test: a picture on a shape, and the creature file on the second save, where it ate a new fruit and Food went from 15 to 36.
- **The desktop app's own check** now writes a real creature file, opens it again and drops a picture on a shape, on its real graphics.

## Worth knowing

- **Short-term memory doesn't travel.** It holds what it did a moment ago, so a pet on arrival shouldn't count for something it did in another world.
- **Pictures have a limit,** about 2.5MB of them per world, so saves always fit. It tells you when it's full.
- **If the game can't save, it now says so** instead of only writing to the log.
- **Your tool shelf belongs to you, not the world,** so it stays when you open another world.

## Not checked

- Moving a creature to an actual second PC, or to Windows.
- A real drag and drop from a file manager.
- A hand-picked large photo. The test pictures were small ones made by code.
