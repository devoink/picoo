# picoo

Cross-platform WASM image processing for browsers and mini programs.

## Install

```bash
npm install picoo
```

## Quick start

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

Single entry point `createImageProcessor()` with four methods:

| Method | Description |
|--------|-------------|
| `info(input)` | Read image metadata (main thread, fast header parse) |
| `infoBatch(inputs)` | Batch metadata |
| `process(input, options?)` | Process in Worker (crop / resize / encode / DPI / maxSizeKB) |
| `processBatch(items, batchOptions?)` | Serial Worker queue with `onProgress` / `onError` |
| `dispose()` | Terminate Worker |

### Process options

- **crop** — `{ x, y, width, height }`
- **width / height / mode** — resize (`inside` | `cover` | `contain` | `fill` | `outside`)
- **format** — `jpeg` | `png` | `webp`
- **quality** — 1–100; semantics vary by format (see below). Ignored when `maxSizeKB` is set (binary search uses quality range instead).
- **lossless** — WebP only: `true` for VP8L lossless; default `false` (lossy VP8).
- **maxSizeKB** — target file size; quality binary search + optional `autoResize` (JPEG / WebP lossy / PNG quantize)
- **dpi** — metadata only (JPEG JFIF, PNG pHYs; WebP pass-through placeholder)

#### Format-specific `quality`

| Format | `quality` | `lossless` |
|--------|-----------|------------|
| JPEG | Lossy quality 1–100 | — |
| WebP | Lossy quality 1–100 (when `lossless` is false) | `true` → VP8L lossless (`quality` ignored) |
| PNG | Quantization strength 1–100 (`100` ≈ no quantize, lossless RGBA) | — |

`quality` does not guarantee a smaller file than the source; `process` re-encodes and strips EXIF. When both are set, **`maxSizeKB` takes priority over `quality`**.

### WeChat mini program

```typescript
const img = await createImageProcessor({
  runtime: 'mp-weixin',
  wasmPath: '/static/picoo_core_bg.wasm.br',
});
```

Copy `pkg-mp/` from the npm package into your mini program `static/` directory.

## Bundler setup (Vite)

```typescript
// vite.config.ts
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default {
  plugins: [wasm(), topLevelAwait()],
  worker: { format: 'es' },
};
```

## Build from source

```bash
./scripts/build.sh
```

Requires: Rust stable, `wasm32-unknown-unknown`, `wasm-pack`, Node.js 20+.

Optional: `wasm-opt` (binaryen), `brotli` (mini program compression).

## WebP & PNG notes

- **WebP**: lossy (VP8 via zenwebp) when `lossless` is omitted/false; set `lossless: true` for VP8L. `maxSizeKB` uses quality binary search for lossy WebP, or resize-only for lossless.
- **PNG**: `quality: 100` writes lossless RGBA; lower values run palette quantization (`imagequant`). Quantization helps photos more than flat graphics.

Use JPEG + `maxSizeKB` for predictable upload size limits.

## License

MIT
