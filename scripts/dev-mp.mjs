#!/usr/bin/env node
/**
 * 原生小程序开发：同步 libs/workers，并尽量用微信开发者工具打开项目。
 * 加 --watch 可在源码变更后自动重新 sync:mp。
 */
import { existsSync, watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const project = join(root, 'examples/miniprogram');
const wasmBr = join(root, 'packages/core/pkg-mp/picoo_core_bg.wasm.br');
const wasmRaw = join(root, 'packages/core/pkg-mp/picoo_core_bg.wasm');
const watchMode = process.argv.includes('--watch');

const wechatCliCandidates = [
  process.env.WECHAT_DEVTOOLS_CLI,
  '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
  '/Applications/微信开发者工具.app/Contents/MacOS/cli',
].filter(Boolean);

function runSync() {
  console.log('==> sync:mp');
  const result = spawnSync('npm', ['run', 'sync:mp'], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error('sync:mp 失败');
  }
}

function openWeChatDevTools() {
  for (const cli of wechatCliCandidates) {
    if (!cli || !existsSync(cli)) continue;
    console.log(`==> 打开微信开发者工具\n    ${cli}\n    --project ${project}`);
    const opened = spawnSync(cli, ['open', '--project', project], {
      stdio: 'inherit',
      env: process.env,
    });
    if (opened.status === 0) return true;
    console.warn('微信开发者工具 CLI 打开失败，请手动导入项目目录：', project);
    return false;
  }

  console.log(`
未找到微信开发者工具 CLI。请手动操作：
  1. 打开微信开发者工具
  2. 导入项目：${project}
  3. 改动 packages/core 或 scripts 后重新执行：npm run sync:mp
`);
  if (process.env.WECHAT_DEVTOOLS_CLI) {
    console.log(`当前 WECHAT_DEVTOOLS_CLI=${process.env.WECHAT_DEVTOOLS_CLI} 无效或不存在。`);
  } else {
    console.log('也可设置环境变量 WECHAT_DEVTOOLS_CLI 指向 CLI 可执行文件。');
  }
  return false;
}

if (!existsSync(wasmBr) && !existsSync(wasmRaw)) {
  console.error('缺少 pkg-mp WASM。请先在仓库根目录执行：\n  ./scripts/build.sh');
  process.exit(1);
}

try {
  runSync();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

openWeChatDevTools();

if (!watchMode) {
  console.log('\n提示：需要监听源码并自动同步时，使用：\n  npm run dev:mp:watch');
  process.exit(0);
}

const watchRoots = [
  join(root, 'packages/core/src'),
  join(root, 'scripts/mp-worker-entry.js'),
  join(root, 'scripts/mp-text-encoding-polyfill.js'),
  join(root, 'scripts/sync-miniprogram-example.mjs'),
  join(root, 'scripts/patch-mp-glue.js'),
];

let timer = null;
let syncing = false;

function scheduleSync(reason) {
  console.log(`\n==> 检测到变更：${reason}`);
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (syncing) return;
    syncing = true;
    try {
      runSync();
      console.log('==> 已重新同步，请在微信开发者工具中编译 / 预览');
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
    } finally {
      syncing = false;
    }
  }, 400);
}

console.log('\n==> 监听源码变更中（Ctrl+C 结束）');
for (const target of watchRoots) {
  if (!existsSync(target)) continue;
  try {
    watch(target, { recursive: true }, (_event, filename) => {
      scheduleSync(filename || target);
    });
  } catch {
    watch(target, (_event, filename) => {
      scheduleSync(filename || target);
    });
  }
}
