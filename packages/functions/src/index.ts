/**
 * Public entry point of the package, matching the `main` and `types` fields of
 * `package.json`.
 *
 * Listed one by one rather than re-exported wholesale, so that adding an export
 * to a module below is never enough on its own to put it in front of consumers.
 */
export {
	type None,
	none,
	type Option,
	type OptionCases,
	optionOf,
	type Some,
	some,
} from '@/option';
export {
	type Failure,
	failure,
	type Result,
	type ResultCases,
	type Success,
	success,
} from '@/result';
export { type ExhaustiveCases, type SwitchCase, switchFor } from '@/switchFor';
export { tryCatch } from '@/tryCatch';
