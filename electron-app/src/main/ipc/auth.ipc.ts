/**
 * auth.ipc.ts - 登录相关 IPC Handler
 *
 * 登录成功后，自动触发：
 * 1. 确保计划任务已注册
 * 2. 通知前端弹窗询问开机自启（仅首次）
 */
import { ipcMain, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { pythonEngine } from '../python-engine';
import { ensureSparkSchedulerTask } from '../task-scheduler';
import { shouldPromptAutoStart } from '../auto-launch';

/**
 * 登录成功后的统一处理：计划任务 + 通知前端开机自启弹窗
 */
function _onLoginSuccess(): void {
  // 1. 确保计划任务已注册
  ensureSparkSchedulerTask();

  // 2. 通知前端弹窗（仅首次登录后）
  if (shouldPromptAutoStart()) {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.SETTINGS_PROMPT_AUTO_START);
    }
  }
}

export function registerAuthHandlers(): void {
  // 启动网页登录（打开浏览器等待用户登录，自动保存 Cookie）
  ipcMain.handle(IPC_CHANNELS.AUTH_START_QRCODE, async () => {
    try {
      const result = await pythonEngine.loginStart();
      // 登录成功后确认计划任务
      if (result.success) {
        _onLoginSuccess();
      }
      return {
        success: result.success === true,
        cookieCount: result.cookieCount || 0,
        loginMethod: result.loginMethod || null,
        elapsed: result.elapsed || null,
        browserPid: result.browserPid || null,
        error: result.error,
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // 轮询扫码状态
  ipcMain.handle(IPC_CHANNELS.AUTH_POLL_QRCODE_STATUS, async () => {
    try {
      const result = await pythonEngine.loginPoll();
      return {
        success: true,
        status: result.status || 'pending',
      };
    } catch (err) {
      return { success: false, status: 'failed', error: String(err) };
    }
  });

  // 导入 Cookie
  ipcMain.handle(IPC_CHANNELS.AUTH_IMPORT_COOKIE, async (_event, cookieJson: string) => {
    try {
      // 验证 JSON
      const parsed = JSON.parse(cookieJson);
      const count = Array.isArray(parsed) ? parsed.length : 1;

      // 调用 Python 引擎导入
      const result = await pythonEngine.loginImport(cookieJson);
      // 导入成功后确认计划任务
      if (result.success !== false) {
        _onLoginSuccess();
      }
      return {
        success: result.success !== false,
        cookieCount: count,
        error: result.error,
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // 检查登录状态
  ipcMain.handle(IPC_CHANNELS.AUTH_CHECK_STATUS, async () => {
    try {
      const result = await pythonEngine.checkLogin();
      return {
        success: true,
        valid: result.valid === true,
        checkedAt: result.checkedAt || new Date().toISOString(),
      };
    } catch (err) {
      return { success: false, valid: false, error: String(err) };
    }
  });

  // 退出登录
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async () => {
    try {
      await pythonEngine.loginAbort();
      return { success: true };
    } catch (err) {
      return { success: false, error: `终止登录失败: ${String(err)}` };
    }
  });
}
