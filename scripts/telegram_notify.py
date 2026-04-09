#!/usr/bin/env python3
"""
Telegram 自动推送脚本 (含 Cookie 有效性检测)
功能：
1. 检查 Cookie 是否有效，失效则立即报警
2. 读取最新签到日志，发送战报
"""

import json
import os
import requests
from datetime import datetime
import pytz
import re

# ==============================
# 配置区域
# ==============================
BOT_TOKEN = "8769122176:AAFbM61LWkvMPpTf_kYX2w2hJRtabX1Px3E"
CHAT_ID = "8376801788"  # 斌哥的 Chat ID
LOG_FILE = os.path.join(os.path.dirname(__file__), 'nodeseek_cron.log')
COOKIE_FILE = os.path.join(os.path.dirname(__file__), 'nodeseek_cookies.env')
SHANGHAI_TZ = pytz.timezone('Asia/Shanghai')

def check_cookie_validity():
    """检查 Cookie 是否有效"""
    if not os.path.exists(COOKIE_FILE):
        return False, "Cookie 文件不存在"
    
    with open(COOKIE_FILE, 'r') as f:
        content = f.read()
    
    # 提取 NS_COOKIE
    match = re.search(r'NS_COOKIE=(.+)', content)
    if not match:
        return False, "未找到 NS_COOKIE"
    
    cookie_str = match.group(1).strip()
    
    # 尝试调用签到 API (验证 Cookie)
    url = 'https://www.nodeseek.com/api/attendance?random=true'
    headers = {
        'Cookie': cookie_str,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.nodeseek.com/board'
    }
    
    try:
        resp = requests.post(url, headers=headers, timeout=10)
        data = resp.json()
        
        if data.get('success'):
            return True, "Cookie 有效"
        else:
            msg = data.get('message', '未知错误')
            # "已签到" 说明 Cookie 有效，只是今天签过了
            if '已签到' in msg or '重复' in msg:
                return True, "Cookie 有效 (今日已签到)"
            if '未登录' in msg or 'Cookie' in msg or '无效' in msg:
                return False, f"Cookie 失效：{msg}"
            # 如果是 high risk 或风控，也视为有效（只是限制操作）
            if 'high risk' in msg.lower() or '风控' in msg:
                return True, "Cookie 有效 (今日已签到/风控限制)"
            return False, f"Cookie 异常：{msg}"
    except Exception as e:
        return False, f"网络异常：{e}"

