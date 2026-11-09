# Milestone 10: creatures that notice each other, a nicer room, and lots of small things

**Status: built, and released as Nurtron 1.0. Everything here was tried in a browser driven by Playwright, and the desktop app check passed under a virtual screen on Linux. Nothing was tried on Windows, and nobody has raised creatures with it by hand for a long time yet.**

## Creatures notice each other

Before, a creature could see shapes and buttons but never another creature, so the only thing that could bring Loneliness down was you.

- **Another creature is something it can see**, go to, back away from, push or touch. It can't grab one.
- **It never sees a name.** Another creature looks like "a medium red creature", by the colour of its body, the same way a fruit looks like "a small red circle". Two creatures the same colour are the same to it.
- **Touching another creature is a cuddle,** and both of them feel it. The Feel part has a new **Cuddled** output for that.
- **Loneliness now comes down with a cuddle** as well as a pet. A creature that already had Loneliness gets the new wire when its world opens, but only if its Loneliness is still wired the way it came. One you've rewired is left alone.
- A push knocks the other one along a little, and it carries on with what it was doing once it lands.
- Hearts float up between them, both of their minds say so ("Cuddled up to Pip", "Pip cuddled up to it"), and the dashed ring shows who the one you're looking at is going for.
- **What it learns is the usual kind of thing.** Cuddled while lonely, it learns "touching a medium red creature is good when Loneliness is high", and goes looking for one the next time it's lonely.

### Getting about

- **Wandering turns back from the walls.** It used to walk into the wall until it got stuck, then turn round.
- **Something it couldn't get to is tried again once it has moved** more than a little, instead of waiting out the full 15 seconds.

## A nicer room

- A sky that gets darker further up, with a few stars.
- Two lines of hills that drift slower than the room as you look around, so it has some depth.
- Grass along the ground, and stones in the dirt.
- Shapes have a darker edge and a soft shadow on the floor. Creatures have a soft edge too, and kick up a little dust as they walk.
- **A thought bubble** above the creature you're looking at shows a little picture of what it's going for, once that's far enough away to lose track of. A heart means it's off to cuddle someone.
- **A ? over its head** when it gives up on getting somewhere, and **a !** when something appears that it thinks it caused.
- The inside of a creature has a few soft glows.
- **Little sounds** for petting, slapping, eating, hatching, cuddling, calling, dying, coming back, laying an egg and solving a Trial. They're made on the spot, so there are no sound files, and only creatures in view are heard.

All of these can be switched off in **Settings, How it looks**, along with the screen shake when you slap. With the scenery off, the room is the plain grid it was before.

## Small things that help

- **The map** in the bottom right shows the whole room, with everything in it and where you're looking. Click or drag on it to look somewhere. **M** hides it.
- **Follow**, by the zoom buttons, or **L**, keeps your creature in view as it moves. Moving the view yourself stops it.
- **?** shows every keyboard shortcut.
- **[** and **]** look at the previous or next creature.
- **First steps:** seven things to try, in the corner, which tick themselves off as you do them. Clicking its heading folds it away, the ✕ hides it, and Settings can bring it back.
- **Paused** shows on the room while the world is paused.
- **Undo and Redo grey out** when there's nothing to undo or redo.
- **Messages stack up** for a moment instead of replacing each other, and longer ones stay up longer.
- **Each stat bar has an arrow** for which way it has been heading over the last few seconds of the creature's life, red if that's bad and green if it's good.
- **Files, then Save a picture** saves whatever's in the window as a PNG.
- **Hovering over a creature** says what it's doing, and what the one you're looking at has learned about creatures that look like it.
- **The window's title** says which world you're in.

## Results

- **277 automated tests pass,** 11 of them new: 10 for creatures noticing each other and getting about, and 1 for the undo history.
- **A lonely creature goes for company** 100% of the time after 3 cuddles, and 50% with none, against a rock (12 creatures, seeds 9201 and up).
- **The learning bar** (seeds 1001 to 1100) still passes: 86%, 100%, 78%, 9%, 100%, 100%, 90%, 100%. Before this milestone it was 88%, 100%, 79%, 9%, 100%, 100%, 90%, 100%. The small changes come from wandering turning back at the walls.
- **`npm run life`**, an hour alone, looks the same as before: it eats 12 to 17 times every 10 minutes, and the hungriest it got was 63.
- **`npm run check-env` passed** under a virtual screen. Electron won't start as root without `--no-sandbox`, so the check now adds that when it's run as root.
- **The header stays on one line** from 1000 wide and up. The new ? button had pushed New egg onto a second line on some window sizes.

## Not checked

- Anything on Windows.
- How the sounds come out on real speakers. They were only checked to make no errors.
- Lots of creatures cuddling over hours. Creatures the same colour look the same to each other, so with many of them, one that was slapped near another might get wary of every creature that colour.
- The scenery in a really huge room, on a slow computer. It's drawn once, but the hills can be a few thousand points long.
