"""
抖音自动续火花脚本
功能：每天在指定时间段发送 "[Ai]火花火花！+日期+时间" 给指定用户列表
时间窗口：1:00~7:00 或 17:00~19:00，每天最多发送一次
"""

import json
import os
import time
import sys
import unicodedata
from datetime import datetime, timezone, timedelta
from playwright.sync_api import sync_playwright


class LoginExpiredException(Exception):
    """Cookie 已过期异常——页面检测到「登录后」/「扫码登录」"""
    pass
    pass


# 自动探测 Playwright Chromium 路径（优先使用已安装的完整版 Chrome）
def _get_chromium_executable():
    """返回可用的 Chromium/Chrome 可执行文件路径，或 None（让 Playwright 自动下载）"""
    import sys
    script_dir = os.path.dirname(os.path.abspath(__file__))
    # 候选的 ms-playwright 根目录（按优先级排序）
    base_dirs = [
        # 1. 环境变量指定（用户可自定义）
        os.environ.get('PLAYWRIGHT_BROWSERS_PATH'),
        # 2. 标准位置：%LOCALAPPDATA%\ms-playwright
        os.path.join(os.environ.get('LOCALAPPDATA', ''), 'ms-playwright'),
        # 3. Linux/macOS 位置
        os.path.join(os.path.expanduser('~'), '.cache', 'ms-playwright'),
        # 4. 脚本同目录（打包场景：ms-playwright 随脚本分发）
        os.path.join(script_dir, 'ms-playwright'),
        # 5. Python 可执行文件同目录（嵌入式 Python 场景）
        os.path.join(os.path.dirname(sys.executable), 'ms-playwright'),
        # 6. Python prefix 下（虚拟环境场景）
        os.path.join(sys.prefix, 'ms-playwright'),
    ]
    # 搜索已有的 chromium 目录（完整版或 headless shell 均可）
    for base in base_dirs:
        if not base or not os.path.isdir(base):
            continue
        for d in sorted(os.listdir(base)):
            if not d.startswith('chromium-'):
                continue
            # 完整版 chromium
            for rel in ('chrome-win64/chrome.exe', 'chrome-win/chrome.exe'):
                cand = os.path.join(base, d, rel)
                if os.path.isfile(cand):
                    return cand
            # headless shell
            for rel in ('chrome-headless-shell-win64/chrome-headless-shell.exe',):
                cand = os.path.join(base, d, rel)
                if os.path.isfile(cand):
                    return cand
    return None

CHROMIUM_EXECUTABLE = _get_chromium_executable()

# 可选：Cookie 过期邮件提醒（无配置时静默跳过）
_EMAIL_ALERT_AVAILABLE = False
try:
    from email_alert import check_and_alert
    _EMAIL_ALERT_AVAILABLE = True
except ImportError:
    pass

# ==== 配置 ====
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# 统一状态文件路径（所有实例共用）
SHARED_DATA_DIR = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'AutoDouyinSpark', 'data')
os.makedirs(SHARED_DATA_DIR, exist_ok=True)

# 迁移旧文件（从 SCRIPT_DIR 到 SHARED_DATA_DIR，仅首次）
def _migrate_legacy_files(src_dir, dst_dir):
    """将旧目录中的状态文件复制到新共享目录（不存在时才复制）"""
    legacy_files = [
        "spark_config.json", "cookie_export.json",
        ".spark_state", ".spark_streak", ".spark_log",
        ".spark_days_cache", ".spark_confirm", ".spark_login_check", ".spark_avatars"
    ]
    migrated = False
    for fname in legacy_files:
        src = os.path.join(src_dir, fname)
        dst = os.path.join(dst_dir, fname)
        if os.path.exists(src) and not os.path.exists(dst):
            try:
                import shutil
                shutil.copy2(src, dst)
                migrated = True
            except:
                pass
    if migrated:
        print(f"[migrate] 已迁移旧文件到 {dst_dir}")
_migrate_legacy_files(SCRIPT_DIR, SHARED_DATA_DIR)

_CONFIG_FILE = os.path.join(SHARED_DATA_DIR, "spark_config.json")
TARGET_USERS = ["淋雨也走", "酸菜鱼米"]
if os.path.exists(_CONFIG_FILE):
    try:
        with open(_CONFIG_FILE, "r", encoding="utf-8") as _f:
            _cfg = json.load(_f)
            _users = _cfg.get("target_users")
            if _users and isinstance(_users, list) and len(_users) > 0:
                TARGET_USERS = _users
    except Exception:
        pass
COOKIE_FILE = os.path.join(SHARED_DATA_DIR, "cookie_export.json")
STATE_FILE = os.path.join(SHARED_DATA_DIR, ".spark_state")
STREAK_FILE = os.path.join(SHARED_DATA_DIR, ".spark_streak")
LOG_FILE = os.path.join(SHARED_DATA_DIR, ".spark_log")
DAYS_CACHE = os.path.join(SHARED_DATA_DIR, ".spark_days_cache")
CONFIRM_FILE = os.path.join(SHARED_DATA_DIR, ".spark_confirm")
LOGIN_CHECK_FILE = os.path.join(SHARED_DATA_DIR, ".spark_login_check")
AVATARS_FILE = os.path.join(SHARED_DATA_DIR, ".spark_avatars")
LOCK_FILE = os.path.join(SHARED_DATA_DIR, ".spark_lock")
CHINA_TZ = timezone(timedelta(hours=8))
_PID = os.getpid()  # 用于日志标记 + 并发锁

# 浏览器模式（可通过 engine.py 覆写为 False 解决反爬）
HEADLESS = True

