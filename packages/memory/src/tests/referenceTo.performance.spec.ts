import { describe, expect, it } from 'vitest';

import type { MemoryReference } from '@/memoryReference';
import { referenceTo } from '@/referenceTo';

/**
 * Performance suite for `referenceTo`.
 *
 * Counted, never timed (`docs/testing.md`). The values are proxies that count
 * every access made to them: a reference holds a value as it is and never
 * looks inside it — not to copy it, not to compare it — so the count stays at
 * zero however often it is read and replaced.
 */

/** Enough accesses for a per-access cost to show. */
const VOLUME = 100_000;

/**
 * A settings object that counts how often anything inside it is touched.
 *
 * @param touches Counter to increment.
 * @returns The settings, behind a counting proxy.
 */
const watchedSettings = (touches: { count: number }): object =>
	new Proxy(
		{ verbose: true, level: 3 },
		{
			get: (target, key, receiver) => {
				touches.count++;

				return Reflect.get(target, key, receiver);
			},
			ownKeys: (target) => {
				touches.count += 1_000;

				return Reflect.ownKeys(target);
			},
			getPrototypeOf: (target) => {
				touches.count++;

				return Reflect.getPrototypeOf(target);
			},
		},
	);

describe('referenceTo, counted', () => {
	it('should not look inside the value it holds, however often it is used', () => {
		const touches = { count: 0 };
		const reference: MemoryReference<object> = referenceTo(
			watchedSettings(touches),
		);

		for (let round = 0; round < VOLUME; round++) {
			reference.set(reference.get());
		}

		expect(touches.count).toBe(0);
	});
});
