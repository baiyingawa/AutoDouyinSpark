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

# 可选：Cookie 过期邮件提醒（无配置时静默跳过）
_EMAIL_ALERT_AVAILABLE = False
try:
    from email_alert import check_and_alert
    _EMAIL_ALERT_AVAILABLE = True
except ImportError:
    pass

# ==== 配置 ====
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_CONFIG_FILE = os.path.join(SCRIPT_DIR, "spark_config.json")
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
COOKIE_FILE = os.path.join(SCRIPT_DIR, "cookie_export.json")
STATE_FILE = os.path.join(SCRIPT_DIR, ".spark_state")
STREAK_FILE = os.path.join(SCRIPT_DIR, ".spark_streak")
LOG_FILE = os.path.join(SCRIPT_DIR, ".spark_log")
DAYS_CACHE = os.path.join(SCRIPT_DIR, ".spark_days_cache")
CONFIRM_FILE = os.path.join(SCRIPT_DIR, ".spark_confirm")
LOGIN_CHECK_FILE = os.path.join(SCRIPT_DIR, ".spark_login_check")
CHINA_TZ = timezone(timedelta(hours=8))

# 浏览器模式（可通过 engine.py 覆写为 False 解决反爬）
HEADLESS = True

# Cookie 实测检查间隔（秒）— 默认 1 小时
_COOKIE_CHECK_INTERVAL = 3600


def _check_login_status_playwright():
    """用 Playwright 实测 Cookie 是否有效"""
    try:
        with open(COOKIE_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
        cookies = normalize_cookies(raw, ".douyin.com")
    except:
        return False

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=HEADLESS)
            context = browser.new_context(viewport={"width": 1440, "height": 900})
            context.add_cookies(cookies)
            page = context.new_page()
            page.goto("https://www.douyin.com/", wait_until="domcontentloaded", timeout=30000)
            time.sleep(3)
            # 如果 URL 不是 login/passport 并且页面有内容（非空白）则认为有效
            logged_in = "login" not in page.url and "passport" not in page.url
            browser.close()
            return logged_in
    except:
        return False


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
    """写日志文件"""
    now = datetime.now(CHINA_TZ).strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{now}] {msg}"
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
    """给单个用户发送消息 - 使用搜索功能定位用户"""
    log(f"  🔍 正在搜索「{username}」...")

    # 1. 用搜索功能查找用户
    clicked = False

    search_input = None
    # 等待搜索框出现（页面完全渲染需要时间）
    try:
        page.wait_for_selector('input[placeholder="搜索"]', timeout=60000)
        search_input = page.locator('input[placeholder="搜索"]').first
        log(f"  ✅ 找到搜索框")
    except:
        log(f"  ⚠️ 搜索框未出现，尝试备选选择器")
        for sel in ['input[type="text"]', 'input:visible']:
            try:
                loc = page.locator(sel).first
                if loc.count() > 0:
                    search_input = loc
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
            time.sleep(2)  # 等待搜索结果

            # 在搜索结果中点击"发私信"按钮
            try:
                send_btn = page.locator('text=发私信').first
                if send_btn.count() > 0:
                    send_btn.click(timeout=5000)
                    log(f"  🖱️ 点击「发私信」")
                    clicked = True
                    time.sleep(2)
            except:
                pass

            # 如果"发私信"没找到，降级点用户名
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
                # 尝试 evaluate 遍历
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
            log(f"  ⚠️ 搜索失败: {e}")
    else:
        log(f"  ⚠️ 未找到搜索框")

    # 搜索失败则放弃
    if not clicked:
        log(f"  ❌ 无法找到「{username}」的会话（搜索不到即不存在）")
        return False
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
        browser = p.chromium.launch(headless=HEADLESS)
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
        )
        context.add_cookies(cookies)
        page = context.new_page()
        log(f"✅ 浏览器就绪 ({time.time()-t0:.1f}s)")

        # 1. 打开聊天页面
        log("🌐 正在打开 douyin.com/chat...")
        page.goto("https://www.douyin.com/chat", wait_until="domcontentloaded", timeout=120000)
        log(f"✅ 聊天页面加载完成 ({time.time()-t0:.1f}s)")
        time.sleep(5)

        # 2. 等待页面稳定（首页加载慢，首次要十几秒）
        try:
            page.wait_for_selector('[contenteditable="true"], .chat-container, [class*="chat"]', timeout=60000)
            log(f"✅ 聊天界面就绪 ({time.time()-t0:.1f}s)")
        except:
            log(f"⚠️ 聊天界面等待超时，继续... ({time.time()-t0:.1f}s)")
        time.sleep(3)

        # 3. 关闭信任登录弹窗（如果存在）
        _dismiss_trust_dialog(page)

        # 4. 逐个发送
        all_ok = True
        for idx, user in enumerate(TARGET_USERS):
            log(f"👤 [{idx+1}/{len(TARGET_USERS)}] 正在发送给「{user}」...")
            time.sleep(1)
            ok = send_to_user(page, user, msg)
            if ok:
                log(f"✅ [{idx+1}/{len(TARGET_USERS)}] 「{user}」发送成功")
                # 每个用户发送成功后截图（日期_用户名）
                ss_dir = os.path.join(SCRIPT_DIR, "screenshots")
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
        config_file = os.path.join(SCRIPT_DIR, "email_config.json")
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
    """每天首次运行时，把当前缓存标记为"昨日基准"，后续对比据此判断对方是否续了"""
    if os.path.exists(CONFIRM_FILE):
        try:
            with open(CONFIRM_FILE, "r", encoding="utf-8") as f:
                st = json.load(f)
            if st.get("date") == today:
                return st.get("prev_days", {})
        except:
            pass
    # 从缓存取昨天的最终值作为今日基线
    baseline = {}
    if os.path.exists(DAYS_CACHE):
        try:
            with open(DAYS_CACHE, "r", encoding="utf-8") as f:
                baseline = json.load(f).get("days", {})
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


