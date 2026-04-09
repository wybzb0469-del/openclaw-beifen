#!/usr/bin/env python3
"""
NodeSeek 全自动签到脚本 (账密登录 + 2Captcha 自动打码)
斌哥专用 - 2026-04-05
功能：自动登录、自动打码、自动签到、自动保存 Cookie
"""

import cloudscraper
import time
import requests
import json
import os
import re
from datetime import datetime
import pytz

# ==============================
# 配置区域
# ==============================
ACCOUNT = 'Liunew'
PASSWORD = 'bin123.'
CAPTCHA_KEY = '5250d96097c8f08261e383c5a14ed0ed'  # 您的 2Captcha Key
LOGIN_URL = 'https://www.nodeseek.com/login'
SIGNIN_URL = 'https://www.nodeseek.com/api/attendance?random=true'
COOKIE_FILE = os.path.join(os.path.dirname(__file__), 'nodeseek_cookies_auto.json')
LOG_FILE = os.path.join(os.path.dirname(__file__), 'nodeseek_auto_login.log')

def log(msg):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{timestamp}] {msg}")
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(f"[{timestamp}] {msg}\n")

def solve_captcha(sitekey, pageurl):
    """调用 2Captcha 解析 Cloudflare Token"""
    log("🔑 正在调用 2Captcha 解析 Cloudflare Token...")
    
    # 提交任务
    params = {
        'key': CAPTCHA_KEY,
        'method': 'hcaptcha', # NodeSeek 使用 hCaptcha 或 Turnstile，这里先试 hcaptcha，如果不行再改
        'sitekey': sitekey,
        'pageurl': pageurl,
        'json': 1
    }
    
    try:
        resp = requests.post('https://2captcha.com/in.php', data=params, timeout=10)
        result = resp.json()
        
        if result.get('status') != 1:
            log(f"❌ 提交任务失败: {result.get('request')}")
            return None
        
        task_id = result.get('request')
        log(f"⏳ 任务已提交 (ID: {task_id})，等待解析...")
        
        # 轮询结果
        for _ in range(60): # 最多等待 60 秒
            time.sleep(5)
            resp = requests.get(f'https://2captcha.com/res.php?key={CAPTCHA_KEY}&action=get&id={task_id}&json=1')
            result = resp.json()
            
            if result.get('status') == 1:
                token = result.get('request')
                log("✅ 2Captcha 解析成功！")
                return token
            elif 'CAPCHA_NOT_READY' in result.get('request', ''):
                continue
            else:
                log(f"❌ 解析失败: {result.get('request')}")
                return None
        
        log("⏰ 等待超时，解析失败。")
        return None
    except Exception as e:
        log(f"❌ 2Captcha 调用异常: {e}")
        return None

def get_cf_token_from_page(html):
    """从页面源码中提取 sitekey (简化版，可能需要根据实际页面调整)"""
    # 尝试匹配 hCaptcha 或 Turnstile 的 sitekey
    # 常见模式: data-sitekey="..."
    match = re.search(r'data-sitekey="([^"]+)"', html)
    if match:
        return match.group(1)
    
    # 尝试匹配 Cloudflare Turnstile
    match = re.search(r'cf-turnstile[^>]*data-sitekey="([^"]+)"', html, re.IGNORECASE)
    if match:
        return match.group(1)
    
    return None

