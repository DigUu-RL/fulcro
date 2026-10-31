---
'@fulcro/functions': patch
---

Declare TypeScript 5.4 as the floor of the types, as an optional peer. `equals` types its second value with `NoInfer`, which older compilers lack, so a project on one would fail with TS2304 from inside the package for importing anything from it; the peer turns that into a warning at install that names the cause. JavaScript projects are unaffected.
