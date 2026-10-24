---
'@fulcro/collections': major
'@fulcro/memory': major
'@fulcro/reflect': major
'@fulcro/transform-core': major
---

Require TypeScript 5.9 or later for the transformers: the optional `typescript` peer is now `>=5.9 <7` (was `>=5.3.3 <7`).

The transformers tell a type-only import apart through the compiler's `phaseModifier`, which replaced the deprecated `isTypeOnly` and first appears in 5.9. A project on TypeScript 5.3 to 5.8 keeps the runtime halves of these packages, which need no compiler, but has to move to 5.9 to run the transformers.