def send_telegram_message(text):
    """发送消息到 Telegram (纯文本模式)"""
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": CHAT_ID,
        "text": text
    }
    try:
        resp = requests.post(url, json=payload, timeout=10)
        if resp.status_code == 200:
            print("✅ Telegram 消息发送成功！")
            return True
        else:
            print(f"❌ 发送失败: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print(f"❌ 异常: {e}")
        return False

def get_latest_report():
    """读取最新的签到日志，生成极简战报（如果日志无数据，实时查询）"""
    import requests
    
    # 1. 尝试从日志读取（简化逻辑：直接读取最后 20 行）
    if os.path.exists(LOG_FILE):
        with open(LOG_FILE, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        # 从后往前找"🍗 鸡腿已到手"
        for i in range(len(lines) - 1, -1, -1):
            if "🍗 鸡腿已到手" in lines[i]:
                # 向前找 10 行内的战报块
                start = max(0, i - 10)
                block = "".join(lines[start:i+1])
                
                # 提取数据
                date_match = re.search(r'📅 日期：\s*(.+)', block)
                reward_match = re.search(r'🍗 今日奖励：\s*(\d+)\s*个鸡腿', block)
                total_match = re.search(r'📈 当前总数：\s*(.+?)(?:\n|$)', block)
                
                if reward_match:
                    date = date_match.group(1).strip() if date_match else "未知"
                    reward = reward_match.group(1)
                    total = total_match.group(1).strip() if total_match else "未知"
                    
                    now_beijing = datetime.now(SHANGHAI_TZ)
                    message = "📊 NodeSeek 每日签到战报\n"
                    message += f"📅 日期：{date}\n"
                    message += f"✅ 状态：签到成功\n"
                    message += f"🍗 今日奖励：{reward} 个鸡腿\n"
                    if total != "未知":
                        message += f"📈 当前总数：{total}\n"
                    message += f"🚀 下次执行：00:01\n"
                    message += f"🕒 推送时间：{now_beijing.strftime('%H:%M:%S')}"
                    return message
                break

    # 2. 如果日志没数据，实时查询
    print("⚠️ 日志无有效数据，正在实时查询...")
    cookie_file = os.path.join(os.path.dirname(__file__), 'nodeseek_cookies.env')
    if not os.path.exists(cookie_file):
        return None
    
    with open(cookie_file, 'r') as f:
        for line in f:
            if line.startswith('NS_COOKIE='):
                cookie_str = line.split('=', 1)[1].strip()
                break
        else:
            return None
    
    url = 'https://www.nodeseek.com/api/attendance?random=true'
    headers = {
        'Cookie': cookie_str,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.nodeseek.com/board'
    }
    
    try:
        resp = requests.post(url, headers=headers, timeout=10)
        data = resp.json()
        
        if data.get('success'):
            gain = data.get('gain', 0)
            current = data.get('current', 0)
            now_beijing = datetime.now(SHANGHAI_TZ)
            date_str = now_beijing.strftime('%Y/%m/%d')
            
            message = "📊 NodeSeek 每日签到战报\n"
            message += f"📅 日期：{date_str}\n"
            message += f"✅ 状态：签到成功 (实时查询)\n"
            message += f"🍗 今日奖励：{gain} 个鸡腿\n"
            message += f"📈 当前总数：{current}\n"
            message += f"🚀 下次执行：00:01\n"
            message += f"🕒 推送时间：{now_beijing.strftime('%H:%M:%S')}"
            return message
        else:
            msg = data.get('message', '未知错误')
            if '已签到' in msg or '重复' in msg or 'high risk' in msg:
                # 已签到，无法查询，返回“未知”
                now_beijing = datetime.now(SHANGHAI_TZ)
                date_str = now_beijing.strftime('%Y/%m/%d')
                message = "📊 NodeSeek 每日签到战报\n"
                message += f"📅 日期：{date_str}\n"
                message += f"✅ 状态：今日已签到 (无法查询数量)\n"
                message += f"🍗 今日奖励：请手动确认\n"
                message += f"🚀 下次执行：00:01\n"
                message += f"🕒 推送时间：{now_beijing.strftime('%H:%M:%S')}"
                return message
            print(f"❌ 实时查询失败: {msg}")
            return None
    except Exception as e:
        print(f"❌ 实时查询异常: {e}")
        return None

def main():
    print("🚀 开始执行：NodeSeek 自动签到 + Cookie 检测...")
    
    # 1. 先检查 Cookie 有效性
    print("🔍 正在检查 Cookie 有效性...")
    is_valid, msg = check_cookie_validity()
    
    if not is_valid:
        print(f"❌ Cookie 失效：{msg}")
        # 发送报警
        alert_msg = "🚨 NodeSeek 紧急报警\n\n"
        alert_msg += "❌ Cookie 已失效，签到失败！\n"
        alert_msg += f"📝 原因：{msg}\n"
        alert_msg += "🔧 请立即刷新 Cookie 并更新文件：\n"
        alert_msg += "1. 打开 NodeSeek 网页\n"
        alert_msg += "2. F12 -> Network -> 复制 Cookie\n"
        alert_msg += "3. 更新 /root/.openclaw/workspace/scripts/nodeseek_cookies.env\n"
        alert_msg += "4. 重新运行脚本或等待明日自动重试\n"
        alert_msg += f"🕒 报警时间：{datetime.now(SHANGHAI_TZ).strftime('%H:%M:%S')}"
        
        send_telegram_message(alert_msg)
        print("✅ 已发送失效报警！")
        return
    
    print("✅ Cookie 有效，继续推送战报...")
    
    # 2. 读取最新签到日志
    report = get_latest_report()
    if not report:
        print("⚠️ 未找到最新签到日志，跳过推送。")
        return
    
    # 3. 发送战报
    print("📤 正在发送战报...")
    success = send_telegram_message(report)
    if success:
        print("✅ 推送成功！")
    else:
        print("❌ 推送失败！")

if __name__ == "__main__":
    main()
