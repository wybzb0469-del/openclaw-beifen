#!/usr/bin/env node
/**
 * NodeSeek Auto Check-in - Final Version (Playwright + Manual Stealth)
 * 不依赖有问题的 stealth 包，手动注入反检测脚本。
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CONFIG = {
    url: 'https://www.nodeseek.com/board',
    homeUrl: 'https://www.nodeseek.com/',
    cookiePath: path.join(__dirname, 'nodeseek_cookies.json'),
    logFile: path.join(__dirname, 'nodeseek-checkin.log'),
};

function log(msg) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${msg}\n`;
    console.log(msg);
    fs.appendFileSync(CONFIG.logFile, logLine);
}

function parseCookieString(cookieStr) {
    return cookieStr.split('; ').map(c => {
        const [name, ...valParts] = c.split('=');
        const value = valParts.join('=');
        return {
            name: name.trim(),
            value: decodeURIComponent(value),
            domain: '.nodeseek.com',
            path: '/',
            secure: true,
            httpOnly: false,
        };
    });
}

async function main() {
    let browser = null;
    try {
        log('🚀 [Playwright] 正在启动浏览器...');
        
        browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-blink-features=AutomationControlled',
                '--disable-features=MediaRouter',
                '--disable-extensions',
                '--disable-sync',
            ],
        });

        const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
            locale: 'zh-CN',
            timezoneId: 'Asia/Shanghai',
            hasTouch: false,
            isMobile: false,
        });

        // 手动注入反检测脚本 (核心 Stealth 逻辑)
        await context.addInitScript(() => {
            // 1. 隐藏 webdriver 属性
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            // 2. 隐藏 navigator.plugins 长度 (模拟真实插件)
            // Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            // 3. 隐藏 navigator.languages
            // Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh'] });
        });

        const page = await context.newPage();

        // 加载 Cookie
        let cookies = [];
        if (fs.existsSync(CONFIG.cookiePath)) {
            const cookieContent = fs.readFileSync(CONFIG.cookiePath, 'utf-8').trim();
            try {
                const parsed = JSON.parse(cookieContent);
                cookies = Array.isArray(parsed) ? parsed : [parsed];
            } catch (e) {
                try { cookies = parseCookieString(cookieContent); } catch (e2) {}
            }
            if (cookies.length > 0) {
                log(`🍪 已加载 ${cookies.length} 个 Cookie`);
                await context.addCookies(cookies);
            }
        }

        log('🌐 正在访问 NodeSeek...');
        // 放宽等待条件，避免长轮询导致的超时
        await page.goto(CONFIG.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(5000); // 多等一会让 JS 执行

        const bodyText = await page.evaluate(() => document.body.innerText);

        // 1. 检查登录
        if (bodyText.includes('用户名') && bodyText.includes('密码')) {
            log('🔐 登录状态：未登录 (Cookie 失效)');
            log('⚠️ 需重新获取 Cookie');
            await browser.close();
            return;
        }

        // 2. 检查验证码
        if (bodyText.includes('验证') || bodyText.includes('Cloudflare') || bodyText.includes('人机')) {
            log('🧩 验证阻塞：出现人机验证');
            await browser.close();
            return;
        }

        let claimedThisRun = false;
        let tryLuckResult = null;
        let rewardInfo = { reward: null, rank: null };

        // 3. 签到
        if (bodyText.includes('今日还未签到')) {
            log('📝 检测到未签到，尝试点击...');
            const clicked = await page.evaluate(() => {
                const terms = ['鸡腿 x', '鸡腿 x', '鸡腿 ×', '签到', '立即签到'];
                const nodes = Array.from(document.querySelectorAll('button, a, [role="button"], div, span, i'));
                for (const node of nodes) {
                    const text = (node.innerText || node.textContent || '').trim();
                    if (text && terms.some(t => text.includes(t))) {
                        node.click();
                        return true;
                    }
                }
                return false;
            });

            if (clicked) {
                log('✅ 已点击签到按钮');
                claimedThisRun = true;
                await page.waitForTimeout(3000);
            } else {
                log('⚠️ 未找到签到按钮');
            }
        } else {
            log('ℹ️ 今日状态：已签到');
        }

        // 4. 试试手气
        const tryLuckClicked = await page.evaluate(() => {
            const terms = ['试试手气'];
            const nodes = Array.from(document.querySelectorAll('button, a, [role="button"], div, span'));
            for (const node of nodes) {
                const text = (node.innerText || node.textContent || '').trim();
                if (text && terms.some(t => text.includes(t))) {
                    node.click();
                    return true;
                }
            }
            return false;
        });

        if (tryLuckClicked) {
            log('🎲 已点击"试试手气"');
            await page.waitForTimeout(2000);
            tryLuckResult = "已尝试";
        }

        // 5. 提取数据
        const finalText = await page.evaluate(() => document.body.innerText);
        
        const m1 = finalText.match(/今日签到获得鸡腿\s*(\d+)\s*个/);
        const m2 = finalText.match(/当前排名第\s*(\d+)/);
        if (m1) rewardInfo.reward = m1[1];
        if (m2) rewardInfo.rank = m2[1];

        let totalChicken = null;
        const patterns = [/等级\s*Lv\s*\d+[\s\S]{0,100}?鸡腿\s*(\d+)/, /鸡腿\s*(\d+)\s*\n/, /鸡腿[:：]?\s*(\d+)/];
        for (const p of patterns) {
            const m = finalText.match(p);
            if (m) { totalChicken = m[1]; break; }
        }

        if (!totalChicken) {
            log('🔄 当前页未获取到鸡腿数，尝试访问首页...');
            try {
                await page.goto(CONFIG.homeUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                await page.waitForTimeout(3000);
                const homeText = await page.evaluate(() => document.body.innerText);
                for (const p of patterns) {
                    const m = homeText.match(p);
                    if (m) { totalChicken = m[1]; break; }
                }
            } catch (e) {
                log('⚠️ 首页加载超时，跳过鸡腿数提取');
            }
        }

        // 保存 Cookie
        const currentCookies = await context.cookies();
        fs.writeFileSync(CONFIG.cookiePath, JSON.stringify(currentCookies, null, 2));
        log('💾 Cookie 已更新保存');

        // 6. 报告
        const lines = ['\n=== NodeSeek 自动签到战报 ==='];
        if (claimedThisRun && rewardInfo.reward) {
            lines.push('[签到成功] NodeSeek');
            lines.push(`🎁 今日领取：${rewardInfo.reward} 个鸡腿🍗`);
        } else if (claimedThisRun) {
            lines.push('[签到成功] NodeSeek');
            lines.push('🎁 今日领取：已点击，奖励提取中');
        } else {
            lines.push('[重复签到] NodeSeek');
            lines.push('ℹ️ 今日状态：已经领取过鸡腿🍗');
        }
        lines.push(totalChicken ? `🍗 当前鸡腿：${totalChicken}` : '🍗 当前鸡腿：未获取到');
        lines.push(rewardInfo.rank ? `🏆 当前排名：第 ${rewardInfo.rank} 名` : '🏆 当前排名：未获取到');
        if (tryLuckClicked) lines.push(`🎲 试试手气：${tryLuckResult || '已点击'}`);
        lines.push('=============================\n');

        log(lines.join('\n'));

    } catch (err) {
        log(`❌ 执行失败：${err.message}`);
        console.error(err);
    } finally {
        if (browser) await browser.close();
    }
}

main();
