# Milestone 6: words, Trials, and the start of a game engine

**Status: built. Both of the plan's tests pass as automated tests: a creature can be taught to come when called, and a creature raised elsewhere solves a friend's Trial. Neither has been tried by a person teaching a creature by hand.**

## Words

- **Say a word** in the mind panel. It's spoken wherever the mouse last was in the room, hangs there in a speech bubble for 8 seconds, and stays on the mind of every creature in earshot for that long.
- **Typing words into a Label** out in the room says them too.
- A word is only a sense, with no meaning built in. It means something when what happens next teaches it, like walking to the bubble and being petted.
- **Say and Hear parts** let wires talk and listen, including to creatures.
- **A creature can say a word back.** When it calls out, it says the word it most connects with what it just did, if it knows one.
- What it knows about a word travels in its `.nurt` file.

**Come when called**, tested on 20 creatures never used for tuning, called from 500 away:

| | Came within 8 seconds |
|---|---|
| Taught with 8 calls and pets | 19 of 20 |
| The same creatures, hearing a word they never learned | 14 of 20 |
| Never taught | 10 of 20 |

**Be honest about these numbers:** an untaught creature comes half the time, because a new thing appearing makes it curious. And taught creatures come for other words too, because what they mostly learned is that going to a speech bubble is good. It clearly learns to come, but it only partly tells words apart so far.

## Trials

- **Goal part:** when a pulse arrives, the Trial is solved. **Start part:** where creatures begin.
- **Files, then Save as Trial** makes a `.ntrial` file. **Open Trial**, or dropping one on the window, starts it. A banner shows the time and tries, with Try again and Back to my room.
- Your own room is kept safe, and comes back afterwards. Your creature keeps what it learned there.
- **A friend's Trial,** fruit on a block across a gap, with creatures raised in another world on an ordinary fruit: **20 of 20 solved it.** It's fairly easy, because it needs a learned taste for red things plus the new jumping. A Trial that needs working out a sequence, like pressing a button to open a door, hasn't been tested.

## Jumping and climbing

- **Creatures work out routes** from ledge to ledge, including block, gap, block, and go up and over fixed things in the way. It's a skill, like walking. Which thing it wants is still up to its brain.
- They can jump up about 150 and across about 240.
- **Climbable** in a shape's right-click panel lets a creature go up it. A solid one is climbed up the side and stepped onto. One you can pass through works as a ladder.
- If there's no way, it gives up and says so, and tries something else.
- **Not covered:** ramps aren't counted as ledges, though they can still be walked up. Moving platforms aren't planned around. The route is worked out fresh each moment, so a platform that moves can be missed.

## Gravity

- **Files, then World settings** sets the gravity everywhere: strength from -5 to 5 (1 is normal, 0 is none) and direction. It's there when starting a new world too.
- **Gravity zone** (in the World group) is an area you draw. **Right-click its header** to choose Has gravity, Strength and Direction. It can be switched by a wire, and it notices things entering and leaving.
- **With no gravity,** things drift and creatures float-walk across the background, going straight to what they want and staying put when they stop. They fall again when they leave.
- It works both ways: a world with no gravity can have zones that do.
- **Not covered:** a creature pulled sideways or upwards falls that way, but isn't drawn turned round.

## More room, any time

The **Room** arrows at the bottom left of the map add 1000 across or 500 up and down, on whichever side you choose, even in a world you've already built. Shift+click adds five times as much. Nothing you've built moves on screen.

- **Adding below drops the floor,** so loose things fall to it and fixed things stay up.
- **Adding left or above clears undo,** because positions are measured from the top left corner of the room.
- **For the same reason, numbers you typed in stay as they were,** like a Teleport's "To x" or a Data wired into a Spawner, so they'll point somewhere else afterwards.

The camera can now bring any corner of the room to the middle of the window, at any zoom, and the ground carries on past the edges of the room.

## Hunger, and choosing stats

**Hunger replaces Food.** It goes up by itself, 100 is starving, and eating brings it down. Energy still goes the other way, where 100 is well rested.

