import { describe, expect, it } from 'vitest';

import { type ByteCodec, createFixedLayout, requireRoom } from '@/src/fixedLayout';

/**
 * Behaviour suite for `createFixedLayout` and `requireRoom`.
 *
 * Every numeric type's `read` and `write`, and a struct's, are the room check
 * below in front of a codec. What is asserted here is that check: the view is
 * a `DataView`, the value fits at the offset, and a refusal leaves the bytes
 * as they were — so each type's own suite only has to assert its encoding.
 */

/**
 * The error a refusal is expected to throw: the class, the whole message, the
 * code the message starts with and the details it was made from, which
 * `toThrow` compares as well.
 *
 * @param error The expected error, its message starting with its code.
 * @param details The details the error is expected to carry.
 * @returns The same error, carrying that code and those details.
 */
const coded = <T extends Error>(error: T, details: Readonly<Record<string, unknown>>): T => {
	return Object.assign(error, {
		code: error.message.slice(0, 'FULCRO0000'.length),
		details,
	});
};

/** Four bytes holding one unsigned 32-bit number, little-endian. */
const word: ByteCodec<number> = {
	size: 4,
	alignment: 4,
	read: (view, offset) => view.getUint32(offset, true),
	write: (view, offset, value) => {
		view.setUint32(offset, value, true);
	},
};

const Word = createFixedLayout('Word', word);

describe('createFixedLayout', () => {
	it('should carry the size and the alignment of the codec, frozen', () => {
		expect(Word.layout).toEqual({ size: 4, alignment: 4 });
		expect(Object.isFrozen(Word.layout)).toBe(true);
	});

	it('should read back what it wrote, through the codec', () => {
		const view = new DataView(new ArrayBuffer(4));

		Word.write(view, 0, 0x01020304);

		expect(Word.read(view, 0)).toBe(0x01020304);
		expect(view.getUint8(0)).toBe(4);
	});

	it('should read and write at an offset inside a larger view, up to the last that fits', () => {
		const view = new DataView(new ArrayBuffer(12));

		Word.write(view, 8, 7);

		expect(Word.read(view, 8)).toBe(7);
		expect(view.getUint32(0, true)).toBe(0);
	});

	it('should refuse an offset the value does not fit at, and leave the bytes alone', () => {
		const bytes = new Uint8Array(8);
		const view = new DataView(bytes.buffer);

		expect(() => {
			Word.write(view, 6, 1);
		}).toThrow(
			coded(
				new RangeError(
					'FULCRO6018: Word.write: 4 bytes at offset 6 do not fit in a view of 8 bytes.',
				),
				{ operation: 'Word.write', size: 4, offset: 6, available: 8 },
			),
		);

		expect([...bytes].every((byte) => byte === 0)).toBe(true);
	});

	it.each([-1, 0.5, Number.NaN, Infinity])('should refuse the offset %s', (offset) => {
		const view = new DataView(new ArrayBuffer(8));

		expect(() => Word.read(view, offset)).toThrow(
			coded(
				new RangeError(
					`FULCRO6018: Word.read: 4 bytes at offset ${String(offset)} do not fit in a view of 8 bytes.`,
				),
				{ operation: 'Word.read', size: 4, offset, available: 8 },
			),
		);
	});

	it('should refuse anything but a DataView', () => {
		expect(() => Word.read(new Uint8Array(4) as unknown as DataView, 0)).toThrow(
			coded(new TypeError('FULCRO6017: Word.read: expected a DataView, received object.'), {
				operation: 'Word.read',
				received: 'object',
			}),
		);

		expect(() => {
			Word.write(null as unknown as DataView, 0, 1);
		}).toThrow(
			coded(new TypeError('FULCRO6017: Word.write: expected a DataView, received null.'), {
				operation: 'Word.write',
				received: 'null',
			}),
		);
	});
});

describe('requireRoom', () => {
	it('should accept a value ending exactly at the end of the view', () => {
		expect(() => {
			requireRoom('Word.read', 4, new DataView(new ArrayBuffer(4)), 0);
		}).not.toThrow();
	});

	it('should measure the view, not the buffer under it', () => {
		const view = new DataView(new ArrayBuffer(16), 8, 4);

		expect(() => {
			requireRoom('Word.read', 4, view, 0);
		}).not.toThrow();

		expect(() => {
			requireRoom('Word.read', 4, view, 4);
		}).toThrow(RangeError);
	});
});
