#!/usr/bin/env node
// 基础版 backup_manager.js - 适配当前 VPS 环境
// 路径: /root/.openclaw/workspace/scripts/backup_manager.js

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BACKUP_BASE = '/root/.openclaw/workspace/backups';
const WORKSPACE_DIR = '/root/.openclaw/workspace';
const GITHUB_ENV_FILE = '/root/.openclaw/workspace/scripts/github_backup.env';
const GITHUB_REPO_DIR = '/root/.openclaw/workspace/_repos/openclaw-beifen';
const KEEP_DAYS = 7;
const KEEP_LATEST = 3;

const SKIP_NAMES = new Set([
  'node_modules',
  '.git',
  'backups',
  'dist',
  'build',
  '.cache',
  '.next',
  '.turbo',
  '.pnpm-store',
]);

const SKIP_RELATIVE_PREFIXES = [
  '_repos/openclaw-beifen',
  'openclaw-zero-token/.git',
  'openclaw-zero-token/dist',
  'openclaw-zero-token/node_modules',
  'openclaw-zero-token/.turbo',
  'openclaw-zero-token/.next',
  'tools/sosearch/sosearch.zip',
];

const SKIP_SUFFIXES = [
  '.log',
  '.tmp',
  '.temp',
  '.swp',
  '.tar.gz',
  '.zip',
  '.pyc',
  '.pyo',
];

const SKIP_EXACT_FILES = new Set([
  'scripts/github_backup.env',
  'scripts/nodeseek_cookies.env',
  'scripts/nodeseek_cookies.json',
  '.openclaw/workspace-state.json',
]);

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function shellEscape(str) {
  return `'${String(str).replace(/'/g, `'"'"'`)}'`;
}

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

function run(command, options = {}) {
  return execSync(command, {
    stdio: options.stdio || 'pipe',
    encoding: options.encoding || 'utf-8',
    cwd: options.cwd,
    maxBuffer: options.maxBuffer || 1024 * 1024 * 8,
    env: options.env ? { ...process.env, ...options.env } : process.env,
  });
}

function runQuiet(command, options = {}) {
  try {
    execSync(command, {
      stdio: 'ignore',
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
    });
    return true;
  } catch {
    return false;
  }
}

function getTodayFolder() {
  const d = new Date();
  const dateStr = d.toISOString().slice(0, 10);
  const dir = path.join(BACKUP_BASE, dateStr);
  ensureDir(dir);
  return dir;
}

function parseBackupEntries() {
  if (!fs.existsSync(BACKUP_BASE)) return [];
  const dayDirs = fs.readdirSync(BACKUP_BASE).sort();
  const entries = [];

  for (const day of dayDirs) {
    const dir = path.join(BACKUP_BASE, day);
    if (!fs.statSync(dir).isDirectory()) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.tar.gz')).sort();
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      entries.push({
        day,
        file,
        fullPath,
        mtimeMs: stat.mtimeMs,
        size: stat.size,
      });
    }
  }

  return entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function shouldSkipRel(relPath) {
  const normalized = relPath.replace(/\\/g, '/');
  if (!normalized) return false;
  if (SKIP_EXACT_FILES.has(normalized)) return true;
  if (SKIP_RELATIVE_PREFIXES.some(prefix => normalized === prefix || normalized.startsWith(prefix + '/'))) return true;
  if (SKIP_SUFFIXES.some(suffix => normalized.endsWith(suffix))) return true;
  return false;
}

function collectWorkspaceFiles() {
  const result = [];

  function walk(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (SKIP_NAMES.has(item.name)) continue;
      const fullPath = path.join(dir, item.name);
      const relPath = path.relative(WORKSPACE_DIR, fullPath).replace(/\\/g, '/');
      if (shouldSkipRel(relPath)) continue;
      if (item.isDirectory()) {
        walk(fullPath);
      } else if (item.isFile()) {
        result.push(relPath);
      }
    }
  }

  walk(WORKSPACE_DIR);
  return result.sort();
}

