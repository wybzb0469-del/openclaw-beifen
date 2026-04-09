#!/usr/bin/env node
/**
 * NodeSeek Auto Check-in Script (Puppeteer Version)
 * 独立运行，不依赖 OpenClaw 网关认证。
 * 需要 NodeSeek 账号已登录 (Cookie 持久化)。
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// 配置项
const CONFIG = {
    url: 'https://www.nodeseek.com/board',
    homeUrl: 'https://www.nodeseek.com/',
    cookiePath: path.join(__dirname, 'nodeseek_cookies.json'),
    headless: true, // 生产环境设为 true
    timeout: 60000,
};

// 工具函数：睡眠
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 工具函数：提取奖励信息
function extractReward(text) {
    if (!text) return { reward: null, rank: null };
    const m = text.match(/今日签到获得鸡腿\s*(\d+)\s*个?[，,。\s]*当前排名第\s*(\d+)/);
    if (m) return { reward: m[1], rank: m[2] };
    const m2 = text.match(/今日签到获得鸡腿\s*(\d+)/);
    const m3 = text.match(/当前排名第\s*(\d+)/);
    return { reward: m2?.[1] || null, rank: m3?.[1] || null };
}

// 工具函数：提取总鸡腿数
function extractChickenTotal(text) {
    if (!text) return null;
    const patterns = [
        /等级\s*Lv\s*\d+[\s\S]{0,80}?鸡腿\s*(\d+)\b/,
        /鸡腿\s*(\d+)\s*\n\s*星辰\s*\d+/,
        /鸡腿[:：]?\s*(\d+)\s*\n\s*(?:星辰 | 通知 | 主题帖 | 评论数 | 粉 收藏)\b/,
    ];
    for (const p of patterns) {
        const m = text.match(p);
        if (m) return m[1];
    }
    return null;
}

// 工具函数：检查登录状态
function hasLoginBlocker(text) {
    if (!text) return false;
    return (text.includes('用户名') || text.includes('邮箱')) && text.includes('密码') && text.includes('登录');
}

// 工具函数：检查验证码
function hasCaptchaBlocker(text) {
    if (!text) return false;
    const signals = ['Cloudflare', 'Turnstile', '验证', '验证码', 'I am human', '人机验证'];
    return signals.some(s => text.includes(s));
}

async function main() {
    let browser = null;
    try {
        console.log('🚀 正在启动浏览器...');
        browser = await puppeteer.launch({
            headless: CONFIG.headless,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-blink-features=AutomationControlled' // 关键：隐藏自动化特征
            ],
        });

        const page = await browser.newPage();
        
        // 关键：在页面加载任何内容前，注入脚本隐藏自动化特征
        await page.evaluateOnNewDocument(() => {
            // 移除 webdriver 属性
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
            // 伪装 User-Agent
            // (可选，如果需要更激进的伪装可在此添加)
        });

        await page.setViewport({ width: 1280, height: 800 });
        
        // 设置超时
        page.setDefaultNavigationTimeout(CONFIG.timeout);
        page.setDefaultTimeout(CONFIG.timeout);

        // 加载 Cookie (如果存在)
        if (fs.existsSync(CONFIG.cookiePath)) {
            const cookies = JSON.parse(fs.readFileSync(CONFIG.cookiePath, 'utf-8'));
            await page.setCookie(...cookies);
            console.log('🍪 已加载本地 Cookie');
        }

        console.log('🌐 正在访问 NodeSeek...');
        await page.goto(CONFIG.url, { waitUntil: 'networkidle2' });
        await sleep(2000);

        // 获取页面文本
        const bodyText = await page.evaluate(() => document.body.innerText);

        // 1. 检查登录状态
        if (hasLoginBlocker(bodyText)) {
            console.log('🔐 登录状态：未登录。请手动登录后导出 Cookie 至 nodeseek_cookies.json');
            // 尝试保存当前 Cookie 以供调试（虽然是登录页）
            const cookies = await page.cookies();
            fs.writeFileSync(CONFIG.cookiePath, JSON.stringify(cookies, null, 2));
            return;
        }

        // 2. 检查验证码
        if (hasCaptchaBlocker(bodyText)) {
            console.log('🧩 验证阻塞：出现人机验证 (Cookie 可能已过期)。');
            console.log('⚠️ 操作建议：请重新获取最新 Cookie 并更新 nodeseek_cookies.json');
            process.exit(0); // 视为正常退出，非脚本错误
        }

        let claimedThisRun = false;
        let tryLuckResult = null;
        let rewardInfo = { reward: null, rank: null };

        // 3. 检查是否已签到
        if (bodyText.includes('今日还未签到')) {
            console.log('📝 检测到未签到，尝试点击...');
            // 尝试点击签到按钮 (支持多种选择器)
            const signSelectors = ['a:contains("鸡腿")', 'button:contains("签到")', 'div:contains("鸡腿 x")', 'span:contains("鸡腿x")'];
            let clicked = false;
            
            // 使用 page.click 可能不够灵活，尝试 evaluate 点击
            const clickResult = await page.evaluate(() => {
                const terms = ['鸡腿 x', '鸡腿 x', '鸡腿 ×', '签到', '立即签到'];
                const nodes = Array.from(document.querySelectorAll('button, a, [role="button"], div, span'));
                const candidates = nodes.filter(el => {
                    const text = (el.innerText || el.textContent || '').trim();
                    return text && terms.some(t => text.includes(t));
                });
                if (candidates.length > 0) {
                    candidates[0].click();
                    return { success: true, text: candidates[0].innerText };
                }
                return { success: false };
            });

            if (clickResult.success) {
                clicked = true;
                console.log(`✅ 已点击签到按钮: ${clickResult.text}`);
                claimedThisRun = true;
                await sleep(2500);
            } else {
                console.log('⚠️ 未找到签到按钮');
            }
        } else {
            console.log('ℹ️ 今日状态：已签到');
        }

        // 4. 试试手气
        const tryLuckClicked = await page.evaluate(() => {
            const terms = ['试试手气'];
            const nodes = Array.from(document.querySelectorAll('button, a, [role="button"], div, span'));
            const candidates = nodes.filter(el => {
                const text = (el.innerText || el.textContent || '').trim();
                return text && terms.some(t => text.includes(t));
            });
            if (candidates.length > 0) {
                candidates[0].click();
                return true;
            }
            return false;
        });

        if (tryLuckClicked) {
            console.log('🎲 已点击"试试手气"');
            await sleep(2000);
            // 简单提取结果（实际结果可能需要更复杂的 DOM 解析）
            tryLuckResult = "已尝试"; 
        }

        // 5. 提取最终数据
        const finalText = await page.evaluate(() => document.body.innerText);
        rewardInfo = extractReward(finalText);
        let totalChicken = extractChickenTotal(finalText);

        if (!totalChicken) {
            // 如果当前页没有，去首页看看
            await page.goto(CONFIG.homeUrl, { waitUntil: 'networkidle2' });
            await sleep(2000);
            const homeText = await page.evaluate(() => document.body.innerText);
            totalChicken = extractChickenTotal(homeText);
        }

        // 保存 Cookie 以便下次使用
        const cookies = await page.cookies();
        fs.writeFileSync(CONFIG.cookiePath, JSON.stringify(cookies, null, 2));
        console.log('💾 Cookie 已保存');

        // 6. 生成报告
        const lines = ['NodeSeek 自动签到战报', ''];
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
        if (tryLuckClicked) {
            lines.push(`🎲 试试手气：${tryLuckResult || '已点击'}`);
        }

        console.log('\n' + lines.join('\n'));

    } catch (err) {
        console.error(`❌ 执行失败：${err.message}`);
        process.exit(1);
    } finally {
        if (browser) await browser.close();
    }
}

main();
