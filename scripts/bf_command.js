// /root/.openclaw/workspace/scripts/bf_command.js
// 本地版 /bf 指令，实现 Telegram 上的备份控制台

const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

// TODO: 把下面两个值替换成你自己的 Bot Token / 主控 Chat ID
const TELEGRAM_BOT_TOKEN = "<TELEGRAM_BOT_TOKEN>"; // 你的 Telegram Bot Token
const MASTER_ID = "<MASTER_CHAT_ID>";              // 你的 Telegram 主控 chat_id（就是你自己的 ID）

// OpenClaw workspace 根目录
const WORKSPACE = "/root/.openclaw/workspace";
// 备份管理脚本路径（后面可以再实现 backup_manager.js）
const BACKUP_MANAGER = path.join(WORKSPACE, "scripts", "backup_manager.js");

// 简单的 Telegram 调用封装
async function callTelegram(method, payload) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`;
  const body = JSON.stringify(payload);
  return new Promise((resolve) => {
    const curl = spawn("curl", ["-s", "-X", "POST", url, "-H", "Content-Type: application/json", "-d", body], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    curl.stdout.on("data", (d) => { out += String(d); });
    curl.on("close", () => {
      try {
        resolve(JSON.parse(out));
      } catch {
        resolve({ ok: false, raw: out });
      }
    });
  });
}

function getBfButtons(p) {
  return [
    [
      { text: "📥 本地备份", callback_data: `/bf local ${p}` },
      { text: "📋 备份列表", callback_data: `/bf list ${p}` },
    ],
    [
      { text: "☁️ GitHub备份", callback_data: `/bf github ${p}` },
      { text: "🗑️ 清理记录", callback_data: `/bf clean ${p}` },
    ],
  ];
}

// 备份异步执行封装
function runBackupAsync(mode, timeoutMs = 120000) {
  return new Promise((resolve) => {
    if (!fs.existsSync(BACKUP_MANAGER)) {
      resolve({ ok: false, err: `backup_manager.js 不存在：${BACKUP_MANAGER}` });
      return;
    }
    const child = spawn("node", [BACKUP_MANAGER, mode], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "", err = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ ok: false, timedOut: true, out, err });
    }, timeoutMs);
    child.stdout.on("data", (d) => { out += String(d); });
    child.stderr.on("data", (d) => { err += String(d); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true, out, err });
      else resolve({ ok: false, out, err, code });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, out, err: (err + `\n${e.message}`).trim() });
    });
  });
}

// 简单同步执行，用于 list 等快速命令
function runSync(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8" });
  } catch (e) {
    return e.stdout || e.message || "执行失败";
  }
}

// 导出一个 handler，供 OpenClaw_bot 集成时调用
async function handleBfCommand(info) {
  // info 结构约定：
  // - info.chatId: 当前会话 chat_id
  // - info.msgId: 当前消息 id
  // - info.rest: 子命令，如 "local" / "github" / "list" / "clean"

  if (info.rest === "local" || info.rest === "github") {
    // 先回显“执行中”
    await callTelegram("editMessageText", {
      chat_id: info.chatId,
      message_id: Number(info.msgId),
      text: `⏳ 执行中: ${info.rest} ...`,
    });

    const timeout = info.rest === "github" ? 180000 : 120000;
    const result = await runBackupAsync(info.rest, timeout);

    if (result.ok) {
      await callTelegram("editMessageText", {
        chat_id: info.chatId,
        message_id: Number(info.msgId),
        text: `✅ 完成: ${info.rest}\n${(result.out || "").slice(-500) || "已完成"}`,
        reply_markup: { inline_keyboard: getBfButtons(`${info.chatId}:${info.msgId}`) },
      });
    } else {
      const reason = result.timedOut ? "执行超时" : "执行失败";
      await callTelegram("editMessageText", {
        chat_id: info.chatId,
        message_id: Number(info.msgId),
        text: `❌ ${reason}: ${info.rest}\n${((result.err || result.out || "").trim() || "无日志").slice(-600)}`,
        reply_markup: { inline_keyboard: getBfButtons(`${info.chatId}:${info.msgId}`) },
      });
    }
  } else if (info.rest === "list") {
    const out = runSync(`node ${BACKUP_MANAGER} list`);
    await callTelegram("editMessageText", {
      chat_id: info.chatId,
      message_id: Number(info.msgId),
      text: `📋 备份列表:\n${out ? out.slice(0, 3500) : "无记录"}`,
      reply_markup: { inline_keyboard: getBfButtons(`${info.chatId}:${info.msgId}`) },
    });
  } else if (info.rest === "clean") {
    const out = runSync(`node ${BACKUP_MANAGER} clean`);
    await callTelegram("editMessageText", {
      chat_id: info.chatId,
      message_id: Number(info.msgId),
      text: `🗑️ 清理记录:\n${out ? out.slice(0, 3500) : "无记录"}`,
      reply_markup: { inline_keyboard: getBfButtons(`${info.chatId}:${info.msgId}`) },
    });
  }
}

module.exports = {
  handleBfCommand,
  getBfButtons,
};
