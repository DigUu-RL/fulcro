---
paths:
  - packages/*/src/**/*.ts
  - packages/*/src/**/*.mts
  - tools/eslint/**/*.mjs
---

# Every error carries a registered code

**Scope:** the shipped sources of every package, and the lint rule that guards
them

A consumer recovers from a failure by its code, `error.code === 'FULCRO6021'`,
reads what went wrong from `error.details`, and finds out what it means on
`docs/errors/FULCRO6xxx.md`. The code and the details are the contract; the
wording after the code may improve in any release. That only holds if every
error a package creates comes from one place.

## Errors come from `@fulcro/errors`

- A package creates an error with `createError(code, details)`, or places
  one in a wider context with `prefixError(error, context)`. Never
  `new Error(...)`, never a thrown string. `local/coded-errors` refuses both in
  `packages/*/src`, tests excepted.
- The details are named, and always carry `operation`: the function that
  failed, as a consumer calls it. They hold primitives only — a number stays
  a number, and a value of any other kind is described as text — because an
  error travels to logs and across workers, and must not carry the caller's
  objects with it. The compiler refuses a template that breaks either rule.
- A field, once a code has it, is part of the contract: renaming or removing
  it is a break, exactly as changing the class is.
- Rethrowing what was caught is untouched: somebody else's error stays theirs.
- The class is the built-in one the error had before it had a code, so a
  consumer's `instanceof` keeps working. Changing a code's class is a break.

## A code belongs to one package, forever

- Each package owns one range: 1 collections, 2 functions, 3 parallel,
  4 reflect, 5 transform-core, 6 types, 7 memory. A new package takes the next
  digit, in `tools/eslint/coded-errors.mjs` and a new catalog file, before it
  throws anything.
- A code is never renumbered and never reused, even after its error is gone.
  Retire it by leaving its entry and its page in place, marked as retired.
- Two call sites share a code only when they report the same condition with
  the same template; different wording is a different code.

## A new error is born with its feature

A feature that throws something new registers the code in
`packages/errors/src/catalog/<package>.ts` **in the same change**, with its
section in `docs/errors/FULCRO<n>xxx.md` and the `pt-BR` counterpart. The catalog
suites pick the code up on their own; the page does not write itself.

An error that crosses a worker boundary crosses as its code and its details,
never as the finished text, so the other side can create the same error again.
