import { describe, expect, it } from 'vitest';
import { resolveWasmInitFn } from './wasm-init.js';

describe('resolveWasmInitFn', () => {
  it('accepts a bare function', () => {
    const init = async () => 'ok';
    expect(resolveWasmInitFn(init)).toBe(init);
  });

  it('unwraps default export object', () => {
    const init = async () => 'ok';
    expect(resolveWasmInitFn({ default: init })).toBe(init);
  });

  it('unwraps nested CJS interop default', () => {
    const init = async () => 'ok';
    expect(resolveWasmInitFn({ default: { default: init, get_image_info: () => '' } })).toBe(init);
  });

  it('throws when init is missing', () => {
    expect(() => resolveWasmInitFn({ default: { get_image_info: () => '' } })).toThrow(
      /not a function/,
    );
  });
});
