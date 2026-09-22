/**
 * Public surface of the utilities.
 *
 * Listed one by one rather than re-exported wholesale, so that adding an export
 * to a utility module is never enough to put it in front of consumers. The
 * modules below export more than this — `resolveCallableId`, for one, which
 * `nameOf` needs from `typeOf` and nobody else has any use for.
 */
export { alignOf } from '@/functions/utils/alignOf';
export { as } from '@/functions/utils/as';
export { defaultOf } from '@/functions/utils/defaultOf';
export { is, type TypeTest } from '@/functions/utils/is';
export { keysOf } from '@/functions/utils/keysOf';
export { type NameAccessor, nameOf } from '@/functions/utils/nameOf';
export { type PathAccessor, pathOf } from '@/functions/utils/pathOf';
export { pathsOf, type TypePath } from '@/functions/utils/pathsOf';
export { sizeOf } from '@/functions/utils/sizeOf';
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
} from '@/functions/utils/typeOf';
