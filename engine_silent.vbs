' AutoDouyinSpark 静默运行脚本
' 以隐藏控制台窗口的方式执行续火花任务
' 适用于 Windows 计划任务或开机自启

Dim shell
Set shell = CreateObject("WScript.Shell")

' 切换到项目目录并静默运行 Python 续火花脚本
' 参数 0 = 隐藏窗口, False = 异步（不等待脚本结束）
shell.Run "cmd /c cd /d E:\PROJECT\AutoDouyinSpark && python douyin_spark.py", 0, False

Set shell = Nothing
