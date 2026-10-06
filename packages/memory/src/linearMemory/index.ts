import { createError } from '@fulcro/errors';

import { describeBuffer } from '@/storage/describeBuffer';

/**
 * One contiguous block of bytes, in which an address is a byte offset: address
 * `0` is its first byte.
 *
 * The address space a {@link NativePointer} points into. It owns nothing it was
 * not handed — the buffer or the WebAssembly memory it was made over stays the
 * caller's — and it grows when that memory grows.
 *
 * ```ts
 * const memory: LinearMemory = createLinearMemory(
 * 	instance.exports.memory as WebAssembly.Memory,
 * );
 *
 * memory.byteLength; // 65536, one page
 * ```
 */
export interface LinearMemory {
	/** How many bytes it holds now, which goes up when its memory grows. */
	readonly byteLength: number;
}

/**
 * A memory that replaces its buffer as it grows: what a `WebAssembly.Memory`
 * looks like from here.
 *
 * Stated by its shape, because the packages compile without the WebAssembly
 * declarations, and because nothing more than the current buffer is ever
 * asked of it.
 */
export interface GrowableMemory {
	/** The bytes as they are now; a new buffer after every growth. */
	readonly buffer: ArrayBuffer;
}

/**
 * The bytes of every linear memory made here, as they are at the moment of
 * asking. Kept off the object so that a `LinearMemory` has nothing on it a
 * consumer could reach the buffer through, and so that nothing shaped like
 * one is mistaken for one.
 */
const currentBytes = new WeakMap<LinearMemory, () => DataView>();

/**
 * Tells whether a value is a linear memory made by this package.
 *
 * @param value Value to inspect.
 * @returns `true` when it is.
 */
export const isLinearMemory = (value: unknown): value is LinearMemory =>
	currentBytes.has(value as LinearMemory);

/**
 * The bytes of a linear memory as they are now, every address in it valid in
 * the view returned.
 *
 * @param memory A linear memory made by this package.
 * @returns A view over all of it.
 */
export const bytesOf = (memory: LinearMemory): DataView =>
	(currentBytes.get(memory) as () => DataView)();

/**
 * Builds a linear memory, naming the caller's operation if the backing is
 * refused.
 *
 * @param operation Operation being performed, for the error message.
 * @param backing The bytes, or the memory that holds them.
 * @returns The linear memory, frozen.
 * @throws {TypeError} When the backing is neither, or is shared.
 */
export const openLinearMemory = (
	operation: string,
	backing: ArrayBuffer | GrowableMemory,
): LinearMemory => {
	if (backing instanceof ArrayBuffer) {
		// A view made without a length follows a resizable buffer as it resizes,
		// so one view serves for the whole life of the memory.
		const view = new DataView(backing);
		const memory: LinearMemory = Object.freeze({
			get byteLength(): number {
				return backing.byteLength;
			},
		});

		currentBytes.set(memory, () => view);

		return memory;
	}

	// A typed array or a DataView has a `buffer` too, but it covers only part
	// of it: taking the whole buffer would put address 0 somewhere other than
	// where the caller's view starts.
	const first: unknown =
		typeof backing === 'object' &&
		backing !== null &&
		!ArrayBuffer.isView(backing)
			? (backing as Partial<GrowableMemory>).buffer
			: undefined;

	if (!(first instanceof ArrayBuffer)) {
		throw createError('FULCRO7018', {
			operation,
			received:
				typeof SharedArrayBuffer === 'function' &&
				first instanceof SharedArrayBuffer
					? `${describeBuffer(backing)} over a SharedArrayBuffer`
					: describeBuffer(backing),
		});
	}

	// Growing detaches the buffer every earlier view was made over, so the
	// buffer is asked for on every access — one property read — and a new view
	// is made only when the answer changed.
	let buffer: ArrayBuffer = first;
	let view = new DataView(first);

	const memory: LinearMemory = Object.freeze({
		get byteLength(): number {
			return backing.buffer.byteLength;
		},
	});

	currentBytes.set(memory, (): DataView => {
		const now: ArrayBuffer = backing.buffer;

		if (now !== buffer) {
			buffer = now;
			view = new DataView(now);
		}

		return view;
	});

	return memory;
};

/**
 * Makes an address space of the bytes you hand in: an `ArrayBuffer`, or a
 * `WebAssembly.Memory` — anything whose `buffer` is replaced as it grows.
 *
 * ```ts
 * const { instance } = await WebAssembly.instantiate(module);
 * const moduleExports = instance.exports as {
 * 	memory: WebAssembly.Memory;
 * 	latest: () => number;
 * };
 * const memory: LinearMemory = createLinearMemory(moduleExports.memory);
 *
 * const reading = nativePointerTo(memory, moduleExports.latest(), Reading);
 * reading.get(); // read where the module wrote it, with no copy
 * ```
 *
 * Nothing is copied: a pointer into the memory reads and writes the very bytes
 * the module sees. When the memory grows, pointers into it keep working, since
 * none of them holds on to the buffer it was made over.
 *
 * A shared memory is refused. Two threads reading and writing the same bytes
 * need an agreement about who may do what and when, and this package does not
 * make one yet.
 *
 * @param backing The bytes, or the memory that holds them.
 * @returns The linear memory, frozen.
 * @throws {TypeError} When the backing is neither an `ArrayBuffer` nor an
 * object with one as its `buffer`, or when it is shared.
 */
export const createLinearMemory = (
	backing: ArrayBuffer | GrowableMemory,
): LinearMemory => openLinearMemory('createLinearMemory', backing);
