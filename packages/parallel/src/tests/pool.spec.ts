import process from 'node:process';

import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';

import { isFulcroError } from '@fulcro/errors';
import { createWorkerPool, type WorkerPool } from '@fulcro/parallel';

import { createPool } from '@/pool/index.js';

import {
	createFakeWorkers,
	type FakeWorkers,
	NOWHERE,
	until,
} from './fake-worker.js';

/**
 * Worker pool suite.
 *
 * It runs against the **built** package rather than the source, and that is not
 * a shortcut — it is the only honest option. A worker loads its script from
 * disk through the module loader, with no build step between the pool and the
 * file, so a suite pointed at TypeScript sources would be testing a path that
 * does not exist at runtime.
 *
 * Real threads are started here. Every test closes its pool, because threads
 * keep a Node process alive and a leaked one hangs the run rather than failing
 * it.
 */

/** The task module the workers load, as a URL they can import. */
const WORK = new URL('./fixtures/work.mjs', import.meta.url);

/** Pools opened by the test in hand, closed afterwards whatever happened. */
const opened: WorkerPool<unknown, unknown>[] = [];

/**
 * Creates a pool and registers it for closing.
 *
 * @template T Type of the elements handed to the workers.
 * @template R Type the task produces.
 * @param exportName Function in the fixture to call.
 * @param workers How many workers to run.
 * @returns The pool.
 */
const poolFor = <T, R>(exportName: string, workers = 2): WorkerPool<T, R> => {
	const pool = createWorkerPool<T, R>({
		module: WORK,
		export: exportName,
		workers,
	});

	opened.push(pool as WorkerPool<unknown, unknown>);

	return pool;
};

afterEach(async () => {
	await Promise.all(opened.splice(0).map((pool) => pool.close()));
});

/**
 * Creates a pool over workers the test drives, rather than over threads.
 *
 * The cases below are about *when* the pool does what it does — a second run
 * arriving mid-flight, an abort while every worker is busy, a close during the
 * start handshake — and a real worker replies whenever it happens to be
 * finished. `fake-worker.ts` says the rest.
 *
 * @template T Type of the elements handed to the workers.
 * @template R Type the task produces.
 * @param fake The workers to hand it.
 * @param workers How many to run.
 * @returns The pool.
 */
const drivenPool = <T, R>(
	fake: FakeWorkers,
	workers: number,
): WorkerPool<T, R> =>
	createPool<T, R>(
		{ module: NOWHERE, export: 'echo', workers },
		fake.spawn,
		NOWHERE,
	);

/** How a piece of work ended, read without waiting for it. */
interface Outcome<V> {
	settled: boolean;
	value?: V;
	error?: unknown;
}

/**
 * Records how a promise settles, so a test can wait for it with `until`.
 *
 * Awaiting the promise itself would hang the test, rather than fail it, on
 * exactly the defects these cases exist to catch: a run that never learns it
 * was called off, a run that waits on a thread that is gone.
 *
 * @template V Type the promise resolves to.
 * @param work The promise to watch.
 * @returns The outcome, filled in when it settles.
 */
const watch = <V>(work: Promise<V>): Outcome<V> => {
	const outcome: Outcome<V> = { settled: false };

	work.then(
		(value) => {
			outcome.settled = true;
			outcome.value = value;
		},
		(error: unknown) => {
			outcome.settled = true;
			outcome.error = error;
		},
	);

	return outcome;
};

/**
 * Lets the microtask queue run for a while, for asserting that something did
 * *not* happen.
 *
 * @param count How many turns to give it.
 */
const turns = async (count = 50): Promise<void> => {
	for (let turn = 0; turn < count; turn++) await Promise.resolve();
};

