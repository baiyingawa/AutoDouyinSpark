export const IPC_CHANNELS = {
  // Python 子进程管理
  PYTHON_EXEC: 'python:exec',
  PYTHON_KILL: 'python:kill',
  PYTHON_STATUS: 'python:status',

  // 登录相关
  AUTH_START_QRCODE: 'auth:start-qrcode',
  AUTH_POLL_QRCODE_STATUS: 'auth:poll-qrcode-status',
  AUTH_IMPORT_COOKIE: 'auth:import-cookie',
  AUTH_CHECK_STATUS: 'auth:check-status',
  AUTH_LOGOUT: 'auth:logout',

  // Cookie 管理
  COOKIE_ENCRYPT: 'cookie:encrypt',
  COOKIE_DECRYPT: 'cookie:decrypt',
  COOKIE_SAVE: 'cookie:save',
  COOKIE_LOAD: 'cookie:load',

  // 好友管理
  FRIENDS_LIST: 'friends:list',
  FRIENDS_ADD: 'friends:add',
  FRIENDS_REMOVE: 'friends:remove',

  // 续火花
  SPARK_SEND: 'spark:send',
  SPARK_STATUS: 'spark:status',
  SPARK_REFRESH_DAYS: 'spark:refresh-days',
  SPARK_SCHEDULER_STATUS: 'spark:scheduler-status',

  // 历史
  HISTORY_SPARK_DAYS: 'history:spark-days',
  HISTORY_SCREENSHOTS: 'history:screenshots',
  HISTORY_SCREENSHOT_DATA: 'history:screenshot-data',

  // 设置
  SETTINGS_LOAD_EMAIL: 'settings:load-email',
  SETTINGS_SAVE_EMAIL: 'settings:save-email',
  SETTINGS_LOAD_APP: 'settings:load-app',
  SETTINGS_SAVE_APP: 'settings:save-app',
  SETTINGS_TEST_EMAIL: 'settings:test-email',
  SETTINGS_GET_AUTO_START: 'settings:getAutoStart',
  SETTINGS_SET_AUTO_START: 'settings:setAutoStart',
  SETTINGS_GET_AUTO_START_PROMPTED: 'settings:getAutoStartPrompted',
  SETTINGS_SET_AUTO_START_PROMPTED: 'settings:setAutoStartPrompted',
  SETTINGS_PROMPT_AUTO_START: 'settings:promptAutoStart',

  // 发送相关
  SEND_VIDEO: 'send:video',
  SEND_STATUS: 'send:status',
  SEND_HISTORY: 'send:history',

  // 日志
  LOG_GET: 'log:get',
  LOG_CLEAR: 'log:clear',
  LOG_WATCH: 'log:watch',

  // 通用
  APP_VERSION: 'app:version',
  APP_QUIT: 'app:quit',

  // 窗口控制
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE_DIALOG: 'window:close-dialog',
  WINDOW_IS_MAXIMIZED: 'window:is-maximized',

  // 更新
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
