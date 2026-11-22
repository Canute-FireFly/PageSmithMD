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
const defaults = { theme: 'system', sidebarOpen: true, recent: [], reopenSession: true, session: [], sessionActive: null };
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
    const f = { path: p, content: fs.readFileSync(p, 'utf8') };
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

function createWindow(filePaths = [], restore = false) {
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
  state.set(id, { dirty: false, force: false, initial: initialFiles(filePaths, restore) });
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
        { type: 'separator' },
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
  createWindow(filesFromArgv(process.argv), true);
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow([], true); });
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { if (sessionTimer) { clearTimeout(sessionTimer); saveSettings(); } });
