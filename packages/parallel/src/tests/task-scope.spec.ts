import process from 'node:process';

import { describe, expect, expectTypeOf, it } from 'vitest';

import { isFulcroError } from '@fulcro/errors';
import { type Result } from '@fulcro/functions';

import { type Task, type TaskScope } from '@/@types/index.js';
import { createCancellationSource } from '@/cancellation/index.js';
import { createTaskScope } from '@/task/index.js';

import { controlledWork, flush } from './controlled-work.js';

/**
 * Task scope suite.
 *
 * Most cases drive `controlled-work.ts`, which stays pending until the case
 * settles it, so the order of events is the one the case wrote down rather
 * than the one a timer happened to produce.
 */

/**
 * Reads a promise's rejection, failing the case when it resolves instead.
 *
 * @param pending The promise expected to reject.
 * @returns What it rejected with.
 */
const rejectionOf = async (pending: PromiseLike<unknown>): Promise<unknown> => {
	try {
		await pending;
	} catch (error) {
		return error;
	}

	throw new Error('expected a rejection, and the promise resolved');
};

describe('spawn', () => {
	it('should give the value the work produces, awaited or settled', async () => {
		const scope = createTaskScope();
		const task: Task<number> = scope.spawn(() => Promise.resolve(42));

		expect(await task).toBe(42);
		expect((await task.settled).isSuccess()).toBe(true);

		await scope.join();
	});

	it('should accept work that returns a plain value', async () => {
		const scope = createTaskScope();

		expect(await scope.spawn(() => 'plain')).toBe('plain');

		await scope.join();
	});

	it('should not start the work during the call itself', async () => {
		const scope = createTaskScope();
		const work = controlledWork<number>();

		scope.spawn(work.work);

		expect(work.started()).toBe(false);

		await flush();

		expect(work.started()).toBe(true);

		work.succeed(1);
		await scope.join();
	});

	it('should hand the work a token that follows the scope', async () => {
		const scope = createTaskScope();
		const work = controlledWork<number>();
		const task = scope.spawn(work.work);

		await flush();
		scope.cancel('stop');

		expect(work.token()?.isCancelled).toBe(true);
		expect(work.token()?.reason).toBe('stop');
		expect(task.token).toBe(work.token());

		await rejectionOf(scope.join());
	});

	it('should read a synchronous throw as the task failing', async () => {
		const scope = createTaskScope();
		const error = new Error('thrown at once');

		const task = scope.spawn(() => {
			throw error;
		});

		expect(await rejectionOf(task)).toBe(error);
		expect(await rejectionOf(scope.join())).toBe(error);
	});

	it.each([undefined, null])(
		'should report a rejection with %s as one FULCRO3013 everywhere',
		async (thrown) => {
			const scope = createTaskScope();
			const sibling = scope.spawn(controlledWork<number>().work);

			const task = scope.spawn(() => Promise.reject(thrown));
			const settled: Result<unknown, unknown> = await task.settled;
			const failure: unknown = settled.isFailure() ? settled.error : undefined;

			expect(isFulcroError(failure, 'FULCRO3013')).toBe(true);

			expect(failure).toMatchObject({
				details: { operation: 'spawn', thrown },
				cause: thrown,
			});

			expect(await rejectionOf(task)).toBe(failure);
			expect(await rejectionOf(scope.join())).toBe(failure);
			expect(sibling.token.reason).toBe(failure);
		},
	);

	it('should throw the same FULCRO3013 from a dispose nobody joined', async () => {
		let failure: unknown;

		const leaving = async (): Promise<void> => {
			await using scope = createTaskScope();

			failure = await scope.spawn(() => Promise.reject(undefined)).settled;
		};

		const thrown: unknown = await rejectionOf(leaving());

		expect(isFulcroError(thrown, 'FULCRO3013')).toBe(true);
		expect(failure).toMatchObject({ error: thrown });
	});
});

