import { spawn, ChildProcess, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * 检测可用的 Python 路径.
 * 优先使用已知包含 Playwright 的 Python 3.10，
 * 其次尝试系统默认 python。
 */
export function findPythonPath(): string {
  // 已知的含 Playwright 的 Python 路径
  const knownPaths = [
    'C:\\Users\\Yu\\AppData\\Local\\Programs\\Python\\Python310\\python.exe',
    'D:\\python\\python.exe',
  ];
  for (const p of knownPaths) {
    try {
      if (fs.existsSync(p)) {
        return p;
      }
    } catch {
      continue;
    }
  }
  // 回退到系统默认 python
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
