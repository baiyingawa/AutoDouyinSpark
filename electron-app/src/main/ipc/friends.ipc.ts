/**
 * friends.ipc.ts - 好友管理 IPC Handler
 * 好友模型：{ name, douyin_id?, avatar_file? }，兼容旧的字符串列表。
 */
import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { getSharedDataDir } from '../shared-data-dir';
import { pythonEngine } from '../python-engine';

export interface FriendRecord {
  name: string;
  douyin_id?: string;
  avatar_file?: string;
}

interface SparkConfig {
  target_users?: unknown[];
  [key: string]: unknown;
}

function getConfigPath(): string {
  const dataDir = getSharedDataDir();
  return path.join(dataDir, 'spark_config.json');
}

function readConfig(): SparkConfig {
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

function writeConfig(config: SparkConfig): boolean {
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

function normalizeUser(user: unknown): FriendRecord | null {
  if (typeof user === 'string' && user.trim()) {
    return { name: user.trim() };
  }
  if (user && typeof user === 'object') {
    const u = user as Record<string, unknown>;
    const name = typeof u.name === 'string' ? u.name.trim() : '';
    if (!name) return null;
    const friend: FriendRecord = { name };
    if (typeof u.douyin_id === 'string' && u.douyin_id.trim()) friend.douyin_id = u.douyin_id.trim();
    if (typeof u.avatar_file === 'string' && u.avatar_file.trim()) friend.avatar_file = u.avatar_file.trim();
    return friend;
  }
  return null;
}

function listFriends(): FriendRecord[] {
  const config = readConfig();
  const friends: FriendRecord[] = [];
  const seen = new Set<string>();
  for (const raw of config.target_users || []) {
    const friend = normalizeUser(raw);
    if (friend && !seen.has(friend.name)) {
      seen.add(friend.name);
      friends.push(friend);
    }
  }
  return friends;
}

function saveFriends(friends: FriendRecord[]): boolean {
  const config = readConfig();
  config.target_users = friends;
  return writeConfig(config);
}

// 识别浏览器可以并发运行，但配置合并必须排队，避免多个结果互相覆盖。
let friendConfigWriteQueue: Promise<unknown> = Promise.resolve();

function enqueueFriendConfigWrite<T>(operation: () => T | Promise<T>): Promise<T> {
  const next = friendConfigWriteQueue.then(operation, operation);
  friendConfigWriteQueue = next.then(() => undefined, () => undefined);
  return next;
}

function findFriend(friends: FriendRecord[], name: string): FriendRecord | undefined {
  return friends.find((f) => f.name === name);
}

export function registerFriendsHandlers(): void {
  // 获取好友列表
  ipcMain.handle(IPC_CHANNELS.FRIENDS_LIST, async () => {
    try {
      return { success: true, users: listFriends() };
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
      const friends = listFriends();
      const name = username.trim();
      if (findFriend(friends, name)) {
        return { success: false, error: '该好友已存在' };
      }
      friends.push({ name });
      const ok = saveFriends(friends);
      return { success: ok, error: ok ? undefined : '写入配置文件失败' };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // 删除好友
  ipcMain.handle(IPC_CHANNELS.FRIENDS_REMOVE, async (_event, username: string) => {
    try {
      const friends = listFriends();
      const idx = friends.findIndex((f) => f.name === username);
      if (idx === -1) {
        return { success: false, error: '好友不存在' };
      }
      friends.splice(idx, 1);
      const ok = saveFriends(friends);
      return { success: ok, error: ok ? undefined : '写入配置文件失败' };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // 更新好友（改名 / 修改抖音号）
  ipcMain.handle(
    IPC_CHANNELS.FRIENDS_UPDATE,
    async (_event, payload: { name: string; newName?: string; douyin_id?: string }) => {
      try {
        const name = (payload?.name || '').trim();
        if (!name) {
          return { success: false, error: '原好友名不能为空' };
        }
        const newName = (payload.newName || '').trim();
        const douyinId = (payload.douyin_id || '').trim();
        if (!newName && !douyinId) {
          return { success: false, error: '没有需要更新的内容' };
        }
        const friends = listFriends();
        const friend = findFriend(friends, name);
        if (!friend) {
          return { success: false, error: '好友不存在' };
        }
        if (newName && newName !== name) {
          if (findFriend(friends, newName)) {
            return { success: false, error: '新名字已被其他好友使用' };
          }
          friend.name = newName;
        }
        if (douyinId) {
          friend.douyin_id = douyinId;
        }
        const ok = saveFriends(friends);
        return { success: ok, error: ok ? undefined : '写入配置文件失败' };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  // 识别好友抖音号与头像（调用 Python 引擎，成功后自动写回配置）
  ipcMain.handle(IPC_CHANNELS.FRIENDS_IDENTIFY, async (_event, username: string) => {
    try {
      const name = (username || '').trim();
      if (!name) {
        return { success: false, error: '好友名不能为空' };
      }
      const result = await pythonEngine.identifyFriend(name);
      if (!result || result.success !== true) {
        return {
          success: false,
          error: (result && result.error) || '识别失败',
        };
      }
      return await enqueueFriendConfigWrite(() => {
        const friends = listFriends();
        const friend = findFriend(friends, name) || findFriend(friends, result.name || name);
        if (!friend) {
          return { success: false, error: '好友已被删除，请刷新列表后重试' };
        }
        const recognizedName = (result.name || '').trim();
        if (recognizedName && recognizedName !== friend.name) {
          const duplicate = findFriend(friends, recognizedName);
          if (!duplicate || duplicate === friend) friend.name = recognizedName;
        }
        if (result.douyin_id) friend.douyin_id = result.douyin_id;
        if (result.avatar_file) friend.avatar_file = result.avatar_file;
        if (!saveFriends(friends)) {
          return { success: false, error: '识别成功，但写回好友配置失败' };
        }
        return {
          success: true,
          name: friend.name,
          douyin_id: result.douyin_id || friend.douyin_id || '',
          avatar_file: result.avatar_file || friend.avatar_file || '',
        };
      });
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });
}
