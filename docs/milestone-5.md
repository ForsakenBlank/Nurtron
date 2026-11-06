# Milestone 5: families, and easier to get around

**Status: built. The plan's test, telling siblings apart by how they act, passes as an automated test: 31 of 40 on creatures never used for tuning, where guessing would get 10. Whether you can tell them apart by watching is the real test, and only you can do that.**

## Several creatures

- A room can hold up to 20 creatures. Each has its own stomach, brain and body circuit.
- **Click a creature** to look at it, or use the name chips at the top right of the room. The name box, Customise, Inside it and the mind panel all follow whoever you're looking at.
- **New egg** now adds a creature instead of replacing yours, with its own name and colours.
- **Open creature** now adds them too, so a friend's creature joins yours.
- **A fruit feeds whoever touched it,** and only they learn from it. A Give that nobody set off, like a Button you clicked, goes to whoever touched something last.
- Creatures walk through each other, so a crowd can't jam up in a corner. They can't see each other yet.

## Genes and babies

- Every egg with no parents has its own genes. There are ten: how fast it learns, how curious it is, how long it remembers, how many things it can know, how erratic it is, and new ones for how restful, chatty, roaming and grabby it is, and how fast it walks.
- **Family** at the top of the window says what a creature is like in plain words, like "quick on its feet, chatty, learns fast".
- **Have a baby** in that panel needs two grown-ups. The egg gets each gene from one parent or the other, slightly changed, and nothing they've learned.
- **A baby inherits one parent's whole body circuit,** so a need you wired by hand, like Disco, passes down the family.
- It takes its skin from either parent and colours close to one of theirs.
- A parent has to wait 5 minutes of world time before having another.

## Growing up

A creature is a baby for 10 minutes, a child until 30 minutes, then grown up. These are world minutes, so 16x speed gets there in about 2 real minutes. Babies are drawn smaller, but their body in the room is the same size, so they can reach what grown-ups can.

## Family trees

Parents, grandparents, brothers and sisters and children show in the Family panel. Click anyone who's here to go to them. The tree travels inside `.nurt` files, and someone sent away stays in it. Opening the same creature twice gives you a twin, with the same parents and a place of their own in the tree.

## Bigger rooms

- **Files, then Room size:** Small, Medium, Large or Huge, or any size from 1000 by 600 up to 40000 by 10000.
- New games start at Medium, 6000 by 2000. **Your existing creature keeps its old 2000 by 1000 room until you change it.**
- Changing the size keeps everything centred and on the floor, and clears undo.
- Room and world files remember their size.

## Getting around

| Input | What it does |
|---|---|
| Drag empty space | Moves the view. This used to draw a selection box |
| Shift+drag empty space | Draws a selection box |
| Right-drag or middle-drag | Also moves the view |
| Scroll, or + and - | Zoom. It now goes in to 10x, and out to twice as far as it takes to fit the whole room |
| 0, or the Fit button | Shows the whole room |
| F | Finds the creature you're looking at |

## The mind panel

- **Close it** with the ✕, the **Mind** button or **Tab**. **Drag its left edge** to resize it. It remembers both.
- **Right now** says what it's doing this moment, why (You told it to, It learned this works, Just curious, Out of habit), how it feels, and what else it considered.
- **Recent thoughts** lists what it decided and what came of it, newest first, with how long ago.
- Recent thoughts, the brain picture and What it has learned each fold away by clicking their heading.

## Telling it what to do

- **Right-click a shape or Button:** Go to it, Touch it, Grab it, Push it or Avoid it. The mind panel also has Rest, Call out, Wander and Drop it.
- **Give several and it does them in order,** which is how you say "go find this, then do this". It shows what's next, with a Forget these button.
- **It walks as far as it takes,** where left to itself it would give up on a long walk.
- **Make it remember** is on by default, and it learns from each order as if it had been its own idea. Told three times to touch a hexagon, it went back about 14 times in the next 3 minutes, against about 2 for one never told. It still keeps itself fed.
- **A real reward still teaches on top,** so sending it to a fruit teaches it more than sending it to a rock.
- A slap cancels everything it was told. If it can't get somewhere, it says so and drops the rest of the list.

