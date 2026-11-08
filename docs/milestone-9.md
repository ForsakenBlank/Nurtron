# Milestone 9: a main menu, worlds, settings, and updates from inside the app

**Status: built, and released as 0.2.1 (the updater) and 0.3.0 (everything else). All of it was used in the real desktop app with the mouse and keyboard, and installing a version was done for real on Linux. Nothing was tried on Windows.**

## Updates from inside the app

**Menu, then Settings**, lists every version, like Luminescent. **Update** installs a newer one, **Reinstall** the one you have, and **Downgrade** goes back to an older one. In 0.2.1 the same list is in Files, then App updates.

- **It always asks first.** Nothing is downloaded until you press a version's button and say yes. Going back warns that worlds made with newer versions might not open in an older one, and suggests saving your creatures to files first.
- **It only downloads this game's own builds** from its GitHub releases, and the download can only come from GitHub's own servers.
- On Linux, it unpacks the new version next to the app folder, swaps the two folders and starts again, like Prism. The old folder is tidied away the next time it starts. On Windows, a small script copies the files over once Nurtron has closed, then starts it again.
- Creatures and worlds live in the app's own data folder, which installing never touches.
- **0.2.0 can't install versions itself.** Going back to it works, but coming back means downloading from GitHub. The Downgrade question says so.
- Running from the code (`npm start`) doesn't install anything. It says to use git instead, and offers the download pages.

**Tested for real:** a copy of the 0.2.1 build, with Downgrade pressed by the mouse, downloaded 0.2.0 from GitHub, swapped its folder, restarted by itself, and was 0.2.0 afterwards. Then the same was done from 0.2.1 up to 0.3.0.

## The main menu

It opens when Nurtron starts (Settings can turn that off), and the **Menu** button at the top left brings it back. The world stops while it's up.

- **Worlds:** each world has a card with a little picture of its map, who lives there, its size and when you last played it. **Play** goes into it, **Rename** changes its name, and **Delete** removes it after asking.
- **New world** asks for a name and a size, and starts with a new egg. **Open a world file** adds a `.nworld` file as a new world.
- **Continue** goes back into the world you were in.
- **Quit** closes the app.
- The world you were playing before this update becomes **My world**, with everything in it.

**Inside a world, these changed:**

- **Files, then Open world** adds the file as a new world instead of replacing the one you're in.
- **World settings, then Start a new world** makes a new world and keeps the old one on the menu.

### How worlds are kept

The world you're in is saved as it always was, every 10 seconds and as the window closes. The others are kept in the app's bigger store, since a few big worlds would soon fill the small one. The list is checked when it's read, so a damaged list loses only the damaged entries. There's room for 60 worlds.

## Pausing really pauses

Before, the creature stopped while paused, but its legs kept walking, it kept blinking, sparkles and sleep bubbles kept drifting, and pulses kept running along wires. Now everything holds still while paused, and while the menu is up.

## Results

- **266 automated tests pass,** 6 of them new for worlds and 1 new for the updater.
- **The learning bar didn't change:** 88%, 100%, 79%, 9%, 100%, 100%, 90%, 100%.
- **`npm run check-env` passes.** It failed at first because the menu now opens at start, with the world stopped, so its wiring check never got a tick. The check now presses Continue first, like a player.
- **Checked in the real desktop app, with the mouse and keyboard:**
  - A new player gets the menu with one world.
  - Continue. Space to pause: two pictures a second apart were exactly the same, and the drawing clock didn't move. Unpaused, it moved a second per second.
  - The world stops ticking while the menu is up, and its card gets a picture.
  - New world, with its name typed in, then going back into the first world (the same creature), then Rename and Delete.
  - The Settings list of versions.
  - Someone on 0.2.1 with a creature called Oldie opening 0.3.0: Oldie is there, in My world.

## Bugs found by using it

- **Typing a new world's name went nowhere.** An older rule drops the keyboard after any button click, so Space doesn't press it again, and it was also taking the keyboard away from the name box. Now it only lets go of buttons.
- **The selected tab's words were invisible,** and **App updates was missing from Settings,** because of leftover styles.

## Not checked

- Anything on Windows, including its updater script.
- Very big worlds, or many of them, filling the bigger store.
- Going back to 0.2.0 after making several worlds in 0.3.0. It opens the world you were last in, and the others stay in the store, waiting for you to come back up.
- The map pictures of huge or very busy worlds.
