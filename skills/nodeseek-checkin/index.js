// NodeSeek Auto Check-in Skill for OpenClaw
// Executes within the OpenClaw agent context, using internal browser tools.

import { execFileSync } from 'child_process';

// --- Helper Functions (Adapted for Internal Execution) ---

// Simulate OpenClaw CLI calls using internal logic if possible, 
// but since we are in a skill, we might need to rely on the environment 
// having the browser tool available via openclaw command or internal API.
// Given the constraint, we will try to use the 'openclaw' command but 
// rely on the fact that the skill runs in an environment where the 
// gateway connection is already established (unlike the standalone script).

// Re-using the robust execution wrapper
async function runOpenClawCommand(args, { json = false, retries = 3 } = {}) {
  // In a Skill context, 'openclaw' command should be available and authenticated
  const finalArgs = ['--log-level', 'silent', ...args];
  // Attempt to use --json if supported, but handle gracefully
  // Note: We'll try without --json first as per previous error, 
  // and parse text if needed.
  
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const out = execFileSync('openclaw', finalArgs, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 90000,
      }).trim();
      
      if (json) {
        try {
            return JSON.parse(out);
        } catch (e) {
            // If JSON parse fails, return raw text or throw depending on strictness
            // For now, return raw text if it looks like an object, else throw
            if (out.startsWith('{') || out.startsWith('[')) {
                 return JSON.parse(out); // Try again strictly
            }
            return out; // Return text if JSON not expected or parse fails
        }
      }
      return out;
    } catch (err) {
      lastErr = err;
      const msg = [err?.message, err?.stderr?.toString?.(), err?.stdout?.toString?.()].filter(Boolean).join('\n');
      const retryable = /gateway timeout|timed out|ECONNRESET|ECONNREFUSED|socket hang up|pairing required/i.test(msg);
      
      // If "pairing required" appears, it might be a transient auth issue or env issue
      // But in a Skill, it should be authenticated. Let's retry once on pairing errors too.
      if (!retryable || attempt >= retries) throw err;
      
      const delay = attempt * 1000;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// Async wait wrapper
async function wait(ms) {
  try {
    runOpenClawCommand(['browser', 'wait', '--time', String(ms)]);
  } catch (e) {
    // Ignore wait errors if browser isn't ready yet or command structure differs
    await new Promise(r => setTimeout(r, ms));
  }
}

function browserJson(args) {
  return runOpenClawCommand(['browser', ...args], { json: true });
}

function browserText(args) {
  return runOpenClawCommand(['browser', ...args], { json: false });
}

function ensureBrowser() {
  try {
    const status = browserJson(['status']);
    if (!status?.running || !status?.cdpReady) {
      browserText(['start']);
      // Wait for start
      let attempts = 0;
      while(attempts < 10) {
        try {
            const s = browserJson(['status']);
            if (s?.running && s?.cdpReady) break;
        } catch {}
        attempts++;
        setTimeout(() => {}, 500);
      }
    }
  } catch (e) {
    // If status fails, try starting anyway
    browserText(['start']);
  }
}

function evalPage(targetId, fn) {
  try {
    const res = browserJson(['evaluate', '--target-id', targetId, '--fn', fn]);
    return res?.result;
  } catch (e) {
    return null;
  }
}

function openPage(url) {
  const opened = browserJson(['open', url]);
  return opened?.targetId;
}

function navigate(targetId, url) {
  browserText(['navigate', '--target-id', targetId, url]);
}

function closePage(targetId) {
  if (!targetId) return;
  try { browserText(['close', '--target-id', targetId]); } catch {}
}

function stopBrowser() {
  try { browserText(['stop']); } catch {}
}

function clickByText(targetId, terms) {
  const fn = `() => {
    const wanted = ${JSON.stringify(terms)};
    const isVisible = (el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style && style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const textOf = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
    const nodes = [...document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"], div, span')];
    const candidates = nodes.filter((el) => {
      const text = textOf(el);
      return text && isVisible(el) && wanted.some((term) => text.includes(term));
    });
    candidates.sort((a, b) => textOf(a).length - textOf(b).length);
    const el = candidates[0];
    if (!el) return { clicked: false, found: [] };
    const text = textOf(el);
    el.click();
    return { clicked: true, text, found: candidates.slice(0, 5).map(textOf) };
  }`;
  return evalPage(targetId, fn);
}

function getBodyText(targetId) {
  const txt = evalPage(targetId, '() => document.body.innerText');
  return typeof txt === 'string' ? txt : '';
}

function extractReward(text) {
  if (!text) return { reward: null, rank: null };
  const m = text.match(/今日签到获得鸡腿\s*(\d+)\s*个?[，,。\s]*当前排名第\s*(\d+)/);
  if (m) return { reward: m[1], rank: m[2] };
  const m2 = text.match(/今日签到获得鸡腿\s*(\d+)/);
  const m3 = text.match(/当前排名第\s*(\d+)/);
  return { reward: m2?.[1] || null, rank: m3?.[1] || null };
}

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

function hasLoginBlocker(text) {
  if (!text) return false;
  return (text.includes('用户名') || text.includes('邮箱')) && text.includes('密码') && text.includes('登录');
}

function hasCaptchaBlocker(text) {
  if (!text) return false;
  const signals = ['Cloudflare', 'Turnstile', '验证', '验证码', 'I am human', '人机验证'];
  return signals.some((s) => text.includes(s));
}

// --- Main Execution Logic ---

async function executeCheckin() {
  let targetId = null;
  try {
    ensureBrowser();
    
    targetId = openPage('https://www.nodeseek.com/board');
    if (!targetId) throw new Error('无法打开 NodeSeek 签到页');
    
    await wait(2200);
    let boardText = getBodyText(targetId);

    if (hasLoginBlocker(boardText)) {
      return 'NodeSeek 自动签到战报\n\n[执行受阻] NodeSeek\n🔐 登录状态：当前未登录，需要先登录 NodeSeek 账号';
    }

    if (hasCaptchaBlocker(boardText)) {
      return 'NodeSeek 自动签到战报\n\n[执行受阻] NodeSeek\n🧩 验证阻塞：出现人机验证，需要你手动完成后我再继续';
    }

    let claimedThisRun = false;
    let tryLuckResult = null;

    if (boardText && boardText.includes('今日还未签到')) {
      const signClick = clickByText(targetId, ['鸡腿 x', '鸡腿 x', '鸡腿 ×', '签到']);
      if (!signClick?.clicked) {
        return 'NodeSeek 自动签到战报\n\n[执行受阻] NodeSeek\n⚠️ 签到按钮：检测到今日未签到，但没有找到可点击的签到按钮';
      }
      claimedThisRun = true;
      await wait(2500);
      boardText = getBodyText(targetId);
    }

    const beforeTryLuckText = boardText || "";
    const tryLuckClick = clickByText(targetId, ['试试手气']);
    if (tryLuckClick?.clicked) {
      await wait(1800);
      const afterTryLuckText = getBodyText(targetId) || "";
      const delta = afterTryLuckText.replace(beforeTryLuckText, '').trim();
      if (delta && !delta.includes('试试手气')) {
        tryLuckResult = delta.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 3).join(' / ');
      } else {
        const luckMatch = afterTryLuckText.match(/试试手气 [^\n]*\n([^\n]+)/);
        if (luckMatch?.[1]) tryLuckResult = luckMatch[1].trim();
      }
      // boardText = afterTryLuckText; // Update not strictly needed for final report logic
    }

    // Re-fetch text for final extraction if needed
    const finalText = getBodyText(targetId) || boardText;
    const rewardInfo = extractReward(finalText);
    let totalChicken = extractChickenTotal(finalText);

    if (!totalChicken) {
      navigate(targetId, 'https://www.nodeseek.com/');
      await wait(2200);
      const homeText = getBodyText(targetId);
      totalChicken = extractChickenTotal(homeText);
    }

    const lines = ['NodeSeek 自动签到战报', ''];
    if (claimedThisRun && rewardInfo.reward) {
      lines.push('[签到成功] NodeSeek');
      lines.push(`🎁 今日领取：${rewardInfo.reward} 个鸡腿🍗`);
    } else if (claimedThisRun) {
      lines.push('[签到成功] NodeSeek');
      lines.push('🎁 今日领取：已点击签到，但奖励数暂未成功提取');
    } else {
      lines.push('[重复签到] NodeSeek');
      lines.push('ℹ️ 今日状态：已经领取过鸡腿🍗');
    }
    lines.push(totalChicken ? `🍗 当前鸡腿：${totalChicken}` : '🍗 当前鸡腿：未获取到');
    lines.push(rewardInfo.rank ? `🏆 当前排名：第 ${rewardInfo.rank} 名` : '🏆 当前排名：未获取到');
    if (tryLuckClick?.clicked) {
      lines.push(`🎲 试试手气：${tryLuckResult || '已点击，但未抓到明确结果文本'}`);
    }
    
    return lines.join('\n');

  } catch (err) {
    return `NodeSeek 自动签到战报\n\n[执行失败] NodeSeek\n❌ 错误信息：${err?.message || String(err)}`;
  } finally {
    closePage(targetId);
    stopBrowser();
  }
}

// Export for Skill usage if needed, or run directly
// In OpenClaw Skill context, the main logic is often triggered by the framework
// or we export a function to be called. 
// Assuming the skill framework calls a default export or main function.

export default async function run() {
    const result = await executeCheckin();
    console.log(result);
    return result;
}

// Auto-execute if run directly as a script
run().catch(console.error);
