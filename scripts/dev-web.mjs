#!/usr/bin/env node
/**
 * Web demo 开发服务：启动 examples/browser 的 Vite。
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasm = join(root, 'packages/core/pkg-web/picoo_core_bg.wasm');
const demo = join(root, 'examples/browser');

if (!existsSync(wasm)) {
  console.error('缺少 WASM。请先在仓库根目录执行：\n  ./scripts/build.sh');
  process.exit(1);
}

if (!existsSync(join(demo, 'node_modules'))) {
  console.log('==> 安装 examples/browser 依赖');
  const install = spawnSync('npm', ['install'], { cwd: demo, stdio: 'inherit' });
  if (install.status !== 0) process.exit(install.status ?? 1);
}

console.log('==> 启动 Web Demo：http://localhost:5173');
const child = spawn('npm', ['run', 'dev', '--', '--host'], {
  cwd: demo,
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