describe('running work on workers', () => {
	it('should process every element', async () => {
		const results = await poolFor<number, number>('double').map([1, 2, 3, 4]);

		expect(results).toEqual([2, 4, 6, 8]);
	});

	it('should return results in input order, whatever order they finished', async () => {
		// The first element is by far the slowest, so a pool handing results back
		// as they land would put it last.
		const results = await poolFor<number, number>('burn', 4).map([
			5_000_000, 1, 1, 1,
		]);

		expect(results).toHaveLength(4);
		expect(results[0]).toBeGreaterThan(results[1]);
	});

	it('should carry structured records across the boundary', async () => {
		// Not only primitives: a record with a nested array, cloned both ways.
		const records = [
			{ id: 1, amounts: [10, 20, 30] },
			{ id: 2, amounts: [5] },
		];

		const totals = await poolFor<
			(typeof records)[number],
			{ id: number; total: number }
		>('totalOf').map(records);

		expect(totals).toEqual([
			{ id: 1, total: 60 },
			{ id: 2, total: 5 },
		]);
	});

	it('should hand back an empty result for no elements', async () => {
		expect(await poolFor<number, number>('double').map([])).toEqual([]);
	});

	it('should stream results as they finish', async () => {
		const collected: number[] = [];

		for await (const value of poolFor<number, number>('double').stream([
			1, 2, 3,
		])) {
			collected.push(value);
		}

		expect([...collected].sort((a, b) => a - b)).toEqual([2, 4, 6]);
	});

	it('should feed an async sequence without depending on one', async () => {
		// `stream` is a plain AsyncIterable, which is what lets the sequences
		// consume it while this package declares no dependency on them.
		const { AsyncSequenceCollection } =
			await import('@fulcro/collections/async');

		const total = await AsyncSequenceCollection.from(
			poolFor<number, number>('double').stream([1, 2, 3]),
		).aggregate(0, (sum, value) => sum + value);

		expect(total).toBe(12);
	});
});

describe('spreading across workers', () => {
	it('should hand work to every worker, not just one', async () => {
		// Counted rather than timed, and that is the point. Elapsed time only
		// suggests that work spread; distinct worker identities prove it, on any
		// machine, however many cores it has and however loaded it is.
		//
		// Each worker is its own realm and imports the fixture separately, so
		// each carries a different identity. Four elements over four workers must
		// come back with four of them.
		const identities = await poolFor<number, string>('whoRanThis', 4).map([
			1, 2, 3, 4,
		]);

		expect(new Set(identities).size).toBe(4);
	});

	it('should actually be faster for it', async () => {
		// How much speed-up is *physically available* here. A pool of four on a
		// two-core runner cannot produce a fourfold saving however correct it is,
		// so the assertion is scaled to the machine rather than to a number that
		// happened to hold on the one it was written on.
		const cores: number = navigator?.hardwareConcurrency ?? 2;
		const workers: number = Math.min(4, cores);

		if (workers < 2) {
			// Nothing to prove on a single core, and no honest way to prove it.
			expect(cores).toBeGreaterThan(0);
			return;
		}

		// Genuinely CPU-bound work, one element per worker. Both pools are warmed
		// first, and deliberately: starting threads is expensive enough to
		// swallow the saving on a small job, and this test is about whether the
		// work spreads. That cost is measured on its own, below.
		const items: readonly number[] = Array.from(
			{ length: workers },
			() => 40_000_000,
		);

		const one = poolFor<number, number>('burn', 1);
		const many = poolFor<number, number>('burn', workers);

		await one.map([1]);
		await many.map([1]);

		const oneStart: number = performance.now();
		await one.map(items);
		const sequential: number = performance.now() - oneStart;

		const manyStart: number = performance.now();
		await many.map(items);
		const parallel: number = performance.now() - manyStart;

		// What is asserted is that the work *spread*, not that it sped up in
		// proportion to the worker count. Proportionality is not observable on a
		// shared virtualised CPU: the first version of this demanded half the
		// theoretical best and failed on a runner that had genuinely parallelised
		// — four workers, a real 1.43x, and vCPUs that are not four cores.
		//
		// A modest bar, and deliberately. The test above already proves the work
		// spread, deterministically; this one only has to show the spreading was
		// worth something. A serialised pool measures below 1 — it pays the
		// copying and gains nothing — so the gap this has to tell apart is wide,
		// and there is no reason to sit close to either edge of it.
		expect(sequential / parallel).toBeGreaterThan(1.1);
	});

	it('should cost more to start than a small job saves', async () => {
		// The unglamorous half of the same truth, asserted rather than left for a
		// reader to discover: below some amount of work per element, threads are
		// a loss. Documenting where that line falls is why the benchmark exists.
		const trivial: readonly number[] = [1, 1, 1, 1];

		const coldStart: number = performance.now();
		await poolFor<number, number>('burn', 4).map(trivial);
		const cold: number = performance.now() - coldStart;

		const warm = poolFor<number, number>('burn', 4);

		await warm.map([1]);

		const warmStart: number = performance.now();
		await warm.map(trivial);
		const warmed: number = performance.now() - warmStart;

		expect(warmed).toBeLessThan(cold);
	});

	it.each([0, -1, 1.5])('should reject a worker count of %s', (workers) => {
		expect(() =>
			createWorkerPool({ module: WORK, export: 'double', workers }),
		).toThrow(/positive integer worker count/i);
	});
});

