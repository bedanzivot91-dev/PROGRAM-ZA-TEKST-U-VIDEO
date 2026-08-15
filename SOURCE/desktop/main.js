'use strict';

const { app, BrowserWindow, shell, dialog, ipcMain, Menu } = require('electron');
const fs = require('fs');
const path = require('path');

const { startServerProcess } = require('./server-controller');
const { loadWindowState, trackWindowState } = require('./window-state');

// Ako publish/owner+repo nije podešen (vidi package.json → build.publish), provera ažuriranja
// samo tiho ne uspe — nikad ne sme da naruši pokretanje programa niti da nešto pita korisnika
// dok stvarno ne pronađe noviju verziju.
function setupAutoUpdate(log) {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.logger = { info: m => log(`[update] ${m}`), warn: m => log(`[update] UPOZORENJE: ${m}`), error: m => log(`[update] GREŠKA: ${m}`), debug: () => {} };
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('update-downloaded', info => {
      if (!mainWindow) return;
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Nova verzija je spremna',
        message: `Preuzeta je nova verzija ${info.version}.`,
        detail: 'Instaliraće se automatski kada sledeći put zatvoriš program. Možeš i odmah da restartuješ.',
        buttons: ['Restartuj sada', 'Kasnije'],
        defaultId: 1,
        cancelId: 1
      }).then(({ response }) => { if (response === 0) autoUpdater.quitAndInstall(); });
    });
    autoUpdater.on('error', error => log(`[update] provera ažuriranja nije uspela (očekivano ako repo nije podešen): ${error.message}`));
    autoUpdater.checkForUpdates().catch(error => log(`[update] ${error.message}`));
  } catch (error) {
    log(`[update] electron-updater nije dostupan: ${error.message}`);
  }
}

const APP_VERSION = '15.6.0';
const USER_DATA_SUBDIRS = ['projects', 'database', 'backups', 'logs', 'bridge', 'cache', 'exports', 'temp', 'settings', 'secure'];

// Bezbedna rezerva za slabije/starije grafičke kartice (npr. GTX 750 Ti klasa hardvera koju
// dokumentacija projekta izričito pominje): pokretanje sa "--disable-gpu" preskače hardversko
// ubrzanje ako korisnik primeti crn ekran ili grafičke greške na starijem računaru.
if (process.argv.includes('--disable-gpu')) app.disableHardwareAcceleration();

let mainWindow = null;
let splashWindow = null;
let serverHandle = null;
let quitting = false;
let logStream = null;
let logFn = (message) => console.log(message);
let bootstrapRetryCount = 0;

function getProgramDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'PROGRAM')
    : path.join(__dirname, '..', 'PROGRAM - NE BRISATI');
}

function getUserDataRoot() {
  return app.getPath('userData');
}

function ensureUserDataDirs(root) {
  fs.mkdirSync(root, { recursive: true });
  for (const sub of USER_DATA_SUBDIRS) fs.mkdirSync(path.join(root, sub), { recursive: true });
}

function copyRecursiveNoOverwrite(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyRecursiveNoOverwrite(srcPath, destPath);
    } else if (entry.isFile() && !fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function migrateLegacyDataIfNeeded(programDir, userDataRoot, log) {
  const marker = path.join(userDataRoot, 'settings', '.legacy-migration-done');
  if (fs.existsSync(marker)) return;
  const legacyDataDir = path.join(programDir, 'data');
  try {
    if (fs.existsSync(legacyDataDir)) {
      const hasRealContent = fs.readdirSync(legacyDataDir, { withFileTypes: true })
        .some(entry => entry.isDirectory() || (entry.isFile() && !entry.name.startsWith('OVDE-SE-')));
      if (hasRealContent) {
        copyRecursiveNoOverwrite(legacyDataDir, userDataRoot);
        log(`Stari portable podaci migrirani iz ${legacyDataDir} u ${userDataRoot}.`);
      }
    }
  } catch (error) {
    log(`Migracija starih podataka nije uspela: ${error.message}`);
  }
  try { fs.mkdirSync(path.dirname(marker), { recursive: true }); fs.writeFileSync(marker, new Date().toISOString(), 'utf8'); } catch {}
}

function initLog(userDataRoot) {
  const logDir = path.join(userDataRoot, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const rotated = path.join(logDir, 'electron-main.log');
  try {
    if (fs.existsSync(rotated) && fs.statSync(rotated).size > 2 * 1024 * 1024) {
      fs.renameSync(rotated, path.join(logDir, 'electron-main.log.old'));
    }
  } catch {}
  logStream = fs.createWriteStream(rotated, { flags: 'a' });
  return function log(message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    console.log(line);
    try { logStream.write(`${line}\n`); } catch {}
  };
}

function writeDiagnostics(userDataRoot, info) {
  try {
    const file = path.join(userDataRoot, 'logs', 'DIJAGNOSTIKA-EXE.txt');
    const lines = [
      'MUZIČKI SPOT STUDIO — EXE DIJAGNOSTIKA',
      `Vreme: ${new Date().toISOString()}`,
      `Verzija: ${APP_VERSION}`,
      `Platforma: ${process.platform} ${process.arch}`,
      `Electron: ${process.versions.electron}`,
      `Node (ugrađeni): ${process.versions.node}`,
      `Spakovano (isPackaged): ${app.isPackaged}`,
      `Program folder: ${getProgramDir()}`,
      `userData: ${userDataRoot}`,
      ...Object.entries(info || {}).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    ];
    fs.writeFileSync(file, lines.join('\r\n'), 'utf8');
  } catch {}
}

function isAllowedExternalUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch { return false; }
}

function showSplash() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 280,
    frame: false,
    resizable: false,
    movable: false,
    show: false,
    backgroundColor: '#05070d',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  splashWindow.once('ready-to-show', () => splashWindow?.show());
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  return splashWindow;
}

