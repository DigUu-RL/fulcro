/**
 * Produces the default value of a type: the emptiest value that still fully
 * inhabits it, built by filling the type in rather than by handing back a
 * placeholder such as `null`.
 *
 * ```ts
 * interface Order {
 * 	id: number;
 * 	customer: { name: string; active: boolean };
 * 	items: string[];
 * 	note?: string;
 * }
 *
 * defaultOf<Order>();
 * // { id: 0, customer: { name: '', active: false }, items: [] }
 *
 * defaultOf<string>(); // ''
 * defaultOf<number>(); // 0
 * defaultOf<'dark' | 'light'>(); // 'dark'
 * ```
 *
 * The rule behind every case is a single one: **the result is always a valid
 * `T`**. Required properties are filled, optional ones are left out, a literal
 * type yields its only inhabitant, and a union yields `null` or `undefined`
 * when it admits them, falling back to the default of its first member.
 *
 * Resolved entirely at compile time. A type has no existence at runtime, so
 * there is nothing for a plain function to inspect: the bundled transformer
 * replaces the call with the value it builds from the type, and the body below
 * only ever runs when the project compiles without it.
 *
 * @template T Type whose default value is produced.
 * @returns The default value of `T`.
 * @throws {Error} Always, when the transformer is not enabled.
 */
export function defaultOf<T>(): T {
	throw new Error(
		'defaultOf<T>() resolves a type, which only exists at compile time. ' +
			'Enable the transformer in the `plugins` entry of your tsconfig ' +
			'so the call is replaced by the value it describes.',
	);
}
