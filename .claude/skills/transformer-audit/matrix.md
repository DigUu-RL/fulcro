# The case matrix

The catalogue `transformer-audit` fills in. Read the rows in scope; the file is
long because the boundary is, and reading all of it to answer a question about
`nameOf` is the cost §6 of `.claude/skills/skill-authoring/SKILL.md` warns
about.

Two things are recorded per row: what a correct emit looks like, and what
happens when the transformer is not applied. The second column is the one that
makes a decline legible — a form whose fallback gives the same answer may
decline quietly, and a form whose fallback cannot be right must say so.

## The call forms

Ten rewriters, registered in two lists. `REWRITERS` in
`packages/reflect/src/transformer/index.ts` and in
`packages/collections/src/transformer/index.ts` are the authority; if a form
below is missing from one of them, the list moved and this file is stale.

### `@fulcro/reflect`

| Form        | Rewriter            | Emits                                                                                                                      | Without the transformer                                                            |
| ----------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `nameOf`    | `nameOfRewriter`    | A string literal — the last segment of an accessor, or the name of a type                                                  | Falls back to parsing the closure; same answer for an accessor, nothing for a type |
| `typeOf`    | `typeOfRewriter`    | The inspected value kept as the first argument, plus the declared type and the declaration site as a project-relative path | Inspects the prototype; `declared` reads `null`                                    |
| `defaultOf` | `defaultOfRewriter` | A literal inhabiting the type, built member by member                                                                      | **Throws.** There is no fallback — a computed default would be a lie               |
| `is`        | `isRewriter`        | `is(value, { name: "...", ... })` — a structural test as data                                                              | Needs the token; refuses without it                                                |
| `as`        | `asRewriter`        | `as(value, { name: "...", ... })`, the same test in a throwing form                                                        | As above                                                                           |
| `keysOf`    | `keysOfRewriter`    | An array literal of the type's keys                                                                                        | Cannot see a type's keys at runtime                                                |
| `pathOf`    | `pathOfRewriter`    | A string literal for a property path                                                                                       | Falls back to the runtime path reader                                              |
| `pathsOf`   | `pathsOfRewriter`   | An array literal of the paths of a shape                                                                                   | As above                                                                           |

### `@fulcro/collections`

The transformer is **optional** here, and that is the difference from reflect.
Every operator works with a token — `'string'`, a constructor — and only the
no-argument type-argument forms need the plugin.

| Form     | Rewriter         | Emits                                                                       | Without the transformer                                                       |
| -------- | ---------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `ofType` | `ofTypeRewriter` | `.ofType({ name: "...", ... })` — filters and narrows                       | The token form still works; the bare form refuses loudly rather than guessing |
| `cast`   | `castRewriter`   | `.cast({ name: "...", ... })` — throws on the first element that is not one | As above                                                                      |

A refusal is the correct behaviour for both bare forms. An audit reporting it as
a decline has found the documented case, not a defect — the finding would be a
bare form that returns something instead.

## The type shapes

Worked per rewriter that consumes a type. `defaultOf` is the deepest of them and
its suite in `packages/reflect/src/tests/transformer/transformer.spec.ts`
already asserts most of these; the structural forms (`is`, `as`, `ofType`,
`cast`) go through `buildStructuralTest` in
`packages/transform-core/src/structural/index.ts` and share one answer per
shape.

| Shape                | Expected                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Primitives           | The empty inhabitant: `0`, `""`, `false`                                                                                                  |
| Literal union        | The first inhabitant, preserved as a literal                                                                                              |
| Nullable union       | The empty inhabitant is preferred over `null`                                                                                             |
| Intersection         | One flattened shape carrying every member of both sides                                                                                   |
| Generic              | Resolved against the argument at the call site, not the constraint                                                                        |
| Generic, unresolved  | Not guessed. Declined or diagnosed, never filled from the constraint                                                                      |
| Nested shape         | Built recursively, filling what the type requires                                                                                         |
| Recursive shape      | Closed rather than nested forever                                                                                                         |
| Optional members     | Left out — absence satisfies them                                                                                                         |
| Readonly members     | Present; `readonly` is erased and changes nothing about the value                                                                         |
| Array                | Emptied                                                                                                                                   |
| Tuple                | Filled position by position                                                                                                               |
| Enum                 | The first member                                                                                                                          |
| Class                | Distinguished from a plain shape: the structural test checks the shape, not the prototype chain, unless the form is the constructor token |
| Built-in collections | Instantiated (`new Map()`), not described                                                                                                 |
| Function type        | Honoured, with its own return default                                                                                                     |
| Contextual type      | Inferred from the context when none is written                                                                                            |
| Compile-time-only    | A type with no runtime witness: diagnosed, never approximated                                                                             |

The last row is the hard stop of the skill in one line. A type the runtime
cannot reconstruct is reported as unsupported; a partial structural test emitted
so that a case produces output is a wrong answer that nothing downstream can
see.

## The boundary conditions

These are the ones a fixture compiled from a file next door never reaches.

| Condition                 | What has to hold                                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Import by package name    | `import { nameOf } from '@fulcro/reflect'` resolves through `node_modules` into the built declarations, and the call is still claimed                                                            |
| Subpath import            | A call reached through `@fulcro/collections/async` is claimed the same way                                                                                                                       |
| Workspace link            | The same, resolved through the workspace rather than a copy                                                                                                                                      |
| `paths` alias             | The same, resolved through a tsconfig alias                                                                                                                                                      |
| Re-export                 | A call reached through a consumer's own barrel is still traced back to the package                                                                                                               |
| A consumer's own `nameOf` | Left untouched. Matching on the name alone is the defect                                                                                                                                         |
| Method receiver           | `.cast(...)` is claimed through the symbol of the receiver, never the method name                                                                                                                |
| `Node10` resolution       | Finds a package's main entry but not its `exports` subpaths, which is why the coexistence suite sets `Bundler` — a type the checker cannot see is a call neither transformer can claim, silently |
| Both plugins, one tree    | Every call resolved, including one nested inside another; nothing left as written                                                                                                                |
| Plugin order              | Reversed, the result is the same. Neither depends on running first                                                                                                                               |
| Windows separator         | `utilityModuleSegment` joins with `path.join`, so the matcher sees `\` here and `/` elsewhere. No comparison against a hard-coded `/`-joined string                                              |
| No tsconfig               | The root-level entry point suite applies no plugin at all, on purpose: it asserts what a consumer gets before wiring one up                                                                      |

## Where each is already covered

Filling the matrix starts by reading what exists, so a row is marked `missing`
only when nothing asserts it.

| Suite                                                            | Covers                                                                           |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `packages/reflect/src/tests/transformer/transformer.spec.ts`     | `nameOf`, `typeOf`, `defaultOf` and the type shapes, across the package boundary |
| `packages/collections/src/tests/transformer/transformer.spec.ts` | `ofType` and `cast`                                                              |
| `tests/transformers/coexistence.spec.mts`                        | Both plugins on one tree, nesting, nothing unresolved                            |
| `tests/entrypoints.spec.mts`                                     | The runtime fallback with no transformer applied                                 |

A form present in a `REWRITERS` list and absent from all four is the matrix row
that matters most: it is the one where a decline would never be noticed.
