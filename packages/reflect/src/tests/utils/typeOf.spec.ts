import { describe, expect, it } from 'vitest';

import { typeOf } from '@/functions/utils/typeOf';

/** Class instance, which the native `typeof` reports as a plain object. */
class User {
	email = 'a@b.c';
	profile = { theme: 'dark' };

	save(): void {}

	get displayName(): string {
		return this.email;
	}
}

/** Derived class, to check the ancestry reported through the prototypes. */
class Admin extends User {
	level = 1;
}

/**
 * Runtime suite for `typeOf`.
 *
 * Several assertions pair the answer of the native `typeof` with the one given
 * here, because the worth of this function is exactly the distinctions the
 * native operator collapses.
 */
describe('typeOf', () => {
	it('should split every case the native typeof collapses into object', () => {
		expect(typeof null).toBe('object');
		expect(typeOf(null).typeId).toBe('null');

		expect(typeof []).toBe('object');
		expect(typeOf([]).typeId).toBe('array');

		expect(typeof new Date()).toBe('object');
		expect(typeOf(new Date()).typeId).toBe('date');

		expect(typeof /x/).toBe('object');
		expect(typeOf(/x/).typeId).toBe('regexp');

		expect(typeof new Map()).toBe('object');
		expect(typeOf(new Map()).typeId).toBe('map');

		expect(typeOf(new Set()).typeId).toBe('set');
		expect(typeOf(new WeakMap()).typeId).toBe('weak-map');
		expect(typeOf(new WeakSet()).typeId).toBe('weak-set');
		expect(typeOf(Promise.resolve()).typeId).toBe('promise');
		expect(typeOf(new Error('x')).typeId).toBe('error');
		expect(typeOf(new TypeError('x')).typeId).toBe('error');
		expect(typeOf(new Int8Array(1)).typeId).toBe('typed-array');
		expect(typeOf(new ArrayBuffer(1)).typeId).toBe('array-buffer');
		expect(typeOf(new DataView(new ArrayBuffer(1))).typeId).toBe('data-view');
	});

	it('should split every case the native typeof collapses into number', () => {
		expect(typeof NaN).toBe('number');
		expect(typeOf(NaN).typeId).toBe('nan');

		expect(typeOf(Infinity).typeId).toBe('infinity');
		expect(typeOf(-Infinity).typeId).toBe('infinity');
		expect(typeOf(42).typeId).toBe('integer');
		expect(typeOf(-0).typeId).toBe('integer');
		expect(typeOf(1.5).typeId).toBe('float');
	});

	it('should split every case the native typeof collapses into function', () => {
		expect(typeof User).toBe('function');
		expect(typeOf(User).typeId).toBe('class');

		expect(typeOf(() => 1).typeId).toBe('function');
		expect(typeOf(async () => 1).typeId).toBe('async-function');
		expect(typeOf(function* (): Generator<number> {}).typeId).toBe(
			'generator-function',
		);
		expect(typeOf(async function* (): AsyncGenerator<number> {}).typeId).toBe(
			'async-generator-function',
		);
	});

	it('should tell a plain object apart from a class instance', () => {
		expect(typeOf({}).typeId).toBe('plain-object');
		expect(typeOf(new User()).typeId).toBe('instance');
		expect(typeOf(Object.create(null)).typeId).toBe('null-prototype-object');
	});

	it('should tell a boxed primitive apart from its primitive', () => {
		expect(typeOf('x').typeId).toBe('string');
		expect(typeOf(new String('x')).typeId).toBe('boxed-primitive');
		expect(typeOf(new Number(1)).typeId).toBe('boxed-primitive');
	});

	it('should keep the remaining primitives distinguishable', () => {
		expect(typeOf(undefined).typeId).toBe('undefined');
		expect(typeOf(true).typeId).toBe('boolean');
		expect(typeOf(10n).typeId).toBe('bigint');
		expect(typeOf(Symbol('x')).typeId).toBe('symbol');
	});

	it('should report the concrete name of the type', () => {
		expect(typeOf(new User()).name).toBe('User');
		expect(typeOf(new Admin()).name).toBe('Admin');
		expect(typeOf(User).name).toBe('User');
		expect(typeOf([]).name).toBe('Array');
		expect(typeOf(42).name).toBe('Number');
		expect(typeOf(NaN).name).toBe('Number');
		expect(typeOf(null).name).toBe('null');
		expect(typeOf(undefined).name).toBe('undefined');
		expect(typeOf({}).name).toBe('Object');
		expect(typeOf(() => 1).name).toBe('(anonymous)');
		expect(typeOf(Object.create(null)).name).toBe('(null prototype)');
	});

	it('should report the ancestry of a value through its prototype chain', () => {
		expect(typeOf(new Admin()).lineage).toEqual(['Admin', 'User', 'Object']);
		expect(typeOf(new User()).lineage).toEqual(['User', 'Object']);
		expect(typeOf([]).lineage).toEqual(['Array', 'Object']);
		expect(typeOf(42).lineage).toEqual(['Number', 'Object']);
		expect(typeOf(null).lineage).toEqual([]);
		expect(typeOf(Object.create(null)).lineage).toEqual([]);
	});

	it('should classify values as primitive, nullish and iterable', () => {
		expect(typeOf(42).primitive).toBe(true);
		expect(typeOf({}).primitive).toBe(false);

		expect(typeOf(null).nullish).toBe(true);
		expect(typeOf(undefined).nullish).toBe(true);
		expect(typeOf(0).nullish).toBe(false);

		expect(typeOf([]).iterable).toBe(true);
		expect(typeOf('x').iterable).toBe(true);
		expect(typeOf(new Map()).iterable).toBe(true);
		expect(typeOf({}).iterable).toBe(false);
		expect(typeOf(null).iterable).toBe(false);
	});

	it('should narrow the value through the identifier', () => {
		const value: unknown = [1, 2, 3];
		const inspected = typeOf(value);

		// The identifier is a literal union, so it discriminates in a switch
		// without any cast.
		switch (inspected.typeId) {
			case 'array':
				expect(inspected.name).toBe('Array');
				break;
			default:
				throw new Error(`unexpected ${inspected.typeId}`);
		}
	});
});
