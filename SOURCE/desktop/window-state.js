'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_STATE = { width: 1440, height: 900, x: undefined, y: undefined, isMaximized: false };

function stateFile(settingsDir) { return path.join(settingsDir, 'window-state.json'); }

function loadWindowState(settingsDir) {
  try {
    const raw = fs.readFileSync(stateFile(settingsDir), 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed.width === 'number' && typeof parsed.height === 'number') {
      return { ...DEFAULT_STATE, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_STATE };
}

function atomicWrite(file, text) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

function saveWindowState(settingsDir, browserWindow) {
  try {
    fs.mkdirSync(settingsDir, { recursive: true });
    const isMaximized = browserWindow.isMaximized();
    const bounds = isMaximized ? browserWindow.getNormalBounds() : browserWindow.getBounds();
    atomicWrite(stateFile(settingsDir), JSON.stringify({ ...bounds, isMaximized }, null, 2));
  } catch {}
}

function trackWindowState(settingsDir, browserWindow) {
  let saveTimer = null;
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveWindowState(settingsDir, browserWindow), 400);
  };
  browserWindow.on('resize', scheduleSave);
  browserWindow.on('move', scheduleSave);
  browserWindow.on('close', () => { clearTimeout(saveTimer); saveWindowState(settingsDir, browserWindow); });
}

module.exports = { loadWindowState, saveWindowState, trackWindowState };
