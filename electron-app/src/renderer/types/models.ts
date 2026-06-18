// src/renderer/types/models.ts - 应用数据模型

/** 登录状态 */
export interface AuthStatus {
  loggedIn: boolean;
  valid: boolean;
  checkedAt: string;
  cookieExists: boolean;
}

/** 火花状态概览 */
export interface SparkStatus {
  success: boolean;
  sentToday: boolean;
  streak: number;
  days: Record<string, number>;
  cookieValid: boolean;
  lastSend: string | null;
  schedulerRunning: boolean | null;
}

/** 好友信息 */
export interface FriendInfo {
  username: string;
  sparkDays: number;
  lastSendDate?: string;
}

/** 应用设置 */
export interface AppSettings {
  morningStart: number;
  morningEnd: number;
  eveningStart: number;
  eveningEnd: number;
  messageTemplate: string;
  autoStart: boolean;
}

/** 邮箱配置 */
export interface EmailConfig {
  email: string;
  auth_code: string;
  smtp_host: string;
  smtp_port: number;
  smtp_use_ssl: boolean;
  alert_recipients: string[];
}

/** 截图信息 */
export interface ScreenshotInfo {
  name: string;
  size: number;
  mtime: string;
}

/** 历史记录条目 */
export interface SparkDayRecord {
  date: string;
  days: Record<string, number>;
  prev_days?: Record<string, number>;
}

/** Python 引擎执行结果 */
export interface PythonExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

/** 登录二维码结果 */
export interface LoginQrcodeResult {
  success: boolean;
  qrcodePath?: string;
  browserPid?: number | null;
  error?: string;
}

/** 登录轮询结果 */
export interface LoginPollResult {
  success: boolean;
  status: 'pending' | 'success' | 'failed' | 'expired';
}

/** 登录检测结果 */
export interface LoginCheckResult {
  success: boolean;
  valid: boolean;
  checkedAt?: string;
  error?: string;
}

/** 发送结果 */
export interface SparkSendResult {
  success: boolean;
  sentCount: number;
  failCount: number;
  screenshots: string[];
  message?: string;
}

/** 好友列表结果 */
export interface FriendsListResult {
  success: boolean;
  users: string[];
}

/** 调度器状态 */
export interface SchedulerStatusData {
  running: boolean;
  currentWindow: string | null;
  lastCheck: string | null;
  nextAction: string | null;
}

/** 历史火花天数结果 */
export interface SparkDaysHistoryResult {
  success: boolean;
  records: SparkDayRecord[];
}

/** 截图列表结果 */
export interface ScreenshotsListResult {
  success: boolean;
  files: ScreenshotInfo[];
  count: number;
}

/** 截图数据结果 */
export interface ScreenshotDataResult {
  success: boolean;
  data?: string;
  filename?: string;
  error?: string;
}

/** Email 配置加载结果 */
export interface EmailConfigLoadResult {
  success: boolean;
  config?: EmailConfig;
  exists: boolean;
  error?: string;
}
