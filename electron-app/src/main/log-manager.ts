import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

export class LogManager extends EventEmitter {
  private logPath: string;
  private watchInterval: NodeJS.Timeout | null = null;
  private lastSize: number = 0;

  constructor(logPath?: string) {
    super();
    this.logPath = logPath || path.join(process.cwd(), '.spark_log');
  }

  /** 初始化日志路径（可在构造函数之后调用以覆盖默认路径） */
  init(logPath: string): void {
    this.logPath = logPath;
    // 重置文件大小指针，确保从新文件的正确位置开始读取
    try {
      if (fs.existsSync(this.logPath)) {
        this.lastSize = fs.statSync(this.logPath).size;
      } else {
        this.lastSize = 0;
      }
    } catch {
      this.lastSize = 0;
    }
  }

  startWatching(intervalMs: number = 1000): void {
    if (this.watchInterval) return;

    try {
      if (fs.existsSync(this.logPath)) {
        this.lastSize = fs.statSync(this.logPath).size;
      }
    } catch {
      this.lastSize = 0;
    }

    this.watchInterval = setInterval(() => {
      this.pollNewLogs();
    }, intervalMs);
  }

  stopWatching(): void {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }
  }

  private pollNewLogs(): void {
    try {
      if (!fs.existsSync(this.logPath)) {
        return;
      }

      const stats = fs.statSync(this.logPath);
      if (stats.size <= this.lastSize) {
        return;
      }

      const fd = fs.openSync(this.logPath, 'r');
      const buffer = Buffer.alloc(stats.size - this.lastSize);
      fs.readSync(fd, buffer, 0, buffer.length, this.lastSize);
      fs.closeSync(fd);

      this.lastSize = stats.size;
      const content = buffer.toString('utf8');
      const lines = content.split('\n').filter((l) => l.trim());

      for (const line of lines) {
        const entry = this.parseLogLine(line);
        if (entry) {
          this.emit('log', entry);
        }
      }
    } catch {
      // 忽略文件读取错误
    }
  }

  private parseLogLine(line: string): LogEntry | null {
    // 支持格式: [2024-01-01 12:00:00] message（实际日志格式，无 LEVEL 字段）
    const match = line.match(/^\[(.+?)\]\s+(.+)$/);
    if (match) {
      return {
        timestamp: match[1],
        level: 'INFO',
        message: match[2],
      };
    }

    // 回退格式: 整行作为一个消息
    return {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: line,
    };
  }

  async getRecentLogs(lineCount: number = 100): Promise<LogEntry[]> {
    try {
      if (!fs.existsSync(this.logPath)) {
        return [];
      }

      const content = fs.readFileSync(this.logPath, 'utf8');
      const lines = content.split('\n').filter((l: string) => l.trim());
      const recentLines = lines.slice(-lineCount);

      return recentLines
        .map((line: string) => this.parseLogLine(line))
        .filter((entry: LogEntry | null): entry is LogEntry => entry !== null);
    } catch {
      return [];
    }
  }

  /** 清空日志内容 */
  clearLogs(): void {
    try {
      fs.writeFileSync(this.logPath, '', 'utf8');
      this.lastSize = 0;
    } catch {
      // 忽略写入错误
    }
  }
}