# Cookie 实测检查间隔（秒）— 默认 1 小时
_COOKIE_CHECK_INTERVAL = 3600

def _acquire_lock(timeout=10):
    """获取进程互斥锁，防止多个浏览器同时运行"""
    import time as _time
    waited = 0
    while waited < timeout:
        if os.path.exists(LOCK_FILE):
            try:
                with open(LOCK_FILE, "r") as f:
                    old_pid = int(f.read().strip())
                os.kill(old_pid, 0)
                _time.sleep(1)
                waited += 1
                continue
            except (ValueError, PermissionError, NotADirectoryError):
                os.remove(LOCK_FILE)
            except OSError:
                try: os.remove(LOCK_FILE)
                except: pass
        try:
            with open(LOCK_FILE, "w") as f:
                f.write(str(_PID))
            return True
        except: pass
    return False


def _release_lock():
    """释放进程互斥锁"""
    try:
        if os.path.exists(LOCK_FILE):
            with open(LOCK_FILE, "r") as f:
                pid = int(f.read().strip())
            if pid == _PID:
                os.remove(LOCK_FILE)
    except: pass




def _check_login_status_playwright():
    """用 Playwright 实测 Cookie 是否有效"""
    try:
        with open(COOKIE_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
        cookies = normalize_cookies(raw, ".douyin.com")
    except:
        return False

    # 并发锁：避免多个检测实例同时开浏览器
    if not _acquire_lock():
        log("⚠️ 已有浏览器在运行，登录检测跳过")
        return True  # 乐观假设有效，避免阻塞

    try:
        with sync_playwright() as p:
            launch_kwargs = {"headless": True}
            if CHROMIUM_EXECUTABLE:
                launch_kwargs["executable_path"] = CHROMIUM_EXECUTABLE
            browser = p.chromium.launch(**launch_kwargs)
            context = browser.new_context(viewport={"width": 1440, "height": 900})
            context.add_cookies(cookies)
            page = context.new_page()
            page.goto("https://www.douyin.com/", wait_until="domcontentloaded", timeout=30000)
            time.sleep(5)  # 等待足够时间让登录弹窗渲染

            # 登录状态检测（抖音通常弹窗而非跳转 URL）
            logged_in = True

            # 1. URL 跳转检测
            if "login" in page.url or "passport" in page.url:
                logged_in = False

            # 2. 页面内容检测（登录弹窗/遮罩）
            if logged_in:
                body_text = page.locator('body').first.inner_text()
                if '登录后' in body_text or '扫码登录' in body_text or '登录过期' in body_text:
                    logged_in = False

            # 3. 登录弹窗 CSS 元素检测
            if logged_in:
                try:
                    has_login_dialog = page.locator(
                        '[class*="login-modal"], [class*="login-dialog"], [class*="login-mask"], '
                        '[class*="loginPanel"], [class*="login-panel"], [class*="LoginModal"], '
                        'div:has(> [class*="qrcode"]):has-text("扫码"), '
                        'div:has-text("打开抖音APP扫码")'
                    ).first
                    if has_login_dialog.is_visible(timeout=1000):
                        logged_in = False
                except:
                    pass

            browser.close()
            return logged_in
    except:
        return False
    finally:
        _release_lock()


def _invalidate_login_cache():
    """清除登录状态缓存，强制下次调用做个实测检查"""
    try:
        if os.path.exists(LOGIN_CHECK_FILE):
            os.remove(LOGIN_CHECK_FILE)
    except:
        pass


def get_cookie_valid_status():
    """返回 Cookie 有效性状态（缓存最多 1 小时）"""
    now = datetime.now(CHINA_TZ)
    if os.path.exists(LOGIN_CHECK_FILE):
        try:
            with open(LOGIN_CHECK_FILE, "r", encoding="utf-8") as f:
                st = json.load(f)
            last = datetime.fromisoformat(st.get("checked_at", "2000-01-01"))
            if (now - last).total_seconds() < _COOKIE_CHECK_INTERVAL:
                return st  # 缓存有效
        except:
            pass
    # 实测
    valid = _check_login_status_playwright()
    result = {
        "valid": valid,
        "checked_at": now.isoformat(),
    }
    os.makedirs(os.path.dirname(LOGIN_CHECK_FILE), exist_ok=True)
    with open(LOGIN_CHECK_FILE, "w", encoding="utf-8") as f:
        json.dump(result, f)
    return result

# 北京时间窗口（小时）- 从配置文件读取，默认全天
def _load_time_windows():
    """从配置文件加载时间窗口设置，返回 (enabled, windows)"""
    enabled = False
    windows = []
    try:
        if os.path.exists(_CONFIG_FILE):
            with open(_CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            # 新格式
            if "timeWindowsEnabled" in cfg:
                enabled = cfg.get("timeWindowsEnabled", False)
                windows = cfg.get("timeWindows", [])
            # 兼容旧格式
            elif cfg.get("morningStart") is not None:
                enabled = True
                windows = []
                if cfg.get("morningStart") is not None:
                    windows.append({"start": cfg["morningStart"], "end": cfg.get("morningEnd", 7)})
                if cfg.get("eveningStart") is not None:
                    windows.append({"start": cfg["eveningStart"], "end": cfg.get("eveningEnd", 19)})
    except:
        pass
    return enabled, windows


def log(msg):
    """写日志文件（含 PID 标记，便于区分多实例日志）"""
    now = datetime.now(CHINA_TZ).strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{now}] [PID:{_PID}] {msg}"
    # 输出到 stderr（避免与 stdout 的 JSON 结果混合）
    print(line, file=sys.stderr, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except:
        pass


def already_sent_today():
    """检查今天是否已经发送过消息"""
    today = datetime.now(CHINA_TZ).strftime("%Y-%m-%d")
    if not os.path.exists(STATE_FILE):
        return False
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            saved_date = f.read().strip()
        return saved_date == today
    except:
        return False


def mark_sent():
    """记录今天已发送，并更新连续火花天数"""
    now = datetime.now(CHINA_TZ)
    today = now.strftime("%Y-%m-%d")
    # 写状态
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        f.write(today)
    # 更新连续天数
    streak = 1
    if os.path.exists(STREAK_FILE):
        try:
            with open(STREAK_FILE, "r", encoding="utf-8") as f:
                prev = json.load(f)
            prev_date = prev.get("last_date", "")
            prev_streak = prev.get("streak", 0)
            # 如果是连续的第2天（昨天也发了），累加
            yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")
            if prev_date == yesterday:
                streak = prev_streak + 1
            elif prev_date == today:
                streak = prev_streak
        except:
            streak = 1
    with open(STREAK_FILE, "w", encoding="utf-8") as f:
        json.dump({"last_date": today, "streak": streak}, f)


def in_time_window():
    """判断当前北京时间是否在允许的时间窗口内"""
    enabled, windows = _load_time_windows()
    if not enabled or not windows:
        return "always"  # 全天可发送
    now = datetime.now(CHINA_TZ)
    hour = now.hour
    for win in windows:
        start = win.get("start", 0)
        end = win.get("end", 23)
        if start <= hour <= end:
            return f"{start}:00-{end}:00"
    return None


def normalize_cookies(raw_data, target_domain):
    cookies = []
    if isinstance(raw_data, list):
        for c in raw_data:
            name = c.get("name", "")
            if not name:
                continue
            cookie = {
                "name": name,
                "value": c.get("value", ""),
                "domain": c.get("domain", target_domain),
                "path": c.get("path", "/"),
            }
            if "expirationDate" in c and c["expirationDate"]:
                cookie["expires"] = c["expirationDate"]
            elif "expires" in c and c["expires"]:
                cookie["expires"] = c["expires"]
            for key in ("httpOnly", "secure"):
                if c.get(key):
                    cookie[key] = True
            same_site = c.get("sameSite")
            same_site_map = {
                "no_restriction": "None", "strict": "Strict",
                "lax": "Lax", "Strict": "Strict", "Lax": "Lax", "None": "None",
            }
            if same_site in same_site_map:
                cookie["sameSite"] = same_site_map[same_site]
            cookies.append(cookie)
    return cookies


def _dismiss_trust_dialog(page):
    """检测并关闭信任登录弹窗（如果存在），避免遮罩层拦截点击"""
    try:
        # 先检测遮罩层是否存在且可见
        mask = page.locator('[class*="trust-login-dialog-mask"]').first
        if mask.is_visible(timeout=500):
            log("🔒 检测到信任登录弹窗遮罩，正在关闭...")
            # 点击"取消"按钮关闭弹窗
            cancel_btn = page.locator('[class*="trust-login-dialog-button-cancel"]')
            if cancel_btn.count() > 0 and cancel_btn.first.is_visible(timeout=300):
                cancel_btn.first.click(timeout=1000)
                time.sleep(1)
                log("✅ 信任登录弹窗已关闭")
                return True
            # 备选：直接点弹窗内容中的取消按钮
            content = page.locator('[class*="trust-login-dialog-content"]').first
            if content.is_visible(timeout=300):
                cancel_btn2 = content.locator('button:has-text("取消")')
                if cancel_btn2.count() > 0:
                    cancel_btn2.first.click(timeout=1000)
                    time.sleep(1)
                    log("✅ 信任登录弹窗已关闭（备选方式）")
                    return True
    except Exception:
        pass

    # 通用：扫描所有可见的"取消"按钮并点击
    try:
        cancel_any = page.locator('button:has-text("取消"), span:has-text("取消"), div:has-text("取消")')
        for i in range(cancel_any.count()):
            try:
                if cancel_any.nth(i).is_visible(timeout=300):
                    cancel_any.nth(i).click(timeout=1000)
                    time.sleep(1)
                    log("✅ 已点击「取消」按钮")
                    return True
            except:
                continue
    except Exception:
        pass
    return False


def _clean_text(text):
    """清理文本中的不可见 Unicode 字符并 NFC 归一化"""
    if not text:
        return text
    # 移除常见的不可见字符
    for ch in ('\u200b', '\u200c', '\u200d', '\ufeff', '\u00a0'):
        text = text.replace(ch, '')
    # NFC 归一化
    return unicodedata.normalize('NFC', text)


def _open_session_list(page):
    """在私信聊天界面中，点击汉堡菜单展开会话列表"""
    time.sleep(0.5)
    for sel in [
        'span:has(svg rect[rx="1"])',
        'div:has(svg rect[rx="1"])',
        'span svg[width="24"]',
        'div[class*="header"] svg',
    ]:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0 and loc.is_visible(timeout=300):
                loc.locator('..').click(timeout=500) if sel == 'span svg[width="24"]' else loc.click(timeout=500)
                time.sleep(1.5)
                return True
        except:
            pass
    # 不输出警告（天数字取不需要）
    return False


def send_to_user(page, username, msg):
    """给单个用户发送消息 - 优先使用搜索"""
    log(f"  🔍 正在搜索「{username}」...")

    # 1. 用搜索功能查找用户
    clicked = False
    search_input = None
    # 等待搜索框出现（页面完全渲染需要时间）
    # 多选择器兜底：抖音可能改 placeholder 文字
    search_selectors = [
        'input[placeholder="搜索"]',
        'input[placeholder*="搜索"]',
        'input[class*="search"]:visible',
        'input[class*="search-input"]',
        'input[data-e2e="search-input"]',
        '[class*="search"] input:visible',
        'span[class*="search"] + input',
    ]
    found = False
    for sel in search_selectors:
        try:
            page.wait_for_selector(sel, timeout=3000)
            loc = page.locator(sel).first
            if loc.count() > 0 and loc.is_visible():
                search_input = loc
                log(f"  ✅ 找到搜索框: {sel}")
                found = True
                break
        except:
            continue

    if not found:
        # 尝试点击搜索图标来展开搜索输入框
        log(f"  ⚠️ 搜索框未出现，尝试点击搜索图标...")
        for icon_sel in ['[class*="search-icon"]', 'svg[class*="search"]', 'span:has(svg):near(:text("搜索"))']:
            try:
                icon = page.locator(icon_sel).first
                if icon.count() > 0:
                    icon.click(timeout=3000)
                    time.sleep(1)
                    break
            except:
                pass
        # 再试查找
        for sel in ['input:visible[type="text"]', 'input:visible']:
            try:
                loc = page.locator(sel).first
                if loc.count() > 0 and loc.is_visible():
                    search_input = loc
                    log(f"  ✅ 找到通用输入框: {sel}")
                    break
            except:
                pass
    if search_input is not None:
        try:
            search_input.click(timeout=5000)
            time.sleep(1)
            search_input.fill("")
            time.sleep(0.3)
            search_input.type(username, delay=50)
            log(f"  ✏️ 已输入搜索关键词: {username}")
            time.sleep(2)

            # 点击"发私信"按钮
            try:
                send_btn = page.locator('text=发私信').first
                if send_btn.count() > 0:
                    send_btn.click(timeout=5000)
                    log(f"  🖱️ 点击「发私信」")
                    clicked = True
                    time.sleep(2)
            except:
                pass

            if not clicked:
                try:
                    result = page.locator(f'text={username}').first
                    if result.count() > 0:
                        result.click(timeout=5000)
                        log(f"  🖱️ 点击用户名: {username}")
                        clicked = True
                        time.sleep(2)
                except:
                    pass

            if not clicked:
                items = page.evaluate("""(target) => {
                    const els = document.querySelectorAll('div, span, a, li');
                    const results = [];
                    const seen = new Set();
                    els.forEach(el => {
                        const t = el.textContent.trim();
                        if (t === target && !seen.has(t) && el.offsetHeight > 0) {
                            seen.add(t);
                            const r = el.getBoundingClientRect();
                            results.push({x: r.x, y: r.y, w: r.width, h: r.height});
                        }
                    });
                    return results;
                }""", username)
                if items:
                    item = items[0]
                    page.mouse.click(item['x'] + item['w'] / 2, item['y'] + item['h'] / 2)
                    clicked = True
                    time.sleep(2)
        except Exception as e:
            log(f"  ⚠️ 搜索失败: {e}")
    else:
        log(f"  ⚠️ 未找到搜索框")
    if not clicked:
        # 尝试 evaluate 遍历元素找到用户名
        log(f"  🔄 搜索方式未生效，降级到页面扫描...")
        try:
            items = page.evaluate("""(target) => {
                const els = document.querySelectorAll('div, span, a, li');
                const results = [];
                const seen = new Set();
                els.forEach(el => {
                    const t = el.textContent.trim();
                    if (t === target && !seen.has(t) && el.offsetHeight > 0) {
                        seen.add(t);
                        const r = el.getBoundingClientRect();
                        results.push({x: r.x, y: r.y, w: r.width, h: r.height});
                    }
                });
                return results;
            }""", username)
            if items:
                item = items[0]
                page.mouse.click(item['x'] + item['w'] / 2, item['y'] + item['h'] / 2)
                log(f"  🖱️ 点击: {username}")
                clicked = True
                time.sleep(2)
        except Exception as e:
            log(f"  ⚠️ 页面扫描失败: {e}")
    if not clicked:
        log(f"  ❌ 无法找到「{username}」的会话")
        return False

    time.sleep(1.5)  # 等待聊天界面加载
    try:
        input_el = page.locator('[contenteditable="true"]').first
        input_el.click(timeout=15000)
        time.sleep(0.5)
        log(f"  ✏️ 正在输入消息...")
        input_el.type(msg, delay=50)
        time.sleep(1)
        page.keyboard.press("Enter")
        time.sleep(2)
        log(f"✅ 已发送 → 「{username}」: {msg}")
        return True
    except Exception as e:
        log(f"❌ 发送给 [{username}] 失败: {e}")
        return False


def _scrape_avatars(page):
    """从当前页面（聊天/私信列表）抓取用户头像 URL"""
    try:
        targets = list(TARGET_USERS)
        if not targets:
            return
        # 等待会话列表渲染
        try:
            page.wait_for_selector('img[src*="douyinpic"], img[src*="byteimg"]', timeout=30000)
        except:
            pass
        time.sleep(2)

        data = page.evaluate("""(targetNames) => {
            // 1. 收集所有包含用户名的文本位置（扩大元素类型）
            const nameItems = [];
            const allEls = document.querySelectorAll('div, span, li, a, p, section, h1, h2, h3, h4, h5, h6, button');
            allEls.forEach(el => {
                const text = (el.textContent || '').trim();
                if (text.length === 0 || text.length > 200) return;
                for (const name of targetNames) {
                    if (text.includes(name) && text.length < name.length + 80) {
                        const r = el.getBoundingClientRect();
                        if (r.width > 0 && r.height > 0 && r.width < 400) {
                            nameItems.push({ name, x: r.x, y: r.y, w: r.width, h: r.height });
                        }
                    }
                }
            });
            // 2. 收集头像图片（>=32px，放宽尺寸限制）
            const avatarImgs = [];
            document.querySelectorAll('img').forEach(img => {
                const src = img.src || '';
                if (!src || src.includes('svg')) return;
                const r = img.getBoundingClientRect();
                if (r.width < 32 || r.height < 32 || r.width > 200 || r.height > 200) return;
                avatarImgs.push({ x: r.x, y: r.y, w: r.width, h: r.height, src });
            });
            // 3. 垂直距离匹配
            const results = {};
            for (const name of targetNames) {
                const userItems = nameItems.filter(i => i.name === name);
                if (userItems.length === 0) continue;
                let best = null, bestScore = Infinity;
                for (const pos of userItems) {
                    for (const img of avatarImgs) {
                        const vDist = Math.abs(img.y + img.h/2 - (pos.y + pos.h/2));
                        if (vDist < 100 && vDist < bestScore) {
                            bestScore = vDist;
                            best = img.src;
                        }
                    }
                }
                if (best) results[name] = best;
            }
            results['__debug'] = 'names=' + nameItems.length + ' imgs=' + avatarImgs.length;
            return results;
        }""", targets)
        debug_info = data.pop('__debug', '')
        log(f"  📊 头像扫描: {debug_info}")
        if data and len(data) > 0:
            with open(AVATARS_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
            log(f"📸 已缓存 {len(data)} 个头像: {list(data.keys())}")
        else:
            log(f"⚠️ 未抓到头像（目标: {targets}）")
    except Exception as e:
        log(f"⚠️ 抓取头像失败: {e}")


def send_messages():
    """发送消息给所有目标用户"""
    now = datetime.now(CHINA_TZ)
    msg_template = "[Auto]火花火花！{time}"
    if os.path.exists(_CONFIG_FILE):
        try:
            with open(_CONFIG_FILE, "r", encoding="utf-8") as _f:
                _cfg = json.load(_f)
                _tmpl = _cfg.get("message_template", "")
                if _tmpl:
                    msg_template = _tmpl
        except Exception:
            pass
    msg = msg_template.replace("{time}", now.strftime("%Y-%m-%d %H:%M:%S"))

    with open(COOKIE_FILE, "r", encoding="utf-8") as f:
        raw = json.load(f)
    cookies = normalize_cookies(raw, ".douyin.com")
    log(f"加载了 {len(cookies)} 个 cookie")

    all_ok = False  # 默认失败
    _p = None
    try:
        _p = sync_playwright()
        p = _p.__enter__()
        log("🚀 启动 Chromium 浏览器")
        t0 = time.time()
        launch_kwargs = {"headless": HEADLESS}
        if CHROMIUM_EXECUTABLE:
            launch_kwargs["executable_path"] = CHROMIUM_EXECUTABLE
        browser = p.chromium.launch(**launch_kwargs)
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
        )
        context.add_cookies(cookies)
        page = context.new_page()
        log(f"✅ 浏览器就绪 ({time.time()-t0:.1f}s)")

        # 1. 先访问主页建立 Cookie/Session，再跳转聊天页
        log("🌐 正在打开 douyin.com...")
        page.goto("https://www.douyin.com/", wait_until="domcontentloaded", timeout=60000)
        time.sleep(3)
        _dismiss_trust_dialog(page)

        # === 主页登录过期检测（提前拦截，避免浪费时间）===
        try:
            body_text = page.locator('body').first.inner_text()[:500]
            if '登录后' in body_text or '扫码登录' in body_text or '登录过期' in body_text:
                log("🔒 Cookie 已过期！检测到页面登录提示，请重新登录")
                _invalidate_login_cache()
                raise LoginExpiredException("Cookie 已过期")
        except LoginExpiredException:
            raise
        except Exception:
            pass

        log(f"✅ 主页加载完成 ({time.time()-t0:.1f}s)")

        log("🌐 跳转到 douyin.com/chat...")
        page.goto("https://www.douyin.com/chat", wait_until="domcontentloaded", timeout=120000)
        log(f"✅ 聊天页面加载完成 ({time.time()-t0:.1f}s)")
        time.sleep(5)

        # === 登录过期检测 ===
        try:
            body_text = page.locator('body').first.inner_text()[:500]
            if '登录后' in body_text or '扫码登录' in body_text or '登录过期' in body_text:
                log("🔒 Cookie 已过期！检测到页面登录提示，请重新登录")
                _invalidate_login_cache()
                raise LoginExpiredException("Cookie 已过期")
        except LoginExpiredException:
            raise
        except Exception:
            pass

        # 2. 等待页面稳定（首页加载慢，首次要十几秒）
        try:
            page.wait_for_selector('[contenteditable="true"], .chat-container, [class*="chat"]', timeout=60000)
            log(f"✅ 聊天界面就绪 ({time.time()-t0:.1f}s)")
        except:
            log(f"⚠️ 聊天界面等待超时，继续... ({time.time()-t0:.1f}s)")
        time.sleep(3)

        # 3. 关闭信任登录弹窗（如果存在）
        _dismiss_trust_dialog(page)
        # 抓取头像
        _scrape_avatars(page)
        time.sleep(1)

        # 4. 逐个发送
        all_ok = True
        for idx, user in enumerate(TARGET_USERS):
            log(f"👤 [{idx+1}/{len(TARGET_USERS)}] 正在发送给「{user}」...")
            time.sleep(1)
            ok = send_to_user(page, user, msg)
            if ok:
                log(f"✅ [{idx+1}/{len(TARGET_USERS)}] 「{user}」发送成功")
                # 每个用户发送成功后截图（日期_用户名）
                ss_dir = os.path.join(SHARED_DATA_DIR, "screenshots")
                os.makedirs(ss_dir, exist_ok=True)
                today_str = now.strftime("%Y-%m-%d")
                ss_user = os.path.join(ss_dir, f"{today_str}_{user}.png")
                page.screenshot(path=ss_user)
                log(f"📸 火花截图已保存: {today_str}_{user}.png")
            if not ok:
                log(f"❌ [{idx+1}/{len(TARGET_USERS)}] 「{user}」发送失败")
                all_ok = False

        # 顺手抓取火花天数
        try:
            _scrape_spark_days(page)
        except Exception as e:
            log(f"⚠️ 抓取火花天数失败: {e}")

        # 关闭浏览器（异常保护）
        try:
            browser.close()
        except Exception as e:
            log(f"⚠️ 关闭浏览器异常: {e}")

        return all_ok
    finally:
        if _p is not None:
            try:
                _p.__exit__(None, None, None)
            except:
                pass
    return all_ok


def _scrape_spark_days(page, expand_list=True):
    """从当前页面（已在私信列表）提取火花天数并缓存"""
    import re
    # 展开会话列表以便看到所有用户的聊天
    if expand_list:
        _open_session_list(page)
        time.sleep(1)
    sessions = page.evaluate("""() => {
        const items = [];
        const sel = 'div, span, a, li';
        const els = document.querySelectorAll(sel);
        els.forEach(el => {
            const t = el.textContent.trim();
            if (t.length > 0 && t.length < 300) items.push(t);
        });
        return items;
    }""")
    result = {}
    for user in TARGET_USERS:
        for text in sessions:
            if user not in text:
                continue
            m = re.search(re.escape(user) + r'\s+(\d+)\D', text)
            if m:
                days = int(m.group(1))
                if 1 <= days <= 999:
                    result[user] = days
                    break
            parts = text.split(user, 1)
            if len(parts) > 1:
                m2 = re.search(r'(\d+)', parts[1][:30])
                if m2:
                    days = int(m2.group(1))
                    if 1 <= days <= 999:
                        result[user] = days
                        break
    if result:
        # 更新缓存，同时记录旧值作为 prev_days
        old_days = {}
        if os.path.exists(DAYS_CACHE):
            try:
                with open(DAYS_CACHE, "r", encoding="utf-8") as f:
                    old_days = json.load(f).get("days", {})
            except:
                pass
        # 如果值有变化（增加），把旧值存为 prev_days
        prev_days = None
        for k in result:
            if result[k] != old_days.get(k, 0):
                prev_days = old_days
                break
        cache_data = {
            "updated_at": datetime.now(CHINA_TZ).isoformat(),
            "days": result,
        }
        if prev_days:
            cache_data["prev_days"] = prev_days
        elif "prev_days" in old_days:
            # 值没变则保留历史 prev_days
            cache_data["prev_days"] = old_days["prev_days"]
        with open(DAYS_CACHE, "w", encoding="utf-8") as f:
            json.dump(cache_data, f, ensure_ascii=False, indent=2)
        log(f"🔥 火花天数: {', '.join(f'{k}={v}' for k,v in result.items())}")


def _check_cookie_expiry():
    """检查 Cookie 过期情况，必要时发邮件提醒（无配置则静默跳过）"""
    if not _EMAIL_ALERT_AVAILABLE:
        return
    try:
        config_file = os.path.join(SHARED_DATA_DIR, "email_config.json")
        if not os.path.exists(config_file):
            return
        # 实测登录状态
        login_status = get_cookie_valid_status()
        if login_status.get("valid") is False:
            log(f"⚠️ Cookie 实测无效（服务端拒绝），需要重新登录导出")
        else:
            log(f"✅ Cookie 实测有效")
        check_and_alert(config_file, COOKIE_FILE)
    except Exception as e:
        log(f"⚠️ Cookie 过期检查异常: {e}")


def _should_skip_spark_check(today):
    """检查今日是否已确认对方续了火花"""
    if not os.path.exists(CONFIRM_FILE):
        return False
    try:
        with open(CONFIRM_FILE, "r", encoding="utf-8") as f:
            st = json.load(f)
        return st.get("date") == today and st.get("confirmed") is True
    except:
        return False


def _init_today_baseline(today):
    """每天首次运行时，从 spark_days_cache 取出"今日之前最终值"作为基准。
    优先使用 cache 中的 prev_days（前次变化前的值），
    如果已初始化过则直接返回已有基准值（不覆盖）。"""
    if os.path.exists(CONFIRM_FILE):
        try:
            with open(CONFIRM_FILE, "r", encoding="utf-8") as f:
                st = json.load(f)
            if st.get("date") == today:
                return st.get("prev_days", {})
        except:
            pass
    # 从缓存取"前一次的最终值"作为今日基准
    baseline = {}
    if os.path.exists(DAYS_CACHE):
        try:
            with open(DAYS_CACHE, "r", encoding="utf-8") as f:
                cached = json.load(f)
            # 优先使用 prev_days（变化前的值），更接近"昨日最终值"
            if "prev_days" in cached and cached["prev_days"]:
                baseline = cached["prev_days"]
            else:
                baseline = cached.get("days", {})
        except:
            pass
    with open(CONFIRM_FILE, "w", encoding="utf-8") as f:
        json.dump({"date": today, "confirmed": False, "prev_days": baseline, "latest_days": baseline}, f, ensure_ascii=False, indent=2)
    log(f"📋 今日火花基准: {dict(baseline)}")
    return baseline


def _confirm_spark_check(today, new_days):
    """对比今日基准与新天数，确认对方也续了火花"""
    prev_days = _init_today_baseline(today)
    increased = False
    for user in prev_days:
        old_v = prev_days.get(user, 0)
        new_v = new_days.get(user, 0)
        if new_v > old_v:
            increased = True
            break
    # 更新 latest_days
    with open(CONFIRM_FILE, "w", encoding="utf-8") as f:
        json.dump({
            "date": today,
            "confirmed": increased,
            "prev_days": prev_days,
            "latest_days": new_days,
        }, f, ensure_ascii=False, indent=2)
    if increased:
        log(f"✅ 对方今日已续火花（{dict(prev_days)}→{dict(new_days)}），今日不再检查")
    else:
        log(f"⏳ 对方尚未续火花（基准: {dict(prev_days)}，最新: {dict(new_days)}），继续检查")


def _update_spark_days(force=False):
    """单独打开浏览器抓取火花天数，并判断对方是否续了"""
    today = datetime.now(CHINA_TZ).strftime("%Y-%m-%d")
    if not force and _should_skip_spark_check(today):
        log(f"⏭️ 今日对方续火花已确认，跳过检查")
        return

    log("🔥 正在更新火花天数...")
    try:
        with open(COOKIE_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
        cookies = normalize_cookies(raw, ".douyin.com")

        _p = None
        try:
            _p = sync_playwright()
            p = _p.__enter__()
            launch_kwargs = {"headless": HEADLESS}
            if CHROMIUM_EXECUTABLE:
                launch_kwargs["executable_path"] = CHROMIUM_EXECUTABLE
            browser = p.chromium.launch(**launch_kwargs)
            context = browser.new_context(
                viewport={"width": 1440, "height": 900},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
            )
            context.add_cookies(cookies)
            page = context.new_page()

            page.goto("https://www.douyin.com/", wait_until="domcontentloaded", timeout=60000)
            time.sleep(3)
            _dismiss_trust_dialog(page)
            page.goto("https://www.douyin.com/chat", wait_until="domcontentloaded", timeout=120000)
            time.sleep(5)
            try:
                page.wait_for_selector('[contenteditable="true"], .chat-container, [class*="chat"]', timeout=60000)
            except:
                pass
            time.sleep(3)
            _dismiss_trust_dialog(page)
            try:
                # 先抓头像（默认会话列表已可见，不展开以免切换状态）
                _scrape_avatars(page)
                # 再展开列表抓天数
                _open_session_list(page)
                time.sleep(1)
                _scrape_spark_days(page, expand_list=False)
            except Exception as e:
                log(f"⚠️ 无法进入私信抓取火花天数: {e}")

            try:
                browser.close()
            except:
                pass
        finally:
            if _p is not None:
                try:
                    _p.__exit__(None, None, None)
                except:
                    pass

        # 读取最新天数，判断对方是否续了
        if os.path.exists(DAYS_CACHE):
            try:
                with open(DAYS_CACHE, "r", encoding="utf-8") as f:
                    new_days = json.load(f).get("days", {})
                if new_days:
                    _confirm_spark_check(today, new_days)
            except:
                pass
    except Exception as e:
        log(f"⚠️ 更新火花天数失败: {e}")


def _run_spark_session(force=False):
    """单次浏览器会话：先读天数 → 发消息 → 再读天数确认"""
    now = datetime.now(CHINA_TZ)
    msg_template = "[Auto]火花火花！{time}"
    if os.path.exists(_CONFIG_FILE):
        try:
            with open(_CONFIG_FILE, "r", encoding="utf-8") as _f:
                _cfg = json.load(_f)
                _tmpl = _cfg.get("message_template", "")
                if _tmpl:
                    msg_template = _tmpl
        except Exception:
            pass
    msg = msg_template.replace("{time}", now.strftime("%Y-%m-%d %H:%M:%S"))

    with open(COOKIE_FILE, "r", encoding="utf-8") as f:
        raw = json.load(f)
    cookies = normalize_cookies(raw, ".douyin.com")
    log(f"加载了 {len(cookies)} 个 cookie")

    all_ok = False
    _p = None
    try:
        _p = sync_playwright()
        p = _p.__enter__()
        log("🚀 启动 Chromium 浏览器")
        t0 = time.time()
        launch_kwargs = {"headless": HEADLESS}
        if CHROMIUM_EXECUTABLE:
            launch_kwargs["executable_path"] = CHROMIUM_EXECUTABLE
        browser = p.chromium.launch(**launch_kwargs)
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
        )
        context.add_cookies(cookies)
        page = context.new_page()
        log(f"✅ 浏览器就绪 ({time.time()-t0:.1f}s)")

        # 先访问主页建立 Cookie/Session，再跳转聊天页
        log("🌐 正在打开 douyin.com...")
        page.goto("https://www.douyin.com/", wait_until="domcontentloaded", timeout=60000)
        time.sleep(3)
        _dismiss_trust_dialog(page)

        # === 主页登录过期检测（提前拦截，避免浪费时间）===
        try:
            body_text = page.locator('body').first.inner_text()[:500]
            if '登录后' in body_text or '扫码登录' in body_text or '登录过期' in body_text:
                log("🔒 Cookie 已过期！检测到页面登录提示，请重新登录")
                _invalidate_login_cache()
                raise LoginExpiredException("Cookie 已过期")
        except LoginExpiredException:
            raise
        except Exception:
            pass

        log(f"✅ 主页加载完成 ({time.time()-t0:.1f}s)")

        log("🌐 跳转到 douyin.com/chat...")
        page.goto("https://www.douyin.com/chat", wait_until="domcontentloaded", timeout=120000)
        log(f"✅ 聊天页面加载完成 ({time.time()-t0:.1f}s)")
        time.sleep(5)

        # === 登录过期检测 ===
        try:
            body_text = page.locator('body').first.inner_text()[:500]
            if '登录后' in body_text or '扫码登录' in body_text or '登录过期' in body_text:
                log("🔒 Cookie 已过期！检测到页面登录提示，请重新登录")
                _invalidate_login_cache()
                raise LoginExpiredException("Cookie 已过期")
        except LoginExpiredException:
            raise
        except Exception:
            pass

        # 等待页面稳定（多选择器兜底，5 秒超时）
        try:
            sel = page.locator('input[placeholder*="搜索"],input[class*="search"],input[aria-label*="搜索"]').first
            sel.wait_for(state="visible", timeout=5000)
            log(f"✅ 搜索框就绪 ({time.time()-t0:.1f}s)")
        except:
            log(f"⚠️ 搜索框等待超时，继续... ({time.time()-t0:.1f}s)")
            # 搜索框没出来 → 很可能登录过期，再查一次页面文本
            try:
                body_text = page.locator('body').first.inner_text()[:1000]
                if '登录' in body_text and ('后' in body_text or '扫码' in body_text):
                    log("🔒 Cookie 已过期！搜索框未出现且页面有登录提示")
                    _invalidate_login_cache()
                    raise LoginExpiredException("Cookie 已过期（搜索框未加载）")
            except LoginExpiredException:
                raise
            except Exception:
                pass
        time.sleep(3)
        _dismiss_trust_dialog(page)

        # === Step 1: 抓初始天数 + 确认 ===
        log("📸 抓取初始火花天数...")
        _scrape_avatars(page)
        _open_session_list(page)
        time.sleep(1)
        _scrape_spark_days(page, expand_list=False)
        # 读取刚写入的天数文件，做 _confirm_spark_check
        if os.path.exists(DAYS_CACHE):
            try:
                with open(DAYS_CACHE, "r", encoding="utf-8") as f:
                    new_days = json.load(f).get("days", {})
                if new_days:
                    today = now.strftime("%Y-%m-%d")
                    _confirm_spark_check(today, new_days)
            except Exception as e:
                log(f"⚠️ 初始天数确认异常: {e}")

        # === Step 2: 逐个发送 ===
        all_ok = True
        for idx, user in enumerate(TARGET_USERS):
            log(f"👤 [{idx+1}/{len(TARGET_USERS)}] 正在发送给「{user}」...")
            time.sleep(1)
            ok = send_to_user(page, user, msg)
            if ok:
                log(f"✅ [{idx+1}/{len(TARGET_USERS)}] 「{user}」发送成功")
                ss_dir = os.path.join(SHARED_DATA_DIR, "screenshots")
                os.makedirs(ss_dir, exist_ok=True)
                today_str = now.strftime("%Y-%m-%d")
                page.screenshot(path=os.path.join(ss_dir, f"{today_str}_{user}.png"))
                log(f"📸 火花截图已保存: {today_str}_{user}.png")
            if not ok:
                log(f"❌ [{idx+1}/{len(TARGET_USERS)}] 「{user}」发送失败")
                all_ok = False

        # === Step 3: 再抓天数（更新后的）===
        try:
            _scrape_spark_days(page)
        except Exception as e:
            log(f"⚠️ 抓取火花天数失败: {e}")

        # 关闭浏览器
        try:
            browser.close()
        except Exception as e:
            log(f"⚠️ 关闭浏览器异常: {e}")

        return all_ok
    finally:
        if _p is not None:
            try:
                _p.__exit__(None, None, None)
            except:
                pass
    return all_ok


def main(force=False):
    # === 快速检查：没有 Cookie 文件就跳过（不开浏览器） ===
    if not os.path.exists(COOKIE_FILE):
        log("⚠️ 未检测到 Cookie 文件，请先登录后再试")
        return

    # === 并发互斥锁 ===
    if not _acquire_lock():
        log("⚠️ 已有另一个火花会话正在运行（锁文件被占用），跳过本次执行")
        return

    try:
        t_start = time.time()
        now = datetime.now(CHINA_TZ)
        log(f"脚本启动，当前时间: {now.strftime('%Y-%m-%d %H:%M:%S')}")
        if force:
            log("⚡ 强制发送模式（跳过时间窗口）")

        today = now.strftime("%Y-%m-%d")

        # === Cookie 过期检查（每次执行都跑）===
        _check_cookie_expiry()

        # === 已发送则跳过 ===
        if not force and already_sent_today():
            log("⏭️ 今天已经发送过，跳过")
            return

        # === 检查时间窗口 ===
        window = in_time_window()
        at_window = window is not None or force

        if not at_window:
            log("⏭️ 不在允许的时间窗口内，跳过")
            return

        # === 单次浏览器会话：抓天数 → 发送 → 再抓天数 ===
        log(f"🕐 在 {'force' if force else window} 状态，开始火花会话")
        success = False
        try:
            success = _run_spark_session(force=force)
        except LoginExpiredException:
            log("🔒 Cookie 已过期，请重新登录后再试")
        except Exception as e:
            log(f"❌ 火花会话异常: {e}")

        elapsed = time.time() - t_start
        if success:
            mark_sent()
            log(f"🎉 全部发送成功，耗时 {elapsed:.0f}s，状态已记录")
        else:
            log(f"❌ 部分发送失败，耗时 {elapsed:.0f}s，状态未记录")
    finally:
        _release_lock()


if __name__ == "__main__":
    force = "--force" in sys.argv
    if "--refresh-days" in sys.argv:
        _update_spark_days(force=force)
    else:
        main(force=force)
