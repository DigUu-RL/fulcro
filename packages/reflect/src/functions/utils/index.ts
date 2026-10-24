/**
 * Public surface of the utilities.
 *
 * Listed one by one rather than re-exported wholesale, so that adding an export
 * to a utility module is never enough to put it in front of consumers. The
 * modules below export more than this — `resolveCallableId`, for one, which
 * `nameOf` needs from `typeOf` and nobody else has any use for.
 */
export { alignOf } from '@/src/functions/utils/alignOf';
export { as } from '@/src/functions/utils/as';
export { type Constant, constantOf } from '@/src/functions/utils/constantOf';
export { defaultOf } from '@/src/functions/utils/defaultOf';
export { is, type TypeTest } from '@/src/functions/utils/is';
export { keysOf } from '@/src/functions/utils/keysOf';
export { type TypeLayout } from '@/src/functions/utils/layout';
export { layoutOf } from '@/src/functions/utils/layoutOf';
export { type NameAccessor, nameOf } from '@/src/functions/utils/nameOf';
export { offsetOf } from '@/src/functions/utils/offsetOf';
export { type PathAccessor, pathOf } from '@/src/functions/utils/pathOf';
export { pathsOf, type TypePath } from '@/src/functions/utils/pathsOf';
export { sizeOf } from '@/src/functions/utils/sizeOf';
export {
	ANONYMOUS_NAME,
	type DeclarationSite,
	type DeclaredKind,
	type DeclaredMember,
	type DeclaredType,
	type TypeId,
	type TypeMetadata,
	type TypeOf,
	typeOf,
} from '@/src/functions/utils/typeOf';
