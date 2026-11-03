// Exposes the few desktop-only actions the game's menu needs (src/hud/Dialogs.tsx reads `window.grimoire`).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('grimoire', {
  isDesktop: true,
  quit: () => ipcRenderer.send('grimoire:quit'),
  toggleFullscreen: () => ipcRenderer.send('grimoire:toggle-fullscreen'),
});