describe('join', () => {
	it('should resolve once every task has, in any order', async () => {
		const scope = createTaskScope();
		const first = controlledWork<string>();
		const second = controlledWork<string>();

		scope.spawn(first.work);
		scope.spawn(second.work);

		let joined = false;

		const joining = scope.join().then(() => {
			joined = true;
		});

		await flush();
		second.succeed('b');
		await flush();

		expect(joined).toBe(false);

		first.succeed('a');
		await joining;

		expect(joined).toBe(true);
	});

	it('should wait for a task spawned by another task while joining', async () => {
		const scope = createTaskScope();
		const child = controlledWork<number>();
		let childTask: Task<number> | undefined;

		scope.spawn(async () => {
			await flush();
			childTask = scope.spawn(child.work);
		});

		let joined = false;

		const joining = scope.join().then(() => {
			joined = true;
		});

		await flush();
		await flush();

		expect(childTask).toBeDefined();
		expect(joined).toBe(false);

		child.succeed(7);
		await joining;

		expect(await childTask).toBe(7);
	});

	it('should resolve at once for an empty scope', async () => {
		await expect(createTaskScope().join()).resolves.toBeUndefined();
	});

	it('should close the scope, so a later spawn throws FULCRO3011', async () => {
		const scope = createTaskScope();

		await scope.join();

		expect(() => scope.spawn(() => 1)).toThrow(
			expect.objectContaining({
				code: 'FULCRO3011',
				details: { operation: 'spawn' },
			}),
		);
	});

	it('should report the same outcome to a second call', async () => {
		const scope = createTaskScope();
		const error = new Error('once');

		scope.spawn(() => Promise.reject(error));

		expect(await rejectionOf(scope.join())).toBe(error);
		expect(await rejectionOf(scope.join())).toBe(error);
	});

	// The window this closes: the last task settling wakes `join`, and code
	// resumed by that same settlement runs before `join` does. A spawn from
	// there must either be waited for or refused — never accepted by a scope
	// whose `join` has already stopped waiting.
	it.each([0, 1, 2, 3])(
		'should wait for or refuse a spawn made %s awaits after the last task settles',
		async (awaits) => {
			const scope = createTaskScope();
			const last = scope.spawn(() => 1);
			const late = controlledWork<number>();

			let joined = false;

			const joining: Promise<void> = scope.join().then(() => {
				joined = true;
			});

			let accepted = false;

			await (async (): Promise<void> => {
				let value: unknown = await last;

				for (let index = 0; index < awaits; index++) value = await value;

				try {
					scope.spawn(late.work);
					accepted = true;
				} catch (error) {
					expect(error).toMatchObject({ code: 'FULCRO3011' });
				}
			})();

			await flush();

			expect(accepted && joined).toBe(false);

			late.succeed(2);
			await joining;
		},
	);
});

describe('the first failure', () => {
	it('should call every other task off with that failure as the reason', async () => {
		const scope = createTaskScope();
		const failing = controlledWork<number>();
		const sibling = controlledWork<number>();
		const error = new Error('broken');

		scope.spawn(failing.work);
		const siblingTask = scope.spawn(sibling.work);

		await flush();
		failing.fail(error);

		expect(await rejectionOf(scope.join())).toBe(error);
		expect(sibling.token()?.isCancelled).toBe(true);
		expect(sibling.token()?.reason).toBe(error);
		expect(await rejectionOf(siblingTask)).toBe(error);
	});

	it('should never start the tasks still waiting for their turn', async () => {
		const scope = createTaskScope({ concurrency: 1 });
		const failing = controlledWork<number>();
		const waiting = controlledWork<number>();
		const error = new Error('broken');

		scope.spawn(failing.work);
		const waitingTask = scope.spawn(waiting.work);

		await flush();
		failing.fail(error);

		await rejectionOf(scope.join());

		expect(waiting.started()).toBe(false);
		expect(await rejectionOf(waitingTask)).toBe(error);
	});

	it('should keep the first failure when the cancelled siblings reject with errors of their own', async () => {
		const scope = createTaskScope();
		const first = new Error('first');

		scope.spawn(() => Promise.reject(first));

		scope.spawn(
			(token) =>
				new Promise((_resolve, reject) => {
					token.onCancelled(() => reject(new Error('answering the cancel')));
				}),
		);

		expect(await rejectionOf(scope.join())).toBe(first);
	});

	it('should leave a sibling that finishes anyway with its value', async () => {
		const scope = createTaskScope();
		const failing = controlledWork<number>();
		const stubborn = controlledWork<number>({ honoursCancellation: false });

		scope.spawn(failing.work);
		const stubbornTask = scope.spawn(stubborn.work);

		await flush();
		failing.fail(new Error('broken'));
		stubborn.succeed(5);

		await rejectionOf(scope.join());

		expect(await stubbornTask).toBe(5);
	});
});

