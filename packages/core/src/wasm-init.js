/**
 * Resolve wasm-pack's default init across ESM and CJS interop.
 * Bundlers may expose init as `fn`, `{ default: fn }`, or `{ default: { default: fn } }`.
 */
export function resolveWasmInitFn(initOrModule) {
  let current = initOrModule;
  for (let i = 0; i < 3; i++) {
    if (typeof current === 'function') {
      return current;
    }
    if (current && typeof current === 'object' && 'default' in current) {
      current = current.default;
      continue;
    }
    break;
  }
  throw new Error(
    `picoo WASM init is not a function (got ${current === null ? 'null' : typeof current})`,
  );
}

/** Call wasm-pack default init without deprecated positional args. */
export function initWasmModule(initFn, moduleOrPath) {
  const init = resolveWasmInitFn(initFn);
  if (moduleOrPath === undefined) {
    return init();
  }
  return init({ module_or_path: moduleOrPath });
}
