import init, { get_image_info, process_image } from '../../pkg-mp/picoo_core.js';
import type { RuntimeAdapter, WasmBindings } from './types.js';
import { initWasmModule } from '../wasm-init.js';

const DEFAULT_WORKER_SCRIPT = 'workers/picoo/index.js';

type WorkerMessage =
  | { id: number; type: 'init'; wasmPath?: string; wasmUrl?: string }
  | { id: number; type: 'process'; input: Uint8Array; options: Record<string, unknown>; wasmPath?: string };

type WorkerReply =
  | { id: number; type: 'ready' }
  | {
      id: number;
      type: 'result';
      result: {
        data: Uint8Array;
        width: number;
        height: number;
        format: string;
        mimeType: string;
        size: number;
        quality?: number;
      };
    }
  | { id: number; type: 'error'; error: { code: string; message: string } };

type MessageListener = (event: MessageEvent<WorkerReply>) => void;

interface WxWorkerNative {
  postMessage(message: unknown): void;
  onMessage(listener: (message: WorkerReply) => void): void;
  terminate(): void;
}

interface WxGlobal {
  createWorker?: (
    scriptPath: string,
    options?: { useExperimentalWorker?: boolean },
  ) => WxWorkerNative;
}

function toError(err: unknown): { code: string; message: string } {
  if (typeof err === 'object' && err !== null && 'code' in err && 'message' in err) {
    const e = err as { code: string; message: string };
    return { code: String(e.code), message: String(e.message) };
  }
  return { code: 'UNKNOWN', message: err instanceof Error ? err.message : String(err) };
}

