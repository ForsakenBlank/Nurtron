# Milestone 12: Dimensions, speed and getting around

This milestone is about **learning faster** and **getting around better**. It starts with a big list of ideas, then says
which ones were built this time. Anything not marked built is still an idea for later.

## The big list

### Getting around
- [x] **Zero-gravity pathfinding.** In a zone with no gravity a creature used to fly straight at what it wanted and get
  stuck on anything in between. Now it works out a way around everything solid (a grid search, smoothed so it flies in
  straight lines where it can), and follows it, working it out again if something moves or it gets stuck.
- [x] **"I can't go there."** When there's no way to get to something, it stops for a second, then says so in a speech
  bubble, and remembers it couldn't get there for a while instead of trying again and again. This works on the ground
  too, when walking, jumping and climbing all fail.
- [x] **See the route.** With the route view on (Settings), the path a creature is following is drawn as a dotted line.
- [ ] Doors and keys a creature learns to use as part of a route.
- [ ] Swimming: water zones with drag and buoyancy.
- [ ] Teleporter pads that link two places, which routes can use.

### Speed
- [x] **Any speed you like.** The speed is a number, not just 1, 4 or 16. Type one in, drag the slider (from a tenth of
  normal up to 1000 times), or use the buttons.
- [x] **Max.** Runs as fast as your computer manages, without the window freezing up. It never asks for more than fits
  in a frame.
- [x] **Slow motion** below 1, for watching exactly what happens.
- [x] **Step.** While paused, the step button (or **.**) moves time on by a single tick.
- [x] **Real speed.** Beside the speed is how fast it's really going, so you can see when the computer can't keep up.
- [x] Keys: **,** and **.** halve and double the speed (+ and - were already zoom), **4** is Max, **N** steps one tick.
- [ ] Speed that slows itself down when something interesting happens, like a death or a new thing learned.

### Dimensions (ghost creatures)
A **dimension** is a copy of your world running alongside it. The creatures in it are **ghosts** of yours. They share
one brain with the real ones: every few seconds, whatever every ghost learned is added together and given to all of
them, the real creature included. One creature at high speed is like a CPU doing one thing very fast. Lots of ghosts
at high speed is like a GPU, doing many things at once, so your creature learns many times faster.

- [x] **Make dimensions** from the Dimensions panel, one at a time or several at once.
- [x] **Each runs in its own thread** (a web worker), so they use more of your computer's cores instead of slowing the
  main window down. If threads aren't available they still run, just in the main thread.
- [x] **Each has its own speed**, any number or Max, and can be paused on its own.
- [x] **One shared brain.** Learning from every ghost is merged into the real creature: what it learned about things,
  places it likes or avoids, and what makes what happen. Lessons are added up, not averaged, so ten ghosts each
  learning a little adds up to a lot.
- [x] **Sync every** a few seconds, which you can set, or **Sync now**.
- [x] **Different every time.** Each dimension gets its own luck, and can start its creatures in different places, so
  the ghosts don't all do the same thing.
- [x] **Ghosts die so yours doesn't have to.** When a ghost dies, the lesson goes into the shared brain, and the ghost
  comes back by itself.
- [x] **Refresh from the real world**, now or every few minutes, so a dimension where everything's been knocked into a
  corner gets put right, and changes you make to your room reach the ghosts.
- [x] **Look into a dimension.** Watch it like your own world, follow its ghosts, flick to the next or previous one,
  then come back with Esc. You can't build in a dimension, only watch, so nothing gets out of step. While you watch,
  that one runs in the window, and goes back to its thread when you leave.
- [x] If threads can't start on a computer, dimensions run in the window instead of disappearing.
- [x] The Dimensions settings (how often to share, refresh, and so on) are remembered.
- [x] **Delete** one, or all of them, in one click.
- [x] **Stats for each dimension**: its real speed, game time lived, decisions, food eaten, deaths, give-ups, things
  learned, and its share of all the learning.
- [x] **Stats for everything together**: total speed (how many seconds of life go by every real second), how much the
  brain changed per minute, how long each sync takes, and your computer's cores.
- [x] **Best setup.** A benchmark tries different numbers of dimensions at Max on your computer and tells you which
  gives the most life per second, and how that compares with just one fast world.
- [x] A graph of total speed and learning over the last few minutes.
- [x] **Ghost marks.** The creatures you see in a dimension are drawn see-through, so you always know when you're
  looking at ghosts.