function closeSplash() {
  if (!splashWindow) return;
  try { splashWindow.close(); } catch {}
  splashWindow = null;
}

function buildAppMenu(log, userDataRoot) {
  const template = [
    {
      label: 'Prikaz',
      submenu: [
        { label: 'Osveži', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.webContents.reload() },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Podrazumevani zum' },
        { role: 'zoomIn', label: 'Uvećaj' },
        { role: 'zoomOut', label: 'Umanji' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Ceo ekran' }
      ]
    },
    {
      label: 'Podrška',
      submenu: [
        {
          label: 'Otvori folder logova',
          click: () => shell.openPath(path.join(userDataRoot, 'logs'))
        },
        {
          label: 'Alati za dijagnostiku (DevTools)',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => mainWindow?.webContents.toggleDevTools()
        },
        { type: 'separator' },
        {
          label: 'O programu',
          click: () => dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Muzički Spot Studio Free',
            message: `Muzički Spot Studio Free ${APP_VERSION}`,
            detail: `Electron ${process.versions.electron}\nNode (ugrađeni) ${process.versions.node}\nPlatforma: ${process.platform} ${process.arch}`
          })
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow(log, serverUrl) {
  const userDataRoot = getUserDataRoot();
  const settingsDir = path.join(userDataRoot, 'settings');
  const state = loadWindowState(settingsDir);

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#05070d',
    show: false,
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    title: 'Muzički Spot Studio Free',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false
    }
  });

  trackWindowState(settingsDir, mainWindow);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) shell.openExternal(url);
    else log(`[bezbednost] Blokiran pokušaj otvaranja: ${url}`);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(serverUrl)) return;
    event.preventDefault();
    if (isAllowedExternalUrl(url)) shell.openExternal(url);
    else log(`[bezbednost] Blokirana navigacija: ${url}`);
  });

  // Ako se renderer (Chromium tab) sruši ili nestane iz memorije, korisnik inače vidi samo
  // zamrznut/prazan prozor. Ovde mu dajemo jasan izbor umesto tihog zamrzavanja.
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log(`[render-process-gone] razlog: ${details.reason}`);
    if (quitting || !mainWindow) return;
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Prozor programa se srušio',
      message: 'Deo programa koji prikazuje interfejs je prestao da radi.',
      detail: `Razlog: ${details.reason}. Ako se ovo ponavlja na starijoj grafičkoj kartici, pokreni program sa opcijom --disable-gpu.`,
      buttons: ['Ponovo učitaj', 'Zatvori program'],
      defaultId: 0,
      cancelId: 1
    }).then(({ response }) => {
      if (response === 0) mainWindow?.loadURL(serverUrl);
      else shutdownAndQuit();
    });
  });

  mainWindow.once('ready-to-show', () => {
    closeSplash();
    if (state.isMaximized) mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  await mainWindow.loadURL(serverUrl);
}

async function bootstrap() {
  const userDataRoot = getUserDataRoot();
  ensureUserDataDirs(userDataRoot);
  const log = initLog(userDataRoot);
  logFn = log;
  log(`Muzički Spot Studio ${APP_VERSION} — pokretanje (packaged=${app.isPackaged}).`);
  buildAppMenu(log, userDataRoot);
  showSplash();

  const programDir = getProgramDir();
  migrateLegacyDataIfNeeded(programDir, userDataRoot, log);

  try {
    serverHandle = await startServerProcess({
      electronExecPath: process.execPath,
      programDir,
      dataDir: userDataRoot,
      logDir: path.join(userDataRoot, 'logs'),
      onLog: log
    });
    log(`Server spreman: ${serverHandle.url} (već pokrenut ranije: ${serverHandle.alreadyRunning})`);
    writeDiagnostics(userDataRoot, { status: 'USPEŠNO', url: serverHandle.url, port: serverHandle.port });

    // Server javlja preko IPC-a kad se gasi NAMERNO (dugme ZATVORI PROGRAM u UI-ju zove HTTP
    // rutu direktno, van ovog Electron procesa) — bez ovoga bi izgledalo identično kao pravi pad.
    // shutdownAndQuit() MORA biti pozvan ovde (ne samo quitting=true) — inače se prozor nikad
    // stvarno ne zatvara jer je jedini drugi poziv shutdownAndQuit() unutar dijaloga koji smo
    // upravo zaobišli, pa bi Electron procesi (main/gpu/renderer) ostali da vise bez razloga.
    serverHandle.child?.on('message', message => {
      if (message?.type === 'mss-intentional-shutdown') {
        log(`[server] namerno gašenje: ${message.reason || ''}`);
        shutdownAndQuit();
      }
    });

    // Ako server proces neočekivano nestane DOK je prozor već otvoren (ne pri startu),
    // korisnik inače ostaje sa mrtvim interfejsom bez objašnjenja.
    serverHandle.child?.on('exit', (code, signal) => {
      if (quitting || !mainWindow) return;
      log(`[server] neočekivano gašenje posle pokretanja prozora (code=${code}, signal=${signal})`);
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Lokalni server je prestao da radi',
        message: 'Lokalni server programa je neočekivano prestao da radi.',
        detail: 'Program se mora ponovo pokrenuti da bi nastavio da radi.',
        buttons: ['Zatvori program'],
        defaultId: 0
      }).then(() => shutdownAndQuit());
    });

    await createWindow(log, serverHandle.url);
    setupAutoUpdate(log);
  } catch (error) {
    log(`GREŠKA: ${error.message}`);
    writeDiagnostics(userDataRoot, { status: 'NEUSPEŠNO', error: error.message });
    closeSplash();
    // Najčešći uzrok neuspeha pri PRVOM pokretanju je antivirus koji skenira sveže fajlove —
    // to je privremeno, zato dajemo "Pokušaj ponovo" umesto da odmah ugasimo program.
    const { response } = await dialog.showMessageBox({
      type: 'error',
      title: 'Muzički Spot Studio — greška pri pokretanju',
      message: 'Lokalni server nije uspeo da se pokrene.',
      detail: `${error.message}\n\nDijagnostika je sačuvana u:\n${path.join(userDataRoot, 'logs', 'DIJAGNOSTIKA-EXE.txt')}`,
      buttons: ['Pokušaj ponovo', 'Zatvori'],
      defaultId: 0,
      cancelId: 1
    });
    if (response === 0) {
      bootstrapRetryCount += 1;
      if (bootstrapRetryCount <= 3) return bootstrap();
    }
    app.quit();
  }
}

