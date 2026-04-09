#!/usr/bin/env python3
"""
Telegram 自动签到脚本
功能：每天定时在指定群组发送“签到”消息
依赖：pip install telethon
"""

import asyncio
import os
import random
from datetime import datetime
from telethon import TelegramClient, events
from telethon.tl.types import Channel, Chat, User

# ==============================
# 配置区域
# ==============================
# 您的 API ID 和 Hash (从 https://my.telegram.org 获取)
API_ID = 12345678  # 替换为您的 API_ID
API_HASH = 'your_api_hash_here'  # 替换为您的 API_HASH
PHONE = '+8613800000000'  # 您的手机号

# 要签到的群组列表 (可以是群组ID、用户名或链接)
GROUPS = [
    'your_group_username',  # 例如：'my_group'
    -1001234567890,        # 例如：群组ID (带负号)
    'https://t.me/another_group'
]

# 签到消息模板
CHECKIN_MESSAGE = "✅ 签到 | {date}"

# 运行模式
# "once" : 运行一次后退出
# "loop" : 循环运行，每天自动签到
MODE = "loop"

# ==============================
# 核心逻辑
# ==============================

def get_session_name():
    return 'tg_checkin_session'

async def send_checkin(client, group_id):
    """在指定群组发送签到消息"""
    try:
        # 获取群组对象
        entity = await client.get_entity(group_id)
        group_name = entity.title if hasattr(entity, 'title') else str(entity)
        
        # 生成消息
        date_str = datetime.now().strftime('%Y-%m-%d %H:%M')
        msg = CHECKIN_MESSAGE.format(date=date_str)
        
        # 随机延迟 (模拟真人)
        delay = random.uniform(2, 8)
        print(f"⏳ 等待 {delay:.1f} 秒后在 [{group_name}] 签到...")
        await asyncio.sleep(delay)
        
        # 发送消息
        await client.send_message(entity, msg)
        print(f"✅ 成功在 [{group_name}] 签到：{msg}")
        
        # 再次随机延迟，避免频繁操作
        await asyncio.sleep(random.uniform(5, 15))
        
    except Exception as e:
        print(f"❌ 在 [{group_id}] 签到失败: {e}")

async def main():
    print("🚀 启动 Telegram 自动签到...")
    
    # 创建客户端
    client = TelegramClient(get_session_name(), API_ID, API_HASH)
    
    await client.start(phone=PHONE)
    print("✅ 登录成功！")
    
    if MODE == "once":
        # 运行一次
        for group in GROUPS:
            await send_checkin(client, group)
        print("🏁 签到完成，退出。")
    else:
        # 循环运行
        print("🔄 进入循环模式，每天自动签到...")
        while True:
            now = datetime.now()
            # 假设每天 09:00 签到 (北京时间)
            target_hour = 9
            target_min = 0
            
            if now.hour == target_hour and now.minute == target_min:
                print(f"⏰ 到达签到时间 ({target_hour}:{target_min})，开始执行...")
                for group in GROUPS:
                    await send_checkin(client, group)
                # 避免同一分钟重复执行
                await asyncio.sleep(60)
            
            # 每分钟检查一次
            await asyncio.sleep(60)

if __name__ == "__main__":
    # 注意：首次运行需要输入验证码
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("👋 用户中断，退出。")
    except Exception as e:
        print(f"❌ 程序异常: {e}")