- [ ] Dimensions that come back by themselves when you reopen a world. For now they're deleted when you leave it.
- [ ] Ghosts on different rooms (a "curriculum"), each teaching something different.
- [ ] Ghost tournaments: keep the brain from whichever dimension did best.

### UX and quality of life
- [x] A **Dimensions** button in the top bar, and **K** to open it.
- [x] The keyboard shortcut list (**?**) has everything new.
- [x] Speed is remembered between sessions.
- [ ] A proper tutorial for first-timers.
- [ ] Search box for parts and decorations.
- [ ] Bookmarks for camera spots in big rooms.
- [ ] Copy and paste between worlds.
- [ ] A timeline you can drag back through, to see what a creature did.
- [ ] Achievements, like "first time it fed itself".
- [ ] Colour-blind friendly palette option.

### Brain and learning
- [ ] A learning curve graph per creature (food found per minute over time).
- [ ] Export a brain on its own and give it to another creature.
- [ ] Curiosity that grows when it's bored for long.

## How the shared brain works

Each ghost starts with a copy of the real creature's brain. At every sync, the main window works out what changed in
each ghost since the last sync (its **delta**) and adds all of those to the real brain, along with whatever the real
creature learned itself. Then everyone gets a copy of the result. It's the same idea as training one network across
lots of machines at once.

- A concept (something it knows about, like "small red circle") that two ghosts both met is the same concept, so what
  each learned about it adds together. One only a ghost met joins the real brain as something new.
- Places are matched by where they are, and the cause-and-effect links it plans with by what they connect.
- The moments it goes over while resting stay with each ghost, since they're about what happened in that dimension.
- If the real creature's body has changed so it feels different things, a ghost can't be merged, so it's given the
  real brain and carries on from there.

## Tests

- `tests/dimensions.test.ts`: merging brains adds lessons up, keeps new concepts, matches places, and survives a body
  that changed. A world with dimensions learns about food faster than one without.
- `tests/float-path.test.ts`: in zero gravity a creature gets round a wall to food behind it, and says it can't go
  there when the food is boxed in.
- `tests/speed.test.ts`: the speed planner never runs more ticks than fit in a frame, and Max uses its whole budget.

## What was measured

- In `tests/dimensions.test.ts`, after 20 game seconds, a creature with 4 ghost dimensions had learned about 1.7 times
  as much about food as the same creature alone (2.85 against 1.65, over three seeds).
- On a 12-core computer, one dimension at Max ran at about 3,600 times normal speed in its thread. The benchmark found
  8 at Max was best there, at about 22,000 times in all, while 12 was slower than 8 (about 19,800 times), since they
  start to get in each other's way.
- A share of every ghost's learning took about 2 to 3 milliseconds with 4 dimensions.
- Threads were checked starting and running inside the desktop app as well as the browser.

## 1.17: bug fixes from a real world

A creature in a real world stopped eating, its buttons seemed not to work, and its counters seemed stuck. Running a copy
of that world found these, all fixed:

- **Right-clicking a button next to a creature slapped the creature.** The creature's click area was loose and won
  over anything under the mouse. Now a thing under the mouse wins unless you click right on the creature's body. Each
  slap took 15 Health in that creature's body, so this killed it several times.
- **A red button looked the same as a red fruit to a creature.** Creatures see a button as a button now, so what it
  learns about buttons never gets mixed up with food.
- **Pushing a button didn't press it**, only touching did, so a creature could walk up to a button, push it, and
  nothing happened. Pushing presses it now, and a button flashes when a creature presses it.
- **The thought log says exactly what it did**: pressed a button, only went up to look, pushed something that didn't
  budge, or tried to pick up something too big.
- **Fears never faded.** Enough slaps or deaths left a creature scared of everything, so it wouldn't even eat. Fears
  now fade over about 15 game minutes when nothing keeps them fresh, and **Calm it down**, in the mind panel, halves
  everything it thinks went badly so it tries things again. You're warned when a creature gets like this.
- **A creature shut in somewhere** now says it can't get to things, and you're told it might be shut in.
- **The Fixed toggle** reset whenever you went to another tool and back. Each shape remembers it now.
- **Ghosts that keep dying** in dimensions no longer pile fear onto the real creature. Fear and praise from ghosts are
  averaged, while what helps each need still adds up.

On the copy of that world, a creature freed from the box, calmed down twice and sent to the fruit four times went on to
eat it 12 times by itself in the next five minutes. Before, it never did.
