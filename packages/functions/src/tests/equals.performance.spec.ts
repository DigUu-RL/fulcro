import { describe, expect, it } from 'vitest';

import { equals } from '@/src/equals';

/**
 * Performance suite for `equals`.
 *
 * A comparison reads each value once on each side, stops at the first
 * difference, reads nothing of a value compared with itself, looks each entry
 * of a map or a set up once rather than against every other, and goes round a
 * structure that refers to itself once. All of it is asserted by counting —
 * fields read, lookups made — through inputs that count what is done to them.
 */

/** How many elements the wide inputs hold. */
const ELEMENTS = 100_000;

/** How many entries the maps and sets hold. */
const ENTRIES = 10_000;

/** How many nodes a ring has: deep enough to go round, not to exhaust the stack. */
const NODES = 1_000;

/** Counts the reads of every element of the arrays it made. */
interface Reads {
	count: number;
}

/**
 * @param reads Counter of reads, shared by every element.
 * @param differAt Index whose element holds a value of its own, if any.
 * @returns Elements whose one field counts how often it is read.
 */
const counted = (reads: Reads, differAt?: number): object[] => {
	return Array.from({ length: ELEMENTS }, (_, index) => {
		return {
			get value(): number {
				reads.count++;

				return index === differAt ? -1 : index;
			},
		};
	});
};

/** A map that counts how often it is asked for a key. */
class CountingMap<TKey, TValue> extends Map<TKey, TValue> {
	lookups = 0;

	override get(key: TKey): TValue | undefined {
		this.lookups++;

		return super.get(key);
	}

	override has(key: TKey): boolean {
		this.lookups++;

		return super.has(key);
	}
}

/** A set that counts how often it is asked for an element. */
class CountingSet<T> extends Set<T> {
	lookups = 0;

	override has(item: T): boolean {
		this.lookups++;

		return super.has(item);
	}
}

/** A node of a ring that counts how often its link is followed. */
interface Node {
	readonly id: number;
	readonly next: Node | undefined;
}

/**
 * @param reads Counter of the links followed.
 * @returns The first node of a ring of {@link NODES} nodes.
 */
const ring = (reads: Reads): Node | undefined => {
	const nodes: Node[] = [];

	for (let id = 0; id < NODES; id++) {
		nodes.push({
			id,
			get next(): Node | undefined {
				reads.count++;

				return nodes[(id + 1) % NODES];
			},
		});
	}

	return nodes[0];
};

describe('equals', () => {
	it('should read each element once on each side', () => {
		const reads: Reads = { count: 0 };

		expect(equals(counted(reads), counted(reads))).toBe(true);
		expect(reads.count).toBe(2 * ELEMENTS);
	});

	it('should stop at the first difference', () => {
		const reads: Reads = { count: 0 };

		expect(equals(counted(reads), counted(reads, 10))).toBe(false);
		// Elements 0 to 10, each read on both sides; the 99,989 after them,
		// never.
		expect(reads.count).toBe(2 * 11);
	});

	it('should read nothing of a value compared with itself', () => {
		const reads: Reads = { count: 0 };
		const elements: object[] = counted(reads);

		expect(equals(elements, elements)).toBe(true);
		expect(reads.count).toBe(0);
	});

	it('should look each key of a map up once', () => {
		const left = new CountingMap<number, number[]>();
		const right = new CountingMap<number, number[]>();

		for (let key = 0; key < ENTRIES; key++) {
			left.set(key, [key]);
			right.set(ENTRIES - 1 - key, [ENTRIES - 1 - key]);
		}

		expect(equals(left, right)).toBe(true);
		// Linear: one lookup per entry, never one per pair of entries.
		expect(right.lookups).toBe(ENTRIES);
		expect(left.lookups).toBe(0);
	});

	it('should look each element of a set up once', () => {
		const left = new CountingSet<number>();
		const right = new CountingSet<number>();

		for (let item = 0; item < ENTRIES; item++) {
			left.add(item);
			right.add(ENTRIES - 1 - item);
		}

		expect(equals(left, right)).toBe(true);
		expect(right.lookups).toBe(ENTRIES);
	});

	it('should stop looking keys up at the first that is missing', () => {
		const left = new CountingMap<number, number>();
		const right = new CountingMap<number, number>();

		for (let key = 0; key < ENTRIES; key++) {
			left.set(key, key);
			right.set(key === 0 ? -1 : key, key);
		}

		expect(equals(left, right)).toBe(false);
		// `get` of the first key, then `has` to tell a missing key from one
		// holding `undefined`.
		expect(right.lookups).toBe(2);
	});

	it('should go round a ring once on each side', () => {
		const reads: Reads = { count: 0 };

		expect(equals(ring(reads), ring(reads))).toBe(true);
		expect(reads.count).toBe(2 * NODES);
	});
});