describe('when things go wrong', () => {
	it('should reject with the message the task threw', async () => {
		await expect(poolFor<number, number>('explode').map([1])).rejects.toThrow(
			'the task refused',
		);
	});

	it('should reject when the export does not exist', async () => {
		await expect(
			poolFor<number, number>('notAFunction').map([1]),
		).rejects.toThrow(/callable export/i);
	});

	it('should survive a worker that fails after its run has finished', async () => {
		// On Node a worker error with no listener is thrown in the main thread,
		// and between two runs nothing used to listen: the suite would report
		// it as an uncaught exception. The wait is for the worker's own timer to
		// fire, not a measurement of anything.
		const pool = poolFor<number, number>('doubleThenThrow', 1);

		expect(await pool.map([1])).toEqual([2]);

		await new Promise<void>((resolve) => {
			setTimeout(resolve, 250);
		});

		expect(await pool.map([2])).toEqual([4]);
	});

	it('should reject when the module cannot be loaded', async () => {
		const pool = createWorkerPool<number, number>({
			module: new URL('./fixtures/missing.mjs', import.meta.url),
			export: 'double',
			workers: 1,
		});

		opened.push(pool as WorkerPool<unknown, unknown>);

		await expect(pool.map([1])).rejects.toThrow();
	});
});

describe('the codes a failure carries', () => {
	/**
	 * Waits for a run to fail and hands back what it failed with.
	 *
	 * @param work The run.
	 * @returns The rejection.
	 */
	const failureOf = async (work: Promise<unknown>): Promise<Error> => {
		try {
			await work;
		} catch (error) {
			return error as Error;
		}

		throw new Error('The run was expected to fail and did not.');
	};

	it('should code a bad worker count FULCRO3003', () => {
		expect(() =>
			createWorkerPool({ module: WORK, export: 'double', workers: 0 }),
		).toThrow(expect.objectContaining({ code: 'FULCRO3003' }));
	});

	it("should code the task's own failure FULCRO3005, keeping its text", async () => {
		const failure = await failureOf(
			poolFor<number, number>('explode').map([1]),
		);

		expect(failure).toMatchObject({
			code: 'FULCRO3005',
			message: 'FULCRO3005: the task refused',
		});
	});

	it('should recreate a missing export as FULCRO3001, with its values', async () => {
		const failure = await failureOf(
			poolFor<number, number>('notAFunction').map([1]),
		);

		expect(failure).toMatchObject({ code: 'FULCRO3001' });
		expect(failure.message).toMatch(
			/^FULCRO3001: .+ has no callable export named "notAFunction"\.$/,
		);
	});

	it('should carry the details of FULCRO3001 across the worker boundary', async () => {
		const failure = await failureOf(
			poolFor<number, number>('notAFunction').map([1]),
		);

		expect(isFulcroError(failure, 'FULCRO3001')).toBe(true);
		expect(failure).toMatchObject({
			details: {
				operation: 'initialize',
				module: expect.stringMatching(/\S/),
				name: 'notAFunction',
			},
		});
	});

	it("should give the task's own failure details naming its text", async () => {
		const failure = await failureOf(
			poolFor<number, number>('explode').map([1]),
		);

		expect(failure).toMatchObject({
			details: { operation: 'run', reason: 'the task refused' },
		});
	});

	it('should code a module that cannot be loaded FULCRO3004', async () => {
		const pool = createWorkerPool<number, number>({
			module: new URL('./fixtures/missing.mjs', import.meta.url),
			export: 'double',
			workers: 1,
		});

		opened.push(pool as WorkerPool<unknown, unknown>);

		expect(await failureOf(pool.map([1]))).toMatchObject({
			code: 'FULCRO3004',
		});
	});
});

