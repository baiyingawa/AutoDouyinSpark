#!/usr/bin/env python3
"""
engine.py - AutoDouyinSpark 统一 Python 引擎入口

用法:
    python engine.py --data-dir <path> --action <action> [--json] [--force]

支持的 action:
    status            返回状态概览
    send              执行发送 (--force 强制)
    refresh-days      更新火花天数
    login-start       启动扫码登录
    login-poll        检查登录状态
    login-abort       终止扫码流程
    login-import      从 stdin 接收 Cookie JSON 并导入
    check-login       检测 Cookie 是否有效
    check-playwright  检测 Playwright 是否安装
    screenshots-list  列出截图文件
    screenshot-get    获取截图内容 (--file <name>)
    email-check       检查 Cookie 过期
    email-test        发送测试邮件 (stdin 接收 email_config JSON)

退出码: 0=成功, 1=参数错误, 2=运行时错误
"""

import argparse
import base64
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

# 将项目根目录（自身所在目录的父目录）和原始项目目录加入 sys.path
ENGINE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(ENGINE_DIR)  # electron-app/
ORIGINAL_PROJECT = os.path.join(ENGINE_DIR, "..")  # AutoDouyinSpark/

# 添加原始项目目录，以便 import douyin_spark.py、email_alert.py 等
# 尝试多个可能的路径
_POSSIBLE_PATHS = [
    os.path.abspath(os.path.join(ENGINE_DIR, "..")),       # AutoDouyinSpark/
    os.path.abspath(os.path.join(ENGINE_DIR, "..", "..")),  # PROJECT 父目录
]
for p in _POSSIBLE_PATHS:
    if os.path.isdir(p) and p not in sys.path:
        sys.path.insert(0, p)

CHINA_TZ = timezone(timedelta(hours=8))


def _find_original_script(name: str):
    """在可能的路径中查找原始 Python 脚本"""
    base = os.path.abspath(os.path.join(ENGINE_DIR, ".."))
    for root in [base]:
        target = os.path.join(root, name)
        if os.path.exists(target):
            return target
    return os.path.join(ENGINE_DIR, name)


def _import_douyin_spark():
    """动态导入 douyin_spark 模块"""
    # 先移除当前目录的同名模块缓存
    for k in list(sys.modules.keys()):
        if 'douyin_spark' in k:
            del sys.modules[k]
    # 确保 ENGINE_DIR 和其父目录都在 sys.path 中
    for p in [ENGINE_DIR, os.path.abspath(os.path.join(ENGINE_DIR, ".."))]:
        if p not in sys.path:
            sys.path.insert(0, p)
    # 尝试导入
    try:
        import douyin_spark
        return douyin_spark
    except ImportError:
        try:
            import importlib.util
            spec = importlib.util.spec_from_file_location("douyin_spark",
                os.path.join(ENGINE_DIR, "douyin_spark.py"))
            if spec and spec.loader:
                mod = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(mod)
                return mod
        except Exception:
            pass
    return None


def _import_email_alert():
    """动态导入 email_alert 模块"""
    for k in list(sys.modules.keys()):
        if 'email_alert' in k:
            del sys.modules[k]
    for p in [ENGINE_DIR, os.path.abspath(os.path.join(ENGINE_DIR, ".."))]:
        if p not in sys.path:
            sys.path.insert(0, p)
    try:
        import email_alert
        return email_alert
    except ImportError:
        try:
            import importlib.util
            spec = importlib.util.spec_from_file_location("email_alert",
                os.path.join(ENGINE_DIR, "email_alert.py"))
            if spec and spec.loader:
                mod = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(mod)
                return mod
        except Exception:
            pass
    return None


# ─── 工具函数 ─────────────────────────────────────────────


def _json_out(data: dict, json_mode: bool):
    """输出 JSON 结果"""
    if json_mode:
        print(json.dumps(data, ensure_ascii=True))
    else:
        print(json.dumps(data, ensure_ascii=True, indent=2))


def _ensure_data_dir(data_dir: str):
    """确保 data_dir 存在"""
    os.makedirs(data_dir, exist_ok=True)


def _get_config_path(data_dir: str) -> str:
    return os.path.join(data_dir, "spark_config.json")


def _get_cookie_path(data_dir: str) -> str:
    return os.path.join(data_dir, "cookie_export.json")


