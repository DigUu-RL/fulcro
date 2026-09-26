# FULCRO2xxx — `@fulcro/functions`

🇧🇷 Português (Brasil): [Leia esta documentação em português](../pt-BR/errors/FULCRO2xxx.md)

The errors of [control flow as values](../functions.md). Back to
[all codes](../errors.md).

## FULCRO2001

```text
Error: FULCRO2001: Operation rejected with undefined
```

Not thrown: returned. The operation passed to `tryCatch()` threw or rejected
with `null` or `undefined`, and `tryCatch()` stored this error in their place,
because a failure whose `error` is `null` would read as a success. What was
actually thrown is the error's `cause`.

Nothing to fix in `tryCatch()`. The code that threw `null` or `undefined` is the
one to look at: throw an `Error` there, and the failure will say what went
wrong.
