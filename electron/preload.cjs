// the only things the page can ask the desktop app to do. everything else stays out of its reach.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nurtronApp', {
  updates: {
    info: () => ipcRenderer.invoke('update:info'),
    // installs exactly this version, newer or older, after the player has said yes
    install: (version) => ipcRenderer.invoke('update:install', String(version)),
    onProgress: (callback) => {
      const handler = (_event, progress) => callback(progress);
      ipcRenderer.on('update:progress', handler);
      return () => ipcRenderer.removeListener('update:progress', handler);
    },
  },
});
