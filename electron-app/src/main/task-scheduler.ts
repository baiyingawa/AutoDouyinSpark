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
import { getSharedDataDir } from './shared-data-dir';

const TASK_NAME = '\\AutoDouyinSparkEngine';

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

function genTaskXml(appPath: string): string {
  const vbsPath = path.join(appPath, 'engine_silent.vbs').replace(/\\/g, '\\\\');
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Date>2026-06-20T00:00:00</Date>
    <Author>AutoDouyinSpark</Author>
    <URI>\\AutoDouyinSparkEngine</URI>
  </RegistrationInfo>
  <Principals>
    <Principal id="Author">
      <UserId>S-1-5-21-1635502149-4140466590-1257051598-1000</UserId>
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
      <Arguments>"${vbsPath}"</Arguments>
    </Exec>
  </Actions>
</Task>`;
}

function createSparkSchedulerTask(): void {
  const appPath = app.isPackaged
    ? path.dirname(app.getPath('exe'))
    : 'E:\\PROJECT\\AutoDouyinSpark';

  const vbsPath = path.join(appPath, 'engine_silent.vbs');

  // 如果 VBS 不存在，自动生成
  if (!fs.existsSync(vbsPath)) {
    const escapedPath = appPath.replace(/'/g, "''");
    const dataDir = getSharedDataDir();
    // 打包后: appPath = exe 所在目录（如 C:\Program Files\AutoDouyinSpark）
    // 开发中: appPath = 项目根目录（如 E:\PROJECT\AutoDouyinSpark）
    // 两种情况下 engine.py 都在 <appPath>\electron-app\python\ 下
    const enginePy = app.isPackaged
      ? path.join(appPath, 'electron-app', 'python', 'engine.py')
      : path.join(appPath, 'electron-app', 'python', 'engine.py');
    const vbsContent = `' AutoDouyinSpark 静默运行脚本（通过 engine.py 统一数据目录）
Dim shell
Set shell = CreateObject("WScript.Shell")
shell.Run "cmd /c cd /d ${escapedPath} && python ""${enginePy.replace(/'/g, "''")}"" --data-dir ""${dataDir.replace(/'/g, "''")}"" --action send --json", 0, False
Set shell = Nothing`;
    fs.writeFileSync(vbsPath, vbsContent, 'utf-8');
  }

  // 用 XML 创建任务（支持双触发器：登录时 + 每小时重复）
  const xmlPath = path.join(appPath, 'spark_task.xml');
  const xmlContent = genTaskXml(appPath);
  fs.writeFileSync(xmlPath, xmlContent, 'utf-16le');

  const createCmd = `schtasks /Create /TN "${TASK_NAME}" /XML "${xmlPath}" /F`;
  exec(createCmd, (err, stdout, stderr) => {
    // 清理临时 XML
    try { fs.unlinkSync(xmlPath); } catch {}
    if (err) {
      console.error('创建计划任务失败:', err.message);
      // 降级：使用简单的 HOURLY 命令创建
      const fallbackCmd = `schtasks /Create /TN "${TASK_NAME}" /TR "wscript.exe \\"${vbsPath}\\"" /SC HOURLY /MO 1 /ST 23:29 /F /RL HIGHEST`;
      exec(fallbackCmd, (err2, stdout2) => {
        if (err2) {
          console.error('降级创建计划任务也失败:', err2.message);
        } else {
          console.log('计划任务已创建（降级模式）:', stdout2);
        }
      });
    } else {
      console.log('计划任务已创建（登录触发+每小时重复）:', stdout);
    }
  });
}
