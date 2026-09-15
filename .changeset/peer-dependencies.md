---
'@fulcro/collections': minor
'@fulcro/functions': minor
'@fulcro/reflect': minor
'@fulcro/transformer': minor
---

Two dependency declarations corrected, and a diagnostic made readable.

**`@fulcro/transformer` no longer claims to support TypeScript 7.** The peer
range was `>=5.3.3`, which admitted it. 7.x is the native port and its package
does not expose the compiler API this is built on — `createProgram`,
`getTypeChecker`, `visitEachChild`, `createPrinter` and the custom transformer
pipeline are all absent, leaving only `./unstable/*` APIs. The range is
`>=5.3.3 <7` now, so an install fails where the transformer would not have been
able to start.

**`@fulcro/reflect` declares `@fulcro/transformer` as a peer dependency.** These
utilities read the type, which exists only while the compiler runs; without the
transformer they fall back to reading the value instead — `typeOf` leaves
`declared` null, `nameOf` parses the closure, and `defaultOf` throws. That is a
fallback, not a mode worth choosing, and nothing said so at install time. npm
installs the peer automatically; in a project that already has TypeScript, which
is every consumer of these packages, it adds about a megabyte.

**`switchFor`'s exhaustiveness error names the missing member again.** The
overloads are reordered so the exhaustive one comes last. When no overload
matches, TypeScript reports the last candidate taking that many arguments, and
with the exhaustive form earlier a forgotten enum member produced a complaint
about `SwitchCase` — the predicate form the caller was not using — with the
member itself never mentioned. The check worked and the message was useless.

Only TypeScript 7 words it that way; 5.x picks a best candidate and reads well
either way, so the suite now compiles its fixture with both.
