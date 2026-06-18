/**
 * spark.ipc.ts - 续火花 IPC Handler
 */
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { pythonEngine } from '../python-engine';
import { getDefaultScheduler } from '../scheduler';

export function registerSparkHandlers(): void {
  // 发送火花
  ipcMain.handle(IPC_CHANNELS.SPARK_SEND, async (_event, force?: boolean) => {
    try {
      const result = await pythonEngine.send(!!force);
      return {
        success: result.success === true,
        sentCount: result.sentCount || 0,
        failCount: result.failCount || 0,
        screenshots: result.screenshots || [],
        message: result.message,
      };
    } catch (err) {
      return { success: false, sentCount: 0, failCount: 0, screenshots: [], error: String(err) };
    }
  });

  // 获取火花状态
  ipcMain.handle(IPC_CHANNELS.SPARK_STATUS, async () => {
    try {
      const [statusResult, scheduler] = await Promise.all([
        pythonEngine.status(),
        Promise.resolve(getDefaultScheduler()),
      ]);
      return {
        success: statusResult.success !== false,
        sentToday: statusResult.sentToday === true,
        streak: statusResult.streak || 0,
        days: statusResult.days || {},
        cookieValid: statusResult.cookieValid === true,
        cookieTotal: statusResult.cookieTotal || 0,
        cookieValidCount: statusResult.cookieValidCount || 0,
        cookieNames: statusResult.cookieNames || [],
        lastSend: statusResult.lastSend || null,
        schedulerRunning: scheduler.isRunning(),
      };
    } catch (err) {
      return {
        success: false,
        sentToday: false,
        streak: 0,
        days: {},
        cookieValid: false,
        lastSend: null,
        schedulerRunning: false,
        error: String(err),
      };
    }
  });

  // 刷新火花天数
  ipcMain.handle(IPC_CHANNELS.SPARK_REFRESH_DAYS, async () => {
    try {
      const result = await pythonEngine.refreshDays();
      return { success: result.success !== false };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // 调度器状态
  ipcMain.handle(IPC_CHANNELS.SPARK_SCHEDULER_STATUS, async () => {
    const scheduler = getDefaultScheduler();
    return { success: true, running: scheduler.isRunning() };
  });
}
