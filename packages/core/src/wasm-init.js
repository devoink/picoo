/** Call wasm-pack default init without deprecated positional args. */
export function initWasmModule(initFn, moduleOrPath) {
    if (moduleOrPath === undefined) {
        return initFn();
    }
    return initFn({ module_or_path: moduleOrPath });
}
