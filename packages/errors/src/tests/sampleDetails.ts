import { DetailsShape } from '@/definition';

/**
 * Details any code's template accepts: `operation` set, and every other field
 * a template asks for read as `value`.
 *
 * The suites driven by the catalog exercise every code without knowing its
 * fields — what they assert is the frame around the text, which does not
 * depend on them. A field a template declares is checked against its use by
 * the compiler, which is the only place its name exists.
 *
 * @returns Fresh details, so each error freezes its own.
 */
export const sampleDetails = (): DetailsShape =>
	new Proxy<DetailsShape>(
		{ operation: 'operation' },
		{
			get: (target, field) =>
				typeof field === 'string' && !(field in target)
					? 'value'
					: Reflect.get(target, field),
		},
	);