async function shutdownAndQuit() {
  if (quitting) return;
  quitting = true;
  try { await serverHandle?.stop?.(); } catch {}
  app.quit();
}

// Neuhvaćena greška u Electron main procesu ranije bi tiho ugasila ceo program bez traga.
// Sada se loguje (ako je log već spreman) i program se bezbedno gasi umesto da nestane bez objašnjenja.
process.on('uncaughtException', error => {
  logFn(`[main uncaughtException] ${error?.stack || error?.message || error}`);
  try { dialog.showErrorBox('Muzički Spot Studio — neočekivana greška', String(error?.message || error)); } catch {}
});
process.on('unhandledRejection', error => {
  logFn(`[main unhandledRejection] ${error?.stack || error?.message || error}`);
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      if (!url.startsWith('http://127.0.0.1:')) {
        event.preventDefault();
        if (isAllowedExternalUrl(url)) shell.openExternal(url);
      }
    });
  });

  ipcMain.handle('mss:get-diagnostics', () => ({
    version: APP_VERSION,
    electron: process.versions.electron,
    node: process.versions.node,
    packaged: app.isPackaged,
    serverUrl: serverHandle?.url || null,
    userDataRoot: getUserDataRoot()
  }));

  app.whenReady().then(bootstrap);

  app.on('window-all-closed', () => {
    shutdownAndQuit();
  });

  app.on('before-quit', () => { quitting = true; });
}
