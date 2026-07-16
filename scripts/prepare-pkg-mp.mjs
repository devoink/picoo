#!/usr/bin/env node
/**
 * Prepare pkg-mp from pkg-web before TypeScript build / publish.
 * Requires packages/core/pkg-web from ./scripts/build.sh (wasm-pack).
 */
import { copyFileSync, cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const coreRoot = join(dirname(fileURLToPath(import.meta.url)), '../packages/core');
const pkgWeb = join(coreRoot, 'pkg-web');
const pkgMp = join(coreRoot, 'pkg-mp');
const wasmWeb = join(pkgWeb, 'picoo_core_bg.wasm');

if (!existsSync(wasmWeb) || !existsSync(join(pkgWeb, 'picoo_core.js'))) {
  console.error(
    'Missing packages/core/pkg-web WASM build.\n' +
      'Run ./scripts/build.sh from the repo root before publishing.',
  );
  process.exit(1);
}

rmSync(pkgMp, { recursive: true, force: true });
cpSync(pkgWeb, pkgMp, { recursive: true });
rmSync(join(pkgWeb, '.gitignore'), { force: true });
rmSync(join(pkgMp, '.gitignore'), { force: true });

const patch = spawnSync(
  process.execPath,
  [join(coreRoot, '../../scripts/patch-mp-glue.js'), pkgMp],
  { stdio: 'inherit' },
);
if (patch.status !== 0) process.exit(patch.status ?? 1);

const wasmMp = join(pkgMp, 'picoo_core_bg.wasm');
const wasmBr = join(pkgMp, 'picoo_core_bg.wasm.br');
if (!existsSync(wasmBr)) {
  const brotli = spawnSync('brotli', ['-q', '11', '-f', '-o', wasmBr, wasmMp], {
    stdio: 'inherit',
  });
  if (brotli.status !== 0) {
    console.warn(
      'warning: brotli unavailable; pkg-mp/*.wasm.br missing. Mini program packages may exceed 2MB.',
    );
  }
}

console.log('Prepared pkg-mp for publish');
