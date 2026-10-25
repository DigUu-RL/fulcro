/**
 * An asynchronous source over a synchronous iterable: each element is handed
 * over as soon as it is asked for, with nothing to wait on in between.
 *
 * Written as an iterator rather than as an `async` generator. A source with
 * nothing to wait for has no use for `async`, and a generator would cost more
 * than it says: its `next` goes through the generator's request queue and the
 * `await` every `yield` implies, a few ticks per element that a suite measuring
 * an operator would be measuring too. Here `next` is one resolved promise.
 *
 * The synchronous iterable is advanced only when `next` is called, so anything
 * it counts as it produces an element is counted at the same moment a
 * generator would count it. An early `return` reaches it as well, so a source
 * that cleans up when abandoned still does.
 *
 * @template T Type of the elements.
 * @param values Elements to hand over, produced as they are asked for.
 * @returns The asynchronous source.
 */
export const asyncSourceOf = <T>(values: Iterable<T>): AsyncIterable<T> => {
	return {
		[Symbol.asyncIterator]: (): AsyncIterator<T> => {
			const iterator: Iterator<T> = values[Symbol.iterator]();

			return {
				next: (): Promise<IteratorResult<T>> => Promise.resolve(iterator.next()),

				return: (value?: unknown): Promise<IteratorResult<T>> => {
					return Promise.resolve(iterator.return?.(value) ?? { done: true, value: undefined });
				},
			};
		},
	};
};
