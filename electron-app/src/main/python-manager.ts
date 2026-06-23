import { spawn, ChildProcess, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getSharedDataDir } from './shared-data-dir';

/**
 * 设置 Playwright 环境变量，确保 Chromium 路径正确。
 * 优先检测已有安装，找不到则下载到应用数据目录。
 */
function getChromiumEnv(): Record<string, string> {
  const env: Record<string, string> = {};

  // 1. 用户手动指定
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    return env;
  }

  // 2. 自动扫描 ms-playwright 目录找可用 Chromium
  const msDir = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  let found = false;
  try {
    if (fs.existsSync(msDir)) {
      for (const entry of fs.readdirSync(msDir)) {
        if (entry.startsWith('chromium-') && !entry.includes('headless')) {
          const chromeExe = path.join(msDir, entry, 'chrome-win64', 'chrome.exe');
          if (fs.existsSync(chromeExe)) {
            env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chromeExe;
            found = true;
            break;
          }
        }
      }
    }
  } catch {}

  // 3. 没找到已有 Chromium → 设置 browsers path 到应用目录备用
  if (!found) {
    try {
      const { app } = require('electron');
      env.PLAYWRIGHT_BROWSERS_PATH = path.join(app.getPath('userData'), 'playwright-browsers');
    } catch {}
  }

  return env;
}

/**
 * 检测可用的 Python 路径.
 * 优先顺序：
 * 1. 打包后 resources/python/python.exe（嵌入式 Python）
 * 2. 常见 Python 安装路径
 * 3. 系统 PATH 中的 python
 */
export function findPythonPath(): string {
  // 打包后的嵌入式 Python
  try {
    const { app } = require('electron');
    const bundledPath = path.join(process.resourcesPath ?? '', 'python', 'python.exe');
    if (fs.existsSync(bundledPath)) {
      return bundledPath;
    }
  } catch {}

  // 常见 Python 安装路径
  const knownPaths = [
    'C:\\Python310\\python.exe',
    'C:\\Python311\\python.exe',
    'C:\\Python312\\python.exe',
    'C:\\Python313\\python.exe',
    `${process.env.LOCALAPPDATA}\\Programs\\Python\\Python310\\python.exe`,
    `${process.env.LOCALAPPDATA}\\Programs\\Python\\Python311\\python.exe`,
    `${process.env.LOCALAPPDATA}\\Programs\\Python\\Python312\\python.exe`,
    `${process.env.LOCALAPPDATA}\\Programs\\Python\\Python313\\python.exe`,
  ];
  for (const p of knownPaths) {
    try {
      // 跳过 Microsoft Store 版 Python（会导致 APPDATA 虚拟化路径不一致）
      if (p.includes('WindowsApps')) {
        console.warn('[PythonManager] 跳过 Microsoft Store 版 Python:', p);
        continue;
      }
      if (fs.existsSync(p)) {
        return p;
      }
    } catch {
      continue;
    }
  }
  // 回退到系统默认 python（如果路径含 WindowsApps 则排除）
  try {
    const which = execSync('where python 2>nul', { encoding: 'utf-8' }).trim().split('\n')[0]?.trim();
    if (which && !which.includes('WindowsApps')) return which;
  } catch {}
  return 'python';
}

export interface PythonExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

export interface PythonProcessOptions {
  pythonPath?: string;
  timeout?: number;
}

export class PythonManager {
  private process: ChildProcess | null = null;
  private pythonPath: string;

  constructor(options: PythonProcessOptions = {}) {
    this.pythonPath = options.pythonPath || findPythonPath();
  }

  async exec(
    scriptPath: string,
    args: string[] = [],
    options: { timeout?: number; cwd?: string; stdin?: string } = {}
  ): Promise<PythonExecResult> {
    return new Promise((resolve) => {
      const child = spawn(this.pythonPath, [scriptPath, ...args], {
        cwd: options.cwd,
        stdio: options.stdin ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
        windowsHide: false,  // 允许子进程启动 GUI 窗口（如登录浏览器）
        detached: false,
        env: {
          ...process.env,
          ...getChromiumEnv(),
          SPARK_DATA_DIR: getSharedDataDir(),
        },
      });

      if (options.stdin && child.stdin) {
        child.stdin.write(options.stdin);
        child.stdin.end();
      }

      const timeout = options.timeout ?? 30000;
      let stdout = '';
      let stderr = '';

      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (data: string) => {
        stdout += data;
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      const timer = setTimeout(() => {
        child.kill();
        resolve({
          success: false,
          stdout,
          stderr: stderr + '\nError: Process timed out',
          code: null,
        });
      }, timeout);

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          success: code === 0,
          stdout,
          stderr,
          code,
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          success: false,
          stdout,
          stderr: err.message,
          code: null,
        });
      });
    });
  }

  async execJson<T>(
    scriptPath: string,
    args: string[] = [],
    options: { timeout?: number; cwd?: string } = {}
  ): Promise<T | null> {
    const result = await this.exec(scriptPath, args, options);

    if (!result.success) {
      console.error(`Python exec failed: ${result.stderr}`);
      return null;
    }

    try {
      return JSON.parse(result.stdout) as T;
    } catch {
      console.error('Failed to parse Python output as JSON');
      return null;
    }
  }

  async execVersion(): Promise<PythonExecResult> {
    return this.exec(this.pythonPath, ['--version'], { timeout: 5000 });
  }

  kill(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }
}
