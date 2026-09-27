import typescript from 'typescript';

import { IDENTIFIER_PATTERN } from '@fulcro/transform-core';

/**
 * Literals the rewriters emit in place of a call: frozen objects and arrays,
 * and the values inside them.
 *
 * Shared by `layoutOf`, which emits a layout, and `constantOf`, which emits
 * whatever a constant evaluated to. Both promise a value frozen at every level
 * and equal to what the runtime would have produced, so both build it here.
 */

/**
 * The name of a member of an object literal.
 *
 * `__proto__: …` in a literal sets the prototype rather than a property; only
 * the computed form makes it a field. A name that cannot be written bare is
 * quoted, which means the same thing.
 *
 * @param factory Node factory of the transformation.
 * @param name Name of the member.
 * @returns The property name node.
 */
const memberName = (
	factory: typescript.NodeFactory,
	name: string,
): typescript.PropertyName =>
	name === '__proto__'
		? factory.createComputedPropertyName(factory.createStringLiteral(name))
		: IDENTIFIER_PATTERN.test(name)
			? factory.createIdentifier(name)
			: factory.createStringLiteral(name);

/**
 * `Object.freeze(…)` around an expression.
 *
 * @param factory Node factory of the transformation.
 * @param value Expression frozen.
 * @returns The call.
 */
const freeze = (
	factory: typescript.NodeFactory,
	value: typescript.Expression,
): typescript.Expression =>
	factory.createCallExpression(
		factory.createPropertyAccessExpression(
			factory.createIdentifier('Object'),
			'freeze',
		),
		undefined,
		[value],
	);

/**
 * `Object.freeze({ … })` over some members, in order.
 *
 * @param factory Node factory of the transformation.
 * @param members Name and expression of each member, in order.
 * @returns The expression.
 */
export const frozenObject = (
	factory: typescript.NodeFactory,
	members: readonly (readonly [string, typescript.Expression])[],
): typescript.Expression =>
	freeze(
		factory,
		factory.createObjectLiteralExpression(
			members.map(([name, value]) =>
				factory.createPropertyAssignment(memberName(factory, name), value),
			),
		),
	);

/**
 * A number, written so that it reads back as exactly the same number.
 *
 * `NaN` and the infinities are written as divisions, which no binding in scope
 * can shadow the way it could shadow `NaN` or `Infinity`; `-0` keeps its sign.
 *
 * @param factory Node factory of the transformation.
 * @param value The number.
 * @returns The expression.
 */
const numberLiteral = (
	factory: typescript.NodeFactory,
	value: number,
): typescript.Expression => {
	const division = (numerator: number): typescript.Expression =>
		factory.createParenthesizedExpression(
			factory.createBinaryExpression(
				factory.createNumericLiteral(numerator),
				typescript.SyntaxKind.SlashToken,
				factory.createNumericLiteral(0),
			),
		);

	if (Number.isNaN(value)) return division(0);
	if (value === Infinity) return division(1);
	if (value === -Infinity) {
		return factory.createPrefixUnaryExpression(
			typescript.SyntaxKind.MinusToken,
			division(1),
		);
	}

	const magnitude: typescript.Expression = factory.createNumericLiteral(
		Math.abs(value),
	);

	return value < 0 || Object.is(value, -0)
		? factory.createPrefixUnaryExpression(
				typescript.SyntaxKind.MinusToken,
				magnitude,
			)
		: magnitude;
};

/**
 * A value `describeUnwritable` accepted, as a literal: primitives as they are,
 * arrays and plain objects frozen at every level.
 *
 * @param factory Node factory of the transformation.
 * @param value The value.
 * @returns The expression.
 */
export const constantLiteral = (
	factory: typescript.NodeFactory,
	value: unknown,
): typescript.Expression => {
	switch (typeof value) {
		case 'number':
			return numberLiteral(factory, value);
		case 'string':
			return factory.createStringLiteral(value);
		case 'boolean':
			return value ? factory.createTrue() : factory.createFalse();
		case 'bigint': {
			const magnitude: typescript.Expression = factory.createBigIntLiteral(
				`${value < 0n ? -value : value}n`,
			);

			return value < 0n
				? factory.createPrefixUnaryExpression(
						typescript.SyntaxKind.MinusToken,
						magnitude,
					)
				: magnitude;
		}
		case 'undefined':
			return factory.createVoidZero();
	}

	if (value === null) return factory.createNull();

	if (Array.isArray(value)) {
		return freeze(
			factory,
			factory.createArrayLiteralExpression(
				value.map((item) => constantLiteral(factory, item)),
			),
		);
	}

	return frozenObject(
		factory,
		Object.entries(value as object).map(([key, item]) => [
			key,
			constantLiteral(factory, item),
		]),
	);
};