- **Old creatures convert the first time they open.** A body whose Food was wired the usual way has its numbers and wires turned round, so Food 30 becomes Hunger 70. What it learned still holds, because how much it needs food at any moment hasn't changed.
- **A body you rewired yourself is left alone,** and keeps Food.
- **Fruit works for both.** A Give for Food also feeds a creature with Hunger, and the other way round, so old rooms keep working.
- **A copy of an old save is kept** in the game's storage the first time it's converted. There's no button to bring it back yet.

**Choosing stats:** New egg now has a list, and the Family panel has the same list for a creature you already have. Each stat is real wires you can open up and change. Tick nothing for a blank body.

| Stat | What it does |
|---|---|
| Hunger | Goes up by itself, and eating brings it down |
| Energy | Goes down by itself, and resting brings it back |
| Thirst | Goes up by itself. Nothing lowers it until you wire a Give to something |
| Health | Slaps hurt it, and it slowly heals. Nothing happens at 0 by itself |
| Dies at 0 Health | Ticking this also ticks Health. You can revive it |
| Happiness | Pets raise it, slaps lower it, and it slowly fades |
| Loneliness | Goes up by itself, and a pet brings it down |

Taking a stat away removes its wires, and what the creature learned about it stays in case it comes back. It also clears undo. A creature only comes to care about a new stat as things change it, so give it time.

## Game-making parts

Parts are now in groups along the bottom, which open when clicked.

| Group | New parts |
|---|---|
| **Values** | Random. Math can also do remainders and powers |
| **Logic** | Logic (and, or, not, either-but-not-both), Delay |
| **World** | Gravity zone, Goal, Start |
| **Things** | Spawner, Destroy, Teleport, Where, Collision, Show/hide, Paint |
| **Player** | Keyboard, Mouse, Camera |
| **Effects** | Sound, Burst |
| **Creature** | Say, Hear (and Die from before) |

**Play**, at the top, hides the editor so what you've built runs as a game. Only Labels and Buttons stay visible, a Camera part makes the view follow something, and **Without creatures** takes them out of the room. **Esc puts everything back** how it was. Creatures keep anything they learned.

**A Spawner makes copies still wired the same,** so a copy of a fruit still feeds. A hidden shape works as its pattern: creatures can't see it, and copies fall. This settles an old open question: creatures can now learn to work a fruit dispenser, again and again (at least 7 of 10 in the test).

**One test builds a whole small game using only parts:** coins drop at random, a paddle catches them, a score counts up, and a Goal ends it. It's a basic game, and there's still a long way to "any game":

- **Missing:** joints and hinges, a way to change levels, text you can style, animation, music, saving a game's progress, and variables shared between tools.
- **A game can't be sent on its own yet.** Someone needs Nurtron to play it, as a world or Trial file.
- **At least one creature always exists,** so Without creatures only sets it aside.

## Results

- **241 automated tests pass,** 57 of them new.
- **The learning bar didn't change** (seeds 1001 to 1100): 92%, 100%, 67%, 7%, 100%, 100%, 94%, 97%.
- **Tested in the game with the real mouse and keyboard:**
  - Telling a creature to go to something across a gap and up a level, from the right-click panel.
  - Drawing a zone, and opening its header panel.
  - Starting Play mode, key presses, and Esc putting it all back.
  - The Say box.
  - Leaving a Trial.
- **Set up by code:** the rooms, parts and wires for those tests, and dropping in the Trial file.

## Bugs found by playing it

- **It pushed against a block for ever** on its way to a jump. Routes now check for fixed things in the way.
- **It hung off the corner of a block,** one pixel short of the top. It jumps higher now.
- **Play mode was a blank screen,** which no test could see.
- **Very quick key taps were missed** if they fell between ticks.

## Not checked

- A person teaching a word or building a Trial by hand.
- Hearing the Sound part. Tests only check that it asks for a note, and nothing was listened to.
- Clicking through every new part's settings. Each has tests behind it, but only some were used by hand.
- Speed with lots of Spawners and Collisions on a real graphics card.
- Windows, and a real second PC.