def _get_state_path(data_dir: str) -> str:
    return os.path.join(data_dir, ".spark_state")


def _get_streak_path(data_dir: str) -> str:
    return os.path.join(data_dir, ".spark_streak")


def _get_days_cache_path(data_dir: str) -> str:
    return os.path.join(data_dir, ".spark_days_cache")


def _get_login_check_path(data_dir: str) -> str:
    return os.path.join(data_dir, ".spark_login_check")


# ─── Action 实现 ────────────────────────────────────────


def action_status(data_dir: str, json_mode: bool = True) -> dict:
    """返回状态概览"""
    _ensure_data_dir(data_dir)
    today = datetime.now(CHINA_TZ).strftime("%Y-%m-%d")

    # 今日已发送？
    state_path = _get_state_path(data_dir)
    sent_today = False
    last_send = None
    if os.path.exists(state_path):
        try:
            with open(state_path, "r", encoding="utf-8") as f:
                saved = f.read().strip()
            sent_today = saved == today
            if saved:
                last_send = saved
        except Exception:
            pass

    # 连续天数
    streak_path = _get_streak_path(data_dir)
    streak = 0
    if os.path.exists(streak_path):
        try:
            with open(streak_path, "r", encoding="utf-8") as f:
                st = json.load(f)
            streak = st.get("streak", 0)
        except Exception:
            pass

    # 火花天数
    days_cache_path = _get_days_cache_path(data_dir)
    days = {}
    if os.path.exists(days_cache_path):
        try:
            with open(days_cache_path, "r", encoding="utf-8") as f:
                days = json.load(f).get("days", {})
        except Exception:
            pass

    # Cookie 有效性
    cookie_path = _get_cookie_path(data_dir)
    cookie_valid = os.path.exists(cookie_path)
    cookie_total = 0
    cookie_valid_count = 0
    cookie_names = []
    if cookie_valid:
        try:
            import json as _json
            with open(cookie_path, "r", encoding="utf-8") as _f:
                _raw = _json.load(_f)
            if isinstance(_raw, list):
                cookie_total = len(_raw)
                cookie_names = [_c.get("name", "") for _c in _raw if _c.get("name")]
                for _c in _raw:
                    _exp = _c.get("expirationDate") or _c.get("expires")
                    if _exp is None or _exp > time.time():
                        cookie_valid_count += 1
            elif isinstance(_raw, dict):
                cookie_total = len(_raw)
                cookie_names = list(_raw.keys())
                cookie_valid_count = cookie_total
        except Exception:
            pass

    # 调度器运行状态（由 Electron 维护，这里返回 None）
    # 头像缓存
    avatars_path = os.path.join(data_dir, ".spark_avatars")
    avatars = {}
    if os.path.exists(avatars_path):
        try:
            with open(avatars_path, "r", encoding="utf-8") as f:
                avatars = json.load(f)
        except:
            pass

    result = {
        "success": True,
        "sentToday": sent_today,
        "streak": streak,
        "days": days,
        "cookieValid": cookie_valid,
        "cookieTotal": cookie_total,
        "cookieValidCount": cookie_valid_count,
        "cookieNames": cookie_names,
        "avatars": avatars,
        "lastSend": last_send,
        "schedulerRunning": None,
    }
    _json_out(result, json_mode)
    return result


