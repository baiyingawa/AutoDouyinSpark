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
import { getActiveProfileId, getSharedDataDir, restoreProfileByDouyinId, updateProfileIdentity } from '../shared-data-dir';
import { LogManager } from '../log-manager';

/**
 * 登录成功后的统一处理：计划任务 + 通知前端开机自启弹窗
 */
async function _onLoginSuccess(logManager?: LogManager): Promise<void> {
  // 登录完成后读取个人页身份；同一抖音号重新导入时恢复被隐藏账户的数据。
  try {
    const identity = await pythonEngine.identifySelf();
    if (identity?.success && identity.douyin_id) {
      const restored = restoreProfileByDouyinId(identity.douyin_id, identity.name, identity.avatar_file);
      if (restored) logManager?.init(path.join(getSharedDataDir(), '.spark_log'));
      else updateProfileIdentity(getActiveProfileId(), {
        name: identity.name,
        douyinId: identity.douyin_id,
        avatarFile: identity.avatar_file,
      });
    }
  } catch (error) {
    console.warn('[Auth] 个人页身份识别失败:', error);
  }
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

let loginStartPromise: Promise<any> | null = null;

export function registerAuthHandlers(logManager?: LogManager): void {
  // 启动网页登录（打开浏览器等待用户登录，自动保存 Cookie）
  ipcMain.handle(IPC_CHANNELS.AUTH_START_QRCODE, async () => {
    try {
      if (!loginStartPromise) {
        loginStartPromise = pythonEngine.loginStart().finally(() => {
          loginStartPromise = null;
        });
      }
      const result = await loginStartPromise;
      // 登录成功后确认计划任务
      if (result.success) {
        await _onLoginSuccess(logManager);
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
        cookieCount: result.cookieCount || 0,
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

      // 调用 Python 引擎导入
      const result = await pythonEngine.loginImport(cookieJson);
      if (result.success !== true) {
        return {
          success: false,
          cookieCount: result.cookieCount || 0,
          error: result.error || 'Cookie 导入失败',
        };
      }

      // 导入成功后立即做一次真实校验并写入当前账户缓存。此前这里只写入
      // cookie 文件就直接跳转，首页 ProtectedRoute 随后校验失败时会立刻
      // 把用户送回登录页，表现为“导入成功但无法进入首页”。
      const loginCheck = await pythonEngine.checkLogin();
      if (loginCheck.valid !== true) {
        return {
          success: false,
          cookieCount: result.cookieCount || 0,
          error: loginCheck.error || 'Cookie 已导入，但登录校验未通过，请确认 Cookie 属于当前账户且尚未过期',
        };
      }

      // Cookie 校验通过后确认计划任务和账户身份
      await _onLoginSuccess(logManager);
      return {
        success: true,
        cookieCount: result.cookieCount || 0,
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
      const valid = result.valid === true;
      // 登录过期时通知所有前端窗口
      if (!valid) {
        BrowserWindow.getAllWindows().forEach((w) => {
          w.webContents.send(IPC_CHANNELS.AUTH_LOGIN_EXPIRED);
        });
      }
      return {
        success: true,
        valid,
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
