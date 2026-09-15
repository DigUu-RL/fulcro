/**
 * Entry point of the asynchronous half, reached as `@fulcro/collections/async`.
 *
 * Kept behind its own subpath rather than the main one so that a bundle
 * importing only the synchronous sequence carries none of it.
 */
export * from '@/@types/collections/async';

export { AsyncSequenceCollection } from '@/collections/async';
