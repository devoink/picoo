/**
 * Minimal TextEncoder / TextDecoder for WeChat mini program (real devices
 * often lack these globals; wasm-bindgen glue needs them at module load).
 */
(function (global) {
  if (typeof global.TextEncoder === 'function' && typeof global.TextDecoder === 'function') {
    return;
  }

  function TextEncoder() {}
  TextEncoder.prototype.encode = function encode(input) {
    const str = input == null ? '' : String(input);
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      let code = str.charCodeAt(i);
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code < 0xd800 || code >= 0xe000) {
        bytes.push(
          0xe0 | (code >> 12),
          0x80 | ((code >> 6) & 0x3f),
          0x80 | (code & 0x3f),
        );
      } else {
        i += 1;
        code = 0x10000 + (((code & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
        bytes.push(
          0xf0 | (code >> 18),
          0x80 | ((code >> 12) & 0x3f),
          0x80 | ((code >> 6) & 0x3f),
          0x80 | (code & 0x3f),
        );
      }
    }
    return new Uint8Array(bytes);
  };

  function TextDecoder(_label, _options) {}
  TextDecoder.prototype.decode = function decode(input) {
    if (input == null) return '';
    const bytes =
      input instanceof Uint8Array
        ? input
        : new Uint8Array(
            input.buffer || input,
            input.byteOffset || 0,
            input.byteLength != null ? input.byteLength : input.length,
          );
    if (bytes.byteLength === 0) return '';

    let out = '';
    let i = 0;
    while (i < bytes.length) {
      const c = bytes[i++];
      if (c < 0x80) {
        out += String.fromCharCode(c);
      } else if (c < 0xe0) {
        const c2 = bytes[i++];
        out += String.fromCharCode(((c & 0x1f) << 6) | (c2 & 0x3f));
      } else if (c < 0xf0) {
        const c2 = bytes[i++];
        const c3 = bytes[i++];
        out += String.fromCharCode(((c & 0x0f) << 12) | ((c2 & 0x3f) << 6) | (c3 & 0x3f));
      } else {
        const c2 = bytes[i++];
        const c3 = bytes[i++];
        const c4 = bytes[i++];
        let code =
          ((c & 0x07) << 18) | ((c2 & 0x3f) << 12) | ((c3 & 0x3f) << 6) | (c4 & 0x3f);
        code -= 0x10000;
        out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
      }
    }
    return out;
  };

  if (typeof global.TextEncoder !== 'function') {
    global.TextEncoder = TextEncoder;
  }
  if (typeof global.TextDecoder !== 'function') {
    global.TextDecoder = TextDecoder;
  }
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof self !== 'undefined'
      ? self
      : Function('return this')(),
);

module.exports = {};
