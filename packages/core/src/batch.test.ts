import { describe, expect, it } from 'vitest';
import { mergeProcessOptions, resolveBatchOptions } from './batch.js';

describe('mergeProcessOptions', () => {
  it('shallow merges top-level fields', () => {
    const merged = mergeProcessOptions(
      { maxSizeKB: 200, format: 'jpeg' },
      { width: 512 },
    );
    expect(merged).toEqual({ maxSizeKB: 200, format: 'jpeg', width: 512 });
  });

  it('replaces crop entirely from item options', () => {
    const merged = mergeProcessOptions(
      { crop: { x: 0, y: 0, width: 100, height: 100 }, maxSizeKB: 200 },
      { crop: { x: 10, y: 10, width: 80, height: 80 } },
    );
    expect(merged.crop).toEqual({ x: 10, y: 10, width: 80, height: 80 });
    expect(merged.maxSizeKB).toBe(200);
  });

  it('resolveBatchOptions uses defaults for plain Uint8Array', () => {
    const input = new Uint8Array([1, 2, 3]);
    const resolved = resolveBatchOptions(input, { format: 'webp' });
    expect(resolved.input).toBe(input);
    expect(resolved.options.format).toBe('webp');
  });
});