def action_send(data_dir: str, force: bool = False, json_mode: bool = True) -> dict:
    """执行发送"""
    _ensure_data_dir(data_dir)
    spark = _import_douyin_spark()
    if spark is None:
        result = {"success": False, "error": "无法导入 douyin_spark 模块"}
        _json_out(result, json_mode)
        return result

    # 注入路径配置
    if hasattr(spark, 'SCRIPT_DIR'):
        spark.SCRIPT_DIR = data_dir
    if hasattr(spark, 'STATE_FILE'):
        spark.STATE_FILE = _get_state_path(data_dir)
    if hasattr(spark, 'STREAK_FILE'):
        spark.STREAK_FILE = _get_streak_path(data_dir)
    if hasattr(spark, 'DAYS_CACHE'):
        spark.DAYS_CACHE = _get_days_cache_path(data_dir)
    if hasattr(spark, 'LOGIN_CHECK_FILE'):
        spark.LOGIN_CHECK_FILE = _get_login_check_path(data_dir)
    if hasattr(spark, 'AVATARS_FILE'):
        spark.AVATARS_FILE = os.path.join(data_dir, ".spark_avatars")
    if hasattr(spark, 'COOKIE_FILE'):
        spark.COOKIE_FILE = _get_cookie_path(data_dir)
    if hasattr(spark, 'LOG_FILE'):
        spark.LOG_FILE = os.path.join(data_dir, ".spark_log")
    if hasattr(spark, 'AVATARS_FILE'):
        spark.AVATARS_FILE = os.path.join(data_dir, ".spark_avatars")
    if hasattr(spark, 'CONFIRM_FILE'):
        spark.CONFIRM_FILE = os.path.join(data_dir, ".spark_confirm")
    if hasattr(spark, '_CONFIG_FILE'):
        spark._CONFIG_FILE = _get_config_path(data_dir)
        # 重新从正确的配置路径读取 TARGET_USERS（模块加载时已读到旧路径的）
        try:
            _cfg_path = _get_config_path(data_dir)
            if os.path.exists(_cfg_path):
                with open(_cfg_path, "r", encoding="utf-8") as _f:
                    _cfg = json.load(_f)
                    _users = _cfg.get("target_users")
                    if _users and isinstance(_users, list) and len(_users) > 0:
                        spark.TARGET_USERS = _users
        except Exception:
            pass
    # 根据配置决定是否隐藏浏览器
    if hasattr(spark, 'HEADLESS'):
        try:
            _cfg_path = _get_config_path(data_dir)
            _hide = True
            if os.path.exists(_cfg_path):
                with open(_cfg_path, "r", encoding="utf-8") as _f:
                    _cfg = json.load(_f)
                    _hide = _cfg.get("hideBrowser", True)
            spark.HEADLESS = bool(_hide)
        except Exception:
            spark.HEADLESS = False

    screenshots_before = set()
    ss_dir = os.path.join(data_dir, "screenshots")
    if os.path.isdir(ss_dir):
        screenshots_before = set(os.listdir(ss_dir))

    # 记录上次失败用户列表
    prev_failed_path = os.path.join(data_dir, ".spark_failed_users")
    prev_failed = []
    if os.path.exists(prev_failed_path):
        try:
            with open(prev_failed_path, "r", encoding="utf-8") as f:
                prev_failed = json.load(f)
        except:
            pass

    # 如果 force 不是 True 且有上次失败记录，只发送失败用户
    if prev_failed and force is not True:
        # 设置 TARGET_USERS 为上次失败的用户
        if hasattr(spark, 'TARGET_USERS'):
            old_users = list(spark.TARGET_USERS)
            spark.TARGET_USERS = prev_failed
            if json_mode:
                print(f"[engine] 🔁 上次 {len(prev_failed)} 人未成功，仅重试这些人", file=sys.stderr)

    sent_users = []
    failed_users = []

    # Monkey-patch send_to_user to track results
    _original_send = getattr(spark, 'send_to_user', None)
    if _original_send:
        def _tracked_send(page, username, msg):
            result = _original_send(page, username, msg)
            if result:
                sent_users.append(username)
            else:
                failed_users.append(username)
            return result
        spark.send_to_user = _tracked_send

    try:
        spark.main(force=force)
        success = True
    except Exception as e:
        success = False
        if json_mode:
            print(f"[engine] 发送异常: {e}", file=sys.stderr)

    # 保存失败用户列表
    try:
        with open(prev_failed_path, "w", encoding="utf-8") as f:
            json.dump(failed_users, f, ensure_ascii=False)
    except:
        pass

    # 收集本次截图
    screenshots_after = set(os.listdir(ss_dir)) if os.path.isdir(ss_dir) else set()
    new_screenshots = list(screenshots_after - screenshots_before)

    result = {
        "success": success,
        "sentCount": len(sent_users),
        "failCount": len(failed_users),
        "failedUsers": failed_users,
        "screenshots": new_screenshots,
    }
    _json_out(result, json_mode)
    return result