describe('cancelling', () => {
	it('should reject with the reason the signal carries', async () => {
		const controller = new AbortController();
		const reason = new Error('called off');

		controller.abort(reason);

		await expect(
			poolFor<number, number>('double').map([1, 2, 3], {
				signal: controller.signal,
			}),
		).rejects.toBe(reason);
	});
});

describe('lifecycle', () => {
	it('should start no threads until the first run', async () => {
		// A pool nobody uses costs nothing, which is what makes it safe to build
		// one at module scope.
		const pool = createWorkerPool<number, number>({
			module: WORK,
			export: 'double',
			workers: 2,
		});

		// Closing before any run must not hang waiting on workers that were
		// never started.
		await expect(pool.close()).resolves.toBeUndefined();
	});

	it('should be reusable across runs', async () => {
		const pool = poolFor<number, number>('double');

		expect(await pool.map([1, 2])).toEqual([2, 4]);
		expect(await pool.map([3, 4])).toEqual([6, 8]);
	});

	it('should tolerate being closed twice', async () => {
		const pool = poolFor<number, number>('double');

		await pool.map([1]);
		await pool.close();

		await expect(pool.close()).resolves.toBeUndefined();
	});

	it('should stop its threads when an await using scope ends', async () => {
		// Not registered for closing: a pool the scope failed to close would keep
		// its threads, and the run would hang rather than pass.
		let doubled: number[] = [];

		{
			await using pool = createWorkerPool<number, number>({
				module: WORK,
				export: 'double',
				workers: 2,
			});

			doubled = await pool.map([1, 2, 3]);
		}

		expect(doubled).toEqual([2, 4, 6]);
	});
});

describe('await using', () => {
	it('should terminate every worker when the scope ends', async () => {
		const fake = createFakeWorkers();
		let work: Promise<number[]> | undefined;

		{
			await using pool = drivenPool<number, number>(fake, 3);

			work = pool.map([1, 2, 3]);

			await until(() => fake.inFlight() === 3, 'every worker to be busy');

			fake.completeAll();

			expect(await work).toEqual([1, 2, 3]);
		}

		expect(fake.spawned()).toBe(3);
		expect(fake.terminated()).toBe(3);
	});

	it('should terminate every worker when the scope is left by a throw', async () => {
		const fake = createFakeWorkers();
		const failure = new RangeError('left early');

		const leave = async (): Promise<void> => {
			await using pool = drivenPool<number, number>(fake, 2);

			const work = pool.map([1, 2]);

			await until(() => fake.inFlight() === 2, 'both workers to be busy');

			fake.completeAll();
			await work;

			throw failure;
		};

		await expect(leave()).rejects.toBe(failure);

		expect(fake.terminated()).toBe(2);
	});

	it('should start nothing and stop nothing for a pool never run', async () => {
		const fake = createFakeWorkers();

		{
			await using pool = drivenPool<number, number>(fake, 2);

			expect(pool).toBeDefined();
		}

		expect(fake.spawned()).toBe(0);
		expect(fake.terminated()).toBe(0);
	});

	it('should do nothing more for a pool already closed inside the scope', async () => {
		const fake = createFakeWorkers();

		{
			await using pool = drivenPool<number, number>(fake, 2);

			const work = pool.map([1]);

			await until(() => fake.inFlight() === 1, 'the element to be handed out');

			fake.completeAll();
			await work;
			await pool.close();
		}

		expect(fake.terminated()).toBe(2);
	});

	it('should be asynchronously disposable by type', () => {
		expectTypeOf<WorkerPool<number, number>>().toExtend<AsyncDisposable>();
	});
});

