import type { RuntimeAdapter, WasmBindings } from './types.js';
import { initWasmModule } from '../wasm-init.js';

/**
 * WeChat mini program adapter.
 * Requires `wasmPath` pointing to packaged `.wasm` or `.wasm.br` inside the mini program bundle.
 */
export const mpWeixinAdapter: RuntimeAdapter = {
  runtime: 'mp-weixin',

  async loadWasm(wasmPath?: string) {
    if (!wasmPath) {
      throw new Error('mp-weixin runtime requires wasmPath (e.g. "/static/picoo_core_bg.wasm.br")');
    }

    const mod = await import('../../pkg-mp/picoo_core.js');
    const init = mod.default as Parameters<typeof initWasmModule>[0];
    const get_image_info = mod.get_image_info as (input: Uint8Array) => string;
    const process_image = mod.process_image as (
      input: Uint8Array,
      optsJson: string,
    ) => { data: Uint8Array; metaJson: string; free(): void };

    await initWasmModule(init, wasmPath);

    const bindings: WasmBindings = {
      init: async (path) => {
        const resolved = typeof path === 'string' ? path : wasmPath;
        await initWasmModule(init, resolved);
      },
      async getImageInfo(input) {
        return get_image_info(input);
      },
      async processImage(input, optsJson) {
        const output = process_image(input, optsJson);
        const data = output.data;
        const metaJson = output.metaJson;
        output.free();
        return { data, metaJson };
      },
    };

    return bindings;
  },

  createWorker(wasmPath?: string) {
    if (!wasmPath) {
      throw new Error('mp-weixin runtime requires wasmPath for Worker');
    }
    const worker = new Worker(new URL('../worker/picoo.worker.js', import.meta.url));
    worker.postMessage({ type: 'init', wasmPath });
    return worker;
  },
};
