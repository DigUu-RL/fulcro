/**
 * Public entry point of the package, matching the `main` and `types` fields of
 * `package.json`.
 *
 * Listed one by one rather than re-exported wholesale, so that adding an export
 * to a module below is never enough on its own to put it in front of consumers.
 * The catalog in particular stays internal: a consumer reads a code from
 * `error.code` and its meaning from `docs/errors/`, never from the table.
 */
export { type CodedError, createError, type ErrorCode } from '@/createError';
export { prefixError } from '@/prefixError';
