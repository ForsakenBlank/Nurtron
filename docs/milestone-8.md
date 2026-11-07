# Milestone 8: a smarter, more alive mind, and an update checker

**Status: built, and released as version 0.2.0. Each of the four new kinds of learning is tested against the same creatures with it switched off, on seeds never used for tuning. They were also watched working in the real desktop app, but only in rooms set up by code.**

Milestone 7 (memory of places, cause and effect, the fruit tree) was never pushed to GitHub, so this starts from milestone 6 and builds the parts it needed. There's still no fruit tree.

## Learning by watching

When a creature sees another one eat something, get petted or get slapped, it learns the same lesson about that thing, at 40% of the strength. It has to be within about 900 of the other creature.

- Lessons about stats are matched up by name, so a watcher with no Hunger learns nothing about food from watching someone eat.
- The mind panel says what it saw, like "Saw another creature touch the small purple triangle, and it helped them".

## Going over things while resting

It keeps the last 12 moments that went well or badly. When it finishes a rest, it goes over the ones from the last 5 minutes, and each one sinks in again at 60% of the strength it had the first time.

- Each moment is gone over twice at most, so it can't talk itself into anything by itself.
- The mind panel says "Went over 4 things that happened lately while resting".

## Liked and disliked places

Eating, being petted or being slapped somewhere makes it like or dislike that spot.

- Things in a spot it likes are a little more inviting. Things where it was hurt are a little less.
- When it wanders, it tends to drift back towards its favourite spot, or away from where it was hurt.
- Places belong to a room, so they don't travel in a creature file. They're kept in saves, and move with the room when you add space to the left or above.
- **They're a nudge, not a rule.** At first they mattered more than what a thing was, and on the tuning seeds the creature picked the fruit over the rock only 80% of the time, down from about 92%. Places count for much less now.

## Cause and effect, several steps ahead

When something new comes into view just after it did something to something, it remembers "doing that to a thing like this makes a thing like that appear". Each time it does it and nothing appears, the idea fades a bit.

- It uses these to work out chains up to 4 actions long, like a lever that makes a block appear that makes food. A good thing further off counts for a bit less, and a chain is only worth following if it wants what's at the end.
- The mind panel shows "It worked out what this leads to" and "Worked out what this leads to: after it, it could touch the small red circle".
- What makes what appear travels in a creature file, since it's about kinds of things, not places. Each link in a file is checked, and any that don't make sense are left out.
- Things that come back by themselves after being eaten, and words in the air, don't count as caused by anything.
- **Not covered:** something disappearing, like a door opening, isn't learned as an effect. Only things appearing are.

## Results

Each is the same creatures with the ability on and off, on seeds 30001 and up. Tuning used seeds 20001 and up.

| Test | On | Off |
|---|---|---|
| Watched another eat a new snack 3 times, then picks it over a pebble | 96% | 65% |
| Tasted a food once and rested, then picks it over a pebble | 61% | 33% |
| Petted 4 times on the left, then picks a ball there over the same ball on the right | 79% | 52% |
| Slapped twice on the right, then picks a ball on the left over the same ball on the right | 69% | 42% |
| Hungry in the lever room, goes to the lever first | 100% | 0% (2 steps ahead), 0% (none) |
| Hungry in the lever room, fed within 40 seconds | 100% | 0% (2 steps ahead), 0% (none) |

12 to 16 creatures each, 4 tries per creature for the choices.

- **254 automated tests pass,** 13 of them new for the mind and 5 for the update checker.
- **One old test was changed.** It checked a huge world's floor at one exact moment and caught the creature mid-hop onto the rock. It now checks that the creature stays between the floor and a jump above it for the whole 20 seconds. It's about the floor, not about learning.
- **The learning bar** (seeds 1001 to 1100) still passes: 88%, 100%, 79%, 9%, 100%, 100%, 90%, 100%. Before this milestone it was 92%, 100%, 67%, 7%, 100%, 100%, 94%, 97%.
- **The first try at replay changed nothing you could measure.** One slap already makes every creature stay away, with or without replay, and a small taste plus replay at 30% only moved choices by 3 to 6 points. Replay counts for 60% now.

## App updates

**Files, then App updates** shows the version you have, a **Check for updates** button, and every published version with what changed. It's laid out like the one in Prism.

- With **Check when Nurtron starts** ticked, it checks quietly once a day, 8 seconds after starting, and only says something if there's a newer version.
- **It only reads the list of versions from GitHub.** It never downloads or installs anything. **Open download page** and **Download page** open that version's GitHub page in your browser, and nothing else can be opened from there.
- What GitHub sends is checked field by field. Drafts and test versions are left out.

## Checked in the real desktop app

Driven with Playwright, using the real mouse and keyboard where it could, with a throwaway save folder:

- Opening Files, then App updates, with the mouse. Before the release it said "No versions are published yet." It was checked again after the release, and showed 0.2.0 as the newest and installed version.
- Pressing 3 for top speed.
- Petting the creature by clicking it. It came to like that spot.
- **Set up by code:** the lever room's parts and wires, and the orders that showed it the chain twice. Left hungry, it then worked the lever, then the block, then ate, all by itself. In the app this took 42 seconds before it went for the lever, much slower than in the tests, and I didn't find out why.

## Not checked

- A person raising creatures by hand with these, over a long time.
- Two creatures watching each other in the real app. That's only tested with no window.
- The Windows build. It was built on Linux and not opened on Windows.
- Whether liked places ever make a creature hang around one spot too much over hours.
