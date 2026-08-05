import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('ledger', {
  call: (method: string, params?: Record<string, unknown>) =>
    ipcRenderer.invoke('ledger:call', method, params),

  healthCheck: () => ipcRenderer.invoke('ledger:call', 'health.check', {}),

  createCompany: (path: string, name: string) =>
    ipcRenderer.invoke('ledger:call', 'company.create', { path, name }),

  openCompany: (path: string) =>
    ipcRenderer.invoke('ledger:call', 'company.open', { path }),

  getCompanyInfo: () =>
    ipcRenderer.invoke('ledger:call', 'company.info', {}),

  backup: (destPath: string) =>
    ipcRenderer.invoke('ledger:call', 'company.backup', { destPath }),

  restore: (sourcePath: string) =>
    ipcRenderer.invoke('ledger:call', 'company.restore', { sourcePath }),

  getRecentCompanies: () =>
    ipcRenderer.invoke('ledger:call', 'company.recent', {}),
});

contextBridge.exposeInMainWorld('dialog', {
  openFile: (filters?: Electron.FileFilter[]) =>
    ipcRenderer.invoke('dialog:openFile', filters),

  saveFile: (defaultPath?: string, filters?: Electron.FileFilter[]) =>
    ipcRenderer.invoke('dialog:saveFile', defaultPath, filters),

  openCsv: () => ipcRenderer.invoke('dialog:openCsv'),

  openImage: () => ipcRenderer.invoke('dialog:openImage'),
});

contextBridge.exposeInMainWorld('fs', {
  readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
});

contextBridge.exposeInMainWorld('app', {
  checkUpdates: () => ipcRenderer.invoke('app:checkUpdates'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  openPath: (path: string) => ipcRenderer.invoke('shell:openPath', path),
  getLocalFileUrl: (path: string) => ipcRenderer.invoke('app:getLocalFileUrl', path),
});
