const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const MD_RE = /\.(md|markdown|mdown|mkd|txt)$/i;
const state = new Map(); // webContents.id -> { dirty, force, initial: [{path, content}] }

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// ---- settings: %APPDATA%\PageSmithMD\settings.json (per user) ----
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
const MAX_RECENT = 12;
// session = the tabs open when the app last closed: [{ path, mode }], plus which one was active
const defaults = { theme: 'system', sidebarOpen: true, recent: [], reopenSession: true, session: [], sessionActive: null, mdShortcuts: true, autoSave: true, markExternal: true, checkUpdates: true, skipVersion: null };
let settings = { ...defaults };
try {
  settings = { ...defaults, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
  if (!Array.isArray(settings.recent)) settings.recent = [];
  if (!Array.isArray(settings.session)) settings.session = [];
  if (!['system', 'light', 'dark'].includes(settings.theme)) settings.theme = 'system';
} catch (_) { /* first run or unreadable file: use defaults */ }

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    const tmp = SETTINGS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf8');
    fs.renameSync(tmp, SETTINGS_FILE);
  } catch (e) {
    console.error('Cannot save settings:', e.message);
  }
}

const existingRecent = () => settings.recent.filter((p) => fs.existsSync(p));
function broadcast(channel, data) {
  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send(channel, data));
}
function addRecent(p) {
  const key = p.toLowerCase();
  settings.recent = [p, ...settings.recent.filter((r) => r.toLowerCase() !== key)].slice(0, MAX_RECENT);
  saveSettings();
  broadcast('recent', existingRecent());
}
function setTheme(t) {
  settings.theme = t;
  nativeTheme.themeSource = t; // drives prefers-color-scheme in every window
  saveSettings();
  buildMenu();
  broadcast('theme', t);
}

function filesFromArgv(argv) {
  return argv.slice(app.isPackaged ? 1 : 2).filter((a) => !a.startsWith('--') && MD_RE.test(a));
}

function readFile(p, { recent = true, quiet = false } = {}) {
  try {
    const f = { path: p, content: fs.readFileSync(p, 'utf8'), mtime: fs.statSync(p).mtimeMs };
    if (recent) addRecent(p);
    return f;
  } catch (e) {
    if (!quiet) dialog.showErrorBox('Cannot open file', `${p}\n\n${e.message}`);
    return null;
  }
}

// Files to show when a window opens: last session's tabs (if enabled) plus any files asked for.
// A file asked for on the command line becomes the active tab.
function initialFiles(filePaths, restore) {
  const files = [];
  const seen = new Set();
  const add = (f, mode) => {
    if (!f || seen.has(f.path.toLowerCase())) return;
    seen.add(f.path.toLowerCase());
    files.push(mode ? { ...f, mode } : f);
  };
  if (restore && settings.reopenSession) {
    for (const s of settings.session) {
      if (s && s.path && fs.existsSync(s.path)) add(readFile(s.path, { recent: false, quiet: true }), s.mode);
    }
  }
  const asked = filePaths.map((p) => readFile(p)).filter(Boolean);
  asked.forEach((f) => add(f));
  const activePath = asked.length ? asked[asked.length - 1].path : settings.sessionActive;
  return { files, activePath };
}

let sessionTimer = null;
function saveSessionSoon() {
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(saveSettings, 400);
}

function createWindow(filePaths = [], restore = false, recovered = []) {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 520,
    minHeight: 360,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0d1117' : '#ffffff',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      devTools: !app.isPackaged, // no developer tools in the installed app
      contextIsolation: true,
      sandbox: true,
    },
  });
  const id = win.webContents.id;
  state.set(id, { dirty: false, force: false, initial: { ...initialFiles(filePaths, restore), recovered } });
  win.setMenuBarVisibility(false); // the page draws a larger menu bar; shortcuts still go through the menu
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) {
      e.preventDefault();
      if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    }
  });

  // With unsaved tabs, the page walks through them and asks about each one
  win.on('close', (e) => {
    const st = state.get(id);
    if (!st || st.force || !st.dirty) return;
    e.preventDefault();
    win.webContents.send('cmd', 'close-request');
  });
  win.on('closed', () => state.delete(id));
  return win;
}

// Opens a file as a new tab in the given (or focused, or first) window
// ---- Help menu ----
const REPO_URL = 'https://github.com/Canute-FireFly/PageSmithMD';

// ---- updates (published GitHub releases) ----
// The installed app checks a few seconds after starting (if enabled) and from Help > Check for
// updates. It always asks before downloading. The portable zip can't update itself, so it just
// offers the download page. Nothing is checked when running from source.
let updater = null;
let updateReady = null; // version that has been downloaded and will install on exit
let checking = false;

