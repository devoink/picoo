#!/usr/bin/env node
/**
 * Patch wasm-pack glue for WeChat mini program: WebAssembly → WXWebAssembly.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const pkgDir = process.argv[2];
if (!pkgDir) {
  console.error('Usage: node patch-mp-glue.js <pkg-mp-dir>');
  process.exit(1);
}

const jsPath = join(pkgDir, 'picoo_core.js');
let source = readFileSync(jsPath, 'utf8');

source = source.replace(/\bWebAssembly\b/g, 'WXWebAssembly');

writeFileSync(jsPath, source);
console.log(`Patched ${jsPath} for mp-weixin`);
