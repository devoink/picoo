# picoo

面向浏览器与小程序的跨端 WASM 图片处理库。

## 安装

```bash
npm install picoo
```

## 快速开始

```typescript
import { createImageProcessor } from 'picoo';
import { toBytes, toBlob } from 'picoo/io';

const img = await createImageProcessor();
const input = await toBytes(file);

const meta = await img.info(input);
const result = await img.process(input, {
  width: 1280,
  quality: 80,
  format: 'jpeg',
});

upload(toBlob(result));
```

## API

唯一入口：`createImageProcessor()`，提供以下方法：

| 方法 | 说明 |
|------|------|
| `info(input)` | 读取图片元数据（主线程，快速读头） |
| `infoBatch(inputs)` | 批量读取元数据 |
| `process(input, options?)` | 在 Worker 中处理（裁剪 / 缩放 / 编码 / DPI / maxSizeKB） |
| `processBatch(items, batchOptions?)` | Worker 串行队列，支持 `onProgress` / `onError` |
| `dispose()` | 终止 Worker |

### 处理选项

- **crop** — `{ x, y, width, height }`
- **width / height / mode** — 缩放（`inside` \| `cover` \| `contain` \| `fill` \| `outside`）
- **format** — `jpeg` \| `png` \| `webp`
- **quality** — 1–100；语义因格式而异（见下表）。设置 `maxSizeKB` 时忽略（二分搜索使用质量区间）
- **lossless** — 仅 WebP：`true` 为 VP8L 无损；默认 `false`（有损 VP8）
- **maxSizeKB** — 目标体积；质量二分 + 可选 `autoResize`（JPEG / 有损 WebP / PNG 量化）
- **dpi** — 仅写元数据（JPEG JFIF、PNG pHYs；WebP 为占位透传）

#### 各格式的 `quality`

| 格式 | `quality` | `lossless` |
|------|-----------|------------|
| JPEG | 有损质量 1–100 | — |
| WebP | 有损质量 1–100（`lossless` 为 false 时） | `true` → VP8L 无损（忽略 `quality`） |
| PNG | 量化强度 1–100（`100` ≈ 不量化，无损 RGBA） | — |

`quality` **不保证**输出比原图更小；`process` 会重新编码并去除 EXIF。若同时设置，**`maxSizeKB` 优先于 `quality`**。

### 微信小程序

```typescript
import { createImageProcessor } from 'picoo';
import { toBytesFromPath, toTempPath } from 'picoo/io';

const img = await createImageProcessor({
  runtime: 'mp-weixin',
  wasmPath: '/libs/picoo/picoo_core_bg.wasm.br',
  // 可选；默认 workers/picoo/index.js
  // workerScript: 'workers/picoo/index.js',
});

const input = await toBytesFromPath(tempFilePath);
const result = await img.process(input, { width: 1280, maxSizeKB: 200 });
const outPath = await toTempPath(result);
```

**接入清单**

1. 将打过补丁的 `pkg-mp` glue + **brotli** 压缩的 WASM（`.wasm.br`）放入小程序包；尽量只保留 `.br`，以免超过主包 2MB 限制
2. 在 `app.json` 中声明 `"workers": "workers"`
3. 在 `workers/` 下提供 Worker 入口（默认 `workers/picoo/index.js`），可 `require` glue JS；`.wasm.br` 必须放在 `workers/` **之外**
4. 基础库 ≥ 2.13（`WXWebAssembly`）；≥ 2.15 支持 Worker；微信 ≥ 8.0.25 支持 SIMD

原生示例：`examples/miniprogram` — 执行 `./scripts/build.sh` 再 `npm run sync:mp`，用微信开发者工具打开该目录。

## 打包配置（Vite）

```typescript
// vite.config.ts
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default {
  plugins: [wasm(), topLevelAwait()],
  worker: { format: 'es' },
};
```

## 从源码构建

```bash
./scripts/build.sh
```

需要：Rust stable、`wasm32-unknown-unknown`、`wasm-pack`、Node.js 20+。

可选：`wasm-opt`（binaryen）、`brotli`（小程序体积压缩）。

开发调试：

```bash
npm run dev:web      # 浏览器示例（Vite）
npm run dev:mp       # 同步并打开原生小程序示例
npm run dev:mp:watch # 同上，并监听源码自动同步
```

## WebP 与 PNG 说明

- **WebP**：默认有损（zenwebp / VP8）；`lossless: true` 为 VP8L。有损时 `maxSizeKB` 做质量二分；无损时仅在开启 `autoResize` 时通过缩小尺寸逼近体积。
- **PNG**：`quality: 100` 输出无损 RGBA；更低值走调色板量化（`imagequant`）。量化对照片更有效，对扁平图形收益有限。

上传体积有硬限制时，建议用 JPEG + `maxSizeKB`。

## License

MIT
