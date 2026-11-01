/**
 * Whether this platform stores a number of more than one byte low byte first.
 *
 * A typed array reads and writes in the platform's order, while every element
 * type promises little-endian bytes, whatever the platform. The two agree only
 * here, so a storage holds its values in a typed array only when this is
 * `true` — on every engine that runs JavaScript in practice — and goes through
 * the element's `read` and `write` everywhere else.
 *
 * In a module of its own, asked once, so that a suite can stand in for a
 * big-endian platform.
 */
export const platformIsLittleEndian: boolean = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
