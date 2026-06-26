import type { Runtime } from '../types.js';

export interface WasmBindings {
  init(moduleOrPath?: string | URL): Promise<void>;
  getImageInfo(input: Uint8Array): Promise<string>;
  processImage(input: Uint8Array, optsJson: string): Promise<{ data: Uint8Array; metaJson: string }>;
}

export interface RuntimeAdapter {
  runtime: Runtime;
  loadWasm(wasmPath?: string): Promise<WasmBindings>;
  createWorker(wasmPath?: string): Worker;
}
