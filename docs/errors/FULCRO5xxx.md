# FULCRO5xxx — `@fulcro/transform-core`

🇧🇷 Português (Brasil): [Leia esta documentação em português](../pt-BR/errors/FULCRO5xxx.md)

The errors of the machinery behind the compile-time transformers of
`@fulcro/collections` and `@fulcro/reflect`. They are raised while your project
is being built, not while it runs. Back to [all codes](../errors.md).

## FULCRO5001

```text
Error: FULCRO5001: No tsconfig.json found from /app. The transformer needs one to know which files belong to the program.
```

A bundler plugin (`@fulcro/reflect/unplugin`, `@fulcro/collections/unplugin`)
could not find a `tsconfig.json`, searching upwards from the project root. The
transformer answers from types, and it needs the compiler's view of the
project to have any.

Add a `tsconfig.json` at the project root, or point the plugin at yours with
its `tsconfig` option.

## FULCRO5002

```text
Error: FULCRO5002: <the compiler's own message>
```

The `tsconfig.json` was found but could not be read — invalid JSON, or an
`extends` pointing at a file that does not exist. The message after the code is
TypeScript's own, and names the file and the problem.

## FULCRO5003

```text
Error: FULCRO5003: The Fulcro transformer refused calls it could not answer at compile time:
src/tables.ts(4,23): FULCRO4010: constantOf(…) cannot be evaluated at compile time: 'counter' is declared with let or var, so it can change. …
```

A transformer refused one or more calls in a file — a call it owns but cannot
answer, where leaving it to the runtime would ship a wrong or weaker answer.
Each line names the file, the position and the refusal with its own code; look
that code up for what to change.

Under `tsc` with `ts-patch`, the refusals are compile errors of their own and
this error is not raised; it is how a bundler plugin, which has no diagnostics
to add to, reports the same refusals — all of a file's at once.
