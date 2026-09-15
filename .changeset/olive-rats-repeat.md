---
'@fulcro/reflect': major
'@fulcro/collections': major
'@fulcro/functions': major
'@fulcro/transform-core': major
---

Each library now ships its own compile time transformer.

`@fulcro/reflect` exposes `@fulcro/reflect/transformer` and
`@fulcro/reflect/unplugin`. Installing the package is enough; there is no second
thing to install and no way to end up with the utilities but not the transformer
that resolves them.

**Breaking.** Point the `plugins` entry of your tsconfig at
`@fulcro/reflect/transformer` instead of `@fulcro/transformer`, and import
bundler adapters from `@fulcro/reflect/unplugin`. The transformer itself is
unchanged — same options, same emitted code.

`@fulcro/transformer` is gone. It was a peer dependency, which npm installs and
Yarn does not, so a project could get the utilities with nothing to resolve them
and no error to say so; and it versioned separately, so `reflect@0.3` with
`transformer@0.2` was an installable, broken pair.

`@fulcro/transform-core` is new, and holds the machinery that belongs to no
library in particular. You never install it directly.