def action_refresh_days(data_dir: str, force: bool = False, json_mode: bool = True) -> dict:
    """更新火花天数"""
    _ensure_data_dir(data_dir)
    spark = _import_douyin_spark()
    if spark is None:
        result = {"success": False, "error": "无法导入 douyin_spark 模块"}
        _json_out(result, json_mode)
        return result

    if hasattr(spark, 'SCRIPT_DIR'):
        spark.SCRIPT_DIR = data_dir
    if hasattr(spark, 'COOKIE_FILE'):
        spark.COOKIE_FILE = _get_cookie_path(data_dir)
    if hasattr(spark, 'DAYS_CACHE'):
        spark.DAYS_CACHE = _get_days_cache_path(data_dir)
    if hasattr(spark, 'LOG_FILE'):
        spark.LOG_FILE = os.path.join(data_dir, ".spark_log")
    if hasattr(spark, 'AVATARS_FILE'):
        spark.AVATARS_FILE = os.path.join(data_dir, ".spark_avatars")
    if hasattr(spark, 'CONFIRM_FILE'):
        spark.CONFIRM_FILE = os.path.join(data_dir, ".spark_confirm")
    if hasattr(spark, '_CONFIG_FILE'):
        spark._CONFIG_FILE = _get_config_path(data_dir)
        # 重新读取 target_users（模块加载时读到的是旧路径的配置）
        try:
            _cfg_path = _get_config_path(data_dir)
            if os.path.exists(_cfg_path):
                with open(_cfg_path, "r", encoding="utf-8") as _f:
                    _cfg = json.load(_f)
                    _users = _cfg.get("target_users")
                    if _users and isinstance(_users, list) and len(_users) > 0:
                        spark.TARGET_USERS = _users
        except Exception:
            pass
    # 根据配置决定是否隐藏浏览器
    if hasattr(spark, 'HEADLESS'):
        try:
            _cfg_path = _get_config_path(data_dir)
            _hide = True
            if os.path.exists(_cfg_path):
                with open(_cfg_path, "r", encoding="utf-8") as _f:
                    _cfg = json.load(_f)
                    _hide = _cfg.get("hideBrowser", True)
            spark.HEADLESS = bool(_hide)
        except Exception:
            spark.HEADLESS = False

    try:
        if hasattr(spark, '_update_spark_days'):
            spark._update_spark_days(force=force)
        result = {"success": True}
    except Exception as e:
        result = {"success": False, "error": str(e)}

    _json_out(result, json_mode)
    return result


def action_login_start(data_dir: str, json_mode: bool = True) -> dict:
    """启动网页登录（打开浏览器等待用户登录，自动保存 Cookie）"""
    _ensure_data_dir(data_dir)
    try:
        from login_helper import start_login
        result_data = start_login(data_dir)
        result = {
            "success": result_data.get("success", False),
            "cookieCount": result_data.get("cookieCount", 0),
            "loginMethod": result_data.get("loginMethod"),
            "elapsed": result_data.get("elapsed"),
            "browserPid": result_data.get("browserPid"),
            "error": result_data.get("error"),
        }
    except ImportError as e:
        result = {"success": False, "error": f"login_helper 模块导入失败: {e}"}
    except Exception as e:
        result = {"success": False, "error": str(e)}
    _json_out(result, json_mode)
    return result


def action_login_poll(data_dir: str, json_mode: bool = True) -> dict:
    """检查登录状态"""
    try:
        from login_helper import poll_login
        status = poll_login(data_dir)
        result = {"success": True, "status": status.get("status", "pending")}
    except ImportError as e:
        result = {"success": False, "error": f"login_helper 模块导入失败: {e}"}
    except Exception as e:
        result = {"success": False, "error": str(e)}
    _json_out(result, json_mode)
    return result


def action_login_abort(data_dir: str, json_mode: bool = True) -> dict:
    """终止扫码流程"""
    try:
        from login_helper import abort_login
        abort_login(data_dir)
        result = {"success": True}
    except ImportError as e:
        result = {"success": False, "error": f"login_helper 模块导入失败: {e}"}
    except Exception as e:
        result = {"success": False, "error": str(e)}
    _json_out(result, json_mode)
    return result


def action_login_import(data_dir: str, stdin_data: str = "", json_mode: bool = True) -> dict:
    """从 stdin 接收 Cookie JSON 并导入"""
    _ensure_data_dir(data_dir)
    try:
        if not stdin_data:
            stdin_data = sys.stdin.read()
        cookie_data = json.loads(stdin_data)
        cookie_path = _get_cookie_path(data_dir)
        with open(cookie_path, "w", encoding="utf-8") as f:
            json.dump(cookie_data, f, ensure_ascii=False, indent=2)
        result = {"success": True, "cookieCount": len(cookie_data) if isinstance(cookie_data, list) else 1}
    except json.JSONDecodeError:
        result = {"success": False, "error": "无效的 JSON 格式"}
    except Exception as e:
        result = {"success": False, "error": str(e)}
    _json_out(result, json_mode)
    return result