async function localBackup() {
  console.log('🚀 开始本地备份...');
  const todayDir = getTodayFolder();
  const ts = Date.now();
  const backupFile = path.join(todayDir, `backup-${ts}.tar.gz`);

  const excludeArgs = [
    '--exclude=".openclaw/agents/main/sessions"',
    '--exclude=".openclaw/agents/main/qmd"',
    '--exclude=".openclaw/.npm-cache"',
    '--exclude=".openclaw/cron/runs"',
    '--exclude=".openclaw/logs"',
    '--exclude=".openclaw/canvas"',
    '--exclude=".openclaw/browser"',
    '--exclude=".openclaw/media"',
    '--exclude=".openclaw/lcm.db"',
    '--exclude=".openclaw/workspace/backups"',
    '--exclude=".openclaw/sandboxes"',
  ];

  const cmd = `tar -czf "${backupFile}" ${excludeArgs.join(' ')} -C "/root" .openclaw`;
  console.log('执行:', cmd);
  try {
    ensureDir(BACKUP_BASE);
    execSync(cmd, { stdio: 'inherit' });
    const size = fs.existsSync(backupFile) ? formatSize(fs.statSync(backupFile).size) : '未知';
    console.log(`✅ 本地备份完成: ${backupFile}`);
    console.log(`📦 文件大小: ${size}`);
  } catch (e) {
    console.error('❌ 本地备份失败:', e.message);
    process.exit(1);
  }
}

async function listBackups() {
  if (!fs.existsSync(BACKUP_BASE)) {
    console.log('无备份目录');
    return;
  }
  const dates = fs.readdirSync(BACKUP_BASE);
  if (!dates.length) {
    console.log('无备份记录');
    return;
  }
  dates.sort().forEach(date => {
    const dir = path.join(BACKUP_BASE, date);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.tar.gz')).sort();
    console.log(`📅 ${date}:`);
    if (!files.length) {
      console.log('  (空目录)');
    } else {
      files.forEach(f => {
        const fullPath = path.join(dir, f);
        const stat = fs.statSync(fullPath);
        console.log(`  - ${f}  ${formatSize(stat.size)}`);
      });
    }
  });
}

async function githubBackup() {
  const env = readEnvFile(GITHUB_ENV_FILE);
  const repoUrl = env.GITHUB_REPO_URL;
  const token = env.GITHUB_TOKEN;

  if (!repoUrl || !token) {
    console.log('❌ GitHub 备份失败');
    console.log('缺少仓库地址或 token');
    return;
  }

  ensureDir(path.dirname(GITHUB_REPO_DIR));

  const remoteUrl = repoUrl.replace('https://', `https://x-access-token:${token}@`);
  const branch = 'main';

  if (!fs.existsSync(GITHUB_REPO_DIR) || !fs.existsSync(path.join(GITHUB_REPO_DIR, '.git'))) {
    run(`git clone ${shellEscape(remoteUrl)} ${shellEscape(GITHUB_REPO_DIR)}`, { stdio: 'ignore' });
  }

  run(`git -C ${shellEscape(GITHUB_REPO_DIR)} remote set-url origin ${shellEscape(remoteUrl)}`);
  run(`git -C ${shellEscape(GITHUB_REPO_DIR)} config user.name ${shellEscape('OpenClaw Backup')}`);
  run(`git -C ${shellEscape(GITHUB_REPO_DIR)} config user.email ${shellEscape('openclaw-backup@local')}`);

  try { run(`git -C ${shellEscape(GITHUB_REPO_DIR)} fetch origin`, { stdio: 'ignore' }); } catch {}
  try { run(`git -C ${shellEscape(GITHUB_REPO_DIR)} checkout ${branch}`, { stdio: 'ignore' }); } catch {
    run(`git -C ${shellEscape(GITHUB_REPO_DIR)} checkout -b ${branch}`, { stdio: 'ignore' });
  }
  try { run(`git -C ${shellEscape(GITHUB_REPO_DIR)} pull origin ${branch} --rebase`, { stdio: 'ignore' }); } catch {}

  const files = collectWorkspaceFiles();
  const keepSet = new Set(files);

  for (const relPath of files) {
    const src = path.join(WORKSPACE_DIR, relPath);
    const dst = path.join(GITHUB_REPO_DIR, relPath);
    ensureDir(path.dirname(dst));
    fs.copyFileSync(src, dst);
  }

  function cleanExtra(repoDir, baseRel = '') {
    const items = fs.readdirSync(repoDir, { withFileTypes: true });
    for (const item of items) {
      if (item.name === '.git') continue;
      const repoPath = path.join(repoDir, item.name);
      const relPath = path.join(baseRel, item.name).replace(/\\/g, '/');
      const isKeptFile = keepSet.has(relPath);
      const hasKeptDescendant = files.some(f => f.startsWith(relPath + '/'));

      if (!isKeptFile && !hasKeptDescendant) {
        fs.rmSync(repoPath, { recursive: true, force: true });
        continue;
      }

      if (item.isDirectory()) cleanExtra(repoPath, relPath);
    }
  }
  cleanExtra(GITHUB_REPO_DIR);

  run(`git -C ${shellEscape(GITHUB_REPO_DIR)} add -A`, { stdio: 'ignore', maxBuffer: 1024 * 1024 * 16 });

  const cleanTree = runQuiet(`git -C ${shellEscape(GITHUB_REPO_DIR)} diff --cached --quiet`) &&
                    runQuiet(`git -C ${shellEscape(GITHUB_REPO_DIR)} diff --quiet`);
  if (cleanTree) {
    console.log('✅ GitHub 备份完成');
    console.log(`📍 仓库: ${repoUrl}`);
    console.log(`🌿 分支: ${branch}`);
    console.log('📝 结果: 没有新的变更');
    return;
  }

  const before = run(`git -C ${shellEscape(GITHUB_REPO_DIR)} rev-parse --short HEAD`, { stdio: 'pipe' }).trim();
  const commitMsg = `backup: ${new Date().toISOString()}`;
  run(`git -C ${shellEscape(GITHUB_REPO_DIR)} commit -m ${shellEscape(commitMsg)}`, { stdio: 'ignore', maxBuffer: 1024 * 1024 * 16 });
  run(`git -C ${shellEscape(GITHUB_REPO_DIR)} push origin ${branch}`, { stdio: 'ignore', maxBuffer: 1024 * 1024 * 16 });
  const after = run(`git -C ${shellEscape(GITHUB_REPO_DIR)} rev-parse --short HEAD`, { stdio: 'pipe' }).trim();

  console.log('✅ GitHub 备份完成');
  console.log(`📍 仓库: ${repoUrl}`);
  console.log(`🌿 分支: ${branch}`);
  console.log(`📝 新提交: ${before} → ${after}`);
  console.log('🧹 已启用筛选规则');
}

