import { ipcMain } from 'electron';
import { dialog } from 'electron';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { createProfile, deleteProfile, getProfileDir, getSharedDataDir, listProfiles, setProfilePaused, switchProfile, updateProfile } from '../shared-data-dir';
import { pythonEngine } from '../python-engine';
import { getDefaultScheduler } from '../scheduler';
import { LogManager } from '../log-manager';

const execFileAsync = promisify(execFile);

export function registerProfileHandlers(logManager: LogManager): void {
  ipcMain.handle(IPC_CHANNELS.PROFILES_LIST, async () => ({ success: true, profiles: listProfiles() }));

  ipcMain.handle(IPC_CHANNELS.PROFILES_CREATE, async (_event, name?: string) => {
    try {
      await pythonEngine.loginAbort();
      const scheduler = getDefaultScheduler();
      scheduler.stop();
      const profile = createProfile(typeof name === 'string' ? name : '');
      switchProfile(profile.id);
      logManager.init(path.join(getSharedDataDir(), '.spark_log'));
      scheduler.start();
      return { success: true, profile };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROFILES_SWITCH, async (_event, id: string) => {
    try {
      await pythonEngine.loginAbort();
      const scheduler = getDefaultScheduler();
      scheduler.stop();
      const profile = switchProfile(String(id || ''));
      logManager.init(path.join(getSharedDataDir(), '.spark_log'));
      scheduler.start();
      return { success: true, profile };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROFILES_UPDATE, async (_event, id: string, name: string, note: string) => {
    try {
      return { success: true, profile: updateProfile(String(id || ''), String(name || ''), String(note || '')) };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROFILES_DELETE, async (_event, id: string) => {
    try {
      await pythonEngine.loginAbort();
      const scheduler = getDefaultScheduler();
      scheduler.stop();
      const profile = deleteProfile(String(id || ''));
      logManager.init(path.join(getSharedDataDir(), '.spark_log'));
      scheduler.start();
      return { success: true, profile };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROFILES_EXPORT, async (_event, id: string) => {
    try {
      const profileDir = getProfileDir(String(id || ''));
      const profile = listProfiles().find((item) => item.id === String(id || ''));
      const result = await dialog.showSaveDialog({
        title: '导出账户数据',
        defaultPath: path.join(require('electron').app.getPath('downloads'), `${profile?.name || '账户'}-${id}.zip`),
        filters: [{ name: '账户备份', extensions: ['zip'] }],
      });
      if (result.canceled || !result.filePath) return { success: true, canceled: true };
      const script = "$source=$args[0];$dest=$args[1];Compress-Archive -Path (Join-Path $source '*') -DestinationPath $dest -Force";
      await execFileAsync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script, '--', profileDir, result.filePath], { windowsHide: true });
      return { success: true, path: result.filePath };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROFILES_PAUSE, async (_event, id: string, paused: boolean) => {
    try {
      return { success: true, profile: setProfilePaused(String(id || ''), Boolean(paused)) };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}
