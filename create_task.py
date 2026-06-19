"""
创建/重建 AutoDouyinSpark 计划任务（无窗口静默方案）
直接调用 pythonw.exe，不经过 BAT/VBS，完全无窗口弹出
"""
import os
import sys
import subprocess
import tempfile
import datetime

TASK_LOGIN = "AutoDouyinSparkLogin"
TASK_HOURLY = "AutoDouyinSparkEngine"
PYTHONW = r"D:\python\pythonw.exe"
PROJECT_DIR = r"E:\PROJECT\AutoDouyinSpark"
SCRIPT = "douyin_spark.py"

def run_cmd(cmd):
    proc = subprocess.run(cmd, shell=True, capture_output=True, encoding='gbk', errors='replace')
    return proc

def delete_task(name):
    run_cmd(f'schtasks /Delete /TN "{name}" /F')

def build_xml(command: str, arguments: str, wd: str, triggers_xml: str) -> str:
    """生成计划任务 XML"""
    return f'''<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>AutoDouyinSpark 抖音火花自动发送引擎</Description>
    <Author>UU\\Yu</Author>
  </RegistrationInfo>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
  </Settings>
  <Triggers>
{triggers_xml}
  </Triggers>
  <Actions Context="Author">
    <Exec>
      <Command>{command}</Command>
      <Arguments>{arguments}</Arguments>
      <WorkingDirectory>{wd}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>'''

def write_xml(xml_str: str, path: str):
    with open(path, 'wb') as f:
        f.write(b'\xff\xfe')
        f.write(xml_str.encode('utf-16-le'))

def create_login_task_xml():
    """用 XML 创建登录触发器任务，直接调用 pythonw.exe"""
    print(f"[INFO] 创建登录任务: {TASK_LOGIN}...")

    triggers = '''    <LogonTrigger>
      <Enabled>true</Enabled>
      <Delay>PT30S</Delay>
    </LogonTrigger>'''

    xml = build_xml(PYTHONW, SCRIPT, PROJECT_DIR, triggers)
    xml_path = os.path.join(tempfile.gettempdir(), "ADSLoginTask.xml")
    write_xml(xml, xml_path)

    result = run_cmd(f'schtasks /Create /TN "{TASK_LOGIN}" /XML "{xml_path}"')
    if result.stdout.strip():
        print(f"  STDOUT: {result.stdout.strip()}")
    if result.stderr.strip():
        print(f"  STDERR: {result.stderr.strip()}")
    return result.returncode

def create_hourly_task_xml():
    """用 XML 创建每小时任务，直接调用 pythonw.exe"""
    print(f"[INFO] 创建小时任务: {TASK_HOURLY}...")

    triggers = '''    <TimeTrigger>
      <StartBoundary>2026-06-20T00:00:00</StartBoundary>
      <Repetition>
        <Interval>PT1H</Interval>
        <Duration>P1D</Duration>
      </Repetition>
    </TimeTrigger>'''

    xml = build_xml(PYTHONW, SCRIPT, PROJECT_DIR, triggers)
    xml_path = os.path.join(tempfile.gettempdir(), "ADSHourlyTask.xml")
    write_xml(xml, xml_path)

    result = run_cmd(f'schtasks /Create /TN "{TASK_HOURLY}" /XML "{xml_path}"')
    if result.stdout.strip():
        print(f"  STDOUT: {result.stdout.strip()}")
    if result.stderr.strip():
        print(f"  STDERR: {result.stderr.strip()}")
    return result.returncode

def verify():
    print("\n====== 计划任务状态 ======")
    for name in [TASK_LOGIN, TASK_HOURLY]:
        r = run_cmd(f'schtasks /Query /TN "{name}" /V /FO LIST')
        if r.returncode != 0:
            print(f"[WARN] 任务 {name} 不存在")
            continue
        print(f"\n--- {name} ---")
        for line in r.stdout.splitlines():
            if any(k in line for k in ["任务名", "下次运行", "上次运行", "上次结果", "计划类型", "重复", "触发器"]):
                print(f"  {line.strip()}")
    print("==========================\n")

# ===== 主流程 =====
if not os.path.isfile(PYTHONW):
    print(f"[ERROR] pythonw.exe 未找到: {PYTHONW}")
    sys.exit(1)
if not os.path.isfile(os.path.join(PROJECT_DIR, SCRIPT)):
    print(f"[ERROR] 脚本未找到: {os.path.join(PROJECT_DIR, SCRIPT)}")
    sys.exit(1)

# 删除旧任务
delete_task(TASK_LOGIN)
delete_task(TASK_HOURLY)

# 创建任务（XML 模式：直接 pythonw.exe + WorkingDirectory）
rc1 = create_login_task_xml()
rc2 = create_hourly_task_xml()

if rc1 == 0 and rc2 == 0:
    print("[SUCCESS] 所有计划任务创建成功！")
    verify()
    print("特点：直接调用 pythonw.exe，不经过 BAT/VBS，完全不弹出任何窗口")
else:
    if rc1 != 0:
        print(f"[ERROR] 登录任务创建失败 (rc={rc1})")
    if rc2 != 0:
        print(f"[ERROR] 小时任务创建失败 (rc={rc2})")
    sys.exit(1)
