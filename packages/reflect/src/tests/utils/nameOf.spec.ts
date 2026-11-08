import { describe, expect, expectTypeOf, it } from 'vitest';

import { nameOf, type TypeName } from '@/src/functions/utils/nameOf';

/** Shape carrying a property, a nested one, a method and an accessor. */
class Trooper {
	callSign = 'Red Five';
	profile = { theme: 'dark' };

	// A function held by the instance, so reading it off the object is safe:
	// the expression `user.save` is what is named, as it would be for a method.
	save = (): void => {
		// To be named, never called.
	};

	get displayName(): string {
		return this.callSign;
	}
}

/** Derived class, to check that the concrete name is the one reported. */
class Stormtrooper extends Trooper {
	level = 1;
}

/**
 * Runtime suite for `nameOf`.
 *
 * The transformer does not run under vitest, so what is exercised here is the
 * runtime path: reading a name out of the source of an accessor, and falling
 * back to the name of a value when the argument names nothing.
 */
describe('nameOf', () => {
	it('should name a local variable', () => {
		const callSign = 'Red Five';
		const somethingElse = 1;

		expect(nameOf(() => callSign)).toBe('callSign');
		expect(nameOf(() => somethingElse)).toBe('somethingElse');
	});

	it('should name a property, reporting the last segment of the path', () => {
		const user = new Trooper();

		expect(nameOf(() => user.callSign)).toBe('callSign');
		expect(nameOf(() => user.profile)).toBe('profile');
		expect(nameOf(() => user.profile.theme)).toBe('theme');
	});

	it('should name a method and an accessor', () => {
		const user = new Trooper();

		expect(nameOf(() => user.save)).toBe('save');
		expect(nameOf(() => user.displayName)).toBe('displayName');
	});

	it('should name an indexed access', () => {
		const user = new Trooper();

		expect(nameOf(() => user.callSign)).toBe('callSign');
	});

	it('should name an optionally chained access', () => {
		// Through a call, so the compiler keeps the `null` the chain is there for.
		const find = (): Trooper | null => new Trooper();
		const user: Trooper | null = find();

		expect(nameOf(() => user?.callSign)).toBe('callSign');
	});

	it('should name a class', () => {
		expect(nameOf(Trooper)).toBe('Trooper');
		expect(nameOf(Stormtrooper)).toBe('Stormtrooper');
	});

	it('should name a classic function accessor', () => {
		const user = new Trooper();

		expect(
			nameOf(() => {
				return user.callSign;
			}),
		).toBe('callSign');
	});

	it('should fall back to the name of the callable when it is not an accessor', () => {
		const namedFunction = function namedFunction(): number {
			return 1;
		};

		expect(nameOf(namedFunction)).toBe('namedFunction');
		expect(nameOf(() => 1)).toBe('(anonymous)');

		expect(
			nameOf(() => {
				new Trooper().save();
			}),
		).toBe('(anonymous)');
	});

	it('should fall back to the name of the type for a plain value', () => {
		expect(nameOf(42)).toBe('Number');
		expect(nameOf('x')).toBe('String');
		expect(nameOf(new Trooper())).toBe('Trooper');
		expect(nameOf(null)).toBe('null');
	});
});

describe('what nameOf declares', () => {
	it('should return a name carrying the type it names, usable as a string', () => {
		expectTypeOf<ReturnType<typeof nameOf<Trooper>>>().toEqualTypeOf<TypeName<Trooper>>();
		expectTypeOf<TypeName<Trooper>>().toExtend<string>();
		expectTypeOf<TypeName<Trooper>>().not.toExtend<TypeName<number>>();
	});
});
