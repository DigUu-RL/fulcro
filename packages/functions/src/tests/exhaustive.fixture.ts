/**
 * Fixture compiled by the exhaustiveness suite.
 *
 * Never imported at runtime, and deliberately does not compile: the call at the
 * bottom leaves a member of `HyperdriveStatus` unhandled, which is the whole thing being
 * asserted. It is excluded from the tsconfig of this package for that reason —
 * see the `exclude` entry there — so `npm run typecheck` does not trip over an
 * error that is the point.
 *
 * Imported by package name rather than by path, and that is not cosmetic. The
 * two resolve to different things — the source, or the declarations this package
 * publishes — and TypeScript does not word the failure the same way for both.
 * Compiled against the source, the complaint names the missing member whatever
 * order the overloads are in; compiled against the declarations, as every
 * consumer does, the order decides whether it names the member or blames the
 * predicate form. Only the second is worth asserting on, because only the second
 * is what anybody reads.
 */
import { switchFor } from '@fulcro/functions';

/** Three members, so that leaving one out is unambiguous. */
export enum HyperdriveStatus {
	Online,
	Damaged,
	Offline,
}

declare const status: HyperdriveStatus;

/** Handles every member. Must compile. */
export const complete: string = switchFor(status, {
	[HyperdriveStatus.Online]: () => 'ready to jump',
	[HyperdriveStatus.Damaged]: () => 'jump at your own risk',
	[HyperdriveStatus.Offline]: () => "it's not my fault",
});

/** Runs for its effects, and still handles every member. Must compile. */
export const asStatement = (): void =>
	switchFor(status, {
		[HyperdriveStatus.Online]: () => undefined,
		[HyperdriveStatus.Damaged]: () => undefined,
		[HyperdriveStatus.Offline]: () => undefined,
	});

/** Predicate form, which has no exhaustiveness to check. Must compile. */
export const byPredicate: string = switchFor(
	7,
	[{ when: (turbolasers) => turbolasers > 0, then: () => 'armed' }],
	() => 'unarmed',
);

/** Leaves `HyperdriveStatus.Offline` unhandled. Must NOT compile. */
export const incomplete: string = switchFor(status, {
	[HyperdriveStatus.Online]: () => 'ready to jump',
	[HyperdriveStatus.Damaged]: () => 'jump at your own risk',
});
