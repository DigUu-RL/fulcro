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

	/** Elements kept so far, in the order they were accepted. */
	private readonly elements: T[] = [];

	/** Key of each kept element, addressable by the same position. */
	private readonly keys: K[] = [];

	/** Arrival number of each kept element, for breaking ties. */
	private readonly arrivals: number[] = [];

	/** Positions of the kept elements, worst of them at the root. */
	private readonly heap: number[] = [];

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
			this.elements.push(element);
			this.keys.push(key);
			this.arrivals.push(arrival);
			this.heap.push(this.elements.length - 1);
			this.siftUp(this.heap.length - 1);
			return;
		}

		// The window is full here, so the heap has a root, and every heap entry is
		// a slot of `elements`, `keys` and `arrivals`. The accesses through this
		// class are asserted rather than checked: a check would add a branch to
		// every comparison of every sift.
		const worstSlot = this.heap[0] as number;
		const worstKey = this.keys[worstSlot] as K;

		if (key < worstKey) return;

		// On a tie, the earlier arrival wins — and it has to be compared, not
		// assumed. Offering order is arrival order only while the producer is
		// sequential; `topByAwait` extracts keys concurrently and unordered, so
		// the window fills with whichever finished first. Testing the key alone
		// let those incumbents hold their places against elements that arrived
		// before them, and the answer silently became "whichever was quickest".
		if (!(key > worstKey) && arrival > (this.arrivals[worstSlot] as number)) return;

		// The winner takes the loser's slot rather than a new one. Appending
		// instead would grow these arrays once per winner, which on keys that
		// happen to arrive in ascending order is every single element — and the
		// bounded memory that lets this rank a stream it never collects would be
		// bounded by nothing at all. Positions stay valid because a tie is
		// broken by the recorded arrival, never by the slot it sits in.
		const slot: number = worstSlot;

		this.elements[slot] = element;
		this.keys[slot] = key;
		this.arrivals[slot] = arrival;

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
			.sort((left, right) => (this.worse(left, right) ? 1 : -1))
			.map((position) => this.elements[position] as T);
	}

	/**
	 * Tells whether the element at one position is the worse of two.
	 *
	 * Ordering is by key descending; equal keys fall back to arrival order,
	 * which is what keeps this agreeing with a stable sort down to which of two
	 * tied elements survives.
	 *
	 * @param left Position of the left element.
	 * @param right Position of the right element.
	 * @returns `true` when the left element is worse.
	 */
	private worse(left: number, right: number): boolean {
		const leftKey = this.keys[left] as K;
		const rightKey = this.keys[right] as K;

		if (leftKey < rightKey) return true;
		if (leftKey > rightKey) return false;

		// Tied: the one that arrived later is the one to lose. Compared by
		// arrival rather than by position, because a concurrent producer stores
		// them in whatever order its work finished in.
		return (this.arrivals[left] as number) > (this.arrivals[right] as number);
	}

	/**
	 * Moves an element up until its parent is no worse than it.
	 *
	 * @param start Position in the heap to move from.
	 */
	private siftUp(start: number): void {
		let child: number = start;

		while (child > 0) {
			const parent: number = (child - 1) >> 1;

			const childSlot = this.heap[child] as number;
			const held = this.heap[parent] as number;

			if (!this.worse(childSlot, held)) break;

			// Swapped through a temporary rather than by destructuring, which
			// would allocate an array on every level of every sift.
			this.heap[parent] = childSlot;
			this.heap[child] = held;

			child = parent;
		}
	}

	/**
	 * Moves an element down until both children are no worse than it.
	 *
	 * @param start Position in the heap to move from.
	 */
	private siftDown(start: number): void {
		let parent: number = start;

		for (;;) {
			const left: number = parent * 2 + 1;
			const right: number = left + 1;
			let worst: number = parent;

			if (
				left < this.heap.length &&
				this.worse(this.heap[left] as number, this.heap[worst] as number)
			) {
				worst = left;
			}

			if (
				right < this.heap.length &&
				this.worse(this.heap[right] as number, this.heap[worst] as number)
			) {
				worst = right;
			}

			if (worst === parent) break;

			const held = this.heap[parent] as number;
			this.heap[parent] = this.heap[worst] as number;
			this.heap[worst] = held;

			parent = worst;
		}
	}
}
