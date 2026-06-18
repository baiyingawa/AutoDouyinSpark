/**
 * auto-launch.ts - 开机自启管理
 *
 * 使用 Electron 的 app.setLoginItemSettings() 实现。
 *
 * - isEnabled() → 返回是否开启
 * - enable()  → 设置开机自启
 * - disable() → 取消开机自启
 */

import { app } from 'electron';

/**
 * 获取开机自启状态
 */
export function isAutoStartEnabled(): boolean {
  return app.getLoginItemSettings().openAtLogin;
}

/**
 * 开启开机自启
 */
export function enableAutoStart(): boolean {
  try {
    app.setLoginItemSettings({
      openAtLogin: true,
      path: process.execPath,
    });
    return true;
  } catch (err) {
    console.error('[AutoLaunch] 开启开机自启失败:', err);
    return false;
  }
}

/**
 * 关闭开机自启
 */
export function disableAutoStart(): boolean {
  try {
    app.setLoginItemSettings({
      openAtLogin: false,
    });
    return true;
  } catch (err) {
    console.error('[AutoLaunch] 关闭开机自启失败:', err);
    return false;
  }
}