function createBindings(wasmPath: string): WasmBindings {
  let initPromise: Promise<void> | null = null;

  const ensureInit = async (moduleOrPath?: string | URL) => {
    if (!initPromise) {
      const path = typeof moduleOrPath === 'string' ? moduleOrPath : wasmPath;
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

function toStandaloneArrayBuffer(view: Uint8Array): ArrayBuffer {
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

function asUint8Array(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  const tag = Object.prototype.toString.call(data);
  if (tag === '[object ArrayBuffer]') {
    return new Uint8Array(data as ArrayBuffer);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (data && typeof data === 'object' && typeof (data as { length?: unknown }).length === 'number') {
    return Uint8Array.from(data as ArrayLike<number>);
  }
  throw new Error(`expected ArrayBuffer / Uint8Array (got ${tag})`);
}

/**
 * Bridge WeChat Worker (onMessage/postMessage) to the DOM Worker surface
 * used by PicooProcessor (addEventListener/postMessage/terminate).
 */
class WxWorkerBridge {
  private readonly native: WxWorkerNative;
  private readonly listeners = new Set<MessageListener>();

  constructor(native: WxWorkerNative) {
    this.native = native;
    this.native.onMessage((message) => {
      const normalized = normalizeWorkerReply(message);
      const event = { data: normalized } as MessageEvent<WorkerReply>;
      for (const listener of this.listeners) {
        listener(event);
      }
    });
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type !== 'message') return;
    this.listeners.add(listener as MessageListener);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type !== 'message') return;
    this.listeners.delete(listener as MessageListener);
  }

  postMessage(message: unknown, _options?: unknown): void {
    // WeChat Worker copies structured data; ArrayBuffer is the reliable binary type.
    this.native.postMessage(normalizeWorkerRequest(message));
  }

  terminate(): void {
    this.listeners.clear();
    this.native.terminate();
  }
}

function normalizeWorkerRequest(message: unknown): unknown {
  if (!message || typeof message !== 'object') return message;
  const msg = message as { type?: string; input?: unknown };
  if (msg.type !== 'process') return message;
  if (msg.input instanceof Uint8Array) {
    return { ...msg, input: toStandaloneArrayBuffer(msg.input) };
  }
  return message;
}

function normalizeWorkerReply(message: WorkerReply): WorkerReply {
  if (!message || message.type !== 'result' || !message.result) return message;
  try {
    return {
      ...message,
      result: {
        ...message.result,
        data: asUint8Array(message.result.data),
      },
    };
  } catch {
    return message;
  }
}

/** Fallback when wx.createWorker is unavailable — blocks the UI thread. */
class MpMainThreadWorker {
  private readonly wasmPath: string;
  private readonly listeners = new Set<MessageListener>();
  private bindings: WasmBindings | null = null;

  constructor(wasmPath: string) {
    this.wasmPath = wasmPath;
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type !== 'message') return;
    this.listeners.add(listener as MessageListener);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type !== 'message') return;
    this.listeners.delete(listener as MessageListener);
  }

  postMessage(message: unknown, _options?: unknown): void {
    void this.dispatch(message as WorkerMessage);
  }

  terminate(): void {
    this.listeners.clear();
    this.bindings = null;
  }

  private emit(data: WorkerReply): void {
    const event = { data } as MessageEvent<WorkerReply>;
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private async ensureBindings(wasmPath: string): Promise<WasmBindings> {
    if (!this.bindings) {
      this.bindings = createBindings(wasmPath);
      await this.bindings.init(wasmPath);
    }
    return this.bindings;
  }

  private async dispatch(msg: WorkerMessage): Promise<void> {
    try {
      if (msg.type === 'init') {
        const path = msg.wasmPath ?? msg.wasmUrl ?? this.wasmPath;
        if (typeof path !== 'string' || !path) {
          throw new Error('mp-weixin runtime requires wasmPath');
        }
        await this.ensureBindings(path);
        this.emit({ id: msg.id, type: 'ready' });
        return;
      }

      if (msg.type === 'process') {
        const bindings = await this.ensureBindings(this.wasmPath);
        const { data, metaJson } = await bindings.processImage(
          msg.input,
          JSON.stringify(msg.options ?? {}),
        );
        const meta = JSON.parse(metaJson) as {
          width: number;
          height: number;
          format: string;
          mimeType: string;
          size: number;
          quality?: number;
        };
        this.emit({
          id: msg.id,
          type: 'result',
          result: {
            data,
            width: meta.width,
            height: meta.height,
            format: meta.format,
            mimeType: meta.mimeType,
            size: meta.size,
            quality: meta.quality,
          },
        });
      }
    } catch (err) {
      this.emit({ id: msg.id, type: 'error', error: toError(err) });
    }
  }
}

function createWxOrMainWorker(wasmPath: string, workerScript: string): Worker {
  const wxGlobal = (globalThis as { wx?: WxGlobal }).wx;
  if (typeof wxGlobal?.createWorker === 'function') {
    try {
      const native = wxGlobal.createWorker(workerScript, {
        useExperimentalWorker: true,
      });
      return new WxWorkerBridge(native) as unknown as Worker;
    } catch (err) {
      console.warn(
        `[picoo] wx.createWorker("${workerScript}") failed; falling back to main thread`,
        err,
      );
    }
  } else {
    console.warn('[picoo] wx.createWorker unavailable; falling back to main thread');
  }
  return new MpMainThreadWorker(wasmPath) as unknown as Worker;
}

export interface MpWeixinAdapterOptions {
  /** Path passed to wx.createWorker (no leading slash). Default: workers/picoo/index.js */
  workerScript?: string;
}

/**
 * WeChat mini program adapter.
 * Requires `wasmPath` pointing to packaged `.wasm` or `.wasm.br` outside the workers/ directory.
 * `process` uses wx.createWorker by default (main-thread fallback if Worker is unavailable).
 */
export function createMpWeixinAdapter(options: MpWeixinAdapterOptions = {}): RuntimeAdapter {
  const workerScript = options.workerScript ?? DEFAULT_WORKER_SCRIPT;

  return {
    runtime: 'mp-weixin',

    async loadWasm(wasmPath?: string) {
      if (!wasmPath) {
        throw new Error(
          'mp-weixin runtime requires wasmPath (e.g. "/libs/picoo/picoo_core_bg.wasm.br")',
        );
      }
      const bindings = createBindings(wasmPath);
      await bindings.init(wasmPath);
      return bindings;
    },

    createWorker(wasmPath?: string) {
      if (!wasmPath) {
        throw new Error('mp-weixin runtime requires wasmPath for Worker');
      }
      return createWxOrMainWorker(wasmPath, workerScript);
    },
  };
}

export const mpWeixinAdapter = createMpWeixinAdapter();
