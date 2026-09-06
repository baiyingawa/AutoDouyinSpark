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
    # 始终优先从 ENGINE_DIR 导入（与 engine.py 同目录）
    # 插入到 sys.path 最前面，防止同名旧版文件干扰
    for p in [ENGINE_DIR]:
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


def _resolve_active_data_dir(data_dir: str) -> str:
    """计划任务传入根目录时，解析到当前账户目录；显式账户目录保持不变。"""
    root = os.path.abspath(data_dir)
    if os.path.basename(root).lower() != 'data':
        return root
    active_file = os.path.join(root, '.active_profile')
    try:
        profile_id = open(active_file, 'r', encoding='utf-8').read().strip()
        if profile_id and all(char.isalnum() or char in '_-' for char in profile_id):
            profile_dir = os.path.join(root, 'users', profile_id)
            if os.path.isdir(profile_dir):
                return profile_dir
    except OSError:
        pass
    return root


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


def _get_days_history_path(data_dir: str) -> str:
    return os.path.join(data_dir, ".spark_days_history")


def _get_send_history_path(data_dir: str) -> str:
    return os.path.join(data_dir, ".spark_send_history")


def _atomic_json_write(path: str, data):
    """以临时文件替换方式写 JSON，避免并发读取到半截内容。"""
    temp_path = f"{path}.{os.getpid()}.tmp"
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(temp_path, path)


def _acquire_json_lock(lock_path: str, timeout: float = 10) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                stream.write(str(os.getpid()))
            return True
        except FileExistsError:
            try:
                with open(lock_path, "r", encoding="utf-8") as stream:
                    old_pid = int(stream.read().strip())
                os.kill(old_pid, 0)
            except (ValueError, PermissionError, OSError):
                try:
                    os.remove(lock_path)
                except OSError:
                    pass
            time.sleep(0.05)
        except OSError:
            time.sleep(0.05)
    return False


def _release_json_lock(lock_path: str):
    try:
        if os.path.exists(lock_path):
            os.remove(lock_path)
    except OSError:
        pass


def _append_send_history(data_dir: str, users: list[str], force: bool, success: bool):
    """记录本次实际发送成功的好友，供首页和历史页展示。"""
    if not users:
        return
    history_path = _get_send_history_path(data_dir)
    lock_path = f"{history_path}.lock"
    if not _acquire_json_lock(lock_path):
        raise TimeoutError("发送记录写入锁超时")
    try:
        history = []
        try:
            if os.path.exists(history_path):
                with open(history_path, "r", encoding="utf-8") as f:
                    raw = json.load(f)
                if isinstance(raw, list):
                    history = raw
        except Exception:
            history = []
        now = datetime.now(CHINA_TZ)
        history.append({
            "timestamp": now.isoformat(),
            "date": now.strftime("%Y-%m-%d"),
            "users": list(dict.fromkeys(users)),
            "force": bool(force),
            "success": bool(success),
        })
        _atomic_json_write(history_path, history[-500:])
    finally:
        _release_json_lock(lock_path)


def _get_login_check_path(data_dir: str) -> str:
    return os.path.join(data_dir, ".spark_login_check")


