import type { ByteCodec, Encoding } from '@/src/fixedLayout';
import { readHalves, writeHalves } from '@/src/fixedLayout/halves';
import type { IntegerWidth } from '@/src/integer';

/**
 * The name of the encoding {@link integerCodec} stores an integer of one
 * signedness and width in.
 *
 * @param signed Whether the range includes negative values.
 * @param width Width, in bits.
 * @returns The encoding: `'Int32'`, `'BigUint64'`, `'Int128'`.
 */
export const integerEncoding = (signed: boolean, width: IntegerWidth): Encoding => {
	const sign: string = signed ? 'Int' : 'Uint';

	// The language spells its 64-bit accessors with a `Big` in front.
	if (width === 64) return `Big${sign}64` as Encoding;

	return `${sign}${String(width)}` as Encoding;
};

/**
 * How an integer of one signedness and width is stored: through the
 * `DataView` accessor of its width, or two of them at 128 bits.
 *
 * Every branch is chosen here, once per width, so that reading or writing a
 * value runs one accessor and no test of what the width was.
 *
 * @param signed Whether the range includes negative values.
 * @param width Width, in bits.
 * @returns The codec.
 */
export const integerCodec = (signed: boolean, width: IntegerWidth): ByteCodec<unknown> => {
	const size: number = width / 8;

	switch (width) {
		case 8:
			return signed
				? {
						size,
						alignment: size,
						read: (view, offset): number => view.getInt8(offset),
						write: (view, offset, value): void => {
							view.setInt8(offset, value as number);
						},
					}
				: {
						size,
						alignment: size,
						read: (view, offset): number => view.getUint8(offset),
						write: (view, offset, value): void => {
							view.setUint8(offset, value as number);
						},
					};
		case 16:
			return signed
				? {
						size,
						alignment: size,
						read: (view, offset): number => view.getInt16(offset, true),
						write: (view, offset, value): void => {
							view.setInt16(offset, value as number, true);
						},
					}
				: {
						size,
						alignment: size,
						read: (view, offset): number => view.getUint16(offset, true),
						write: (view, offset, value): void => {
							view.setUint16(offset, value as number, true);
						},
					};
		case 32:
			return signed
				? {
						size,
						alignment: size,
						read: (view, offset): number => view.getInt32(offset, true),
						write: (view, offset, value): void => {
							view.setInt32(offset, value as number, true);
						},
					}
				: {
						size,
						alignment: size,
						read: (view, offset): number => view.getUint32(offset, true),
						write: (view, offset, value): void => {
							view.setUint32(offset, value as number, true);
						},
					};
		case 64:
			return signed
				? {
						size,
						alignment: size,
						read: (view, offset): bigint => view.getBigInt64(offset, true),
						write: (view, offset, value): void => {
							view.setBigInt64(offset, value as bigint, true);
						},
					}
				: {
						size,
						alignment: size,
						read: (view, offset): bigint => view.getBigUint64(offset, true),
						write: (view, offset, value): void => {
							view.setBigUint64(offset, value as bigint, true);
						},
					};
		case 128:
			return {
				size,
				alignment: size,
				read: signed
					? (view, offset): bigint => BigInt.asIntN(128, readHalves(view, offset))
					: (view, offset): bigint => readHalves(view, offset),
				write: (view, offset, value): void => {
					writeHalves(view, offset, value as bigint);
				},
			};
	}
};
