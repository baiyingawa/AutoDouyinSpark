import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { registerIpcHandlers } from './ipc';
import { getDefaultScheduler } from './scheduler';
import { createTray, destroyTray } from './tray';
import { IPC_CHANNELS } from '../shared/ipc-channels';

let mainWindow: BrowserWindow | null = null;

// isQuitting 标记用于拦截关闭事件
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    center: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#1a1a2e',
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // 拦截关闭事件：由前端控制
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 创建系统托盘
  createTray(mainWindow);

  // 注册调度器通知
  const scheduler = getDefaultScheduler();
  scheduler.start();
  scheduler.registerWindow(mainWindow);
}

// 窗口控制 IPC
function registerWindowControlHandlers() {
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
    return { success: true };
  });

  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
    return { success: true, maximized: mainWindow?.isMaximized() ?? false };
  });

  ipcMain.handle('window:close-dialog', async () => {
    const result = await dialog.showMessageBox(mainWindow!, {
      type: 'question',
      buttons: ['最小化到托盘', '退出程序', '取消'],
      defaultId: 0,
      cancelId: 2,
      title: '关闭 AutoDouyinSpark',
      message: '退出程序不会影响自动续火花任务（每小时自动执行）',
    });
    if (result.response === 0) {
      mainWindow?.hide();
      return { action: 'tray' };
    } else if (result.response === 1) {
      isQuitting = true;
      const scheduler = getDefaultScheduler();
      scheduler.stop();
      destroyTray();
      app.quit();
      return { action: 'quit' };
    }
    return { action: 'cancel' };
  });

  ipcMain.handle('window:is-maximized', () => {
    return { maximized: mainWindow?.isMaximized() ?? false };
  });

  // 窗口状态变化通知前端
  mainWindow?.on('maximize', () => {
    mainWindow?.webContents.send('window:state-changed', { maximized: true });
  });
  mainWindow?.on('unmaximize', () => {
    mainWindow?.webContents.send('window:state-changed', { maximized: false });
  });
}

app.whenReady().then(() => {
  registerWindowControlHandlers();
  registerIpcHandlers();
  createWindow();

  // 开机自启时最小化到托盘，不显示窗口
  if (app.getLoginItemSettings().wasOpenedAtLogin) {
    mainWindow?.hide();
  }
});

app.on('window-all-closed', () => {
  if (isQuitting && process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  const scheduler = getDefaultScheduler();
  scheduler.stop();
  destroyTray();
});
