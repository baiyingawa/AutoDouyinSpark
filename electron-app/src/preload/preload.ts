import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';

const electronAPI = {
  // Python 子进程管理
  pythonExec: (scriptPath: string, args: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.PYTHON_EXEC, scriptPath, args),
  pythonKill: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PYTHON_KILL),
  pythonStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PYTHON_STATUS),

  // 登录相关
  authStartQrcode: () =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_START_QRCODE),
  authPollQrcodeStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_POLL_QRCODE_STATUS),
  authImportCookie: (cookieJson: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_IMPORT_COOKIE, cookieJson),
  authCheckStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_CHECK_STATUS),
  authLogout: () =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT),

  // Cookie 管理
  cookieEncrypt: (text: string, secret: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.COOKIE_ENCRYPT, text, secret),
  cookieDecrypt: (encryptedText: string, secret: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.COOKIE_DECRYPT, encryptedText, secret),
  cookieSave: () =>
    ipcRenderer.invoke(IPC_CHANNELS.COOKIE_SAVE),
  cookieLoad: () =>
    ipcRenderer.invoke(IPC_CHANNELS.COOKIE_LOAD),

  // 好友管理
  friendsList: () =>
    ipcRenderer.invoke(IPC_CHANNELS.FRIENDS_LIST),
  friendsAdd: (username: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.FRIENDS_ADD, username),
  friendsRemove: (username: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.FRIENDS_REMOVE, username),

  // 续火花
  sparkSend: (force?: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.SPARK_SEND, force),
  sparkStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SPARK_STATUS),
  sparkRefreshDays: (force = false) =>
    ipcRenderer.invoke(IPC_CHANNELS.SPARK_REFRESH_DAYS, force),
  sparkSchedulerStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SPARK_SCHEDULER_STATUS),

  // 历史
  historySparkDays: () =>
    ipcRenderer.invoke(IPC_CHANNELS.HISTORY_SPARK_DAYS),
  historyScreenshots: () =>
    ipcRenderer.invoke(IPC_CHANNELS.HISTORY_SCREENSHOTS),
  historyScreenshotData: (filename: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.HISTORY_SCREENSHOT_DATA, filename),

  // 设置
  settingsLoadEmail: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_LOAD_EMAIL),
  settingsSaveEmail: (config: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SAVE_EMAIL, config),
  settingsLoadApp: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_LOAD_APP),
  settingsSaveApp: (config: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SAVE_APP, config),
  sendTestEmail: (configJson: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_TEST_EMAIL, configJson),
  settingsGetAutoStart: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_AUTO_START),
  settingsSetAutoStart: (enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET_AUTO_START, enabled),
  settingsGetAutoStartPrompted: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_AUTO_START_PROMPTED),

  // 发送相关
  sendVideo: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SEND_VIDEO),
  sendStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SEND_STATUS),
  sendHistory: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SEND_HISTORY),

  // 日志
  logGet: (lineCount?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.LOG_GET, lineCount),
  logClear: () =>
    ipcRenderer.invoke(IPC_CHANNELS.LOG_CLEAR),

  // 通用
  appVersion: () =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION),
  appQuit: () =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_QUIT),

  // 窗口控制
  windowMinimize: () =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
  windowMaximize: () =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE),
  windowCloseDialog: () =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE_DIALOG),
  windowIsMaximized: () =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),

  // 更新
  updateCheck: () =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK),
  updateDownload: (downloadUrl: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_DOWNLOAD, downloadUrl),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