def _read_fresh_login_cache(data_dir: str):
    """读取网页登录刚写入的缓存，避免登录校验依赖完整业务模块。"""
    cookie_path = _get_cookie_path(data_dir)
    cache_path = _get_login_check_path(data_dir)
    if not os.path.exists(cookie_path) or not os.path.exists(cache_path):
        return None
    try:
        with open(cookie_path, "r", encoding="utf-8") as f:
            cookies = json.load(f)
        if not isinstance(cookies, list) or not cookies:
            return None
        with open(cache_path, "r", encoding="utf-8") as f:
            cached = json.load(f)
        if not isinstance(cached, dict):
            return None
        if cached.get("valid") is not True:
            return None
        checked_at = datetime.fromisoformat(cached.get("checked_at", ""))
        if checked_at.tzinfo is None:
            checked_at = checked_at.replace(tzinfo=CHINA_TZ)
        if (datetime.now(CHINA_TZ) - checked_at).total_seconds() >= 3600:
            return None
        return cached
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return None


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

    # Cookie 有效性（默认 false，仅当有实测缓存且 valid=true 时才返回 true）
    cookie_path = _get_cookie_path(data_dir)
    cookie_valid = False
    if os.path.exists(cookie_path):
        login_check_path = _get_login_check_path(data_dir)
        if os.path.exists(login_check_path):
            try:
                with open(login_check_path, "r", encoding="utf-8") as _f:
                    _st = json.load(_f)
                # 只有缓存明确说 valid 才认为有效
                if isinstance(_st, dict) and _st.get("valid") is True:
                    # 且缓存不能超过 1 小时
                    checked_at = _st.get("checked_at", "")
                    if checked_at:
                        try:
                            from datetime import datetime as _dt, timezone as _tz, timedelta as _td
                            check_time = _dt.fromisoformat(checked_at)
                            now = _dt.now(_tz.utc)
                            if (now - check_time).total_seconds() < 3600:
                                cookie_valid = True
                        except Exception:
                            cookie_valid = True  # 无法解析时间，乐观信任
                    else:
                        cookie_valid = True
            except Exception:
                pass
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
                cookie_names = [_c.get("name", "") for _c in _raw if isinstance(_c, dict) and _c.get("name")]
                for _c in _raw:
                    if not isinstance(_c, dict):
                        continue
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

    send_records = []
    send_history_path = _get_send_history_path(data_dir)
    if os.path.exists(send_history_path):
        try:
            with open(send_history_path, "r", encoding="utf-8") as f:
                raw_records = json.load(f)
            if isinstance(raw_records, list):
                send_records = raw_records[-100:]
        except Exception:
            pass
    today_users = []
    for record in send_records:
        if isinstance(record, dict) and record.get("date") == today:
            for user in record.get("users", []):
                if user not in today_users:
                    today_users.append(user)

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
        "sentUsers": today_users,
        "sendRecords": send_records,
        "schedulerRunning": None,
    }
    _json_out(result, json_mode)
    return result


