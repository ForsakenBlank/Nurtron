# Milestone 3: creatures in the sandbox

**Status: built, and the plan's first 10 minutes runs from start to finish as an automated test and largely by hand. Its real test, a friend playing with nobody helping them, hasn't happened yet, and only you can do that.**

## What's in

- **A creature's body is real wires now.** Hunger and energy aren't built in any more. Double-click your creature, or press **Inside it**, to see its body, which keeps running while you look. Everything in there can be changed or deleted.
- **Touched:** every shape has this output. Hover near a shape, or use the Wire tool, and it appears just to the right of it.
- **Give:** when a pulse arrives, it changes a Label inside the creature by name, like Food +20. It works from the room or from inside.
- **Drive socket:** plug any value in and the creature now cares about it. It can want the value high, low or near a number.
- **Nerve socket:** plain information that feels neither good nor bad, but it can learn what to do while it's on. This one also works out in the room.
- **Action and Feel:** let a body react to what it's doing, or to being petted and slapped. That's how you'd build loneliness.
- **Eggs:** a new creature hatches after a few seconds. **New egg** offers a starter body or a blank one with nothing inside.
- **A fuller Brain view:**
  - Whatever it has learned stays on screen. If it doesn't care right now, like food when it's full, the link goes faint and dashed instead of disappearing.
  - A link flashes the moment it learns something.
  - Hover anything to ask about it, and click a concept to see everything it knows about that.
- **Add: Wired fruit** drops in a ready-made fruit built from a circle, a wire and a Give.

## The first 10 minutes, step by step

Tested on 20 creatures never used for tuning, in `tests/first-minutes.test.ts`. It only builds with wires, pets and slaps.

| Step | Result |
|---|---|
| An egg hatches, and Food drops by itself through wires | Yes |
| You build a fruit from a red circle, a wire and a Give | Yes, also by hand with the mouse |
| It bumps into the fruit and gets fed | 20 of 20 |
| After a few meals, it picks a new fruit over a rock | At least 80% (the test's target) |
| It tries a red ball because it looks like food, and slaps stop it | At least 80% tried it, and at least 80% of those stopped |
| A Button can drop a fruit off a shelf with a Motor | Yes, once |
| It learns to press a Button wired to a Give | At least 80% |

## Wiring up something new

The point of all this, tested on the same creatures:

- **Disco:** a blank creature with one Label called Disco, wired to a Drive socket, and a hexagon that gives Disco when touched. At least 80% learned to go for the hexagon. Nothing in the code knows what Disco is.
- **Wanting low:** Loneliness that a pet brings down, using Feel and Give.
- **Near a number:** Warmth that feels best at 50.
- **Nerves:** pet it for calling out only while a light is on, and it calls out more with the light on than off.

## What teaches it

Wires only teach it when it caused the pulse: touching something, pressing a Button, walking into a Sensor, being petted, or a Timer switched on by its own action, like resting. A Timer ticking away by itself doesn't count, however much it changes.

This rule is what keeps the Milestone 1 bug away, where long walks taught it that walking makes it hungry, so it stopped looking for food. There's a test for this.

## Results

- **115 automated tests pass,** 21 of them new.
- **The learning bar held up with hunger and energy on real wires** (seeds 1001 to 1100):

| Test | Before | Now | Target |
|---|---|---|---|
| Hungry, picks the fruit over the rock | 94% | 92% | at least 80% |
| Same, with no praise at all | 100% | 100% | at least 80% |
| Very hungry, next decision is to eat | 69% | 67% | at least 60% |
| Full, next decision is to eat | 6% | 7% | at most 20% |
| Leaves a ball alone after slaps | 100% | 100% | at least 80% |
| Stops calling out after slaps | 100% | 100% | at least 80% |
| Picks a new big red ball over a new blue block | 94% | 94% | at least 65% |
| Alone for 30 minutes, keeps itself fed (30 creatures) | 100% | 97% | at least 90% |

These are all still comfortably past their targets, and the small changes are within what different random numbers give. The praise-only trick went from 43% to 36% of its decisions, and it isn't a pass or fail line.

- **The desktop app's own check** now covers the body too.
- **Old creatures carry over.** Saves went to version 4. An old creature gets the starter body with its hunger and energy as they were, and keeps what it learned. This was tested on a real save from last milestone as well as with tests.

## Worth knowing

- **A shape that isn't Used up can be eaten forever.** Touching it gives Food every time, so a plain red circle with a Give is an endless fruit. Tick **Used up** in its properties, or use **Add: Wired fruit**.
- **It can only rest by instinct if the drive is called Energy.** Any other tiredness you build has to be learned by it, which it can do.
- **Sockets and Give go by name,** so names matter. A Give pointing at a Label that doesn't exist says so on the part. Renaming a socket keeps what it learned, and deleting one and adding it back with the same name brings its memories back.
- **The brain has room for 24 sockets, counting ones you've deleted.** A room file can bring nerve sockets with it, so this can't grow forever.

## Not done, on purpose

- **There's still only one creature.** Each body lives inside its creature, so five would have five stomachs, but actually having several needs a large change to how the world works. Babies in Milestone 5 are where that's needed.
- **New egg is a button, not a tool you place.** It follows from there being one creature.
- **It can't see tags yet.** Only Sensors can.
- **`.nurt` files** are next, in Milestone 4.

## Not great yet

- **No repeating fruit dispenser.** A Button and Motor can knock one fruit off a shelf, but there's no part that makes new things, so step 7 of the plan works once rather than over and over. A creature can't really learn from a one-shot, so I didn't test it learning this. A Spawner part would fix it, and isn't in the plan yet.
- **No pathfinding, as before.** In a test with food up a ramp, 4 of 20 creatures walked under the ramp, couldn't reach, and wandered until Food hit 0. It also means a creature starving at 0 just carries on, because nothing happens at 0 yet. The plan still has to decide whether they die.
- **No tutorial until Milestone 7.** Nothing tells a new player to wire a Touched to a Give, which is the biggest risk to the "nobody helping them" test.

## Not checked

- A friend playing it with nobody helping.
- Whether it feels magic, which is what the whole milestone is aiming at.
- Windows, as before.
