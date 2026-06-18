"""调试 v4：找用户名和头像"""
import sys, os, json, time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, SCRIPT_DIR)
sys.path.insert(0, PROJECT_ROOT)

COOKIE_FILE = os.path.join(PROJECT_ROOT, "cookie_export.json")
from douyin_spark import normalize_cookies, _dismiss_trust_dialog
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

    # 直接扫全部文本，找目标用户名
    dump = page.evaluate("""() => {
        const results = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walker.nextNode()) {
            const t = (node.textContent || '').trim();
            if (!t) continue;
            const r = node.parentElement?.getBoundingClientRect();
            if (!r || r.width === 0) continue;
            results.push({
                text: t.substring(0, 80),
                x: Math.round(r.x), y: Math.round(r.y)
            });
        }
        return results;
    }""")

    targets = ["淋雨也走", "酸菜鱼米"]
    for target in targets:
        found = [d for d in dump if target in d['text']]
        print(f"\n=== 「{target}」位置: {len(found)} 个 ===")
        for f in found:
            print(f"  x={f['x']} y={f['y']} → {f['text']}")

    # 对于每个目标，看看附近的 img
    print("\n=== 头像图片扫描 ===")
    imgs = page.evaluate("""() => {
        const results = [];
        const imgs = document.querySelectorAll('img');
        imgs.forEach(img => {
            const src = img.src || '';
            if (!src || src.includes('flame') || src.includes('emoji')) return;
            const r = img.getBoundingClientRect();
            if (r.width < 30 || r.height < 30) return;
            // 往上找 3 层父级，收集文本
            let el = img.parentElement;
            let texts = [];
            for (let i = 0; i < 3 && el; i++) {
                const t = (el.textContent || '').trim();
                if (t) texts.push(t.substring(0, 60));
                el = el.parentElement;
            }
            results.push({
                x: Math.round(r.x), y: Math.round(r.y),
                w: Math.round(r.width), h: Math.round(r.height),
                src: src.substring(0, 80),
                texts: texts
            });
        });
        return results;
    }""")
    for img in imgs:
        has_target = False
        for t in img['texts']:
            for target in targets:
                if target in t:
                    has_target = True
                    break
        if has_target:
            print(f"  ✅ x={img['x']} y={img['y']} w={img['w']}h={img['h']}")
            print(f"     src: {img['src']}")
            for t in img['texts']:
                print(f"     text: {t}")

    input("\nEnter 关闭...")
    browser.close()
