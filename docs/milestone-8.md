# Milestone 8: a smarter, more alive mind

**Status: partly built. The four new kinds of learning are in the code and all old tests and the learning bar still pass, but none of the four has its own test yet, nothing was checked in a browser, and there's no update checker or release yet.**

Milestone 7 (memory of places, cause and effect, the fruit tree) was never pushed to GitHub, so this starts from milestone 6 and builds the parts it needed.

## What's new

- **Learning by watching.** When a creature sees another one eat something, get petted or get slapped, it learns the same lesson about that thing, at 40% of the strength. Lessons about stats are matched up by name, so a watcher with no Hunger learns nothing about food.
- **Going over things while resting.** It keeps the last 12 moments that went well or badly. When it finishes a rest, it goes over the ones from the last 5 minutes, and each lesson sinks in a bit more (30% of the first time). Each moment is gone over twice at most, so it can't talk itself into anything.
- **Liked and disliked places.** Eating, being petted or being slapped somewhere makes it like or dislike that spot. Things in a liked spot are a little more inviting, and when it wanders it tends to drift back to a favourite spot, or away from where it was hurt. Places stay in the room, so they don't travel in a creature file.
- **Cause and effect, several steps ahead.** When something new comes into view just after it did something to something, it remembers that doing that makes that appear. If it keeps doing it and nothing appears, the idea fades. It uses these to work out chains up to 4 actions long, like a lever that makes a button appear that makes food. The mind panel says when it's doing something for what it leads to. What makes what appear does travel in a creature file, checked field by field.

## Files and saves

- Saves go up to version 10. Older creatures open with no places, moments or cause and effect yet, and fill them up as they live.
- Creature files are still version 1. Cause and effect links in a file are checked one by one, and any that don't make sense are left out.

## Results

- **All 241 tests pass.** One old test, about a huge world having a floor, checked the creature's height at one exact moment and caught it mid-hop onto the rock. It now checks it stays between the floor and a jump above it for the whole 20 seconds.
- **Learning bar** (seeds 1001 to 1100): 90%, 100%, 81%, 10%, 100%, 100%, 91%, 100%. All pass.
- **Bug found by measuring:** liked places at first outweighed what things are, and fruit over rock fell to 80% on the tuning seeds. Places are now a gentler nudge.

## Not done or not checked

- No new tests for the four abilities, and no with-and-without comparisons yet (the switches are there: `Brain.defaults`).
- The long chain (lever, button, food) has not been tested in a real room.
- Not run in a browser or the desktop app.
- No update checker yet, no version bump, no builds and no release.
