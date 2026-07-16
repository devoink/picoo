#!/usr/bin/env node
/**
 * Sync picoo WASM + CJS bundle into the native WeChat mini program example.
 *
 * Prerequisites: run `./scripts/build.sh` (or at least produce packages/core/pkg-mp).
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgMp = join(root, "packages/core/pkg-mp");
const outDir = join(root, "examples/miniprogram/miniprogram/libs/picoo");
const coreSrc = join(root, "packages/core/src");

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!existsSync(join(pkgMp, "picoo_core.js"))) {
  fail(`Missing ${pkgMp}/picoo_core.js\nRun ./scripts/build.sh first to produce pkg-mp.`);
}

const wasmBr = join(pkgMp, "picoo_core_bg.wasm.br");
const wasmRaw = join(pkgMp, "picoo_core_bg.wasm");
if (!existsSync(wasmBr) && !existsSync(wasmRaw)) {
  fail(`Missing WASM under ${pkgMp} (.wasm or .wasm.br)`);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, "README.md"),
  "# 由 `node scripts/sync-miniprogram-example.mjs` 生成\n\n请勿手改。执行 `./scripts/build.sh` 后重新运行同步脚本。\n",
);

copyFileSync(join(pkgMp, "picoo_core.js"), join(outDir, "picoo_core.js"));

// WeChat main package limit is 2MB. Prefer brotli-only (~0.5MB) and never ship
// both .wasm and .wasm.br (together ~2.2MB).
let preferredWasm;
if (existsSync(wasmBr)) {
  copyFileSync(wasmBr, join(outDir, "picoo_core_bg.wasm.br"));
  preferredWasm = "/libs/picoo/picoo_core_bg.wasm.br";
} else {
  copyFileSync(wasmRaw, join(outDir, "picoo_core_bg.wasm"));
  preferredWasm = "/libs/picoo/picoo_core_bg.wasm";
  console.warn(
    "warning: picoo_core_bg.wasm.br missing; shipping uncompressed .wasm (~1.7MB).\n" +
      "Install brotli and re-run ./scripts/build.sh to stay under the 2MB main-package limit.",
  );
}

let esbuild;
try {
  esbuild = require("esbuild");
} catch {
  const install = spawnSync("npm", ["install", "--no-save", "esbuild@0.25.0"], { cwd: root, stdio: "inherit" });
  if (install.status !== 0) fail("Failed to install esbuild");
  esbuild = require("esbuild");
}

const mpOnlyPlugin = {
  name: "picoo-mp-only-bundle",
  setup(build) {
    build.onResolve({ filter: /picoo_core\.js$/ }, () => ({
      path: "./picoo_core.js",
      external: true,
    }));
    // Mini program demo only uses mp-weixin; stub the web adapter to avoid
    // import.meta / ESM Worker URLs in the CJS output.
    build.onResolve({ filter: /[/\\]adapters[/\\]web(\.(js|ts))?$/ }, () => ({
      path: "picoo-web-adapter-stub",
      namespace: "picoo-stub",
    }));
    build.onLoad({ filter: /.*/, namespace: "picoo-stub" }, () => ({
      contents: `
        export const webAdapter = {
          runtime: 'web',
          async loadWasm() {
            throw new Error('web runtime is not bundled in the miniprogram example');
          },
          createWorker() {
            throw new Error('web runtime is not bundled in the miniprogram example');
          },
        };
        export function resolvePkgWebUrl() {
          throw new Error('web runtime is not bundled in the miniprogram example');
        }
      `,
      loader: "js",
    }));
  },
};

await esbuild.build({
  absWorkingDir: root,
  entryPoints: {
    index: join(coreSrc, "index.ts"),
    io: join(coreSrc, "io.ts"),
  },
  bundle: true,
  format: "cjs",
  platform: "neutral",
  target: ["es2019"],
  outdir: outDir,
  outExtension: { ".js": ".js" },
  logLevel: "info",
  plugins: [mpOnlyPlugin],
  mainFields: ["module", "main"],
  conditions: ["import", "module", "default"],
});

// Convert ESM wasm glue → CJS so the mini program can require() it.
const gluePath = join(outDir, "picoo_core.js");
const glueEsbuild = await esbuild.build({
  absWorkingDir: outDir,
  entryPoints: [gluePath],
  bundle: true,
  format: "cjs",
  platform: "neutral",
  target: ["es2019"],
  outfile: join(outDir, "picoo_core.cjs.js"),
  logLevel: "silent",
  allowOverwrite: true,
});
if (glueEsbuild.errors?.length) {
  fail(glueEsbuild.errors.map((e) => e.text).join("\n"));
}
writeFileSync(gluePath, readFileSync(join(outDir, "picoo_core.cjs.js")));
rmSync(join(outDir, "picoo_core.cjs.js"), { force: true });

// Real-device WeChat JS often lacks TextDecoder; wasm-bindgen needs it at load time.
copyFileSync(
  join(root, "scripts/mp-text-encoding-polyfill.js"),
  join(outDir, "text-encoding.js"),
);
const polyfillRequire = "require('./text-encoding.js');\n";
for (const name of ["picoo_core.js", "index.js"]) {
  const filePath = join(outDir, name);
  writeFileSync(filePath, polyfillRequire + readFileSync(filePath, "utf8"));
}

writeFileSync(join(outDir, "wasm-path.js"), `module.exports = ${JSON.stringify(preferredWasm)};\n`);

// WeChat Worker can only require() files under workers/. WASM stays outside.
const workerDir = join(root, "examples/miniprogram/miniprogram/workers/picoo");
rmSync(workerDir, { recursive: true, force: true });
mkdirSync(workerDir, { recursive: true });
copyFileSync(join(outDir, "picoo_core.js"), join(workerDir, "picoo_core.js"));
copyFileSync(join(outDir, "text-encoding.js"), join(workerDir, "text-encoding.js"));
copyFileSync(join(root, "scripts/mp-worker-entry.js"), join(workerDir, "index.js"));
writeFileSync(
  join(workerDir, "README.md"),
  "# 由 sync-miniprogram-example.mjs 生成\n\npicoo 的 Worker 入口。WASM 位于 /libs/picoo/*.wasm.br\n",
);

const shipped = existsSync(join(outDir, "picoo_core_bg.wasm.br"))
  ? "picoo_core_bg.wasm.br"
  : "picoo_core_bg.wasm";
console.log(`Synced mini program libs → ${outDir}`);
console.log(`Synced WeChat worker → ${workerDir}`);
console.log(`Shipped WASM: ${shipped}`);
console.log(`Default wasmPath: ${preferredWasm}`);
