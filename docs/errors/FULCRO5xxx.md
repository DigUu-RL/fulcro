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
