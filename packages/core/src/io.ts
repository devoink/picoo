import type { ProcessResult } from './types.js';

export async function toBytes(source: Blob | File): Promise<Uint8Array> {
  const buffer = await source.arrayBuffer();
  return new Uint8Array(buffer);
}

export function toBlob(result: ProcessResult): Blob {
  const copy = new Uint8Array(result.data);
  return new Blob([copy], { type: result.mimeType });
}

function isArrayBufferLike(value: unknown): value is ArrayBuffer {
  if (value instanceof ArrayBuffer) return true;
  // WeChat may return ArrayBuffer from another JS realm; instanceof fails there.
  return Object.prototype.toString.call(value) === '[object ArrayBuffer]';
}

function toUint8ArrayFromWxRead(data: unknown): Uint8Array {
  if (isArrayBufferLike(data)) {
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  throw new Error(
    `Expected ArrayBuffer from readFile (got ${data === null ? 'null' : typeof data})`,
  );
}

/** WeChat mini program: read file from local path via wx.getFileSystemManager */
export function toBytesFromPath(path: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const wxGlobal = (globalThis as { wx?: WechatMiniprogram.Wx }).wx;
    if (!wxGlobal?.getFileSystemManager) {
      reject(new Error('wx.getFileSystemManager is not available'));
      return;
    }
    wxGlobal.getFileSystemManager().readFile({
      filePath: path,
      // omit encoding → binary ArrayBuffer (WeChat default)
      success: (res) => {
        try {
          resolve(toUint8ArrayFromWxRead(res.data));
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      },
      fail: (err) => reject(new Error(err.errMsg ?? 'readFile failed')),
    });
  });
}

/** WeChat mini program: write ProcessResult to a temp file path */
export function toTempPath(result: ProcessResult): Promise<string> {
  return new Promise((resolve, reject) => {
    const wxGlobal = (globalThis as { wx?: WechatMiniprogram.Wx }).wx;
    if (!wxGlobal?.getFileSystemManager) {
      reject(new Error('wx.getFileSystemManager is not available'));
      return;
    }
    const filePath = `${wxGlobal.env?.USER_DATA_PATH ?? ''}/picoo_${Date.now()}.${result.format}`;
    const buffer = result.data.buffer.slice(
      result.data.byteOffset,
      result.data.byteOffset + result.data.byteLength,
    ) as ArrayBuffer;
    wxGlobal.getFileSystemManager().writeFile({
      filePath,
      data: buffer,
      success: () => resolve(filePath),
      fail: (err) => reject(new Error(err.errMsg ?? 'writeFile failed')),
    });
  });
}

declare namespace WechatMiniprogram {
  interface Wx {
    env?: { USER_DATA_PATH: string };
    getFileSystemManager(): {
      readFile(opts: {
        filePath: string;
        success: (res: { data: ArrayBuffer | string }) => void;
        fail: (err: { errMsg?: string }) => void;
      }): void;
      writeFile(opts: {
        filePath: string;
        data: ArrayBuffer | string;
        encoding?: string;
        success: () => void;
        fail: (err: { errMsg?: string }) => void;
      }): void;
    };
  }
}
