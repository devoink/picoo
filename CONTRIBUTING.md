# 参与 picoo 贡献

## 环境要求

- Rust stable + `wasm32-unknown-unknown`
- [wasm-pack](https://rustwasm.github.io/wasm-pack/)
- Node.js 20+

## 开发流程

1. 从计划 / issue 领取任务
2. 实现时保持最小 diff
3. 运行 `./scripts/build.sh`，或分别执行：
   - `cargo test`
   - `cd packages/core && npm test`
   - `npm run test:e2e`（需先构建 WASM，并安装 Playwright 浏览器）
   - 开发调试：
     - Web Demo：`npm run dev:web`
     - 原生小程序：`npm run dev:mp`（或 `npm run dev:mp:watch` 自动同步）
4. 若公开 API 或运行时接入步骤有变，同步更新 README

## 代码风格

- **Rust**：`rustfmt` + `clippy -D warnings`
- **TypeScript**：strict、ESM；无计划批准不新增顶层导出
- **注释**：仅在公开 API 上写 JSDoc / `///`

## API 约定

- 唯一入口：`createImageProcessor()`
- `process*` 始终走 Worker（`web`：ESM Worker；`mp-weixin`：`wx.createWorker`，失败则主线程回退）
- `info*` 在主线程执行
- 批量选项：浅合并；`crop` 按整对象覆盖
- mp-weixin：必须提供 `wasmPath`；可选 `workerScript`（默认 `workers/picoo/index.js`）

## Pull Request

- 行为变更需有测试覆盖
- Release WASM 体积控制在约 1.75 MiB 以内（zenwebp + imagequant；见 `scripts/build.sh` 门禁）
- 勿提交密钥或大于 1MB 的二进制 fixtures