describe('running several batches through one pool', () => {
	it('should keep two overlapping runs apart', async () => {
		// Replies carry the element's position, and every run counts positions
		// from zero. Two runs sharing the workers therefore read each other's
		// replies: results land in the wrong run, and a worker still holding an
		// element is marked free. Runs are serialised so that cannot arise.
		const pool = poolFor<number, number>('double', 2);

		const [first, second] = await Promise.all([
			pool.map([1, 2, 3]),
			pool.map([10, 20, 30]),
		]);

		expect(first).toEqual([2, 4, 6]);
		expect(second).toEqual([20, 40, 60]);
	});

	it('should not accumulate listeners across runs', async () => {
		// The documentation tells consumers to create a pool once and run many
		// batches through it, and a run that leaves its handlers behind makes
		// that the one path that leaks. Node says so out loud on the eleventh
		// run, which is what this reads.
		const warnings: string[] = [];

		const record = (warning: Error): void => {
			warnings.push(warning.name);
		};

		process.on('warning', record);

		try {
			const pool = poolFor<number, number>('double', 2);

			for (let batch = 0; batch < 12; batch++) await pool.map([1, 2]);

			// A warning is emitted on the next tick rather than at the call.
			await new Promise<void>((resolve) => {
				setImmediate(resolve);
			});
		} finally {
			process.off('warning', record);
		}

		expect(warnings).not.toContain('MaxListenersExceededWarning');
	});
});

describe('interleaving', () => {
	it('should hand out nothing for a second run until the first has ended', async () => {
		const fake = createFakeWorkers();
		const pool = drivenPool<number, number>(fake, 2);

		const first = pool.map([1, 2, 3]);
		const second = pool.map([10, 20, 30]);

		await until(
			() => fake.inFlight() === 2,
			'the first two elements to go out',
		);

		expect(fake.posted()).toEqual([1, 2]);

		fake.completeAll();

		await until(
			() => fake.posted().length === 3,
			'the third element to go out',
		);

		expect(fake.posted()).toEqual([1, 2, 3]);

		fake.completeAll();

		await until(() => fake.inFlight() === 2, 'the second run to start');

		expect(fake.posted()).toEqual([1, 2, 3, 10, 20]);

		fake.completeAll();

		await until(() => fake.inFlight() === 1, 'the last element to go out');

		fake.completeAll();

		expect(await first).toEqual([1, 2, 3]);
		expect(await second).toEqual([10, 20, 30]);
	});

	it('should leave only the pool’s own handler on each worker when a run ends', async () => {
		// One per worker stays for the worker's whole life, so that a failure
		// between runs is seen; the run's own are gone, so the count holds
		// however many batches go through.
		const fake = createFakeWorkers({ auto: true });
		const pool = drivenPool<number, number>(fake, 2);

		for (let batch = 0; batch < 3; batch++) {
			await pool.map([1, 2, 3]);

			expect(fake.handlers()).toBe(2);
		}

		await pool.close();

		expect(fake.handlers()).toBe(0);
	});
});

