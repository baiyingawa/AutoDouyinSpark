"""
email_alert.py - Cookie 过期检测 & 邮件提醒（改良版）

在原始 email_alert.py 基础上增加：
- --action test 支持发送测试邮件
- --json 输出模式
- 支持 data_dir 参数
"""

import json
import os
import sys

# 动态导入原始模块
_ORIGINAL_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _ORIGINAL_DIR not in sys.path:
    sys.path.insert(0, _ORIGINAL_DIR)


def _load_original():
    """加载原始 email_alert 模块"""
    import importlib.util

    # 先清除缓存
    for k in list(sys.modules.keys()):
        if 'email_alert' in k:
            del sys.modules[k]

    orig_path = os.path.join(_ORIGINAL_DIR, "email_alert.py")
    if os.path.exists(orig_path):
        spec = importlib.util.spec_from_file_location("email_alert_orig", orig_path)
        if spec and spec.loader:
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            return mod

    # 备选：直接导入
    try:
        import email_alert as mod
        return mod
    except ImportError:
        return None


def check_cookie_expiry(cookie_file: str) -> dict:
    """检查 Cookie 过期状态"""
    mod = _load_original()
    if mod is None:
        return {"exists": False, "error": "无法加载原始 email_alert 模块"}
    return mod.check_cookie_expiry(cookie_file)


def should_alert(expiry_status: dict) -> str | None:
    """判断是否需要发送提醒"""
    mod = _load_original()
    if mod is None:
        return None
    return mod.should_alert(expiry_status)


def check_and_alert(email_config_file: str, cookie_file: str) -> dict:
    """检测 Cookie 过期并发送提醒"""
    mod = _load_original()
    if mod is None:
        return {"success": False, "error": "无法加载原始 email_alert 模块"}

    try:
        status = mod.check_and_alert(
            email_config_file,
            cookie_file,
            os.path.join(os.path.dirname(cookie_file), ".spark_alert_state"),
        )
        return {"success": True, "status": status}
    except Exception as e:
        return {"success": False, "error": str(e)}


def send_test_email(email_config: dict) -> dict:
    """发送测试邮件"""
    mod = _load_original()
    if mod is None:
        return {"success": False, "error": "无法加载原始 email_alert 模块"}

    try:
        subject = email_config.get("test_subject", "AutoDouyinSpark 测试邮件")
        body = email_config.get("test_body", "这是一封来自 AutoDouyinSpark 的测试邮件。")
        sent = mod.send_alert(email_config, subject, body)
        return {"success": bool(sent), "sent": bool(sent)}
    except Exception as e:
        return {"success": False, "error": str(e)}


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="AutoDouyinSpark 邮件提醒")
    parser.add_argument("--action", choices=["check", "test"], default="check", help="执行动作")
    parser.add_argument("--json", action="store_true", help="JSON 输出")
    parser.add_argument("--data-dir", help="数据目录")
    args = parser.parse_args()

    # 读取 stdin 数据（用于 test 模式）
    stdin_data = None
    if args.action == "test" and not sys.stdin.isatty():
        stdin_data = sys.stdin.read()

    if args.action == "check":
        data_dir = args.data_dir or os.path.dirname(os.path.abspath(__file__))
        cookie_file = os.path.join(data_dir, "cookie_export.json")
        config_file = os.path.join(data_dir, "email_config.json")

        if os.path.exists(config_file):
            result = check_and_alert(config_file, cookie_file)
        else:
            # 只检查不发送
            expiry = check_cookie_expiry(cookie_file)
            alert_type = should_alert(expiry)
            result = {
                "success": True,
                "cookieExists": expiry.get("exists", False),
                "expiredCount": expiry.get("expired_count", 0),
                "totalCookies": expiry.get("total_cookies", 0),
                "expiredRatio": expiry.get("ratio", 0),
                "alertType": alert_type,
                "noConfig": True,
            }
    else:  # test
        if stdin_data:
            try:
                config = json.loads(stdin_data)
            except json.JSONDecodeError:
                result = {"success": False, "error": "无效的 JSON 格式"}
                config = None

            if config:
                result = send_test_email(config)
        else:
            result = {"success": False, "error": "请通过 stdin 提供 email_config JSON"}

    if args.json:
        print(json.dumps(result, ensure_ascii=True))
    else:
        print(json.dumps(result, ensure_ascii=True, indent=2))