async function cleanBackups() {
  const entries = parseBackupEntries();
  if (!entries.length) {
    console.log('无可清理的备份');
    return;
  }

  const now = Date.now();
  const keepSet = new Set(entries.slice(0, KEEP_LATEST).map(x => x.fullPath));
  const removed = [];
  let kept = 0;

  for (const entry of entries) {
    const ageDays = (now - entry.mtimeMs) / (1000 * 60 * 60 * 24);
    const shouldKeep = keepSet.has(entry.fullPath) || ageDays <= KEEP_DAYS;
    if (shouldKeep) {
      kept += 1;
      continue;
    }

    try {
      fs.unlinkSync(entry.fullPath);
      removed.push(entry);
    } catch (e) {
      console.log(`❌ 删除失败: ${entry.fullPath}`);
      console.log(String(e.message || e));
    }
  }

  if (fs.existsSync(BACKUP_BASE)) {
    for (const day of fs.readdirSync(BACKUP_BASE)) {
      const dir = path.join(BACKUP_BASE, day);
      if (!fs.statSync(dir).isDirectory()) continue;
      const rest = fs.readdirSync(dir);
      if (rest.length === 0) {
        fs.rmdirSync(dir);
      }
    }
  }

  if (!removed.length) {
    console.log(`✅ 清理完成：当前无需删除`);
    console.log(`📦 保留策略：最近 ${KEEP_LATEST} 份 + ${KEEP_DAYS} 天内备份`);
    console.log(`📚 当前保留：${kept} 份`);
    return;
  }

  console.log('✅ 清理完成');
  console.log(`📦 保留策略：最近 ${KEEP_LATEST} 份 + ${KEEP_DAYS} 天内备份`);
  console.log(`🗑️ 已删除：${removed.length} 份`);
  removed.forEach(item => {
    console.log(`  - ${item.day}/${item.file}`);
  });
}

async function main() {
  const mode = process.argv[2] || 'help';

  if (mode === 'local') {
    await localBackup();
  } else if (mode === 'list') {
    await listBackups();
  } else if (mode === 'github') {
    await githubBackup();
  } else if (mode === 'clean') {
    await cleanBackups();
  } else {
    console.log('用法: node backup_manager.js [local|github|list|clean]');
  }
}

main().catch(e => {
  console.error('❌ backup_manager.js 异常:', e);
  process.exit(1);
});