const isInstalledCopy = () => fs.existsSync(path.join(path.dirname(process.execPath), 'Uninstall PageSmithMD.exe'));

function getUpdater() {
  if (updater || !app.isPackaged) return updater;
  updater = require('electron-updater').autoUpdater;
  updater.autoDownload = false;          // always ask first
  updater.autoInstallOnAppQuit = true;   // a downloaded update installs when PageSmithMD closes
  updater.logger = null;
  return updater;
}

// 1.2.10 > 1.2.9; a pre-release (1.3.0-beta) counts as older than its release
function newerVersion(a, b) {
  const parse = (v) => String(v || '').replace(/^v/, '').split('-');
  const [ma, pa] = parse(a), [mb, pb] = parse(b);
  const na = ma.split('.').map(Number), nb = mb.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((na[i] || 0) !== (nb[i] || 0)) return (na[i] || 0) > (nb[i] || 0); }
  return !pa && !!pb;
}

const plainNotes = (notes) => {
  const text = (Array.isArray(notes) ? notes.map((n) => n.note || '').join('\n') : String(notes || ''))
    .replace(/<\/(p|li|h\d)>/gi, '\n').replace(/<li>/gi, '• ').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n').trim();
  return text.length > 700 ? text.slice(0, 700).trimEnd() + '…' : text;
};