describe('task.cancel', () => {
	it('should read a failure as a cancellation when the call lands in the same turn', async () => {
		const scope = createTaskScope();
		const work = controlledWork<number>({ honoursCancellation: false });
		const error = new Error('raced');
		const task = scope.spawn(work.work);

		await flush();
		work.fail(error);
		task.cancel('in the same turn');

		await expect(scope.join()).resolves.toBeUndefined();
		expect(await rejectionOf(task)).toBe(error);
	});

	it('should not fail the scope when the running task rejects in answer', async () => {
		const scope = createTaskScope();
		const cancelled = controlledWork<number>();
		const sibling = controlledWork<number>();

		const task = scope.spawn(cancelled.work);
		scope.spawn(sibling.work);

		await flush();
		task.cancel('only this one');
		sibling.succeed(2);

		await expect(scope.join()).resolves.toBeUndefined();
		expect(await rejectionOf(task)).toBe('only this one');
		expect(sibling.token()?.isCancelled).toBe(false);
	});

	it('should never start a task called off while waiting, and give its place up', async () => {
		const scope = createTaskScope({ concurrency: 1 });
		const running = controlledWork<number>();
		const waiting = controlledWork<number>();
		const next = controlledWork<number>();

		scope.spawn(running.work);
		const waitingTask = scope.spawn(waiting.work);
		scope.spawn(next.work);

		waitingTask.cancel('not needed');

		expect(await rejectionOf(waitingTask)).toBe('not needed');

		running.succeed(1);
		await flush();

		expect(waiting.started()).toBe(false);
		expect(next.started()).toBe(true);

		next.succeed(3);
		await scope.join();
	});

	it('should never start a task called off in the same breath as it was spawned', async () => {
		const scope = createTaskScope();
		const work = controlledWork<number>();

		scope.spawn(work.work).cancel();

		await scope.join();

		expect(work.started()).toBe(false);
	});

	it('should settle a cancelled task as a failure carrying the reason', async () => {
		const scope = createTaskScope();
		const task = scope.spawn(controlledWork<number>().work);

		task.cancel('why');

		const settled = await task.settled;

		expect(settled.isFailure() && settled.error).toBe('why');

		await scope.join();
	});
});

describe('scope.cancel', () => {
	it('should make join reject with the reason, and tell every running task', async () => {
		const scope = createTaskScope();
		const work = controlledWork<number>();

		scope.spawn(work.work);
		await flush();
		scope.cancel('enough');

		expect(await rejectionOf(scope.join())).toBe('enough');
		expect(work.token()?.reason).toBe('enough');
	});

	it('should hand a task spawned afterwards the reason without starting it', async () => {
		const scope = createTaskScope();
		const work = controlledWork<number>();

		scope.cancel('already');

		const task = scope.spawn(work.work);

		expect(await rejectionOf(task)).toBe('already');
		expect(work.started()).toBe(false);

		await rejectionOf(scope.join());
	});

	it('should follow the token it was created with', async () => {
		const parent = createCancellationSource();
		const scope = createTaskScope({ token: parent.token });
		const work = controlledWork<number>();

		scope.spawn(work.work);
		await flush();
		parent.cancel('from outside');

		expect(await rejectionOf(scope.join())).toBe('from outside');
	});
});

