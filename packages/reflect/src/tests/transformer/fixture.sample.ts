/**
 * Fixture compiled by the transformer test.
 *
 * Never imported at runtime: the test feeds this file to the compiler and
 * asserts on the JavaScript that comes out of it.
 *
 * The utilities are imported by package name rather than by path, so the
 * symbols the transformer follows resolve into the built declarations of
 * `@fulcro/reflect` exactly as they would in a consumer project. That is what
 * keeps the rewriters honest: they recognise a call by the module that declares
 * it, and this fixture is what proves the recognition survives the package
 * boundary — the case a same-tree relative import could never cover.
 */
import { defaultOf, nameOf, typeOf } from '@fulcro/reflect';

/** Interface that leaves no trace at runtime, which is the whole point. */
export interface PilotRecord {
	callSign: string;
	profile: { theme: string };
}

/** Alias over a union, to check how a non nominal type is reported. */
export type Theme = 'dark' | 'light';

const pilot: PilotRecord = { callSign: 'Red Five', profile: { theme: 'dark' } };

export const accessorName = nameOf(() => pilot.callSign);
export const deepAccessorName = nameOf(() => pilot.profile.theme);
export const indexedName = nameOf(() => pilot['callSign']);
export const interfaceName = nameOf<PilotRecord>();
export const aliasName = nameOf<Theme>();
export const described = typeOf(pilot);
export const describedPrimitive = typeOf(pilot.callSign);

/** Shape exercising nesting, optionality and collections at once. */
export interface DockingRecord {
	id: number;
	credits: number;
	paid: boolean;
	label: string;
	captain: { name: string; active: boolean };
	cargo: string[];
	pair: [number, string];
	tags: Set<string>;
	arrivedAt: Date;
	note?: string;
	nickname: string | null;
}

/** Enum defaulting to its first member. */
export enum Status {
	Draft,
	Sent,
}

/** Self referencing shape, which has no finite default. */
export interface JediLineage {
	label: string;
	parent: JediLineage;
}

export const defaultString = defaultOf<string>();
export const defaultNumber = defaultOf<number>();
export const defaultBoolean = defaultOf<boolean>();
export const defaultTheme = defaultOf<Theme>();
export const defaultOrder = defaultOf<DockingRecord>();
export const defaultStatus = defaultOf<Status>();
export const defaultTree = defaultOf<JediLineage>();
export const defaultCallback = defaultOf<(value: number) => string>();
export const defaultOptional = defaultOf<string | undefined>();
export const contextual: DockingRecord['captain'] = defaultOf();
