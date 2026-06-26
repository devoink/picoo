export type Format = 'jpeg' | 'png' | 'webp';
export type ResizeMode = 'inside' | 'cover' | 'contain' | 'fill' | 'outside';

export interface CropOptions {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProcessOptions {
  crop?: CropOptions;
  width?: number;
  height?: number;
  mode?: ResizeMode;
  format?: Format;
  quality?: number;
  maxSizeKB?: number;
  lossless?: boolean;
  dpi?: number;
  minQuality?: number;
  maxQuality?: number;
  targetSizeTolerance?: number;
  autoResize?: boolean;
  minWidth?: number;
  minHeight?: number;
  background?: string;
}

export interface ImageInfo {
  width: number;
  height: number;
  format: string;
  mimeType: string;
  size: number;
  hasAlpha: boolean;
  bitDepth?: number;
  dpi?: number;
  orientation?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}

export interface ProcessResult {
  data: Uint8Array;
  width: number;
  height: number;
  format: Format;
  mimeType: string;
  size: number;
  quality?: number;
}

export type BatchItem = Uint8Array | { input: Uint8Array; options?: ProcessOptions };

export interface BatchOptions {
  defaults?: ProcessOptions;
  onProgress?: (completed: number, total: number, result: ProcessResult, index: number) => void;
  onError?: 'stop' | 'skip';
}

export type Runtime = 'web' | 'mp-weixin';

export interface ProcessorOptions {
  runtime?: Runtime;
  wasmPath?: string;
}

export interface ImageProcessor {
  info(input: Uint8Array): Promise<ImageInfo>;
  infoBatch(inputs: Uint8Array[]): Promise<ImageInfo[]>;
  process(input: Uint8Array, options?: ProcessOptions): Promise<ProcessResult>;
  processBatch(items: BatchItem[], batchOptions?: BatchOptions): Promise<ProcessResult[]>;
  dispose(): void;
}

export interface PicooError extends Error {
  code: string;
}
