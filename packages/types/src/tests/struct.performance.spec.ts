import { afterEach, describe, expect, it, vi } from 'vitest';

import { SinglePrecisionFloat } from '@/src/singlePrecisionFloat';
import { struct } from '@/src/struct';
import { countingView } from '@/src/tests/countingView';
import { UnsignedInteger } from '@/src/unsignedInteger';

/**
 * Performance suite for `struct`.
 *
 * The promise of a struct is that its layout is decided once, when it is
 * declared, and that storing a value costs one access per field and nothing
 * else — no lookup of where a field goes, no conversion on the way. So the
 * suite counts accesses to the bytes, conversions and comparisons, and holds
 * a write to a ratio against the same accesses written by hand.
 */

const Vector3 = struct('Vector3', {
	x: SinglePrecisionFloat,
	y: SinglePrecisionFloat,
	z: SinglePrecisionFloat,
});

const Tagged = struct('Tagged', {
	tag: UnsignedInteger(8),
	position: Vector3,
	identifier: UnsignedInteger(128),
});

/** Values written in the volume cases. */
const VOLUME = 100_000;

afterEach(() => {
	vi.restoreAllMocks();
});

describe('struct', () => {
	it('should touch the bytes once per field to write and once to read', () => {
		const { view, accesses } = countingView(Vector3.layout.size);
		const value = Vector3.from({ x: 1, y: 2, z: 3 });

		Vector3.write(view, 0, value);

		expect(accesses()).toBe(3);

		Vector3.read(view, 0);

		expect(accesses()).toBe(6);
	});

	it('should count a nested struct as its own fields, and a 128-bit field as two halves', () => {
		const { view, accesses } = countingView(Tagged.layout.size);

		const value = Tagged.from({
			tag: 1,
			position: { x: 1, y: 2, z: 3 },
			identifier: 2n ** 100n,
		});

		Tagged.write(view, 0, value);

		// One for the tag, three for the vector, two for the identifier.
		expect(accesses()).toBe(6);
	});

	it('should write a hundred thousand values with exactly one access per field each', () => {
		const { view, accesses } = countingView(Vector3.layout.size * VOLUME);
		const value = Vector3.from({ x: 1, y: 2, z: 3 });

		for (let index = 0; index < VOLUME; index++) {
			Vector3.write(view, index * Vector3.layout.size, value);
		}

		expect(accesses()).toBe(VOLUME * 3);
	});

	it('should convert each field once, with its own descriptor', () => {
		const from = vi.spyOn(SinglePrecisionFloat, 'from');

		Vector3.from({ x: 1, y: 2, z: 3 });

		expect(from).toHaveBeenCalledTimes(3);
	});

	it('should not convert anything to read or write', () => {
		const from = vi.spyOn(SinglePrecisionFloat, 'from');
		const value = Vector3.from({ x: 1, y: 2, z: 3 });
		const view = new DataView(new ArrayBuffer(Vector3.layout.size));

		from.mockClear();
		Vector3.write(view, 0, value);
		Vector3.read(view, 0);

		expect(from).not.toHaveBeenCalled();
	});

	it('should stop comparing at the first field that differs', () => {
		const left = Vector3.from({ x: 1, y: 2, z: 3 });
		const right = Vector3.from({ x: 9, y: 2, z: 3 });
		const equals = vi.spyOn(SinglePrecisionFloat, 'equals');

		Vector3.equals(left, right);

		expect(equals).toHaveBeenCalledTimes(1);

		equals.mockClear();
		Vector3.equals(left, left);

		expect(equals).toHaveBeenCalledTimes(3);
	});

	it('should give a hundred thousand values their methods without a function object each', () => {
		const Point = struct(
			'Point',
			{ x: SinglePrecisionFloat, y: SinglePrecisionFloat },
			{
				length() {
					return Math.hypot(this.x, this.y);
				},
			},
		);

		const view = new DataView(new ArrayBuffer(Point.layout.size));
		const prototypes = new Set<object | null>();
		let ownFunctions = 0;

		Point.write(view, 0, Point.from({ x: 3, y: 4 }));

		for (let index = 0; index < VOLUME; index++) {
			const value = index % 2 === 0 ? Point.from({ x: 3, y: 4 }) : Point.read(view, 0);

			prototypes.add(Reflect.getPrototypeOf(value));

			for (const key of Reflect.ownKeys(value)) {
				if (typeof Object.getOwnPropertyDescriptor(value, key)?.value === 'function') {
					ownFunctions++;
				}
			}
		}

		expect(prototypes.size).toBe(1);
		expect(ownFunctions).toBe(0);
	});

	it('should touch the bytes as often with methods as without', () => {
		const Point = struct(
			'Point',
			{ x: SinglePrecisionFloat, y: SinglePrecisionFloat },
			{
				length() {
					return Math.hypot(this.x, this.y);
				},
			},
		);

		const { view, accesses } = countingView(Point.layout.size);

		Point.write(view, 0, Point.from({ x: 3, y: 4 }));
		Point.read(view, 0);

		expect(accesses()).toBe(4);
	});

	it('should cost a small multiple of writing the fields by hand', () => {
		const view = new DataView(new ArrayBuffer(Vector3.layout.size * VOLUME));
		const value = Vector3.from({ x: 1, y: 2, z: 3 });

		/**
		 * Times a loop of writes.
		 *
		 * @param write Write under measurement.
		 * @returns Milliseconds taken, never less than one.
		 */
		const timed = (write: (offset: number) => void): number => {
			const started: number = performance.now();

			for (let index = 0; index < VOLUME; index++) write(index * 12);

			return Math.max(performance.now() - started, 1);
		};

		const byHand = (offset: number): void => {
			view.setFloat32(offset, value.x, true);
			view.setFloat32(offset + 4, value.y, true);
			view.setFloat32(offset + 8, value.z, true);
		};

		const described = (offset: number): void => {
			Vector3.write(view, offset, value);
		};

		// Interleaved, with the fastest round of each side compared. These windows
		// last a few milliseconds, and one pause during a full run of the
		// workspace once outlasted the baseline thirty times over. Interference
		// only ever adds time, so the minimum is the one estimate it cannot reach,
		// while a write that really cost more would raise every round alike.
		const baselines: number[] = [];
		const measured: number[] = [];

		for (let round = 0; round < 5; round++) {
			baselines.push(timed(byHand));
			measured.push(timed(described));
		}

		expect(Math.min(...measured)).toBeLessThan(Math.min(...baselines) * 25);
	});
});
