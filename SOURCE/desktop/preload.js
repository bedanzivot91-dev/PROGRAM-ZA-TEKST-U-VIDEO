'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const { version: APP_VERSION } = require('../package.json');

// Namerno minimalan API. Frontend i dalje razgovara sa lokalnim serverom preko
// običnog fetch() na isti-origin /api/* rute — Electron ne posreduje u tim pozivima.
// Ovaj most postoji samo za stvari koje SAMO Electron zna (verzija, platforma, EXE dijagnostika).
contextBridge.exposeInMainWorld('mssDesktop', {
  isElectron: true,
  platform: process.platform,
  appVersion: process.env.MSS_APP_VERSION || APP_VERSION,
  getDiagnostics: () => ipcRenderer.invoke('mss:get-diagnostics')
});
