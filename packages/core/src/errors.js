export function isPicooError(value) {
    return (typeof value === 'object' &&
        value !== null &&
        'code' in value &&
        typeof value.code === 'string');
}
export function toPicooError(err) {
    if (isPicooError(err)) {
        return err;
    }
    const message = err instanceof Error ? err.message : String(err);
    const error = new Error(message);
    error.code = 'UNKNOWN';
    error.name = 'PicooError';
    return error;
}
