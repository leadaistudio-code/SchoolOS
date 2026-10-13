const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('mcvTally', {
  getSnapshot: () => ipcRenderer.invoke('get-snapshot'),
  pair: (payload) => ipcRenderer.invoke('pair', payload),
  saveTallyEndpoint: (payload) => ipcRenderer.invoke('save-tally-endpoint', payload),
  testTally: () => ipcRenderer.invoke('test-tally'),
  syncNow: () => ipcRenderer.invoke('sync-now'),
  installService: () => ipcRenderer.invoke('install-service'),
  uninstallService: () => ipcRenderer.invoke('uninstall-service'),
  serviceStatus: () => ipcRenderer.invoke('service-status'),
  openLogs: () => ipcRenderer.invoke('open-logs'),
  getLogsTail: () => ipcRenderer.invoke('get-logs-tail'),
})
