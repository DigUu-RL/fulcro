import { describe, expect, it } from 'vitest';

import { type ByteCodec, createFixedLayout } from '@/src/fixedLayout';
import { countingView } from '@/src/tests/countingView';

/**
 * Performance suite for `createFixedLayout`.
 *
 * What it adds in front of a codec is one check of the room, which reads the
 * view's length and nothing else. So the suite counts the codec's calls and the
 * view's accesses: one of each per value, and none at all for a value refused.
 */

/** Values read and written in the volume case. */
const VOLUME = 100_000;

/**
 * A codec of one unsigned 32-bit number that counts its calls.
 *
 * @returns The codec, and a function reading the count.
 */
const countingCodec = (): { codec: ByteCodec<number>; calls: () => number } => {
	let calls = 0;

	return {
		codec: {
			size: 4,
			alignment: 4,
			read: (view, offset): number => {
				calls++;

				return view.getUint32(offset, true);
			},
			write: (view, offset, value): void => {
				calls++;
				view.setUint32(offset, value, true);
			},
		},
		calls: () => calls,
	};
};

describe('createFixedLayout', () => {
	it('should call the codec once and touch the bytes once per value', () => {
		const { codec, calls } = countingCodec();
		const Word = createFixedLayout('Word', codec, 'Uint32');
		const { view, accesses } = countingView(4 * VOLUME);

		for (let index = 0; index < VOLUME; index++) Word.write(view, index * 4, index);
		for (let index = 0; index < VOLUME; index++) Word.read(view, index * 4);

		expect(calls()).toBe(2 * VOLUME);
		expect(accesses()).toBe(2 * VOLUME);
	});

	it('should neither call the codec nor touch the bytes for a value it refuses', () => {
		const { codec, calls } = countingCodec();
		const Word = createFixedLayout('Word', codec, 'Uint32');
		const { view, accesses } = countingView(4);

		expect(() => {
			Word.write(view, 1, 1);
		}).toThrow(RangeError);

		expect(calls()).toBe(0);
		expect(accesses()).toBe(0);
	});
});
