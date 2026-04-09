import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";

const execFileAsync = promisify(execFile);
const BACKUP_MANAGER = "/root/.openclaw/workspace/scripts/backup_manager.js";

function buildButtons() {
  return [
    [
      { text: "📋 列表", callback_data: "/bf list" },
      { text: "💾 本地备份", callback_data: "/bf local" }
    ],
    [
      { text: "☁️ GitHub", callback_data: "/bf github" },
      { text: "🧹 清理", callback_data: "/bf clean" }
    ]
  ];
}

async function runBackup(mode: string) {
  if (!fs.existsSync(BACKUP_MANAGER)) {
    return { ok: false, text: `❌ backup_manager.js 不存在\n${BACKUP_MANAGER}` };
  }

  try {
    const { stdout, stderr } = await execFileAsync("node", [BACKUP_MANAGER, mode], {
      timeout: mode === "local" ? 120000 : 30000,
      maxBuffer: 1024 * 1024,
    });
    const out = [stdout, stderr].filter(Boolean).join("\n").trim();
    return { ok: true, text: out || "已完成" };
  } catch (error: any) {
    const out = [error?.stdout, error?.stderr, error?.message].filter(Boolean).join("\n").trim();
    return { ok: false, text: out || "执行失败" };
  }
}

function truncate(text: string, max = 3500): string {
  return text.length > max ? `${text.slice(0, max)}\n...` : text;
}

export default definePluginEntry({
  id: "bf",
  name: "Backup Fast Command",
  description: "Telegram /bf backup command",
  register(api) {
    api.registerCommand({
      name: "bf",
      description: "备份控制：/bf [list|local|github|clean]",
      acceptsArgs: true,
      requireAuth: true,
      handler: async (ctx) => {
        const arg = (ctx.args || "").trim().toLowerCase();

        if (!arg) {
          return {
            text: "📦 /bf 备份控制面板\n\n点击下方按钮执行对应操作：",
            channelData: {
              telegram: {
                buttons: buildButtons(),
              },
            },
          };
        }

        if (!["list", "local", "github", "clean"].includes(arg)) {
          return {
            text: `❌ 不支持的子命令：${arg}\n可用：list / local / github / clean`,
            channelData: {
              telegram: {
                buttons: buildButtons(),
              },
            },
          };
        }

        const result = await runBackup(arg);
        const titleMap: Record<string, string> = {
          list: result.ok ? "📋 备份列表" : "❌ 获取列表失败",
          local: result.ok ? "✅ 本地备份完成" : "❌ 本地备份失败",
          github: result.ok ? "✅ GitHub 备份完成" : "❌ GitHub 备份失败",
          clean: result.ok ? "✅ 清理完成" : "❌ 清理失败",
        };

        return {
          text: `${titleMap[arg]}\n${truncate(result.text)}`,
          channelData: {
            telegram: {
              buttons: buildButtons(),
            },
          },
        };
      },
    });
  },
});