async function checkForUpdates(manual) {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const tell = (message, detail, type = 'info') => dialog.showMessageBox(win, { type, title: 'PageSmithMD', message, detail, buttons: ['OK'], noLink: true });
  if (!app.isPackaged) { if (manual) tell('Updates are checked in the installed app.', 'You are running PageSmithMD from source.'); return; }
  if (updateReady) { if (manual) askRestart(updateReady); return; }
  if (checking) return;
  checking = true;
  let result;
  try {
    result = await getUpdater().checkForUpdates();
  } catch (err) {
    if (manual) tell("Couldn't check for updates.", 'Check your internet connection and try again.\n\n' + err.message, 'warning');
    return;
  } finally {
    checking = false;
  }
  const info = result && result.updateInfo;
  const current = app.getVersion();
  if (!info || !newerVersion(info.version, current)) {
    if (manual) tell("You're up to date.", `PageSmithMD ${current} is the latest version.`);
    return;
  }
  if (!manual && settings.skipVersion === info.version) return;

  const installed = isInstalledCopy();
  const notes = plainNotes(info.releaseNotes);
  const buttons = installed ? ['Download and install', 'Later', 'Skip this version'] : ['Open download page', 'Later', 'Skip this version'];
  const r = await dialog.showMessageBox(win, {
    type: 'info',
    title: 'PageSmithMD update',
    message: `PageSmithMD ${info.version} is available.`,
    detail: `You have ${current}.` + (installed ? '' : ' This copy is the portable version, so download the new one and replace it.') +
      (notes ? '\n\nWhat\'s new:\n' + notes : ''),
    buttons,
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (r.response === 2) { settings.skipVersion = info.version; saveSettings(); return; }
  if (r.response !== 0) return;
  if (!installed) { shell.openExternal(REPO_URL + '/releases/latest'); return; }

  const u = getUpdater();
  const onProgress = (p) => BrowserWindow.getAllWindows().forEach((w) => w.setProgressBar(Math.max(0.02, p.percent / 100)));
  u.on('download-progress', onProgress);
  try {
    await u.downloadUpdate();
  } catch (err) {
    tell("The update couldn't be downloaded.", 'Please try again later, or download it from the GitHub page.\n\n' + err.message, 'warning');
    return;
  } finally {
    u.removeListener('download-progress', onProgress);
    BrowserWindow.getAllWindows().forEach((w) => w.setProgressBar(-1));
  }
  updateReady = info.version;
  buildMenu();
  askRestart(info.version);
}

async function askRestart(version) {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const r = await dialog.showMessageBox(win, {
    type: 'info',
    title: 'PageSmithMD update',
    message: `PageSmithMD ${version} is ready to install.`,
    detail: 'Restart now to install it, or carry on and it will install when you close PageSmithMD.\nYou\'ll be asked about any unsaved changes first.',
    buttons: ['Restart and install', 'Later'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  // closing goes through the normal "save changes?" questions; if that's cancelled, it installs on the next exit
  if (r.response === 0) getUpdater().quitAndInstall(true, true);
}

// The third-party licences open as a (read-only) tab; not added to recent files
function openLicences() {
  // next to the source when running from source; next to PageSmithMD.exe when installed
  const p = [path.join(__dirname, 'THIRD-PARTY-NOTICES.md'), path.join(path.dirname(process.execPath), 'THIRD-PARTY-NOTICES.md')]
    .find((f) => fs.existsSync(f));
  if (!p) { shell.openExternal(REPO_URL + '/blob/main/THIRD-PARTY-NOTICES.md'); return; }
  openPath(p, BrowserWindow.getFocusedWindow(), { recent: false });
}

async function showAbout() {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const v = process.versions;
  const r = await dialog.showMessageBox(win, {
    type: 'info',
    title: 'About PageSmithMD',
    message: `PageSmithMD ${app.getVersion()}`,
    detail: 'A simple, free Markdown viewer and editor for Windows.\n\n' +
      'Copyright © 2026 John Moore\nReleased under the MIT licence; open-source components are listed under Help > Licences.\n\n' +
      `Electron ${v.electron} · Chromium ${v.chrome} · Node ${v.node}\n` +
      `Settings folder: ${app.getPath('userData')}`,
    buttons: ['OK', 'GitHub page', 'Licences'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  if (r.response === 1) shell.openExternal(REPO_URL);
  if (r.response === 2) openLicences();
}

function openPath(p, fromWin, opts) {
  const f = readFile(p, opts);
  if (!f) return;
  const win = fromWin || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (!win) { createWindow([p]); return; }
  if (win.isMinimized()) win.restore();
  win.focus();
  win.webContents.send('open-file', f);
}

async function pickAndOpen(win) {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (!r.canceled) r.filePaths.forEach((p) => openPath(p, win));
}

function send(cmd) {
  const w = BrowserWindow.getFocusedWindow();
  if (w) w.webContents.send('cmd', cmd);
}

function buildMenu() {
  const template = [
    {
      label: '&File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => send('new-tab') },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => pickAndOpen(BrowserWindow.getFocusedWindow()) },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: 'Save as…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('save-as') },
        { type: 'separator' },
        { label: 'Export as PDF…', click: () => send('export-pdf') },
        { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: () => send('print') },
        { type: 'separator' },
        { label: 'Close tab', accelerator: 'CmdOrCtrl+W', click: () => send('close-tab') },
        { type: 'separator' },
        {
          label: 'Auto-save', type: 'checkbox', checked: settings.autoSave,
          click: (item) => {
            settings.autoSave = item.checked;
            saveSettings();
            BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('cmd', item.checked ? 'autosave-on' : 'autosave-off'));
          },
        },
        {
          label: 'Reopen last session on start', type: 'checkbox', checked: settings.reopenSession,
          click: (item) => { settings.reopenSession = item.checked; saveSettings(); },
        },
        { label: 'Exit', role: 'quit' },
      ],
    },
    {
      label: '&Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find…', accelerator: 'CmdOrCtrl+F', click: () => send('find') },
        { label: 'Replace…', accelerator: 'CmdOrCtrl+H', click: () => send('replace') },
        { type: 'separator' },
        {
          label: 'Markdown shortcuts while typing', type: 'checkbox', checked: settings.mdShortcuts,
          click: (item) => {
            settings.mdShortcuts = item.checked;
            saveSettings();
            BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('cmd', item.checked ? 'md-shortcuts-on' : 'md-shortcuts-off'));
          },
        },
      ],
    },
    {
      label: '&View',
      submenu: [
        { label: 'Read (read-only)', accelerator: 'CmdOrCtrl+1', click: () => send('mode-read') },
        { label: 'Edit', accelerator: 'CmdOrCtrl+2', click: () => send('mode-edit') },
        { label: 'Split (source + edit)', accelerator: 'CmdOrCtrl+3', click: () => send('mode-split') },
        { type: 'separator' },
        { label: 'Show/hide sidebar', accelerator: 'CmdOrCtrl+Shift+L', click: () => send('toggle-sidebar') },
        {
          label: 'Mark links to websites (↗)', type: 'checkbox', checked: settings.markExternal,
          click: (item) => {
            settings.markExternal = item.checked;
            saveSettings();
            BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('cmd', item.checked ? 'ext-marks-on' : 'ext-marks-off'));
          },
        },
        {
          label: 'Theme',
          submenu: [['system', 'Follow Windows'], ['light', 'Light'], ['dark', 'Dark']].map(([id, label]) => ({
            label, type: 'radio', checked: settings.theme === id, click: () => setTheme(id),
          })),
        },
        { type: 'separator' },
        { label: 'Next tab', accelerator: 'Ctrl+Tab', click: () => send('next-tab') },
        { label: 'Previous tab', accelerator: 'Ctrl+Shift+Tab', click: () => send('prev-tab') },
        { type: 'separator' },
        { role: 'zoomIn', accelerator: 'CmdOrCtrl+=' }, { role: 'zoomOut' }, { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        // developer tools only when running from source, not in the installed app
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
      ],
    },
    {
      label: '&Help',
      submenu: [
        { label: 'PageSmithMD on GitHub', click: () => shell.openExternal(REPO_URL) },
        { label: 'Report a problem…', click: () => shell.openExternal(REPO_URL + '/issues/new') },
        { type: 'separator' },
        { label: updateReady ? `Restart to install ${updateReady}` : 'Check for updates…', click: () => checkForUpdates(true) },
        {
          label: 'Check for updates automatically', type: 'checkbox', checked: settings.checkUpdates,
          click: (item) => { settings.checkUpdates = item.checked; saveSettings(); },
        },
        { type: 'separator' },
        { label: 'Licences', click: () => openLicences() },
        { type: 'separator' },
        { label: 'About PageSmithMD', click: () => showAbout() },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  broadcast('menu-changed', menuModel());
}

// ---- menu bar drawn by the page ----
// The native Windows menu bar can't be given a larger font, so it is hidden (its shortcuts still
// work) and the page draws its own from this description. Items are addressed by [menu, item, sub].
const ROLE_ACCEL = {
  undo: 'Ctrl+Z', redo: 'Ctrl+Y', cut: 'Ctrl+X', copy: 'Ctrl+C', paste: 'Ctrl+V', selectall: 'Ctrl+A',
  zoomout: 'Ctrl+-', resetzoom: 'Ctrl+0', togglefullscreen: 'F11', toggledevtools: 'Ctrl+Shift+I',
};
function describe(item) {
  if (item.type === 'separator') return { type: 'separator' };
  const role = (item.role || '').toLowerCase();
  let accel = item.accelerator || ROLE_ACCEL[role] || '';
  accel = String(accel).replace(/CmdOrCtrl|CommandOrControl/g, 'Ctrl').replace(/\+=$/, '+=');
  const d = { label: item.label.replace(/&/g, ''), accel, type: item.type, checked: !!item.checked, enabled: item.enabled !== false };
  if (item.submenu) d.submenu = item.submenu.items.map(describe);
  return d;
}
function menuModel() {
  const m = Menu.getApplicationMenu();
  if (!m) return [];
  return m.items.map((top) => ({
    label: top.label.replace(/&/g, ''),
    key: (/&(\w)/.exec(top.label) || [])[1]?.toLowerCase() || top.label[0].toLowerCase(),
    items: top.submenu.items.map(describe),
  }));
}
ipcMain.handle('menu-model', () => menuModel());
ipcMain.on('menu-click', (e, path) => {
  let items = Menu.getApplicationMenu()?.items || [];
  let item = null;
  for (const i of path) {
    item = items[i];
    if (!item) return;
    items = item.submenu ? item.submenu.items : [];
  }
  if (!item || item.type === 'separator' || item.submenu || item.enabled === false) return;
  const win = BrowserWindow.fromWebContents(e.sender);
  item.click(undefined, win, e.sender); // also runs roles (undo, copy, zoom…) and toggles checkboxes
  e.sender.send('menu-changed', menuModel());
});

// ---- IPC ----
const winOf = (e) => BrowserWindow.fromWebContents(e.sender);

ipcMain.handle('get-initial', (e) => state.get(e.sender.id)?.initial || { files: [], activePath: null });

// The page reports its saved tabs whenever they change; kept for the next start
ipcMain.on('set-session', (_e, { tabs, active }) => {
  if (!Array.isArray(tabs)) return;
  settings.session = tabs.filter((t) => t && typeof t.path === 'string').map((t) => ({ path: t.path, mode: t.mode }));
  settings.sessionActive = typeof active === 'string' ? active : null;
  saveSessionSoon();
});

ipcMain.on('set-dirty', (e, dirty) => {
  const st = state.get(e.sender.id);
  if (st) st.dirty = !!dirty;
});

ipcMain.handle('save', async (e, { content, saveAs, filePath }) => {
  let target = filePath;
  if (!target || saveAs) {
    const r = await dialog.showSaveDialog(winOf(e), {
      defaultPath: target || 'Untitled.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }, { name: 'All files', extensions: ['*'] }],
    });
    if (r.canceled) return null;
    target = r.filePath;
  }
  try {
    fs.writeFileSync(target, content, 'utf8');
  } catch (err) {
    dialog.showErrorBox('Cannot save file', `${target}\n\n${err.message}`);
    return null;
  }
  addRecent(target);
  return { path: target, mtime: mtimeOf(target) };
});

const mtimeOf = (p) => { try { return fs.statSync(p).mtimeMs; } catch (_) { return null; } };

// Auto-save: writes only if the file on disk is still the one we loaded / last saved.
// If another program changed (or removed) it, nothing is written and the page is told.
ipcMain.handle('autosave', (_e, { filePath, content, mtime }) => {
  try {
    const now = mtimeOf(filePath);
    if (now == null || mtime == null || Math.abs(now - mtime) > 1) return { conflict: true };
    fs.writeFileSync(filePath, content, 'utf8');
    return { ok: true, mtime: mtimeOf(filePath) };
  } catch (err) {
    return { error: err.message };
  }
});

// ---- recovery copies of unsaved documents: %APPDATA%\PageSmithMD\recovery ----
// Written by the page a moment after each change, removed once saved or on a normal exit.
// Anything still there at the next start means the app didn't close normally.
const RECOVERY_DIR = path.join(app.getPath('userData'), 'recovery');
const keyOk = (k) => typeof k === 'string' && /^[\w-]{1,80}$/.test(k);
ipcMain.on('recovery-write', (_e, { key, data }) => {
  if (!keyOk(key)) return;
  try {
    fs.mkdirSync(RECOVERY_DIR, { recursive: true });
    const f = path.join(RECOVERY_DIR, key + '.json');
    fs.writeFileSync(f + '.tmp', JSON.stringify({ ...data, time: Date.now() }), 'utf8');
    fs.renameSync(f + '.tmp', f);
  } catch (err) { console.error('recovery write failed:', err.message); }
});
ipcMain.on('recovery-clear', (_e, key) => {
  if (!keyOk(key)) return;
  try { fs.unlinkSync(path.join(RECOVERY_DIR, key + '.json')); } catch (_) { /* already gone */ }
});
function clearRecovery() {
  try { for (const f of fs.readdirSync(RECOVERY_DIR)) fs.unlinkSync(path.join(RECOVERY_DIR, f)); } catch (_) { /* none */ }
}
// Read what was left behind, ask whether to restore it, and remove the files either way
function takeRecovery() {
  let items = [];
  try {
    items = fs.readdirSync(RECOVERY_DIR).filter((f) => f.endsWith('.json')).map((f) => {
      try { return JSON.parse(fs.readFileSync(path.join(RECOVERY_DIR, f), 'utf8')); } catch (_) { return null; }
    }).filter((d) => d && typeof d.text === 'string');
  } catch (_) { return []; }
  clearRecovery();
  if (!items.length) return [];
  items.sort((a, b) => (a.time || 0) - (b.time || 0));
  const names = items.map((d) => '  • ' + (d.path ? path.basename(d.path) : 'Untitled') +
    (d.time ? '  (' + new Date(d.time).toLocaleString() + ')' : '')).join('\n');
  const choice = dialog.showMessageBoxSync({
    type: 'question',
    buttons: ['Restore', 'Discard'],
    defaultId: 0,
    cancelId: 1,
    title: 'PageSmithMD',
    message: `PageSmithMD didn't close normally. Unsaved changes were kept for ${items.length} document${items.length > 1 ? 's' : ''}.`,
    detail: names + '\n\nRestore opens them with the unsaved changes, ready to save.',
  });
  if (choice !== 0) return [];
  // For a named file, also pass what is on disk now, so the tab shows as changed
  return items.map((d) => {
    const out = { path: d.path || null, text: d.text, eol: d.eol, bom: d.bom, mode: d.mode };
    if (d.path) {
      try { out.disk = fs.readFileSync(d.path, 'utf8'); out.mtime = mtimeOf(d.path); } catch (_) { out.disk = null; }
    }
    return out;
  });
}

ipcMain.handle('get-settings', () => ({ theme: settings.theme, sidebarOpen: settings.sidebarOpen, recent: existingRecent(), mdShortcuts: settings.mdShortcuts, autoSave: settings.autoSave, markExternal: settings.markExternal }));
ipcMain.on('set-theme', (_e, t) => { if (['system', 'light', 'dark'].includes(t)) setTheme(t); });
ipcMain.on('set-sidebar', (_e, open) => { settings.sidebarOpen = !!open; saveSettings(); });
ipcMain.on('remove-recent', (_e, p) => {
  settings.recent = settings.recent.filter((r) => r !== p);
  saveSettings();
  broadcast('recent', existingRecent());
});

ipcMain.handle('confirm-save', (e, name) => {
  const choice = dialog.showMessageBoxSync(winOf(e), {
    type: 'warning',
    buttons: ['Save', "Don't save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    message: `Save changes to ${name}?`,
    detail: 'Your changes will be lost if you do not save them.',
  });
  return ['save', 'discard', 'cancel'][choice];
});

// A document changed by another program: read it again, and ask whether to reload it
ipcMain.handle('read-doc', (_e, p) => {
  try { return { content: fs.readFileSync(String(p), 'utf8'), mtime: mtimeOf(String(p)) }; } catch (_) { return null; }
});
ipcMain.handle('ask-reload', async (e, { name, dirty }) => {
  const r = await dialog.showMessageBox(winOf(e), {
    type: dirty ? 'warning' : 'question',
    title: 'PageSmithMD',
    message: `${name} was changed by another program.`,
    detail: (dirty
      ? 'You also have changes here that are not saved. Reloading replaces them with the version on disk.'
      : 'Reload it to see the new version.') +
      '\n\nIf you keep this version, auto-save stops for this file until you press Ctrl+S, ' +
      "which saves over the other program's changes.",
    buttons: dirty ? ['Reload and lose my changes', 'Keep my version'] : ['Reload', 'Keep this version'],
    defaultId: dirty ? 1 : 0,
    cancelId: 1,
    noLink: true,
  });
  return r.response === 0;
});

ipcMain.handle('open-dialog', (e) => pickAndOpen(winOf(e)));
ipcMain.on('open-path', (e, p) => openPath(p, winOf(e)));
ipcMain.on('close-now', (e) => {
  const st = state.get(e.sender.id);
  if (st) st.force = true;
  winOf(e)?.close();
});

// Links in documents. Documents can come from anyone, so a link must never start a program:
// - web and mail links open in the browser / mail app;
// - Markdown (and .txt) files open in a tab;
// - pictures, PDFs, office documents, audio and video open in their usual program after the user
//   confirms; folders open in Explorer after confirming;
// - anything else (programs, scripts, shortcuts, installers, web pages...) is refused.
const SAFE_TO_OPEN = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tif', 'tiff', 'heic',
  'pdf', 'rtf', 'csv', 'tsv', 'log', 'json', 'xml', 'yaml', 'yml',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'vsdx', 'pub', 'one',
  'mp3', 'wav', 'm4a', 'flac', 'ogg', 'aac', 'wma', 'mp4', 'm4v', 'mov', 'avi', 'mkv', 'webm', 'wmv',
  'zip', '7z', 'rar',
]);
ipcMain.on('open-link', async (e, { href, base }) => {
  if (/^(https?|mailto):/i.test(href)) return shell.openExternal(href);
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^[a-z]:[\\/]/i.test(href)) return; // other schemes (file:, ms-..., etc.)
  const dir = base ? path.dirname(base) : process.cwd();
  let clean;
  try { clean = decodeURIComponent(href.split('#')[0].split('?')[0]); } catch (_) { return; }
  if (!clean) return;
  const target = path.resolve(dir, clean);
  let st;
  try { st = fs.statSync(target); } catch (_) { return; }
  const win = winOf(e);
  if (st.isFile() && MD_RE.test(target)) return openPath(target, win);

  const name = path.basename(target);
  const ext = path.extname(target).slice(1).toLowerCase();
  if (st.isFile() && !SAFE_TO_OPEN.has(ext)) {
    dialog.showMessageBox(win, {
      type: 'warning',
      title: 'PageSmithMD',
      message: `PageSmithMD won't open “${name}” from a link.`,
      detail: 'For your safety, links in documents can only open Markdown files, pictures, PDFs, ' +
        'office documents, audio and video. Programs, scripts and other kinds of file are never ' +
        'started from a link.\n\nIf you trust this file, open it yourself from File Explorer.\n\n' + target,
      buttons: ['OK', 'Show in folder'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    }).then((r) => { if (r.response === 1) shell.showItemInFolder(target); });
    return;
  }
  const r = await dialog.showMessageBox(win, {
    type: 'question',
    title: 'PageSmithMD',
    message: st.isDirectory() ? `Open the folder “${name}”?` : `Open “${name}”?`,
    detail: (st.isDirectory() ? 'It will open in File Explorer.' : `It will open in the program Windows uses for .${ext} files.`) + '\n\n' + target,
    buttons: ['Open', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (r.response === 0) shell.openPath(target);
});

ipcMain.handle('export-pdf', async (e, filePath) => {
  const def = (filePath ? filePath.replace(/\.[^.]+$/, '') : 'Untitled') + '.pdf';
  const r = await dialog.showSaveDialog(winOf(e), { defaultPath: def, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled) return false;
  const data = await e.sender.printToPDF({ printBackground: true, pageSize: 'A4' });
  fs.writeFileSync(r.filePath, data);
  return true;
});

// Resolves when printing is done or cancelled (the page redraws diagrams in the light theme for it)
ipcMain.handle('print', (e) => new Promise((resolve) => e.sender.print({ printBackground: true }, () => resolve())));

// A small native menu at the mouse (right-click a diagram / draw.io picture). Resolves with the id clicked, or null.
ipcMain.handle('context-menu', (e, items) => new Promise((resolve) => {
  let done = false;
  const menu = Menu.buildFromTemplate((items || []).map((it) => (it.type === 'separator' ? { type: 'separator' } : {
    label: String(it.label), enabled: it.enabled !== false, click: () => { done = true; resolve(it.id); },
  })));
  menu.popup({ window: winOf(e), callback: () => setTimeout(() => { if (!done) resolve(null); }, 50) });
}));

// Right-click a diagram > Save as SVG / PNG
ipcMain.handle('save-diagram', async (e, { docPath, data, ext }) => {
  if (!['svg', 'png'].includes(ext)) return null;
  const dir = docPath && path.isAbsolute(docPath) ? path.dirname(docPath) : app.getPath('documents');
  const r = await dialog.showSaveDialog(winOf(e), {
    defaultPath: path.join(dir, 'diagram.' + ext),
    filters: [ext === 'svg' ? { name: 'SVG picture', extensions: ['svg'] } : { name: 'PNG picture', extensions: ['png'] }],
  });
  if (r.canceled || !r.filePath) return null;
  try { fs.writeFileSync(r.filePath, Buffer.from(data)); return r.filePath; } catch (err) {
    dialog.showErrorBox('Cannot save the picture', err.message);
    return null;
  }
});

// When pictures on the page last changed on disk (so ones edited in another program are reloaded)
ipcMain.handle('file-times', (_e, paths) => (Array.isArray(paths) ? paths.slice(0, 500) : []).map((p) => {
  try { return fs.statSync(String(p)).mtimeMs; } catch (_) { return null; }
}));

// ---- draw.io ----
// Drawings saved by draw.io as .drawio.svg / .drawio.png are ordinary pictures with the drawing kept
// inside. If the draw.io desktop app is installed, PageSmithMD can open one in it to edit.
const DRAWIO_URL = 'https://github.com/jgraph/drawio-desktop/releases/latest';
function findDrawio() {
  const env = process.env;
  const places = [
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'draw.io', 'draw.io.exe'),
    env.ProgramFiles && path.join(env.ProgramFiles, 'draw.io', 'draw.io.exe'),
    env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'draw.io', 'draw.io.exe'),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'draw.io.exe'), // Microsoft Store
  ].filter(Boolean);
  return places.find((p) => { try { return fs.statSync(p).isFile(); } catch (_) { return false; } }) || null;
}
// A draw.io picture: named .drawio.svg / .drawio.png, or any .svg / .png that has the drawing
// kept inside (draw.io's "Save as" with a plain .svg name still keeps it)
function isDrawioFile(file) {
  try {
    if (!/\.(svg|png)$/i.test(file) || !fs.statSync(file).isFile()) return false;
    if (/\.drawio\.(svg|png)$/i.test(file)) return true;
    if (/\.svg$/i.test(file)) {
      const fd = fs.openSync(file, 'r');
      const buf = Buffer.alloc(65536);
      const n = fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);
      return /content="&lt;mxfile|<mxfile/.test(buf.toString('utf8', 0, n));
    }
    return fs.statSync(file).size < 50e6 && fs.readFileSync(file).includes('mxfile');
  } catch (_) { return false; }
}
ipcMain.handle('is-drawio', (_e, files) => (Array.isArray(files) ? files : []).map((f) => isDrawioFile(path.resolve(String(f || '')))));
// Pick a picture for the Image dialog (starts in the document's folder)
ipcMain.handle('pick-image', async (e, docPath) => {
  const r = await dialog.showOpenDialog(winOf(e), {
    title: 'Choose a picture',
    defaultPath: docPath && path.isAbsolute(docPath) ? path.dirname(docPath) : app.getPath('pictures'),
    properties: ['openFile'],
    filters: [
      { name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  return r.canceled ? null : r.filePaths[0] || null;
});
// Pick a drawing to put in the document
ipcMain.handle('pick-drawio', async (e) => {
  const r = await dialog.showOpenDialog(winOf(e), {
    title: 'Insert a draw.io drawing',
    properties: ['openFile'],
    filters: [{ name: 'draw.io drawings (SVG or PNG)', extensions: ['svg', 'png'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const f = r.filePaths[0];
  if (isDrawioFile(f)) return f;
  const m = await dialog.showMessageBox(winOf(e), {
    type: 'question',
    title: 'PageSmithMD',
    message: 'This picture has no draw.io drawing inside it.',
    detail: 'It can be put in the document as an ordinary picture, but it cannot be edited in draw.io.' + '\n\n' + f,
    buttons: ['Insert as a picture', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  return m.response === 0 ? f : null;
});
// Opens a drawing in draw.io; true if draw.io was started
ipcMain.handle('edit-drawio', async (e, file) => {
  const win = winOf(e);
  const target = path.resolve(String(file || ''));
  if (!isDrawioFile(target)) return false;
  const exe = findDrawio();
  if (exe) {
    try {
      require('child_process').spawn(exe, [target], { detached: true, stdio: 'ignore' }).unref();
      return true;
    } catch (_) { /* fall through to the message */ }
  }
  const r = await dialog.showMessageBox(win, {
    type: 'info',
    title: 'PageSmithMD',
    message: 'The draw.io app is needed to edit this drawing.',
    detail: 'draw.io is a free diagram app. Once it is installed, right-click the picture and choose ' +
      '"Edit in draw.io" again (or double-click it). Save in draw.io with Ctrl+S and the picture here updates.\n\n' + target,
    buttons: ['Get draw.io', 'Show in folder', 'Close'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  if (r.response === 0) shell.openExternal(DRAWIO_URL);
  else if (r.response === 1) shell.showItemInFolder(target);
  return false;
});
// An empty drawing in the document's images folder; returns its path for the Markdown
const EMPTY_DRAWIO = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" ' +
  'width="241px" height="61px" viewBox="-0.5 -0.5 241 61" content="' +
  '&lt;mxfile&gt;&lt;diagram id=&quot;page1&quot; name=&quot;Page-1&quot;&gt;&lt;mxGraphModel&gt;&lt;root&gt;' +
  '&lt;mxCell id=&quot;0&quot;/&gt;&lt;mxCell id=&quot;1&quot; parent=&quot;0&quot;/&gt;&lt;/root&gt;&lt;/mxGraphModel&gt;&lt;/diagram&gt;&lt;/mxfile&gt;">' +
  '<defs/><g><rect x="0" y="0" width="240" height="60" rx="6" fill="#ffffff" stroke="#999999" stroke-dasharray="4 3"/>' +
  '<text x="120" y="35" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="13" fill="#666666">New draw.io drawing</text></g></svg>\n';
ipcMain.handle('new-drawio', (_e, docPath) => {
  try {
    if (!docPath || !path.isAbsolute(docPath)) return null;
    const dir = path.join(path.dirname(docPath), 'images');
    fs.mkdirSync(dir, { recursive: true });
    let name = 'drawing.drawio.svg';
    for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = `drawing-${i}.drawio.svg`;
    fs.writeFileSync(path.join(dir, name), EMPTY_DRAWIO);
    return 'images/' + name;
  } catch (err) {
    dialog.showErrorBox('Cannot make the drawing', err.message);
    return null;
  }
});

// Pasted or dropped images are stored in an "images" folder next to the document.
// Returns the path to use in the Markdown (relative, forward slashes), or null.
const IMG_EXT = /^(png|jpe?g|gif|webp|bmp|svg)$/i;
ipcMain.handle('save-image', async (_e, { docPath, data, ext, srcPath }) => {
  try {
    if (!docPath || !path.isAbsolute(docPath)) return null;
    const dir = path.join(path.dirname(docPath), 'images');
    let base, extension;
    if (srcPath) {
      extension = path.extname(srcPath).slice(1);
      base = path.basename(srcPath, path.extname(srcPath)).replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
    } else {
      extension = ext;
      const d = new Date();
      const p2 = (n) => String(n).padStart(2, '0');
      base = `pasted-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
    }
    if (!IMG_EXT.test(extension || '')) return null;
    extension = extension.toLowerCase().replace('jpeg', 'jpg');
    // An image dropped from the images folder itself is just linked, not copied again
    if (srcPath && path.resolve(path.dirname(srcPath)).toLowerCase() === path.resolve(dir).toLowerCase()) {
      return 'images/' + path.basename(srcPath);
    }
    fs.mkdirSync(dir, { recursive: true });
    let name = `${base}.${extension}`;
    for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = `${base}-${i}.${extension}`;
    if (srcPath) fs.copyFileSync(srcPath, path.join(dir, name));
    else fs.writeFileSync(path.join(dir, name), Buffer.from(data));
    return 'images/' + name;
  } catch (err) {
    dialog.showErrorBox('Cannot save image', err.message);
    return null;
  }
});

// ---- lifecycle ----
app.on('second-instance', (_e, argv) => {
  const files = filesFromArgv(argv);
  const w = BrowserWindow.getAllWindows()[0];
  if (!w) { createWindow(files, true); return; }
  if (files.length) files.forEach((f) => openPath(f, w));
  else { if (w.isMinimized()) w.restore(); w.focus(); }
});

app.whenReady().then(() => {
  nativeTheme.themeSource = settings.theme;
  buildMenu();
  createWindow(filesFromArgv(process.argv), true, takeRecovery());
  // a quiet update check once PageSmithMD has settled (installed app only; offline is fine)
  if (settings.checkUpdates && app.isPackaged) setTimeout(() => checkForUpdates(false), 8000);
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow([], true); });
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { if (sessionTimer) { clearTimeout(sessionTimer); saveSettings(); } });
// A normal exit: you've already saved or chosen "Don't save", so the recovery copies aren't needed
app.on('will-quit', clearRecovery);
