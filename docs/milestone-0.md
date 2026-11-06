# Milestone 0: can a brain learn?

**Status: the numbers pass. Still needs a person to watch it and decide if it feels alive, which is the half of this milestone a test can't do.**

## Results

100 creatures from seeds 1001 to 1100, which were never used for tuning (`npm run bar -- 100 1001`). The teacher reacts 0.3 to 1.5 seconds late, like a person. Each probe runs on a saved and reloaded copy with learning off.

| Test | Result | Target |
|---|---|---|
| Hungry, picks the fruit over the rock (untaught: 49%) | 96% | at least 80% |
| Same, with no praise at all, only food going up | 100% | at least 80% |
| Very hungry, next decision is to eat | 69% | at least 60% |
| Full, next decision is to eat | 5% | at most 20% |
| Slapped 3 times or fewer for touching a ball, leaves it for a full minute | 100% | at least 80% |
| Slapped 3 times or fewer for calling, stays quiet for a full minute | 100% | at least 80% |
| Picks a new big red ball over a new blue block (untaught: 49%) | 94% | at least 65% |

Also measured:
- First meal after about 5 seconds, five meals after about 74 seconds.
- Picks a new red triangle over a new green block 85% of the time, from colour alone.
- 94% still ate during their quiet minute after being slapped off the ball, so the fear stays on the ball.
- A trick with nothing to gain but praise: calling out goes from 10% to 48% of its decisions after 5 pets.

These targets are the plan's starting guesses, not proof it's fun.

## How the brain ended up, compared with the plan

The plan's idea held up, with these changes:

- **Concepts don't include hunger.** The plan had concepts like "hungry + red + round + close". Instead a concept is only what a thing is like, and each one has separate links for each drive plus one "direct" link. A drive link only counts as much as that drive is felt right now. So one lesson about food works at every level of hunger, and a full creature loses interest by itself, without needing to learn that separately. This was the biggest improvement over the plan, and why it learns so quickly.
- **Praise remembers how it felt.** Pet it while hungry and it learns "good when hungry". Pet it with no needs and it learns "I like doing this". A slap always counts, whatever it's feeling.
- **Slow drops don't teach.** Hunger ticking down says nothing about what it just did, so changes under 4% during an action are ignored. Otherwise whatever it happened to be doing gets punished.
- **New concepts inherit.** Meeting something new, it copies a share of what it knows about the most similar things. That's where the "tries other red things" behaviour comes from.
- **Touch walks there by itself.** Touch, push and grab all include walking over. Learning two separate steps (go there, then touch) took far too long.

Problems found by letting a creature live alone for an hour (`npm run life`), which the bar couldn't see:
- Superstitions like "avoiding fruit helps Food". Earlier actions now only get 15% of the credit for a drive going up.
- Picking all nine actions about evenly when content, which looked random. It now has small built-in habits.
- It couldn't eat something it was carrying. Now it can.

## Not done yet, on purpose

- **Physics is a simple stand-in.** Rapier is installed and proven in both Node and the app, and replaces this in Milestone 1.
- **The Food and Energy systems are written in code**, not wires. Wires are Milestone 2 and creature bodies are Milestone 3. They do already use the Data idea of a base value plus randomness.
- **The simulation runs on the main thread**, not a background worker as planned. It's light enough for one creature to run 16x at 60 frames per second, so that can wait until there are more.
- **Creature files don't exist yet.** A creature saves to the app's own storage. Saves already have a version number and the same format will be the base for `.nurt` files in Milestone 4.

## Worth tuning after watching it

- **It keeps itself quite full.** Food mostly stays high (the lowest in a 30-minute run was 48), so it rarely gets properly hungry with fruit always coming back. Remove the fruit to see it get hungry.
- **Babies aren't very clueless.** The first meal comes after about 5 seconds. The plan pictures a baby wandering around confused for longer. `curiosity` and `PLAYFUL` in `brain.ts` control this.
- **One slap is usually enough** (1.4 on average). The plan's "next time it hesitates" could be stronger or weaker with `SLAP` in `brain.ts`.
- **There isn't much to explore.** With only a few objects in the room, it runs out of new things to try quickly.

## Not checked

- The Windows build was produced but hasn't been run on Windows. Its `.exe` has no icon yet, because that needs an `.ico` file.
- Only tested on CachyOS with Hyprland.
