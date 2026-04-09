"""
NodeSeek论坛 - 自动签到Cookie版 (优化版)
斌哥专用 - 2026-03-31
"""

import base64
import hashlib
import hmac
import os
import random
import time
import urllib.parse
import cloudscraper
from datetime import datetime
import pytz

# ==============================================
# 初始化 cloudscraper
# ==============================================
scraper = cloudscraper.create_scraper(
    interpreter="js2py",
    delay=6,
    browser="chrome",
)

# ==============================================
# 配置区域 (从环境变量或文件获取)
# ==============================================
# 优先从环境变量获取，如果为空则读取本地文件（使用绝对路径）
NS_COOKIE = os.environ.get("NS_COOKIE", "")
if not NS_COOKIE:
    try:
        # 使用绝对路径，确保 Cron 环境下也能找到文件
        script_dir = os.path.dirname(os.path.abspath(__file__))
        cookie_file = os.path.join(script_dir, "nodeseek_cookies.env")
        with open(cookie_file, "r") as f:
            for line in f:
                if line.startswith("NS_COOKIE="):
                    NS_COOKIE = line.strip().split("=", 1)[1]
                    print(f"📝 [调试] 从文件读取 Cookie: {cookie_file}")
                    break
        if not NS_COOKIE:
            print("⚠️ [调试] Cookie 文件存在，但未找到 NS_COOKIE 行")
    except FileNotFoundError:
        print(f"❌ [调试] Cookie 文件未找到: {cookie_file}")
    except Exception as e:
        print(f"❌ [调试] 读取 Cookie 文件出错: {e}")

NS_RANDOM = os.environ.get("NS_RANDOM", "true")
NS_MEMBER_ID = os.environ.get("NS_MEMBER_ID", "26589")

# ==============================================
# 工具函数
# ==============================================
def wait_random_interval(min_seconds, max_seconds):
    delay = random.uniform(min_seconds, max_seconds)
    print(f"等待 {delay:.2f} 秒后继续...")
    time.sleep(delay)
    print("执行下一步操作！")

# ==============================================
# 核心功能
# ==============================================
def ns_info(ns_member_id):
    if not ns_member_id:
        return "未设置NodeSeek成员ID"
    
    url = f"https://www.nodeseek.com/api/account/getInfo/{ns_member_id}?readme=1"
    headers = {
        "Accept": "*/*",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Origin": "https://www.nodeseek.com",
        "Referer": f"https://www.nodeseek.com/space/{ns_member_id}",
        "Sec-CH-UA": '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
        "Sec-CH-UA-Mobile": "?0",
        "Sec-CH-UA-Platform": '"Windows"',
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    }
    
    try:
        response = scraper.get(url, headers=headers)
        data = response.json()
        ns_user_data = data["detail"]
        return (
            f"用户信息：\n"
            f"【用户】：{ns_user_data['member_name']}\n"
            f"【等级】：{ns_user_data['rank']}\n"
            f"【鸡腿数目】：{ns_user_data['coin']}\n"
            f"【主题帖数】：{ns_user_data['nPost']}\n"
            f"【评论数】：{ns_user_data['nComment']}"
        )
    except Exception as e:
        return f"用户信息报错：{str(e)}"

def ns_get_coin(ns_member_id):
    """获取用户当前鸡腿数"""
    if not ns_member_id:
        return None
    
    url = f"https://www.nodeseek.com/api/account/getInfo/{ns_member_id}?readme=1"
    headers = {
        "Accept": "*/*",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Origin": "https://www.nodeseek.com",
        "Referer": f"https://www.nodeseek.com/space/{ns_member_id}",
        "Sec-CH-UA": '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
        "Sec-CH-UA-Mobile": "?0",
        "Sec-CH-UA-Platform": '"Windows"',
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        "Cookie": NS_COOKIE,  # 必须传入当前 Cookie
    }
    
    try:
        response = scraper.get(url, headers=headers)
        # 调试：打印状态码和部分内容
        if response.status_code != 200:
            print(f"⚠️ [调试] 用户信息接口状态码：{response.status_code}, 内容：{response.text[:100]}")
            return None
        data = response.json()
        return data["detail"]["coin"]
    except Exception as e:
        print(f"⚠️ [调试] 获取鸡腿数失败: {e}, 响应内容：{response.text[:200] if 'response' in locals() else 'N/A'}")
        return None

def ns_signin(ns_cookie, ns_random="true"):
    if not ns_cookie:
        return "签到失败：未设置NodeSeek Cookie", 0
    
    # 1. 签到前获取鸡腿数
    coin_before = ns_get_coin(NS_MEMBER_ID)
    if coin_before is None:
        return "签到前获取鸡腿数失败", 0
    
    print(f"📊 [调试] 签到前鸡腿数：{coin_before}")
    
    url = f"https://www.nodeseek.com/api/attendance?random={ns_random}"
    headers = {
        "Accept": "*/*",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Content-Length": "0",
        "Origin": "https://www.nodeseek.com",
        "Referer": "https://www.nodeseek.com/board",
        "Sec-CH-UA": '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
        "Sec-CH-UA-Mobile": "?0",
        "Sec-CH-UA-Platform": '"Windows"',
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        "Cookie": ns_cookie,
    }
    
    try:
        response = scraper.post(url, headers=headers)
        data = response.json()
        msg = data.get("message", "")
        
        # 2. 签到后获取鸡腿数
        coin_after = ns_get_coin(NS_MEMBER_ID)
        if coin_after is None:
            return f"签到信息：{msg} (但无法获取签到后鸡腿数)", 0
        
        reward = coin_after - coin_before
        print(f"📊 [调试] 签到后鸡腿数：{coin_after}, 奖励：{reward}")
        
        return f"签到信息：{msg} (实际奖励：{reward}个鸡腿)", reward
    except Exception as e:
        return f"签到报错：{str(e)}", 0

# ==============================================
# 主程序
# ==============================================
if __name__ == "__main__":
    # 强制使用北京时间
    shanghai_tz = pytz.timezone('Asia/Shanghai')
    now_beijing = datetime.now(shanghai_tz)
    beijing_date = now_beijing.strftime('%Y/%m/%d')
    beijing_time = now_beijing.strftime('%Y-%m-%d %H:%M:%S')
    
    print("=========================== 斌哥的 NodeSeek 签到开始 ===========================")
    wait_random_interval(5, 15)
    
    print("正在签到...")
    ns_signin_msg, reward = ns_signin(NS_COOKIE, NS_RANDOM)
    print(ns_signin_msg)
    
    wait_random_interval(5, 15)
    
    print("正在获取用户信息...")
    ns_info_data = ns_info(NS_MEMBER_ID)
    print(ns_info_data)
    
    # 生成战报
    print("\n=========================== 📊 NodeSeek 每日签到战报 ===========================")
    print(f"📅 日期：{beijing_date}")
    print(f"🕒 北京时间：{beijing_time}")
    
    if "签到失败" in ns_signin_msg or "报错" in ns_signin_msg:
        print("❌ [签到失败] " + ns_signin_msg)
    else:
        print("✅ [签到成功] NodeSeek")
        if reward > 0:
            print(f"🎁 今日领取：{reward} 个鸡腿🍗 (实际计算)")
        else:
            print("🎁 今日领取：签到成功 (具体数量需手动确认，接口未返回数值)")
    
    print(f"📝 状态：{ns_info_data}")
    print("=========================== 🍗 鸡腿已到手，明日继续！ ===========================")
    
    # 输出 JSON 格式给 Cron 捕获（可选）
    # print(json.dumps({"status": "success", "date": beijing_date, "message": ns_signin_data}))
