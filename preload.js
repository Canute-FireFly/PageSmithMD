const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getInitial: () => ipcRenderer.invoke('get-initial'),
  setDirty: (d) => ipcRenderer.send('set-dirty', d),
  save: (content, saveAs, filePath) => ipcRenderer.invoke('save', { content, saveAs, filePath }),
  confirmSave: (name) => ipcRenderer.invoke('confirm-save', name),
  openDialog: () => ipcRenderer.invoke('open-dialog'),
  openPath: (p) => ipcRenderer.send('open-path', p),
  openLink: (href, base) => ipcRenderer.send('open-link', { href, base }),
  closeNow: () => ipcRenderer.send('close-now'),
  exportPdf: (filePath) => ipcRenderer.invoke('export-pdf', filePath),
  print: () => ipcRenderer.send('print'),
  pathForFile: (f) => webUtils.getPathForFile(f),
  onCommand: (fn) => ipcRenderer.on('cmd', (_e, c) => fn(c)),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setTheme: (t) => ipcRenderer.send('set-theme', t),
  setSidebar: (open) => ipcRenderer.send('set-sidebar', open),
  removeRecent: (p) => ipcRenderer.send('remove-recent', p),
  onRecent: (fn) => ipcRenderer.on('recent', (_e, list) => fn(list)),
  onTheme: (fn) => ipcRenderer.on('theme', (_e, t) => fn(t)),
  onOpenFile: (fn) => ipcRenderer.on('open-file', (_e, f) => fn(f)),
});
