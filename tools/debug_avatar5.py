"""调试 v5：用 _scrape_spark_days 的文本收集方式"""
import sys, os, json, time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, SCRIPT_DIR)
sys.path.insert(0, PROJECT_ROOT)

COOKIE_FILE = os.path.join(PROJECT_ROOT, "cookie_export.json")
from douyin_spark import normalize_cookies, _dismiss_trust_dialog, _open_session_list
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    with open(COOKIE_FILE, "r", encoding="utf-8") as f:
        raw = json.load(f)
    cookies = normalize_cookies(raw, ".douyin.com")
    context.add_cookies(cookies)
    page = context.new_page()

    page.goto("https://www.douyin.com/", wait_until="domcontentloaded", timeout=60000)
    time.sleep(5)
    _dismiss_trust_dialog(page)
    page.wait_for_selector("text=私信", timeout=25000)
    page.locator('text=私信').first.click()
    time.sleep(3)

    # 展开会话列表
    _open_session_list(page)
    time.sleep(1)

    # 1) 用 _scrape_spark_days 的方式收集文本
    texts = page.evaluate("""() => {
        const items = [];
        const sel = 'div, span, a, li';
        const els = document.querySelectorAll(sel);
        els.forEach(el => {
            const t = el.textContent.trim();
            if (t.length > 0 && t.length < 300) items.push(t);
        });
        return items;
    }""")

    targets = ["淋雨也走", "酸菜鱼米"]
    print("=== 包含目标用户名的文本 ===")
    for t in texts:
        for name in targets:
            if name in t:
                print(f"  [{name}] {t}")
    
    # 2) 扫描所有 img
    print("\n=== 所有可见 img 信息 ===")
    imgs = page.evaluate("""() => {
        const results = [];
        const imgs = document.querySelectorAll('img');
        imgs.forEach((img, i) => {
            const src = img.src || '';
            if (!src) return;
            const r = img.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return;
            // 往上3层找文本
            let texts = [];
            let el = img.parentElement;
            for (let j = 0; j < 3 && el; j++) {
                const t = (el.textContent || '').trim();
                if (t) texts.push(t.substring(0, 60));
                el = el.parentElement;
            }
            results.push({
                i, w: Math.round(r.width), h: Math.round(r.height),
                x: Math.round(r.x), y: Math.round(r.y),
                src: src.substring(0, 80),
                texts: texts
            });
        });
        return results;
    }""")

    print(f"\n=== 所有可见 img: {len(imgs)} 个 ===")
    for img in imgs:
        has_target = False
        for t in img['texts']:
            for name in targets:
                if name in t:
                    has_target = True
                    break
        if has_target or (img['w'] >= 40 and img['h'] >= 40):
            print(f"  [{img['i']}] {img['w']}x{img['h']} x={img['x']} y={img['y']}")
            print(f"    src: {img['src']}")
            for t in img['texts']:
                print(f"    text: {t}")

    input("\nEnter 关闭...")
    browser.close()
