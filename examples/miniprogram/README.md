# 原生微信小程序示例

演示在**原生**微信小程序（非 uni-app）中使用 `createImageProcessor({ runtime: 'mp-weixin' })`。

## 环境要求

- 微信开发者工具
- 基础库 ≥ 2.13（`WXWebAssembly`）；建议 ≥ 2.15（Worker）
- 微信 ≥ 8.0.25（SIMD WASM；picoo release 开启 `simd128`）
- 仓库构建工具：Rust stable、`wasm32-unknown-unknown`、`wasm-pack`、Node.js 20+
- 建议安装 `brotli`（便于主包控制在 2MB 以内）

## 准备

在仓库根目录执行：

```bash
./scripts/build.sh
npm run dev:mp
```

`dev:mp` 会执行 `sync:mp`，并尝试用微信开发者工具打开本项目。源码变更后需要持续自动同步时：

```bash
npm run dev:mp:watch
```

也可在 Cursor / VS Code 的「运行和调试」中选择 **小程序 Demo**。

`sync:mp` 会：

- 将打过补丁的 `pkg-mp` 复制到 `miniprogram/libs/picoo/`（主线程 API + `.wasm.br`）
- 把 picoo 打成小程序可用的 CommonJS
- 生成 `miniprogram/workers/picoo/` 供 `wx.createWorker` 使用
- 注入 `TextDecoder` / `TextEncoder` polyfill（真机常缺失）

## 用开发者工具打开

1. 导入 `examples/miniprogram` 为小程序项目（已配置 `miniprogramRoot`）
2. 使用测试号或游客 AppID
3. WASM / SIMD 行为建议以**真机预览**为准

## 示例功能

- `wx.chooseMedia`（最多 9 张）→ `toBytesFromPath` / `info`
- 单张 `process` 或批量 `processBatch`（带进度）
- 结果预览；单张 / 全部保存到相册

默认 `wasmPath` 写在 `libs/picoo/wasm-path.js`。

## 目录说明

| 路径 | 作用 |
|------|------|
| `miniprogram/libs/picoo/` | 主线程打包产物、IO 辅助、`.wasm.br` |
| `miniprogram/workers/picoo/` | Worker 入口 + glue JS（只能 `require` 此目录内文件） |
| `miniprogram/app.json` | `"workers": "workers"` |

## 包体积

微信主包限制为 **2MB**。同步时若存在 brotli 产物，**只**放入 `picoo_core_bg.wasm.br`（约 0.5MB），不会同时带上未压缩的 `.wasm`。

## 注意事项

- `process` 默认使用 **`wx.createWorker`**；创建失败时回退主线程
- Worker 与主线程之间的二进制数据使用 `ArrayBuffer`（微信侧 TypedArray 克隆不可靠）
- 控制台出现 `[worker] getNetworkType:fail not support` 等多为基础库探测噪音，不是 picoo 报错
- 若仍超限，可将 `libs/picoo` 放到分包
