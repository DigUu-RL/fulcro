/**
 * Public surface of the utilities.
 *
 * Listed one by one rather than re-exported wholesale, so that adding an export
 * to a utility module is never enough to put it in front of consumers. The
 * modules below export more than this — `resolveCallableId`, for one, which
 * `nameOf` needs from `typeOf` and nobody else has any use for.
 */
export { defaultOf } from '@/functions/utils/defaultOf';
export { type NameAccessor, nameOf } from '@/functions/utils/nameOf';
export { type SwitchCase, switchFor } from '@/functions/utils/switchFor';
export {
	type Failure,
	type Result,
	type Success,
	tryCatch,
} from '@/functions/utils/tryCatch';
export {
	ANONYMOUS_NAME,
	type DeclarationSite,
	type DeclaredKind,
	type DeclaredType,
	typeOf,
	type TypeId,
	type TypeOf,
} from '@/functions/utils/typeOf';
