---
'@fulcro/reflect': patch
---

Tell people to install the transformer explicitly, rather than trusting their
package manager to infer it.

`@fulcro/transformer` is a required peer dependency and always was, but the
install instructions read `npm install @fulcro/reflect` and left the peer to be
resolved automatically. npm does that; Yarn does not. A Yarn project therefore
ended up with `@fulcro/reflect` alone, and the failure is quiet rather than
loud: `defaultOf` throws, `nameOf` degrades to parsing closures, and
`typeOf(…).declared` reads `null`.

The manifest is unchanged — it was already correct. Only the instructions move,
and they now name both packages, which behaves the same on every package
manager.
