/**
 * settings.ipc.ts - 设置管理 IPC Handler
 */
import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { isAutoStartEnabled, enableAutoStart, disableAutoStart } from '../auto-launch';
import { pythonEngine } from '../python-engine';

function getDataDir(): string {
  return path.join(app.getPath('userData'), 'data');
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
            morningStart: 1,
            morningEnd: 7,
            eveningStart: 17,
            eveningEnd: 19,
            messageTemplate: '[Auto]火花火花！{time}',
            autoStart: false,
            hideBrowser: true,
          },
        };
      }
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const config = {
        morningStart: data.morningStart ?? 1,
        morningEnd: data.morningEnd ?? 7,
        eveningStart: data.eveningStart ?? 17,
        eveningEnd: data.eveningEnd ?? 19,
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
        morningStart: config.morningStart,
        morningEnd: config.morningEnd,
        eveningStart: config.eveningStart,
        eveningEnd: config.eveningEnd,
        message_template: config.messageTemplate,
        autoStart: config.autoStart,
        hideBrowser: config.hideBrowser ?? true,
        // 保留 target_users
        target_users: existing.target_users || [],
      };

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
}
