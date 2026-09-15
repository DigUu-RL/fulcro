/**
 * Public entry point of the package, matching the `main` and `types` fields of
 * `package.json`.
 *
 * Listed one by one rather than re-exported wholesale, so that adding an export
 * to a module below is never enough on its own to put it in front of consumers.
 */
export { type ExhaustiveCases, type SwitchCase, switchFor } from '@/switchFor';
export { type Failure, type Result, type Success, tryCatch } from '@/tryCatch';
