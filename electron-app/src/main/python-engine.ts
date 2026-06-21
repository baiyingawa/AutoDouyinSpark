/**
 * PythonEngine - 封装 PythonManager 调用 engine.py
 */
import path from 'path';
import { PythonManager, findPythonPath } from './python-manager';
import { getSharedDataDir } from './shared-data-dir';

const ENGINE_SCRIPT = 'engine.py';

function getEnginePath(): string {
  // 开发模式：相对于项目根目录
  if (process.env.VITE_DEV_SERVER_URL) {
    return path.join(__dirname, '..', '..', 'python', ENGINE_SCRIPT);
  }
  // 生产模式：相对于 app.asar.unpacked
  return path.join(process.resourcesPath, 'python', ENGINE_SCRIPT);
}

function getDataDir(): string {
  return getSharedDataDir();
}

function buildArgs(action: string, extra: string[] = []): string[] {
  const args = [
    path.resolve(getEnginePath()),
    '--data-dir', getDataDir(),
    '--action', action,
    '--json',
    ...extra,
  ];
  return args;
}

export interface PythonEngineConfig {
  timeout?: number;
}

export class PythonEngine {
  private pm: PythonManager;
  private config: PythonEngineConfig;

  constructor(config: PythonEngineConfig = {}) {
    this.pm = new PythonManager();
    this.config = { timeout: 120000, ...config };
  }

  private async callEngine(action: string, extra: string[] = [], stdin?: string): Promise<any> {
    const args = buildArgs(action, extra);
    const result = await this.pm.exec(
      path.resolve(getEnginePath()),
      ['--data-dir', getDataDir(), '--action', action, '--json', ...extra],
      { timeout: this.config.timeout, stdin }
    );

    if (!result.success) {
      // 进程退出码非0时，尝试从 stdout 解析错误信息
      if (result.stdout) {
        try {
          const parsed = JSON.parse(result.stdout);
          if (parsed.error) {
            console.error(`[PythonEngine:${action}]`, parsed.error);
          }
          return parsed;
        } catch { /* 忽略解析失败 */ }
      }
      return { success: false, error: `进程退出码 ${result.code}: ${result.stderr}` };
    }

    if (!result.stdout) {
      return { success: true };
    }

    try {
      return JSON.parse(result.stdout);
    } catch {
      return { success: false, error: 'Python 输出无效 JSON', raw: result.stdout };
    }
  }

  // --- 状态 ---
  async status(): Promise<any> {
    return this.callEngine('status');
  }

  // --- 发送 ---
  async send(force: boolean = false): Promise<any> {
    const extra = force ? ['--force'] : [];
    return this.callEngine('send', extra);
  }

  // --- 刷新天数 ---
  async refreshDays(force = false): Promise<any> {
    return this.callEngine('refresh-days', force ? ['--force'] : []);
  }

  // --- 登录 ---
  async loginStart(): Promise<any> {
    console.log('[PythonEngine] loginStart: pythonPath=', findPythonPath());
    console.log('[PythonEngine] loginStart: enginePath=', path.resolve(getEnginePath()));
    // 登录可能耗时较长（最多 5 分钟），单独设置超时
    const originalTimeout = this.config.timeout;
    this.config.timeout = 360000; // 6 分钟（比 Python 端 5 分钟超时略长）
    const result = await this.callEngine('login-start');
    this.config.timeout = originalTimeout;
    console.log('[PythonEngine] loginStart result:', JSON.stringify(result).substring(0, 200));
    return result;
  }

  async loginPoll(): Promise<any> {
    return this.callEngine('login-poll');
  }

  async loginAbort(): Promise<any> {
    return this.callEngine('login-abort');
  }

  async loginImport(cookieJson: string): Promise<any> {
    return this.callEngine('login-import', [], cookieJson);
  }

  async checkLogin(): Promise<any> {
    return this.callEngine('check-login');
  }

  async checkPlaywright(): Promise<any> {
    return this.callEngine('check-playwright');
  }

  // --- 截图 ---
  async screenshotsList(): Promise<any> {
    return this.callEngine('screenshots-list');
  }

  async screenshotGet(filename: string): Promise<any> {
    return this.callEngine('screenshot-get', ['--file', filename]);
  }

  // --- 邮件 ---
  async emailCheck(): Promise<any> {
    return this.callEngine('email-check');
  }

  async emailTest(configJson: string): Promise<any> {
    return this.callEngine('email-test', [], configJson);
  }
}

export const pythonEngine = new PythonEngine();
