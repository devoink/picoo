# uni-app 示例（说明稿）

H5 + 微信小程序的接入要点。

可运行的**原生**微信示例（含 Worker、批量、同步脚本）见 [`examples/miniprogram`](../miniprogram)。

## H5

与浏览器一致 — 从 `picoo` 引入，默认 `runtime: 'web'`。

## mp-weixin

1. 从 `node_modules/picoo/pkg-mp/`（或构建产物）拷入小程序包：
   - `picoo_core.js`（已替换为 `WXWebAssembly`）
   - `picoo_core_bg.wasm.br`（建议只放 brotli 版本）
2. 在微信 `app.json` / uni-app 对应 mp 配置中声明 `"workers": "workers"`
3. 提供 Worker 入口（`npm run sync:mp` 后可参考 `examples/miniprogram/workers/picoo`）— Worker 内只能 `require` `workers/` 下的文件；`.wasm.br` 放在该目录外
4. 初始化：

```typescript
import { createImageProcessor } from 'picoo';
import { toBytesFromPath, toTempPath } from 'picoo/io';

const img = await createImageProcessor({
  runtime: 'mp-weixin',
  wasmPath: '/static/picoo_core_bg.wasm.br',
  workerScript: 'workers/picoo/index.js',
});

const input = await toBytesFromPath(tempFilePath);
const result = await img.process(input, { width: 1280, maxSizeKB: 200 });
const outPath = await toTempPath(result);
```

## 要求

- 微信基础库 ≥ 2.13（`WXWebAssembly`）
- ≥ 2.15 支持 Worker（`process` 默认走 `wx.createWorker`）
- SIMD：微信 ≥ 8.0.25
- 真机可能缺少 `TextDecoder`（原生示例通过 `sync:mp` 注入 polyfill）
