import { getEventListeners } from 'node:events';

import { describe, expect, it } from 'vitest';

import { type CancellationSource } from '@/@types/index.js';
import { createCancellationSource } from '@/cancellation/index.js';

/**
 * What a cancellation costs, counted rather than timed.
 *
 * The promise a source makes about cost is about what it keeps: a parent that
 * lives for the whole process hands out a child per request, and a child that
 * left its listener behind would grow the parent by one per request forever.
 * `getEventListeners` reads the parent's signal directly, so what is counted is
 * what the platform holds, not what this package believes it registered.
 */

/** Enough children that a leak of one each cannot hide in the noise. */
const CHILDREN = 1000;

/**
 * Five times the depth at which a cancellation reaching each generation from
 * inside the previous one's abort listener overflowed the stack, measured at
 * about two thousand: the leaf stayed live and the overflow surfaced only as an
 * uncaught exception.
 */
const DEPTH = 10_000;

describe('what a parent keeps', () => {
	it('should hold one listener per live child, and none once they are disposed', () => {
		const parent = createCancellationSource();

		const children: CancellationSource[] = Array.from(
			{ length: CHILDREN },
			() => createCancellationSource(parent.token),
		);

		expect(getEventListeners(parent.token.signal, 'abort')).toHaveLength(
			CHILDREN,
		);

		for (const child of children) child[Symbol.dispose]();

		expect(getEventListeners(parent.token.signal, 'abort')).toHaveLength(0);
	});

	it('should hold nothing for a registration disposed before the cancellation', () => {
		const source = createCancellationSource();

		for (let index = 0; index < CHILDREN; index++) {
			using _registration = source.token.onCancelled(() => {});
		}

		expect(getEventListeners(source.token.signal, 'abort')).toHaveLength(0);
	});

	it('should register nothing on a parent that is already cancelled', () => {
		const parent = createCancellationSource();

		parent.cancel();

		for (let index = 0; index < CHILDREN; index++) {
			createCancellationSource(parent.token);
		}

		expect(getEventListeners(parent.token.signal, 'abort')).toHaveLength(0);
	});
});

describe('what a cancellation does', () => {
	it('should call every handler exactly once, however often cancel is called', () => {
		const source = createCancellationSource();
		let calls = 0;

		for (let index = 0; index < CHILDREN; index++) {
			source.token.onCancelled(() => {
				calls++;
			});
		}

		source.cancel();
		source.cancel();
		source.cancel();

		expect(calls).toBe(CHILDREN);
	});

	it('should reach every descendant once, through a deep chain', () => {
		const root = createCancellationSource();
		let leaf: CancellationSource = root;
		let reached = 0;

		for (let depth = 0; depth < DEPTH; depth++) {
			leaf = createCancellationSource(leaf.token);

			leaf.token.onCancelled(() => {
				reached++;
			});
		}

		root.cancel();

		expect(reached).toBe(DEPTH);
		expect(leaf.token.isCancelled).toBe(true);
	});
});
