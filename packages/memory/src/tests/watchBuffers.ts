import { vi } from 'vitest';

/** What {@link watchBuffers} has seen since it started. */
export interface BufferCount {
	/** How many `ArrayBuffer`s were made. */
	made: number;

	/** How many bytes they held, in all. */
	bytes: number;
}

/**
 * Counts every `ArrayBuffer` made from now on, until `vi.unstubAllGlobals()`.
 *
 * The allocators reach the global constructor when they run, so replacing it
 * with a counting proxy shows exactly how often each one asks the engine for
 * memory — the cost an allocation strategy exists to choose.
 *
 * @returns The live count.
 */
export const watchBuffers = (): BufferCount => {
	const count: BufferCount = { made: 0, bytes: 0 };

	vi.stubGlobal(
		'ArrayBuffer',
		new Proxy(ArrayBuffer, {
			construct: (target, args: unknown[], newTarget) => {
				count.made++;
				count.bytes += Number(args[0] ?? 0);

				return Reflect.construct(target, args, newTarget) as object;
			},
		}),
	);

	return count;
};
