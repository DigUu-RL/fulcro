/** A `WebAssembly.Memory`, as much of it as the suites use. */
export interface ModuleMemory {
	readonly buffer: ArrayBuffer;
	grow(pages: number): number;
}

/** What the module exports. */
export interface RecordingModule {
	/** Its one memory, one page to start with. */
	readonly memory: ModuleMemory;

	/** Writes a 64-bit float at a byte address, as the module's own code. */
	store(address: number, value: number): void;

	/** Grows the memory from inside the module; returns the old page count. */
	grow(pages: number): number;
}

/**
 * The parts of the `WebAssembly` global the suites call. The packages compile
 * without the WebAssembly declarations, so they are stated here rather than
 * pulled in for every source file.
 */
interface WebAssemblyApi {
	Module: new (bytes: Uint8Array) => object;
	Instance: new (module: object) => { exports: Record<string, unknown> };
	Memory: new (descriptor: {
		initial: number;
		maximum?: number;
		shared?: boolean;
	}) => ModuleMemory;
}

/** The engine's WebAssembly, typed as the suites use it. */
export const webAssembly: WebAssemblyApi = (
	globalThis as unknown as { WebAssembly: WebAssemblyApi }
).WebAssembly;

/**
 * A module written out by hand, byte by byte, so the suites need no toolchain:
 *
 * ```text
 * (module
 *   (memory (export "memory") 1)
 *   (func (export "store") (param i32 f64)
 *     local.get 0  local.get 1  f64.store)
 *   (func (export "grow") (param i32) (result i32)
 *     local.get 0  memory.grow))
 * ```
 */
const BYTES = new Uint8Array([
	// Magic number and version.
	0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
	// Types: (i32, f64) -> (), (i32) -> i32.
	0x01, 0x0b, 0x02, 0x60, 0x02, 0x7f, 0x7c, 0x00, 0x60, 0x01, 0x7f, 0x01, 0x7f,
	// Functions: store has type 0, grow has type 1.
	0x03, 0x03, 0x02, 0x00, 0x01,
	// Memory: one, at least one page.
	0x05, 0x03, 0x01, 0x00, 0x01,
	// Exports: "memory", "store", "grow".
	0x07, 0x19, 0x03, 0x06, 0x6d, 0x65, 0x6d, 0x6f, 0x72, 0x79, 0x02, 0x00, 0x05,
	0x73, 0x74, 0x6f, 0x72, 0x65, 0x00, 0x00, 0x04, 0x67, 0x72, 0x6f, 0x77, 0x00,
	0x01,
	// Code: the two bodies.
	0x0a, 0x12, 0x02, 0x09, 0x00, 0x20, 0x00, 0x20, 0x01, 0x39, 0x03, 0x00, 0x0b,
	0x06, 0x00, 0x20, 0x00, 0x40, 0x00, 0x0b,
]);

/**
 * Instantiates the module afresh, its memory zeroed.
 *
 * @returns Its exports.
 */
export const instantiateRecordingModule = (): RecordingModule => {
	const { exports } = new webAssembly.Instance(new webAssembly.Module(BYTES));

	return exports as unknown as RecordingModule;
};