def action_check_login(data_dir: str, json_mode: bool = True) -> dict:
    """检测 Cookie 是否有效"""
    _ensure_data_dir(data_dir)
    spark = _import_douyin_spark()
    if spark is None:
        result = {"success": False, "valid": False, "error": "无法导入 douyin_spark 模块"}
        _json_out(result, json_mode)
        return result

    if hasattr(spark, 'SCRIPT_DIR'):
        spark.SCRIPT_DIR = data_dir
    if hasattr(spark, 'COOKIE_FILE'):
        spark.COOKIE_FILE = _get_cookie_path(data_dir)
    if hasattr(spark, 'LOGIN_CHECK_FILE'):
        spark.LOGIN_CHECK_FILE = _get_login_check_path(data_dir)
    if hasattr(spark, 'HEADLESS'):
        # 读取配置决定是否隐藏浏览器
        try:
            _cfg_path = _get_config_path(data_dir)
            _hide = True
            if os.path.exists(_cfg_path):
                with open(_cfg_path, "r", encoding="utf-8") as _f:
                    _cfg = json.load(_f)
                    _hide = _cfg.get("hideBrowser", True)
            spark.HEADLESS = bool(_hide)
        except Exception:
            spark.HEADLESS = True

    try:
        status_data = spark.get_cookie_valid_status()
        result = {
            "success": True,
            "valid": status_data.get("valid", False),
            "checkedAt": status_data.get("checked_at", ""),
        }
    except Exception as e:
        # 尝试直接调用 check_login_status_playwright
        try:
            valid = spark._check_login_status_playwright()
            result = {"success": True, "valid": valid, "checkedAt": datetime.now(CHINA_TZ).isoformat()}
        except Exception as e2:
            result = {"success": False, "valid": False, "error": str(e2)}
    _json_out(result, json_mode)
    return result


def action_check_playwright(json_mode: bool = True) -> dict:
    """检测 Playwright 是否安装"""
    try:
        import playwright
        version = getattr(playwright, "__version__", "unknown")
        # 尝试启动浏览器
        installed = True
        try:
            from playwright.sync_api import sync_playwright
            with sync_playwright() as p:
                p.chromium.launch(headless=True).close()
        except Exception:
            installed = False
        result = {
            "success": True,
            "installed": installed,
            "version": version,
        }
    except ImportError:
        result = {"success": True, "installed": False, "version": None}
    except Exception as e:
        result = {"success": False, "error": str(e)}
    _json_out(result, json_mode)
    return result


def action_screenshots_list(data_dir: str, json_mode: bool = True) -> dict:
    """列出截图文件"""
    ss_dir = os.path.join(data_dir, "screenshots")
    files = []
    if os.path.isdir(ss_dir):
        for f in sorted(os.listdir(ss_dir)):
            fpath = os.path.join(ss_dir, f)
            if os.path.isfile(fpath):
                files.append({
                    "name": f,
                    "size": os.path.getsize(fpath),
                    "mtime": datetime.fromtimestamp(os.path.getmtime(fpath), tz=CHINA_TZ).isoformat(),
                })
    result = {"success": True, "files": files, "count": len(files)}
    _json_out(result, json_mode)
    return result


