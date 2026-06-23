/**
 * updater.ts - 自动更新模块
 *
 * 从 GitHub Releases API 获取最新版本，与本地版本对比。
 * 有新版本时弹窗提醒，用户确认后下载安装包并打开。
 */

import { app, dialog, BrowserWindow } from 'electron';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import https from 'https';
import { EventEmitter } from 'events';

const REPO_OWNER = 'baiyingawa';
const REPO_NAME = 'AutoDouyinSpark';
const GITHUB_API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const PROXY_API = `https://www.uu233.xyz/api/gh-proxy.php?path=repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const PROXY_DOWNLOAD = 'https://www.uu233.xyz/api/dl-proxy.php';

export interface UpdateInfo {
  hasUpdate: boolean;
  latestVersion: string;
  currentVersion: string;
  downloadUrl: string | null;
  releaseNotes: string | null;
  releaseUrl: string | null;
}

export class AppUpdater extends EventEmitter {
  private updateInfo: UpdateInfo | null = null;
  private checking = false;
  private usingProxy = false;

  /** 获取本地版本号 */
  getCurrentVersion(): string {
    try {
      return app.getVersion() || '0.0.0';
    } catch {
      return '0.0.0';
    }
  }

  /** 从 GitHub API 获取最新版本信息 */
  async checkForUpdate(): Promise<UpdateInfo> {
    if (this.checking) {
      return this.updateInfo || {
        hasUpdate: false,
        latestVersion: '',
        currentVersion: this.getCurrentVersion(),
        downloadUrl: null,
        releaseNotes: null,
        releaseUrl: null,
      };
    }

    this.checking = true;
    this.usingProxy = false;
    const currentVersion = this.getCurrentVersion();

    try {
      let releaseData;
      let downloadUrl: string | null;

      try {
        // 1. 先尝试 GitHub API
        releaseData = await this.fetchJson(GITHUB_API);
      } catch {
        // 2. 失败则走 uu233.xyz 加速源
        console.warn('[Updater] GitHub API 不可用，尝试加速源...');
        releaseData = await this.fetchJson(PROXY_API);
        this.usingProxy = true;
      }

      const latestVersion = (releaseData.tag_name || '').replace(/^v/, '');
      downloadUrl = this.findInstallerUrl(releaseData.assets);
      const releaseUrl = releaseData.html_url || null;
      const releaseNotes = releaseData.body || null;

      // 3. 走加速源时，下载链接也替换成代理地址
      if (this.usingProxy && downloadUrl) {
        const ghPath = downloadUrl.replace('https://github.com/', '');
        downloadUrl = `${PROXY_DOWNLOAD}?path=${encodeURIComponent(ghPath)}`;
      }

      const hasUpdate = this.compareVersions(latestVersion, currentVersion) > 0;

      this.updateInfo = {
        hasUpdate,
        latestVersion,
        currentVersion,
        downloadUrl,
        releaseNotes: releaseNotes ? releaseNotes.substring(0, 500) : null,
        releaseUrl,
      };
    } catch (err) {
      console.error('[Updater] 检查更新失败:', err);
      this.updateInfo = {
        hasUpdate: false,
        latestVersion: '',
        currentVersion,
        downloadUrl: null,
        releaseNotes: null,
        releaseUrl: null,
      };
    }

    this.checking = false;
    this.emit('update-checked', this.updateInfo);
    return this.updateInfo;
  }

  /** 下载并打开安装包 */
  async downloadAndInstall(win: BrowserWindow, downloadUrl: string): Promise<boolean> {
    try {
      // 确保走加速源时也替换下载链接
      let actualUrl = downloadUrl;
      if (this.usingProxy && actualUrl.startsWith('https://github.com/')) {
        const ghPath = actualUrl.replace('https://github.com/', '');
        actualUrl = `${PROXY_DOWNLOAD}?path=${encodeURIComponent(ghPath)}`;
      }

      const savePath = path.join(app.getPath('downloads'), `AutoDouyinSpark-Update.exe`);

      win.webContents.send('update:download-progress', { progress: 0, status: 'downloading' });

      await this.downloadFile(actualUrl, savePath, (progress) => {
        win.webContents.send('update:download-progress', { progress, status: 'downloading' });
      });

      win.webContents.send('update:download-progress', { progress: 100, status: 'done' });

      // 打开安装包
      exec(`"${savePath}"`, (err) => {
        if (err) {
          console.error('[Updater] 打开安装包失败:', err);
        }
      });

      return true;
    } catch (err) {
      console.error('[Updater] 下载安装包失败:', err);
      win.webContents.send('update:download-progress', { progress: 0, status: 'error', error: String(err) });
      return false;
    }
  }

  /** 从 assets 中查找安装包下载链接 */
  private findInstallerUrl(assets: any[]): string | null {
    if (!Array.isArray(assets)) return null;
    // 按优先级查找
    const names = ['Setup', 'installer', '.exe'];
    for (const asset of assets) {
      if (!asset.name || !asset.browser_download_url) continue;
      for (const name of names) {
        if (asset.name.includes(name)) {
          return asset.browser_download_url;
        }
      }
    }
    return assets[0]?.browser_download_url || null;
  }

  /** 获取 JSON */
  private fetchJson(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const req = https.get(url, {
        headers: {
          'User-Agent': 'AutoDouyinSpark-Updater/2.0',
          'Accept': 'application/vnd.github.v3+json',
        },
        timeout: 10000,
      }, (res) => {
        if (res.statusCode === 302 && res.headers.location) {
          this.fetchJson(res.headers.location).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
  }

  /** 下载文件并报告进度 */
  private downloadFile(url: string, dest: string, onProgress: (pct: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest);
      const req = https.get(url, {
        headers: { 'User-Agent': 'AutoDouyinSpark-Updater/2.0' },
        timeout: 300000,
      }, (res) => {
        if (res.statusCode === 302 && res.headers.location) {
          this.downloadFile(res.headers.location, dest, onProgress).then(resolve).catch(reject);
          return;
        }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let downloaded = 0;
        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length;
          if (total > 0) {
            onProgress(Math.round((downloaded / total) * 100));
          }
        });
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
  }

  /** 比较版本号，返回 1(新)/0(同)/-1(旧) */
  private compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] || 0;
      const nb = pb[i] || 0;
      if (na > nb) return 1;
      if (na < nb) return -1;
    }
    return 0;
  }
}

// 全局单例
let _updater: AppUpdater | null = null;
export function getAppUpdater(): AppUpdater {
  if (!_updater) _updater = new AppUpdater();
  return _updater;
}
