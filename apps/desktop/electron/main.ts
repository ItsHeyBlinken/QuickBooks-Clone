import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } from 'electron';
import path from 'path';
import { LedgerClient } from './ledger-client';

let mainWindow: BrowserWindow | null = null;
let ledgerClient: LedgerClient | null = null;

const isDev = !app.isPackaged;

function getLedgerPath(): string {
  if (isDev) {
    return path.join(__dirname, '../../../services/ledger/main.py');
  }
  return path.join(process.resourcesPath, 'ledger', 'main.py');
}

async function initLedger(): Promise<LedgerClient> {
  const client = new LedgerClient(getLedgerPath(), isDev);
  await client.start();
  return client;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'LedgerLocal',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupIpc(): void {
  ipcMain.handle('ledger:call', async (_event, method: string, params: Record<string, unknown>) => {
    if (!ledgerClient) {
      return { __ledgerError: 'Ledger service not started' };
    }
    try {
      return await ledgerClient.call(method, params);
    } catch (error) {
      return {
        __ledgerError: error instanceof Error ? error.message : 'Ledger request failed',
      };
    }
  });

  ipcMain.handle('dialog:openFile', async (_event, filters?: Electron.FileFilter[]) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: filters || [{ name: 'Company Files', extensions: ['ledger'] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:saveFile', async (_event, defaultPath?: string, filters?: Electron.FileFilter[]) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath,
      filters: filters || [{ name: 'Company Files', extensions: ['ledger'] }],
    });
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle('dialog:openCsv', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [
        { name: 'Financial Files', extensions: ['csv', 'ofx', 'qfx', 'qif'] },
      ],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:openImage', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
      ],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('app:checkUpdates', async () => {
    if (isDev) return { available: false };
    try {
      const { autoUpdater } = await import('electron-updater');
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = false;
      const result = await autoUpdater.checkForUpdates();
      return { available: !!result?.updateInfo, version: result?.updateInfo?.version };
    } catch {
      return { available: false };
    }
  });

  ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
    const fs = await import('fs');
    return fs.readFileSync(filePath, 'utf-8');
  });

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    await shell.openExternal(url);
  });

  ipcMain.handle('shell:openPath', async (_event, filePath: string) => {
    return shell.openPath(filePath);
  });

  ipcMain.handle('app:getLocalFileUrl', async (_event, filePath: string) => {
    const image = nativeImage.createFromPath(filePath);
    if (!image.isEmpty()) {
      return image.toDataURL();
    }
    const fs = await import('fs');
    const ext = path.extname(filePath).slice(1).toLowerCase() || 'png';
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    const data = fs.readFileSync(filePath);
    return `data:image/${mime};base64,${data.toString('base64')}`;
  });
}

app.whenReady().then(async () => {
  ledgerClient = await initLedger();
  setupIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  ledgerClient?.stop();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  ledgerClient?.stop();
});
