#!/usr/bin/env python3
"""
login_helper.py - 抖音网页登录模块

流程:
1. start_login(data_dir):
   - 启动 Chromium 可见浏览器（headless=False，规避反爬）
   - 导航到抖音首页 (https://www.douyin.com/)
   - **阻塞等待**用户登录（最长 5 分钟）
   - 每秒检查一次浏览器 Cookie
   - 检测到有效 Cookie（>10 条）→ 保存到 cookie_export.json → 关闭浏览器 → 返回
   - 返回 { success, cookieCount, browserPid, debug }

2. poll_login(data_dir):
   - 检查 Cookie 文件是否已保存（说明登录成功）
   - 检查是否超时（5 分钟）
   - 返回 { status: 'pending'|'success'|'failed'|'expired' }

3. abort_login(data_dir):
   - 杀掉浏览器进程
   - 清理临时文件
"""

import json
import os
import signal
import time
import subprocess
import sys
from datetime import datetime

# 调试日志（输出到 stderr，会被 Electron 捕获）
def _log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[login_helper][{ts}] {msg}", file=sys.stderr, flush=True)

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    pass  # 调用时再检测

_BROWSER_PID_FILE = "login_browser.pid"
_COOKIE_CHECK_INTERVAL = 2  # 秒
_LOGIN_TIMEOUT = 300  # 5 分钟
_MIN_COOKIE_COUNT = 10

# 抖音登录成功的标志性 Cookie 名称（只有登录后才会有）
_LOGIN_COOKIE_MARKERS = [
    "sessionid",
    "sid_tt",
    "uid_tt",
    "uid_tt_ss",
    "sid_guard",
    "tt_chain",
]


def _save_cookies_from_context(context, cookie_path: str) -> int:
    """从浏览器 context 导出 cookie 并保存到文件"""
    try:
        cookies = context.cookies()
        # 仅当存在登录标志 Cookie 时才保存
        if not _has_login_markers(cookies):
            return 0

        # 转换成 douyin_spark 兼容格式
        cookie_list = []
        for c in cookies:
            entry = {
                "name": c.get("name", ""),
                "value": c.get("value", ""),
                "domain": c.get("domain", ""),
                "path": c.get("path", "/"),
                "httpOnly": c.get("httpOnly", False),
                "secure": c.get("secure", False),
                "sameSite": c.get("sameSite", "Lax"),
            }
            if "expires" in c and c["expires"]:
                entry["expirationDate"] = c["expires"]
            cookie_list.append(entry)

        # 保存前先读取已有 cookie 做合并
        existing = []
        if os.path.exists(cookie_path):
            try:
                with open(cookie_path, "r", encoding="utf-8") as f:
                    existing = json.load(f)
            except Exception:
                existing = []
            if not isinstance(existing, list):
                existing = []

        merged = _merge_cookies(existing, cookie_list)

        with open(cookie_path, "w", encoding="utf-8") as f:
            json.dump(merged, f, ensure_ascii=False, indent=2)

        return len(merged)

    except Exception:
        return 0


def _merge_cookies(existing: list, new_cookies: list) -> list:
    """合并 cookie 列表，新 cookie 覆盖旧 cookie（同名同域）"""
    seen = {}
    for c in existing:
        key = (c.get("domain", ""), c.get("name", ""))
        seen[key] = c
    for c in new_cookies:
        key = (c.get("domain", ""), c.get("name", ""))
        seen[key] = c
    return list(seen.values())


def _is_logged_in(context) -> bool:
    """检测是否已登录（检查是否存在登录标志 Cookie）"""
    try:
        cookies = context.cookies()
        result = _has_login_markers(cookies)
        cookie_names = [c.get("name", "") for c in cookies]
        _log(f"Cookie 检查: count={len(cookies)}, markers={[n for n in cookie_names if n in _LOGIN_COOKIE_MARKERS]}, logged_in={result}")
        return result
    except Exception as e:
        _log(f"Cookie 检查异常: {e}")
        return False


def _has_login_markers(cookies_list: list) -> bool:
    """检查 cookie 列表是否有登录标志性名称"""
    if len(cookies_list) < _MIN_COOKIE_COUNT:
        return False
    cookie_names = {c.get("name", "") for c in cookies_list}
    for marker in _LOGIN_COOKIE_MARKERS:
        if marker in cookie_names:
            return True
    return False


