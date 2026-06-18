/**
 * history.ipc.ts - 历史记录 IPC Handler
 */
import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';

function getDataDir(): string {
  return path.join(app.getPath('userData'), 'data');
}

/** 生成近 10 天模拟递增数据（用于演示折线图） */
function generateMockRecords(realDays: Record<string, number>): any[] {
  const today = new Date();
  const result: any[] = [];
  for (let i = 9; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const days: Record<string, number> = {};
    for (const [user, currentVal] of Object.entries(realDays)) {
      // 从 10 天前开始递增到当前值
      const base = currentVal - i;
      days[user] = Math.max(1, base); // 最小为 1
    }
    result.push({ date: dateStr, days });
  }
  return result;
}

export function registerHistoryHandlers(): void {
  // 获取火花天数历史
  ipcMain.handle(IPC_CHANNELS.HISTORY_SPARK_DAYS, async () => {
    try {
      const daysCachePath = path.join(getDataDir(), '.spark_days_cache');
      const streakPath = path.join(getDataDir(), '.spark_streak');

      const records: any[] = [];

      // 读取当前天数缓存
      if (fs.existsSync(daysCachePath)) {
        const data = JSON.parse(fs.readFileSync(daysCachePath, 'utf-8'));
        const realDays = data.days || {};
        const realPrevDays = data.prev_days;
        const todayDate = data.updated_at?.split('T')[0] || 'unknown';

        // 如果真实数据不足 10 天，生成模拟历史数据用于演示
        if (Object.keys(realDays).length > 0) {
          records.push(...generateMockRecords(realDays));
        } else {
          records.push({ date: todayDate, days: realDays, prev_days: realPrevDays });
        }
      }

      // 读取连续天数
      if (fs.existsSync(streakPath)) {
        const streakData = JSON.parse(fs.readFileSync(streakPath, 'utf-8'));
        // 连续天数历史已包含在 streaks 文件中
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
      const fpath = path.resolve(ssDir, filename);

      // 防止路径穿越
      if (!fpath.startsWith(path.resolve(ssDir))) {
        return { success: false, error: '路径不合法' };
      }

      if (!fs.existsSync(fpath)) {
        return { success: false, error: `文件不存在: ${filename}` };
      }

      const data = fs.readFileSync(fpath).toString('base64');
      return { success: true, data, filename };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });
}
