import init, { process_image } from '../../pkg-web/picoo_core.js';

interface ProcessOptions {
  crop?: { x: number; y: number; width: number; height: number };
  width?: number;
  height?: number;
  mode?: string;
  format?: string;
  quality?: number;
  maxSizeKB?: number;
  lossless?: boolean;
  dpi?: number;
}

interface ProcessResult {
  data: Uint8Array;
  width: number;
  height: number;
  format: string;
  mimeType: string;
  size: number;
  quality?: number;
}

type WorkerRequest =
  | { id: number; type: 'init'; wasmUrl?: string; wasmPath?: string }
  | { id: number; type: 'process'; input: Uint8Array; options: ProcessOptions };

type WorkerResponse =
  | { id: number; type: 'ready' }
  | { id: number; type: 'result'; result: ProcessResult }
  | { id: number; type: 'error'; error: { code: string; message: string } };

let wasmReady: Promise<void> | null = null;

async function ensureWasm(wasmUrl?: string, wasmPath?: string): Promise<void> {
  if (!wasmReady) {
    wasmReady = (async () => {
      const path = wasmPath ?? wasmUrl ?? new URL('../../pkg-web/picoo_core_bg.wasm', import.meta.url);
      await init({ module_or_path: path });
    })();
  }
  await wasmReady;
}

function parseProcessResult(data: Uint8Array, metaJson: string): ProcessResult {
  const meta = JSON.parse(metaJson) as Omit<ProcessResult, 'data'>;
  return {
    data,
    width: meta.width,
    height: meta.height,
    format: meta.format,
    mimeType: meta.mimeType,
    size: meta.size,
    quality: meta.quality,
  };
}

function transferableBuffer(view: Uint8Array): ArrayBuffer {
  if (
    view.buffer instanceof ArrayBuffer &&
    view.byteOffset === 0 &&
    view.byteLength === view.buffer.byteLength
  ) {
    return view.buffer;
  }
  if (view.buffer instanceof ArrayBuffer) {
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
  }
  return view.slice().buffer;
}

function toError(err: unknown): { code: string; message: string } {
  if (typeof err === 'object' && err !== null && 'code' in err && 'message' in err) {
    const e = err as { code: string; message: string };
    return { code: e.code, message: e.message };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { code: 'UNKNOWN', message };
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === 'init') {
    try {
      await ensureWasm(msg.wasmUrl, msg.wasmPath);
      const response: WorkerResponse = { id: msg.id, type: 'ready' };
      self.postMessage(response);
    } catch (err) {
      self.postMessage({ id: msg.id, type: 'error', error: toError(err) });
    }
    return;
  }

  if (msg.type === 'process') {
    try {
      await ensureWasm();
      const output = process_image(msg.input, JSON.stringify(msg.options));
      const result = parseProcessResult(output.data, output.metaJson);
      output.free();
      const response: WorkerResponse = { id: msg.id, type: 'result', result };
      self.postMessage(response, { transfer: [transferableBuffer(result.data)] });
    } catch (err) {
      self.postMessage({ id: msg.id, type: 'error', error: toError(err) });
    }
  }
};

export { };
