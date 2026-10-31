/** The accessors of `DataView`, each counted when a view is instrumented. */
const ACCESSORS = [
	'getInt8',
	'getUint8',
	'getInt16',
	'getUint16',
	'getInt32',
	'getUint32',
	'getBigInt64',
	'getBigUint64',
	'getFloat32',
	'getFloat64',
	'setInt8',
	'setUint8',
	'setInt16',
	'setUint16',
	'setInt32',
	'setUint32',
	'setBigInt64',
	'setBigUint64',
	'setFloat32',
	'setFloat64',
] as const;

/**
 * A view whose every accessor counts its calls.
 *
 * The counting functions are own properties of the instance, shadowing the
 * prototype, so the view is still a real `DataView` for `instanceof` and for
 * the internal slots the accessors read.
 *
 * @param size Bytes of the view.
 * @returns The view, and a function reading the count.
 */
export const countingView = (size: number): { view: DataView; accesses: () => number } => {
	const view = new DataView(new ArrayBuffer(size));
	let accesses = 0;

	for (const accessor of ACCESSORS) {
		Object.defineProperty(view, accessor, {
			value: (...parameters: unknown[]): unknown => {
				accesses++;

				// The prototype's own accessor, called on this view as its receiver.
				return (DataView.prototype[accessor] as (...parameters: unknown[]) => unknown).apply(
					view,
					parameters,
				);
			},
		});
	}

	return { view, accesses: () => accesses };
};