def action_screenshot_get(data_dir: str, filename: str, json_mode: bool = True) -> dict:
    """获取截图内容（返回 base64）"""
    ss_dir = os.path.join(data_dir, "screenshots")
    fpath = os.path.join(ss_dir, filename)
    # 安全：防止路径穿越
    fpath = os.path.normpath(fpath)
    if not fpath.startswith(os.path.normpath(ss_dir)):
        result = {"success": False, "error": "路径不合法"}
        _json_out(result, json_mode)
        return result

    if not os.path.isfile(fpath):
        result = {"success": False, "error": f"文件不存在: {filename}"}
        _json_out(result, json_mode)
        return result

    try:
        with open(fpath, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("utf-8")
        result = {"success": True, "data": b64, "filename": filename}
    except Exception as e:
        result = {"success": False, "error": str(e)}
    _json_out(result, json_mode)
    return result


def action_email_check(data_dir: str, json_mode: bool = True) -> dict:
    """检查 Cookie 过期情况"""
    _ensure_data_dir(data_dir)
    ea = _import_email_alert()
    if ea is None:
        result = {"success": False, "error": "无法导入 email_alert 模块"}
        _json_out(result, json_mode)
        return result

    cookie_path = _get_cookie_path(data_dir)
    if not os.path.exists(cookie_path):
        result = {"success": True, "cookieExists": False, "expiredRatio": 0}
        _json_out(result, json_mode)
        return result

    try:
        expiry = ea.check_cookie_expiry(cookie_path)
        alert_type = ea.should_alert(expiry)
        result = {
            "success": True,
            "cookieExists": expiry.get("exists", False),
            "expiredCount": expiry.get("expired_count", 0),
            "totalCookies": expiry.get("total_cookies", 0),
            "expiredRatio": expiry.get("ratio", 0),
            "alertType": alert_type,
        }
    except Exception as e:
        result = {"success": False, "error": str(e)}
    _json_out(result, json_mode)
    return result


def action_email_test(data_dir: str, stdin_data: str = "", json_mode: bool = True) -> dict:
    """发送测试邮件"""
    _ensure_data_dir(data_dir)
    ea = _import_email_alert()
    if ea is None:
        result = {"success": False, "error": "无法导入 email_alert 模块"}
        _json_out(result, json_mode)
        return result

    try:
        if not stdin_data:
            stdin_data = sys.stdin.read()
        config = json.loads(stdin_data)

        subject = config.get("test_subject", "AutoDouyinSpark 测试邮件")
        body = config.get("test_body", "这是一封来自 AutoDouyinSpark 的测试邮件。")

        sent = ea.send_alert(config, subject, body)
        result = {"success": sent, "sent": sent}
    except json.JSONDecodeError:
        result = {"success": False, "error": "无效的 JSON 格式"}
    except Exception as e:
        result = {"success": False, "error": str(e)}
    _json_out(result, json_mode)
    return result


# ─── CLI 入口 ───────────────────────────────────────────


_ACTIONS = {
    "status": action_status,
    "send": action_send,
    "refresh-days": action_refresh_days,
    "login-start": action_login_start,
    "login-poll": action_login_poll,
    "login-abort": action_login_abort,
    "login-import": action_login_import,
    "check-login": action_check_login,
    "check-playwright": action_check_playwright,
    "screenshots-list": action_screenshots_list,
    "screenshot-get": action_screenshot_get,
    "email-check": action_email_check,
    "email-test": action_email_test,
}


def main():
    parser = argparse.ArgumentParser(description="AutoDouyinSpark Python 引擎")
    parser.add_argument("--data-dir", required=True, help="数据目录路径")
    parser.add_argument("--action", required=True, choices=list(_ACTIONS.keys()), help="执行动作")
    parser.add_argument("--json", action="store_true", help="JSON 输出模式")
    parser.add_argument("--force", action="store_true", help="强制模式（用于 send 动作）")
    parser.add_argument("--file", help="文件名参数（用于 screenshot-get 动作）")
    args = parser.parse_args()

    data_dir = os.path.abspath(args.data_dir)
    json_mode = args.json

    action_fn = _ACTIONS[args.action]

    try:
        if args.action == "screenshot-get":
            if not args.file:
                print(json.dumps({"success": False, "error": "--file 参数缺失"}), ensure_ascii=False)
                sys.exit(1)
            action_fn(data_dir, filename=args.file, json_mode=json_mode)
        elif args.action in ("login-import", "email-test"):
            action_fn(data_dir, json_mode=json_mode)
        elif args.action == "send":
            action_fn(data_dir, force=args.force, json_mode=json_mode)
        elif args.action == "refresh-days":
            action_fn(data_dir, force=args.force, json_mode=json_mode)
        elif args.action == "check-playwright":
            action_fn(json_mode=json_mode)
        else:
            action_fn(data_dir, json_mode=json_mode)
    except Exception as e:
        error_result = {"success": False, "error": str(e)}
        print(json.dumps(error_result, ensure_ascii=False))
        sys.exit(2)


if __name__ == "__main__":
    main()
