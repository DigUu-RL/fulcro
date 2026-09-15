/**
 * Public entry point of the package, matching the `main` and `types` fields of
 * `package.json`.
 *
 * It exposes the three type aware utilities together with the types describing
 * what they report. Every one of them has a runtime implementation, so the
 * package works on its own; its own transformer is what resolves the calls at
 * compile time, turning what the runtime can only guess — and, for
 * `defaultOf`, cannot answer at all — into an emitted literal.
 */
export * from '@/functions/utils';
