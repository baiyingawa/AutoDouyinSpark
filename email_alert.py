"""
email_alert.py - Cookie 过期检测 & 邮件提醒

功能：
1. 解析 cookie_export.json，检测过期比例
2. 60%+ 过期 → "high_ratio" 提醒
3. 80%+ 或文件不存在 → "unusable" 提醒
4. 两种提醒互相不阻塞，各自独立每日去重
5. 凭证文件 email_config.json 已加入 .gitignore，不会提交到仓库。
"""
import json
import os
import time
from datetime import datetime, timezone, timedelta
from email.mime.text import MIMEText
import smtplib

CHINA_TZ = timezone(timedelta(hours=8))

# ========== 过期检测 ==========

def check_cookie_expiry(cookie_file: str) -> dict:
    """
    检查 Cookie 过期状态。
    返回:
        {
            "exists": bool,
            "expired_count": int,               # 已过期的 cookie 数量
            "total_cookies": int,               # 含过期时间的 cookie 总数
            "ratio": float,                      # 过期比例 0~1
            "error": str | None,                 # 错误信息
        }
    """
    if not os.path.exists(cookie_file):
        return {"exists": False, "error": f"Cookie 文件不存在: {cookie_file}"}

    with open(cookie_file, "r", encoding="utf-8") as f:
        raw = json.load(f)

    now = datetime.now(CHINA_TZ)
    expired_count = 0
    total_with_expiry = 0

    # 非关键 cookie（统计/埋点/临时状态），过期不影响登录
    _NON_ESSENTIAL = {
        "sdk_source_info", "gulu_source_res", "__ac_nonce", "bit_env",
        "passport_auth_mix_state",
    }

    if isinstance(raw, list):
        for c in raw:
            name = c.get("name", "")
            if name in _NON_ESSENTIAL:
                continue
            exp_ts = c.get("expirationDate") or c.get("expires")
            if not exp_ts:
                continue
            total_with_expiry += 1
            exp_dt = datetime.fromtimestamp(exp_ts, tz=CHINA_TZ)
            if exp_dt <= now:
                expired_count += 1

    ratio = expired_count / total_with_expiry if total_with_expiry > 0 else 0

    return {
        "exists": True,
        "expired_count": expired_count,
        "total_cookies": total_with_expiry,
        "ratio": round(ratio, 2),
        "error": None,
    }


def should_alert(expiry_status: dict) -> str | None:
    """
    判断是否需要发送提醒。
    返回:
        "high_ratio" - 过期比例 >= 60%
        "unusable"   - 过期比例 >= 80% 或文件不存在
        None         - 不需要提醒
    """
    if not expiry_status.get("exists") or expiry_status.get("error"):
        return "unusable"

    ratio = expiry_status.get("ratio", 0)
    if ratio >= 0.8:
        return "unusable"
    if ratio >= 0.6:
        return "high_ratio"

    return None


# ========== 邮件发送 ==========

def load_email_config(config_file: str) -> dict | None:
    """加载邮件配置，返回 None 表示配置无效"""
    if not os.path.exists(config_file):
        return None
    try:
        with open(config_file, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        if not cfg.get("auth_code"):
            return None
        return cfg
    except (json.JSONDecodeError, KeyError):
        return None


def send_alert(config: dict, subject: str, body: str) -> bool:
    """
    通过 SMTP 发送邮件。
    返回 True 表示发送成功。
    """
    try:
        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = subject
        msg["From"] = config["email"]
        msg["To"] = ", ".join(config["alert_recipients"])

        if config.get("smtp_use_ssl", True):
            server = smtplib.SMTP_SSL(config["smtp_host"], config["smtp_port"], timeout=15)
        else:
            server = smtplib.SMTP(config["smtp_host"], config["smtp_port"], timeout=15)
            server.starttls()

        server.login(config["email"], config["auth_code"])
        server.sendmail(config["email"], config["alert_recipients"], msg.as_string())
        server.quit()
        return True
    except Exception as e:
        print(f"[email_alert] 发送邮件失败: {e}")
        return False


# ========== 提醒状态跟踪 ==========

ALERT_STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".spark_alert_state")


