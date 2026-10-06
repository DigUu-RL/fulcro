import {
	borrow,
	borrowMutable,
	createManagedStorage,
	move,
	own,
	type Owned,
} from '@fulcro/memory';

/**
 * Uses the ownership rules allow. The transformer must report nothing here:
 * every function below is a shape a consumer writes, and a refusal of any of
 * them would fail a correct build.
 */

declare const flag: boolean;

const create = (): Owned<number> => own(() => createManagedStorage(4, 0));

export const sharedBorrowsCoexist = (): number => {
	const owner = create();
	const first = borrow(owner);
	const second = borrow(owner);

	return first.get(0) + second.get(1);
};

export const borrowEndsAtItsLastUse = (): void => {
	const owner = create();
	const reading = borrow(owner);

	reading.get(0);
	borrowMutable(owner).set(0, 1);
};

export const reassignedAfterMove = (): number => {
	let owner = create();

	owner = move(owner);

	return borrow(owner).get(0);
};

export const movedOnOneBranchUsedOnTheOther = (): void => {
	const owner = create();

	if (flag) {
		move(owner);
	} else {
		borrow(owner).get(0);
	}
};

export const freshOwnerEachIteration = (): void => {
	for (let index = 0; index < 3; index++) {
		const owner = create();

		move(owner);
	}
};

export const movedThenLeft = (): number => {
	const owner = create();

	if (flag) {
		move(owner);

		return 0;
	}

	return borrow(owner).get(0);
};

export const shadowedAfterMove = (): number => {
	const owner = create();

	move(owner);

	{
		const owner = 1;

		return owner + 1;
	}
};

export const ownedAgainAfterMove = (): number => {
	let owner = create();

	move(owner);
	owner = create();

	return borrow(owner).get(0);
};

export const localFunctionOfTheSameName = (): number => {
	const move = (value: number): number => value + 1;
	const value = 1;

	move(value);

	return value;
};

export const borrowHandedOnBeforeTheConflict = (
	read: (values: { get(index: number): number }) => number,
): number => {
	const owner = create();
	const total: number = read(borrow(owner));

	borrowMutable(owner).set(0, total);

	return total;
};

export const moveIntoAnotherOwner = (): Owned<number> => {
	const first = create();
	const second = move(first);

	return move(second);
};

export const movedInsideALoopThatLeaves = (): void => {
	const owner = create();

	while (flag) {
		move(owner);
		break;
	}
};

export const closureCreatedBeforeTheMove = (): (() => number) => {
	// Left to the runtime: the closure may run before the move or after it.
	const owner = create();
	const later = (): number => borrow(owner).get(0);

	move(create());

	return later;
};
