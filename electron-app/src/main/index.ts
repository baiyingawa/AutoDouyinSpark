import { app, BrowserWindow } from 'electron';
import path from 'path';
import { registerIpcHandlers } from './ipc';
import { getDefaultScheduler } from './scheduler';
import { createTray, destroyTray } from './tray';

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
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hidden',
    backgroundColor: '#1a1a2e',
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    // 生产模式：dist/renderer/index.html
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // 拦截关闭事件：最小化到托盘而不是退出
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

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
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
