type WasmInitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

type WasmInitFn = (
  moduleOrPath?: { module_or_path: WasmInitInput | Promise<WasmInitInput> } | WasmInitInput | Promise<WasmInitInput>,
) => Promise<unknown>;

/** Call wasm-pack default init without deprecated positional args. */
export function initWasmModule(initFn: WasmInitFn, moduleOrPath?: string | URL): Promise<unknown> {
  if (moduleOrPath === undefined) {
    return initFn();
  }
  return initFn({ module_or_path: moduleOrPath });
}
