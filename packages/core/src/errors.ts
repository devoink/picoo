import type { PicooError } from './types.js';

export function isPicooError(value: unknown): value is PicooError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof (value as PicooError).code === 'string'
  );
}

export function toPicooError(err: unknown): PicooError {
  if (isPicooError(err)) {
    return err;
  }
  const message = err instanceof Error ? err.message : String(err);
  const error = new Error(message) as PicooError;
  error.code = 'UNKNOWN';
  error.name = 'PicooError';
  return error;
}