describe('cancelling, in order', () => {
	it('should hand out no element at all when the signal is already aborted', async () => {
		const fake = createFakeWorkers();
		const pool = drivenPool<number, number>(fake, 2);
		const controller = new AbortController();
		const reason = new Error('called off');

		controller.abort(reason);

		await expect(
			pool.map([1, 2, 3], { signal: controller.signal }),
		).rejects.toBe(reason);

		expect(fake.posted()).toEqual([]);
		expect(fake.spawned()).toBe(0);
	});

	it('should reject while every worker is still busy', async () => {
		// Nothing is completed here, deliberately. An abort is not a reply, so a
		// pool that only looks at the signal when a worker answers learns it was
		// called off when the work it was told to stop has already finished.
		const fake = createFakeWorkers();
		const pool = drivenPool<number, number>(fake, 2);
		const controller = new AbortController();
		const reason = new Error('called off');

		const work = pool.map([1, 2, 3, 4], { signal: controller.signal });

		await until(() => fake.inFlight() === 2, 'both workers to be busy');

		controller.abort(reason);

		await expect(work).rejects.toBe(reason);

		expect(fake.posted()).toEqual([1, 2]);
		expect(fake.terminated()).toBe(2);
	});

	it('should keep the abort reason when a worker also fails to stop', async () => {
		const fake = createFakeWorkers({ unstoppable: [0, 1] });
		const pool = drivenPool<number, number>(fake, 2);
		const controller = new AbortController();
		const reason = new Error('called off');

		const work = pool.map([1, 2, 3, 4], { signal: controller.signal });

		await until(() => fake.inFlight() === 2, 'both workers to be busy');

		controller.abort(reason);

		await expect(work).rejects.toBe(reason);
	});

	it('should reject a run still waiting for its turn as soon as it is called off', async () => {
		const fake = createFakeWorkers();
		const pool = drivenPool<number, number>(fake, 2);
		const controller = new AbortController();
		const reason = new Error('called off');

		const first = pool.map([1, 2]);
		const second = watch(pool.map([10, 20], { signal: controller.signal }));
		const third = pool.map([100]);

		await until(() => fake.inFlight() === 2, 'the first run to start');

		controller.abort(reason);

		await until(() => second.settled, 'the queued run to reject');

		expect(second.error).toBe(reason);

		// Giving up its place must not let the run behind it overtake the run
		// that is still going.
		await turns();

		expect(fake.posted()).toEqual([1, 2]);

		fake.completeAll();

		expect(await first).toEqual([1, 2]);

		await until(() => fake.inFlight() === 1, 'the third run to start');

		fake.completeAll();

		expect(await third).toEqual([100]);
		expect(fake.posted()).toEqual([1, 2, 100]);
	});

	it('should stop the workers when a stream is called off while its consumer is busy', async () => {
		// The consumer holds the first result and has not asked for the next, so
		// nothing inside the run is waiting to be woken. Stopping the workers on
		// its next pull would leave them running for as long as it takes — or
		// for ever, if it never pulls again.
		const fake = createFakeWorkers();
		const pool = drivenPool<number, number>(fake, 2);
		const controller = new AbortController();
		const reason = new Error('called off');

		const iterator = pool
			.stream([1, 2, 3, 4], { signal: controller.signal })
			[Symbol.asyncIterator]();

		const first = iterator.next();

		await until(() => fake.inFlight() === 2, 'both workers to be busy');

		fake.complete(0);

		expect(await first).toEqual({ done: false, value: 1 });

		controller.abort(reason);

		await until(() => fake.terminated() === 2, 'the workers to be stopped');

		await expect(iterator.next()).rejects.toBe(reason);
	});
});

describe('a task that fails', () => {
	it('should terminate the siblings still in flight, then start afresh', async () => {
		const fake = createFakeWorkers();
		const pool = drivenPool<number, number>(fake, 3);

		const work = pool.map([1, 2, 3, 4]);

		await until(() => fake.inFlight() === 3, 'every worker to be busy');

		fake.fail(0, 'the first one broke');

		await expect(work).rejects.toMatchObject({
			code: 'FULCRO3005',
			details: { reason: 'the first one broke' },
		});

		expect(fake.posted()).toEqual([1, 2, 3]);
		expect(fake.terminated()).toBe(3);

		const next = pool.map([9]);

		await until(() => fake.inFlight() === 1, 'the next run to start');

		fake.completeAll();

		expect(await next).toEqual([9]);
		expect(fake.spawned()).toBe(6);
	});

	it('should reject with the first failure when several arrive together', async () => {
		const fake = createFakeWorkers();
		const pool = drivenPool<number, number>(fake, 2);

		const work = pool.map([1, 2]);

		await until(() => fake.inFlight() === 2, 'both workers to be busy');

		fake.fail(1, 'first');
		fake.fail(0, 'second');

		await expect(work).rejects.toMatchObject({ details: { reason: 'first' } });
	});
});

describe('a worker that dies between runs', () => {
	it('should be replaced rather than handed the next element', async () => {
		const fake = createFakeWorkers({ auto: true });
		const pool = drivenPool<number, number>(fake, 2);

		expect(await pool.map([1, 2])).toEqual([1, 2]);

		fake.crash(0);

		const next = watch(pool.map([3, 4]));

		await until(() => next.settled, 'the next run to finish');

		expect(next).toEqual({ settled: true, value: [3, 4] });
		expect(fake.spawned()).toBe(4);
		expect(fake.terminated()).toBe(2);
	});
});

