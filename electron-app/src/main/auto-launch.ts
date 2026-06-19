/**
 * auto-launch.ts - 开机自启管理
 *
 * 使用 Electron 的 app.setLoginItemSettings() 实现。
 *
 * - isAutoStartEnabled() → 返回是否开启
 * - enableAutoStart()  → 设置开机自启
 * - disableAutoStart() → 取消开机自启
 * - promptAndMaybeEnable(mainWindow) → 首次登录弹窗确认后写入
 */

import { app, BrowserWindow, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { getSharedDataDir } from './shared-data-dir';

/**
 * 获取 spark_config.json 路径
 */
function _getConfigPath(): string {
  return path.join(getSharedDataDir(), 'spark_config.json');
}

/**
 * 读取 spark_config.json（不存在则返回空对象）
 */
function _readConfig(): Record<string, any> {
  try {
    const cfgPath = _getConfigPath();
    if (!fs.existsSync(cfgPath)) return {};
    return JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * 写入 spark_config.json 指定字段（保留其他字段）
 */
function _patchConfig(patch: Record<string, any>): void {
  try {
    const cfgPath = _getConfigPath();
    const dir = path.dirname(cfgPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let existing: Record<string, any> = {};
    if (fs.existsSync(cfgPath)) {
      existing = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    }
    const merged = { ...existing, ...patch };
    fs.writeFileSync(cfgPath, JSON.stringify(merged, null, 2), 'utf-8');
  } catch (err) {
    console.error('[AutoLaunch] 写入配置失败:', err);
  }
}

/**
 * 获取开机自启状态（Electron 原生检测）
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
    // 同步更新配置
    _patchConfig({ autoStart: true });
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
    _patchConfig({ autoStart: false });
    return true;
  } catch (err) {
    console.error('[AutoLaunch] 关闭开机自启失败:', err);
    return false;
  }
}

/**
 * 检查是否已经向用户询问过开机自启
 */
export function hasAutoStartBeenPrompted(): boolean {
  const cfg = _readConfig();
  return cfg.autoStartPrompted === true;
}

/**
 * 检查是否已启用开机自启（优先读配置，兼容 Electron 原生）
 */
export function isAutoStartConfigured(): boolean {
  const cfg = _readConfig();
  if (cfg.autoStart === true) return true;
  return isAutoStartEnabled();
}

/**
 * 首次登录后弹窗询问用户是否开启开机自启
 *
 * 只有在以下条件同时满足时才弹窗：
 * 1. 尚未询问过用户（autoStartPrompted !== true）
 * 2. 开机自启尚未开启（!isAutoStartConfigured()）
 *
 * @param mainWindow 用于弹出对话框的父窗口
 * @returns true=用户同意并已写入, false=用户拒绝或已跳过
 */
export async function promptAndMaybeEnable(mainWindow: BrowserWindow | null): Promise<boolean> {
  // 已询问过 → 跳过
  if (hasAutoStartBeenPrompted()) {
    return false;
  }

  // 已开启过 → 标记为已询问但不重复弹
  if (isAutoStartConfigured()) {
    _patchConfig({ autoStartPrompted: true });
    return false;
  }

  // 没有可用窗口 → 标记已询问，跳过
  if (!mainWindow || mainWindow.isDestroyed()) {
    _patchConfig({ autoStartPrompted: true });
    return false;
  }

  // 弹原生确认对话框
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['同意开启', '暂不设置'],
    defaultId: 0,
    cancelId: 1,
    title: '开启开机自启',
    message: '为了自动续火花功能正常运作，AutoDouyinSpark 需要在您登录电脑时自动启动。',
    detail:
      '开启后，每次登录电脑时应用会在后台自动运行，确保续火花任务按时执行。\n\n' +
      '您随时可以在「设置」页面中关闭此功能。',
  });

  // 标记已询问（无论同意与否，不再重复弹窗）
  _patchConfig({ autoStartPrompted: true });

  if (result.response === 0) {
    // 用户同意 → 写入 HKCU\Run
    return enableAutoStart();
  }

  return false;
}
