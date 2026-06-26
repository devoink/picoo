import { webAdapter } from './adapters/web.js';
import { mpWeixinAdapter } from './adapters/mp-weixin.js';
import type { RuntimeAdapter } from './adapters/types.js';
import { resolveBatchOptions } from './batch.js';
import { toPicooError } from './errors.js';
import type {
  BatchItem,
  BatchOptions,
  ImageInfo,
  ImageProcessor,
  ProcessOptions,
  ProcessResult,
  ProcessorOptions,
} from './types.js';

type WorkerResponse =
  | { id: number; type: 'ready' }
  | { id: number; type: 'result'; result: ProcessResult }
  | { id: number; type: 'error'; error: { code: string; message: string } };

function getAdapter(options?: ProcessorOptions): RuntimeAdapter {
  const runtime = options?.runtime ?? 'web';
  if (runtime === 'mp-weixin') return mpWeixinAdapter;
  return webAdapter;
}

function parseImageInfo(json: string): ImageInfo {
  return JSON.parse(json) as ImageInfo;
}

class PicooProcessor implements ImageProcessor {
  private readonly adapter: RuntimeAdapter;
  private readonly wasmPath?: string;
  private worker: Worker | null = null;
  private workerReady: Promise<void> | null = null;
  private infoBindings: Awaited<ReturnType<RuntimeAdapter['loadWasm']>> | null = null;
  private nextId = 1;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(adapter: RuntimeAdapter, wasmPath?: string) {
    this.adapter = adapter;
    this.wasmPath = wasmPath;
  }

  async initialize(): Promise<void> {
    await this.ensureInfoBindings();
    await this.ensureWorker();
  }

  private async ensureInfoBindings() {
    if (!this.infoBindings) {
      this.infoBindings = await this.adapter.loadWasm(this.wasmPath);
    }
    return this.infoBindings;
  }

  private async ensureWorker(): Promise<Worker> {
    if (!this.worker) {
      this.worker = this.adapter.createWorker(this.wasmPath);
      const id = this.nextId++;
      this.workerReady = new Promise((resolve, reject) => {
        const handler = (event: MessageEvent<WorkerResponse>) => {
          if (event.data.id !== id) return;
          this.worker?.removeEventListener('message', handler);
          if (event.data.type === 'ready') resolve();
          else if (event.data.type === 'error') {
            const err = new Error(event.data.error.message) as Error & { code: string };
            err.code = event.data.error.code;
            reject(err);
          }
        };
        this.worker!.addEventListener('message', handler);
        this.worker!.postMessage({ id, type: 'init', wasmPath: this.wasmPath });
      });
    }
    await this.workerReady;
    return this.worker!;
  }

  private runInWorker<T>(fn: (worker: Worker, id: number) => Promise<T>): Promise<T> {
    const task = this.queue.then(async () => {
      const worker = await this.ensureWorker();
      const id = this.nextId++;
      return fn(worker, id);
    });
    this.queue = task.then(() => undefined).catch(() => undefined);
    return task;
  }

  async info(input: Uint8Array): Promise<ImageInfo> {
    const bindings = await this.ensureInfoBindings();
    const json = await bindings.getImageInfo(input);
    return parseImageInfo(json);
  }

  async infoBatch(inputs: Uint8Array[]): Promise<ImageInfo[]> {
    return Promise.all(inputs.map((input) => this.info(input)));
  }

  async process(input: Uint8Array, options: ProcessOptions = {}): Promise<ProcessResult> {
    const inputCopy = input.slice();
    return this.runInWorker(
      (worker, id) =>
        new Promise<ProcessResult>((resolve, reject) => {
          const handler = (event: MessageEvent<WorkerResponse>) => {
            if (event.data.id !== id) return;
            worker.removeEventListener('message', handler);
            if (event.data.type === 'result') resolve(event.data.result);
            else if (event.data.type === 'error') {
              const err = new Error(event.data.error.message) as Error & { code: string };
              err.code = event.data.error.code;
              reject(err);
            }
          };
          worker.addEventListener('message', handler);
          worker.postMessage(
            { id, type: 'process', input: inputCopy, options },
            { transfer: [inputCopy.buffer as ArrayBuffer] },
          );
        }),
    );
  }

  async processBatch(items: BatchItem[], batchOptions: BatchOptions = {}): Promise<ProcessResult[]> {
    const results: ProcessResult[] = [];
    const onError = batchOptions.onError ?? 'stop';

    for (let index = 0; index < items.length; index++) {
      const { input, options } = resolveBatchOptions(items[index], batchOptions.defaults);
      try {
        const result = await this.process(input, options);
        results.push(result);
        batchOptions.onProgress?.(index + 1, items.length, result, index);
      } catch (err) {
        if (onError === 'skip') {
          continue;
        }
        throw toPicooError(err);
      }
    }

    return results;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.workerReady = null;
    this.infoBindings = null;
  }
}

/** Create a singleton image processor with Worker-backed `process` and main-thread `info`. */
export async function createImageProcessor(options?: ProcessorOptions): Promise<ImageProcessor> {
  const adapter = getAdapter(options);
  const processor = new PicooProcessor(adapter, options?.wasmPath);
  await processor.initialize();
  return processor;
}

export type {
  BatchItem,
  BatchOptions,
  Format,
  ImageInfo,
  ImageProcessor,
  ProcessOptions,
  ProcessResult,
  ProcessorOptions,
  ResizeMode,
} from './types.js';
