/**
 * history.ipc.ts - 历史记录 IPC Handler
 */
import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { getSharedDataDir } from '../shared-data-dir';

function getDataDir(): string {
  return getSharedDataDir();
}

export function registerHistoryHandlers(): void {
  // 获取火花天数历史（从 .spark_days_history 逐日记录读取）
  ipcMain.handle(IPC_CHANNELS.HISTORY_SPARK_DAYS, async () => {
    try {
      const historyPath = path.join(getDataDir(), '.spark_days_history');
      const records: any[] = [];

      if (fs.existsSync(historyPath)) {
        try {
          const raw = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
          if (Array.isArray(raw)) records.push(...raw);
        } catch {
          // 历史文件为空或上次写入中断时，下面从天数缓存恢复最近一条。
        }
      }
      if (records.length === 0) {
        const cachePath = path.join(getDataDir(), '.spark_days_cache');
        try {
          const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
          const days = cache?.days;
          if (days && typeof days === 'object' && Object.keys(days).length > 0) {
            records.push({
              date: typeof cache.updated_at === 'string' ? cache.updated_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
              days,
            });
          }
        } catch {
          // 没有可恢复的缓存时返回空历史。
        }
      }

      return { success: true, records };
    } catch (err) {
      return { success: false, records: [], error: String(err) };
    }
  });

  // 列出截图
  ipcMain.handle(IPC_CHANNELS.HISTORY_SCREENSHOTS, async () => {
    try {
      const ssDir = path.join(getDataDir(), 'screenshots');
      if (!fs.existsSync(ssDir)) {
        return { success: true, files: [], count: 0 };
      }

      const files = fs.readdirSync(ssDir)
        .filter((f) => f.endsWith('.png'))
        .map((f) => {
          const fpath = path.join(ssDir, f);
          const stat = fs.statSync(fpath);
          return {
            name: f,
            size: stat.size,
            mtime: stat.mtime.toISOString(),
          };
        })
        .sort((a, b) => b.mtime.localeCompare(a.mtime)); // 最新在前

      return { success: true, files, count: files.length };
    } catch (err) {
      return { success: false, files: [], count: 0, error: String(err) };
    }
  });

  // 获取截图数据（base64）
  ipcMain.handle(IPC_CHANNELS.HISTORY_SCREENSHOT_DATA, async (_event, filename: string) => {
    try {
      const ssDir = path.join(getDataDir(), 'screenshots');
      if (typeof filename !== 'string' || filename.length === 0) {
        return { success: false, error: '文件名无效' };
      }
      const resolvedDir = path.resolve(ssDir);
      const fpath = path.resolve(resolvedDir, filename);

      // 防止路径穿越
      if (path.dirname(fpath) !== resolvedDir || path.basename(fpath) !== filename || path.extname(fpath).toLowerCase() !== '.png') {
        return { success: false, error: '路径不合法' };
      }

      if (!fs.existsSync(fpath) || !fs.statSync(fpath).isFile()) {
        return { success: false, error: `文件不存在: ${filename}` };
      }

      const data = fs.readFileSync(fpath).toString('base64');
      return { success: true, data, filename };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });
}
