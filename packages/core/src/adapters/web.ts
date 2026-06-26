import init, { get_image_info, process_image } from '../../pkg-web/picoo_core.js';
import { initWasmModule } from '../wasm-init.js';
import type { RuntimeAdapter, WasmBindings } from './types.js';

function createBindings(wasmUrl: URL): WasmBindings {
  let initPromise: Promise<void> | null = null;

  const ensureInit = async (moduleOrPath?: string | URL) => {
    if (!initPromise) {
      const path = moduleOrPath ?? wasmUrl;
      initPromise = initWasmModule(init, path).then(() => undefined);
    }
    await initPromise;
  };

  return {
    init: ensureInit,
    async getImageInfo(input) {
      await ensureInit();
      return get_image_info(input);
    },
    async processImage(input, optsJson) {
      await ensureInit();
      const output = process_image(input, optsJson);
      const data = output.data;
      const metaJson = output.metaJson;
      output.free();
      return { data, metaJson };
    },
  };
}

export const webAdapter: RuntimeAdapter = {
  runtime: 'web',
  async loadWasm() {
    const wasmUrl = new URL('../../pkg-web/picoo_core_bg.wasm', import.meta.url);
    const bindings = createBindings(wasmUrl);
    await bindings.init(wasmUrl);
    return bindings;
  },
  createWorker() {
    return new Worker(new URL('../worker/picoo.worker.js', import.meta.url), { type: 'module' });
  },
};

export function resolvePkgWebUrl(relativePath: string): URL {
  return new URL(relativePath, import.meta.url);
}
