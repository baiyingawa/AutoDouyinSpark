' AutoDouyinSpark 静默运行脚本
' 以完全隐藏窗口的方式执行续火花任务（使用 pythonw.exe 无控制台版本）
' 适用于 Windows 计划任务或开机自启

Dim shell
Set shell = CreateObject("WScript.Shell")

' 使用 pythonw.exe 完全隐藏控制台窗口
' 参数 0 = 隐藏窗口, False = 异步（不等待脚本结束）
shell.Run "cmd /c cd /d E:\PROJECT\AutoDouyinSpark && start /B D:\python\pythonw.exe douyin_spark.py", 0, False

Set shell = Nothing
