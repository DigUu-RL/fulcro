/** One element the window keeps, with what it is ranked by. */
interface Entry<T, K> {
	element: T;
	key: K;
	/** Position it arrived at, for breaking ties. */
	arrival: number;
}

/**
 * Tells whether one entry is the worse of two.
 *
 * Ordering is by key descending; equal keys fall back to arrival order, which
 * is what keeps this agreeing with a stable sort down to which of two tied
 * elements survives.
 *
 * @param left One entry.
 * @param right The other.
 * @returns `true` when the left entry is worse.
 */
const worse = <T, K>(left: Entry<T, K>, right: Entry<T, K>): boolean => {
	if (left.key < right.key) return true;
	if (left.key > right.key) return false;

	// Tied: the one that arrived later is the one to lose. Compared by arrival
	// rather than by position, because a concurrent producer stores them in
	// whatever order its work finished in.
	return left.arrival > right.arrival;
};

/**
 * The bounded window behind `topBy`, on both kinds of sequence.
 *
 * Shared rather than written twice, and that is the point of it: the promise
 * `topBy` makes is that it answers exactly what `orderByDescending(...).take(n)`
 * answers, ties included. Two implementations of a heap would be two chances to
 * disagree about which of two equal elements survives — a difference nothing
 * would notice until it mattered.
 *
 * Elements are offered one at a time and the window keeps the best `count` of
 * them, so what it holds is bounded by `count` rather than by how many were
 * offered. That is what lets the asynchronous sequence rank a stream without
 * collecting it.
 *
 * @template T Type of the ranked elements.
 * @template K Type of the compared key.
 */
export class TopWindow<T, K> {
	/** How many elements the window keeps. */
	private readonly count: number;

	/** The kept entries, worst of them at the root. */
	private readonly heap: Entry<T, K>[] = [];

	/**
	 * Opens a window.
	 *
	 * @param count How many elements to keep.
	 */
	constructor(count: number) {
		this.count = count;
	}

	/**
	 * Offers an element to the window.
	 *
	 * Costs one comparison when the element loses, which is the common case,
	 * and `log count` when it wins.
	 *
	 * @param element Element being offered.
	 * @param key Key it is ranked by.
	 * @param arrival Position it arrived at, used to break ties.
	 */
	offer(element: T, key: K, arrival: number): void {
		if (this.heap.length < this.count) {
			this.heap.push({ element, key, arrival });
			this.siftUp(this.heap.length - 1);
			return;
		}

		const worst = this.heap[0];

		// A window of no elements keeps nothing, so it has no worst to beat.
		if (worst === undefined) return;
		if (key < worst.key) return;

		// On a tie, the earlier arrival wins — and it has to be compared, not
		// assumed. Offering order is arrival order only while the producer is
		// sequential; `topByAwait` extracts keys concurrently and unordered, so
		// the window fills with whichever finished first. Testing the key alone
		// let those incumbents hold their places against elements that arrived
		// before them, and the answer silently became "whichever was quickest".
		if (!(key > worst.key) && arrival > worst.arrival) return;

		// The winner takes the loser's entry rather than a new one. A new entry
		// per winner would allocate once per winner, which on keys that happen to
		// arrive in ascending order is every single element — and the bounded
		// memory that lets this rank a stream it never collects would be bounded
		// by nothing at all.
		worst.element = element;
		worst.key = key;
		worst.arrival = arrival;

		this.siftDown(0);
	}

	/**
	 * Hands back what the window kept, largest key first.
	 *
	 * The heap is ordered enough to know its worst, not enough to be read in
	 * order, so the last step sorts `count` of them — and `count` is the small
	 * number here.
	 *
	 * @returns The elements, ties in arrival order.
	 */
	drain(): T[] {
		return this.heap
			.slice()
			.sort((left, right) => (worse(left, right) ? 1 : -1))
			.map((entry) => entry.element);
	}

	/**
	 * Moves an entry up until its parent is no worse than it.
	 *
	 * @param start Position in the heap to move from.
	 */
	private siftUp(start: number): void {
		let child: number = start;

		while (child > 0) {
			const parent: number = (child - 1) >> 1;
			const childEntry = this.heap[child];
			const parentEntry = this.heap[parent];

			if (childEntry === undefined || parentEntry === undefined) return;
			if (!worse(childEntry, parentEntry)) return;

			// Swapped through the two locals rather than by destructuring, which
			// would allocate an array on every level of every sift.
			this.heap[parent] = childEntry;
			this.heap[child] = parentEntry;

			child = parent;
		}
	}

	/**
	 * Moves an entry down until both children are no worse than it.
	 *
	 * Each child is read only once its position is known to be inside the heap:
	 * a read past the end of an array is a slow path of its own, whatever the
	 * value it answers.
	 *
	 * @param start Position in the heap to move from.
	 */
	private siftDown(start: number): void {
		const length: number = this.heap.length;
		let parent: number = start;

		for (;;) {
			const parentEntry = this.heap[parent];

			if (parentEntry === undefined) return;

			const left: number = parent * 2 + 1;
			const right: number = left + 1;
			let worst: number = parent;
			let worstEntry: Entry<T, K> = parentEntry;

			if (left < length) {
				const leftEntry = this.heap[left];

				if (leftEntry !== undefined && worse(leftEntry, worstEntry)) {
					worst = left;
					worstEntry = leftEntry;
				}
			}

			if (right < length) {
				const rightEntry = this.heap[right];

				if (rightEntry !== undefined && worse(rightEntry, worstEntry)) {
					worst = right;
					worstEntry = rightEntry;
				}
			}

			if (worst === parent) return;

			this.heap[parent] = worstEntry;
			this.heap[worst] = parentEntry;

			parent = worst;
		}
	}
}
