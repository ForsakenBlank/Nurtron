// the desktop shell: one window showing the game. all game code lives in src/ and runs in the page.
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const devUrl = process.env.NURTRON_DEV_URL;
const checkOut = process.env.NURTRON_CHECK_OUT;
const pageFile = path.join(__dirname, '..', 'dist', 'index.html');

// a check must never touch the real creature, so it gets its own throwaway save folder
if (checkOut) app.setPath('userData', fs.mkdtempSync(path.join(path.dirname(checkOut), 'data-')));

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    title: 'Nurtron',
    backgroundColor: '#12141d',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  Menu.setApplicationMenu(null);
  // links open in the real browser, and only web pages: the update checker's download page is the main one
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  return win;
}

// used by `npm run check-env`: opens the window for a few seconds, runs the graphics and physics check,
// then opens the real game too, and saves what it found and a picture of each
async function runCheck(win) {
  const finish = (result) => {
    fs.writeFileSync(checkOut, JSON.stringify(result, null, 2));
    app.exit(result.ok ? 0 : 1);
  };
  const timer = setTimeout(() => finish({ ok: false, error: 'timed out' }), 45000);
  const wait = (ms) => new Promise((done) => setTimeout(done, ms));
  const shoot = async (file) => {
    const picture = await win.webContents.capturePage();
    fs.writeFileSync(file, picture.toPNG());
  };
  try {
    await win.loadFile(pageFile, { search: 'envcheck' });
    const result = await win.webContents.executeJavaScript('window.nurtronEnvCheck');
    await wait(300);
    const pictureFile = checkOut.replace(/\.json$/, '.png');
    await shoot(pictureFile);

    await win.loadFile(pageFile);
    await wait(5000);
    const game = await win.webContents.executeJavaScript(
      '({ running: !!window.nurtron, tick: window.nurtron?.getWorld().tick ?? 0, canvas: !!document.querySelector("#stage canvas") })',
    );
    const gamePicture = checkOut.replace(/\.json$/, '-game.png');
    await shoot(gamePicture);

    // wires and skins draw differently on a real graphics card than in a browser preview, so they get checked here too
    const parts = await win.webContents.executeJavaScript(`(async () => {
      const add = (name) => [...document.querySelectorAll('#add button')].find((b) => b.textContent === name).click();
      add('Counter');
      add('Hunger');
      const world = window.nurtron.getWorld();
      world.pressButton(world.things.find((t) => t.name === 'Press me').id);
      document.getElementById('customise-open').click();
      await new Promise((done) => setTimeout(done, 800));
      const drawn = [...document.querySelectorAll('.skin-picture canvas')].filter((c) => {
        const pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        return pixels.some((v, i) => i % 4 === 3 && v > 0);
      });
      return { wires: world.wires.length, count: world.things.find((t) => t.name === 'Count').live.value, skins: drawn.length, drives: world.creature.drives.filter((d) => d.wired).length };
    })()`);
    const partsPicture = checkOut.replace(/\.json$/, '-parts.png');
    await shoot(partsPicture);

    // and the inside of the creature, which is what makes it go
    await win.webContents.executeJavaScript(`document.getElementById('customise-open').click(); document.getElementById('body-open').click(); 1`);
    await wait(500);
    const bodyPicture = checkOut.replace(/\.json$/, '-body.png');
    await shoot(bodyPicture);
    await win.webContents.executeJavaScript(`document.getElementById('body-close').click(); 1`);

    // the save button should really write a room file. normally this asks where, but a check can't answer
    const roomFile = checkOut.replace(/\.json$/, '-room.nroom');
    win.webContents.session.once('will-download', (_event, item) => item.setSavePath(roomFile));
    await win.webContents.executeJavaScript('document.getElementById("save-room").click()');
    await wait(500);
    const savesRooms = fs.existsSync(roomFile) && JSON.parse(fs.readFileSync(roomFile, 'utf8')).type === 'nurtron-room';

    // and a creature should really go out as a file and come back in as one, on real graphics, with a picture on a shape
    const creatureFile = checkOut.replace(/\.json$/, '-creature.nurt');
    win.webContents.session.once('will-download', (_event, item) => item.setSavePath(creatureFile));
    await win.webContents.executeJavaScript('document.getElementById("save-creature").click()');
    await wait(500);
    const sentCreature = fs.existsSync(creatureFile) ? fs.readFileSync(creatureFile, 'utf8') : '';
    const shared = await win.webContents.executeJavaScript(`(async () => {
      const tick = () => new Promise((done) => setTimeout(done, 300));
      const world = window.nurtron.getWorld();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 32;
      const draw = canvas.getContext('2d');
      draw.fillStyle = '#e02020';
      draw.fillRect(0, 0, 32, 32);
      const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'));
      const drop = (file, x, y) => {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        window.dispatchEvent(new DragEvent('drop', { dataTransfer, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      };
      const rock = world.things.find((t) => t.name === 'Rock');
      if (rock) {
        const box = window.nurtron.scene.app.canvas.getBoundingClientRect();
        const at = window.nurtron.scene.toScreen(rock.x, rock.y);
        drop(new File([blob], 'red.png', { type: 'image/png' }), box.left + at.x, box.top + at.y);
        await tick();
      }
      drop(new File([${JSON.stringify(sentCreature)}], 'creature.nurt'), 10, 10);
      await tick();
      const now = window.nurtron.getWorld();
      // and the creature that just arrived should be here as well as the one that was already, each with its own stomach
      now.setDrive('Hunger', 11, now.creatures[0]);
      now.setDrive('Hunger', 66, now.creatures[now.creatures.length - 1]);
      return { picture: !rock || !!rock.texture, drives: now.creature.drives.filter((d) => d.wired).length, creatures: now.creatures.length, stomachs: now.creatures.map((c) => now.drive('Hunger', c).value) };
    })()`);
    await wait(300);
    const picturePicture = checkOut.replace(/\.json$/, '-picture.png');
    await shoot(picturePicture);

    // closing and reopening the page should bring the same creature back, not a new egg
    await win.loadFile(pageFile);
    await wait(500);
    const reopenedTick = await win.webContents.executeJavaScript('window.nurtron?.getWorld().tick ?? 0');
    const survives = reopenedTick >= game.tick;

    clearTimeout(timer);
    finish({
      ...result,
      ok: result.ok && game.running && game.tick > 0 && game.canvas && survives && savesRooms && !!sentCreature && shared.picture && shared.drives === 2 && shared.creatures === 2 && shared.stomachs[0] !== shared.stomachs[1] && parts.count === 1 && parts.skins === 10 && parts.drives === 2,
      game,
      parts,
      partsPicture,
      bodyPicture,
      survives,
      savesRooms,
      shared,
      picturePicture,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      picture: pictureFile,
      gamePicture,
    });
  } catch (err) {
    clearTimeout(timer);
    finish({ ok: false, error: String(err) });
  }
}

app.whenReady().then(() => {
  const win = createWindow();
  if (checkOut) runCheck(win);
  else if (devUrl) win.loadURL(devUrl);
  else win.loadFile(pageFile);
});

app.on('window-all-closed', () => app.quit());
