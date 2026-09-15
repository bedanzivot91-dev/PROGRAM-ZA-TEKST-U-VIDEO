'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Ovu vrednost automatski održava scripts/sync-runtime-versions.js prema package.json.
// Sandboxed Electron preload ne sme da require()-uje proizvoljne lokalne fajlove kao
// ../package.json, jer to može sprečiti učitavanje celog contextBridge mosta.
const APP_VERSION = '15.6.1';

// Namerno minimalan API. Frontend i dalje razgovara sa lokalnim serverom preko
// običnog fetch() na isti-origin /api/* rute — Electron ne posreduje u tim pozivima.
// Ovaj most postoji samo za stvari koje SAMO Electron zna (verzija, platforma, EXE dijagnostika).
contextBridge.exposeInMainWorld('mssDesktop', {
  isElectron: true,
  platform: process.platform,
  appVersion: APP_VERSION,
  getDiagnostics: () => ipcRenderer.invoke('mss:get-diagnostics')
});
