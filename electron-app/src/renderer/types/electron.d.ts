export interface SparkStatusResult {
  success: boolean;
  sentToday: boolean;
  streak: number;
  days: Record<string, number>;
  cookieValid: boolean;
  avatars?: Record<string, string>;
  lastSend: string | null;
  schedulerRunning: boolean | null;
}

export interface SparkSendResult {
  success: boolean;
  sentCount: number;
  failCount: number;
  failedUsers: string[];
  screenshots: string[];
  message?: string;
  error?: string;
}

export interface LoginQrcodeResult {
  success: boolean;
  cookieCount?: number;
  loginMethod?: string;
  elapsed?: number;
  browserPid?: number | null;
  error?: string;
}

export interface LoginPollResult {
  success: boolean;
  status: 'pending' | 'success' | 'failed' | 'expired';
  cookieCount?: number;
}

export interface LoginCheckResult {
  success: boolean;
  valid: boolean;
  checkedAt?: string;
  error?: string;
}

export interface FriendsListResult {
  success: boolean;
  users: string[];
}

export interface HistorySparkDaysResult {
  success: boolean;
  records: Array<{
    date: string;
    days: Record<string, number>;
    prev_days?: Record<string, number>;
  }>;
}

export interface ScreenshotsListResult {
  success: boolean;
  files: Array<{
    name: string;
    size: number;
    mtime: string;
  }>;
  count: number;
}

export interface ScreenshotDataResult {
  success: boolean;
  data?: string;
  filename?: string;
  error?: string;
}

export interface EmailConfigLoadResult {
  success: boolean;
  exists: boolean;
  config?: {
    email: string;
    auth_code: string;
    smtp_host: string;
    smtp_port: number;
    smtp_use_ssl: boolean;
    alert_recipients: string[];
  } | null;
  error?: string;
}

export interface AppConfigLoadResult {
  success: boolean;
  exists: boolean;
  config?: {
    morningStart: number;
    morningEnd: number;
    eveningStart: number;
    eveningEnd: number;
    messageTemplate: string;
    autoStart: boolean;
  };
  error?: string;
}

export interface ElectronAPI {
  // Python 子进程管理
  pythonExec: (scriptPath: string, args: string[]) => Promise<any>;
  pythonKill: () => Promise<{ success: boolean }>;
  pythonStatus: () => Promise<{ running: boolean }>;

  // 登录相关
  authStartQrcode: () => Promise<LoginQrcodeResult>;
  authPollQrcodeStatus: () => Promise<LoginPollResult>;
  authImportCookie: (cookieJson: string) => Promise<{ success: boolean; cookieCount?: number; error?: string }>;
  authCheckStatus: () => Promise<LoginCheckResult>;
  authLogout: () => Promise<{ success: boolean }>;

  // Cookie 管理
  cookieEncrypt: (text: string, secret: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  cookieDecrypt: (encryptedText: string, secret: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  cookieSave: () => Promise<{ success: boolean }>;
  cookieLoad: () => Promise<{ success: boolean; data: any }>;

  // 好友管理
  friendsList: () => Promise<FriendsListResult>;
  friendsAdd: (username: string) => Promise<{ success: boolean; error?: string }>;
  friendsRemove: (username: string) => Promise<{ success: boolean; error?: string }>;

  // 续火花
  sparkSend: (force?: boolean) => Promise<SparkSendResult>;
  sparkStatus: () => Promise<SparkStatusResult>;
  sparkRefreshDays: (force?: boolean) => Promise<{ success: boolean }>;
  sparkSchedulerStatus: () => Promise<{ success: boolean; running: boolean }>;

  // 历史
  historySparkDays: () => Promise<HistorySparkDaysResult>;
  historyScreenshots: () => Promise<ScreenshotsListResult>;
  historyScreenshotData: (filename: string) => Promise<ScreenshotDataResult>;

  // 设置
  settingsLoadEmail: () => Promise<EmailConfigLoadResult>;
  settingsSaveEmail: (config: any) => Promise<{ success: boolean; error?: string }>;
  settingsLoadApp: () => Promise<AppConfigLoadResult>;
  settingsSaveApp: (config: any) => Promise<{ success: boolean; error?: string }>;
  sendTestEmail: (configJson: string) => Promise<{ success: boolean; sent?: boolean; error?: string }>;
  settingsGetAutoStart: () => Promise<{ success: boolean; enabled: boolean }>;
  settingsSetAutoStart: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  settingsGetAutoStartPrompted: () => Promise<{ success: boolean; prompted: boolean }>;

  // 发送相关
  sendVideo: () => Promise<{ success: boolean; taskId: any }>;
  sendStatus: () => Promise<{ success: boolean; status: string }>;
  sendHistory: () => Promise<{ success: boolean; data: any[] }>;

  // 日志
  logGet: (lineCount?: number) => Promise<{ success: boolean; data: any[] }>;
  logClear: () => Promise<{ success: boolean }>;

  // 通用
  appVersion: () => Promise<{ success: boolean; version: string }>;
  appQuit: () => Promise<{ success: boolean }>;

  // 窗口控制
  windowMinimize: () => Promise<{ success: boolean }>;
  windowMaximize: () => Promise<{ success: boolean; maximized: boolean }>;
  windowCloseDialog: () => Promise<{ action: 'tray' | 'quit' | 'cancel' }>;
  windowIsMaximized: () => Promise<{ maximized: boolean }>;

  // 更新
  updateCheck: () => Promise<{
    hasUpdate: boolean;
    latestVersion: string;
    currentVersion: string;
    downloadUrl: string | null;
    releaseNotes: string | null;
    releaseUrl: string | null;
  }>;
  updateDownload: (downloadUrl: string) => Promise<{ success: boolean; error?: string }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
