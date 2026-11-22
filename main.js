const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const MD_RE = /\.(md|markdown|mdown|mkd|txt)$/i;
const state = new Map(); // webContents.id -> { dirty, force, initial: [{path, content}] }

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// ---- settings: %APPDATA%PageSmithMDsettings.json (per user) ----
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
const MAX_RECENT = 12;
const defaults = { theme: 'system', sidebarOpen: true, recent: [] };
let settings = { ...defaults };
try {
  settings = { ...defaults, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
  if (!Array.isArray(settings.recent)) settings.recent = [];
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

function readFile(p) {
  try {
    const f = { path: p, content: fs.readFileSync(p, 'utf8') };
    addRecent(p);
    return f;
  } catch (e) {
    dialog.showErrorBox('Cannot open file', `${p}\n\n${e.message}`);
    return null;
  }
}

function createWindow(filePaths = []) {
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
      contextIsolation: true,
      sandbox: true,
    },
  });
  const id = win.webContents.id;
  state.set(id, { dirty: false, force: false, initial: filePaths.map(readFile).filter(Boolean) });
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
function openPath(p, fromWin) {
  const f = readFile(p);
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
        { label: 'Exit', role: 'quit' },
      ],
    },
    {
      label: '&Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
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
        { role: 'toggleDevTools' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---- IPC ----
const winOf = (e) => BrowserWindow.fromWebContents(e.sender);

ipcMain.handle('get-initial', (e) => state.get(e.sender.id)?.initial || []);

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
  return target;
});

ipcMain.handle('get-settings', () => ({ theme: settings.theme, sidebarOpen: settings.sidebarOpen, recent: existingRecent() }));
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

ipcMain.handle('open-dialog', (e) => pickAndOpen(winOf(e)));
ipcMain.on('open-path', (e, p) => openPath(p, winOf(e)));
ipcMain.on('close-now', (e) => {
  const st = state.get(e.sender.id);
  if (st) st.force = true;
  winOf(e)?.close();
});

ipcMain.on('open-link', (e, { href, base }) => {
  if (/^(https?|mailto):/i.test(href)) return shell.openExternal(href);
  const dir = base ? path.dirname(base) : process.cwd();
  const clean = decodeURIComponent(href.split('#')[0].split('?')[0]);
  const target = path.resolve(dir, clean);
  if (!fs.existsSync(target)) return;
  if (MD_RE.test(target)) openPath(target, winOf(e));
  else shell.openPath(target);
});

ipcMain.handle('export-pdf', async (e, filePath) => {
  const def = (filePath ? filePath.replace(/\.[^.]+$/, '') : 'Untitled') + '.pdf';
  const r = await dialog.showSaveDialog(winOf(e), { defaultPath: def, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled) return false;
  const data = await e.sender.printToPDF({ printBackground: true, pageSize: 'A4' });
  fs.writeFileSync(r.filePath, data);
  return true;
});

ipcMain.on('print', (e) => e.sender.print({ printBackground: true }));

// ---- lifecycle ----
app.on('second-instance', (_e, argv) => {
  const files = filesFromArgv(argv);
  const w = BrowserWindow.getAllWindows()[0];
  if (!w) { createWindow(files); return; }
  if (files.length) files.forEach((f) => openPath(f, w));
  else { if (w.isMinimized()) w.restore(); w.focus(); }
});

app.whenReady().then(() => {
  nativeTheme.themeSource = settings.theme;
  buildMenu();
  createWindow(filesFromArgv(process.argv));
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on('window-all-closed', () => app.quit());
