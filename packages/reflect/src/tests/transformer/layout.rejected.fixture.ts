import { alignOf, sizeOf } from '@fulcro/reflect';

/**
 * Fixture that must not compile.
 *
 * Every call here names a type that declares no layout, and each one has to be
 * a type error at the call site — not a number the transformer invented, and
 * not a throw deferred to runtime. The suite reads the diagnostics; the
 * package's tsconfig excludes this file so its typecheck stays clean.
 */

export const stringSize = sizeOf<string>();
export const bigintSize = sizeOf<bigint>();
export const objectAlignment = alignOf<{ readonly size: 4 }>();
