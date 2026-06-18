import path from 'path';
import { ipcMain, app } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { PythonManager } from '../python-manager';
import { encrypt, decrypt } from '../crypto-utils';
import { LogManager } from '../log-manager';
import { registerAuthHandlers } from './auth.ipc';
import { registerFriendsHandlers } from './friends.ipc';
import { registerSparkHandlers } from './spark.ipc';
import { registerHistoryHandlers } from './history.ipc';
import { registerSettingsHandlers } from './settings.ipc';

const pythonManager = new PythonManager();
const logManager = new LogManager();

export function registerIpcHandlers(): void {
  // 用正确的日志路径初始化 LogManager
  logManager.init(path.join(app.getPath('userData'), 'data', '.spark_log'));

  // Python 子进程管理
  ipcMain.handle(IPC_CHANNELS.PYTHON_EXEC, async (_event, scriptPath: string, args: string[]) => {
    return pythonManager.exec(scriptPath, args);
  });

  ipcMain.handle(IPC_CHANNELS.PYTHON_KILL, async () => {
    pythonManager.kill();
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.PYTHON_STATUS, async () => {
    return { running: pythonManager.isRunning() };
  });

  // Cookie 管理
  ipcMain.handle(IPC_CHANNELS.COOKIE_ENCRYPT, async (_event, text: string, secret: string) => {
    try {
      const encrypted = encrypt(text, secret);
      return { success: true, data: encrypted };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.COOKIE_DECRYPT, async (_event, encryptedText: string, secret: string) => {
    try {
      const decrypted = decrypt(encryptedText, secret);
      return { success: true, data: decrypted };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.COOKIE_SAVE, async () => {
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.COOKIE_LOAD, async () => {
    return { success: true, data: null };
  });

  // 发送相关 (mock)
  ipcMain.handle(IPC_CHANNELS.SEND_VIDEO, async () => {
    return { success: true, taskId: null };
  });

  ipcMain.handle(IPC_CHANNELS.SEND_STATUS, async () => {
    return { success: true, status: 'idle' };
  });

  ipcMain.handle(IPC_CHANNELS.SEND_HISTORY, async () => {
    return { success: true, data: [] };
  });

  // 日志
  ipcMain.handle(IPC_CHANNELS.LOG_GET, async (_event, lineCount?: number) => {
    const logs = await logManager.getRecentLogs(lineCount);
    return { success: true, data: logs };
  });

  ipcMain.handle(IPC_CHANNELS.LOG_CLEAR, async () => {
    logManager.clearLogs();
    return { success: true };
  });

  // 通用
  ipcMain.handle(IPC_CHANNELS.APP_VERSION, async () => {
    return { success: true, version: app.getVersion() };
  });

  ipcMain.handle(IPC_CHANNELS.APP_QUIT, async () => {
    app.quit();
    return { success: true };
  });

  // 注册模块化 Handler
  registerAuthHandlers();
  registerFriendsHandlers();
  registerSparkHandlers();
  registerHistoryHandlers();
  registerSettingsHandlers();
}
