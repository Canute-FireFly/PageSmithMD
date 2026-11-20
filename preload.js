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
  onOpenFile: (fn) => ipcRenderer.on('open-file', (_e, f) => fn(f)),
});
