# uni-app example (Phase 5)

Minimal integration sketch for H5 + WeChat mini program.

## H5

Same as browser — import from `picoo` with default `runtime: 'web'`.

## mp-weixin

1. Copy from `node_modules/picoo/pkg-mp/` to `static/`:
   - `picoo_core.js`
   - `picoo_core_bg.wasm.br`
2. Initialize:

```typescript
import { createImageProcessor } from 'picoo';
import { toBytesFromPath, toTempPath } from 'picoo/io';

const img = await createImageProcessor({
  runtime: 'mp-weixin',
  wasmPath: '/static/picoo_core_bg.wasm.br',
});

// wx.chooseMedia → temp path → bytes
const input = await toBytesFromPath(tempFilePath);
const result = await img.process(input, { width: 1280, maxSizeKB: 200 });
const outPath = await toTempPath(result);
```

## Requirements

- WeChat base library ≥ 2.13 (WXWebAssembly)
- Recommended ≥ 2.15 for Worker support
- SIMD: WeChat ≥ 8.0.25

See `scripts/patch-mp-glue.js` for glue patching details.
