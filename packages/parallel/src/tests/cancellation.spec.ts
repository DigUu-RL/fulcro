import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
	type CancellationSource,
	type CancellationToken,
} from '@/@types/index.js';
import { createCancellationSource } from '@/cancellation/index.js';

/**
 * Cancellation source suite.
 *
 * The token and its signal are the same state read two ways, so every case
 * that reads one also reads the other: a token saying it was cancelled while
 * `fetch` sees a live signal is the one disagreement this design rules out.
 */

describe('a fresh source', () => {
	it('should not be cancelled, on the token or on its signal', () => {
		const { token } = createCancellationSource();

		expect(token.isCancelled).toBe(false);
		expect(token.reason).toBeUndefined();
		expect(token.signal.aborted).toBe(false);
		expect(() => token.throwIfCancelled()).not.toThrow();
	});
});

describe('cancel', () => {
	it('should report the reason it was given, on the token and on its signal', () => {
		const source = createCancellationSource();
		const reason = new Error('no longer wanted');

		source.cancel(reason);

		expect(source.token.isCancelled).toBe(true);
		expect(source.token.reason).toBe(reason);
		expect(source.token.signal.aborted).toBe(true);
		expect(source.token.signal.reason).toBe(reason);
	});

	it('should report an AbortError when given no reason, as an aborted signal does', () => {
		const source = createCancellationSource();

		source.cancel();

		expect(source.token.reason).toBeInstanceOf(DOMException);
		expect(source.token.reason).toMatchObject({ name: 'AbortError' });
	});

	it('should keep the first reason when called again', () => {
		const source = createCancellationSource();

		source.cancel('first');
		source.cancel('second');

		expect(source.token.reason).toBe('first');
	});

	it('should make throwIfCancelled throw the reason', () => {
		const source = createCancellationSource();
		const reason = new Error('stop');

		source.cancel(reason);

		expect(() => source.token.throwIfCancelled()).toThrow(reason);
	});
});

describe('onCancelled', () => {
	it('should call the handler once, with the reason, when the source is cancelled', () => {
		const source = createCancellationSource();
		const handler = vi.fn();

		source.token.onCancelled(handler);
		source.cancel('why');
		source.cancel('again');

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler).toHaveBeenCalledWith('why');
	});

	it('should call a handler registered after the cancellation at once', () => {
		const source = createCancellationSource();
		const handler = vi.fn();

		source.cancel('already');
		source.token.onCancelled(handler);

		expect(handler).toHaveBeenCalledExactlyOnceWith('already');
	});

	it('should not call a handler whose registration was disposed', () => {
		const source = createCancellationSource();
		const handler = vi.fn();

		const registration: Disposable = source.token.onCancelled(handler);

		registration[Symbol.dispose]();
		source.cancel();

		expect(handler).not.toHaveBeenCalled();
	});

	it('should release the handler at the end of a using block', () => {
		const source = createCancellationSource();
		const handler = vi.fn();

		{
			using _registration = source.token.onCancelled(handler);
		}

		source.cancel();

		expect(handler).not.toHaveBeenCalled();
	});

	it('should report a throw from a late handler as a listener throw is reported, not to the caller', () => {
		const source = createCancellationSource();
		const error = new Error('from the handler');
		const deferred: (() => void)[] = [];

		const spy = vi
			.spyOn(globalThis, 'queueMicrotask')
			.mockImplementation((callback) => {
				deferred.push(callback);
			});

		source.cancel();

		try {
			expect(() =>
				source.token.onCancelled(() => {
					throw error;
				}),
			).not.toThrow();
		} finally {
			spy.mockRestore();
		}

		expect(deferred).toHaveLength(1);
		expect(() => deferred[0]()).toThrow(error);
	});

	it('should run handlers before cancel returns', () => {
		const source = createCancellationSource();
		const order: string[] = [];

		source.token.onCancelled(() => order.push('handler'));
		source.cancel();
		order.push('after cancel');

		expect(order).toEqual(['handler', 'after cancel']);
	});
});

describe('a parent token', () => {
	it('should cancel the child with the parent reason', () => {
		const parent = createCancellationSource();
		const child = createCancellationSource(parent.token);

		parent.cancel('shutdown');

		expect(child.token.isCancelled).toBe(true);
		expect(child.token.reason).toBe('shutdown');
	});

	it('should leave the parent alone when the child is cancelled', () => {
		const parent = createCancellationSource();
		const child = createCancellationSource(parent.token);

		child.cancel();

		expect(parent.token.isCancelled).toBe(false);
	});

	it('should start the child cancelled when the parent already is', () => {
		const parent = createCancellationSource();

		parent.cancel('earlier');

		const child = createCancellationSource(parent.token);

		expect(child.token.isCancelled).toBe(true);
		expect(child.token.reason).toBe('earlier');
	});

	it('should stop following the parent once the child is disposed', () => {
		const parent = createCancellationSource();
		const child = createCancellationSource(parent.token);

		child[Symbol.dispose]();
		parent.cancel();

		expect(child.token.isCancelled).toBe(false);
	});

	it('should leave the child cancellable by hand after it is disposed', () => {
		const parent = createCancellationSource();
		const child = createCancellationSource(parent.token);

		child[Symbol.dispose]();
		child.cancel('still works');

		expect(child.token.reason).toBe('still works');
	});

	it('should follow through every generation', () => {
		const root = createCancellationSource();
		const middle = createCancellationSource(root.token);
		const leaf = createCancellationSource(middle.token);

		root.cancel('all of it');

		expect(leaf.token.reason).toBe('all of it');
	});
});

describe('values taken off their object', () => {
	it('should keep working, as every descriptor here does', () => {
		const { token, cancel } = createCancellationSource();
		const { throwIfCancelled, onCancelled } = token;
		const handler = vi.fn();

		onCancelled(handler);
		cancel('detached');

		expect(() => throwIfCancelled()).toThrow();
		expect(handler).toHaveBeenCalledWith('detached');
	});

	it('should be frozen, so a consumer cannot replace what the work reads', () => {
		const source = createCancellationSource();

		expect(Object.isFrozen(source)).toBe(true);
		expect(Object.isFrozen(source.token)).toBe(true);
	});
});

describe('types', () => {
	it('should be disposable, so using releases the parent', () => {
		expectTypeOf<CancellationSource>().toExtend<Disposable>();

		expectTypeOf(
			createCancellationSource,
		).returns.toEqualTypeOf<CancellationSource>();
	});

	it('should hand the platform a real AbortSignal', () => {
		expectTypeOf<CancellationToken['signal']>().toEqualTypeOf<AbortSignal>();
	});

	it('should accept a parent token and nothing else', () => {
		expectTypeOf(createCancellationSource).parameters.toEqualTypeOf<
			[parent?: CancellationToken]
		>();
	});
});
