/**
 * tray.ts - 系统托盘
 *
 * 功能:
 * - 创建系统托盘图标
 * - 右键菜单：显示窗口、立即发送、退出
 * - 关闭窗口时最小化到托盘
 * - 点击托盘图标显示窗口
 */

import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron';
import path from 'path';
import { getDefaultScheduler } from './scheduler';
import { pythonEngine } from './python-engine';

let tray: Tray | null = null;

/**
 * 生成托盘图标（16x16 红色火花图案）
 * 如果 resources/tray-icon.png 存在则使用它，否则生成一个内置图标
 */
function createTrayIcon(): Electron.NativeImage {
  // 优先尝试加载外部图标文件
  const iconPaths = [
    path.join(__dirname, '..', '..', 'resources', 'tray-icon.png'),
    path.join(__dirname, '..', '..', 'resources', 'icon.png'),
  ];

  for (const iconPath of iconPaths) {
    try {
      const img = nativeImage.createFromPath(iconPath);
      if (!img.isEmpty()) {
        return img.resize({ width: 16, height: 16 });
      }
    } catch {
      continue;
    }
  }

  // 生成内置图标：16x16 红色圆点
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const r = 5; // 圆半径

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 4;

      if (dist <= r) {
        // 红色渐变填充
        const alpha = Math.max(0, Math.min(255, Math.round((1 - dist / r) * 255)));
        canvas[idx] = 233;     // R
        canvas[idx + 1] = 69;  // G
        canvas[idx + 2] = 96;  // B
        canvas[idx + 3] = alpha;
      } else {
        canvas[idx] = 0;
        canvas[idx + 1] = 0;
        canvas[idx + 2] = 0;
        canvas[idx + 3] = 0;
      }
    }
  }

  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

/**
 * 创建或重新创建托盘
 */
export function createTray(mainWindow: BrowserWindow): Tray {
  // 如果已存在，先销毁
  if (tray) {
    tray.destroy();
  }

  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('AutoDouyinSpark');

  // 点击托盘图标显示窗口
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // 右键菜单
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: '立即发送',
      click: async () => {
        const scheduler = getDefaultScheduler();
        try {
          await scheduler.checkAndExecute();
        } catch (err) {
          console.error('[Tray] 立即发送失败:', err);
        }
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        (app as any).isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  return tray;
}

/**
 * 销毁托盘
 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

/**
 * 获取托盘实例（供外部使用）
 */
export function getTray(): Tray | null {
  return tray;
}
