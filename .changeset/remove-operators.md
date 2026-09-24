---
'@fulcro/types': minor
'@fulcro/transform-core': minor
---

`@fulcro/types` no longer rewrites the JavaScript operators, and ships no compiler plugin: the `./transformer`, `./unplugin` and `./language-service` entry points are gone, along with its dependency on `@fulcro/transform-core` and its peer dependency on `typescript`. Every operation is a typed method that needs nothing configured — `a.add(b)` on a `Decimal`, `SignedInteger(32).add(a, b)` on an integer — in every editor and every build. `@fulcro/transform-core` drops the machinery that rewrote a program before type checking, which nothing else used.

**Breaking, and released as a minor**, which the pre-1.0 convention allows. Remove the `@fulcro/types/transformer` and `@fulcro/types/language-service` entries from your tsconfig `plugins`, and the `@fulcro/types/unplugin` adapter from your bundler, then write each operator on these types as its method.
