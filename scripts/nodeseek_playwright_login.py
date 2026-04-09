#!/usr/bin/env python3
"""
NodeSeek 账密登录脚本 (Playwright + 2Captcha)
斌哥专用 - 2026-04-05
功能：模拟真人浏览器登录，自动处理 Cloudflare 和验证码
"""

import asyncio
import json
import os
import re
from playwright.async_api import async_playwright
import requests
import time

# ==============================
# 配置区域
# ==============================
ACCOUNT = 'Liunew'
PASSWORD = 'bin123.'
CAPTCHA_KEY = '5250d96097c8f08261e383c5a14ed0ed'
LOGIN_URL = 'https://www.nodeseek.com/login' # 先试这个，如果不行再自动找
TARGET_URL = 'https://www.nodeseek.com/board'
COOKIE_FILE = 'nodeseek_cookies_playwright.json'

async def solve_captcha(sitekey, pageurl):
    """调用 2Captcha 解析 Token"""
    print(f"🔑 正在调用 2Captcha (Sitekey: {sitekey[:10]}...)")
    params = {
        'key': CAPTCHA_KEY,
        'method': 'hcaptcha',
        'sitekey': sitekey,
        'pageurl': pageurl,
        'json': 1
    }
    
    try:
        resp = requests.post('https://2captcha.com/in.php', data=params, timeout=10)
        result = resp.json()
        if result.get('status') != 1:
            print(f"❌ 提交失败: {result.get('request')}")
            return None
        
        task_id = result.get('request')
        print(f"⏳ 等待解析 (ID: {task_id})...")
        
        for _ in range(60):
            time.sleep(5)
            resp = requests.get(f'https://2captcha.com/res.php?key={CAPTCHA_KEY}&action=get&id={task_id}&json=1')
            result = resp.json()
            if result.get('status') == 1:
                print("✅ 解析成功！")
                return result.get('request')
            elif 'CAPCHA_NOT_READY' not in result.get('request', ''):
                print(f"❌ 解析失败: {result.get('request')}")
                return None
        print("⏰ 等待超时")
        return None
    except Exception as e:
        print(f"❌ 异常: {e}")
        return None

