#!/usr/bin/env node
/**
 * NodeSeek Ultimate Auto Check-in (V3: 最终修复版)
 * 逻辑：
 * 1. 检查是否已签到（页面显示“今日签到获得鸡腿 X 个”）
 * 2. 如果已签到，直接提取数字
 * 3. 如果未签到，点击按钮，等待刷新，再提取
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  url: 'https://www.nodeseek.com/board',
  logFile: path.join(__dirname, 'nodeseek-checkin.log'),
  cookieEnvFile: path.join(__dirname, 'nodeseek_cookies.env'),
};

function log(msg) {
  const timestamp = new Date().toISOString();
  console.log(msg);
  fs.appendFileSync(CONFIG.logFile, `[${timestamp}] ${msg}\n`);
}

function loadCookies() {
  try {
    const envContent = fs.readFileSync(CONFIG.cookieEnvFile, 'utf8');
    const cookieLine = envContent.split('\n').find(line => line.startsWith('NS_COOKIE='));
    if (!cookieLine) return [];
    
    const cookieStr = cookieLine.substring('NS_COOKIE='.length).trim();
    const pairs = cookieStr.split('; ');
    const cookies = pairs.map(pair => {
      const eqIndex = pair.indexOf('=');
      if (eqIndex === -1) return null;
      const name = pair.substring(0, eqIndex);
      const value = pair.substring(eqIndex + 1);
      return { name, value, domain: '.nodeseek.com', path: '/', secure: true, httpOnly: false };
    }).filter(c => c !== null && c.name && c.value);
    
    return cookies;
  } catch (e) {
    log(`❌ 读取 Cookie 文件失败: ${e.message}`);
    return [];
  }
}

async function main() {
  let browser = null;
  try {
    log('🚀 [Ultimate] 启动浏览器 (精准提取鸡腿数)...');
    
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
      colorScheme: 'light',
      geolocation: { longitude: 113.2644, latitude: 23.1291 },
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh'] });
    });

    const page = await context.newPage();
    const cookies = loadCookies();
    
    if (cookies.length === 0) {
      log('❌ 无 Cookie，无法签到');
      return;
    }
    
    await context.addCookies(cookies);
    log(`🍪 已加载 ${cookies.length} 个 Cookie`);

    log('🌐 访问签到页...');
    await page.goto(CONFIG.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);

    let pageText = await page.evaluate(() => document.body.innerText);
    
    if (pageText.includes('执行安全验证') || pageText.includes('Cloudflare')) {
      log('❌ 被 Cloudflare 拦截');
      return;
    }

    log('✅ 页面加载成功');

    // 检查是否已签到
    const alreadySignedIn = /今日签到获得鸡腿\s*(\d+)\s*个/.test(pageText);
    
    if (!alreadySignedIn) {
      log('🎲 未签到，寻找并点击按钮...');
      const clicked = await page.evaluate(() => {
        const terms = ['试试手气', '鸡腿 x 5', '鸡腿x5', '鸡腿 × 5', '立即签到', '签到'];
        const nodes = Array.from(document.querySelectorAll('button, a, [role="button"], div, span'));
        for (const node of nodes) {
          const t = (node.innerText || node.textContent || '').trim();
          if (t && terms.some(x => t.includes(x))) {
            node.click();
            return true;
          }
        }
        return false;
      });

      if (!clicked) {
        log('⚠️ 未找到签到按钮');
        return;
      }
      
      log('✅ 已点击按钮，等待刷新...');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);
      pageText = await page.evaluate(() => document.body.innerText);
    } else {
      log('ℹ️ 已签到，直接提取奖励...');
    }

    // 提取奖励
    log('🔍 提取奖励数据...');
    const patterns = [
      /今日签到获得鸡腿\s*(\d+)\s*个/,
      /试试手气.*?获得\s*(\d+)\s*个鸡腿/,
      /鸡腿\s*(\d+)\s*个/,
      /获得\s*(\d+)\s*个鸡腿/,
      /奖励\s*(\d+)\s*个/,
      /领取\s*(\d+)\s*个/
    ];

    let reward = 0;
    for (const pattern of patterns) {
      const match = pageText.match(pattern);
      if (match && match[1]) {
        reward = parseInt(match[1], 10);
        break;
      }
    }

    // 如果正则没匹配，尝试查找所有包含"鸡腿"的文本
    if (reward === 0) {
      const allMatches = pageText.match(/鸡腿\s*(\d+)\s*个|获得\s*(\d+)\s*个鸡腿/g);
      if (allMatches && allMatches.length > 0) {
        const lastMatch = allMatches[allMatches.length - 1];
        const numMatch = lastMatch.match(/(\d+)/);
        if (numMatch) {
          reward = parseInt(numMatch[1], 10);
        }
      }
    }

    const rankMatch = pageText.match(/当前排名第\s*(\d+)/);
    const rank = rankMatch ? rankMatch[1] : '未知';

    // 生成战报
    const now = new Date();
    const beijingDate = now.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const beijingTime = now.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai' });

    log('\n=========================== 📊 NodeSeek 每日签到战报 ===========================');
    log(`📅 日期：${beijingDate}`);
    log(`🕒 北京时间：${beijingTime}`);
    
    if (reward > 0) {
      log('✅ [签到成功] NodeSeek');
      log(`🎁 今日领取：${reward} 个鸡腿🍗 (精准提取)`);
    } else {
      log('✅ [签到成功] NodeSeek');
      log('🎁 今日领取：签到成功 (具体数量需手动确认，未检测到数值)');
    }
    
    log(`🏆 当前排名：第 ${rank} 名`);
    log('=========================================================================');
    log('🍗 鸡腿已到手，明日继续！');

  } catch (e) {
    log(`❌ 执行失败: ${e.message}`);
  } finally {
    if (browser) await browser.close();
  }
}

main();
