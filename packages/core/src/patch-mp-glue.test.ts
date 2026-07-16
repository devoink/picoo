import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const patchScript = join(
  fileURLToPath(new URL('../../..', import.meta.url)),
  'scripts/patch-mp-glue.js',
);

describe('patch-mp-glue', () => {
  it('rewrites WebAssembly and skips fetch for string paths', () => {
    const dir = mkdtempSync(join(tmpdir(), 'picoo-patch-'));
    const glue = `
async function __wbg_init(module_or_path) {
  if (typeof module_or_path === 'undefined') {
    module_or_path = new URL('picoo_core_bg.wasm', import.meta.url);
  }
  const imports = {};
  if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
    module_or_path = fetch(module_or_path);
  }
  const result = await WebAssembly.instantiate(await module_or_path, imports);
  return result;
}
export default __wbg_init;
`;
    writeFileSync(join(dir, 'picoo_core.js'), glue);

    const result = spawnSync(process.execPath, [patchScript, dir], { encoding: 'utf8' });
    expect(result.status).toBe(0);

    const patched = readFileSync(join(dir, 'picoo_core.js'), 'utf8');
    expect(patched).toContain('WXWebAssembly');
    expect(patched).not.toMatch(/\bWebAssembly\b/);
    expect(patched).not.toMatch(/module_or_path\s*=\s*fetch\s*\(/);
    expect(patched).toContain('mp-weixin requires a string wasmPath');

    rmSync(dir, { recursive: true, force: true });
  });
});
