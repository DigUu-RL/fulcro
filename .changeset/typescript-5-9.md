---
'@fulcro/collections': major
'@fulcro/memory': major
'@fulcro/reflect': major
'@fulcro/transform-core': major
---

Require TypeScript 5.9 or later for the transformers: the optional `typescript` peer is now `>=5.9 <7` (was `>=5.3.3 <7`).

The transformers tell a type-only import apart through the compiler's `phaseModifier`, which replaced the deprecated `isTypeOnly` and first appears in 5.9. The runtime halves of these packages need no compiler, but npm checks the peer range on install all the same, observed with npm 11:

- a project whose `typescript` range admits 5.9, such as `^5.8.3`, has its installed compiler moved up to the newest 5.x by the install, without being asked;
- a project pinned below 5.9, such as `"typescript": "5.8.3"`, is refused with `ERESOLVE`. With `--legacy-peer-deps` the install goes through, the compiler stays where it was, and the runtime halves work; the transformers need 5.9.
