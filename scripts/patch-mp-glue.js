#!/usr/bin/env node
/**
 * Patch wasm-pack glue for WeChat mini program:
 * 1. WebAssembly → WXWebAssembly
 * 2. Keep string wasmPath for WXWebAssembly.instantiate(path, imports)
 *    (WeChat does not support fetch / ArrayBuffer instantiate)
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

// wasm-bindgen web glue turns string|Request|URL into fetch(...).
// WeChat only accepts a package-local path string.
const fetchRewrite =
  /if\s*\(\s*typeof\s+(\w+)\s*===\s*['"]string['"]\s*\|\|[\s\S]*?\)\s*\{\s*\1\s*=\s*fetch\s*\(\s*\1\s*\)\s*;?\s*\}/;

if (fetchRewrite.test(source)) {
  source = source.replace(
    fetchRewrite,
    `if (typeof $1 === 'string') {
        // WeChat: pass package path directly to WXWebAssembly.instantiate
    } else if (
        (typeof Request === 'function' && $1 instanceof Request) ||
        (typeof URL === 'function' && $1 instanceof URL)
    ) {
        throw new Error('mp-weixin requires a string wasmPath (e.g. "/libs/picoo/picoo_core_bg.wasm.br")');
    }`,
  );
} else {
  console.warn('warning: fetch(module_or_path) pattern not found; glue may need a manual check');
}

writeFileSync(jsPath, source);
console.log(`Patched ${jsPath} for mp-weixin`);
