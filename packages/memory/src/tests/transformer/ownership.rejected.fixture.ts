import {
	borrow,
	borrowMutable,
	createManagedStorage,
	move,
	own,
	type Owned,
} from '@fulcro/memory';

/**
 * Uses the ownership rules refuse. Every line the transformer must report
 * ends with a comment naming the code it must report there — and no line
 * without one may be reported. The suite reads both from this file, so a case
 * is added by writing it here, marked.
 */

declare const flag: boolean;

const create = (): Owned<number> => own(() => createManagedStorage(4, 0));

export const borrowedAfterMove = (): void => {
	const owner = create();

	move(owner);
	borrow(owner); // FULCRO7027
};

export const lengthAfterMove = (): number => {
	const owner = create();

	move(owner);

	return owner.length; // FULCRO7027
};

export const movedTwice = (): void => {
	const owner = create();

	move(owner);
	move(owner); // FULCRO7027
};

export const readAfterBorrowedForWriting = (): number => {
	const owner = create();
	const reading = borrow(owner);

	borrowMutable(owner);

	return reading.get(0); // FULCRO7028
};

export const writtenAfterBorrowedForReading = (): void => {
	const owner = create();
	const writing = borrowMutable(owner);

	borrow(owner);
	writing.set(0, 1); // FULCRO7028
};

export const writtenAfterBorrowedForWritingAgain = (): number => {
	const owner = create();
	const first = borrowMutable(owner);
	const second = borrowMutable(owner);

	second.set(0, 1);

	return first.get(0); // FULCRO7028
};

export const borrowUsedAfterItsOwnerMoved = (): number => {
	const owner = create();
	const reading = borrow(owner);

	move(owner);

	return reading.get(0); // FULCRO7029
};

export const maybeMoved = (): void => {
	const owner = create();

	if (flag) move(owner);

	borrow(owner); // FULCRO7027
};

export const movedEveryIteration = (): void => {
	const owner = create();

	for (let index = 0; index < 3; index++) {
		move(owner); // FULCRO7027
	}
};

export const closureCreatedAfterTheMove = (): (() => number) => {
	const owner = create();

	move(owner);

	return () => borrow(owner).get(0); // FULCRO7027
};

export const shorthandAfterMove = (): { owner: Owned<number> } => {
	const owner = create();

	move(owner);

	return { owner }; // FULCRO7027
};

export const movedInOneArmOfAConditional = (): void => {
	const owner = create();

	void (flag ? move(owner) : null);
	borrow(owner); // FULCRO7027
};

export const movedAfterTheTryBlockStarted = (): void => {
	const owner = create();

	try {
		move(owner);
	} catch {
		borrow(owner); // FULCRO7027
	}
};

export const movedInAPreviousSwitchCase = (choice: number): void => {
	const owner = create();

	switch (choice) {
		case 0:
			move(owner);
		// falls through
		case 1:
			borrow(owner); // FULCRO7027
			break;
	}
};
