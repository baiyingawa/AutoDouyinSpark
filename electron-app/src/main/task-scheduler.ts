/**
 * task-scheduler.ts - Windows 计划任务管理
 *
 * 管理 \AutoDouyinSparkEngine 计划任务的生命周期：
 * - 启动时确认任务存在
 * - 用户登录 Windows 后自动触发执行
 * - 登录/导入 Cookie 后重新确认
 *
 * 任务触发条件（双触发器）：
 * 1. Windows 用户登录时 → 立即执行一次
 * 2. 每小时重复（第一次执行后每 60 分钟自动触发）
 */
import { app } from 'electron';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getDataRootDir } from './shared-data-dir';

const TASK_NAME = '\\AutoDouyinSparkEngine';

export interface WindowsTaskStatus {
  exists: boolean;
  state: string | null;
  enabled: boolean;
  nextRunTime: string | null;
  lastRunTime: string | null;
  lastResult: string | null;
}

export function getSparkSchedulerTaskStatus(): Promise<WindowsTaskStatus> {
  return new Promise((resolve) => {
    exec(`schtasks /Query /TN "${TASK_NAME}" /V /FO LIST`, (err, stdout) => {
      if (err) {
        resolve({ exists: false, state: null, enabled: false, nextRunTime: null, lastRunTime: null, lastResult: null });
        return;
      }
      const value = (label: string): string | null => {
        const line = stdout.split(/\r?\n/).find((item) => item.trimStart().startsWith(`${label}:`));
        return line ? line.substring(line.indexOf(':') + 1).trim() || null : null;
      };
      const state = value('Status');
      const taskState = value('Scheduled Task State');
      resolve({
        exists: true,
        state,
        enabled: taskState !== 'Disabled' && state !== 'Disabled',
        nextRunTime: value('Next Run Time'),
        lastRunTime: value('Last Run Time'),
        lastResult: value('Last Result'),
      });
    });
  });
}

/**
 * 确认 Windows 计划任务存在且配置正确。
 * - 不存在 → 创建（双触发器：登录时 + 每小时重复）
 * - 已存在 → 更新为最新配置（XML 覆盖）
 *
 * 在以下时机调用：
 * - App 启动时（index.ts）
 * - 用户登录/导入 Cookie 成功后（auth.ipc.ts）
 */
export function ensureSparkSchedulerTask(): void {
  createSparkSchedulerTask();
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function genTaskXml(appPath: string, userSid: string): string {
  const vbsPath = xmlEscape(path.join(appPath, 'engine_silent.vbs'));
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Date>2026-06-20T00:00:00</Date>
    <Author>AutoDouyinSpark</Author>
    <URI>\\AutoDouyinSparkEngine</URI>
  </RegistrationInfo>
  <Principals>
    <Principal id="Author">
      <UserId>${xmlEscape(userSid)}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <Enabled>true</Enabled>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT72H</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
    <TimeTrigger>
      <StartBoundary>2026-06-20T00:00:00</StartBoundary>
      <Repetition>
        <Interval>PT1H</Interval>
      </Repetition>
      <Enabled>true</Enabled>
    </TimeTrigger>
  </Triggers>
  <Actions Context="Author">
    <Exec>
      <Command>wscript.exe</Command>
      <Arguments>&quot;${vbsPath}&quot;</Arguments>
    </Exec>
  </Actions>
</Task>`;
}

function createSparkSchedulerTask(): void {
  const appPath = app.isPackaged
    ? path.dirname(app.getPath('exe'))
    : 'E:\\PROJECT\\AutoDouyinSpark';

  const vbsPath = path.join(appPath, 'engine_silent.vbs');

  // Python 脚本路径
  // 打包后: <exe_dir>\resources\python\engine.py
  // 开发中: <project_root>\electron-app\python\engine.py
  const enginePy = app.isPackaged
    ? path.join(appPath, 'resources', 'python', 'engine.py')
    : path.join(appPath, 'electron-app', 'python', 'engine.py');

  // 总是重新生成 VBS，确保路径正确（覆盖旧版本错误路径）
  {
    const escapedPath = appPath.replace(/'/g, "''");
    // 传入根目录，由 engine.py 每次运行时解析当前账户，切换账户无需重写任务。
    const dataDir = getDataRootDir();
    const vbsContent = `' AutoDouyinSpark 静默运行脚本（通过 engine.py 统一数据目录）
Dim shell
Set shell = CreateObject("WScript.Shell")
    shell.Run "cmd /c cd /d ${escapedPath} && python ""${enginePy.replace(/'/g, "''")}"" --data-dir ""${dataDir.replace(/'/g, "''")}"" --action send-all --json", 0, False
Set shell = Nothing`;
    fs.writeFileSync(vbsPath, vbsContent, 'utf-8');
  }

  // 用 whoami 获取当前用户 SID，避免使用另一台机器/旧账户的固定 SID。
  exec('whoami /user', { windowsHide: true }, (sidErr, sidStdout) => {
    const sid = sidStdout.match(/S-1-\d+(?:-\d+)+/)?.[0];
    if (sidErr || !sid) {
      console.error('创建计划任务失败：无法获取当前用户 SID');
      createFallbackSchedulerTask(vbsPath);
      return;
    }

    // 用 XML 创建任务（支持双触发器：登录时 + 每小时重复）。
    // XML 声明为 UTF-16，必须写入 BOM，否则 schtasks 会在 (1,2) 报 XML 格式错误。
    const xmlPath = path.join(appPath, 'spark_task.xml');
    const xmlContent = genTaskXml(appPath, sid);
    fs.writeFileSync(xmlPath, `\uFEFF${xmlContent}`, 'utf-16le');

    const createCmd = `schtasks /Create /TN "${TASK_NAME}" /XML "${xmlPath}" /F`;
    exec(createCmd, { windowsHide: true }, (err, stdout) => {
    // 清理临时 XML
    try { fs.unlinkSync(xmlPath); } catch {}
    if (err) {
      console.error('创建计划任务失败，尝试降级模式');
      createFallbackSchedulerTask(vbsPath);
    } else {
      console.log('计划任务已创建（登录触发+每小时重复）:', stdout);
    }
    });
  });
}

function createFallbackSchedulerTask(vbsPath: string): void {
  const fallbackCmd = `schtasks /Create /TN "${TASK_NAME}" /TR "wscript.exe \\"${vbsPath}\\"" /SC HOURLY /MO 1 /ST 23:29 /F /RL HIGHEST`;
  exec(fallbackCmd, { windowsHide: true }, (err2, stdout2) => {
    if (err2) {
      console.error('降级创建计划任务也失败');
    } else {
      console.log('计划任务已创建（降级模式）:', stdout2);
    }
  });
}
