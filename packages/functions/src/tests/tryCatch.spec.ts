import { describe, expect, it } from 'vitest';

import { type Result, tryCatch } from '@/tryCatch';

describe('tryCatch', () => {
	it('should report a produced value as a success', async () => {
		const result: Result<number> = await tryCatch(Promise.resolve(42));

		expect(result.error).toBeNull();
		expect(result.data).toBe(42);
	});

	it('should report a rejection as a failure', async () => {
		const failure = new Error('rejected');
		const result: Result<number> = await tryCatch(Promise.reject(failure));

		expect(result.data).toBeNull();
		expect(result.error).toBe(failure);
	});

	it('should catch a synchronous throw in the callback form', async () => {
		// The promise form cannot cover this: the expression runs before
		// tryCatch does, so the throw escapes it entirely.
		const result: Result<string> = await tryCatch<string>(() => {
			throw new Error('thrown before any promise existed');
		});

		expect(result.data).toBeNull();
		expect((result.error as Error).message).toBe(
			'thrown before any promise existed',
		);
	});

	it('should run a callback that resolves asynchronously', async () => {
		const result = await tryCatch(async () => 'value');

		expect(result.error).toBeNull();
		expect(result.data).toBe('value');
	});

	it('should keep a thrown non-error exactly as it was thrown', async () => {
		const result: Result<number> = await tryCatch<number>(
			Promise.reject('a bare string'),
		);

		expect(result.data).toBeNull();
		expect(result.error).toBe('a bare string');
	});

	it.each([null, undefined])(
		'should keep %s from defeating the discriminant',
		async (thrown) => {
			// Storing a nullish throw as it came would make the failure read as
			// a success, since `error === null` is what tells the two apart.
			const result: Result<number> = await tryCatch<number>(
				Promise.reject(thrown),
			);

			expect(result.error).not.toBeNull();
			expect(result.error).toBeInstanceOf(Error);
			expect((result.error as Error).cause).toBe(thrown);
		},
	);

	it('should discriminate a falsy success from a failure', async () => {
		// `if (result.data)` reports every one of these as a failure, which is
		// why `error` is the discriminant and `data` is not.
		for (const falsy of [0, '', false, null]) {
			const result = await tryCatch(Promise.resolve(falsy));

			expect(result.error).toBeNull();
			expect(result.data).toBe(falsy);
		}
	});

	it('should narrow to the produced value once the error is ruled out', async () => {
		const result: Result<number> = await tryCatch(Promise.resolve(7));

		if (result.error !== null) {
			expect.unreachable('the operation succeeded');
			return;
		}

		// Reached only when the union narrowed: `data` is `number` here, not
		// `number | null`, and this assignment is what proves it.
		const value: number = result.data;

		expect(value).toBe(7);
	});
});
