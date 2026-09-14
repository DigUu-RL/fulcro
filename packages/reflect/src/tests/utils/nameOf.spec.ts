import { describe, expect, it } from 'vitest';

import { nameOf } from '@/functions/utils/nameOf';

/** Shape carrying a property, a nested one, a method and an accessor. */
class User {
	email = 'a@b.c';
	profile = { theme: 'dark' };

	save(): void {}

	get displayName(): string {
		return this.email;
	}
}

/** Derived class, to check that the concrete name is the one reported. */
class Admin extends User {
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
		const email = 'a@b.c';
		const somethingElse = 1;

		expect(nameOf(() => email)).toBe('email');
		expect(nameOf(() => somethingElse)).toBe('somethingElse');
	});

	it('should name a property, reporting the last segment of the path', () => {
		const user = new User();

		expect(nameOf(() => user.email)).toBe('email');
		expect(nameOf(() => user.profile)).toBe('profile');
		expect(nameOf(() => user.profile.theme)).toBe('theme');
	});

	it('should name a method and an accessor', () => {
		const user = new User();

		expect(nameOf(() => user.save)).toBe('save');
		expect(nameOf(() => user.displayName)).toBe('displayName');
	});

	it('should name an indexed access', () => {
		const user = new User();

		expect(nameOf(() => user['email'])).toBe('email');
	});

	it('should name an optionally chained access', () => {
		const user: User | null = new User();

		expect(nameOf(() => user?.email)).toBe('email');
	});

	it('should name a class', () => {
		expect(nameOf(User)).toBe('User');
		expect(nameOf(Admin)).toBe('Admin');
	});

	it('should name a classic function accessor', () => {
		const user = new User();

		expect(
			nameOf(function () {
				return user.email;
			}),
		).toBe('email');
	});

	it('should fall back to the name of the callable when it is not an accessor', () => {
		function namedFunction(): number {
			return 1;
		}

		expect(nameOf(namedFunction)).toBe('namedFunction');
		expect(nameOf(() => 1)).toBe('(anonymous)');
		expect(nameOf(() => new User().save())).toBe('(anonymous)');
	});

	it('should fall back to the name of the type for a plain value', () => {
		expect(nameOf(42)).toBe('Number');
		expect(nameOf('x')).toBe('String');
		expect(nameOf(new User())).toBe('User');
		expect(nameOf(null)).toBe('null');
	});
});
