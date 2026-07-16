/**
 * WeChat Worker entry for picoo.
 * Copied into miniprogram/workers/picoo/ by sync-miniprogram-example.mjs.
 *
 * Constraints:
 * - Can only require() files under workers/
 * - WASM file must live outside workers/ (passed as wasmPath string)
 * - TextEncoder/TextDecoder polyfill is inlined in picoo_core.js
 */
const picooCore = require('./picoo_core.js');

function resolveInit(mod) {
  let current = mod && mod.default !== undefined ? mod.default : mod;
  for (let i = 0; i < 3; i++) {
    if (typeof current === 'function') return current;
    if (current && typeof current === 'object' && 'default' in current) {
      current = current.default;
      continue;
    }
    break;
  }
  throw new Error('picoo_core init is not a function inside worker');
}

function asUint8Array(data) {
  if (data == null) {
    throw new Error('worker input is null/undefined');
  }
  if (data instanceof Uint8Array) return data;

  const tag = Object.prototype.toString.call(data);
  if (tag === '[object ArrayBuffer]') {
    return new Uint8Array(data);
  }
  if (tag === '[object Uint8Array]' || tag === '[object Uint8ClampedArray]') {
    return new Uint8Array(data.buffer, data.byteOffset || 0, data.byteLength);
  }
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  // WeChat may clone typed arrays as array-like plain objects.
  if (typeof data === 'object' && typeof data.length === 'number' && data.length >= 0) {
    return Uint8Array.from(data);
  }
  if (
    typeof data === 'object' &&
    typeof data.byteLength === 'number' &&
    data.buffer != null
  ) {
    return new Uint8Array(data.buffer, data.byteOffset || 0, data.byteLength);
  }

  throw new Error(`worker expected ArrayBuffer / Uint8Array input (got ${tag})`);
}

function toError(err) {
  if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
    return { code: String(err.code), message: String(err.message) };
  }
  return { code: 'UNKNOWN', message: err instanceof Error ? err.message : String(err) };
}

const initFn = resolveInit(picooCore);
const processImage = picooCore.process_image;
let wasmReady = null;

function ensureWasm(wasmPath) {
  if (!wasmReady) {
    if (!wasmPath || typeof wasmPath !== 'string') {
      throw new Error('mp-weixin worker requires string wasmPath');
    }
    wasmReady = Promise.resolve(initFn({ module_or_path: wasmPath })).then(() => undefined);
  }
  return wasmReady;
}

worker.onMessage(async function (msg) {
  if (!msg || typeof msg !== 'object') return;

  try {
    if (msg.type === 'init') {
      await ensureWasm(msg.wasmPath || msg.wasmUrl);
      worker.postMessage({ id: msg.id, type: 'ready' });
      return;
    }

    if (msg.type === 'process') {
      await ensureWasm(msg.wasmPath);
      const input = asUint8Array(msg.input);
      const output = processImage(input, JSON.stringify(msg.options || {}));
      const meta = JSON.parse(output.metaJson);
      const data = output.data;
      const buffer =
        data instanceof Uint8Array
          ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
          : data;
      output.free();
      worker.postMessage({
        id: msg.id,
        type: 'result',
        result: {
          data: buffer,
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
    worker.postMessage({
      id: msg && msg.id,
      type: 'error',
      error: toError(err),
    });
  }
});
