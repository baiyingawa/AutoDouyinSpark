"""调试 v2：测试新 _scrape_avatars 逻辑"""
import sys, os, json, time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, SCRIPT_DIR)
sys.path.insert(0, PROJECT_ROOT)

COOKIE_FILE = os.path.join(PROJECT_ROOT, "cookie_export.json")

from douyin_spark import normalize_cookies, _dismiss_trust_dialog
from playwright.sync_api import sync_playwright

# 复制新 _scrape_avatars 逻辑来测试
def test_scrape_avatars(page):
    """从当前页面（私信列表）抓取用户头像 URL"""
    avatars = page.evaluate("""() => {
        const results = {};
        const items = document.querySelectorAll('div, li');
        items.forEach(el => {
            const text = (el.textContent || '').trim();
            // 只处理包含数字和"分钟前"的条目（会话列表典型结构）
            if (!text.match(/\\d+分钟前/) && !text.match(/\\d+小时前/)) return;
            
            const imgs = el.querySelectorAll('img');
            let avatarSrc = '';
            imgs.forEach(img => {
                const src = img.src || '';
                const w = img.naturalWidth || img.width || 0;
                const h = img.naturalHeight || img.height || 0;
                if (src && !src.includes('flame') && !src.includes('emoji') && w >= 30 && h >= 30) {
                    avatarSrc = src;
                }
            });
            if (!avatarSrc) return;

            const firstSpace = text.indexOf(' ');
            const name = firstSpace > 0 ? text.substring(0, firstSpace) : text;
            if (name && name.length < 20 && !results[name]) {
                results[name] = avatarSrc;
            }
        });
        return results;
    }""")
    return avatars

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    context = browser.new_context(
        viewport={"width": 1440, "height": 900},
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
    )
    with open(COOKIE_FILE, "r", encoding="utf-8") as f:
        raw = json.load(f)
    cookies = normalize_cookies(raw, ".douyin.com")
    context.add_cookies(cookies)
    page = context.new_page()

    print("🌐 打开 douyin.com...")
    page.goto("https://www.douyin.com/", wait_until="domcontentloaded", timeout=60000)
    time.sleep(5)
    _dismiss_trust_dialog(page)

    print("📩 点击私信...")
    page.wait_for_selector("text=私信", timeout=25000)
    page.locator('text=私信').first.click()
    time.sleep(3)
    print("✅ 已进入私信列表")

    # 测试新逻辑
    avatars = test_scrape_avatars(page)
    print(f"\n=== _scrape_avatars 结果: {len(avatars)} 个头像 ===")
    for name, src in avatars.items():
        print(f"  {name}: {src[:80]}...")

    # dump 所有 DIV/LI 看看哪些包含"分钟前"
    all_texts = page.evaluate("""() => {
        const items = document.querySelectorAll('div, li');
        const texts = [];
        items.forEach(el => {
            const t = (el.textContent || '').trim();
            if ((t.includes('分钟前') || t.includes('小时前')) && t.length < 100) {
                const w = el.getBoundingClientRect().width;
                const h = el.getBoundingClientRect().height;
                texts.push({text: t.substring(0, 60), w: Math.round(w), h: Math.round(h)});
            }
        });
        return texts;
    }""")
    print(f"\n=== 所有包含'分钟前'的条目 ({len(all_texts)} 个) ===")
    for t in all_texts:
        print(f"  [{t['w']}x{t['h']}] {t['text']}")

    # 检查 TARGET_USERS 是否在列表中
    TARGET = ["淋雨也走", "酸菜鱼米"]
    print(f"\n=== 检查目标用户 ===")
    for target in TARGET:
        found = [t for t in all_texts if target in t['text']]
        print(f"  {target}: {'✅ 找到' if found else '❌ 未找到'}")
        if found:
            for f in found:
                print(f"    文本: {f['text']}")

    input("\n按 Enter 关闭...")
    browser.close()
