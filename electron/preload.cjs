const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  retryConnection: () => ipcRenderer.send('retry-connect'),
  onLoadingError: (callback) => {
    ipcRenderer.on('loading-error', (_event, msg) => callback(msg));
  },
});
