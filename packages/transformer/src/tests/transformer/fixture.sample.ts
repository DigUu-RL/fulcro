/**
 * Fixture compiled by the transformer test.
 *
 * Never imported at runtime: the test feeds this file to the compiler and
 * asserts on the JavaScript that comes out of it.
 *
 * The utilities are imported by package name rather than by path, so the
 * symbols the transformer follows resolve into the built declarations of
 * `@diguu/reflect` exactly as they would in a consumer project. That is what
 * keeps the rewriters honest: they recognise a call by the module that declares
 * it, and this fixture is what proves the recognition survives the package
 * boundary — the case a same-tree relative import could never cover.
 */
import { defaultOf, nameOf, typeOf } from '@diguu/reflect';

/** Interface that leaves no trace at runtime, which is the whole point. */
export interface UserContract {
	email: string;
	profile: { theme: string };
}

/** Alias over a union, to check how a non nominal type is reported. */
export type Theme = 'dark' | 'light';

const user: UserContract = { email: 'a@b.c', profile: { theme: 'dark' } };

export const accessorName = nameOf(() => user.email);
export const deepAccessorName = nameOf(() => user.profile.theme);
export const indexedName = nameOf(() => user['email']);
export const interfaceName = nameOf<UserContract>();
export const aliasName = nameOf<Theme>();
export const described = typeOf(user);
export const describedPrimitive = typeOf(user.email);

/** Shape exercising nesting, optionality and collections at once. */
export interface Order {
	id: number;
	total: number;
	paid: boolean;
	label: string;
	customer: { name: string; active: boolean };
	items: string[];
	pair: [number, string];
	tags: Set<string>;
	placedAt: Date;
	note?: string;
	nickname: string | null;
}

/** Enum defaulting to its first member. */
export enum Status {
	Draft,
	Sent,
}

/** Self referencing shape, which has no finite default. */
export interface TreeNode {
	label: string;
	parent: TreeNode;
}

export const defaultString = defaultOf<string>();
export const defaultNumber = defaultOf<number>();
export const defaultBoolean = defaultOf<boolean>();
export const defaultTheme = defaultOf<Theme>();
export const defaultOrder = defaultOf<Order>();
export const defaultStatus = defaultOf<Status>();
export const defaultTree = defaultOf<TreeNode>();
export const defaultCallback = defaultOf<(value: number) => string>();
export const defaultOptional = defaultOf<string | undefined>();
export const contextual: Order['customer'] = defaultOf();