def start_login(data_dir: str) -> dict:
    """
    启动网页登录。
    - 弹出可见浏览器窗口，用户自行登录抖音
    - 阻塞等待直到登录成功或超时
    - 登录成功后自动保存 Cookie 并关闭浏览器
    - 返回 { success, cookieCount, browserPid, loginMethod, error }
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return {"success": False, "error": "Playwright 未安装，请先运行 pip install playwright && playwright install chromium"}

    os.makedirs(data_dir, exist_ok=True)
    pid_file = os.path.join(data_dir, _BROWSER_PID_FILE)
    cookie_path = os.path.join(data_dir, "cookie_export.json")
    abort_login(data_dir)

    _playwright = None
    browser = None
    browser_pid = None
    started_at = time.time()

    try:
        _playwright = sync_playwright()
        p = _playwright.__enter__()

        # 启动可见浏览器
        browser = p.chromium.launch(
            headless=False,
            args=[
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--window-size=1200,800',
                '--window-position=100,50',
            ]
        )
        context = browser.new_context(
            viewport={"width": 1200, "height": 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                       "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        # 获取浏览器 PID
        try:
            if hasattr(browser, 'process') and browser.process:
                browser_pid = browser.process.pid
        except Exception:
            pass

        # 写入 PID 文件
        with open(pid_file, "w") as f:
            json.dump({
                "pid": browser_pid,
                "timestamp": started_at,
                "started": True,
            }, f)

        # 导航到抖音首页
        nav_ok = False
        for url in ["https://www.douyin.com/", "https://www.douyin.com/login/"]:
            try:
                page.goto(url, wait_until="load", timeout=30000)
                time.sleep(2)
                nav_ok = True
                break
            except Exception:
                continue

        if not nav_ok:
            raise Exception("无法访问抖音，请检查网络连接")

        # ===== 阻塞等待登录 =====
        _log("浏览器已打开，等待用户登录...")
        while True:
            elapsed = time.time() - started_at
            if elapsed > _LOGIN_TIMEOUT:
                # 超时
                browser.close()
                return {"success": False, "error": "登录超时（5 分钟）", "browserPid": browser_pid}

            # 检查浏览器是否还在运行
            if browser_pid:
                try:
                    os.kill(browser_pid, 0)
                except OSError:
                    # 浏览器被用户手动关闭
                    return {"success": False, "error": "浏览器窗口已关闭", "browserPid": browser_pid}

            # 读取 Cookie 检测登录状态
            try:
                if _is_logged_in(context):
                    _log("检测到登录 Cookie！正在保存...")
                    # 登录成功！保存 cookie
                    saved_count = _save_cookies_from_context(context, cookie_path)
                    _log(f"Cookie 保存完成：{saved_count} 条")
                    if saved_count > 0:
                        browser.close()
                        return {
                            "success": True,
                            "cookieCount": saved_count,
                            "browserPid": browser_pid,
                            "loginMethod": "web_browser",
                            "elapsed": round(elapsed, 1),
                        }
            except Exception:
                pass

            time.sleep(_COOKIE_CHECK_INTERVAL)

    except Exception as e:
        try:
            if browser:
                browser.close()
        except Exception:
            pass
        try:
            if _playwright:
                _playwright.__exit__(None, None, None)
        except Exception:
            pass
        return {"success": False, "error": str(e), "browserPid": browser_pid}

    finally:
        # 清理 PID 文件
        try:
            if os.path.exists(pid_file):
                os.remove(pid_file)
        except Exception:
            pass


def poll_login(data_dir: str) -> dict:
    """
    检查登录状态（用于前端轮询）。
    - 检查 Cookie 文件是否已更新（说明登录成功）
    - 检查 PID 文件是否还存在
    返回 { status: 'pending'|'success'|'failed'|'expired' }
    """
    pid_file = os.path.join(data_dir, _BROWSER_PID_FILE)
    cookie_path = os.path.join(data_dir, "cookie_export.json")

    # 检查 Cookie 文件
    if os.path.exists(cookie_path):
        try:
            with open(cookie_path, "r", encoding="utf-8") as f:
                cookies = json.load(f)
            if isinstance(cookies, list) and _has_login_markers(cookies):
                return {"status": "success", "cookieCount": len(cookies)}
        except Exception:
            pass

    # 检查 PID 文件（浏览器是否还在运行）
    if os.path.exists(pid_file):
        try:
            with open(pid_file, "r") as f:
                state = json.load(f)
            started = state.get("timestamp", 0)
            browser_pid = state.get("pid")

            # 检查浏览器进程
            if browser_pid and browser_pid > 0:
                try:
                    os.kill(browser_pid, 0)
                except OSError:
                    # 浏览器已退出，但 Cookie 文件不存在
                    return {"status": "failed"}

            # 检查超时
            if time.time() - started > _LOGIN_TIMEOUT:
                return {"status": "expired"}

        except Exception:
            pass

    return {"status": "pending"}


def abort_login(data_dir: str):
    """
    终止登录流程：
    - 杀掉浏览器进程
    - 清理临时文件
    """
    pid_file = os.path.join(data_dir, _BROWSER_PID_FILE)

    if os.path.exists(pid_file):
        try:
            with open(pid_file, "r") as f:
                state = json.load(f)
            browser_pid = state.get("pid")
            if browser_pid and browser_pid > 0:
                try:
                    if sys.platform == "win32":
                        subprocess.run(["taskkill", "/F", "/PID", str(browser_pid)],
                                     capture_output=True, timeout=5)
                    else:
                        os.kill(browser_pid, signal.SIGTERM)
                except Exception:
                    pass
        except Exception:
            pass
        try:
            os.remove(pid_file)
        except Exception:
            pass

    # 清理临时截图
    qr_path = os.path.join(data_dir, "qrcode.png")
    try:
        if os.path.exists(qr_path):
            os.remove(qr_path)
    except Exception:
        pass


if __name__ == "__main__":
    # 测试入口
    import sys
    data_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "_test_data")
    action = sys.argv[2] if len(sys.argv) > 2 else "start"

    if action == "start":
        result = start_login(data_dir)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif action == "poll":
        result = poll_login(data_dir)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif action == "abort":
        abort_login(data_dir)
        print(json.dumps({"success": True}, ensure_ascii=False))
