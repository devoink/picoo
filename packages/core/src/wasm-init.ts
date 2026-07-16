type WasmInitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

type WasmInitFn = (
  moduleOrPath?: { module_or_path: WasmInitInput | Promise<WasmInitInput> } | WasmInitInput | Promise<WasmInitInput>,
) => Promise<unknown>;

/**
 * Resolve wasm-pack's default init across ESM and CJS interop.
 * Bundlers may expose init as `fn`, `{ default: fn }`, or `{ default: { default: fn } }`.
 */
export function resolveWasmInitFn(initOrModule: unknown): WasmInitFn {
  let current: unknown = initOrModule;
  for (let i = 0; i < 3; i++) {
    if (typeof current === 'function') {
      return current as WasmInitFn;
    }
    if (current && typeof current === 'object' && 'default' in current) {
      current = (current as { default: unknown }).default;
      continue;
    }
    break;
  }
  throw new Error(
    `picoo WASM init is not a function (got ${current === null ? 'null' : typeof current})`,
  );
}

/** Call wasm-pack default init without deprecated positional args. */
export function initWasmModule(initFn: unknown, moduleOrPath?: string | URL): Promise<unknown> {
  const init = resolveWasmInitFn(initFn);
  if (moduleOrPath === undefined) {
    return init();
  }
  return init({ module_or_path: moduleOrPath });
}