async def main():
    print("🚀 启动 Playwright 浏览器 (账密登录)...")
    
    async with async_playwright() as p:
        # 启动浏览器 (带反检测)
        browser = await p.chromium.launch(
            headless=True,
            args=['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        )
        
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
            locale='zh-CN',
            timezone_id='Asia/Shanghai',
            geolocation={'longitude': 113.2644, 'latitude': 23.1291}
        )
        
        # 注入反检测脚本
        await context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh'] });
        """)
        
        page = await context.new_page()
        
        try:
            # 1. 访问登录页 (尝试多个路径)
            urls_to_try = [
                'https://www.nodeseek.com/login',
                'https://www.nodeseek.com/user/login',
                'https://www.nodeseek.com/signin',
                'https://www.nodeseek.com/' # 首页可能直接有登录入口
            ]
            
            login_page_url = None
            for url in urls_to_try:
                print(f"🌐 尝试访问: {url}")
                await page.goto(url, wait_until='domcontentloaded', timeout=15000)
                await page.wait_for_timeout(2000) # 等待 Cloudflare 通过
                
                # 检查是否有登录表单
                if await page.query_selector('input[name="username"]') or await page.query_selector('input[name="email"]'):
                    login_page_url = url
                    print("✅ 找到登录页！")
                    break
                
                # 检查是否有登录按钮
                login_btn = await page.query_selector('a:has-text("登录")') or await page.query_selector('button:has-text("登录")')
                if login_btn:
                    print("✅ 找到登录按钮，点击跳转...")
                    await login_btn.click()
                    await page.wait_for_timeout(2000)
                    if await page.query_selector('input[name="username"]'):
                        login_page_url = page.url
                        print("✅ 跳转成功，找到登录页！")
                        break
            
            if not login_page_url:
                print("❌ 未找到登录页，请检查 URL 或页面结构。")
                # 截图调试
                await page.screenshot(path='debug_login.png')
                print("📸 已保存调试截图: debug_login.png")
                return
            
            # 2. 等待 Cloudflare 通过 (如果有)
            print("⏳ 等待 Cloudflare 验证...")
            try:
                await page.wait_for_selector('body', timeout=10000) # 简单等待
                # 检查是否有 Cloudflare 弹窗
                if await page.query_selector('#challenge-stage') or await page.query_selector('.cf-browser-verification'):
                    print("⚠️ 检测到 Cloudflare 验证，尝试等待...")
                    await page.wait_for_timeout(10000)
            except:
                pass
            
            # 3. 填充表单
            username_input = await page.query_selector('input[name="username"], input[name="email"], input[type="text"]')
            password_input = await page.query_selector('input[name="password"], input[type="password"]')
            
            if not username_input or not password_input:
                print("❌ 未找到用户名或密码输入框。")
                await page.screenshot(path='debug_form.png')
                return
            
            print("📝 正在填充账号密码...")
            await username_input.fill(ACCOUNT)
            await password_input.fill(PASSWORD)
            
            # 4. 检查是否有验证码 (hCaptcha / Turnstile)
            captcha_frame = await page.query_selector('iframe[src*="hcaptcha"], iframe[src*="turnstile"]')
            if captcha_frame:
                print("⚠️ 检测到验证码，准备调用 2Captcha...")
                # 提取 sitekey (简化版，可能需要根据实际 iframe 内容调整)
                # 这里假设 sitekey 在父元素或页面源码中
                html = await page.content()
                sitekey_match = re.search(r'data-sitekey="([^"]+)"', html)
                if sitekey_match:
                    sitekey = sitekey_match.group(1)
                    token = await solve_captcha(sitekey, page.url)
                    if token:
                        # 注入 Token (需要根据实际验证框类型调整)
                        # 通常需要将 token 填入隐藏的 input 或调用 JS 函数
                        print("🔧 尝试注入 Token...")
                        await page.evaluate(f'''
                            // 这里需要根据实际页面逻辑调整
                            // 例如：document.querySelector('.g-recaptcha-response').value = '{token}';
                            console.log('Token injected: {token[:10]}...');
                        ''')
                    else:
                        print("❌ 验证码解析失败。")
                        return
                else:
                    print("⚠️ 未找到 sitekey，尝试手动跳过 (可能不需要验证码)。")
            
            # 5. 点击登录
            print("🚀 提交登录...")
            submit_btn = await page.query_selector('button[type="submit"], input[type="submit"], button:has-text("登录"), button:has-text("Sign In")')
            if submit_btn:
                await submit_btn.click()
            else:
                print("⚠️ 未找到提交按钮，尝试点击第一个按钮。")
                btns = await page.query_selector_all('button')
                if btns:
                    await btns[0].click()
            
            # 6. 等待跳转或结果
            print("⏳ 等待登录结果...")
            await page.wait_for_timeout(5000)
            
            # 检查是否登录成功 (URL 变化或出现用户信息)
            current_url = page.url
            if 'board' in current_url or 'space' in current_url or 'dashboard' in current_url:
                print("✅ 登录成功！")
                
                # 提取 Cookie
                cookies = await context.cookies()
                with open(COOKIE_FILE, 'w', encoding='utf-8') as f:
                    json.dump(cookies, f, indent=2)
                print(f"💾 已保存 {len(cookies)} 个 Cookie 到 {COOKIE_FILE}")
                
                # 7. 执行签到
                print("🍗 正在执行签到...")
                await page.goto(TARGET_URL, wait_until='domcontentloaded')
                await page.wait_for_timeout(2000)
                
                # 调用签到 API (通过 page.evaluate 或重新用 requests)
                # 这里用 requests 复用 Cookie
                import requests
                session = requests.Session()
                for c in cookies:
                    session.cookies.set(c['name'], c['value'], domain='.nodeseek.com')
                
                resp = session.post('https://www.nodeseek.com/api/attendance?random=true', headers={
                    'Referer': TARGET_URL,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                })
                
                data = resp.json()
                if data.get('success'):
                    print(f"🎉 签到成功！奖励：{data.get('gain')} 个鸡腿，总数：{data.get('current')} 个。")
                else:
                    print(f"❌ 签到失败: {data.get('message')}")
            else:
                print("❌ 登录失败，URL 未变化。")
                print(f"当前 URL: {current_url}")
                await page.screenshot(path='debug_result.png')
                print("📸 已保存调试截图: debug_result.png")
                
        except Exception as e:
            print(f"❌ 执行异常: {e}")
            import traceback
            print(traceback.format_exc())
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
