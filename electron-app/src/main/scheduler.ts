/**
 * scheduler.ts - AutoDouyinSpark 任务调度器
 *
 * 每分钟检查当前时间是否在配置的时间窗口内。
 * 如果在窗口内且今日未发送，则调用 Python send。
 * 调度器状态通过 IPC 主进程事件推送给渲染进程。
 */

import { BrowserWindow } from 'electron';
import { PythonManager } from './python-manager';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import path from 'path';
import { getSharedDataDir } from './shared-data-dir';

export interface TimeWindowConfig {
  start: number;
  end: number;
}

export interface SchedulerOptions {
  dataDir?: string;
  onStatusChange?: (status: SchedulerStatus) => void;
}

export interface SchedulerStatus {
  running: boolean;
  currentWindow: string | null;
  lastCheck: string | null;
  nextAction: string | null;
}

export class SparkScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private pm: PythonManager;
  private dataDir: string;
  private lastCheckTime: string | null = null;
  private onStatusChange: ((status: SchedulerStatus) => void) | null = null;
  private notifyingWindows: Set<BrowserWindow> = new Set();

  constructor(options: SchedulerOptions = {}) {
    this.pm = new PythonManager();
    this.dataDir = options.dataDir || getSharedDataDir();
    this.onStatusChange = options.onStatusChange || null;
  }

  /**
   * 从配置文件读取时间窗口设置
   */
  private loadTimeWindows(): { enabled: boolean; windows: TimeWindowConfig[] } {
    try {
      const fs = require('fs') as typeof import('fs');
      const configPath = path.join(this.dataDir, 'spark_config.json');
      if (!fs.existsSync(configPath)) {
        return { enabled: false, windows: [] };
      }
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      // 新格式
      if (data.timeWindowsEnabled !== undefined) {
        return { enabled: data.timeWindowsEnabled, windows: data.timeWindows || [] };
      }

      // 旧格式兼容
      const windows: TimeWindowConfig[] = [];
      if (data.morningStart !== undefined) {
        windows.push({ start: data.morningStart, end: data.morningEnd ?? 7 });
      }
      if (data.eveningStart !== undefined) {
        windows.push({ start: data.eveningStart, end: data.eveningEnd ?? 19 });
      }
      return { enabled: windows.length > 0, windows };
    } catch {
      return { enabled: false, windows: [] };
    }
  }

  /**
   * 注册一个 BrowserWindow 以接收调度器状态推送
   */
  registerWindow(win: BrowserWindow): void {
    this.notifyingWindows.add(win);
    win.on('closed', () => {
      this.notifyingWindows.delete(win);
    });
  }

  /**
   * 撤销窗口注册
   */
  unregisterWindow(win: BrowserWindow): void {
    this.notifyingWindows.delete(win);
  }

  /**
   * 向所有已注册窗口推送状态
   */
  private broadcastStatus(status: SchedulerStatus): void {
    for (const win of this.notifyingWindows) {
      try {
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.SPARK_SCHEDULER_STATUS, status);
        }
      } catch {
        // 忽略已关闭窗口的错误
      }
    }
  }

  /**
   * 获取当前时间窗口（北京时间）
   */
  private getCurrentWindow(): string | null {
    const { enabled, windows } = this.loadTimeWindows();
    if (!enabled || windows.length === 0) {
      return 'always';
    }
    const now = new Date();
    const utcHour = now.getUTCHours();
    const beijingHour = (utcHour + 8) % 24;

    for (const win of windows) {
      if (beijingHour >= win.start && beijingHour <= win.end) {
        return `${win.start}:00-${win.end}:00`;
      }
    }
    return null;
  }

  /**
   * 获取今日已发送状态
   */
  private async getTodaySentStatus(): Promise<boolean> {
    const stateFile = path.join(this.dataDir, '.spark_state');
    try {
      const fs = await import('fs');
      if (!fs.existsSync(stateFile)) return false;
      const savedDate = fs.readFileSync(stateFile, 'utf-8').trim();
      const today = new Date();
      const beijingDate = new Date(today.getTime() + 8 * 60 * 60 * 1000)
        .toISOString().split('T')[0];
      return savedDate === beijingDate;
    } catch {
      return false;
    }
  }

  /**
   * 获取下次可执行的时间窗口描述
   */
  private getNextWindowDescription(): string | null {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const beijingHour = (utcHour + 8) % 24;
    const beijingMin = now.getUTCMinutes();

    // 如果目前在上次窗口内，下次就是下次窗口开始
    const current = this.getCurrentWindow();
    if (current) return 'now';

    const { enabled, windows } = this.loadTimeWindows();
    if (!enabled || windows.length === 0) return '全天';

    // 找到下一个窗口
    const sorted = [...windows].sort((a, b) => a.start - b.start);
    for (const win of sorted) {
      if (beijingHour < win.start) {
        return `今天 ${win.start}:00`;
      }
    }
    // 都过了 -> 明天第一个窗口
    return `明天 ${sorted[0].start}:00`;
  }

  /**
   * 检测到登录过期时：弹窗 + 切到登录页
   */
  private _bringToFrontAndShowLogin(): void {
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (!win.isDestroyed()) {
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
          win.webContents.send(IPC_CHANNELS.AUTH_LOGIN_EXPIRED);
        }
      } catch {
        // 忽略已关闭窗口的错误
      }
    }
  }

  /**
   * 执行一次检查
   */
  async checkAndExecute(): Promise<void> {
    this.lastCheckTime = new Date().toISOString();
    let currentWindow: string | null = null;  // 外层作用域

    // 先快速检查 Cookie 文件是否存在（不开浏览器）
    try {
      const fs = await import('fs');
      const cookieFile = path.join(this.dataDir, 'cookie_export.json');
      if (!fs.existsSync(cookieFile)) {
        this.broadcastStatus({
          running: this.isRunning(),
          currentWindow: null,
          lastCheck: this.lastCheckTime,
          nextAction: 'no_cookie',
        });
        return;
      }

      // 检查缓存的登录状态（必须有且为 valid=true 才继续）
      const loginCheckFile = path.join(this.dataDir, '.spark_login_check');
      if (!fs.existsSync(loginCheckFile)) {
        // 没有缓存 → 还没做过实测检查 → 跳过，等前端触发检查
        this.broadcastStatus({
          running: this.isRunning(),
          currentWindow: null,
          lastCheck: this.lastCheckTime,
          nextAction: 'no_login_check',
        });
        return;
      }

      const cached = JSON.parse(fs.readFileSync(loginCheckFile, 'utf-8'));
      if (cached.valid !== true) {
        this.broadcastStatus({
          running: this.isRunning(),
          currentWindow: null,
          lastCheck: this.lastCheckTime,
          nextAction: 'login_invalid',
        });
        this._bringToFrontAndShowLogin();
        return;
      }

      // 检查缓存是否过期（> 1 小时）
      if (cached.checked_at) {
        const checkedAt = new Date(cached.checked_at).getTime();
        const oneHour = 60 * 60 * 1000;
        if (Date.now() - checkedAt > oneHour) {
          this.broadcastStatus({
            running: this.isRunning(),
            currentWindow: null,
            lastCheck: this.lastCheckTime,
            nextAction: 'login_check_stale',
          });
          this._bringToFrontAndShowLogin();
          return;
        }
      }
    } catch {
      // 文件检查失败，继续尝试
    }

    try {
      currentWindow = this.getCurrentWindow();
      if (!currentWindow) {
        this.broadcastStatus({
          running: this.isRunning(),
          currentWindow: null,
          lastCheck: this.lastCheckTime,
          nextAction: this.getNextWindowDescription(),
        });
        return;
      }

      // 在窗口内，检查今日是否已发送
      const sentToday = await this.getTodaySentStatus();
      if (sentToday) {
        this.broadcastStatus({
          running: this.isRunning(),
          currentWindow,
          lastCheck: this.lastCheckTime,
          nextAction: 'today_sent',
        });
        return;
      }

      // 今日未发送，调用 Python send（登录状态已在方法开头检查）
      console.log(`[Scheduler] 时间窗口 ${currentWindow}，开始自动发送...`);

      const enginePath = this.getEngineScriptPath();
      const result = await this.pm.exec(enginePath, [
        '--data-dir', this.dataDir,
        '--action', 'send',
        '--json',
      ], { timeout: 120000 });

      if (result.success) {
        console.log(`[Scheduler] 自动发送成功`);
      } else {
        console.error(`[Scheduler] 自动发送失败: ${result.stderr}`);
      }

      this.broadcastStatus({
        running: this.isRunning(),
        currentWindow,
        lastCheck: this.lastCheckTime,
        nextAction: 'completed',
      });

    } catch (err) {
      console.error(`[Scheduler] 检查异常:`, err);
    }

    if (this.onStatusChange) {
      this.onStatusChange({
        running: this.isRunning(),
        currentWindow,
        lastCheck: this.lastCheckTime,
        nextAction: this.getNextWindowDescription(),
      });
    }
  }

  /**
   * 获取 engine.py 路径
   */
  private getEngineScriptPath(): string {
    if (process.env.VITE_DEV_SERVER_URL) {
      return path.join(__dirname, '..', '..', 'python', 'engine.py');
    }
    return path.join(process.resourcesPath, 'python', 'engine.py');
  }

  /**
   * 启动调度器
   */
  start(): void {
    if (this.timer) return;
    console.log('[Scheduler] 调度器已启动');

    // 先立即检查一次
    this.checkAndExecute();

    // 然后每分钟检查一次
    this.timer = setInterval(() => {
      this.checkAndExecute();
    }, 60 * 1000);
  }

  /**
   * 停止调度器
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[Scheduler] 调度器已停止');
    }
  }

  /**
   * 获取运行状态
   */
  isRunning(): boolean {
    return this.timer !== null;
  }

  /**
   * 获取当前状态
   */
  getStatus(): SchedulerStatus {
    return {
      running: this.isRunning(),
      currentWindow: this.getCurrentWindow(),
      lastCheck: this.lastCheckTime,
      nextAction: this.getNextWindowDescription(),
    };
  }
}

// 默认调度器实例（懒加载）
let _defaultScheduler: SparkScheduler | null = null;

export function getDefaultScheduler(): SparkScheduler {
  if (!_defaultScheduler) {
    _defaultScheduler = new SparkScheduler();
  }
  return _defaultScheduler;
}
