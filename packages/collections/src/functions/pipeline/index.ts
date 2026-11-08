/**
 * Marks an element that a filtering step dropped.
 *
 * Never a value of any sequence: the symbol is not exported, so no source can
 * yield it.
 */
const SKIPPED = Symbol('skipped');

/**
 * What the steps after some point of a pipeline do with one element.
 *
 * @template T Type of the element arriving at that point.
 * @template R Type of the element leaving the last step.
 */
type Continuation<T, R> = (value: T) => R | typeof SKIPPED;

/**
 * Builds the traversal of a pipeline, given what is to happen to each element
 * once its own steps are done with it.
 *
 * @template T Type of the elements the pipeline produces.
 */
type Composition<T> = <R>(continuation: Continuation<T, R>) => Iterable<R>;

/**
 * A run of adjacent `where` and `select` stages traversed as one loop.
 *
 * Each of those operators used to wrap its source in a generator of its own,
 * so a chain of `k` of them resumed `k` generators for every element the
 * consumer pulled. A pipeline keeps the original source and the steps instead:
 * one generator walks the source and hands each element through the steps as
 * plain calls. This is how `System.Linq` fuses `Where` and `Select`, except
 * that any interleaving of the two fuses here, not only `Where` then `Select`.
 *
 * Nothing observable changes. A step sees an element only after every step
 * before it has seen that element and kept it, so predicates and projections
 * run in the same order, the same number of times, as in the unfused chain —
 * and because the source is still walked with `for...of`, a consumer stopping
 * early or a step throwing still closes it.
 *
 * Extending a pipeline returns a new one and leaves the original untouched,
 * which is what keeps an intermediate sequence usable on its own.
 *
 * The type of the source is hidden inside the composition rather than carried
 * as a second type parameter, so that a pipeline over any source is just a
 * `Pipeline<T>` and is extended without casting its steps.
 *
 * @template T Type of the elements the pipeline produces.
 */
export class Pipeline<T> implements Iterable<T> {
	/** The traversal, waiting for whatever comes after the last step. */
	private readonly compose: Composition<T>;

	/**
	 * Initializes the pipeline.
	 *
	 * Kept private: a pipeline starts from {@link Pipeline.over} and grows
	 * through {@link Pipeline.filter} and {@link Pipeline.project}.
	 *
	 * @param compose The traversal, waiting for what comes after its steps.
	 */
	private constructor(compose: Composition<T>) {
		this.compose = compose;
	}

	/**
	 * Starts a pipeline over a source, or continues the one the source already
	 * is.
	 *
	 * Continuing is the fusion: `where` and `select` call this with their own
	 * source, so the second of two adjacent stages extends the first rather
	 * than wrapping it.
	 *
	 * @template T Type of the elements of the source.
	 * @param source Source the stage reads from.
	 * @returns The pipeline to add the stage to.
	 */
	static over<T>(source: Iterable<T>): Pipeline<T> {
		if (Pipeline.is(source)) return source;

		return new Pipeline<T>(<R>(continuation: Continuation<T, R>): Iterable<R> => {
			return {
				*[Symbol.iterator](): Iterator<R> {
					for (const item of source) {
						const result: R | typeof SKIPPED = continuation(item);

						if (result !== SKIPPED) yield result;
					}
				},
			};
		});
	}

	/**
	 * Tells whether a source is already a pipeline.
	 *
	 * A guard rather than a bare `instanceof`, which narrows to `Pipeline<any>`:
	 * a pipeline produces exactly the elements it is iterable over, so one that
	 * is an `Iterable<T>` is a `Pipeline<T>`.
	 *
	 * @template T Type of the elements of the source.
	 * @param source Source being inspected.
	 * @returns `true` when the source is a pipeline.
	 */
	private static is<T>(source: Iterable<T>): source is Pipeline<T> {
		return source instanceof Pipeline;
	}

	/**
	 * Adds a step that keeps only the elements matching a condition.
	 *
	 * @param predicate Condition evaluated for each element reaching the step.
	 * @returns A new pipeline ending in the step.
	 */
	filter(predicate: (value: T) => boolean): Pipeline<T> {
		const compose: Composition<T> = this.compose;

		return new Pipeline<T>(<R>(continuation: Continuation<T, R>): Iterable<R> => {
			return compose((value: T): R | typeof SKIPPED => {
				return predicate(value) ? continuation(value) : SKIPPED;
			});
		});
	}

	/**
	 * Adds a step that projects every element reaching it.
	 *
	 * @template R Type produced by the projection.
	 * @param selector Projection applied to each element reaching the step.
	 * @returns A new pipeline ending in the step.
	 */
	project<R>(selector: (value: T) => R): Pipeline<R> {
		const compose: Composition<T> = this.compose;

		return new Pipeline<R>(<S>(continuation: Continuation<R, S>): Iterable<S> => {
			return compose((value: T): S | typeof SKIPPED => continuation(selector(value)));
		});
	}

	/**
	 * Traverses the source through every step.
	 *
	 * The steps are composed again on every traversal, which costs one closure
	 * per step and none per element.
	 *
	 * @returns An iterator over the elements leaving the last step.
	 */
	[Symbol.iterator](): Iterator<T> {
		return this.compose((value: T): T => value)[Symbol.iterator]();
	}
}