def _read_alert_state(state_file: str) -> dict:
    """读取提醒状态，返回 {alert_type: date, ...}"""
    if not os.path.exists(state_file):
        return {}
    try:
        with open(state_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return {}


def _write_alert_state(state_file: str, state: dict):
    """写入提醒状态"""
    with open(state_file, "w", encoding="utf-8") as f:
        json.dump(state, f)


def check_and_alert(
    email_config_file: str,
    cookie_file: str,
    state_file: str = "",
) -> str:
    """
    主入口：检测 Cookie 过期，需要提醒则发邮件。
    两种提醒类型互相独立，不会彼此阻塞。
    返回状态字符串："ok" / "sent" / "no_config" / "error"

    调用方式（在 douyin_spark.py 的 main() 末尾）:
        from email_alert import check_and_alert
        ...
        check_and_alert(
            os.path.join(SCRIPT_DIR, "email_config.json"),
            COOKIE_FILE,
        )
    """
    if not state_file:
        state_file = ALERT_STATE_FILE

    # 1. 检查 Cookie
    expiry = check_cookie_expiry(cookie_file)

    # 2. 判断是否需要提醒
    alert_type = should_alert(expiry)
    if not alert_type:
        return "ok"

    # 3. 检查今天此类型是否已提醒过（各类型独立去重）
    state = _read_alert_state(state_file)
    today = datetime.now(CHINA_TZ).strftime("%Y-%m-%d")
    if state.get(alert_type) == today:
        return "ok"

    # 4. 加载邮箱配置
    config = load_email_config(email_config_file)
    if config is None:
        print("[email_alert] 邮件配置不存在或授权码为空，跳过提醒")
        return "no_config"

    # 5. 构建邮件内容
    if alert_type == "high_ratio":
        subject = f"抖音 Cookie 过期提醒（{int(expiry['ratio'] * 100)}%）"
        body = (
            f"抖音 Cookie 已有 {expiry['expired_count']}/{expiry['total_cookies']} 条过期，"
            f"占比 {int(expiry['ratio'] * 100)}%。\n\n"
            f"建议重新导出 Cookie 覆盖 cookie_export.json。\n"
            f"操作步骤:\n"
            f"1. 打开 Chrome → 登录 douyin.com\n"
            f"2. 点击 Cookie-Editor 扩展 → Export → JSON\n"
            f"3. 覆盖 E:\\PROJECT\\AutoDouyinSpark\\cookie_export.json"
        )
    elif alert_type == "unusable":
        subject = "抖音 Cookie 不可用，请立即处理"
        if expiry.get("error"):
            body = f"Cookie 文件异常: {expiry['error']}"
        else:
            body = (
                f"抖音 Cookie 已有 {expiry['expired_count']}/{expiry['total_cookies']} 条过期，"
                f"占比 {int(expiry['ratio'] * 100)}%，已影响发送功能。\n\n"
                f"请立即重新导出 Cookie 覆盖 cookie_export.json。\n"
                f"操作步骤:\n"
                f"1. 打开 Chrome → 登录 douyin.com\n"
                f"2. 点击 Cookie-Editor 扩展 → Export → JSON\n"
                f"3. 覆盖 E:\\PROJECT\\AutoDouyinSpark\\cookie_export.json"
            )
    else:
        return "ok"

    # 6. 发送
    sent = send_alert(config, subject, body)
    if sent:
        state[alert_type] = today
        _write_alert_state(state_file, state)
        print(f"[email_alert] Cookie 过期提醒已发送（类型: {alert_type}）")
        return "sent"
    else:
        print(f"[email_alert] 邮件发送失败")
        return "error"


# ========== 单独运行测试 ==========

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    config_file = os.path.join(script_dir, "email_config.json")
    cookie_file = os.path.join(script_dir, "cookie_export.json")

    print("=" * 50)
    print("Cookie 过期检测 & 邮件提醒测试")
    print("=" * 50)

    expiry = check_cookie_expiry(cookie_file)
    if "error" in expiry:
        print(f"错误: {expiry['error']}")
    else:
        print(f"含过期时间的 Cookie: {expiry['total_cookies']} 条")
        print(f"已过期: {expiry['expired_count']} 条")
        print(f"过期比例: {expiry['ratio'] * 100:.0f}%")

    result = check_and_alert(config_file, cookie_file)
    print(f"提醒结果: {result}")
