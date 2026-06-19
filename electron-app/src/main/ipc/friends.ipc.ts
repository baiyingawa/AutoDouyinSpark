/**
 * friends.ipc.ts - 好友管理 IPC Handler
 */
import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { getSharedDataDir } from '../shared-data-dir';

function getConfigPath(): string {
  const dataDir = getSharedDataDir();
  return path.join(dataDir, 'spark_config.json');
}

function readConfig(): { target_users: string[]; message_template?: string } {
  const configPath = getConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (err) {
    console.error('读取 spark_config.json 失败:', err);
  }
  return { target_users: [] };
}

function writeConfig(config: { target_users: string[]; message_template?: string }): boolean {
  try {
    const configPath = getConfigPath();
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('写入 spark_config.json 失败:', err);
    return false;
  }
}

export function registerFriendsHandlers(): void {
  // 获取好友列表
  ipcMain.handle(IPC_CHANNELS.FRIENDS_LIST, async () => {
    try {
      const config = readConfig();
      return { success: true, users: config.target_users || [] };
    } catch (err) {
      return { success: false, users: [], error: String(err) };
    }
  });

  // 添加好友
  ipcMain.handle(IPC_CHANNELS.FRIENDS_ADD, async (_event, username: string) => {
    try {
      if (!username || !username.trim()) {
        return { success: false, error: '用户名不能为空' };
      }

      const config = readConfig();
      const users = config.target_users || [];

      if (users.includes(username.trim())) {
        return { success: false, error: '该好友已存在' };
      }

      users.push(username.trim());
      config.target_users = users;

      const ok = writeConfig(config);
      return { success: ok, error: ok ? undefined : '写入配置文件失败' };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // 删除好友
  ipcMain.handle(IPC_CHANNELS.FRIENDS_REMOVE, async (_event, username: string) => {
    try {
      const config = readConfig();
      const users = config.target_users || [];
      const idx = users.indexOf(username);

      if (idx === -1) {
        return { success: false, error: '好友不存在' };
      }

      users.splice(idx, 1);
      config.target_users = users;

      const ok = writeConfig(config);
      return { success: ok, error: ok ? undefined : '写入配置文件失败' };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });
}
