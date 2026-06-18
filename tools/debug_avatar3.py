"""调试 v3：dump 页面私信区域所有可见文本"""
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

    # dump 所有可见的文字节点信息
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
                tag: node.parentElement?.tagName || '',
                cls: (node.parentElement?.className || '').substring(0, 40),
                x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)
            });
        }
        return results;
    }""")

    # 找聊天列表区域（左侧 400px 以内）
    chat_items = [d for d in dump if d['x'] < 400 and d['h'] > 20]
    print(f"=== 左侧聊天区域 {len(chat_items)} 个文本节点 ===")
    for d in chat_items:
        print(f"  [{d['tag']}.{d['cls']}] y={d['y']} h={d['h']} → {d['text']}")

    # 也直接找所有包含两个目标用户的元素
    for target in ["淋雨也走", "酸菜鱼米"]:
        found = [d for d in dump if target in d['text']]
        print(f"\n=== 包含「{target}」的节点: {len(found)} ===")
        for f in found[:5]:
            print(f"  [{f['tag']}.{f['cls']}] y={f['y']} → {f['text']}")

    input("\n按 Enter 关闭...")
    browser.close()