def _update_spark_days():
    """单独打开浏览器抓取火花天数，并判断对方是否续了"""
    today = datetime.now(CHINA_TZ).strftime("%Y-%m-%d")
    if _should_skip_spark_check(today):
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
            browser = p.chromium.launch(headless=HEADLESS)
            context = browser.new_context(
                viewport={"width": 1440, "height": 900},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
            )
            context.add_cookies(cookies)
            page = context.new_page()

            page.goto("https://www.douyin.com/chat", wait_until="domcontentloaded", timeout=120000)
            time.sleep(5)
            try:
                page.wait_for_selector('[contenteditable="true"], .chat-container, [class*="chat"]', timeout=60000)
            except:
                pass
            time.sleep(3)
            _dismiss_trust_dialog(page)
            try:
                _scrape_spark_days(page)
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


def main(force=False):
    t_start = time.time()
    now = datetime.now(CHINA_TZ)
    log(f"脚本启动，当前时间: {now.strftime('%Y-%m-%d %H:%M:%S')}")
    if force:
        log("⚡ 强制发送模式（跳过时间窗口）")

    # === 每日基准初始化（必须在任何更新之前，确保基准是昨天最终数据）===
    today = now.strftime("%Y-%m-%d")
    _init_today_baseline(today)

    # === Cookie 过期检查（每次执行都跑）===
    _check_cookie_expiry()

    # === 在窗口内即使已发送也更新火花天数 ===
    window = in_time_window()
    at_window = window is not None or force

    if at_window:
        log(f"🕐 在 {'force' if force else window} 状态，更新火花天数")
        _update_spark_days()
    else:
        log("⏭️ 不在时间窗口内，跳过火花天数更新")

    if not force and already_sent_today():
        log("⏭️ 今天已经发送过，跳过")
        return

    if not window and not force:
        log("⏭️ 不在允许的时间窗口内，跳过")
        return

    window_text = window if window else "force"
    log(f"📨 开始发送火花消息...")

    # 发送（异常保护，只要成功发送了就标记状态）
    success = False
    try:
        success = send_messages()
    except Exception as e:
        log(f"❌ 发送过程异常: {e}")

    elapsed = time.time() - t_start
    if success:
        mark_sent()
        log(f"🎉 全部发送成功，耗时 {elapsed:.0f}s，状态已记录")
    else:
        log(f"❌ 部分发送失败，耗时 {elapsed:.0f}s，状态未记录")


if __name__ == "__main__":
    force = "--force" in sys.argv
    if "--refresh-days" in sys.argv:
        _update_spark_days()
    else:
        main(force=force)
