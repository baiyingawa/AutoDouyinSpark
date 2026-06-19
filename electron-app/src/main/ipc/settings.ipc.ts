/**
 * settings.ipc.ts - 设置管理 IPC Handler
 */
import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { isAutoStartEnabled, enableAutoStart, disableAutoStart, hasAutoStartBeenPrompted, markAutoStartPrompted } from '../auto-launch';
import { pythonEngine } from '../python-engine';
import { getSharedDataDir } from '../shared-data-dir';

function getDataDir(): string {
  return getSharedDataDir();
}

function getEmailConfigPath(): string {
  return path.join(getDataDir(), 'email_config.json');
}

function getSparkConfigPath(): string {
  return path.join(getDataDir(), 'spark_config.json');
}

export function registerSettingsHandlers(): void {
  // 加载邮箱配置
  ipcMain.handle(IPC_CHANNELS.SETTINGS_LOAD_EMAIL, async () => {
    try {
      const configPath = getEmailConfigPath();
      if (!fs.existsSync(configPath)) {
        return { success: true, exists: false, config: null };
      }
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return { success: true, exists: true, config };
    } catch (err) {
      return { success: false, exists: false, error: String(err) };
    }
  });

  // 保存邮箱配置
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SAVE_EMAIL, async (_event, config: any) => {
    try {
      const configPath = getEmailConfigPath();
      const dir = path.dirname(configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // 加载应用配置
  ipcMain.handle(IPC_CHANNELS.SETTINGS_LOAD_APP, async () => {
    try {
      const configPath = getSparkConfigPath();
      if (!fs.existsSync(configPath)) {
        return {
          success: true,
          exists: false,
          config: {
            timeWindowsEnabled: false,
            timeWindows: [],
            messageTemplate: '[Auto]火花火花！{time}',
            autoStart: false,
            hideBrowser: true,
          },
        };
      }
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      // 兼容旧配置：如果有 morningStart 字段，迁移到新格式
      let timeWindowsEnabled = data.timeWindowsEnabled;
      let timeWindows = data.timeWindows;
      if (timeWindowsEnabled === undefined) {
        // 旧配置，检查是否有旧的时间窗口设置
        const hasOldWindows = data.morningStart !== undefined || data.eveningStart !== undefined;
        if (hasOldWindows) {
          timeWindowsEnabled = true;
          timeWindows = [];
          if (data.morningStart !== undefined) {
            timeWindows.push({ start: data.morningStart, end: data.morningEnd ?? 7 });
          }
          if (data.eveningStart !== undefined) {
            timeWindows.push({ start: data.eveningStart, end: data.eveningEnd ?? 19 });
          }
        } else {
          timeWindowsEnabled = false;
          timeWindows = [];
        }
      }

      const config = {
        timeWindowsEnabled: timeWindowsEnabled,
        timeWindows: timeWindows || [],
        messageTemplate: data.message_template || '[Auto]火花火花！{time}',
        autoStart: data.autoStart ?? false,
        hideBrowser: data.hideBrowser ?? true,
      };
      return { success: true, exists: true, config };
    } catch (err) {
      return { success: false, exists: false, error: String(err) };
    }
  });

  // 保存应用配置
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SAVE_APP, async (_event, config: any) => {
    try {
      const configPath = getSparkConfigPath();
      const dir = path.dirname(configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let existing: any = {};
      if (fs.existsSync(configPath)) {
        existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }

      const merged = {
        ...existing,
        timeWindowsEnabled: config.timeWindowsEnabled ?? false,
        timeWindows: config.timeWindows || [],
        message_template: config.messageTemplate,
        autoStart: config.autoStart,
        hideBrowser: config.hideBrowser ?? true,
        // 保留 target_users
        target_users: existing.target_users || [],
      };

      // 清除旧字段
      delete merged.morningStart;
      delete merged.morningEnd;
      delete merged.eveningStart;
      delete merged.eveningEnd;

      fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8');
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // 测试邮件
  ipcMain.handle(IPC_CHANNELS.SETTINGS_TEST_EMAIL, async (_event, configJson: string) => {
    try {
      const result = await pythonEngine.emailTest(configJson);
      return result;
    } catch (err: any) {
      return { success: false, error: String(err.message || err) };
    }
  });

  // 获取开机自启状态
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_AUTO_START, async () => {
    try {
      return { success: true, enabled: isAutoStartEnabled() };
    } catch (err) {
      return { success: false, enabled: false, error: String(err) };
    }
  });

  // 设置开机自启
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_AUTO_START, async (_event, enabled: boolean) => {
    try {
      if (enabled) {
        return { success: enableAutoStart() };
      } else {
        return { success: disableAutoStart() };
      }
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // 获取是否已询问过开机自启
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_AUTO_START_PROMPTED, async () => {
    try {
      return { success: true, prompted: hasAutoStartBeenPrompted() };
    } catch (err) {
      return { success: false, prompted: false, error: String(err) };
    }
  });

  // 标记开机自启弹窗已处理（前端用户点击了同意或暂不设置）
  ipcMain.handle(IPC_CHANNELS.SETTINGS_PROMPT_AUTO_START, async (_event, accepted: boolean) => {
    try {
      markAutoStartPrompted();
      if (accepted) {
        return { success: enableAutoStart() };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });
}
