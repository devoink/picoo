# Contributing to picoo

## Prerequisites

- Rust stable + `wasm32-unknown-unknown`
- [wasm-pack](https://rustwasm.github.io/wasm-pack/)
- Node.js 20+

## Development workflow

1. Pick a task from the plan / issue
2. Implement with minimal diff
3. Run `./scripts/build.sh` or:
   - `cargo test`
   - `cd packages/core && npm test`
   - `npm run test:e2e` (requires WASM build + Playwright browsers)
4. Update README if public API changes

## Code style

- **Rust**: `rustfmt` + `clippy -D warnings`
- **TypeScript**: strict mode, ESM, no new top-level exports without plan update
- **Comments**: JSDoc / `///` on public API only

## API rules

- Single entry: `createImageProcessor()`
- `process*` always uses Worker
- `info*` on main thread
- Batch merge: shallow merge; `crop` replaced entirely per item

## Pull requests

- Include test coverage for behavior changes
- Keep WASM size under ~1.75 MiB release (zenwebp + imagequant; see `scripts/build.sh` gate)
- Do not commit secrets or large binary fixtures (>1MB)