describe('await using', () => {
	it('should call off what is still running, and wait for it, when the scope ends', async () => {
		const work = controlledWork<number>();
		let token: TaskScope['token'] | undefined;

		{
			await using scope = createTaskScope();

			scope.spawn(work.work);
			token = scope.token;
			await flush();
		}

		expect(token?.isCancelled).toBe(true);
		expect(work.token()?.isCancelled).toBe(true);
	});

	it('should throw a failure nobody joined', async () => {
		const error = new Error('unseen');

		const leaving = async (): Promise<void> => {
			await using scope = createTaskScope();

			scope.spawn(() => Promise.reject(error));
			await flush();
		};

		expect(await rejectionOf(leaving())).toBe(error);
	});

	it('should not throw a failure join already reported', async () => {
		const error = new Error('seen');
		let joinedWith: unknown;

		const leaving = async (): Promise<void> => {
			await using scope = createTaskScope();

			scope.spawn(() => Promise.reject(error));
			joinedWith = await rejectionOf(scope.join());
		};

		await expect(leaving()).resolves.toBeUndefined();
		expect(joinedWith).toBe(error);
	});

	it('should not throw for its own cancellation of the tasks still running', async () => {
		const leaving = async (): Promise<void> => {
			await using scope = createTaskScope();

			scope.spawn(controlledWork<number>().work);
			await flush();
		};

		await expect(leaving()).resolves.toBeUndefined();
	});

	it('should close the scope', async () => {
		const scope = createTaskScope();

		await scope[Symbol.asyncDispose]();

		expect(() => scope.spawn(() => 1)).toThrow(
			expect.objectContaining({ code: 'FULCRO3011' }),
		);
	});
});

describe('a task nobody awaits', () => {
	it('should not become an unhandled rejection', async () => {
		const unhandled: unknown[] = [];

		const listener = (reason: unknown): void => {
			unhandled.push(reason);
		};

		process.on('unhandledRejection', listener);

		try {
			const scope = createTaskScope();

			scope.spawn(() => Promise.reject(new Error('dropped')));
			scope.spawn(controlledWork<number>().work);

			await rejectionOf(scope.join());
			await flush();
		} finally {
			process.off('unhandledRejection', listener);
		}

		expect(unhandled).toEqual([]);
	});
});

describe('concurrency', () => {
	it.each([0, -1, 1.5, Number.NaN])(
		'should refuse %s with FULCRO3012',
		(concurrency) => {
			expect(() => createTaskScope({ concurrency })).toThrow(
				expect.objectContaining({
					code: 'FULCRO3012',
					name: 'RangeError',
					details: { operation: 'createTaskScope', concurrency },
				}),
			);
		},
	);

	it('should accept Infinity, which is also the default', async () => {
		const scope = createTaskScope({ concurrency: Number.POSITIVE_INFINITY });

		expect(await scope.spawn(() => 1)).toBe(1);

		await scope.join();
	});

	it('should start waiting tasks in the order they were spawned', async () => {
		const scope = createTaskScope({ concurrency: 1 });
		const order: number[] = [];

		for (const position of [0, 1, 2, 3, 4]) {
			scope.spawn(() => {
				order.push(position);
			});
		}

		await scope.join();

		expect(order).toEqual([0, 1, 2, 3, 4]);
	});
});

describe('types', () => {
	it('should infer the task type from the work', () => {
		const scope = createTaskScope();

		expectTypeOf(scope.spawn(() => 1)).toEqualTypeOf<Task<number>>();
		expectTypeOf(scope.spawn(async () => 'text')).toEqualTypeOf<Task<string>>();

		void scope.join();
	});

	it('should be awaitable as its value, and settle as a Result', () => {
		expectTypeOf<Awaited<Task<number>>>().toEqualTypeOf<number>();

		expectTypeOf<Task<number>['settled']>().toEqualTypeOf<
			Promise<Result<number, unknown>>
		>();
	});

	it('should be async disposable, so await using ends it', () => {
		expectTypeOf<TaskScope>().toExtend<AsyncDisposable>();
	});
});