def action_send(data_dir: str, force: bool = False, users: list[str] | None = None, json_mode: bool = True) -> dict:
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
    if hasattr(spark, 'DAYS_HISTORY'):
        spark.DAYS_HISTORY = _get_days_history_path(data_dir)
    if hasattr(spark, 'HISTORY_BACKUP_DIR'):
        spark.HISTORY_BACKUP_DIR = os.path.join(data_dir, 'history_backups')
    if hasattr(spark, 'HISTORY_LOCK_FILE'):
        spark.HISTORY_LOCK_FILE = os.path.join(data_dir, '.spark_days_history.lock')
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

    # 重绑定共享数据目录并重载好友列表（多级匹配）
    if hasattr(spark, 'SHARED_DATA_DIR'):
        spark.SHARED_DATA_DIR = data_dir
    if hasattr(spark, '_rebind_paths'):
        spark._rebind_paths()

    # 强制发送可传入前端选中的目标；没有选择时才使用配置中的完整好友列表。
    if users:
        selected = []
        seen = set()
        for user in users:
            name = str(user).strip()
            if name and name not in seen:
                seen.add(name)
                selected.append(name)
        spark.TARGET_USERS = selected
        if hasattr(spark, 'TARGET_FRIENDS'):
            spark.TARGET_FRIENDS = [friend for friend in spark.TARGET_FRIENDS if friend.get('name') in seen]

    screenshots_before = {}
    ss_dir = os.path.join(data_dir, "screenshots")
    if os.path.isdir(ss_dir):
        for name in os.listdir(ss_dir):
            path = os.path.join(ss_dir, name)
            if os.path.isfile(path):
                try:
                    screenshots_before[name] = (os.path.getmtime(path), os.path.getsize(path))
                except OSError:
                    pass

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

    # Monkey-patch send_to_friend to track results
    _original_send = getattr(spark, 'send_to_friend', None)
    if _original_send:
        def _tracked_send(page, friend, msg):
            result = _original_send(page, friend, msg)
            if result and result.get('ok'):
                sent_users.append(result.get('name') or friend.get('name'))
            else:
                failed_users.append(friend.get('name'))
            return result
        spark.send_to_friend = _tracked_send

    try:
        success = spark.main(force=force) is True
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

    try:
        _append_send_history(data_dir, sent_users, force, success)
    except Exception as e:
        if json_mode:
            print(f"[engine] 发送记录写入失败: {e}", file=sys.stderr)

    # 收集本次截图
    screenshots_after = {}
    if os.path.isdir(ss_dir):
        for name in os.listdir(ss_dir):
            path = os.path.join(ss_dir, name)
            if os.path.isfile(path):
                try:
                    screenshots_after[name] = (os.path.getmtime(path), os.path.getsize(path))
                except OSError:
                    pass
    new_screenshots = sorted(
        name for name, stamp in screenshots_after.items()
        if name not in screenshots_before or screenshots_before[name] != stamp
    )

    result = {
        "success": success,
        "captchaRequired": bool(getattr(spark, "RISK_VERIFICATION_REQUIRED", False)),
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
    if hasattr(spark, 'DAYS_HISTORY'):
        spark.DAYS_HISTORY = _get_days_history_path(data_dir)
    if hasattr(spark, 'HISTORY_BACKUP_DIR'):
        spark.HISTORY_BACKUP_DIR = os.path.join(data_dir, 'history_backups')
    if hasattr(spark, 'HISTORY_LOCK_FILE'):
        spark.HISTORY_LOCK_FILE = os.path.join(data_dir, '.spark_days_history.lock')
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
        if not isinstance(result_data, dict):
            result_data = {"success": False, "error": f"登录模块返回了无效结果: {type(result_data).__name__}"}
        result = {
            "success": result_data.get("success", False),
            "cookieCount": result_data.get("cookieCount", 0),
            "loginMethod": result_data.get("loginMethod"),
            "elapsed": result_data.get("elapsed"),
            "browserPid": result_data.get("browserPid"),
            "error": result_data.get("error"),
        }
        # 登录成功后写入缓存，避免下次 authCheckStatus 再开浏览器
        if result["success"] and result["cookieCount"] > 0:
            login_check_path = _get_login_check_path(data_dir)
            try:
                import json as _json2
                with open(login_check_path, "w", encoding="utf-8") as _f:
                    _json2.dump({"valid": True, "checked_at": datetime.now(CHINA_TZ).isoformat()}, _f)
            except Exception:
                pass
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
        result = {
            "success": True,
            "status": status.get("status", "pending"),
            "cookieCount": status.get("cookieCount", 0),
        }
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
    cached = _read_fresh_login_cache(data_dir)
    if cached is not None:
        result = {
            "success": True,
            "valid": True,
            "checkedAt": cached.get("checked_at", ""),
        }
        _json_out(result, json_mode)
        return result
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
        if not isinstance(status_data, dict):
            raise TypeError(f"登录状态返回类型异常: {type(status_data).__name__}")
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


# ─── 识别好友抖音号与头像 ───────────────────────────────


def action_identify_user(data_dir: str, username: str, json_mode: bool = True) -> dict:
    """识别好友抖音号与头像（独立浏览器会话），成功后写回 spark_config.json。"""
    _ensure_data_dir(data_dir)
    spark = _import_douyin_spark()
    if spark is None:
        result = {"success": False, "error": "无法导入 douyin_spark 模块"}
        _json_out(result, json_mode)
        return result
    if hasattr(spark, "SHARED_DATA_DIR"):
        spark.SHARED_DATA_DIR = data_dir
    if hasattr(spark, "_rebind_paths"):
        spark._rebind_paths()
    if hasattr(spark, "HEADLESS"):
        try:
            cfg_path = _get_config_path(data_dir)
            _hide = True
            if os.path.exists(cfg_path):
                with open(cfg_path, "r", encoding="utf-8") as _f:
                    _hide = json.load(_f).get("hideBrowser", True)
            spark.HEADLESS = bool(_hide)
        except Exception:
            spark.HEADLESS = True
    try:
        result = spark.identify_friend(username)
    except Exception as e:
        result = {"success": False, "error": str(e)}
    # 配置写回由 Electron 主进程串行合并，允许多个识别进程并发运行时不互相覆盖。
    _json_out(result, json_mode)
    return result


def action_risk_verify(data_dir: str, json_mode: bool = True) -> dict:
    """打开可见浏览器等待验证码中转页完成。"""
    _ensure_data_dir(data_dir)
    spark = _import_douyin_spark()
    if spark is None or not hasattr(spark, "wait_for_risk_verification"):
        result = {"success": False, "error": "验证码处理模块不可用"}
    else:
        spark.SHARED_DATA_DIR = data_dir
        spark._rebind_paths()
        result = spark.wait_for_risk_verification()
    _json_out(result, json_mode)
    return result


def action_send_all(data_root: str, json_mode: bool = True) -> dict:
    """计划任务入口：遍历所有未暂停、已登录账户，逐账户串行执行续火。"""
    root = os.path.abspath(data_root)
    profiles_dir = os.path.join(root, "users")
    results = []
    if not os.path.isdir(profiles_dir):
        result = {"success": True, "accounts": [], "sentCount": 0, "failCount": 0}
        _json_out(result, json_mode)
        return result
    for profile_id in sorted(os.listdir(profiles_dir)):
        profile_dir = os.path.join(profiles_dir, profile_id)
        if not os.path.isdir(profile_dir) or not all(c.isalnum() or c in "_-" for c in profile_id):
            continue
        try:
            meta_path = os.path.join(profile_dir, "profile.json")
            meta = json.load(open(meta_path, "r", encoding="utf-8")) if os.path.exists(meta_path) else {}
            if meta.get("hidden") is True or meta.get("paused") is True:
                continue
            if not os.path.exists(_get_cookie_path(profile_dir)):
                continue
            login_cache = _get_login_check_path(profile_dir)
            if not os.path.exists(login_cache) or json.load(open(login_cache, "r", encoding="utf-8")).get("valid") is not True:
                continue
            account_result = action_send(profile_dir, force=False, users=None, json_mode=False)
            results.append({"profile": profile_id, **account_result})
        except Exception as error:
            results.append({"profile": profile_id, "success": False, "error": str(error)})
    result = {
        "success": all(item.get("success", False) for item in results) if results else True,
        "accounts": results,
        "sentCount": sum(int(item.get("sentCount", 0)) for item in results),
        "failCount": sum(int(item.get("failCount", 0)) for item in results),
    }
    _json_out(result, json_mode)
    return result


def action_identify_self(data_dir: str, json_mode: bool = True) -> dict:
    """从 douyin.com/user/self 识别当前账户身份。"""
    _ensure_data_dir(data_dir)
    spark = _import_douyin_spark()
    if spark is None or not hasattr(spark, "identify_self"):
        result = {"success": False, "error": "个人页识别模块不可用"}
    else:
        spark.SHARED_DATA_DIR = data_dir
        spark._rebind_paths()
        try:
            result = spark.identify_self()
        except Exception as e:
            result = {"success": False, "error": str(e)}
    _json_out(result, json_mode)
    return result


# ─── CLI 入口 ───────────────────────────────────────────


_ACTIONS = {
    "status": action_status,
    "send": action_send,
    "send-all": action_send_all,
    "risk-verify": action_risk_verify,
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
    "identify-user": action_identify_user,
    "identify-self": action_identify_self,
}


def main():
    parser = argparse.ArgumentParser(description="AutoDouyinSpark Python 引擎")
    parser.add_argument("--data-dir", required=True, help="数据目录路径")
    parser.add_argument("--action", required=True, choices=list(_ACTIONS.keys()), help="执行动作")
    parser.add_argument("--json", action="store_true", help="JSON 输出模式")
    parser.add_argument("--force", action="store_true", help="强制模式（用于 send 动作）")
    parser.add_argument("--users", nargs="*", default=[], help="指定发送目标（用于 send 动作）")
    parser.add_argument("--file", help="文件名参数（用于 screenshot-get 动作）")
    parser.add_argument("--user", help="用户参数（用于 identify-user 动作）")
    args = parser.parse_args()

    raw_data_dir = os.path.abspath(args.data_dir)
    data_dir = raw_data_dir if args.action == "send-all" else _resolve_active_data_dir(raw_data_dir)
    # 登录辅助模块和其他动态导入模块统一写入当前账户日志目录。
    os.environ["SHARED_DATA_DIR"] = data_dir
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
            action_fn(data_dir, force=args.force, users=args.users, json_mode=json_mode)
        elif args.action == "refresh-days":
            action_fn(data_dir, force=args.force, json_mode=json_mode)
        elif args.action == "check-playwright":
            action_fn(json_mode=json_mode)
        elif args.action == "identify-user":
            if not args.user:
                print(json.dumps({"success": False, "error": "--user 参数缺失"}), ensure_ascii=False)
                sys.exit(1)
            action_fn(data_dir, username=args.user, json_mode=json_mode)
        else:
            action_fn(data_dir, json_mode=json_mode)
    except Exception as e:
        error_result = {"success": False, "error": str(e)}
        print(json.dumps(error_result, ensure_ascii=False))
        sys.exit(2)


if __name__ == "__main__":
    main()
