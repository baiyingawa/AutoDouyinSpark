' AutoDouyinSpark 静默运行脚本（通过 engine.py 统一数据目录）
Dim shell
Set shell = CreateObject("WScript.Shell")
shell.Run "cmd /c cd /d E:\PROJECT\AutoDouyinSpark && python ""E:\PROJECT\AutoDouyinSpark\electron-app\python\engine.py"" --data-dir ""C:\Users\Yu\AppData\Roaming\AutoDouyinSpark\data"" --action send --json", 0, False
Set shell = Nothing