import type { BatchItem, ProcessOptions } from './types.js';

/** Shallow merge; `crop` is replaced entirely when present on item options. */
export function mergeProcessOptions(
  defaults: ProcessOptions | undefined,
  itemOptions: ProcessOptions | undefined,
): ProcessOptions {
  if (!defaults && !itemOptions) return {};
  if (!defaults) return { ...itemOptions! };
  if (!itemOptions) return { ...defaults };

  const merged: ProcessOptions = { ...defaults, ...itemOptions };
  if (itemOptions.crop !== undefined) {
    merged.crop = itemOptions.crop;
  }
  return merged;
}

export function normalizeBatchItem(item: BatchItem): { input: Uint8Array; options?: ProcessOptions } {
  if (item instanceof Uint8Array) {
    return { input: item };
  }
  return item;
}

export function resolveBatchOptions(
  item: BatchItem,
  defaults?: ProcessOptions,
): { input: Uint8Array; options: ProcessOptions } {
  const normalized = normalizeBatchItem(item);
  return {
    input: normalized.input,
    options: mergeProcessOptions(defaults, normalized.options),
  };
}