describe('closing', () => {
	it('should refuse a run that was waiting when the pool closed, and start nothing for it', async () => {
		const fake = createFakeWorkers();
		const pool = drivenPool<number, number>(fake, 2);

		const first = watch(pool.map([1, 2]));
		const second = watch(pool.map([10]));

		await until(() => fake.inFlight() === 2, 'the first run to start');

		await pool.close();

		await until(
			() => first.settled && second.settled,
			'both runs to be settled',
		);

		expect(first.error).toMatchObject({
			message: expect.stringMatching(/exited/i),
		});
		expect(second.error).toMatchObject({
			code: 'FULCRO3010',
			details: { operation: 'map' },
		});
		expect(fake.spawned()).toBe(2);
	});

	it('should refuse every run once closed, from either method', async () => {
		const fake = createFakeWorkers({ auto: true });
		const pool = drivenPool<number, number>(fake, 2);

		await pool.map([1]);
		await pool.close();

		await expect(pool.map([2])).rejects.toMatchObject({
			code: 'FULCRO3010',
			details: { operation: 'map' },
		});

		const reading = async (): Promise<void> => {
			for await (const value of pool.stream([2])) expect(value).toBe(2);
		};

		await expect(reading()).rejects.toMatchObject({
			code: 'FULCRO3010',
			details: { operation: 'stream' },
		});

		expect(fake.spawned()).toBe(2);
	});

	it('should refuse a pool closed before it ever ran', async () => {
		const fake = createFakeWorkers({ auto: true });
		const pool = drivenPool<number, number>(fake, 2);

		await pool.close();

		await expect(pool.map([1])).rejects.toMatchObject({ code: 'FULCRO3010' });

		expect(fake.spawned()).toBe(0);
	});

	it('should not settle while a run that was called off is still stopping its workers', async () => {
		const fake = createFakeWorkers({ slowToStop: true });
		const pool = drivenPool<number, number>(fake, 2);
		const controller = new AbortController();
		const reason = new Error('called off');

		const work = watch(pool.map([1, 2, 3], { signal: controller.signal }));

		await until(() => fake.inFlight() === 2, 'both workers to be busy');

		controller.abort(reason);

		await until(() => fake.terminated() === 2, 'the workers to be told');

		const closing = watch(pool.close());

		await turns();

		expect(closing.settled).toBe(false);

		fake.finishStopping();

		await until(() => closing.settled && work.settled, 'both to settle');

		expect(closing.error).toBeUndefined();
		expect(work.error).toBe(reason);
	});

	it('should hand a second close the same promise as the first', async () => {
		const fake = createFakeWorkers({ auto: true });
		const pool = drivenPool<number, number>(fake, 2);

		await pool.map([1]);

		expect(pool.close()).toBe(pool.close());
	});
});

describe('starting', () => {
	it('should terminate the workers that did start when one cannot load', async () => {
		const fake = createFakeWorkers({ broken: [1] });
		const pool = drivenPool<number, number>(fake, 3);

		await expect(pool.map([1])).rejects.toThrow(/could not load/i);

		expect(fake.spawned()).toBe(3);
		expect(fake.terminated()).toBe(3);
	});

	it('should build a fresh set after a start that failed', async () => {
		const fake = createFakeWorkers({ broken: [1] });
		const pool = drivenPool<number, number>(fake, 3);

		await expect(pool.map([1])).rejects.toThrow(/could not load/i);

		const second = pool.map([7]);

		await until(
			() => fake.inFlight() === 1,
			'the retry to hand out its element',
		);

		fake.completeAll();

		expect(await second).toEqual([7]);
		expect(fake.spawned()).toBe(6);
	});

	it('should stop the workers when a close arrives during the start', async () => {
		// `close` promises to stop every worker. Reading the resolved members
		// rather than the start itself means a close during the handshake finds
		// nothing to stop and leaves the threads it could not see running for the
		// life of the process.
		const fake = createFakeWorkers();
		const pool = drivenPool<number, number>(fake, 2);

		const work = pool.map([1]);

		await until(() => fake.spawned() === 2, 'the workers to be created');

		await pool.close();

		expect(fake.terminated()).toBe(2);

		// The run asked before the close, and is refused for it rather than
		// handed threads that are already gone.
		await expect(work).rejects.toMatchObject({
			code: 'FULCRO3010',
			details: { operation: 'map' },
		});
	});
});
