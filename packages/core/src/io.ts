import type { ProcessResult } from './types.js';

export async function toBytes(source: Blob | File): Promise<Uint8Array> {
  const buffer = await source.arrayBuffer();
  return new Uint8Array(buffer);
}

export function toBlob(result: ProcessResult): Blob {
  const copy = new Uint8Array(result.data);
  return new Blob([copy], { type: result.mimeType });
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
      success: (res) => {
        const data = res.data;
        if (data instanceof ArrayBuffer) {
          resolve(new Uint8Array(data));
        } else {
          reject(new Error('Expected ArrayBuffer from readFile'));
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
      encoding: 'binary',
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
        data: ArrayBuffer;
        encoding: string;
        success: () => void;
        fail: (err: { errMsg?: string }) => void;
      }): void;
    };
  }
}