**What this doesn't do:** it learns each step on its own, not the sequence. Told "touch the button, then eat the fruit", it learns to like both, not that one leads to the other. The brain has no idea of sequences yet.

## Dying, if you wire it up

Nothing dies by itself. There's no old age and nothing happens at Food 0 unless you build it, using the **Die** part: when a pulse arrives, the creature dies. Inside a creature, that's the one it belongs to. Out in the room, it's whichever creature set it off, so a shape's Touched wired to a Die makes poison.

Old age, built by hand inside a creature:

```
Timer tick         →  Age label "update"
Age label value    →  Math A, with B set to 1
Math result        →  Age label "set"
Age label value    →  Compare A, set to equal
Data (80, spread 10)  →  Compare B       its own death age, from 70 to 90
Compare became     →  Die
```

Press **Revive** in the mind panel to bring it back. What happens then:

- **Its body starts over.** Labels go back to the value they started with or you last typed, timers wait again, and a random Data picks again, so it gets a new death age. Otherwise whatever killed it would still be true the moment it woke up.
- **It keeps everything it learned,** and also works out what went wrong, in words you can read in the mind panel:
  - **Something it did set it off,** like touching poison: it blames that, hard. It takes one death. Of the 20 creatures tested, at least 80% of those that died never touched it again in the next 90 seconds.
  - **It died badly in need of something,** like Food: what it was doing gets blamed, and whatever it already knows helps with that need counts for more.
  - **Neither,** like old age: it learns nothing, and says it doesn't know why. Anything else would teach it nonsense, like "resting kills you".
- **A Compare's Became pulse hides the cause.** Poison that takes Food to 0 and then kills it counts as dying in need of Food, because the wires don't say what it touched.
- **A Feel part** has Died and Revived outputs, if the body should do something different after coming back.
- A dead creature lies on the floor, grey. Its timers stop, and it can't be petted, slapped, told what to do or have babies. Eggs can't die. Death count and the last lesson travel in `.nurt` files.

## Results

- **184 automated tests pass,** 69 more than before Milestone 4.
- **The learning bar didn't change at all** (seeds 1001 to 1100): 92%, 100%, 67%, 7%, 100%, 100%, 94%, 97%. The default genes are the ones it was tuned on.
- **20 creatures with varied genes, 10 minutes alone:** at least 80% never dropped below Food 10. Twenty living together for a minute also ran fine.
- **Tested in the game with real mouse clicks:** panning, zoom limits, the Fit button, hiding, showing and resizing the panel, an order by right-click, a list of two orders, a new egg, a baby, and a custom room size.
- **Tested in the game by code rather than by hand:** making creatures grown up instantly so a baby could be tried, picking a creature by its chip, looking inside the new one, and sending one away.
- **The desktop app's own check** now runs two creatures with separate stomachs on its real graphics.

## Bugs found along the way

- **The moved-creature test was resting on luck.** With 20 creatures it swung between 70% and 85%. It now uses 80, which gives 82%. Unmoved creatures in the same test get 91%. That gap could be chance, and it passes the 80% target with little to spare, so it's worth keeping an eye on.
- **Drawing babies smaller made every creature vanish,** leaving only a shadow. No test could see it, only looking at the screen did. Fixed.
- **Orders were far too strong at first:** 67 touches in 3 minutes, which was obsession rather than learning.

## Not done, on purpose

Nothing is left over from this milestone. The Spawner part came along in [milestone 6](milestone-6.md).

## Worth knowing

- **Creatures only notice things within about 900.** In a huge room they can miss what you've built until they wander near it, or you send them.
- **Babies are the player's choice,** through a button. Creatures don't seek each other out.
- **Undo is cleared** when you send a creature away or change the room size.

## Not checked

- Whether siblings feel different when you watch them.
- A real baby born without a shortcut, by waiting 30 minutes of world time.
- Drawing speed with 20 creatures on a real graphics card.
- How a really huge room feels to play. The largest tested by hand was 15000 by 3500.
- Windows, and a real second PC.
