# picoo

面向浏览器与微信小程序的跨端 WASM 图片处理库。

- **浏览器**：默认 ESM Worker，处理不阻塞 UI
- **微信小程序**：默认 `wx.createWorker`，`info` 在主线程快速读头
- **能力**：裁剪、缩放、JPEG / PNG / WebP 编码、目标体积压缩（`maxSizeKB`）

## 目录

- [安装](#安装)
- [运行时与线程模型](#运行时与线程模型)
- [浏览器使用](#浏览器使用)
- [微信小程序使用](#微信小程序使用)
- [API 参考](#api-参考)
- [处理选项](#处理选项)
- [IO 辅助](#io-辅助)
- [错误处理](#错误处理)
- [示例与开发调试](#示例与开发调试)
- [从源码构建](#从源码构建)
- [常见问题](#常见问题)

---

## 安装

包名：`picoo`（发布到 npm 后可用；当前也可通过本地路径 / Git 依赖安装）。

### npm

```bash
npm install picoo
```

### yarn

```bash
yarn add picoo
```

### pnpm

```bash
pnpm add picoo
```

### bun

```bash
bun add picoo
```

### 从 Git / 本地路径（未发布时）

```bash
# Git
npm install github:devoink/picoo#main:packages/core
# 或克隆后
pnpm add ./packages/core
yarn add ./packages/core
```

安装后包内大致包含：

| 路径 | 用途 |
|------|------|
| `dist/` | TypeScript 编译产物（公开 API） |
| `pkg-web/` | 浏览器 WASM + glue |
| `pkg-mp/` | 小程序 glue（`WXWebAssembly`）+ `.wasm` / `.wasm.br` |

---

## 运行时与线程模型

通过 `createImageProcessor(options?)` 选择运行时：

| `runtime` | 默认 | `info` / `infoBatch` | `process` / `processBatch` |
|-----------|------|----------------------|----------------------------|
| `'web'`（默认） | 浏览器 | 主线程 WASM | **ESM `Worker`**（库内自动创建） |
| `'mp-weixin'` | 微信小程序 | 主线程 WASM | **`wx.createWorker`**（需自备 Worker 入口） |

要点：

1. **不要**自己去 `initWasm`；初始化由 `createImageProcessor` 完成。
2. `process*` 始终走 Worker 队列（串行）；小程序若创建 Worker 失败会回退主线程并在控制台警告。
3. 用完后调用 `dispose()` 终止 Worker，避免泄漏。

```typescript
import { createImageProcessor } from 'picoo';

const img = await createImageProcessor(); // web
// …
img.dispose();
```

---

## 浏览器使用

浏览器端使用默认 `runtime: 'web'`。**不强制 Vite**，也不强制安装 Vite 专用插件；只要打包工具能正确处理下面两点即可：

1. **`new URL(..., import.meta.url)`** — 用于加载库内 ESM Worker 与旁边的 `.wasm` 静态资源  
2. **ESM Worker** — `new Worker(url, { type: 'module' })`

Vite / Webpack / Rolldown / Parcel 等现代打包器通常都支持。下面以 Vite 为例。

### 1. 安装 picoo

```bash
npm install picoo
# yarn add picoo
# pnpm add picoo
```

### 2. 打包器要点（以 Vite 为例）

最小配置往往只需开启 ESM Worker：

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  worker: { format: 'es' },
  // 若开发时解析到 monorepo 源码，可能需要：
  // optimizeDeps: { exclude: ['picoo'] },
});
```

说明：

| 项 | 是否必须 | 原因 |
|----|----------|------|
| 安装 `picoo` | 是 | 库本身 |
| `worker: { format: 'es' }`（或等价配置） | 是（Vite） | picoo 使用 **ESM Worker** |
| `vite-plugin-wasm` / `vite-plugin-top-level-await` | **否** | 本仓库浏览器 Demo 为兼容性加了它们；多数 Vite 版本对「`fetch` + `import.meta.url` 旁路加载 `.wasm`」已够用 |
| 业务里传 `wasmPath` / `workerScript` | 否 | 仅小程序需要 |

若构建报错与 `.wasm` / top-level await 相关，再按需安装：

```bash
npm install -D vite-plugin-wasm vite-plugin-top-level-await
```

```typescript
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [wasm(), topLevelAwait()],
  worker: { format: 'es' },
});
```

Webpack 等请自行配置：复制 / 识别 `node_modules/picoo/pkg-web/*.wasm`，并启用 module worker。

### 3. 代码示例

```typescript
import { createImageProcessor } from 'picoo';
import type { ProcessOptions } from 'picoo';
import { toBytes, toBlob } from 'picoo/io';

const img = await createImageProcessor(); // runtime 默认 'web'

// 读元数据（主线程，较快）
const input = await toBytes(file);
const meta = await img.info(input);
console.log(meta.width, meta.height, meta.format, meta.size);

// 处理（自动进库内 Worker）
const options: ProcessOptions = {
  width: 1280,
  mode: 'inside',
  format: 'jpeg',
  quality: 80,
  // maxSizeKB: 200, // 若设置则优先于 quality
};
const result = await img.process(input, options);

// 上传 / 下载
const blob = toBlob(result);
upload(blob);

// 批量（串行队列）
const results = await img.processBatch(
  files.map((f) => toBytes(f)), // 先转成 Uint8Array[]
  {
    defaults: options,
    onProgress: (done, total) => console.log(`${done}/${total}`),
    onError: 'stop', // 或 'skip'
  },
);

img.dispose();
```

浏览器端 **无需**配置 `wasmPath` / `workerScript`；WASM 与 Worker 由打包器从 `pkg-web` 解析。

### 4. Worker 行为（浏览器）

- 库内部使用 `new Worker(new URL('../worker/picoo.worker.js', import.meta.url), { type: 'module' })`
- 同一 `ImageProcessor` 实例共用 **一个** Worker，任务串行排队
- `process` 通过 `postMessage` + `Transferable` 传递输入缓冲
- 调用 `dispose()` → `worker.terminate()`

---

## 微信小程序使用

小程序不能直接使用浏览器 ESM Worker，需要：

1. 使用 `runtime: 'mp-weixin'`
2. 指定包内 **`wasmPath`**（字符串路径）
3. 在 `app.json` 声明 `workers`，并提供 Worker 入口脚本
4. 把 `pkg-mp` 资源拷进小程序包（建议只用 `.wasm.br`）

完整可运行示例见 [`examples/miniprogram`](examples/miniprogram)。

### 环境要求

| 项目 | 要求 |
|------|------|
| 基础库 | ≥ 2.13（`WXWebAssembly`） |
| Worker | ≥ 2.15（推荐） |
| SIMD | 微信客户端 ≥ 8.0.25（picoo release 开启 `simd128`） |
| 主包体积 | ≤ 2MB；请优先使用 `picoo_core_bg.wasm.br`（约 0.5MB），**不要**同时放入未压缩 `.wasm` |

### 1. 安装

```bash
npm install picoo
# yarn add picoo
# pnpm add picoo
```

若使用微信「构建 npm」，请确认工具能正确处理该包的 `exports` / ESM；原生示例采用 **拷贝 `pkg-mp` + 本地同步脚本** 的方式更稳妥。

### 2. 拷贝 WASM 与 glue

从 `node_modules/picoo/pkg-mp/`（或本仓库构建产物）复制到小程序目录，例如：

```text
miniprogram/
  libs/picoo/
    picoo_core.js              # WXWebAssembly + 内联 TextDecoder polyfill
    picoo_core_bg.wasm.br      # 推荐只放这个
  workers/picoo/
    index.js                   # Worker 入口（见下）
    picoo_core.js              # Worker 内 require 用（与 libs 同内容即可）
```

注意微信规则：

- Worker **只能** `require` `workers/` 目录内的 JS
- `.wasm` / `.wasm.br` 必须放在 `workers/` **之外**（否则可能不被打包）

本仓库一键同步（开发用）：

```bash
./scripts/build.sh
npm run sync:mp
# 或 npm run dev:mp
```

### 3. 配置 `app.json`

```json
{
  "pages": ["pages/index/index"],
  "workers": "workers"
}
```

`workerScript` 传给 `createImageProcessor` 时 **不要**前导 `/`，例如：`workers/picoo/index.js`。

### 4. Worker 入口

库默认查找 `workers/picoo/index.js`。入口需：

1. `require('./picoo_core.js')`（glue 已内联 TextDecoder polyfill）并初始化 `wasmPath`
2. 处理 `{ type: 'init' | 'process' }` 消息，回传 `ready` / `result` / `error`

可直接使用本仓库生成的入口：

- 模板：[`scripts/mp-worker-entry.js`](scripts/mp-worker-entry.js)
- 同步后：`examples/miniprogram/miniprogram/workers/picoo/index.js`

也可自定义路径：

```typescript
await createImageProcessor({
  runtime: 'mp-weixin',
  wasmPath: '/libs/picoo/picoo_core_bg.wasm.br',
  workerScript: 'workers/my-picoo/index.js',
});
```

### 5. 业务代码示例

```typescript
import { createImageProcessor } from 'picoo';
import { toBytesFromPath, toTempPath } from 'picoo/io';

const img = await createImageProcessor({
  runtime: 'mp-weixin',
  wasmPath: '/libs/picoo/picoo_core_bg.wasm.br',
  // workerScript: 'workers/picoo/index.js', // 可选
});

wx.chooseMedia({
  count: 9,
  mediaType: ['image'],
  success: async (res) => {
    const path = res.tempFiles[0].tempFilePath;
    const input = await toBytesFromPath(path);

    const meta = await img.info(input);

    const result = await img.process(input, {
      width: 1280,
      mode: 'inside',
      format: 'jpeg',
      maxSizeKB: 200,
    });

    const outPath = await toTempPath(result);
    // 预览 outPath，或 wx.saveImageToPhotosAlbum({ filePath: outPath })

    // 批量
    const inputs = await Promise.all(
      res.tempFiles.map((f) => toBytesFromPath(f.tempFilePath)),
    );
    const results = await img.processBatch(inputs, {
      defaults: { width: 1280, format: 'jpeg', quality: 80 },
      onProgress: (done, total) => {
        wx.showLoading({ title: `${done}/${total}` });
      },
      onError: 'stop',
    });
    wx.hideLoading();
  },
});

// 页面卸载时
img.dispose();
```

### 6. 小程序 Worker 行为说明

| 项目 | 说明 |
|------|------|
| 创建 | `wx.createWorker(workerScript, { useExperimentalWorker: true })` |
| 通信 | `postMessage` / `onMessage`；库用桥接适配成浏览器式 `addEventListener` |
| 二进制 | 主线程 ↔ Worker 使用 **`ArrayBuffer`**（微信克隆 `Uint8Array` 不可靠） |
| 并发 | 微信限制同时最多 1 个 Worker；picoo 每个 processor 一个实例 |
| 回退 | `createWorker` 失败时回退主线程处理（可能卡 UI） |
| 控制台噪音 | `[worker] getNetworkType:fail not support` 等为基础库探测，一般可忽略 |

### 7. uni-app

思路与原生相同：拷贝 `pkg-mp`、配置 `workers`、提供 Worker 入口。详见 [`examples/uniapp/README.md`](examples/uniapp/README.md)。可运行的完整流程仍以 [`examples/miniprogram`](examples/miniprogram) 为准。

---

## API 参考

### `createImageProcessor(options?)`

```typescript
interface ProcessorOptions {
  runtime?: 'web' | 'mp-weixin'; // 默认 'web'
  wasmPath?: string;            // mp-weixin 必填，包内路径
  workerScript?: string;        // mp-weixin 可选，默认 'workers/picoo/index.js'
}

function createImageProcessor(options?: ProcessorOptions): Promise<ImageProcessor>;
```

### `ImageProcessor`

| 方法 | 线程 | 说明 |
|------|------|------|
| `info(input: Uint8Array)` | 主线程 | 读宽高、格式、体积、alpha、DPI、方向等 |
| `infoBatch(inputs)` | 主线程 | 并行 `Promise.all` 调 `info` |
| `process(input, options?)` | Worker | 裁剪 → 缩放 → 编码 |
| `processBatch(items, batchOptions?)` | Worker 串行 | 见下 |
| `dispose()` | — | 终止 Worker，释放引用 |

### `processBatch`

```typescript
type BatchItem = Uint8Array | { input: Uint8Array; options?: ProcessOptions };

interface BatchOptions {
  defaults?: ProcessOptions;
  onProgress?: (
    completed: number,
    total: number,
    result: ProcessResult,
    index: number,
  ) => void;
  onError?: 'stop' | 'skip'; // 默认 'stop'
}
```

选项合并：浅合并 `{ ...defaults, ...item.options }`；若 item 带 `crop`，则 **整对象替换** defaults 的 `crop`。

### 返回类型（摘要）

```typescript
interface ImageInfo {
  width: number;
  height: number;
  format: string;
  mimeType: string;
  size: number;
  hasAlpha: boolean;
  bitDepth?: number;
  dpi?: number;
  orientation?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}

interface ProcessResult {
  data: Uint8Array;
  width: number;
  height: number;
  format: 'jpeg' | 'png' | 'webp';
  mimeType: string;
  size: number;
  quality?: number;
}
```

---

## 处理选项

```typescript
interface ProcessOptions {
  crop?: { x: number; y: number; width: number; height: number };
  width?: number;
  height?: number;
  mode?: 'inside' | 'cover' | 'contain' | 'fill' | 'outside';
  format?: 'jpeg' | 'png' | 'webp';
  quality?: number;       // 1–100
  lossless?: boolean;     // 仅 WebP
  maxSizeKB?: number;     // 目标体积；设置后优先于 quality
  dpi?: number;
  minQuality?: number;
  maxQuality?: number;
  targetSizeTolerance?: number;
  autoResize?: boolean;
  minWidth?: number;
  minHeight?: number;
  background?: string;
}
```

### `quality` 语义

| 格式 | `quality` | `lossless` |
|------|-----------|------------|
| JPEG | 有损质量 1–100 | — |
| WebP | 有损质量 1–100（`lossless !== true`） | `true` → VP8L，忽略 `quality` |
| PNG | 量化强度 1–100（`100` ≈ 不量化，无损 RGBA） | — |

说明：

- `quality` **不保证**比原图更小；`process` 会重新编码并去除 EXIF
- 同时设置时，**`maxSizeKB` 优先于 `quality`**
- `maxSizeKB`：对 JPEG / 有损 WebP / PNG 量化做质量二分；可配合 `autoResize` 继续缩小尺寸

### WebP / PNG 提示

- **WebP**：默认有损 VP8；`lossless: true` 为 VP8L。无损 + `maxSizeKB` 时主要靠 `autoResize` 缩尺寸。
- **PNG**：`quality: 100` 无损 RGBA；更低值走 `imagequant`。对照片更有效。
- 上传有硬限制时，优先 **JPEG + `maxSizeKB`**。

---

## IO 辅助

```typescript
import { toBytes, toBlob, toBytesFromPath, toTempPath } from 'picoo/io';
```

| 方法 | 平台 | 说明 |
|------|------|------|
| `toBytes(Blob \| File)` | 浏览器 | → `Uint8Array` |
| `toBlob(ProcessResult)` | 浏览器 | 带正确 MIME 的 `Blob` |
| `toBytesFromPath(path)` | 微信小程序 | `wx.getFileSystemManager().readFile` |
| `toTempPath(result)` | 微信小程序 | 写入 `USER_DATA_PATH`，返回本地路径 |

---

## 错误处理

失败时抛出带 `code` 的错误（或兼容结构 `{ code, message }`）：

```typescript
try {
  await img.process(input, options);
} catch (err) {
  const e = err as Error & { code?: string };
  console.error(e.code, e.message);
}
```

常见情况：非法输入、无法触达 `maxSizeKB`、WASM 初始化失败、小程序缺少 `wasmPath` / Worker 脚本等。

---

## 示例与开发调试

| 示例 | 说明 |
|------|------|
| [`examples/browser`](examples/browser) | Vite 浏览器 Demo |
| [`examples/miniprogram`](examples/miniprogram) | 原生微信小程序（批量、Worker、同步脚本） |
| [`examples/uniapp`](examples/uniapp) | uni-app 接入说明 |

```bash
./scripts/build.sh          # 构建 WASM + TS + 测试
npm run dev:web             # 浏览器 Demo
npm run dev:mp              # 同步小程序资源并尝试打开开发者工具
npm run dev:mp:watch        # 同上 + 监听源码自动同步
```

Cursor / VS Code：「运行和调试」中可选 **Web Demo** / **小程序 Demo**（见 `.vscode/launch.json`）。

---

## 从源码构建

需要：

- Rust stable + 目标 `wasm32-unknown-unknown`
- [wasm-pack](https://rustwasm.github.io/wasm-pack/)
- Node.js 20+
- 可选：`wasm-opt`（binaryen）、`brotli`

```bash
./scripts/build.sh
```

脚本会：编译 WASM（SIMD）→ 生成 `pkg-web` / 打补丁的 `pkg-mp` → 编译 TypeScript → 跑测试 → 检查 WASM 体积上限（约 1.75 MiB）。

贡献说明见 [`CONTRIBUTING.md`](CONTRIBUTING.md)。

---

## 常见问题

**Q: 小程序主包超过 2MB？**  
A: 只放入 `picoo_core_bg.wasm.br`，删除未压缩 `.wasm`；仍不够则把 `libs/picoo` 放到分包。

**Q: 真机报 `TextDecoder is not defined`？**  
A: 使用打过补丁的 `pkg-mp` / `sync:mp` 产物；`picoo_core.js` 已内联 polyfill。

**Q: Worker 报 input 类型错误？**  
A: 确保 Worker 与主线程之间传 `ArrayBuffer`；使用仓库提供的 `mp-worker-entry.js`。

**Q: 能否关掉 Worker？**  
A: 公开 API 不提供「强制主线程」开关。小程序仅在 `wx.createWorker` 失败时回退主线程。

**Q: 浏览器也要传 `wasmPath` 吗？**  
A: 不需要。仅 `mp-weixin` 需要。

---

## License

MIT
