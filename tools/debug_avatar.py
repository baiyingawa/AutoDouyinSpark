"""调试：抓取抖音私信页面头像"""
import sys, os, json, time

# 路径设置
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

COOKIE_FILE = os.path.join(PROJECT_ROOT, "cookie_export.json")

from douyin_spark import normalize_cookies, _dismiss_trust_dialog, _open_session_list

from playwright.sync_api import sync_playwright

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
    try:
        page.wait_for_selector("text=私信", timeout=25000)
        page.locator('text=私信').first.click()
        time.sleep(3)
        print("✅ 已进入私信列表")
    except Exception as e:
        print(f"❌ 点击私信失败: {e}")
        browser.close()
        exit(1)

    # 保存截图
    page.screenshot(path=os.path.join(SCRIPT_DIR, "debug_ss.png"))
    print("📸 已保存截图")

    # 把完整 HTML 结构中与头像相关部分保存
    html_dump = page.evaluate("""() => {
        const imgs = document.querySelectorAll('img');
        const results = [];
        imgs.forEach((img, i) => {
            const src = img.src || '';
            const alt = (img.alt || '').trim();
            const cls = img.className || '';
            const rect = img.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && src) {
                // 找父元素文本
                let parent = img.parentElement;
                let parentText = '';
                for (let j = 0; j < 5 && parent; j++) {
                    const t = (parent.textContent || '').trim();
                    if (t) { parentText = t; break; }
                    parent = parent.parentElement;
                }
                results.push({
                    i: i,
                    src: src.substring(0, 100),
                    alt: alt,
                    className: cls.substring(0, 50),
                    rectW: rect.width,
                    rectH: rect.height,
                    parentText: parentText.substring(0, 50),
                });
            }
        });
        return results;
    }""")

    print(f"\n=== 找到 {len(html_dump)} 个可见 img 元素 ===")
    for img in html_dump:
        print(f"  [{img['i']}] w={img['rectW']} h={img['rectH']}")
        print(f"      src: {img['src']}")
        print(f"      alt: {img['alt']}")
        print(f"      cls: {img['className']}")
        print(f"      parent: {img['parentText']}")
        print()

    # 尝试另外的方式：直接找包含用户名的元素附近
    name_elements = page.evaluate("""() => {
        const targets = ['淋雨也走', '酸菜鱼米'];
        const results = [];
        targets.forEach(name => {
            const els = document.querySelectorAll('div, span, a, li');
            els.forEach(el => {
                const t = (el.textContent || '').trim();
                if (t === name || t.startsWith(name)) {
                    const r = el.getBoundingClientRect();
                    if (r.width > 0 && r.height > 0) {
                        // 找附近的 img
                        const nearbyImgs = el.closest('[class]')?.querySelectorAll('img') || [];
                        nearbyImgs.forEach(img => {
                            if (img.src) results.push({name, imgSrc: img.src.substring(0, 100)});
                        });
                        // 也查前面的兄弟元素
                        let prev = el.previousElementSibling;
                        if (prev) {
                            const prevImgs = prev.querySelectorAll('img');
                            prevImgs.forEach(img => {
                                if (img.src) results.push({name, imgSrc: img.src.substring(0, 100), loc: 'prev sibling'});
                            });
                        }
                    }
                }
            });
        });
        return results;
    }""")

    print(f"\n=== 用户附近头像: {len(name_elements)} 个 ===")
    for x in name_elements:
        print(f"  {x['name']}: {x.get('imgSrc','')} ({x.get('loc','')})")

    input("\n按 Enter 关闭浏览器...")
    browser.close()
