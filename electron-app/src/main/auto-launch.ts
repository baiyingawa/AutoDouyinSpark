/**
 * auto-launch.ts - 开机自启管理
 *
 * 使用 Electron 的 app.setLoginItemSettings() 实现。
 *
 * - isAutoStartEnabled() → 返回是否开启
 * - enableAutoStart()  → 设置开机自启
 * - disableAutoStart() → 取消开机自启
 * - shouldPromptAutoStart() → 是否需要向用户询问
 * - markAutoStartPrompted() → 标记已询问过
 */

import { app } from 'electron';
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
 * 是否需要向用户询问开机自启
 *
 * 条件：
 * 1. 尚未询问过用户（autoStartPrompted !== true）
 * 2. 开机自启尚未开启（!isAutoStartConfigured()）
 *
 * 注意：此函数只做判断，实际弹窗由前端 React 组件负责。
 */
export function shouldPromptAutoStart(): boolean {
  if (hasAutoStartBeenPrompted()) return false;
  if (isAutoStartConfigured()) return false;
  return true;
}

/**
 * 标记已向用户询问过开机自启（写入 spark_config.json）
 */
export function markAutoStartPrompted(): void {
  _patchConfig({ autoStartPrompted: true });
}
