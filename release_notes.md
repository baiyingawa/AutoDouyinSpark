## v2.4.0 (2026-06-23)

### 🐛 修复
- Microsoft Store 版 Python 导致 APPDATA 虚拟化，日志/历史记录无法显示
  - 使用 Win32 API `SHGetFolderPathW(CSIDL_APPDATA)` 绕过 Store 虚拟化
  - Electron 端注入 `SPARK_DATA_DIR` 环境变量确保路径一致
  - 自动跳过 WindowsApps 路径的 Python，优先使用标准安装版
  - 计划任务 VBS 脚本改为通过 `engine.py --data-dir` 调用，统一数据目录

## v2.3.2 (2026-06-23)

### 🐛 修复
- 自动更新在 GitHub 被墙地区无法获取版本信息和下载文件的问题，新增 uu233.xyz 加速源作为备用 API 和下载源
- 下载页面路径写死导致页面无法正常显示的问题

### ✨ 新增
- 自动更新检测：GitHub API 不可用时自动降级到 uu233.xyz 代理
- 下载页进度条：XHR 流式传输带实时百分比和文件大小显示
- uu233.xyz 加速下载服务：支持 SHA256 内容寻址缓存中转

### 🔧 技术改进
- 前端资源路径改为根路径绝对路径，兼容不同部署方式
- PHP 代理改为流式传输 + Content-Length 预检，支持进度条
- download-latest.html 深色主题 UI 重构

## v2.3.0 (2026-06-21)

### 🐛 修复
- 网页登录秒跳"登录成功(0条)": 旧Cookie合并 + Playwright缓存Cookie
- 浏览器打不开: C盘满致Chromium缺失, 自动扫描已有版本 + PLAYWRIGHT_BROWSERS_PATH到应用目录
- 登录后立刻变未登录: cookieValid改为默认false, 仅缓存实测valid才true
- 重启应用需要重新登录: 删除了启动时清除登录缓存的代码
- 未登录时后台持续续火花: scheduler用纯文件检查(不开浏览器), main()加cookie文件存在检查
- 强制发送跨页面事件丢失: CustomEvent改为navigate state
- 多个浏览器并发: _acquire_lock全局互斥 + PID日志
- 搜索框匹配错误: 删掉[contenteditable=true], 只匹配搜索类input
- 登录过期三道防线: 主页/聊天页/搜索框超时 三处都检测登录弹窗
- _find_user_by_scroll未定义, browser_pid初始化
- 侧栏展开/折叠图标交换

### ✨ 新增
- getChromiumEnv(): 自动扫描ms-playwright目录 + PLAYWRIGHT_BROWSERS_PATH到应用目录
- app.requestSingleInstanceLock() 防多开, 切到前台
- scheduler: 检测到登录过期自动弹窗+切登录页
- engine.py: 登录成功写valid缓存 + status默认false
- 前端: onLoginExpired事件, 强制跳登录页, 底栏响应
- login_helper: clear_cookies + 5条最低门槛
- 应用启动不再清除登录缓存, 靠1h过期机制
