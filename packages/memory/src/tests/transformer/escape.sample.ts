import { allocate, asView, createManagedAllocator, type Storage, type View } from '@fulcro/memory';
import { SignedInteger } from '@fulcro/types';

import { shared } from './escape.allocator';

/**
 * Allocations the escape analysis decides on. A storage named `local…` cannot
 * outlive its block, and must be allocated from a frame; one named `kept…`
 * might, or sits where no frame can be scoped, and must stay where it was
 * written. The suite holds every declaration here to its name.
 *
 * Every function returns what it computed, so that the program can be run
 * with and without the transformer and the two compared.
 */

const Integer = SignedInteger(32);
const managed = createManagedAllocator();
const renamed = managed;
let reassignable = createManagedAllocator();

const keptTopLevel = allocate(Integer, 1, managed);

keptTopLevel.set(0, Integer.from(1));

export const sum = (length: number): number => {
	const localSum = allocate(Integer, length, managed);
	let total = 0;

	for (let index = 0; index < localSum.length; index++) localSum.set(index, Integer.from(index));
	for (let index = 0; index < localSum.length; index++) total += localSum.get(index);

	return total;
};

export const perRound = (rounds: number): number => {
	let total = 0;

	for (let round = 0; round < rounds; round++) {
		const localRound = allocate(Integer, 4, managed);

		localRound.set(3, Integer.from(round));
		total += localRound.get(3) + localRound.get(0);
	}

	return total;
};

export const inABranch = (flag: boolean): number => {
	if (flag) {
		const localBranch = allocate(Integer, 1, managed);

		localBranch.set(0, Integer.from(7));

		return localBranch.get(0);
	}

	return 0;
};

export const nested = (): number => {
	const localOuter = allocate(Integer, 2, managed);

	localOuter.set(0, Integer.from(1));

	{
		const localInner = allocate(Integer, 2, managed);

		localInner.set(0, Integer.from(2));
		localOuter.set(1, localInner.get(0));
	}

	return localOuter.get(0) + localOuter.get(1);
};

export const inAMethod = {
	run(): number {
		const localMethod = allocate(Integer, 3, managed);

		return localMethod.length;
	},
};

export function declared(): number {
	const localDeclared = allocate(Integer, 1, managed);

	localDeclared.set(0, Integer.from(5));

	return localDeclared.get(0);
}

export const fromAnImportedAllocator = (): number => {
	const localImported = allocate(Integer, 1, shared);

	localImported.set(0, Integer.from(9));

	return localImported.get(0);
};

export const shadowed = (): number => {
	const localShadowed = allocate(Integer, 1, managed);
	const next = (localShadowed: number): number => localShadowed + 1;

	return next(localShadowed.get(0));
};

export const namedInAType = (): number => {
	const localTyped = allocate(Integer, 2, managed);
	const length: typeof localTyped.length = localTyped.length;

	return length;
};

export const returned = (): Storage<SignedInteger<32>> => {
	const keptReturned = allocate(Integer, 1, managed);

	return keptReturned;
};

export const handedToAFunction = (read: (values: Storage<SignedInteger<32>>) => number): number => {
	const keptArgument = allocate(Integer, 1, managed);

	return read(keptArgument);
};

export const viewed = (): View<SignedInteger<32>> => {
	const keptViewed = allocate(Integer, 1, managed);

	return asView(keptViewed);
};

export const captured = (): (() => number) => {
	const keptCaptured = allocate(Integer, 1, managed);

	return (): number => keptCaptured.get(0);
};

export const aliased = (): number => {
	const keptAliased = allocate(Integer, 1, managed);
	const alias = keptAliased;

	return alias.get(0);
};

export const inAnObject = (): { keptShorthand: Storage<SignedInteger<32>> } => {
	const keptShorthand = allocate(Integer, 1, managed);

	return { keptShorthand };
};

export const methodTakenOff = (): ((index: number) => number) => {
	const keptDetached = allocate(Integer, 1, managed);

	return keptDetached.get;
};

export const suspends = async (): Promise<number> => {
	const keptAsync = allocate(Integer, 1, managed);

	await Promise.resolve();

	return keptAsync.get(0);
};

export function* generates(): Generator<number> {
	const keptGenerator = allocate(Integer, 1, managed);

	yield keptGenerator.get(0);
}

export const fromARenamedAllocator = (): number => {
	const keptRenamed = allocate(Integer, 1, renamed);

	return keptRenamed.get(0);
};

export const fromAReassignableAllocator = (): number => {
	const keptReassignable = allocate(Integer, 1, reassignable);

	reassignable = createManagedAllocator();

	return keptReassignable.get(0);
};

export const fromAnAllocatorMadeInPlace = (): number => {
	const keptInPlace = allocate(Integer, 1, createManagedAllocator());

	return keptInPlace.get(0);
};

export const reassignableStorage = (): number => {
	let keptLet = allocate(Integer, 1, managed);

	keptLet = allocate(Integer, 2, managed);

	return keptLet.length;
};
