# FULCRO2xxx — `@fulcro/functions`

🇧🇷 Português (Brasil): [Leia esta documentação em português](../pt-BR/errors/FULCRO2xxx.md)

The errors of [control flow as values](../functions.md). Back to
[all codes](../errors.md).

## FULCRO2001

```text
Error: FULCRO2001: Operation rejected with undefined
```

Details:

```text
{ operation: string; thrown: null | undefined }
```

Not thrown: returned. The operation passed to `tryCatch()` threw or rejected
with `null` or `undefined`, and `tryCatch()` stored this error in their place,
because a failure whose `error` is `null` would read as a success. What was
actually thrown is the error's `cause`.

Nothing to fix in `tryCatch()`. The code that threw `null` or `undefined` is the
one to look at: throw an `Error` there, and the failure will say what went
wrong.

## FULCRO2002

```text
TypeError: FULCRO2002: createEquals: expected an array of rules, received object.
```

Details:

```text
{ operation: string; received: string }
```

`createEquals()` was handed something other than an array — most often a single
rule, passed where a list of them was expected. `received` is its kind.

Wrap the rule in an array: `createEquals([byId])`, not `createEquals(byId)`.
`createEquals([])` is accepted, and makes a variant that compares exactly as
`equals` does.

## FULCRO2003

```text
TypeError: FULCRO2003: createEquals: rule 1 needs 'equals' to be a function, received undefined.
```

Details:

```text
{ operation: string; index: number; member: string; received: string }
```

The rule at `index` of the list handed to `createEquals()` has no function under
`member`, which is `is` or `equals`; `received` is the kind found there instead.
Every rule both recognises its values and compares them, so both are required.

Give the rule the member it lacks. A class whose values compare through an
instance method, as `Decimal` does, is not a rule on its own — its `equals`
compares with one other value, not two — so write the rule out:
`{ is: Decimal.is, equals: (left, right) => left.equals(right) }`.