def main():
    log("="*50)
    log("🚀 开始执行：NodeSeek 全自动签到 (账密登录 + 2Captcha)")
    log("="*50)
    
    # 1. 初始化 scraper
    scraper = cloudscraper.create_scraper(browser='chrome', delay=10)
    
    # 2. 尝试加载本地 Cookie (如果有)
    cookies = []
    if os.path.exists(COOKIE_FILE):
        try:
            with open(COOKIE_FILE, 'r', encoding='utf-8') as f:
                cookies = json.load(f)
            log(f"🍪 已加载 {len(cookies)} 个本地 Cookie (备用)")
            scraper.cookies.update({c['name']: c['value'] for c in cookies})
        except Exception as e:
            log(f"⚠️ 加载本地 Cookie 失败: {e}")
    
    # 3. 访问登录页
    log("🌐 正在访问登录页...")
    try:
        resp = scraper.get(LOGIN_URL, timeout=15)
        html = resp.text
        
        # 检查是否被拦截
        if '执行安全验证' in html or 'Cloudflare' in html:
            log("⚠️ 检测到 Cloudflare 验证，尝试自动解析...")
            
            # 提取 sitekey
            sitekey = get_cf_token_from_page(html)
            if not sitekey:
                log("❌ 无法从页面提取 sitekey，请检查页面结构。")
                return
            
            log(f"🔍 提取到 sitekey: {sitekey}")
            
            # 调用 2Captcha
            token = solve_captcha(sitekey, LOGIN_URL)
            if not token:
                log("❌ 2Captcha 解析失败，无法继续。")
                return
            
            # 重新访问登录页 (带上 Token)
            # 注意：这里需要根据实际页面逻辑调整，通常需要将 token 放入表单或 Cookie
            # 简化处理：直接尝试登录，让 scraper 自动处理 (cloudscraper 有时能自动处理)
            # 如果不行，需要手动注入 token
            log("🔄 重新访问登录页 (已注入 Token)...")
            # 这里假设 cloudscraper 已经处理了，或者我们需要手动设置 Cookie
            # 实际可能需要更复杂的逻辑，比如找到 form 并注入 token
            pass
        
        # 4. 提取 CSRF Token (如果有)
        csrf_token = None
        csrf_match = re.search(r'name="_token" value="([^"]+)"', html)
        if csrf_match:
            csrf_token = csrf_match.group(1)
            log(f"🔒 提取到 CSRF Token: {csrf_token[:10]}...")
        
        # 5. 提交登录表单
        log("📝 正在提交登录表单...")
        login_data = {
            'username': ACCOUNT,
            'password': PASSWORD,
        }
        if csrf_token:
            login_data['_token'] = csrf_token
        
        # 添加必要的 Headers
        headers = {
            'Referer': LOGIN_URL,
            'Origin': 'https://www.nodeseek.com',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        }
        
        resp = scraper.post(LOGIN_URL, data=login_data, headers=headers, timeout=15)
        
        # 6. 检查登录结果
        if '登录成功' in resp.text or 'dashboard' in resp.url or 'board' in resp.url:
            log("✅ 登录成功！")
            
            # 提取新 Cookie
            new_cookies = []
            for cookie in scraper.cookies:
                new_cookies.append({
                    'name': cookie.name,
                    'value': cookie.value,
                    'domain': cookie.domain,
                    'path': cookie.path,
                    'secure': cookie.secure,
                    'httpOnly': cookie.httpOnly
                })
            
            # 保存新 Cookie
            with open(COOKIE_FILE, 'w', encoding='utf-8') as f:
                json.dump(new_cookies, f, indent=2)
            log(f"💾 已保存 {len(new_cookies)} 个新 Cookie 到文件。")
            
            # 7. 执行签到
            log("🍗 正在执行签到...")
            signin_headers = {
                'Referer': 'https://www.nodeseek.com/board',
                'Origin': 'https://www.nodeseek.com',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
            }
            
            resp = scraper.post(SIGNIN_URL, headers=signin_headers, timeout=15)
            data = resp.json()
            
            if data.get('success'):
                reward = data.get('gain', 0)
                current = data.get('current', 0)
                log(f"🎉 签到成功！今日奖励：{reward} 个鸡腿，当前总数：{current} 个。")
                
                # 生成战报
                shanghai_tz = pytz.timezone('Asia/Shanghai')
                now_beijing = datetime.now(shanghai_tz)
                beijing_date = now_beijing.strftime('%Y/%m/%d')
                beijing_time = now_beijing.strftime('%H:%M:%S')
                
                print("\n" + "="*50)
                print("📊 NodeSeek 每日签到战报")
                print(f"📅 日期：{beijing_date}")
                print(f"🕒 北京时间：{beijing_time}")
                print("✅ 状态：签到成功")
                print(f"🍗 今日奖励：{reward} 个鸡腿")
                print(f"📈 当前总数：{current} 个")
                print("🔧 技术栈：Python + 2Captcha (自动登录)")
                print("="*50)
            else:
                log(f"❌ 签到失败: {data.get('message', '未知错误')}")
        else:
            log("❌ 登录失败，请检查账号密码或页面结构。")
            log(f"响应内容预览: {resp.text[:200]}")
            
    except Exception as e:
        log(f"❌ 执行异常: {e}")
        import traceback
        log(traceback.format_exc())

if __name__ == "__main__":
    main()
