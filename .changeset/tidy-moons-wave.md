---
'@fulcro/collections': patch
'@fulcro/reflect': patch
---

Documentation only, plus a regression test for the two plugins together.

The documentation index described the library as it stood two releases ago: it
mentioned none of `is`, `as`, `cast`, `ofType`, `topBy` or `choose`, so the most
distinctive thing here — a runtime check derived from the type you already wrote
— was invisible from the front door.

Nothing in the packages changed.
