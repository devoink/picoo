#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# rustup installs cargo/wasm-pack under ~/.cargo/bin; load it when PATH is stale.
if [ -f "${CARGO_HOME:-$HOME/.cargo}/env" ]; then
  # shellcheck source=/dev/null
  . "${CARGO_HOME:-$HOME/.cargo}/env"
fi

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "ERROR: wasm-pack not found."
  echo "Install Rust (https://rustup.rs), then:"
  echo "  rustup target add wasm32-unknown-unknown"
  echo "  cargo install wasm-pack"
  echo "And ensure ~/.cargo/bin is on PATH (or restart the shell)."
  exit 1
fi

echo "==> Building WASM (web target)"
cd crates/picoo-core
RUSTFLAGS="-C target-feature=+simd128" \
  wasm-pack build --target web --release --out-dir ../../packages/core/pkg-web

# wasm-pack writes pkg-web/.gitignore with "*"; that also hides files from `npm pack`.
# Parent .gitignore already ignores packages/core/pkg-{web,mp}/ for git.
rm -f "$ROOT/packages/core/pkg-web/.gitignore"

WASM_FILE="$ROOT/packages/core/pkg-web/picoo_core_bg.wasm"

if command -v wasm-opt >/dev/null 2>&1; then
  echo "==> Optimizing WASM with wasm-opt"
  wasm-opt -Os --enable-simd --enable-bulk-memory --enable-sign-ext \
    --enable-nontrapping-float-to-int \
    "$WASM_FILE" -o "$WASM_FILE.opt"
  mv "$WASM_FILE.opt" "$WASM_FILE"
else
  echo "==> wasm-opt not found, skipping (wasm-pack wasm-opt already disabled)"
fi

echo "==> Copying pkg-mp and patching glue for WeChat"
rm -rf "$ROOT/packages/core/pkg-mp"
cp -r "$ROOT/packages/core/pkg-web" "$ROOT/packages/core/pkg-mp"
rm -f "$ROOT/packages/core/pkg-mp/.gitignore"
node "$ROOT/scripts/patch-mp-glue.js" "$ROOT/packages/core/pkg-mp"

echo "==> Generating test fixtures"
node "$ROOT/scripts/generate-fixtures.mjs"

echo "==> Building TypeScript"
cd "$ROOT/packages/core"
npm install
npm run build

if command -v brotli >/dev/null 2>&1; then
  echo "==> Compressing WASM for mini program"
  brotli -q 11 -f -o "$ROOT/packages/core/pkg-mp/picoo_core_bg.wasm.br" \
    "$ROOT/packages/core/pkg-mp/picoo_core_bg.wasm"
fi

echo "==> Running tests"
cargo test --manifest-path "$ROOT/Cargo.toml"
npm test

WASM_SIZE=$(wc -c < "$WASM_FILE" | tr -d ' ')
MAX_BYTES=1843200
echo "==> WASM size: ${WASM_SIZE} bytes (limit ${MAX_BYTES}, ~1.75 MiB)"
if [ "$WASM_SIZE" -gt "$MAX_BYTES" ]; then
  echo "ERROR: WASM exceeds size budget (${MAX_BYTES} bytes)"
  exit 1
fi

echo "==> Build complete"
