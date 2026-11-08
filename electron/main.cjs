// the desktop shell: one window showing the game. all game code lives in src/ and runs in the page.
const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const https = require('node:https');
const { execFileSync, spawn } = require('node:child_process');

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
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
  });
  Menu.setApplicationMenu(null);
  // links open in the real browser, and only web pages: the update checker's download page is the main one
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  return win;
}

// ---- updates ----
// the page asks GitHub which versions there are. installing one only ever happens when the player presses a button
// for it and says yes: then this downloads that version's build for this computer from this game's own releases,
// unpacks it next to the app folder and swaps the two, and Nurtron starts again. creatures and worlds are kept
// in the app's data folder, which none of this touches. it works like the one in Prism.
const UPDATE_REPO = 'ForsakenBlank/Nurtron';
const UPDATE_ASSETS = { linux: 'Nurtron-linux-x64.tar.gz', win32: 'Nurtron-windows-x64.zip' };
const DOWNLOADS = `https://github.com/${UPDATE_REPO}/releases/download/`;
// github hands the download over to its file servers, and nowhere else is followed
const DOWNLOAD_HOSTS = ['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'];
let installing = false;

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Nurtron', Accept: 'application/vnd.github+json' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode === 404) return reject(new Error("GitHub doesn't have that version."));
        if (res.statusCode !== 200) return reject(new Error(`GitHub answered ${res.statusCode}.`));
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (err) {
          reject(err);
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function fetchToFile(url, dest, onProgress, redirects = 0) {
  return new Promise((resolve, reject) => {
    const where = new URL(url);
    if (where.protocol !== 'https:' || !DOWNLOAD_HOSTS.includes(where.hostname)) return reject(new Error('That download pointed somewhere unexpected, so it was stopped.'));
    if (redirects > 5) return reject(new Error('Too many redirects.'));
    https.get(url, { headers: { 'User-Agent': 'Nurtron' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        return resolve(fetchToFile(new URL(res.headers.location, url).toString(), dest, onProgress, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`The download failed (${res.statusCode}).`));
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let got = 0;
      const out = fs.createWriteStream(dest);
      res.on('data', (chunk) => {
        got += chunk.length;
        if (total) onProgress(got / total);
      });
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve(dest)));
      out.on('error', reject);
      res.on('error', reject);
    }).on('error', reject);
  });
}

// the folder the app runs from, like release/Nurtron-linux-x64
const appFolder = () => path.dirname(process.execPath);

function canWrite(dir) {
  const probe = path.join(dir, `.nurtron-write-test-${process.pid}`);
  try {
    fs.writeFileSync(probe, '');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

// why this copy can't install versions itself, or null if it can
function cantInstall() {
  if (!UPDATE_ASSETS[process.platform]) return 'Installing from here works on Linux and Windows.';
  if (!app.isPackaged) return "This is running from the code, so get the newest code with git instead. The pages below still work.";
  if (!canWrite(appFolder())) return "Nurtron can't change its own folder, so download the version you want from its page instead.";
  if (process.platform === 'linux' && !canWrite(path.dirname(appFolder()))) return "Nurtron can't change the folder it's in, so download the version you want from its page instead.";
  return null;
}

// a swap leaves the old version next to the new one, so it's tidied away on the next start
function cleanOldUpdates() {
  if (!app.isPackaged || process.platform !== 'linux') return;
  const parent = path.dirname(appFolder());
  try {
    for (const f of fs.readdirSync(parent)) {
      if (f.startsWith('.nurtron-old-') || f.startsWith('.nurtron-update-')) fs.rmSync(path.join(parent, f), { recursive: true, force: true });
    }
  } catch {
    // nothing to tidy
  }
}

ipcMain.handle('update:info', () => ({ current: app.getVersion(), asset: UPDATE_ASSETS[process.platform] ?? null, cantInstall: cantInstall() }));

ipcMain.handle('update:install', async (event, version) => {
  const reason = cantInstall();
  if (reason) throw new Error(reason);
  if (typeof version !== 'string' || !/^\d+(\.\d+){0,3}$/.test(version)) throw new Error("That isn't a version number.");
  if (installing) throw new Error('Already installing one.');
  installing = true;
  const win = BrowserWindow.fromWebContents(event.sender);
  const send = (stage, frac) => {
    if (win && !win.isDestroyed()) win.webContents.send('update:progress', { stage, percent: Math.round(frac * 100) });
  };
  try {
    const rel = await getJson(`https://api.github.com/repos/${UPDATE_REPO}/releases/tags/v${version}`);
    const name = UPDATE_ASSETS[process.platform];
    const asset = (rel.assets || []).find((a) => a.name === name);
    if (!asset || typeof asset.browser_download_url !== 'string' || !asset.browser_download_url.startsWith(DOWNLOADS)) throw new Error(`Version ${version} has no ${name}.`);
    const parent = path.dirname(appFolder());
    const linux = process.platform === 'linux';
    const work = fs.mkdtempSync(linux ? path.join(parent, '.nurtron-update-') : path.join(app.getPath('temp'), 'nurtron-update-'));
    const archive = path.join(work, name);
    await fetchToFile(asset.browser_download_url, archive, (f) => send('download', f));
    send('unpack', 1);
    const unpacked = path.join(work, 'new');
    fs.mkdirSync(unpacked);
    if (linux) execFileSync('tar', ['-xzf', archive, '-C', unpacked], { stdio: 'ignore' });
    else execFileSync('tar', ['-xf', archive, '-C', unpacked], { stdio: 'ignore', windowsHide: true });
    // the archive holds one folder, like Nurtron-linux-x64
    const entries = fs.readdirSync(unpacked);
    const src = entries.length === 1 && fs.statSync(path.join(unpacked, entries[0])).isDirectory() ? path.join(unpacked, entries[0]) : unpacked;
    const exe = path.join(src, path.basename(process.execPath));
    if (!fs.existsSync(exe)) throw new Error("That download didn't have Nurtron in it, so nothing was changed.");
    const dest = appFolder();
    if (linux) {
      // a running program keeps working from its moved files, so the folders can be swapped while it runs
      const old = path.join(parent, `.nurtron-old-${Date.now()}`);
      fs.renameSync(dest, old);
      try {
        fs.renameSync(src, dest);
      } catch (err) {
        fs.renameSync(old, dest);
        throw err;
      }
      app.relaunch();
    } else {
      // windows locks a running program's files, so a little script copies them over once this has closed
      const script = path.join(work, 'update.cmd');
      fs.writeFileSync(script, [
        '@echo off',
        ':wait',
        `tasklist /FI "PID eq ${process.pid}" | find "${process.pid}" >nul && (ping -n 2 127.0.0.1 >nul & goto wait)`,
        `robocopy "${src}" "${dest}" /E /R:5 /W:1 /NFL /NDL /NJH /NJS /NP >nul`,
        `start "" "${process.execPath}"`,
        `rmdir /s /q "${work}"`,
      ].join('\r\n'));
      spawn('cmd.exe', ['/c', script], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    }
    setTimeout(() => app.quit(), 300);
    return true;
  } catch (err) {
    installing = false;
    throw err;
  }
});

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
  cleanOldUpdates();
  const win = createWindow();
  if (checkOut) runCheck(win);
  else if (devUrl) win.loadURL(devUrl);
  else win.loadFile(pageFile);
});

app.on('window-all-closed', () => app.quit());
