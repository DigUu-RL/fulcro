import { constantOf } from '@fulcro/reflect';

// A constant whose function never returns: the evaluation has to be stopped,
// and the call refused, rather than the build left hanging. Its own fixture,
// because proving it costs the whole time limit.

export const endless = constantOf((): number => {
	for (;;) {
		// Nothing: the loop is the point.
	}
});
